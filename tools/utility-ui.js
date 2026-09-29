"use strict";
globalThis.UtilityUI = (() => {
  const $ = (id) => document.getElementById(id);
  const value = (id) => $(id).value;
  const run = (fn) => {
    try {
      $("error").textContent = "";
      fn();
    } catch (error) {
      $("error").textContent = error.message;
      document.querySelectorAll("textarea[readonly]").forEach((field) => {
        field.value = "";
      });
    }
  };
  const copy = async (text) => {
    try {
      await DevToolsMain.copyText(text);
      DevToolsMain.showToast("Copied", "success");
    } catch {
      DevToolsMain.showToast("Could not copy", "error");
    }
  };
  const escapeMarkup = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  document
    .getElementById("copy")
    ?.addEventListener("click", () => copy(value("output")));
  // Dynamic reference rows share the same accessible sprite buttons as panel headers.
  const iconButton = (label, icon, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-btn";
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + icon);
    svg.append(use);
    button.append(svg);
    button.addEventListener("click", onClick);
    return button;
  };
  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = $(button.dataset.clear);
      field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
  });
  document.querySelectorAll("[data-paste]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          DevToolsMain.showToast("Clipboard is empty", "info");
          return;
        }
        const field = $(button.dataset.paste);
        field.value = text;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.focus();
      } catch {
        DevToolsMain.showToast("Clipboard is not available", "error");
      }
    });
  });
  return { $, value, run, copy, escapeMarkup, iconButton };
})();
