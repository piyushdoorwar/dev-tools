// CSV ⇄ JSON Converter — paste CSV or JSON, get the other format plus a
// sortable, filterable table.
//
// Both directions reduce the input to the same shape, { headers, rows }, where
// every row is an array of cell values aligned with headers. The table and the
// text output are both rendered from that one structure, so they can never
// disagree about what the data is. Sorting and filtering only reorder the
// table's view of it; the text output always keeps the source order.

const input = document.getElementById("input");
const output = document.getElementById("output");
const inputTitle = document.getElementById("input-title");
const statusBar = document.getElementById("status");
const delimiterSelect = document.getElementById("delimiter");
const headerRow = document.getElementById("header-row");
const inferTypes = document.getElementById("infer-types");
const filterInput = document.getElementById("filter");
const fileInput = document.getElementById("file-input");
const table = document.getElementById("data-table");
const tableWrap = document.getElementById("table-wrap");
const emptyState = document.getElementById("empty-state");
const tableMeta = document.getElementById("table-meta");
const tableView = document.getElementById("table-view");
const textView = document.getElementById("text-view");
const textViewBtn = document.getElementById("text-view-btn");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const MODES = ["csv-json", "json-csv"];
const CANDIDATE_DELIMITERS = [",", ";", "\t", "|"];
// Rendering tens of thousands of <tr>s locks the page; the filter is the way
// to reach anything past this.
const MAX_RENDERED_ROWS = 1000;

const SAMPLES = {
  "csv-json": [
    "id,name,email,city,age,active",
    "1,Ada Lovelace,ada@example.com,London,36,true",
    "2,Grace Hopper,grace@example.com,\"New York, NY\",85,false",
    "3,Alan Turing,alan@example.com,Manchester,41,true",
    "4,\"Katherine \"\"Kay\"\" Johnson\",kay@example.com,Hampton,101,false",
    "5,Linus Torvalds,linus@example.com,Portland,54,true",
  ].join("\n"),
  "json-csv": JSON.stringify([
    { id: 1, name: "Ada Lovelace", address: { city: "London", zip: "W1" }, tags: ["math", "poetry"] },
    { id: 2, name: "Grace Hopper", address: { city: "New York, NY", zip: "10001" }, tags: ["navy"] },
    { id: 3, name: "Alan Turing", address: { city: "Manchester", zip: null }, active: true },
  ], null, 2),
};

const state = {
  mode: "csv-json",
  view: "table",
  data: null,        // { headers, rows } from the last successful parse
  text: "",          // generated output text
  sort: { column: -1, dir: 0 }, // dir: 1 asc, -1 desc, 0 source order
};

/* --- CSV parsing ---------------------------------------------------------- */

function resolveDelimiter(value) {
  return value === "\\t" ? "\t" : value;
}

// Counts candidates in the first record only, skipping quoted sections, so a
// comma inside "New York, NY" doesn't vote for comma.
function detectDelimiter(text) {
  const counts = new Map(CANDIDATE_DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch) + 1);
  }
  let best = ",";
  let bestCount = 0;
  for (const [delimiter, count] of counts) {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

// RFC 4180 with the usual real-world allowances: LF or CRLF line endings, a
// leading BOM, and a trailing newline that doesn't create an empty record.
function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let quoteStartLine = 0;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
      quoteStartLine = line;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line++;
    } else {
      field += ch;
    }
    i++;
  }

  if (quoted) {
    throw new Error(`Unterminated quoted field starting on line ${quoteStartLine}`);
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines carry no data; dropping them keeps row counts honest.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Every column needs a distinct, non-empty key or values silently overwrite
// each other when rows become objects.
function uniqueHeaders(raw) {
  const seen = new Map();
  return raw.map((name, index) => {
    let key = name.trim() || `column_${index + 1}`;
    if (seen.has(key)) {
      let n = seen.get(key) + 1;
      while (seen.has(`${key}_${n}`)) n++;
      seen.set(key, n);
      key = `${key}_${n}`;
    }
    seen.set(key, 1);
    return key;
  });
}

// Leading zeros stay strings: "02134" is a ZIP code, not the number 2134.
const NUMBER_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

function inferValue(value) {
  const trimmed = value.trim();
  if (NUMBER_PATTERN.test(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number) && (Number.isSafeInteger(number) || !Number.isInteger(number))) return number;
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  return value;
}

function csvToData(text, { delimiter = "auto", header = true, infer = true } = {}) {
  const resolved = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  const records = parseCsv(text, resolved);
  const width = records.reduce((max, r) => Math.max(max, r.length), 0);
  const headers = header && records.length
    ? uniqueHeaders(Array.from({ length: width }, (_, i) => records[0][i] ?? ""))
    : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  const body = header ? records.slice(1) : records;
  const ragged = body.filter((r) => r.length !== width).length;
  const rows = body.map((r) =>
    Array.from({ length: width }, (_, i) => {
      const cell = r[i] ?? "";
      return infer ? inferValue(cell) : cell;
    })
  );
  return { headers, rows, delimiter: resolved, ragged, header };
}

function dataToJson({ headers, rows, header }) {
  const records = header
    ? rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])))
    : rows;
  return JSON.stringify(records, null, 2);
}

