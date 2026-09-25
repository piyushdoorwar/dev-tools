// Encoder / Decoder — Base64, Base64url, URL escaping, HTML entities, and
// files to and from Base64 / data: URIs.
//
// Every text mode round-trips UTF-8: text is encoded to bytes before Base64,
// and decoded back with a fatal TextDecoder so malformed input fails loudly
// rather than turning into replacement characters. File mode skips the text
// step entirely and works on the raw bytes.

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
const leftPanel = document.querySelector(".left-panel");
const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const dropzonePreview = document.getElementById("dropzone-preview");
const dropzoneIcon = document.getElementById("dropzone-icon");
const fileNameLabel = document.getElementById("file-name");
const fileMetaLabel = document.getElementById("file-meta");
const fileResult = document.getElementById("file-result");
const filePreview = document.getElementById("file-preview");
const fileDetails = document.getElementById("file-details");

const state = {
  mode: "base64",
  direction: "encode",
  wrap: "off",
  padding: "off",
  urlScope: "component",
  htmlScope: "minimal",
  fileFormat: "datauri",
  // The file being encoded, and the bytes most recently decoded.
  file: null,
  decoded: null,
  // Bumped on every run so a slow file read cannot overwrite newer output.
  fileToken: 0,
  // Object URLs for the two previews, revoked when replaced.
  previewUrls: { input: null, output: null },
};

const MODE_LABELS = {
  base64: "Base64",
  base64url: "Base64url",
  url: "URL Encoded",
  html: "HTML Entities",
  file: "Base64",
};

const PLACEHOLDERS = {
  encode: "Type or paste text to encode...",
  base64: "Paste Base64 to decode...",
  base64url: "Paste Base64url to decode...",
  url: "Paste percent-encoded text to decode...",
  html: "Paste text with HTML entities to decode...",
  file: "Paste a data: URI or raw Base64 to turn it back into a file...",
};

