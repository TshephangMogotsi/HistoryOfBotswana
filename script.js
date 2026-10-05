const NS = "http://www.w3.org/2000/svg";
const WIDTH = 1200;
const CENTER = WIDTH / 2;
const BASELINE = 196;
const MONTH_STEP = 18;
const DAY_STEP = 34;
const START_YEAR = 1885;
const TODAY = new Date();
const END_YEAR = Math.max(2026, TODAY.getFullYear());
const MONTH_COUNT = (END_YEAR - START_YEAR) * 12 + 11;
const TODAY_MONTH = (TODAY.getFullYear() - START_YEAR) * 12 + TODAY.getMonth();
const INITIAL_MONTH = Math.min(MONTH_COUNT, Math.max(0, TODAY_MONTH));
const INITIAL_DAY = Math.min(
  TODAY.getDate(),
  new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate(),
);
const SCROLL_ACCELERATION_MAX = 8;
const SCROLL_ACCELERATION_STEP = 0.55;
const SCROLL_ACCELERATION_IDLE_MS = 190;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ruler = document.querySelector("#ruler");
const scrollModeToggle = document.querySelector("#scroll-mode-toggle");
const eventTrack = document.querySelector("#event-track");
const monthTrack = document.querySelector("#month-track");
const dayTrack = document.querySelector("#day-track");
const eventReadout = document.querySelector("#event-readout");
const dateReadout = document.querySelector("#date-readout");
const eventStage = document.querySelector("#event-stage");
const eventCard = document.querySelector("#event-card");
const eventCardKicker = document.querySelector("#event-card-kicker");
const eventCardBadge = document.querySelector("#event-card-badge");
const eventCardTitle = document.querySelector("#event-card-title");
const eventCardDate = document.querySelector("#event-card-date");
const eventCardLocation = document.querySelector("#event-card-location");
const eventCardLocationMark = document.querySelector("#event-card-location-mark");
const eventCardSummary = document.querySelector("#event-card-summary");
const eventCardSources = document.querySelector("#event-card-sources");
const previousEvent = document.querySelector("#event-previous");
const previousEventKicker = document.querySelector("#event-previous-kicker");
const previousEventTitle = document.querySelector("#event-previous-title");
const previousEventDate = document.querySelector("#event-previous-date");
const nextEvent = document.querySelector("#event-next");
const nextEventKicker = document.querySelector("#event-next-kicker");
const nextEventTitle = document.querySelector("#event-next-title");
const nextEventDate = document.querySelector("#event-next-date");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const historicalEvents = Array.isArray(window.BOTSWANA_EVENTS) ? window.BOTSWANA_EVENTS : [];

ruler.setAttribute("aria-valuemax", String(MONTH_COUNT));

let targetMonth = INITIAL_MONTH;
let displayedMonth = targetMonth;
let targetDay = INITIAL_DAY;
let displayedDay = targetDay;
let targetZoom = 0;
let displayedZoom = 0;
let drag = null;
let scrollAcceleration = 1;
let scrollDirection = 0;
let lastScrollTime = -Infinity;
let acceleratedScrolling = true;
let animationFrame = 0;
let previousFrameTime = 0;
let dayMonthBuilt = -1;
let dayScrollRemainder = 0;
let monthTicks = [];
let dayTicks = [];
let eventMarkers = [];

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  return element;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resetScrollAcceleration() {
  scrollAcceleration = 1;
  scrollDirection = 0;
  lastScrollTime = -Infinity;
}

function acceleratedScrollDelta(delta, now = performance.now()) {
  const direction = Math.sign(delta);
  if (!direction) return 0;
  const elapsed = Number.isFinite(lastScrollTime) ? now - lastScrollTime : Infinity;
  const continuous = direction === scrollDirection && elapsed <= SCROLL_ACCELERATION_IDLE_MS;
  if (!continuous) {
    scrollAcceleration = 1;
  } else {
    const persistence = 1 - elapsed / SCROLL_ACCELERATION_IDLE_MS;
    scrollAcceleration = Math.min(
      SCROLL_ACCELERATION_MAX,
      scrollAcceleration + SCROLL_ACCELERATION_STEP * persistence,
    );
  }
  scrollDirection = direction;
  lastScrollTime = now;
  return delta * scrollAcceleration;
}

