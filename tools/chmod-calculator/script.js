// Chmod Calculator — a permission mode in every notation at once.
//
// One integer is the whole state: bits 0-8 are the rwx triads, bits 9-11 are
// sticky/setgid/setuid. The octal field, the symbolic field, the checkbox grid
// and the commands are all views over it, so editing any of them is the same
// edit. Everything else here is presentation: the plain-English reading, the
// warnings, and the umask mode, which is the same arithmetic run backwards.

const DATA = globalThis.CHMOD_DATA;

const CLASSES = [
  { key: "owner", label: "Owner", who: "u", shift: 6 },
  { key: "group", label: "Group", who: "g", shift: 3 },
  { key: "other", label: "Others", who: "o", shift: 0 },
];

const PERMS = [
  { key: "r", label: "Read", value: 4 },
  { key: "w", label: "Write", value: 2 },
  { key: "x", label: "Execute", value: 1 },
];

const SPECIAL_BY_KEY = new Map(DATA.special.map((bit) => [bit.key, bit]));
const SETUID = SPECIAL_BY_KEY.get("setuid").bit;
const SETGID = SPECIAL_BY_KEY.get("setgid").bit;
const STICKY = SPECIAL_BY_KEY.get("sticky").bit;

const state = {
  mode: 0o644,
  type: "file",
  view: "mode",
  umask: 0o022,
};

const el = (id) => document.getElementById(id);

const octalInput = el("octal");
const symbolicInput = el("symbolic");
const entryError = el("entry-error");
const matrixBody = el("matrix-body");
const specialGrid = el("special-grid");
const presetGrid = el("preset-grid");
const targetInput = el("target");
const recursiveInput = el("recursive");
const umaskInput = el("umask");
const umaskError = el("umask-error");

/* --- Mode arithmetic ----------------------------------------------------- */

/** The nine rwx bits, ignoring setuid/setgid/sticky. */
const permBits = (mode) => mode & 0o777;

/** Three or four octal digits; the special digit only when it is non-zero. */
function octalOf(mode, { pad = true } = {}) {
  const special = (mode >> 9) & 7;
  const body = permBits(mode).toString(8).padStart(3, "0");
  if (special) return `${special}${body}`;
  return pad ? `0${body}` : body;
}

/* The symbolic form folds the special bits into the execute column: lowercase
   when execute is also set, uppercase when it is not. A capital letter is the
   tool's main way of showing that a special bit will do nothing. */
function symbolicOf(mode) {
  const triads = CLASSES.map(({ shift }) => {
    const digit = (mode >> shift) & 7;
    return [digit & 4 ? "r" : "-", digit & 2 ? "w" : "-", digit & 1 ? "x" : "-"];
  });
  if (mode & SETUID) triads[0][2] = mode & 0o100 ? "s" : "S";
  if (mode & SETGID) triads[1][2] = mode & 0o010 ? "s" : "S";
  if (mode & STICKY) triads[2][2] = mode & 0o001 ? "t" : "T";
  return triads.map((triad) => triad.join("")).join("");
}

function parseOctal(text) {
  const value = text.trim();
  if (!/^[0-7]{1,4}$/.test(value)) return null;
  return parseInt(value, 8);
}

/* Accepts `rwxr-xr-x` and the ten-character `ls -l` form, whose leading
   character is the file type rather than a permission. */
function parseSymbolic(text) {
  // `ls -l` appends "." (SELinux context) or "+" (ACL) on many systems, and
  // "@" (extended attributes) on macOS: `-rw-r--r--.` pasted as-is must work.
  let value = text.trim().replace(/^([-a-zA-Z]{10})[.+@]$/, "$1");
  if (value.length === 10) value = value.slice(1);
  if (value.length !== 9) return null;

  let mode = 0;
  for (const [index, klass] of CLASSES.entries()) {
    const [read, write, execute] = value.slice(index * 3, index * 3 + 3);
    if (read === "r") mode |= 4 << klass.shift;
    else if (read !== "-") return null;
    if (write === "w") mode |= 2 << klass.shift;
    else if (write !== "-") return null;

    const special = [SETUID, SETGID, STICKY][index];
    const letters = index === 2 ? ["t", "T"] : ["s", "S"];
    if (execute === "x") mode |= 1 << klass.shift;
    else if (execute === letters[0]) mode |= (1 << klass.shift) | special;
    else if (execute === letters[1]) mode |= special;
    else if (execute !== "-") return null;
  }
  return mode;
}

/* --- Commands ------------------------------------------------------------ */

