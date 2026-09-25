// Key Pair Generator — RSA, ECDSA, Ed25519 and X25519 keys from WebCrypto,
// exported as PKCS#8 / SPKI PEM, JWK (with an RFC 7638 kid) and an OpenSSH
// public key line.
//
// WebCrypto has no SSH export, so the OpenSSH blob is assembled here from the
// JWK members using the RFC 4251 wire encoding (string / mpint).

const algoSwitch = document.getElementById("algo-switch");
const paramSwitch = document.getElementById("param-switch");
const paramLabel = document.getElementById("param-label");
const commentInput = document.getElementById("ssh-comment");
const supportNote = document.getElementById("support-note");
const generateBtn = document.getElementById("generate-btn");
const statusBar = document.getElementById("status");
const summary = document.getElementById("key-summary");
const details = document.getElementById("details");

const outputs = {
  ssh: document.getElementById("out-ssh"),
  spki: document.getElementById("out-spki"),
  pkcs8: document.getElementById("out-pkcs8"),
  "jwk-public": document.getElementById("out-jwk-public"),
  "jwk-private": document.getElementById("out-jwk-private"),
};

// Hash per curve follows RFC 7518 §3.4 (ES256/384/512), and the SSH names
// follow RFC 5656 §6.
const ALGORITHMS = {
  rsa: {
    label: "RSA",
    paramLabel: "Key size",
    params: [
      { id: "2048", label: "2048" },
      { id: "3072", label: "3072" },
      { id: "4096", label: "4096" },
    ],
  },
  ec: {
    label: "ECDSA",
    paramLabel: "Curve",
    params: [
      { id: "P-256", label: "P-256", hash: "SHA-256", alg: "ES256", ssh: "nistp256" },
      { id: "P-384", label: "P-384", hash: "SHA-384", alg: "ES384", ssh: "nistp384" },
      { id: "P-521", label: "P-521", hash: "SHA-512", alg: "ES512", ssh: "nistp521" },
    ],
  },
  ed25519: {
    label: "Ed25519",
    paramLabel: "Curve",
    params: [{ id: "Ed25519", label: "Curve25519 (fixed)" }],
  },
  x25519: {
    label: "X25519",
    paramLabel: "Curve",
    params: [{ id: "X25519", label: "Curve25519 (fixed)" }],
  },
};

const state = {
  algo: "ec",
  param: { rsa: "3072", ec: "P-256", ed25519: "Ed25519", x25519: "X25519" },
  support: { ed25519: null, x25519: null },
  busy: false,
  token: 0,
  // The last generated key; kept so the SSH comment can change without
  // regenerating.
  key: null,
};

function toast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

function setStatus(message, kind) {
  statusBar.querySelector(".status-msg").textContent = message;
  statusBar.className = `status-bar${kind ? ` is-${kind}` : ""}`;
}

/* --- Pure helpers (also exercised by the tests) ---------------------------- */

