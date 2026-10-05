const NS = "http://www.w3.org/2000/svg";
const WIDTH = 1200;
let viewportWidth = WIDTH;
let CENTER = WIDTH / 2;
const BASELINE = 196;
const MONTH_STEP = 18;
const DAY_STEP = 34;
const START_YEAR = 1885;
const TODAY = new Date();
const historicalEvents = Array.isArray(window.BOTSWANA_EVENTS) ? window.BOTSWANA_EVENTS : [];
const END_YEAR = Math.max(TODAY.getFullYear(), ...historicalEvents.flatMap((event) =>
  [event.dateStart, event.dateEnd].map((date) => Number(String(date || "").slice(0, 4)) || START_YEAR)));
const MONTH_COUNT = (END_YEAR - START_YEAR) * 12 + 11;
const TODAY_MONTH = (TODAY.getFullYear() - START_YEAR) * 12 + TODAY.getMonth();
const INITIAL_MONTH = Math.min(MONTH_COUNT, Math.max(0, TODAY_MONTH));
const INITIAL_DAY = Math.min(
  TODAY.getDate(),
  new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate(),
);
// Navigation feel: skip at most three empty months; longer gaps keep normal calendar spacing.
const NAV = {
  friction: 0.84, // velocity retained per 60Hz frame; short coast avoids trackpad overshoot
  maxVelocity: 12, // maximum months (or days in day view) per 60Hz frame
  emptyMonthSkipLimit: 3, // only collapse gaps containing this many empty months or fewer
  wheelGain: 0.16, // 120px mouse notch -> about one month/event including its coast
  accelCap: 8, // maximum sustained-scroll multiplier
  accelPower: 1.6, // smooth acceleration curve
  wheelIdleMs: 200, // pause or reversal resets acceleration
  dragThreshold: 4, // pixels before a press becomes a drag
  stopThreshold: 0.008,
  jumpMinMs: 320, // keep short skips responsive
  jumpMaxMs: 1200, // give era jumps enough time to decelerate
  jumpDistanceGain: 20, // duration grows with the square root of the month distance
  bounceMaxPx: 40, // maximum visual stretch at either end of the day ruler
  bounceResistance: 0.35, // dampens outward wheel and drag input
  bounceSpring: 260, // strength of the spring back to the boundary
  bounceDamping: 32, // suppresses oscillation for a soft, controlled return
};
// Owner-confirmed dates; add historical landmarks only after verifying their wording.
const LANDMARKS = [
  { year: 1885, month: 3, label: "Protectorate", name: "Bechuanaland Protectorate" },
  { year: 1966, month: 9, label: "Independence", name: "Independence" },
  { year: 2000, month: 1, label: "2000", name: "2000" },
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ruler = document.querySelector("#ruler");
const landmarkTrack = document.querySelector("#landmark-track");
const landmarkLinks = document.querySelector("#landmark-links");
const landmarkMenu = document.querySelector("#landmark-menu");
const previousEventButton = document.querySelector("#previous-event-button");
const nextEventButton = document.querySelector("#next-event-button");
const monthsViewButton = document.querySelector("#months-view-button");
const daysViewButton = document.querySelector("#days-view-button");
const previousMonthButton = document.querySelector("#previous-month-button");
const nextMonthButton = document.querySelector("#next-month-button");
const eventProgress = document.querySelector("#event-progress");
const timelineHint = document.querySelector("#timeline-hint");
const eventTrack = document.querySelector("#event-track");
const monthTrack = document.querySelector("#month-track");
const dayTrack = document.querySelector("#day-track");
const eventReadout = document.querySelector("#event-readout");
const dateReadout = document.querySelector("#date-readout");
const dateText = document.querySelector("#date-text");
const datePicker = document.querySelector("#date-picker");
const datePickerForm = document.querySelector("#date-picker-form");
const datePickerYear = document.querySelector("#date-picker-year");
const datePickerMonth = document.querySelector("#date-picker-month");
const datePickerMessage = document.querySelector("#date-picker-message");
const timelineAnnouncer = document.querySelector("#timeline-announcer");
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
const eventCardSourceDetails = document.querySelector("#event-card-source-details");
const eventCardSourceLabel = document.querySelector("#event-card-source-label");
const previousEvent = document.querySelector("#event-previous");
const previousEventKicker = document.querySelector("#event-previous-kicker");
const previousEventTitle = document.querySelector("#event-previous-title");
const previousEventDate = document.querySelector("#event-previous-date");
const nextEvent = document.querySelector("#event-next");
const nextEventKicker = document.querySelector("#event-next-kicker");
const nextEventTitle = document.querySelector("#event-next-title");
const nextEventDate = document.querySelector("#event-next-date");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let targetMonth = INITIAL_MONTH;
let displayedMonth = targetMonth;
let targetDay = INITIAL_DAY;
let displayedDay = targetDay;
let targetZoom = 0;
let displayedZoom = 0;
let drag = null;
let scrollDirection = 0;
let lastScrollTime = -Infinity;
let scrollEnergy = 0;
let velocity = 0;
let jump = null;
let browseScroll = null;
let edgeOffset = 0;
let edgeVelocity = 0;
let rulerWidth = WIDTH;
let yearLabels = [];
let landmarkNodes = [];
let lastCardKey = "";
let pointerPositions = new Map();
let pinch = null;
let suppressClickUntil = 0;
let animationFrame = 0;
let previousFrameTime = 0;
let dayMonthBuilt = -1;
let monthTicks = [];
let dayTicks = [];
let eventMarkers = [];
let announceTimer = 0;
let pendingAnnouncement = null;
let lastAnnouncedKey = "";

const LIVE_ANNOUNCE_DELAY = 350;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  return element;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resetScrollAcceleration() {
  scrollEnergy = 0;
  scrollDirection = 0;
  lastScrollTime = -Infinity;
}

function acceleratedScrollDelta(delta, now = performance.now()) {
  const direction = Math.sign(delta);
  if (!direction) return 0;
  const elapsed = Number.isFinite(lastScrollTime) ? now - lastScrollTime : Infinity;
  const continuous = direction === scrollDirection && elapsed <= NAV.wheelIdleMs;
  if (!continuous) {
    scrollEnergy = 0;
  } else scrollEnergy *= Math.exp(-elapsed / 650);
  const gain = 1 + (NAV.accelCap - 1) * (clamp(scrollEnergy / 10, 0, 1) ** NAV.accelPower);
  // Tiny trackpad tail events don't increase acceleration on their own.
  scrollEnergy = Math.min(12, scrollEnergy + Math.max(0, Math.abs(delta) - 0.08));
  scrollDirection = direction;
  lastScrollTime = now;
  return delta * gain;
}

function scheduleTimelineAnnouncement(key, text) {
  if (!timelineAnnouncer || key === lastAnnouncedKey) return;
  if (pendingAnnouncement && pendingAnnouncement.key === key) return;
  pendingAnnouncement = { key, text };
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    if (!pendingAnnouncement || pendingAnnouncement.key === lastAnnouncedKey) return;
    const announcement = pendingAnnouncement;
    pendingAnnouncement = null;
    lastAnnouncedKey = announcement.key;
    timelineAnnouncer.textContent = "";
    window.requestAnimationFrame(() => {
      timelineAnnouncer.textContent = announcement.text;
    });
  }, LIVE_ANNOUNCE_DELAY);
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
  yearLabels = [];

  for (let index = 0; index <= MONTH_COUNT; index += 1) {
    const major = index % 12 === 0;
    const decade = major && (START_YEAR + index / 12) % 10 === 0;
    const landmark = LANDMARKS.some((item) => index === (item.year - START_YEAR) * 12 + item.month - 1);
    const height = landmark ? 116 : decade ? 96 : major ? 84 : 50;
    const tick = svgElement("line", {
      x1: index * MONTH_STEP,
      x2: index * MONTH_STEP,
      y1: BASELINE - height,
      y2: BASELINE,
      stroke: major ? "#f0f0f2" : "#55555a",
      "stroke-width": major ? 2 : 1.35,
      "stroke-linecap": "round",
    });
    monthTrack.append(tick);
    monthTicks.push({ element: tick, index, baseHeight: height, major: major || landmark });

    if (major) {
      const label = svgElement("text", {
        x: index * MONTH_STEP,
        y: BASELINE - 112,
        fill: decade ? "#f0f0f2" : "#a6a6a9",
        "font-size": decade ? "18" : "15",
        "font-weight": "600",
        "letter-spacing": "1.2",
        "text-anchor": "middle",
      });
      label.textContent = String(START_YEAR + index / 12);
      monthTrack.append(label);
      yearLabels.push({ label, index, decade });
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
  if (!match[2]) return monthIndex + 0.5;
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
const navigationEvents = timelineEvents.map((event) => ({ event, ...eventTarget(event) }))
  .filter((item) => Number.isFinite(item.month))
  .sort((left, right) => left.month - right.month || left.day - right.day);
const navigationStops = [];
let nextEventIndex = 0;
let previousEventMonth = null;
for (let month = 0; month <= MONTH_COUNT; month += 1) {
  while (nextEventIndex < navigationEvents.length && navigationEvents[nextEventIndex].month < month) {
    previousEventMonth = navigationEvents[nextEventIndex].month;
    nextEventIndex += 1;
  }
  const next = navigationEvents[nextEventIndex];
  if (next?.month === month) navigationStops.push(next);
  else if (previousEventMonth === null || !next || next.month - previousEventMonth - 1 > NAV.emptyMonthSkipLimit) {
    navigationStops.push({ month, day: 1, event: null });
  }
}

function calendarPosition(month, day, dayMode = targetZoom > 0.45) {
  return month + (dayMode ? (day - 1) / 32 : 0);
}

function browseCursorFor(month) {
  for (let index = 0; index < navigationStops.length - 1; index += 1) {
    const from = navigationStops[index].month;
    const to = navigationStops[index + 1].month;
    if (month <= to) return index + clamp((month - from) / (to - from), 0, 1);
  }
  return navigationStops.length - 1;
}

function applyBrowseCursor(position, snap = false) {
  const cursor = clamp(snap ? Math.round(position) : position, 0, navigationStops.length - 1);
  const left = navigationStops[Math.floor(cursor)];
  const right = navigationStops[Math.ceil(cursor)];
  const fraction = cursor - Math.floor(cursor);
  targetMonth = left.month + (right.month - left.month) * fraction;
  targetDay = left.day + (right.day - left.day) * fraction;
  displayedMonth = targetMonth;
  displayedDay = targetDay;
}

function latestRecordedEvent() {
  const today = calendarPosition(INITIAL_MONTH, INITIAL_DAY, true);
  return navigationEvents.filter((item) => calendarPosition(item.month, item.day, true) <= today).at(-1)
    || navigationEvents[0];
}

function eventTarget(event) {
  if (event.precision === "range") {
    const midpoint = eventMonthPosition(event);
    if (midpoint === null) return null;
    return { month: clamp(Math.floor(midpoint), 0, MONTH_COUNT), day: 1 };
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
  animateTo(target.month, target.day);
}

function buildLandmarks() {
  landmarkTrack.replaceChildren();
  landmarkLinks.replaceChildren();
  landmarkNodes = LANDMARKS.map((landmark) => {
    const index = (landmark.year - START_YEAR) * 12 + landmark.month - 1;
    const label = svgElement("text", {
      x: index * MONTH_STEP, y: 74, fill: "#b4b4bd",
      "font-size": 12, "font-weight": 500, "text-anchor": "middle",
    });
    label.textContent = landmark.label === "2000" ? "2000" : `${landmark.year} · ${landmark.label}`;
    // The tick itself stays in the month track so only the active tick turns blue.
    landmarkTrack.append(label);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = landmark.label === "2000" ? "2000" : `${landmark.year} · ${landmark.label}`;
    button.setAttribute("aria-label", `Jump to ${landmark.name}, ${MONTHS[landmark.month - 1]} ${landmark.year}`);
    button.addEventListener("click", () => {
      landmarkMenu.open = false;
      dateReadout.focus({ preventScroll: true });
      animateTo(index, 1);
    });
    landmarkLinks.append(button);
    return { ...landmark, index, label, button };
  });
}

function updateLandmarks() {
  landmarkTrack.setAttribute("transform", `translate(${CENTER - displayedMonth * MONTH_STEP} 0)`);
  landmarkTrack.setAttribute("opacity", String(1 - displayedZoom));
  const occupied = [];
  for (const node of landmarkNodes) {
    const x = CENTER + (node.index - displayedMonth) * MONTH_STEP;
    const halfWidth = node.label.textContent.length * 3.7 + 10;
    const visible = x > halfWidth && x < viewportWidth - halfWidth;
    node.label.setAttribute("visibility", visible ? "visible" : "hidden");
    node.button.classList.toggle("is-current", Math.abs(displayedMonth - node.index) < 0.5);
    if (visible) occupied.push({ x, halfWidth });
  }
  // Era > decade > year. Estimate text widths once; avoid layout reads in animation.
  for (const node of [...yearLabels.filter((item) => item.decade), ...yearLabels.filter((item) => !item.decade)]) {
    const x = CENTER + (node.index - displayedMonth) * MONTH_STEP;
    const halfWidth = 32;
    const show = x > halfWidth && x < viewportWidth - halfWidth
      && !occupied.some((item) => Math.abs(item.x - x) < item.halfWidth + halfWidth);
    node.label.setAttribute("visibility", show ? "visible" : "hidden");
    if (show) occupied.push({ x, halfWidth });
  }
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
    const hit = svgElement("circle", { cx: Math.floor(position) * MONTH_STEP, cy: BASELINE + 18, r: 16, fill: "transparent", "pointer-events": "all" });
    group.append(line, hit, marker);
    group.addEventListener("click", () => {
      if (performance.now() >= suppressClickUntil) focusEvent(event);
    });
    group.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      focusEvent(event);
    });
    eventTrack.append(group);
    eventMarkers.push({ event, position, dayPosition: eventDayPosition(event), group, line, marker, hit });
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

  const isActive = activeMarker && Math.floor(activeMarker.position) === Math.round(activePosition)
    && (displayedZoom <= 0.45 || (activeMarker.event.precision === "day"
      && eventTarget(activeMarker.event).day === Math.round(displayedDay)));
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
  eventCardSourceLabel.textContent = seen.size ? `Sources (${seen.size})` : "Source details";
}

function renderNeighbor(element, kickerElement, titleElement, dateElement, event) {
  if (!event) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  element.setAttribute("aria-label", `${element === previousEvent ? "Previous" : "Next"} event: ${event.title}, ${eventDateLabel(event)}`);
  element.onclick = () => focusEvent(event);
  kickerElement.textContent = event.status === "lead"
    ? "NEWSPAPER LEAD"
    : `${(event.category || "historical").toUpperCase()} EVENT`;
  titleElement.textContent = event.title.replace(/^DailyNews lead:\s*/i, "");
  dateElement.textContent = eventDateLabel(event);
}

function activeEventAt(month, day, dayMode) {
  if (dayMode) return eventMarkers.find((marker) => Math.floor(marker.position) === Math.round(month)
    && marker.event.precision === "day" && eventTarget(marker.event).day === Math.round(day));
  return eventMarkers.find((marker) => Math.floor(marker.position) === Math.round(month));
}

function updateEventCard(activePosition, dayPosition, dayMode) {
  eventCardSourceDetails.open = false;
  const activeMarker = activeEventAt(activePosition, dayPosition, dayMode) || null;
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
  const sweeping = jump?.kind === "month-sweep";
  const trackKey = `${monthIndex}:${sweeping}`;
  if (dayMonthBuilt === trackKey) return;
  dayMonthBuilt = trackKey;
  dayTrack.replaceChildren();
  dayTicks = [];
  // Temporarily join neighbouring months so a month change travels along
  // continuous day ticks rather than replacing one identical ruler with another.
  const first = sweeping ? Math.max(0, monthIndex - 1) : monthIndex;
  const last = sweeping ? Math.min(MONTH_COUNT, monthIndex + 1) : monthIndex;
  for (let month = first; month <= last; month += 1) {
    const count = daysInMonth(month);
    const offset = month < monthIndex ? -count : month > monthIndex ? daysInMonth(monthIndex) : 0;
    for (let day = 1; day <= count; day += 1) {
      const major = day === 1 || day % 7 === 0;
      const index = offset + day - 1;
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
        label.textContent = sweeping && day === 1
          ? `${MONTHS[dateForMonth(month).month].slice(0, 3).toUpperCase()} 01`
          : String(day).padStart(2, "0");
        dayTrack.append(label);
      }
    }
  }
}

