// Keyboard Event Inspector — shows what a keydown actually carries (key, code,
// legacy keyCode/which, location, repeat, composition, modifiers), keeps the
// modifier chips in step with keyup, and turns the press into a shortcut
// string and a ready-to-paste JS condition.
"use strict";

const HISTORY_LIMIT = 30;
const LOCATIONS = ["Standard", "Left", "Right", "Numpad"];
const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS", "Hyper", "Super"]);
const LOCK_KEYS = new Set(["CapsLock", "NumLock", "ScrollLock"]);

// event.key values that are invisible or ambiguous when printed as-is.
const KEY_NAMES = {
  " ": "Space",
  " ": "NBSP",
  "": "(empty)",
};

// Punctuation codes, named by the character on a US layout. Using the code
// keeps the combo stable: Shift+1 is "Shift+1", not "Shift+!".
const CODE_CHARS = {
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  IntlBackslash: "\\", Space: "Space", Escape: "Esc",
  NumpadAdd: "Num+", NumpadSubtract: "Num-", NumpadMultiply: "Num*",
  NumpadDivide: "Num/", NumpadDecimal: "Num.", NumpadEnter: "Enter",
};

const el = (id) => document.getElementById(id);
const capture = el("capture");
const keycap = el("keycap");
const keyDisplay = el("keyDisplay");
const codeDisplay = el("codeDisplay");
const captureHint = el("captureHint");
const listenPill = el("listenPill");
const output = el("output");
const announce = el("announce");
const captureStatus = el("captureStatus");
const heldCount = el("heldCount");
const shortcutText = el("shortcutText");
const conditionText = el("conditionText");
const historyBody = el("history");
const tableWrap = el("tableWrap");
const historyEmpty = el("historyEmpty");
const historyStatus = el("historyStatus");
const historyCount = el("historyCount");
const ignoreRepeats = el("ignoreRepeats");

const state = {
  match: "key",
  latest: null,
  history: [],
  held: new Map(), // code -> key, for keys currently down
  skipped: 0,
};

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

/* --- Reading events ------------------------------------------------------- */

function modifiersOf(event) {
  const read = (name) => Boolean(event.getModifierState?.(name));
  return {
    Control: event.ctrlKey,
    Shift: event.shiftKey,
    Alt: event.altKey,
    Meta: event.metaKey,
    AltGraph: read("AltGraph"),
    CapsLock: read("CapsLock"),
    NumLock: read("NumLock"),
  };
}

function toEntry(event) {
  return {
    type: event.type,
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    which: event.which,
    location: event.location,
    repeat: event.repeat,
    isComposing: event.isComposing,
    modifiers: modifiersOf(event),
  };
}

function displayKey(key) {
  if (key in KEY_NAMES) return KEY_NAMES[key];
  return key;
}

function locationName(location) {
  return LOCATIONS[location] ?? "Unknown";
}

function activeModifiers(modifiers, { locks = true } = {}) {
  const short = { Control: "Ctrl", AltGraph: "AltGr" };
  return Object.entries(modifiers)
    .filter(([name, on]) => on && (locks || !LOCK_KEYS.has(name)))
    .map(([name]) => short[name] ?? name);
}

/* --- Shortcut ------------------------------------------------------------- */

// The main key of a combo, named from the physical code where that is
// unambiguous so Shift does not change the letter or digit.
function comboKey(entry) {
  const { code, key } = entry;
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return match[1];
  match = /^Digit(\d)$/.exec(code);
  if (match) return match[1];
  match = /^Numpad(\d)$/.exec(code);
  if (match) return `Num${match[1]}`;
  if (code in CODE_CHARS) return CODE_CHARS[code];
  if (/^F\d{1,2}$/.test(code)) return code;
  if (key && key.length === 1) return key.toUpperCase();
  return displayKey(key) || code || "Unidentified";
}

function isModifierKey(key) {
  return MODIFIER_KEYS.has(key);
}

// Which modifier flags take part in the combo. AltGr is reported as Ctrl+Alt
// on Windows, so when it is down it stands in for both.
function comboModifiers(entry) {
  const m = entry.modifiers;
  const altGr = m.AltGraph && entry.key !== "AltGraph";
  const list = [];
  const self = entry.key;
  if (m.Control && !altGr && self !== "Control") list.push(["Ctrl", "e.ctrlKey"]);
  if (m.Alt && !altGr && self !== "Alt") list.push(["Alt", "e.altKey"]);
  if (altGr) list.push(["AltGr", 'e.getModifierState("AltGraph")']);
  if (m.Shift && self !== "Shift") list.push(["Shift", "e.shiftKey"]);
  if (m.Meta && self !== "Meta") list.push(["Meta", "e.metaKey"]);
  return list;
}

function shortcutFor(entry) {
  const mods = comboModifiers(entry);
  const main = isModifierKey(entry.key)
    ? ({ Control: "Ctrl", AltGraph: "AltGr" }[entry.key] ?? entry.key)
    : comboKey(entry);
  return [...mods.map(([label]) => label), main].join("+");
}

