// Fake Data Generator

const fieldList = document.getElementById("field-list");
const emptyState = document.getElementById("empty-state");
const recordCountInput = document.getElementById("record-count");
const structureToggle = document.getElementById("structure-toggle");
const structureHint = document.getElementById("structure-hint");
const outputEditor = document.getElementById("output-editor");
const outputLineNumbers = document.getElementById("output-line-numbers");
const outputHighlights = document.getElementById("output-highlights");
const outputStatus = document.getElementById("output-status");
const statFields = document.getElementById("stat-fields");
const statRecords = document.getElementById("stat-records");
const schemaHelpModal = document.getElementById("schemaHelpModal");
const schemaHelpBtn = document.getElementById("schemaHelpBtn");
const schemaHelpCloseBtn = document.getElementById("schemaHelpCloseBtn");

let structureMode = "flat";
let generateTimer = null;
let lastValidRecordCount = 10;

const TYPE_GROUPS = [
  {
    label: "Identity",
    types: [
      { value: "full_name", label: "Full name" },
      { value: "first_name", label: "First name" },
      { value: "last_name", label: "Last name" },
      { value: "email", label: "Email" },
      { value: "phone", label: "Phone number" },
      { value: "username", label: "Username" }
    ]
  },
  {
    label: "Location",
    types: [
      { value: "street_address", label: "Street address" },
      { value: "city", label: "City" },
      { value: "state", label: "State" },
      { value: "zip_code", label: "Zip code" },
      { value: "country", label: "Country" },
      { value: "latitude", label: "Latitude" },
      { value: "longitude", label: "Longitude" }
    ]
  },
  {
    label: "Text",
    types: [
      { value: "sentence", label: "Sentence" },
      { value: "paragraph", label: "Paragraph" },
      { value: "company_name", label: "Company name" },
      { value: "job_title", label: "Job title" },
      { value: "url", label: "URL" }
    ]
  },
  {
    label: "Tech",
    types: [
      { value: "uuid", label: "UUID" },
      { value: "ulid", label: "ULID" },
      { value: "boolean", label: "Boolean" },
      { value: "number", label: "Number" },
      { value: "date", label: "Date" },
      { value: "image_url", label: "Image URL" },
      { value: "ipv4", label: "IPv4" }
    ]
  }
];

const FIRST_NAMES = [
  "Olivia", "Noah", "Emma", "Liam", "Ava", "Ethan", "Sophia", "Mason",
  "Isabella", "Logan", "Mia", "Lucas", "Harper", "Elijah", "Evelyn",
  "James", "Amelia", "Benjamin", "Charlotte", "Henry", "Abigail", "Leo"
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis",
  "Garcia", "Rodriguez", "Wilson", "Martinez", "Anderson", "Taylor",
  "Thomas", "Hernandez", "Moore", "Martin", "Lee", "Perez", "Thompson"
];

const CITIES = [
  "New York", "Los Angeles", "Chicago", "Seattle", "Austin", "Denver",
  "Miami", "Boston", "Atlanta", "San Diego", "Portland", "Phoenix"
];

const STATES = [
  "CA", "NY", "TX", "WA", "FL", "CO", "AZ", "MA", "NC", "GA", "IL", "OR"
];

const COUNTRIES = [
  "United States", "Canada", "United Kingdom", "Germany", "France", "Australia",
  "Netherlands", "Spain", "India", "Brazil", "Japan", "Singapore"
];

const STREET_NAMES = [
  "Maple", "Oak", "Pine", "Cedar", "Elm", "Washington", "Lake", "Hill",
  "Sunset", "Park", "Ridge", "Walnut"
];

const STREET_SUFFIXES = ["St", "Ave", "Blvd", "Rd", "Ln", "Way", "Dr", "Ct"];

const WORDS = [
  "swift", "crimson", "harbor", "pixel", "delta", "quiet", "lunar", "ember",
  "magnet", "cloud", "signal", "matrix", "brisk", "orbit", "atlas", "copper",
  "canyon", "ripple", "valley", "meadow", "fusion", "zenith", "echo", "sable",
  "nylon", "vector", "quartz", "prism", "cascade", "ember", "raven", "silica"
];

