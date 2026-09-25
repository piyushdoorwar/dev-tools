// .env ⇄ JSON ⇄ Shell Converter — move environment variables between a dotenv
// file, a JSON object, and shell `export` lines.
//
// Every input format is parsed down to one ordered Map of KEY → string value,
// and every output format is written from that Map. Environment variables are
// always strings, so that is the only shape the formats need to agree on.

const input = document.getElementById("input");
const output = document.getElementById("output");
const inputTitle = document.getElementById("input-title");
const outputTitle = document.getElementById("output-title");
const inputStatus = document.getElementById("input-status");
const outputStatus = document.getElementById("output-status");
const expandVars = document.getElementById("expand-vars");
const dialectSelect = document.getElementById("dialect");
const typedValues = document.getElementById("typed-values");
const sortKeys = document.getElementById("sort-keys");
const fileInput = document.getElementById("file-input");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const FORMATS = {
  env: { label: ".env", placeholder: "Paste a .env file here, or drop one…" },
  json: { label: "JSON", placeholder: "Paste a JSON object of KEY: value pairs…" },
  shell: { label: "Shell", placeholder: "Paste export lines, fish set -gx, or PowerShell $env: lines…" },
};

const DIALECTS = {
  posix: { label: "Bash / Zsh", filename: "env.sh" },
  fish: { label: "fish", filename: "env.fish" },
  powershell: { label: "PowerShell", filename: "env.ps1" },
};

// A portable shell variable name. dotenv keys may also hold dots and dashes.
const SHELL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
// Values made only of these need no quotes in a .env file or a POSIX shell.
const SAFE_BARE = /^[A-Za-z0-9_@%+=:,./-]+$/;
// fish (before 3.0) expands `%` at the start of a word, so it is left out.
const FISH_BARE = /^[A-Za-z0-9_@+=:,./-]+$/;

const SAMPLE_ENV = [
  "# App",
  "NODE_ENV=production",
  "PORT=8080",
  "DEBUG=false",
  "",
  "# Database",
  "DB_HOST=localhost",
  "DB_USER=app",
  "DB_PASSWORD='p@ss w0rd$!'",
  "DATABASE_URL=\"postgres://${DB_USER}@${DB_HOST}:5432/app\"",
  "",
  "GREETING=\"Hello, world\" # inline comment",
  "LOG_LEVEL=${LOG_LEVEL:-info}",
  "EMPTY=",
  "PRIVATE_KEY=\"-----BEGIN KEY-----\\nMIIBOgIBAAJBAK\\n-----END KEY-----\"",
].join("\n");

const SAMPLE_SHELL = [
  "#!/usr/bin/env bash",
  "export NODE_ENV=production",
  "export PORT=8080 DEBUG=false",
  "export DB_HOST=localhost DB_USER=app",
  "export DB_PASSWORD='p@ss w0rd$!'",
  "export DATABASE_URL=\"postgres://${DB_USER}@${DB_HOST}:5432/app\"",
  "export GREETING=\"Hello, world\"",
  "export PRIVATE_KEY='-----BEGIN KEY-----",
  "MIIBOgIBAAJBAK",
  "-----END KEY-----'",
].join("\n");

const SAMPLE_JSON = JSON.stringify({
  NODE_ENV: "production",
  PORT: 8080,
  DEBUG: false,
  DB_HOST: "localhost",
  DB_PASSWORD: "p@ss w0rd$!",
  DATABASE_URL: "postgres://app@localhost:5432/app",
  GREETING: "Hello, world",
  FEATURE_FLAGS: { search: true, beta: false },
  EMPTY: null,
}, null, 2);

const SAMPLES = { env: SAMPLE_ENV, json: SAMPLE_JSON, shell: SAMPLE_SHELL };

const state = {
  from: "env",
  to: "json",
  text: "",           // generated output
  outputIsCurrent: false,
};

/* --- Shared parsing pieces -------------------------------------------------- */

