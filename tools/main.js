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

  window.DevToolsMain = root;
})();
