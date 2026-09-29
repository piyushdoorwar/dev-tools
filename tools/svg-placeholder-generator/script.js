// SVG Placeholder Generator — a sized, coloured placeholder image as SVG
// markup, data URIs, an <img> tag or CSS, with SVG and PNG download.
//
// Everything is live: every input re-renders. An invalid field is flagged
// where it is and the last valid image stays on screen (dimmed), so a
// half-typed number never blanks the preview.

"use strict";

const MAX_SIZE = 10000;
const DEFAULTS = {
  width: 640,
  height: 360,
  text: "",
  fontMode: "auto",
  fontSize: 64,
  weight: "400",
  family: "sans-serif",
  background: "#6739B7",
  foreground: "#FFFFFF",
  radius: 0,
};

const PRESETS = [
  { id: "custom", label: "Custom" },
  { id: "og", w: 1200, h: 630, label: "1200 × 630 · Open Graph" },
  { id: "fhd", w: 1920, h: 1080, label: "1920 × 1080 · Full HD" },
  { id: "hd", w: 1280, h: 720, label: "1280 × 720 · HD" },
  { id: "ig", w: 1080, h: 1080, label: "1080 × 1080 · Instagram" },
  { id: "800x600", w: 800, h: 600, label: "800 × 600" },
  { id: "600x400", w: 600, h: 400, label: "600 × 400" },
  { id: "mrec", w: 300, h: 250, label: "300 × 250 · Medium rectangle ad" },
  { id: "leader", w: 728, h: 90, label: "728 × 90 · Leaderboard ad" },
  { id: "icon", w: 512, h: 512, label: "512 × 512 · App icon" },
  { id: "avatar", w: 150, h: 150, label: "150 × 150 · Avatar" },
];

// Background / text pairs with comfortable contrast for "Random palette".
const PALETTES = [
  ["#6739B7", "#FFFFFF"], ["#1E1E1E", "#FFD700"], ["#00D09C", "#0D0D0D"],
  ["#FF6B9D", "#FFFFFF"], ["#5DADE2", "#0D1B2A"], ["#F59E0B", "#1E1E1E"],
  ["#CCCCCC", "#555555"], ["#E5E7EB", "#374151"], ["#0F172A", "#94A3B8"],
  ["#FDE68A", "#92400E"], ["#DCFCE7", "#166534"], ["#FCE7F3", "#9D174D"],
  ["#1F2937", "#F9FAFB"], ["#DBEAFE", "#1E3A8A"], ["#111827", "#34D399"],
];

const FORMATS = {
  svg: "SVG markup",
  uri: "URL-encoded data URI",
  base64: "Base64 data URI",
  img: "HTML <img> tag",
  css: "CSS background-image",
};

// XML 1.0 Char production: anything else cannot appear in the document.
const XML_ILLEGAL = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/u;

const $ = (id) => document.getElementById(id);
const el = {
  width: $("width"),
  height: $("height"),
  text: $("text"),
  fontSize: $("fontSize"),
  fontSizeMode: $("fontSizeMode"),
  fontWeight: $("fontWeight"),
  familyDd: $("familyDd"),
  presetDd: $("presetDd"),
  presetMenu: $("presetMenu"),
  background: $("background"),
  foreground: $("foreground"),
  radius: $("radius"),
  radiusRange: $("radiusRange"),
  stage: $("stage"),
  stageMode: $("stageMode"),
  img: $("previewImg"),
  status: $("status"),
  meta: $("meta"),
  formatSwitch: $("formatSwitch"),
  output: $("output"),
  outputStatus: $("outputStatus"),
  outputCount: $("outputCount"),
  downloadDd: $("downloadDd"),
};

const state = {
  fontMode: DEFAULTS.fontMode,
  weight: DEFAULTS.weight,
  family: DEFAULTS.family,
  format: "svg",
  result: null, // last valid render
  valid: false,
};

const colorUtil = window.DevToolsMain.color;
const encoder = new TextEncoder();

function toast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

/* --- Pure helpers --------------------------------------------------------- */

