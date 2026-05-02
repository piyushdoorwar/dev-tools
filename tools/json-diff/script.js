// JSON Diff Tool - Custom Editor Implementation (No CodeMirror)

// DOM Elements
const editors = {
  left: document.getElementById("left-editor"),
  right: document.getElementById("right-editor"),
};

const lineNumbers = {
  left: document.getElementById("left-line-numbers"),
  right: document.getElementById("right-line-numbers"),
};

const highlights = {
  left: document.getElementById("left-highlights"),
  right: document.getElementById("right-highlights"),
};

const statusBars = {
  left: document.getElementById("left-status"),
  right: document.getElementById("right-status"),
};

const toastContainer = document.getElementById("toast-container");
const settingsModal = document.getElementById("settingsModal");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const indentSizeInput = document.getElementById("indentSize");
const indentTypeSelect = document.getElementById("indentType");
const diffLegendModal = document.getElementById("diffLegendModal");
const diffLegendBtn = document.getElementById("diffLegendBtn");
const diffLegendCloseBtn = document.getElementById("diffLegendCloseBtn");

// Stats elements
const statAdded = document.getElementById("stat-added");
const statRemoved = document.getElementById("stat-removed");
const statModified = document.getElementById("stat-modified");

// State
let lastLeftData, lastRightData, lastEntries;
let compareTimer;
const compareDebounceMs = 300;

const editorDiffHighlights = {
  left: new Map(),
  right: new Map(),
};

// Sample JSON data
const sampleOriginal = {
  user: {
    id: 12345,
    username: "johndoe",
    email: "john@example.com",
    profile: {
      firstName: "John",
      lastName: "Doe",
      age: 28,
      location: "New York"
    },
    settings: {
      theme: "dark",
      notifications: true,
      language: "en"
    },
    lastLogin: "2025-12-29T14:32:15Z",
    createdAt: "2023-01-15T08:00:00Z"
  },
  subscription: {
    plan: "basic",
    status: "active",
    price: 9.99
  },
  features: ["email", "chat", "storage"]
};

const sampleModified = {
  user: {
    id: 12345,
    username: "johndoe_updated",
    email: "john.doe@newdomain.com",
    profile: {
      firstName: "John",
      lastName: "Doe",
      age: 29,
      location: "San Francisco",
      bio: "Software Developer"
    },
    settings: {
      theme: "light",
      notifications: true,
      privacy: "public"
    },
    lastLogin: "2025-12-30T10:15:42Z",
    updatedAt: "2025-12-30T10:15:42Z"
  },
  subscription: {
    plan: "premium",
    status: "active",
    price: 19.99,
    renewalDate: "2026-01-30"
  },
  features: ["email", "chat", "storage", "analytics", "api-access"]
};

// ==================== Toast Notifications ====================

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "ℹ";
  if (type === "success") icon = "✓";
  else if (type === "error") icon = "✕";
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
  
  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== Line Numbers ====================

function updateLineNumbers(side) {
  const editor = editors[side];
  const lineNumbersEl = lineNumbers[side];
  const lines = editor.value.split("\n");
  const lineCount = lines.length;
  
  let html = "";
  for (let i = 1; i <= lineCount; i++) {
    const diffClass = editorDiffHighlights[side].get(i - 1) || "";
    html += `<span class="line-number ${diffClass}">${i}</span>`;
  }
  
  lineNumbersEl.innerHTML = html;
}

// ==================== Syntax Highlighting & Diff Overlay ====================

