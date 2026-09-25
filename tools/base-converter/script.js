// Base Converter

const inputs = {
  text: document.getElementById("text-input"),
  decimal: document.getElementById("decimal-input"),
  binary: document.getElementById("binary-input"),
  hex: document.getElementById("hex-input"),
  octal: document.getElementById("octal-input")
};

const rows = {
  text: document.querySelector("[data-row=\"text\"]"),
  decimal: document.querySelector("[data-row=\"decimal\"]"),
  binary: document.querySelector("[data-row=\"binary\"]"),
  hex: document.querySelector("[data-row=\"hex\"]"),
  octal: document.querySelector("[data-row=\"octal\"]")
};

const leftStatus = document.getElementById("left-status");
const leftStatusText = leftStatus?.querySelector(".status-text");
const leftCharCount = document.getElementById("char-count");

const conversionStatus = document.getElementById("conversion-status");
const conversionStatusText = conversionStatus?.querySelector(".status-text");
const byteCount = document.getElementById("byte-count");

const toastContainer = document.getElementById("toast-container");
const schemaHelpModal = document.getElementById("schemaHelpModal");
const schemaHelpBtn = document.getElementById("schemaHelpBtn");
const schemaHelpCloseBtn = document.getElementById("schemaHelpCloseBtn");

const SOURCE_LABELS = {
  text: "Text",
  decimal: "Decimal",
  binary: "Binary",
  hex: "Hexadecimal",
  octal: "Octal"
};

const DOWNLOAD_NAMES = {
  text: "text.txt",
  decimal: "decimal.txt",
  binary: "binary.txt",
  hex: "hex.txt",
  octal: "octal.txt"
};

let isUpdating = false;
function showToast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

function splitTokens(value) {
  return value
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
}

function chunkToken(value, size) {
  const chunks = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks;
}

function stripPrefix(value, prefix) {
  const lower = value.toLowerCase();
  if (prefix && lower.startsWith(prefix)) {
    return lower.slice(prefix.length);
  }
  return value;
}

function parseNumericInput(raw, options) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { values: [], error: null };
  }

  const { base, label, pattern, prefix, chunkSize } = options;
  let tokens = splitTokens(trimmed);

  if (tokens.length === 1 && chunkSize) {
    const normalized = stripPrefix(tokens[0], prefix);
    if (normalized.length > chunkSize && normalized.length % chunkSize === 0) {
      tokens = chunkToken(normalized, chunkSize);
    } else {
      tokens = [normalized];
    }
  }

  const values = [];
  for (const token of tokens) {
    const normalized = stripPrefix(token, prefix);
    if (!normalized || !pattern.test(normalized)) {
      return { values: [], error: `Invalid ${label} value: "${token}"` };
    }
    const value = Number.parseInt(normalized, base);
    if (!Number.isFinite(value)) {
      return { values: [], error: `Invalid ${label} value: "${token}"` };
    }
    if (value < 0 || value > 255) {
      return { values: [], error: `${label} bytes must be between 0 and 255` };
    }
    values.push(value);
  }
  return { values, error: null };
}

function parseTextInput(raw) {
  if (!raw) {
    return { values: [], error: null };
  }
  const values = Array.from(new TextEncoder().encode(raw));
  return { values, error: null };
}

function valuesToText(values) {
  const bytes = Uint8Array.from(values, (value) => Math.max(0, Math.min(255, Math.round(value))));
  return new TextDecoder().decode(bytes);
}

function formatValues(values, base, pad) {
  return values
    .map((value) => {
      const safe = Math.max(0, Math.round(value));
      const formatted = safe.toString(base).toUpperCase();
      return pad ? formatted.padStart(pad, "0") : formatted;
    })
    .join(" ");
}

function setRowInvalid(key, isInvalid) {
  const row = rows[key];
  if (!row) return;
  row.classList.toggle("is-invalid", isInvalid);
}

function clearInvalids() {
  Object.keys(rows).forEach((key) => setRowInvalid(key, false));
}

