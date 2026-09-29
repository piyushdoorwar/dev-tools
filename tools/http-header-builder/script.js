// HTTP Header Builder — Basic, Bearer and API-key credentials turned into a
// header line plus curl / fetch / HTTPie snippets, all recomputed on input.
//
// Nothing is persisted: no storage, no network. Only the scheme goes in the
// hash, so a deep link never carries a credential.

"use strict";

const $ = (id) => document.getElementById(id);

const MODES = ["basic", "bearer", "api-key"];
const MODE_ALIASES = { api: "api-key", apikey: "api-key" };

// RFC 7230 §3.2.6 token: the only characters a header field name may use.
const TOKEN_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// RFC 6750 §2.1 b64token. Anything else is warned about, not refused.
const B64TOKEN_RE = /^[A-Za-z0-9\-._~+/]+=*$/;
const CONTROL_RE = /[\x00-\x1f\x7f]/;
// Header values may carry a horizontal tab; every other control is refused.
const VALUE_CONTROL_RE = /[\x00-\x08\x0a-\x1f\x7f]/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiJhbGFkZGluIiwibmFtZSI6IkFsYWRkaW4iLCJpYXQiOjE3NjcyMjU2MDAsImV4cCI6MTk1NjUyODAwMH0." +
  "HxuLeEqhYG4Hmv-j2b8vAELQfVsKUOwjdd6v3MrAcXg";

const SAMPLES = {
  basic: { username: "aladdin", password: "opensesame" },
  bearer: { token: SAMPLE_JWT },
  "api-key": { value: "demo-4f9a2c7e1b8d" },
};

const DEFAULT_NAME = { header: "X-API-Key", query: "api_key" };

const FORMATS = {
  curl: { file: "request.sh", type: "text/x-shellscript" },
  fetch: { file: "request.mjs", type: "text/javascript" },
  httpie: { file: "request-httpie.sh", type: "text/x-shellscript" },
};

const el = {
  username: $("username"),
  password: $("password"),
  token: $("token"),
  apiName: $("apiName"),
  apiNameLabel: $("apiNameLabel"),
  apiKey: $("apiKey"),
  apiQueryHint: $("apiQueryHint"),
  basicHint: $("basicHint"),
  tokenMessage: $("tokenMessage"),
  tokenJwt: $("tokenJwt"),
  method: $("method"),
  url: $("url"),
  urlError: $("urlError"),
  extra: $("extraHeaders"),
  extraErrors: $("extraErrors"),
  decodeInput: $("decodeInput"),
  decodeError: $("decodeError"),
  decodeResult: $("decodeResult"),
  decodeList: $("decodeList"),
  decodeEmpty: $("decodeEmpty"),
  decodeStatus: $("decodeStatus"),
  decodeCount: $("decodeCount"),
  headerRow: $("headerRow"),
  headerRowLabel: $("headerRowLabel"),
  headerLine: $("headerLine"),
  snippet: $("snippet"),
  status: $("outputStatus"),
  charCount: $("charCount"),
};

const state = {
  mode: "basic",
  placement: "header",
  format: "curl",
  // latest computed output, used by copy and download
  line: "",
  code: "",
  decoded: null,
};

const textEncoder = new TextEncoder();

function toast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