function updateHighlights(side) {
  const editor = editors[side];
  const highlightsEl = highlights[side];
  const lines = editor.value.split("\n");
  
  let html = "";
  lines.forEach((line, index) => {
    const diffClass = editorDiffHighlights[side].get(index) || "";
    const escapedLine = escapeHtml(line) || " ";
    html += `<div class="highlight-line ${diffClass}">${escapedLine}</div>`;
  });
  
  highlightsEl.innerHTML = html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ==================== Scroll Sync ====================

function syncScroll(side) {
  const editor = editors[side];
  const lineNumbersEl = lineNumbers[side];
  const highlightsEl = highlights[side];
  
  lineNumbersEl.scrollTop = editor.scrollTop;
  highlightsEl.scrollTop = editor.scrollTop;
  highlightsEl.scrollLeft = editor.scrollLeft;
}

let activeScrollSource = null;

function syncEditorScroll(fromSide) {
  if (activeScrollSource && activeScrollSource !== fromSide) return;
  activeScrollSource = fromSide;
  
  const toSide = fromSide === "left" ? "right" : "left";
  const fromEditor = editors[fromSide];
  const toEditor = editors[toSide];
  
  toEditor.scrollTop = fromEditor.scrollTop;
  toEditor.scrollLeft = fromEditor.scrollLeft;
  
  syncScroll(fromSide);
  syncScroll(toSide);
  
  requestAnimationFrame(() => {
    if (activeScrollSource === fromSide) {
      activeScrollSource = null;
    }
  });
}

// ==================== Editor Value Helpers ====================

function getValue(side) {
  return editors[side].value;
}

function setValue(side, value) {
  editors[side].value = value;
  updateLineNumbers(side);
  updateHighlights(side);
  updateStatus(side);
}

// ==================== Status Bar ====================

function updateStatus(side, message = null, type = null) {
  const statusBar = statusBars[side];
  const statusText = statusBar.querySelector(".status-text");
  const charCount = statusBar.querySelector(".char-count");
  
  const value = getValue(side);
  charCount.textContent = `${value.length} characters`;
  
  if (message) {
    statusText.textContent = message;
    statusText.className = `status-text ${type || ""}`;
  } else {
    // Check if valid JSON
    const parsed = tryParse(value.trim());
    if (!value.trim()) {
      statusText.textContent = "Ready";
      statusText.className = "status-text";
    } else if (parsed) {
      statusText.textContent = "Valid JSON";
      statusText.className = "status-text success";
    } else {
      statusText.textContent = "Invalid JSON";
      statusText.className = "status-text error";
    }
  }
}

// ==================== Diff Statistics ====================

function updateDiffStats(entries) {
  let added = 0, removed = 0, modified = 0;
  
  entries.forEach(entry => {
    if (entry.status === "addition") added++;
    else if (entry.status === "missing") removed++;
    else if (entry.status === "modified" || entry.status === "minor") modified++;
  });
  
  statAdded.textContent = added;
  statRemoved.textContent = removed;
  statModified.textContent = modified;
}

// ==================== Indent Settings ====================

function getIndentSettings() {
  return {
    size: Number(indentSizeInput?.value) || 2,
    type: indentTypeSelect?.value || "spaces",
  };
}

function getIndentString() {
  const settings = getIndentSettings();
  return settings.type === "tabs" ? "\t" : " ".repeat(settings.size);
}

// ==================== JSON Parsing ====================

function tryParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

// ==================== JSON Actions ====================

function beautifyJSON(side) {
  const value = getValue(side).trim();
  if (!value) {
    showToast("No JSON to beautify", "error");
    return;
  }
  
  const parsed = tryParse(value);
  if (!parsed) {
    showToast("Invalid JSON - cannot beautify", "error");
    return;
  }
  
  const indent = getIndentString();
  ["left", "right"].forEach((targetSide) => {
    const targetValue = getValue(targetSide).trim();
    if (!targetValue) return;
    const targetParsed = tryParse(targetValue);
    if (!targetParsed) return;
    setValue(targetSide, JSON.stringify(targetParsed, null, indent));
  });
  
  showToast("JSON beautified successfully", "success");
  scheduleCompare();
}

function validateJSON(side) {
  const value = getValue(side).trim();
  if (!value) {
    showToast("No JSON to validate", "error");
    return;
  }
  
  try {
    JSON.parse(value);
    showToast("Valid JSON ✓", "success");
    updateStatus(side, "Valid JSON", "success");
  } catch (error) {
    // Try to find line number
    const lineMatch = error.message.match(/position (\d+)/);
    let lineNum = null;
    
    if (lineMatch) {
      const position = parseInt(lineMatch[1]);
      const beforeError = value.substring(0, position);
      lineNum = beforeError.split('\n').length;
    }
    
    if (lineNum) {
      showToast(`Invalid JSON - Error on line ${lineNum}`, "error");
      updateStatus(side, `Error on line ${lineNum}`, "error");
    } else {
      showToast(`Invalid JSON - ${error.message}`, "error");
      updateStatus(side, "Invalid JSON", "error");
    }
  }
}

function undoJSON(side) {
  const editor = editors[side];
  if (!editor) return;
  editor.focus();
  document.execCommand("undo");
  updateLineNumbers(side);
  updateHighlights(side);
  updateStatus(side);
  scheduleCompare();
}

function copyJSON(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to copy", "error");
    return;
  }
  
  navigator.clipboard.writeText(value).then(() => {
    showToast("Copied to clipboard", "success");
  }).catch(() => {
    showToast("Failed to copy", "error");
  });
}

