// Text Case Converter — one input, six identifier styles at once.
//
// Every style is rebuilt from the same word list, so the six outputs never
// disagree about where one word ends and the next begins. "Line by line"
// mode runs the same conversion per input line instead of across the whole
// blob, which is what you want when converting a list of phrases into a list
// of identifiers rather than one long one.

const input = document.getElementById("input");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const CASES = ["camel", "pascal", "snake", "kebab", "constant", "title"];

const outputs = Object.fromEntries(
  CASES.map((key) => [key, document.getElementById(`out-${key}`)])
);

const state = {
  bulk: true,
};

const SAMPLE = "some-variable_name\nSomeClassName\nHTTPResponseCode\nis ready to ship";

/* --- Word splitting ------------------------------------------------------ */

// Boundaries: any non-alphanumeric run, a lower/digit-to-upper transition
// (fooBar -> foo Bar), and an acronym-to-word transition (XMLParser -> XML
// Parser). Words are lowercased once split, so the rebuilt case comes
// entirely from the target style rather than the input's original casing.
function splitWords(text) {
  if (!text) return [];
  return text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const CONVERTERS = {
  camel: (words) => words.map((word, index) => (index === 0 ? word : capitalize(word))).join(""),
  pascal: (words) => words.map(capitalize).join(""),
  snake: (words) => words.join("_"),
  kebab: (words) => words.join("-"),
  constant: (words) => words.map((word) => word.toUpperCase()).join("_"),
  title: (words) => words.map(capitalize).join(" "),
};

function convert(text) {
  const words = splitWords(text);
  return Object.fromEntries(CASES.map((key) => [key, CONVERTERS[key](words)]));
}

function convertBulk(text) {
  const lines = text.split(/\r?\n/);
  const perCase = Object.fromEntries(CASES.map((key) => [key, []]));
  for (const line of lines) {
    const converted = convert(line);
    for (const key of CASES) perCase[key].push(converted[key]);
  }
  return Object.fromEntries(CASES.map((key) => [key, perCase[key].join("\n")]));
}

/* --- Rendering ------------------------------------------------------------ */

function render() {
  const text = input.value;
  const results = state.bulk ? convertBulk(text) : convert(text);
  for (const key of CASES) outputs[key].value = results[key];
}

/* --- Actions ---------------------------------------------------------- */

function copyGuard(value, message = "Nothing to copy") {
  if (value.trim()) return true;
  window.DevToolsMain.showToast(message, "error");
  return false;
}

const CASE_LABELS = {
  camel: "camelCase",
  pascal: "PascalCase",
  snake: "snake_case",
  kebab: "kebab-case",
  constant: "CONSTANT_CASE",
  title: "Title Case",
};

const ACTIONS = {
  sample() {
    input.value = SAMPLE;
    render();
    window.DevToolsMain.showToast("Sample text inserted", "info");
  },

  clear() {
    input.value = "";
    render();
    window.DevToolsMain.showToast("Cleared", "info");
  },

  async paste() {
    try {
      input.value = await navigator.clipboard.readText();
      render();
    } catch {
      input.focus();
      window.DevToolsMain.showToast("Clipboard is not available", "error");
    }
  },

  "copy-case"(button) {
    const key = button.dataset.case;
    if (!copyGuard(outputs[key].value)) return;
    window.DevToolsMain.copyText(outputs[key].value);
    window.DevToolsMain.showToast(`${CASE_LABELS[key]} copied`, "success");
  },

  "copy-all"() {
    if (!copyGuard(input.value)) return;
    const text = CASES.map((key) => `${CASE_LABELS[key]}: ${outputs[key].value}`).join("\n");
    window.DevToolsMain.copyText(text);
    window.DevToolsMain.showToast("All cases copied", "success");
  },
};

/* --- Wiring -------------------------------------------------------------- */

input.addEventListener("input", render);

document.querySelectorAll(".mode-switch .mode-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const bulk = button.dataset.bulk === "true";
    if (bulk === state.bulk) return;
    state.bulk = bulk;

    document.querySelectorAll(".mode-switch .mode-btn").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    render();
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => ACTIONS[button.dataset.action]?.(button));
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

render();