function updateTickSet(set, activePosition, dayMode) {
  const activeIndex = Math.round(activePosition);

  for (const tick of set) {
    const relativePosition = tick.index - activePosition;
    if (!dayMode && Math.abs(relativePosition) > viewportWidth / MONTH_STEP / 2 + 5) continue;
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

function render({ settled = false } = {}) {
  const monthPosition = displayedMonth * MONTH_STEP;
  const dayMode = displayedZoom > 0.45;
  const dayPosition = (displayedDay - 1) * DAY_STEP;
  const dayOffset = edgeOffset * displayedZoom;
  eventTrack.setAttribute("transform", dayMode
    ? `translate(${CENTER - dayPosition + dayOffset} 0)`
    : `translate(${CENTER - monthPosition} 0)`);
  eventTrack.setAttribute("opacity", dayMode ? displayedZoom : 1 - displayedZoom);
  for (const marker of eventMarkers) {
    const monthTickPosition = Math.floor(marker.position) * MONTH_STEP;
    const markerMonth = Math.floor(marker.position);
    const currentMonth = Math.round(displayedMonth);
    const sweeping = jump?.kind === "month-sweep";
    const dayMonthOffset = markerMonth < currentMonth ? -daysInMonth(markerMonth)
      : markerMonth > currentMonth ? daysInMonth(currentMonth) : 0;
    const markerDayPosition = marker.dayPosition + (sweeping ? dayMonthOffset * DAY_STEP : 0);
    marker.marker.setAttribute("cx", dayMode ? markerDayPosition : monthTickPosition);
    marker.hit.setAttribute("cx", dayMode ? markerDayPosition : monthTickPosition);
    const visible = dayMode
      ? Math.abs(markerMonth - currentMonth) <= (sweeping ? 1 : 0)
      : Math.abs(monthTickPosition - monthPosition) < viewportWidth / 2 + 20;
    marker.group.setAttribute("display", visible ? "inline" : "none");
    marker.group.setAttribute("tabindex", visible ? "0" : "-1");
  }
  updateEventMarkers(displayedMonth);
  const cardKey = activeEventAt(displayedMonth, displayedDay, dayMode)?.event.id || "none";
  // Follow manual scrolling and dragging immediately. Only hold the card during
  // a deliberate date jump, so travelling to a chosen date doesn't flash stories.
  if ((!jump || settled) && cardKey !== lastCardKey) {
    updateEventCard(displayedMonth, displayedDay, dayMode);
    lastCardKey = cardKey;
  }
  monthTrack.setAttribute("transform", `translate(${CENTER - monthPosition} 0)`);
  monthTrack.setAttribute("opacity", 1 - displayedZoom);
  updateTickSet(monthTicks, displayedMonth, false);
  updateLandmarks();

  const monthIndex = clamp(Math.round(displayedMonth), 0, MONTH_COUNT);
  buildDayTrack(monthIndex);
  dayTrack.setAttribute("transform", `translate(${CENTER - dayPosition + dayOffset} 0)`);
  dayTrack.setAttribute("opacity", displayedZoom);
  updateTickSet(dayTicks, displayedDay - 1, true);

  const roundedMonth = clamp(Math.round(displayedMonth), 0, MONTH_COUNT);
  const roundedDay = clamp(Math.round(displayedDay), 1, daysInMonth(roundedMonth));
  const isZoomed = displayedZoom > 0.45 || targetZoom > 0.45;
  const monthText = isZoomed ? fullDateLabel(roundedMonth, roundedDay) : monthLabel(roundedMonth);
  const ariaText = isZoomed
    ? `${MONTHS[dateForMonth(roundedMonth).month]} ${roundedDay}, ${dateForMonth(roundedMonth).year}`
    : `${MONTHS[dateForMonth(roundedMonth).month]} ${dateForMonth(roundedMonth).year}`;
  dateText.textContent = monthText;
  dateReadout.setAttribute("aria-label", `Jump to date, currently ${ariaText}`);
  const dayView = targetZoom > 0.45;
  monthsViewButton.setAttribute("aria-pressed", String(!dayView));
  daysViewButton.setAttribute("aria-pressed", String(dayView));
  const navigationMonth = clamp(Math.round(jump ? targetMonth : displayedMonth), 0, MONTH_COUNT);
  previousMonthButton.hidden = !dayView;
  nextMonthButton.hidden = !dayView;
  previousMonthButton.disabled = navigationMonth === 0;
  nextMonthButton.disabled = navigationMonth === MONTH_COUNT;
  previousMonthButton.setAttribute("aria-label", `Previous month, ${monthLabel(Math.max(0, navigationMonth - 1))}`);
  nextMonthButton.setAttribute("aria-label", `Next month, ${monthLabel(Math.min(MONTH_COUNT, navigationMonth + 1))}`);
  timelineHint.textContent = targetZoom > 0.45
    ? "Scroll within this month · Use ‹ › to change month"
    : "Scroll through time · Short gaps are skipped";
  ruler.setAttribute("aria-valuemin", "0");
  ruler.setAttribute("aria-valuemax", String(MONTH_COUNT));
  ruler.setAttribute("aria-valuenow", String(roundedMonth));
  ruler.setAttribute("aria-valuetext", ariaText);

  const activeMarker = activeEventAt(roundedMonth, roundedDay, isZoomed);
  const activeIndex = activeMarker ? navigationEvents.findIndex((item) => item.event.id === activeMarker.event.id) : -1;
  const passedCount = navigationEvents.filter((item) => isZoomed
    ? calendarPosition(item.month, item.day, true) <= calendarPosition(roundedMonth, roundedDay, true)
    : item.month <= roundedMonth).length;
  eventProgress.textContent = !navigationEvents.length ? "No events yet"
    : activeIndex >= 0 ? `${activeIndex + 1} of ${navigationEvents.length} events`
    : `Between events · ${passedCount} of ${navigationEvents.length}`;
  const eventSuffix = activeMarker
    ? `. Event: ${activeMarker.event.title}`
    : ". No documented event for this period";
  previousEventButton.disabled = !adjacentEvent(-1);
  nextEventButton.disabled = !adjacentEvent(1);
  if (settled) scheduleTimelineAnnouncement(
    `${isZoomed ? "day" : "month"}:${roundedMonth}:${roundedDay}:${activeMarker ? activeMarker.event.id : "none"}`,
    `${ariaText}${eventSuffix}`,
  );
}

function stopMotion({ keepBounce = false } = {}) {
  velocity = 0;
  jump = null;
  browseScroll = null;
  if (!keepBounce) {
    edgeOffset = 0;
    edgeVelocity = 0;
  }
  targetMonth = displayedMonth;
  targetDay = displayedDay;
  window.clearTimeout(announceTimer);
  pendingAnnouncement = null;
}

function easeTravel(value) {
  // Speed peaks after the first third: quick acceleration, then a long soft landing.
  // Starts and finishes at rest, stays monotonic, and cannot overshoot the destination.
  return 6 * value ** 2 - 8 * value ** 3 + 3 * value ** 4;
}

function animateTo(month, day = targetDay, { monthSweep = false } = {}) {
  stopMotion();
  resetScrollAcceleration();
  targetMonth = clamp(Math.round(month), 0, MONTH_COUNT);
  targetDay = clamp(day, 1, daysInMonth(targetMonth));
  if (reducedMotion.matches) {
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    render({ settled: true });
    return;
  }
  jump = {
    fromMonth: displayedMonth, fromDay: displayedDay,
    started: performance.now(),
    duration: clamp(NAV.jumpMinMs + Math.sqrt(Math.abs(targetMonth - displayedMonth)) * NAV.jumpDistanceGain,
      NAV.jumpMinMs, NAV.jumpMaxMs),
  };
  if (monthSweep && targetZoom > 0.45) {
    jump.kind = "month-sweep";
    jump.fromMonth = Math.round(jump.fromMonth);
    let monthDays = 0;
    for (let index = Math.min(jump.fromMonth, targetMonth); index < Math.max(jump.fromMonth, targetMonth); index += 1) {
      monthDays += daysInMonth(index);
    }
    jump.travelDays = Math.sign(targetMonth - jump.fromMonth) * monthDays + targetDay - jump.fromDay;
    jump.duration = clamp(420 + Math.abs(targetMonth - jump.fromMonth) * 30, 450, 650);
  }
  wakeAnimation();
}

function adjacentEvent(direction) {
  // Repeated presses advance from the destination rather than restarting the same jump.
  const month = jump ? targetMonth : displayedMonth;
  const day = jump ? targetDay : displayedDay;
  if (targetZoom > 0.45) {
    const position = calendarPosition(Math.round(month), Math.round(day), true);
    const candidates = navigationEvents.filter((item) => direction < 0
      ? calendarPosition(item.month, item.day, true) < position
      : calendarPosition(item.month, item.day, true) > position);
    return (direction < 0 ? candidates.at(-1) : candidates[0])?.event;
  }
  const candidates = navigationEvents.filter((item) => direction < 0
    ? item.month < Math.round(month) : item.month > Math.round(month));
  return (direction < 0 ? candidates.at(-1) : candidates[0])?.event;
}

function moveMonth(direction) {
  const month = Math.round(jump ? targetMonth : displayedMonth);
  const candidates = navigationStops.filter((item) => direction < 0 ? item.month < month : item.month > month);
  const next = direction < 0 ? candidates.at(-1) : candidates[0];
  if (!next) return;
  if (Math.abs(next.month - month) > 1) animateTo(next.month, next.day);
  else setMonth(next.month, next.day);
}

function moveToAdjacentEvent(direction) {
  const event = adjacentEvent(direction);
  if (event) focusEvent(event);
}

function pullDayBoundary(overflow, absolute = false) {
  if (reducedMotion.matches) return;
  const pull = -overflow * DAY_STEP * NAV.bounceResistance;
  edgeOffset = NAV.bounceMaxPx * Math.tanh((absolute ? pull : edgeOffset + pull) / NAV.bounceMaxPx);
  edgeVelocity = 0;
}

function moveDayFloat(amount, { absoluteBounce = false } = {}) {
  targetMonth = Math.round(targetMonth);
  const nextDay = targetDay + amount;
  targetDay = clamp(nextDay, 1, daysInMonth(targetMonth));
  const overflow = nextDay - targetDay;
  if (overflow || absoluteBounce) pullDayBoundary(overflow, absoluteBounce);
  return overflow;
}

function settleDayBounce(elapsed) {
  if (drag || pinch || reducedMotion.matches) return;
  const steps = Math.ceil(elapsed / 8);
  const dt = elapsed / steps / 1000;
  for (let step = 0; step < steps; step += 1) {
    edgeVelocity += (-NAV.bounceSpring * edgeOffset - NAV.bounceDamping * edgeVelocity) * dt;
    edgeOffset += edgeVelocity * dt;
  }
  if (Math.abs(edgeOffset) < 0.05 && Math.abs(edgeVelocity) < 0.5) {
    edgeOffset = 0;
    edgeVelocity = 0;
  }
}

function settle(now) {
  const elapsed = clamp(now - previousFrameTime || 16.667, 1, 48);
  const frameScale = elapsed / 16.667;
  previousFrameTime = now;
  const progress = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed / 95);

  if (jump) {
    const amount = clamp((now - jump.started) / jump.duration, 0, 1);
    const eased = easeTravel(amount);
    if (jump.kind === "month-sweep") {
      displayedMonth = jump.fromMonth;
      displayedDay = jump.fromDay + jump.travelDays * eased;
      while (displayedDay >= daysInMonth(displayedMonth) + 1 && displayedMonth < MONTH_COUNT) {
        displayedDay -= daysInMonth(displayedMonth);
        displayedMonth += 1;
      }
      while (displayedDay < 1 && displayedMonth > 0) {
        displayedMonth -= 1;
        displayedDay += daysInMonth(displayedMonth);
      }
      if (amount === 1) {
        displayedMonth = targetMonth;
        displayedDay = targetDay;
      }
    } else {
      displayedMonth = jump.fromMonth + (targetMonth - jump.fromMonth) * eased;
      displayedDay = jump.fromDay + (targetDay - jump.fromDay) * eased;
    }
    if (amount === 1) jump = null;
  } else if (browseScroll && !drag && !pinch) {
    if (Math.abs(velocity) > NAV.stopThreshold) {
      const decay = NAV.friction ** frameScale;
      browseScroll.position = clamp(browseScroll.position + velocity * (1 - decay) / (1 - NAV.friction), 0, navigationStops.length - 1);
      velocity *= decay;
      if (browseScroll.position === 0 || browseScroll.position === navigationStops.length - 1) velocity = 0;
      applyBrowseCursor(browseScroll.position);
    } else {
      velocity = 0;
      const destination = navigationStops[Math.round(browseScroll.position)];
      if (destination && (Math.abs(displayedMonth - destination.month) > 0.001
        || Math.abs(displayedDay - destination.day) > 0.001)) {
        animateTo(destination.month, destination.day);
      } else {
        applyBrowseCursor(browseScroll.position, true);
        browseScroll = null;
      }
    }
  } else if (!drag && !pinch) {
    if (Math.abs(velocity) > NAV.stopThreshold) {
      const decay = NAV.friction ** frameScale;
      const distance = velocity * (1 - decay) / (1 - NAV.friction);
      const dayMode = targetZoom > 0.45;
      const dayOverflow = dayMode ? moveDayFloat(distance) : 0;
      if (!dayMode) targetMonth = clamp(targetMonth + distance, 0, MONTH_COUNT);
      velocity *= decay;
      if (dayOverflow || (!dayMode && (targetMonth === 0 || targetMonth === MONTH_COUNT))) velocity = 0;
      displayedMonth = targetMonth;
      displayedDay = targetDay;
    } else {
      velocity = 0;
      targetMonth = Math.round(targetMonth);
      if (targetZoom > 0.45) moveDayFloat(Math.round(targetDay) - targetDay);
      targetDay = clamp(Math.round(targetDay), 1, daysInMonth(targetMonth));
      displayedMonth += (targetMonth - displayedMonth) * progress;
      displayedDay += (targetDay - displayedDay) * progress;
    }
  }
  settleDayBounce(elapsed);
  displayedZoom += (targetZoom - displayedZoom) * progress;
  const settled = !jump && !drag && !pinch && velocity === 0 && edgeOffset === 0 && edgeVelocity === 0
    && Math.abs(targetMonth - displayedMonth) < 0.001
    && Math.abs(targetDay - displayedDay) < 0.001
    && Math.abs(targetZoom - displayedZoom) < 0.001;
  if (settled) {
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    displayedZoom = targetZoom;
  }
  render({ settled });
  animationFrame = 0;
  if (!settled && !drag && !pinch) wakeAnimation(false);
}

function wakeAnimation(resetTime = true) {
  if (!animationFrame) {
    if (resetTime) previousFrameTime = performance.now();
    animationFrame = requestAnimationFrame(settle);
  }
}

function setMonth(next, day = targetDay) {
  stopMotion();
  resetScrollAcceleration();
  targetMonth = clamp(Math.round(next), 0, MONTH_COUNT);
  targetDay = clamp(Math.round(day), 1, daysInMonth(targetMonth));
  displayedMonth = targetMonth;
  displayedDay = targetDay;
  render({ settled: true });
}

function moveDay(amount) {
  stopMotion();
  resetScrollAcceleration();
  moveDayFloat(Math.round(amount));
  targetDay = clamp(Math.round(targetDay), 1, daysInMonth(targetMonth));
  displayedMonth = targetMonth;
  displayedDay = targetDay;
  render({ settled: edgeOffset === 0 });
  if (edgeOffset) wakeAnimation();
}

function setZoom(next) {
  const recorded = next <= 0.45 ? navigationStops[Math.round(browseCursorFor(displayedMonth))] : null;
  stopMotion();
  resetScrollAcceleration();
  targetMonth = recorded ? recorded.month : Math.round(targetMonth);
  targetDay = recorded ? recorded.day : clamp(Math.round(targetDay), 1, daysInMonth(targetMonth));
  targetZoom = clamp(next, 0, 1);
  if (reducedMotion.matches) {
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    displayedZoom = targetZoom;
    render({ settled: true });
  } else wakeAnimation();
}

function applyWheel(delta) {
  if (!delta) return;
  const previousVelocity = velocity;
  const previousDirection = scrollDirection;
  const continuous = performance.now() - lastScrollTime <= NAV.wheelIdleMs && previousDirection === Math.sign(delta);
  const cursor = browseScroll?.position ?? browseCursorFor(displayedMonth);
  stopMotion({ keepBounce: targetZoom > 0.45 });
  const amount = acceleratedScrollDelta(delta);
  if (targetZoom <= 0.45) {
    browseScroll = { position: cursor };
    if (reducedMotion.matches) {
      browseScroll.position = clamp(cursor + amount, 0, navigationStops.length - 1);
      applyBrowseCursor(browseScroll.position, true);
      render({ settled: true });
    } else {
      velocity = clamp((continuous ? previousVelocity : 0) + amount * NAV.wheelGain, -NAV.maxVelocity, NAV.maxVelocity);
      wakeAnimation();
    }
    return;
  }
  if (reducedMotion.matches) {
    if (targetZoom > 0.45) moveDayFloat(amount);
    else targetMonth = clamp(targetMonth + amount, 0, MONTH_COUNT);
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    render({ settled: true });
    return;
  }
  velocity = clamp((continuous ? previousVelocity : 0) + amount * NAV.wheelGain, -NAV.maxVelocity, NAV.maxVelocity);
  wakeAnimation();
}

function cacheRulerMetrics() {
  rulerWidth = ruler.getBoundingClientRect().width || WIDTH;
  viewportWidth = Math.min(WIDTH, rulerWidth);
  CENTER = viewportWidth / 2;
  ruler.setAttribute('viewBox', `0 58 ${viewportWidth} 176`);
}

ruler.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
  ruler.setPointerCapture(event.pointerId);
  stopMotion();
  resetScrollAcceleration();
  if (pointerPositions.size === 2) {
    const [a, b] = [...pointerPositions.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: targetZoom };
    drag = null;
    ruler.classList.remove('is-dragging');
    return;
  }
  if (pointerPositions.size > 1) return;
  ruler.focus({ preventScroll: true });
  drag = {
    pointerId: event.pointerId, startX: event.clientX,
    startMonth: displayedMonth, startDay: displayedDay,
    lastX: event.clientX, lastTime: performance.now(), lastVelocity: 0, moved: false,
  };
});