function effectiveScrollDelta(delta) {
  return acceleratedScrolling ? acceleratedScrollDelta(delta) : delta;
}

function updateScrollModeToggle() {
  scrollModeToggle.textContent = acceleratedScrolling ? "BOOST SCROLL" : "DIRECT SCROLL";
  scrollModeToggle.setAttribute("aria-pressed", String(acceleratedScrolling));
}

function signalAmplitude(index) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function dateForMonth(monthIndex) {
  monthIndex = Math.round(monthIndex);
  return {
    year: START_YEAR + Math.floor(monthIndex / 12),
    month: monthIndex % 12,
  };
}

function daysInMonth(monthIndex) {
  monthIndex = Math.round(monthIndex);
  const { year, month } = dateForMonth(monthIndex);
  return new Date(year, month + 1, 0).getDate();
}

function monthLabel(monthIndex) {
  const { year, month } = dateForMonth(monthIndex);
  return `${MONTHS[month].slice(0, 3).toUpperCase()} ${year}`;
}

function fullDateLabel(monthIndex, day) {
  const { year, month } = dateForMonth(monthIndex);
  return `${MONTHS[month].slice(0, 3).toUpperCase()} ${String(day).padStart(2, "0")} ${year}`;
}

function eventDateLabel(event) {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(event.dateStart || "");
  if (!match) return "DATE UNAVAILABLE";
  const year = Number(match[1]);
  if (!match[2]) return String(year);
  const month = MONTHS[Number(match[2]) - 1].slice(0, 3).toUpperCase();
  return match[3] ? `${month} ${match[3]} ${year}` : `${month} ${year}`;
}

function buildMonthTrack() {
  monthTrack.replaceChildren();
  monthTicks = [];

  for (let index = 0; index <= MONTH_COUNT; index += 1) {
    const major = index % 12 === 0;
    const tick = svgElement("line", {
      x1: index * MONTH_STEP,
      x2: index * MONTH_STEP,
      y1: BASELINE - (major ? 84 : 50),
      y2: BASELINE,
      stroke: major ? "#f0f0f2" : "#55555a",
      "stroke-width": major ? 2 : 1.35,
      "stroke-linecap": "round",
    });
    monthTrack.append(tick);
    monthTicks.push({ element: tick, index, baseHeight: major ? 84 : 50, major });

    if (major) {
      const label = svgElement("text", {
        x: index * MONTH_STEP,
        y: BASELINE - 112,
        fill: "#a6a6a9",
        "font-size": "17",
        "font-weight": "600",
        "letter-spacing": "1.2",
        "text-anchor": "middle",
      });
      label.textContent = String(START_YEAR + index / 12);
      monthTrack.append(label);
    }
  }
}

