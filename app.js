const BASE = "https://piyushdoorwar.github.io/";

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
  sidebar: document.getElementById("sidebar"),
  app: document.getElementById("app"),
  collapseBtn: document.getElementById("collapseBtn"),
  expandBtn: document.getElementById("expandBtn"),
  version: document.getElementById("appVersion"),
  supportBtn: document.getElementById("supportBtn"),
  supportModal: document.getElementById("supportModal"),
  modalClose: document.getElementById("modalClose"),
};

let activeToolId = null;
let activeFrame = null;
const framesById = new Map();

function getOrCreateFrame(tool) {
  let frame = framesById.get(tool.id);
  if (frame) return frame;

  frame = document.createElement("iframe");
  frame.className = "frame";
  frame.title = `${tool.name} iframe`;
  frame.referrerPolicy = "no-referrer";
  frame.loading = "lazy";
  frame.allow = "clipboard-read; clipboard-write";
  frame.dataset.toolId = tool.id;
  frame.src = tool.url;

  framesById.set(tool.id, frame);
  els.frameHost.appendChild(frame);
  return frame;
}

function normalize(text) {
  // Using Lodash for string normalization
  return _.toLower(_.trim(text || ""));
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
    if (updateHistory) {
      updateURL(null, true);
    }
    return;
  }

  els.empty.style.display = "none";
  const frame = getOrCreateFrame(tool);
  if (activeFrame && activeFrame !== frame) {
    activeFrame.classList.remove("is-visible");
  }
  frame.classList.add("is-visible");
  activeFrame = frame;
  els.hint.textContent = "";

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

function renderList(filteredTools) {
  els.list.innerHTML = "";

  for (const tool of filteredTools) {
    const li = document.createElement("li");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu__item";
    btn.dataset.toolId = tool.id;
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

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.addEventListener("click", () => setActive(tool));

    li.appendChild(btn);
    els.list.appendChild(li);
  }

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
    renderList(TOOLS);
    return;
  }

  // Using Lodash filter for better performance
  const filtered = _.filter(TOOLS, (t) => {
    const hay = `${t.name} ${t.id} ${t.url}`.toLowerCase();
    return _.includes(hay, q);
  });
  renderList(filtered);
}

// Init
renderList(TOOLS);

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