/* A path only needs quoting when the shell would otherwise split or expand
   it. Quoting everything would make the copied command noisy for the common
   case, which is a bare relative path. */
function shellQuote(path) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(path)) return path;
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

function targetPath() {
  const typed = targetInput.value.trim();
  if (typed) return shellQuote(typed);
  return state.type === "dir" ? "path/to/dir" : "path/to/file";
}

/* The symbolic command is where the S/T distinction bites. `u=rws` would grant
   execute as a side effect, so a special bit whose execute bit is clear has to
   be applied by its own `+s` clause instead of being folded into the `=`. */
function symbolicCommand(mode) {
  const clauses = [];
  const extra = [];

  for (const [index, klass] of CLASSES.entries()) {
    const digit = (mode >> klass.shift) & 7;
    let letters = PERMS.filter((perm) => digit & perm.value).map((perm) => perm.key).join("");
    const special = [SETUID, SETGID, STICKY][index];
    const letter = index === 2 ? "t" : "s";
    if (mode & special) {
      if (digit & 1) letters += letter;
      else extra.push(`${klass.who}+${letter}`);
    }
    clauses.push(`${klass.who}=${letters}`);
  }
  return [...clauses, ...extra].join(",");
}

function commands(mode) {
  const flag = recursiveInput.checked ? "-R " : "";
  return [
    { label: "Numeric", command: `chmod ${flag}${octalOf(mode, { pad: false })} ${targetPath()}` },
    { label: "Symbolic", command: `chmod ${flag}${symbolicCommand(mode)} ${targetPath()}` },
  ];
}

/* --- Plain English ------------------------------------------------------- */

function meaningFor(mode, type) {
  const verbs = DATA.verbs[type];
  return CLASSES.map((klass) => {
    const digit = (mode >> klass.shift) & 7;
    const allowed = PERMS.filter((perm) => digit & perm.value).map((perm) => verbs[perm.key]);
    const who = klass.key === "other" ? "Everyone else" : klass.label;
    if (allowed.length === 0) return { who, text: "nothing at all", empty: true };
    const text = allowed.length === 1
      ? allowed[0]
      : `${allowed.slice(0, -1).join(", ")} and ${allowed.at(-1)}`;
    return { who, text, empty: false };
  });
}

/* Notices are the reason to use a calculator rather than do the arithmetic in
   your head: they catch the modes that are syntactically fine and operationally
   wrong. `level` is warn or note — a note is behaviour worth knowing, a warning
   is something that is probably a mistake. */
function noticesFor(mode, type) {
  const notices = [];
  const perms = permBits(mode);
  const dir = type === "dir";

  if (perms === 0o777) {
    notices.push({ level: "warn", text: "777 gives every user on the machine full control. It is almost never the fix for a permission problem — it is a way of not finding one." });
  } else if (mode & 0o002) {
    notices.push({ level: "warn", text: dir
      ? "World-writable directory: any user can create and delete entries here."
      : "World-writable file: any user on the system can rewrite its contents." });
  }

  if (dir && mode & 0o002 && !(mode & STICKY)) {
    notices.push({ level: "warn", text: "A world-writable directory without the sticky bit lets any user delete another user's files. This is why /tmp is 1777." });
  }

  if (mode & SETUID) {
    if (dir) {
      notices.push({ level: "note", text: "setuid has no effect on a directory on Linux. Some BSDs use it for other purposes; do not rely on it." });
    } else if (!(mode & 0o100)) {
      notices.push({ level: "warn", text: "setuid is set but the owner has no execute bit, shown as the capital S. The bit is stored and does nothing." });
    } else {
      notices.push({ level: "warn", text: "setuid: this program runs with the owner's privileges whoever launches it. If the owner is root, every bug in it is a privilege escalation." });
    }
    if (mode & 0o022) {
      notices.push({ level: "warn", text: "A setuid program that is group- or world-writable can be replaced by whoever can write it, and will then run as its owner." });
    }
  }

  if (mode & SETGID) {
    if (dir) {
      notices.push({ level: "note", text: "setgid on a directory: new files and subdirectories inherit its group instead of the creator's. This is the usual way to run a shared project directory." });
    } else if (!(mode & 0o010)) {
      notices.push({ level: "warn", text: "setgid is set but the group has no execute bit, shown as the capital S. On Linux this combination means mandatory locking, not setgid." });
    } else {
      notices.push({ level: "warn", text: "setgid: this program runs with the file's group privileges regardless of who launches it." });
    }
  }

  if (mode & STICKY && !dir) {
    notices.push({ level: "note", text: "The sticky bit is ignored on regular files by every current Unix. It only restrains deletion inside a directory." });
  }

  if (dir && (mode & 0o400) && !(mode & 0o100)) {
    notices.push({ level: "warn", text: "Read without execute on a directory: the owner can list the names but cannot open anything inside, not even by full path." });
  }
  if (dir && !(mode & 0o100)) {
    notices.push({ level: "warn", text: "The owner cannot enter this directory. Without execute, nothing inside is reachable." });
  }
  if (!dir && !(mode & 0o400)) {
    notices.push({ level: "warn", text: "The owner cannot read this file. They can still chmod it back — ownership is what grants that, not the mode." });
  }
  if (perms === 0) {
    notices.push({ level: "note", text: "Mode 000 blocks everyone except root, who ignores the mode entirely." });
  }

  return notices;
}

