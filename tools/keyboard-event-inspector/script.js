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
  history.unshift(entry);
  history.length = Math.min(history.length, 30);
  $("history").replaceChildren(
    ...history.map((item) => {
      const node = document.createElement("pre");
      node.className = "card";
      node.textContent = JSON.stringify(item);
      return node;
    }),
  );
});
$("clear").onclick = () => {
  history.length = 0;
  $("history").replaceChildren();
  $("output").value = "";
};