ruler.addEventListener('pointermove', (event) => {
  if (!pointerPositions.has(event.pointerId)) return;
  pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && pointerPositions.size >= 2) {
    const [a, b] = [...pointerPositions.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    setZoom(pinch.zoom + Math.log(Math.max(1, distance) / Math.max(1, pinch.distance)) / Math.log(2));
    render();
    return;
  }
  if (!drag || event.pointerId !== drag.pointerId) return;
  const deltaPixels = drag.startX - event.clientX;
  if (!drag.moved && Math.abs(deltaPixels) < NAV.dragThreshold) return;
  drag.moved = true;
  ruler.classList.add('is-dragging');
  const dayMode = targetZoom > 0.45;
  const step = dayMode ? DAY_STEP : MONTH_STEP;
  const delta = deltaPixels * (viewportWidth / rulerWidth) / step;
  targetMonth = drag.startMonth;
  targetDay = drag.startDay;
  if (dayMode) moveDayFloat(delta, { absoluteBounce: true });
  else targetMonth = clamp(drag.startMonth + delta, 0, MONTH_COUNT);
  displayedMonth = targetMonth;
  displayedDay = targetDay;
  const now = performance.now();
  const measured = (drag.lastX - event.clientX) * (viewportWidth / rulerWidth) / step * 16.667 / Math.max(8, now - drag.lastTime);
  drag.lastVelocity = clamp(drag.lastVelocity * 0.35 + measured * 0.65, -NAV.maxVelocity, NAV.maxVelocity);
  drag.lastX = event.clientX;
  drag.lastTime = now;
  render();
});

