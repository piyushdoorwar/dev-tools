"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

function httpUrl(text) {
  if (!text) return "";
  const url = new URL(text);
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("URLs must use HTTP or HTTPS.");
  return url.href;
}
function render() {
  const url = httpUrl(value("url")),
    image = httpUrl(value("image"));
  const title = value("title"),
    description = value("description");
  const tags = [`<title>${escapeMarkup(title)}</title>`];
  if (url) tags.push(`<link rel="canonical" href="${escapeMarkup(url)}">`);
  const meta = (kind, key, val) => {
    if (val)
      tags.push(`<meta ${kind}="${key}" content="${escapeMarkup(val)}">`);
  };
  meta("name", "description", description);
  for (const [key, val] of Object.entries({
    type: "website",
    title,
    description,
    url,
    image,
    "image:alt": value("alt"),
    site_name: value("site"),
  }))
    meta("property", "og:" + key, val);
  for (const [key, val] of Object.entries({
    card: image ? "summary_large_image" : "summary",
    title,
    description,
    image,
    "image:alt": value("alt"),
  }))
    meta("name", "twitter:" + key, val);
  $("output").value = tags.join("\n");
  $("preview-title").textContent = title;
  $("preview-description").textContent = description;
  $("preview-url").textContent = url;
}
document.querySelectorAll("input").forEach(
  (input) =>
    (input.oninput = () => {
      $("preview-image").textContent = "Image preview appears after loading.";
      run(render);
    }),
);
$("load-image").onclick = () =>
  run(() => {
    const requested = value("image");
    const url = httpUrl(requested);
    if (!url) throw Error("Enter an image URL first.");
    const img = document.createElement("img");
    img.alt = value("alt");
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      if (value("image") === requested) $("preview-image").replaceChildren(img);
    };
    img.onerror = () => {
      $("error").textContent = "Image could not be loaded.";
    };
    img.src = url;
  });
run(render);