function escapeMarkup(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toBase64(text) {
  const bytes = encoder.encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Roughly min(w/10, h/4), and smaller again when the label is long enough
// that it would run past ~90% of the width (average glyph ≈ 0.6em).
function autoFontSize(width, height, text, weight) {
  const glyph = weight === "700" ? 0.64 : 0.6;
  const chars = Math.max([...text].length, 1);
  const fit = (width * 0.9) / (chars * glyph);
  return Math.max(1, Math.min(MAX_SIZE, Math.floor(Math.min(width / 10, height / 4, fit))));
}

function normaliseHex(raw) {
  const value = raw.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null;
  const parsed = colorUtil.parseHex(value);
  return parsed ? colorUtil.formatHex({ ...parsed, a: 1 }) : null;
}

function buildSvg({ width, height, text, fontSize, weight, family, background, foreground, radius }) {
  const label = escapeMarkup(text);
  const rx = radius > 0 ? ` rx="${radius}"` : "";
  const bold = weight === "700" ? ` font-weight="700"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`
    + `<rect width="${width}" height="${height}"${rx} fill="${background}"/>`
    + `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="${family}" font-size="${fontSize}"${bold} fill="${foreground}">${label}</text>`
    + `</svg>`;
}

function outputs(result) {
  const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(result.svg);
  const base64 = "data:image/svg+xml;base64," + toBase64(result.svg);
  return {
    svg: result.svg,
    uri,
    base64,
    img: `<img src="${uri}" width="${result.width}" height="${result.height}" alt="${escapeMarkup(result.text)}">`,
    css: `background-image: url("${uri}");`,
  };
}

/* --- Reading and validating the form ------------------------------------- */

const ERROR_NODES = {
  width: $("widthError"),
  height: $("heightError"),
  text: $("textError"),
  fontSize: $("fontSizeError"),
  background: $("backgroundError"),
  foreground: $("foregroundError"),
  radius: $("radiusError"),
};

function setFieldError(key, message) {
  const input = el[key];
  const node = ERROR_NODES[key];
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
  node.textContent = message || "";
  node.hidden = !message;
}

function readInteger(input, { min, max, name }) {
  const raw = input.value.trim();
  if (raw === "") return { error: `Enter a ${name}.` };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { error: `${name[0].toUpperCase()}${name.slice(1)} must be a whole number from ${min} to ${max.toLocaleString("en-US")}.` };
  }
  return { value: n };
}

function readForm() {
  const errors = {};
  const width = readInteger(el.width, { min: 1, max: MAX_SIZE, name: "width" });
  const height = readInteger(el.height, { min: 1, max: MAX_SIZE, name: "height" });
  if (width.error) errors.width = width.error;
  if (height.error) errors.height = height.error;

  const w = width.value;
  const h = height.value;
  const text = el.text.value || (w && h ? `${w} × ${h}` : "");
  if (XML_ILLEGAL.test(el.text.value)) {
    errors.text = "Text contains a control character that SVG (XML) cannot represent.";
  }

  let fontSize;
  if (state.fontMode === "custom") {
    const size = readInteger(el.fontSize, { min: 1, max: MAX_SIZE, name: "font size" });
    if (size.error) errors.fontSize = size.error;
    fontSize = size.value;
  } else if (w && h) {
    fontSize = autoFontSize(w, h, text, state.weight);
  }

  const background = normaliseHex(el.background.value);
  const foreground = normaliseHex(el.foreground.value);
  if (!background) errors.background = "Use #RGB or #RRGGBB.";
  if (!foreground) errors.foreground = "Use #RGB or #RRGGBB.";

  const radius = readInteger(el.radius, { min: 0, max: MAX_SIZE / 2, name: "radius" });
  if (el.radius.value.trim() === "") radius.value = 0;
  else if (radius.error) errors.radius = radius.error;

  return {
    errors,
    values: { width: w, height: h, text, fontSize, weight: state.weight, family: state.family, background, foreground, radius: radius.value ?? 0 },
  };
}

/* --- Render --------------------------------------------------------------- */

function render() {
  const { errors, values } = readForm();
  Object.keys(ERROR_NODES).forEach((key) => setFieldError(key, errors[key]));

  // Auto mode shows the size it picked, so switching to Custom starts there.
  if (state.fontMode === "auto" && values.fontSize && document.activeElement !== el.fontSize) {
    el.fontSize.value = String(values.fontSize);
  }
  if (values.width && values.height) {
    const maxRadius = Math.floor(Math.min(values.width, values.height) / 2);
    el.radiusRange.max = String(Math.max(maxRadius, 1));
  }
  el.radiusRange.value = String(values.radius);
  syncPreset(values.width, values.height);

  const messages = Object.values(errors);
  state.valid = messages.length === 0;
  document.body.classList.toggle("is-stale", !state.valid && Boolean(state.result));

  if (!state.valid) {
    setStatus(state.result ? `${messages[0]} Showing the last valid image.` : messages[0], "error");
    return;
  }

  const svg = buildSvg(values);
  state.result = { ...values, svg, bytes: encoder.encode(svg).length };
  state.outputs = outputs(state.result);

  el.img.src = state.outputs.uri;
  el.img.alt = values.text;
  el.img.width = values.width;
  el.img.height = values.height;
  el.img.hidden = false;
  el.meta.textContent = `${values.width} × ${values.height} · ${formatBytes(state.result.bytes)} SVG`;
  renderOutput();
  updateScaleStatus();
}

function renderOutput() {
  if (!state.outputs) return;
  const text = state.outputs[state.format];
  el.output.value = text;
  el.output.setAttribute("aria-label", FORMATS[state.format]);
  el.outputStatus.textContent = FORMATS[state.format];
  el.outputCount.textContent = `${text.length.toLocaleString("en-US")} chars`;
}

function setStatus(message, type = "") {
  el.status.textContent = message;
  el.status.className = `status-text${type ? ` ${type}` : ""}`;
}

// The stage fits the image with max-width/height; report the shown scale so
// a large image is not mistaken for its real size.
function updateScaleStatus() {
  if (!state.valid || !state.result) return;
  const box = el.stage.getBoundingClientRect();
  const style = getComputedStyle(el.stage);
  const innerW = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const innerH = box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.min(1, innerW / state.result.width, innerH / state.result.height);
  const fontNote = state.fontMode === "auto" ? `Auto font ${state.result.fontSize} px` : `Font ${state.result.fontSize} px`;
  const shown = scale > 0 && scale < 0.995 ? ` · shown at ${Math.round(scale * 100)}%` : " · actual size";
  setStatus(`${fontNote}${shown}`, "success");
}

/* --- Presets -------------------------------------------------------------- */

function buildPresets() {
  PRESETS.forEach((preset) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "dd__option";
    option.setAttribute("role", "option");
    option.dataset.value = preset.id;
    option.textContent = preset.label;
    el.presetMenu.appendChild(option);
  });
}

