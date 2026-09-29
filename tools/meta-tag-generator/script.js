// Open Graph / Meta Tag Generator — builds SEO, Open Graph and Twitter Card
// tags from a page's details and mocks how each surface renders the link.
//
// Everything recomputes on input. The one network request this page can make
// is the preview image, and only after the user presses Load image: an image
// URL is often a third-party host, so it is fetched with no referrer and never
// on its own.

"use strict";

const FIELDS = ["title", "description", "url", "image", "alt", "site", "type", "handle", "theme"];
const LIMITS = { title: 60, description: 160 };
const SURFACES = ["google", "facebook", "x", "linkedin", "slack"];
const OG_TYPES = ["website", "article", "product", "profile"];
const LABELS = {
  url: "Canonical URL",
  image: "Image URL",
  handle: "X handle",
  theme: "Theme colour",
};

const SAMPLE = {
  title: "How we cut our CI build times in half",
  description:
    "Caching, test sharding and a smaller base image took our median pipeline from 14 minutes to 6. Here is what worked, what did not, and the numbers.",
  url: "https://example.com/blog/faster-ci-builds",
  image: "https://example.com/og/faster-ci-builds.png",
  alt: "Bar chart of median build time falling from 14 to 6 minutes",
  site: "Example Engineering",
  type: "article",
  handle: "@exampleeng",
  theme: "#6739B7",
};

const $ = (id) => document.getElementById(id);
const inputs = Object.fromEntries(FIELDS.map((name) => [name, $(name)]));
const typeDropdown = document.querySelector(".type-dd");
const preview = $("preview");
const output = $("output");

const state = {
  surface: "google",
  model: null,
  // The preview image is opt-in: `status` is idle until the user asks.
  image: { url: "", status: "idle", node: null },
};

function showToast(message, type = "info") {
  window.DevToolsMain.showToast(message, type);
}

/* --- Validation ----------------------------------------------------------- */

function escapeMarkup(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseHttpUrl(raw) {
  const text = raw.trim();
  if (!text) return { value: "" };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: "Use an absolute HTTP or HTTPS URL, e.g. https://example.com/page" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: `${url.protocol} is not allowed. Use an HTTP or HTTPS URL` };
  }
  return { value: url.href };
}

function parseHandle(raw) {
  const text = raw.trim().replace(/^@/, "");
  if (!text) return { value: "" };
  if (!/^[A-Za-z0-9_]{1,15}$/.test(text)) {
    return { error: "Handles are 1–15 letters, digits or underscores" };
  }
  return { value: `@${text}` };
}

function parseTheme(raw) {
  const text = raw.trim();
  if (!text) return { value: "" };
  const parsed = window.DevToolsMain.color.parseHex(text.startsWith("#") ? text : `#${text}`);
  if (!parsed || parsed.a !== 1) return { error: "Use a hex colour like #6739B7" };
  return { value: window.DevToolsMain.color.formatHex(parsed) };
}

function collect() {
  const read = (name) => inputs[name].value;
  const errors = {};
  const checked = (name, parser) => {
    const result = parser(read(name));
    if (result.error) errors[name] = result.error;
    return result.value || "";
  };

  const model = {
    title: read("title").trim(),
    description: read("description").trim(),
    url: checked("url", parseHttpUrl),
    image: checked("image", parseHttpUrl),
    alt: read("alt").trim(),
    site: read("site").trim(),
    type: OG_TYPES.includes(read("type")) ? read("type") : "website",
    handle: checked("handle", parseHandle),
    theme: checked("theme", parseTheme),
    errors,
  };

  const warnings = [];
  if (!model.title) warnings.push({ field: "title", text: "Add a title" });
  else if (model.title.length > LIMITS.title) {
    warnings.push({ field: "title", text: `Title is ${model.title.length} characters; Google truncates near ${LIMITS.title}` });
  }
  if (!model.description) warnings.push({ field: "description", text: "Add a description" });
  else if (model.description.length > LIMITS.description) {
    warnings.push({ field: "description", text: `Description is ${model.description.length} characters; snippets stop near ${LIMITS.description}` });
  }
  if (!model.url && !errors.url) warnings.push({ field: "url", text: "Add a canonical URL so og:url is absolute" });
  if (model.image && !model.alt) warnings.push({ field: "alt", text: "Add alt text for the image" });
  model.warnings = warnings;
  return model;
}

