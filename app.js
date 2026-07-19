const BASE = "./tools/";
const PRELOAD_ON_HOVER = true;
const PRELOAD_DELAY_MS = 160;
const PINNED_TOOLS_KEY = "devtools:pinned-tools";
const RECENT_TOOLS_KEY = "devtools:recent-tools";
const RECENT_TOOLS_LIMIT = 5;
const QUICK_LAUNCH_TOOL_IDS = [
  "markdown-editor",
  "jwt-debugger",
  "json-diff",
  "html-preview",
  "id-generator",
  "base-converter",
];
const NEW_TOOL_IDS = new Set(["base-converter", "json-toon-converter", "toon-json-converter"]);

// NOTE: Assumption: each tool lives at `${BASE}${id}/` and exposes `${BASE}${id}/favicon.svg`.
// If any URL differs, just edit it here.
const TOOLS = [
  {
    id: "base-converter",
    name: "Base Converter",
    url: `${BASE}base-converter/`,
  },
  {
    id: "crypto-generator",
    name: "Crypto Generator",
    url: `${BASE}crypto-generator/`,
  },
  {
    id: "fake-data-generator",
    name: "Fake Data Generator",
    url: `${BASE}fake-data-generator/`,
  },
  {
    id: "file-compressor",
    name: "File Compressor",
    url: `${BASE}file-compressor/`,
  },
  {
    id: "html-preview",
    name: "HTML Preview",
    url: `${BASE}html-preview/`,
  },
  {
    id: "id-generator",
    name: "ID Generator",
    url: `${BASE}id-generator/`,
  },
  {
    id: "json-diff",
    name: "JSON Diff",
    url: `${BASE}json-diff/`,
  },
  {
    id: "json-toon-converter",
    name: "JSON to Toon Converter",
    url: `${BASE}json-toon-converter`,
    endpoint: "#json-toon",
  },
  {
    id: "json-xml-converter",
    name: "JSON to XML Converter",
    url: `${BASE}json-xml-converter`,
    endpoint: "#json-xml",
  },
  {
    id: "jwt-debugger",
    name: "JWT Debugger",
    url: `${BASE}jwt-debugger/`,
  },
  {
    id: "markdown-editor",
    name: "Markdown Editor",
    url: `${BASE}markdown-editor/`,
  },
  {
    id: "qr-generator",
    name: "QR Generator",
    url: `${BASE}qr-generator/`,
  },
  {
    id: "regex-tester",
    name: "Regex Tester",
    url: `${BASE}regex-tester/`,
  },
  {
    id: "sql-formatter",
    name: "SQL Formatter",
    url: `${BASE}sql-formatter/`,
  },
  {
    id: "text-diff",
    name: "Text Diff",
    url: `${BASE}text-diff/`,
  },
  {
    id: "toon-json-converter",
    name: "Toon to JSON Converter",
    url: `${BASE}json-toon-converter`,
    endpoint: "#toon-json",
  },
  {
    id: "unit-converter",
    name: "Unit Converter",
    url: `${BASE}unit-converter/`,
  },
  {
    id: "xml-json-converter",
    name: "XML to JSON Converter",
    url: `${BASE}json-xml-converter`,
    endpoint: "#xml-json",
  },
].map((t) => ({
  ...t,
  url: t.url + (t.endpoint || ''),
  faviconUrl: t.endpoint 
    ? `${t.url}/favicon${t.endpoint.replace('#', '-')}.svg`
    : `${BASE}${t.id}/favicon.svg`,
}));

