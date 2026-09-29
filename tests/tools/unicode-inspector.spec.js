import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { openTool, lastCopied, setClipboardText } from "../helpers.js";

const TOOL = "unicode-inspector";
const MIXED = "A\u{1F600}\u200B\uAC00"; // A, grinning face, zero width space, Hangul GA

async function inspect(page, text) {
  await page.locator("#input").evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
}

async function pickFormat(page, format) {
  await page.locator(`#formatSwitch [data-format="${format}"]`).click();
  await expect(page.locator(`#formatSwitch [data-format="${format}"]`)).toHaveAttribute("aria-checked", "true");
}

const rowFor = (page, codePoint) => page.locator("#results tr", { has: page.locator(".cell-cp", { hasText: new RegExp(`^${codePoint}$`) }) });

test("opens on a sample with hidden characters, no errors and the house header", async ({ page }) => {
  const { errors } = await openTool(page, TOOL);
  await expect(page.locator("h1.app-title")).toHaveText("Unicode / Character Inspector");
  await expect(page.locator(".app-subtitle")).toHaveCount(0);
  await expect(page.locator("#input")).not.toHaveValue("");
  await expect(page.locator("#hiddenAlert")).toBeVisible();
  await expect(page.locator("#hiddenSummary")).toContainText("hidden characters:");
  await expect(page.locator("#results tr").first()).toBeVisible();
  await expect(page.locator("#output")).not.toHaveValue("");
  // The shared utility layer is being retired; this tool must not use it.
  expect(await page.evaluate(() => [...document.scripts].some((s) => /utility-ui/.test(s.src)))).toBe(false);
  const css = await page.evaluate(() => fetch("style.css").then((r) => r.text()));
  expect(css).not.toContain("utility-layout");
  expect(css.trimStart()).toMatch(/^\/\*[\s\S]*?\*\/\s*@layer tool \{/);
  expect(errors).toEqual([]);
});

test("names, supplementary bytes, hidden characters and escapes", async ({ page }) => {
  const { errors } = await openTool(page, TOOL);
  await page.locator("#input").fill(MIXED);
  const results = page.locator("#results");
  await expect(results).toContainText("GRINNING FACE");
  await expect(results).toContainText("F0 9F 98 80");
  await expect(results).toContainText("D8 3D DE 00");
  await expect(results).toContainText("ZERO WIDTH SPACE");
  await expect(results).toContainText("HANGUL SYLLABLE GA");
  // Uppercase hex everywhere now; this used to be \u{1f600} and \u{200b}.
  await expect(page.locator("#output")).toHaveValue("\\u{41}\\u{1F600}\\u{200B}\\u{AC00}");
  await pickFormat(page, "html-hex");
  await expect(page.locator("#output")).toHaveValue("&#x41;&#x1F600;&#x200B;&#xAC00;");
  await page.locator("#copy").click();
  expect(await lastCopied(page)).toBe("&#x41;&#x1F600;&#x200B;&#xAC00;");
  expect(errors).toEqual([]);
});

test("flags lone surrogates instead of claiming replacement bytes encode them", async ({ page }) => {
  await openTool(page, TOOL);
  await inspect(page, String.fromCharCode(0xd800));
  await expect(page.locator("#results")).toContainText("Invalid (lone surrogate)");
  await expect(page.locator("#results")).toContainText("D8 00");
  await expect(rowFor(page, "U\\+D800").locator(".kind-badge")).toHaveText("hidden");
  await pickFormat(page, "html-hex");
  await expect(page.locator("#escapeStatus")).toContainText("U+FFFD");
});

test("whitespace, combining marks and format characters get visible glyphs", async ({ page }) => {
  await openTool(page, TOOL);
  await inspect(page, "a b\tc\nde\u0301\u200D\u00A0\uFEFF\u200E\u00AD\u0000");
  await expect(page.locator("#results")).not.toContainText("[hidden");

  const glyph = (cp) => rowFor(page, cp).locator(".cell-char");
  await expect(glyph("U\\+0020")).toHaveText("␠");
  await expect(glyph("U\\+0009")).toHaveText("⇥");
  await expect(glyph("U\\+000A")).toHaveText("↵");
  await expect(glyph("U\\+0301")).toHaveText("◌\u0301");
  await expect(glyph("U\\+200D")).toHaveText("ZWJ");
  await expect(glyph("U\\+00A0")).toHaveText("NBSP");
  await expect(glyph("U\\+FEFF")).toHaveText("BOM");
  await expect(glyph("U\\+200E")).toHaveText("LRM");
  await expect(glyph("U\\+00AD")).toHaveText("SHY");
  await expect(glyph("U\\+0000")).toHaveText("NUL");

  // Hidden rows carry the coloured badge and the row highlight; whitespace
  // and marks are labelled but are not "hidden".
  for (const cp of ["U\\+200D", "U\\+00A0", "U\\+FEFF", "U\\+200E", "U\\+00AD", "U\\+0000"]) {
    await expect(rowFor(page, cp)).toHaveClass(/is-hidden/);
    await expect(rowFor(page, cp).locator(".badge")).toHaveText("hidden");
  }
  await expect(rowFor(page, "U\\+0020").first().locator(".badge")).toHaveText("space");
  await expect(rowFor(page, "U\\+0301").locator(".badge")).toHaveText("combining");
  await expect(rowFor(page, "U\\+0061")).not.toHaveClass(/is-hidden/);
  await expect(rowFor(page, "U\\+0061").locator(".cell-char")).toHaveText("a");
});

test("summarises hidden characters, copies the cleaned text and removes them", async ({ page }) => {
  const { errors } = await openTool(page, TOOL);
  await inspect(page, "x\u200By\u200B\uFEFFz");
  await expect(page.locator("#hiddenSummary")).toHaveText("3 hidden characters: ZWSP ×2, BOM ×1");
  await expect(page.locator("#statHidden")).toHaveText("3 hidden");
  await expect(page.locator("#statHidden")).toHaveClass(/is-flagged/);

  await page.locator("[data-action='copy-cleaned']").click();
  expect(await lastCopied(page)).toBe("xyz");
  await expect(page.locator("#input")).toHaveValue("x\u200By\u200B\uFEFFz");

  await page.locator("[data-action='remove-hidden']").click();
  await expect(page.locator("#input")).toHaveValue("xyz");
  await expect(page.locator("#hiddenAlert")).toBeHidden();
  await expect(page.locator("#statHidden")).toHaveText("0 hidden");
  await expect(page.locator("#results tr")).toHaveCount(3);

  await inspect(page, "a\u200Bb");
  await expect(page.locator("#hiddenSummary")).toHaveText("1 hidden character: ZWSP ×1");
  expect(errors).toEqual([]);
});

test("filters the table to hidden characters only", async ({ page }) => {
  await openTool(page, TOOL);
  await inspect(page, "ab\u200Bc\u2060d");
  await expect(page.locator("#results tr")).toHaveCount(6);
  await expect(page.locator("#hiddenFilterCount")).toHaveText("2");
  await page.locator("#filterSwitch [data-filter='hidden']").click();
  await expect(page.locator("#results tr")).toHaveCount(2);
  await expect(page.locator("#results")).toContainText("ZERO WIDTH SPACE");
  await expect(page.locator("#results")).toContainText("WORD JOINER");
  await expect(page.locator("#count")).toHaveText("2 of 6 code points");

  await inspect(page, "plain");
  await expect(page.locator("#results tr")).toHaveCount(0);
  await expect(page.locator("#emptyState")).toContainText("No hidden characters");

  await page.locator("#filterSwitch [data-filter='all']").click();
  await expect(page.locator("#results tr")).toHaveCount(5);
  await expect(page.locator("#emptyState")).toBeHidden();
});

test("every escape format, with uppercase hex and exact copies", async ({ page }) => {
  await openTool(page, TOOL);
  await inspect(page, MIXED);
  const expected = {
    js: "\\u{41}\\u{1F600}\\u{200B}\\u{AC00}",
    "js-utf16": "\\u0041\\uD83D\\uDE00\\u200B\\uAC00",
    "html-hex": "&#x41;&#x1F600;&#x200B;&#xAC00;",
    "html-dec": "&#65;&#128512;&#8203;&#44032;",
    css: "\\41\\1F600\\200B\\AC00",
    python: "\\u0041\\U0001F600\\u200B\\uAC00",
    url: "%41%F0%9F%98%80%E2%80%8B%EA%B0%80",
  };
  for (const [format, value] of Object.entries(expected)) {
    await pickFormat(page, format);
    await expect(page.locator("#output"), format).toHaveValue(value);
    await page.locator("#copy").click();
    expect(await lastCopied(page), format).toBe(value);
  }
});

test("escapes round-trip through the real parsers", async ({ page }) => {
  await openTool(page, TOOL);
  const text = "Tab\there \"q\" 'a' `b` \\ <&> é 😀 \u200B\uAC00\n";
  await inspect(page, text);
  for (const nonAscii of [false, true]) {
    await page.locator("#nonAsciiOnly").setChecked(nonAscii);

    await pickFormat(page, "js");
    const js = await page.locator("#output").inputValue();
    expect(new Function(`return "${js}";`)()).toBe(text);
    expect(new Function(`return '${js}';`)()).toBe(text);

    await pickFormat(page, "js-utf16");
    const utf16 = await page.locator("#output").inputValue();
    expect(new Function(`return \`${utf16}\`;`)()).toBe(text);

    for (const format of ["html-hex", "html-dec"]) {
      await pickFormat(page, format);
      const html = await page.locator("#output").inputValue();
      const decoded = await page.evaluate((markup) => {
        const template = document.createElement("textarea");
        template.innerHTML = markup;
        return template.value;
      }, html);
      expect(decoded, format).toBe(text);
    }

    await pickFormat(page, "css");
    const css = await page.locator("#output").inputValue();
    expect(css.endsWith(" ")).toBe(false);
    // Let the browser parse the escapes, then undo its canonical string
    // serialisation, which only escapes controls, quotes and backslashes.
    const cssSerialised = await page.evaluate((value) => {
      const probe = document.createElement("div");
      probe.id = "css-probe";
      const style = document.createElement("style");
      style.textContent = `#css-probe::after { content: "${value}"; }`;
      document.head.append(style);
      document.body.append(probe);
      const content = getComputedStyle(probe, "::after").content;
      probe.remove();
      style.remove();
      return content;
    }, css);
    const cssDecoded = cssSerialised
      .slice(1, -1)
      .replace(/\\([0-9A-Fa-f]{1,6}) ?|\\(.)/g, (_, code, char) => (code ? String.fromCodePoint(parseInt(code, 16)) : char));
    expect(cssDecoded).toBe(text);

    await pickFormat(page, "python");
    const py = await page.locator("#output").inputValue();
    const pyDecoded = execFileSync("python3", ["-c", "import sys; sys.stdout.buffer.write(eval('\"\"\"' + sys.argv[1] + '\"\"\"').encode('utf-8'))", py]).toString("utf8");
    expect(pyDecoded).toBe(text);

    await pickFormat(page, "url");
    const url = await page.locator("#output").inputValue();
    expect(url).toMatch(/^[A-Za-z0-9\-._~%]*$/);
    expect(decodeURIComponent(url)).toBe(text);
  }
});

test("non-ASCII only leaves printable ASCII literal", async ({ page }) => {
  await openTool(page, TOOL);
  await inspect(page, "Café 😀");
  const toggle = page.locator("#nonAsciiOnly");
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("#output")).toHaveValue("\\u{43}\\u{61}\\u{66}\\u{E9}\\u{20}\\u{1F600}");

  await toggle.check();
  await expect(page.locator("#output")).toHaveValue("Caf\\u{E9} \\u{1F600}");
  await pickFormat(page, "js-utf16");
  await expect(page.locator("#output")).toHaveValue("Caf\\u00E9 \\uD83D\\uDE00");
  await pickFormat(page, "html-dec");
  await expect(page.locator("#output")).toHaveValue("Caf&#233; &#128512;");
  await pickFormat(page, "python");
  await expect(page.locator("#output")).toHaveValue("Caf\\u00E9 \\U0001F600");

  // CSS needs a terminating space only before a hex digit or whitespace.
  await inspect(page, "é1ü xé");
  await pickFormat(page, "css");
  await expect(page.locator("#output")).toHaveValue("\\E9 1\\FC  x\\E9");

  await inspect(page, "<a href=\"x\">é</a>");
  await pickFormat(page, "html-hex");
  await expect(page.locator("#output")).toHaveValue("&#x3C;a href=&#x22;x&#x22;&#x3E;&#xE9;&#x3C;/a&#x3E;");

  await inspect(page, "a b/é~");
  await pickFormat(page, "url");
  await expect(page.locator("#output")).toHaveValue("a%20b%2F%C3%A9~");

  await toggle.uncheck();
  await expect(page.locator("#output")).toHaveValue("%61%20%62%2F%C3%A9%7E");
});

