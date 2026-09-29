import { test, expect } from "@playwright/test";
import {
  openTool,
  lastCopied,
  downloadText,
  captureDownload,
} from "../helpers.js";
const ids = [
  "http-header-builder",
  "meta-tag-generator",
  "mime-type-lookup",
  "keyboard-event-inspector",
  "git-cheatsheet",
  "math-evaluator",
  "unicode-inspector",
  "svg-placeholder-generator",
];
for (const id of ids)
  test(`${id}: loads without errors and fits mobile`, async ({ page }) => {
    const { errors } = await openTool(page, id);
    await expect(page.locator("h1")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test("headers: Unicode round-trip, password colons, validation and curl quoting", async ({
  page,
}) => {
  const { errors } = await openTool(page, "http-header-builder");
  await page.locator("#username").fill("üser");
  await page.locator("#password").fill("p:a'ss");
  await page.locator("#basic").click();
  const header = await page.locator("#output").inputValue();
  expect(header).toBe(
    "Authorization: Basic " + Buffer.from("üser:p:a'ss").toString("base64"),
  );
  await page.locator("#decode-input").fill(header);
  await page.locator("#username").fill("");
  await page.locator("#decode").click();
  await expect(page.locator("#username")).toHaveValue("üser");
  await expect(page.locator("#password")).toHaveValue("p:a'ss");
  await page.locator("#username").fill("a:b");
  await page.locator("#basic").click();
  await expect(page.locator("#error")).toContainText("colon");
  await expect(page.locator("#output")).toHaveValue("");
  await page.getByRole("tab", {name:"Bearer",exact:true}).click();
  await page.locator("#token").fill("abc.def");
  await page.locator("#bearer").click();
  await expect(page.locator("#output")).toHaveValue(
    "Authorization: Bearer abc.def",
  );
  await page.getByRole("tab", {name:"API key",exact:true}).click();
  await page.locator("#api-key").fill("a'b");
  await page.locator("#api").click();
  expect(await page.locator("#curl").inputValue()).toContain("'\\''");
  await page.locator("#copy").click();
  expect(await lastCopied(page)).toBe("X-API-Key: a'b");
  await page.getByRole("tab", {name:"Basic",exact:true}).click();
  await page.locator("#decode-input").fill("Basic !!!");
  await page.locator("#decode").click();
  await expect(page.locator("#error")).not.toBeEmpty();
  expect(errors).toEqual([]);
});
test("meta tags escape input, preview follows input, rejects unsafe URLs", async ({
  page,
}) => {
  await openTool(page, "meta-tag-generator");
  await page.locator("#title").fill('A "quote" <script>');
  await page.locator("#description").fill("One & two");
  await page.locator("#image").fill("https://example.com/image.png");
  const markup = await page.locator("#output").inputValue();
  expect(markup).toContain("A &quot;quote&quot; &lt;script&gt;");
  expect(markup).toContain("summary_large_image");
  expect(markup).toContain('property="og:image"');
  await expect(page.locator("#preview-title")).toHaveText('A "quote" <script>');
  await page.locator("#url").fill("javascript:alert(1)");
  await expect(page.locator("#error")).toContainText("HTTP");
  await expect(page.locator("#output")).toHaveValue("");
});
test("MIME search works both ways and copies headers", async ({ page }) => {
  await openTool(page, "mime-type-lookup");
  await page.locator("#search").fill("photo.WEBP");
  await expect(page.locator("#results h2")).toHaveText("image/webp");
  await page.getByRole("button", { name: "Copy Content-Type" }).click();
  expect(await lastCopied(page)).toBe("Content-Type: image/webp");
  await page.locator("#search").fill("text/html; charset=utf-8");
  await expect(page.locator("#results")).toContainText(".html");
  await page.locator("#search").fill("not-real-abc");
  await expect(page.locator("#results")).toContainText("No match");
});
test("keyboard capture scopes events, records modifiers, clears history", async ({
  page,
}) => {
  await openTool(page, "keyboard-event-inspector");
  await page.locator("#capture").focus();
  await page.keyboard.press("Shift+A");
  let entry = JSON.parse(await page.locator("#output").inputValue());
  expect(entry.key).toBe("A");
  expect(entry.code).toBe("KeyA");
  expect(entry.modifiers.Shift).toBe(true);
  expect(entry.location).toBe(0);
  await page.locator("#capture").dispatchEvent("keydown", {
    key: "a",
    code: "KeyA",
    repeat: true,
    location: 2,
  });
  entry = JSON.parse(await page.locator("#output").inputValue());
  expect(entry.repeat).toBe(true);
  expect(entry.location).toBe(2);
  await page.locator("#clear").click();
  await expect(page.locator("#history")).toBeEmpty();
});
test("Git reference finds recovery tasks and copies command", async ({
  page,
}) => {
  await openTool(page, "git-cheatsheet");
  await page.locator("#search").fill("detached");
  await expect(page.locator("#results")).toContainText(
    "git switch -c rescue-work",
  );
  await page.getByRole("button", { name: "Copy command" }).click();
  expect(await lastCopied(page)).toBe("git switch -c rescue-work");
  await page.locator("#search").fill("discard");
  await expect(page.locator("#results")).toContainText("DESTRUCTIVE");
});
test("math grammar, precision, rejection and percentages", async ({ page }) => {
  await openTool(page, "math-evaluator");
  for (const [input, result] of [
    ["sqrt(81) + 0xff", "264"],
    ["log10(1000) + max(2, 5)", "8"],
    ["2^3^2", "512"],
    ["-2^2", "-4"],
    ["9007199254740993n + 0b10n", "9007199254740995n"],
    ["log(e) + sin(pi / 2)", "2"],
  ]) {
    await page.locator("#expression").fill(input);
    await page.locator("#evaluate").click();
    await expect(page.locator("#output")).toHaveValue(result);
  }
  for (const input of ["alert(1)", "1/0", "1n+1", "sqrt(-1)", "2n^20001n"]) {
    await page.locator("#expression").fill(input);
    await page.locator("#evaluate").click();
    await expect(page.locator("#error")).not.toBeEmpty();
    await expect(page.locator("#output")).toHaveValue("");
  }
  await page.locator("#percent").click();
  await expect(page.locator("#output")).toHaveValue("25%");
  await page.locator("#change").click();
  await expect(page.locator("#output")).toHaveValue("300%");
  await page.locator("#a").fill("0");
  await page.locator("#change").click();
  await expect(page.locator("#error")).toContainText("zero");
});
test("Unicode names, supplementary bytes, hidden characters and escapes", async ({
  page,
}) => {
  const { errors } = await openTool(page, "unicode-inspector");
  await page.locator("#input").fill("A😀\u200b가");
  await expect(page.locator("#results")).toContainText("GRINNING FACE");
  await expect(page.locator("#results")).toContainText("F0 9F 98 80");
  await expect(page.locator("#results")).toContainText("D8 3D DE 00");
  await expect(page.locator("#results")).toContainText("ZERO WIDTH SPACE");
  await expect(page.locator("#results")).toContainText("HANGUL SYLLABLE GA");
  await expect(page.locator("#output")).toHaveValue(
    "\\u{41}\\u{1f600}\\u{200b}\\u{ac00}",
  );
  await page.locator("#copy-html").click();
  expect(await lastCopied(page)).toBe("&#x41;&#x1F600;&#x200B;&#xAC00;");
  expect(errors).toEqual([]);
});
test("SVG escapes markup, exports data URI and downloads, invalid input clears output", async ({
  page,
}) => {
  await openTool(page, "svg-placeholder-generator");
  await page.locator("#text").fill('<script>& "Hi"');
  const svg = await page.locator("#output").inputValue();
  expect(svg).toContain("&lt;script&gt;");
  expect(
    decodeURIComponent(
      (await page.locator("#data-uri").inputValue()).split(",")[1],
    ),
  ).toBe(svg);
  const download = await captureDownload(page, () =>
    page.locator("#download").click(),
  );
  expect(await downloadText(download)).toBe(svg);
  await page.locator("#width").fill("0");
  await expect(page.locator("#output")).toHaveValue("");
  await expect(page.locator("#preview")).toBeEmpty();
});
test("text cleaner list quoting, affixes, transpose, truncation and join", async ({
  page,
}) => {
  const { errors } = await openTool(page, "text-utilities");
  await page.locator("summary").click();
  await page.locator("#input").fill("O'Brien\napple");
  await page.locator("#list-quote").check();
  await page.locator("#list-separator").fill(", ");
  await expect(page.locator("#output")).toHaveValue("'O''Brien', 'apple'");
  await page.locator("#list-quote").uncheck();
  await page.locator("#list-prefix").fill("[");
  await page.locator("#list-suffix").fill("]");
  await page.locator("#list-limit").fill("2");
  await expect(page.locator("#output")).toHaveValue("[O'], [ap]");
  await page.locator("#list-prefix").fill("");
  await page.locator("#list-suffix").fill("");
  await page.locator("#list-limit").fill("0");
  await page.locator("#list-separator").fill("\\n");
  await page.locator("#list-transpose").check();
  await page.locator("#input").fill("a\tb\nc\td");
  await expect(page.locator("#output")).toHaveValue("a\tc\nb\td");
  expect(errors).toEqual([]);
});

test("social preview loads images only on request", async ({ page }) => {
  await openTool(page, "meta-tag-generator");
  let requests = 0;
  await page.route("https://preview.example/card.svg", (route) => {
    requests++;
    return route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>',
    });
  });
  await page.locator("#image").fill("https://preview.example/card.svg");
  expect(requests).toBe(0);
  await page.locator("#load-image").click();
  await expect(page.locator("#preview-image img")).toBeVisible();
  expect(requests).toBe(1);
});

test("new catalog routes open their tools in the dashboard", async ({
  page,
}) => {
  await openTool(page, "http-header-builder");
  for (const id of ids) {
    await page.goto("/" + id + "/");
    await expect(page.locator("#frameHost iframe")).toHaveAttribute(
      "src",
      new RegExp("/tools/" + id + "/"),
    );
    await expect(
      page.frameLocator("#frameHost iframe").locator("h1"),
    ).toBeVisible();
  }
});

test("list conversion preserves emoji while truncating and escapes JSON strings", async ({
  page,
}) => {
  await openTool(page, "text-utilities");
  await page.locator("summary").click();
  await page.locator("#input").fill('😀abc\n"quoted"');
  await page.locator("#list-limit").fill("1");
  await expect(page.locator("#output")).toHaveValue('😀\n"');
  await page.locator("#list-json").check();
  await expect(page.locator("#output")).toHaveValue('"😀"\n"\\\""');
});

test("Unicode flags lone surrogates instead of claiming replacement bytes encode them", async ({
  page,
}) => {
  await openTool(page, "unicode-inspector");
  await page.locator("#input").evaluate((input) => {
    input.value = String.fromCharCode(0xd800);
    input.dispatchEvent(new Event("input"));
  });
  await expect(page.locator("#results")).toContainText(
    "Invalid (lone surrogate)",
  );
  await expect(page.locator("#results")).toContainText("D8 00");
});