function endDrag(event) {
  pointerPositions.delete(event.pointerId);
  if (pinch) {
    if (pointerPositions.size === 0) pinch = null;
    suppressClickUntil = performance.now() + 250;
    wakeAnimation();
    return;
  }
  if (!drag || event.pointerId !== drag.pointerId) return;
  const wasDrag = drag.moved;
  const releasedDrag = drag;
  if (wasDrag) {
    suppressClickUntil = performance.now() + 250;
    velocity = !reducedMotion.matches && event.type !== 'pointercancel' && performance.now() - drag.lastTime < 100
      ? drag.lastVelocity : 0;
  }
  if (targetZoom > 0.45 && ((targetDay <= 1 && velocity < 0)
    || (targetDay >= daysInMonth(Math.round(targetMonth)) && velocity > 0))) velocity = 0;
  drag = null;
  ruler.classList.remove('is-dragging');
  if (wasDrag && targetZoom <= 0.45) {
    const cursor = browseCursorFor(displayedMonth);
    const startIndex = Math.round(browseCursorFor(releasedDrag.startMonth));
    const direction = Math.sign(releasedDrag.startX - releasedDrag.lastX);
    const physicalStep = MONTH_STEP * rulerWidth / viewportWidth;
    const next = navigationStops[startIndex + direction];
    // Only short collapsed gaps can turn a small swipe into a jump.
    if (next && Math.abs(next.month - navigationStops[startIndex].month) > 1
      && Math.round(cursor) === startIndex && event.type !== 'pointercancel'
      && Math.abs(releasedDrag.startX - releasedDrag.lastX) >= physicalStep) {
      animateTo(next.month, next.day);
      return;
    }
    const from = navigationStops[Math.floor(cursor)];
    const to = navigationStops[Math.min(Math.floor(cursor) + 1, navigationStops.length - 1)];
    velocity = clamp(velocity / Math.max(1, to.month - from.month), -NAV.maxVelocity, NAV.maxVelocity);
    if (Math.abs(velocity) <= NAV.stopThreshold) {
      const destination = navigationStops[Math.round(cursor)];
      animateTo(destination.month, destination.day);
      return;
    }
    browseScroll = { position: cursor };
  }
  wakeAnimation();
}

