import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { openTool, lastCopied, captureDownload, downloadText, setClipboardText } from "../helpers.js";

const TOOL = "http-header-builder";
const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
const SAMPLE_URL = "https://api.example.com/v1/me";

// Set a field's value directly (for characters `fill` cannot type) and fire input.
async function setValue(page, selector, value) {
  await page.locator(selector).evaluate((node, next) => {
    node.value = next;
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function pickMethod(page, method) {
  await page.click("#methodTrigger");
  await page.click(`#methodDropdown .dd__option[data-value="${method}"]`);
}

test.describe("http-header-builder", () => {
  test("opens populated with sample credentials and no subtitle", async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator(".app-subtitle")).toHaveCount(0);
    await expect(page.locator("#username")).toHaveValue("aladdin");
    await expect(page.locator("#password")).toHaveValue("opensesame");
    await expect(page.locator("#url")).toHaveValue(SAMPLE_URL);

    const header = `Authorization: Basic ${b64("aladdin:opensesame")}`;
    await expect(page.locator("#headerLine")).toHaveText(header);
    await expect(page.locator("#snippet")).toContainText(`--header '${header}'`);
    await expect(page.locator("#outputStatus")).toHaveText("Basic · UTF-8");
    await expect(page.locator("#outputStatus")).toHaveClass(/success/);
    await expect(page.locator("#charCount")).toHaveText(`${header.length} chars`);
    // No build buttons: everything is live.
    await expect(page.getByRole("button", { name: /^build/i })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Basic: UTF-8 round-trip, first-colon split and load into form", async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.locator("#username").fill("üser");
    await page.locator("#password").fill("p:a'ss");
    const header = `Authorization: Basic ${b64("üser:p:a'ss")}`;
    await expect(page.locator("#headerLine")).toHaveText(header);
    await expect(page.locator("#basicHint")).toBeVisible();

    await page.locator("#decodeInput").fill(header);
    const list = page.locator("#decodeList");
    await expect(list.locator("dd").nth(1)).toHaveText("üser");
    await expect(list.locator("dd").nth(2)).toHaveText("p:a'ss");
    await expect(page.locator("#decodeStatus")).toHaveText("Basic · decoded");

    await page.locator("#username").fill("");
    await page.locator("#password").fill("");
    await page.click("#loadDecoded");
    await expect(page.locator("#username")).toHaveValue("üser");
    await expect(page.locator("#password")).toHaveValue("p:a'ss");
    await expect(page.locator("#headerLine")).toHaveText(header);
    expect(errors).toEqual([]);
  });

  test("Basic: a colon in the username and control characters are refused inline", async ({ page }) => {
    await openTool(page, TOOL);
    await page.locator("#username").fill("a:b");
    await expect(page.locator("#usernameError")).toContainText("colon");
    await expect(page.locator("#username")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#headerLine")).toHaveText("—");
    await expect(page.locator("#outputStatus")).toHaveClass(/error/);
    await expect(page.locator("#snippet")).not.toContainText("Authorization");

    await page.locator("#username").fill("ok");
    await expect(page.locator("#usernameError")).toBeHidden();
    await setValue(page, "#password", "bad\u0001pass");
    await expect(page.locator("#passwordError")).toContainText("control characters");
    await expect(page.locator("#headerLine")).toHaveText("—");
    await setValue(page, "#password", "fine");
    await expect(page.locator("#headerLine")).toHaveText(`Authorization: Basic ${b64("ok:fine")}`);
  });

  test("decode: errors are inline, Bearer and API-key headers decode too", async ({ page }) => {
    await openTool(page, TOOL);
    const input = page.locator("#decodeInput");
    await expect(page.locator("#decodeEmpty")).toBeVisible();

    await input.fill("Basic !!!");
    await expect(page.locator("#decodeError")).toContainText("Base64");
    await expect(page.locator("#decodeResult")).toBeHidden();
    await expect(page.locator("#decodeStatus")).toHaveClass(/error/);

    await input.fill(`Basic ${b64("nocolon")}`);
    await expect(page.locator("#decodeError")).toContainText("colon");

    await input.fill(`Authorization: Basic ${b64("a\u0001b:c")}`);
    await expect(page.locator("#decodeError")).toContainText("control characters");

    await input.fill("Digest username=x");
    await expect(page.locator("#decodeError")).toContainText("not supported");

    await input.fill("Authorization: Bearer abc.def-ghi");
    await expect(page.locator("#decodeError")).toBeHidden();
    await expect(page.locator("#decodeList dd").nth(1)).toHaveText("abc.def-ghi");
    await page.click("#loadDecoded");
    await expect(page.locator("#tab-bearer")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#token")).toHaveValue("abc.def-ghi");
    await expect(page.locator("#headerLine")).toHaveText("Authorization: Bearer abc.def-ghi");

    await input.fill("X-Custom-Key: s3cret");
    await page.click("#loadDecoded");
    await expect(page.locator("#tab-api-key")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#headerLine")).toHaveText("X-Custom-Key: s3cret");

    await page.click('[data-action="clear-decode"]');
    await expect(input).toHaveValue("");
    await expect(page.locator("#decodeEmpty")).toBeVisible();

    await setClipboardText(page, "Basic YWxhZGRpbjpvcGVuc2VzYW1l");
    await page.click('[data-action="paste-decode"]');
    await expect(page.locator("#decodeList dd").nth(1)).toHaveText("aladdin");
  });

  test("the output always follows the visible mode, which lives in the hash", async ({ page }) => {
    await openTool(page, TOOL);
    const line = page.locator("#headerLine");
    await expect(line).toHaveText(/^Authorization: Basic /);

    await page.getByRole("tab", { name: "Bearer", exact: true }).click();
    await expect(line).toHaveText(/^Authorization: Bearer eyJ/);
    await expect(page.locator("#fields-basic")).toBeHidden();
    expect(new URL(page.url()).hash).toBe("#bearer");

    await page.getByRole("tab", { name: "API key", exact: true }).click();
    await expect(line).toHaveText(/^X-API-Key: /);
    expect(new URL(page.url()).hash).toBe("#api-key");

    // Arrow keys move between tabs and the output follows.
    await page.locator("#tab-api-key").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#tab-basic")).toBeFocused();
    await expect(line).toHaveText(/^Authorization: Basic /);
    await page.keyboard.press("End");
    await expect(page.locator("#tab-api-key")).toHaveAttribute("aria-selected", "true");

    // Deep links and unknown values.
    await page.goto(`/tools/${TOOL}/#bearer`);
    await expect(page.locator("#tab-bearer")).toHaveAttribute("aria-selected", "true");
    await expect(line).toHaveText(/^Authorization: Bearer /);
    await page.evaluate(() => { location.hash = "api-key"; });
    await expect(line).toHaveText(/^X-API-Key: /);
    await page.goto(`/tools/${TOOL}/#nonsense`);
    await expect(page.locator("#tab-basic")).toHaveAttribute("aria-selected", "true");
  });

  test("Bearer: JWT note, b64token warning, whitespace and control characters refused", async ({ page }) => {
    await openTool(page, TOOL);
    await page.getByRole("tab", { name: "Bearer", exact: true }).click();
    const note = page.locator("#tokenJwt");
    await expect(note).toContainText("alg HS256");
    await expect(note).toContainText("expires 2032-01-01 00:00 UTC");
    await expect(page.locator("#outputStatus")).toHaveText("Bearer · JWT HS256");

    // An expired JWT without a real signature still gets its note.
    const seg = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    await page.locator("#token").fill(`${seg({ alg: "RS256" })}.${seg({ exp: 1000 })}.sig`);
    await expect(note).toContainText("alg RS256");
    await expect(note).toContainText("expired 1970-01-01 00:16 UTC");

    await page.locator("#token").fill("opaque-token_123");
    await expect(note).toBeHidden();
    await expect(page.locator("#outputStatus")).toHaveText("Bearer");

    // Outside RFC 6750 b64token: warned, still built.
    await page.locator("#token").fill("abc$def");
    await expect(page.locator("#tokenMessage")).toContainText("b64token");
    await expect(page.locator("#tokenMessage")).toHaveClass(/is-warning/);
    await expect(page.locator("#token")).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#headerLine")).toHaveText("Authorization: Bearer abc$def");
    await expect(page.locator("#outputStatus")).toHaveClass(/warning/);

    await page.locator("#token").fill("abc def");
    await expect(page.locator("#tokenMessage")).toContainText("whitespace");
    await expect(page.locator("#token")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#headerLine")).toHaveText("—");

    await setValue(page, "#token", "abc\u007fdef");
    await expect(page.locator("#tokenMessage")).toContainText("control characters");
    await expect(page.locator("#headerLine")).toHaveText("—");

    await page.locator("#token").fill("");
    await expect(page.locator("#outputStatus")).toHaveText("Enter a bearer token");
  });

  test("API key: header name validation, POSIX quoting and copy", async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await page.getByRole("tab", { name: "API key", exact: true }).click();
    await page.locator("#apiKey").fill("a'b");
    await expect(page.locator("#snippet")).toHaveText(
      `curl --url '${SAMPLE_URL}' \\\n  --header 'X-API-Key: a'\\''b' \\\n  --header 'Accept: application/json'`,
    );
    await page.click("#copyHeader");
    expect(await lastCopied(page)).toBe("X-API-Key: a'b");

    for (const bad of ["Bad Name", "X-Key:", "Ключ", "(x)"]) {
      await page.locator("#apiName").fill(bad);
      await expect(page.locator("#apiNameError")).toContainText("RFC 7230");
      await expect(page.locator("#headerLine")).toHaveText("—");
    }
    await page.locator("#apiName").fill("X-Token!#$%&'*+.^_`|~");
    await expect(page.locator("#apiNameError")).toBeHidden();
    await expect(page.locator("#headerLine")).toHaveText("X-Token!#$%&'*+.^_`|~: a'b");
    expect(errors).toEqual([]);
  });

  test("curl output survives a real POSIX shell unchanged", async ({ page }) => {
    await openTool(page, TOOL);
    await page.getByRole("tab", { name: "API key", exact: true }).click();
    const nasty = `it's $(whoami) "quoted" \`tick\` \\ back`;
    await page.locator("#apiKey").fill(nasty);
    await page.locator("#url").fill("https://api.example.com/a?b=c&d='e'");
    const code = await page.locator("#snippet").textContent();
    // Swap curl for printf so the shell prints each argument it received.
    const script = code.replace(/^curl /, "printf '%s\\n' ");
    const args = execFileSync("sh", ["-c", script], { encoding: "utf8" }).trimEnd().split("\n");
    expect(args).toEqual([
      "--url",
      "https://api.example.com/a?b=c&d=%27e%27",
      "--header",
      `X-API-Key: ${nasty}`,
      "--header",
      "Accept: application/json",
    ]);
  });

  test("API key as a query parameter changes the URL in every snippet", async ({ page }) => {
    await openTool(page, TOOL);
    await page.getByRole("tab", { name: "API key", exact: true }).click();
    await page.locator("#apiKey").fill("k y&z");
    await page.getByRole("button", { name: "Query parameter" }).click();
    await expect(page.locator("#apiName")).toHaveValue("api_key");
    await expect(page.locator("#apiNameLabel")).toHaveText("Parameter name");
    await expect(page.locator("#apiQueryHint")).toBeVisible();
    await expect(page.locator("#headerRowLabel")).toHaveText("Query");
    await expect(page.locator("#headerLine")).toHaveText("?api_key=k+y%26z");

    const snippet = page.locator("#snippet");
    await expect(snippet).toContainText(`--url '${SAMPLE_URL}?api_key=k+y%26z'`);
    await expect(snippet).not.toContainText("X-API-Key");
    await page.getByRole("button", { name: "fetch", exact: true }).click();
    await expect(snippet).toContainText(`fetch("${SAMPLE_URL}?api_key=k+y%26z"`);
    await page.getByRole("button", { name: "HTTPie", exact: true }).click();
    await expect(snippet).toContainText(`http GET '${SAMPLE_URL}?api_key=k+y%26z'`);

    // A custom name survives switching back; the default swaps with placement.
    await page.getByRole("button", { name: "Header", exact: true }).click();
    await expect(page.locator("#apiName")).toHaveValue("X-API-Key");
    await page.locator("#apiName").fill("X-Custom");
    await page.getByRole("button", { name: "Query parameter" }).click();
    await expect(page.locator("#apiName")).toHaveValue("X-Custom");
    await expect(page.locator("#headerLine")).toHaveText("?X-Custom=k+y%26z");
  });

  test("request: method, URL errors and extra headers", async ({ page }) => {
    await openTool(page, TOOL);
    const snippet = page.locator("#snippet");
    await pickMethod(page, "POST");
    await expect(page.locator("#methodValue")).toHaveText("POST");
    await expect(snippet).toContainText("curl --request POST \\\n  --url");
    await pickMethod(page, "HEAD");
    await expect(snippet).toContainText("curl --head \\\n");
    await pickMethod(page, "DELETE");
    await page.getByRole("button", { name: "HTTPie", exact: true }).click();
    await expect(snippet).toContainText(`http DELETE '${SAMPLE_URL}'`);
    await page.getByRole("button", { name: "curl", exact: true }).click();
    await pickMethod(page, "GET");
    await expect(snippet).toHaveText(/^curl --url /);

    // A bad URL is reported inline; the header line stays.
    const header = await page.locator("#headerLine").textContent();
    await page.locator("#url").fill("ftp://example.com");
    await expect(page.locator("#urlError")).toContainText("http");
    await expect(page.locator("#url")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#headerLine")).toHaveText(header);
    await expect(snippet).toHaveText(/valid http\(s\) URL/);
    await expect(page.locator("#outputStatus")).toHaveClass(/error/);
    await page.locator("#url").fill("not a url");
    await expect(page.locator("#urlError")).toBeVisible();
    await page.locator("#url").fill(SAMPLE_URL);
    await expect(page.locator("#urlError")).toBeHidden();

    // Extra headers: bad lines are listed and left out, good ones kept.
    await page.locator("#extraHeaders").fill(
      "Accept: application/json\nBad Name: x\nno colon here\n\nX-Trace: 1\nX-Empty:\nauthorization: Basic zzz",
    );
    const problems = page.locator("#extraErrors li");
    await expect(problems).toHaveCount(3);
    await expect(problems.nth(0)).toContainText("Line 2");
    await expect(problems.nth(0)).toContainText("RFC 7230");
    await expect(problems.nth(1)).toContainText("Line 3");
    await expect(problems.nth(2)).toContainText("Line 7");
    await expect(problems.nth(2)).toHaveClass(/is-warning/);
    await expect(page.locator("#extraHeaders")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#outputStatus")).toContainText("3 extra header lines skipped");
    await expect(snippet).toContainText("--header 'X-Trace: 1'");
    // curl sends an empty header as `Name;` — `Name:` would remove it.
    await expect(snippet).toContainText("--header 'X-Empty;'");
    await expect(snippet).not.toContainText("Bad Name");
    await expect(snippet).not.toContainText("zzz");

    await page.locator("#extraHeaders").fill("");
    await expect(page.locator("#extraErrors")).toBeHidden();
    await expect(page.locator("#outputStatus")).toHaveText("Basic · UTF-8");
  });

  test("fetch and HTTPie snippets, copy and download", async ({ page }) => {
    await openTool(page, TOOL);
    const auth = `Basic ${b64("aladdin:opensesame")}`;
    await pickMethod(page, "PUT");
    await page.getByRole("button", { name: "fetch", exact: true }).click();
    await expect(page.locator("#snippet")).toHaveText(
      `const response = await fetch("${SAMPLE_URL}", {\n  method: "PUT",\n  headers: {\n` +
      `    "Authorization": "${auth}",\n    "Accept": "application/json",\n  },\n});`,
    );
    await page.click("#copySnippet");
    expect(await lastCopied(page)).toContain('method: "PUT"');
    const js = await captureDownload(page, () => page.click("#downloadSnippet"));
    expect(js.suggestedFilename()).toBe("request.mjs");
    expect(await downloadText(js)).toContain(`"Authorization": "${auth}"`);

    await page.getByRole("tab", { name: "API key", exact: true }).click();
    await page.locator("#apiKey").fill('q"uote');
    await expect(page.locator("#snippet")).toContainText('"X-API-Key": "q\\"uote"');

    await page.getByRole("button", { name: "HTTPie", exact: true }).click();
    await page.locator("#apiKey").fill("a'b");
    await expect(page.locator("#snippet")).toHaveText(
      `http PUT '${SAMPLE_URL}' \\\n  'X-API-Key:a'\\''b' \\\n  'Accept:application/json'`,
    );
    const sh = await captureDownload(page, () => page.click("#downloadSnippet"));
    expect(sh.suggestedFilename()).toBe("request-httpie.sh");
    expect(await downloadText(sh)).toContain("'X-API-Key:a'\\''b'");

    await page.getByRole("button", { name: "curl", exact: true }).click();
    const curl = await captureDownload(page, () => page.click("#downloadSnippet"));
    expect(curl.suggestedFilename()).toBe("request.sh");
    expect(await downloadText(curl)).toMatch(/^curl --request PUT/);
  });

  test("secrets have a show/hide toggle", async ({ page }) => {
    await openTool(page, TOOL);
    const pairs = [["basic", "password"], ["bearer", "token"], ["api-key", "apiKey"]];
    for (const [mode, id] of pairs) {
      await page.locator(`#tab-${mode}`).click();
      const input = page.locator(`#${id}`);
      const toggle = page.locator(`[data-reveal="${id}"]`);
      await expect(input).toHaveAttribute("type", "password");
      await expect(toggle).toHaveAttribute("aria-pressed", "false");
      await toggle.click();
      await expect(input).toHaveAttribute("type", "text");
      await expect(toggle).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toHaveAttribute("aria-label", /^Hide /);
      await toggle.click();
      await expect(input).toHaveAttribute("type", "password");
    }
  });

  test("sample and clear act on the visible mode", async ({ page }) => {
    await openTool(page, TOOL);
    await page.click('[data-action="clear"]');
    await expect(page.locator("#username")).toHaveValue("");
    await expect(page.locator("#password")).toHaveValue("");
    await expect(page.locator("#username")).toBeFocused();
    await expect(page.locator("#headerLine")).toHaveText(`Authorization: Basic ${b64(":")}`);
    await page.click('[data-action="sample"]');
    await expect(page.locator("#username")).toHaveValue("aladdin");

    await page.locator("#tab-bearer").click();
    await page.click('[data-action="clear"]');
    await expect(page.locator("#token")).toHaveValue("");
    await expect(page.locator("#headerLine")).toHaveText("—");
    await expect(page.locator("#username")).toHaveValue("aladdin");
    await page.click('[data-action="sample"]');
    await expect(page.locator("#headerLine")).toHaveText(/^Authorization: Bearer eyJ/);

    await page.click('[data-action="sample-decode"]');
    await expect(page.locator("#decodeList dd").nth(2)).toHaveText("opensesame");
  });

  test("nothing is persisted and the hash never carries a credential", async ({ page }) => {
    await openTool(page, TOOL);
    await page.locator("#username").fill("persist-me");
    await page.locator("#password").fill("hunter2");
    await page.locator("#tab-bearer").click();
    await page.locator("#token").fill("tok-secret");
    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage).length,
      session: Object.keys(sessionStorage).length,
      hash: location.hash,
    }));
    expect(stored).toEqual({ local: 0, session: 0, hash: "#bearer" });
    await page.reload();
    await expect(page.locator("#token")).not.toHaveValue("tok-secret");
    await expect(page.locator("#username")).toHaveValue("aladdin");
  });

  test("help modal and the security note", async ({ page }) => {
    const { errors } = await openTool(page, TOOL);
    await expect(page.locator(".security-line")).toContainText("Base64 is not encryption");
    await page.click("#helpBtn");
    const modal = page.locator("#helpModal");
    await expect(modal).toHaveClass(/is-open/);
    await expect(modal).toContainText("Base64 is not encryption");
    await expect(modal).toContainText("HTTPS");
    await page.keyboard.press("Escape");
    await expect(modal).not.toHaveClass(/is-open/);
    await expect(page.locator("#helpBtn")).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("fills the viewport on desktop and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { errors } = await openTool(page, TOOL);
    const desktop = await page.evaluate(() => {
      const bottom = (sel) => document.querySelector(sel).getBoundingClientRect().bottom;
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        output: innerHeight - bottom(".output-panel"),
        decode: innerHeight - bottom(".decode-panel"),
      };
    });
    expect(desktop.scroll).toBeLessThanOrEqual(0);
    expect(desktop.output).toBeLessThan(40);
    expect(desktop.decode).toBeLessThan(40);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of ["basic", "bearer", "api-key"]) {
      await page.locator(`#tab-${mode}`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("button", { name: "Query parameter" }).click();
    await page.locator("#decodeInput").fill(`Authorization: Bearer ${"x".repeat(300)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
