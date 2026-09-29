// Git Cheatsheet — task-first Git reference.
//
// Laid out like the Regex Cheat Sheet: a toolbar with a category filter,
// search and a result count, then category sections of rows. Each row pairs
// the task and its explanation with the command lines, and every line has its
// own copy button so multi-step tasks are run one step at a time.
//
// <placeholders> in commands render as chips. The optional Placeholders bar
// substitutes values for <branch>, <commit>, <file> and <tag> in what is shown
// and in what is copied; anything left empty is copied exactly as written.

"use strict";

const CATEGORIES = globalThis.GIT_CATEGORIES;
const DANGER = globalThis.GIT_DANGER;
const TOTAL = CATEGORIES.reduce((sum, category) => sum + category.tasks.length, 0);
const FILLABLE = ["branch", "commit", "file", "tag"];
const PLACEHOLDER = /<([a-z][a-z0-9-]*)>/g;

const searchInput = document.getElementById("search");
const categorySelect = document.getElementById("category");
const categoryDropdown = document.getElementById("category-dd");
const categoryMenu = document.getElementById("category-menu");
const sectionsNode = document.getElementById("sections");
const countNode = document.getElementById("result-count");
const panelTitle = document.getElementById("panel-title");
const fillInputs = [...document.querySelectorAll("[data-fill]")];
const fillStatus = document.getElementById("fill-status");
const fillClear = document.getElementById("fill-clear");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const FILL_HINT = fillStatus.textContent;

const state = {
  category: "all",
  query: "",
  fills: Object.fromEntries(FILLABLE.map((name) => [name, ""])),
};

const byId = new Map(CATEGORIES.map((category) => [category.id, category]));

// Search runs over the raw data, so filling a placeholder never hides a row.
const TASK_TEXT = new Map();
for (const category of CATEGORIES) {
  for (const task of category.tasks) {
    TASK_TEXT.set(task, [
      category.title,
      task.title,
      ...task.commands,
      task.text,
      task.note,
      ...(task.danger || []).map((level) => DANGER[level]),
    ].filter(Boolean).join(" ").toLowerCase());
  }
}

// Every term has to appear somewhere, in any order: "untracked stash" finds
// "Stash changes, including untracked files".
function matchesQuery(text) {
  const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => text.includes(term));
}

/* --- Placeholders ------------------------------------------------------- */

const fillFor = (name) => (FILLABLE.includes(name) ? state.fills[name].trim() : "");

// What the copy button puts on the clipboard: filled values substituted,
// unfilled placeholders left exactly as written.
function resolveCommand(line) {
  return line.replace(PLACEHOLDER, (whole, name) => fillFor(name) || whole);
}

