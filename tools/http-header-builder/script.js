"use strict";
const { $, value, run, copy, escapeMarkup } = UtilityUI;

let header = "";
function validate(text) {
  if (/[\x00-\x1f\x7f]/.test(text))
    throw Error("Header values cannot contain control characters.");
  return text;
}
function render() {
  $("output").value = header;
  $("curl").value = "";
  const url = new URL(value("url"));
  if (!["http:", "https:"].includes(url.protocol))
    throw Error("Use an HTTP or HTTPS URL.");
  const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
  $("curl").value = `curl --header ${quote(header)} --url ${quote(url.href)}`;
}
$("basic").onclick = () =>
  run(() => {
    const user = validate(value("username"));
    if (user.includes(":")) throw Error("The username cannot contain a colon.");
    const bytes = new TextEncoder().encode(
      user + ":" + validate(value("password")),
    );
    header =
      "Authorization: Basic " +
      btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
    render();
  });
$("decode").onclick = () =>
  run(() => {
    const match = value("decode-input")
      .trim()
      .match(/^(?:Authorization:\s*)?Basic\s+([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) throw Error("Enter a Basic header with valid Base64.");
    let decoded;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0)),
      );
    } catch {
      throw Error("Invalid Base64 or UTF-8 credentials.");
    }
    const index = decoded.indexOf(":");
    if (index < 0) throw Error("Decoded credentials must contain a colon.");
    validate(decoded);
    $("username").value = decoded.slice(0, index);
    $("password").value = decoded.slice(index + 1);
    header = "Authorization: Basic " + match[1];
    render();
  });
$("bearer").onclick = () =>
  run(() => {
    const token = validate(value("token"));
    if (!/^[A-Za-z0-9\-._~+/]+=*$/.test(token))
      throw Error("Enter a valid Bearer token.");
    header = "Authorization: Bearer " + token;
    render();
  });
$("api").onclick = () =>
  run(() => {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value("header-name")))
      throw Error("Invalid header name.");
    header = value("header-name") + ": " + validate(value("api-key"));
    render();
  });
$("url").oninput = () => {
  if (header) run(render);
};

$("copy-curl").onclick = () => copy(value("curl"));
