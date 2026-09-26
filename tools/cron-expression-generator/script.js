// Cron Expression Generator — parse, explain and schedule a crontab line.
//
// Cron is a wall-clock schedule, not an instant: "0 3 * * *" means 3am local
// time every day, including the day a DST shift makes that day 23 hours long.
// So everything below works in the selected zone's calendar fields and only
// converts to an epoch value at the last step, where a round-trip through Intl
// also tells us whether the wall-clock time exists at all.

const cronInput = document.getElementById("cron-input");
const fieldGrid = document.getElementById("field-grid");
const detected = document.getElementById("detected");
const errorNode = document.getElementById("error");
const summaryNode = document.getElementById("summary");
const breakdownNode = document.getElementById("breakdown");
const runsNode = document.getElementById("runs");
const liveClock = document.getElementById("live-clock");
const tzDropdown = document.getElementById("tz-dropdown");
const tzMenu = document.getElementById("tz-menu");
const presetDropdown = document.getElementById("preset-dropdown");
const presetMenu = document.getElementById("preset-menu");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const RUN_COUNT = 10;
// Five years of days. A schedule rarer than that (29 February on a Monday)
// is better reported as "no runs found" than hunted for indefinitely.
const SEARCH_DAYS = 366 * 5;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTH_ALIASES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_ALIASES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const MINUTE_DEF = { key: "minute", label: "Minute", min: 0, max: 59 };
const HOUR_DEF = { key: "hour", label: "Hour", min: 0, max: 23 };
const DOM_DEF = { key: "dom", label: "Day of month", min: 1, max: 31, blank: true };
const MONTH_DEF = { key: "month", label: "Month", min: 1, max: 12, aliases: MONTH_ALIASES, aliasOffset: 1, names: MONTH_NAMES };
const DOW_DEF = { key: "dow", label: "Day of week", min: 0, max: 6, aliases: DAY_ALIASES, aliasOffset: 0, wrap: 7, blank: true, names: DAY_NAMES };
const SECOND_DEF = { key: "second", label: "Second", min: 0, max: 59 };

const FIVE_FIELDS = [MINUTE_DEF, HOUR_DEF, DOM_DEF, MONTH_DEF, DOW_DEF];
const SIX_FIELDS = [SECOND_DEF, ...FIVE_FIELDS];

const MACROS = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const PRESETS = [
  ["Every minute", "* * * * *"],
  ["Every 5 minutes", "*/5 * * * *"],
  ["Every 15 minutes", "*/15 * * * *"],
  ["Every hour, on the hour", "0 * * * *"],
  ["Every day at midnight", "0 0 * * *"],
  ["Every day at 09:30", "30 9 * * *"],
  ["Weekdays at 09:00", "0 9 * * MON-FRI"],
  ["Weekdays every 30 min, 09:00–17:00", "*/30 9-17 * * MON-FRI"],
  ["Every Monday at 08:00", "0 8 * * MON"],
  ["Every Sunday at 03:00", "0 3 * * SUN"],
  ["First of the month at midnight", "0 0 1 * *"],
  ["Last-ish: 28th of the month at 23:00", "0 23 28 * *"],
  ["Quarterly, first day at 06:00", "0 6 1 1,4,7,10 *"],
  ["Every new year", "0 0 1 1 *"],
  ["Every 30 seconds", "*/30 * * * * *"],
];

const state = {
  zone: "UTC",
  spec: null,      // last successful parse
  source: "",      // which control last wrote the expression
  nextRunMs: null, // first listed run, so the list can roll forward past it
};

/* --- Parsing ------------------------------------------------------------ */