/* --- JSON → CSV ----------------------------------------------------------- */

function flattenObject(value, prefix = "", out = {}) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child) && Object.keys(child).length) {
      flattenObject(child, path, out);
    } else {
      out[path] = child;
    }
  }
  return out;
}

function jsonToData(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) parsed = [parsed];
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of objects, an array of arrays, or a single object");
  }

  if (parsed.length && parsed.every(Array.isArray)) {
    const width = parsed.reduce((max, r) => Math.max(max, r.length), 0);
    return {
      headers: Array.from({ length: width }, (_, i) => `column_${i + 1}`),
      rows: parsed.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null)),
      arrays: true,
    };
  }

  const flat = parsed.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Item ${index} is not an object — every array item must be an object`);
    }
    return flattenObject(item);
  });
  const headers = [];
  const known = new Set();
  for (const record of flat) {
    for (const key of Object.keys(record)) {
      if (!known.has(key)) {
        known.add(key);
        headers.push(key);
      }
    }
  }
  return {
    headers,
    rows: flat.map((record) => headers.map((h) => (h in record ? record[h] : null))),
    arrays: false,
  };
}

function cellToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsvField(value, delimiter) {
  const text = cellToText(value);
  const needsQuotes = text.includes(delimiter) || /["\r\n]/.test(text) || /^\s|\s$/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

function dataToCsv({ headers, rows }, { delimiter = ",", header = true } = {}) {
  const lines = rows.map((row) => row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter));
  if (header) lines.unshift(headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter));
  return lines.join("\n");
}

/* --- Table ---------------------------------------------------------------- */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareCells(a, b) {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  // Blanks sink to the bottom in both directions; handled by the caller.
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(cellToText(a), cellToText(b));
}

function visibleRows() {
  const { rows } = state.data;
  const query = filterInput.value.trim().toLowerCase();
  let indexed = rows.map((row, index) => ({ row, index }));
  if (query) {
    indexed = indexed.filter(({ row }) => row.some((cell) => cellToText(cell).toLowerCase().includes(query)));
  }
  const { column, dir } = state.sort;
  if (dir && column >= 0) {
    indexed.sort((x, y) => {
      const a = x.row[column];
      const b = y.row[column];
      const aEmpty = a === null || a === undefined || a === "";
      const bEmpty = b === null || b === undefined || b === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? x.index - y.index : aEmpty ? 1 : -1;
      return compareCells(a, b) * dir || x.index - y.index;
    });
  }
  return indexed;
}

function renderTable() {
  const thead = table.tHead;
  const tbody = table.tBodies[0];
  thead.replaceChildren();
  tbody.replaceChildren();

  if (!state.data || !state.data.headers.length) {
    table.hidden = true;
    emptyState.hidden = false;
    tableMeta.textContent = "";
    return;
  }

  table.hidden = false;
  emptyState.hidden = true;

  const headRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "row-num";
  corner.textContent = "#";
  corner.scope = "col";
  headRow.append(corner);

  state.data.headers.forEach((name, index) => {
    const th = document.createElement("th");
    th.scope = "col";
    const active = state.sort.column === index && state.sort.dir !== 0;
    th.setAttribute("aria-sort", active ? (state.sort.dir === 1 ? "ascending" : "descending") : "none");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-btn";
    button.dataset.column = String(index);
    button.title = `Sort by ${name}`;
    const label = document.createElement("span");
    label.textContent = name;
    const arrow = document.createElement("span");
    arrow.className = "sort-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = active ? (state.sort.dir === 1 ? "▲" : "▼") : "↕";
    button.append(label, arrow);
    th.append(button);
    headRow.append(th);
  });
  thead.append(headRow);

  const rows = visibleRows();
  const fragment = document.createDocumentFragment();
  for (const { row, index } of rows.slice(0, MAX_RENDERED_ROWS)) {
    const tr = document.createElement("tr");
    const num = document.createElement("td");
    num.className = "row-num";
    num.textContent = String(index + 1);
    tr.append(num);
    for (const cell of row) {
      const td = document.createElement("td");
      if (cell === null || cell === undefined) {
        td.className = "cell-null";
        td.textContent = "null";
      } else {
        if (typeof cell === "number") td.className = "cell-number";
        else if (typeof cell === "boolean") td.className = "cell-bool";
        td.textContent = cellToText(cell);
      }
      tr.append(td);
    }
    fragment.append(tr);
  }
  tbody.append(fragment);

  const total = state.data.rows.length;
  const cols = state.data.headers.length;
  const parts = [];
  parts.push(rows.length === total ? `${plural(total, "row")}` : `${rows.length.toLocaleString()} of ${plural(total, "row")}`);
  parts.push(plural(cols, "column"));
  if (rows.length > MAX_RENDERED_ROWS) parts.push(`showing first ${MAX_RENDERED_ROWS.toLocaleString()}`);
  tableMeta.textContent = parts.join(" · ");
}

function plural(count, word) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

/* --- Rendering ------------------------------------------------------------ */

function setStatus(message, type = "") {
  statusBar.className = `status-bar${type ? ` is-${type}` : ""}`;
  statusBar.firstElementChild.textContent = message;
}

function convert() {
  const text = input.value;
  if (!text.trim()) {
    state.data = null;
    state.text = "";
    setStatus("Ready");
    return;
  }

  const delimiterChoice = resolveDelimiter(delimiterSelect.value);
  try {
    if (state.mode === "csv-json") {
      const data = csvToData(text, { delimiter: delimiterChoice, header: headerRow.checked, infer: inferTypes.checked });
      state.data = data;
      state.text = dataToJson(data);
      const name = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" }[data.delimiter];
      const detected = delimiterChoice === "auto" ? ` · ${name} detected` : "";
      if (data.ragged) {
        setStatus(`${plural(data.rows.length, "row")}${detected} · ${plural(data.ragged, "row")} had a different column count and ${data.ragged === 1 ? "was" : "were"} padded`, "warning");
      } else {
        setStatus(`${plural(data.rows.length, "row")} · ${plural(data.headers.length, "column")}${detected}`, "success");
      }
    } else {
      const data = jsonToData(text);
      const delimiter = delimiterChoice === "auto" ? "," : delimiterChoice;
      state.data = data;
      state.text = dataToCsv(data, { delimiter, header: headerRow.checked });
      setStatus(`${plural(data.rows.length, "row")} · ${plural(data.headers.length, "column")}`, "success");
    }
  } catch (error) {
    state.data = null;
    state.text = "";
    setStatus(error.message, "error");
  }
}

function render() {
  convert();
  output.value = state.text;
  if (state.sort.column >= (state.data?.headers.length ?? 0)) state.sort = { column: -1, dir: 0 };
  renderTable();
}

function applyMode(mode, { swap = false } = {}) {
  if (!MODES.includes(mode)) mode = "csv-json";
  const changed = mode !== state.mode;
  if (swap && changed && state.text) input.value = state.text;
  state.mode = mode;
  state.sort = { column: -1, dir: 0 };

  const csvIn = mode === "csv-json";
  inputTitle.textContent = csvIn ? "CSV Input" : "JSON Input";
  textViewBtn.textContent = csvIn ? "JSON" : "CSV";
  input.placeholder = csvIn
    ? "Paste CSV here, or drop a .csv file…"
    : "Paste a JSON array of objects here, or drop a .json file…";
  document.querySelectorAll(".csv-only").forEach((el) => { el.hidden = !csvIn; });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  render();
}

function applyView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  tableView.hidden = view !== "table";
  textView.hidden = view !== "text";
  filterInput.hidden = view !== "table";
}

/* --- Actions -------------------------------------------------------------- */

function loadText(text) {
  input.value = text;
  render();
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    const looksJson = /\.json$/i.test(file.name) || /^\s*[[{]/.test(text);
    const wanted = looksJson ? "json-csv" : "csv-json";
    if (wanted !== state.mode) {
      applyMode(wanted);
      window.DevToolsMain.writeHashState(wanted);
    }
    if (/\.tsv$/i.test(file.name)) {
      window.DevToolsMain.selectDropdownValue(delimiterSelect.nextElementSibling, "\\t", { emit: false });
    }
    loadText(text);
    window.DevToolsMain.showToast(`Opened ${file.name}`, "success");
  };
  reader.onerror = () => window.DevToolsMain.showToast("Could not read that file", "error");
  reader.readAsText(file);
}

const ACTIONS = {
  sample() {
    loadText(SAMPLES[state.mode]);
    window.DevToolsMain.showToast("Sample inserted", "info");
  },

  open() {
    fileInput.click();
  },

  async paste() {
    try {
      loadText(await navigator.clipboard.readText());
    } catch {
      input.focus();
      window.DevToolsMain.showToast("Clipboard is not available", "error");
    }
  },

  clear() {
    filterInput.value = "";
    loadText("");
    window.DevToolsMain.showToast("Cleared", "info");
  },

  async copy() {
    if (!state.text) {
      window.DevToolsMain.showToast("Nothing to copy", "error");
      return;
    }
    // Awaited: a rejected clipboard write used to be reported as "copied".
    try {
      await window.DevToolsMain.copyText(state.text);
      window.DevToolsMain.showToast(`${state.mode === "csv-json" ? "JSON" : "CSV"} copied`, "success");
    } catch {
      window.DevToolsMain.showToast("Copy failed", "error");
    }
  },

  download() {
    if (!state.text) {
      window.DevToolsMain.showToast("Nothing to download", "error");
      return;
    }
    if (state.mode === "csv-json") {
      window.DevToolsMain.downloadText("data.json", state.text, "application/json");
    } else {
      window.DevToolsMain.downloadText("data.csv", state.text, "text/csv");
    }
  },
};

/* --- Wiring --------------------------------------------------------------- */

input.addEventListener("input", render);
delimiterSelect.addEventListener("change", render);
headerRow.addEventListener("change", render);
inferTypes.addEventListener("change", render);
filterInput.addEventListener("input", renderTable);

table.tHead.addEventListener("click", (event) => {
  const button = event.target.closest(".sort-btn");
  if (!button) return;
  const column = Number(button.dataset.column);
  const { sort } = state;
  if (sort.column !== column) state.sort = { column, dir: 1 };
  else state.sort = { column, dir: sort.dir === 1 ? -1 : sort.dir === -1 ? 0 : 1 };
  renderTable();
  table.tHead.querySelector(`.sort-btn[data-column="${column}"]`)?.focus();
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.mode === state.mode) return;
    applyMode(button.dataset.mode, { swap: true });
    window.DevToolsMain.writeHashState(state.mode);
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => applyView(button.dataset.view));
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.(button));
});

fileInput.addEventListener("change", () => {
  readFile(fileInput.files[0]);
  fileInput.value = "";
});

input.addEventListener("dragover", (event) => {
  event.preventDefault();
  input.classList.add("is-dragover");
});
input.addEventListener("dragleave", () => input.classList.remove("is-dragover"));
input.addEventListener("drop", (event) => {
  event.preventDefault();
  input.classList.remove("is-dragover");
  readFile(event.dataTransfer.files[0]);
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

window.DevToolsMain.onHashState((value) => {
  if (MODES.includes(value) && value !== state.mode) applyMode(value);
});

applyMode(MODES.includes(window.DevToolsMain.readHashState()) ? window.DevToolsMain.readHashState() : "csv-json");
applyView("table");