/* --- Encoding helpers ----------------------------------------------------- */

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function base64UrlToText(segment) {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  return decodeUtf8(base64ToBytes(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
}

// POSIX single quoting: close the quote, emit an escaped quote, reopen.
function shellQuote(text) {
  return "'" + text.replace(/'/g, "'\\''") + "'";
}

/* --- JWT sniffing --------------------------------------------------------- */

function jwtInfo(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]*$/.test(parts[2])) {
    return null;
  }
  try {
    const header = JSON.parse(base64UrlToText(parts[0]));
    const payload = JSON.parse(base64UrlToText(parts[1]));
    if (!header || typeof header !== "object" || typeof header.alg !== "string") return null;
    const exp = payload && typeof payload === "object" && Number.isFinite(payload.exp) ? payload.exp : null;
    return { alg: header.alg, exp };
  } catch {
    return null;
  }
}

function formatExpiry(exp) {
  const date = new Date(exp * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function renderJwtNote(target, info) {
  target.replaceChildren();
  target.hidden = !info;
  if (!info) return;
  const badge = document.createElement("span");
  badge.className = "badge info";
  badge.textContent = "JWT";
  const alg = document.createElement("span");
  alg.textContent = `alg ${info.alg}`;
  const parts = [badge, alg];
  const when = info.exp !== null ? formatExpiry(info.exp) : null;
  const exp = document.createElement("span");
  if (when) {
    const expired = info.exp * 1000 < Date.now();
    exp.textContent = expired ? `expired ${when}` : `expires ${when}`;
    if (expired) exp.className = "is-expired";
  } else {
    exp.textContent = "no exp claim";
  }
  parts.push(exp);
  parts.forEach((part, index) => {
    if (index > 1) target.append(document.createTextNode(" · "));
    else if (index === 1) target.append(document.createTextNode(" "));
    target.append(part);
  });
}

/* --- Field messages ------------------------------------------------------- */

function setFieldMessage(input, message, id, level = "error") {
  const target = $(id);
  target.textContent = message || "";
  target.hidden = !message;
  target.classList.toggle("is-warning", level === "warning");
  if (message && level === "error") input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

/* --- Credentials ---------------------------------------------------------- */

// Returns { header } or { query } on success, { error } on a refusal, or
// { empty } when a required value is simply not filled in yet.
function buildCredentials() {
  if (state.mode === "basic") return buildBasic();
  if (state.mode === "bearer") return buildBearer();
  return buildApiKey();
}

function buildBasic() {
  const user = el.username.value;
  const pass = el.password.value;
  let userError = "";
  if (CONTROL_RE.test(user)) userError = "The username cannot contain control characters.";
  else if (user.includes(":")) userError = "A username cannot contain a colon (RFC 7617).";
  const passError = CONTROL_RE.test(pass) ? "The password cannot contain control characters." : "";
  setFieldMessage(el.username, userError, "usernameError");
  setFieldMessage(el.password, passError, "passwordError");
  el.basicHint.hidden = Boolean(userError || passError) || !/[^\x00-\x7f]/.test(user + pass);
  if (userError || passError) return { error: userError || passError };

  const encoded = bytesToBase64(textEncoder.encode(`${user}:${pass}`));
  return {
    header: { name: "Authorization", value: `Basic ${encoded}` },
    label: "Basic · UTF-8",
  };
}

function buildBearer() {
  const token = el.token.value.trim();
  const info = token ? jwtInfo(token) : null;
  renderJwtNote(el.tokenJwt, info);
  if (!token) {
    setFieldMessage(el.token, "", "tokenMessage");
    return { empty: "Enter a bearer token" };
  }
  if (CONTROL_RE.test(token) || /\s/.test(token)) {
    el.tokenJwt.hidden = true;
    const message = "Tokens cannot contain whitespace or control characters.";
    setFieldMessage(el.token, message, "tokenMessage");
    return { error: message };
  }
  const warning = B64TOKEN_RE.test(token)
    ? ""
    : "Not an RFC 6750 b64token. It is sent as-is, but some servers reject it.";
  setFieldMessage(el.token, warning, "tokenMessage", "warning");
  return {
    header: { name: "Authorization", value: `Bearer ${token}` },
    label: info ? `Bearer · JWT ${info.alg}` : "Bearer",
    warning: warning && "not a b64token, sent as-is",
  };
}

function buildApiKey() {
  const name = el.apiName.value.trim();
  const value = el.apiKey.value;
  const isQuery = state.placement === "query";
  let nameError = "";
  if (!name) nameError = isQuery ? "Enter a parameter name." : "Enter a header name.";
  else if (isQuery ? CONTROL_RE.test(name) : !TOKEN_RE.test(name)) {
    nameError = isQuery
      ? "The parameter name cannot contain control characters."
      : "Not a valid header name. Use letters, digits and ! # $ % & ' * + - . ^ _ ` | ~ (RFC 7230 token).";
  }
  const valueError = VALUE_CONTROL_RE.test(value) ? "The value cannot contain control characters." : "";
  setFieldMessage(el.apiName, nameError, "apiNameError");
  setFieldMessage(el.apiKey, valueError, "apiKeyError");
  el.apiQueryHint.hidden = !isQuery;
  if (nameError || valueError) return { error: nameError || valueError };
  if (!value) return { empty: "Enter an API key value" };
  return isQuery
    ? { query: { name, value }, label: "API key · query parameter" }
    : { header: { name, value }, label: "API key · header" };
}

/* --- Request -------------------------------------------------------------- */

function parseUrl() {
  const raw = el.url.value.trim();
  let message = "";
  let url = null;
  if (!raw) message = "Enter a request URL.";
  else {
    try {
      url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol)) {
        message = "Use an http:// or https:// URL.";
        url = null;
      }
    } catch {
      message = "Not a valid absolute URL, for example https://api.example.com/v1/me";
    }
  }
  el.urlError.textContent = message;
  el.urlError.hidden = !message;
  if (message) el.url.setAttribute("aria-invalid", "true");
  else el.url.removeAttribute("aria-invalid");
  return { url, error: message };
}

// One `Name: value` per line. Invalid lines are reported and left out of the
// snippet rather than blanking it.
function parseExtraHeaders(authName) {
  const headers = [];
  const problems = [];
  el.extra.value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    const number = index + 1;
    if (!line) return;
    const colon = line.indexOf(":");
    if (colon < 0) {
      problems.push({ level: "error", text: `Line ${number}: expected Name: value` });
      return;
    }
    const name = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    if (!TOKEN_RE.test(name)) {
      problems.push({ level: "error", text: `Line ${number}: “${name}” is not a valid header name (RFC 7230 token)` });
      return;
    }
    if (VALUE_CONTROL_RE.test(value)) {
      problems.push({ level: "error", text: `Line ${number}: the value contains control characters` });
      return;
    }
    if (authName && name.toLowerCase() === authName.toLowerCase()) {
      problems.push({ level: "warning", text: `Line ${number}: ${name} is already set by the credentials, so it is skipped` });
      return;
    }
    headers.push({ name, value });
  });

  el.extraErrors.replaceChildren(...problems.map((problem) => {
    const item = document.createElement("li");
    item.textContent = problem.text;
    if (problem.level === "warning") item.className = "is-warning";
    return item;
  }));
  el.extraErrors.hidden = problems.length === 0;
  if (problems.some((problem) => problem.level === "error")) el.extra.setAttribute("aria-invalid", "true");
  else el.extra.removeAttribute("aria-invalid");
  return { headers, problems };
}