const COMPANY_ADJECTIVES = ["Blue", "Quantum", "Bright", "Nova", "Summit", "Vertex", "Apex", "Prime", "Golden", "Cobalt"];
const COMPANY_NOUNS = ["Labs", "Dynamics", "Systems", "Analytics", "Works", "Studios", "Ventures", "Holdings", "Networks", "Solutions"];

const JOB_ADJECTIVES = ["Senior", "Lead", "Principal", "Product", "Growth", "Creative", "Data", "Customer", "Platform", "Digital"];
const JOB_ROLES = ["Engineer", "Designer", "Analyst", "Manager", "Strategist", "Researcher", "Architect", "Consultant", "Developer", "Coordinator"];

const EMAIL_DOMAINS = ["example.com", "mail.com", "inbox.com", "demo.io", "sample.org"];

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const defaultDateRange = (() => {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 3);
  return {
    start: formatDateInput(start),
    end: formatDateInput(end)
  };
})();

const TYPE_DEFAULTS = {
  number: { min: 1, max: 1000, decimals: 0 },
  date: { start: defaultDateRange.start, end: defaultDateRange.end },
  boolean: { trueChance: 50 },
  sentence: { minWords: 4, maxWords: 12 },
  paragraph: { minSentences: 2, maxSentences: 5 },
  image_url: { width: 640, height: 480 }
};

function showToast(message, type = "info") {
  return;
}

function flashActionIcon(button) {
  if (!button) return;

  if (button._actionStateTimeout) {
    window.clearTimeout(button._actionStateTimeout);
  }

  button.classList.remove("is-activated");
  void button.offsetWidth;
  button.classList.add("is-activated");
  button._actionStateTimeout = window.setTimeout(() => {
    button.classList.remove("is-activated");
    button._actionStateTimeout = null;
  }, 500);
}

function getTypeLabel(value) {
  for (const group of TYPE_GROUPS) {
    const match = group.types.find((type) => type.value === value);
    if (match) return match.label;
  }
  return value;
}

function buildTypeMenu(selectedValue) {
  return TYPE_GROUPS.map(group => {
    const options = group.types.map(type => {
      const active = type.value === selectedValue ? "active" : "";
      return `<button type="button" class="type-option ${active}" data-value="${type.value}">${type.label}</button>`;
    }).join("");
    return `
      <div class="type-group">
        <div class="type-group-label">${group.label}</div>
        ${options}
      </div>
    `;
  }).join("");
}