function lineOf(text, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

function plural(count, word) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

/* A value is a list of segments: plain strings, and `{ name, op, fallback, raw }`
 * references left unresolved until the key is assigned, because expansion
 * only sees keys defined *above* it. */
function readDollar(text, i) {
  if (text[i + 1] === "{") {
    const close = text.indexOf("}", i + 2);
    if (close === -1) return null;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-=])([^]*))?$/.exec(text.slice(i + 2, close));
    if (!match) return null;
    return { seg: { name: match[1], op: match[2] || "", fallback: match[3] ?? "", raw: text.slice(i, close + 1) }, end: close + 1 };
  }
  const name = /[A-Za-z_][A-Za-z0-9_]*/y;
  name.lastIndex = i + 1;
  const hit = name.exec(text);
  if (!hit) return null;
  return { seg: { name: hit[0], op: "", fallback: "", raw: `$${hit[0]}` }, end: name.lastIndex };
}

// Splits unquoted or double-quoted text into literal and reference segments.
function withReferences(text) {
  const segments = [];
  let buf = "";
  for (let i = 0; i < text.length;) {
    const ref = text[i] === "$" ? readDollar(text, i) : null;
    if (ref) {
      if (buf) segments.push(buf);
      buf = "";
      segments.push(ref.seg);
      i = ref.end;
    } else {
      buf += text[i++];
    }
  }
  if (buf) segments.push(buf);
  return segments;
}

/* Reads a double-quoted string from the opening quote at `start`. `escapes`
 * maps the character after a backslash to what it stands for; any other
 * backslash is kept literally. Returns null when the quote never closes. */
function readDoubleQuoted(text, start, escapes) {
  const segments = [];
  let buf = "";
  for (let i = start + 1; i < text.length;) {
    const ch = text[i];
    if (ch === '"') {
      if (buf) segments.push(buf);
      return { segments, end: i + 1 };
    }
    if (ch === "\\" && i + 1 < text.length && Object.hasOwn(escapes, text[i + 1])) {
      buf += escapes[text[i + 1]];
      i += 2;
      continue;
    }
    const ref = ch === "$" ? readDollar(text, i) : null;
    if (ref) {
      if (buf) segments.push(buf);
      buf = "";
      segments.push(ref.seg);
      i = ref.end;
      continue;
    }
    buf += ch;
    i++;
  }
  return null;
}

const ENV_ESCAPES = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\", $: "$" };
const SHELL_ESCAPES = { '"': '"', "\\": "\\", $: "$", "`": "`", "\n": "" };

/* Collects variables in order. A repeated key keeps its first position and
 * its last value — what both dotenv and a shell end up with. */
function createContext(expand) {
  const vars = new Map();
  const duplicates = new Set();
  const undefinedRefs = new Set();
  return {
    vars,
    notes: [],
    skipped: 0,
    resolve(segments) {
      return segments.map((seg) => {
        if (typeof seg === "string") return seg;
        if (!expand) return seg.raw;
        const has = vars.has(seg.name);
        const value = vars.get(seg.name);
        if (seg.op) {
          const useFallback = seg.op.startsWith(":") ? !value : !has;
          return useFallback ? seg.fallback : value;
        }
        if (!has) {
          undefinedRefs.add(seg.name);
          return "";
        }
        return value;
      }).join("");
    },
    set(key, value) {
      if (vars.has(key)) duplicates.add(key);
      vars.set(key, value);
    },
    finish() {
      if (duplicates.size) this.notes.push(`${plural(duplicates.size, "repeated key")} (last value kept): ${[...duplicates].join(", ")}`);
      if (undefinedRefs.size) this.notes.push(`undefined, expanded to empty: ${[...undefinedRefs].map((n) => `$${n}`).join(", ")}`);
      if (this.skipped) this.notes.push(`${plural(this.skipped, "line")} skipped (not an assignment)`);
      return { vars, notes: this.notes };
    },
  };
}

/* --- .env ------------------------------------------------------------------- */