ruler.addEventListener('pointerup', endDrag);
ruler.addEventListener('pointercancel', endDrag);
ruler.addEventListener('lostpointercapture', endDrag);

window.addEventListener('wheel', (event) => {
  // The page is a fixed viewport: wheel input anywhere navigates the horizontal ruler.
  // Only the date picker keeps normal input behaviour while it is open.
  if (datePicker.open || event.target.closest('input, select, textarea, dialog')) return;
  event.preventDefault();
  if (drag || pinch) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportWidth : 1;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (event.ctrlKey) {
    const magnitude = Math.min(2, Math.max(0.5, Math.abs(delta * unit) / 120));
    setZoom(targetZoom + (delta < 0 ? 0.12 : -0.12) * magnitude);
  } else applyWheel(delta * unit / 120);
}, { passive: false });

const keyChanges = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || datePicker.open
    || event.target?.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return;
  if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    setZoom(targetZoom + 0.2);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    setZoom(targetZoom - 0.2);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    if (targetZoom > 0.45) {
      const month = Math.round(jump ? targetMonth : displayedMonth);
      animateTo(month, event.key === 'Home' ? 1 : daysInMonth(month));
    } else animateTo(event.key === 'Home' ? 0 : MONTH_COUNT, event.key === 'Home' ? 1 : daysInMonth(MONTH_COUNT));
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault();
    animateTo(Math.round(displayedMonth) + (event.key === 'PageUp' ? -120 : 120));
  } else if (Object.hasOwn(keyChanges, event.key)) {
    event.preventDefault();
    if (event.shiftKey) animateTo(Math.round(displayedMonth) + keyChanges[event.key] * 12);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') moveToAdjacentEvent(keyChanges[event.key]);
    else if (targetZoom > 0.45) moveDay(keyChanges[event.key]);
    else moveMonth(keyChanges[event.key]);
  }
});