/* --- Rendering ----------------------------------------------------------- */

function buildMatrix() {
  for (const klass of CLASSES) {
    const row = document.createElement("tr");

    const head = document.createElement("th");
    head.scope = "row";
    head.className = "row-head";
    head.append(klass.label);
    const who = document.createElement("span");
    who.className = "row-who";
    who.textContent = klass.who;
    head.appendChild(who);
    row.appendChild(head);

    for (const perm of PERMS) {
      const cell = document.createElement("td");
      const label = document.createElement("label");
      label.className = "cell";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.perm = `${klass.key}-${perm.key}`;
      box.setAttribute("aria-label", `${klass.label} ${perm.label}`);
      box.addEventListener("change", () => {
        const bit = perm.value << klass.shift;
        setMode(box.checked ? state.mode | bit : state.mode & ~bit);
      });

      const face = document.createElement("span");
      face.className = "cell-face";
      face.textContent = perm.key;

      label.append(box, face);
      cell.appendChild(label);
      row.appendChild(cell);
    }

    const digit = document.createElement("td");
    digit.className = "digit-col mono";
    digit.dataset.digit = klass.key;
    row.appendChild(digit);

    matrixBody.appendChild(row);
  }
}

function buildSpecial() {
  for (const bit of DATA.special) {
    const label = document.createElement("label");
    label.className = "special-item";

    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.special = bit.key;
    box.addEventListener("change", () => {
      setMode(box.checked ? state.mode | bit.bit : state.mode & ~bit.bit);
    });

    const text = document.createElement("span");
    text.className = "special-text";

    const name = document.createElement("span");
    name.className = "special-name";
    name.textContent = bit.label;
    const value = document.createElement("span");
    value.className = "special-value mono";
    value.textContent = `${bit.digit}000`;
    const summary = document.createElement("span");
    summary.className = "special-summary";
    summary.textContent = bit.summary;

    text.append(name, value, summary);
    label.append(box, text);
    specialGrid.appendChild(label);
  }
}

function buildPresets(target, presets, onPick) {
  for (const preset of presets) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-preset";
    button.dataset.preset = preset.octal;

    const octal = document.createElement("span");
    octal.className = "preset-octal mono";
    octal.textContent = preset.octal;
    const label = document.createElement("span");
    label.className = "preset-label";
    label.textContent = preset.label;
    const note = document.createElement("span");
    note.className = "preset-note";
    note.textContent = preset.note;

    button.append(octal, label, note);
    button.addEventListener("click", () => onPick(preset));
    target.appendChild(button);
  }
}

function renderCommands(target, rows) {
  target.innerHTML = "";
  for (const row of rows) {
    const line = document.createElement("div");
    line.className = "command";

    const label = document.createElement("span");
    label.className = "command-label";
    label.textContent = row.label;

    const code = document.createElement("code");
    code.className = "command-text mono";
    code.textContent = row.command;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "action-btn";
    copy.dataset.copy = row.command;
    copy.setAttribute("aria-label", `Copy the ${row.label.toLowerCase()} command`);
    copy.dataset.tooltip = "Copy";
    copy.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
    copy.addEventListener("click", () => {
      window.DevToolsMain.copyText(row.command);
      window.DevToolsMain.showToast("Command copied", "success");
    });

    line.append(label, code, copy);
    target.appendChild(line);
  }
}

function renderNotices(target, notices) {
  target.innerHTML = "";
  for (const notice of notices) {
    const item = document.createElement("p");
    item.className = `notice notice-${notice.level}`;
    item.dataset.level = notice.level;
    item.textContent = notice.text;
    target.appendChild(item);
  }
}

