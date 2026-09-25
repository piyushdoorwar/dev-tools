// URL Parser — split a URL into its components, edit any of them or the query
// parameters in a table, and get the rebuilt URL back.
//
// The URL text is split with the RFC 3986 appendix B pattern rather than the
// WHATWG `URL` class, because `URL` normalises: it lower-cases the host, drops
// default ports, resolves dot segments and re-encodes the query. A tool whose
// job is to show you what a URL contains must not quietly change it, so
// buildUrl(parseUrl(text)) returns `text` exactly. `URL` is still used, but
// only to report what a browser would make of it.
//
// Query parameters keep their raw (encoded) form next to the decoded one.
// Serialising writes the raw form, so a parameter nobody touched keeps the
// encoding it arrived with; editing a key or value re-encodes just that field.

const urlInput = document.getElementById("url-input");
const breakdown = document.getElementById("breakdown");
const statusBar = document.getElementById("status");
const details = document.getElementById("details");
const paramsBody = document.getElementById("params-body");
const paramsTable = document.getElementById("params-table");
const paramsEmpty = document.getElementById("params-empty");
const paramsMeta = document.getElementById("params-meta");
const plusSpaces = document.getElementById("plus-spaces");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const partInputs = Object.fromEntries(
  [...document.querySelectorAll("[data-part]")].map((el) => [el.dataset.part, el])
);

const SAMPLE_URL =
  "https://ada:s3cr%40t@api.example.com:8443/v2/search/caf%C3%A9?q=hello+world&tag=js&tag=css" +
  "&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&page=2&debug#results";

const DEFAULT_PORTS = { "http": "80", "https": "443", "ws": "80", "wss": "443", "ftp": "21" };
// Past this, some servers, proxies and CDNs start rejecting requests.
const LONG_URL = 2048;

const state = {
  parts: emptyParts(),
  params: [],
  // `example.com/x` has no scheme; it is parsed as https and marked assumed.
  assumed: false,
  // `a=1&b=2` is a bare query string and is rebuilt without the leading `?`.
  bare: false,
};

/* --- Parsing -------------------------------------------------------------- */

// RFC 3986 appendix B, with the scheme tightened to its legal characters so
// that `a:b=1` style text isn't mistaken for one.
const URI_PATTERN = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([\s\S]*))?$/;

function emptyParts() {
  return { scheme: null, authority: null, path: "", query: null, fragment: null };
}

// null means "absent", "" means "present but empty": `http://host:/` and
// `http://host/` differ, and rebuilding must preserve which one it was.
function parseAuthority(text) {
  const authority = { user: null, pass: null, host: text, port: null };
  const at = text.lastIndexOf("@");
  if (at >= 0) {
    const info = text.slice(0, at);
    authority.host = text.slice(at + 1);
    const colon = info.indexOf(":");
    authority.user = colon >= 0 ? info.slice(0, colon) : info;
    authority.pass = colon >= 0 ? info.slice(colon + 1) : null;
  }
  const hostPort = authority.host;
  const ipv6 = /^(\[[^\]]*\])(?::(.*))?$/.exec(hostPort);
  if (ipv6) {
    authority.host = ipv6[1];
    authority.port = ipv6[2] ?? null;
  } else {
    const colon = hostPort.lastIndexOf(":");
    if (colon >= 0) {
      authority.host = hostPort.slice(0, colon);
      authority.port = hostPort.slice(colon + 1);
    }
  }
  return authority;
}

function parseUrl(text) {
  const match = URI_PATTERN.exec(text);
  const [, scheme, authority, path, query, fragment] = match;
  return {
    scheme: scheme ?? null,
    authority: authority === undefined ? null : parseAuthority(authority),
    path,
    query: query ?? null,
    fragment: fragment ?? null,
  };
}

// With an authority, a path that doesn't start with "/" would run into the
// host. Parsing can never produce that; editing the path field can.
function effectivePath({ authority, path }) {
  return authority && path && !path.startsWith("/") ? `/${path}` : path;
}

