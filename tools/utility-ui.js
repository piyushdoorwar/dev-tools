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
  return { $, value, run, copy, escapeMarkup };
})();
