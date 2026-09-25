// Color Converter — HEX / RGB / HSL / OKLCH plus a WCAG contrast check.
//
// Everything funnels through one representation: sRGB channels held as 0–255
// floats with a separate 0–1 alpha. Rounding happens only when a format is
// rendered, so a round trip through OKLCH does not drift a channel by a unit.

const fgInput = document.getElementById("fg-input");
const bgInput = document.getElementById("bg-input");
const fgError = document.getElementById("fg-error");
const bgError = document.getElementById("bg-error");
const formatsNode = document.getElementById("formats");
const gamutNote = document.getElementById("gamut-note");
const preview = document.getElementById("preview");
const ratioNode = document.getElementById("ratio");
const ratioNote = document.getElementById("ratio-note");
const checksNode = document.getElementById("checks");
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");

const DEFAULTS = { fg: "#FFFFFF", bg: "#6739B7" };

const state = {
  fg: null,          // { r, g, b, a } or null while the field is invalid
  bg: null,
  target: "fg",      // which colour the conversion list is showing
  raw: { fg: "", bg: "" },  // what the user typed, kept for the OKLCH row
};

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const round = (value, places) => {
  const factor = 10 ** places;
  // +0 turns -0 into 0, which would otherwise render as "-0" in a channel.
  return Math.round(value * factor) / factor + 0;
};

/* --- sRGB <-> OKLab ----------------------------------------------------- */

// The sRGB transfer function. Not a plain 2.2 power curve: the linear segment
// near black matters for both OKLab and the WCAG luminance below.
const toLinear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toGamma = (linear) => {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return c * 255;
};

// Björn Ottosson's OKLab matrices, via the LMS cone responses.
function rgbToOklab({ r, g, b }) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

// Returns unclamped channels so the caller can tell sRGB-representable colours
// from ones that only exist in a wider gamut.
function oklabToRgbRaw({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  };
}

// A hair outside 0–255 is rounding noise from the matrices, not a real
// out-of-gamut colour; only flag what a user could actually have meant.
const IN_GAMUT_SLACK = 0.5;

function oklabToRgb(lab) {
  const raw = oklabToRgbRaw(lab);
  const inGamut = ["r", "g", "b"].every((k) => raw[k] >= -IN_GAMUT_SLACK && raw[k] <= 255 + IN_GAMUT_SLACK);
  return {
    r: clamp(raw.r, 0, 255),
    g: clamp(raw.g, 0, 255),
    b: clamp(raw.b, 0, 255),
    inGamut,
  };
}

function rgbToOklch(rgb) {
  const { L, a, b } = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  // Below this the hue is numerically meaningless — it is grey.
  let h = C < 1e-6 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

function oklchToRgb({ L, C, h }) {
  const rad = (h * Math.PI) / 180;
  return oklabToRgb({ L, a: C * Math.cos(rad), b: C * Math.sin(rad) });
}

/* --- HSL ---------------------------------------------------------------- */

function rgbToHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rr) h = ((gg - bb) / d) % 6;
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/* --- Parsing ------------------------------------------------------------ */

