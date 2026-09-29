// Unicode / Character Inspector — one row per code point with its Unicode 17
// name, category and UTF-8 / UTF-16 bytes, a summary of the hidden
// characters in the text, and the text escaped for seven syntaxes.
//
// Names come from data.js (generated from the UCD; licence in its header).
// First/Last ranges in the UCD are stored as ranges and expanded here.

"use strict";

const TABLE_LIMIT = 5000;
const SAMPLE_TEXT = "\uFEFFHello,\u200B w\u00F6rld! \u{1F469}\u{1F3FD}\u200D\u{1F4BB} cafe\u0301\u00A0bar\u200B";

const $ = (id) => document.getElementById(id);
const input = $("input");
const output = $("output");
const tableWrap = $("tableWrap");
const emptyState = $("emptyState");
const hiddenAlert = $("hiddenAlert");
const hiddenSummary = $("hiddenSummary");
const inputStatus = $("inputStatus");
const escapeStatus = $("escapeStatus");
const escapeCount = $("escapeCount");
const nonAsciiOnly = $("nonAsciiOnly");
const detail = $("detail");

const state = {
  format: "js",
  filter: "all",
  // Code-point records for the current text (all of it, not just the table).
  chars: [],
  selected: -1,
};

/* --- Unicode data --------------------------------------------------------- */

const NAMES = new Map(UNICODE_DATA.characters.map((row) => [row[0], row.slice(1)]));
const hex = (n, width = 2) => n.toString(16).toUpperCase().padStart(width, "0");

const HANGUL_L = ["G", "GG", "N", "D", "DD", "R", "M", "B", "BB", "S", "SS", "", "J", "JJ", "C", "K", "T", "P", "H"];
const HANGUL_V = ["A", "AE", "YA", "YAE", "EO", "E", "YEO", "YE", "O", "WA", "WAE", "OE", "YO", "U", "WEO", "WE", "WI", "YU", "EU", "YI", "I"];
const HANGUL_T = ["", "G", "GG", "GS", "N", "NJ", "NH", "D", "L", "LG", "LM", "LB", "LS", "LT", "LP", "LH", "M", "B", "BS", "S", "SS", "NG", "J", "C", "K", "T", "P", "H"];

function metadata(cp) {
  if (NAMES.has(cp)) return NAMES.get(cp);
  const range = UNICODE_DATA.ranges.find((r) => cp >= r[0] && cp <= r[1]);
  if (!range) return ["UNASSIGNED", "Cn"];
  if (cp >= 0xac00 && cp <= 0xd7a3) {
    const s = cp - 0xac00;
    return ["HANGUL SYLLABLE " + HANGUL_L[Math.floor(s / 588)] + HANGUL_V[Math.floor((s % 588) / 28)] + HANGUL_T[s % 28], "Lo"];
  }
  if (range[2].startsWith("CJK")) return ["CJK UNIFIED IDEOGRAPH-" + hex(cp), range[3]];
  if (range[2].startsWith("Tangut")) return ["TANGUT IDEOGRAPH-" + hex(cp), range[3]];
  return [range[2], range[3]];
}

const CATEGORIES = {
  Lu: "Uppercase letter", Ll: "Lowercase letter", Lt: "Titlecase letter", Lm: "Modifier letter", Lo: "Other letter",
  Mn: "Nonspacing mark", Mc: "Spacing mark", Me: "Enclosing mark",
  Nd: "Decimal number", Nl: "Letter number", No: "Other number",
  Pc: "Connector punctuation", Pd: "Dash punctuation", Ps: "Open punctuation", Pe: "Close punctuation",
  Pi: "Initial punctuation", Pf: "Final punctuation", Po: "Other punctuation",
  Sm: "Math symbol", Sc: "Currency symbol", Sk: "Modifier symbol", So: "Other symbol",
  Zs: "Space separator", Zl: "Line separator", Zp: "Paragraph separator",
  Cc: "Control", Cf: "Format", Cs: "Surrogate", Co: "Private use", Cn: "Unassigned",
};

/* --- Hidden, whitespace and combining characters -------------------------- */

