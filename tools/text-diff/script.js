// Text Diff Tool - Custom Editor Implementation (No CodeMirror)

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
const diffLegendModal = document.getElementById("diffLegendModal");
const diffLegendBtn = document.getElementById("diffLegendBtn");
const diffLegendCloseBtn = document.getElementById("diffLegendCloseBtn");

// Stats elements
const statAdded = document.getElementById("stat-added");
const statRemoved = document.getElementById("stat-removed");
const statModified = document.getElementById("stat-modified");

// State
let compareTimer;
const compareDebounceMs = 300;

const editorDiffHighlights = {
  left: new Map(),
  right: new Map(),
};

const inlineDiffHighlights = {
  left: new Map(),
  right: new Map(),
};

// Sample text data
const sampleOriginal = `Release Notes - v2.3.1

Highlights
- Faster search for large files
- New inline diff panel
- Updated onboarding copy

Bug Fixes
- Fix crash when opening empty workspace
- Restore scroll position after refresh
- Correct typo in settings panel
`;

const sampleModified = `Release Notes - v2.4.0

Highlights
- Faster search for large files
- New inline diff viewer
- Updated onboarding messaging
- Added keyboard shortcuts cheat sheet

Bug Fixes
- Fix crash when opening empty workspace
- Restore scroll position after refresh
- Correct typos in settings panel
- Improve tooltip contrast
`;

// ==================== Toast Notifications ====================

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = "i";
  if (type === "success") icon = "ok";
  else if (type === "error") icon = "x";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  toastContainer.appendChild(toast);

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
  const lines = normalizeLineEndings(editor.value).split("\n");
  const lineCount = lines.length || 1;

  let html = "";
  for (let i = 1; i <= lineCount; i++) {
    const diffClass = editorDiffHighlights[side].get(i - 1) || "";
    html += `<span class="line-number ${diffClass}">${i}</span>`;
  }

  lineNumbersEl.innerHTML = html;
}

// ==================== Diff Overlay ====================

function updateHighlights(side) {
  const editor = editors[side];
  const highlightsEl = highlights[side];
  const lines = normalizeLineEndings(editor.value).split("\n");
  
  let html = "";
  lines.forEach((line, index) => {
    const diffClass = editorDiffHighlights[side].get(index) || "";
    const inline = inlineDiffHighlights[side].get(index);
    const escapedLine = inline !== undefined ? (inline || " ") : (escapeHtml(line) || " ");
    html += `<div class="highlight-line ${diffClass}">${escapedLine}</div>`;
  });
  
  highlightsEl.innerHTML = html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
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

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

// ==================== Status Bar ====================

function updateStatus(side) {
  const statusBar = statusBars[side];
  const statusText = statusBar.querySelector(".status-text");
  const charCount = statusBar.querySelector(".char-count");

  const value = getValue(side);
  const normalized = normalizeLineEndings(value);
  const trimmed = normalized.trim();
  const lineCount = normalized.length ? normalized.split("\n").length : 1;
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;

  charCount.textContent = `${value.length} characters`;
  statusText.textContent = `Lines: ${lineCount} | Words: ${wordCount}`;
  statusText.className = "status-text";
}

// ==================== Diff Statistics ====================

function updateDiffStats(stats) {
  statAdded.textContent = stats.added;
  statRemoved.textContent = stats.removed;
  statModified.textContent = stats.modified;
}

// ==================== Text Actions ====================

function normalizeText(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to normalize", "error");
    return;
  }

  const normalized = normalizeLineEndings(value)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  setValue(side, normalized);
  showToast("Whitespace normalized", "success");
  scheduleCompare();
}

function undoText(side) {
  const editor = editors[side];
  if (!editor) return;
  editor.focus();
  document.execCommand("undo");
  updateLineNumbers(side);
  updateHighlights(side);
  updateStatus(side);
  scheduleCompare();
}