const NUM = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?`;

// A component is a number, a percentage, or `none` (CSS Color 4 missing value,
// which resolves to zero here).
function component(token, { percentOf = 1 } = {}) {
  const text = token.trim();
  if (!text) return null;
  if (text === "none") return 0;
  if (text.endsWith("%")) {
    const value = Number(text.slice(0, -1));
    return Number.isFinite(value) ? (value / 100) * percentOf : null;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function angle(token) {
  const text = token.trim().toLowerCase();
  if (text === "none") return 0;
  const match = text.match(new RegExp(`^(${NUM})(deg|grad|rad|turn)?$`));
  if (!match) return null;
  const value = Number(match[1]);
  switch (match[2]) {
    case "grad": return (value * 360) / 400;
    case "rad": return (value * 180) / Math.PI;
    case "turn": return value * 360;
    default: return value;
  }
}

const alphaOf = (token) => {
  if (token === undefined) return 1;
  const value = component(token, { percentOf: 1 });
  return value === null ? null : clamp(value, 0, 1);
};

// `rgb(1 2 3 / 50%)` and `rgb(1, 2, 3, 0.5)` are both legal; split on either
// separator and let the component parser handle the rest.
function args(body) {
  const [head, tail] = body.split("/");
  const parts = head.trim().split(/[\s,]+/).filter(Boolean);
  if (tail !== undefined) parts.push(tail.trim());
  return parts;
}

function parseHex(text) {
  const match = text.match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3 || digits.length === 4) {
    digits = [...digits].map((d) => d + d).join("");
  }
  if (digits.length !== 6 && digits.length !== 8) return null;
  const value = (index) => parseInt(digits.slice(index, index + 2), 16);
  return {
    r: value(0),
    g: value(2),
    b: value(4),
    a: digits.length === 8 ? value(6) / 255 : 1,
  };
}

function parseFunctional(text) {
  const match = text.match(/^([a-z]+)\((.*)\)$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const parts = args(match[2]);
  // Three channels plus an optional alpha; `rgb(1 2 3 4 5)` is not a colour,
  // so extra components must fail rather than be silently dropped.
  if (parts.length < 3 || parts.length > 4) return null;

  const alpha = alphaOf(parts[3]);
  if (alpha === null) return null;

  if (name === "rgb" || name === "rgba") {
    const channels = parts.slice(0, 3).map((part) => component(part, { percentOf: 255 }));
    if (channels.some((value) => value === null)) return null;
    const [r, g, b] = channels.map((value) => clamp(value, 0, 255));
    return { r, g, b, a: alpha };
  }

  if (name === "hsl" || name === "hsla") {
    const h = angle(parts[0]);
    // CSS Color 4 lets saturation and lightness drop the `%`: `hsl(120 50 50)`
    // means 50%, not 50 clamped to 100%. Either way the value is a percentage.
    const percent = (token) => {
      const value = component(token.endsWith("%") ? token.slice(0, -1) : token);
      return value === null ? null : value / 100;
    };
    const s = percent(parts[1]);
    const l = percent(parts[2]);
    if (h === null || s === null || l === null) return null;
    return { ...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)), a: alpha };
  }

  if (name === "oklch" || name === "oklab") {
    // In CSS, 100% of OKLCH chroma is 0.4 and 100% of OKLab a/b is 0.4.
    const L = component(parts[0], { percentOf: 1 });
    const second = component(parts[1], { percentOf: 0.4 });
    if (L === null || second === null) return null;

    if (name === "oklch") {
      const h = angle(parts[2]);
      if (h === null) return null;
      const { r, g, b, inGamut } = oklchToRgb({ L: clamp(L, 0, 1), C: Math.max(second, 0), h });
      return { r, g, b, a: alpha, inGamut, source: { L: clamp(L, 0, 1), C: Math.max(second, 0), h } };
    }

    const third = component(parts[2], { percentOf: 0.4 });
    if (third === null) return null;
    const { r, g, b, inGamut } = oklabToRgb({ L: clamp(L, 0, 1), a: second, b: third });
    return { r, g, b, a: alpha, inGamut };
  }

  return null;
}

// Named keywords, `transparent`, and anything else the engine understands. A
// hidden probe is the only way to resolve those without shipping a table.
let probe = null;
function parseViaEngine(text) {
  if (!/^[a-z]+$/i.test(text)) return null;
  if (!probe) {
    probe = document.createElement("span");
    probe.setAttribute("aria-hidden", "true");
    probe.style.display = "none";
    document.body.appendChild(probe);
  }
  probe.style.color = "";
  probe.style.color = text;
  // An unrecognised keyword is refused by the CSSOM and leaves the property
  // empty, which is the validity check.
  if (!probe.style.color) return null;
  const computed = getComputedStyle(probe).color;
  return parseFunctional(computed.replace(/^rgba/, "rgb"));
}

function parseColor(raw) {
  const text = raw.trim();
  if (!text) return { ok: false, empty: true };
  // Keywords are tried before bare hex, so a word like `bisque` keeps its
  // meaning; only then is `6739B7` (hex copied without its `#`) accepted.
  const parsed = parseHex(text) || parseFunctional(text) || parseViaEngine(text)
    || (/^[0-9a-f]{3,8}$/i.test(text) ? parseHex(`#${text}`) : null);
  if (!parsed) return { ok: false, error: "Not a colour this browser recognises." };
  return { ok: true, color: { inGamut: true, ...parsed } };
}