const SAMPLES = {
  base64: { encode: "Hello, world!", decode: "SGVsbG8sIHdvcmxkIQ==" },
  base64url: { encode: '{"alg":"HS256","typ":"JWT"}', decode: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" },
  url: { encode: "https://example.com/search?q=hello world&lang=en", decode: "https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Dhello%20world" },
  html: { encode: '<a href="/docs">Tips & tricks</a>', decode: "&lt;a href=&quot;/docs&quot;&gt;Tips &amp; tricks&lt;/a&gt;" },
};

const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6739B7"/><circle cx="32" cy="32" r="14" fill="#FFD700"/></svg>';

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

// Whitespace is stripped: wrapped Base64 is common in PEM blocks and mail
// headers, and pasting it should not be an error. Either alphabet is read.
function base64Bytes(text) {
  const compact = text.replace(/\s+/g, "");
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
  try {
    return { bytes: base64ToBytes(padded), usedUrlAlphabet };
  } catch {
    return { error: "Not valid Base64" };
  }
}

function decodeBase64(text, urlSafe) {
  if (!text.replace(/\s+/g, "")) return { output: "" };
  const decoded = base64Bytes(text);
  if (decoded.error) return decoded;
  const { bytes, usedUrlAlphabet } = decoded;

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

/* --- Files --------------------------------------------------------------- */

// Magic numbers for the formats people actually paste. Checked in order, so
// longer signatures come before the short ones they could be mistaken for.
const SIGNATURES = [
  ["89504e470d0a1a0a", "image/png"],
  ["ffd8ff", "image/jpeg"],
  ["474946383761", "image/gif"],
  ["474946383961", "image/gif"],
  ["255044462d", "application/pdf"],
  ["504b0304", "application/zip"],
  ["1f8b", "application/gzip"],
  ["377abcaf271c", "application/x-7z-compressed"],
  ["0061736d", "application/wasm"],
  ["774f4646", "font/woff"],
  ["774f4632", "font/woff2"],
  ["49492a00", "image/tiff"],
  ["4d4d002a", "image/tiff"],
  ["00000100", "image/x-icon"],
  ["494433", "audio/mpeg"],
  ["4f676753", "audio/ogg"],
  ["664c6143", "audio/flac"],
  ["1a45dfa3", "video/webm"],
];

const EXTENSIONS = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif",
  "image/heic": "heic", "image/svg+xml": "svg", "image/bmp": "bmp", "image/tiff": "tif", "image/x-icon": "ico",
  "application/pdf": "pdf", "application/zip": "zip", "application/gzip": "gz", "application/x-7z-compressed": "7z",
  "application/wasm": "wasm", "application/json": "json", "font/woff": "woff", "font/woff2": "woff2",
  "font/ttf": "ttf", "font/otf": "otf", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/flac": "flac",
  "audio/wav": "wav", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "video/x-msvideo": "avi", "text/plain": "txt", "text/html": "html", "text/css": "css",
  "text/csv": "csv", "text/javascript": "js", "application/javascript": "js", "application/xml": "xml",
  "text/xml": "xml",
};

function bytesToHex(bytes, start, end) {
  return [...bytes.subarray(start, end)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asciiAt(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

// Best guess at a MIME type from the bytes alone, for Base64 that arrives
// without a data: prefix.
function sniffMime(bytes) {
  const head = bytesToHex(bytes, 0, 16);
  for (const [signature, mime] of SIGNATURES) {
    if (head.startsWith(signature)) return mime;
  }
  if (asciiAt(bytes, 0, 4) === "RIFF") {
    const kind = asciiAt(bytes, 8, 4);
    if (kind === "WEBP") return "image/webp";
    if (kind === "WAVE") return "audio/wav";
    if (kind === "AVI ") return "video/x-msvideo";
  }
  if (asciiAt(bytes, 4, 4) === "ftyp") {
    const brand = asciiAt(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (/^(heic|heix|mif1)$/.test(brand)) return "image/heic";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  if (asciiAt(bytes, 0, 2) === "BM" && bytes.length >= 26) return "image/bmp";
  if (bytesToHex(bytes, 0, 4) === "00010000" || asciiAt(bytes, 0, 4) === "true") return "font/ttf";
  if (asciiAt(bytes, 0, 4) === "OTTO") return "font/otf";

  let text;
  try {
    text = strictTextDecoder.decode(bytes.subarray(0, 4096));
  } catch {
    return "application/octet-stream";
  }
  const start = text.replace(/^\uFEFF/, "").trimStart().slice(0, 512).toLowerCase();
  if (start.startsWith("<svg") || (start.startsWith("<?xml") && start.includes("<svg"))) return "image/svg+xml";
  if (start.startsWith("<!doctype html") || start.startsWith("<html")) return "text/html";
  if (start.startsWith("<?xml")) return "application/xml";
  if (start.startsWith("{") || start.startsWith("[")) {
    try {
      JSON.parse(strictTextDecoder.decode(bytes));
      return "application/json";
    } catch {
      // Not JSON after all; plain text below.
    }
  }
  return "text/plain";
}

// A data: URI that is not Base64 carries percent-encoded bytes (RFC 2397).
function percentBytes(text) {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "%" && /^[0-9a-fA-F]{2}$/.test(text.slice(index + 1, index + 3))) {
      bytes.push(parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      // Step by code point so an emoji is not split into surrogate halves.
      const character = String.fromCodePoint(text.codePointAt(index));
      bytes.push(...textEncoder.encode(character));
      index += character.length - 1;
    }
  }
  return new Uint8Array(bytes);
}

// Reads either a data: URI or bare Base64 into bytes plus a MIME type.
function parseFilePayload(text) {
  const trimmed = text.trim();
  if (!trimmed) return { empty: true };

  if (/^data:/i.test(trimmed)) {
    const comma = trimmed.indexOf(",");
    if (comma < 0) return { error: "A data: URI needs a comma between its type and its data" };
    const params = trimmed.slice(5, comma).split(";").map((part) => part.trim());
    const payload = trimmed.slice(comma + 1);
    const isBase64 = params.slice(1).some((part) => part.toLowerCase() === "base64");
    const nameParam = params.find((part) => /^name=/i.test(part));
    // RFC 2397: with no type given, the data is US-ASCII text.
    const mime = (params[0] || "text/plain").toLowerCase();
    if (!isBase64) {
      let bytes;
      try {
        bytes = percentBytes(payload);
      } catch {
        return { error: "The data: URI contains characters that cannot be read" };
      }
      return { bytes, mime, source: "data URI", name: nameParam ? decodeURIComponent(nameParam.slice(5)) : null };
    }
    const decoded = base64Bytes(payload);
    if (decoded.error) return decoded;
    return { bytes: decoded.bytes, mime, source: "data URI", name: nameParam ? decodeURIComponent(nameParam.slice(5)) : null };
  }

  const decoded = base64Bytes(trimmed);
  if (decoded.error) return decoded;
  return { bytes: decoded.bytes, mime: sniffMime(decoded.bytes), source: "file signature", name: null };
}

function formatBytes(count) {
  if (count < 1024) return `${count} ${count === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB"];
  let value = count / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]} (${count.toLocaleString("en-US")} bytes)`;
}

function extensionFor(mime) {
  return EXTENSIONS[mime.split(";")[0]] || "bin";
}

function setPreviewUrl(slot, url) {
  if (state.previewUrls[slot]) URL.revokeObjectURL(state.previewUrls[slot]);
  state.previewUrls[slot] = url;
}

function renderDropzone() {
  const file = state.file;
  dropzone.classList.toggle("has-file", Boolean(file));
  fileNameLabel.textContent = file ? file.name : "Drop a file here or click to choose";
  fileMetaLabel.textContent = file
    ? `${file.type || "Unknown type"} · ${formatBytes(file.size)} · click to replace`
    : "Any type. The file never leaves your browser.";
  const isImage = Boolean(file && file.type.startsWith("image/"));
  setPreviewUrl("input", isImage ? URL.createObjectURL(file) : null);
  dropzonePreview.hidden = !isImage;
  dropzoneIcon.hidden = isImage;
  if (isImage) dropzonePreview.src = state.previewUrls.input;
  else dropzonePreview.removeAttribute("src");
}

function renderFileResult(decoded) {
  filePreview.replaceChildren();
  fileDetails.replaceChildren();
  setPreviewUrl("output", null);
  if (!decoded) {
    filePreview.textContent = "Paste a data: URI or Base64 on the left.";
    filePreview.className = "file-preview is-empty";
    return;
  }

  const blob = new Blob([decoded.bytes], { type: decoded.mime });
  filePreview.className = "file-preview";
  if (decoded.mime.startsWith("image/")) {
    // An <img> never runs script, so decoded SVG is safe to show this way.
    setPreviewUrl("output", URL.createObjectURL(blob));
    const img = document.createElement("img");
    img.alt = "Decoded image preview";
    img.src = state.previewUrls.output;
    filePreview.append(img);
  } else if (/^text\/|json|xml|javascript/.test(decoded.mime)) {
    const pre = document.createElement("pre");
    const text = new TextDecoder().decode(decoded.bytes.subarray(0, 4000));
    pre.textContent = decoded.bytes.length > 4000 ? `${text}\n…` : text;
    filePreview.append(pre);
  } else {
    filePreview.className = "file-preview is-empty";
    filePreview.textContent = "No preview for this type. Download it to open it.";
  }

  const rows = [
    ["Type", decoded.mime],
    ["Size", formatBytes(decoded.bytes.length)],
    ["Detected from", decoded.source],
    ["File name", decodedFileName(decoded)],
  ];
  for (const [term, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    fileDetails.append(dt, dd);
  }
}

function decodedFileName(decoded) {
  return decoded.name || `decoded.${extensionFor(decoded.mime)}`;
}

async function encodeFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base64 = bytesToBase64(bytes);
  // application/octet-stream is what some systems report for "unknown", so it
  // is no better than no type at all.
  const given = file.type === "application/octet-stream" ? "" : file.type;
  const mime = given || sniffMime(bytes);
  const output = state.fileFormat === "datauri" ? `data:${mime};base64,${base64}` : base64;
  const note = given ? null : `The browser gave no type for this file; detected ${mime} from its contents`;
  return { output, note, bytes: bytes.length };
}

function runFile() {
  const token = ++state.fileToken;

  if (state.direction === "decode") {
    const input = inputEditor.value;
    inputCount.textContent = `${input.length} chars`;
    const result = parseFilePayload(input);
    state.decoded = result.bytes ? result : null;
    renderFileResult(state.decoded);
    outputCount.textContent = state.decoded ? formatBytes(state.decoded.bytes.length).split(" (")[0] : "0 bytes";
    if (result.empty) {
      inputEditor.classList.remove("is-invalid");
      setStatus(inputStatusText, "Ready");
      setStatus(outputStatusText, "Ready");
      return;
    }
    if (result.error) {
      inputEditor.classList.add("is-invalid");
      setStatus(inputStatusText, result.error, "error");
      setStatus(outputStatusText, "No output", "error");
      return;
    }
    inputEditor.classList.remove("is-invalid");
    setStatus(inputStatusText, result.source === "data URI" ? "Valid data: URI" : "Valid Base64", "success");
    setStatus(outputStatusText, `Decoded ${formatBytes(result.bytes.length).split(" (")[0]} of ${result.mime}`, "success");
    return;
  }

  renderDropzone();
  inputEditor.classList.remove("is-invalid");
  const file = state.file;
  inputCount.textContent = file ? formatBytes(file.size).split(" (")[0] : "0 bytes";
  if (!file) {
    outputEditor.value = "";
    outputCount.textContent = "0 chars";
    setStatus(inputStatusText, "Choose or drop a file");
    setStatus(outputStatusText, "Ready");
    return;
  }

  setStatus(outputStatusText, "Reading file…");
  encodeFile(file)
    .then((result) => {
      if (token !== state.fileToken) return;
      outputEditor.value = result.output;
      outputCount.textContent = `${result.output.length.toLocaleString("en-US")} chars`;
      setStatus(inputStatusText, result.note || `${file.name}`, result.note ? "warning" : "success");
      setStatus(outputStatusText, `Encoded ${formatBytes(result.bytes).split(" (")[0]}`, "success");
    })
    .catch(() => {
      if (token !== state.fileToken) return;
      outputEditor.value = "";
      setStatus(inputStatusText, "The file could not be read", "error");
      setStatus(outputStatusText, "No output", "error");
    });
}

function loadFile(file) {
  if (!file) return;
  state.file = file;
  if (state.mode !== "file") selectMode("file");
  if (state.direction !== "encode") setDirection("encode");
  run();
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
  if (state.mode === "file") {
    runFile();
    return;
  }
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
  const fileMode = state.mode === "file";
  if (fileMode) {
    inputTitle.textContent = encoding ? "File" : "Data URI / Base64";
    outputTitle.textContent = encoding ? (state.fileFormat === "datauri" ? "Data URI" : "Base64") : "File";
  } else {
    inputTitle.textContent = encoding ? "Plain Text" : label;
    outputTitle.textContent = encoding ? label : "Plain Text";
  }
  inputEditor.placeholder = encoding ? PLACEHOLDERS.encode : PLACEHOLDERS[state.mode];

  // File mode swaps the input textarea for a drop zone when encoding, and the
  // output textarea for a preview and download when decoding.
  inputEditor.hidden = fileMode && encoding;
  dropzone.hidden = !(fileMode && encoding);
  outputEditor.hidden = fileMode && !encoding;
  fileResult.hidden = !(fileMode && !encoding);
  document.querySelectorAll('[data-action="paste-input"], [data-action="copy-input"]').forEach((button) => {
    button.hidden = fileMode && encoding;
  });
  document.querySelector('[data-action="copy-output"]').hidden = fileMode && !encoding;

  document.querySelectorAll(".option-group").forEach((group) => {
    group.hidden = group.dataset.for !== state.mode || (group.dataset.for === "file" && !encoding);
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
  if (state.mode === "file") state.file = null;
  run();
  flashButton(button, "is-confirmed");
  showToast("Input cleared", "info");
}

function downloadOutput(button) {
  if (state.mode === "file" && state.direction === "decode") {
    if (!state.decoded) {
      showToast("Nothing to download", "error");
      return;
    }
    const blob = new Blob([state.decoded.bytes], { type: state.decoded.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = decodedFileName(state.decoded);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    flashButton(button, "is-downloaded");
    showToast(`${link.download} downloaded`, "success");
    return;
  }
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
  if (state.mode === "file" && state.direction === "decode") {
    // The decoded bytes become the file to encode, so a round trip needs no
    // download and re-upload.
    if (state.decoded) {
      state.file = new File([state.decoded.bytes], decodedFileName(state.decoded), { type: state.decoded.mime });
    }
    setDirection("encode");
    run();
    flashButton(button, "is-confirmed");
    return;
  }
  const carried = outputEditor.value;
  setDirection(state.direction === "encode" ? "decode" : "encode");
  inputEditor.value = carried;
  run();
  flashButton(button, "is-confirmed");
}

function loadSample(button, { announce = true } = {}) {
  if (state.mode === "file") {
    if (state.direction === "encode") state.file = new File([SAMPLE_SVG], "sample.svg", { type: "image/svg+xml" });
    else inputEditor.value = `data:image/svg+xml;base64,${btoa(SAMPLE_SVG)}`;
    run();
    flashButton(button, "is-confirmed");
    if (announce) showToast("Loaded sample file", "success");
    return;
  }
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

function selectMode(mode) {
  const button = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
  state.mode = mode;
  setActive(button.parentElement, button);
  syncLabels();
}

document.querySelectorAll(".mode-btn[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.mode === button.dataset.mode) return;
    selectMode(button.dataset.mode);
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
      syncLabels();
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

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  loadFile(fileInput.files[0]);
  fileInput.value = "";
});

// Dropping a file anywhere on the input side switches to File mode, whatever
// mode was showing.
leftPanel.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  leftPanel.classList.add("is-dragging");
});
leftPanel.addEventListener("dragleave", (event) => {
  if (!leftPanel.contains(event.relatedTarget)) leftPanel.classList.remove("is-dragging");
});
leftPanel.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  leftPanel.classList.remove("is-dragging");
  if (!file) return;
  event.preventDefault();
  loadFile(file);
});

function init() {
  syncLabels();
  // Seed the editor so the tool explains itself on arrival; the user did not
  // ask for a sample, so this stays silent.
  loadSample(null, { announce: false });
}

init();