function downloadJSON(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to download", "error");
    return;
  }
  
  const blob = new Blob([value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = side === "left" ? "original.json" : "modified.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Download started", "success");
}

function pasteJSON(side) {
  navigator.clipboard.readText().then((text) => {
    if (!text) {
      showToast("Clipboard is empty", "error");
      return;
    }
    setValue(side, text);
    showToast("Pasted from clipboard", "success");
    scheduleCompare();
  }).catch(() => {
    showToast("Failed to paste - clipboard access denied", "error");
  });
}

function clearJSON(side) {
  if (!getValue(side).trim()) {
    showToast("Already empty", "info");
    return;
  }
  setValue(side, "");
  showToast("Editor cleared", "success");
  scheduleCompare();
}

function loadSample(side) {
  const indent = getIndentString();
  const formattedLeft = JSON.stringify(sampleOriginal, null, indent);
  const formattedRight = JSON.stringify(sampleModified, null, indent);
  
  setValue("left", formattedLeft);
  setValue("right", formattedRight);
  
  showToast("Samples loaded", "success");
  scheduleCompare();
}

// ==================== Diff Comparison ====================

function scheduleCompare() {
  if (compareTimer) {
    clearTimeout(compareTimer);
  }
  compareTimer = setTimeout(() => {
    compareJson();
  }, compareDebounceMs);
}

function compareJson() {
  const leftValue = getValue("left").trim();
  const rightValue = getValue("right").trim();
  
  const leftData = tryParse(leftValue);
  const rightData = tryParse(rightValue);
  
  // Clear highlights if either is invalid or empty
  if (!leftData || !rightData) {
    clearDiffHighlights("left");
    clearDiffHighlights("right");
    updateLineNumbers("left");
    updateLineNumbers("right");
    updateHighlights("left");
    updateHighlights("right");
    updateDiffStats([]);
    lastLeftData = null;
    lastRightData = null;
    lastEntries = null;
    return;
  }
  
  const entries = diffObjects(leftData, rightData);
  applyDiffHighlightsFromEntries(entries, leftValue, rightValue);
  updateDiffStats(entries);
  
  lastLeftData = leftData;
  lastRightData = rightData;
  lastEntries = entries;
}

function clearDiffHighlights(side) {
  editorDiffHighlights[side].clear();
}

function addDiffHighlight(side, lineIndex, status) {
  if (typeof lineIndex !== "number" || lineIndex < 0) return;
  
  const className =
    status === "missing" ? "line-diff-missing" :
    status === "addition" ? "line-diff-addition" :
    status === "minor" ? "line-diff-minor" :
    status === "modified" ? "line-diff-modified" : "";
  
  if (className) {
    editorDiffHighlights[side].set(lineIndex, className);
  }
}

function parsePath(path) {
  const parts = [];
  const regex = /([^.[\]]+)|\[(\d+)\]/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) parts.push(match[1]);
    else parts.push(Number(match[2]));
  }
  return parts;
}

function getLastKeyFromPath(path) {
  const parts = parsePath(path);
  if (parts.length > 0 && typeof parts[parts.length - 1] === "number") {
    return null;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    if (typeof parts[i] === "string") return parts[i];
  }
  return null;
}