function parseEnv(text, { expand }) {
  const src = text.replace(/\r\n?/g, "\n");
  const ctx = createContext(expand);
  const endOfLine = (from) => {
    const eol = src.indexOf("\n", from);
    return eol === -1 ? src.length : eol;
  };

  let pos = 0;
  while (pos < src.length) {
    const eol = endOfLine(pos);
    const lineText = src.slice(pos, eol);
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      pos = eol + 1;
      continue;
    }

    const head = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*=[ \t]*/.exec(lineText);
    if (!head) {
      throw new Error(`Line ${lineOf(src, pos)}: expected KEY=value, found "${trimmed.slice(0, 40)}"`);
    }
    const key = head[1];
    const start = pos + head[0].length;
    const quote = src[start];
    let segments;
    let end;

    if (quote === "'" || quote === "`") {
      const close = src.indexOf(quote, start + 1);
      if (close === -1) throw new Error(`Line ${lineOf(src, start)}: ${key} has an unterminated ${quote} quote`);
      segments = [src.slice(start + 1, close)];
      end = close + 1;
    } else if (quote === '"') {
      const read = readDoubleQuoted(src, start, ENV_ESCAPES);
      if (!read) throw new Error(`Line ${lineOf(src, start)}: ${key} has an unterminated " quote`);
      segments = read.segments;
      end = read.end;
    } else {
      let value = src.slice(start, eol);
      const comment = value.search(/[ \t]#/);
      if (comment !== -1) value = value.slice(0, comment);
      segments = withReferences(value.trim());
      end = eol;
    }

    const lineEnd = endOfLine(end);
    const rest = src.slice(end, lineEnd).trim();
    if (rest && !rest.startsWith("#")) {
      throw new Error(`Line ${lineOf(src, end)}: unexpected "${rest.slice(0, 20)}" after the closing quote of ${key}`);
    }
    ctx.set(key, ctx.resolve(segments));
    pos = lineEnd + 1;
  }
  return ctx.finish();
}

function writeEnvValue(value) {
  if (value === "") return "";
  if (SAFE_BARE.test(value)) return value;
  // Single quotes are literal in every dotenv dialect, so prefer them.
  if (!/['\n\r]/.test(value)) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/* --- Shell ------------------------------------------------------------------ */

/* Splits POSIX-ish shell text into commands of words, applying quoting. Each
 * word keeps `prefix`: its leading unquoted literal text, which is where an
 * assignment's `NAME=` has to be for the shell to treat it as one. */
function lexShell(src, { fish = false } = {}) {
  const commands = [];
  let words = [];
  let word = null;
  let buf = "";

  const flush = () => {
    if (buf) word.segments.push(buf);
    buf = "";
  };
  const startWord = () => {
    if (!word) word = { segments: [], prefix: "", prefixOpen: true };
  };
  const endWord = () => {
    if (!word) return;
    flush();
    words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  const literal = (text) => {
    word.prefixOpen = false;
    buf += text;
  };

  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === "\\" && src[i + 1] === "\n") {
      i += 2;
      continue;
    }
    if (ch === "\n" || ch === ";") {
      endCommand();
      i++;
      continue;
    }
    if (ch === "&" || ch === "|") {
      endCommand();
      i += src[i + 1] === ch ? 2 : 1;
      continue;
    }
    if (ch === " " || ch === "\t") {
      endWord();
      i++;
      continue;
    }
    if (ch === "#" && !word) {
      const eol = src.indexOf("\n", i);
      i = eol === -1 ? src.length : eol;
      continue;
    }

    startWord();
    if (ch === "\\") {
      literal(src[i + 1] ?? "");
      i += 2;
    } else if (ch === "'" && fish) {
      // fish single quotes honour exactly two escapes, \' and \\, which is
      // how this tool's own fish output quotes them. POSIX rules ended the
      // string at the \' and reported an unterminated quote.
      let text = "";
      let j = i + 1;
      while (j < src.length && src[j] !== "'") {
        if (src[j] === "\\" && (src[j + 1] === "'" || src[j + 1] === "\\")) {
          text += src[j + 1];
          j += 2;
        } else {
          text += src[j++];
        }
      }
      if (j >= src.length) throw new Error(`Line ${lineOf(src, i)}: unterminated ' quote`);
      literal(text);
      i = j + 1;
    } else if (ch === "'") {
      const close = src.indexOf("'", i + 1);
      if (close === -1) throw new Error(`Line ${lineOf(src, i)}: unterminated ' quote`);
      literal(src.slice(i + 1, close));
      i = close + 1;
    } else if (ch === '"') {
      const read = readDoubleQuoted(src, i, SHELL_ESCAPES);
      if (!read) throw new Error(`Line ${lineOf(src, i)}: unterminated " quote`);
      word.prefixOpen = false;
      flush();
      word.segments.push(...read.segments);
      i = read.end;
    } else if (ch === "$" && src[i + 1] === "'") {
      // Bash ANSI-C quoting: $'line one\nline two'
      const read = /\$'((?:[^'\\]|\\[^])*)'/y;
      read.lastIndex = i;
      const hit = read.exec(src);
      if (!hit) throw new Error(`Line ${lineOf(src, i)}: unterminated $' quote`);
      const map = { n: "\n", r: "\r", t: "\t", "'": "'", '"': '"', "\\": "\\", e: "\x1b", a: "\x07" };
      literal(hit[1].replace(/\\([^])/g, (whole, c) => map[c] ?? whole));
      i = read.lastIndex;
    } else if (ch === "$" && src[i + 1] === "(") {
      // Command substitution is kept as text; running it is not an option.
      let depth = 0;
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")" && --depth === 0) break;
      }
      literal(src.slice(i, j + 1));
      i = j + 1;
    } else if (ch === "$" && readDollar(src, i)) {
      const ref = readDollar(src, i);
      word.prefixOpen = false;
      flush();
      word.segments.push(ref.seg);
      i = ref.end;
    } else {
      if (word.prefixOpen) word.prefix += ch;
      buf += ch;
      i++;
    }
  }
  endCommand();
  return commands;
}

