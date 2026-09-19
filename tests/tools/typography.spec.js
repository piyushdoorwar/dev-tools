import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const TOOLS = ['base-converter','crypto-generator','fake-data-generator','file-compressor',
 'html-preview','id-generator','image-converter','json-diff','json-toon-converter',
 'json-xml-converter','jwt-debugger','markdown-editor','qr-generator','regex-tester',
 'sql-formatter','text-diff','unit-converter'];

const titleStyle = (page) => page.evaluate(() => {
  const h1 = document.querySelector('h1');
  const c = getComputedStyle(h1);
  const box = h1.getBoundingClientRect();
  return {
    font: c.fontFamily.split(',')[0].replace(/['"]/g, ''),
    size: c.fontSize,
    weight: c.fontWeight,
    gradient: c.backgroundImage !== 'none',
    painted: box.width > 0 && box.height > 0,
    text: h1.textContent.trim(),
  };
});

for (const tool of TOOLS) {
  test(`${tool}: page title uses the shared scale`, async ({ page }) => {
    await openTool(page, tool);
    const s = await titleStyle(page);
    expect(s.font, 'page titles must use the headline face').toBe('Gilroy');
    // px, not rem — two tools set html { font-size: 15px }.
    expect(s.size).toBe('32px');
    expect(s.weight).toBe('800');
    expect(s.gradient, 'page title lost its gradient').toBe(true);
    // A gradient title is painted via transparent fill; if the clip breaks it
    // renders invisible rather than wrong, so assert it occupies space.
    expect(s.painted).toBe(true);
    expect(s.text.length).toBeGreaterThan(0);
  });
}

test('page titles are identical across every tool', async ({ page }) => {
  const seen = new Set();
  for (const tool of TOOLS) {
    await openTool(page, tool);
    const s = await titleStyle(page);
    seen.add(`${s.font}|${s.size}|${s.weight}|${s.gradient}`);
  }
  expect([...seen], 'page titles still diverge').toHaveLength(1);
});

test('the page title steps down on narrow screens', async ({ page }) => {
  // Each tool used to carry its own mobile override; the shared clamp
  // replaces them, so it must actually shrink.
  await page.setViewportSize({ width: 380, height: 720 });
  for (const tool of ['base-converter', 'file-compressor', 'jwt-debugger']) {
    await openTool(page, tool);
    const size = parseFloat((await titleStyle(page)).size);
    expect(size, `${tool} title did not shrink`).toBeLessThan(32);
    expect(size, `${tool} title shrank too far`).toBeGreaterThanOrEqual(24);
  }
});

test('body background is the same everywhere', async ({ page }) => {
  const seen = new Set();
  for (const tool of TOOLS) {
    await openTool(page, tool);
    seen.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  expect([...seen]).toEqual(['rgb(13, 13, 13)']);
});

test('the tool name is the h1, with the tagline as a subtitle', async ({ page }) => {
  // jwt-debugger had this inverted: its h1 was the tagline and the tool name
  // sat in a small eyebrow above it.
  await openTool(page, 'jwt-debugger');
  await expect(page.locator('h1')).toHaveText('JWT Debugger');
  await expect(page.locator('.app-subtitle')).toHaveText('Inspect JSON Web Tokens instantly');
});