function updateStatus(values, sourceKey, errorMessage = null) {
  const sourceLabel = SOURCE_LABELS[sourceKey] || "Input";
  const hasValues = values.length > 0;
  const nonAscii = values.some((value) => value > 127);

  const message = errorMessage
    ? errorMessage
    : hasValues
      ? `Updated from ${sourceLabel}${nonAscii ? " · Non-ASCII values" : ""}`
      : "Ready";

  const statusClass = errorMessage
    ? "error"
    : nonAscii
      ? "warning"
      : hasValues
        ? "success"
        : "";

  if (leftStatusText) {
    leftStatusText.textContent = message;
    leftStatusText.className = `status-text ${statusClass}`.trim();
  }

  if (conversionStatusText) {
    conversionStatusText.textContent = message;
    conversionStatusText.className = `status-text ${statusClass}`.trim();
  }

  if (byteCount) {
    byteCount.textContent = `${values.length} bytes`;
  }

  if (leftCharCount) {
    const textLength = inputs.text?.value.length ?? 0;
    leftCharCount.textContent = `${textLength} chars`;
  }
}

function setAllValues(values, sourceKey) {
  const textValue = valuesToText(values);
  const decimalValue = values.map((value) => Math.max(0, Math.round(value))).join(" ");
  const binaryValue = formatValues(values, 2, 8);
  const hexValue = formatValues(values, 16, 2);
  const octalValue = formatValues(values, 8, 3);

  isUpdating = true;
  if (sourceKey !== "text" && inputs.text) inputs.text.value = textValue;
  if (sourceKey !== "decimal" && inputs.decimal) inputs.decimal.value = decimalValue;
  if (sourceKey !== "binary" && inputs.binary) inputs.binary.value = binaryValue;
  if (sourceKey !== "hex" && inputs.hex) inputs.hex.value = hexValue;
  if (sourceKey !== "octal" && inputs.octal) inputs.octal.value = octalValue;
  isUpdating = false;

  updateStatus(values, sourceKey);
}

function handleInput(sourceKey) {
  if (isUpdating) return;
  const input = inputs[sourceKey];
  if (!input) return;
  const raw = input.value;

  let result = { values: [], error: null };
  if (sourceKey === "text") {
    result = parseTextInput(raw);
  }
  if (sourceKey === "decimal") {
    result = parseNumericInput(raw, {
      base: 10,
      label: "decimal",
      pattern: /^\d+$/,
      prefix: null,
      chunkSize: null
    });
  }
  if (sourceKey === "binary") {
    result = parseNumericInput(raw, {
      base: 2,
      label: "binary",
      pattern: /^[01]+$/,
      prefix: "0b",
      chunkSize: 8
    });
  }
  if (sourceKey === "hex") {
    result = parseNumericInput(raw, {
      base: 16,
      label: "hexadecimal",
      pattern: /^[0-9a-f]+$/i,
      prefix: "0x",
      chunkSize: 2
    });
  }
  if (sourceKey === "octal") {
    result = parseNumericInput(raw, {
      base: 8,
      label: "octal",
      pattern: /^[0-7]+$/,
      prefix: "0o",
      chunkSize: 3
    });
  }

  if (result.error) {
    clearInvalids();
    setRowInvalid(sourceKey, true);
    updateStatus([], sourceKey, result.error);
    return;
  }

  clearInvalids();
  if (result.values.length === 0 && raw.trim() === "") {
    isUpdating = true;
    Object.values(inputs).forEach((field) => {
      if (field) field.value = "";
    });
    isUpdating = false;
    updateStatus([], sourceKey);
    return;
  }

  setAllValues(result.values, sourceKey);
}

function clearAll(triggerButton = null) {
  isUpdating = true;
  Object.values(inputs).forEach((field) => {
    if (field) field.value = "";
  });
  isUpdating = false;
  clearInvalids();
  updateStatus([], "text");
  flashActionButton(triggerButton);
  showToast("Converter cleared", "info");
}