const plainWord = (word) => word && word.segments.length === 1 && typeof word.segments[0] === "string" ? word.segments[0] : null;

// NAME=value as the shell sees it: the `NAME=` part unquoted.
function asAssignment(word) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(word.prefix);
  if (!match) return null;
  const segments = [...word.segments];
  segments[0] = segments[0].slice(match[0].length);
  return { name: match[1], segments };
}

function parsePosixShell(src, ctx, { fish = false } = {}) {
  for (const words of lexShell(src, { fish })) {
    const command = plainWord(words[0]);
    let rest = words;

    if (command === "set") {
      // fish: set [-gx | --export ...] NAME value...
      // Only leading, unquoted words are flags. Filtering every word that
      // began with "-" dropped values such as '-----BEGIN KEY-----'.
      let first = 1;
      while (first < words.length && /^-/.test(words[first].prefix)) first++;
      const args = words.slice(first);
      const name = plainWord(args[0]);
      if (!name || !SHELL_NAME.test(name)) {
        ctx.skipped++;
        continue;
      }
      ctx.set(name, args.slice(1).map((w) => ctx.resolve(w.segments)).join(" "));
      continue;
    }

    const exporting = command === "export" || command === "declare" || command === "typeset";
    if (exporting) rest = words.slice(1).filter((w) => !/^-/.test(plainWord(w) ?? ""));

    const assignments = [];
    let isCommand = false;
    for (const w of rest) {
      const assignment = asAssignment(w);
      if (assignment) assignments.push(assignment);
      else if (!exporting || !SHELL_NAME.test(plainWord(w) ?? "")) isCommand = true;
    }
    // `FOO=1 npm start` sets FOO for that one command only.
    if (isCommand || !assignments.length) {
      if (!exporting || isCommand) ctx.skipped++;
      continue;
    }
    for (const { name, segments } of assignments) ctx.set(name, ctx.resolve(segments));
  }
}

/* PowerShell: $env:NAME = 'value' or ${env:NAME} = "value". Single quotes
 * double up to escape; double quotes use backtick escapes and expand
 * $env:NAME. */
