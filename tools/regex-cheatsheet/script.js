// Regex Cheat Sheet — syntax reference and a tested pattern library.
//
// The companion to the Regex Tester: this page is what you read, that page is
// where you experiment. "Test it" hands a pattern, its flags and its sample
// lines straight to the tester through DevToolsMain.openTool, so nothing has
// to be retyped.

const SECTIONS = globalThis.REGEX_CHEATSHEET;
const PATTERNS = globalThis.REGEX_PATTERNS;

const searchInput = document.getElementById("search");
const sectionsNode = document.getElementById("sections");
const patternListNode = document.getElementById("pattern-list");
const countNode = document.getElementById("result-count");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const MODES = {
  syntax: { panel: "syntax-panel", tab: "tab-syntax", title: "Regex Cheat Sheet — JavaScript syntax reference" },
  patterns: { panel: "patterns-panel", tab: "tab-patterns", title: "Regex Patterns Library — tested regular expressions" },
};

const state = { mode: "syntax", query: "" };

const haystack = (parts) => parts.filter(Boolean).join(" ").toLowerCase();

const ROW_TEXT = new Map();
for (const section of SECTIONS) {
  for (const row of section.rows) {
    ROW_TEXT.set(row, haystack([section.title, row.token, row.meaning, row.example]));
  }
}

const PATTERN_TEXT = new Map(PATTERNS.map((entry) => [entry.id, haystack([
  entry.name, entry.category, entry.pattern, entry.description, entry.note,
  ...entry.good, ...entry.bad,
])]));

// Every term has to appear somewhere, in any order: "lazy quantifier" should
// find the row even though it is written "Lazy versions".
function matchesQuery(text) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return query.split(/\s+/).filter(Boolean).every((term) => text.includes(term));
}

/* --- Syntax ------------------------------------------------------------- */