function copyText(side) {
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

function downloadText(side) {
  const value = getValue(side);
  if (!value.trim()) {
    showToast("Nothing to download", "error");
    return;
  }

  const blob = new Blob([value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = side === "left" ? "original.txt" : "modified.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Download started", "success");
}

function pasteText(side) {
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

function clearText(side) {
  if (!getValue(side).trim()) {
    showToast("Already empty", "info");
    return;
  }
  setValue(side, "");
  showToast("Editor cleared", "success");
  scheduleCompare();
}

function loadSample() {
  setValue("left", sampleOriginal);
  setValue("right", sampleModified);

  showToast("Samples loaded", "success");
  scheduleCompare();
}

// ==================== Diff Comparison ====================

function scheduleCompare() {
  if (compareTimer) {
    clearTimeout(compareTimer);
  }
  compareTimer = setTimeout(() => {
    compareText();
  }, compareDebounceMs);
}

function compareText() {
  const leftValue = normalizeLineEndings(getValue("left"));
  const rightValue = normalizeLineEndings(getValue("right"));
  const leftLines = leftValue.split("\n");
  const rightLines = rightValue.split("\n");
  
  const ops = diffSequence(leftLines, rightLines);
  const stats = applyLineOps(ops);
  updateDiffStats(stats);
}

function clearDiffHighlights(side) {
  editorDiffHighlights[side].clear();
  inlineDiffHighlights[side].clear();
}

function addDiffHighlight(side, lineIndex, status) {
  if (typeof lineIndex !== "number" || lineIndex < 0) return;
  
  const className =
    status === "missing" ? "line-diff-missing" :
    status === "addition" ? "line-diff-addition" :
    status === "modified" ? "line-diff-modified" : "";
  
  if (className) {
    editorDiffHighlights[side].set(lineIndex, className);
  }
}

function setInlineDiffHighlight(side, lineIndex, html) {
  if (typeof lineIndex !== "number" || lineIndex < 0) return;
  inlineDiffHighlights[side].set(lineIndex, html);
}

function buildCharDiff(leftLine, rightLine) {
  if (leftLine === rightLine) return null;
  
  const leftChars = Array.from(leftLine);
  const rightChars = Array.from(rightLine);
  const leftLength = leftChars.length;
  const rightLength = rightChars.length;

  let start = 0;
  while (start < leftLength && start < rightLength && leftChars[start] === rightChars[start]) {
    start += 1;
  }

  let endLeft = leftLength - 1;
  let endRight = rightLength - 1;
  while (endLeft >= start && endRight >= start && leftChars[endLeft] === rightChars[endRight]) {
    endLeft -= 1;
    endRight -= 1;
  }

  const prefix = leftChars.slice(0, start).join("");
  const leftMid = leftChars.slice(start, endLeft + 1).join("");
  const rightMid = rightChars.slice(start, endRight + 1).join("");
  const suffix = leftChars.slice(endLeft + 1).join("");

  const leftHtml = `${escapeHtml(prefix)}${leftMid ? `<span class="word-diff word-diff-modified">${escapeHtml(leftMid)}</span>` : ""}${escapeHtml(suffix)}`;
  const rightHtml = `${escapeHtml(prefix)}${rightMid ? `<span class="word-diff word-diff-modified">${escapeHtml(rightMid)}</span>` : ""}${escapeHtml(suffix)}`;

  return { leftHtml, rightHtml };
}

function applyLineOps(ops) {
  clearDiffHighlights("left");
  clearDiffHighlights("right");
  
  let leftIndex = 0;
  let rightIndex = 0;
  const stats = { added: 0, removed: 0, modified: 0 };

  let pendingDeletes = [];
  let pendingInserts = [];

  const flushPending = () => {
    const pairCount = Math.min(pendingDeletes.length, pendingInserts.length);

    for (let p = 0; p < pairCount; p++) {
      const del = pendingDeletes[p];
      const ins = pendingInserts[p];
      const charDiff = buildCharDiff(del.line, ins.line);
      if (charDiff) {
        setInlineDiffHighlight("left", del.index, charDiff.leftHtml);
        setInlineDiffHighlight("right", ins.index, charDiff.rightHtml);
        stats.modified += 1;
      }
    }

    for (let p = pairCount; p < pendingDeletes.length; p++) {
      addDiffHighlight("left", pendingDeletes[p].index, "missing");
      stats.removed += 1;
    }

    for (let p = pairCount; p < pendingInserts.length; p++) {
      addDiffHighlight("right", pendingInserts[p].index, "addition");
      stats.added += 1;
    }

    pendingDeletes = [];
    pendingInserts = [];
  };

  ops.forEach((op) => {
    if (op.type === "equal") {
      flushPending();
      leftIndex += 1;
      rightIndex += 1;
      return;
    }

    if (op.type === "delete") {
      pendingDeletes.push({ line: op.line, index: leftIndex });
      leftIndex += 1;
      return;
    }

    if (op.type === "insert") {
      pendingInserts.push({ line: op.line, index: rightIndex });
      rightIndex += 1;
    }
  });

  flushPending();

  updateLineNumbers("left");
  updateLineNumbers("right");
  updateHighlights("left");
  updateHighlights("right");

  return stats;
}

// ==================== LCS Diff ====================

function diffSequence(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "delete", line: a[i] });
      i += 1;
    } else {
      ops.push({ type: "insert", line: b[j] });
      j += 1;
    }
  }

  while (i < n) {
    ops.push({ type: "delete", line: a[i] });
    i += 1;
  }

  while (j < m) {
    ops.push({ type: "insert", line: b[j] });
    j += 1;
  }

  return ops;
}

// ==================== Event Handlers ====================

// Action button handlers

document.querySelectorAll(".action-btn[data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    const side = btn.dataset.editor;

    switch (action) {
      case "undo":
        undoText(side);
        break;
      case "normalize":
        normalizeText(side);
        break;
      case "copy":
        copyText(side);
        break;
      case "paste":
        pasteText(side);
        break;
      case "sample":
        loadSample();
        break;
      case "download":
        downloadText(side);
        break;
      case "clear":
        clearText(side);
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
      const indent = "\t";

      editor.value = editor.value.substring(0, start) + indent + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + indent.length;

      updateLineNumbers(side);
      updateHighlights(side);
    }
  });
});

// Modal handlers

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (diffLegendModal?.classList.contains("is-open")) closeDiffLegendModal();
  }
});

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

// ==================== Initialization ====================

function init() {
  setValue("left", "");
  setValue("right", "");
  scheduleCompare();
}

init();
