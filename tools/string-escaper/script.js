// Slug Generator / String Escaper — URL slugs, plus escaping for JSON, SQL,
// shell, regex, and HTML attribute contexts.
//
// Every escaper has an inverse, so a pasted literal can be read back as the
// plain text it stands for. Slugs are lossy and therefore one-way.

const inputEditor = document.getElementById("input-editor");
const outputEditor = document.getElementById("output-editor");
const inputTitle = document.getElementById("input-title");
const outputTitle = document.getElementById("output-title");
const inputCount = document.getElementById("input-count");
const outputCount = document.getElementById("output-count");
const inputStatusText = document.querySelector("#input-status .status-text");
const outputStatusText = document.querySelector("#output-status .status-text");
const directionGroup = document.getElementById("direction-group");
const directionSwitch = document.getElementById("direction-switch");
const slugHint = document.getElementById("slug-hint");
const slugMaxInput = document.getElementById("slug-max");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const MODES = ["slug", "json", "sql", "shell", "regex", "html-attr"];

const state = {
  mode: "slug",
  direction: "escape",
  separator: "-",
  slugCase: "lower",
  slugChars: "ascii",
  slugMax: 0,
  sqlDialect: "standard",
  shellStyle: "single",
  jsonAscii: "off",
  regexSlash: "on",
  attrWhitespace: "keep",
  quotes: "on",
};

const MODE_LABELS = {
  slug: "Slug",
  json: "JSON String",
  sql: "SQL Literal",
  shell: "Shell Argument",
  regex: "Regex Pattern",
  "html-attr": "HTML Attribute",
};

const PLACEHOLDERS = {
  slug: "Type or paste titles to turn into slugs...",
  escape: "Type or paste text to escape...",
  json: "Paste a JSON string, with or without quotes...",
  sql: "Paste a SQL string literal, with or without quotes...",
  shell: "Paste shell words or a quoted argument...",
  regex: "Paste an escaped regex pattern...",
  "html-attr": "Paste an attribute value, with or without quotes...",
};

const SAMPLES = {
  slug: { escape: "Hello, World! Crème Brûlée & Café Tips\n10 Reasons Why You'll Love Straße Names" },
  json: { escape: 'He said "hi"\n\tC:\\Users\\dev — ✓', unescape: '"He said \\"hi\\"\\n\\tC:\\\\Users\\\\dev \\u2014 \\u2713"' },
  sql: { escape: "O'Brien's \"pub\"", unescape: "'O''Brien''s \"pub\"'" },
  shell: { escape: "it's $HOME & \"more\"", unescape: "grep -r 'it'\\''s' \"$HOME/My Docs\" $'tab\\there'" },
  regex: { escape: "price: $9.99 (USD) [a-z]+? a/b", unescape: "price: \\$9\\.99 \\(USD\\) \\d+" },
  "html-attr": { escape: 'Say "hi" & <wave>', unescape: '"Say &quot;hi&quot; &amp; &lt;wave&gt;"' },
};

const textEncoder = new TextEncoder();

function showToast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/* --- Slug ----------------------------------------------------------------- */

// NFKD strips most accents on its own; these are the letters that have no
// decomposition and would otherwise vanish from an ASCII slug.
const TRANSLITERATION = {
  "ß": "ss", "ẞ": "SS", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE",
  "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ð": "d", "Ð": "D",
  "ł": "l", "Ł": "L", "þ": "th", "Þ": "TH", "ı": "i", "ħ": "h", "Ħ": "H",
  "&": " and ",
};