const textEncoder = new TextEncoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toPem(label, der) {
  const body = bytesToBase64(new Uint8Array(der)).match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

// RFC 7638 §3.2: only the required members, in lexicographic order, with no
// whitespace. Building the string by hand keeps the order explicit instead of
// trusting JSON.stringify's insertion order.
const THUMBPRINT_MEMBERS = {
  RSA: ["e", "kty", "n"],
  EC: ["crv", "kty", "x", "y"],
  OKP: ["crv", "kty", "x"],
};

async function jwkThumbprint(jwk) {
  const members = THUMBPRINT_MEMBERS[jwk.kty];
  if (!members) throw new Error(`Unsupported JWK kty "${jwk.kty}"`);
  const canonical = `{${members.map((name) => {
    if (typeof jwk[name] !== "string") throw new Error(`JWK is missing "${name}"`);
    return `${JSON.stringify(name)}:${JSON.stringify(jwk[name])}`;
  }).join(",")}}`;
  return bytesToBase64Url(await sha256(textEncoder.encode(canonical)));
}

function concatBytes(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// RFC 4251 §5 "string": uint32 big-endian length, then the bytes.
function sshString(data) {
  const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

// RFC 4251 §5 "mpint": two's-complement big-endian, minimal length. Values
// here are positive, so strip leading zeros and add one back when the top bit
// is set, or the number would read as negative.
function sshMpint(unsigned) {
  let start = 0;
  while (start < unsigned.length && unsigned[start] === 0) start += 1;
  let bytes = unsigned.subarray(start);
  if (bytes.length && bytes[0] & 0x80) bytes = concatBytes([new Uint8Array([0]), bytes]);
  return sshString(bytes);
}

// Returns { type, blob } for an RSA / EC / Ed25519 public JWK, or null for
// keys OpenSSH has no public key type for (X25519).
function sshPublicBlob(jwk) {
  if (jwk.kty === "RSA") {
    const type = "ssh-rsa";
    return {
      type,
      blob: concatBytes([sshString(type), sshMpint(base64UrlToBytes(jwk.e)), sshMpint(base64UrlToBytes(jwk.n))]),
    };
  }
  if (jwk.kty === "EC") {
    const curve = { "P-256": "nistp256", "P-384": "nistp384", "P-521": "nistp521" }[jwk.crv];
    if (!curve) return null;
    const type = `ecdsa-sha2-${curve}`;
    // RFC 5656 §3.1: Q is the SEC1 uncompressed point, 0x04 || X || Y.
    const point = concatBytes([new Uint8Array([4]), base64UrlToBytes(jwk.x), base64UrlToBytes(jwk.y)]);
    return { type, blob: concatBytes([sshString(type), sshString(curve), sshString(point)]) };
  }
  if (jwk.kty === "OKP" && jwk.crv === "Ed25519") {
    const type = "ssh-ed25519";
    return { type, blob: concatBytes([sshString(type), sshString(base64UrlToBytes(jwk.x))]) };
  }
  return null;
}

function sshPublicLine(jwk, comment = "") {
  const ssh = sshPublicBlob(jwk);
  if (!ssh) return null;
  const tail = comment.trim().replace(/\s+/g, " ");
  return `${ssh.type} ${bytesToBase64(ssh.blob)}${tail ? ` ${tail}` : ""}`;
}

// Matches `ssh-keygen -lf`: SHA256 of the wire blob, Base64 without padding.
async function sshFingerprint(jwk) {
  const ssh = sshPublicBlob(jwk);
  if (!ssh) return null;
  return `SHA256:${bytesToBase64(await sha256(ssh.blob)).replace(/=+$/, "")}`;
}

async function spkiFingerprint(spkiDer) {
  return bytesToBase64(await sha256(new Uint8Array(spkiDer)));
}

function publicJwkOf(jwk) {
  const keep = { RSA: ["kty", "n", "e"], EC: ["kty", "crv", "x", "y"], OKP: ["kty", "crv", "x"] }[jwk.kty];
  return Object.fromEntries(keep.map((name) => [name, jwk[name]]));
}

// WebCrypto's generate parameters, and a short description, for one choice.
function keySpec(algo, param) {
  if (algo === "rsa") {
    return {
      generate: {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: Number(param),
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      usages: ["sign", "verify"],
      alg: "RS256",
      use: "sig",
      label: `RSA ${param}-bit`,
      size: `${param} bits, e = 65537`,
    };
  }
  if (algo === "ec") {
    const curve = ALGORITHMS.ec.params.find((p) => p.id === param);
    return {
      generate: { name: "ECDSA", namedCurve: param },
      usages: ["sign", "verify"],
      alg: curve.alg,
      use: "sig",
      label: `ECDSA ${param}`,
      size: `${param} (${curve.ssh}), ${curve.hash} for ${curve.alg}`,
    };
  }
  if (algo === "ed25519") {
    return { generate: { name: "Ed25519" }, usages: ["sign", "verify"], alg: "EdDSA", use: "sig", label: "Ed25519", size: "Curve25519, 256 bits" };
  }
  // X25519 has no JOSE alg of its own (ECDH-ES is a key-management mode), so
  // the JWK only says it is for encryption.
  return { generate: { name: "X25519" }, usages: ["deriveBits"], alg: null, use: "enc", label: "X25519", size: "Curve25519, 256 bits" };
}

async function generateKeyPair(algo, param, comment = "") {
  const spec = keySpec(algo, param);
  const started = performance.now();
  const pair = await crypto.subtle.generateKey(spec.generate, true, spec.usages);
  const elapsed = performance.now() - started;

  const [pkcs8, spki, rawJwk] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey),
    crypto.subtle.exportKey("spki", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);

  const kid = await jwkThumbprint(rawJwk);
  const meta = { kid, use: spec.use, ...(spec.alg ? { alg: spec.alg } : {}) };
  const publicJwk = { ...publicJwkOf(rawJwk), ...meta };
  // Private JWK: public members, then the private ones, then metadata —
  // dropping WebCrypto's key_ops/ext, which are browser bookkeeping.
  const privateJwk = { ...publicJwkOf(rawJwk) };
  for (const name of ["d", "p", "q", "dp", "dq", "qi"]) {
    if (rawJwk[name]) privateJwk[name] = rawJwk[name];
  }
  Object.assign(privateJwk, meta);

  return {
    algo,
    param,
    spec,
    elapsed,
    pkcs8Pem: toPem("PRIVATE KEY", pkcs8),
    spkiPem: toPem("PUBLIC KEY", spki),
    publicJwk,
    privateJwk,
    sshLine: sshPublicLine(publicJwk, comment),
    sshFingerprint: await sshFingerprint(publicJwk),
    spkiFingerprint: await spkiFingerprint(spki),
  };
}

// Algorithms outside the original WebCrypto set are probed by generating a
// throwaway key: `SubtleCrypto` offers no capability query.
async function detectSupport(name, usages) {
  try {
    await crypto.subtle.generateKey({ name }, true, usages);
    return true;
  } catch {
    return false;
  }
}

/* --- UI ------------------------------------------------------------------ */

function formatMs(ms) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function renderAlgo() {
  const config = ALGORITHMS[state.algo];
  algoSwitch.querySelectorAll("[data-algo]").forEach((button) => {
    const active = button.dataset.algo === state.algo;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    const supported = state.support[button.dataset.algo];
    button.disabled = supported === false;
    if (supported === false) button.title = `${ALGORITHMS[button.dataset.algo].label} is not supported by this browser`;
  });

  paramLabel.textContent = config.paramLabel;
  paramSwitch.replaceChildren(...config.params.map((param) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment-btn";
    button.dataset.param = param.id;
    button.textContent = param.label;
    const active = param.id === state.param[state.algo];
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    return button;
  }));

  commentInput.disabled = state.algo === "x25519";
  document.querySelector('[data-output="ssh"]').hidden = state.algo === "x25519";
}

function renderSupportNote() {
  const missing = ["ed25519", "x25519"].filter((id) => state.support[id] === false).map((id) => ALGORITHMS[id].label);
  supportNote.hidden = missing.length === 0;
  if (missing.length) {
    supportNote.textContent = `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not available in this browser's WebCrypto. Chrome 113+, Firefox 129+ and Safari 17+ support ${missing.length > 1 ? "them" : "it"}.`;
  }
}

function copyValue(label, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-value";
  button.dataset.copy = value;
  button.dataset.label = label;
  button.title = `Copy ${label.toLowerCase()}`;
  button.textContent = value;
  return button;
}

function renderKey() {
  const key = state.key;
  if (!key) {
    Object.values(outputs).forEach((el) => { el.value = ""; });
    summary.textContent = "";
    details.replaceChildren();
    return;
  }
  key.sshLine = sshPublicLine(key.publicJwk, commentInput.value);
  outputs.ssh.value = key.sshLine || "";
  outputs.spki.value = key.spkiPem;
  outputs.pkcs8.value = key.pkcs8Pem;
  outputs["jwk-public"].value = JSON.stringify(key.publicJwk, null, 2);
  outputs["jwk-private"].value = JSON.stringify(key.privateJwk, null, 2);
  document.querySelector('[data-output="ssh"]').hidden = !key.sshLine;
  // Size multi-line blocks to their content (an RSA 4096 PEM is ~52 lines,
  // so cap it) instead of hiding half a JWK behind a scrollbar.
  for (const el of [outputs.spki, outputs.pkcs8, outputs["jwk-public"], outputs["jwk-private"]]) {
    el.rows = Math.min(el.value.split("\n").length, 18);
  }

  summary.textContent = [key.spec.label, key.sshFingerprint, `kid ${key.publicJwk.kid}`].filter(Boolean).join(" · ");

  const rows = [
    ["Algorithm", key.spec.label],
    ["Size / curve", key.spec.size],
    ["JWK alg", key.publicJwk.alg || "none (key agreement)"],
    ["SSH fingerprint", key.sshFingerprint || "n/a — OpenSSH has no X25519 key type"],
    ["SPKI SHA-256", key.spkiFingerprint],
    ["JWK thumbprint", key.publicJwk.kid],
    ["Generated in", formatMs(key.elapsed)],
  ];
  const copyable = new Set(["SSH fingerprint", "SPKI SHA-256", "JWK thumbprint"]);
  details.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    if (copyable.has(term) && !(term === "SSH fingerprint" && !key.sshFingerprint)) dd.append(copyValue(term, value));
    else dd.textContent = value;
    return [dt, dd];
  }));
}