// Quartz accepts these; Vixie cron, which is what a crontab actually runs,
// does not. Saying so beats "unknown value". Matched per term and only after
// the term has failed to parse, so month and weekday names that happen to
// contain L or W — JUL, WED — are not caught by it.
const QUARTZ_TERM = /^(L|LW|L-\d+|\d+L|\d+W|\d+#\d+)$/i;

function parseTerm(term, def) {
  const fail = (message) => ({ ok: false, error: message });

  if (term === "*" || (def.blank && term === "?")) {
    return { ok: true, values: range(def.min, def.max), wildcard: true };
  }

  let step = 1;
  let body = term;
  const slash = term.indexOf("/");
  if (slash !== -1) {
    body = term.slice(0, slash);
    const stepText = term.slice(slash + 1);
    if (!/^\d+$/.test(stepText) || Number(stepText) === 0) {
      return fail(`${def.label}: step in "${term}" must be a positive whole number.`);
    }
    step = Number(stepText);
    if (body === "") return fail(`${def.label}: "${term}" is missing a value before the step.`);
  }

  let start;
  let end;
  if (body === "*" || (def.blank && body === "?")) {
    start = def.min;
    end = def.max;
  } else {
    const dash = body.indexOf("-", 1);
    if (dash !== -1) {
      const low = readValue(body.slice(0, dash), def);
      // As a range end, 7 is Sunday *after* Saturday: `0-7` and `1-7` mean the
      // whole week, not Sunday alone / a wrap back to Sunday.
      const high = readValue(body.slice(dash + 1), def, { rangeEnd: true });
      if (low === null) return fail(unknownValue(body.slice(0, dash), def));
      if (high === null) return fail(unknownValue(body.slice(dash + 1), def));
      start = low;
      end = high;
      // Cron allows a wrapping range such as FRI-MON or 22-2.
      if (start > end) {
        const values = [...range(start, def.max), ...range(def.min, end)]
          .filter((_, index) => index % step === 0);
        return { ok: true, values, wildcard: false };
      }
    } else {
      const single = readValue(body, def);
      if (single === null) return fail(unknownValue(body, def));
      start = single;
      // "5/10" means "from 5 to the end of the field, in tens".
      end = slash === -1 ? single : def.max;
    }
  }

  const values = [];
  for (let value = start; value <= end; value += step) {
    values.push(def.wrap !== undefined && value === def.wrap ? def.min : value);
  }
  return { ok: true, values, wildcard: false };
}

function unknownValue(text, def) {
  const named = def.aliases ? ` or ${def.aliases[0]}-${def.aliases.at(-1)}` : "";
  return `${def.label}: "${text}" is not a value in ${def.min}-${def.max}${named}.`;
}

function readValue(text, def, { rangeEnd = false } = {}) {
  const token = text.trim();
  if (token === "") return null;
  if (/^\d+$/.test(token)) {
    let value = Number(token);
    // Sunday is both 0 and 7.
    if (def.wrap !== undefined && value === def.wrap) {
      if (rangeEnd) return value;
      value = def.min;
    }
    return value >= def.min && value <= def.max ? value : null;
  }
  if (!def.aliases) return null;
  // Three-letter names, or the full English name. Only the first three
  // letters used to be read, so "MONKEY" parsed as Monday.
  const upper = token.toUpperCase();
  let index = def.aliases.indexOf(upper);
  if (index === -1 && def.names) index = def.names.findIndex((name) => name.toUpperCase() === upper);
  return index === -1 ? null : index + def.aliasOffset;
}

function parseField(text, def) {
  const terms = text.split(",");
  const values = new Set();
  for (const term of terms) {
    const parsed = parseTerm(term.trim(), def);
    if (!parsed.ok) {
      if (QUARTZ_TERM.test(term.trim())) {
        return { ok: false, error: `${def.label}: L, W and # are Quartz extensions that standard cron does not support.` };
      }
      return parsed;
    }
    parsed.values.forEach((value) => values.add(value));
  }
  if (values.size === 0) return { ok: false, error: `${def.label}: "${text}" matches nothing.` };

  const stepOnly = /^\*\/(\d+)$/.exec(text.trim());
  return {
    ok: true,
    field: {
      def,
      text: text.trim(),
      values: [...values].sort((a, b) => a - b),
      wildcard: terms.length === 1 && parseTerm(terms[0].trim(), def).wildcard,
      step: stepOnly ? Number(stepOnly[1]) : null,
    },
  };
}

function parseCron(raw) {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { ok: false, empty: true };

  if (text.startsWith("@")) {
    const macro = text.toLowerCase();
    if (macro === "@reboot") {
      return { ok: true, reboot: true, macro, kind: "Macro @reboot", parts: [], fields: {} };
    }
    const expansion = MACROS[macro];
    if (!expansion) {
      return { ok: false, error: `Unknown macro "${text}". Try @yearly, @monthly, @weekly, @daily, @hourly or @reboot.` };
    }
    const expanded = parseCron(expansion);
    if (!expanded.ok) return expanded;
    return { ...expanded, macro, kind: `Macro ${macro} → ${expansion}` };
  }

  const parts = text.split(" ");
  if (parts.length !== 5 && parts.length !== 6) {
    return {
      ok: false,
      error: `Expected 5 fields (or 6 with seconds), found ${parts.length}.`,
    };
  }

  const defs = parts.length === 6 ? SIX_FIELDS : FIVE_FIELDS;
  const fields = {};
  for (let index = 0; index < defs.length; index += 1) {
    const parsed = parseField(parts[index], defs[index]);
    if (!parsed.ok) return { ok: false, error: parsed.error, fieldKey: defs[index].key };
    fields[defs[index].key] = parsed.field;
  }

  return {
    ok: true,
    parts,
    defs,
    fields,
    hasSeconds: parts.length === 6,
    kind: parts.length === 6 ? "6-field cron (with seconds)" : "Standard 5-field cron",
  };
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/* --- Zone handling ------------------------------------------------------ */

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
    all = [];
  }
  return [...new Set(["UTC", LOCAL_ZONE, ...all])];
}

