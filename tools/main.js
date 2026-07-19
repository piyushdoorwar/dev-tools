(function () {
  "use strict";

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
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) root.enhanceAccessibility(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