previousEventButton.addEventListener('click', () => moveToAdjacentEvent(-1));
nextEventButton.addEventListener('click', () => moveToAdjacentEvent(1));
for (const neighbor of [previousEvent, nextEvent]) {
  neighbor.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      neighbor.click();
    }
  });
}
monthsViewButton.addEventListener('click', () => { if (targetZoom > 0.45) setZoom(0); });
daysViewButton.addEventListener('click', () => { if (targetZoom <= 0.45) setZoom(1); });
function moveToAdjacentMonth(direction) {
  if (targetZoom <= 0.45) return;
  const month = Math.round(jump ? targetMonth : displayedMonth);
  const next = clamp(month + direction, 0, MONTH_COUNT);
  if (next === month) return;
  const day = Math.round(jump ? targetDay : displayedDay);
  animateTo(next, clamp(day, 1, daysInMonth(next)), { monthSweep: true });
}
previousMonthButton.addEventListener('click', () => moveToAdjacentMonth(-1));
nextMonthButton.addEventListener('click', () => moveToAdjacentMonth(1));

MONTHS.forEach((name, index) => {
  const option = document.createElement('option');
  option.value = String(index + 1);
  option.textContent = name;
  datePickerMonth.append(option);
});
datePickerYear.min = String(START_YEAR);
datePickerYear.max = String(END_YEAR);
document.querySelector('#date-picker-range').textContent = `Explore ${START_YEAR}–${END_YEAR}`;