function syncPreset(w, h) {
  const match = PRESETS.find((preset) => preset.w === w && preset.h === h);
  window.DevToolsMain.selectDropdownValue(el.presetDd, match ? match.id : "custom", { emit: false });
}

el.presetDd.addEventListener("dd:change", ({ detail }) => {
  const preset = PRESETS.find((item) => item.id === detail.value);
  if (!preset || !preset.w) return;
  el.width.value = String(preset.w);
  el.height.value = String(preset.h);
  render();
});

/* --- Segments (radio groups with arrow keys) ------------------------------ */

function setSegment(group, value) {
  group.querySelectorAll(".segment-btn").forEach((button) => {
    const on = button.dataset.value === value;
    button.classList.toggle("active", on);
    button.setAttribute("aria-checked", String(on));
    button.tabIndex = on ? 0 : -1;
  });
}

function bindSegment(group, onSelect) {
  const buttons = () => [...group.querySelectorAll(".segment-btn")];
  group.addEventListener("click", (event) => {
    const button = event.target.closest(".segment-btn");
    if (!button || !group.contains(button)) return;
    setSegment(group, button.dataset.value);
    onSelect(button.dataset.value);
  });
  group.addEventListener("keydown", (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const list = buttons();
    let index = list.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key in keys) index = (index + keys[event.key] + list.length) % list.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = list.length - 1;
    else return;
    event.preventDefault();
    list[index].focus();
    list[index].click();
  });
  const active = group.querySelector(".segment-btn.active");
  if (active) setSegment(group, active.dataset.value);
}

function setFontMode(mode) {
  state.fontMode = mode;
  setSegment(el.fontSizeMode, mode);
  el.fontSize.classList.toggle("is-auto", mode === "auto");
}

bindSegment(el.fontSizeMode, (mode) => {
  setFontMode(mode);
  render();
});

bindSegment(el.fontWeight, (weight) => {
  state.weight = weight;
  render();
});

bindSegment(el.stageMode, (mode) => {
  el.stage.dataset.backdrop = mode;
});

bindSegment(el.formatSwitch, (format) => {
  applyFormat(format);
  window.DevToolsMain.writeHashState(format === "svg" ? "" : format);
});

function applyFormat(format) {
  state.format = FORMATS[format] ? format : "svg";
  setSegment(el.formatSwitch, state.format);
  renderOutput();
}

el.familyDd.addEventListener("dd:change", ({ detail }) => {
  state.family = detail.value;
  render();
});

/* --- Colours ---------------------------------------------------------------
   The swatch is the shared picker; the hex field beside it is the exact-value
   control. They mirror each other on every valid keystroke, not just on blur. */

const pickers = {};

