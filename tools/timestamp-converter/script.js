// Timestamp Converter — Unix epoch, ISO 8601 and human time, both directions.
//
// A timestamp is an instant, not a duration, so nothing here scales by a
// factor: every conversion goes through a single millisecond value and is
// rendered with Intl so time zones and DST are the platform's problem.

const tsInput = document.getElementById("ts-input");
const datePicker = document.getElementById("date-picker");
const pickerNote = document.getElementById("picker-note");
const detected = document.getElementById("detected");
const errorNode = document.getElementById("error");
const resultsNode = document.getElementById("results");
const liveClock = document.getElementById("live-clock");
const tzDropdown = document.getElementById("tz-dropdown");
const tzMenu = document.getElementById("tz-menu");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

// Date's own range. Anything outside is not representable, and toISOString
// throws rather than returning a sentinel.
const MAX_TIME = 8.64e15;

const state = {
  ms: null,          // the instant, in epoch milliseconds
  zone: "UTC",
  source: "",        // which field last set `ms`, to avoid echoing back into it
};

/* --- Parsing ------------------------------------------------------------ */

// Digit count is the only reliable signal for which unit a bare number is in:
// seconds hit 10 digits in 2001 and stay there until 2286.
// Sub-millisecond units divide rather than multiply by a fraction: 1/1000 is
// not exact in binary, so `n * 0.001` can land a hair under the true value and
// floor to the previous millisecond (or leave a fractional "Unix milliseconds").
function unitForDigits(digits) {
  if (digits <= 11) return { unit: "seconds", toMs: (n) => n * 1000n };
  if (digits <= 14) return { unit: "milliseconds", toMs: (n) => n };
  if (digits <= 17) return { unit: "microseconds", toMs: (n) => floorDivide(n, 1000n) };
  return { unit: "nanoseconds", toMs: (n) => floorDivide(n, 1000000n) };
}

// BigInt division truncates toward zero; timestamps use the preceding
// millisecond, including for negative instants with a fractional remainder.
function floorDivide(value, divisor) {
  return value / divisor - (value < 0n && value % divisor !== 0n ? 1n : 0n);
}

function parseInput(raw) {
  const text = raw.trim();
  if (!text) return { ok: false, empty: true };

  // A bare (optionally signed) integer is an epoch value.
  if (/^-?\d+$/.test(text)) {
    const digits = text.replace("-", "").length;
    const { unit, toMs } = unitForDigits(digits);
    // Reduce to milliseconds before converting to Number: nanoseconds exceed
    // its exact-integer range and can otherwise round into the next instant.
    const ms = Number(toMs(BigInt(text)));
    if (!Number.isFinite(ms)) return { ok: false, error: "Number is too large to be a timestamp." };
    if (Math.abs(ms) > MAX_TIME) {
      return { ok: false, error: `Out of range: ${unit} value is beyond the maximum representable date.` };
    }
    return { ok: true, ms, label: `Unix ${unit}` };
  }

  // Decimal epoch seconds, e.g. 1789689600.123
  if (/^-?\d+\.\d+$/.test(text)) {
    // Date holds whole milliseconds; `1789689600.123 * 1000` is
    // 1789689600123.0002 in floating point, which leaked into the output.
    const ms = Math.round(Number(text) * 1000);
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME) return { ok: false, error: "Out of range for a date." };
    return { ok: true, ms, label: "Unix seconds (fractional)" };
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "Not a timestamp or a date this browser can parse." };
  }
  const isoish = /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(text);
  return { ok: true, ms: parsed, label: isoish ? "ISO 8601" : "Date string" };
}

/* --- Formatting --------------------------------------------------------- */

function partsIn(ms, zone) {
  // formatToParts gives the wall-clock reading in `zone` without string parsing.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  // Intl renders midnight as 24 in some locales/zones.
  if (out.hour === "24") out.hour = "00";
  return out;
}

function offsetLabel(ms, zone) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
  const part = fmt.formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName");
  return part ? part.value.replace("GMT", "UTC") : "";
}

