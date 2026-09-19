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