function bindColor(key) {
  const input = el[key];
  const node = $(`${key}Picker`);
  const picker = window.DevToolsMain.createColorPicker(node);
  pickers[key] = picker;
  node.addEventListener("picker:change", ({ detail }) => {
    input.value = detail.hex;
    render();
  });
  input.addEventListener("input", () => {
    const hex = normaliseHex(input.value);
    if (hex) picker.setColor(hex);
    render();
  });
  input.addEventListener("change", () => {
    const hex = normaliseHex(input.value);
    if (hex) input.value = hex;
  });
}

function setColor(key, hex) {
  el[key].value = hex;
  pickers[key].setColor(hex);
}

bindColor("background");
bindColor("foreground");

/* --- Wiring --------------------------------------------------------------- */

[el.width, el.height, el.text, el.radius].forEach((input) => input.addEventListener("input", render));

el.fontSize.addEventListener("input", () => {
  if (state.fontMode !== "custom") setFontMode("custom");
  render();
});

el.radiusRange.addEventListener("input", () => {
  el.radius.value = el.radiusRange.value;
  render();
});

$("swapSizeBtn").addEventListener("click", () => {
  [el.width.value, el.height.value] = [el.height.value, el.width.value];
  render();
});

$("swapColorsBtn").addEventListener("click", () => {
  const bg = el.background.value;
  const fg = el.foreground.value;
  setColor("background", normaliseHex(fg) || fg);
  setColor("foreground", normaliseHex(bg) || bg);
  render();
});

$("shuffleBtn").addEventListener("click", () => {
  const current = `${normaliseHex(el.background.value)}|${normaliseHex(el.foreground.value)}`;
  const choices = PALETTES.filter(([bg, fg]) => `${bg}|${fg}` !== current);
  const [bg, fg] = choices[Math.floor(Math.random() * choices.length)];
  setColor("background", bg);
  setColor("foreground", fg);
  render();
});

$("resetBtn").addEventListener("click", () => {
  el.width.value = String(DEFAULTS.width);
  el.height.value = String(DEFAULTS.height);
  el.text.value = DEFAULTS.text;
  el.radius.value = String(DEFAULTS.radius);
  setFontMode(DEFAULTS.fontMode);
  state.weight = DEFAULTS.weight;
  setSegment(el.fontWeight, DEFAULTS.weight);
  state.family = DEFAULTS.family;
  window.DevToolsMain.selectDropdownValue(el.familyDd, DEFAULTS.family, { emit: false });
  setColor("background", DEFAULTS.background);
  setColor("foreground", DEFAULTS.foreground);
  render();
  toast("Settings reset", "success");
});

$("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

// Export is refused while a field is invalid: the dimmed preview is the last
// good image, and copying it silently would hand out the wrong thing.
function exportable() {
  if (state.valid && state.result) return true;
  toast("Fix the highlighted field first", "error");
  return false;
}

$("copyBtn").addEventListener("click", () => {
  if (!exportable()) return;
  window.DevToolsMain.copyText(state.outputs[state.format])
    .then(() => toast(`${FORMATS[state.format]} copied`, "success"))
    .catch(() => toast("Copy failed", "error"));
});

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(scale = 1) {
  const { width, height } = state.result;
  return `placeholder-${width}x${height}${scale > 1 ? `@${scale}x` : ""}`;
}

// PNG is rasterised from the same SVG, so both downloads match pixel for pixel.
function downloadPng(scale) {
  const { width, height, svg } = state.result;
  const w = width * scale;
  const h = height * scale;
  if (w * h > 100_000_000) {
    toast("Too large to rasterise in the browser; download the SVG instead", "error");
    return;
  }
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast("PNG export failed", "error");
        return;
      }
      saveBlob(blob, `${baseName(scale)}.png`);
      toast(`Saved ${w} × ${h} PNG`, "success");
    }, "image/png");
  };
  image.onerror = () => toast("PNG export failed", "error");
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

el.downloadDd.addEventListener("dd:change", ({ detail }) => {
  if (!exportable()) return;
  if (detail.value === "svg") {
    saveBlob(new Blob([state.result.svg], { type: "image/svg+xml" }), `${baseName()}.svg`);
    toast("Saved SVG", "success");
  } else if (detail.value === "png") downloadPng(1);
  else if (detail.value === "png2") downloadPng(2);
});

new ResizeObserver(() => updateScaleStatus()).observe(el.stage);

/* --- Start ---------------------------------------------------------------- */

buildPresets();
window.DevToolsMain.initDropdowns?.(el.presetDd);
applyFormat(window.DevToolsMain.readHashState());
window.DevToolsMain.onHashState((value) => applyFormat(value));
render();