/* --- Tags ----------------------------------------------------------------- */

// Each tag is structured data so the text and the highlighted view are built
// from the same source and cannot drift.
function buildGroups(model) {
  const meta = (attr, key, content) => (content ? { name: "meta", attrs: [[attr, key], ["content", content]] } : null);

  const seo = [
    model.title ? { name: "title", text: model.title } : null,
    meta("name", "description", model.description),
    model.url ? { name: "link", attrs: [["rel", "canonical"], ["href", model.url]] } : null,
    meta("name", "theme-color", model.theme),
  ];

  const og = [
    meta("property", "og:type", model.type),
    meta("property", "og:title", model.title),
    meta("property", "og:description", model.description),
    meta("property", "og:url", model.url),
    meta("property", "og:site_name", model.site),
    meta("property", "og:image", model.image),
    meta("property", "og:image:alt", model.image && model.alt),
  ];

  const twitter = [
    meta("name", "twitter:card", model.image ? "summary_large_image" : "summary"),
    meta("name", "twitter:site", model.handle),
    meta("name", "twitter:title", model.title),
    meta("name", "twitter:description", model.description),
    meta("name", "twitter:image", model.image),
    meta("name", "twitter:image:alt", model.image && model.alt),
  ];

  return [
    { label: "SEO", tags: seo.filter(Boolean) },
    { label: "Open Graph", tags: og.filter(Boolean) },
    { label: "Twitter / X", tags: twitter.filter(Boolean) },
  ].filter((group) => group.tags.length);
}

function tagText(tag) {
  if (tag.name === "title") return `<title>${escapeMarkup(tag.text)}</title>`;
  const attrs = tag.attrs.map(([key, value]) => ` ${key}="${escapeMarkup(value)}"`).join("");
  return `<${tag.name}${attrs}>`;
}