function renderMode() {
  const { mode, type } = state;

  for (const klass of CLASSES) {
    const digit = (mode >> klass.shift) & 7;
    for (const perm of PERMS) {
      const box = matrixBody.querySelector(`[data-perm="${klass.key}-${perm.key}"]`);
      box.checked = Boolean(digit & perm.value);
    }
    matrixBody.querySelector(`[data-digit="${klass.key}"]`).textContent = String(digit);
  }
  for (const bit of DATA.special) {
    specialGrid.querySelector(`[data-special="${bit.key}"]`).checked = Boolean(mode & bit.bit);
  }

  const symbolic = symbolicOf(mode);
  el("out-octal").textContent = octalOf(mode);
  el("out-symbolic").textContent = symbolic;
  el("out-ls").textContent = `${type === "dir" ? "d" : "-"}${symbolic}`;

  if (document.activeElement !== octalInput) octalInput.value = octalOf(mode, { pad: false });
  if (document.activeElement !== symbolicInput) symbolicInput.value = symbolic;

  for (const button of presetGrid.querySelectorAll(".mode-preset")) {
    button.classList.toggle("is-active", parseInt(button.dataset.preset, 8) === mode);
  }

  renderCommands(el("commands"), commands(mode));

  const meaning = el("meaning");
  meaning.innerHTML = "";
  for (const entry of meaningFor(mode, type)) {
    const item = document.createElement("li");
    item.className = entry.empty ? "meaning-item is-empty" : "meaning-item";
    const who = document.createElement("span");
    who.className = "meaning-who";
    who.textContent = entry.who;
    item.append(who, document.createTextNode(entry.empty ? " gets nothing at all." : ` can ${entry.text}.`));
    meaning.appendChild(item);
  }

  renderNotices(el("notices"), noticesFor(mode, type));

  document.title = `chmod ${octalOf(mode, { pad: false })} — Chmod Calculator`;
}

/* --- Umask --------------------------------------------------------------- */

/* The kernel clears every bit the mask names from a base of 666 for files and
   777 for directories. The base is where the "why isn't my file executable"
   question comes from: a file never starts with execute to begin with. */
const applyUmask = (base, umask) => base & ~umask & 0o777;

function renderUmask() {
  const umask = state.umask;
  const file = applyUmask(0o666, umask);
  const dir = applyUmask(0o777, umask);

  el("umask-file-octal").textContent = file.toString(8).padStart(3, "0");
  el("umask-file-symbolic").textContent = symbolicOf(file);
  el("umask-dir-octal").textContent = dir.toString(8).padStart(3, "0");
  el("umask-dir-symbolic").textContent = symbolicOf(dir);

  const describe = (mode) => meaningFor(mode, "file")
    .filter((entry) => entry.empty)
    .map((entry) => entry.who.toLowerCase());
  const denied = describe(file);
  el("umask-file-note").textContent = denied.length
    ? `Nothing for ${denied.join(" or ")}.`
    : "Every class gets something.";
  const deniedDir = describe(dir);
  el("umask-dir-note").textContent = deniedDir.length
    ? `Nothing for ${deniedDir.join(" or ")}.`
    : "Every class gets something.";

  // `umask -S` prints what is allowed, not what is masked — the inverse of the
  // number, which is the most common source of confusion about the command.
  const allowed = symbolicCommand(applyUmask(0o777, umask))
    .split(",")
    .filter((clause) => !clause.includes("+"))
    .join(",");

  renderCommands(el("umask-commands"), [
    { label: "Set", command: `umask ${umask.toString(8).padStart(3, "0")}` },
    { label: "Symbolic", command: `umask -S ${allowed}` },
  ]);

  const notices = [];
  if (umask & 0o111) {
    notices.push({ level: "note", text: "Masking execute bits only affects directories and programs you create; a new file has no execute bit to remove." });
  }
  if (!(umask & 0o007)) {
    notices.push({ level: "warn", text: "This mask leaves other users read access to everything you create, and with 000, write access too." });
  }
  if (umask & 0o700) {
    notices.push({ level: "warn", text: "This mask removes the owner's own access from every new file. Almost certainly not what you want." });
  }
  renderNotices(el("umask-notices"), notices);

  for (const button of el("umask-preset-grid").querySelectorAll(".mode-preset")) {
    button.classList.toggle("is-active", parseInt(button.dataset.preset, 8) === umask);
  }

  if (document.activeElement !== umaskInput) umaskInput.value = umask.toString(8).padStart(3, "0");
}

/* --- State transitions --------------------------------------------------- */

function setMode(mode, { hash = true } = {}) {
  state.mode = mode & 0o7777;
  showError(null);
  renderMode();
  if (hash) writeHash();
}

