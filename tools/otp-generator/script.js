// OTP Generator — HOTP (RFC 4226) and TOTP (RFC 6238) on WebCrypto HMAC.
//
// The pure functions at the top are classic-script globals so the spec can
// run the RFC test vectors against them directly. Counters are BigInt all the
// way down: a TOTP step fits in a double for millennia, but an HOTP counter is
// a full unsigned 64-bit value and a Number would silently round it.

/* --- Base32 (RFC 4648) ---------------------------------------------------- */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
// Characters people type when they mean a Base32 letter: the alphabet drops
// 0, 1, 8 and 9 precisely because they look like O, I/L and B.
const BASE32_LOOKALIKES = { 0: "O", 1: "I or L", 8: "B" };

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// Returns { bytes } or { error }. Authenticator apps show secrets in groups
// of four, lower-cased, and usually without padding, so all of that is
// normalised away before the alphabet is checked.
function base32Decode(text) {
  const clean = String(text).replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  if (!clean) return { error: "Enter a Base32 secret" };
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (!BASE32_ALPHABET.includes(ch)) {
      const hint = BASE32_LOOKALIKES[ch] ? ` — did you mean ${BASE32_LOOKALIKES[ch]}?` : "";
      const shown = ch === "=" ? "= (padding only belongs at the end)" : `"${ch}"`;
      return { error: `${shown} at position ${i + 1} is not Base32; the alphabet is A–Z and 2–7${hint}` };
    }
  }
  // 8 characters carry 5 bytes; a trailing group of 1, 3 or 6 characters
  // cannot come from any whole number of bytes, so the secret was truncated.
  if ([1, 3, 6].includes(clean.length % 8)) {
    return { error: `${clean.length} characters is not a valid Base32 length — the secret looks truncated` };
  }
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = ((value << 5) | BASE32_ALPHABET.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return { bytes: new Uint8Array(bytes) };
}

/* --- HOTP / TOTP ---------------------------------------------------------- */

const HASHES = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

function normaliseAlgorithm(name) {
  const key = String(name || "SHA1").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return HASHES[key] ? key : null;
}

// RFC 4226 §5.2: the counter is an 8-byte big-endian value.
function counterBytes(counter) {
  const value = BigInt(counter);
  if (value < 0n || value > 0xffffffffffffffffn) throw new RangeError("Counter must fit in 8 unsigned bytes");
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, value, false);
  return new Uint8Array(buffer);
}