// Building a DateTimeFormat is far costlier than using one, and the scheduler
// calls this several times per candidate run, so keep one per zone.
const formatters = new Map();
function formatterFor(zone) {
  let fmt = formatters.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatters.set(zone, fmt);
  }
  return fmt;
}

function partsIn(ms, zone) {
  const fmt = formatterFor(zone);
  const out = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}

// A wall-clock reading back to an instant. The offset depends on the instant,
// so correct twice and then verify: a reading inside a spring-forward gap does
// not exist and never round-trips, which is exactly how cron skips it.
function zonedToMs(y, mo, d, h, mi, s, zone) {
  let ms = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let pass = 0; pass < 2; pass += 1) {
    const p = partsIn(ms, zone);
    const asRead = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const drift = asRead - Date.UTC(y, mo - 1, d, h, mi, s);
    if (drift === 0) return ms;
    ms -= drift;
  }
  const check = partsIn(ms, zone);
  const matches = check.year === y && check.month === mo && check.day === d
    && check.hour === h && check.minute === mi && check.second === s;
  return matches ? ms : null;
}

/* --- Scheduling --------------------------------------------------------- */

function dayMatches(spec, year, month, day) {
  if (!spec.fields.month.values.includes(month)) return false;

  const dom = spec.fields.dom;
  const dow = spec.fields.dow;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const domHit = dom.values.includes(day);
  const dowHit = dow.values.includes(weekday);

  // Vixie cron: when both are restricted the day matches either one.
  if (!dom.wildcard && !dow.wildcard) return domHit || dowHit;
  if (!dom.wildcard) return domHit;
  if (!dow.wildcard) return dowHit;
  return true;
}

