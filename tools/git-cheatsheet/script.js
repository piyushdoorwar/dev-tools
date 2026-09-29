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
      card.className = "reference-entry";
      const h = document.createElement("h2");
      h.textContent = title;
      const pre = document.createElement("pre");
      pre.textContent = command;
      const p = document.createElement("p");
      p.textContent = note;
      const button = UtilityUI.iconButton("Copy command", "copy", () =>
        copy(command),
      );
      const line = document.createElement("div");
      line.className = "command-line";
      line.append(pre, button);
      card.append(h, line, p);
      return card;
    }),
  );
  if (!rows.length)
    $("results").innerHTML = '<p class="empty-state">No matching tasks.</p>';
}
$("search").oninput = render;
render();