const els = {
  list: document.getElementById("toolList"),
  search: document.getElementById("toolSearch"),
  frameHost: document.getElementById("frameHost"),
  empty: document.getElementById("emptyState"),
  hint: document.getElementById("hint"),
  frameLoader: document.getElementById("frameLoader"),
  sidebar: document.getElementById("sidebar"),
  app: document.getElementById("app"),
  brandHome: document.getElementById("brandHome"),
  collapseBtn: document.getElementById("collapseBtn"),
  expandBtn: document.getElementById("expandBtn"),
  version: document.getElementById("appVersion"),
  supportBtn: document.getElementById("supportBtn"),
  supportModal: document.getElementById("supportModal"),
  modalClose: document.getElementById("modalClose"),
  commandPalette: document.getElementById("commandPalette"),
  commandPaletteInput: document.getElementById("commandPaletteInput"),
  commandPaletteList: document.getElementById("commandPaletteList"),
  recentTools: document.getElementById("recentTools"),
  quickLaunchTools: document.getElementById("quickLaunchTools"),
};

let activeToolId = null;
let activeFrame = null;
const framesById = new Map();
let preloadTimer = null;
let pendingPreloadId = null;
let loaderInterval = null;
let loaderStart = 0;
let pinnedToolIds = loadPinnedToolIds();
let recentToolIds = loadRecentToolIds();
let commandPaletteResults = [];
let commandPaletteIndex = 0;
const commandPaletteShortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘K" : "Ctrl K";

function loadPinnedToolIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_TOOLS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const validIds = new Set(TOOLS.map((tool) => tool.id));
    return parsed.filter((id) => validIds.has(id));
  } catch {
    return [];
  }
}

function savePinnedToolIds() {
  localStorage.setItem(PINNED_TOOLS_KEY, JSON.stringify(pinnedToolIds));
}

function loadRecentToolIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const validIds = new Set(TOOLS.map((tool) => tool.id));
    return parsed.filter((id) => validIds.has(id)).slice(0, RECENT_TOOLS_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentToolIds() {
  localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(recentToolIds));
}

function rememberRecentTool(toolId) {
  if (!toolId) return;
  recentToolIds = [toolId, ...recentToolIds.filter((id) => id !== toolId)].slice(0, RECENT_TOOLS_LIMIT);
  saveRecentToolIds();
  renderWelcomeTools();
}

function isPinned(toolId) {
  return pinnedToolIds.includes(toolId);
}

function togglePinnedTool(toolId) {
  if (isPinned(toolId)) {
    pinnedToolIds = pinnedToolIds.filter((id) => id !== toolId);
  } else {
    pinnedToolIds = [...pinnedToolIds, toolId];
  }
  savePinnedToolIds();
  applySearch();
  renderWelcomeTools();
}

function showLoader(tool) {
  if (!els.frameLoader) return;
  const text = els.frameLoader.querySelector(".frame-loader__text");
  const stageEl = els.frameLoader.querySelector(".frame-loader__stage");
  const percentEl = els.frameLoader.querySelector(".frame-loader__percent");
  if (text) {
    text.textContent = tool?.name ? `Loading ${tool.name}...` : "Loading tool...";
  }
  if (stageEl) stageEl.textContent = "Connecting";
  if (percentEl) percentEl.textContent = "0%";
  els.frameLoader.classList.add("is-visible");
  els.frameLoader.setAttribute("aria-hidden", "false");

  loaderStart = Date.now();
  if (loaderInterval) {
    clearInterval(loaderInterval);
  }
  loaderInterval = setInterval(() => {
    const elapsed = Date.now() - loaderStart;
    let stage = "Connecting";
    let percent = 5;
    if (elapsed < 600) {
      stage = "Connecting";
      percent = Math.min(20, Math.round(5 + (elapsed / 600) * 15));
    } else if (elapsed < 1600) {
      stage = "Fetching";
      percent = Math.min(60, Math.round(20 + ((elapsed - 600) / 1000) * 40));
    } else if (elapsed < 3200) {
      stage = "Rendering";
      percent = Math.min(85, Math.round(60 + ((elapsed - 1600) / 1600) * 25));
    } else {
      stage = "Finalizing";
      percent = 95;
    }
    if (stageEl) stageEl.textContent = stage;
    if (percentEl) percentEl.textContent = `${percent}%`;
  }, 120);
}