function nextRuns(spec, zone, fromMs, count = RUN_COUNT) {
  const runs = [];
  const start = partsIn(fromMs, zone);
  const seconds = spec.hasSeconds ? spec.fields.second.values : [0];

  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  const startWall = start.hour * 3600 + start.minute * 60 + start.second;

  for (let dayIndex = 0; dayIndex < SEARCH_DAYS && runs.length < count; dayIndex += 1) {
    const at = new Date(cursor + dayIndex * 86400000);
    const year = at.getUTCFullYear();
    const month = at.getUTCMonth() + 1;
    const day = at.getUTCDate();
    if (!dayMatches(spec, year, month, day)) continue;

    for (const hour of spec.fields.hour.values) {
      for (const minute of spec.fields.minute.values) {
        for (const second of seconds) {
          if (dayIndex === 0 && hour * 3600 + minute * 60 + second <= startWall) continue;
          const ms = zonedToMs(year, month, day, hour, minute, second, zone);
          if (ms === null) continue;  // inside a DST gap; the job does not run
          runs.push({ ms, wall: { year, month, day, hour, minute, second } });
          if (runs.length >= count) return runs;
        }
      }
    }
  }
  return runs;
}

/* --- Describing --------------------------------------------------------- */

const pad = (value) => String(value).padStart(2, "0");

function joinList(items, conjunction = "and") {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th"
    : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
}

// Contiguous runs read far better than a list: "Monday through Friday" beats
// "Monday, Tuesday, Wednesday, Thursday and Friday".
function isRun(values) {
  return values.length > 2 && values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

// Month values are 1-based, weekday values 0-based, so the lookup takes the
// field's own minimum as the offset rather than assuming either.
const nameOf = (field, names, value) => names[value - field.def.min];

function namedList(field, names) {
  const labels = field.values.map((value) => nameOf(field, names, value));
  if (isRun(field.values)) return `${labels[0]} through ${labels.at(-1)}`;
  return joinList(labels);
}

function timeClause(spec) {
  const minute = spec.fields.minute;
  const hour = spec.fields.hour;

  if (minute.wildcard && hour.wildcard) return "Every minute";
  if (minute.step && hour.wildcard) return `Every ${minute.step} minutes`;
  if (minute.values.length === 1 && hour.wildcard) {
    return `Every hour at minute ${pad(minute.values[0])}`;
  }

  const hours = hourClause(hour);
  if (minute.wildcard) return `Every minute ${hours}`;
  if (minute.step) return `Every ${minute.step} minutes ${hours}`;

  const combos = hour.values.length * minute.values.length;
  if (combos <= 6) {
    const times = [];
    for (const h of hour.values) for (const m of minute.values) times.push(`${pad(h)}:${pad(m)}`);
    times.sort();
    return `At ${joinList(times)}`;
  }
  return `At ${joinList(minute.values.map(pad))} minutes past ${hours}`;
}

function hourClause(hour) {
  if (hour.wildcard) return "every hour";
  if (hour.step) return `every ${hour.step} hours`;
  if (hour.values.length === 1) return `${pad(hour.values[0])}:00`;
  if (isRun(hour.values)) return `between ${pad(hour.values[0])}:00 and ${pad(hour.values.at(-1))}:59`;
  return `hours ${joinList(hour.values.map(pad))}`;
}

function secondClause(spec) {
  if (!spec.hasSeconds) return "";
  const second = spec.fields.second;
  if (second.wildcard) return "every second";
  if (second.step) return `every ${second.step} seconds`;
  if (second.values.length === 1 && second.values[0] === 0) return "";
  return `at ${joinList(second.values.map((value) => `second ${value}`))}`;
}

function describe(spec) {
  if (spec.reboot) return "Once at every boot. There is no recurring schedule.";

  const clauses = [timeClause(spec)];

  const seconds = secondClause(spec);
  if (seconds) clauses.push(seconds);

  const dom = spec.fields.dom;
  const dow = spec.fields.dow;

  if (!dom.wildcard) {
    clauses.push(dom.step
      ? `on every ${ordinal(dom.step)} day of the month`
      : `on the ${joinList(dom.values.map(ordinal))} of the month`);
  }
  if (!dow.wildcard) {
    clauses.push(`on ${namedList(dow, DAY_NAMES)}`);
  }
  if (!dom.wildcard && !dow.wildcard) {
    clauses.push("(either match is enough — cron ORs the two day fields)");
  }

  const month = spec.fields.month;
  if (!month.wildcard) clauses.push(`in ${namedList(month, MONTH_NAMES)}`);

  return `${clauses.join(", ")}.`;
}

/* --- Rendering ---------------------------------------------------------- */

function summariseValues(field) {
  if (field.wildcard) return "every value";
  const names = field.def.key === "dow" ? DAY_NAMES : field.def.key === "month" ? MONTH_NAMES : null;
  const shown = field.values.slice(0, 12).map((value) => (
    names ? nameOf(field, names, value).slice(0, 3) : String(value)
  ));
  const extra = field.values.length - shown.length;
  return extra > 0 ? `${shown.join(", ")} … (+${extra})` : shown.join(", ");
}

function breakdownRow(field) {
  const row = document.createElement("div");
  row.className = "result-row";

  const name = document.createElement("span");
  name.className = "result-label";
  name.textContent = field.def.label;

  const source = document.createElement("code");
  source.className = "field-source";
  source.textContent = field.text;

  const value = document.createElement("span");
  value.className = "result-value";
  value.textContent = summariseValues(field);

  row.append(name, source, value);
  return row;
}

function runRow(run, index) {
  const row = document.createElement("div");
  row.className = "result-row run-row";
  row.dataset.ms = String(run.ms);

  const position = document.createElement("span");
  position.className = "run-index";
  position.textContent = String(index + 1);

  const when = document.createElement("span");
  when.className = "result-value mono";
  when.textContent = runText(run);

  const relative = document.createElement("span");
  relative.className = "run-relative";
  relative.textContent = relativeTo(run.ms);

  const copy = document.createElement("button");
  copy.className = "action-btn result-copy";
  copy.type = "button";
  copy.dataset.tooltip = "Copy";
  copy.setAttribute("aria-label", `Copy run ${index + 1}`);
  copy.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
  copy.addEventListener("click", () => {
    window.DevToolsMain.copyText(runText(run));
    window.DevToolsMain.showToast("Run time copied", "success");
  });

  row.append(position, when, relative, copy);
  return row;
}

function runText(run) {
  const w = run.wall;
  return `${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)} ${DAY_NAMES[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()].slice(0, 3)}`;
}

const RELATIVE_STEPS = [
  ["year", 31536000000], ["month", 2592000000], ["week", 604800000],
  ["day", 86400000], ["hour", 3600000], ["minute", 60000], ["second", 1000],
];

function relativeTo(ms) {
  const diff = ms - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, step] of RELATIVE_STEPS) {
    if (Math.abs(diff) >= step) return rtf.format(Math.round(diff / step), unit);
  }
  return rtf.format(0, "second");
}