function conditionFor(entry, match) {
  const parts = comboModifiers(entry).map(([, test]) => test);
  if (match === "code" && entry.code) {
    parts.push(`e.code === ${JSON.stringify(entry.code)}`);
  } else if (entry.key.length === 1 && entry.key.toLowerCase() !== entry.key.toUpperCase()) {
    // A letter: Shift and CapsLock change its case, so compare lower-cased.
    parts.push(`e.key.toLowerCase() === ${JSON.stringify(entry.key.toLowerCase())}`);
  } else {
    parts.push(`e.key === ${JSON.stringify(entry.key)}`);
  }
  return parts.join(" && ");
}

function renderShortcut() {
  const entry = state.latest;
  shortcutText.textContent = entry ? shortcutFor(entry) : "—";
  conditionText.textContent = entry ? conditionFor(entry, state.match) : "—";
  shortcutText.classList.toggle("is-empty", !entry);
  conditionText.classList.toggle("is-empty", !entry);
}

/* --- Rendering ------------------------------------------------------------ */

function setProp(name, text, tone = "") {
  const node = document.querySelector(`[data-prop="${name}"]`);
  node.textContent = text;
  node.className = tone;
}

function renderLatest() {
  const entry = state.latest;
  if (!entry) return;
  const label = displayKey(entry.key);
  keyDisplay.textContent = label;
  keycap.classList.remove("is-empty");
  keycap.dataset.size = label.length <= 2 ? "lg" : label.length <= 6 ? "md" : "sm";
  codeDisplay.textContent = entry.code || "No physical code";
  codeDisplay.classList.remove("is-empty");

  setProp("key", JSON.stringify(entry.key));
  setProp("code", entry.code ? JSON.stringify(entry.code) : '""');
  setProp("keyCode", String(entry.keyCode));
  setProp("which", String(entry.which));
  setProp("location", `${entry.location} · ${locationName(entry.location)}`);
  setProp("repeat", String(entry.repeat), entry.repeat ? "is-on" : "");
  setProp("isComposing", String(entry.isComposing), entry.isComposing ? "is-on" : "");
  renderType();

  output.value = JSON.stringify(entry, null, 2);
  renderShortcut();
}

// The type tile tracks whether the displayed key is still down.
function renderType() {
  const entry = state.latest;
  if (!entry) return;
  const down = state.held.has(entry.code || entry.key);
  setProp("type", down ? "keydown" : "keyup", down ? "is-on" : "");
  keycap.classList.toggle("is-down", down);
}

function renderModifiers(modifiers) {
  document.querySelectorAll("[data-modifier]").forEach((chip) => {
    const on = Boolean(modifiers[chip.dataset.modifier]);
    chip.classList.toggle("is-active", on);
    chip.setAttribute("aria-label", `${chip.textContent} ${on ? "on" : "off"}`);
  });
}

function renderHeld() {
  const count = state.held.size;
  heldCount.textContent = `${count} held`;
  renderType();
}

function historyRow(entry, index) {
  const row = document.createElement("tr");
  if (entry.repeat) row.classList.add("is-repeat");
  const cells = [
    [displayKey(entry.key), "cell-key"],
    [entry.code || "—", "cell-code"],
    [String(entry.keyCode), "cell-num col-keycode"],
    [locationName(entry.location), "cell-loc col-location"],
    [activeModifiers(entry.modifiers, { locks: false }).join("+") || "—", "cell-mods"],
  ];
  for (const [text, className] of cells) {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = text;
    if (text === "—") cell.classList.add("is-empty");
    row.append(cell);
  }
  const repeat = document.createElement("td");
  repeat.className = "cell-repeat col-repeat";
  if (entry.repeat) {
    const badge = document.createElement("span");
    badge.className = "badge info";
    badge.textContent = "Repeat";
    repeat.append(badge);
  } else {
    repeat.textContent = "—";
    repeat.classList.add("is-empty");
  }
  row.append(repeat);

  const actions = document.createElement("td");
  actions.className = "cell-action";
  actions.innerHTML = `<button class="action-btn" type="button" data-action="copy-row" data-tooltip="Copy JSON">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>
    </button>`;
  const button = actions.firstElementChild;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", `Copy ${displayKey(entry.key)} event as JSON`);
  row.append(actions);
  return row;
}

function renderHistory() {
  const count = state.history.length;
  historyBody.replaceChildren(...state.history.map(historyRow));
  tableWrap.hidden = count === 0;
  historyEmpty.hidden = count > 0;
  historyCount.textContent = `${count} / ${HISTORY_LIMIT} events`;
  historyStatus.textContent = state.skipped
    ? `Newest first · ${state.skipped} repeat${state.skipped === 1 ? "" : "s"} ignored`
    : "Newest first";
}

function renderFocus() {
  const focused = document.activeElement === capture && document.hasFocus();
  capture.classList.toggle("is-focused", focused);
  listenPill.textContent = focused ? "Listening" : "Not focused";
  listenPill.className = `badge listen-pill ${focused ? "success" : "warning"}`;
  captureHint.textContent = focused
    ? "Listening. Press any key or combination; Tab leaves."
    : "Click here, then press any key";
  captureHint.classList.toggle("is-warning", !focused);
}