function hideLoader() {
  if (!els.frameLoader) return;
  els.frameLoader.classList.remove("is-visible");
  els.frameLoader.setAttribute("aria-hidden", "true");
  if (loaderInterval) {
    clearInterval(loaderInterval);
    loaderInterval = null;
  }
}

function getOrCreateFrame(tool, opts = {}) {
  const desiredLoading = opts.loading || "eager";
  let frame = framesById.get(tool.id);
  if (frame) {
    if (desiredLoading === "eager") {
      frame.loading = "eager";
    }
    return frame;
  }

  frame = document.createElement("iframe");
  frame.className = "frame";
  frame.title = `${tool.name} iframe`;
  frame.referrerPolicy = "no-referrer";
  frame.loading = desiredLoading;
  frame.allow = "clipboard-read; clipboard-write";
  frame.dataset.toolId = tool.id;
  frame.addEventListener("load", () => {
    frame.dataset.loaded = "true";
    if (frame === activeFrame) {
      hideLoader();
    }
  });
  frame.addEventListener("error", () => {
    if (frame === activeFrame) {
      hideLoader();
    }
  });
  frame.src = tool.url;

  framesById.set(tool.id, frame);
  els.frameHost.appendChild(frame);
  return frame;
}

function schedulePreload(tool) {
  if (!PRELOAD_ON_HOVER || !tool) return;
  if (framesById.has(tool.id)) return;
  pendingPreloadId = tool.id;
  if (preloadTimer) {
    clearTimeout(preloadTimer);
  }
  preloadTimer = setTimeout(() => {
    preloadTimer = null;
    const id = pendingPreloadId;
    pendingPreloadId = null;
    if (!id) return;
    const match = TOOLS.find((t) => t.id === id);
    if (match && !framesById.has(match.id)) {
      getOrCreateFrame(match, { loading: "lazy" });
    }
  }, PRELOAD_DELAY_MS);
}

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function getMatchingTools(query) {
  const q = normalize(query);
  const source = [...pinnedToolIds.map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean)];
  const pinnedSet = new Set(source.map((tool) => tool.id));
  source.push(...TOOLS.filter((tool) => !pinnedSet.has(tool.id)));

  if (!q) return source;

  return source.filter((tool) => {
    const hay = `${tool.name} ${tool.id} ${tool.url}`.toLowerCase();
    return hay.includes(q);
  });
}

function getToolById(toolId) {
  return TOOLS.find((tool) => tool.id === toolId);
}