function showError(message, fieldKey = "") {
  errorNode.textContent = message;
  errorNode.hidden = !message;
  fieldGrid.querySelectorAll(".field-cell").forEach((cell) => {
    cell.classList.toggle("is-invalid", Boolean(fieldKey) && cell.dataset.key === fieldKey);
  });
}

function renderEmpty(message) {
  state.nextRunMs = null;
  summaryNode.textContent = message;
  summaryNode.classList.remove("is-set");
  breakdownNode.innerHTML = "";
  runsNode.innerHTML = '<p class="empty-state">Next runs appear once the expression parses.</p>';
}

function render() {
  const spec = state.spec;
  if (!spec) return;

  summaryNode.textContent = describe(spec);
  summaryNode.classList.add("is-set");

  breakdownNode.innerHTML = "";
  runsNode.innerHTML = "";

  if (spec.reboot) {
    runsNode.innerHTML = '<p class="empty-state">@reboot has no clock schedule — it fires once when the machine starts.</p>';
    return;
  }

  for (const def of spec.defs) breakdownNode.appendChild(breakdownRow(spec.fields[def.key]));

  const runs = nextRuns(spec, state.zone, Date.now());
  state.nextRunMs = runs.length ? runs[0].ms : null;
  if (runs.length === 0) {
    runsNode.innerHTML = `<p class="empty-state">No run found in the next ${Math.round(SEARCH_DAYS / 365)} years. Check the day-of-month and month combination.</p>`;
    return;
  }
  runs.forEach((run, index) => runsNode.appendChild(runRow(run, index)));

  if (runs.length < RUN_COUNT) {
    const note = document.createElement("p");
    note.className = "empty-state";
    note.textContent = `Only ${runs.length} run${runs.length === 1 ? "" : "s"} fall within the next ${Math.round(SEARCH_DAYS / 365)} years.`;
    runsNode.appendChild(note);
  }
}