/* --- Capture -------------------------------------------------------------- */

// Tab and Escape stay with the browser so a keyboard user can always leave,
// and Ctrl/Meta combinations are not blocked so browser shortcuts still work.
function shouldPrevent(event) {
  if (event.key === "Tab" || event.key === "Escape") return false;
  if (event.ctrlKey || event.metaKey) return false;
  return true;
}

function onKeyDown(event) {
  if (shouldPrevent(event)) event.preventDefault();
  const entry = toEntry(event);
  state.held.set(entry.code || entry.key, entry.key);
  state.latest = entry;
  renderLatest();
  renderModifiers(entry.modifiers);
  renderHeld();

  if (entry.repeat && ignoreRepeats.checked) {
    state.skipped += 1;
  } else {
    state.history.unshift(entry);
    state.history.length = Math.min(state.history.length, HISTORY_LIMIT);
  }
  renderHistory();

  captureStatus.textContent = `${entry.type} · ${shortcutFor(entry)}`;
  captureStatus.className = "status-text success";
  if (!entry.repeat) announce.textContent = `${shortcutFor(entry)}, code ${entry.code || "none"}`;
}

function onKeyUp(event) {
  state.held.delete(event.code || event.key);
  renderModifiers(modifiersOf(event));
  renderHeld();
}

// Losing focus swallows the keyup of anything still held (Alt+Tab is the
// classic), so release the momentary modifiers rather than leaving them lit.
function releaseAll() {
  state.held.clear();
  const locks = {};
  document.querySelectorAll("[data-modifier]").forEach((chip) => {
    const name = chip.dataset.modifier;
    locks[name] = LOCK_KEYS.has(name) && chip.classList.contains("is-active");
  });
  renderModifiers(locks);
  renderHeld();
}

capture.addEventListener("keydown", onKeyDown);
capture.addEventListener("keyup", onKeyUp);
capture.addEventListener("focus", renderFocus);
capture.addEventListener("blur", () => {
  releaseAll();
  renderFocus();
});

function focusCapture() {
  if (document.querySelector(".modal-overlay.is-open")) return;
  capture.focus({ preventScroll: true });
  renderFocus();
}

// Take focus on arrival, and again whenever the page (or the dashboard's
// iframe) regains focus with nothing else focused.
window.addEventListener("focus", () => {
  if (!document.activeElement || document.activeElement === document.body) focusCapture();
  else renderFocus();
});
window.addEventListener("blur", () => {
  releaseAll();
  renderFocus();
});

// Clicking anywhere in the capture panel that is not a control starts
// listening, so the tiles and stage are one big target.
el("capturePanel").addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, input, label, a, code")) return;
  event.preventDefault();
  focusCapture();
});

/* --- Match mode (hash state) ---------------------------------------------- */

function applyMatch(match) {
  state.match = match === "code" ? "code" : "key";
  document.querySelectorAll("#matchSwitch [data-match]").forEach((button) => {
    const on = button.dataset.match === state.match;
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
  });
  renderShortcut();
}

document.querySelectorAll("#matchSwitch [data-match]").forEach((button) => {
  button.addEventListener("click", () => {
    applyMatch(button.dataset.match);
    window.DevToolsMain.writeHashState(state.match === "code" ? "code" : "");
  });
});

/* --- Actions -------------------------------------------------------------- */

const ACTIONS = {
  "copy-latest"() {
    copyText(state.latest && JSON.stringify(state.latest, null, 2), "Event JSON");
  },
  "copy-shortcut"() {
    copyText(state.latest && shortcutFor(state.latest), "Shortcut");
  },
  "copy-condition"() {
    copyText(state.latest && conditionFor(state.latest, state.match), "Condition");
  },
  "copy-history"() {
    copyText(state.history.length ? JSON.stringify(state.history, null, 2) : "", "History");
  },
  "copy-row"(button) {
    const entry = state.history[Number(button.dataset.index)];
    copyText(entry && JSON.stringify(entry, null, 2), "Event JSON");
  },
  "clear-history"() {
    state.history.length = 0;
    state.skipped = 0;
    renderHistory();
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  ACTIONS[button.dataset.action]?.(button);
  // A mouse click on a control would otherwise leave focus on it, and the
  // next Space or Enter would press that button instead of being inspected.
  // Keyboard activation (detail 0) keeps focus where the user put it.
  if (event.detail > 0) focusCapture();
});

document.querySelectorAll("#matchSwitch [data-match]").forEach((button) => {
  button.addEventListener("click", (event) => {
    if (event.detail > 0) focusCapture();
  });
});
ignoreRepeats.addEventListener("change", () => {
  if (!ignoreRepeats.matches(":focus-visible")) focusCapture();
});

el("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState(applyMatch);

/* --- Start ---------------------------------------------------------------- */

applyMatch(window.DevToolsMain.readHashState());
renderHistory();
renderModifiers({});
focusCapture();
// Focus may be refused until the document is fully active (e.g. inside the
// dashboard iframe); try once more after load.
window.addEventListener("load", () => {
  if (document.activeElement === document.body) focusCapture();
  else renderFocus();
});