function buildUrl(parts) {
  let text = "";
  if (parts.scheme !== null) text += `${parts.scheme}:`;
  const a = parts.authority;
  if (a) {
    text += "//";
    if (a.user !== null) text += `${a.user}${a.pass !== null ? `:${a.pass}` : ""}@`;
    text += a.host;
    if (a.port !== null) text += `:${a.port}`;
  }
  text += effectivePath(parts);
  if (parts.query !== null) text += `?${parts.query}`;
  if (parts.fragment !== null) text += `#${parts.fragment}`;
  return text;
}

// Decides how to read the text before splitting it. Without these rules
// `localhost:3000` has the scheme "localhost" and `example.com/x` is a
// relative path, which is correct per RFC 3986 and never what anyone means.
function classify(text) {
  if (/^[^/:?#]*=/.test(text)) return "bare";
  // `localhost:3000`, `api.local:8080/x` — but not `tel:5551234`.
  if (/^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d+(?:[/?#]|$)/i.test(text)) return "assumed";
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text)) return "absolute";
  if (/^[^\s/?#:]+\.[^\s/?#:.]+(?:[:/?#]|$)/.test(text)) return "assumed";
  return "relative";
}

function readText(text) {
  const kind = classify(text);
  if (kind === "bare") {
    const hash = text.indexOf("#");
    return {
      kind,
      parts: {
        ...emptyParts(),
        query: hash >= 0 ? text.slice(0, hash) : text,
        fragment: hash >= 0 ? text.slice(hash + 1) : null,
      },
    };
  }
  return { kind, parts: parseUrl(kind === "assumed" ? `https://${text}` : text) };
}

function currentText() {
  if (state.bare) {
    const { query, fragment } = state.parts;
    return `${query ?? ""}${fragment !== null ? `#${fragment}` : ""}`;
  }
  return buildUrl(state.parts);
}

/* --- Query parameters ----------------------------------------------------- */

function decodeComponent(raw, plus) {
  try {
    return { text: decodeURIComponent(plus ? raw.replace(/\+/g, " ") : raw), bad: false };
  } catch {
    // A stray "%" (`100%`) or a truncated UTF-8 sequence. Show it as-is.
    return { text: raw, bad: true };
  }
}

function encodeComponent(text, plus) {
  const encoded = encodeURIComponent(text);
  return plus ? encoded.replace(/%20/g, "+") : encoded;
}

function decodeParam(param, plus) {
  const key = decodeComponent(param.rawKey, plus);
  const value = decodeComponent(param.rawValue, plus);
  param.key = key.text;
  param.value = value.text;
  param.bad = key.bad || value.bad;
  return param;
}

function parseQuery(query, plus) {
  if (!query) return [];
  return query.split("&").filter(Boolean).map((piece) => {
    const eq = piece.indexOf("=");
    return decodeParam({
      rawKey: eq >= 0 ? piece.slice(0, eq) : piece,
      rawValue: eq >= 0 ? piece.slice(eq + 1) : "",
      // `?debug` and `?debug=` mean different things to some servers.
      hasEq: eq >= 0,
      enabled: true,
    }, plus);
  });
}

function serializeQuery(params) {
  const pieces = params
    .filter((p) => p.enabled && (p.rawKey || p.rawValue))
    .map((p) => (p.hasEq || p.rawValue ? `${p.rawKey}=${p.rawValue}` : p.rawKey));
  return pieces.length ? pieces.join("&") : null;
}

// Repeated keys become arrays rather than the last one silently winning.
function paramsToObject(params) {
  const out = {};
  for (const { key, value, enabled } of params) {
    if (!enabled || (!key && !value)) continue;
    if (!Object.hasOwn(out, key)) out[key] = value;
    else if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = [out[key], value];
  }
  return out;
}

/* --- Analysis ------------------------------------------------------------- */

function browserView(text) {
  try {
    return { url: new URL(text), error: null };
  } catch (error) {
    return { url: null, error };
  }
}

function safeDecode(text) {
  try {
    return decodeURI(text);
  } catch {
    return text;
  }
}

function plural(count, word) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

function describeParams(params) {
  const counts = new Map();
  for (const p of params) if (p.enabled) counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
  const repeated = [...counts.values()].filter((n) => n > 1).length;
  const excluded = params.filter((p) => !p.enabled).length;
  return { repeated, excluded, keys: counts };
}

/* --- Rendering ------------------------------------------------------------ */

function setStatus(message, type = "") {
  statusBar.className = `status-bar${type ? ` is-${type}` : ""}`;
  statusBar.firstElementChild.textContent = message;
}

function span(text, className) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

function renderBreakdown() {
  breakdown.replaceChildren();
  const { parts } = state;
  const nodes = [];
  if (!state.bare) {
    if (parts.scheme !== null) {
      nodes.push(span(`${parts.scheme}:`, `seg seg-scheme${state.assumed ? " is-assumed" : ""}`));
    }
    const a = parts.authority;
    if (a) {
      nodes.push(span("//", `seg seg-punct${state.assumed ? " is-assumed" : ""}`));
      if (a.user !== null) {
        nodes.push(span(a.user, "seg seg-user"));
        if (a.pass !== null) nodes.push(span(":", "seg seg-punct"), span(a.pass, "seg seg-pass"));
        nodes.push(span("@", "seg seg-punct"));
      }
      nodes.push(span(a.host, "seg seg-host"));
      if (a.port !== null) nodes.push(span(":", "seg seg-punct"), span(a.port, "seg seg-port"));
    }
    nodes.push(span(effectivePath(parts), "seg seg-path"));
  }
  if (parts.query !== null) {
    if (!state.bare) nodes.push(span("?", "seg seg-punct"));
    parts.query.split("&").forEach((piece, index) => {
      if (index) nodes.push(span("&", "seg seg-punct"));
      const eq = piece.indexOf("=");
      if (eq < 0) {
        nodes.push(span(piece, "seg seg-key"));
      } else {
        nodes.push(span(piece.slice(0, eq), "seg seg-key"), span("=", "seg seg-punct"), span(piece.slice(eq + 1), "seg seg-value"));
      }
    });
  }
  if (parts.fragment !== null) nodes.push(span("#", "seg seg-punct"), span(parts.fragment, "seg seg-fragment"));
  // An empty input still yields an (empty) path node, so hide on what is
  // actually shown — otherwise a blank dashed box sat under an empty field.
  const shown = nodes.filter((n) => n.textContent);
  breakdown.append(...shown);
  breakdown.hidden = !shown.length;
}

// `skip` is the field being typed into: normalising it mid-keystroke (say,
// stripping the ":" off "https:") would fight the cursor.
function renderParts(skip = null) {
  const { parts } = state;
  const a = parts.authority;
  const values = {
    scheme: parts.scheme ?? "",
    user: a?.user ?? "",
    pass: a?.pass ?? "",
    host: a?.host ?? "",
    port: a?.port ?? "",
    path: parts.path,
    fragment: parts.fragment ?? "",
  };
  for (const [name, el] of Object.entries(partInputs)) {
    if (name !== skip && el.value !== values[name]) el.value = values[name];
  }
  // The authority fields mean nothing to a bare query string.
  for (const name of ["scheme", "user", "pass", "host", "port", "path"]) {
    partInputs[name].disabled = state.bare;
  }
}

function addDetail(term, value, { code = true, className = "" } = {}) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  if (className) dd.className = className;
  if (value instanceof Node) dd.append(value);
  else if (code) dd.append(span(value, "detail-code"));
  else dd.textContent = value;
  details.append(dt, dd);
}

function renderDetails(text, view) {
  details.replaceChildren();
  if (!text) return;
  const { parts } = state;
  const kind = state.bare ? "Query string" : parts.scheme !== null ? "Absolute URL" : "Relative reference";
  addDetail("Type", kind, { code: false });

  const url = view.url;
  if (url && url.origin && url.origin !== "null") addDetail("Origin", url.origin);

  const host = parts.authority?.host;
  // Punycode for international names, compressed form for IPv6.
  if (url && host && url.hostname !== host.toLowerCase()) {
    addDetail("Host as sent", url.hostname);
  }

  const port = parts.authority?.port;
  const scheme = parts.scheme?.toLowerCase();
  if (port && DEFAULT_PORTS[scheme] === port) {
    addDetail("Port", `${port} is the default for ${scheme} and can be omitted`, { code: false, className: "is-note" });
  } else if (!port && DEFAULT_PORTS[scheme]) {
    addDetail("Effective port", DEFAULT_PORTS[scheme]);
  }

  if (!state.bare && parts.path) {
    const segments = parts.path.split("/").filter(Boolean);
    if (segments.length) {
      const list = document.createElement("span");
      list.className = "segments";
      segments.forEach((segment) => list.append(span(decodeComponent(segment, false).text, "segment")));
      addDetail("Path segments", list);
    }
    const decoded = safeDecode(parts.path);
    if (decoded !== parts.path) addDetail("Decoded path", decoded);
  }

  if (parts.fragment) {
    const decoded = decodeComponent(parts.fragment, false).text;
    if (decoded !== parts.fragment) addDetail("Decoded fragment", decoded);
  }

  if (url && url.href !== text) {
    const wrap = document.createElement("span");
    wrap.className = "normalized";
    wrap.append(span(url.href, "detail-code"));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-btn";
    button.dataset.action = "copy-normalized";
    button.dataset.tooltip = "Copy normalized";
    button.setAttribute("aria-label", "Copy normalized URL");
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
    wrap.append(button);
    addDetail("Normalized", wrap);
  }

  addDetail("Length", plural(text.length, "character"), { code: false, className: text.length > LONG_URL ? "is-note" : "" });
}

function createRow(param, index) {
  const tr = document.createElement("tr");
  tr.dataset.index = String(index);
  if (!param.enabled) tr.classList.add("is-excluded");

  const on = document.createElement("td");
  on.className = "col-on";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = param.enabled;
  checkbox.dataset.field = "enabled";
  checkbox.setAttribute("aria-label", "Include in URL");
  on.append(checkbox);

  const cells = ["key", "value"].map((field) => {
    const td = document.createElement("td");
    const el = document.createElement("input");
    el.type = "text";
    el.value = param[field];
    el.dataset.field = field;
    el.spellcheck = false;
    el.autocomplete = "off";
    el.placeholder = field === "key" ? "key" : "value";
    el.setAttribute("aria-label", field === "key" ? `Key ${index + 1}` : `Value ${index + 1}`);
    td.append(el);
    return td;
  });

  const del = document.createElement("td");
  del.className = "col-del";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "action-btn";
  button.dataset.field = "remove";
  button.setAttribute("aria-label", `Remove parameter ${index + 1}`);
  button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-close"></use></svg>';
  del.append(button);

  tr.append(on, ...cells, del);
  return tr;
}

// Flags live on existing rows so typing into a cell never rebuilds the table
// under the cursor.
function refreshRowFlags() {
  const { keys } = describeParams(state.params);
  [...paramsBody.rows].forEach((tr, index) => {
    const param = state.params[index];
    if (!param) return;
    tr.classList.toggle("is-excluded", !param.enabled);
    const [keyInput, valueInput] = tr.querySelectorAll("input[type='text']");
    const repeated = param.enabled && param.key && keys.get(param.key) > 1;
    keyInput.classList.toggle("is-repeated", Boolean(repeated));
    keyInput.title = repeated ? "This key appears more than once" : "";
    const invalid = param.bad ? "true" : "false";
    keyInput.setAttribute("aria-invalid", invalid);
    valueInput.setAttribute("aria-invalid", invalid);
    valueInput.title = param.bad ? "Malformed percent-encoding — shown as written" : "";
  });
}

function renderParamsMeta() {
  const { repeated, excluded } = describeParams(state.params);
  const count = state.params.filter((p) => p.enabled).length;
  const parts = [plural(count, "parameter")];
  if (repeated) parts.push(`${plural(repeated, "repeated key")}`);
  if (excluded) parts.push(`${excluded.toLocaleString()} excluded`);
  paramsMeta.textContent = state.params.length ? parts.join(" · ") : "";
}

function renderParams() {
  paramsBody.replaceChildren(...state.params.map(createRow));
  paramsTable.hidden = !state.params.length;
  paramsEmpty.hidden = Boolean(state.params.length);
  refreshRowFlags();
  renderParamsMeta();
}

function renderStatus(text, view) {
  if (!text) {
    setStatus("Ready");
    return;
  }
  const count = state.params.filter((p) => p.enabled).length;
  const summary = `${plural(count, "parameter")} · ${plural(text.length, "character")}`;
  if (/\s/.test(text)) {
    setStatus(`Contains whitespace, which must be percent-encoded · ${summary}`, "warning");
  } else if (state.bare) {
    setStatus(`Query string · ${summary}`, "success");
  } else if (state.parts.scheme === null) {
    let valid = true;
    try { new URL(text, "https://base.invalid/"); } catch { valid = false; }
    setStatus(valid ? `Relative reference · ${summary}` : `Invalid relative reference · ${summary}`, valid ? "success" : "error");
  } else if (view.error) {
    setStatus(`Browsers would reject this URL · ${summary}`, "error");
  } else if (state.assumed) {
    setStatus(`No scheme — read as https:// · ${summary}`, "warning");
  } else if (text.length > LONG_URL) {
    setStatus(`Over ${LONG_URL.toLocaleString()} characters; some servers and proxies will refuse it · ${summary}`, "warning");
  } else {
    setStatus(`Valid URL · ${summary}`, "success");
  }
}

// Everything derived from the current text, but none of the editable fields:
// the field being typed into must not be re-rendered under the cursor.
function renderDerived() {
  const text = currentText();
  const view = state.parts.scheme !== null && !state.bare ? browserView(text) : { url: null, error: null };
  renderBreakdown();
  renderDetails(text, view);
  renderStatus(text, view);
  renderParamsMeta();
  return text;
}

/* --- State changes -------------------------------------------------------- */

// The URL text changed: it is the source of truth, so re-read everything.
function loadFromInput() {
  const text = urlInput.value.trim();
  if (!text) {
    state.parts = emptyParts();
    state.assumed = false;
    state.bare = false;
  } else {
    const { kind, parts } = readText(text);
    state.parts = parts;
    state.assumed = kind === "assumed";
    state.bare = kind === "bare";
  }
  state.params = parseQuery(state.parts.query, plusSpaces.checked);
  renderParts();
  renderParams();
  renderDerived();
}

// A component or parameter changed: rebuild the text from state.
function commit() {
  state.assumed = false;
  urlInput.value = currentText();
  renderDerived();
}

function editPart(name, value) {
  const { parts } = state;
  if (name !== "fragment") state.bare = false;
  if (["user", "pass", "host", "port"].includes(name) && !parts.authority) {
    parts.authority = { user: null, pass: null, host: "", port: null };
  }
  const a = parts.authority;
  switch (name) {
    case "scheme": parts.scheme = value.replace(/:\/*$/, "") || null; break;
    case "user": a.user = value || (a.pass !== null ? "" : null); break;
    case "pass":
      a.pass = value || null;
      if (a.pass !== null && a.user === null) a.user = "";
      break;
    case "host": a.host = value; break;
    case "port": a.port = value || null; break;
    case "path": parts.path = value; break;
    case "fragment": parts.fragment = value.replace(/^#/, "") || null; break;
  }
  renderParts(name);
  commit();
}

function syncQuery() {
  state.parts.query = serializeQuery(state.params);
  commit();
}

/* --- Actions -------------------------------------------------------------- */

function loadText(text) {
  urlInput.value = text;
  loadFromInput();
}

const ACTIONS = {
  sample() {
    loadText(SAMPLE_URL);
    window.DevToolsMain.showToast("Sample inserted", "info");
  },

  async paste() {
    try {
      loadText(await navigator.clipboard.readText());
    } catch {
      urlInput.focus();
      window.DevToolsMain.showToast("Clipboard is not available", "error");
    }
  },

  clear() {
    loadText("");
    urlInput.focus();
    window.DevToolsMain.showToast("Cleared", "info");
  },

  copy() {
    const text = currentText();
    if (!text) {
      window.DevToolsMain.showToast("Nothing to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(text);
    window.DevToolsMain.showToast("URL copied", "success");
  },

  "copy-normalized"() {
    const { url } = browserView(currentText());
    if (!url) return;
    window.DevToolsMain.copyText(url.href);
    window.DevToolsMain.showToast("Normalized URL copied", "success");
  },

  "copy-json"() {
    if (!state.params.some((p) => p.enabled)) {
      window.DevToolsMain.showToast("No parameters to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(JSON.stringify(paramsToObject(state.params), null, 2));
    window.DevToolsMain.showToast("Parameters copied as JSON", "success");
  },

  sort() {
    if (state.params.length < 2) return;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    // Array#sort is stable, so repeated keys keep their relative order —
    // which matters, since servers read `tag=a&tag=b` as an ordered list.
    state.params.sort((a, b) => collator.compare(a.key, b.key));
    renderParams();
    syncQuery();
  },

  "clear-params"() {
    if (!state.params.length) return;
    state.params = [];
    renderParams();
    syncQuery();
  },

  "add-param"() {
    state.params.push({ key: "", value: "", rawKey: "", rawValue: "", hasEq: true, enabled: true, bad: false });
    renderParams();
    paramsBody.lastElementChild?.querySelector("input[data-field='key']")?.focus();
  },
};

/* --- Wiring --------------------------------------------------------------- */

urlInput.addEventListener("input", loadFromInput);
// A URL is one line; Enter would only insert a stray newline.
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.preventDefault();
});

for (const [name, el] of Object.entries(partInputs)) {
  el.addEventListener("input", () => editPart(name, el.value));
}

paramsBody.addEventListener("input", (event) => {
  const el = event.target;
  const tr = el.closest("tr");
  const param = state.params[Number(tr?.dataset.index)];
  if (!param) return;
  const plus = plusSpaces.checked;
  if (el.dataset.field === "enabled") {
    param.enabled = el.checked;
  } else if (el.dataset.field === "key") {
    param.key = el.value;
    param.rawKey = encodeComponent(el.value, plus);
    param.bad = false;
  } else if (el.dataset.field === "value") {
    param.value = el.value;
    param.rawValue = encodeComponent(el.value, plus);
    param.hasEq = true;
    param.bad = false;
  } else {
    return;
  }
  refreshRowFlags();
  syncQuery();
});

paramsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-field='remove']");
  if (!button) return;
  const index = Number(button.closest("tr").dataset.index);
  state.params.splice(index, 1);
  renderParams();
  syncQuery();
  const rows = paramsBody.rows;
  (rows[Math.min(index, rows.length - 1)]?.querySelector("[data-field='remove']") ?? urlInput).focus();
});

// Re-decode the existing rows in place rather than re-reading the URL, so
// unticked parameters survive the switch.
plusSpaces.addEventListener("change", () => {
  state.params.forEach((param) => decodeParam(param, plusSpaces.checked));
  renderParams();
  renderDerived();
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) ACTIONS[button.dataset.action]?.(button);
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

loadFromInput();