function zonedIso(ms, zone) {
  const p = partsIn(ms, zone);
  const offset = offsetLabel(ms, zone).replace("UTC", "") || "+00:00";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset === "" ? "Z" : offset}`;
}

function humanIn(ms, zone) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone, dateStyle: "full", timeStyle: "long",
  }).format(new Date(ms));
}

const RELATIVE_STEPS = [
  ["year", 31536000000], ["month", 2592000000], ["week", 604800000],
  ["day", 86400000], ["hour", 3600000], ["minute", 60000], ["second", 1000],
];

function relative(ms) {
  const diff = ms - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, step] of RELATIVE_STEPS) {
    if (Math.abs(diff) >= step) return rtf.format(Math.round(diff / step), unit);
  }
  return rtf.format(0, "second");
}

// ISO-8601 week number: week 1 is the one containing the first Thursday.
function isoWeek(ms, zone) {
  const p = partsIn(ms, zone);
  const date = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function dayOfYear(ms, zone) {
  const p = partsIn(ms, zone);
  const start = Date.UTC(+p.year, 0, 1);
  const here = Date.UTC(+p.year, +p.month - 1, +p.day);
  return String(Math.round((here - start) / 86400000) + 1);
}

/* --- Zone handling ------------------------------------------------------ */

// Engines still report several zones under their pre-rename IANA ids, so a
// user looking for "Kolkata" or "Kyiv" would not find them. Intl accepts the
// modern spelling as input, so display and use that instead.
const ZONE_RENAMES = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Thimbu": "Asia/Thimphu",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Ponape": "Pacific/Pohnpei",
};

const canonical = (zone) => ZONE_RENAMES[zone] || zone;

const LOCAL_ZONE = canonical(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

function zoneList() {
  let all = [];
  try {
    all = Intl.supportedValuesOf("timeZone").map(canonical);
  } catch {
    // Older engines: offer the two that always work.
    all = [];
  }
  return [...new Set(["UTC", LOCAL_ZONE, ...all])];
}

// Convert a wall-clock reading in `zone` back to an instant. The offset itself
// depends on the instant, so resolve once and correct.
function zonedToMs(year, month, day, hour, minute, second, zone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const p = partsIn(guess, zone);
  const asRead = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return guess - (asRead - guess);
}

/* --- Rendering ---------------------------------------------------------- */

function row(label, value, { mono = true } = {}) {
  const item = document.createElement("div");
  item.className = "result-row";

  const name = document.createElement("span");
  name.className = "result-label";
  name.textContent = label;

  const val = document.createElement("span");
  val.className = mono ? "result-value mono" : "result-value";
  val.textContent = value;

  const copy = document.createElement("button");
  copy.className = "action-btn result-copy";
  copy.type = "button";
  copy.setAttribute("aria-label", `Copy ${label}`);
  copy.dataset.tooltip = "Copy";
  copy.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
  copy.addEventListener("click", () => {
    window.DevToolsMain.copyText(value);
    window.DevToolsMain.showToast(`${label} copied`, "success");
  });

  item.append(name, val, copy);
  return item;
}

function conversions(ms, zone) {
  const rows = [
    ["Unix seconds", String(Math.floor(ms / 1000))],
    ["Unix milliseconds", String(ms)],
    ["ISO 8601 (UTC)", new Date(ms).toISOString()],
  ];

  // Only worth a row when it says something the UTC row does not.
  if (zone !== "UTC") rows.push([`ISO 8601 (${zone})`, zonedIso(ms, zone)]);

  rows.push(["RFC 1123 (UTC)", new Date(ms).toUTCString()]);
  rows.push([`Local (${LOCAL_ZONE})`, humanIn(ms, LOCAL_ZONE)]);
  if (zone !== LOCAL_ZONE) rows.push([`In ${zone}`, humanIn(ms, zone)]);

  rows.push(
    ["Relative", relative(ms)],
    [`UTC offset (${zone})`, offsetLabel(ms, zone) || "UTC+00:00"],
    ["ISO week", isoWeek(ms, zone)],
    ["Day of year", dayOfYear(ms, zone)],
  );
  return rows;
}

function showError(message) {
  errorNode.textContent = message;
  errorNode.hidden = !message;
}

function render() {
  if (state.ms === null) {
    resultsNode.innerHTML = '<p class="empty-state">Enter a timestamp or a date to see every conversion.</p>';
    return;
  }
  resultsNode.innerHTML = "";
  for (const [label, value] of conversions(state.ms, state.zone)) {
    resultsNode.appendChild(row(label, value));
  }
}

function syncPicker() {
  if (state.ms === null || state.source === "picker") return;
  const p = partsIn(state.ms, state.zone);
  datePicker.value = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function setInstant(ms, { label = "", source = "" } = {}) {
  state.ms = ms;
  state.source = source;
  detected.textContent = label ? `Detected: ${label}` : "";
  detected.classList.toggle("is-set", Boolean(label));
  showError("");
  render();
  syncPicker();
}

function readInput() {
  const result = parseInput(tsInput.value);
  if (result.empty) {
    state.ms = null;
    state.source = "";
    detected.textContent = "Waiting for input";
    detected.classList.remove("is-set");
    showError("");
    render();
    return;
  }
  if (!result.ok) {
    state.ms = null;
    detected.textContent = "Unrecognised";
    detected.classList.remove("is-set");
    showError(result.error);
    render();
    return;
  }
  setInstant(result.ms, { label: result.label, source: "input" });
}

function writeInput(ms) {
  tsInput.value = String(Math.floor(ms / 1000));
}

/* --- Wiring ------------------------------------------------------------- */

function buildZoneMenu() {
  const zones = zoneList();
  tzMenu.innerHTML = "";

  // 400+ entries need a filter to be navigable at all.
  const search = document.createElement("input");
  search.type = "search";
  search.className = "tz-search";
  search.placeholder = "Filter zones…";
  search.setAttribute("aria-label", "Filter time zones");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    tzMenu.querySelectorAll(".dd__option").forEach((option) => {
      option.hidden = q ? !option.dataset.value.toLowerCase().includes(q) : false;
    });
  });
  // Typing must reach the field, but navigation keys belong to the menu.
  const MENU_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"];
  search.addEventListener("keydown", (event) => {
    if (!MENU_KEYS.includes(event.key)) event.stopPropagation();
  });
  tzMenu.appendChild(search);

  for (const zone of zones) {
    const option = document.createElement("button");
    option.className = "dd__option";
    option.type = "button";
    option.setAttribute("role", "option");
    option.dataset.value = zone;
    option.textContent = zone === LOCAL_ZONE && zone !== "UTC" ? `${zone} (local)` : zone;
    if (zone === state.zone) {
      option.classList.add("is-active");
      option.setAttribute("aria-selected", "true");
    }
    tzMenu.appendChild(option);
  }
  // The menu is built after main.js ran, so register it explicitly.
  window.DevToolsMain.initDropdowns(tzDropdown);
}

tsInput.addEventListener("input", readInput);

datePicker.addEventListener("input", () => {
  if (!datePicker.value) return;
  const [date, time = "00:00:00"] = datePicker.value.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s = 0] = time.split(":").map(Number);
  const ms = zonedToMs(y, mo, d, h, mi, s, state.zone);
  writeInput(ms);
  setInstant(ms, { label: `Picked in ${state.zone}`, source: "picker" });
});

tzDropdown.addEventListener("click", () => {
  // openDropdown focuses the selected option; hand focus to the filter so the
  // user can just start typing.
  if (!tzDropdown.classList.contains("is-open")) return;
  const search = tzMenu.querySelector(".tz-search");
  requestAnimationFrame(() => search?.focus());
});

tzDropdown.addEventListener("dd:change", (event) => {
  state.zone = event.detail.value;
  pickerNote.textContent = `Interpreted in ${state.zone}.`;
  state.source = "";
  render();
  syncPicker();
});

document.querySelectorAll("[data-action]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const action = btn.dataset.action;

    if (action === "now") {
      const ms = Date.now();
      writeInput(ms);
      setInstant(ms, { label: "Current time", source: "now" });
      window.DevToolsMain.showToast("Set to the current time", "success");
    }

    if (action === "clear") {
      tsInput.value = "";
      datePicker.value = "";
      readInput();
      window.DevToolsMain.showToast("Cleared", "info");
    }

    if (action === "paste") {
      try {
        tsInput.value = (await navigator.clipboard.readText()).trim();
        readInput();
      } catch {
        tsInput.focus();
        window.DevToolsMain.showToast("Clipboard is not available", "error");
      }
    }

    if (action === "copy-all") {
      if (state.ms === null) {
        window.DevToolsMain.showToast("Nothing to copy", "error");
        return;
      }
      const text = conversions(state.ms, state.zone)
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n");
      window.DevToolsMain.copyText(text);
      window.DevToolsMain.showToast("All conversions copied", "success");
    }
  });
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function tickClock() {
  liveClock.textContent = String(Math.floor(Date.now() / 1000));
}

function init() {
  buildZoneMenu();
  pickerNote.textContent = `Interpreted in ${state.zone}.`;
  render();
  tickClock();
  window.setInterval(tickClock, 1000);
}

init();
