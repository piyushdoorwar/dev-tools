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
      card.className = "card";
      const title = document.createElement("h2");
      title.textContent = mime;
      const p = document.createElement("p");
      p.textContent =
        (extensions
          ? extensions
              .split(" ")
              .map((e) => "." + e)
              .join(", ")
          : "No standard extension") +
        " — " +
        note;
      const button = document.createElement("button");
      button.className = "btn";
      button.textContent = "Copy Content-Type";
      button.onclick = () => copy("Content-Type: " + mime);
      card.append(title, p, button);
      return card;
    }),
  );
  if (!rows.length)
    $("results").textContent = "No match in this curated reference.";
}
$("search").oninput = render;
render();
