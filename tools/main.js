(function () {
  "use strict";

  const sharedScriptUrl = document.currentScript?.src;
  if (sharedScriptUrl && !document.querySelector('script[data-dev-tools-analytics]')) {
    const analytics = document.createElement('script');
    analytics.src = new URL('../analytics.js', sharedScriptUrl).href;
    analytics.async = true;
    analytics.dataset.devToolsAnalytics = '';
    document.head.appendChild(analytics);
  }

  const root = window.DevToolsMain || {};

  root.$ = root.$ || ((selector, scope = document) => scope.querySelector(selector));
  root.$$ = root.$$ || ((selector, scope = document) => Array.from(scope.querySelectorAll(selector)));

  root.copyText = root.copyText || async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  root.downloadText = root.downloadText || function downloadText(filename, contents, type = "text/plain") {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  root.openModal = root.openModal || function openModal(modal, activeClass = "is-open") {
    if (!modal) return;
    modal.classList.add(activeClass);
    modal.setAttribute("aria-hidden", "false");
  };

  root.closeModal = root.closeModal || function closeModal(modal, activeClass = "is-open") {
    if (!modal) return;
    modal.classList.remove(activeClass);
    modal.setAttribute("aria-hidden", "true");
  };

  /* --- Dropdown ------------------------------------------------------------
     Shared behaviour for the .dd component (see tools/main.css for the markup
     contract). Every tool used to carry its own copy of open/close, outside
     click, and Escape handling; this is the single implementation.

     Selecting an option:
       - marks it aria-selected and updates .dd__value
       - mirrors the value into the native <select> named by data-dd-select
         and fires `change` on it, so existing tool code keeps working
       - fires a `dd:change` CustomEvent on the .dd root, detail {value, label}

     data-dd="menu" is a command menu: it fires the event but tracks no
     selection.
     ---------------------------------------------------------------------- */

  const OPEN_CLASS = "is-open";

  function ddParts(dropdown) {
    return {
      trigger: dropdown.querySelector(".dd__trigger"),
      menu: dropdown.querySelector(".dd__menu"),
      value: dropdown.querySelector(".dd__value"),
      options: Array.from(dropdown.querySelectorAll(".dd__option")),
    };
  }

  root.closeDropdown = root.closeDropdown || function closeDropdown(dropdown) {
    if (!dropdown || !dropdown.classList.contains(OPEN_CLASS)) return;
    dropdown.classList.remove(OPEN_CLASS);
    ddParts(dropdown).trigger?.setAttribute("aria-expanded", "false");
  };

  root.closeAllDropdowns = root.closeAllDropdowns || function closeAllDropdowns(except = null) {
    document.querySelectorAll(".dd." + OPEN_CLASS).forEach((dropdown) => {
      if (dropdown !== except) root.closeDropdown(dropdown);
    });
  };

  root.openDropdown = root.openDropdown || function openDropdown(dropdown) {
    if (!dropdown) return;
    root.closeAllDropdowns(dropdown);
    dropdown.classList.add(OPEN_CLASS);
    const { trigger, options } = ddParts(dropdown);
    trigger?.setAttribute("aria-expanded", "true");
    // Focus the current selection so arrow keys start from the right place.
    const current = options.find((option) => option.getAttribute("aria-selected") === "true");
    (current || options[0])?.focus();
  };

  root.selectDropdownValue = root.selectDropdownValue || function selectDropdownValue(dropdown, value, { emit = true } = {}) {
    const { value: valueNode, options } = ddParts(dropdown);
    const chosen = options.find((option) => option.dataset.value === value);
    if (!chosen) return false;

    if (dropdown.dataset.dd !== "menu") {
      options.forEach((option) => {
        const isChosen = option === chosen;
        option.classList.toggle("is-active", isChosen);
        if (isChosen) option.setAttribute("aria-selected", "true");
        else option.removeAttribute("aria-selected");
      });
      if (valueNode) valueNode.textContent = chosen.textContent.trim();
    }

    // Keep a paired native <select> authoritative for tools that read it.
    const selectId = dropdown.dataset.ddSelect;
    const select = selectId ? document.querySelector(selectId) : null;
    if (select && select.value !== value) {
      select.value = value;
      if (emit) select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (emit) {
      dropdown.dispatchEvent(new CustomEvent("dd:change", {
        bubbles: true,
        detail: { value, label: chosen.textContent.trim() },
      }));
    }
    return true;
  };

  root.initDropdowns = root.initDropdowns || function initDropdowns(scope = document) {
    const roots = [
      ...(scope.matches?.("[data-dd]") ? [scope] : []),
      ...scope.querySelectorAll("[data-dd]"),
    ];

    roots.forEach((dropdown) => {
      if (dropdown.dataset.ddReady) return;
      dropdown.dataset.ddReady = "1";

      const { trigger, menu, options } = ddParts(dropdown);
      if (!trigger || !menu) return;

      trigger.setAttribute("aria-haspopup", dropdown.dataset.dd === "menu" ? "menu" : "listbox");
      trigger.setAttribute("aria-expanded", "false");

      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        if (dropdown.classList.contains(OPEN_CLASS)) root.closeDropdown(dropdown);
        else root.openDropdown(dropdown);
      });

      trigger.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          root.openDropdown(dropdown);
        }
      });

      options.forEach((option) => {
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          if (option.disabled) return;
          root.selectDropdownValue(dropdown, option.dataset.value);
          root.closeDropdown(dropdown);
          trigger.focus();
        });
      });

      // Roving arrow-key navigation within the open menu.
      menu.addEventListener("keydown", (event) => {
        const enabled = options.filter((option) => !option.disabled);
        const index = enabled.indexOf(document.activeElement);

        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          const next = (index + step + enabled.length) % enabled.length;
          enabled[next]?.focus();
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          (event.key === "Home" ? enabled[0] : enabled[enabled.length - 1])?.focus();
          return;
        }
        if (event.key === "Escape" || event.key === "Tab") {
          root.closeDropdown(dropdown);
          if (event.key === "Escape") {
            event.preventDefault();
            trigger.focus();
          }
        }
      });
    });
  };

  // One document-level pair of listeners covers every dropdown on the page.
  if (!root._ddGlobalBound) {
    root._ddGlobalBound = true;
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.(".dd")) root.closeAllDropdowns();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") root.closeAllDropdowns();
    });
  }

  /* --- Icons ---------------------------------------------------------------
     One sprite for every repeated icon, injected once per page. Tools keep
     their <svg class="..."> wrapper (93 CSS rules size icons that way) and
     reference a symbol:

       <svg class="ui-icon" aria-hidden="true"><use href="#i-copy"></use></svg>

     Stroke geometry lives on the <symbol>, so every instance is identical
     regardless of what the host page declares. Add icons here, never inline.
     ---------------------------------------------------------------------- */

  const ICON_SPRITE = [
    ['copy', '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'],
    ['paste', '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>'],
    ['download', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'],
    ['upload', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'],
    ['trash', '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'],
    ['check', '<polyline points="20 6 9 17 4 12"/>'],
    ['close', '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'],
    ['info', '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/>'],
    ['undo', '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>'],
    ['redo', '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>'],
    ['file-text', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'],
    ['file-code', '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><path d="M10 12h4"/><path d="M10 16h4"/>'],
    ['align', '<line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/>'],
    ['sort', '<line x1="4" y1="6" x2="11" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>'],
    ['chevron-down', '<polyline points="6 9 12 15 18 9"/>'],
    ['menu', '<line x1="5" y1="8" x2="19" y2="8"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="5" y1="16" x2="19" y2="16"/>'],
    ['search', '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'],
    ['settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'],
  ];

  root.injectIconSprite = root.injectIconSprite || function injectIconSprite() {
    if (document.getElementById('dt-icon-sprite')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'dt-icon-sprite';
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICON_SPRITE.map(([name, body]) =>
      `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
      ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`
    ).join('');
    document.body.prepend(svg);
  };

  root.enhanceAccessibility = root.enhanceAccessibility || function enhanceAccessibility(scope = document) {
    const matches = (selector) => [
      ...(scope.matches?.(selector) ? [scope] : []),
      ...scope.querySelectorAll(selector),
    ];

    matches('button[data-tooltip]:not([aria-label])').forEach((button) => {
      const label = button.dataset.tooltip?.trim();
      if (label) button.setAttribute('aria-label', label);
    });

    matches('button:not([aria-label]):not([aria-labelledby])').forEach((button) => {
      if (button.textContent.trim()) return;
      const inferred = button.title?.trim()
        || (button.matches('.modal-close, [data-modal-close]') ? 'Close' : '')
        || button.id?.replace(/[-_]+/g, ' ').replace(/Btn$/i, '').trim();
      if (inferred) button.setAttribute('aria-label', inferred);
    });

    matches('input, textarea, select').forEach((control) => {
      if (control.type === 'hidden' || control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
      if (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return;
      if (control.closest('label')) return;

      const nearbyLabel = control.closest('.field-cell, .control-group, .option-control, .decoded-field')
        ?.querySelector('.field-label, .control-label, .option-label, label')
        ?.textContent
        ?.trim();
      const inferred = nearbyLabel || control.dataset.tooltip?.trim() || control.title?.trim() || control.placeholder?.trim() || control.id
        ?.replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, character => character.toUpperCase());
      if (inferred) control.setAttribute('aria-label', inferred);
    });

    matches('[contenteditable="true"]:not([aria-label])').forEach((editor) => {
      editor.setAttribute('role', 'textbox');
      editor.setAttribute('aria-label', editor.id?.replace(/[-_]+/g, ' ') || 'Editable content');
    });
  };

  window.DevToolsMain = root;
  root.injectIconSprite();
  root.enhanceAccessibility();
  root.initDropdowns();
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          root.enhanceAccessibility(node);
          root.initDropdowns(node);
        }
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