/* --- Snippets ------------------------------------------------------------- */

function joinContinued(first, rest) {
  return [first, ...rest].join(" \\\n  ");
}

const SNIPPETS = {
  curl(method, url, headers) {
    const flag = method === "HEAD" ? "--head" : method === "GET" ? "" : `--request ${method}`;
    // curl drops a header given as `Name:`; `Name;` is how it sends an empty one.
    const items = headers.map(({ name, value }) =>
      `--header ${shellQuote(value === "" ? `${name};` : `${name}: ${value}`)}`);
    const urlPart = `--url ${shellQuote(url)}`;
    return flag
      ? joinContinued(`curl ${flag}`, [urlPart, ...items])
      : joinContinued(`curl ${urlPart}`, items);
  },

  fetch(method, url, headers) {
    const options = [];
    if (method !== "GET") options.push(`  method: ${JSON.stringify(method)},`);
    if (headers.length) {
      options.push("  headers: {");
      headers.forEach(({ name, value }) => options.push(`    ${JSON.stringify(name)}: ${JSON.stringify(value)},`));
      options.push("  },");
    }
    const call = options.length
      ? `fetch(${JSON.stringify(url)}, {\n${options.join("\n")}\n})`
      : `fetch(${JSON.stringify(url)})`;
    return `const response = await ${call};`;
  },

  httpie(method, url, headers) {
    // HTTPie unsets a header given as `Name:`; `Name;` sends it empty.
    const items = headers.map(({ name, value }) => shellQuote(value === "" ? `${name};` : `${name}:${value}`));
    return joinContinued(`http ${method} ${shellQuote(url)}`, items);
  },
};

const HIGHLIGHT = {
  shell: /('[^']*'(?:\\''[^']*')*)|(^(?:curl|http)\b)|((?<=\s)--?[A-Za-z][\w-]*)|(\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\b)|(\\$)/gm,
  js: /("(?:[^"\\\n]|\\.)*")|(\b(?:const|await)\b)|(\bfetch\b)|(\b(?:method|headers)\b(?=:))/g,
};
const SHELL_CLASSES = ["tok-str", "tok-cmd", "tok-flag", "tok-method", "tok-muted"];
const JS_CLASSES = ["tok-str", "tok-kw", "tok-cmd", "tok-flag"];

