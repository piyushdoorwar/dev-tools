// Text Utilities — line cleaning, counting and placeholder copy.
//
// Three jobs share one page because they share one input: the text you paste
// to count is the text you want deduped, and the lorem you generate is text
// you immediately want counted. The mode only decides which panel is showing.

const input = document.getElementById("input");
const output = document.getElementById("output");
const pipelineNode = document.getElementById("pipeline");
const statGrid = document.getElementById("stat-grid");
const frequencyNode = document.getElementById("frequency");
const loremPreview = document.getElementById("lorem-preview");
const loremCount = document.getElementById("lorem-count");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const chips = {
  words: document.getElementById("chip-words"),
  chars: document.getElementById("chip-chars"),
  lines: document.getElementById("chip-lines"),
  tokens: document.getElementById("chip-tokens"),
};

const MODES = {
  clean: { panel: "clean-panel", tab: "tab-clean", title: "Text Cleaner — sort, dedupe and trim lines" },
  count: { panel: "count-panel", tab: "tab-count", title: "Word, Character and Token Counter" },
  lorem: { panel: "lorem-panel", tab: "tab-lorem", title: "Lorem Ipsum Generator" },
};

const state = {
  mode: "clean",
  sort: "none",
  letterCase: "keep",
  loremUnit: "paragraphs",
};

const SAMPLE = `the quick brown fox
The Quick Brown Fox
  jumps over the lazy dog

jumps over the lazy dog
A sentence about foxes, dogs and nothing else.`;

/* --- Counting ----------------------------------------------------------- */

// Word characters for counting purposes: letters and digits in any script,
// plus the apostrophes that sit inside a word ("don't" is one word).
const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

// Rough byte-pair estimate. Real tokenizers split on learned merges, which no
// regex reproduces, but "a word costs about one token per four characters and
// every punctuation mark or newline costs one" tracks GPT-style encoders on
// English prose closely enough to budget a prompt.
function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const piece of text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]|\n/gu) || []) {
    // Round rather than ceil: a five-letter word such as "quick" is one token
    // in practice, and rounding up every short word overshot real counts by
    // about a third on ordinary prose.
    tokens += /[\p{L}\p{N}]/u.test(piece) ? Math.max(1, Math.round(piece.length / 4)) : 1;
  }
  return tokens;
}

function duration(words, perMinute) {
  if (words === 0) return "0 sec";
  const seconds = Math.round((words / perMinute) * 60);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
}

function analyse(text) {
  const words = text.match(WORD_RE) || [];
  const lowered = words.map((word) => word.toLowerCase());
  const lines = text === "" ? [] : text.split(/\r?\n/);
  const sentences = text.match(/[^\s.!?…][^.!?…]*[.!?…]+/g) || [];
  const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim() !== "");
  const letters = [...text];

  return {
    characters: letters.length,
    charactersNoSpaces: letters.filter((character) => !/\s/.test(character)).length,
    words: words.length,
    uniqueWords: new Set(lowered).size,
    sentences: sentences.length || (words.length ? 1 : 0),
    paragraphs: paragraphs.length,
    lines: lines.length,
    longestLine: lines.reduce((longest, line) => Math.max(longest, [...line].length), 0),
    averageWord: words.length
      ? (words.reduce((total, word) => total + word.length, 0) / words.length).toFixed(1)
      : "0",
    tokens: estimateTokens(text),
    readingTime: duration(words.length, 200),
    speakingTime: duration(words.length, 130),
    frequency: topWords(lowered),
  };
}

