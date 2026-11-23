export const PERIODS = [
  { id: 1, course: "English 9", days: "A days" },
  { id: 2, course: "Senior English", days: "B days" },
  { id: 4, course: "English 9", days: "B days" },
  { id: 5, course: "Senior English", days: "A days" },
  { id: 7, course: "Senior English", days: "A days" },
];
export const STORAGE_KEY = "burnham-class-calendar.preferences.v1";
export const TERM_END = "2026-12-18";

export function addDays(date, count) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function weekStart(date) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}
export function weekEnd(date) {
  return addDays(weekStart(date), 6);
}
export function pacificToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
export function dateLabel(date, options = {}) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", ...options,
  });
}
export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T12:00:00Z"))
    && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
}
export function readPreferences(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
    return {
      period: PERIODS.some(period => period.id === value.period) ? value.period : null,
      week: validDate(value.week) ? weekStart(value.week) : null,
      month: typeof value.month === "string" && validDate(value.month + "-01") ? value.month : null,
      followCurrent: value.followCurrent !== false,
    };
  } catch {
    return { period: null, week: null, month: null, followCurrent: true };
  }
}
export function savePreferences(storage, preferences) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
export function hardDates(data, period) {
  return data.deadlines.filter(item => item.periods.includes(period) && item.kind === "hard");
}
export function dueNextDates(data, period) {
  return data.deadlines.filter(item => item.periods.includes(period) &&
    ((item.kind === "hard" && (item.calendarDue || item.scope === "long-term")) ||
      (item.kind === "daily" && item.calendarDue && data.windowStart &&
        item.date >= data.windowStart && item.date <= data.planningThrough)))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function dueLastDates(data, period, today) {
  const past = [...(data.lastDue || []), ...data.deadlines].filter((item, index, all) =>
    all.findIndex(other => other.id === item.id && other.date === item.date) === index).filter(item => item.periods.includes(period)
    && item.date < today
    && (item.kind === "hard" || (item.kind === "daily" && item.date <= data.releasedThrough)));
  for (const assessment of data.assessments || []) {
    if (assessment.period !== period || assessment.date >= today ||
        assessment.date > data.releasedThrough) continue;
    const title = assessment.title.toLowerCase();
    if (!past.some(item => {
      if (item.date !== assessment.date || !item.title) return false;
      const dueTitle = item.title.toLowerCase();
      return dueTitle === title ||
        (dueTitle.startsWith(title) && /^\s*[:–—-]/.test(dueTitle.slice(title.length)));
    })) {
      past.push(assessment);
    }
  }
  const latestDate = past.reduce((latest, item) => item.date > latest ? item.date : latest, "");
  return past.filter(item => item.date === latestDate);
}
export function scheduledPlans(data, period) {
  return (data.plans || []).filter(item => item.period === period)
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function nextWeekRange(today) {
  const from = addDays(weekStart(today), 7);
  return { from, through: addDays(from, 6) };
}
export function nextWeekPlans(data, period, today) {
  const { from, through } = nextWeekRange(today);
  return scheduledPlans(data, period).filter(item => item.date >= from && item.date <= through);
}
export function announcementsFor(data, period, today) {
  const cards = (data.announcements || []).filter(item => item.status === "active"
    && item.periods.includes(period) && (!item.startsOn || item.startsOn <= today)
    && (!item.endsOn || item.endsOn >= today))
    .sort((a, b) => b.priority - a.priority);
  (data.automaticNotices || []).filter(item => item.periods.includes(period)
    && item.startsOn <= today && today <= item.endsOn)
    .sort((a, b) => a.date.localeCompare(b.date)).forEach(item => cards.push({
      id: item.id, title: item.title, body: item.label + ": " + dateLabel(item.date, { weekday: "short" }),
    }));
  return cards;
}
export function maximumWeek(data, period, today) {
  const previewWeek = nextWeekRange(today).from;
  const lastTermWeek = weekStart(TERM_END);
  return hardDates(data, period).reduce(
    (maximum, item) => weekStart(item.date) > maximum ? weekStart(item.date) : maximum,
    previewWeek > lastTermWeek ? lastTermWeek : previewWeek,
  );
}
export function maximumMonth(data, period, today) {
  const boundedToday = today > TERM_END ? TERM_END : today;
  const currentThrough = [nextWeekRange(boundedToday).through, TERM_END].sort()[0];
  return hardDates(data, period).reduce(
    (maximum, item) => item.date > maximum ? item.date : maximum, currentThrough,
  ).slice(0, 7);
}
export function calendarItems(data, period, from, through, today) {
  const cutoff = [weekEnd(today), data.releasedThrough, TERM_END].sort()[0];
  const first = "2026-08-12";
  const planningEnd = [nextWeekRange(today).through, TERM_END].sort()[0];
  const lessons = data.lessons.filter(item => item.period === period
    && item.date >= from && item.date >= first && item.date <= through && item.date <= cutoff)
    .map(item => ({ ...item, category: "lesson" }));
  const deadlines = data.deadlines.filter(item => item.periods.includes(period)
    && item.date >= from && item.date >= first && item.date <= through
    && (item.kind === "hard" || (item.date <= planningEnd &&
      (item.kind === "daily" || (item.calendarDue && item.kind === "proposed")))))
    .map(item => ({ ...item, category: "hard" }));
  const plans = nextWeekPlans(data, period, today).filter(item =>
    item.date >= from && item.date <= through && item.date <= TERM_END)
    .map(item => ({...item, kind:"plan", category:"plan"}));
  return [...lessons, ...plans, ...deadlines].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.category === "hard" ? -1 : 1),
  );
}
export function classLogDays(data, period, from, through, today) {
  const cutoff = [weekEnd(today), data.releasedThrough, TERM_END].sort()[0];
  const items = calendarItems(data, period, from, through, today);
  const plans = nextWeekPlans(data, period, today).filter(item =>
    item.date >= from && item.date <= through && item.date <= TERM_END);
  const meetings = (data.classDays || []).filter(item => item.period === period
    && item.date >= from && item.date >= "2026-08-12" && item.date <= through && item.date <= cutoff);
  const dates = [...new Set([...meetings, ...items, ...plans].map(item => item.date))].sort();
  return dates.map(date => ({
    date,
    released: date <= cutoff,
    hasClassMeeting: meetings.some(item => item.date === date),
    lessons: items.filter(item => item.date === date && item.category === "lesson"),
    plans: plans.filter(item => item.date === date)
      .map(({ id, title }) => ({ id, date, title, kind: "plan" })),
    due: items.filter(item => item.date === date && item.category === "hard"),
  }));
}
