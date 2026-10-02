// MIME Type Lookup — search extensions, filenames and media types, then copy
// the header and server config for the one you want.
//
// The data lives in data.js. This file is lookup and presentation: a ranked
// search (exact, then prefix, then mentions), a category filter, a listbox
// with a detail panel, and a hash deep link so #image/webp opens on WebP.

"use strict";

const TYPES = globalThis.MIME_TYPES;
const Main = window.DevToolsMain;

const searchInput = document.getElementById("search");
const listNode = document.getElementById("type-list");
const detailNode = document.getElementById("detail");
const countNode = document.getElementById("result-count");
const queryStatus = document.getElementById("query-status");
const tierCount = document.getElementById("tier-count");
const helpModal = document.getElementById("helpModal");
const filterButtons = [...document.querySelectorAll("[data-category]")];
const clearButton = document.querySelector(".search-clear");

// The filter segment's buckets. multipart/ and model/ are rare enough that
// they ride with application/; their tag still names the real top-level type.
const CATEGORIES = ["text", "image", "audio", "video", "font", "application"];
const CATEGORY_LABELS = {
  text: "Text", image: "Image", audio: "Audio", video: "Video", font: "Font",
  application: "Application", multipart: "Multipart", model: "Model",
};

const TIER = { EXACT: 0, PREFIX: 1, MENTION: 2 };
const TIER_LABELS = ["Exact match", "Starts with", "Mentioned"];

const topLevel = (mime) => mime.split("/")[0];
const bucketOf = (entry) => (CATEGORIES.includes(topLevel(entry.mime)) ? topLevel(entry.mime) : "application");
const takesCharset = (entry) => topLevel(entry.mime) === "text" || entry.charset === true;
// nginx and Apache map one extension at a time, so "tar.gz" is search-only.
const configExts = (entry) => entry.ext.filter((ext) => !ext.includes("."));

// Grouped by category for browsing, stable within each group so data.js order
// (most common first) survives.
const ORDERED = TYPES
  .map((entry, index) => ({ entry, index }))
  .sort((a, b) => CATEGORIES.indexOf(bucketOf(a.entry)) - CATEGORIES.indexOf(bucketOf(b.entry)) || a.index - b.index)
  .map(({ entry }) => entry);

const byMime = new Map();
for (const entry of TYPES) {
  byMime.set(entry.mime, entry);
  for (const alias of entry.aliases || []) byMime.set(alias.toLowerCase(), entry);
}

