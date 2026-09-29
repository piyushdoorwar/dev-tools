"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

function render() {
  const q = value("search").trim().toLowerCase().split(";")[0];
  const ext = q.includes("/") ? q : q.split(".").pop();
  const rows = MIME_TYPES.filter(
    (row) =>
      !q ||
      row[0].split(" ").includes(ext) ||
      row.join(" ").toLowerCase().includes(q),
  );
  $("count").textContent = `${rows.length} matching types`;
  $("results").replaceChildren(
    ...rows.map(([extensions, mime, note]) => {
      const card = document.createElement("article");
      card.className = "reference-entry";
      const title = document.createElement("h2");
      title.textContent = mime;
      const p = document.createElement("p");
      p.textContent = note;
      const head = document.createElement("div");
      head.className = "reference-head";
      head.append(
        title,
        UtilityUI.iconButton("Copy Content-Type", "copy", () =>
          copy("Content-Type: " + mime),
        ),
      );
      const tags = document.createElement("div");
      tags.className = "extension-list";
      for (const extension of extensions ? extensions.split(" ") : [""]) {
        const tag = document.createElement("span");
        tag.className = "extension-tag";
        tag.textContent = extension ? "." + extension : "No standard extension";
        tags.append(tag);
      }
      card.append(head, tags, p);
      return card;
    }),
  );
  if (!rows.length)
    $("results").innerHTML =
      '<p class="empty-state">No match in this curated reference.</p>';
}
$("search").oninput = render;
render();