function addFieldRow(field = {}, { focusNew = true } = {}) {
  const row = document.createElement("div");
  row.className = "field-row";

  const nameValue = field.name ? escapeAttr(field.name) : "";
  const typeValue = field.type || "full_name";
  const typeLabel = getTypeLabel(typeValue);

  row.innerHTML = `
    <button class="drag-handle" type="button" draggable="true" aria-label="Drag to reorder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 20V6"></path>
        <path d="M4 9l3-3 3 3"></path>
        <path d="M17 4v14"></path>
        <path d="M14 14l3 3 3-3"></path>
      </svg>
    </button>
    <button class="remove-btn" data-action="remove" aria-label="Remove field">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="6" y1="6" x2="18" y2="18"/>
        <line x1="6" y1="18" x2="18" y2="6"/>
      </svg>
    </button>
    <div class="field-cell">
      <label class="field-label">Field</label>
      <input class="field-input field-name-input" type="text" placeholder="e.g. user.email" value="${nameValue}">
    </div>
    <div class="field-cell">
      <label class="field-label">Type</label>
      <div class="type-select" data-open="false">
        <button type="button" class="type-select-trigger">
          <span class="type-select-text">${typeLabel}</span>
          <span class="type-select-icon">▾</span>
        </button>
        <div class="type-select-menu" role="listbox">
          ${buildTypeMenu(typeValue)}
        </div>
        <input type="hidden" class="field-type-select" value="${typeValue}">
      </div>
    </div>
    <div class="field-cell">
      <label class="field-label">Options</label>
      <div class="options-wrap" data-options></div>
    </div>
  `;

  fieldList.appendChild(row);

  const typeSelect = row.querySelector(".field-type-select");
  const typeTrigger = row.querySelector(".type-select-trigger");
  const typeMenu = row.querySelector(".type-select-menu");
  renderOptions(row, typeValue, field.options);

  if (typeTrigger && typeMenu) {
    typeTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAllTypeMenus(row);
      const isOpen = row.querySelector(".type-select").dataset.open === "true";
      row.querySelector(".type-select").dataset.open = isOpen ? "false" : "true";
    });

    typeMenu.querySelectorAll(".type-option").forEach((optionBtn) => {
      optionBtn.addEventListener("click", () => {
        const value = optionBtn.dataset.value;
        typeSelect.value = value;
        row.querySelector(".type-select-text").textContent = getTypeLabel(value);
        typeMenu.querySelectorAll(".type-option").forEach((btn) => btn.classList.remove("active"));
        optionBtn.classList.add("active");
        row.querySelector(".type-select").dataset.open = "false";
        renderOptions(row, value);
        updateRowValidation(row);
        scheduleGenerate();
      });
    });
  }

  row.addEventListener("input", (event) => {
    if (event.target.matches(".field-name-input")) {
      updateRowValidation(row);
      updateStats();
    }
    if (event.target.matches(".option-input")) {
      scheduleGenerate();
    }
  });

  row.addEventListener("change", (event) => {
    if (event.target.matches(".field-type-select")) {
      renderOptions(row, typeSelect.value);
      updateRowValidation(row);
      scheduleGenerate();
    }
  });

  const removeBtn = row.querySelector("[data-action=\"remove\"]");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      row.remove();
      updateStats();
      updateEmptyState();
      scheduleGenerate();
    });
  }

  setupDragAndDrop(row);

  updateRowValidation(row);
  updateEmptyState();
  updateStats();
  scheduleGenerate();

  if (focusNew) {
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const nameInput = row.querySelector(".field-name-input");
    if (nameInput) {
      nameInput.focus();
    }
  }
}

let draggedRow = null;

function setupDragAndDrop(row) {
  const handle = row.querySelector(".drag-handle");
  if (!handle) return;

  handle.addEventListener("dragstart", (event) => {
    draggedRow = row;
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "drag");
  });

  handle.addEventListener("dragend", () => {
    if (draggedRow) draggedRow.classList.remove("is-dragging");
    draggedRow = null;
    scheduleGenerate();
  });
}

function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll(".field-row:not(.is-dragging)")];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function closeAllTypeMenus(exceptRow = null) {
  document.querySelectorAll(".type-select").forEach((select) => {
    if (exceptRow && exceptRow.contains(select)) return;
    select.dataset.open = "false";
  });
}

function renderOptions(row, type, presetOptions = null) {
  const optionsWrap = row.querySelector("[data-options]");
  optionsWrap.innerHTML = "";

  const defaults = TYPE_DEFAULTS[type] || {};
  const options = { ...defaults, ...(presetOptions || {}) };

  if (type === "number") {
    optionsWrap.appendChild(createOptionInput("Min", "min", options.min));
    optionsWrap.appendChild(createOptionInput("Max", "max", options.max));
    optionsWrap.appendChild(createOptionInput("Decimals", "decimals", options.decimals));
    return;
  }

  if (type === "date") {
    optionsWrap.appendChild(createOptionInput("Start", "start", options.start, "date"));
    optionsWrap.appendChild(createOptionInput("End", "end", options.end, "date"));
    return;
  }

  if (type === "boolean") {
    optionsWrap.appendChild(createOptionInput("True %", "trueChance", options.trueChance));
    return;
  }

  if (type === "sentence") {
    optionsWrap.appendChild(createOptionInput("Min words", "minWords", options.minWords));
    optionsWrap.appendChild(createOptionInput("Max words", "maxWords", options.maxWords));
    return;
  }

  if (type === "paragraph") {
    optionsWrap.appendChild(createOptionInput("Min sent", "minSentences", options.minSentences));
    optionsWrap.appendChild(createOptionInput("Max sent", "maxSentences", options.maxSentences));
    return;
  }

  if (type === "image_url") {
    optionsWrap.appendChild(createOptionInput("Width", "width", options.width));
    optionsWrap.appendChild(createOptionInput("Height", "height", options.height));
    return;
  }

  const hint = document.createElement("span");
  hint.className = "option-hint";
  hint.textContent = "No options";
  optionsWrap.appendChild(hint);
}