function setBusy(busy) {
  state.busy = busy;
  generateBtn.disabled = busy;
  generateBtn.classList.toggle("is-busy", busy);
  generateBtn.setAttribute("aria-busy", String(busy));
  generateBtn.textContent = busy ? "Generating…" : "Generate key pair";
}

async function generate() {
  if (state.busy) return;
  const algo = state.algo;
  const param = state.param[algo];
  if (state.support[algo] === false) {
    setStatus(`${ALGORITHMS[algo].label} is not supported by this browser`, "error");
    return;
  }
  const token = ++state.token;
  setBusy(true);
  setStatus(algo === "rsa" && Number(param) >= 4096 ? "Finding two 2048-bit primes — this can take a few seconds…" : "Generating…", "");
  try {
    const key = await generateKeyPair(algo, param, commentInput.value);
    if (token !== state.token) return;
    state.key = key;
    renderKey();
    setStatus(`${key.spec.label} key pair generated in ${formatMs(key.elapsed)}`, "success");
  } catch (error) {
    if (token !== state.token) return;
    setStatus(`Generation failed: ${error.message || error}`, "error");
  } finally {
    if (token === state.token) setBusy(false);
  }
}

const FILE_NAMES = {
  ed25519: "id_ed25519",
  ec: "id_ecdsa",
  rsa: "id_rsa",
  x25519: "x25519",
};