function groupsText(groups) {
  return groups
    .map((group) => [`<!-- ${group.label} -->`, ...group.tags.map(tagText)].join("\n"))
    .join("\n\n");
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function tagNodes(tag) {
  const nodes = [span("tok-punct", "<"), span("tok-tag", tag.name)];
  if (tag.name === "title") {
    nodes.push(span("tok-punct", ">"), span("tok-text", escapeMarkup(tag.text)));
    nodes.push(span("tok-punct", "</"), span("tok-tag", "title"), span("tok-punct", ">"));
    return nodes;
  }
  for (const [key, value] of tag.attrs) {
    nodes.push(document.createTextNode(" "), span("tok-attr", key), span("tok-punct", "="));
    nodes.push(span(key === "content" || key === "href" ? "tok-value" : "tok-key", `"${escapeMarkup(value)}"`));
  }
  nodes.push(span("tok-punct", ">"));
  return nodes;
}

function renderTags(model) {
  const groups = buildGroups(model);
  const fragment = document.createDocumentFragment();
  groups.forEach((group, index) => {
    if (index) fragment.append("\n\n");
    fragment.append(span("tok-comment", `<!-- ${group.label} -->`));
    for (const tag of group.tags) fragment.append("\n", ...tagNodes(tag));
  });
  output.replaceChildren(fragment);
  state.text = groupsText(groups);

  const count = groups.reduce((sum, group) => sum + group.tags.length, 0);
  const warnings = model.warnings.length;
  const errors = Object.keys(model.errors).length;
  const parts = [`${count} ${count === 1 ? "tag" : "tags"}`, `${warnings} ${warnings === 1 ? "warning" : "warnings"}`];
  if (errors) parts.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
  $("tagCount").textContent = parts.join(" · ");

  const status = $("tagsStatus");
  if (errors) {
    status.textContent = `${errors === 1 ? "1 invalid field" : `${errors} invalid fields`} left out`;
    status.className = "status-text error";
  } else {
    status.textContent = "Paste into your page's <head>";
    status.className = "status-text";
  }
}

/* --- Field feedback ------------------------------------------------------- */

function renderFields(model) {
  for (const name of FIELDS) {
    const hint = $(`${name}-hint`);
    const error = model.errors[name];
    if (error) inputs[name].setAttribute("aria-invalid", "true");
    else inputs[name].removeAttribute("aria-invalid");
    if (!hint) continue;
    hint.dataset.hint ??= hint.textContent;
    const warning = LIMITS[name] && inputs[name].value.trim().length > LIMITS[name];
    hint.textContent = error || (warning ? "May be truncated in results" : hint.dataset.hint);
    hint.classList.toggle("is-error", Boolean(error));
    hint.classList.toggle("is-warning", !error && Boolean(warning));
  }

  for (const [name, limit] of Object.entries(LIMITS)) {
    const length = inputs[name].value.trim().length;
    const counter = $(`${name}-count`);
    counter.textContent = `${length} / ${limit}`;
    counter.classList.toggle("is-warning", length > limit);
  }

  const status = $("detailsStatus");
  const [firstError] = Object.entries(model.errors);
  if (firstError) {
    status.textContent = `${LABELS[firstError[0]]}: ${firstError[1]}`;
    status.className = "status-text error";
  } else if (model.warnings.length) {
    status.textContent = model.warnings[0].text;
    status.className = "status-text warning";
  } else {
    status.textContent = "Ready to share";
    status.className = "status-text success";
  }

  const filled = FIELDS.filter((name) => inputs[name].value.trim()).length;
  $("filledCount").textContent = `${filled} of ${FIELDS.length} filled`;
}

/* --- Preview -------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A blank field shows a muted prompt rather than an empty line.
function textOr(tag, className, value, placeholder) {
  const node = el(tag, className, value || placeholder);
  if (!value) node.classList.add("is-placeholder");
  return node;
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  if (space > limit * 0.6) cut = cut.slice(0, space);
  return `${cut.replace(/[\s,.;:–-]+$/, "")} …`;
}

function hostOf(url) {
  if (!url) return "";
  return new URL(url).hostname.replace(/^www\./, "");
}

function breadcrumb(url) {
  if (!url) return "";
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  return [parsed.origin, ...segments].join(" › ");
}

const IMAGE_GLYPH =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';

function glyph() {
  const holder = el("span", "media-glyph");
  holder.innerHTML = IMAGE_GLYPH;
  return holder;
}

// The image area for surfaces that show one. Returns the loaded image, or a
// placeholder that loads it only when asked.
function media(model, className = "") {
  const box = el("div", `card-media ${className}`.trim());
  const image = state.image;
  if (image.status === "loaded" && image.node) {
    image.node.alt = model.alt;
    box.append(image.node);
    return box;
  }

  box.classList.add("is-empty");
  const host = hostOf(model.image);
  box.append(glyph());
  if (image.status === "error") {
    box.append(el("p", "media-title media-error", "Image could not be loaded"));
    box.lastChild.setAttribute("role", "alert");
  } else {
    box.append(el("p", "media-title", "Image not loaded"));
  }
  box.append(el("p", "media-meta", `Fetches from ${host} · no referrer`));

  const button = el("button", "btn btn-sm", image.status === "error" ? "Try again" : "Load image");
  button.type = "button";
  button.id = "load-image";
  button.dataset.action = "load-image";
  if (image.status === "loading") {
    button.disabled = true;
    button.textContent = "Loading…";
  }
  box.append(button);
  return box;
}

// A summary card has no image; draw the empty square the platform would.
function thumb() {
  const box = el("div", "card-thumb");
  box.append(glyph());
  return box;
}

const RENDERERS = {
  google(model) {
    const host = hostOf(model.url);
    const card = el("article", "google-result");
    const site = el("div", "g-site");
    site.append(el("span", "g-favicon", (model.site || host || "?").charAt(0).toUpperCase()));
    const siteText = el("div", "g-site-text");
    siteText.append(
      textOr("span", "g-site-name", model.site || host, "Site name"),
      textOr("span", "g-crumb", breadcrumb(model.url), "Add a canonical URL"),
    );
    site.append(siteText);
    card.append(
      site,
      textOr("h3", "g-title", model.title && truncate(model.title, LIMITS.title), "Add a title"),
      textOr("p", "g-snippet", model.description && truncate(model.description, LIMITS.description), "Add a description"),
    );
    return card;
  },

  facebook(model) {
    const card = el("article", "fb-card");
    if (model.image) card.append(media(model, "wide"));
    else card.classList.add("is-compact");
    const body = el("div", "fb-body");
    body.append(
      textOr("span", "fb-domain", hostOf(model.url).toUpperCase(), "ADD A CANONICAL URL"),
      textOr("h3", "fb-title", model.title, "Add a title"),
      textOr("p", "fb-desc", model.description, "Add a description"),
    );
    card.append(body);
    return card;
  },

  x(model) {
    const host = hostOf(model.url);
    const post = el("article", "x-post");
    const head = el("div", "x-head");
    head.append(el("span", "x-avatar", (model.site || "?").charAt(0).toUpperCase()));
    const who = el("div", "x-who");
    who.append(
      textOr("span", "x-name", model.site, "Your account"),
      textOr("span", "x-handle", model.handle, "@handle"),
    );
    head.append(who);
    post.append(head);

    if (model.image) {
      const card = el("div", "x-card is-large");
      const box = media(model, "wide");
      if (state.image.status === "loaded") {
        box.append(textOr("span", "x-overlay", model.title, "Add a title"));
      }
      card.append(box);
      post.append(card, textOr("p", "x-from", host && `From ${host}`, "Add a canonical URL"));
    } else {
      const card = el("div", "x-card is-summary");
      const body = el("div", "x-body");
      body.append(
        textOr("span", "x-domain", host, "Add a canonical URL"),
        textOr("h3", "x-title", model.title, "Add a title"),
        textOr("p", "x-desc", model.description, "Add a description"),
      );
      card.append(thumb(), body);
      post.append(card);
    }
    return post;
  },

  linkedin(model) {
    const card = el("article", "li-card");
    if (model.image) card.append(media(model, "wide"));
    else card.classList.add("is-compact");
    const body = el("div", "li-body");
    body.append(
      textOr("h3", "li-title", model.title, "Add a title"),
      textOr("span", "li-domain", hostOf(model.url), "Add a canonical URL"),
    );
    card.append(body);
    return card;
  },

  slack(model) {
    const card = el("article", "slack-unfurl");
    card.append(
      textOr("span", "slack-site", model.site || hostOf(model.url), "Site name"),
      textOr("h3", "slack-title", model.title, "Add a title"),
      textOr("p", "slack-desc", model.description, "Add a description"),
    );
    if (model.image) card.append(media(model, "slack"));
    return card;
  },
};

function renderPreview() {
  const model = state.model;
  const hadFocus = preview.contains(document.activeElement);
  const surface = el("div", `surface surface-${state.surface}`);
  surface.append(RENDERERS[state.surface](model));
  preview.replaceChildren(surface);
  if (hadFocus) ($("load-image") || preview).focus();
}

/* --- Image loading -------------------------------------------------------- */

function loadImage() {
  const url = state.model.image;
  if (!url) return;
  const img = document.createElement("img");
  // Set before src: the policy applies to the request src starts.
  img.referrerPolicy = "no-referrer";
  img.decoding = "async";
  state.image = { url, status: "loading", node: null };
  img.onload = () => {
    if (state.image.url !== url) return;
    state.image = { url, status: "loaded", node: img };
    renderPreview();
  };
  img.onerror = () => {
    if (state.image.url !== url) return;
    state.image = { url, status: "error", node: null };
    renderPreview();
  };
  img.src = url;
  renderPreview();
}

/* --- Update --------------------------------------------------------------- */

function update() {
  const model = collect();
  state.model = model;
  // Only a new image URL discards the loaded preview; editing any other
  // field keeps it.
  if (model.image !== state.image.url) state.image = { url: model.image, status: "idle", node: null };
  renderFields(model);
  renderTags(model);
  renderPreview();
}

/* --- Surfaces ------------------------------------------------------------- */

const tabs = [...document.querySelectorAll("#surfaceSwitch [data-surface]")];

function applySurface(surface) {
  state.surface = SURFACES.includes(surface) ? surface : "google";
  for (const tab of tabs) {
    const active = tab.dataset.surface === state.surface;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  preview.setAttribute("aria-labelledby", `tab-${state.surface}`);
}

function selectSurface(surface) {
  if (surface === state.surface) return;
  applySurface(surface);
  window.DevToolsMain.writeHashState(state.surface);
  renderPreview();
}

tabs.forEach((tab) => tab.addEventListener("click", () => selectSurface(tab.dataset.surface)));

$("surfaceSwitch").addEventListener("keydown", (event) => {
  const index = tabs.findIndex((tab) => tab.dataset.surface === state.surface);
  const next = {
    ArrowRight: (index + 1) % tabs.length,
    ArrowDown: (index + 1) % tabs.length,
    ArrowLeft: (index - 1 + tabs.length) % tabs.length,
    ArrowUp: (index - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  selectSurface(tabs[next].dataset.surface);
  tabs[next].focus();
});

/* --- Fields --------------------------------------------------------------- */

const themePicker = window.DevToolsMain.createColorPicker($("themePicker"));

function setField(name, value) {
  if (name === "type") {
    const type = OG_TYPES.includes(value) ? value : "website";
    inputs.type.value = type;
    window.DevToolsMain.selectDropdownValue(typeDropdown, type, { emit: false });
    return;
  }
  inputs[name].value = value;
  if (name === "theme") {
    const parsed = parseTheme(value);
    if (parsed.value) themePicker?.setColor(parsed.value);
  }
}

function fill(values) {
  for (const name of FIELDS) setField(name, values[name] ?? "");
  update();
}

for (const name of FIELDS) {
  if (name !== "type") inputs[name].addEventListener("input", update);
}
inputs.type.addEventListener("change", update);

inputs.theme.addEventListener("input", () => {
  const parsed = parseTheme(inputs.theme.value);
  if (parsed.value) themePicker?.setColor(parsed.value);
});

$("themePicker").addEventListener("picker:change", (event) => {
  inputs.theme.value = event.detail.hex;
  update();
});

$("fields").addEventListener("submit", (event) => event.preventDefault());

/* --- Import from pasted HTML ---------------------------------------------- */

// DOMParser builds an inert document: no scripts run and no images load.
function parseHead(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const metas = new Map();
  for (const node of doc.querySelectorAll("meta")) {
    const key = (node.getAttribute("property") || node.getAttribute("name") || "").trim().toLowerCase();
    const content = node.getAttribute("content");
    if (key && content !== null && !metas.has(key)) metas.set(key, content.trim());
  }
  const pick = (...keys) => keys.map((key) => metas.get(key)).find(Boolean) || "";
  const canonical = doc.querySelector('link[rel~="canonical" i]')?.getAttribute("href")?.trim() || "";
  const values = {
    title: doc.querySelector("title")?.textContent.trim() || pick("og:title", "twitter:title"),
    description: pick("description", "og:description", "twitter:description"),
    url: canonical || pick("og:url"),
    image: pick("og:image", "og:image:url", "og:image:secure_url", "twitter:image"),
    alt: pick("og:image:alt", "twitter:image:alt"),
    site: pick("og:site_name"),
    type: pick("og:type"),
    handle: pick("twitter:site"),
    theme: pick("theme-color"),
  };
  const found = Object.values(values).filter(Boolean).length;
  return { values, found };
}

/* --- Actions -------------------------------------------------------------- */

const ACTIONS = {
  sample() {
    fill(SAMPLE);
    showToast("Loaded sample page", "success");
  },
  paste() {
    navigator.clipboard.readText()
      .then((text) => {
        const { values, found } = parseHead(text || "");
        if (!found) {
          showToast("No title or meta tags found on the clipboard", "error");
          return;
        }
        fill(values);
        showToast(`Imported ${found} ${found === 1 ? "field" : "fields"} from HTML`, "success");
      })
      .catch(() => showToast("Paste failed", "error"));
  },
  clear() {
    fill({});
    inputs.title.focus();
  },
  copy() {
    if (!state.text) {
      showToast("Nothing to copy", "error");
      return;
    }
    window.DevToolsMain.copyText(state.text)
      .then(() => showToast("Tags copied", "success"))
      .catch(() => showToast("Copy failed", "error"));
  },
  download() {
    if (!state.text) {
      showToast("Nothing to download", "error");
      return;
    }
    window.DevToolsMain.downloadText("meta-tags.html", `${state.text}\n`, "text/html");
  },
  "load-image": loadImage,
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) ACTIONS[button.dataset.action]?.(button);
});

$("helpBtn").addEventListener("click", () => window.DevToolsMain.openModal("#helpModal"));

window.DevToolsMain.onHashState((value) => {
  applySurface(value);
  renderPreview();
});

applySurface(window.DevToolsMain.readHashState());
// Seed a realistic page so every panel explains itself on arrival.
fill(SAMPLE);