// Short labels for characters that draw nothing. They are what the Char
// column shows and what the hidden summary counts.
const ABBREVIATIONS = {
  0x00a0: "NBSP", 0x00ad: "SHY", 0x034f: "CGJ", 0x061c: "ALM", 0x0085: "NEL",
  0x115f: "HCF", 0x1160: "HJF", 0x1680: "OSM", 0x17b4: "KIVAQ", 0x17b5: "KIVAA", 0x180e: "MVS",
  0x2000: "NQSP", 0x2001: "MQSP", 0x2002: "ENSP", 0x2003: "EMSP", 0x2004: "3/MSP", 0x2005: "4/MSP",
  0x2006: "6/MSP", 0x2007: "FSP", 0x2008: "PSP", 0x2009: "THSP", 0x200a: "HSP",
  0x200b: "ZWSP", 0x200c: "ZWNJ", 0x200d: "ZWJ", 0x200e: "LRM", 0x200f: "RLM",
  0x2028: "LSEP", 0x2029: "PSEP", 0x202a: "LRE", 0x202b: "RLE", 0x202c: "PDF", 0x202d: "LRO", 0x202e: "RLO",
  0x202f: "NNBSP", 0x205f: "MMSP", 0x2060: "WJ", 0x2061: "FA", 0x2062: "IT", 0x2063: "IS", 0x2064: "IP",
  0x2066: "LRI", 0x2067: "RLI", 0x2068: "FSI", 0x2069: "PDI",
  0x206a: "ISS", 0x206b: "ASS", 0x206c: "IAFS", 0x206d: "AAFS", 0x206e: "NADS", 0x206f: "NODS",
  0x2800: "BLANK", 0x3000: "IDSP", 0x3164: "HF", 0xfeff: "BOM", 0xffa0: "HWHF",
  0xfff9: "IAA", 0xfffa: "IAS", 0xfffb: "IAT", 0xe0001: "LANG", 0xe007f: "CANCEL",
};
const C0 = ["NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI",
  "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US"];
const WHITESPACE_GLYPHS = { 0x20: "␠", 0x09: "⇥", 0x0a: "↵", 0x0d: "␍" };

// Default_Ignorable_Code_Point (DerivedCoreProperties.txt) plus the Hangul
// and braille blanks that are routinely used as "invisible" letters.
const IGNORABLE = [
  [0x00ad, 0x00ad], [0x034f, 0x034f], [0x061c, 0x061c], [0x115f, 0x1160], [0x17b4, 0x17b5],
  [0x180b, 0x180f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x206f], [0x2800, 0x2800],
  [0x3164, 0x3164], [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff0, 0xfff8],
  [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0000, 0xe0fff],
];
const isIgnorable = (cp) => IGNORABLE.some(([start, end]) => cp >= start && cp <= end);

// "hidden": draws nothing or passes for a plain space. "space": ordinary
// whitespace. "mark": a combining mark. "" for everything else.
function classify(cp, category) {
  if (cp in WHITESPACE_GLYPHS) return "space";
  if (isIgnorable(cp) || /^(Cc|Cf|Cs|Zs|Zl|Zp)$/.test(category)) return "hidden";
  if (/^M/.test(category)) return "mark";
  return "";
}

function abbreviation(cp, name) {
  if (cp < 0x20) return C0[cp];
  if (cp === 0x7f) return "DEL";
  if (ABBREVIATIONS[cp]) return ABBREVIATIONS[cp];
  if (cp >= 0xfe00 && cp <= 0xfe0f) return "VS" + (cp - 0xfe00 + 1);
  if (cp >= 0xe0100 && cp <= 0xe01ef) return "VS" + (cp - 0xe0100 + 17);
  if (cp >= 0xe0020 && cp <= 0xe007e) return "TAG";
  if (cp >= 0xd800 && cp <= 0xdfff) return "SURR";
  // Otherwise the initials of the name: ARABIC LETTER MARK -> ALM.
  const initials = name.split(/[\s-]+/).filter(Boolean).map((word) => word[0]).join("");
  return initials.slice(0, 5) || "U+" + hex(cp, 4);
}

function describe(char, index) {
  const cp = char.codePointAt(0);
  const [name, category] = metadata(cp);
  const kind = classify(cp, category);
  let glyph = char;
  if (kind === "space") glyph = WHITESPACE_GLYPHS[cp];
  else if (kind === "mark") glyph = "◌" + char;
  return {
    index,
    char,
    cp,
    name,
    category,
    kind,
    glyph,
    badge: kind === "hidden" ? abbreviation(cp, name) : "",
  };
}

const utf8Of = (record) => record.category === "Cs"
  ? "Invalid (lone surrogate)"
  : Array.from(new TextEncoder().encode(record.char), (byte) => hex(byte)).join(" ");

const utf16Of = (record) => Array.from({ length: record.char.length }, (_, i) => {
  const unit = record.char.charCodeAt(i);
  return hex(unit >> 8) + " " + hex(unit & 255);
}).join(" ");

/* --- Escapes -------------------------------------------------------------- */