function fileFor(output) {
  const key = state.key;
  const base = FILE_NAMES[key.algo];
  return {
    ssh: [`${base}.pub`, "text/plain"],
    spki: [`${base}_public.pem`, "application/x-pem-file"],
    pkcs8: [`${base}_private.pem`, "application/x-pem-file"],
    "jwk-public": [`${base}_public.jwk.json`, "application/json"],
    "jwk-private": [`${base}_private.jwk.json`, "application/json"],
  }[output];
}

function outputText(output) {
  const value = outputs[output].value;
  // The SSH textarea wraps visually, but the file and clipboard get one line
  // with a trailing newline, the way ssh-keygen writes .pub files.
  if (output === "ssh") return value ? `${value}\n` : "";
  return value;
}

function download(output) {
  const text = outputText(output);
  if (!state.key || !text) {
    toast("Nothing to download", "error");
    return;
  }
  const [name, type] = fileFor(output);
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`${name} downloaded`, "success");
}

function copy(text, label) {
  if (!text) {
    toast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(text)
    .then(() => toast(`${label} copied`, "success"))
    .catch(() => toast("Copy failed", "error"));
}

document.addEventListener("click", (event) => {
  const value = event.target.closest(".copy-value");
  if (value) {
    copy(value.dataset.copy, value.dataset.label);
    return;
  }

  const algoButton = event.target.closest("[data-algo]");
  if (algoButton && !algoButton.disabled) {
    if (algoButton.dataset.algo === state.algo) return;
    state.algo = algoButton.dataset.algo;
    renderAlgo();
    return;
  }

  const paramButton = event.target.closest("[data-param]");
  if (paramButton) {
    state.param[state.algo] = paramButton.dataset.param;
    renderAlgo();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;
  const output = action.closest("[data-output]")?.dataset.output;
  if (action.dataset.action === "copy" && output) {
    copy(outputText(output), action.closest("[data-output]").querySelector(".field-label").textContent);
  } else if (action.dataset.action === "download" && output) {
    download(output);
  }
});

generateBtn.addEventListener("click", generate);

commentInput.addEventListener("input", () => {
  if (state.key) renderKey();
});

document.getElementById("helpBtn").addEventListener("click", () => {
  window.DevToolsMain.openModal("#helpModal");
});

(async function init() {
  renderAlgo();
  const [ed25519, x25519] = await Promise.all([
    detectSupport("Ed25519", ["sign", "verify"]),
    detectSupport("X25519", ["deriveBits"]),
  ]);
  state.support.ed25519 = ed25519;
  state.support.x25519 = x25519;
  // Ed25519 is what `ssh-keygen` defaults to, so it is the sample when the
  // browser can make one; P-256 is the widely supported fallback.
  state.algo = ed25519 ? "ed25519" : "ec";
  renderAlgo();
  renderSupportNote();
  await generate();
})();