// Colour the snippet with spans built from text nodes; nothing is parsed as markup.
function paintSnippet(code) {
  const pattern = state.format === "fetch" ? HIGHLIGHT.js : HIGHLIGHT.shell;
  const classes = state.format === "fetch" ? JS_CLASSES : SHELL_CLASSES;
  const fragment = document.createDocumentFragment();
  let last = 0;
  pattern.lastIndex = 0;
  for (const match of code.matchAll(pattern)) {
    if (match.index > last) fragment.append(code.slice(last, match.index));
    const group = match.slice(1).findIndex((part) => part !== undefined);
    const span = document.createElement("span");
    span.className = classes[group] || "";
    span.textContent = match[0];
    fragment.append(span);
    last = match.index + match[0].length;
  }
  if (last < code.length) fragment.append(code.slice(last));
  el.snippet.replaceChildren(fragment);
}

/* --- Render --------------------------------------------------------------- */

function setStatus(message, type = "") {
  el.status.textContent = message;
  el.status.className = `status-text ${type}`.trim();
}

function render() {
  const credentials = buildCredentials();
  const request = parseUrl();
  const authName = credentials.header?.name || (state.mode === "api-key" && state.placement === "header"
    ? el.apiName.value.trim() : "Authorization");
  const extra = parseExtraHeaders(state.mode === "api-key" && state.placement === "query" ? "" : authName);

  // Header line — follows the visible mode only.
  let line = "";
  if (credentials.header) line = `${credentials.header.name}: ${credentials.header.value}`;
  else if (credentials.query) {
    line = `?${new URLSearchParams([[credentials.query.name, credentials.query.value]])}`;
  }
  const isQuery = state.mode === "api-key" && state.placement === "query";
  el.headerRowLabel.textContent = isQuery ? "Query" : "Header";
  el.headerLine.textContent = line || "—";
  el.headerRow.classList.toggle("is-empty", !line);
  el.headerRow.classList.toggle("is-invalid", Boolean(credentials.error));
  state.line = line;

  // Snippet
  let code = "";
  let placeholder = "";
  if (credentials.error) placeholder = "Fix the credentials to build a snippet.";
  else if (credentials.empty) placeholder = `${credentials.empty} to build a snippet.`;
  else if (!request.url) placeholder = "Enter a valid http(s) URL to build a snippet.";
  else {
    const url = new URL(request.url.href);
    if (credentials.query) url.searchParams.set(credentials.query.name, credentials.query.value);
    const headers = credentials.header ? [credentials.header, ...extra.headers] : extra.headers;
    code = SNIPPETS[state.format](el.method.value, url.href, headers);
  }
  state.code = code;
  el.snippet.classList.toggle("is-empty", !code);
  if (code) paintSnippet(code);
  else el.snippet.textContent = placeholder;

  // Status bar
  const skipped = extra.problems.length;
  if (credentials.error) setStatus(credentials.error, "error");
  else if (credentials.empty) setStatus(credentials.empty);
  else if (request.error) setStatus(request.error, "error");
  else if (credentials.warning) setStatus(`${credentials.label} · ${credentials.warning}`, "warning");
  else if (skipped) {
    setStatus(`${credentials.label} · ${skipped} extra header line${skipped === 1 ? "" : "s"} skipped`, "warning");
  } else setStatus(credentials.label, "success");
  el.charCount.textContent = `${line.length} ${line.length === 1 ? "char" : "chars"}`;
}

/* --- Decode --------------------------------------------------------------- */