function findBestLineForKeyAndValue(content, key, value) {
  const lines = content.split("\n");
  const keyToken = key ? `"${key}"` : null;
  
  const isPrimitive = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
  const valueToken = isPrimitive(value) ? JSON.stringify(value) : null;
  
  if (keyToken && valueToken) {
    const keyValueRegex = new RegExp(`"${escapeRegex(key)}"\\s*:\\s*${escapeRegex(valueToken)}(\\s*[,\\]}]|\\s*$)`);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (keyValueRegex.test(line)) return i;
    }
  }

  if (!keyToken && valueToken) {
    const valueRegex = new RegExp(`(^|\\s)${escapeRegex(valueToken)}(\\s*[,\\]}]|\\s*$)`);
    for (let i = 0; i < lines.length; i++) {
      if (valueRegex.test(lines[i])) return i;
    }
  }
  
  if (keyToken && !valueToken) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(keyToken)) continue;
      if (line.includes("{") || line.includes("[")) return i;
    }
  }
  
  if (keyToken) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(keyToken)) return i;
    }
  }
  
  return null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyDiffHighlightsFromEntries(entries, leftContent, rightContent) {
  clearDiffHighlights("left");
  clearDiffHighlights("right");
  
  entries.forEach((entry) => {
    const key = getLastKeyFromPath(entry.path);
    
    if (entry.status === "missing") {
      const line = findBestLineForKeyAndValue(leftContent, key, entry.oldValue);
      if (line !== null) addDiffHighlight("left", line, "missing");
      return;
    }
    
    if (entry.status === "addition") {
      const line = findBestLineForKeyAndValue(rightContent, key, entry.newValue);
      if (line !== null) addDiffHighlight("right", line, "addition");
      return;
    }
    
    const leftLine = findBestLineForKeyAndValue(leftContent, key, entry.oldValue);
    const rightLine = findBestLineForKeyAndValue(rightContent, key, entry.newValue);
    if (leftLine !== null) addDiffHighlight("left", leftLine, entry.status);
    if (rightLine !== null) addDiffHighlight("right", rightLine, entry.status);
  });
  
  updateLineNumbers("left");
  updateLineNumbers("right");
  updateHighlights("left");
  updateHighlights("right");
}

function diffObjects(left, right, path = "") {
  const results = [];
  
  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);
    for (let i = 0; i < maxLength; i++) {
      const currentPath = `${path}[${i}]`;
      const hasLeft = i < left.length;
      const hasRight = i < right.length;
      
      if (hasLeft && !hasRight) {
        results.push({
          path: currentPath,
          status: "missing",
          oldValue: left[i],
        });
        continue;
      }
      
      if (!hasLeft && hasRight) {
        results.push({
          path: currentPath,
          status: "addition",
          newValue: right[i],
        });
        continue;
      }
      
      const leftVal = left[i];
      const rightVal = right[i];
      
      if (Array.isArray(leftVal) && Array.isArray(rightVal)) {
        results.push(...diffObjects(leftVal, rightVal, currentPath));
      } else if (isObject(leftVal) && isObject(rightVal) && !Array.isArray(leftVal) && !Array.isArray(rightVal)) {
        results.push(...diffObjects(leftVal, rightVal, currentPath));
      } else if (!isEqual(leftVal, rightVal)) {
        const minor = markAsMinor(currentPath, leftVal, rightVal);
        results.push({
          path: currentPath,
          status: minor ? "minor" : "modified",
          oldValue: leftVal,
          newValue: rightVal,
        });
      }
    }
  } else if (isObject(left) && isObject(right) && !Array.isArray(left) && !Array.isArray(right)) {
    const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
    
    allKeys.forEach((key) => {
      const currentPath = path ? `${path}.${key}` : key;
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
      const hasRight = Object.prototype.hasOwnProperty.call(right, key);
      
      if (hasLeft && !hasRight) {
        results.push({
          path: currentPath,
          status: "missing",
          oldValue: left[key],
        });
      } else if (!hasLeft && hasRight) {
        results.push({
          path: currentPath,
          status: "addition",
          newValue: right[key],
        });
      } else {
        const leftVal = left[key];
        const rightVal = right[key];
        
        if (Array.isArray(leftVal) && Array.isArray(rightVal)) {
          results.push(...diffObjects(leftVal, rightVal, currentPath));
        } else if (isObject(leftVal) && isObject(rightVal) && !Array.isArray(leftVal) && !Array.isArray(rightVal)) {
          results.push(...diffObjects(leftVal, rightVal, currentPath));
        } else if (!isEqual(leftVal, rightVal)) {
          const minor = markAsMinor(currentPath, leftVal, rightVal);
          results.push({
            path: currentPath,
            status: minor ? "minor" : "modified",
            oldValue: leftVal,
            newValue: rightVal,
          });
        }
      }
    });
  }
  
  return results;
}