test("counts code points, graphemes, UTF-8 bytes and UTF-16 units", async ({ page }) => {
  await openTool(page, TOOL);
  // Woman technologist (4 code points), e + combining acute (2), a flag (2).
  await inspect(page, "\u{1F469}\u{1F3FD}\u200D\u{1F4BB}e\u0301\u{1F1EE}\u{1F1F3}");
  await expect(page.locator("#statCodePoints")).toHaveText("8 code points");
  await expect(page.locator("#statGraphemes")).toHaveText("3 graphemes");
  await expect(page.locator("#statUtf8")).toHaveText("26 UTF-8 bytes");
  await expect(page.locator("#statUtf16")).toHaveText("13 UTF-16 units");
  await expect(page.locator("#statHidden")).toHaveText("1 hidden");
  await expect(page.locator("#results tr")).toHaveCount(8);

  await inspect(page, "a");
  await expect(page.locator("#statCodePoints")).toHaveText("1 code point");
  await expect(page.locator("#statGraphemes")).toHaveText("1 grapheme");
  await expect(page.locator("#statUtf8")).toHaveText("1 UTF-8 byte");
  await expect(page.locator("#statUtf16")).toHaveText("1 UTF-16 unit");
});

test("over 5,000 code points is an inline status error, not a blank page", async ({ page }) => {
  const { errors } = await openTool(page, TOOL);
  await expect(page.locator("#inputStatus")).toBeHidden();
  await inspect(page, "a".repeat(5000) + "\u200B");
  await expect(page.locator("#inputStatus")).toBeVisible();
  await expect(page.locator("#inputStatus")).toHaveClass(/error/);
  await expect(page.locator("#inputStatus")).toContainText("5,000");
  await expect(page.locator("#results tr")).toHaveCount(5000);
  await expect(page.locator("#statCodePoints")).toHaveText("5,001 code points");
  await expect(page.locator("#hiddenSummary")).toHaveText("1 hidden character: ZWSP ×1");
  expect((await page.locator("#output").inputValue()).endsWith("\\u{200B}")).toBe(true);

  await inspect(page, "short");
  await expect(page.locator("#inputStatus")).toBeHidden();
  await expect(page.locator("#results tr")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("selecting a row shows its detail, and the arrow keys move it", async ({ page }) => {
  await openTool(page, TOOL);
  await inspect(page, "ab\u200Bc");
  // Lands on the first hidden character.
  await expect(page.locator("#results tr.is-selected")).toHaveCount(1);
  await expect(page.locator("#detailName")).toHaveText("U+200B ZERO WIDTH SPACE");
  await expect(page.locator("#detailGlyph")).toHaveText("ZWSP");
  await expect(page.locator("#detailMeta")).toContainText("Cf · Format");
  await expect(page.locator("#detailMeta")).toContainText("\\u{200B}");

  await rowFor(page, "U\\+0061").click();
  await expect(page.locator("#detailName")).toHaveText("U+0061 LATIN SMALL LETTER A");
  await page.locator("#tableWrap").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#detailName")).toHaveText("U+0062 LATIN SMALL LETTER B");
  await page.keyboard.press("End");
  await expect(page.locator("#detailName")).toHaveText("U+0063 LATIN SMALL LETTER C");
  await expect(rowFor(page, "U\\+0063")).toHaveClass(/is-selected/);

  await pickFormat(page, "html-hex");
  await expect(page.locator("#detailMeta")).toContainText("&#x63;");
  await page.locator("[data-action='copy-char']").click();
  expect(await lastCopied(page)).toBe("c");
});

test("sample, paste and clear", async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator("[data-action='clear']").click();
  await expect(page.locator("#input")).toHaveValue("");
  await expect(page.locator("#results tr")).toHaveCount(0);
  await expect(page.locator("#emptyState")).toBeVisible();
  await expect(page.locator("#hiddenAlert")).toBeHidden();
  await expect(page.locator("#output")).toHaveValue("");
  await expect(page.locator("#detail")).toBeHidden();

  await setClipboardText(page, "pasted\u200B");
  await page.locator("[data-action='paste']").click();
  await expect(page.locator("#input")).toHaveValue("pasted\u200B");
  await expect(page.locator("#hiddenSummary")).toHaveText("1 hidden character: ZWSP ×1");

  await page.locator("[data-action='sample']").click();
  await expect(page.locator("#hiddenAlert")).toBeVisible();
  expect((await page.locator("#input").inputValue()).length).toBeGreaterThan(10);
});

test("escape format lives in the hash and the segments work from the keyboard", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("hash-seeded")) {
      sessionStorage.setItem("hash-seeded", "1");
      history.replaceState(null, "", location.pathname + "#html-dec");
    }
  });
  await openTool(page, TOOL);
  await expect(page.locator("#formatSwitch [data-format='html-dec']")).toHaveAttribute("aria-checked", "true");
  await inspect(page, "A");
  await expect(page.locator("#output")).toHaveValue("&#65;");

  await page.locator("#formatSwitch [data-format='html-dec']").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#formatSwitch [data-format='css']")).toBeFocused();
  await expect(page.locator("#formatSwitch [data-format='css']")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#output")).toHaveValue("\\41");
  expect(await page.evaluate(() => location.hash)).toBe("#css");

  await page.keyboard.press("Home");
  await expect(page.locator("#formatSwitch [data-format='js']")).toBeFocused();
  await expect(page.locator("#output")).toHaveValue("\\u{41}");

  await page.evaluate(() => { location.hash = "#nonsense"; });
  await expect(page.locator("#formatSwitch [data-format='js']")).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => { location.hash = "#python"; });
  await expect(page.locator("#output")).toHaveValue("\\u0041");
});