function createOptionInput(label, key, value, type = "number") {
  const wrapper = document.createElement("div");
  wrapper.className = "option-field";
  wrapper.innerHTML = `
    <label class="option-label">${label}</label>
    <input class="option-input" data-option="${key}" type="${type}" value="${value}">
  `;
  return wrapper;
}

function updateRowValidation(row) {
  const name = row.querySelector(".field-name-input").value.trim();
  const type = row.querySelector(".field-type-select").value;
  if (!name || !type) {
    row.classList.add("is-invalid");
  } else {
    row.classList.remove("is-invalid");
  }
}

function updateEmptyState() {
  const hasRows = fieldList.children.length > 0;
  emptyState.style.display = hasRows ? "none" : "block";
}

function updateStats() {
  const fields = getFieldsFromDOM();
  if (statFields) statFields.textContent = String(fields.length);
  if (statRecords) statRecords.textContent = String(getRecordCount());
}

function scheduleGenerate() {
  if (generateTimer) clearTimeout(generateTimer);
  generateTimer = setTimeout(() => generateOutput(true), 300);
}

function getRecordCount() {
  const rawValue = recordCountInput.value;
  if (rawValue === "") {
    return lastValidRecordCount;
  }
  const raw = Number(rawValue);
  const safe = Number.isFinite(raw) ? Math.max(1, Math.min(100, Math.round(raw))) : lastValidRecordCount;
  recordCountInput.value = String(safe);
  lastValidRecordCount = safe;
  return safe;
}

function setStructureMode(mode) {
  structureMode = mode;
  structureToggle.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.structure === mode);
  });
  structureHint.textContent = mode === "nested"
    ? "Nested turns dot notation into objects."
    : "Flat keeps field names as-is.";
  scheduleGenerate();
}

function getFieldFromRow(row) {
  const name = row.querySelector(".field-name-input").value.trim();
  const type = row.querySelector(".field-type-select").value;
  const options = {};
  row.querySelectorAll("[data-option]").forEach((input) => {
    options[input.dataset.option] = input.value;
  });
  return { name, type, options };
}

function getFieldsFromDOM() {
  const rows = Array.from(fieldList.querySelectorAll(".field-row"));
  return rows
    .map(getFieldFromRow)
    .filter((field) => field.name && field.type);
}

function generateOutput(isAuto = false) {
  const fields = getFieldsFromDOM();
  const count = getRecordCount();

  if (fields.length === 0) {
    setOutput("[]");
    if (!isAuto) showToast("Add at least one field", "error");
    updateStats();
    return;
  }

  const records = Array.from({ length: count }, () => generateRecord(fields));
  const output = JSON.stringify(records, null, 2);
  setOutput(output);
  updateStats();

  if (!isAuto) {
    showToast(`Generated ${count} records`, "success");
  }

  updateOutputStatus(`Generated ${count} records`, "success");
}

function generateRecord(fields) {
  const record = {};
  fields.forEach((field) => {
    const value = generateValue(field);
    if (structureMode === "nested") {
      setNestedValue(record, field.name, value);
    } else {
      record[field.name] = value;
    }
  });
  return record;
}