dateReadout.addEventListener('click', () => {
  const recorded = targetZoom <= 0.45 ? navigationStops[Math.round(browseCursorFor(displayedMonth))] : null;
  stopMotion();
  resetScrollAcceleration();
  targetMonth = recorded ? recorded.month : Math.round(displayedMonth);
  targetDay = recorded ? recorded.day : clamp(Math.round(displayedDay), 1, daysInMonth(targetMonth));
  displayedMonth = targetMonth;
  displayedDay = targetDay;
  render({ settled: true });
  const date = dateForMonth(targetMonth);
  datePickerYear.value = String(date.year);
  datePickerMonth.value = String(date.month + 1);
  datePickerMessage.textContent = '';
  datePickerYear.removeAttribute('aria-invalid');
  datePicker.showModal();
  datePickerYear.focus();
  datePickerYear.select();
});

datePickerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const rawYear = datePickerYear.value.trim();
  const parsedYear = Number(rawYear);
  const year = clamp(rawYear && Number.isFinite(parsedYear) ? Math.round(parsedYear) : START_YEAR, START_YEAR, END_YEAR);
  const month = clamp(Number(datePickerMonth.value) || 1, 1, 12);
  const invalid = !rawYear || !Number.isFinite(parsedYear) || parsedYear !== year;
  datePickerYear.value = String(year);
  if (invalid) {
    datePickerMessage.textContent = `Use a year from ${START_YEAR} to ${END_YEAR}. Adjusted to ${year}; press Go to date to continue.`;
    datePickerYear.setAttribute('aria-invalid', 'true');
    datePickerYear.focus();
    return;
  }
  datePicker.close();
  animateTo((year - START_YEAR) * 12 + month - 1, 1);
});

