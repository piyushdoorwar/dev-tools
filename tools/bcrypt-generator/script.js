// Bcrypt Hash Generator — hash with a chosen cost and version prefix, verify a
// password against any $2a$/$2b$/$2y$ hash, and show what a hash is made of.
//
// The Blowfish work is done by bcryptjs (vendored at build time). Its async
// API yields to the event loop between chunks of rounds, so a cost-15 hash
// keeps the page responsive and can report progress.

const bcrypt = window.dcodeIO?.bcrypt;

const hashPassword = document.getElementById("hash-password");
const hashPasswordNote = document.getElementById("hash-password-note");
const costInput = document.getElementById("cost");
const costValue = document.getElementById("cost-value");
const costRounds = document.getElementById("cost-rounds");
const costEstimate = document.getElementById("cost-estimate");
const generateBtn = document.getElementById("generate-btn");
const progress = document.getElementById("hash-progress");
const hashOutput = document.getElementById("hash-output");
const hashStatus = document.getElementById("hash-status");
const versionSwitch = document.getElementById("version-switch");
const verifyPassword = document.getElementById("verify-password");
const verifyHash = document.getElementById("verify-hash");
const verdict = document.getElementById("verdict");
const verdictText = document.getElementById("verdict-text");
const anatomy = document.getElementById("anatomy");
const anatomyHash = document.getElementById("anatomy-hash");
const anatomyDetails = document.getElementById("anatomy-details");

const MAX_BYTES = 72;
// Verification re-runs as you type; waiting this long stops a cost-12 hash
// from being recomputed on every keystroke.
const VERIFY_DEBOUNCE_MS = 250;
const HASH_PATTERN = /^\$(2[abxy]?)\$(\d{2})\$([./A-Za-z0-9]{22})([./A-Za-z0-9]{31})$/;

const textEncoder = new TextEncoder();

const state = {
  version: "2b",
  busy: false,
  // Milliseconds per round measured on the last hash, used to estimate how
  // long another cost would take on this machine.
  msPerRound: null,
  verifyTimer: 0,
  verifyToken: 0,
};

function toast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

function setStatus(element, message, kind) {
  element.querySelector(".status-msg").textContent = message;
  element.className = `status-bar${kind ? ` is-${kind}` : ""}`;
}

function formatMs(ms) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

/* --- Pure helpers (also exercised by the tests) ---------------------------- */

function utf8Length(text) {
  return textEncoder.encode(text).length;
}

// Splits a hash into its parts, or explains why it is not one.
function parseHash(text) {
  const value = text.trim();
  if (!value) return { empty: true };
  const match = HASH_PATTERN.exec(value);
  if (!match) {
    if (!value.startsWith("$2")) return { error: "Not a bcrypt hash — it should start with $2a$, $2b$ or $2y$" };
    if (value.length !== 60) return { error: `A bcrypt hash is 60 characters; this one is ${value.length}` };
    return { error: "Not a bcrypt hash — the salt and hash use only ./A–Z a–z 0–9" };
  }
  const [, version, costText, salt, checksum] = match;
  const cost = Number(costText);
  if (cost < 4 || cost > 31) return { error: `Cost ${cost} is outside bcrypt's range of 4–31` };
  if (version === "2x") return { error: "$2x$ marks hashes from a buggy pre-2011 crypt_blowfish and cannot be verified safely" };
  return { version, cost, salt, checksum, value };
}

function saltFor(cost, version) {
  // bcryptjs always writes $2a$; the algorithm is the same for all three
  // prefixes, so swapping it in makes bcryptjs emit the requested one.
  return bcrypt.genSaltSync(cost).replace(/^\$2a\$/, `$${version}$`);
}

/* --- Hash ---------------------------------------------------------------- */

function renderCost() {
  const cost = Number(costInput.value);
  const rounds = 2 ** cost;
  costValue.textContent = String(cost);
  costRounds.textContent = `${rounds.toLocaleString("en-US")} rounds`;
  if (state.msPerRound) {
    const estimate = state.msPerRound * rounds;
    costEstimate.textContent = `About ${formatMs(estimate)} in this browser.${cost >= 14 ? " Native libraries are faster, but this is slow for a login path." : ""}`;
  } else {
    costEstimate.textContent = cost < 10 ? "Below 10 is weaker than OWASP recommends." : "Each step doubles the work.";
  }
  costEstimate.classList.toggle("is-warning", cost < 10);
}

function renderPasswordNote() {
  const bytes = utf8Length(hashPassword.value);
  hashPasswordNote.hidden = bytes <= MAX_BYTES;
  if (bytes > MAX_BYTES) {
    hashPasswordNote.textContent = `${bytes} bytes — bcrypt ignores everything after byte ${MAX_BYTES}, so the last ${bytes - MAX_BYTES} have no effect.`;
  }
}

function setBusy(busy) {
  state.busy = busy;
  generateBtn.disabled = busy;
  generateBtn.textContent = busy ? "Hashing…" : "Generate hash";
  progress.hidden = !busy;
  if (busy) progress.value = 0;
}