function setUmask(umask, { hash = true } = {}) {
  state.umask = umask & 0o777;
  umaskError.hidden = true;
  renderUmask();
  if (hash) writeHash();
}

function setType(type) {
  state.type = type;
  for (const button of document.querySelectorAll("[data-type]")) {
    const active = button.dataset.type === type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  targetInput.placeholder = type === "dir" ? "path/to/dir" : "path/to/file";
  // Execute reads differently on a directory, and the default path in the
  // commands changes with it, so the whole result panel is re-rendered.
  renderMode();
}

function setView(view) {
  state.view = view;
  for (const button of document.querySelectorAll("[data-mode]")) {
    const active = button.dataset.mode === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  }
  el("mode-panel").hidden = view !== "mode";
  el("umask-panel").hidden = view !== "umask";
  writeHash();
}

function showError(message) {
  entryError.hidden = !message;
  entryError.textContent = message || "";
  octalInput.closest(".entry").classList.toggle("has-error", Boolean(message));
}

/* --- Deep links ---------------------------------------------------------- */

// /tools/chmod-calculator/#755 opens on that mode; #umask=022 opens the other
// tab on that mask. Both are shareable, which is the point of putting them in
// the hash rather than keeping the state in memory.
// Through the shared helper, which uses replaceState: assigning
// location.hash pushed a history entry for every keystroke and click, so Back
// replayed each edit (and, in the dashboard iframe, hijacked the shell's Back).
function writeHash() {
  const next = state.view === "umask"
    ? `umask=${state.umask.toString(8).padStart(3, "0")}`
    : octalOf(state.mode, { pad: false });
  window.DevToolsMain.writeHashState(next);
}

function readHash() {
  const hash = decodeURIComponent(window.location.hash.slice(1));
  const umask = /^umask=([0-7]{1,4})$/.exec(hash);
  if (umask) {
    state.umask = parseInt(umask[1], 8) & 0o777;
    return "umask";
  }
  const mode = /^[0-7]{1,4}$/.exec(hash);
  if (mode) {
    state.mode = parseInt(mode[0], 8) & 0o7777;
    return "mode";
  }
  return null;
}

/* --- Wiring -------------------------------------------------------------- */

octalInput.addEventListener("input", () => {
  const parsed = parseOctal(octalInput.value);
  if (parsed === null) {
    showError(octalInput.value.trim() ? "A mode is one to four digits, each 0-7." : "Enter a mode.");
    return;
  }
  setMode(parsed);
});

symbolicInput.addEventListener("input", () => {
  const parsed = parseSymbolic(symbolicInput.value);
  if (parsed === null) {
    showError("A symbolic mode is nine characters, like rwxr-xr-x.");
    return;
  }
  setMode(parsed);
});

umaskInput.addEventListener("input", () => {
  const parsed = parseOctal(umaskInput.value);
  if (parsed === null) {
    umaskError.hidden = false;
    umaskError.textContent = "A umask is one to three digits, each 0-7.";
    return;
  }
  setUmask(parsed);
});

targetInput.addEventListener("input", () => renderCommands(el("commands"), commands(state.mode)));
recursiveInput.addEventListener("change", () => renderCommands(el("commands"), commands(state.mode)));

for (const button of document.querySelectorAll("[data-type]")) {
  button.addEventListener("click", () => setType(button.dataset.type));
}
for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => setView(button.dataset.mode));
}

const ACTIONS = {
  reset() {
    setMode(0o644);
    setType("file");
    window.DevToolsMain.showToast("Reset to 644", "info");
  },

  "copy-link"() {
    const link = `${window.location.origin}${window.location.pathname}#${octalOf(state.mode, { pad: false })}`;
    window.DevToolsMain.copyText(link);
    window.DevToolsMain.showToast("Link copied", "success");
  },

  "copy-umask"() {
    const command = `umask ${state.umask.toString(8).padStart(3, "0")}`;
    window.DevToolsMain.copyText(command);
    window.DevToolsMain.showToast("Command copied", "success");
  },
};

for (const button of document.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.());
}

el("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState(() => {
  const view = readHash();
  if (!view) return;
  if (view !== state.view) setView(view);
  renderMode();
  renderUmask();
});

function init() {
  buildMatrix();
  buildSpecial();
  buildPresets(presetGrid, DATA.presets, (preset) => {
    setMode(parseInt(preset.octal, 8));
    setType(preset.kind);
  });
  buildPresets(el("umask-preset-grid"), DATA.umaskPresets, (preset) => setUmask(parseInt(preset.octal, 8)));

  const view = readHash();
  renderMode();
  renderUmask();
  if (view === "umask") setView("umask");
}

init();
