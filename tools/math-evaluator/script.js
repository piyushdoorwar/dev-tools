// Math / Expression Evaluator — live expression results, percentage
// calculators and a session history you can load back.
//
// All arithmetic goes through parser.js (MathEvaluator), a bounded grammar
// that never evaluates JavaScript. This file is only the interface.

"use strict";

const M = window.MathEvaluator;
const DT = window.DevToolsMain;
const $ = (id) => document.getElementById(id);

const HISTORY_LIMIT = 50;
const MODES = ["expression", "percentage"];
const SAMPLES = [
  "sqrt(81) + 0xff",
  "0.1 + 0.2",
  "(1 + sqrt(5)) / 2",
  "2n^64n - 1n",
  "hypot(3, 4) * tau",
  "25n!",
  "log10(1000) + max(2, 5)",
];
const TRIG = /\b(?:a?sin|a?cos|a?tan|atan2)\s*\(/;

const COPY_ICON =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
// Tool-specific glyph: a plus over a list line, "keep this in history".
const KEEP_ICON =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M4 12h9M4 17h6"/><path d="M18 11v8M14 15h8"/></svg>';

const input = $("expression");
const resultEl = $("result");
const readout = $("readout");
const exactRow = $("exactRow");
const exactValue = $("exactValue");
const basesEl = $("bases");
const exprStatus = $("exprStatus");
const exprCount = $("exprCount");
const historyList = $("history");
const historyEmpty = $("historyEmpty");
const historyCount = $("historyCount");
const clearHistoryBtn = $("clearHistory");
const pctStatus = $("pctStatus");

const state = {
  mode: "expression",
  angle: "rad",
  sample: 0,
  // latest successful evaluation of the expression input, or null
  current: null,
};

const history = [];

function toast(message, type = "success") {
  DT.showToast(message, type);
}

function copy(text, message = "Copied to clipboard") {
  if (!text) {
    toast("Nothing to copy yet", "error");
    return;
  }
  DT.copyText(text).then(
    () => toast(message, "success"),
    () => toast("Could not copy", "error"),
  );
}

function setStatus(node, message, tone = "") {
  node.textContent = message;
  node.className = `status-text${tone ? ` ${tone}` : ""}`;
}

/* --- Palette -------------------------------------------------------------- */

const PALETTE = [
  { group: "Functions", items: ["sqrt", "cbrt", "sin", "cos", "tan", "asin", "acos", "atan", "ln", "log10", "exp", "abs", "round", "floor", "ceil", "min", "max", "hypot", "pow"] },
  { group: "Constants", items: ["pi", "tau", "e"] },
  { group: "Operators", items: ["^", "%", "!", "(", ")"] },
];

function buildPalette() {
  const palette = $("palette");
  for (const { group, items } of PALETTE) {
    for (const item of items) {
      const kind = group === "Functions" ? "fn" : group === "Constants" ? "const" : "op";
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip chip-${kind}`;
      chip.dataset.insert = item;
      chip.dataset.kind = kind;
      if (kind === "fn") {
        chip.innerHTML = `<span></span><span class="chip-paren">(</span>`;
        chip.firstChild.textContent = item;
        chip.setAttribute("aria-label", `Insert ${item}()`);
      } else {
        chip.textContent = item;
        chip.setAttribute("aria-label", `Insert ${item}`);
      }
      palette.appendChild(chip);
    }
  }
  // Keep the caret and selection in the textarea while a chip is pressed.
  palette.addEventListener("mousedown", (event) => {
    if (event.target.closest(".chip")) event.preventDefault();
  });
  palette.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip) insertToken(chip.dataset.insert, chip.dataset.kind);
  });
}

// A function wraps the selection, or leaves the caret between its
// parentheses; anything else replaces the selection.
function insertToken(token, kind) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const selected = input.value.slice(start, end);
  let text = token;
  let caret;
  if (kind === "fn") {
    text = `${token}(${selected})`;
    caret = selected ? start + text.length : start + token.length + 1;
  } else {
    caret = start + text.length;
  }
  input.focus();
  input.setRangeText(text, start, end, "end");
  input.setSelectionRange(caret, caret);
  evaluateExpression();
}

/* --- Expression ----------------------------------------------------------- */

function autosize() {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight + 2}px`;
}

const BASES = [
  { key: "hex", label: "Hex" },
  { key: "octal", label: "Octal" },
  { key: "binary", label: "Binary" },
];

function buildBases() {
  for (const { key, label } of BASES) {
    const row = document.createElement("div");
    row.className = "command";
    row.innerHTML = `<span class="command-label"></span><code class="command-text"></code><button class="action-btn" type="button" data-tooltip="Copy">${COPY_ICON}</button>`;
    row.querySelector(".command-label").textContent = label;
    row.querySelector(".command-text").id = `base-${key}`;
    const button = row.querySelector(".action-btn");
    button.id = `copy-${key}`;
    button.setAttribute("aria-label", `Copy ${label.toLowerCase()} value`);
    button.addEventListener("click", () => copy(row.querySelector(".command-text").textContent, `${label} copied`));
    basesEl.appendChild(row);
  }
}

function renderBases(bases) {
  basesEl.classList.toggle("is-empty", !bases);
  for (const { key } of BASES) {
    const code = $(`base-${key}`);
    code.textContent = bases ? bases[key] : "";
    $(`copy-${key}`).disabled = !bases;
  }
}

function clearResult() {
  state.current = null;
  resultEl.textContent = "";
  readout.classList.add("is-empty");
  exactRow.hidden = true;
  $("copyResult").disabled = true;
  renderBases(null);
}

function evaluateExpression() {
  autosize();
  const source = input.value;
  exprCount.textContent = `${source.length} / ${M.LIMITS.length} chars`;
  readout.classList.remove("is-error");

  if (!source.trim()) {
    clearResult();
    setStatus(exprStatus, "Type an expression. Results update as you type.");
    return;
  }

  let value;
  try {
    value = M.evaluate(source, { angle: state.angle });
  } catch (error) {
    clearResult();
    readout.classList.add("is-error");
    const where = Number.isInteger(error.position) ? `Col ${error.position + 1}: ` : "";
    setStatus(exprStatus, `${where}${error.message}`, "error");
    return;
  }

  const display = M.format(value);
  const exact = M.exact(value);
  state.current = { expr: source.trim(), display, exact, angle: state.angle };

  resultEl.textContent = display;
  readout.classList.remove("is-empty");
  $("copyResult").disabled = false;

  exactRow.hidden = false;
  exactValue.textContent = exact;
  exactRow.classList.toggle("is-rounded", exact !== display);
  exactRow.querySelector(".readout-exact-label").textContent = exact !== display ? "Exact float" : "Exact";

  renderBases(M.bases(value));

  const angleNote = TRIG.test(source) ? ` · ${state.angle.toUpperCase()}` : "";
  if (typeof value === "bigint") {
    const bits = (value < 0n ? -value : value).toString(2).length;
    setStatus(exprStatus, `BigInt · ${bits} bit${bits === 1 ? "" : "s"} · Enter to keep`, "success");
  } else if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    setStatus(exprStatus, "Above 2^53, so not exact. Use n literals for BigInt.", "warning");
  } else {
    setStatus(exprStatus, `${exact !== display ? "Rounded to 15 digits" : "Exact"}${angleNote} · Enter to keep`, "success");
  }
}

function commitExpression() {
  if (!state.current) {
    input.focus();
    return;
  }
  const { expr, display, exact, angle } = state.current;
  addHistory({
    kind: "expr",
    expr,
    result: display,
    exact,
    angle: TRIG.test(expr) ? angle : null,
  });
}

function setAngle(angle) {
  state.angle = angle === "deg" ? "deg" : "rad";
  document.querySelectorAll("#angleSwitch .segment-btn").forEach((button) => {
    const active = button.dataset.angle === state.angle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  evaluateExpression();
}

/* --- Percentages ---------------------------------------------------------- */

// Each calculator is a sentence with fields in it. `compute` returns the
// answer or throws a message that is shown under the card.
const CALCS = [
  {
    id: "ratio",
    title: "X is what % of Y",
    sentence: ["a", " is what % of ", "b"],
    fields: { a: { label: "X", value: "25" }, b: { label: "Y", value: "100" } },
    formula: "X ÷ Y × 100",
    compute: ({ a, b }) => {
      if (b === 0) throw new Error("Y is zero, and a percentage of zero is undefined.");
      return { value: (a / b) * 100, unit: "%" };
    },
    describe: ({ a, b }) => `${a} is what % of ${b}`,
  },
  {
    id: "change",
    title: "% change from A to B",
    sentence: ["From ", "a", " to ", "b"],
    fields: { a: { label: "A (start)", value: "25" }, b: { label: "B (end)", value: "100" } },
    formula: "(B − A) ÷ |A| × 100",
    compute: ({ a, b }) => {
      if (a === 0) throw new Error("The starting value is zero, so a percentage change is undefined.");
      const value = ((b - a) / Math.abs(a)) * 100;
      const delta = M.format(Math.abs(b - a));
      const note = value > 0 ? `Increase of ${delta}` : value < 0 ? `Decrease of ${delta}` : "No change";
      return { value, unit: "%", note, tone: value > 0 ? "up" : value < 0 ? "down" : "" };
    },
    describe: ({ a, b }) => `% change ${a} → ${b}`,
  },
  {
    id: "of",
    title: "X% of Y",
    sentence: ["a", "% of ", "b"],
    fields: { a: { label: "X (percent)", value: "15" }, b: { label: "Y", value: "80" } },
    formula: "X ÷ 100 × Y",
    compute: ({ a, b }) => ({ value: (a / 100) * b, unit: "" }),
    describe: ({ a, b }) => `${a}% of ${b}`,
  },
  {
    id: "adjust",
    title: "Y increased or decreased by X%",
    sentence: ["b", "dir", "a", "%"],
    fields: { b: { label: "Y", value: "80" }, a: { label: "X (percent)", value: "15" } },
    formula: "Y × (1 ± X ÷ 100)",
    compute: ({ a, b }, dir) => {
      const change = (b * a) / 100;
      const value = dir === "down" ? b - change : b + change;
      return { value, unit: "", note: `${dir === "down" ? "−" : "+"}${M.format(Math.abs(change))}` };
    },
    describe: ({ a, b }, dir) => `${b} ${dir === "down" ? "decreased" : "increased"} by ${a}%`,
  },
];

const calcState = Object.fromEntries(CALCS.map((calc) => [calc.id, { dir: "up", answer: null }]));

function buildCalcs() {
  const grid = $("calcGrid");
  for (const calc of CALCS) {
    const card = document.createElement("article");
    card.className = "calc";
    card.dataset.calc = calc.id;
    card.innerHTML = `
      <div class="calc-head">
        <div class="calc-heading">
          <h3 class="calc-title"></h3>
          <span class="calc-formula"></span>
        </div>
        <div class="action-group">
          <button class="action-btn" type="button" data-calc-action="copy" data-tooltip="Copy answer">${COPY_ICON}</button>
          <button class="action-btn" type="button" data-calc-action="keep" data-tooltip="Add to history">${KEEP_ICON}</button>
        </div>
      </div>
      <div class="calc-sentence"></div>
      <div class="calc-answer">
        <span class="calc-note"></span>
        <output class="calc-value" aria-live="polite"></output>
      </div>
      <p class="calc-error" role="status"></p>`;
    card.querySelector(".calc-title").textContent = calc.title;
    card.querySelector(".calc-formula").textContent = calc.formula;
    card.querySelector(".calc-value").id = `pct-${calc.id}-value`;
    card.querySelector(".calc-error").id = `pct-${calc.id}-error`;
    const [copyBtn, keepBtn] = card.querySelectorAll("[data-calc-action]");
    copyBtn.id = `pct-${calc.id}-copy`;
    copyBtn.setAttribute("aria-label", `Copy the answer to ${calc.title}`);
    keepBtn.id = `pct-${calc.id}-keep`;
    keepBtn.setAttribute("aria-label", `Add ${calc.title} to history`);

    const sentence = card.querySelector(".calc-sentence");
    for (const part of calc.sentence) {
      if (part === "dir") {
        sentence.appendChild(buildDirection(calc));
      } else if (calc.fields[part]) {
        const field = document.createElement("input");
        field.type = "text";
        field.inputMode = "decimal";
        field.autocomplete = "off";
        field.spellcheck = false;
        field.className = "calc-input";
        field.id = `pct-${calc.id}-${part}`;
        field.dataset.field = part;
        field.value = calc.fields[part].value;
        field.setAttribute("aria-label", `${calc.title}: ${calc.fields[part].label}`);
        field.setAttribute("aria-describedby", `pct-${calc.id}-error`);
        sentence.appendChild(field);
      } else {
        const text = document.createElement("span");
        text.className = "calc-word";
        text.textContent = part;
        sentence.appendChild(text);
      }
    }

    card.addEventListener("input", () => computeCalc(calc));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target.matches(".calc-input")) {
        event.preventDefault();
        keepCalc(calc);
      }
    });
    copyBtn.addEventListener("click", () => copy(calcState[calc.id].answer?.text, "Answer copied"));
    keepBtn.addEventListener("click", () => keepCalc(calc));
    grid.appendChild(card);
  }
}

function buildDirection(calc) {
  const segment = document.createElement("div");
  segment.className = "segment calc-dir";
  segment.setAttribute("role", "group");
  segment.setAttribute("aria-label", "Direction");
  for (const [dir, label] of [["up", "increased by"], ["down", "decreased by"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `segment-btn${dir === "up" ? " active" : ""}`;
    button.dataset.dir = dir;
    button.id = `pct-${calc.id}-${dir}`;
    button.setAttribute("aria-pressed", String(dir === "up"));
    button.textContent = label;
    button.addEventListener("click", () => {
      calcState[calc.id].dir = dir;
      segment.querySelectorAll(".segment-btn").forEach((other) => {
        const active = other === button;
        other.classList.toggle("active", active);
        other.setAttribute("aria-pressed", String(active));
      });
      computeCalc(calc);
    });
    segment.appendChild(button);
  }
  return segment;
}

// Fields accept expressions too, so "1/3" or "2^10" work as values.
function readField(field) {
  const raw = field.value.trim();
  if (!raw) return { empty: true };
  const value = M.evaluate(raw);
  return { value: typeof value === "bigint" ? Number(value) : value };
}

function computeCalc(calc) {
  const card = document.querySelector(`[data-calc="${calc.id}"]`);
  const valueEl = card.querySelector(".calc-value");
  const noteEl = card.querySelector(".calc-note");
  const errorEl = card.querySelector(".calc-error");
  const store = calcState[calc.id];
  store.answer = null;
  card.classList.remove("is-error", "is-up", "is-down");
  errorEl.textContent = "";
  noteEl.textContent = "";
  valueEl.textContent = "";

  const values = {};
  let missing = false;
  try {
    for (const field of card.querySelectorAll(".calc-input")) {
      const parsed = readField(field);
      if (parsed.empty) missing = true;
      else values[field.dataset.field] = parsed.value;
    }
    if (missing) {
      noteEl.textContent = "Enter both values";
      return;
    }
    const answer = calc.compute(values, store.dir);
    if (!Number.isFinite(answer.value)) throw new Error("The answer is not a finite number.");
    const text = `${M.format(answer.value)}${answer.unit}`;
    valueEl.textContent = text;
    noteEl.textContent = answer.note || "";
    if (answer.tone) card.classList.add(`is-${answer.tone}`);
    store.answer = { text, label: calc.describe(values, store.dir), values: { ...values } };
  } catch (error) {
    card.classList.add("is-error");
    errorEl.textContent = error.message;
  }
}

function keepCalc(calc) {
  const answer = calcState[calc.id].answer;
  if (!answer) {
    setStatus(pctStatus, "Fix the inputs first; there is no answer to keep.", "error");
    return;
  }
  const fields = {};
  document.querySelectorAll(`[data-calc="${calc.id}"] .calc-input`).forEach((field) => {
    fields[field.dataset.field] = field.value.trim();
  });
  addHistory({ kind: "pct", calc: calc.id, dir: calcState[calc.id].dir, fields, expr: answer.label, result: answer.text, exact: answer.text });
  setStatus(pctStatus, `Kept “${answer.label} = ${answer.text}”`, "success");
}

function setCalcDirection(calc, dir) {
  const button = $(`pct-${calc.id}-${dir}`);
  if (button) button.click();
}

function resetCalcs() {
  for (const calc of CALCS) {
    for (const [key, { value }] of Object.entries(calc.fields)) $(`pct-${calc.id}-${key}`).value = value;
    setCalcDirection(calc, "up");
    computeCalc(calc);
  }
  setStatus(pctStatus, "Answers update as you type · Enter adds one to history");
}

/* --- History -------------------------------------------------------------- */

function addHistory(entry) {
  const top = history[0];
  if (top && top.expr === entry.expr && top.result === entry.result && top.angle === entry.angle) {
    flashEntry(0);
    return;
  }
  history.unshift(entry);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  renderHistory();
  flashEntry(0);
}

function flashEntry(index) {
  const node = historyList.children[index];
  if (!node) return;
  node.classList.remove("is-new");
  void node.offsetWidth;
  node.classList.add("is-new");
}

function renderHistory() {
  historyList.replaceChildren(
    ...history.map((entry, index) => {
      const item = document.createElement("li");
      item.className = "history-entry";
      item.innerHTML = `
        <button class="history-load" type="button">
          <span class="history-expr"></span>
          <span class="history-result"></span>
        </button>
        <button class="action-btn" type="button" data-tooltip="Copy result">${COPY_ICON}</button>`;
      const load = item.querySelector(".history-load");
      load.dataset.index = String(index);
      load.setAttribute("aria-label", `Load ${entry.expr} = ${entry.result}`);
      const exprEl = item.querySelector(".history-expr");
      exprEl.textContent = entry.expr;
      if (entry.angle) {
        const tag = document.createElement("span");
        tag.className = "history-tag";
        tag.textContent = entry.angle.toUpperCase();
        exprEl.append(" ", tag);
      }
      if (entry.kind === "pct") item.classList.add("is-pct");
      item.querySelector(".history-result").textContent = `= ${entry.result}`;
      const copyBtn = item.querySelector(".action-btn");
      copyBtn.setAttribute("aria-label", `Copy ${entry.result}`);
      copyBtn.addEventListener("click", () => copy(entry.result, "Result copied"));
      load.addEventListener("click", () => loadEntry(entry));
      return item;
    }),
  );
  const count = history.length;
  historyEmpty.hidden = count > 0;
  historyList.hidden = count === 0;
  clearHistoryBtn.disabled = count === 0;
  historyCount.textContent = `${count} / ${HISTORY_LIMIT}`;
  $("historyStatus").textContent = count ? "Click an entry to load it back" : "This session only";
}

function loadEntry(entry) {
  if (entry.kind === "pct") {
    const calc = CALCS.find((candidate) => candidate.id === entry.calc);
    setMode("percentage");
    for (const [key, value] of Object.entries(entry.fields)) $(`pct-${calc.id}-${key}`).value = value;
    setCalcDirection(calc, entry.dir);
    computeCalc(calc);
    const first = document.querySelector(`[data-calc="${calc.id}"] .calc-input`);
    first.focus();
    first.select();
    return;
  }
  setMode("expression");
  if (entry.angle) setAngle(entry.angle);
  input.value = entry.expr;
  evaluateExpression();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

/* --- Modes ---------------------------------------------------------------- */

function setMode(mode, { write = true } = {}) {
  state.mode = MODES.includes(mode) ? mode : "expression";
  document.querySelectorAll(".mode-btn[data-mode]").forEach((tab) => {
    const active = tab.dataset.mode === state.mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $("expressionPanel").hidden = state.mode !== "expression";
  $("percentagePanel").hidden = state.mode !== "percentage";
  if (write) DT.writeHashState(state.mode);
}

const tabs = [...document.querySelectorAll(".mode-btn[data-mode]")];
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
  tab.addEventListener("keydown", (event) => {
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const target = tabs[(moves[event.key] + tabs.length) % tabs.length];
    setMode(target.dataset.mode);
    target.focus();
  });
});

/* --- Wiring --------------------------------------------------------------- */

input.addEventListener("input", evaluateExpression);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    commitExpression();
  }
});

document.querySelectorAll("#angleSwitch .segment-btn").forEach((button) => {
  button.addEventListener("click", () => setAngle(button.dataset.angle));
});

document.querySelector('[data-action="sample"]').addEventListener("click", () => {
  state.sample = (state.sample + 1) % SAMPLES.length;
  input.value = SAMPLES[state.sample];
  evaluateExpression();
  input.focus();
});

document.querySelector('[data-action="paste"]').addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      toast("Clipboard is empty", "warning");
      return;
    }
    input.value = text.replace(/\s+$/, "").slice(0, M.LIMITS.length);
    evaluateExpression();
    input.focus();
  } catch {
    toast("Clipboard access was blocked", "error");
  }
});

document.querySelector('[data-action="clear"]').addEventListener("click", () => {
  input.value = "";
  evaluateExpression();
  input.focus();
});

document.querySelector('[data-action="pct-reset"]').addEventListener("click", resetCalcs);

$("copyResult").addEventListener("click", () => copy(state.current?.display, "Result copied"));
$("copyExact").addEventListener("click", () => copy(state.current?.exact, "Exact value copied"));

clearHistoryBtn.addEventListener("click", () => {
  history.length = 0;
  renderHistory();
  toast("History cleared", "info");
});

window.addEventListener("resize", autosize);

buildPalette();
buildBases();
buildCalcs();
CALCS.forEach(computeCalc);
renderHistory();

setMode(DT.readHashState(), { write: false });
DT.onHashState((value) => setMode(value, { write: false }));
evaluateExpression();