function decodeHeader(text) {
  const input = text.trim();
  if (!input) return null;

  // A non-Authorization header, such as `X-API-Key: …`, decodes as an API key.
  const named = input.match(/^([!#$%&'*+.^_`|~0-9A-Za-z-]+)[ \t]*:[ \t]*([\s\S]*)$/);
  if (named && named[1].toLowerCase() !== "authorization") {
    if (VALUE_CONTROL_RE.test(named[2])) return { error: "The header value contains control characters." };
    return { scheme: "api-key", name: named[1], value: named[2].trim() };
  }

  const match = input.match(/^(?:authorization[ \t]*:[ \t]*)?(\S+)(?:[ \t]+([\s\S]*))?$/i);
  if (!match) return { error: "Paste a header such as Authorization: Basic YWxhZGRpbjpvcGVuc2VzYW1l" };
  const scheme = match[1].toLowerCase();
  const credentials = (match[2] || "").trim();

  if (scheme === "basic") {
    if (!BASE64_RE.test(credentials)) return { error: "Basic credentials must be valid Base64." };
    let decoded;
    try {
      decoded = decodeUtf8(base64ToBytes(credentials));
    } catch {
      return { error: "Invalid Base64 or UTF-8 credentials." };
    }
    const colon = decoded.indexOf(":");
    if (colon < 0) return { error: "Decoded credentials must contain a colon (username:password)." };
    if (CONTROL_RE.test(decoded)) return { error: "Decoded credentials contain control characters." };
    return { scheme: "basic", username: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  }

  if (scheme === "bearer") {
    if (!credentials) return { error: "The Bearer header has no token." };
    if (CONTROL_RE.test(credentials) || /\s/.test(credentials)) {
      return { error: "Tokens cannot contain whitespace or control characters." };
    }
    return { scheme: "bearer", token: credentials, jwt: jwtInfo(credentials) };
  }

  return { error: `“${match[1]}” is not supported here. Paste a Basic or Bearer header.` };
}

const DECODED_LABEL = { basic: "Basic", bearer: "Bearer", "api-key": "API key" };
const SAMPLE_DECODE = "Authorization: Basic YWxhZGRpbjpvcGVuc2VzYW1l";

function addRow(term, value, { mono = true, node = null } = {}) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (node) dd.append(node);
  else {
    dd.textContent = value === "" ? "(empty)" : value;
    if (value === "") dd.classList.add("is-empty");
  }
  if (mono) dd.classList.add("mono");
  el.decodeList.append(dt, dd);
}

function renderDecode() {
  const result = decodeHeader(el.decodeInput.value);
  state.decoded = result && !result.error ? result : null;
  el.decodeError.textContent = result?.error || "";
  el.decodeError.hidden = !result?.error;
  if (result?.error) el.decodeInput.setAttribute("aria-invalid", "true");
  else el.decodeInput.removeAttribute("aria-invalid");

  el.decodeList.replaceChildren();
  el.decodeResult.hidden = !state.decoded;
  el.decodeEmpty.hidden = Boolean(result);
  const length = el.decodeInput.value.trim().length;
  el.decodeCount.textContent = `${length} ${length === 1 ? "char" : "chars"}`;
  el.decodeStatus.className = "status-text";
  if (!result) el.decodeStatus.textContent = "Waiting for a header";
  else if (result.error) {
    el.decodeStatus.textContent = "Could not decode";
    el.decodeStatus.classList.add("error");
  } else {
    el.decodeStatus.textContent = `${DECODED_LABEL[result.scheme]} · decoded`;
    el.decodeStatus.classList.add("success");
  }
  if (!state.decoded) return;

  const decoded = state.decoded;
  if (decoded.scheme === "basic") {
    addRow("Scheme", "Basic", { mono: false });
    addRow("Username", decoded.username);
    addRow("Password", decoded.password);
  } else if (decoded.scheme === "bearer") {
    addRow("Scheme", "Bearer", { mono: false });
    addRow("Token", decoded.token);
    if (decoded.jwt) {
      const note = document.createElement("span");
      note.className = "jwt-note";
      renderJwtNote(note, decoded.jwt);
      note.hidden = false;
      addRow("JWT", "", { mono: false, node: note });
    }
  } else {
    addRow("Header", decoded.name);
    addRow("Value", decoded.value);
  }
}

function loadDecoded() {
  const decoded = state.decoded;
  if (!decoded) return;
  if (decoded.scheme === "basic") {
    el.username.value = decoded.username;
    el.password.value = decoded.password;
  } else if (decoded.scheme === "bearer") {
    el.token.value = decoded.token;
  } else {
    setPlacement("header");
    el.apiName.value = decoded.name;
    el.apiKey.value = decoded.value;
  }
  setMode(decoded.scheme);
  render();
  toast("Loaded into the form", "success");
}

/* --- Modes, placement, format -------------------------------------------- */

const modeTabs = [...document.querySelectorAll(".mode-btn[data-mode]")];

function normalizeMode(value) {
  const mode = MODE_ALIASES[value] || value;
  return MODES.includes(mode) ? mode : "basic";
}

function setMode(mode, { updateHash = true } = {}) {
  state.mode = normalizeMode(mode);
  modeTabs.forEach((tab) => {
    const selected = tab.dataset.mode === state.mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll("[data-for-mode]").forEach((panel) => {
    panel.hidden = panel.dataset.forMode !== state.mode;
  });
  if (updateHash) window.DevToolsMain.writeHashState(state.mode);
}

function setPressed(group, button) {
  group.querySelectorAll(".segment-btn").forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle("active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
}

function setPlacement(placement) {
  const previous = state.placement;
  state.placement = placement;
  const group = $("placementSwitch");
  setPressed(group, group.querySelector(`[data-placement="${placement}"]`));
  el.apiNameLabel.textContent = placement === "query" ? "Parameter name" : "Header name";
  // Swap the default name along with the placement, but never a custom one.
  if (previous !== placement && el.apiName.value.trim() === DEFAULT_NAME[previous]) {
    el.apiName.value = DEFAULT_NAME[placement];
  }
}

/* --- Actions -------------------------------------------------------------- */

function copyValue(value, label) {
  if (!value) {
    toast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => toast(`${label} copied`, "success"))
    .catch(() => toast("Copy failed", "error"));
}

function fillSample(mode) {
  if (mode === "basic") {
    el.username.value = SAMPLES.basic.username;
    el.password.value = SAMPLES.basic.password;
  } else if (mode === "bearer") {
    el.token.value = SAMPLES.bearer.token;
  } else {
    el.apiName.value = DEFAULT_NAME[state.placement];
    el.apiKey.value = SAMPLES["api-key"].value;
  }
}

const ACTIONS = {
  sample() {
    fillSample(state.mode);
    render();
    toast("Loaded sample credentials", "success");
  },
  clear() {
    const first = { basic: el.username, bearer: el.token, "api-key": el.apiKey }[state.mode];
    if (state.mode === "basic") el.password.value = "";
    first.value = "";
    render();
    first.focus();
  },
  "sample-decode"() {
    el.decodeInput.value = SAMPLE_DECODE;
    renderDecode();
  },
  "paste-decode"() {
    navigator.clipboard.readText()
      .then((text) => {
        if (!text) {
          toast("Clipboard is empty", "error");
          return;
        }
        el.decodeInput.value = text;
        renderDecode();
      })
      .catch(() => toast("Paste failed", "error"));
  },
  "clear-decode"() {
    el.decodeInput.value = "";
    renderDecode();
    el.decodeInput.focus();
  },
  "load-decoded": loadDecoded,
  "copy-header"() {
    copyValue(state.line, state.mode === "api-key" && state.placement === "query" ? "Query string" : "Header");
  },
  "copy-snippet"() {
    copyValue(state.code, "Snippet");
  },
  "download-snippet"() {
    if (!state.code) {
      toast("Nothing to download", "error");
      return;
    }
    const { file, type } = FORMATS[state.format];
    window.DevToolsMain.downloadText(file, `${state.code}\n`, type);
    toast(`Downloaded ${file}`, "success");
  },
};

/* --- Wiring --------------------------------------------------------------- */

[el.username, el.password, el.token, el.apiName, el.apiKey, el.url, el.extra].forEach((input) => {
  input.addEventListener("input", render);
});
el.method.addEventListener("change", render);
el.decodeInput.addEventListener("input", renderDecode);

modeTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.mode === state.mode) return;
    setMode(tab.dataset.mode);
    render();
  });
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % modeTabs.length;
    else if (event.key === "ArrowLeft") next = (index + modeTabs.length - 1) % modeTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = modeTabs.length - 1;
    else return;
    event.preventDefault();
    setMode(modeTabs[next].dataset.mode);
    modeTabs[next].focus();
    render();
  });
});

document.querySelectorAll("#placementSwitch [data-placement]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.placement === state.placement) return;
    setPlacement(button.dataset.placement);
    render();
  });
});

document.querySelectorAll("#formatSwitch [data-format]").forEach((button) => {
  button.addEventListener("click", () => {
    state.format = button.dataset.format;
    setPressed(button.parentElement, button);
    render();
  });
});

document.querySelectorAll("[data-reveal]").forEach((button) => {
  const input = $(button.dataset.reveal);
  const noun = button.getAttribute("aria-label").replace(/^Show /, "");
  button.addEventListener("click", () => {
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    const label = `${reveal ? "Hide" : "Show"} ${noun}`;
    button.setAttribute("aria-pressed", String(reveal));
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    button.classList.toggle("is-revealed", reveal);
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) ACTIONS[button.dataset.action]?.(button);
});

$("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState((value) => {
  setMode(value, { updateHash: false });
  render();
});

// Seed every mode so the tool is populated on arrival and on each tab.
MODES.forEach(fillSample);
setMode(window.DevToolsMain.readHashState(), { updateHash: false });
render();
renderDecode();