function slugifyLine(line) {
  const separator = state.separator;
  let text = [...line].map((character) => TRANSLITERATION[character] ?? character).join("");

  // Apostrophes join rather than split: "you'll" reads better as "youll"
  // than as "you-ll".
  text = text.replace(/['’ʼ]/g, "");

  if (state.slugChars === "ascii") {
    text = text.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, " ");
  } else {
    // Unicode slugs keep combining marks — Devanagari and Thai are
    // unreadable without them — so only compatibility forms are folded.
    text = text.normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ");
  }

  if (state.slugCase === "lower") text = text.toLocaleLowerCase("en");
  let slug = text.trim().split(/\s+/).filter(Boolean).join(separator);

  const max = state.slugMax;
  const characters = [...slug];
  if (max > 0 && characters.length > max) {
    let cut = characters.slice(0, max).join("");
    // Trim back to the last whole word when the limit lands mid-word, unless
    // that would leave nothing at all.
    if (characters[max] !== separator) {
      const lastBreak = cut.lastIndexOf(separator);
      if (lastBreak > 0) cut = cut.slice(0, lastBreak);
    }
    while (cut.endsWith(separator)) cut = cut.slice(0, -1);
    slug = cut;
  }
  return slug;
}

function slugify(text) {
  const lines = text.split(/\r?\n/);
  let dropped = 0;
  let count = 0;
  const output = lines
    .map((line) => {
      if (!line.trim()) return "";
      const slug = slugifyLine(line);
      if (slug) count += 1;
      else dropped += 1;
      return slug;
    })
    .join("\n");

  const note = dropped
    ? `${plural(dropped, "line")} had no usable letters${state.slugChars === "ascii" ? " — try Unicode" : ""}`
    : null;
  return { output, note, summary: `Generated ${plural(count, "slug")}` };
}

/* --- JSON ----------------------------------------------------------------- */

function escapeJson(text) {
  // JSON.stringify is well-formed: a lone surrogate becomes \udXXX rather
  // than an unencodable character.
  let literal = JSON.stringify(text);
  if (state.jsonAscii === "on") {
    // Without the `u` flag this matches UTF-16 units, so an emoji comes out as
    // its surrogate pair — the only form JSON can spell it in.
    literal = literal.replace(/[\u007f-\uffff]/g, (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
  return { output: state.quotes === "on" ? literal : literal.slice(1, -1) };
}

function unescapeJson(text) {
  const trimmed = text.trim();
  const quoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
  try {
    return { output: JSON.parse(quoted ? trimmed : `"${text}"`) };
  } catch (error) {
    const reason = String(error.message)
      .replace(/^JSON\.parse: /, "")
      .replace(/ (in JSON )?at (line|position) .*$/, "");
    if (/after JSON|non-whitespace/i.test(reason)) {
      return { error: 'Not a valid JSON string: it contains an unescaped " (write it as \\")' };
    }
    return { error: `Not a valid JSON string: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` };
  }
}

/* --- SQL ------------------------------------------------------------------ */

const MYSQL_ESCAPES = { "\\": "\\\\", "'": "\\'", '"': '\\"', "\0": "\\0", "\n": "\\n", "\r": "\\r", "\x1a": "\\Z" };
const MYSQL_UNESCAPES = { 0: "\0", "'": "'", '"': '"', b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a", "\\": "\\" };

function escapeSql(text) {
  let body;
  let note = null;
  if (state.sqlDialect === "mysql") {
    body = text.replace(/[\\'"\0\n\r\x1a]/g, (character) => MYSQL_ESCAPES[character]);
  } else {
    body = text.replaceAll("'", "''");
    if (text.includes("\0")) note = "Standard SQL strings cannot hold a NUL character";
  }
  return { output: state.quotes === "on" ? `'${body}'` : body, note };
}

function unescapeSql(text) {
  const trimmed = text.trim();
  const quoted = trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'");
  const body = quoted ? trimmed.slice(1, -1) : text;
  const mysql = state.sqlDialect === "mysql";

  let output = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'") {
      if (body[index + 1] !== "'") {
        return { error: `Lone ' at position ${index + 1} — inside a literal a quote is written ''${mysql ? " or \\'" : ""}` };
      }
      output += "'";
      index += 1;
    } else if (mysql && character === "\\") {
      const next = body[index + 1];
      if (next === undefined) return { error: "Ends with a lone backslash" };
      // MySQL keeps the backslash in \% and \_ so they still work in LIKE.
      output += next === "%" || next === "_" ? `\\${next}` : MYSQL_UNESCAPES[next] ?? next;
      index += 1;
    } else {
      output += character;
    }
  }
  return { output };
}

/* --- Shell ---------------------------------------------------------------- */

const ANSI_ESCAPES = { "\\": "\\\\", "'": "\\'", "\n": "\\n", "\t": "\\t", "\r": "\\r", "\x07": "\\a", "\b": "\\b", "\f": "\\f", "\v": "\\v", "\x1b": "\\e" };
const ANSI_UNESCAPES = { a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", "'": "'", '"': '"', "?": "?" };

function escapeShell(text) {
  if (state.shellStyle === "double") {
    const note = text.includes("!") ? "! may still trigger history expansion in interactive bash — prefer single quotes" : null;
    return { output: `"${text.replace(/[\\"$`]/g, "\\$&")}"`, note };
  }
  if (state.shellStyle === "ansi") {
    const body = text.replace(/[\\'\x00-\x1f\x7f]/g, (character) =>
      ANSI_ESCAPES[character] ?? `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
    return { output: `$'${body}'` };
  }
  return { output: `'${text.replaceAll("'", "'\\''")}'` };
}

// Reads $'…' starting just past the opening quote; returns the decoded text
// and the index of the closing quote.
function readAnsiC(text, start) {
  let value = "";
  let index = start;
  while (index < text.length && text[index] !== "'") {
    if (text[index] !== "\\") {
      value += text[index];
      index += 1;
      continue;
    }
    const next = text[index + 1];
    if (next === undefined) break;
    let match;
    if (ANSI_UNESCAPES[next] !== undefined) {
      value += ANSI_UNESCAPES[next];
      index += 2;
    } else if ((match = /^[0-7]{1,3}/.exec(text.slice(index + 1)))) {
      value += String.fromCharCode(parseInt(match[0], 8) & 0xff);
      index += 1 + match[0].length;
    } else if ((match = /^x([0-9a-fA-F]{1,2})/.exec(text.slice(index + 1)))) {
      value += String.fromCharCode(parseInt(match[1], 16));
      index += 1 + match[0].length;
    } else if ((match = /^(?:u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8}))/.exec(text.slice(index + 1)))) {
      const codePoint = parseInt(match[1] || match[2], 16);
      value += codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "\ufffd";
      index += 1 + match[0].length;
    } else if (next === "c" && index + 2 < text.length) {
      value += String.fromCharCode(text.charCodeAt(index + 2) & 0x1f);
      index += 3;
    } else {
      value += `\\${next}`;
      index += 2;
    }
  }
  return index < text.length ? { value, end: index } : null;
}

function unescapeShell(text) {
  const words = [];
  let word = null;
  let expansions = 0;
  const append = (value) => {
    word = (word ?? "") + value;
  };
  const countExpansion = (value) => {
    expansions += (value.match(/\$[A-Za-z_{(]|`/g) || []).length;
  };

  let index = 0;
  while (index < text.length) {
    const character = text[index];

    if (/\s/.test(character)) {
      if (word !== null) words.push(word);
      word = null;
      index += 1;
    } else if (character === "'") {
      const end = text.indexOf("'", index + 1);
      if (end < 0) return { error: `Unterminated single quote at position ${index + 1}` };
      append(text.slice(index + 1, end));
      index = end + 1;
    } else if (character === "$" && text[index + 1] === "'") {
      const result = readAnsiC(text, index + 2);
      if (!result) return { error: `Unterminated $' quote at position ${index + 1}` };
      append(result.value);
      index = result.end + 1;
    } else if (character === '"') {
      let value = "";
      index += 1;
      while (index < text.length && text[index] !== '"') {
        const next = text[index + 1];
        if (text[index] === "\\" && next !== undefined && '$`"\\\n'.includes(next)) {
          if (next !== "\n") value += next;
          index += 2;
        } else {
          value += text[index];
          index += 1;
        }
      }
      if (index >= text.length) return { error: "Unterminated double quote" };
      countExpansion(value);
      append(value);
      index += 1;
    } else if (character === "\\") {
      const next = text[index + 1];
      if (next === undefined) {
        append("\\");
        index += 1;
      } else {
        // Backslash-newline is a line continuation and produces nothing.
        if (next !== "\n") append(next);
        index += 2;
      }
    } else {
      if (character === "$" || character === "`") countExpansion(text.slice(index, index + 2));
      append(character);
      index += 1;
    }
  }
  if (word !== null) words.push(word);

  const notes = [];
  if (words.length > 1) notes.push(`${words.length} words, one per line`);
  if (expansions) notes.push(`${plural(expansions, "expansion")} shown literally`);
  return { output: words.join("\n"), note: notes.join(" · ") || null, summary: `Parsed ${plural(words.length, "word")}` };
}

/* --- Regex ---------------------------------------------------------------- */

// Only syntax characters: escaping anything else (\- or \,) is a SyntaxError
// in a JavaScript pattern with the `u` or `v` flag.
function escapeRegex(text) {
  const pattern = state.regexSlash === "on" ? /[\\^$.*+?()[\]{}|/]/g : /[\\^$.*+?()[\]{}|]/g;
  return { output: text.replace(pattern, "\\$&") };
}

function unescapeRegex(text) {
  if (/(^|[^\\])(\\\\)*\\$/.test(text)) return { error: "Ends with a lone backslash" };
  let kept = 0;
  const output = text.replace(/\\([\s\S])/g, (match, character) => {
    if (/[A-Za-z0-9]/.test(character)) {
      kept += 1;
      return match;
    }
    return character;
  });
  const note = kept ? `${plural(kept, "escape")} like \\d ${kept === 1 ? "has" : "have"} regex meaning and ${kept === 1 ? "was" : "were"} left as-is` : null;
  return { output, note };
}

/* --- HTML attribute ------------------------------------------------------- */

const ATTRIBUTE_ENTITIES = { "&": "&amp;", '"': "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;" };

function escapeAttribute(text) {
  const pattern = state.attrWhitespace === "encode" ? /[&"'<>\n\r\t]/g : /[&"'<>]/g;
  const body = text.replace(pattern, (character) => ATTRIBUTE_ENTITIES[character]);
  return { output: state.quotes === "on" ? `"${body}"` : body };
}

// Same approach as the Encoder / Decoder: the browser's own entity table
// resolves each matched `&…;` run inside a detached <textarea>, which is
// RCDATA, so no markup can be built from the input.
const entityScratch = document.createElement("textarea");
const ENTITY_PATTERN = /&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

function unescapeAttribute(text) {
  const trimmed = text.trim();
  const quote = trimmed[0];
  const quoted = trimmed.length >= 2 && (quote === '"' || quote === "'") && trimmed.endsWith(quote);
  const body = quoted ? trimmed.slice(1, -1) : text;

  let resolved = 0;
  let unresolved = 0;
  const output = body.replace(ENTITY_PATTERN, (match) => {
    entityScratch.innerHTML = match;
    const value = entityScratch.value;
    if (value === match) {
      unresolved += 1;
      return match;
    }
    resolved += 1;
    return value;
  });

  const note = unresolved ? `${plural(unresolved, "unknown entity", "unknown entities")} left as-is` : null;
  return { output, note, summary: `Decoded ${plural(resolved, "entity", "entities")}` };
}

/* --- Conversion ----------------------------------------------------------- */

const CONVERTERS = {
  slug: [slugify, null],
  json: [escapeJson, unescapeJson],
  sql: [escapeSql, unescapeSql],
  shell: [escapeShell, unescapeShell],
  regex: [escapeRegex, unescapeRegex],
  "html-attr": [escapeAttribute, unescapeAttribute],
};

function convert(text) {
  if (!text) return { output: "" };
  const [escape, unescape] = CONVERTERS[state.mode];
  return state.direction === "unescape" && unescape ? unescape(text) : escape(text);
}

function setStatus(element, message, statusClass = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `status-text ${statusClass}`.trim();
}

function describeResult(input, result) {
  if (result.summary) return result.summary;
  const bytes = textEncoder.encode(input).length;
  return `${state.direction === "escape" ? "Escaped" : "Unescaped"} ${plural(bytes, "byte")}`;
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
  const isSlug = state.mode === "slug";
  const escaping = state.direction === "escape";
  const label = MODE_LABELS[state.mode];

  inputTitle.textContent = escaping ? "Plain Text" : label;
  outputTitle.textContent = escaping ? label : "Plain Text";
  inputEditor.placeholder = isSlug ? PLACEHOLDERS.slug : escaping ? PLACEHOLDERS.escape : PLACEHOLDERS[state.mode];

  directionGroup.hidden = isSlug;
  slugHint.hidden = !isSlug;

  document.querySelectorAll(".option-group").forEach((group) => {
    const forMode = group.dataset.for.split(" ").includes(state.mode);
    const forDirection = !group.dataset.directionOnly || group.dataset.directionOnly === state.direction;
    group.hidden = !(forMode && forDirection);
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
  link.download = state.mode === "slug" ? "slugs.txt" : `${state.direction}d.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  flashButton(button, "is-downloaded");
  showToast("Output downloaded", "success");
}

function swap(button) {
  const carried = outputEditor.value;
  setDirection(state.direction === "escape" ? "unescape" : "escape");
  inputEditor.value = carried;
  run();
  flashButton(button, "is-confirmed");
}

function loadSample(button, { announce = true } = {}) {
  const samples = SAMPLES[state.mode];
  inputEditor.value = samples[state.direction] ?? samples.escape;
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

// Input is kept across modes on purpose: pasting once and flipping between
// targets is the quickest way to compare how the same text escapes.
function setMode(mode, { updateHash = true } = {}) {
  state.mode = MODES.includes(mode) ? mode : "slug";
  const button = document.querySelector(`.mode-btn[data-mode="${state.mode}"]`);
  setActive(button.parentElement, button);
  if (state.mode === "slug" && state.direction !== "escape") setDirection("escape");
  syncLabels();
  if (updateHash) window.DevToolsMain.writeHashState(state.mode);
}

/* --- Wiring --------------------------------------------------------------- */

inputEditor.addEventListener("input", run);

document.querySelectorAll(".mode-btn[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    if (state.mode === button.dataset.mode) return;
    setMode(button.dataset.mode);
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

slugMaxInput.addEventListener("input", () => {
  const value = Number.parseInt(slugMaxInput.value, 10);
  state.slugMax = Number.isFinite(value) && value > 0 ? value : 0;
  run();
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

window.DevToolsMain.onHashState((value) => {
  if (MODES.includes(value) && value !== state.mode) {
    setMode(value, { updateHash: false });
    run();
  }
});

function init() {
  setMode(window.DevToolsMain.readHashState(), { updateHash: false });
  // Seed the editor so the tool explains itself on arrival; the user did not
  // ask for a sample, so this stays silent.
  loadSample(null, { announce: false });
}

init();