function generateValue(field) {
  const options = field.options || {};
  switch (field.type) {
    case "full_name":
      return `${randomFirstName()} ${randomLastName()}`;
    case "first_name":
      return randomFirstName();
    case "last_name":
      return randomLastName();
    case "email":
      return randomEmail();
    case "phone":
      return randomPhone();
    case "username":
      return randomUsername();
    case "street_address":
      return randomStreetAddress();
    case "city":
      return randomItem(CITIES);
    case "state":
      return randomItem(STATES);
    case "zip_code":
      return randomZip();
    case "country":
      return randomItem(COUNTRIES);
    case "latitude":
      return randomFloat(-90, 90, 6);
    case "longitude":
      return randomFloat(-180, 180, 6);
    case "sentence":
      return randomSentence(options);
    case "paragraph":
      return randomParagraph(options);
    case "company_name":
      return randomCompanyName();
    case "job_title":
      return randomJobTitle();
    case "url":
      return randomUrl();
    case "uuid":
      return uuidv4();
    case "ulid":
      return ulid();
    case "boolean":
      return randomBoolean(options);
    case "number":
      return randomNumber(options);
    case "date":
      return randomDate(options);
    case "image_url":
      return randomImageUrl(options);
    case "ipv4":
      return randomIPv4();
    default:
      return null;
  }
}

function randomFirstName() {
  return randomItem(FIRST_NAMES);
}

function randomLastName() {
  return randomItem(LAST_NAMES);
}

function randomEmail() {
  const first = randomFirstName().toLowerCase();
  const last = randomLastName().toLowerCase();
  const domain = randomItem(EMAIL_DOMAINS);
  const number = randomInt(1, 99);
  return `${first}.${last}${number}@${domain}`;
}

function randomPhone() {
  const area = randomInt(200, 999);
  const mid = randomInt(100, 999);
  const last = randomInt(1000, 9999);
  return `+1-${area}-${mid}-${last}`;
}

function randomUsername() {
  const first = randomFirstName().toLowerCase();
  const last = randomLastName().toLowerCase();
  const number = randomInt(10, 999);
  return `${first}_${last}${number}`;
}

function randomStreetAddress() {
  const number = randomInt(100, 9999);
  const street = randomItem(STREET_NAMES);
  const suffix = randomItem(STREET_SUFFIXES);
  return `${number} ${street} ${suffix}`;
}

function randomZip() {
  return String(randomInt(10000, 99999));
}