function parsePowerShell(src, ctx) {
  const head = /^[ \t]*(?:\$env:([A-Za-z_][A-Za-z0-9_]*)|\$\{env:([^}]+)\})[ \t]*=[ \t]*/i;
  let pos = 0;
  while (pos < src.length) {
    let eol = src.indexOf("\n", pos);
    if (eol === -1) eol = src.length;
    const lineText = src.slice(pos, eol);
    const trimmed = lineText.trim();
    const match = head.exec(lineText);
    if (!match) {
      if (trimmed && !trimmed.startsWith("#")) ctx.skipped++;
      pos = eol + 1;
      continue;
    }

    const name = match[1] || match[2];
    const start = pos + match[0].length;
    let value;
    let end;
    if (src[start] === "'") {
      const read = /'((?:[^']|'')*)'/y;
      read.lastIndex = start;
      const hit = read.exec(src);
      if (!hit) throw new Error(`Line ${lineOf(src, start)}: ${name} has an unterminated ' quote`);
      value = hit[1].replace(/''/g, "'");
      end = read.lastIndex;
    } else if (src[start] === '"') {
      const read = /"((?:[^"`]|`[^]|"")*)"/y;
      read.lastIndex = start;
      const hit = read.exec(src);
      if (!hit) throw new Error(`Line ${lineOf(src, start)}: ${name} has an unterminated " quote`);
      const map = { n: "\n", r: "\r", t: "\t", "`": "`", '"': '"', $: "\u0000$" };
      const unescaped = hit[1]
        .replace(/""/g, '"')
        .replace(/`([^])/g, (_, c) => map[c] ?? c);
      // `$ was marked with a NUL so it survives the expansion pass literally.
      value = unescaped
        .replace(/(\u0000)?\$(?:env:([A-Za-z_][A-Za-z0-9_]*)|\{env:([^}]+)\})/gi, (whole, escaped, a, b) => {
          if (escaped) return whole.slice(1);
          return ctx.resolve([{ name: a || b, op: "", fallback: "", raw: whole }]);
        })
        .replace(/\u0000\$/g, "$");
      end = read.lastIndex;
    } else {
      value = lineText.slice(match[0].length).replace(/[ \t]#.*$/, "").trim();
      end = eol;
    }
    ctx.set(name, value);
    const lineEnd = src.indexOf("\n", end);
    pos = (lineEnd === -1 ? src.length : lineEnd) + 1;
  }
}

function parseShell(text, { expand }) {
  const src = text.replace(/\r\n?/g, "\n");
  const ctx = createContext(expand);
  if (/^[ \t]*\$(?:env:|\{env:)/im.test(src)) parsePowerShell(src, ctx);
  else {
    // A script of `set` lines with no POSIX assignments is fish, whose
    // single quotes differ (see lexShell).
    const fish = /^[ \t]*set[ \t]/m.test(src)
      && !/^[ \t]*(?:export|declare|typeset)[ \t]|^[ \t]*[A-Za-z_][A-Za-z0-9_]*=/m.test(src);
    parsePosixShell(src, ctx, { fish });
  }
  return ctx.finish();
}

function writeShell(vars, dialect) {
  const lines = [];
  let skipped = 0;
  for (const [key, value] of vars) {
    if (dialect === "posix") {
      if (!SHELL_NAME.test(key)) { skipped++; continue; }
      const quoted = value === "" ? "''" : SAFE_BARE.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
      lines.push(`export ${key}=${quoted}`);
    } else if (dialect === "fish") {
      if (!SHELL_NAME.test(key)) { skipped++; continue; }
      const quoted = value === "" ? "''" : FISH_BARE.test(value) ? value : `'${value.replace(/[\\']/g, "\\$&")}'`;
      lines.push(`set -gx ${key} ${quoted}`);
    } else {
      if (!ENV_KEY.test(key)) { skipped++; continue; }
      const target = SHELL_NAME.test(key) ? `$env:${key}` : `\${env:${key}}`;
      lines.push(`${target} = '${value.replace(/'/g, "''")}'`);
    }
  }
  return { text: lines.join("\n"), skipped, invalid: "shell variable names" };
}

/* --- JSON ------------------------------------------------------------------- */

function parseJson(text) {
  const data = JSON.parse(text);
  const ctx = createContext(false);
  let entries;
  if (Array.isArray(data)) {
    // Kubernetes `env:` and ECS task definitions: [{ name, value }]
    entries = [];
    data.forEach((item, index) => {
      const nameKey = item && typeof item === "object" ? ["name", "Name", "key", "Key"].find((k) => typeof item[k] === "string") : null;
      if (!nameKey) throw new Error(`Item ${index}: expected an object with a "name" and a "value"`);
      const valueKey = ["value", "Value"].find((k) => Object.hasOwn(item, k));
      if (!valueKey) {
        ctx.notes.push(`${item[nameKey]} has no value (valueFrom?) and was skipped`);
        return;
      }
      entries.push([item[nameKey], item[valueKey]]);
    });
  } else if (data && typeof data === "object") {
    entries = Object.entries(data);
  } else {
    throw new Error("Expected a JSON object of KEY: value pairs");
  }

  let nested = 0;
  for (const [key, value] of entries) {
    if (value !== null && typeof value === "object") {
      nested++;
      ctx.set(key, JSON.stringify(value));
    } else {
      ctx.set(key, value === null ? "" : String(value));
    }
  }
  if (nested) ctx.notes.push(`${plural(nested, "nested value")} written as JSON text`);
  return ctx.finish();
}

function typedValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  // Leading zeros (ZIP codes, octal modes) and unsafe integers stay text.
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (Number.isFinite(number) && (!Number.isInteger(number) || Number.isSafeInteger(number))) return number;
  }
  return value;
}

