// HTTP Status Codes — a searchable reference with when-to-use notes.
//
// The data lives in codes.js. This file is only lookup and presentation: a
// filter over code, name and note text, a detail view, and a hash deep link so
// /tools/http-status-codes/#404 opens on 404 and can be shared as such.

const CODES = globalThis.HTTP_STATUS_CODES;

const searchInput = document.getElementById("search");
const listNode = document.getElementById("code-list");
const detailNode = document.getElementById("detail");
const countNode = document.getElementById("result-count");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const GROUP_LABELS = {
  "1xx": "Informational",
  "2xx": "Success",
  "3xx": "Redirection",
  "4xx": "Client error",
  "5xx": "Server error",
};

const state = {
  query: "",
  group: "all",
  selected: 200,
};

// One lowercase blob per code, built once: searching the notes is what makes
// "rate limit" find 429 and "lost update" find 412.
const HAYSTACK = new Map(CODES.map((entry) => [
  entry.code,
  [entry.code, entry.name, entry.summary, ...(entry.use || []), ...(entry.avoid || []), entry.spec]
    .join(" ")
    .toLowerCase(),
]));

const byCode = new Map(CODES.map((entry) => [entry.code, entry]));

/* --- Filtering ---------------------------------------------------------- */

// Every whitespace-separated term has to match something, in any order: a
// single substring test would fail "post redirect" even though 303 is exactly
// that, because the notes spell it "POST/redirect/GET".
function matches(entry, query) {
  if (!query) return true;
  // A wholly numeric query is a code prefix — "40" offers 400-409, "404" pins
  // one. Matching digits against the notes as well would drag in every code
  // whose prose mentions 404, which is not what someone typing 404 wants.
  if (/^\d+$/.test(query)) return String(entry.code).startsWith(query);

  const haystack = HAYSTACK.get(entry.code);
  return query.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

function visibleCodes() {
  const query = state.query.trim().toLowerCase();
  return CODES.filter((entry) => (state.group === "all" || entry.group === state.group)
    && matches(entry, query));
}

/* --- Rendering ---------------------------------------------------------- */

// Notes use `backticks` for header and code names. Build the nodes rather than
// interpolating markup, so the data can never inject anything.
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

function listItem(entry) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = `code-item group-${entry.group}`;
  item.dataset.code = String(entry.code);
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", String(entry.code === state.selected));
  if (entry.code === state.selected) item.classList.add("is-active");

  const code = document.createElement("span");
  code.className = "code-number";
  code.textContent = String(entry.code);

  const name = document.createElement("span");
  name.className = "code-name";
  name.textContent = entry.name;

  item.append(code, name);

  if (entry.standard === false) {
    const badge = document.createElement("span");
    badge.className = "code-badge";
    badge.textContent = "non-standard";
    item.appendChild(badge);
  }

  item.addEventListener("click", () => select(entry.code));
  return item;
}

function renderList() {
  const entries = visibleCodes();
  listNode.innerHTML = "";

  countNode.textContent = `${entries.length} of ${CODES.length}`;

  if (entries.length === 0) {
    listNode.innerHTML = '<p class="empty-state">No status code matches that search.</p>';
    return entries;
  }

  let group = "";
  for (const entry of entries) {
    if (entry.group !== group) {
      group = entry.group;
      const heading = document.createElement("p");
      heading.className = "list-group";
      heading.textContent = `${group} · ${GROUP_LABELS[group]}`;
      listNode.appendChild(heading);
    }
    listNode.appendChild(listItem(entry));
  }
  return entries;
}

function bulletList(items, className) {
  const list = document.createElement("ul");
  list.className = `detail-list ${className}`;
  for (const item of items) {
    const li = document.createElement("li");
    withCode(item, li);
    list.appendChild(li);
  }
  return list;
}

function sectionHeading(text) {
  const heading = document.createElement("h3");
  heading.className = "detail-heading";
  heading.textContent = text;
  return heading;
}

