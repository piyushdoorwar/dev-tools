"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

function render() {
  const number = (id) => {
    const n = Number(value(id));
    if (!Number.isInteger(n) || n < 1 || n > 10000)
      throw Error(
        "Dimensions and font size must be whole numbers from 1 to 10000.",
      );
    return n;
  };
  const w = number("width"),
    h = number("height"),
    size = number("font-size");
  for (const id of ["background", "foreground"])
    if (!/^#[0-9a-f]{6}$/i.test(value(id)))
      throw Error("Colours must be six-digit hex values.");
  const text = value("text") || `${w} × ${h}`;
  if (
    /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(
      text,
    )
  ) {
    throw Error("Text contains a character that XML cannot represent.");
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeMarkup(text)}"><rect width="100%" height="100%" fill="${value("background")}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${size}" fill="${value("foreground")}">${escapeMarkup(text)}</text></svg>`;
  $("output").value = svg;
  $("data-uri").value =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = document.createElement("img");
  img.alt = text;
  img.src = value("data-uri");
  $("preview").replaceChildren(img);
}
function refresh() {
  $("data-uri").value = "";
  $("preview").replaceChildren();
  run(render);
}
document
  .querySelectorAll("input")
  .forEach((input) => (input.oninput = refresh));
$("copy-uri").onclick = () => copy(value("data-uri"));
$("download").onclick = () =>
  run(() => {
    if (!value("output")) throw Error("Fix the inputs before downloading.");
    const url = URL.createObjectURL(
      new Blob([value("output")], { type: "image/svg+xml" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "placeholder.svg";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
refresh();

for (const id of ["background", "foreground"]) {
  const node = $(id + "-picker");
  const picker = DevToolsMain.createColorPicker(node);
  node.addEventListener("picker:change", ({ detail }) => {
    $(id).value = detail.hex;
    refresh();
  });
  $(id).addEventListener("change", () => {
    if (/^#[0-9a-f]{6}$/i.test(value(id))) picker.setColor(value(id));
  });
}