function generate() {
  if (state.busy) return;
  if (!bcrypt) {
    setStatus(hashStatus, "The bcrypt library failed to load", "error");
    return;
  }
  const password = hashPassword.value;
  const cost = Number(costInput.value);
  const version = state.version;
  setBusy(true);
  setStatus(hashStatus, `Hashing at cost ${cost}…`, "");

  const started = performance.now();
  bcrypt.hash(password, saltFor(cost, version), (error, hash) => {
    const elapsed = performance.now() - started;
    setBusy(false);
    if (error) {
      setStatus(hashStatus, `Hashing failed: ${error.message || error}`, "error");
      return;
    }
    state.msPerRound = elapsed / 2 ** cost;
    hashOutput.value = hash;
    renderCost();
    const emptyNote = password ? "" : " (of an empty password)";
    setStatus(hashStatus, `Hashed in ${formatMs(elapsed)} at cost ${cost}${emptyNote}`, password ? "success" : "warning");
  }, (fraction) => {
    progress.value = fraction;
  });
}

/* --- Verify -------------------------------------------------------------- */

function setVerdict(kind, message) {
  verdict.className = `verdict${kind ? ` is-${kind}` : ""}`;
  verdictText.textContent = message;
}

function renderAnatomy(parsed) {
  anatomy.hidden = !parsed || !parsed.value;
  if (anatomy.hidden) return;

  const parts = [
    ["seg-version", `$${parsed.version}$`],
    ["seg-cost", `${String(parsed.cost).padStart(2, "0")}$`],
    ["seg-salt", parsed.salt],
    ["seg-checksum", parsed.checksum],
  ];
  anatomyHash.replaceChildren(...parts.map(([className, text]) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }));

  const rows = [
    ["Version", `$${parsed.version}$`, "seg-version"],
    ["Cost", `${parsed.cost} (${(2 ** parsed.cost).toLocaleString("en-US")} rounds)`, "seg-cost"],
    ["Salt", parsed.salt, "seg-salt"],
    ["Hash", parsed.checksum, "seg-checksum"],
  ];
  anatomyDetails.replaceChildren();
  for (const [term, value, className] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    dt.className = className;
    const dd = document.createElement("dd");
    dd.textContent = value;
    anatomyDetails.append(dt, dd);
  }
}

function runVerify() {
  window.clearTimeout(state.verifyTimer);
  const token = ++state.verifyToken;
  const parsed = parseHash(verifyHash.value);
  verifyHash.classList.toggle("is-invalid", Boolean(parsed.error));
  renderAnatomy(parsed.error ? null : parsed);

  if (parsed.empty) {
    setVerdict("", "Enter a password and a hash to compare them.");
    return;
  }
  if (parsed.error) {
    setVerdict("error", parsed.error);
    return;
  }
  if (!bcrypt) {
    setVerdict("error", "The bcrypt library failed to load");
    return;
  }

  setVerdict("pending", `Checking at cost ${parsed.cost}…`);
  const password = verifyPassword.value;
  state.verifyTimer = window.setTimeout(() => {
    const started = performance.now();
    bcrypt.compare(password, parsed.value, (error, same) => {
      // A newer keystroke has already started another comparison.
      if (token !== state.verifyToken) return;
      const elapsed = formatMs(performance.now() - started);
      if (error) {
        setVerdict("error", `Could not verify: ${error.message || error}`);
        return;
      }
      const truncated = utf8Length(password) > MAX_BYTES ? ` Only the first ${MAX_BYTES} bytes of the password were compared.` : "";
      if (same) setVerdict("match", `Match — the password produces this hash (${elapsed}).${truncated}`);
      else setVerdict("mismatch", `No match — this password does not produce this hash (${elapsed}).${truncated}`);
    });
  }, VERIFY_DEBOUNCE_MS);
}

/* --- Actions ------------------------------------------------------------- */

function copy(value, label) {
  if (!value) {
    toast("Nothing to copy", "error");
    return;
  }
  window.DevToolsMain.copyText(value)
    .then(() => toast(`${label} copied`, "success"))
    .catch(() => toast("Copy failed", "error"));
}

const ACTIONS = {
  "copy-hash"() {
    copy(hashOutput.value, "Hash");
  },
  "send-to-verify"() {
    if (!hashOutput.value) {
      toast("Generate a hash first", "error");
      return;
    }
    verifyHash.value = hashOutput.value;
    verifyPassword.value = hashPassword.value;
    runVerify();
    toast("Hash sent to Verify", "info");
  },
  "paste-hash"() {
    navigator.clipboard.readText()
      .then((text) => {
        if (!text.trim()) {
          toast("Clipboard is empty", "error");
          return;
        }
        verifyHash.value = text.trim();
        runVerify();
        toast("Pasted from clipboard", "success");
      })
      .catch(() => toast("Clipboard is not available", "error"));
  },
  "clear-verify"() {
    verifyPassword.value = "";
    verifyHash.value = "";
    runVerify();
    verifyPassword.focus();
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) ACTIONS[button.dataset.action]?.();
});

versionSwitch.querySelectorAll("[data-version]").forEach((button) => {
  button.addEventListener("click", () => {
    state.version = button.dataset.version;
    versionSwitch.querySelectorAll("[data-version]").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    // Re-label an existing hash rather than recomputing it: the digest is
    // identical across the three prefixes.
    if (HASH_PATTERN.test(hashOutput.value)) {
      hashOutput.value = hashOutput.value.replace(/^\$2[aby]\$/, `$${state.version}$`);
    }
  });
});

generateBtn.addEventListener("click", generate);
hashPassword.addEventListener("input", renderPasswordNote);
hashPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") generate();
});
costInput.addEventListener("input", renderCost);
verifyPassword.addEventListener("input", runVerify);
verifyHash.addEventListener("input", runVerify);

document.getElementById("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

renderCost();
if (!bcrypt) {
  generateBtn.disabled = true;
  setStatus(hashStatus, "The bcrypt library failed to load", "error");
}