function datePosition(dateValue) {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(dateValue || "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) - 1 : 5;
  const monthIndex = (year - START_YEAR) * 12 + month;
  if (monthIndex < 0 || monthIndex > MONTH_COUNT) return null;
  if (!match[2]) return monthIndex + 5.5;
  if (!match[3]) return monthIndex + 0.5;
  return monthIndex + (Number(match[3]) - 0.5) / daysInMonth(monthIndex);
}

function eventMonthPosition(event) {
  const start = datePosition(event.dateStart);
  if (start === null) return null;
  const end = datePosition(event.dateEnd);
  return end === null ? start : (start + end) / 2;
}

function selectMonthlyEvents(events) {
  const precisionRank = { day: 4, month: 3, range: 2, year: 1 };
  const monthly = new Map();

  for (const event of events) {
    const position = eventMonthPosition(event);
    if (position === null) continue;
    const monthKey = Math.floor(position);
    const current = monthly.get(monthKey);
    const candidateRank = [precisionRank[event.precision] || 0, Number(event.importance) || 0];
    const currentRank = current
      ? [precisionRank[current.precision] || 0, Number(current.importance) || 0]
      : [-1, -1];
    if (!current || candidateRank[0] > currentRank[0]
      || (candidateRank[0] === currentRank[0] && candidateRank[1] > currentRank[1])) {
      monthly.set(monthKey, event);
    }
  }

  return [...monthly.values()].sort((left, right) => (
    eventMonthPosition(left) - eventMonthPosition(right)
  ));
}

const timelineEvents = selectMonthlyEvents(historicalEvents);

function eventTarget(event) {
  if (event.precision === "range") {
    const midpoint = eventMonthPosition(event);
    if (midpoint === null) return null;
    return { month: clamp(Math.round(midpoint), 0, MONTH_COUNT), day: 1 };
  }
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(event.dateStart || "");
  if (!match) return null;
  const month = match[2] ? Number(match[2]) - 1 : 5;
  return {
    month: clamp((Number(match[1]) - START_YEAR) * 12 + month, 0, MONTH_COUNT),
    day: match[3] ? Number(match[3]) : 1,
  };
}

function eventDayPosition(event) {
  const target = eventTarget(event);
  if (!target) return 0;
  const dateMatch = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(event.dateStart || "");
  const day = dateMatch && dateMatch[3]
    ? Number(dateMatch[3])
    : Math.ceil(daysInMonth(target.month) / 2);
  return (day - 1) * DAY_STEP;
}

function focusEvent(event) {
  const target = eventTarget(event);
  if (!target) return;
  targetMonth = target.month;
  targetDay = clamp(target.day, 1, daysInMonth(target.month));
  wakeAnimation();
}

function buildEventTrack() {
  eventTrack.replaceChildren();
  eventMarkers = [];

  for (const event of timelineEvents) {
    const position = eventMonthPosition(event);
    if (position === null) continue;
    const importance = clamp(Number(event.importance) || 1, 1, 5);
    const height = 8 + importance * 3;
    const group = svgElement("g", {
      "data-event-id": event.id,
      "data-source-url": event.sourceUrl || "",
      tabindex: "0",
      role: "button",
      "aria-label": `${event.title}, ${event.dateStart}`,
    });
    const title = svgElement("title");
    title.textContent = `${event.dateStart} — ${event.title}. ${event.summary}`;
    group.append(title);
    const line = svgElement("line", {
      x1: position * MONTH_STEP,
      x2: position * MONTH_STEP,
      y1: 76 - height,
      y2: 76,
      stroke: "#4a4a52",
      "stroke-width": 1.2 + importance * 0.2,
      "stroke-linecap": "round",
    });
    const marker = svgElement("circle", {
      cx: position * MONTH_STEP,
      cy: BASELINE + 18,
      r: 1.8 + importance * 0.45,
      fill: "#4a4a52",
    });
    group.append(line, marker);
    group.addEventListener("pointerdown", (pointerEvent) => pointerEvent.stopPropagation());
    group.addEventListener("click", () => focusEvent(event));
    group.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
      keyboardEvent.preventDefault();
      focusEvent(event);
    });
    eventTrack.append(group);
    eventMarkers.push({ event, position, dayPosition: eventDayPosition(event), line, marker });
  }
}

function updateEventMarkers(activePosition) {
  let activeMarker = null;
  let nearestDistance = Infinity;

  for (const marker of eventMarkers) {
    const distance = Math.abs(marker.position - activePosition);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      activeMarker = marker;
    }
  }

  const isActive = activeMarker && nearestDistance <= 1.75;
  for (const marker of eventMarkers) {
    const active = marker === activeMarker && isActive;
    const distance = Math.abs(marker.position - activePosition);
    const opacity = active ? 1 : clamp(0.22 + (1 - distance / 36) * 0.38, 0.22, 0.6);
    const color = active ? "#8fa8ff" : "#4a4a52";
    marker.line.setAttribute("stroke", color);
    marker.marker.setAttribute("fill", color);
    marker.line.setAttribute("opacity", opacity);
    marker.marker.setAttribute("opacity", opacity);
  }

  eventReadout.textContent = "";
  eventReadout.setAttribute("opacity", "0");
}

const LOCATION_NAMES = [
  "Gaborone", "Francistown", "Moshupa", "Molepolole", "Mogoditshane", "Maun",
  "Palapye", "Serowe", "Tonota", "Shakawe", "Tutume", "Kanye", "Kasane",
  "Jwaneng", "Letlhakane", "Ghanzi", "Mochudi", "Tuli Block", "Okavango",
];

function eventLocation(event) {
  if (event.location) return event.location;
  const text = `${event.title} ${event.summary}`;
  const match = LOCATION_NAMES.find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
  return match || "Botswana";
}