// With "non-ASCII only", printable ASCII stays literal except the characters
// each syntax needs escaped to stay a valid string.
const PRINTABLE_ASCII = (cp) => cp >= 0x20 && cp <= 0x7e;
const HEX_OR_SPACE = /[0-9A-Fa-f \t\n\r\f]/;

const FORMATS = {
  js: {
    label: "JavaScript code-point escapes (ES2015+)",
    unsafe: "\\\"'`",
    escape: (cp) => "\\u{" + hex(cp, 1) + "}",
  },
  "js-utf16": {
    label: "JavaScript UTF-16 escapes, astral characters as surrogate pairs",
    unsafe: "\\\"'`",
    escape: (cp, char) => Array.from({ length: char.length }, (_, i) => "\\u" + hex(char.charCodeAt(i), 4)).join(""),
  },
  "html-hex": {
    label: "HTML hexadecimal character references",
    unsafe: "&<>\"'",
    escape: (cp) => "&#x" + hex(cp, 1) + ";",
  },
  "html-dec": {
    label: "HTML decimal character references",
    unsafe: "&<>\"'",
    escape: (cp) => "&#" + cp + ";",
  },
  css: {
    label: "CSS escapes, space-terminated only where required",
    unsafe: "\\\"'",
    escape: (cp) => "\\" + hex(cp, 1),
  },
  python: {
    label: "Python string escapes, \\U00XXXXXX above U+FFFF",
    unsafe: "\\\"'",
    escape: (cp) => (cp > 0xffff ? "\\U" + hex(cp, 8) : "\\u" + hex(cp, 4)),
  },
  url: {
    label: "URL percent-encoding of the UTF-8 bytes",
    safe: /[A-Za-z0-9\-._~]/,
    escape: (cp, char) => Array.from(new TextEncoder().encode(char), (byte) => "%" + hex(byte)).join(""),
  },
};

function keepLiteral(format, char, cp) {
  if (format.safe) return format.safe.test(char);
  return PRINTABLE_ASCII(cp) && !format.unsafe.includes(char);
}

function escapeText(chars, formatId, onlyNonAscii) {
  const format = FORMATS[formatId];
  const parts = [];
  chars.forEach((char, i) => {
    const cp = char.codePointAt(0);
    if (onlyNonAscii && keepLiteral(format, char, cp)) {
      parts.push(char);
      return;
    }
    let escaped = format.escape(cp, char);
    // A CSS escape swallows one following whitespace and runs on through hex
    // digits, so it needs a terminating space only before those.
    if (formatId === "css") {
      const next = chars[i + 1];
      const nextIsLiteral = next !== undefined && onlyNonAscii && keepLiteral(format, next, next.codePointAt(0));
      if (nextIsLiteral && HEX_OR_SPACE.test(next)) escaped += " ";
    }
    parts.push(escaped);
  });
  return parts.join("");
}

/* --- Rendering ------------------------------------------------------------ */

const plural = (count, one, many = one + "s") => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

let segmenter = null;
try {
  segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
} catch {
  segmenter = null;
}

function graphemeCount(text) {
  if (!segmenter) return Array.from(text).length;
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}

const hiddenRecords = () => state.chars.filter((record) => record.kind === "hidden");
const cleanedText = () => state.chars.filter((record) => record.kind !== "hidden").map((record) => record.char).join("");

function renderStats(text) {
  const hidden = hiddenRecords().length;
  $("statCodePoints").textContent = plural(state.chars.length, "code point");
  $("statGraphemes").textContent = plural(graphemeCount(text), "grapheme");
  $("statUtf8").textContent = plural(new TextEncoder().encode(text).length, "UTF-8 byte");
  $("statUtf16").textContent = plural(text.length, "UTF-16 unit");
  $("statHidden").textContent = `${hidden.toLocaleString("en-US")} hidden`;
  $("statHidden").classList.toggle("is-flagged", hidden > 0);
  $("hiddenFilterCount").textContent = hidden.toLocaleString("en-US");

  const over = state.chars.length > TABLE_LIMIT;
  inputStatus.hidden = !over;
  inputStatus.textContent = over
    ? `Over the ${TABLE_LIMIT.toLocaleString("en-US")} code point limit: the table shows the first ${TABLE_LIMIT.toLocaleString("en-US")}`
    : "";
  input.toggleAttribute("aria-invalid", over);
}

function renderHiddenSummary() {
  const hidden = hiddenRecords();
  hiddenAlert.hidden = hidden.length === 0;
  if (!hidden.length) {
    hiddenSummary.textContent = "";
    return;
  }
  const counts = new Map();
  hidden.forEach((record) => counts.set(record.badge, (counts.get(record.badge) || 0) + 1));
  const kinds = [...counts];
  const listed = kinds.slice(0, 8).map(([badge, count]) => `${badge} ×${count}`);
  if (kinds.length > 8) listed.push(`${kinds.length - 8} more`);
  const strong = document.createElement("strong");
  strong.textContent = `${plural(hidden.length, "hidden character")}:`;
  hiddenSummary.replaceChildren(strong, " " + listed.join(", "));
}

