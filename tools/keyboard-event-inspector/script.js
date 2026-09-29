"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

const history = [];
$("capture").addEventListener("keydown", (event) => {
  if (
    !["Tab", "Escape"].includes(event.key) &&
    !event.ctrlKey &&
    !event.metaKey
  )
    event.preventDefault();
  const entry = {
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    location: event.location,
    repeat: event.repeat,
    isComposing: event.isComposing,
    modifiers: {
      Alt: event.altKey,
      Control: event.ctrlKey,
      Meta: event.metaKey,
      Shift: event.shiftKey,
      AltGraph: event.getModifierState("AltGraph"),
      CapsLock: event.getModifierState("CapsLock"),
      NumLock: event.getModifierState("NumLock"),
    },
  };
  $("output").value = JSON.stringify(entry, null, 2);
  $("key-display").textContent = entry.key === " " ? "Space" : entry.key;
  $("key-code").textContent =
    `${entry.code || "No physical code"} · location ${entry.location}${entry.repeat ? " · repeat" : ""}`;
  document.querySelectorAll("[data-modifier]").forEach((chip) => {
    chip.classList.toggle("is-active", entry.modifiers[chip.dataset.modifier]);
  });
  history.unshift(entry);
  history.length = Math.min(history.length, 30);
  $("history").replaceChildren(
    ...history.map((item) => {
      const node = document.createElement("div");
      node.className = "history-entry";
      const text = document.createElement("pre");
      const modifiers = Object.entries(item.modifiers)
        .filter(([, active]) => active)
        .map(([name]) => name);
      text.textContent = `${item.key === " " ? "Space" : item.key}  ·  ${item.code}  ·  location ${item.location}${item.repeat ? "  ·  repeat" : ""}${modifiers.length ? "  ·  " + modifiers.join(" + ") : ""}`;
      node.append(
        text,
        UtilityUI.iconButton("Copy event", "copy", () =>
          copy(JSON.stringify(item, null, 2)),
        ),
      );
      return node;
    }),
  );
});
$("clear").onclick = () => {
  history.length = 0;
  $("history").replaceChildren();
  $("output").value = "";
  $("key-display").textContent = "⌨";
  $("key-code").textContent = "Click or Tab into this area to start";
  document
    .querySelectorAll("[data-modifier]")
    .forEach((chip) => chip.classList.remove("is-active"));
};
