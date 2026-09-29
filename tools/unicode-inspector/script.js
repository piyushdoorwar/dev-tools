"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

const names = new Map(
  UNICODE_DATA.characters.map((row) => [row[0], row.slice(1)]),
);
const hex = (n, width = 2) => n.toString(16).toUpperCase().padStart(width, "0");
function metadata(cp) {
  if (names.has(cp)) return names.get(cp);
  const range = UNICODE_DATA.ranges.find((r) => cp >= r[0] && cp <= r[1]);
  if (!range) return ["UNASSIGNED", "Cn"];
  if (cp >= 0xac00 && cp <= 0xd7a3) {
    const s = cp - 0xac00;
    const l = [
      "G",
      "GG",
      "N",
      "D",
      "DD",
      "R",
      "M",
      "B",
      "BB",
      "S",
      "SS",
      "",
      "J",
      "JJ",
      "C",
      "K",
      "T",
      "P",
      "H",
    ];
    const v = [
      "A",
      "AE",
      "YA",
      "YAE",
      "EO",
      "E",
      "YEO",
      "YE",
      "O",
      "WA",
      "WAE",
      "OE",
      "YO",
      "U",
      "WEO",
      "WE",
      "WI",
      "YU",
      "EU",
      "YI",
      "I",
    ];
    const t = [
      "",
      "G",
      "GG",
      "GS",
      "N",
      "NJ",
      "NH",
      "D",
      "L",
      "LG",
      "LM",
      "LB",
      "LS",
      "LT",
      "LP",
      "LH",
      "M",
      "B",
      "BS",
      "S",
      "SS",
      "NG",
      "J",
      "C",
      "K",
      "T",
      "P",
      "H",
    ];
    return [
      "HANGUL SYLLABLE " +
        l[Math.floor(s / 588)] +
        v[Math.floor((s % 588) / 28)] +
        t[s % 28],
      "Lo",
    ];
  }
  return [
    range[2].startsWith("CJK")
      ? "CJK UNIFIED IDEOGRAPH-" + hex(cp)
      : range[2].startsWith("Tangut")
        ? "TANGUT IDEOGRAPH-" + hex(cp)
        : range[2],
    range[3],
  ];
}
function render() {
  const chars = Array.from(value("input"));
  if (chars.length > 5000) throw Error("Limit input to 5,000 code points.");
  $("count").textContent = `${chars.length} code points`;
  $("results").replaceChildren(
    ...chars.map((char) => {
      const cp = char.codePointAt(0),
        [name, category] = metadata(cp);
      const hidden =
        /^[CZM]/.test(category) ||
        /[\u115f\u1160\u2800\u3164\uffa0]/u.test(char);
      const utf16 = Array.from({ length: char.length }, (_, i) => {
        const n = char.charCodeAt(i);
        return hex(n >> 8) + " " + hex(n & 255);
      }).join(" ");
      const utf8 =
        category === "Cs"
          ? "Invalid (lone surrogate)"
          : Array.from(new TextEncoder().encode(char), (b) => hex(b)).join(" ");
      const row = document.createElement("tr");
      for (const text of [
        hidden ? "[hidden / combining]" : char,
        "U+" + hex(cp, 4),
        name + " / " + category,
        utf8,
        utf16,
      ]) {
        const td = document.createElement("td");
        td.textContent = text;
        row.append(td);
      }
      return row;
    }),
  );
  $("output").value = chars
    .map((c) => "\\u{" + c.codePointAt(0).toString(16) + "}")
    .join("");
  $("html").value = chars
    .map((c) => "&#x" + hex(c.codePointAt(0)) + ";")
    .join("");
  $("css").value = chars
    .map((c) => "\\" + hex(c.codePointAt(0)) + " ")
    .join("");
}
$("input").oninput = () => {
  $("results").replaceChildren();
  $("html").value = "";
  $("css").value = "";
  run(render);
};
$("copy-html").onclick = () => copy(value("html"));
$("copy-css").onclick = () => copy(value("css"));
run(render);