function glyphCell(record) {
  const cell = document.createElement("td");
  cell.className = "cell-char";
  if (record.kind === "hidden") {
    const badge = document.createElement("span");
    badge.className = "glyph-badge";
    badge.textContent = record.badge;
    cell.append(badge);
  } else {
    const glyph = document.createElement("span");
    glyph.className = record.kind ? `glyph is-${record.kind}` : "glyph";
    glyph.textContent = record.glyph;
    cell.append(glyph);
  }
  return cell;
}

function textCell(text, className) {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

const KIND_BADGES = { hidden: ["hidden", "error"], space: ["space", "info"], mark: ["combining", "info"] };

function buildRow(record) {
  const row = document.createElement("tr");
  row.dataset.index = record.index;
  if (record.kind) row.classList.add(`is-${record.kind}`);
  if (record.index === state.selected) row.classList.add("is-selected");

  const nameCell = textCell("", "cell-name");
  const name = document.createElement("span");
  name.className = "char-name";
  name.textContent = record.name;
  nameCell.append(name);
  if (KIND_BADGES[record.kind]) {
    const [label, tone] = KIND_BADGES[record.kind];
    const badge = document.createElement("span");
    badge.className = `badge ${tone} kind-badge`;
    badge.textContent = label;
    nameCell.append(badge);
  }

  const category = textCell(record.category, "cell-cat");
  category.title = CATEGORIES[record.category] || record.category;

  row.append(
    glyphCell(record),
    textCell("U+" + hex(record.cp, 4), "cell-cp"),
    nameCell,
    category,
    textCell(utf8Of(record), record.category === "Cs" ? "cell-bytes is-invalid" : "cell-bytes"),
    textCell(utf16Of(record), "cell-bytes"),
  );
  return row;
}

function visibleRecords() {
  const inTable = state.chars.slice(0, TABLE_LIMIT);
  return state.filter === "hidden" ? inTable.filter((record) => record.kind === "hidden") : inTable;
}

function renderTable() {
  const records = visibleRecords();
  // One new tbody means one mutation for main.js's observer, not 5,000.
  const body = document.createElement("tbody");
  body.id = "results";
  records.forEach((record) => body.append(buildRow(record)));
  const current = $("results");
  current.replaceWith(body);

  const total = Math.min(state.chars.length, TABLE_LIMIT);
  $("count").textContent = state.filter === "hidden"
    ? `${records.length.toLocaleString("en-US")} of ${plural(total, "code point")}`
    : plural(state.chars.length, "code point");

  emptyState.hidden = records.length > 0;
  if (!records.length) {
    emptyState.textContent = state.chars.length
      ? "No hidden characters. Everything here renders as itself."
      : "Type or paste text to list its code points.";
  }
}

function renderDetail() {
  const record = state.chars[state.selected];
  detail.hidden = !record;
  if (!record) return;
  const glyph = $("detailGlyph");
  glyph.className = `detail-glyph${record.kind ? ` is-${record.kind}` : ""}`;
  glyph.textContent = record.kind === "hidden" ? record.badge : record.glyph;
  $("detailName").textContent = `U+${hex(record.cp, 4)} ${record.name}`;
  const parts = [
    `${record.category} · ${CATEGORIES[record.category] || "Unknown"}`,
    `dec ${record.cp}`,
    escapeText([record.char], state.format, false),
    `#${(record.index + 1).toLocaleString("en-US")} of ${state.chars.length.toLocaleString("en-US")}`,
  ];
  $("detailMeta").textContent = parts.join("  ·  ");
}

function renderEscape() {
  const chars = state.chars.map((record) => record.char);
  output.value = escapeText(chars, state.format, nonAsciiOnly.checked);
  const surrogates = state.chars.some((record) => record.category === "Cs");
  const lossy = surrogates && /^(html|css|url)/.test(state.format);
  escapeStatus.textContent = lossy
    ? "Lone surrogates become U+FFFD in this format"
    : FORMATS[state.format].label;
  escapeStatus.className = `status-text${lossy ? " warning" : ""}`;
  escapeCount.textContent = plural(output.value.length, "char");
}

function render() {
  const text = input.value;
  state.chars = Array.from(text, describe);
  if (state.selected >= state.chars.length) state.selected = -1;
  if (state.selected < 0 && state.chars.length) {
    // Land on the first hidden character: that is usually why you are here.
    const firstHidden = state.chars.findIndex((record) => record.kind === "hidden");
    state.selected = firstHidden >= 0 && firstHidden < TABLE_LIMIT ? firstHidden : 0;
  }
  renderStats(text);
  renderHiddenSummary();
  renderTable();
  renderDetail();
  renderEscape();
}

/* --- Selection ------------------------------------------------------------ */

function select(index, { scroll = false } = {}) {
  if (!state.chars[index]) return;
  state.selected = index;
  document.querySelectorAll("#results tr.is-selected").forEach((row) => row.classList.remove("is-selected"));
  const row = $("results").querySelector(`tr[data-index="${index}"]`);
  row?.classList.add("is-selected");
  if (scroll) row?.scrollIntoView({ block: "nearest" });
  renderDetail();
}

tableWrap.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-index]");
  if (row) select(Number(row.dataset.index));
});