document.querySelector('#date-picker-cancel').addEventListener('click', () => datePicker.close());
document.querySelector('#today-button').addEventListener('click', () => {
  datePicker.close();
  const latest = latestRecordedEvent();
  animateTo(latest ? latest.month : INITIAL_MONTH, latest ? latest.day : INITIAL_DAY);
});
datePicker.addEventListener('close', () => dateReadout.focus({ preventScroll: true }));
datePicker.addEventListener('click', (event) => {
  if (event.target !== datePicker) return;
  const rect = datePicker.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) datePicker.close();
});

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    velocity = 0;
    edgeOffset = 0;
    edgeVelocity = 0;
    jump = null;
    browseScroll = null;
    const recorded = targetZoom <= 0.45 ? navigationStops[Math.round(browseCursorFor(targetMonth))] : null;
    targetMonth = recorded ? recorded.month : Math.round(targetMonth);
    targetDay = recorded ? recorded.day : clamp(Math.round(targetDay), 1, daysInMonth(targetMonth));
    displayedMonth = targetMonth;
    displayedDay = targetDay;
    displayedZoom = targetZoom;
    render({ settled: true });
  }
});
window.addEventListener('resize', () => {
  cacheRulerMetrics();
  render();
});
cacheRulerMetrics();
buildEventTrack();
buildMonthTrack();
buildLandmarks();
const openingEvent = latestRecordedEvent();
if (openingEvent) {
  targetMonth = displayedMonth = openingEvent.month;
  targetDay = displayedDay = openingEvent.day;
}
render({ settled: true });