// RFC 4226 §5.3 dynamic truncation: the low nibble of the last byte picks an
// offset, and the 31 bits there (top bit masked so signed and unsigned
// implementations agree) become the code. Using the last byte rather than
// byte 19 is what makes the same routine correct for SHA-256/512 (RFC 6238).
function dynamicTruncate(hmac, digits) {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

async function hmac(algorithm, keyBytes, message) {
  const hash = HASHES[normaliseAlgorithm(algorithm)];
  if (!hash) throw new Error(`Unsupported algorithm ${algorithm}`);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
}

async function hotp(keyBytes, counter, { algorithm = "SHA1", digits = 6 } = {}) {
  const mac = await hmac(algorithm, keyBytes, counterBytes(counter));
  return dynamicTruncate(mac, digits);
}

// RFC 6238 §4.2: T = floor((now - T0) / X). Seconds may be fractional (from
// Date.now()/1000); only whole seconds count.
function timeStep(seconds, period = 30, t0 = 0) {
  return (BigInt(Math.floor(seconds)) - BigInt(t0)) / BigInt(period);
}

function totp(keyBytes, seconds, { algorithm = "SHA1", digits = 6, period = 30 } = {}) {
  return hotp(keyBytes, timeStep(seconds, period), { algorithm, digits });
}

/* --- otpauth:// URIs (Google Authenticator key-uri-format) --------------- */

function buildOtpauthUri({ type = "totp", secret, issuer = "", account = "", algorithm = "SHA1", digits = 6, period = 30, counter = 0 }) {
  // The label is issuer and account joined by a literal colon, each part
  // percent-encoded on its own so a colon or space inside either survives.
  const label = issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` : encodeURIComponent(account);
  const params = [`secret=${String(secret).replace(/[\s=]/g, "").toUpperCase()}`];
  if (issuer) params.push(`issuer=${encodeURIComponent(issuer)}`);
  params.push(`algorithm=${normaliseAlgorithm(algorithm) || "SHA1"}`, `digits=${digits}`);
  if (type === "hotp") params.push(`counter=${BigInt(counter)}`);
  else params.push(`period=${period}`);
  return `otpauth://${type}/${label}?${params.join("&")}`;
}

// Returns the fields, or { error }. Parsed by hand: URL() treats otpauth as
// an opaque scheme and its host/path split differs between engines.
function parseOtpauthUri(text) {
  const match = /^otpauth:\/\/(totp|hotp)\/([^?#]*)(?:\?([^#]*))?/i.exec(String(text).trim());
  if (!match) return { error: "Not an otpauth:// URI — expected otpauth://totp/… or otpauth://hotp/…" };
  const type = match[1].toLowerCase();
  // An encoded %3A is as valid a separator as a literal colon, so split on
  // the decoded label.
  let label;
  try {
    label = decodeURIComponent(match[2]);
  } catch {
    return { error: "The label has broken percent-encoding" };
  }
  const colon = label.indexOf(":");
  const labelIssuer = colon >= 0 ? label.slice(0, colon).trim() : "";
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
  const params = new URLSearchParams(match[3] || "");
  const secret = params.get("secret");
  if (!secret) return { error: "The URI has no secret parameter" };
  const algorithm = normaliseAlgorithm(params.get("algorithm") || "SHA1");
  if (!algorithm) return { error: `Unsupported algorithm "${params.get("algorithm")}"` };
  const digits = Number(params.get("digits") || 6);
  if (![6, 7, 8].includes(digits)) return { error: `Unsupported digits "${params.get("digits")}" — use 6, 7 or 8` };
  const period = Number(params.get("period") || 30);
  if (!Number.isInteger(period) || period < 1) return { error: `Invalid period "${params.get("period")}"` };
  let counter = 0n;
  if (type === "hotp") {
    if (!/^\d+$/.test(params.get("counter") || "")) return { error: "An HOTP URI needs a numeric counter parameter" };
    counter = BigInt(params.get("counter"));
  }
  // The issuer parameter is authoritative; the label prefix is the fallback
  // for older apps that only wrote one of the two.
  const issuer = params.get("issuer") || labelIssuer;
  return { type, secret: secret.toUpperCase(), issuer, account, algorithm, digits, period, counter };
}

/* --- Validation ----------------------------------------------------------- */

// Checks a code against the current step and one on either side, the window
// RFC 6238 §5.2 recommends. Returns { offset } (-1, 0, 1) or { offset: null }.
async function matchCode(keyBytes, code, center, { algorithm, digits }) {
  for (const offset of [0, -1, 1]) {
    const counter = BigInt(center) + BigInt(offset);
    if (counter < 0n) continue;
    if ((await hotp(keyBytes, counter, { algorithm, digits })) === code) return { offset, counter };
  }
  return { offset: null };
}

/* --- UI ------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const uriInput = $("uri-input");
const secretInput = $("secret-input");
const secretStatus = $("secret-status");
const issuerInput = $("issuer-input");
const accountInput = $("account-input");
const periodInput = $("period-input");
const counterInput = $("counter-input");
const codeEl = $("code");
const codeMeta = $("code-meta");
const prevCode = $("prev-code");
const nextCode = $("next-code");
const prevLabel = $("prev-label");
const nextLabel = $("next-label");
const validateInput = $("validate-input");
const validateResult = $("validate-result");
const ringFill = $("ring-fill");
const ringSeconds = $("ring-seconds");
const ring = $("ring");
const uriOutput = $("uri-output");
const qrBox = $("qr");

const VIEWS = ["totp", "hotp"];
const RING_LENGTH = 2 * Math.PI * 28;
// The sample is the RFC 4226 / 6238 test seed "12345678901234567890" in
// Base32, so the codes it shows can be checked against the RFC tables.
const SAMPLE = { secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", issuer: "DevTools", account: "alice@example.com" };

const state = {
  view: "totp",
  algorithm: "SHA1",
  digits: 6,
  key: null,
  step: null,
  codes: null,
  // Bumped on every render so a slow HMAC from an older input cannot
  // overwrite the result of a newer one.
  generation: 0,
};

let qrCode = null;

function setResult(el, text, tone) {
  el.textContent = text;
  el.classList.remove("is-success", "is-warning", "is-error");
  if (tone) el.classList.add(`is-${tone}`);
}

function period() {
  const value = Number(periodInput.value);
  return Number.isInteger(value) && value >= 1 && value <= 3600 ? value : 30;
}

function counter() {
  const text = counterInput.value.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = BigInt(text);
  return value <= 0xffffffffffffffffn ? value : null;
}

function nowSeconds() {
  return Date.now() / 1000;
}

function showCode(code) {
  codeEl.dataset.code = code || "";
  if (!code) {
    codeEl.replaceChildren(Object.assign(document.createElement("span"), { className: "code-empty", textContent: "—".repeat(state.digits) }));
    return;
  }
  // Split into two visual groups; textContent stays the bare digits so a
  // select-and-copy by hand does not pick up a space.
  const cut = Math.floor(code.length / 2);
  const groups = [code.slice(0, cut), code.slice(cut)].map((part) =>
    Object.assign(document.createElement("span"), { className: "code-group", textContent: part }),
  );
  codeEl.replaceChildren(...groups);
}

function readKey() {
  const raw = secretInput.value;
  if (/^\s*otpauth:/i.test(raw)) {
    importUri(raw);
    return state.key;
  }
  const decoded = base32Decode(raw);
  secretInput.classList.toggle("is-invalid", Boolean(decoded.error) && raw.trim() !== "");
  if (decoded.error) {
    setResult(secretStatus, decoded.error, raw.trim() ? "error" : null);
    state.key = null;
  } else {
    const bits = decoded.bytes.length * 8;
    const tone = bits < 128 ? "warning" : "success";
    const note = bits < 128 ? " — RFC 4226 requires at least 128 bits, 160 recommended" : "";
    setResult(secretStatus, `${decoded.bytes.length} bytes (${bits}-bit key)${note}`, tone);
    state.key = decoded.bytes;
  }
  return state.key;
}

async function computeCodes() {
  const generation = ++state.generation;
  const key = state.key;
  const opts = { algorithm: state.algorithm, digits: state.digits };
  if (!key) {
    state.codes = null;
    showCode("");
    prevCode.textContent = nextCode.textContent = "—";
    codeMeta.textContent = "Enter a valid secret to see codes.";
    renderValidation();
    return;
  }
  let center;
  if (state.view === "totp") {
    center = timeStep(nowSeconds(), period());
    state.step = center;
  } else {
    center = counter();
    if (center === null) {
      state.codes = null;
      showCode("");
      prevCode.textContent = nextCode.textContent = "—";
      codeMeta.textContent = "The counter must be a whole number from 0 to 2^64 − 1.";
      renderValidation();
      return;
    }
  }
  const [prev, current, next] = await Promise.all([
    center > 0n ? hotp(key, center - 1n, opts) : null,
    hotp(key, center, opts),
    center < 0xffffffffffffffffn ? hotp(key, center + 1n, opts) : null,
  ]);
  if (generation !== state.generation) return;
  state.codes = { prev, current, next, center };
  showCode(current);
  prevCode.textContent = prev || "—";
  nextCode.textContent = next || "—";
  prevCode.dataset.copy = prev || "";
  nextCode.dataset.copy = next || "";
  if (state.view === "totp") {
    prevLabel.textContent = "Previous";
    nextLabel.textContent = "Next";
    codeMeta.textContent = `Step ${center} · ${state.algorithm.replace("SHA", "SHA-")} · ${state.digits} digits · ${period()} s period`;
  } else {
    prevLabel.textContent = `Counter ${center > 0n ? center - 1n : "—"}`;
    nextLabel.textContent = `Counter ${center + 1n}`;
    codeMeta.textContent = `Counter ${center} · ${state.algorithm.replace("SHA", "SHA-")} · ${state.digits} digits`;
  }
  renderValidation();
}

async function renderValidation() {
  const typed = validateInput.value.replace(/\s/g, "");
  if (!typed) {
    setResult(validateResult, "", null);
    return;
  }
  if (!/^\d+$/.test(typed)) {
    setResult(validateResult, "Codes are digits only", "error");
    return;
  }
  if (typed.length !== state.digits) {
    setResult(validateResult, `Expected ${state.digits} digits, got ${typed.length}`, "error");
    return;
  }
  if (!state.key || !state.codes) {
    setResult(validateResult, "Enter a valid secret first", "error");
    return;
  }
  const generation = state.generation;
  const { offset, counter: matched } = await matchCode(state.key, typed, state.codes.center, state);
  if (generation !== state.generation) return;
  const p = period();
  if (offset === null) {
    const window = state.view === "totp" ? `±1 step (±${p} s)` : `counters ${state.codes.center > 0n ? state.codes.center - 1n : 0n}–${state.codes.center + 1n}`;
    setResult(validateResult, `Not valid — no match within ${window}`, "error");
  } else if (state.view === "totp") {
    const messages = {
      0: ["Valid — current period", "success"],
      [-1]: [`Valid — previous period, clock may be ${p} s behind`, "warning"],
      1: [`Valid — next period, clock may be ${p} s ahead`, "warning"],
    };
    setResult(validateResult, ...messages[offset]);
  } else {
    const messages = {
      0: [`Valid — counter ${matched} (current)`, "success"],
      [-1]: [`Valid — counter ${matched}, one behind; this code was probably already used`, "warning"],
      1: [`Valid — counter ${matched}, one ahead; resynchronise the counter to ${matched + 1n}`, "warning"],
    };
    setResult(validateResult, ...messages[offset]);
  }
}

function currentUri() {
  if (!state.key) return "";
  return buildOtpauthUri({
    type: state.view,
    secret: base32Encode(state.key),
    issuer: issuerInput.value.trim(),
    account: accountInput.value.trim(),
    algorithm: state.algorithm,
    digits: state.digits,
    period: period(),
    counter: counter() ?? 0n,
  });
}

function renderUri() {
  const uri = currentUri();
  uriOutput.textContent = uri || "Enter a valid secret to build the URI.";
  uriOutput.classList.toggle("is-empty", !uri);
  if (!window.QRCodeStyling) {
    qrBox.textContent = "QR library unavailable";
    return;
  }
  if (!qrCode) {
    qrCode = new QRCodeStyling({
      width: 200,
      height: 200,
      type: "svg",
      data: uri || " ",
      margin: 0,
      // M is the level authenticator apps' own enrolment QRs use; the URI is
      // long enough that H would make the modules too small to scan well.
      qrOptions: { errorCorrectionLevel: "M" },
      dotsOptions: { color: "#111111", type: "square" },
      backgroundOptions: { color: "#ffffff" },
    });
    qrCode.append(qrBox);
  } else {
    qrCode.update({ data: uri || " " });
  }
  qrBox.classList.toggle("is-empty", !uri);
}

// Ring and seconds tick every 250 ms; codes are only recomputed when the
// time step rolls over, which keeps HMAC work to three signs per period.
function tick() {
  if (state.view !== "totp") return;
  const p = period();
  const now = nowSeconds();
  const remaining = p - (now % p);
  ringFill.style.strokeDashoffset = String(RING_LENGTH * (1 - remaining / p));
  ringSeconds.textContent = String(Math.ceil(remaining));
  ring.classList.toggle("is-ending", remaining <= 5);
  if (state.key && state.step !== timeStep(now, p)) computeCodes();
}

function refresh() {
  readKey();
  computeCodes();
  renderUri();
  tick();
}

function setOption(name, value, { render = true } = {}) {
  const group = document.querySelector(`[data-option="${name}"]`);
  group.querySelectorAll("[data-value]").forEach((button) => {
    const active = button.dataset.value === String(value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  state[name] = name === "digits" ? Number(value) : value;
  if (render) refresh();
}

function applyView(view) {
  state.view = VIEWS.includes(view) ? view : "totp";
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-mode-only]").forEach((el) => {
    el.hidden = el.dataset.modeOnly !== state.view;
  });
}

function importUri(text) {
  const parsed = parseOtpauthUri(text);
  if (parsed.error) {
    uriInput.classList.add("is-invalid");
    window.DevToolsMain.showToast(parsed.error, "error");
    return false;
  }
  uriInput.classList.remove("is-invalid");
  secretInput.value = parsed.secret;
  issuerInput.value = parsed.issuer;
  accountInput.value = parsed.account;
  periodInput.value = String(parsed.period);
  counterInput.value = String(parsed.counter);
  setOption("algorithm", parsed.algorithm, { render: false });
  setOption("digits", parsed.digits, { render: false });
  applyView(parsed.type);
  window.DevToolsMain.writeHashState(state.view);
  const decoded = base32Decode(parsed.secret);
  state.key = decoded.bytes || null;
  window.DevToolsMain.showToast(`Imported ${parsed.type.toUpperCase()} for ${parsed.issuer || parsed.account || "account"}`, "success");
  return true;
}

function copy(value, label) {
  if (!value) {
    window.DevToolsMain.showToast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => window.DevToolsMain.showToast(`${label} copied`, "success"))
    .catch(() => window.DevToolsMain.showToast("Copy failed", "error"));
}

function seed() {
  secretInput.value = SAMPLE.secret;
  issuerInput.value = SAMPLE.issuer;
  accountInput.value = SAMPLE.account;
  periodInput.value = "30";
  counterInput.value = "0";
  setOption("algorithm", "SHA1", { render: false });
  setOption("digits", 6, { render: false });
}

const ACTIONS = {
  sample() {
    seed();
    uriInput.value = "";
    validateInput.value = "";
    refresh();
    window.DevToolsMain.showToast("Sample inserted", "info");
  },
  clear() {
    for (const input of [uriInput, secretInput, issuerInput, accountInput, validateInput]) input.value = "";
    counterInput.value = "0";
    periodInput.value = "30";
    uriInput.classList.remove("is-invalid");
    refresh();
    secretInput.focus();
  },
  generate() {
    secretInput.value = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    refresh();
    window.DevToolsMain.showToast("New 160-bit secret generated", "success");
  },
  async "paste-uri"() {
    try {
      const text = await navigator.clipboard.readText();
      uriInput.value = text.trim();
      if (importUri(uriInput.value)) refresh();
    } catch {
      window.DevToolsMain.showToast("Clipboard is not readable here — paste into the field instead", "error");
    }
  },
  "copy-secret"() {
    copy(state.key ? base32Encode(state.key) : "", "Secret");
  },
  "copy-code"() {
    copy(state.codes?.current, "Code");
  },
  "copy-uri"() {
    copy(currentUri(), "URI");
  },
  "counter-up"() {
    const value = counter() ?? 0n;
    if (value < 0xffffffffffffffffn) counterInput.value = String(value + 1n);
    refresh();
  },
  "counter-down"() {
    const value = counter() ?? 0n;
    counterInput.value = String(value > 0n ? value - 1n : 0n);
    refresh();
  },
};

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    ACTIONS[action.dataset.action]?.();
    return;
  }
  const option = event.target.closest("[data-option] [data-value]");
  if (option) {
    setOption(option.closest("[data-option]").dataset.option, option.dataset.value);
    return;
  }
  if (event.target.closest("#code")) {
    copy(state.codes?.current, "Code");
    return;
  }
  const value = event.target.closest(".copy-value");
  if (value) copy(value.dataset.copy, "Code");
});

// Typing a URI by hand passes "looks complete" on every keystroke after
// secret=, which imported (and toasted) once per character; wait for a pause.
const URI_IMPORT_DELAY_MS = 400;
let uriImportTimer = 0;

uriInput.addEventListener("input", (event) => {
  window.clearTimeout(uriImportTimer);
  const text = uriInput.value.trim();
  if (!text) {
    uriInput.classList.remove("is-invalid");
    return;
  }
  // Only import once the text looks complete, so typing does not toast an
  // error on every keystroke.
  if (/^otpauth:\/\/(totp|hotp)\/.*secret=/i.test(text)) {
    // A paste lands whole, so it imports at once.
    const pasted = event.inputType === "insertFromPaste";
    const doImport = () => {
      if (importUri(uriInput.value.trim())) refresh();
    };
    if (pasted) doImport();
    else uriImportTimer = window.setTimeout(doImport, URI_IMPORT_DELAY_MS);
  } else {
    const lower = text.toLowerCase();
    uriInput.classList.toggle("is-invalid", !("otpauth://".startsWith(lower) || lower.startsWith("otpauth://")));
  }
});

for (const input of [secretInput, periodInput, counterInput]) input.addEventListener("input", refresh);
for (const input of [issuerInput, accountInput]) input.addEventListener("input", renderUri);
validateInput.addEventListener("input", renderValidation);

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view === state.view) return;
    applyView(button.dataset.view);
    window.DevToolsMain.writeHashState(state.view);
    refresh();
  });
});

$("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState((value) => {
  applyView(value);
  refresh();
});

ringFill.style.strokeDasharray = String(RING_LENGTH);
applyView(window.DevToolsMain.readHashState());
// Seed a well-known demo secret so the tool explains itself on arrival.
seed();
refresh();
setInterval(tick, 250);