tableWrap.addEventListener("keydown", (event) => {
  const rows = [...$("results").rows];
  if (!rows.length) return;
  const position = rows.findIndex((row) => Number(row.dataset.index) === state.selected);
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
  let next = null;
  if (event.key in steps) next = Math.min(rows.length - 1, Math.max(0, (position < 0 ? 0 : position) + steps[event.key]));
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = rows.length - 1;
  if (next === null) return;
  event.preventDefault();
  select(Number(rows[next].dataset.index), { scroll: true });
});

/* --- Segments ------------------------------------------------------------- */

function setActive(group, button) {
  group.querySelectorAll(".segment-btn").forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-checked", String(active));
    candidate.tabIndex = active ? 0 : -1;
  });
}

// Radio-group keyboard model: arrows move and select, Tab leaves the group.
function wireSegment(group, onPick) {
  const buttons = [...group.querySelectorAll(".segment-btn")];
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => onPick(button));
    button.addEventListener("keydown", (event) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      let target = null;
      if (delta) target = buttons[(index + delta + buttons.length) % buttons.length];
      else if (event.key === "Home") target = buttons[0];
      else if (event.key === "End") target = buttons.at(-1);
      if (!target) return;
      event.preventDefault();
      target.focus();
      onPick(target);
    });
  });
}

function applyFormat(format) {
  state.format = FORMATS[format] ? format : "js";
  const group = $("formatSwitch");
  setActive(group, group.querySelector(`[data-format="${state.format}"]`));
}

wireSegment($("formatSwitch"), (button) => {
  if (button.dataset.format === state.format) return;
  applyFormat(button.dataset.format);
  window.DevToolsMain.writeHashState(state.format);
  renderEscape();
  renderDetail();
});

wireSegment($("filterSwitch"), (button) => {
  if (button.dataset.filter === state.filter) return;
  state.filter = button.dataset.filter;
  setActive(button.parentElement, button);
  renderTable();
});

/* --- Actions -------------------------------------------------------------- */

function showToast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

function copyText(value, label) {
  if (!value) {
    showToast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => showToast(`${label} copied`, "success"))
    .catch(() => showToast("Copy failed", "error"));
}

function setInput(text) {
  input.value = text;
  state.selected = -1;
  render();
}

const ACTIONS = {
  sample() {
    setInput(SAMPLE_TEXT);
    showToast("Loaded sample text", "success");
  },
  paste() {
    navigator.clipboard.readText()
      .then((text) => {
        if (!text) {
          showToast("Clipboard is empty", "error");
          return;
        }
        setInput(text);
      })
      .catch(() => showToast("Paste failed", "error"));
  },
  clear() {
    setInput("");
    input.focus();
  },
  "remove-hidden"() {
    const removed = hiddenRecords().length;
    if (!removed) return;
    setInput(cleanedText());
    showToast(`Removed ${plural(removed, "hidden character")}`, "success");
  },
  "copy-cleaned"() {
    copyText(cleanedText(), "Cleaned text");
  },
  "copy-char"() {
    const record = state.chars[state.selected];
    copyText(record?.char, "Character");
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) ACTIONS[button.dataset.action]?.(button);
});

$("copy").addEventListener("click", () => copyText(output.value, "Escaped text"));
$("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));
nonAsciiOnly.addEventListener("change", () => {
  renderEscape();
});
input.addEventListener("input", () => {
  state.selected = -1;
  render();
});

window.DevToolsMain.onHashState((value) => {
  applyFormat(value);
  renderEscape();
  renderDetail();
});

applyFormat(window.DevToolsMain.readHashState());
// Open on a sample with a few hidden characters so the tool explains itself.
input.value = SAMPLE_TEXT;
render();