/* --- Field editor ------------------------------------------------------- */

function buildFieldGrid(defs, parts) {
  fieldGrid.innerHTML = "";
  defs.forEach((def, index) => {
    const cell = document.createElement("div");
    cell.className = "field-cell";
    cell.dataset.key = def.key;

    const label = document.createElement("label");
    label.className = "field-label";
    label.setAttribute("for", `f-${def.key}`);
    label.textContent = def.label;

    const input = document.createElement("input");
    input.id = `f-${def.key}`;
    input.className = "field-input";
    input.type = "text";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.value = parts[index] ?? "*";
    input.addEventListener("input", writeFromFields);

    const hint = document.createElement("span");
    hint.className = "field-range";
    hint.textContent = `${def.min}-${def.max}`;

    cell.append(label, input, hint);
    fieldGrid.appendChild(cell);
  });
}

function syncFieldGrid(spec) {
  if (state.source === "fields") return;
  if (!spec || spec.reboot || !spec.defs) {
    fieldGrid.innerHTML = "";
    return;
  }
  const keys = [...fieldGrid.querySelectorAll(".field-cell")].map((cell) => cell.dataset.key);
  const wanted = spec.defs.map((def) => def.key);
  if (keys.join() !== wanted.join()) {
    buildFieldGrid(spec.defs, spec.parts);
    return;
  }
  spec.defs.forEach((def, index) => {
    const input = document.getElementById(`f-${def.key}`);
    if (input && input.value !== spec.parts[index]) input.value = spec.parts[index];
  });
}

function writeFromFields() {
  // A field is one token; a space typed inside it ("1, 2") would otherwise
  // split into an extra field and shift everything after it — five fields
  // silently became a six-field expression with seconds.
  const values = [...fieldGrid.querySelectorAll(".field-input")]
    .map((input) => input.value.replace(/\s+/g, "") || "*");
  state.source = "fields";
  cronInput.value = values.join(" ");
  readExpression();
  state.source = "";
}

/* --- Wiring ------------------------------------------------------------- */

function readExpression() {
  const result = parseCron(cronInput.value);

  if (result.empty) {
    state.spec = null;
    detected.textContent = "Waiting for input";
    detected.classList.remove("is-set");
    showError("");
    if (state.source !== "fields") fieldGrid.innerHTML = "";
    renderEmpty("Enter a cron expression to see what it means.");
    return;
  }

  if (!result.ok) {
    state.spec = null;
    detected.textContent = "Invalid";
    detected.classList.remove("is-set");
    showError(result.error, result.fieldKey);
    renderEmpty("—");
    return;
  }

  state.spec = result;
  detected.textContent = result.kind;
  detected.classList.add("is-set");
  showError("");
  syncFieldGrid(result);
  render();
}

function setExpression(text, { toast = "" } = {}) {
  cronInput.value = text;
  state.source = "";
  readExpression();
  if (toast) window.DevToolsMain.showToast(toast, "success");
}

function buildPresetMenu() {
  presetMenu.innerHTML = "";
  for (const [label, expression] of PRESETS) {
    const option = document.createElement("button");
    option.className = "dd__option dd__option--stacked";
    option.type = "button";
    option.setAttribute("role", "option");
    option.dataset.value = expression;
    option.innerHTML = "";
    const name = document.createElement("span");
    name.className = "preset-name";
    name.textContent = label;
    const code = document.createElement("code");
    code.className = "preset-code";
    code.textContent = expression;
    option.append(name, code);
    presetMenu.appendChild(option);
  }
  window.DevToolsMain.initDropdowns(presetDropdown);
}