function writeJson(vars, typed) {
  // No prototype, so a "__proto__" key is kept as data rather than dropped.
  const object = Object.create(null);
  for (const [key, value] of vars) object[key] = typed ? typedValue(value) : value;
  return { text: JSON.stringify(object, null, 2), skipped: 0 };
}

function writeEnv(vars) {
  const lines = [];
  let skipped = 0;
  for (const [key, value] of vars) {
    if (!ENV_KEY.test(key)) { skipped++; continue; }
    lines.push(`${key}=${writeEnvValue(value)}`);
  }
  return { text: lines.join("\n"), skipped, invalid: ".env keys" };
}

/* --- Conversion ------------------------------------------------------------- */

function parse(format, text) {
  const options = { expand: expandVars.checked };
  if (format === "json") return parseJson(text);
  if (format === "shell") return parseShell(text, options);
  return parseEnv(text, options);
}

function write(format, vars) {
  if (format === "json") return writeJson(vars, typedValues.checked);
  if (format === "shell") return writeShell(vars, dialectSelect.value);
  return writeEnv(vars);
}

function setStatus(bar, message, type = "") {
  bar.className = `status-bar${type ? ` is-${type}` : ""}`;
  bar.firstElementChild.textContent = message;
  bar.firstElementChild.title = message;
}

function render() {
  const text = input.value;
  state.outputIsCurrent = false;

  if (!text.trim()) {
    state.text = "";
    output.value = "";
    setStatus(inputStatus, "Ready");
    setStatus(outputStatus, "Ready");
    return;
  }

  let parsed;
  try {
    parsed = parse(state.from, text);
  } catch (error) {
    state.text = "";
    output.value = "";
    setStatus(inputStatus, String(error.message).split("\n")[0], "error");
    setStatus(outputStatus, "Waiting for valid input");
    return;
  }

  const count = plural(parsed.vars.size, "variable");
  if (parsed.notes.length) setStatus(inputStatus, `${count} · ${parsed.notes.join(" · ")}`, "warning");
  else setStatus(inputStatus, count, "success");

  let vars = parsed.vars;
  if (sortKeys.checked) vars = new Map([...vars].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

  const written = write(state.to, vars);
  state.text = written.text;
  state.outputIsCurrent = true;
  output.value = written.text;

  const label = state.to === "shell" ? DIALECTS[dialectSelect.value].label : FORMATS[state.to].label;
  if (written.skipped) {
    setStatus(outputStatus, `${plural(vars.size - written.skipped, "variable")} · ${plural(written.skipped, "key")} skipped (not valid ${written.invalid})`, "warning");
  } else {
    setStatus(outputStatus, `${plural(vars.size, "variable")} as ${label}`, "success");
  }
}

function applyMode() {
  document.querySelectorAll(".mode-btn[data-format]").forEach((button) => {
    const current = button.dataset.side === "from" ? state.from : state.to;
    const active = button.dataset.format === current;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-show-from]").forEach((el) => {
    el.hidden = !el.dataset.showFrom.split(" ").includes(state.from);
  });
  document.querySelectorAll("[data-show-to]").forEach((el) => {
    el.hidden = !el.dataset.showTo.split(" ").includes(state.to);
  });

  const from = FORMATS[state.from].label;
  const to = FORMATS[state.to].label;
  document.title = `${from} → ${to} Converter`;
  inputTitle.textContent = `${from} Input`;
  outputTitle.textContent = `${to} Output`;
  input.placeholder = FORMATS[state.from].placeholder;
  output.placeholder = `${to} output will appear here…`;
  render();
}

