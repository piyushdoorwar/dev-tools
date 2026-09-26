import { expect, test } from '@playwright/test';
import { readdirSync, existsSync } from 'node:fs';
import { openTool } from '../helpers.js';

const tools = readdirSync(new URL('../../tools/', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(new URL(`../../tools/${entry.name}/index.html`, import.meta.url)))
  .map((entry) => entry.name);

for (const width of [320, 768, 1280]) {
  for (const tool of tools) {
    test(`${tool}: content fits a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const { errors } = await openTool(page, tool);
      await page.evaluate(() => document.fonts.ready);
      // Do not hide overflow to satisfy this: editors and tables may scroll
      // internally, but the document must fit the available content width.
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      )).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }
}

test('generated JSON stays in its scrollable output pane on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'fake-data-generator');
  await page.fill('#record-count', '100');
  await page.click('[data-action="generate"]');
  const editor = await page.locator('#output-editor').boundingBox();
  expect(editor.height).toBeGreaterThan(200);
  expect(editor.height).toBeLessThan(600);
});

test('compose output keeps editing space alongside conversion notes on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openTool(page, 'docker-compose-converter');
  const editor = await page.locator('#output-editor').boundingBox();
  expect(editor.height).toBeGreaterThanOrEqual(240);
});

for (const tool of ['cron-expression-generator', 'timestamp-converter']) {
  test(`${tool}: long time-zone options fit a phone dropdown`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openTool(page, tool);
    await page.click('#tz-trigger');
    await page.fill('.tz-search', 'Argentina');
    const menu = page.locator('#tz-menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await menu.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test('two-line cron presets stay inside their rows on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openTool(page, 'cron-expression-generator');
  await page.click('#preset-trigger');
  const menu = page.locator('#preset-menu');
  expect(await menu.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const clipped = await menu.locator('.dd__option').evaluateAll(options => options.filter(option => {
    const box = option.getBoundingClientRect();
    return [...option.children].some(child => {
      const rect = child.getBoundingClientRect();
      return rect.bottom > box.bottom + 1 || rect.top < box.top - 1;
    });
  }).length);
  expect(clipped).toBe(0);
});
