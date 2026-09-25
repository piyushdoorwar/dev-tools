// Hash Generator — MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of text or a
// file, optionally keyed as HMAC.
//
// The SHA family comes from SubtleCrypto. MD5 is not in Web Crypto (it was
// left out on purpose), so it is implemented here. HMAC is built on top of the
// digest rather than SubtleCrypto's HMAC key, because importKey rejects an
// empty key and HMAC-MD5 would need a separate path anyway.

const ALGORITHMS = [
  { id: "md5", label: "MD5", bits: 128, block: 64, legacy: true },
  { id: "sha1", label: "SHA-1", bits: 160, block: 64, legacy: true, subtle: "SHA-1" },
  { id: "sha256", label: "SHA-256", bits: 256, block: 64, subtle: "SHA-256" },
  { id: "sha384", label: "SHA-384", bits: 384, block: 128, subtle: "SHA-384" },
  { id: "sha512", label: "SHA-512", bits: 512, block: 128, subtle: "SHA-512" },
];

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";
const SAMPLE_KEY = "key";

const textInput = document.getElementById("textInput");
const keyInput = document.getElementById("keyInput");
const keyRow = document.getElementById("keyRow");
const keyError = document.getElementById("keyError");
const compareInput = document.getElementById("compareInput");
const compareResult = document.getElementById("compareResult");
const digestList = document.getElementById("digestList");
const outputError = document.getElementById("outputError");
const outputTitle = document.getElementById("outputTitle");
const inputPanel = document.getElementById("inputPanel");
const inputStatus = document.getElementById("inputStatus");
const byteCount = document.getElementById("byteCount");
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const fileName = document.getElementById("fileName");
const fileMeta = document.getElementById("fileMeta");

const state = {
  mode: "digest",
  source: "text",
  format: "hex",
  keyEncoding: "utf8",
  file: null,
  // bytes per algorithm id from the latest completed run
  digests: null,
};

const textEncoder = new TextEncoder();
let runId = 0;

function showToast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

/* --- MD5 (RFC 1321) ------------------------------------------------------- */

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Int32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

function md5(bytes) {
  const words = new Int32Array(16);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;

  const compress = (view, offset) => {
    for (let j = 0; j < 16; j += 1) words[j] = view.getInt32(offset + j * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f;
      let g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ (b | ~d); g = (7 * i) & 15; }
      f = (f + a + MD5_K[i] + words[g]) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((f << MD5_SHIFTS[i]) | (f >>> (32 - MD5_SHIFTS[i])))) | 0;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  };

  // Whole blocks are read straight from the input; only the tail is copied,
  // so hashing a large file does not double its memory.
  const length = bytes.length;
  const fullBlocks = Math.floor(length / 64) * 64;
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < fullBlocks; offset += 64) compress(source, offset);

  const tailLength = length - fullBlocks;
  const tail = new Uint8Array(tailLength < 56 ? 64 : 128);
  tail.set(bytes.subarray(fullBlocks));
  tail[tailLength] = 0x80;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tail.length - 8, (length * 8) >>> 0, true);
  tailView.setUint32(tail.length - 4, Math.floor(length / 0x20000000), true);
  for (let offset = 0; offset < tail.length; offset += 64) compress(tailView, offset);

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((word, index) => outView.setInt32(index * 4, word, true));
  return out;
}

/* --- Digest & HMAC -------------------------------------------------------- */

async function digest(algorithm, bytes) {
  if (algorithm.id === "md5") return md5(bytes);
  return new Uint8Array(await crypto.subtle.digest(algorithm.subtle, bytes));
}

function concatBytes(first, second) {
  const out = new Uint8Array(first.length + second.length);
  out.set(first);
  out.set(second, first.length);
  return out;
}

// RFC 2104: H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ message))
async function hmac(algorithm, key, message) {
  const normalizedKey = key.length > algorithm.block ? await digest(algorithm, key) : key;
  const inner = new Uint8Array(algorithm.block);
  const outer = new Uint8Array(algorithm.block);
  for (let i = 0; i < algorithm.block; i += 1) {
    const byte = normalizedKey[i] ?? 0;
    inner[i] = byte ^ 0x36;
    outer[i] = byte ^ 0x5c;
  }
  const innerHash = await digest(algorithm, concatBytes(inner, message));
  return digest(algorithm, concatBytes(outer, innerHash));
}