function buildZoneMenu() {
  tzMenu.innerHTML = "";

  // 400+ entries need a filter to be navigable at all.
  const search = document.createElement("input");
  search.type = "search";
  search.className = "tz-search";
  search.placeholder = "Filter zones…";
  search.setAttribute("aria-label", "Filter time zones");
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    tzMenu.querySelectorAll(".dd__option").forEach((option) => {
      option.hidden = query ? !option.dataset.value.toLowerCase().includes(query) : false;
    });
  });
  const MENU_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"];
  search.addEventListener("keydown", (event) => {
    if (!MENU_KEYS.includes(event.key)) event.stopPropagation();
  });
  tzMenu.appendChild(search);

  for (const zone of zoneList()) {
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
  window.DevToolsMain.initDropdowns(tzDropdown);
}

cronInput.addEventListener("input", () => {
  state.source = "input";
  readExpression();
  state.source = "";
});

presetDropdown.addEventListener("dd:change", (event) => {
  setExpression(event.detail.value, { toast: "Preset applied" });
});

tzDropdown.addEventListener("click", () => {
  if (!tzDropdown.classList.contains("is-open")) return;
  const search = tzMenu.querySelector(".tz-search");
  requestAnimationFrame(() => search?.focus());
});

tzDropdown.addEventListener("dd:change", (event) => {
  state.zone = event.detail.value;
  tickClock();
  if (state.spec) render();
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;

    if (action === "clear") {
      setExpression("");
      window.DevToolsMain.showToast("Cleared", "info");
    }

    if (action === "paste") {
      try {
        setExpression((await navigator.clipboard.readText()).trim());
      } catch {
        cronInput.focus();
        window.DevToolsMain.showToast("Clipboard is not available", "error");
      }
    }

    if (action === "copy-expression") {
      const text = cronInput.value.trim();
      if (!text) {
        window.DevToolsMain.showToast("Nothing to copy", "error");
        return;
      }
      window.DevToolsMain.copyText(text);
      window.DevToolsMain.showToast("Expression copied", "success");
    }

    if (action === "copy-runs") {
      if (!state.spec || state.spec.reboot) {
        window.DevToolsMain.showToast("Nothing to copy", "error");
        return;
      }
      const runs = nextRuns(state.spec, state.zone, Date.now());
      if (runs.length === 0) {
        window.DevToolsMain.showToast("Nothing to copy", "error");
        return;
      }
      const text = [
        `${cronInput.value.trim()} — ${describe(state.spec)}`,
        `Time zone: ${state.zone}`,
        ...runs.map((run, index) => `${index + 1}. ${runText(run)}`),
      ].join("\n");
      window.DevToolsMain.copyText(text);
      window.DevToolsMain.showToast("Next runs copied", "success");
    }
  });
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function tickClock() {
  const now = Date.now();
  const p = partsIn(now, state.zone);
  liveClock.textContent = `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  refreshRuns(now);
}

// The list was computed once, so it went stale while the page sat open: the
// first "next run" slid into the past and every "in N minutes" froze. Roll the
// list forward once its head has passed, and otherwise just refresh the
// relative labels in place, so focus on a row's copy button is not lost.
function refreshRuns(now) {
  if (!state.spec || state.spec.reboot || state.nextRunMs === null) return;
  if (now >= state.nextRunMs) {
    render();
    return;
  }
  runsNode.querySelectorAll(".run-row").forEach((row) => {
    const label = row.querySelector(".run-relative");
    if (label && row.dataset.ms) label.textContent = relativeTo(Number(row.dataset.ms));
  });
}

function init() {
  buildPresetMenu();
  buildZoneMenu();
  setExpression("*/5 9-17 * * MON-FRI");
  tickClock();
  window.setInterval(tickClock, 1000);
}

init();