// Branch and tag names follow git-check-ref-format. Only the rules people
// actually trip over are checked; the value is still substituted.
function refNameProblem(value) {
  if (!value) return "";
  if (/\s/.test(value)) return "cannot contain spaces";
  if (/[~^:?*[\\]/.test(value)) return "cannot contain ~ ^ : ? * [ or \\";
  if (value.includes("..")) return "cannot contain ..";
  if (value.startsWith("-")) return "cannot start with -";
  if (value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock")) return "cannot end with /, . or .lock";
  if (value.includes("@{")) return "cannot contain @{";
  return "";
}

function validateFills() {
  const problems = [];
  for (const input of fillInputs) {
    const name = input.dataset.fill;
    const problem = name === "branch" || name === "tag" ? refNameProblem(state.fills[name].trim()) : "";
    input.setAttribute("aria-invalid", String(Boolean(problem)));
    if (problem) problems.push(`A ${name} name ${problem}.`);
  }
  fillStatus.textContent = problems.length ? problems.join(" ") : FILL_HINT;
  fillStatus.classList.toggle("error", problems.length > 0);
  fillClear.disabled = FILLABLE.every((name) => !state.fills[name]);
}

/* --- Rendering ---------------------------------------------------------- */

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

// A command line as text plus placeholder chips. A filled chip shows the value
// and keeps the placeholder name as its tooltip.
function commandNode(line) {
  const code = document.createElement("code");
  code.className = "cmd-text";
  let last = 0;
  for (const match of line.matchAll(PLACEHOLDER)) {
    if (match.index > last) code.appendChild(document.createTextNode(line.slice(last, match.index)));
    const chip = document.createElement("span");
    const value = fillFor(match[1]);
    chip.className = value ? "ph is-filled" : "ph";
    chip.dataset.placeholder = match[1];
    chip.textContent = value || match[0];
    if (value) chip.title = match[0];
    code.appendChild(chip);
    last = match.index + match[0].length;
  }
  if (last < line.length) code.appendChild(document.createTextNode(line.slice(last)));
  return code;
}

function copyButton(line) {
  const button = document.createElement("button");
  button.className = "action-btn cmd-copy";
  button.type = "button";
  button.dataset.tooltip = "Copy command";
  button.setAttribute("aria-label", `Copy command: ${line}`);
  button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
  button.addEventListener("click", async () => {
    // Resolve at click time so a value typed after rendering is still used.
    const text = resolveCommand(line);
    try {
      await window.DevToolsMain.copyText(text);
      window.DevToolsMain.showToast("Command copied", "success");
    } catch {
      window.DevToolsMain.showToast("Could not copy the command", "error");
    }
  });
  return button;
}

function dangerBadge(level) {
  const badge = document.createElement("span");
  badge.className = `badge danger-badge ${level === "discards" ? "error" : "warning"}`;
  badge.dataset.danger = level;
  badge.textContent = DANGER[level];
  return badge;
}

function taskRow(task, category) {
  const row = document.createElement("article");
  row.className = "task-row";
  row.dataset.category = category.id;
  if (task.danger) row.dataset.danger = task.danger.join(" ");

  const info = document.createElement("div");
  info.className = "task-info";

  const head = document.createElement("div");
  head.className = "task-head";
  const title = document.createElement("h4");
  title.className = "task-title";
  title.textContent = task.title;
  head.appendChild(title);
  for (const level of task.danger || []) head.appendChild(dangerBadge(level));

  const text = document.createElement("p");
  text.className = "task-text";
  withCode(task.text, text);
  info.append(head, text);

  if (task.note) {
    const note = document.createElement("p");
    note.className = "task-note";
    withCode(task.note, note);
    info.appendChild(note);
  }

  const block = document.createElement("div");
  block.className = "cmd-block";
  for (const line of task.commands) {
    const lineNode = document.createElement("div");
    lineNode.className = "cmd-line";
    lineNode.dataset.command = line;
    lineNode.append(commandNode(line), copyButton(line));
    block.appendChild(lineNode);
  }

  row.append(info, block);
  return row;
}

function emptyState() {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.id = "empty-state";

  const message = document.createElement("p");
  const query = state.query.trim();
  const scope = state.category === "all" ? "" : ` in ${byId.get(state.category).title}`;
  message.textContent = `No task matches “${query}”${scope}.`;
  box.appendChild(message);

  // When the category filter is what hides the match, offer the way out.
  const elsewhere = state.category !== "all" && CATEGORIES.some((category) =>
    category.tasks.some((task) => matchesQuery(TASK_TEXT.get(task))));
  if (elsewhere) {
    const widen = document.createElement("button");
    widen.className = "btn btn-sm";
    widen.type = "button";
    widen.id = "search-all";
    widen.textContent = "Search all categories";
    widen.addEventListener("click", () => setCategory("all"));
    box.appendChild(widen);
  } else {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    withCode("Try fewer words, or a command name such as `rebase` or `stash`.", hint);
    box.appendChild(hint);
  }
  return box;
}

function render() {
  const scope = state.category === "all" ? CATEGORIES : [byId.get(state.category)];
  const blocks = [];
  let shown = 0;

  for (const category of scope) {
    const tasks = category.tasks.filter((task) => matchesQuery(TASK_TEXT.get(task)));
    if (tasks.length === 0) continue;
    shown += tasks.length;

    const block = document.createElement("section");
    block.className = "task-section";
    block.dataset.section = category.id;

    const heading = document.createElement("h3");
    heading.className = "section-title";
    heading.textContent = category.title;
    const count = document.createElement("span");
    count.className = "section-count";
    count.textContent = String(tasks.length);
    heading.appendChild(count);
    block.appendChild(heading);

    for (const task of tasks) block.appendChild(taskRow(task, category));
    blocks.push(block);
  }

  sectionsNode.replaceChildren(...(shown ? blocks : [emptyState()]));
  countNode.textContent = `${shown} of ${TOTAL} tasks`;
}

/* --- Category filter ---------------------------------------------------- */

function buildCategoryMenu() {
  const entries = [{ id: "all", title: "All categories" }, ...CATEGORIES];
  categorySelect.replaceChildren(...entries.map((entry) => new Option(entry.title, entry.id)));
  categoryMenu.replaceChildren(...entries.map((entry) => {
    const option = document.createElement("button");
    option.className = "dd__option";
    option.type = "button";
    option.setAttribute("role", "option");
    option.dataset.value = entry.id;
    option.textContent = entry.title;
    return option;
  }));
}

function setCategory(id, { writeHash = true } = {}) {
  const next = byId.has(id) ? id : "all";
  state.category = next;
  window.DevToolsMain.selectDropdownValue(categoryDropdown, next, { emit: false });
  categorySelect.value = next;

  const title = next === "all" ? "All tasks" : byId.get(next).title;
  panelTitle.textContent = title;
  document.title = next === "all" ? "Git Cheatsheet" : `Git Cheatsheet — ${title}`;
  // replaceState via the shared helper, so filtering never adds history
  // entries inside the dashboard's frame. "All" is the default: no hash.
  if (writeHash) window.DevToolsMain.writeHashState(next === "all" ? "" : next);
  render();
}

/* --- Wiring ------------------------------------------------------------- */

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  render();
});

categorySelect.addEventListener("change", () => setCategory(categorySelect.value));

for (const input of fillInputs) {
  input.addEventListener("input", () => {
    state.fills[input.dataset.fill] = input.value;
    validateFills();
    render();
  });
}

fillClear.addEventListener("click", () => {
  for (const input of fillInputs) {
    input.value = "";
    state.fills[input.dataset.fill] = "";
  }
  validateFills();
  render();
  fillInputs[0].focus();
});

window.DevToolsMain.onHashState((hash) => {
  const next = byId.has(hash) ? hash : "all";
  if (next !== state.category) setCategory(next, { writeHash: false });
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

buildCategoryMenu();
validateFills();
setCategory(window.DevToolsMain.readHashState(), { writeHash: false });