function renderEventSources(event) {
  eventCardSources.replaceChildren();
  const entries = [];
  if (event.sourceUrl) entries.push({ label: "DailyNews article", url: event.sourceUrl });
  for (const sourceId of event.sources || []) {
    const source = window.BOTSWANA_SOURCES && window.BOTSWANA_SOURCES[sourceId];
    if (source && source.url) entries.push({ label: source.label, url: source.url });
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    const link = document.createElement("a");
    link.href = entry.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = entry.label;
    const item = document.createElement("li");
    item.append(link);
    eventCardSources.append(item);
  }
  if (!entries.length) {
    const item = document.createElement("li");
    item.textContent = "Source details unavailable";
    eventCardSources.append(item);
  }
}

function renderNeighbor(element, kickerElement, titleElement, dateElement, event) {
  if (!event) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  kickerElement.textContent = event.status === "lead"
    ? "NEWSPAPER LEAD"
    : `${(event.category || "historical").toUpperCase()} EVENT`;
  titleElement.textContent = event.title.replace(/^DailyNews lead:\s*/i, "");
  dateElement.textContent = eventDateLabel(event);
}

function updateEventCard(activePosition) {
  const activeMonth = Math.floor(activePosition);
  const activeMarker = eventMarkers.find((marker) => Math.floor(marker.position) === activeMonth) || null;
  const event = activeMarker ? activeMarker.event : null;
  if (!event) {
    eventStage.hidden = true;
    previousEvent.hidden = true;
    nextEvent.hidden = true;
    return;
  }

  const eventIndex = eventMarkers.indexOf(activeMarker);
  const previous = eventIndex > 0 ? eventMarkers[eventIndex - 1].event : null;
  const next = eventIndex >= 0 && eventIndex < eventMarkers.length - 1
    ? eventMarkers[eventIndex + 1].event
    : null;
  eventStage.hidden = false;
  eventCard.hidden = false;
  eventCard.setAttribute("aria-label", `Timeline event: ${event.title}`);
  eventCardKicker.textContent = event.status === "lead"
    ? "NEWSPAPER LEAD"
    : `${(event.category || "historical").toUpperCase()} EVENT`;
  eventCardBadge.textContent = event.status === "lead" ? "REVIEW LEAD" : "VERIFIED SOURCE";
  eventCardTitle.textContent = event.title.replace(/^DailyNews lead:\s*/i, "");
  eventCardDate.textContent = eventDateLabel(event);
  const location = eventLocation(event);
  eventCardLocation.textContent = location;
  eventCardLocationMark.textContent = location.toUpperCase();
  eventCardSummary.textContent = event.summary
    .replace(/^Newspaper lead retained for editorial review\.\s*/i, "")
    .trim();
  renderEventSources(event);
  renderNeighbor(previousEvent, previousEventKicker, previousEventTitle, previousEventDate, previous);
  renderNeighbor(nextEvent, nextEventKicker, nextEventTitle, nextEventDate, next);
}

function buildDayTrack(monthIndex) {
  if (dayMonthBuilt === monthIndex) return;
  dayMonthBuilt = monthIndex;
  dayTrack.replaceChildren();
  dayTicks = [];
  const count = daysInMonth(monthIndex);

  for (let day = 1; day <= count; day += 1) {
    const major = day === 1 || day % 7 === 0;
    const index = day - 1;
    const tick = svgElement("line", {
      x1: index * DAY_STEP,
      x2: index * DAY_STEP,
      y1: BASELINE - (major ? 72 : 42),
      y2: BASELINE,
      stroke: major ? "#f0f0f2" : "#55555a",
      "stroke-width": major ? 2 : 1.35,
      "stroke-linecap": "round",
    });
    dayTrack.append(tick);
    dayTicks.push({ element: tick, index, baseHeight: major ? 72 : 42, major });

    if (major) {
      const label = svgElement("text", {
        x: index * DAY_STEP,
        y: BASELINE - 100,
        fill: "#a6a6a9",
        "font-size": "15",
        "font-weight": "600",
        "letter-spacing": "1",
        "text-anchor": "middle",
      });
      label.textContent = String(day).padStart(2, "0");
      dayTrack.append(label);
    }
  }
}