/* --- Encodings ------------------------------------------------------------ */

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function formatDigest(bytes, format = state.format) {
  if (format === "base64") return toBase64(bytes);
  const hex = toHex(bytes);
  return format === "HEX" ? hex.toUpperCase() : hex;
}

function parseKey(value, encoding) {
  if (encoding === "utf8") return { bytes: textEncoder.encode(value) };
  const compact = value.replace(/\s+/g, "");
  if (encoding === "hex") {
    const hex = compact.replace(/^0x/i, "");
    if (/[^0-9a-f]/i.test(hex)) return { error: "Hex keys may only contain 0–9 and a–f" };
    if (hex.length % 2) return { error: "Hex keys need an even number of digits" };
    return { bytes: Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)) };
  }
  const normalized = compact.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/, "");
  if (/[^A-Za-z0-9+/]/.test(normalized) || normalized.length % 4 === 1) {
    return { error: "Not valid Base64" };
  }
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return { bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)) };
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
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`;
}

/* --- Rendering ------------------------------------------------------------ */

function buildRows() {
  digestList.replaceChildren(...ALGORITHMS.map((algorithm) => {
    const row = document.createElement("li");
    row.className = "digest-row";
    row.dataset.algorithm = algorithm.id;
    row.innerHTML = `
      <div class="digest-head">
        <span class="digest-name"></span>
        <span class="digest-bits"></span>
        ${algorithm.legacy ? '<span class="badge warning">Legacy</span>' : ""}
        <span class="badge success digest-match" hidden>Match</span>
      </div>
      <output class="digest-value"></output>
      <button class="action-btn" type="button" data-action="copy-digest" data-tooltip="Copy">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>
      </button>`;
    row.querySelector(".digest-name").textContent = algorithm.label;
    row.querySelector(".digest-bits").textContent = `${algorithm.bits}-bit`;
    row.querySelector(".action-btn").setAttribute("aria-label", `Copy ${algorithm.label}`);
    return row;
  }));
}

function renderDigests() {
  for (const algorithm of ALGORITHMS) {
    const row = digestList.querySelector(`[data-algorithm="${algorithm.id}"]`);
    const bytes = state.digests?.[algorithm.id];
    row.querySelector(".digest-value").textContent = bytes ? formatDigest(bytes) : "—";
    row.classList.toggle("is-empty", !bytes);
  }
  renderCompare();
}

// sha256sum prints "<hash>  <file>"; an "sha256:" or "sha256=" prefix is the
// digest-string form used by Docker and webhook signature headers.
function normalizeExpected(value) {
  const first = value.trim().split(/\s+/)[0] ?? "";
  return first.replace(/^[a-z0-9-]+[:=]/i, "");
}

function matchDigest(expected) {
  if (!state.digests || !expected) return null;
  const asHex = /^[0-9a-f]+$/i.test(expected) ? expected.toLowerCase() : null;
  const asBase64 = expected.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/, "");
  return ALGORITHMS.find((algorithm) => {
    const bytes = state.digests[algorithm.id];
    if (!bytes) return false;
    if (asHex && toHex(bytes) === asHex) return true;
    return toBase64(bytes).replace(/=+$/, "") === asBase64;
  }) ?? null;
}

function renderCompare() {
  const expected = normalizeExpected(compareInput.value);
  const match = matchDigest(expected);
  digestList.querySelectorAll(".digest-row").forEach((row) => {
    const isMatch = row.dataset.algorithm === match?.id;
    row.classList.toggle("is-match", isMatch);
    row.querySelector(".digest-match").hidden = !isMatch;
  });

  compareResult.className = "compare-result";
  compareInput.removeAttribute("aria-invalid");
  if (!expected) {
    compareResult.textContent = "";
  } else if (match) {
    compareResult.textContent = `Matches ${match.label}`;
    compareResult.classList.add("success");
  } else if (state.digests) {
    compareResult.textContent = "Does not match any digest above";
    compareResult.classList.add("error");
    compareInput.setAttribute("aria-invalid", "true");
  }
}

function setInputStatus(message, type = "") {
  inputStatus.textContent = message;
  inputStatus.className = `status-text ${type}`.trim();
}

function showOutputError(message) {
  outputError.hidden = !message;
  outputError.textContent = message || "";
}

/* --- Running -------------------------------------------------------------- */

async function readMessage() {
  if (state.source === "text") return textEncoder.encode(textInput.value);
  if (!state.file) return null;
  return new Uint8Array(await state.file.arrayBuffer());
}

async function run() {
  const id = ++runId;
  showOutputError("");

  let key = null;
  if (state.mode === "hmac") {
    const parsed = parseKey(keyInput.value, state.keyEncoding);
    keyError.hidden = !parsed.error;
    keyError.textContent = parsed.error || "";
    if (parsed.error) keyInput.setAttribute("aria-invalid", "true");
    else keyInput.removeAttribute("aria-invalid");
    if (parsed.error) {
      state.digests = null;
      renderDigests();
      return;
    }
    key = parsed.bytes;
  }

  if (!crypto.subtle) {
    state.digests = null;
    renderDigests();
    showOutputError("This browser only exposes Web Crypto on secure (https or localhost) pages, so SHA digests are unavailable here.");
    return;
  }

  if (state.source === "file" && !state.file) {
    state.digests = null;
    byteCount.textContent = "0 bytes";
    setInputStatus("No file selected");
    renderDigests();
    return;
  }

  if (state.source === "file") setInputStatus("Hashing…", "warning");

  try {
    const message = await readMessage();
    if (id !== runId) return;
    const results = await Promise.all(ALGORITHMS.map((algorithm) =>
      key ? hmac(algorithm, key, message) : digest(algorithm, message)));
    if (id !== runId) return;

    state.digests = Object.fromEntries(ALGORITHMS.map((algorithm, index) => [algorithm.id, results[index]]));
    byteCount.textContent = formatBytes(message.length);
    setInputStatus(
      state.source === "file" ? "File hashed" : message.length ? "Hashed as UTF-8" : "Empty input",
      message.length ? "success" : "",
    );
    renderDigests();
  } catch (error) {
    if (id !== runId) return;
    state.digests = null;
    renderDigests();
    setInputStatus("Could not hash input", "error");
    showOutputError(error?.message || "Hashing failed");
  }
}

/* --- Modes & sources ------------------------------------------------------ */

function setActive(container, button) {
  container.querySelectorAll(".mode-btn, .segment-btn").forEach((candidate) => {
    const isActive = candidate === button;
    candidate.classList.toggle("active", isActive);
    if (candidate.getAttribute("role") === "tab") candidate.setAttribute("aria-selected", String(isActive));
  });
}

// The view lives in the hash as "text", "file", "hmac" or "hmac-file".
function hashFromState() {
  return [state.mode === "hmac" && "hmac", state.source === "file" && "file"].filter(Boolean).join("-") || "text";
}

function applyHash(value) {
  const parts = String(value || "").split("-");
  applyMode(parts.includes("hmac") ? "hmac" : "digest");
  applySource(parts.includes("file") ? "file" : "text");
}

function applyMode(mode) {
  state.mode = mode;
  setActive(document.querySelector(".mode-switcher"), document.querySelector(`.mode-btn[data-mode="${mode}"]`));
  keyRow.hidden = mode !== "hmac";
  outputTitle.textContent = mode === "hmac" ? "HMAC" : "Digests";
}

function applySource(source) {
  state.source = source;
  const switcher = document.getElementById("sourceSwitch");
  setActive(switcher, switcher.querySelector(`[data-source="${source}"]`));
  document.querySelectorAll("[data-for-source]").forEach((element) => {
    element.hidden = element.dataset.forSource !== source;
  });
}

function setFile(file) {
  state.file = file;
  fileName.textContent = file ? file.name : "Drop a file here or click to choose";
  fileMeta.textContent = file
    ? `${formatBytes(file.size)}${file.type ? ` · ${file.type}` : ""}`
    : "Any type. The file never leaves your browser.";
  dropzone.classList.toggle("has-file", Boolean(file));
}

function loadFile(file) {
  if (!file) return;
  setFile(file);
  if (state.source !== "file") {
    applySource("file");
    window.DevToolsMain.writeHashState(hashFromState());
  }
  run();
}

/* --- Actions -------------------------------------------------------------- */

function copyText(value, label) {
  if (!value) {
    showToast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => showToast(`${label} copied`, "success"))
    .catch(() => showToast("Copy failed", "error"));
}

const ACTIONS = {
  sample() {
    textInput.value = SAMPLE_TEXT;
    if (state.mode === "hmac" && !keyInput.value) keyInput.value = SAMPLE_KEY;
    run();
    showToast("Loaded sample input", "success");
  },
  paste() {
    navigator.clipboard.readText()
      .then((text) => {
        if (!text) {
          showToast("Clipboard is empty", "error");
          return;
        }
        textInput.value = text;
        run();
      })
      .catch(() => showToast("Paste failed", "error"));
  },
  clear() {
    textInput.value = "";
    run();
    textInput.focus();
  },
  open() {
    fileInput.click();
  },
  "clear-file"() {
    setFile(null);
    run();
  },
  "copy-all"() {
    if (!state.digests) {
      showToast("Nothing to copy", "error");
      return;
    }
    const prefix = state.mode === "hmac" ? "HMAC-" : "";
    const width = Math.max(...ALGORITHMS.map((algorithm) => (prefix + algorithm.label).length));
    const lines = ALGORITHMS.map((algorithm) =>
      `${(prefix + algorithm.label).padEnd(width)}  ${formatDigest(state.digests[algorithm.id])}`);
    copyText(lines.join("\n"), "All hashes");
  },
};

/* --- Wiring --------------------------------------------------------------- */

buildRows();

textInput.addEventListener("input", run);
keyInput.addEventListener("input", run);
compareInput.addEventListener("input", renderCompare);

document.querySelectorAll(".mode-btn[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.mode === state.mode) return;
    applyMode(button.dataset.mode);
    window.DevToolsMain.writeHashState(hashFromState());
    run();
  });
});

document.querySelectorAll("[data-source]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.source === state.source) return;
    applySource(button.dataset.source);
    window.DevToolsMain.writeHashState(hashFromState());
    run();
  });
});

document.querySelectorAll("#formatSwitch [data-value]").forEach((button) => {
  button.addEventListener("click", () => {
    state.format = button.dataset.value;
    setActive(button.parentElement, button);
    renderDigests();
  });
});

document.querySelectorAll("#keyEncoding [data-value]").forEach((button) => {
  button.addEventListener("click", () => {
    state.keyEncoding = button.dataset.value;
    setActive(button.parentElement, button);
    run();
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "copy-digest") {
    const algorithm = ALGORITHMS.find((candidate) => candidate.id === button.closest(".digest-row").dataset.algorithm);
    const bytes = state.digests?.[algorithm.id];
    copyText(bytes && formatDigest(bytes), algorithm.label);
    return;
  }
  ACTIONS[button.dataset.action]?.(button);
});

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  loadFile(fileInput.files[0]);
  fileInput.value = "";
});

inputPanel.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  inputPanel.classList.add("is-dragging");
});
inputPanel.addEventListener("dragleave", (event) => {
  if (!inputPanel.contains(event.relatedTarget)) inputPanel.classList.remove("is-dragging");
});
inputPanel.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  inputPanel.classList.remove("is-dragging");
  if (!file) return;
  event.preventDefault();
  loadFile(file);
});

document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState((value) => {
  applyHash(value);
  run();
});

applyHash(window.DevToolsMain.readHashState());
// Seed the text so the tool explains itself on arrival.
textInput.value = SAMPLE_TEXT;
if (state.mode === "hmac") keyInput.value = SAMPLE_KEY;
run();