function renderDetail(entry) {
  detailNode.innerHTML = "";
  if (!entry) {
    detailNode.innerHTML = '<p class="empty-state">Pick a status code to read what it means and when to use it.</p>';
    return;
  }

  const head = document.createElement("div");
  head.className = "detail-head";

  const code = document.createElement("span");
  code.className = `detail-code group-${entry.group}`;
  code.textContent = String(entry.code);

  const titles = document.createElement("div");
  titles.className = "detail-titles";

  const name = document.createElement("h3");
  name.className = "detail-name";
  name.textContent = entry.name;

  const group = document.createElement("p");
  group.className = "detail-group";
  group.textContent = `${entry.group} · ${GROUP_LABELS[entry.group]}`;
  if (entry.standard === false) {
    const badge = document.createElement("span");
    badge.className = "code-badge";
    badge.textContent = "non-standard";
    group.appendChild(badge);
  }

  titles.append(name, group);
  head.append(code, titles);
  detailNode.appendChild(head);

  const summary = document.createElement("p");
  summary.className = "detail-summary";
  withCode(entry.summary, summary);
  detailNode.appendChild(summary);

  if (entry.use?.length) {
    detailNode.append(sectionHeading("When to use it"), bulletList(entry.use, "detail-use"));
  }
  if (entry.avoid?.length) {
    detailNode.append(sectionHeading("Watch out for"), bulletList(entry.avoid, "detail-avoid"));
  }

  if (entry.related?.length) {
    detailNode.appendChild(sectionHeading("Compare with"));
    const related = document.createElement("div");
    related.className = "related";
    for (const code of entry.related) {
      const other = byCode.get(code);
      if (!other) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "related-chip";
      chip.dataset.code = String(code);
      chip.textContent = `${code} ${other.name}`;
      chip.addEventListener("click", () => select(code));
      related.appendChild(chip);
    }
    detailNode.appendChild(related);
  }

  const spec = document.createElement("p");
  spec.className = "detail-spec";
  const link = document.createElement("a");
  link.href = entry.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = entry.spec;
  spec.append(document.createTextNode("Defined in "), link);
  detailNode.appendChild(spec);
}

/* --- Selection ---------------------------------------------------------- */

function select(code, { pushHash = true, scroll = true } = {}) {
  const entry = byCode.get(code);
  if (!entry) return;
  state.selected = code;

  listNode.querySelectorAll(".code-item").forEach((item) => {
    const active = Number(item.dataset.code) === code;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
    if (active && scroll) item.scrollIntoView({ block: "nearest" });
  });

  renderDetail(entry);
  document.title = `${code} ${entry.name} — HTTP Status Code`;
  // replaceState via the shared helper: assigning location.hash pushed one
  // history entry per click, so Back stepped through every code browsed (and,
  // inside the dashboard iframe, hijacked the shell's Back button).
  if (pushHash) window.DevToolsMain.writeHashState(String(code));
}

function detailText(entry) {
  const lines = [`${entry.code} ${entry.name} (${entry.group} ${GROUP_LABELS[entry.group]})`, "", entry.summary];
  const plain = (text) => text.replace(/`/g, "");
  if (entry.use?.length) lines.push("", "When to use it:", ...entry.use.map((item) => `- ${plain(item)}`));
  if (entry.avoid?.length) lines.push("", "Watch out for:", ...entry.avoid.map((item) => `- ${plain(item)}`));
  lines.push("", `Defined in ${entry.spec} — ${entry.url}`);
  return lines.join("\n");
}

/* --- Wiring ------------------------------------------------------------- */

function refresh() {
  const entries = renderList();
  // Keep the detail on the selected code while it is still in the list; when a
  // filter hides it, show the first result instead of an empty panel.
  if (entries.length && !entries.some((entry) => entry.code === state.selected)) {
    select(entries[0].code, { scroll: false });
  } else {
    renderDetail(byCode.get(state.selected));
  }
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  refresh();
});

// Enter opens the first match; Down arrow hands over to the list.
searchInput.addEventListener("keydown", (event) => {
  const entries = visibleCodes();
  if (event.key === "Enter" && entries.length) {
    event.preventDefault();
    select(entries[0].code);
  }
  if (event.key === "ArrowDown" && entries.length) {
    event.preventDefault();
    select(entries[0].code);
    listNode.querySelector(".code-item.is-active")?.focus();
  }
});

listNode.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const entries = visibleCodes();
  const index = entries.findIndex((entry) => entry.code === state.selected);
  const next = entries[index + (event.key === "ArrowDown" ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  select(next.code);
  listNode.querySelector(".code-item.is-active")?.focus();
});

document.querySelectorAll("[data-group]").forEach((button) => {
  button.addEventListener("click", () => {
    state.group = button.dataset.group;
    document.querySelectorAll("[data-group]").forEach((other) => {
      const active = other === button;
      other.classList.toggle("active", active);
      other.setAttribute("aria-pressed", String(active));
    });
    refresh();
  });
});

const ACTIONS = {
  clear() {
    searchInput.value = "";
    state.query = "";
    refresh();
    searchInput.focus();
  },

  "copy-detail"() {
    const entry = byCode.get(state.selected);
    if (!entry) return;
    window.DevToolsMain.copyText(detailText(entry));
    window.DevToolsMain.showToast(`${entry.code} detail copied`, "success");
  },

  "copy-link"() {
    const link = `${window.location.origin}${window.location.pathname}#${state.selected}`;
    window.DevToolsMain.copyText(link);
    window.DevToolsMain.showToast("Link copied", "success");
  },
};

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.());
});

window.DevToolsMain.onHashState((value) => {
  const code = Number(value);
  if (byCode.has(code) && code !== state.selected) select(code, { pushHash: false });
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function init() {
  const linked = Number(window.location.hash.slice(1));
  if (byCode.has(linked)) state.selected = linked;
  renderList();
  select(state.selected, { pushHash: false });
}

init();