function updateTickSet(set, activePosition, dayMode) {
  const activeIndex = Math.round(activePosition);

  for (const tick of set) {
    const relativePosition = tick.index - activePosition;
    const central = clamp(1 - Math.abs(relativePosition), 0, 1);
    const envelope = clamp(1 - Math.abs(relativePosition) / (dayMode ? 3.5 : 4.5), 0, 1);
    const signal = envelope * (8 + signalAmplitude(tick.index + (dayMode ? 900 : 0)) * 18);
    const height = tick.baseHeight + (tick.major ? 0 : signal + central * 10);
    const active = tick.index === activeIndex;
    tick.element.setAttribute("y1", BASELINE - height);
    tick.element.setAttribute("stroke", active ? "#8fa8ff" : tick.major ? "#f0f0f2" : "#55555a");
    const strokeWidth = active ? 2.6 : tick.major ? 2 : 1.35 + envelope * (0.2 + signalAmplitude(tick.index + (dayMode ? 900 : 0)) * 0.6);
    tick.element.setAttribute("stroke-width", strokeWidth);
  }
}

function render() {
  const monthPosition = displayedMonth * MONTH_STEP;
  const dayMode = displayedZoom > 0.45;
  const dayPosition = (displayedDay - 1) * DAY_STEP;
  eventTrack.setAttribute("transform", dayMode
    ? `translate(${CENTER - dayPosition} 0)`
    : `translate(${CENTER - monthPosition} 0)`);
  eventTrack.setAttribute("opacity", dayMode ? displayedZoom : 1 - displayedZoom);
  for (const marker of eventMarkers) {
    const monthTickPosition = Math.floor(marker.position) * MONTH_STEP;
    marker.marker.setAttribute("cx", dayMode ? marker.dayPosition : monthTickPosition);
  }
  updateEventMarkers(displayedMonth);
  updateEventCard(displayedMonth);
  monthTrack.setAttribute("transform", `translate(${CENTER - monthPosition} 0)`);
  monthTrack.setAttribute("opacity", 1 - displayedZoom);
  updateTickSet(monthTicks, displayedMonth, false);

  const monthIndex = clamp(Math.round(targetMonth), 0, MONTH_COUNT);
  buildDayTrack(monthIndex);
  dayTrack.setAttribute("transform", `translate(${CENTER - dayPosition} 0)`);
  dayTrack.setAttribute("opacity", displayedZoom);
  updateTickSet(dayTicks, displayedDay - 1, true);

  const roundedMonth = clamp(Math.round(targetMonth), 0, MONTH_COUNT);
  const roundedDay = clamp(Math.round(targetDay), 1, daysInMonth(roundedMonth));
  const isZoomed = displayedZoom > 0.45 || targetZoom > 0.45;
  const monthText = isZoomed ? fullDateLabel(roundedMonth, roundedDay) : monthLabel(roundedMonth);
  const ariaText = isZoomed
    ? `${MONTHS[dateForMonth(roundedMonth).month]} ${roundedDay}, ${dateForMonth(roundedMonth).year}`
    : `${MONTHS[dateForMonth(roundedMonth).month]} ${dateForMonth(roundedMonth).year}`;
  dateReadout.textContent = monthText;
  ruler.setAttribute("aria-valuenow", String(roundedMonth));
  ruler.setAttribute("aria-valuetext", ariaText);
}

function settle(now) {
  const elapsed = Math.min(48, now - previousFrameTime || 16);
  previousFrameTime = now;
  const progress = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 125);
  displayedMonth += (targetMonth - displayedMonth) * progress;
  displayedDay += (targetDay - displayedDay) * progress;
  displayedZoom += (targetZoom - displayedZoom) * progress;

  const settled = Math.abs(targetMonth - displayedMonth) < 0.001
    && Math.abs(targetDay - displayedDay) < 0.001
    && Math.abs(targetZoom - displayedZoom) < 0.001;
  if (settled) {
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    displayedZoom = targetZoom;
    render();
    animationFrame = 0;
    return;
  }

  render();
  animationFrame = requestAnimationFrame(settle);
}

function wakeAnimation() {
  if (!animationFrame) {
    previousFrameTime = performance.now();
    animationFrame = requestAnimationFrame(settle);
  }
}

