// Encoder / Decoder — Base64, Base64url, URL escaping, HTML entities.
//
// Every mode round-trips UTF-8: text is encoded to bytes before Base64, and
// decoded back with a fatal TextDecoder so malformed input fails loudly rather
// than turning into replacement characters.

const inputEditor = document.getElementById("input-editor");
const outputEditor = document.getElementById("output-editor");
const inputTitle = document.getElementById("input-title");
const outputTitle = document.getElementById("output-title");
const inputCount = document.getElementById("input-count");
const outputCount = document.getElementById("output-count");
const inputStatusText = document.querySelector("#input-status .status-text");
const outputStatusText = document.querySelector("#output-status .status-text");
const directionSwitch = document.getElementById("direction-switch");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const state = {
  mode: "base64",
  direction: "encode",
  wrap: "off",
  padding: "off",
  urlScope: "component",
  htmlScope: "minimal",
};

const MODE_LABELS = {
  base64: "Base64",
  base64url: "Base64url",
  url: "URL Encoded",
  html: "HTML Entities",
};

const PLACEHOLDERS = {
  encode: "Type or paste text to encode...",
  base64: "Paste Base64 to decode...",
  base64url: "Paste Base64url to decode...",
  url: "Paste percent-encoded text to decode...",
  html: "Paste text with HTML entities to decode...",
};

