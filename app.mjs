import {
  PERIODS, TERM_END, addDays, weekStart, weekEnd, pacificToday, dateLabel,
  readPreferences, savePreferences, dueLastDates, dueNextDates, nextWeekPlans, nextWeekRange, announcementsFor, maximumWeek, maximumMonth, calendarItems, classLogDays,
} from "./domain.mjs";

const $ = id => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
let storage = null;
try { storage = window.localStorage; } catch {}
const preferences = readPreferences(storage);
let data;
let state;
let today;
let currentWeek;
const minimumWeek = weekStart("2026-08-12");

function remember() {
  const saved = savePreferences(storage, {
    period: state.period,
    week: state.week, month: state.month, followCurrent: state.followCurrent,
  });
  $("remember-note").hidden = saved;
  $("remember-note").textContent = saved ? "" : "This browser cannot save your selection.";
  const url = new URL(location.href);
  if (state.period) url.searchParams.set("period", String(state.period));
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}
function clampWeek() {
  const last = maximumWeek(data, state.period, today > TERM_END ? TERM_END : today);
  state.week = [state.week || currentWeek, minimumWeek].sort().at(-1);
  if (state.week > last) state.week = last;
  const lastMonth = maximumMonth(data, state.period, today);
  if (state.month < "2026-08") state.month = "2026-08";
  if (state.month > lastMonth) state.month = lastMonth;
}
function choosePeriod(period, focus = false) {
  state.period = period;
  clampWeek();
  render();
  remember();
  if (focus) $("period-" + period).focus();
}
function drawPeriodTabs() {
  const tabs = $("period-tabs");
  PERIODS.forEach(period => {
    let tab = $("period-" + period.id);
    if (!tab) tab = createPeriodTab(period, tabs);
    tab.setAttribute("aria-selected", String(state.period === period.id));
    tab.tabIndex = state.period === period.id || (!state.period && period.id === 1) ? 0 : -1;
  });
}
function createPeriodTab(period, tabs) {
  const tab = node("button", "period-tab");
  tab.type = "button";
  tab.id = "period-" + period.id;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "class-panel");
  tab.append(node("span", "period-name", "Period " + period.id));
  tab.append(node("span", "period-course", period.course));
  tab.addEventListener("click", () => choosePeriod(period.id));
  tab.addEventListener("keydown", event => {
    const position = PERIODS.indexOf(period);
    let target = null;
    if (event.key === "ArrowRight") target = PERIODS[(position + 1) % PERIODS.length].id;
    if (event.key === "ArrowLeft") target = PERIODS[(position + PERIODS.length - 1) % PERIODS.length].id;
    if (event.key === "Home") target = PERIODS[0].id;
    if (event.key === "End") target = PERIODS.at(-1).id;
    if (target) { event.preventDefault(); choosePeriod(target, true); }
  });
  tabs.append(tab);
  return tab;
}
function showDetails(item) {
  $("dialog-title").textContent = item.title;
  $("dialog-category").textContent = item.kind === "proposed" ? "PLANNED DUE" : item.category === "hard" ? "DUE"
    : item.kind === "plan" ? "SCHEDULED" : item.kind === "soft" ? "SOFT DUE DATE" : item.kind === "proposed" ? "PROPOSED DUE DATE" : "CLASSWORK";
  $("dialog-date").textContent = dateLabel(item.date, { weekday: "long", year: "numeric" })
    + (item.time ? " · " + item.time : "");
  $("dialog-body").textContent = item.description || "";
  $("dialog-body").hidden = !item.description;
  const material = $("dialog-material");
  material.hidden = !item.materialUrl;
  if (item.materialUrl) { material.href = item.materialUrl; material.target = "_blank"; material.rel = "noopener"; }
  else material.removeAttribute("href");
  $("item-dialog").showModal();
}
function itemButton(item, compact = false) {
  const plannedDue = item.kind === "proposed";
  const label = plannedDue ? "Planned due" : item.category === "hard" ? "Due" : item.kind === "plan" ? "Scheduled" : "In class";
  const button = node("button", compact ? "month-item" + (item.category === "hard" ? " hard" : "")
    : item.category === "hard" ? "hard-item" : "lesson-item");
  button.type = "button";
  if (compact) {
    button.textContent = label + " · " + item.title;
  } else {
    button.append(node("span", "item-label", label));
    button.append(node("span", "item-title", plannedDue ? label + " · " + item.title : item.title));
  }
  button.setAttribute("aria-label", dateLabel(item.date) + ", " + item.title
    + (plannedDue ? ", planned due" : item.category === "hard" ? ", due" : item.kind === "plan" ? ", scheduled" : ", classwork"));
  button.addEventListener("click", () => showDetails(item));
  return button;
}
function dailyList(from, through, previewingNextWeek) {
  const list = node("div", "daily-list");
  const days = classLogDays(data, state.period, from, through, today);
  days.forEach(day => {
    const row = node("article", "daily-entry" + (day.date === today ? " is-today" : ""));
    row.append(node("h4", "daily-date", dateLabel(day.date, { weekday: "long", year: "numeric" })
      + (day.date === today ? " · Today" : "")));
    const columns = node("div", "daily-columns");
    const classwork = node("section", "daily-classwork");
    const classworkLabel = previewingNextWeek ? "Scheduled" : "In class";
    classwork.setAttribute("aria-label", classworkLabel + " on " + dateLabel(day.date));
    classwork.append(node("h5", "daily-label", classworkLabel));
    const classworkItems = previewingNextWeek ? day.plans : day.lessons;
    classworkItems.forEach(item => {
      classwork.append(itemButton(item));
      if (item.description) classwork.append(node("p", "daily-notes", item.description));
    });
    if (!classworkItems.length) classwork.append(node("p", "daily-empty", day.released && day.hasClassMeeting ? "Not posted" : "—"));
    const due = node("section", "daily-due");
    due.setAttribute("aria-label", "Due on " + dateLabel(day.date));
    due.append(node("h5", "daily-label", "Due this day"));
    day.due.forEach(item => due.append(itemButton(item)));
    if (!day.due.length) due.append(node("p", "daily-empty", "—"));
    columns.append(classwork, due);
    row.append(columns);
    list.append(row);
  });
  if (!days.length) list.append(node("p", "list-empty", previewingNextWeek
    ? "Nothing scheduled for next week."
    : "No class meetings or hard due dates are posted for this week."));
  return list;
}
function drawMonth(from, through) {
  const outer = node("div", "month-view");
  const desktop = node("div", "month-desktop");
  const grid = node("table", "month-grid");
  grid.setAttribute("aria-label", "Monthly class calendar");
  const head = node("thead");
  const headerRow = node("tr");
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(day => {
    const header = node("th", "month-weekday", day);
    header.scope = "col";
    headerRow.append(header);
  });
  head.append(headerRow);
  grid.append(head);
  const body = node("tbody");
  const gridStart = weekStart(from);
  const gridEnd = weekEnd(through);
  const items = calendarItems(data, state.period, gridStart, gridEnd, today);
  let row;
  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    if (new Date(date + "T12:00:00Z").getUTCDay() === 1) {
      row = node("tr");
      body.append(row);
    }
    const cell = node("td", "month-cell" + (date.slice(0, 7) !== from.slice(0, 7) ? " outside-month" : "")
      + (date === today ? " today" : ""));
    cell.setAttribute("aria-label", dateLabel(date, { weekday: "long" }));
    cell.append(node("span", "month-date", String(Number(date.slice(8)))));
    items.filter(item => item.date === date).forEach(item => cell.append(itemButton(item, true)));
    row.append(cell);
  }
  grid.append(body);
  desktop.append(grid);
  outer.append(desktop);
  return outer;
}
function drawAnnouncements() {
  const area = $("announcements");
  area.replaceChildren();
  const cards = announcementsFor(data, state.period, today);
  cards.forEach(card => {
    const notice = node("article", "notice announcement-card");
    notice.append(node("h3", "announcement-title", card.title));
    if (card.body) notice.append(node("p", "announcement-body", card.body));
    area.append(notice);
  });
  area.hidden = cards.length === 0;
}
function drawDueList(id, items) {
  const list = $(id);
  list.replaceChildren();
  items.forEach(item => {
    const block = node("article", "proposal-short");
    block.append(node("p", "proposal-date", dateLabel(item.date, { weekday: "short" })));
    if (item.project) block.append(node("p", "proposal-project", item.project));
    block.append(itemButton({ ...item, category: item.type ? "lesson" : "hard" }));
    list.append(block);
  });
  if (!items.length) list.append(node("p", "empty-message", "—"));
}
function drawScheduled() {
  const upcoming = nextWeekPlans(data, state.period, today);
  const nextWeek = nextWeekRange(today);
  $("scheduled-range").textContent = dateLabel(nextWeek.from) + " – " + dateLabel(nextWeek.through);
  const sidebar = $("scheduled-preview");
  sidebar.replaceChildren();
  upcoming.forEach(item => {
    const block = node("article", "proposal-short");
    block.append(node("p", "proposal-date", dateLabel(item.date, { weekday: "short" })));
    block.append(node("p", "proposal-title", item.title));
    sidebar.append(block);
  });
  if (!upcoming.length) sidebar.append(node("p", "empty-message", "—"));

  drawDueList("due-last-preview", dueLastDates(data, state.period, today));
  drawDueList("due-next-preview", dueNextDates(data, state.period).filter(item => item.date >= today));
}
function drawCalendar() {
  const from = state.week;
  const through = addDays(from, 6);
  const lastWeek = maximumWeek(data, state.period, today);
  const previewingNextWeek = from === nextWeekRange(today).from;
  $("range-title").textContent = dateLabel(from) + " – " + dateLabel(through);
  $("range-caption").textContent = state.week === currentWeek ? "THIS WEEK"
    : state.week < currentWeek ? "PAST CLASSES" : previewingNextWeek ? "NEXT WEEK" : "DUE DATES";
  $("week-lesson-key").textContent = previewingNextWeek ? "Scheduled" : "In class";
  $("previous-date").disabled = state.week <= minimumWeek;
  $("next-date").disabled = state.week >= lastWeek;
  $("calendar-content").replaceChildren(dailyList(from, through, previewingNextWeek));

  const monthFrom = state.month + "-01";
  const monthThrough = new Date(Date.UTC(Number(monthFrom.slice(0, 4)), Number(monthFrom.slice(5, 7)), 0)).toISOString().slice(0, 10);
  $("month-title").textContent = dateLabel(monthFrom, { month: "long", year: "numeric", day: undefined });
  $("previous-month").disabled = monthFrom <= "2026-08-01";
  $("next-month").disabled = state.month >= maximumMonth(data, state.period, today);
  $("month-content").replaceChildren(drawMonth(monthFrom, monthThrough));

  const expectedRelease = [weekEnd(today), TERM_END].sort()[0];
  const releaseLate = data.releasedThrough < expectedRelease && today <= TERM_END;
  $("release-note").hidden = !releaseLate;
  $("release-note").textContent = releaseLate ? "This week's classwork is not posted." : "";
}
function render() {
  drawPeriodTabs();
  $("welcome").hidden = !!state.period;
  $("class-panel").hidden = !state.period;
  if (!state.period) return;
  const qr = $("calendar-qr");
  if (qr.parentElement !== $("class-intro")) $("class-intro").append(qr);
  const period = PERIODS.find(item => item.id === state.period);
  $("class-panel").setAttribute("aria-labelledby", "period-" + state.period);
  $("class-title").textContent = period.course + " · Period " + period.id;
  $("class-days").textContent = period.days.toUpperCase();
  drawAnnouncements();
  drawCalendar();
  drawScheduled();
}
function changeRange(direction, byMonth = false) {
  state.followCurrent = false;
  if (byMonth) {
    const date = new Date(state.month + "-15T12:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + direction);
    state.month = date.toISOString().slice(0, 7);
  } else {
    state.week = addDays(state.week, direction * 7);
    state.month = state.week.slice(0, 7);
  }
  clampWeek();
  render();
  remember();
}
function refreshSchoolDate() {
  if (!data || data.preview) return;
  const currentDate = pacificToday();
  if (currentDate === today) return;
  today = currentDate;
  currentWeek = weekStart(today > TERM_END ? TERM_END : today);
  if (state.followCurrent) {
    state.week = currentWeek;
    state.month = (today > TERM_END ? TERM_END : today).slice(0, 7);
  }
  clampWeek();
  render();
  if (state.period) remember();
}
async function start() {
  const response = await fetch("./data.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Calendar data unavailable");
  data = await response.json();
  today = data.preview?.asOf || pacificToday();
  currentWeek = weekStart(today > TERM_END ? TERM_END : today);
  const queryPeriod = Number(new URL(location.href).searchParams.get("period"));
  state = {
    period: PERIODS.some(item => item.id === queryPeriod) ? queryPeriod : preferences.period,
    week: preferences.followCurrent ? currentWeek : preferences.week || currentWeek,
    month: preferences.followCurrent ? (today > TERM_END ? TERM_END : today).slice(0, 7)
      : preferences.month || (preferences.week || currentWeek).slice(0, 7),
    followCurrent: preferences.followCurrent,
  };
  clampWeek();
  $("update-label").textContent = "Calendar checked " + dateLabel(data.calendarCheckedOn, { year: "numeric" });
  $("previous-date").addEventListener("click", () => changeRange(-1));
  $("next-date").addEventListener("click", () => changeRange(1));
  $("previous-month").addEventListener("click", () => changeRange(-1, true));
  $("next-month").addEventListener("click", () => changeRange(1, true));
  const showCurrent = () => {
    state.week = currentWeek;
    state.month = (today > TERM_END ? TERM_END : today).slice(0, 7);
    state.followCurrent = true; render(); remember();
  };
  $("current-date").addEventListener("click", showCurrent);
  $("current-month").addEventListener("click", showCurrent);
  $("close-dialog").addEventListener("click", () => $("item-dialog").close());
  $("item-dialog").addEventListener("click", event => {
    if (event.target === $("item-dialog")) $("item-dialog").close();
  });
  render();
  if (state.period) remember();
  window.addEventListener("focus", refreshSchoolDate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSchoolDate();
  });
  window.setInterval(refreshSchoolDate, 60_000);
}
start().catch(error => {
  console.error(error);
  $("load-error").hidden = false;
});
