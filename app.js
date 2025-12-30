const BASE = "https://piyushdoorwar.github.io/";

// NOTE: Assumption: each tool lives at `${BASE}${id}/` and exposes `${BASE}${id}/favicon.svg`.
// If any URL differs, just edit it here.
const TOOLS = [
  {
    id: "markdown-editor",
    name: "Markdown Editor",
    url: `${BASE}markdown-editor/`,
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
    id: "jwt-debugger",
    name: "JWT Debugger",
    url: `${BASE}jwt-debugger/`,
  },
].map((t) => ({
  ...t,
  faviconUrl: `${BASE}${t.id}/favicon.svg`,
}));

const els = {
  list: document.getElementById("toolList"),
  search: document.getElementById("toolSearch"),
  frame: document.getElementById("toolFrame"),
  empty: document.getElementById("emptyState"),
  title: document.getElementById("activeTitle"),
  url: document.getElementById("activeUrl"),
  hint: document.getElementById("hint"),
  sidebar: document.getElementById("sidebar"),
  app: document.getElementById("app"),
  collapseBtn: document.getElementById("collapseBtn"),
  expandBtn: document.getElementById("expandBtn"),
};

let activeToolId = null;

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function setActive(tool) {
  activeToolId = tool?.id ?? null;

  // Update menu selection
  for (const btn of els.list.querySelectorAll("button[data-tool-id]")) {
    const isActive = btn.dataset.toolId === activeToolId;
    btn.setAttribute("aria-current", isActive ? "true" : "false");
  }

  if (!tool) {
    els.title.textContent = "Choose a tool";
    els.url.textContent = "";
    els.empty.style.display = "grid";
    els.frame.classList.remove("is-visible");
    els.frame.removeAttribute("src");
    els.hint.textContent = "";
    return;
  }

  els.title.textContent = tool.name;
  els.url.textContent = "";
  els.empty.style.display = "none";
  els.frame.classList.add("is-visible");

  // Force reload when switching tools
  els.frame.src = tool.url;
  els.hint.textContent = "";
}

// Sidebar collapse/expand
function toggleSidebar() {
  els.sidebar.classList.toggle("is-collapsed");
  els.app.classList.toggle("sidebar-collapsed");
}

els.collapseBtn.addEventListener("click", toggleSidebar);
els.expandBtn.addEventListener("click", toggleSidebar);

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

  const filtered = TOOLS.filter((t) => {
    const hay = `${t.name} ${t.id} ${t.url}`.toLowerCase();
    return hay.includes(q);
  });
  renderList(filtered);
}

// Init
renderList(TOOLS);
setActive(null);
els.search.addEventListener("input", applySearch);

// Keyboard: Enter loads first visible tool
els.search.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const firstBtn = els.list.querySelector("button.menu__item");
  if (firstBtn) firstBtn.click();
});
