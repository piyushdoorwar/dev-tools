// Text Encrypt / Decrypt — AES-256-GCM through WebCrypto, keyed either from a
// password (PBKDF2-HMAC-SHA-256) or from a raw 256-bit key.
//
// Output is one self-describing token so it can be decrypted anywhere. The
// compact form (version 1) is:
//
//   offset  size  field
//   0       1     version = 1
//   1       1     kdf id: 1 = PBKDF2-HMAC-SHA-256, 0 = raw key
//   2       4     iterations, uint32 big-endian (0 for a raw key)
//   6       16    salt (16 zero bytes for a raw key)
//   22      12    IV
//   34      n     ciphertext
//   34+n    16    GCM tag
//
// The header is not fed to GCM as associated data, which keeps third-party
// decryption to "derive key, decrypt". It is still covered: salt and
// iterations feed the key, so editing them fails authentication, and a raw-key
// header must be exactly zero where the KDF fields would be.
//
// Deliberately absent: RC4, Rabbit, Triple DES and unauthenticated AES-CBC
// (the help modal says why). There is no `openssl enc` recipe because enc
// refuses AEAD ciphers.

const FORMAT_VERSION = 1;
const KDF_RAW = 0;
const KDF_PBKDF2 = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 2 + 4 + SALT_BYTES + IV_BYTES; // 34
const MIN_TOKEN_BYTES = HEADER_BYTES + TAG_BYTES; // 50: empty plaintext
const DEFAULT_ITERATIONS = 600000; // OWASP Password Storage Cheat Sheet, 2023
// A token carries its own iteration count, so an absurd one would hang the tab.
const MAX_ITERATIONS = 10000000;

const SAMPLE_TEXT = "Meet at the café at 19:30 — bring the 🔑.\nПароль от Wi-Fi: 勝利-2026";
const SAMPLE_PASSWORD = "correct horse battery staple";

const AUTH_FAILED_PASSWORD = "Authentication failed — wrong password or the data was changed";
const AUTH_FAILED_KEY = "Authentication failed — wrong key or the data was changed";

class EnvelopeError extends Error {}

/* --- Bytes and encodings -------------------------------------------------- */

function bytesToBase64(bytes, url = false) {
  let binary = "";
  // Chunked: String.fromCharCode(...bytes) overflows the stack on large input.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  const base64 = btoa(binary);
  return url ? base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : base64;
}