function topWords(lowered, limit = 10) {
  const counts = new Map();
  for (const word of lowered) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

/* --- Cleaning ----------------------------------------------------------- */

const readOps = () => ({
  trim: document.getElementById("op-trim").checked,
  collapse: document.getElementById("op-collapse").checked,
  empty: document.getElementById("op-empty").checked,
  dedupe: document.getElementById("op-dedupe").checked,
  ignoreCase: document.getElementById("op-ignore-case").checked,
  number: document.getElementById("op-number").checked,
  sort: state.sort,
  letterCase: state.letterCase,
});

const SORT_LABELS = {
  none: "", asc: "Sort A → Z", desc: "Sort Z → A",
  "length-asc": "Sort shortest first", "length-desc": "Sort longest first",
  reverse: "Reverse", shuffle: "Shuffle",
};

const CASE_LABELS = {
  keep: "", lower: "lower case", upper: "UPPER CASE",
  title: "Title Case", sentence: "Sentence case",
};

function titleCase(line) {
  return line.replace(WORD_RE, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function sentenceCase(line) {
  // A new sentence starts at the beginning and after . ! ? …
  return line.toLowerCase().replace(/(^\s*|[.!?…]\s+)(\p{L})/gu,
    (match, lead, letter) => lead + letter.toUpperCase());
}

function recase(line, mode) {
  if (mode === "lower") return line.toLowerCase();
  if (mode === "upper") return line.toUpperCase();
  if (mode === "title") return titleCase(line);
  if (mode === "sentence") return sentenceCase(line);
  return line;
}

function sortLines(lines, order, ignoreCase) {
  const compare = (a, b) => (ignoreCase
    ? a.localeCompare(b, undefined, { sensitivity: "base" })
    : a.localeCompare(b));

  if (order === "asc") return [...lines].sort(compare);
  if (order === "desc") return [...lines].sort((a, b) => compare(b, a));
  if (order === "length-asc") return [...lines].sort((a, b) => a.length - b.length || compare(a, b));
  if (order === "length-desc") return [...lines].sort((a, b) => b.length - a.length || compare(a, b));
  if (order === "reverse") return [...lines].reverse();
  if (order === "shuffle") {
    const shuffled = [...lines];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return shuffled;
  }
  return lines;
}

// Fixed order, because the alternative — applying operations in the order the
// boxes were ticked — makes the same settings produce different output.
function applyOps(text, ops) {
  if (text === "") return "";
  let lines = text.split(/\r?\n/);

  if (ops.trim) lines = lines.map((line) => line.trim());
  if (ops.collapse) lines = lines.map((line) => line.replace(/[^\S\r\n]+/g, " "));
  if (ops.empty) lines = lines.filter((line) => line.trim() !== "");

  if (ops.dedupe) {
    const seen = new Set();
    lines = lines.filter((line) => {
      const key = ops.ignoreCase ? line.toLowerCase() : line;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  lines = sortLines(lines, ops.sort, ops.ignoreCase);
  if (ops.letterCase !== "keep") lines = lines.map((line) => recase(line, ops.letterCase));

  if (ops.number) {
    const width = String(lines.length).length;
    lines = lines.map((line, index) => `${String(index + 1).padStart(width, " ")}. ${line}`);
  }

  return lines.join("\n");
}

function pipelineLabel(ops) {
  const steps = [];
  if (ops.trim) steps.push("Trim");
  if (ops.collapse) steps.push("Collapse spaces");
  if (ops.empty) steps.push("Remove empty lines");
  if (ops.dedupe) steps.push(ops.ignoreCase ? "Remove duplicates (ignoring case)" : "Remove duplicates");
  if (SORT_LABELS[ops.sort]) steps.push(SORT_LABELS[ops.sort]);
  if (CASE_LABELS[ops.letterCase]) steps.push(CASE_LABELS[ops.letterCase]);
  if (ops.number) steps.push("Number lines");
  return steps;
}

/* --- Lorem -------------------------------------------------------------- */

const LOREM_WORDS = ("lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor "
  + "incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation "
  + "ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit "
  + "voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non "
  + "proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium "
  + "tincidunt lacus nulla gravida orci a odio vivamus hendrerit mauris phasellus porta fusce "
  + "suscipit varius mi cum sociis natoque penatibus magnis dis parturient montes nascetur "
  + "ridiculus mus").split(" ");

const CLASSIC_OPENING = "Lorem ipsum dolor sit amet, consectetur adipiscing elit";

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const randomWord = () => LOREM_WORDS[randomInt(0, LOREM_WORDS.length - 1)];

function loremWords(count) {
  return Array.from({ length: count }, randomWord);
}

function loremSentence() {
  const words = loremWords(randomInt(6, 14));
  const body = words.join(" ").replace(/^./, (character) => character.toUpperCase());
  // A comma somewhere in the middle keeps the rhythm of real prose.
  const withComma = words.length > 8
    ? body.replace(new RegExp(`^((?:\\S+\\s){${randomInt(3, 5)}})`), "$1, ").replace(" , ", ", ")
    : body;
  return `${withComma}.`;
}

function loremParagraph() {
  return Array.from({ length: randomInt(3, 6) }, loremSentence).join(" ");
}

function generateLorem(count, unit, classic) {
  let text;
  if (unit === "words") text = loremWords(count).join(" ");
  else if (unit === "sentences") text = Array.from({ length: count }, loremSentence).join(" ");
  else if (unit === "list") text = Array.from({ length: count }, () => loremWords(randomInt(3, 8)).join(" ")).join("\n");
  else text = Array.from({ length: count }, loremParagraph).join("\n\n");

  if (!classic) return text;
  if (unit === "words") {
    const opening = CLASSIC_OPENING.toLowerCase().replace(/,/g, "").split(" ");
    return [...opening.slice(0, count), ...loremWords(Math.max(0, count - opening.length))].join(" ");
  }
  // Replace the first sentence rather than prepending one, so the requested
  // count still matches what comes out.
  return text.replace(/^[^.\n]*/, CLASSIC_OPENING);
}

/* --- Rendering ---------------------------------------------------------- */

const STAT_ROWS = [
  ["Characters", "characters"],
  ["Characters (no spaces)", "charactersNoSpaces"],
  ["Words", "words"],
  ["Unique words", "uniqueWords"],
  ["Sentences", "sentences"],
  ["Paragraphs", "paragraphs"],
  ["Lines", "lines"],
  ["Longest line", "longestLine"],
  ["Average word length", "averageWord"],
  ["Tokens (estimate)", "tokens"],
  ["Reading time", "readingTime"],
  ["Speaking time", "speakingTime"],
];

function renderStats(stats) {
  chips.words.textContent = stats.words.toLocaleString();
  chips.chars.textContent = stats.characters.toLocaleString();
  chips.lines.textContent = stats.lines.toLocaleString();
  chips.tokens.textContent = stats.tokens.toLocaleString();

  statGrid.innerHTML = "";
  for (const [label, key] of STAT_ROWS) {
    const cell = document.createElement("div");
    cell.className = "stat-cell";
    cell.dataset.stat = key;

    const value = document.createElement("span");
    value.className = "stat-cell-value";
    value.textContent = typeof stats[key] === "number" ? stats[key].toLocaleString() : stats[key];

    const name = document.createElement("span");
    name.className = "stat-cell-label";
    name.textContent = label;

    cell.append(value, name);
    statGrid.appendChild(cell);
  }

  renderFrequency(stats.frequency, stats.words);
}

function renderFrequency(frequency, total) {
  frequencyNode.innerHTML = "";
  if (frequency.length === 0) {
    frequencyNode.innerHTML = '<p class="empty-state">Word frequencies appear once there is text to count.</p>';
    return;
  }
  const highest = frequency[0][1];
  for (const [word, count] of frequency) {
    const row = document.createElement("div");
    row.className = "frequency-row";

    const name = document.createElement("span");
    name.className = "frequency-word";
    name.textContent = word;

    const bar = document.createElement("span");
    bar.className = "frequency-bar";
    const fill = document.createElement("span");
    fill.className = "frequency-fill";
    fill.style.width = `${(count / highest) * 100}%`;
    bar.appendChild(fill);

    const value = document.createElement("span");
    value.className = "frequency-count";
    value.textContent = total ? `${count} · ${Math.round((count / total) * 100)}%` : String(count);

    row.append(name, bar, value);
    frequencyNode.appendChild(row);
  }
}

function render() {
  const text = input.value;
  const ops = readOps();

  output.value = applyOps(text, ops);

  const steps = pipelineLabel(ops);
  pipelineNode.textContent = steps.length
    ? `Applied in order: ${steps.join(" → ")}`
    : "No changes — the output matches the input.";
  pipelineNode.classList.toggle("is-set", steps.length > 0);

  renderStats(analyse(text));
}

/* --- Modes -------------------------------------------------------------- */

function setMode(mode, { pushHash = true } = {}) {
  if (!MODES[mode]) return;
  state.mode = mode;

  for (const [name, config] of Object.entries(MODES)) {
    const active = name === mode;
    document.getElementById(config.panel).hidden = !active;
    const tab = document.getElementById(config.tab);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  document.title = MODES[mode].title;
  if (pushHash && window.location.hash.slice(1) !== mode) window.location.hash = mode;
}

/* --- Actions ------------------------------------------------------------ */

function download(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "text-utilities.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const ACTIONS = {
  sample() {
    input.value = SAMPLE;
    render();
    window.DevToolsMain.showToast("Sample text inserted", "info");
  },

  clear() {
    input.value = "";
    render();
    window.DevToolsMain.showToast("Cleared", "info");
  },

  async paste() {
    try {
      input.value = await navigator.clipboard.readText();
      render();
    } catch {
      input.focus();
      window.DevToolsMain.showToast("Clipboard is not available", "error");
    }
  },

  "copy-input"() {
    if (!copyGuard(input.value)) return;
    window.DevToolsMain.copyText(input.value);
    window.DevToolsMain.showToast("Input copied", "success");
  },

  "copy-output"() {
    if (!copyGuard(output.value)) return;
    window.DevToolsMain.copyText(output.value);
    window.DevToolsMain.showToast("Output copied", "success");
  },

  "copy-stats"() {
    if (!copyGuard(input.value)) return;
    const stats = analyse(input.value);
    const text = STAT_ROWS.map(([label, key]) => `${label}: ${stats[key]}`).join("\n");
    window.DevToolsMain.copyText(text);
    window.DevToolsMain.showToast("Counts copied", "success");
  },

  "apply-to-input"() {
    if (!copyGuard(output.value)) return;
    input.value = output.value;
    render();
    window.DevToolsMain.showToast("Input replaced with the cleaned text", "success");
  },

  download() {
    if (!copyGuard(output.value, "Nothing to download")) return;
    download(output.value);
    window.DevToolsMain.showToast("Downloaded", "success");
  },

  generate() {
    const requested = Number(loremCount.value);
    const count = Math.min(200, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1));
    loremCount.value = String(count);

    const text = generateLorem(count, state.loremUnit, document.getElementById("lorem-classic").checked);
    const append = document.getElementById("lorem-append").checked;
    input.value = append && input.value.trim() ? `${input.value.replace(/\s*$/, "")}\n\n${text}` : text;
    render();

    loremPreview.textContent = `Generated ${count} ${count === 1 ? state.loremUnit.replace(/s$/, "") : state.loremUnit}, ${analyse(text).words} words.`;
    window.DevToolsMain.showToast("Placeholder text generated", "success");
  },
};

function copyGuard(value, message = "Nothing to copy") {
  if (value.trim()) return true;
  window.DevToolsMain.showToast(message, "error");
  return false;
}

/* --- Wiring ------------------------------------------------------------- */

input.addEventListener("input", render);

document.querySelectorAll(".ops input[type='checkbox']").forEach((box) => {
  box.addEventListener("change", render);
});

document.getElementById("sort-dropdown").addEventListener("dd:change", (event) => {
  state.sort = event.detail.value;
  render();
});

document.getElementById("case-dropdown").addEventListener("dd:change", (event) => {
  state.letterCase = event.detail.value;
  render();
});

document.getElementById("unit-dropdown").addEventListener("dd:change", (event) => {
  state.loremUnit = event.detail.value;
});

document.querySelectorAll(".mode-btn").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

window.addEventListener("hashchange", () => {
  const mode = window.location.hash.slice(1);
  if (MODES[mode] && mode !== state.mode) setMode(mode, { pushHash: false });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.());
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function init() {
  const hash = window.location.hash.slice(1);
  setMode(MODES[hash] ? hash : "clean", { pushHash: false });
  render();
}

init();