// Notes use `backticks` for inline code. Build nodes rather than markup so the
// data can never inject anything.
function withCode(text, target) {
  for (const [index, part] of text.split(/`([^`]+)`/).entries()) {
    if (part === "") continue;
    if (index % 2 === 1) {
      const code = document.createElement("code");
      code.className = "inline-code";
      code.textContent = part;
      target.appendChild(code);
    } else {
      target.appendChild(document.createTextNode(part));
    }
  }
  return target;
}

function syntaxRow(row) {
  const item = document.createElement("div");
  item.className = "syntax-row";

  const token = document.createElement("code");
  token.className = "syntax-token";
  token.textContent = row.token;

  const meaning = document.createElement("p");
  meaning.className = "syntax-meaning";
  withCode(row.meaning, meaning);

  const example = document.createElement("code");
  example.className = "syntax-example";
  example.textContent = row.example;

  const copy = document.createElement("button");
  copy.className = "action-btn syntax-copy";
  copy.type = "button";
  copy.dataset.tooltip = "Copy token";
  copy.setAttribute("aria-label", `Copy ${row.token}`);
  copy.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
  copy.addEventListener("click", () => {
    window.DevToolsMain.copyText(row.token);
    window.DevToolsMain.showToast("Token copied", "success");
  });

  item.append(token, meaning, example, copy);
  return item;
}

function renderSyntax() {
  sectionsNode.innerHTML = "";
  let shown = 0;
  let total = 0;

  for (const section of SECTIONS) {
    const rows = section.rows.filter((row) => matchesQuery(ROW_TEXT.get(row)));
    total += section.rows.length;
    if (rows.length === 0) continue;
    shown += rows.length;

    const block = document.createElement("section");
    block.className = "syntax-section";
    block.dataset.section = section.id;

    const heading = document.createElement("h3");
    heading.className = "section-title";
    heading.textContent = section.title;
    block.appendChild(heading);

    for (const row of rows) block.appendChild(syntaxRow(row));
    sectionsNode.appendChild(block);
  }

  if (shown === 0) {
    sectionsNode.innerHTML = '<p class="empty-state">Nothing in the syntax reference matches that search.</p>';
  }
  return { shown, total };
}

/* --- Patterns ----------------------------------------------------------- */

const jsLiteral = (entry) => `/${entry.pattern}/${entry.flags}`;

function sampleChip(text, kind) {
  const chip = document.createElement("code");
  chip.className = `sample sample--${kind}`;
  // Control characters in a sample would otherwise render as nothing at all.
  chip.textContent = text
    .replace(/\u001B/g, "\\u001B")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  chip.title = kind === "good" ? "Matches" : "Does not match";
  return chip;
}

function patternCard(entry) {
  const card = document.createElement("article");
  card.className = "pattern-card";
  card.dataset.pattern = entry.id;

  const head = document.createElement("div");
  head.className = "pattern-head";

  const name = document.createElement("h3");
  name.className = "pattern-name";
  name.textContent = entry.name;

  const category = document.createElement("span");
  category.className = "pattern-category";
  category.textContent = entry.category;

  head.append(name, category);

  const expression = document.createElement("div");
  expression.className = "pattern-expression";
  const literal = document.createElement("code");
  literal.className = "pattern-literal";
  literal.textContent = jsLiteral(entry);
  expression.appendChild(literal);

  const description = document.createElement("p");
  description.className = "pattern-description";
  withCode(entry.description, description);

  const samples = document.createElement("div");
  samples.className = "pattern-samples";
  for (const sample of entry.good) samples.appendChild(sampleChip(sample, "good"));
  for (const sample of entry.bad) samples.appendChild(sampleChip(sample, "bad"));

  card.append(head, expression, description, samples);

  if (entry.note) {
    const note = document.createElement("p");
    note.className = "pattern-note";
    withCode(entry.note, note);
    card.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "pattern-actions";

  const test = document.createElement("button");
  test.className = "btn btn-primary btn-sm";
  test.type = "button";
  test.dataset.test = entry.id;
  test.textContent = "Test it";
  test.addEventListener("click", () => openInTester(entry));

  const copyPattern = document.createElement("button");
  copyPattern.className = "btn btn-sm";
  copyPattern.type = "button";
  copyPattern.textContent = "Copy pattern";
  copyPattern.addEventListener("click", () => {
    window.DevToolsMain.copyText(entry.pattern);
    window.DevToolsMain.showToast("Pattern copied", "success");
  });

  const copyLiteral = document.createElement("button");
  copyLiteral.className = "btn btn-sm";
  copyLiteral.type = "button";
  copyLiteral.textContent = "Copy as /…/";
  copyLiteral.addEventListener("click", () => {
    window.DevToolsMain.copyText(jsLiteral(entry));
    window.DevToolsMain.showToast("JavaScript literal copied", "success");
  });

  actions.append(test, copyPattern, copyLiteral);
  card.appendChild(actions);
  return card;
}

function renderPatterns() {
  patternListNode.innerHTML = "";
  const entries = PATTERNS.filter((entry) => matchesQuery(PATTERN_TEXT.get(entry.id)));

  if (entries.length === 0) {
    patternListNode.innerHTML = '<p class="empty-state">No pattern matches that search.</p>';
    return { shown: 0, total: PATTERNS.length };
  }

  let category = "";
  for (const entry of entries) {
    if (entry.category !== category) {
      category = entry.category;
      const heading = document.createElement("h3");
      heading.className = "section-title";
      heading.textContent = category;
      patternListNode.appendChild(heading);
    }
    patternListNode.appendChild(patternCard(entry));
  }
  return { shown: entries.length, total: PATTERNS.length };
}

/* --- Handing a pattern to the tester ------------------------------------ */

function testerHash(entry) {
  const params = new URLSearchParams();
  params.set("pattern", entry.pattern);
  if (entry.flags) params.set("flags", entry.flags);
  // The samples are the point: the tester opens with something to match.
  const text = [...entry.good, ...entry.bad].join("\n");
  if (text) params.set("text", text);
  return `#${params.toString()}`;
}

function openInTester(entry) {
  window.DevToolsMain.openTool({
    id: "regex-tester",
    hash: entry ? testerHash(entry) : "",
  });
}

/* --- Wiring ------------------------------------------------------------- */

function refresh() {
  const result = state.mode === "syntax" ? renderSyntax() : renderPatterns();
  const noun = state.mode === "syntax" ? "rows" : "patterns";
  countNode.textContent = `${result.shown} of ${result.total} ${noun}`;
}

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
  refresh();
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  refresh();
});

document.querySelectorAll(".mode-btn").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

window.addEventListener("hashchange", () => {
  const mode = window.location.hash.slice(1);
  if (MODES[mode] && mode !== state.mode) setMode(mode, { pushHash: false });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  if (button.dataset.action === "open-tester") {
    button.addEventListener("click", () => openInTester(null));
  }
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function init() {
  const hash = window.location.hash.slice(1);
  setMode(MODES[hash] ? hash : "syntax", { pushHash: false });
}

init();
