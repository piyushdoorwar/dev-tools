"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

function render() {
  const terms = value("search").toLowerCase().trim().split(/\s+/);
  const rows = GIT_TASKS.filter((row) =>
    terms.every((term) => row.join(" ").toLowerCase().includes(term)),
  );
  $("count").textContent = `${rows.length} tasks`;
  $("results").replaceChildren(
    ...rows.map(([title, command, note]) => {
      const card = document.createElement("article");
      card.className = "card";
      const h = document.createElement("h2");
      h.textContent = title;
      const pre = document.createElement("pre");
      pre.textContent = command;
      const p = document.createElement("p");
      p.textContent = note;
      const button = document.createElement("button");
      button.className = "btn";
      button.textContent = "Copy command";
      button.onclick = () => copy(command);
      card.append(h, pre, p, button);
      return card;
    }),
  );
  if (!rows.length) $("results").textContent = "No matching tasks.";
}
$("search").oninput = render;
render();