test("help opens as the shared modal", async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator("#helpBtn").click();
  await expect(page.locator("#helpModal")).toHaveClass(/is-open/);
  await expect(page.locator("#helpModal .tip-list li").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#helpModal")).not.toHaveClass(/is-open/);
});

test("fills the viewport on desktop with the table scrolling inside its panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, TOOL);
  await inspect(page, "x".repeat(400));
  const layout = await page.evaluate(() => {
    const panel = document.querySelector(".chars-panel").getBoundingClientRect();
    const wrap = document.getElementById("tableWrap");
    const header = document.querySelector(".char-table th");
    wrap.scrollTop = 400;
    return {
      pageScrolls: document.documentElement.scrollHeight > innerHeight + 1,
      panelBottom: panel.bottom,
      wrapScrolls: wrap.scrollHeight > wrap.clientHeight,
      stickyHeader: header.getBoundingClientRect().top >= wrap.getBoundingClientRect().top - 1,
    };
  });
  expect(layout.pageScrolls).toBe(false);
  expect(layout.panelBottom).toBeGreaterThan(900 - 40);
  expect(layout.wrapScrolls).toBe(true);
  expect(layout.stickyHeader).toBe(true);
});

test("fits a 390px phone without horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await openTool(page, TOOL);
  await inspect(page, "A very long line of text without breaks: " + "W".repeat(200) + " \u200B \u{1F600}");
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#filterSwitch [data-filter='hidden']").click();
  await pickFormat(page, "url");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