// Accepts either alphabet, with or without padding, ignoring whitespace (so a
// token wrapped by an email client still decodes).
function base64ToBytes(text) {
  const clean = String(text).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean) || (/[-_]/.test(clean) && /[+/]/.test(clean))) {
    throw new EnvelopeError("Not valid Base64 or Base64url");
  }
  const body = clean.replace(/=+$/, "");
  if (body.length % 4 === 1) {
    throw new EnvelopeError("Base64 length is impossible — the input looks truncated");
  }
  const standard = body.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(standard + "=".repeat((4 - (standard.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Takes one encoded string or several (the fields of a JSON envelope).
function detectAlphabet(texts) {
  const parts = [].concat(texts).map((t) => String(t).replace(/\s+/g, ""));
  if (parts.some((t) => /[-_]/.test(t))) return "base64url";
  if (parts.some((t) => /[+/=]/.test(t))) return "base64";
  // Neither alphabet's distinguishing characters: unpadded lengths only occur
  // in Base64url output, otherwise both read the same.
  return parts.some((t) => t.length % 4) ? "base64url" : "base64";
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/* --- Keys ----------------------------------------------------------------- */

// Length is the only thing a browser can judge honestly; entropy estimators
// give false confidence for passwords that are long but guessable.
function passwordStrength(password) {
  const length = [...password].length;
  if (!length) return { level: "empty", label: "Enter a password" };
  if (length < 8) return { level: "weak", label: `Weak — ${length} characters; use at least 12` };
  if (length < 12) return { level: "fair", label: `Fair — ${length} characters; 12+ is better` };
  if (length < 16) return { level: "good", label: `Good — ${length} characters` };
  return { level: "strong", label: `Strong — ${length} characters` };
}

// A raw key is 64 hex characters or the Base64/Base64url of 32 bytes.
function parseRawKey(text) {
  const clean = String(text).replace(/[\s:]+/g, "");
  if (!clean) throw new EnvelopeError("Enter a 256-bit key or generate one");
  // Hex digits are also valid Base64, so an all-hex string is read as hex
  // unless it has the 43/44-character length of a Base64-encoded 32-byte key.
  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length !== 43 && clean.length !== 44) {
    if (clean.length % 2) throw new EnvelopeError("Hex key has an odd number of digits");
    if (clean.length !== 64) {
      throw new EnvelopeError(`Key is ${clean.length * 4} bits; AES-256 needs exactly 256 (64 hex characters)`);
    }
    return Uint8Array.from(clean.match(/../g), (pair) => parseInt(pair, 16));
  }
  let bytes;
  try {
    bytes = base64ToBytes(clean);
  } catch {
    throw new EnvelopeError("Key must be 64 hex characters or Base64 of 32 bytes");
  }
  if (bytes.length !== 32) {
    throw new EnvelopeError(`Key is ${bytes.length * 8} bits; AES-256 needs exactly 256 (32 bytes)`);
  }
  return bytes;
}

function generateRawKey() {
  return toHex(randomBytes(32));
}

async function importKey(secret, kdf, iterations, salt) {
  const subtle = crypto.subtle;
  if (kdf === KDF_RAW) {
    return subtle.importKey("raw", secret.key, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  const base = await subtle.importKey("raw", new TextEncoder().encode(secret.password), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* --- Envelope ------------------------------------------------------------- */

// `secret` is { type: "password", password } or { type: "raw", key }.
async function encryptText(plaintext, secret, iterations = DEFAULT_ITERATIONS) {
  const kdf = secret.type === "raw" ? KDF_RAW : KDF_PBKDF2;
  const salt = kdf === KDF_RAW ? new Uint8Array(SALT_BYTES) : randomBytes(SALT_BYTES);
  const iter = kdf === KDF_RAW ? 0 : iterations;
  const iv = randomBytes(IV_BYTES);
  const key = await importKey(secret, kdf, iter, salt);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: TAG_BYTES * 8 },
    key,
    new TextEncoder().encode(plaintext),
  ));
  return {
    version: FORMAT_VERSION,
    kdf,
    iterations: iter,
    salt,
    iv,
    ciphertext: sealed.subarray(0, sealed.length - TAG_BYTES),
    tag: sealed.subarray(sealed.length - TAG_BYTES),
  };
}

function compactBytes(envelope) {
  const header = new Uint8Array(HEADER_BYTES);
  header[0] = envelope.version;
  header[1] = envelope.kdf;
  new DataView(header.buffer).setUint32(2, envelope.iterations, false);
  header.set(envelope.salt, 6);
  header.set(envelope.iv, 22);
  return concatBytes(header, envelope.ciphertext, envelope.tag);
}

function formatEnvelope(envelope, format = "compact", encoding = "base64") {
  const url = encoding === "base64url";
  if (format === "json") {
    const b64 = (bytes) => bytesToBase64(bytes, url);
    const doc = { v: envelope.version, alg: "A256GCM" };
    if (envelope.kdf === KDF_PBKDF2) {
      Object.assign(doc, { kdf: "PBKDF2-SHA256", iter: envelope.iterations, salt: b64(envelope.salt) });
    } else {
      doc.kdf = "none";
    }
    Object.assign(doc, { iv: b64(envelope.iv), ct: b64(envelope.ciphertext), tag: b64(envelope.tag) });
    return JSON.stringify(doc, null, 2);
  }
  return bytesToBase64(compactBytes(envelope), url);
}

function checkHeader(envelope) {
  if (envelope.version !== FORMAT_VERSION) {
    throw new EnvelopeError(`Unknown format version ${envelope.version} — this tool reads version ${FORMAT_VERSION}`);
  }
  if (envelope.kdf === KDF_PBKDF2) {
    if (envelope.iterations < 1 || envelope.iterations > MAX_ITERATIONS) {
      throw new EnvelopeError(`Corrupt header: ${envelope.iterations.toLocaleString("en-US")} PBKDF2 iterations is out of range`);
    }
  } else if (envelope.kdf === KDF_RAW) {
    if (envelope.iterations !== 0 || envelope.salt.some((b) => b !== 0)) {
      throw new EnvelopeError("Corrupt header: a raw-key token must have zero iterations and salt");
    }
  } else {
    throw new EnvelopeError(`Unknown key derivation id ${envelope.kdf}`);
  }
}

function parseCompact(bytes) {
  if (bytes.length < 1) throw new EnvelopeError("Input is empty");
  if (bytes[0] !== FORMAT_VERSION) {
    throw new EnvelopeError(`Unknown format version ${bytes[0]} — this tool reads version ${FORMAT_VERSION}`);
  }
  if (bytes.length < MIN_TOKEN_BYTES) {
    throw new EnvelopeError(`Input is truncated — ${bytes.length} bytes, but a version ${FORMAT_VERSION} token has at least ${MIN_TOKEN_BYTES}`);
  }
  const envelope = {
    version: bytes[0],
    kdf: bytes[1],
    iterations: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(2, false),
    salt: bytes.slice(6, 22),
    iv: bytes.slice(22, HEADER_BYTES),
    ciphertext: bytes.slice(HEADER_BYTES, bytes.length - TAG_BYTES),
    tag: bytes.slice(bytes.length - TAG_BYTES),
  };
  checkHeader(envelope);
  return envelope;
}

function parseJsonEnvelope(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new EnvelopeError("Looks like JSON but does not parse — is the envelope truncated?");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new EnvelopeError("JSON envelope must be an object");
  if (doc.v !== FORMAT_VERSION) throw new EnvelopeError(`Unknown format version ${JSON.stringify(doc.v)} — this tool reads version ${FORMAT_VERSION}`);
  if (doc.alg !== undefined && doc.alg !== "A256GCM") throw new EnvelopeError(`Unsupported algorithm ${JSON.stringify(doc.alg)}`);

  const field = (name, length) => {
    if (typeof doc[name] !== "string") throw new EnvelopeError(`JSON envelope is missing "${name}"`);
    let bytes;
    try {
      bytes = base64ToBytes(doc[name]);
    } catch (error) {
      throw new EnvelopeError(`"${name}" is not valid Base64`);
    }
    if (length !== undefined && bytes.length !== length) {
      throw new EnvelopeError(`"${name}" is ${bytes.length} bytes; expected ${length} — truncated or corrupt`);
    }
    return bytes;
  };

  let kdf;
  if (doc.kdf === "PBKDF2-SHA256") kdf = KDF_PBKDF2;
  else if (doc.kdf === "none") kdf = KDF_RAW;
  else throw new EnvelopeError(`Unknown key derivation ${JSON.stringify(doc.kdf)}`);

  if (kdf === KDF_PBKDF2 && !Number.isInteger(doc.iter)) throw new EnvelopeError('JSON envelope needs an integer "iter"');
  const envelope = {
    version: doc.v,
    kdf,
    iterations: kdf === KDF_PBKDF2 ? doc.iter : 0,
    salt: kdf === KDF_PBKDF2 ? field("salt", SALT_BYTES) : new Uint8Array(SALT_BYTES),
    iv: field("iv", IV_BYTES),
    ciphertext: field("ct"),
    tag: field("tag", TAG_BYTES),
  };
  checkHeader(envelope);
  return envelope;
}

// Auto-detects the JSON envelope versus a compact token and its alphabet.
function parseToken(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new EnvelopeError("Paste an encrypted token to decrypt");
  if (trimmed.startsWith("{")) {
    const envelope = parseJsonEnvelope(trimmed);
    const doc = JSON.parse(trimmed);
    const fields = ["salt", "iv", "ct", "tag"].filter((name) => typeof doc[name] === "string").map((name) => doc[name]);
    return { envelope, format: "json", encoding: detectAlphabet(fields) };
  }
  return { envelope: parseCompact(base64ToBytes(trimmed)), format: "compact", encoding: detectAlphabet(trimmed) };
}

async function decryptEnvelope(envelope, secret) {
  if (envelope.kdf === KDF_PBKDF2 && secret.type !== "password") {
    throw new EnvelopeError("This was encrypted with a password — switch Key to Password");
  }
  if (envelope.kdf === KDF_RAW && secret.type !== "raw") {
    throw new EnvelopeError("This was encrypted with a raw key — switch Key to Raw key");
  }
  const key = await importKey(secret, envelope.kdf, envelope.iterations, envelope.salt);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.iv, tagLength: TAG_BYTES * 8 },
      key,
      concatBytes(envelope.ciphertext, envelope.tag),
    );
  } catch {
    throw new EnvelopeError(secret.type === "raw" ? AUTH_FAILED_KEY : AUTH_FAILED_PASSWORD);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw new EnvelopeError("Decrypted, but the result is not UTF-8 text");
  }
}

async function decryptText(token, secret) {
  return decryptEnvelope(parseToken(token).envelope, secret);
}

/* --- Interop snippets ----------------------------------------------------- */

// Kept byte-for-byte runnable: the spec executes the Node one against this
// page's output, and the Python one too when `cryptography` is installed.
const SNIPPETS = {
  python: `import base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def decrypt(token: str, password: str) -> str:
    token = token.strip().replace("+", "-").replace("/", "_").rstrip("=")
    data = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    if data[0] != 1 or data[1] != 1:
        raise ValueError("not a version 1 password token")
    iterations = int.from_bytes(data[2:6], "big")
    salt, iv, sealed = data[6:22], data[22:34], data[34:]
    key = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations
    ).derive(password.encode("utf-8"))
    # For a raw-key token (data[1] == 0), use the 32-byte key directly.
    # AESGCM expects ciphertext || tag, which is how the token stores it.
    return AESGCM(key).decrypt(iv, sealed, None).decode("utf-8")
`,
  node: `const crypto = require('node:crypto');

function decrypt(token, password) {
  // Buffer's 'base64' decoder also accepts the Base64url alphabet.
  const data = Buffer.from(token.trim(), 'base64');
  if (data[0] !== 1 || data[1] !== 1) throw new Error('not a version 1 password token');
  const iterations = data.readUInt32BE(2);
  const salt = data.subarray(6, 22);
  const iv = data.subarray(22, 34);
  const ciphertext = data.subarray(34, data.length - 16);
  const tag = data.subarray(data.length - 16);
  // For a raw-key token (data[1] === 0), use the 32-byte key directly.
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
`,
};

/* --- UI ------------------------------------------------------------------- */

const els = {
  input: document.getElementById("input-editor"),
  output: document.getElementById("output-editor"),
  inputTitle: document.getElementById("input-title"),
  outputTitle: document.getElementById("output-title"),
  inputStatus: document.getElementById("input-status"),
  outputStatus: document.getElementById("output-status"),
  inputCount: document.getElementById("input-count"),
  outputCount: document.getElementById("output-count"),
  password: document.getElementById("password"),
  togglePassword: document.getElementById("toggle-password"),
  strength: document.getElementById("password-strength"),
  rawKey: document.getElementById("raw-key"),
  rawKeyHint: document.getElementById("raw-key-hint"),
  passwordGroup: document.getElementById("password-group"),
  rawKeyGroup: document.getElementById("raw-key-group"),
  iterationsGroup: document.getElementById("iterations-group"),
  detectNote: document.getElementById("detect-note"),
  runBtn: document.getElementById("run-btn"),
  outputPanel: document.getElementById("output-panel"),
  envelopeDetails: document.getElementById("envelope-details"),
  envelopeEmpty: document.getElementById("envelope-empty"),
};

const VIEWS = ["output", "envelope", "interop"];

const state = {
  direction: "encrypt",
  keyMode: "password",
  format: "compact",
  encoding: "base64",
  iterations: DEFAULT_ITERATIONS,
  view: "output",
  busy: false,
  // The envelope behind the current output (encrypt) or input (decrypt).
  envelope: null,
  envelopeMeta: null,
  envelopeError: null,
  lastRun: null,
};

function setStatus(bar, message, type = "") {
  const text = bar.querySelector(".status-text");
  text.textContent = message;
  text.className = `status-text${type ? ` ${type}` : ""}`;
}

function countLabel(text) {
  const n = [...text].length;
  return `${n.toLocaleString("en-US")} ${n === 1 ? "char" : "chars"}`;
}

function setOutput(text) {
  els.output.value = text;
  els.outputCount.textContent = countLabel(text);
}

function toast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

function setSegment(attr, value) {
  document.querySelectorAll(`[data-${attr}]`).forEach((button) => {
    const active = button.dataset[attr.replace(/-(\w)/g, (_, c) => c.toUpperCase())] === String(value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function currentSecret() {
  if (state.keyMode === "raw") return { type: "raw", key: parseRawKey(els.rawKey.value) };
  if (!els.password.value) throw new EnvelopeError("Enter a password");
  return { type: "password", password: els.password.value };
}

function renderKeyHints() {
  const strength = passwordStrength(els.password.value);
  els.strength.textContent = state.direction === "encrypt" ? strength.label : "";
  els.strength.className = `key-hint is-${strength.level}`;

  if (!els.rawKey.value.trim()) {
    els.rawKeyHint.textContent = "Generate one, or paste hex / Base64";
    els.rawKeyHint.className = "key-hint";
    els.rawKey.classList.remove("is-invalid");
    return;
  }
  try {
    parseRawKey(els.rawKey.value);
    els.rawKeyHint.textContent = "256-bit key ✓";
    els.rawKeyHint.className = "key-hint is-strong";
    els.rawKey.classList.remove("is-invalid");
  } catch (error) {
    els.rawKeyHint.textContent = error.message;
    els.rawKeyHint.className = "key-hint is-weak";
    els.rawKey.classList.add("is-invalid");
  }
}

function applyControls() {
  const encrypting = state.direction === "encrypt";
  setSegment("direction", state.direction);
  setSegment("key-mode", state.keyMode);
  setSegment("format", state.format);
  setSegment("encoding", state.encoding);
  setSegment("iterations", state.iterations);

  document.querySelectorAll("[data-encrypt-only]").forEach((node) => {
    node.hidden = !encrypting || (node === els.iterationsGroup && state.keyMode === "raw");
  });
  els.detectNote.hidden = encrypting;
  els.passwordGroup.hidden = state.keyMode !== "password";
  els.rawKeyGroup.hidden = state.keyMode !== "raw";

  els.inputTitle.textContent = encrypting ? "Plain text" : "Encrypted";
  els.outputTitle.textContent = encrypting ? "Encrypted" : "Plain text";
  els.input.placeholder = encrypting
    ? "Type or paste the text to encrypt..."
    : "Paste a compact token or a JSON envelope...";
  if (!state.busy) els.runBtn.textContent = encrypting ? "Encrypt" : "Decrypt";
  renderKeyHints();
}

function applyView(view) {
  state.view = VIEWS.includes(view) ? view : "output";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== state.view;
  });
}

const KDF_LABELS = { [KDF_PBKDF2]: "PBKDF2-HMAC-SHA-256 (id 1)", [KDF_RAW]: "None — raw key (id 0)" };
const FORMAT_LABELS = { compact: "Compact", json: "JSON envelope" };
const ENCODING_LABELS = { base64: "Base64", base64url: "Base64url" };
const HEX_DISPLAY_LIMIT = 4096; // bytes; beyond this the tab becomes sluggish

function hexCell(bytes) {
  if (bytes.length <= HEX_DISPLAY_LIMIT) return toHex(bytes);
  return `${toHex(bytes.subarray(0, HEX_DISPLAY_LIMIT))}… (+${(bytes.length - HEX_DISPLAY_LIMIT).toLocaleString("en-US")} bytes)`;
}

function renderEnvelope() {
  const { envelope, envelopeMeta: meta, envelopeError } = state;
  els.envelopeDetails.replaceChildren();
  els.envelopeDetails.hidden = !envelope;
  els.envelopeEmpty.hidden = Boolean(envelope);
  if (!envelope) {
    els.envelopeEmpty.textContent = envelopeError
      || (state.direction === "encrypt" ? "Encrypt something to see its parts." : "Paste a token to see its parts.");
    els.envelopeEmpty.classList.toggle("is-error", Boolean(envelopeError));
    return;
  }
  const total = HEADER_BYTES + envelope.ciphertext.length + TAG_BYTES;
  const rows = [
    ["format", "Format", `${FORMAT_LABELS[meta.format]} · ${ENCODING_LABELS[meta.encoding]}`],
    ["version", "Version", String(envelope.version)],
    ["kdf", "Key derivation", KDF_LABELS[envelope.kdf]],
    ["iterations", "Iterations", envelope.kdf === KDF_PBKDF2 ? envelope.iterations.toLocaleString("en-US") : "0 (unused)"],
    ["salt", `Salt · ${SALT_BYTES} bytes`, toHex(envelope.salt)],
    ["iv", `IV · ${IV_BYTES} bytes`, toHex(envelope.iv)],
    ["ciphertext", `Ciphertext · ${envelope.ciphertext.length.toLocaleString("en-US")} bytes`, hexCell(envelope.ciphertext) || "(empty)"],
    ["tag", `Tag · ${TAG_BYTES} bytes`, toHex(envelope.tag)],
    ["size", "Compact size", `${total.toLocaleString("en-US")} bytes (${HEADER_BYTES} header + ${envelope.ciphertext.length.toLocaleString("en-US")} + ${TAG_BYTES} tag)`],
  ];
  for (const [key, label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.dataset.part = key;
    dd.textContent = value;
    els.envelopeDetails.append(dt, dd);
  }
}

// Decrypt mode reads the token's structure on every keystroke; it costs
// nothing, and it surfaces truncation or version errors before the slow KDF.
function inspectInput() {
  els.inputCount.textContent = countLabel(els.input.value);
  if (state.direction === "encrypt") {
    els.input.classList.remove("is-invalid");
    setStatus(els.inputStatus, els.input.value ? "Ready to encrypt" : "Ready");
    return;
  }
  state.envelope = null;
  state.envelopeMeta = null;
  state.envelopeError = null;
  if (!els.input.value.trim()) {
    els.input.classList.remove("is-invalid");
    setStatus(els.inputStatus, "Paste a token to decrypt");
  } else {
    try {
      const parsed = parseToken(els.input.value);
      state.envelope = parsed.envelope;
      state.envelopeMeta = { format: parsed.format, encoding: parsed.encoding };
      els.input.classList.remove("is-invalid");
      const kdf = parsed.envelope.kdf === KDF_PBKDF2
        ? `${parsed.envelope.iterations.toLocaleString("en-US")} iterations`
        : "raw key";
      setStatus(els.inputStatus, `${FORMAT_LABELS[parsed.format]} · ${ENCODING_LABELS[parsed.encoding]} · ${kdf}`, "success");
    } catch (error) {
      if (!(error instanceof EnvelopeError)) throw error;
      state.envelopeError = error.message;
      els.input.classList.add("is-invalid");
      setStatus(els.inputStatus, error.message, "error");
    }
  }
  renderEnvelope();
}

function markStale() {
  if (state.busy || !els.output.value) return;
  setStatus(els.outputStatus, `Out of date — press ${state.direction === "encrypt" ? "Encrypt" : "Decrypt"} (Ctrl+Enter)`, "warning");
}

function setBusy(busy, label) {
  state.busy = busy;
  els.runBtn.disabled = busy;
  els.outputPanel.setAttribute("aria-busy", String(busy));
  els.outputPanel.classList.toggle("is-busy", busy);
  els.runBtn.textContent = busy ? label : (state.direction === "encrypt" ? "Encrypt" : "Decrypt");
}

async function run() {
  if (state.busy) return;
  if (!window.crypto?.subtle) {
    setStatus(els.outputStatus, "WebCrypto is unavailable — open this page over HTTPS", "error");
    return;
  }
  const encrypting = state.direction === "encrypt";
  let secret;
  try {
    secret = currentSecret();
    if (!encrypting) inspectInput();
    if (!encrypting && state.envelopeError) throw new EnvelopeError(state.envelopeError);
    if (!encrypting && !state.envelope) throw new EnvelopeError("Paste an encrypted token to decrypt");
  } catch (error) {
    if (!(error instanceof EnvelopeError)) throw error;
    setOutput("");
    setStatus(els.outputStatus, error.message, "error");
    return;
  }

  const iterations = encrypting ? state.iterations : state.envelope.iterations;
  const slow = secret.type === "password";
  setBusy(true, encrypting ? "Encrypting…" : "Decrypting…");
  setStatus(els.outputStatus, slow ? `Deriving key — ${iterations.toLocaleString("en-US")} PBKDF2 iterations…` : "Working…", "warning");
  const started = performance.now();
  try {
    if (encrypting) {
      const envelope = await encryptText(els.input.value, secret, state.iterations);
      state.envelope = envelope;
      state.envelopeMeta = { format: state.format, encoding: state.encoding };
      state.envelopeError = null;
      state.lastRun = { envelope, format: state.format, encoding: state.encoding };
      setOutput(formatEnvelope(envelope, state.format, state.encoding));
    } else {
      setOutput(await decryptEnvelope(state.envelope, secret));
    }
    els.output.classList.remove("is-invalid");
    const ms = Math.round(performance.now() - started);
    setStatus(els.outputStatus, `${encrypting ? "Encrypted" : "Decrypted"} in ${ms.toLocaleString("en-US")} ms`, "success");
  } catch (error) {
    if (!(error instanceof EnvelopeError)) {
      setOutput("");
      setStatus(els.outputStatus, `Failed: ${error.message}`, "error");
    } else {
      setOutput("");
      els.output.classList.add("is-invalid");
      setStatus(els.outputStatus, error.message, "error");
    }
  } finally {
    setBusy(false);
    renderEnvelope();
  }
}

function setDirection(direction) {
  if (direction === state.direction) return;
  state.direction = direction;
  state.envelope = null;
  state.envelopeError = null;
  setOutput("");
  els.output.classList.remove("is-invalid");
  setStatus(els.outputStatus, "Ready");
  applyControls();
  inspectInput();
  renderEnvelope();
}

// Re-render the last result when only its encoding changes: salt and IV must
// not be regenerated just to switch alphabets, and no KDF run is needed.
function reformatOutput() {
  if (state.direction !== "encrypt" || !state.lastRun || !els.output.value) return;
  state.lastRun.format = state.format;
  state.lastRun.encoding = state.encoding;
  state.envelopeMeta = { format: state.format, encoding: state.encoding };
  setOutput(formatEnvelope(state.lastRun.envelope, state.format, state.encoding));
  renderEnvelope();
}

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const ACTIONS = {
  swap() {
    if (state.busy) return;
    const next = els.output.value;
    const previous = els.input.value;
    setDirection(state.direction === "encrypt" ? "decrypt" : "encrypt");
    els.input.value = next;
    inspectInput();
    if (next) run();
    else if (previous) toast("Nothing to swap in yet — run it first", "info");
  },
  sample() {
    setDirection("encrypt");
    els.input.value = SAMPLE_TEXT;
    if (state.keyMode === "password") els.password.value = SAMPLE_PASSWORD;
    else if (!els.rawKey.value.trim()) els.rawKey.value = generateRawKey();
    renderKeyHints();
    inspectInput();
    run();
  },
  paste() {
    navigator.clipboard.readText()
      .then((text) => {
        if (!text) {
          toast("Clipboard is empty", "error");
          return;
        }
        els.input.value = text;
        inspectInput();
        markStale();
        toast("Pasted from clipboard", "success");
      })
      .catch(() => toast("Clipboard is not available", "error"));
  },
  clear() {
    els.input.value = "";
    setOutput("");
    state.lastRun = null;
    state.envelope = null;
    state.envelopeError = null;
    setStatus(els.outputStatus, "Ready");
    inspectInput();
    renderEnvelope();
    els.input.focus();
  },
  copy() {
    if (!els.output.value) {
      toast("Nothing to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(els.output.value)
      .then(() => toast(state.direction === "encrypt" ? "Encrypted text copied" : "Plain text copied", "success"))
      .catch(() => toast("Copy failed", "error"));
  },
  download() {
    if (!els.output.value) {
      toast("Nothing to download", "error");
      return;
    }
    if (state.direction === "decrypt") download(els.output.value, "decrypted.txt", "text/plain");
    else if (state.format === "json") download(els.output.value, "encrypted.json", "application/json");
    else download(els.output.value, "encrypted.txt", "text/plain");
  },
  "generate-key"() {
    els.rawKey.value = generateRawKey();
    renderKeyHints();
    markStale();
    toast("New random 256-bit key — keep a copy, it cannot be recovered", "info");
  },
  "copy-key"() {
    if (!els.rawKey.value.trim()) {
      toast("No key to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(els.rawKey.value.trim())
      .then(() => toast("Key copied", "success"))
      .catch(() => toast("Copy failed", "error"));
  },
  "copy-snippet"(button) {
    const name = button.dataset.snippet;
    window.DevToolsMain.copyText(SNIPPETS[name])
      .then(() => toast(`${name === "python" ? "Python" : "Node.js"} snippet copied`, "success"))
      .catch(() => toast("Copy failed", "error"));
  },
};

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    ACTIONS[action.dataset.action]?.(action);
    return;
  }
  const option = event.target.closest("[data-direction],[data-key-mode],[data-format],[data-encoding],[data-iterations],[data-view]");
  if (!option) return;
  const { direction, keyMode, format, encoding, iterations, view } = option.dataset;
  if (view) {
    applyView(view);
    window.DevToolsMain.writeHashState(state.view);
    return;
  }
  if (state.busy) return;
  if (direction) {
    setDirection(direction);
    return;
  }
  if (keyMode) {
    state.keyMode = keyMode;
    applyControls();
    markStale();
    return;
  }
  if (format) state.format = format;
  if (encoding) state.encoding = encoding;
  if (iterations) {
    state.iterations = Number(iterations);
    markStale();
  }
  applyControls();
  if (format || encoding) reformatOutput();
});

els.runBtn.addEventListener("click", run);

els.togglePassword.addEventListener("click", () => {
  const show = els.password.type === "password";
  els.password.type = show ? "text" : "password";
  els.togglePassword.textContent = show ? "Hide" : "Show";
  els.togglePassword.setAttribute("aria-pressed", String(show));
});

els.input.addEventListener("input", () => {
  inspectInput();
  markStale();
});
els.password.addEventListener("input", () => {
  renderKeyHints();
  markStale();
});
els.rawKey.addEventListener("input", () => {
  renderKeyHints();
  markStale();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.target.closest?.(".modal-overlay")) {
    event.preventDefault();
    run();
  } else if (event.key === "Enter" && (event.target === els.password || event.target === els.rawKey)) {
    event.preventDefault();
    run();
  }
});

document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));
document.getElementById("snippet-python").textContent = SNIPPETS.python;
document.getElementById("snippet-node").textContent = SNIPPETS.node;

window.DevToolsMain.onHashState((value) => applyView(value));
applyView(window.DevToolsMain.readHashState());

// Seed a sample so the tool explains itself on arrival.
els.input.value = SAMPLE_TEXT;
els.password.value = SAMPLE_PASSWORD;
applyControls();
inspectInput();
setOutput("");
run().then(() => {
  if (els.output.value) setStatus(els.outputStatus, `Sample encrypted with the password “${SAMPLE_PASSWORD}”`, "success");
});