function parseHash(value) {
  const [from, to] = String(value || "").split("-");
  if (FORMATS[from] && FORMATS[to] && from !== to) return { from, to };
  return null;
}

function commitMode() {
  window.DevToolsMain.writeHashState(`${state.from}-${state.to}`);
  applyMode();
}

// Carries the current output over as the new input.
function swapDirection() {
  const carried = state.outputIsCurrent ? state.text : "";
  [state.from, state.to] = [state.to, state.from];
  if (carried) input.value = carried;
  commitMode();
}

/* Picking the format already on the other side swaps rather than making an
 * .env → .env pair. Changing one side keeps the input, so someone who pastes
 * first and picks the format second doesn't lose what they pasted. */
function setFormat(side, format) {
  if (format === state[side]) return;
  const other = side === "from" ? "to" : "from";
  if (format === state[other]) {
    swapDirection();
    return;
  }
  state[side] = format;
  commitMode();
}

/* --- Actions ---------------------------------------------------------------- */

function detectFormat(name, text) {
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) return "json";
  if (/\.(sh|bash|zsh|fish|ps1)$/i.test(name)) return "shell";
  if (/^(#!|[ \t]*(set[ \t]+-\w*x|\$env:|\$\{env:))/im.test(text)) return "shell";
  return "env";
}

function loadText(text) {
  input.value = text;
  render();
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result);
    const format = detectFormat(file.name, text);
    if (format !== state.from) {
      if (format === state.to) state.to = state.from;
      state.from = format;
      input.value = text;
      commitMode();
    } else {
      loadText(text);
    }
    window.DevToolsMain.showToast(`Opened ${file.name}`, "success");
  };
  reader.onerror = () => window.DevToolsMain.showToast("Could not read that file", "error");
  reader.readAsText(file);
}

const ACTIONS = {
  swap: swapDirection,

  sample() {
    loadText(SAMPLES[state.from]);
    window.DevToolsMain.showToast("Sample inserted", "info");
  },

  open() {
    fileInput.click();
  },

  async paste() {
    try {
      loadText(await navigator.clipboard.readText());
    } catch {
      input.focus();
      window.DevToolsMain.showToast("Clipboard is not available", "error");
    }
  },

  clear() {
    loadText("");
    window.DevToolsMain.showToast("Cleared", "info");
  },

  copy() {
    if (!state.text) {
      window.DevToolsMain.showToast("Nothing to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(state.text);
    window.DevToolsMain.showToast(`${FORMATS[state.to].label} copied`, "success");
  },

  download() {
    if (!state.text) {
      window.DevToolsMain.showToast("Nothing to download", "error");
      return;
    }
    const text = `${state.text}\n`;
    if (state.to === "json") window.DevToolsMain.downloadText("env.json", text, "application/json");
    else if (state.to === "shell") window.DevToolsMain.downloadText(DIALECTS[dialectSelect.value].filename, text, "text/plain");
    // Browsers refuse dotfile names (".env" saves as "env.txt"), so the
    // extension carries the format instead.
    else window.DevToolsMain.downloadText("vars.env", text, "text/plain");
  },
};

/* --- Wiring ----------------------------------------------------------------- */

input.addEventListener("input", render);
[expandVars, dialectSelect, typedValues, sortKeys].forEach((control) => control.addEventListener("change", render));

document.querySelectorAll(".mode-btn[data-format]").forEach((button) => {
  button.addEventListener("click", () => setFormat(button.dataset.side, button.dataset.format));
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.());
});

fileInput.addEventListener("change", () => {
  readFile(fileInput.files[0]);
  fileInput.value = "";
});

input.addEventListener("dragover", (event) => {
  event.preventDefault();
  input.classList.add("is-dragover");
});
input.addEventListener("dragleave", () => input.classList.remove("is-dragover"));
input.addEventListener("drop", (event) => {
  event.preventDefault();
  input.classList.remove("is-dragover");
  readFile(event.dataTransfer.files[0]);
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

window.DevToolsMain.onHashState((value) => {
  const parsed = parseHash(value);
  if (!parsed || (parsed.from === state.from && parsed.to === state.to)) return;
  Object.assign(state, parsed);
  applyMode();
});

Object.assign(state, parseHash(window.DevToolsMain.readHashState()) || {});
applyMode();