// Prose a word search can find: "font" or "subtitles" should land somewhere.
const HAYSTACK = new Map(TYPES.map((entry) => [
  entry,
  [entry.note, ...(entry.pitfalls || [])].join(" ").replace(/`/g, "").toLowerCase(),
]));

const state = {
  query: "",
  category: "all",
  selected: ORDERED[0].mime,
  results: [],
  parsed: null,
};

/* --- Query parsing ------------------------------------------------------ */

// Turn what someone typed or pasted into one of three shapes. A pasted header
// ("Content-Type: text/html; charset=utf-8") and a bare type both become a
// media-type query with its parameters kept, so the detail can echo them.
function parseQuery(raw) {
  let text = raw.trim().replace(/^content-type\s*:\s*/i, "");
  if (!text) return { kind: "empty" };

  const [head, ...rest] = text.split(";");
  const base = head.trim().toLowerCase();
  const params = rest
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      const name = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
      const value = eq === -1 ? "" : part.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
      return { name, value };
    });

  if (base.includes("/")) return { kind: "mime", base, params, raw: text };

  // A filename or an extension. Every dotted tail is a candidate, longest
  // first, so "archive.tar.gz" tries "tar.gz" and then "gz".
  const name = base.replace(/^\*?\./, ".");
  if (name.includes(".")) {
    const parts = name.split(".");
    const suffixes = [];
    for (let i = 1; i < parts.length; i += 1) {
      const suffix = parts.slice(i).join(".");
      if (suffix) suffixes.push(suffix);
    }
    return { kind: "file", base: name, suffixes, last: parts.at(-1), raw: text };
  }
  return { kind: "word", base: name, raw: text };
}

/* --- Ranking ------------------------------------------------------------ */

function tierFor(entry, query) {
  const mime = entry.mime;
  const aliases = (entry.aliases || []).map((alias) => alias.toLowerCase());
  const subtype = mime.split("/")[1];

  if (query.kind === "mime") {
    const q = query.base;
    if (mime === q || aliases.includes(q)) return TIER.EXACT;
    if (mime.startsWith(q) || aliases.some((alias) => alias.startsWith(q))) return TIER.PREFIX;
    if (mime.includes(q) || aliases.some((alias) => alias.includes(q))) return TIER.MENTION;
    return null;
  }

  if (query.kind === "file") {
    if (query.suffixes.some((suffix) => entry.ext.includes(suffix))) return TIER.EXACT;
    // Only the last segment extends: ".web" offers webp, webm, webmanifest.
    // An unknown extension on a real filename should not match anything.
    if (query.base.startsWith(".") && query.last && entry.ext.some((ext) => ext.startsWith(query.last))) return TIER.PREFIX;
    return null;
  }

  // A bare word: an extension, a subtype, a top-level type or plain prose.
  const q = query.base;
  if (entry.ext.includes(q) || subtype === q) return TIER.EXACT;
  if (entry.ext.some((ext) => ext.startsWith(q)) || mime.startsWith(q) || subtype.startsWith(q)) return TIER.PREFIX;
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = `${mime} ${aliases.join(" ")} ${HAYSTACK.get(entry)}`;
  if (terms.every((term) => haystack.includes(term))) return TIER.MENTION;
  return null;
}

function search() {
  const query = parseQuery(state.query);
  state.parsed = query;
  const pool = ORDERED.filter((entry) => state.category === "all" || bucketOf(entry) === state.category);
  if (query.kind === "empty") return pool.map((entry) => ({ entry, tier: null }));

  return pool
    .map((entry, order) => ({ entry, tier: tierFor(entry, query), order }))
    .filter((result) => result.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.order - b.order);
}

/* --- Rendering helpers --------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Notes use `backticks` for code. Build nodes rather than markup, so the data
// can never inject anything.
function withCode(text, target) {
  for (const [index, part] of text.split(/`([^`]+)`/).entries()) {
    if (part === "") continue;
    target.appendChild(index % 2 === 1 ? el("code", "inline-code", part) : document.createTextNode(part));
  }
  return target;
}

function categoryTag(entry) {
  const top = topLevel(entry.mime);
  return el("span", `category-tag cat-${bucketOf(entry)}`, top);
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

/* --- List --------------------------------------------------------------- */

function option(entry, index) {
  const active = entry.mime === state.selected;
  const item = el("div", "type-item");
  item.id = `type-option-${index}`;
  item.dataset.mime = entry.mime;
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", String(active));
  item.tabIndex = active ? 0 : -1;
  if (active) item.classList.add("is-active");

  const mime = el("span", "type-mime", entry.mime);
  mime.title = entry.mime;

  const exts = el("span", "type-exts");
  const shown = entry.ext.slice(0, 3);
  for (const ext of shown) exts.appendChild(el("span", "ext-chip", `.${ext}`));
  if (entry.ext.length > shown.length) exts.appendChild(el("span", "ext-more", `+${entry.ext.length - shown.length}`));

  item.append(mime, exts, categoryTag(entry));
  item.addEventListener("click", () => select(entry.mime, { focus: true }));
  return item;
}

function emptyState(query) {
  const box = el("div", "empty-state");
  const label = query.raw || state.query.trim();
  box.appendChild(el("p", "empty-title", `No match for “${label}”`));

  const hint = el("p", "empty-hint");
  if (query.kind === "file") {
    withCode(`Nothing in this list uses \`.${query.last}\`. Unknown binary files are usually served as \`application/octet-stream\`.`, hint);
  } else if (query.kind === "word" && /^[\w-]+$/.test(query.base)) {
    withCode("A name with no extension, such as `Dockerfile` or `Makefile`, carries no type. Servers fall back to `application/octet-stream`; plain-text files like these are better as `text/plain`.", hint);
  } else if (query.kind === "mime") {
    withCode("That type is not in this curated list. Check the IANA registry linked from the help.", hint);
  } else {
    hint.textContent = "Try an extension, a filename or a media type.";
  }
  box.appendChild(hint);

  const jumps = el("div", "empty-actions");
  for (const mime of ["application/octet-stream", "text/plain"]) {
    const button = el("button", "related-chip", mime);
    button.type = "button";
    button.addEventListener("click", () => {
      setQuery("");
      select(mime, { focus: true });
    });
    jumps.appendChild(button);
  }
  if (state.category !== "all") {
    const all = el("button", "related-chip", "Search all categories");
    all.type = "button";
    all.addEventListener("click", () => setCategory("all"));
    jumps.appendChild(all);
  }
  box.appendChild(jumps);
  return box;
}

function renderStatus(results, query) {
  queryStatus.classList.remove("error", "success");
  const exact = results.filter((result) => result.tier === TIER.EXACT).length;

  if (query.kind === "empty") {
    queryStatus.textContent = state.category === "all" ? "Showing every type" : `${CATEGORY_LABELS[state.category]} types`;
  } else if (!results.length) {
    queryStatus.textContent = `No match for “${query.raw}”`;
    queryStatus.classList.add("error");
  } else if (query.kind === "mime") {
    const params = query.params.map(({ name, value }) => (value ? `${name}=${value}` : name));
    queryStatus.textContent = `Media type ${query.base}${params.length ? ` · ${params.join("; ")}` : ""}`;
  } else if (query.kind === "file") {
    const hit = query.suffixes.find((suffix) => results.some((result) => result.entry.ext.includes(suffix)));
    queryStatus.textContent = hit ? `Filename ${query.raw} → .${hit}` : `Extension prefix .${query.last}`;
  } else {
    queryStatus.textContent = exact ? `Extension or type “${query.base}”` : `Search “${query.base}”`;
  }
  if (exact) queryStatus.classList.add("success");

  if (query.kind === "empty") {
    tierCount.textContent = `${results.length} types`;
  } else {
    const counts = [0, 0, 0];
    for (const result of results) counts[result.tier] += 1;
    tierCount.textContent = ["exact", "prefix", "notes"]
      .map((label, tier) => (counts[tier] ? `${counts[tier]} ${label}` : ""))
      .filter(Boolean)
      .join(" · ");
  }
}

function renderList() {
  const results = search();
  state.results = results;
  const query = state.parsed;
  listNode.replaceChildren();
  countNode.textContent = `${results.length} of ${TYPES.length}`;
  renderStatus(results, query);

  if (!results.length) {
    listNode.appendChild(emptyState(query));
    return results;
  }

  // Headings follow the ranking when searching and the category otherwise,
  // so the order is always explained by what sits above it.
  let heading = null;
  results.forEach(({ entry, tier }, index) => {
    const label = tier === null ? CATEGORY_LABELS[bucketOf(entry)] : TIER_LABELS[tier];
    if (label !== heading) {
      heading = label;
      const node = el("p", "list-group", label);
      node.setAttribute("role", "presentation");
      listNode.appendChild(node);
    }
    listNode.appendChild(option(entry, index));
  });
  return results;
}

/* --- Detail ------------------------------------------------------------- */

// What the Content-Type row should say. Parameters come from the query when
// it named this exact type, so "text/html; charset=iso-8859-1" copies back as
// typed; otherwise text types default to UTF-8.
function contentTypeFor(entry) {
  const query = state.parsed;
  const named = query?.kind === "mime" && byMime.get(query.base) === entry;
  const warnings = [];
  let params = [];

  if (named && query.params.length) {
    for (const param of query.params) {
      if (param.name === "charset" && !takesCharset(entry)) {
        warnings.push(`${entry.mime} defines no charset parameter, so it was left out of the header.`);
        continue;
      }
      params.push(param.value ? `${param.name}=${param.value}` : param.name);
    }
  }
  if (!params.some((param) => param.startsWith("charset=")) && takesCharset(entry)) {
    params = ["charset=utf-8", ...params];
  }
  return {
    value: [entry.mime, ...params].join("; "),
    echoed: named ? query.params : [],
    warnings,
  };
}

function configRows(entry) {
  const header = contentTypeFor(entry);
  const rows = [{ key: "content-type", label: "Header", title: "Content-Type header", text: `Content-Type: ${header.value}` }];
  const exts = configExts(entry);
  if (exts.length) {
    rows.push({ key: "nginx", label: "nginx", title: "nginx types line", text: `types { ${entry.mime} ${exts.join(" ")}; }` });
    rows.push({ key: "apache", label: "Apache", title: "Apache AddType line", text: `AddType ${entry.mime} ${exts.map((ext) => `.${ext}`).join(" ")}` });
  }
  const html = entry.html || (exts.length ? `<input type="file" accept="${[entry.mime, ...exts.map((ext) => `.${ext}`)].join(",")}">` : null);
  if (html) rows.push({ key: "html", label: "HTML", title: "HTML snippet", text: html });
  return { rows, header };
}

function copyRow(row) {
  const line = el("div", "copy-row");
  line.dataset.row = row.key;
  line.append(el("span", "copy-label", row.label), el("code", "copy-text", row.text));

  const button = el("button", "action-btn");
  button.type = "button";
  button.setAttribute("aria-label", `Copy ${row.title}`);
  button.dataset.tooltip = "Copy";
  button.appendChild(icon("copy"));
  button.addEventListener("click", () => {
    Main.copyText(row.text);
    Main.showToast(`${row.title} copied`, "success");
  });
  line.appendChild(button);
  return line;
}

function sectionHeading(text) {
  return el("h3", "detail-heading", text);
}

function renderDetail(entry) {
  detailNode.replaceChildren();
  if (!entry) {
    detailNode.appendChild(el("p", "empty-state", "Pick a type to see its extensions, header and server config."));
    return;
  }

  const head = el("div", "detail-head");
  // The mono face sits on an inner span: the shared layer sets headings in
  // the UI face and would win over a font-family on the h3 itself.
  const title = el("h3", "detail-title");
  title.appendChild(el("span", "detail-mime", entry.mime));
  head.appendChild(title);
  const meta = el("p", "detail-meta");
  meta.append(categoryTag(entry), el("span", "detail-category", `${CATEGORY_LABELS[topLevel(entry.mime)]} type`));
  if (entry.registered === false) {
    const badge = el("span", "code-badge", "unregistered");
    badge.title = "A de facto name that IANA has never registered";
    meta.appendChild(badge);
  }
  head.appendChild(meta);
  detailNode.appendChild(head);

  const exts = el("div", "detail-exts");
  if (entry.ext.length) {
    for (const ext of entry.ext) exts.appendChild(el("span", "ext-chip ext-chip-lg", `.${ext}`));
  } else {
    exts.appendChild(el("span", "detail-none", "No standard file extension"));
  }
  detailNode.appendChild(exts);

  detailNode.appendChild(withCode(entry.note, el("p", "detail-summary")));

  const { rows, header } = configRows(entry);

  if (header.echoed.length || header.warnings.length) {
    const echo = el("div", "detail-echo");
    echo.appendChild(el("span", "echo-label", "From your query"));
    for (const { name, value } of header.echoed) {
      echo.appendChild(el("code", "param-chip", value ? `${name}=${value}` : name));
    }
    detailNode.appendChild(echo);
    for (const warning of header.warnings) detailNode.appendChild(el("p", "status-text warning detail-warning", warning));
  }

  if (entry.aliases?.length) {
    detailNode.appendChild(sectionHeading("Also seen as"));
    const aliases = el("div", "alias-list");
    for (const alias of entry.aliases) aliases.appendChild(el("code", "alias-chip", alias));
    detailNode.appendChild(aliases);
  }

  if (entry.pitfalls?.length) {
    detailNode.appendChild(sectionHeading("Pitfalls / notes"));
    const list = el("ul", "detail-list");
    for (const item of entry.pitfalls) list.appendChild(withCode(item, el("li")));
    detailNode.appendChild(list);
  }

  detailNode.appendChild(sectionHeading("Copy"));
  const box = el("div", "copy-rows");
  for (const row of rows) box.appendChild(copyRow(row));
  detailNode.appendChild(box);

  const foot = el("p", "detail-spec");
  const link = el("a", "", "IANA Media Types registry");
  link.href = "https://www.iana.org/assignments/media-types/";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  foot.append(document.createTextNode(entry.registered === false ? "Not registered with IANA · " : "Registry: "), link);
  detailNode.appendChild(foot);
}

function detailText(entry) {
  const plain = (text) => text.replace(/`/g, "");
  const { rows } = configRows(entry);
  const lines = [
    `${entry.mime} (${CATEGORY_LABELS[topLevel(entry.mime)]})`,
    `Extensions: ${entry.ext.length ? entry.ext.map((ext) => `.${ext}`).join(" ") : "none"}`,
    "",
    plain(entry.note),
  ];
  if (entry.aliases?.length) lines.push("", `Also seen as: ${entry.aliases.join(", ")}`);
  if (entry.pitfalls?.length) lines.push("", "Pitfalls:", ...entry.pitfalls.map((item) => `- ${plain(item)}`));
  lines.push("", ...rows.map((row) => row.text));
  return lines.join("\n");
}

/* --- Selection ---------------------------------------------------------- */

// Opened from file:// inside the dashboard, the shared helper's postMessage
// to the parent targets origin "null" and throws. The hash is a convenience,
// so a failure must never stop the detail from rendering.
function writeHash_(value) {
  try {
    Main.writeHashState(value);
  } catch {
    /* The local hash is already written by replaceState before the post. */
  }
}

function activeOption() {
  return listNode.querySelector(".type-item.is-active");
}

function select(mime, { writeHash = true, scroll = true, focus = false } = {}) {
  const entry = byMime.get(mime);
  if (!entry) return;
  state.selected = entry.mime;

  for (const item of listNode.querySelectorAll(".type-item")) {
    const active = item.dataset.mime === entry.mime;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  }
  const current = activeOption();
  if (current) {
    listNode.setAttribute("aria-activedescendant", current.id);
    if (scroll) current.scrollIntoView({ block: "nearest" });
    if (focus) current.focus({ preventScroll: true });
  }

  renderDetail(entry);
  document.title = `${entry.mime} — MIME Type Lookup`;
  if (writeHash) writeHash_(entry.mime);
}

function refresh({ fromQuery = false } = {}) {
  const results = renderList();
  const visible = results.some(({ entry }) => entry.mime === state.selected);
  if (!results.length) {
    renderDetail(byMime.get(state.selected));
    return;
  }
  // A new search jumps to its best match, which is the point of a lookup.
  // Clearing the search or changing the filter keeps the current type when
  // it is still listed.
  if ((fromQuery && state.parsed.kind !== "empty") || !visible) {
    select(results[0].entry.mime);
  } else {
    select(state.selected, { writeHash: false });
  }
}

function setQuery(value) {
  searchInput.value = value;
  state.query = value;
  syncClear();
  refresh({ fromQuery: true });
}

function syncClear() {
  clearButton.hidden = searchInput.value === "";
}

function setCategory(category) {
  state.category = category;
  for (const button of filterButtons) {
    const active = button.dataset.category === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  refresh();
}

/* --- Wiring ------------------------------------------------------------- */

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  syncClear();
  refresh({ fromQuery: true });
});

// Enter settles on the best match; Down hands focus to the list.
searchInput.addEventListener("keydown", (event) => {
  if (!state.results.length) return;
  if (event.key === "Enter") {
    event.preventDefault();
    select(state.results[0].entry.mime);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    const visible = state.results.some(({ entry }) => entry.mime === state.selected);
    select(visible ? state.selected : state.results[0].entry.mime, { focus: true });
  }
});

listNode.addEventListener("keydown", (event) => {
  const results = state.results;
  if (!results.length) return;
  const index = results.findIndex(({ entry }) => entry.mime === state.selected);
  const page = 8;
  const moves = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    PageDown: index + page,
    PageUp: index - page,
    Home: 0,
    End: results.length - 1,
  };
  if (!(event.key in moves)) return;
  event.preventDefault();
  if (event.key === "ArrowUp" && index <= 0) {
    searchInput.focus();
    return;
  }
  const next = results[Math.max(0, Math.min(results.length - 1, moves[event.key]))];
  select(next.entry.mime, { focus: true });
});

// The filter is a toggle group; arrow keys move along it like the header tabs.
filterButtons.forEach((button, index) => {
  button.addEventListener("click", () => setCategory(button.dataset.category));
  button.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = filterButtons[(index + step + filterButtons.length) % filterButtons.length];
    next.focus();
    setCategory(next.dataset.category);
  });
});

const ACTIONS = {
  clear() {
    setQuery("");
    searchInput.focus();
  },

  "copy-detail"() {
    const entry = byMime.get(state.selected);
    if (!entry) return;
    Main.copyText(detailText(entry));
    Main.showToast(`${entry.mime} detail copied`, "success");
  },

  "copy-link"() {
    // Built from href, not origin + pathname: opened from file:// the origin
    // is the string "null".
    const link = `${window.location.href.split("#")[0]}#${state.selected}`;
    Main.copyText(link);
    Main.showToast("Link copied", "success");
  },
};

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.());
});

document.getElementById("helpBtn").addEventListener("click", () => Main.openModal(helpModal));

// Deep links: #image/webp opens on WebP. An alias (#image/jpg) resolves to its
// canonical type; anything unknown falls back to the default selection.
function linkedType(value) {
  const entry = byMime.get(String(value || "").trim().toLowerCase());
  return entry ? entry.mime : null;
}

Main.onHashState((value) => {
  const mime = linkedType(value);
  if (!mime || mime === state.selected) return;
  if (state.category !== "all" && bucketOf(byMime.get(mime)) !== state.category) setCategory("all");
  if (!state.results.some(({ entry }) => entry.mime === mime)) setQuery("");
  select(mime, { writeHash: false });
});

function init() {
  const linked = linkedType(Main.readHashState());
  if (linked) state.selected = linked;
  renderList();
  select(state.selected, { writeHash: Boolean(linked) && linked !== Main.readHashState() });
}

init();