function markAsMinor(path, oldValue, newValue) {
  const minimals = ["time", "date", "timestamp", "updated", "created", "last", "expires", "logged"];
  const normalized = path.toLowerCase();
  
  if (minimals.some((token) => normalized.includes(token))) {
    return true;
  }
  
  const stringValue = (value) => (typeof value === "string" ? value : "");
  const dateish = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  
  if (dateish.test(stringValue(oldValue)) && dateish.test(stringValue(newValue))) {
    return true;
  }
  
  if (typeof oldValue === "number" && typeof newValue === "number") {
    return Math.abs(oldValue - newValue) < 1;
  }
  
  return false;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function isEqual(a, b) {
  if (a === b) return true;
  if (isObject(a) && isObject(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// ==================== Event Handlers ====================

// Action button handlers
document.querySelectorAll(".action-btn[data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    const side = btn.dataset.editor;
    
    switch (action) {
      case "undo":
        undoJSON(side);
        break;
      case "validate":
        validateJSON(side);
        break;
      case "beautify":
        beautifyJSON(side);
        break;
      case "copy":
        copyJSON(side);
        break;
      case "paste":
        pasteJSON(side);
        break;
      case "sample":
        loadSample(side);
        break;
      case "download":
        downloadJSON(side);
        break;
      case "clear":
        clearJSON(side);
        break;
    }
  });
});

// Editor input handlers
["left", "right"].forEach((side) => {
  const editor = editors[side];
  
  editor.addEventListener("input", () => {
    updateLineNumbers(side);
    updateHighlights(side);
    updateStatus(side);
    scheduleCompare();
  });
  
  editor.addEventListener("scroll", () => {
    syncEditorScroll(side);
  });
  
  // Handle tab key for indentation
  editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const indent = getIndentString();
      
      editor.value = editor.value.substring(0, start) + indent + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + indent.length;
      
      updateLineNumbers(side);
      updateHighlights(side);
    }
  });
});

// Settings modal handlers
if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener("click", closeSettingsModal);
}

if (settingsModal) {
  settingsModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]") || event.target === settingsModal) {
      closeSettingsModal();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (settingsModal?.classList.contains("is-open")) closeSettingsModal();
    if (diffLegendModal?.classList.contains("is-open")) closeDiffLegendModal();
  }
});

function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.add("is-open");
  settingsModal.setAttribute("aria-hidden", "false");
  if (settingsCloseBtn) settingsCloseBtn.focus();
}

function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove("is-open");
  settingsModal.setAttribute("aria-hidden", "true");
}

function openDiffLegendModal() {
  if (!diffLegendModal) return;
  diffLegendModal.classList.add("is-open");
  diffLegendModal.setAttribute("aria-hidden", "false");
  if (diffLegendCloseBtn) diffLegendCloseBtn.focus();
}

function closeDiffLegendModal() {
  if (!diffLegendModal) return;
  diffLegendModal.classList.remove("is-open");
  diffLegendModal.setAttribute("aria-hidden", "true");
}

if (diffLegendBtn) {
  diffLegendBtn.addEventListener("click", openDiffLegendModal);
}

if (diffLegendCloseBtn) {
  diffLegendCloseBtn.addEventListener("click", closeDiffLegendModal);
}

if (diffLegendModal) {
  diffLegendModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-modal-close]") || event.target === diffLegendModal) {
      closeDiffLegendModal();
    }
  });
}

// Indent settings change handlers
[indentSizeInput, indentTypeSelect].filter(Boolean).forEach((control) => {
  control.addEventListener("change", () => {
    // Optionally reformat both editors
    ["left", "right"].forEach((side) => {
      const value = getValue(side).trim();
      if (!value) return;
      const parsed = tryParse(value);
      if (!parsed) return;
      setValue(side, JSON.stringify(parsed, null, getIndentString()));
    });
    scheduleCompare();
  });
});

// ==================== Initialization ====================

function init() {
  // Keep editors empty on startup
  setValue("left", "");
  setValue("right", "");
  
  // Initial comparison
  scheduleCompare();
}

// Run initialization
init();
