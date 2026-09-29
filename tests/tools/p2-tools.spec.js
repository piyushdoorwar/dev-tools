// Cross-tool checks for the P2 batch. Each tool's behaviour lives in its own
// tests/tools/<id>.spec.js; this file only pins what they must all share.
import { test, expect } from "@playwright/test";
import { openTool } from "../helpers.js";

const ids = [
  "git-cheatsheet",
  "http-header-builder",
  "keyboard-event-inspector",
  "math-evaluator",
  "meta-tag-generator",
  "mime-type-lookup",
  "svg-placeholder-generator",
  "unicode-inspector",
];

for (const id of ids) {
  test(`${id}: loads without errors and fits mobile`, async ({ page }) => {
    const { errors } = await openTool(page, id);
    await expect(page.locator("h1")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${id}: follows the established tool shell`, async ({ page }) => {
    await openTool(page, id);
    // Established tools carry a title only, and a help button that opens the modal.
    await expect(page.locator(".app-subtitle")).toHaveCount(0);
    await page.locator("#helpBtn").click();
    await expect(page.locator("#helpModal")).toHaveClass(/is-open/);
    // The retired shared layer must not be loaded any more.
    const legacy = await page.evaluate(() => [
      ...[...document.styleSheets].map((sheet) => sheet.href || ""),
      ...[...document.scripts].map((script) => script.src),
      ...[...document.styleSheets].flatMap((sheet) => {
        try {
          return [...sheet.cssRules].map((rule) => rule.href || "");
        } catch {
          return [];
        }
      }),
    ].filter((url) => /utility-(layout|ui)/.test(url)));
    expect(legacy).toEqual([]);
  });
}

test("new catalog routes open their tools in the dashboard", async ({ page }) => {
  await openTool(page, "http-header-builder");
  for (const id of ids) {
    await page.goto("/" + id + "/");
    await expect(page.locator("#frameHost iframe")).toHaveAttribute(
      "src",
      new RegExp("/tools/" + id + "/"),
    );
    await expect(page.frameLocator("#frameHost iframe").locator("h1")).toBeVisible();
  }
});
