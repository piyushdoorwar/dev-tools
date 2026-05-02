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
  return;
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
    values.push(value);
  }
  return { values, error: null };
}

function parseTextInput(raw) {
  if (!raw) {
    return { values: [], error: null };
  }
  const values = Array.from(raw).map((char) => char.codePointAt(0));
  return { values, error: null };
}

function valuesToText(values) {
  let output = "";
  values.forEach((value) => {
    if (!Number.isFinite(value)) return;
    const safe = Math.max(0, Math.min(0x10ffff, Math.round(value)));
    output += String.fromCodePoint(safe);
  });
  return output;
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

function loadSample(triggerButton = null) {
  if (!inputs.text) return;
  inputs.text.value = "Hello";
  handleInput("text");
  flashActionButton(triggerButton);
  showToast("Loaded sample input", "success");
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
    if (action === "clear-all") clearAll(btn);
    if (action === "copy-all") copyAll();
    if (action === "paste-sample") loadSample(btn);
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
  schemaHelpModal.classList.add("is-open");
  schemaHelpModal.setAttribute("aria-hidden", "false");
  if (schemaHelpCloseBtn) schemaHelpCloseBtn.focus();
}

function closeSchemaHelpModal() {
  if (!schemaHelpModal) return;
  schemaHelpModal.classList.remove("is-open");
  schemaHelpModal.setAttribute("aria-hidden", "true");
}

function init() {
  loadSample();
}

init();