function randomSentence(options) {
  const minWords = clampNumber(options.minWords, 3, 20, TYPE_DEFAULTS.sentence.minWords);
  const maxWords = clampNumber(options.maxWords, minWords, 24, TYPE_DEFAULTS.sentence.maxWords);
  const count = randomInt(minWords, maxWords);
  const words = Array.from({ length: count }, () => randomItem(WORDS));
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function randomParagraph(options) {
  const minSent = clampNumber(options.minSentences, 1, 8, TYPE_DEFAULTS.paragraph.minSentences);
  const maxSent = clampNumber(options.maxSentences, minSent, 10, TYPE_DEFAULTS.paragraph.maxSentences);
  const count = randomInt(minSent, maxSent);
  return Array.from({ length: count }, () => randomSentence(TYPE_DEFAULTS.sentence)).join(" ");
}

function randomCompanyName() {
  return `${randomItem(COMPANY_ADJECTIVES)} ${randomItem(COMPANY_NOUNS)}`;
}

function randomJobTitle() {
  return `${randomItem(JOB_ADJECTIVES)} ${randomItem(JOB_ROLES)}`;
}

function randomUrl() {
  const noun = randomItem(COMPANY_NOUNS).toLowerCase();
  const suffix = randomItem(["com", "io", "dev", "co"]);
  return `https://www.${noun}.${suffix}`;
}

function randomBoolean(options) {
  const chance = clampNumber(options.trueChance, 0, 100, TYPE_DEFAULTS.boolean.trueChance);
  return Math.random() * 100 < chance;
}

function randomNumber(options) {
  const min = clampNumber(options.min, -100000, 100000, TYPE_DEFAULTS.number.min);
  const max = clampNumber(options.max, min, 1000000, TYPE_DEFAULTS.number.max);
  const decimals = clampNumber(options.decimals, 0, 6, TYPE_DEFAULTS.number.decimals);
  if (decimals === 0) {
    return randomInt(min, max);
  }
  return roundTo(randomFloat(min, max, decimals), decimals);
}

function randomDate(options) {
  const startDate = parseDate(options.start) || parseDate(TYPE_DEFAULTS.date.start);
  const endDate = parseDate(options.end) || parseDate(TYPE_DEFAULTS.date.end);
  const start = startDate.getTime();
  const end = endDate.getTime();
  const time = randomInt(Math.min(start, end), Math.max(start, end));
  return formatDateOutput(new Date(time));
}

function randomImageUrl(options) {
  const width = clampNumber(options.width, 100, 2000, TYPE_DEFAULTS.image_url.width);
  const height = clampNumber(options.height, 100, 2000, TYPE_DEFAULTS.image_url.height);
  const seed = randomInt(1, 99999);
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

function randomIPv4() {
  return `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;
}

function uuidv4() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ulid() {
  const time = Date.now();
  let timeChars = "";
  let value = time;
  for (let i = 0; i < 10; i++) {
    const mod = value % 32;
    timeChars = CROCKFORD_BASE32[mod] + timeChars;
    value = Math.floor(value / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += CROCKFORD_BASE32[randomInt(0, 31)];
  }
  return timeChars + rand;
}

function setNestedValue(target, path, value) {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  });
}

function randomItem(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function randomFloat(min, max, decimals = 2) {
  const value = Math.random() * (max - min) + min;
  return roundTo(value, decimals);
}

function roundTo(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOutput(date) {
  return formatDateInput(date);
}

function setOutput(value) {
  outputEditor.value = value;
  updateLineNumbers();
  updateHighlights();
  updateOutputStatus();
}

function updateLineNumbers() {
  const lines = outputEditor.value.split("\n");
  const lineCount = Math.max(lines.length, 1);
  let html = "";
  for (let i = 1; i <= lineCount; i++) {
    html += `<span class="line-number">${i}</span>`;
  }
  outputLineNumbers.innerHTML = html;
}

function updateHighlights() {
  const lines = outputEditor.value.split("\n");
  let html = "";
  lines.forEach((line) => {
    const escaped = escapeHtml(line) || " ";
    html += `<div class="highlight-line">${escaped}</div>`;
  });
  outputHighlights.innerHTML = html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateOutputStatus(message = null, type = null) {
  const statusText = outputStatus.querySelector(".status-text");
  const charCount = outputStatus.querySelector(".char-count");
  charCount.textContent = `${outputEditor.value.length} characters`;
  if (message) {
    statusText.textContent = message;
    statusText.className = `status-text ${type || ""}`;
  } else {
    statusText.textContent = outputEditor.value.trim() ? "Generated JSON" : "Ready";
    statusText.className = "status-text";
  }
}

function copyOutput(button = null) {
  const value = outputEditor.value.trim();
  if (!value) {
    showToast("Nothing to copy", "error");
    return;
  }
  navigator.clipboard.writeText(value).then(() => {
    flashActionIcon(button);
    showToast("Copied to clipboard", "success");
  }).catch(() => {
    showToast("Copy failed", "error");
  });
}

function downloadOutput(button = null) {
  const value = outputEditor.value.trim();
  if (!value) {
    showToast("Nothing to download", "error");
    return;
  }
  const blob = new Blob([value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fake-data.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  flashActionIcon(button);
  showToast("Download started", "success");
}

function clearOutput(button = null) {
  setOutput("");
  updateOutputStatus("Ready", "");
  flashActionIcon(button);
  showToast("Output cleared", "info");
}

function clearFields(button = null) {
  fieldList.innerHTML = "";
  updateEmptyState();
  updateStats();
  scheduleGenerate();
  flashActionIcon(button);
}

function loadSampleSchema(button = null) {
  clearFields();
  const sample = structureMode === "nested" ? [
    { name: "user.id", type: "uuid" },
    { name: "user.name", type: "full_name" },
    { name: "user.email", type: "email" },
    { name: "user.phone", type: "phone" },
    { name: "user.address.city", type: "city" },
    { name: "user.address.country", type: "country" },
    { name: "company.name", type: "company_name" },
    { name: "meta.created_at", type: "date" }
  ] : [
    { name: "id", type: "uuid" },
    { name: "full_name", type: "full_name" },
    { name: "email", type: "email" },
    { name: "phone", type: "phone" },
    { name: "city", type: "city" },
    { name: "country", type: "country" },
    { name: "company", type: "company_name" },
    { name: "created_at", type: "date" }
  ];
  sample.forEach((item) => addFieldRow(item, { focusNew: false }));
  flashActionIcon(button);
  showToast("Sample schema loaded", "success");
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

// Event Handlers

document.querySelectorAll(".action-btn[data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    if (action === "add-field") {
      addFieldRow();
      flashActionIcon(btn);
    }
    if (action === "load-sample") loadSampleSchema(btn);
    if (action === "clear-fields") clearFields(btn);
    if (action === "generate") {
      generateOutput(false);
      flashActionIcon(btn);
    }
    if (action === "copy-output") copyOutput(btn);
    if (action === "download-output") downloadOutput(btn);
    if (action === "clear-output") clearOutput(btn);
  });
});

if (recordCountInput) {
  recordCountInput.addEventListener("input", () => {
    if (recordCountInput.value !== "") {
      getRecordCount();
    }
    updateStats();
    scheduleGenerate();
  });

  recordCountInput.addEventListener("blur", () => {
    if (recordCountInput.value === "") {
      recordCountInput.value = String(lastValidRecordCount);
    }
    getRecordCount();
    updateStats();
    scheduleGenerate();
  });
}

if (structureToggle) {
  structureToggle.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setStructureMode(btn.dataset.structure);
    });
  });
}

if (schemaHelpBtn) {
  schemaHelpBtn.addEventListener("click", () => openSchemaHelpModal());
}

if (schemaHelpCloseBtn) {
  schemaHelpCloseBtn.addEventListener("click", closeSchemaHelpModal);
}

if (schemaHelpModal) {
  schemaHelpModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]") || event.target === schemaHelpModal) {
      closeSchemaHelpModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (schemaHelpModal?.classList.contains("is-open")) closeSchemaHelpModal();
    closeAllTypeMenus();
  }
});

document.addEventListener("click", () => {
  closeAllTypeMenus();
});

function openSchemaHelpModal() {
  if (!schemaHelpModal) return;
  schemaHelpModal.classList.add("is-open");
  schemaHelpModal.setAttribute("aria-hidden", "false");
  if (schemaHelpCloseBtn) schemaHelpCloseBtn.focus();
}

function closeSchemaHelpModal() {
  if (!schemaHelpModal) return;
  schemaHelpModal.classList.remove("is-open");
  schemaHelpModal.setAttribute("aria-hidden", "true");
}

if (outputEditor) {
  outputEditor.addEventListener("scroll", () => {
    outputLineNumbers.scrollTop = outputEditor.scrollTop;
    outputHighlights.scrollTop = outputEditor.scrollTop;
    outputHighlights.scrollLeft = outputEditor.scrollLeft;
  });
}

function init() {
  setStructureMode("flat");
  addFieldRow({ name: "id", type: "uuid" }, { focusNew: false });
  addFieldRow({ name: "full_name", type: "full_name" }, { focusNew: false });
  addFieldRow({ name: "email", type: "email" }, { focusNew: false });
  addFieldRow({ name: "city", type: "city" }, { focusNew: false });
  addFieldRow({ name: "company", type: "company_name" }, { focusNew: false });
  generateOutput(true);
}

init();

if (fieldList) {
  fieldList.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!draggedRow) return;
    const after = getDragAfterElement(fieldList, event.clientY);
    if (after == null) {
      fieldList.appendChild(draggedRow);
    } else {
      fieldList.insertBefore(draggedRow, after);
    }
  });

  fieldList.addEventListener("drop", (event) => {
    event.preventDefault();
  });
}