function createWelcomeToolButton(tool, options = {}) {
  const button = document.createElement("button");
  button.className = "empty__feature";
  button.type = "button";
  button.dataset.toolId = tool.id;

  const icon = document.createElement("span");
  icon.className = "empty__feature-icon";
  const img = document.createElement("img");
  img.src = tool.faviconUrl;
  img.alt = "";
  img.onerror = () => {
    img.remove();
    icon.textContent = tool.name.slice(0, 2).toUpperCase();
  };
  icon.appendChild(img);

  const copy = document.createElement("span");
  copy.className = "empty__feature-copy";

  const name = document.createElement("span");
  name.className = "empty__feature-name";
  name.textContent = tool.name;
  copy.appendChild(name);

  if (options.meta) {
    const meta = document.createElement("span");
    meta.className = "empty__feature-meta";
    meta.textContent = options.meta;
    copy.appendChild(meta);
  }

  if (options.badge) {
    button.classList.add("has-badge");
    const badge = document.createElement("span");
    badge.className = "empty__feature-badge";
    if (options.badge === "Pinned") {
      badge.classList.add("is-pinned");
      badge.setAttribute("aria-label", "Pinned");
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 17v5"></path>
          <path d="M5 17h14"></path>
          <path d="M6 17l1-7-3-3V5h16v2l-3 3 1 7"></path>
        </svg>
      `;
    } else {
      badge.textContent = options.badge;
    }
    button.appendChild(badge);
  }

  button.appendChild(icon);
  button.appendChild(copy);
  button.addEventListener("click", () => setActive(tool));
  button.addEventListener("mouseenter", () => schedulePreload(tool));
  button.addEventListener("focus", () => schedulePreload(tool));
  return button;
}

function renderWelcomeTools() {
  if (els.quickLaunchTools) {
    els.quickLaunchTools.innerHTML = "";
    QUICK_LAUNCH_TOOL_IDS.map(getToolById).filter(Boolean).forEach((tool) => {
      const badge = NEW_TOOL_IDS.has(tool.id) ? "New" : isPinned(tool.id) ? "Pinned" : "";
      els.quickLaunchTools.appendChild(createWelcomeToolButton(tool, {
        meta: tool.id,
        badge,
      }));
    });
  }

  if (!els.recentTools) return;
  els.recentTools.innerHTML = "";
  const recentTools = recentToolIds.map(getToolById).filter(Boolean);

  if (recentTools.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty__recent-empty";
    empty.textContent = "Open a tool once and it will stay ready here.";
    els.recentTools.appendChild(empty);
    return;
  }

  recentTools.forEach((tool) => {
    els.recentTools.appendChild(createWelcomeToolButton(tool, {
      meta: "Recent",
      badge: isPinned(tool.id) ? "Pinned" : "",
    }));
  });
}

// Convert tool name to URL-friendly format
function toolNameToRoute(name) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

// Convert URL route to tool ID
function routeToToolId(route) {
  if (!route) return null;
  const tool = TOOLS.find(t => toolNameToRoute(t.name) === route);
  return tool?.id ?? null;
}

// Get current route from URL
function getCurrentRoute() {
  const hash = window.location.hash.slice(1); // Remove #
  return hash || null;
}

// Update URL without triggering navigation
function updateURL(route, replaceState = false) {
  const newURL = route ? `#${route}` : window.location.pathname;
  if (replaceState) {
    window.history.replaceState(null, "", newURL);
  } else {
    window.history.pushState(null, "", newURL);
  }
}

function setActive(tool, updateHistory = true) {
  activeToolId = tool?.id ?? null;

  // Update menu selection
  for (const btn of els.list.querySelectorAll("button[data-tool-id]")) {
    const isActive = btn.dataset.toolId === activeToolId;
    btn.setAttribute("aria-current", isActive ? "true" : "false");
  }

  if (!tool) {
    els.empty.style.display = "grid";
    if (activeFrame) {
      activeFrame.classList.remove("is-visible");
      activeFrame = null;
    }
    els.hint.textContent = "";
    hideLoader();
    if (updateHistory) {
      updateURL(null, true);
    }
    return;
  }

  els.empty.style.display = "none";
  const frame = getOrCreateFrame(tool, { loading: "eager" });
  if (activeFrame && activeFrame !== frame) {
    activeFrame.classList.remove("is-visible");
  }
  frame.classList.add("is-visible");
  activeFrame = frame;
  els.hint.textContent = "";
  if (frame.dataset.loaded === "true") {
    hideLoader();
  } else {
    showLoader(tool);
  }
  rememberRecentTool(tool.id);

  // Update URL
  if (updateHistory) {
    const route = toolNameToRoute(tool.name);
    updateURL(route);
  }
}

// Sidebar collapse/expand
function toggleSidebar() {
  els.sidebar.classList.toggle("is-collapsed");
  els.app.classList.toggle("sidebar-collapsed");
}

els.collapseBtn.addEventListener("click", toggleSidebar);
els.expandBtn.addEventListener("click", toggleSidebar);
els.brandHome.addEventListener("click", () => setActive(null));

// Support Modal
function openSupportModal() {
  els.supportModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeSupportModal() {
  els.supportModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

els.supportBtn.addEventListener("click", openSupportModal);
els.modalClose.addEventListener("click", closeSupportModal);

// Close modal when clicking outside
els.supportModal.addEventListener("click", (e) => {
  if (e.target === els.supportModal) {
    closeSupportModal();
  }
});

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.supportModal.getAttribute("aria-hidden") === "false") {
    closeSupportModal();
  }
});

function renderCommandPalette() {
  const query = els.commandPaletteInput.value;
  commandPaletteResults = getMatchingTools(query);
  commandPaletteIndex = Math.min(commandPaletteIndex, Math.max(0, commandPaletteResults.length - 1));
  els.commandPaletteList.innerHTML = "";

  const appendSection = (title, tools) => {
    if (tools.length === 0) return;

    const sectionTitle = document.createElement("li");
    sectionTitle.className = "command-palette__section-title";
    sectionTitle.textContent = title;
    els.commandPaletteList.appendChild(sectionTitle);

    for (const tool of tools) {
      const index = commandPaletteResults.findIndex((result) => result.id === tool.id);
      els.commandPaletteList.appendChild(createCommandPaletteItem(tool, index));
    }
  };

  const pinnedSet = new Set(pinnedToolIds);
  const pinnedResults = commandPaletteResults.filter((tool) => pinnedSet.has(tool.id));
  const regularResults = commandPaletteResults.filter((tool) => !pinnedSet.has(tool.id));

  appendSection("Pinned", pinnedResults);
  appendSection(pinnedResults.length > 0 ? "All tools" : "Open tool", regularResults);

  if (commandPaletteResults.length === 0) {
    const empty = document.createElement("li");
    empty.className = "command-palette__empty";
    empty.textContent = "No matching tools.";
    els.commandPaletteList.appendChild(empty);
  }
}

function createCommandPaletteItem(tool, index) {
  const item = document.createElement("li");
  item.className = "command-palette__item";
  item.dataset.index = String(index);
  item.dataset.toolId = tool.id;
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", String(index === commandPaletteIndex));

  const icon = document.createElement("span");
  icon.className = "command-palette__item-icon";
  const img = document.createElement("img");
  img.alt = "";
  img.src = tool.faviconUrl;
  img.onerror = () => img.remove();
  icon.appendChild(img);

  const label = document.createElement("span");
  label.className = "command-palette__item-label";

  const name = document.createElement("span");
  name.className = "command-palette__item-name";
  name.textContent = tool.name;

  const meta = document.createElement("span");
  meta.className = "command-palette__item-meta";
  meta.textContent = isPinned(tool.id) ? "Pinned" : tool.id;

  label.appendChild(name);
  label.appendChild(meta);

  item.appendChild(icon);
  item.appendChild(label);
  item.addEventListener("click", () => openCommandPaletteTool(index));
  item.addEventListener("mouseenter", () => {
    commandPaletteIndex = index;
    updateCommandPaletteSelection();
  });
  return item;
}

function updateCommandPaletteSelection() {
  const items = els.commandPaletteList.querySelectorAll(".command-palette__item");
  items.forEach((item, index) => {
    const selected = index === commandPaletteIndex;
    item.setAttribute("aria-selected", String(selected));
    if (selected) item.scrollIntoView({ block: "nearest" });
  });
}

function syncCommandShortcutLabels() {
  document.querySelectorAll("[data-command-shortcut]").forEach((label) => {
    label.textContent = commandPaletteShortcut;
  });
}

function openCommandPalette() {
  els.commandPalette.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  commandPaletteIndex = 0;
  els.commandPaletteInput.value = "";
  syncCommandShortcutLabels();
  renderCommandPalette();
  requestAnimationFrame(() => els.commandPaletteInput.focus());
}

function closeCommandPalette() {
  els.commandPalette.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function toggleCommandPalette() {
  if (els.commandPalette.getAttribute("aria-hidden") === "false") {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

function openCommandPaletteTool(index = commandPaletteIndex) {
  const tool = commandPaletteResults[index];
  if (!tool) return;
  closeCommandPalette();
  setActive(tool);
}

els.commandPalette.addEventListener("click", (event) => {
  if (event.target === els.commandPalette) {
    closeCommandPalette();
  }
});

els.commandPaletteInput.addEventListener("input", () => {
  commandPaletteIndex = 0;
  renderCommandPalette();
});

els.commandPaletteInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (commandPaletteResults.length === 0) return;
    commandPaletteIndex = Math.min(commandPaletteIndex + 1, commandPaletteResults.length - 1);
    updateCommandPaletteSelection();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (commandPaletteResults.length === 0) return;
    commandPaletteIndex = Math.max(commandPaletteIndex - 1, 0);
    updateCommandPaletteSelection();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    openCommandPaletteTool();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeCommandPalette();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.commandPalette.getAttribute("aria-hidden") === "false") {
    event.preventDefault();
    closeCommandPalette();
    return;
  }

  const isCommandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
  if (!isCommandK) return;
  event.preventDefault();
  toggleCommandPalette();
});

function createToolListItem(tool) {
  const li = document.createElement("li");
  li.className = "menu__row";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "menu__item";
  btn.dataset.toolId = tool.id;
  btn.title = tool.name;
  btn.setAttribute("aria-current", tool.id === activeToolId ? "true" : "false");

  const icon = document.createElement("span");
  icon.className = "menu__icon";
  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.src = tool.faviconUrl;
  img.onerror = () => {
    // If a favicon is missing, just hide the broken image
    img.remove();
  };
  icon.appendChild(img);

  const label = document.createElement("span");
  label.className = "menu__label";

  const name = document.createElement("span");
  name.className = "menu__name";
  name.textContent = tool.name;

  label.appendChild(name);

  const pin = document.createElement("button");
  pin.type = "button";
  pin.className = "menu__pin";
  pin.dataset.toolId = tool.id;
  pin.dataset.pinned = String(isPinned(tool.id));
  pin.setAttribute("aria-label", isPinned(tool.id) ? `Unpin ${tool.name}` : `Pin ${tool.name}`);
  pin.setAttribute("aria-pressed", String(isPinned(tool.id)));
  pin.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.75l2.52 5.11 5.64.82-4.08 3.98.96 5.62L12 16.62l-5.04 2.66.96-5.62-4.08-3.98 5.64-.82L12 3.75z"></path>
    </svg>
  `;

  btn.appendChild(icon);
  btn.appendChild(label);
  btn.addEventListener("click", () => setActive(tool));
  pin.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePinnedTool(tool.id);
  });
  btn.addEventListener("mouseenter", () => schedulePreload(tool));
  btn.addEventListener("focus", () => schedulePreload(tool));

  li.appendChild(btn);
  li.appendChild(pin);
  return li;
}

function appendToolSection(title, tools, options = {}) {
  if (tools.length === 0) return;

  if (title) {
    const headerLi = document.createElement("li");
    headerLi.className = "menu__section-title";
    headerLi.textContent = title;
    els.list.appendChild(headerLi);
  }

  for (const tool of tools) {
    els.list.appendChild(createToolListItem(tool));
  }

  if (options.withDivider) {
    const divider = document.createElement("li");
    divider.className = "menu__divider";
    divider.setAttribute("aria-hidden", "true");
    els.list.appendChild(divider);
  }
}

function renderList(filteredTools, options = {}) {
  els.list.innerHTML = "";

  const pinnedSet = new Set(pinnedToolIds);
  const pinnedTools = pinnedToolIds
    .map((id) => filteredTools.find((tool) => tool.id === id))
    .filter(Boolean);
  const regularTools = filteredTools.filter((tool) => !pinnedSet.has(tool.id));
  const showPinnedSection = options.showPinnedSection && pinnedTools.length > 0;

  if (showPinnedSection) {
    appendToolSection("Pinned", pinnedTools, { withDivider: regularTools.length > 0 });
  }
  appendToolSection(showPinnedSection ? "All tools" : "", regularTools);

  if (filteredTools.length === 0) {
    const li = document.createElement("li");
    const div = document.createElement("div");
    div.className = "hint";
    div.style.padding = "10px 12px";
    div.textContent = "No matching tools.";
    li.appendChild(div);
    els.list.appendChild(li);
  }
}

function applySearch() {
  const q = normalize(els.search.value);
  if (!q) {
    renderList(TOOLS, { showPinnedSection: true });
    return;
  }

  // Using Lodash filter for better performance
  const filtered = _.filter(TOOLS, (t) => {
    const hay = `${t.name} ${t.id} ${t.url}`.toLowerCase();
    return _.includes(hay, q);
  });
  renderList(filtered, { showPinnedSection: true });
}

// Init
syncCommandShortcutLabels();
renderWelcomeTools();
renderList(TOOLS, { showPinnedSection: true });

// Load tool from URL on page load
function loadFromURL() {
  const route = getCurrentRoute();
  if (route) {
    const toolId = routeToToolId(route);
    const tool = TOOLS.find(t => t.id === toolId);
    if (tool) {
      setActive(tool, false); // Don't update history on initial load
      return;
    }
  }
  setActive(null, false);
}

// Handle browser back/forward buttons
window.addEventListener("popstate", () => {
  loadFromURL();
});

// Load initial tool
loadFromURL();

els.search.addEventListener("input", applySearch);

// Keyboard: Enter loads first visible tool
els.search.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const firstBtn = els.list.querySelector("button.menu__item");
  if (firstBtn) firstBtn.click();
});

function inferGitHubPagesRepo() {
  const host = window.location.hostname;
  if (!host.endsWith("github.io")) return null;

  const owner = host.split(".")[0];
  const path = window.location.pathname || "/";
  const segments = path.split("/").filter(Boolean);

  // Project pages: https://owner.github.io/repo/...
  // User pages:    https://owner.github.io/...
  const repo = segments.length > 0 && segments[0] !== "index.html" ? segments[0] : `${owner}.github.io`;
  return { owner, repo };
}

function getConfiguredGitHubRepo() {
  const meta = document.querySelector('meta[name="github-repo"]');
  const value = meta?.getAttribute("content")?.trim();
  if (!value) return null;
  const [owner, repo] = value.split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function loadDeployedVersion() {
  if (!els.version) return;

  const inferred = getConfiguredGitHubRepo() || inferGitHubPagesRepo();
  if (!inferred) {
    els.version.style.display = "none";
    return;
  }

  const cacheKey = `devtools:gh-version:${inferred.owner}/${inferred.repo}`;
  const cachedRaw = localStorage.getItem(cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached?.value && cached?.ts && Date.now() - cached.ts < 60 * 60 * 1000) {
        els.version.textContent = cached.value;
        els.version.href = cached.href || "#";
        els.version.dataset.tooltip = cached.tooltip || "Version from GitHub Pages deploy";
        return;
      }
    } catch {
      // ignore cache parse errors
    }
  }

  try {
    els.version.textContent = "Version…";
    els.version.dataset.tooltip = "Loading version…";

    const apiUrl = `https://api.github.com/repos/${inferred.owner}/${inferred.repo}/commits?per_page=1`;
    const res = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    const commit = Array.isArray(data) ? data[0] : null;
    const sha = commit?.sha;
    if (!sha) throw new Error("Missing commit SHA");

    const shortSha = String(sha).slice(0, 7);
    const dateRaw = commit?.commit?.committer?.date || commit?.commit?.author?.date;
    const date = dateRaw ? new Date(dateRaw).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) : "";
    const href = commit?.html_url || `https://github.com/${inferred.owner}/${inferred.repo}/commit/${sha}`;

    const value = `v${shortSha}`;
    const tooltip = date ? `Deployed: ${date} • ${inferred.repo}@${shortSha}` : `Deployed: ${inferred.repo}@${shortSha}`;

    els.version.textContent = value;
    els.version.href = href;
    els.version.dataset.tooltip = tooltip;

    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), value, href, tooltip }));
  } catch (err) {
    els.version.textContent = "Version";
    els.version.href = "#";
    els.version.dataset.tooltip = "Version unavailable";
  }
}

loadDeployedVersion();