function copyAll() {
  const text = inputs.text?.value.trim() ?? "";
  const decimal = inputs.decimal?.value.trim() ?? "";
  const binary = inputs.binary?.value.trim() ?? "";
  const hex = inputs.hex?.value.trim() ?? "";
  const octal = inputs.octal?.value.trim() ?? "";

  if (!text && !decimal && !binary && !hex && !octal) {
    showToast("Nothing to copy", "error");
    return;
  }

  const payload = [
    `Text: ${text}`,
    `Decimal: ${decimal}`,
    `Binary: ${binary}`,
    `Hex: ${hex}`,
    `Octal: ${octal}`
  ].join("\n");

  navigator.clipboard
    .writeText(payload)
    .then(() => showToast("Copied all fields", "success"))
    .catch(() => showToast("Copy failed", "error"));
}

function copyField(key) {
  const value = inputs[key]?.value.trim() ?? "";
  if (!value) {
    showToast("Nothing to copy", "error");
    return;
  }

  const copyButton = document.querySelector(`.copy-btn[data-target="${key}"]`);
  navigator.clipboard
    .writeText(value)
    .then(() => {
      flashCopyButton(copyButton);
      showToast(`${SOURCE_LABELS[key]} copied`, "success");
    })
    .catch(() => showToast("Copy failed", "error"));
}

function flashButton(button, activeClass, timeoutKey) {
  if (!button) return;

  if (button[timeoutKey]) {
    window.clearTimeout(button[timeoutKey]);
  }

  button.classList.remove(activeClass);
  void button.offsetWidth;
  button.classList.add(activeClass);
  button[timeoutKey] = window.setTimeout(() => {
    button.classList.remove(activeClass);
    button[timeoutKey] = null;
  }, 500);
}

function flashCopyButton(button) {
  flashButton(button, "is-copied", "_copiedStateTimeout");
}

function flashDownloadButton(button) {
  flashButton(button, "is-downloaded", "_downloadedStateTimeout");
}

function flashActionButton(button) {
  flashButton(button, "is-confirmed", "_confirmedStateTimeout");
}

