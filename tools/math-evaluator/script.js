"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

const history = [];
function record(label, result) {
  const text = typeof result === "bigint" ? result + "n" : String(result);
  $("output").value = text;
  history.unshift(label + " = " + text);
  history.length = Math.min(history.length, 30);
  $("history").replaceChildren(
    ...history.map((item) => {
      const node = document.createElement("pre");
      node.className = "card";
      node.textContent = item;
      return node;
    }),
  );
}
$("evaluate").onclick = () =>
  run(() =>
    record(value("expression"), evaluateExpression(value("expression"))),
  );
$("expression").onkeydown = (event) => {
  if (event.key === "Enter") $("evaluate").click();
};
function percentage(change) {
  run(() => {
    if (!value("a").trim() || !value("b").trim())
      throw Error("Enter both values.");
    const a = Number(value("a")),
      b = Number(value("b"));
    const denominator = change ? a : b;
    if (!denominator) throw Error("The denominator cannot be zero.");
    const result = change ? ((b - a) / Math.abs(a)) * 100 : (a / b) * 100;
    if (!Number.isFinite(result)) throw Error("Enter finite values.");
    record(change ? `% change ${a} → ${b}` : `${a} as % of ${b}`, result + "%");
  });
}
$("percent").onclick = () => percentage(false);
$("change").onclick = () => percentage(true);
$("clear").onclick = () => {
  history.length = 0;
  $("history").replaceChildren();
  $("output").value = "";
};