const SAMPLES = {
  base64: { encode: "Hello, world!", decode: "SGVsbG8sIHdvcmxkIQ==" },
  base64url: { encode: '{"alg":"HS256","typ":"JWT"}', decode: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
  url: { encode: "https://example.com/search?q=hello world&lang=en", decode: "https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dhello%20world" },
  html: { encode: '<a href="/docs">Tips & tricks</a>', decode: "&lt;a href=&quot;/docs&quot;&gt;Tips &amp; tricks&lt;/a&gt;" },
};

const textEncoder = new TextEncoder();
const strictTextDecoder = new TextDecoder("utf-8", { fatal: true });

function showToast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

/* --- Base64 --------------------------------------------------------------- */

// btoa() only accepts a binary string, so bytes are handed over in chunks —
// spreading a multi-megabyte array into String.fromCharCode blows the stack.
function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function wrapLines(value, width) {
  const lines = [];
  for (let index = 0; index < value.length; index += width) {
    lines.push(value.slice(index, index + width));
  }
  return lines.join("\n");
}

function encodeBase64(text, urlSafe) {
  let encoded = bytesToBase64(textEncoder.encode(text));
  if (urlSafe) {
    encoded = encoded.replaceAll("+", "-").replaceAll("/", "_");
    if (state.padding === "off") encoded = encoded.replace(/=+$/, "");
    return { output: encoded };
  }
  return { output: state.wrap === "on" ? wrapLines(encoded, 76) : encoded };
}

function decodeBase64(text, urlSafe) {
  // Whitespace is stripped either way: wrapped Base64 is common in PEM blocks
  // and mail headers, and pasting it should not be an error.
  const compact = text.replace(/\s+/g, "");
  if (!compact) return { output: "" };

  const usedUrlAlphabet = /[-_]/.test(compact);
  const normalized = compact.replaceAll("-", "+").replaceAll("_", "/");
  const body = normalized.replace(/=+$/, "");

  const invalid = body.match(/[^A-Za-z0-9+/]/);
  if (invalid) {
    return { error: `Not valid Base64: unexpected character "${invalid[0]}"` };
  }
  if (body.length % 4 === 1) {
    return { error: "Not valid Base64: the input is one character short of a whole group" };
  }

  const padded = body.padEnd(Math.ceil(body.length / 4) * 4, "=");
  let bytes;
  try {
    bytes = base64ToBytes(padded);
  } catch {
    return { error: "Not valid Base64" };
  }

  let output;
  try {
    output = strictTextDecoder.decode(bytes);
  } catch {
    return { error: `Decoded ${bytes.length} bytes, but they are not valid UTF-8 text` };
  }

  const note = usedUrlAlphabet !== urlSafe
    ? usedUrlAlphabet
      ? "Input used the URL-safe alphabet"
      : "Input used the standard alphabet"
    : null;
  return { output, note, bytes: bytes.length };
}

/* --- URL ------------------------------------------------------------------ */

function encodeUrl(text) {
  const encode = state.urlScope === "component" ? encodeURIComponent : encodeURI;
  try {
    return { output: encode(text) };
  } catch {
    return { error: "Input contains an unpaired surrogate and cannot be percent-encoded" };
  }
}

function decodeUrl(text) {
  const decode = state.urlScope === "component" ? decodeURIComponent : decodeURI;
  try {
    return { output: decode(text) };
  } catch {
    return { error: "Malformed percent-encoding — check for a stray % or an incomplete %XX pair" };
  }
}

/* --- HTML entities -------------------------------------------------------- */

const MARKUP_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function encodeHtml(text) {
  const escaped = text.replace(/[&<>"']/g, (character) => MARKUP_ENTITIES[character]);
  if (state.htmlScope !== "all") return { output: escaped };

  // Iterating the string spread keeps astral characters (emoji) as single
  // code points, so they become one reference rather than two surrogates.
  const output = [...escaped]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint > 0x7f ? `&#x${codePoint.toString(16).toUpperCase()};` : character;
    })
    .join("");
  return { output };
}

// Named references are resolved by the browser's own table rather than a
// hand-maintained map. Only the matched `&…;` run is ever parsed, and a
// detached <textarea> is RCDATA, so no markup can be constructed from input.
// This inherits HTML's legacy rule that a few named references resolve without
// their semicolon — `&notit;` becomes `¬it;` — which is what a browser would
// render, and the point of the tool is to show that truthfully.
const entityScratch = document.createElement("textarea");
const ENTITY_PATTERN = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

function decodeHtml(text) {
  let resolved = 0;
  let unresolved = 0;
  const output = text.replace(ENTITY_PATTERN, (match) => {
    entityScratch.innerHTML = match;
    const value = entityScratch.value;
    if (value === match) {
      unresolved += 1;
      return match;
    }
    resolved += 1;
    return value;
  });

  const note = unresolved
    ? `${unresolved} unknown ${unresolved === 1 ? "entity" : "entities"} left as-is`
    : null;
  return { output, note, resolved };
}

/* --- Conversion ----------------------------------------------------------- */

function convert(text) {
  if (!text) return { output: "" };

  if (state.mode === "base64" || state.mode === "base64url") {
    const urlSafe = state.mode === "base64url";
    return state.direction === "encode" ? encodeBase64(text, urlSafe) : decodeBase64(text, urlSafe);
  }
  if (state.mode === "url") {
    return state.direction === "encode" ? encodeUrl(text) : decodeUrl(text);
  }
  return state.direction === "encode" ? encodeHtml(text) : decodeHtml(text);
}

function setStatus(element, message, statusClass = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `status-text ${statusClass}`.trim();
}

function describeResult(input, result) {
  if (state.direction === "encode") {
    const bytes = textEncoder.encode(input).length;
    return `Encoded ${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  }
  if (typeof result.bytes === "number") {
    return `Decoded ${result.bytes} ${result.bytes === 1 ? "byte" : "bytes"}`;
  }
  if (typeof result.resolved === "number") {
    return `Decoded ${result.resolved} ${result.resolved === 1 ? "entity" : "entities"}`;
  }
  return "Decoded";
}

function run() {
  const input = inputEditor.value;
  const result = convert(input);

  inputCount.textContent = `${input.length} chars`;

  if (result.error) {
    outputEditor.value = "";
    outputCount.textContent = "0 chars";
    inputEditor.classList.add("is-invalid");
    setStatus(inputStatusText, result.error, "error");
    setStatus(outputStatusText, "No output", "error");
    return;
  }

  inputEditor.classList.remove("is-invalid");
  outputEditor.value = result.output;
  outputCount.textContent = `${result.output.length} chars`;

  if (!input) {
    setStatus(inputStatusText, "Ready");
    setStatus(outputStatusText, "Ready");
    return;
  }

  setStatus(inputStatusText, result.note || "Valid input", result.note ? "warning" : "success");
  setStatus(outputStatusText, describeResult(input, result), "success");
}

function syncLabels() {
  const label = MODE_LABELS[state.mode];
  const encoding = state.direction === "encode";
  inputTitle.textContent = encoding ? "Plain Text" : label;
  outputTitle.textContent = encoding ? label : "Plain Text";
  inputEditor.placeholder = encoding ? PLACEHOLDERS.encode : PLACEHOLDERS[state.mode];

  document.querySelectorAll(".option-group").forEach((group) => {
    group.hidden = group.dataset.for !== state.mode;
  });
}

function setActive(container, button) {
  container.querySelectorAll(".mode-btn, .segment-btn").forEach((candidate) => {
    const isActive = candidate === button;
    candidate.classList.toggle("active", isActive);
    if (candidate.hasAttribute("role") || candidate.hasAttribute("aria-selected")) {
      candidate.setAttribute("aria-selected", String(isActive));
    }
  });
}

/* --- Actions -------------------------------------------------------------- */

function flashButton(button, activeClass) {
  if (!button) return;
  button.classList.remove(activeClass);
  void button.offsetWidth;
  button.classList.add(activeClass);
  window.clearTimeout(button._flashTimeout);
  button._flashTimeout = window.setTimeout(() => button.classList.remove(activeClass), 500);
}

function copyFrom(editor, label, button) {
  const value = editor.value;
  if (!value) {
    showToast("Nothing to copy", "error");
    return;
  }
  navigator.clipboard
    .writeText(value)
    .then(() => {
      flashButton(button, "is-copied");
      showToast(`${label} copied`, "success");
    })
    .catch(() => showToast("Copy failed", "error"));
}

function pasteIntoInput(button) {
  navigator.clipboard
    .readText()
    .then((text) => {
      if (!text) {
        showToast("Clipboard is empty", "error");
        return;
      }
      inputEditor.value = text;
      run();
      flashButton(button, "is-confirmed");
      showToast("Pasted from clipboard", "success");
    })
    .catch(() => showToast("Paste failed", "error"));
}

function clearInput(button) {
  inputEditor.value = "";
  run();
  flashButton(button, "is-confirmed");
  showToast("Input cleared", "info");
}

function downloadOutput(button) {
  const value = outputEditor.value;
  if (!value) {
    showToast("Nothing to download", "error");
    return;
  }
  const blob = new Blob([value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.direction === "encode" ? "encoded.txt" : "decoded.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  flashButton(button, "is-downloaded");
  showToast("Output downloaded", "success");
}

function swap(button) {
  const carried = outputEditor.value;
  setDirection(state.direction === "encode" ? "decode" : "encode");
  inputEditor.value = carried;
  run();
  flashButton(button, "is-confirmed");
}

function loadSample(button, { announce = true } = {}) {
  inputEditor.value = SAMPLES[state.mode][state.direction];
  run();
  flashButton(button, "is-confirmed");
  if (announce) showToast("Loaded sample input", "success");
}

function setDirection(direction) {
  state.direction = direction;
  const button = directionSwitch.querySelector(`[data-direction="${direction}"]`);
  if (button) setActive(directionSwitch, button);
  syncLabels();
}

/* --- Wiring --------------------------------------------------------------- */

inputEditor.addEventListener("input", run);

document.querySelectorAll(".mode-btn[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.mode === button.dataset.mode) return;
    state.mode = button.dataset.mode;
    setActive(button.parentElement, button);
    syncLabels();
    run();
  });
});

directionSwitch.querySelectorAll("[data-direction]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.direction === button.dataset.direction) return;
    setDirection(button.dataset.direction);
    run();
  });
});

document.querySelectorAll(".segment[data-option]").forEach((group) => {
  const option = group.dataset.option;
  group.querySelectorAll("[data-value]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state[option] === button.dataset.value) return;
      state[option] = button.dataset.value;
      setActive(group, button);
      run();
    });
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "load-sample") loadSample(button);
    if (action === "paste-input") pasteIntoInput(button);
    if (action === "copy-input") copyFrom(inputEditor, inputTitle.textContent, button);
    if (action === "clear-input") clearInput(button);
    if (action === "copy-output") copyFrom(outputEditor, outputTitle.textContent, button);
    if (action === "download-output") downloadOutput(button);
    if (action === "swap") swap(button);
  });
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function init() {
  syncLabels();
  // Seed the editor so the tool explains itself on arrival; the user did not
  // ask for a sample, so this stays silent.
  loadSample(null, { announce: false });
}

init();