function downloadField(key) {
  const value = inputs[key]?.value.trim() ?? "";
  if (!value) {
    showToast("Nothing to download", "error");
    return;
  }
  const downloadButton = document.querySelector(`.download-btn[data-target="${key}"]`);
  const blob = new Blob([value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = DOWNLOAD_NAMES[key] || `${key}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  flashDownloadButton(downloadButton);
  showToast(`${SOURCE_LABELS[key]} downloaded`, "success");
}

function loadSample(triggerButton = null, { announce = true } = {}) {
  if (!inputs.text) return;
  inputs.text.value = "Hello";
  handleInput("text");
  flashActionButton(triggerButton);
  if (announce) showToast("Loaded sample input", "success");
}

// Event Handlers

Object.keys(inputs).forEach((key) => {
  const field = inputs[key];
  if (!field) return;
  field.addEventListener("input", () => handleInput(key));
});

document.querySelectorAll(".action-btn[data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    // The header actions belong to whichever mode is showing.
    const integer = currentView === "integer";
    if (action === "clear-all") integer ? clearInteger(btn) : clearAll(btn);
    if (action === "copy-all") copyAll();
    if (action === "paste-sample") integer ? loadIntegerSample(btn) : loadSample(btn);
  });
});

document.querySelectorAll(".copy-btn[data-action=\"copy-field\"]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target && inputs[target]) {
      copyField(target);
    }
  });
});

document.querySelectorAll(".download-btn[data-action=\"download-field\"]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target && inputs[target]) {
      downloadField(target);
    }
  });
});

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
  }
});

function openSchemaHelpModal() {
  if (!schemaHelpModal) return;
  window.DevToolsMain.openModal(schemaHelpModal);
}

function closeSchemaHelpModal() {
  if (!schemaHelpModal) return;
  window.DevToolsMain.closeModal(schemaHelpModal);
}

// ==================== Integer mode ====================
//
// One whole number, arbitrary size. Everything is BigInt: Number silently
// loses precision past 2^53, which is exactly where a base converter gets
// interesting (64-bit IDs, 128-bit UUIDs, 2^200).

const VIEWS = ["text", "integer"];
let currentView = "text";

const PREFIX_BASES = { "0x": 16, "0b": 2, "0o": 8 };
const BASE_PREFIXES = { 16: "0x", 2: "0b", 8: "0o" };

// Radix-32 here is BigInt#toString(32) (0-9a-v). RFC 4648 base32 encodes a
// byte string, not a number, so it has no meaning for a signed integer.
const INT_OUTPUTS = [
  { key: "bin", base: 2, icon: "2", label: "Binary", tag: "Base 2", span: true },
  { key: "oct", base: 8, icon: "8", label: "Octal", tag: "Base 8" },
  { key: "dec", base: 10, icon: "10", label: "Decimal", tag: "Base 10" },
  { key: "hex", base: 16, icon: "16", label: "Hexadecimal", tag: "Base 16" },
  { key: "b32", base: 32, icon: "32", label: "Radix-32", tag: "0–9 a–v" },
  { key: "b36", base: 36, icon: "36", label: "Base 36", tag: "0–9 a–z" },
  { key: "custom", base: null, icon: "N", label: "Custom base", tag: null }
];

const INT_GROUPED = [
  { key: "bin-nibble", icon: "2", label: "Binary by nibble", span: true },
  { key: "bin-byte", icon: "2", label: "Binary by byte", span: true },
  { key: "hex-byte", icon: "16", label: "Hex by byte", span: true }
];

const INT_TWOS = [
  { key: "twos-hex", icon: "16", label: "Hex" },
  { key: "twos-signed", icon: "±", label: "Read as signed" },
  { key: "twos-unsigned", icon: "+", label: "Read as unsigned" },
  { key: "twos-bin", icon: "2", label: "Binary by byte", span: true }
];

const intState = {
  value: null,
  detectedBase: 10,
  upper: false,
  width: 32,
  customBase: 3
};

const intInput = document.getElementById("int-input");
const intBase = document.getElementById("int-base");
const intError = document.getElementById("int-error");
const twosWarning = document.getElementById("twos-warning");
const twosRange = document.getElementById("twos-range");
const INT_SAMPLE = "0xDEAD_BEEF";

function digitValue(ch) {
  const code = ch.toLowerCase().charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 122) return code - 87;
  return -1;
}

/**
 * Parse one integer. `base` is a number 2–36 or "auto" (prefix, else decimal).
 * Returns { value: BigInt, base } or { error }. Empty input → { value: null }.
 */
function parseInteger(raw, base = "auto") {
  // `_` and whitespace are digit separators (1_000_000, "ff ff").
  let text = String(raw).replace(/[\s_]+/g, "");
  if (!text) return { value: null, base: base === "auto" ? 10 : base };

  let negative = false;
  if (text[0] === "-" || text[0] === "+") {
    negative = text[0] === "-";
    text = text.slice(1);
  }

  let radix = base === "auto" ? 10 : Number(base);
  const prefix = text.slice(0, 2).toLowerCase();
  if (PREFIX_BASES[prefix]) {
    // With an explicit base only its own prefix is stripped: in base 16,
    // "0b1" is the hex number b1, not binary 1.
    if (base === "auto") {
      radix = PREFIX_BASES[prefix];
      text = text.slice(2);
    } else if (PREFIX_BASES[prefix] === radix) {
      text = text.slice(2);
    }
    if (!text) return { error: `Enter digits after the ${prefix} prefix` };
  }
  if (!text) return { error: "Enter digits after the sign" };

  for (const ch of text) {
    const d = digitValue(ch);
    if (d < 0 || d >= radix) {
      const hint = base === "auto" && radix === 10 && d >= 10 && d < 36
        ? " — add a 0x/0b/0o prefix or pick a base"
        : "";
      return { error: `'${ch}' is not a valid base-${radix} digit${hint}` };
    }
  }

  let value;
  if (radix === 16 || radix === 2 || radix === 8) {
    // BigInt parses these prefixes natively, in linear time.
    value = BigInt(BASE_PREFIXES[radix] + text);
  } else if (radix === 10) {
    value = BigInt(text);
  } else {
    // Horner in chunks: one BigInt multiply per 8 digits instead of per digit
    // keeps multi-thousand-digit input responsive. 36^8 < 2^53.
    const R = BigInt(radix);
    value = 0n;
    for (let i = 0; i < text.length; i += 8) {
      const chunk = text.slice(i, i + 8);
      let small = 0;
      for (const ch of chunk) small = small * radix + digitValue(ch);
      value = value * R ** BigInt(chunk.length) + BigInt(small);
    }
  }
  return { value: negative ? -value : value, base: radix };
}

function absBig(v) {
  return v < 0n ? -v : v;
}

function formatInteger(v, base, upper = false) {
  const s = (v < 0n ? "-" : "") + absBig(v).toString(base);
  return upper ? s.toUpperCase() : s;
}

function bitLength(v) {
  const m = absBig(v);
  return m === 0n ? 0 : m.toString(2).length;
}

/** Smallest two's complement width that holds v (0 → 1, -1 → 1, 127 → 8, -128 → 8). */
function signedWidth(v) {
  return (v < 0n ? bitLength(-v - 1n) : bitLength(v)) + 1;
}

function groupDigits(digits, size, sep = " ") {
  const padded = digits.padStart(Math.ceil(digits.length / size) * size, "0");
  const out = [];
  for (let i = 0; i < padded.length; i += size) out.push(padded.slice(i, i + size));
  return out.join(sep);
}

function groupedMagnitude(v, base, size, upper) {
  const digits = absBig(v).toString(base);
  const g = groupDigits(digits, size);
  return (v < 0n ? "-" : "") + (upper ? g.toUpperCase() : g);
}

function twosComplement(v, width) {
  const W = BigInt(width);
  const min = -(1n << (W - 1n));
  const maxSigned = (1n << (W - 1n)) - 1n;
  const maxUnsigned = (1n << W) - 1n;
  const bits = BigInt.asUintN(width, v);
  return {
    bits,
    fits: v >= min && v <= maxUnsigned,
    signed: BigInt.asIntN(width, v),
    unsigned: bits,
    min,
    maxSigned,
    maxUnsigned
  };
}

// --- Rendering ---------------------------------------------------------------

function intRowHtml(row, { editable }) {
  const tag = row.tag ? `<span class="field-tag">${row.tag}</span>` : "";
  // Kept outside the <label>: a label wrapping a second control would steal
  // its clicks for the output field.
  const baseField = row.key === "custom"
    ? `<input type="number" class="field-input int-custom-base" id="int-custom-base" min="2" max="36" step="1" value="${intState.customBase}" aria-label="Custom output base">`
    : "";
  return `
    <div class="field-row converter-row int-row${row.span ? " span-2" : ""}" data-int-row="${row.key}">
      <div class="converter-row-header">
        <label class="field-label" for="int-out-${row.key}">
          <span class="converter-icon">${row.icon}</span>
          <span class="converter-label-text">${row.label}</span>
          ${tag}
        </label>
        <div class="converter-row-actions">
          ${baseField}
          <button class="copy-btn" type="button" data-int-copy="${row.key}" aria-label="Copy ${row.label.toLowerCase()}">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>
          </button>
        </div>
      </div>
      <input type="text" class="field-input int-out" id="int-out-${row.key}" spellcheck="false" autocomplete="off" autocapitalize="off"${editable ? "" : " readonly"}>
      <p class="int-row-error" hidden></p>
    </div>`;
}

function buildIntegerRows() {
  document.getElementById("int-outputs").innerHTML = INT_OUTPUTS.map((r) => intRowHtml(r, { editable: true })).join("");
  document.getElementById("int-grouped").innerHTML = INT_GROUPED.map((r) => intRowHtml(r, { editable: false })).join("");
  document.getElementById("int-twos").innerHTML = INT_TWOS.map((r) => intRowHtml(r, { editable: false })).join("");
}

function outputBase(row) {
  return row.key === "custom" ? intState.customBase : row.base;
}

function setOut(key, value) {
  const el = document.getElementById(`int-out-${key}`);
  if (el) el.value = value;
}

function setRowError(key, message) {
  const row = document.querySelector(`[data-int-row="${key}"]`);
  if (!row) return;
  row.classList.toggle("is-invalid", Boolean(message));
  const p = row.querySelector(".int-row-error");
  if (p) {
    p.textContent = message || "";
    p.hidden = !message;
  }
}

function clearOutputErrors() {
  INT_OUTPUTS.forEach((row) => setRowError(row.key, null));
}

function setStat(id, text) {
  document.getElementById(id).textContent = text;
}

/** Repaint every derived field. `skipKey` is the output being typed in, left alone so its caret doesn't jump. */
function renderInteger(skipKey = null) {
  const v = intState.value;
  const up = intState.upper;
  const empty = v === null;

  INT_OUTPUTS.forEach((row) => {
    if (row.key === skipKey) return;
    setOut(row.key, empty ? "" : formatInteger(v, outputBase(row), up));
  });

  setOut("bin-nibble", empty ? "" : groupedMagnitude(v, 2, 4, false));
  setOut("bin-byte", empty ? "" : groupedMagnitude(v, 2, 8, false));
  setOut("hex-byte", empty ? "" : groupedMagnitude(v, 16, 2, up));

  const bits = empty ? 0 : bitLength(v);
  setStat("int-stat-base", empty ? "—" : `Base ${intState.detectedBase}`);
  setStat("int-stat-sign", empty ? "—" : v < 0n ? "Negative" : v === 0n ? "Zero" : "Positive");
  setStat("int-stat-bits", empty ? "—" : `${bits} bit${bits === 1 ? "" : "s"}`);
  const bytes = Math.ceil(bits / 8);
  setStat("int-stat-bytes", empty ? "—" : `${bytes} byte${bytes === 1 ? "" : "s"}`);
  setStat("int-stat-signed", empty ? "—" : `${signedWidth(v)} bits`);

  renderTwos();
}

function renderTwos() {
  const width = intState.width;
  const t = twosComplement(intState.value ?? 0n, width);
  twosRange.textContent = `${width}-bit · signed ${t.min} … ${t.maxSigned} · unsigned 0 … ${t.maxUnsigned}`;

  const v = intState.value;
  if (v === null) {
    ["twos-hex", "twos-bin", "twos-signed", "twos-unsigned"].forEach((k) => setOut(k, ""));
    twosWarning.hidden = true;
    return;
  }

  const hex = t.bits.toString(16).padStart(width / 4, "0");
  setOut("twos-hex", intState.upper ? hex.toUpperCase() : hex);
  setOut("twos-bin", groupDigits(t.bits.toString(2).padStart(width, "0"), 8));
  setOut("twos-signed", t.signed.toString());
  setOut("twos-unsigned", t.unsigned.toString());

  twosWarning.hidden = t.fits;
  if (!t.fits) {
    const needs = v < 0n
      ? `${signedWidth(v)} bits signed`
      : `${bitLength(v)} bits unsigned, ${signedWidth(v)} signed`;
    twosWarning.textContent = `Overflow: ${v} doesn't fit in ${width} bits (needs ${needs}). Showing the low ${width} bits, which is what a cast would keep.`;
  }
}

function showIntError(message) {
  intError.textContent = message || "";
  intError.hidden = !message;
  document.querySelector('[data-int-row="input"]').classList.toggle("is-invalid", Boolean(message));
}

function selectedBase() {
  return intBase.value === "auto" ? "auto" : Number(intBase.value);
}

function handleIntegerInput() {
  const result = parseInteger(intInput.value, selectedBase());
  clearOutputErrors();
  if (result.error) {
    showIntError(result.error);
    intState.value = null;
    renderInteger();
    return;
  }
  showIntError(null);
  intState.value = result.value;
  intState.detectedBase = result.base;
  renderInteger();
}

/** Write the value back into the main input, in the base the user is working in. */
function writeMainInput(v) {
  const picked = selectedBase();
  const base = picked === "auto" ? intState.detectedBase : picked;
  const prefix = picked === "auto" ? (BASE_PREFIXES[base] || "") : "";
  const digits = absBig(v).toString(base);
  intInput.value = (v < 0n ? "-" : "") + prefix + (intState.upper ? digits.toUpperCase() : digits);
}

function handleOutputEdit(row) {
  const el = document.getElementById(`int-out-${row.key}`);
  const result = parseInteger(el.value, outputBase(row));
  if (result.error) {
    setRowError(row.key, result.error);
    return;
  }
  clearOutputErrors();
  showIntError(null);
  intState.value = result.value;
  if (result.value === null) {
    intInput.value = "";
  } else {
    writeMainInput(result.value);
  }
  renderInteger(row.key);
}

function clearInteger(triggerButton = null) {
  intInput.value = "";
  handleIntegerInput();
  flashActionButton(triggerButton);
  showToast("Converter cleared", "info");
}

function loadIntegerSample(triggerButton = null, { announce = true } = {}) {
  intInput.value = INT_SAMPLE;
  window.DevToolsMain.selectDropdownValue?.(document.querySelector(".int-base-dd"), "auto", { emit: false });
  intBase.value = "auto";
  handleIntegerInput();
  flashActionButton(triggerButton);
  if (announce) showToast("Loaded sample input", "success");
}

function copyIntegerField(key, button) {
  const el = key === "input" ? intInput : document.getElementById(`int-out-${key}`);
  const value = el?.value.trim() ?? "";
  if (!value) {
    showToast("Nothing to copy", "error");
    return;
  }
  const label = [...INT_OUTPUTS, ...INT_GROUPED, ...INT_TWOS].find((r) => r.key === key)?.label ?? "Input";
  window.DevToolsMain.copyText(value)
    .then(() => {
      flashCopyButton(button);
      showToast(`${label} copied`, "success");
    })
    .catch(() => showToast("Copy failed", "error"));
}

function setSegment(selector, attr, value) {
  document.querySelectorAll(selector).forEach((btn) => {
    const active = btn.dataset[attr] === String(value);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function applyView(view) {
  currentView = VIEWS.includes(view) ? view : "text";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === currentView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== currentView;
  });
}

buildIntegerRows();

intInput.addEventListener("input", handleIntegerInput);
intBase.addEventListener("change", handleIntegerInput);

INT_OUTPUTS.forEach((row) => {
  const el = document.getElementById(`int-out-${row.key}`);
  el.addEventListener("input", () => handleOutputEdit(row));
  // Once the user leaves a field, normalise what they typed (prefix, case,
  // separators) — safe now because the caret is gone.
  el.addEventListener("change", () => {
    if (!document.querySelector(`[data-int-row="${row.key}"]`).classList.contains("is-invalid")) renderInteger();
  });
});

document.getElementById("int-custom-base").addEventListener("input", (event) => {
  const n = Number(event.target.value);
  if (!Number.isInteger(n) || n < 2 || n > 36) {
    setRowError("custom", "Custom base must be a whole number from 2 to 36");
    setOut("custom", "");
    return;
  }
  setRowError("custom", null);
  intState.customBase = n;
  renderInteger();
});

document.querySelector(".view-pane[data-pane=\"integer\"]").addEventListener("click", (event) => {
  const copy = event.target.closest("[data-int-copy]");
  if (copy) copyIntegerField(copy.dataset.intCopy, copy);
});

document.querySelectorAll("[data-case]").forEach((btn) => {
  btn.addEventListener("click", () => {
    intState.upper = btn.dataset.case === "upper";
    setSegment("[data-case]", "case", btn.dataset.case);
    renderInteger();
  });
});

document.querySelectorAll("[data-width]").forEach((btn) => {
  btn.addEventListener("click", () => {
    intState.width = Number(btn.dataset.width);
    setSegment("[data-width]", "width", intState.width);
    renderTwos();
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === currentView) return;
    applyView(button.dataset.view);
    window.DevToolsMain.writeHashState(currentView);
  });
});

window.DevToolsMain.onHashState((value) => applyView(value));

function init() {
  // Seed the fields without announcing it — the user did not ask for a sample,
  // so a toast on every page load is just noise.
  loadSample(null, { announce: false });
  loadIntegerSample(null, { announce: false });
  applyView(window.DevToolsMain.readHashState());
}

init();