/* --- Formatting --------------------------------------------------------- */

const hexPair = (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase();

function formatHex({ r, g, b, a }) {
  const base = `#${hexPair(r)}${hexPair(g)}${hexPair(b)}`;
  return a < 1 ? `${base}${hexPair(a * 255)}` : base;
}

const alphaSuffix = (a) => (a < 1 ? ` / ${round(a * 100, 1)}%` : "");

function formatRgb({ r, g, b, a }) {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}${alphaSuffix(a)})`;
}

function formatHsl(color) {
  const { h, s, l } = rgbToHsl(color);
  return `hsl(${round(h, 2)} ${round(s * 100, 2)}% ${round(l * 100, 2)}%${alphaSuffix(color.a)})`;
}

function formatOklch(color) {
  // Prefer what the user typed: converting their oklch() to sRGB and back
  // would silently rewrite an out-of-gamut colour into a clipped one.
  const { L, C, h } = color.source ?? rgbToOklch(color);
  return `oklch(${round(L, 4)} ${round(C, 4)} ${round(h, 2)}${alphaSuffix(color.a)})`;
}

// Only shown when it is exact — a near miss would be worse than no row.
const CSS_KEYWORDS = [
  "black", "silver", "gray", "white", "maroon", "red", "purple", "fuchsia", "green", "lime",
  "olive", "yellow", "navy", "blue", "teal", "aqua", "orange", "rebeccapurple", "crimson",
  "coral", "tomato", "gold", "indigo", "violet", "pink", "salmon", "khaki", "turquoise",
  "chocolate", "tan", "plum", "orchid", "lavender", "beige", "ivory", "azure", "wheat",
  "skyblue", "steelblue", "slategray", "seagreen", "firebrick", "goldenrod", "midnightblue",
];

// Built once: resolving 45 keywords through the engine on every keystroke
// would put a forced style recalc in the middle of typing.
let keywordsByHex = null;
function keywordFor(color) {
  if (color.a < 1) return null;
  if (!keywordsByHex) {
    keywordsByHex = new Map();
    for (const name of CSS_KEYWORDS) {
      const parsed = parseViaEngine(name);
      if (parsed) keywordsByHex.set(formatHex({ ...parsed, a: 1 }), name);
    }
  }
  return keywordsByHex.get(formatHex({ ...color, a: 1 })) ?? null;
}

function formatsFor(color) {
  const rows = [
    ["HEX", formatHex(color)],
    ["RGB", formatRgb(color)],
    ["HSL", formatHsl(color)],
    ["OKLCH", formatOklch(color)],
  ];
  const keyword = keywordFor(color);
  if (keyword) rows.push(["CSS keyword", keyword]);
  return rows;
}

/* --- Contrast ----------------------------------------------------------- */

// WCAG 2.2 relative luminance, on linearised sRGB.
function luminance({ r, g, b }) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// A translucent foreground is judged on what is actually seen, so composite it
// over the background first. The background itself is assumed opaque — there is
// nothing behind it to composite against.
function composite(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function contrastRatio(fg, bg) {
  const l1 = luminance(composite(fg, bg));
  const l2 = luminance({ ...bg, a: 1 });
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

const CHECKS = [
  { label: "Normal text", level: "AA", min: 4.5 },
  { label: "Normal text", level: "AAA", min: 7 },
  { label: "Large text", level: "AA", min: 3 },
  { label: "Large text", level: "AAA", min: 4.5 },
  { label: "UI & graphics", level: "AA", min: 3 },
];

/* --- Rendering ---------------------------------------------------------- */

function row(label, value) {
  const item = document.createElement("div");
  item.className = "result-row";

  const name = document.createElement("span");
  name.className = "result-label";
  name.textContent = label;

  const val = document.createElement("span");
  val.className = "result-value mono";
  val.textContent = value;

  const copy = document.createElement("button");
  copy.className = "action-btn result-copy";
  copy.type = "button";
  copy.dataset.tooltip = "Copy";
  copy.setAttribute("aria-label", `Copy ${label}`);
  copy.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#i-copy"></use></svg>';
  copy.addEventListener("click", () => {
    window.DevToolsMain.copyText(value);
    window.DevToolsMain.showToast(`${label} copied`, "success");
  });

  item.append(name, val, copy);
  return item;
}

function renderFormats() {
  const color = state[state.target];
  formatsNode.innerHTML = "";
  if (!color) {
    formatsNode.innerHTML = '<p class="empty-state">Enter a valid colour to see every format.</p>';
    gamutNote.hidden = true;
    return;
  }
  for (const [label, value] of formatsFor(color)) formatsNode.appendChild(row(label, value));
  gamutNote.hidden = color.inGamut !== false;
  gamutNote.textContent = color.inGamut === false
    ? "Outside the sRGB gamut — the HEX, RGB and HSL rows are clipped to the nearest displayable colour."
    : "";
}

function renderPreview() {
  if (!state.fg || !state.bg) return;
  preview.style.background = formatHex(state.bg);
  preview.style.color = formatHex(state.fg);
}

function renderContrast() {
  checksNode.innerHTML = "";
  if (!state.fg || !state.bg) {
    ratioNode.textContent = "—";
    ratioNode.className = "ratio";
    ratioNote.textContent = "";
    return;
  }

  const ratio = contrastRatio(state.fg, state.bg);
  // Two decimals, rounded down: 4.4999 is not a pass at 4.5.
  const shown = Math.floor(ratio * 100) / 100;
  ratioNode.textContent = `${shown.toFixed(2)}:1`;
  ratioNode.className = `ratio ${shown >= 4.5 ? "is-pass" : shown >= 3 ? "is-warn" : "is-fail"}`;
  ratioNote.textContent = state.fg.a < 1
    ? `Foreground is ${round(state.fg.a * 100, 1)}% opaque; measured composited over the background.`
    : "";

  for (const check of CHECKS) {
    const pass = shown >= check.min;
    const item = document.createElement("div");
    item.className = `check ${pass ? "is-pass" : "is-fail"}`;
    item.dataset.check = `${check.label} ${check.level}`;

    const name = document.createElement("span");
    name.className = "check-label";
    name.textContent = check.label;

    const level = document.createElement("span");
    level.className = "check-level";
    level.textContent = `${check.level} · ${check.min}:1`;

    const verdict = document.createElement("span");
    verdict.className = "check-verdict";
    verdict.textContent = pass ? "Pass" : "Fail";

    item.append(name, level, verdict);
    checksNode.appendChild(item);
  }
}

function render() {
  renderFormats();
  renderPreview();
  renderContrast();
}

/* --- Colour picker -------------------------------------------------------
   The popover itself is the shared component (DevToolsMain.createColorPicker,
   see tools/style-guide.md). This tool only supplies the trigger element and
   keeps its text field as the exact-value control.
   ------------------------------------------------------------------------ */

const pickers = {};

/* --- Field wiring ------------------------------------------------------- */

const FIELDS = {
  fg: { input: fgInput, error: fgError, picker: document.getElementById("fg-picker") },
  bg: { input: bgInput, error: bgError, picker: document.getElementById("bg-picker") },
};

function readField(key) {
  const { input, error } = FIELDS[key];
  state.raw[key] = input.value;
  const result = parseColor(input.value);

  if (!result.ok) {
    state[key] = null;
    error.textContent = result.empty ? "" : result.error;
    error.hidden = !error.textContent;
    render();
    return;
  }

  state[key] = result.color;
  error.hidden = true;
  error.textContent = "";
  // The pad works in sRGB, so an out-of-gamut colour reaches it clipped.
  pickers[key]?.setColor(result.color);
  render();
}

function setField(key, text, { toast = "" } = {}) {
  FIELDS[key].input.value = text;
  readField(key);
  if (toast) window.DevToolsMain.showToast(toast, "success");
}

for (const [key, field] of Object.entries(FIELDS)) {
  field.input.addEventListener("input", () => readField(key));
  field.input.addEventListener("focus", () => selectTarget(key));
  pickers[key] = window.DevToolsMain.createColorPicker(field.picker, {
    label: key === "fg" ? "foreground colour" : "background colour",
    value: DEFAULTS[key],
    // Write straight to the field rather than back through setColor(), so the
    // pad keeps the hue it is being dragged around.
    onChange: ({ hex }) => {
      field.input.value = hex;
      state.raw[key] = hex;
      const result = parseColor(hex);
      state[key] = result.ok ? result.color : null;
      field.error.hidden = true;
      selectTarget(key);
      render();
    },
  });
}

function selectTarget(key) {
  if (state.target === key) return;
  state.target = key;
  document.querySelectorAll(".pill[data-target]").forEach((pill) => {
    const active = pill.dataset.target === key;
    pill.classList.toggle("is-active", active);
    pill.setAttribute("aria-selected", String(active));
  });
  renderFormats();
}

document.querySelectorAll(".pill[data-target]").forEach((pill) => {
  pill.addEventListener("click", () => selectTarget(pill.dataset.target));
});

/* --- Actions ------------------------------------------------------------ */

// Walk OKLCH lightness away from the background until the ratio clears AA.
// Only L moves: hue and chroma are what make the colour recognisable, and in
// OKLCH lightness is perceptually uniform, so the smallest step that passes is
// also the smallest visible change.
function nudgeToAA(fg, bg, min = 4.5) {
  const start = fg.source ?? rgbToOklch(fg);
  const bgLight = luminance({ ...bg, a: 1 }) > 0.18;
  const direction = bgLight ? -1 : 1;

  for (let step = 0; step <= 100; step += 1) {
    const L = clamp(start.L + direction * step * 0.01, 0, 1);
    const candidate = { ...oklchToRgb({ ...start, L }), a: fg.a };
    if (contrastRatio(candidate, bg) >= min) return { L, C: start.C, h: start.h, a: fg.a };
    if (L === 0 || L === 1) break;
  }
  return null;
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;

    if (action === "swap") {
      const [fg, bg] = [state.raw.fg, state.raw.bg];
      FIELDS.fg.input.value = bg;
      FIELDS.bg.input.value = fg;
      readField("fg");
      readField("bg");
      window.DevToolsMain.showToast("Swapped", "info");
    }

    if (action === "clear") {
      setField("fg", DEFAULTS.fg);
      setField("bg", DEFAULTS.bg);
      window.DevToolsMain.showToast("Reset to defaults", "info");
    }

    if (action === "paste") {
      try {
        setField(state.target, (await navigator.clipboard.readText()).trim());
      } catch {
        FIELDS[state.target].input.focus();
        window.DevToolsMain.showToast("Clipboard is not available", "error");
      }
    }

    if (action === "copy-all") {
      const color = state[state.target];
      if (!color) {
        window.DevToolsMain.showToast("Nothing to copy", "error");
        return;
      }
      const text = formatsFor(color).map(([label, value]) => `${label}: ${value}`).join("\n");
      window.DevToolsMain.copyText(text);
      window.DevToolsMain.showToast("All formats copied", "success");
    }

    if (action === "fix-aa") {
      if (!state.fg || !state.bg) {
        window.DevToolsMain.showToast("Both colours must be valid", "error");
        return;
      }
      if (contrastRatio(state.fg, state.bg) >= 4.5) {
        window.DevToolsMain.showToast("Already passes AA for normal text", "info");
        return;
      }
      const fixed = nudgeToAA(state.fg, state.bg);
      if (!fixed) {
        window.DevToolsMain.showToast("No lightness of this hue reaches 4.5:1", "error");
        return;
      }
      setField("fg", `oklch(${round(fixed.L, 4)} ${round(fixed.C, 4)} ${round(fixed.h, 2)}${alphaSuffix(fixed.a)})`);
      selectTarget("fg");
      window.DevToolsMain.showToast("Foreground lightness adjusted to pass AA", "success");
    }
  });
});

helpBtn.addEventListener("click", () => window.DevToolsMain.openModal(helpModal));

function init() {
  readField("fg");
  readField("bg");
}

init();