function setMonth(next) {
  targetMonth = clamp(next, 0, MONTH_COUNT);
  targetDay = clamp(targetDay, 1, daysInMonth(targetMonth));
  wakeAnimation();
}

function moveDay(amount) {
  let month = Math.round(targetMonth);
  let day = targetDay + Math.round(amount);
  while (day < 1 && month > 0) {
    month -= 1;
    day += daysInMonth(month);
  }
  while (day > daysInMonth(month) && month < MONTH_COUNT) {
    day -= daysInMonth(month);
    month += 1;
  }
  targetMonth = clamp(month, 0, MONTH_COUNT);
  targetDay = clamp(day, 1, daysInMonth(targetMonth));
  wakeAnimation();
}

function scrollDays(amount) {
  dayScrollRemainder += amount;
  const wholeDays = Math.trunc(dayScrollRemainder);
  if (!wholeDays) return;
  dayScrollRemainder -= wholeDays;
  moveDay(wholeDays);
}

function setZoom(next) {
  targetZoom = clamp(next, 0, 1);
  if (targetZoom > 0.35 && displayedZoom <= 0.35) {
    targetMonth = Math.round(targetMonth);
    targetDay = clamp(targetDay, 1, daysInMonth(targetMonth));
    dayMonthBuilt = -1;
  }
  wakeAnimation();
}

function eventPosition(event) {
  const bounds = ruler.getBoundingClientRect();
  return clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * WIDTH;
}

ruler.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || drag) return;
  resetScrollAcceleration();
  ruler.focus({ preventScroll: true });
  ruler.setPointerCapture(event.pointerId);
  drag = { pointerId: event.pointerId, startX: event.clientX, startMonth: targetMonth, startDay: targetDay };
  ruler.classList.add("is-dragging");
});

ruler.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const delta = (drag.startX - event.clientX) / ruler.getBoundingClientRect().width;
  if (targetZoom > 0.45) {
    targetMonth = drag.startMonth;
    targetDay = drag.startDay;
    moveDay(delta * daysInMonth(drag.startMonth) * 1.5);
  } else {
    setMonth(drag.startMonth + delta * 18);
  }
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag = null;
  ruler.classList.remove("is-dragging");
}

ruler.addEventListener("pointerup", endDrag);
ruler.addEventListener("pointercancel", endDrag);
ruler.addEventListener("lostpointercapture", endDrag);

window.addEventListener("wheel", (event) => {
  if (drag) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? WIDTH : 1;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

  if (event.ctrlKey) {
    resetScrollAcceleration();
    const zoomMagnitude = Math.min(2, Math.max(0.5, Math.abs(delta * unit) / 120));
    setZoom(targetZoom + (delta < 0 ? 0.12 : -0.12) * zoomMagnitude);
  } else if (targetZoom > 0.45) {
    scrollDays(effectiveScrollDelta(delta * unit) / 60);
  } else {
    setMonth(targetMonth + effectiveScrollDelta(delta * unit) / 120);
  }
}, { passive: false });

const keyChanges = {
  ArrowLeft: -1, ArrowDown: -1,
  ArrowRight: 1, ArrowUp: 1,
};

ruler.addEventListener("keydown", (event) => {
  if (event.altKey || event.metaKey) return;
  resetScrollAcceleration();
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    setZoom(targetZoom + 0.2);
    return;
  }
  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    setZoom(targetZoom - 0.2);
    return;
  }
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    if (targetZoom > 0.45) {
      targetMonth = event.key === "Home" ? 0 : MONTH_COUNT;
      targetDay = event.key === "Home" ? 1 : daysInMonth(MONTH_COUNT);
      wakeAnimation();
    } else {
      setMonth(event.key === "Home" ? 0 : MONTH_COUNT);
    }
    return;
  }
  if (!Object.hasOwn(keyChanges, event.key)) return;
  event.preventDefault();
  if (targetZoom > 0.45) moveDay(keyChanges[event.key]);
  else setMonth(targetMonth + keyChanges[event.key]);
});

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    displayedZoom = targetZoom;
    render();
  }
});

scrollModeToggle.addEventListener("click", () => {
  acceleratedScrolling = !acceleratedScrolling;
  resetScrollAcceleration();
  updateScrollModeToggle();
});

updateScrollModeToggle();
buildEventTrack();
buildMonthTrack();
render();
