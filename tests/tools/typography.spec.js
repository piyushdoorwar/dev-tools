import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const TOOLS = ['base-converter','certificate-decoder','chmod-calculator','color-converter','cron-expression-generator','crypto-generator','encoder-decoder','fake-data-generator','file-compressor',
 'html-preview','http-status-codes','id-generator','image-toolkit','json-diff','json-toon-converter',
 'json-xml-converter','json-yaml-toml-converter','jwt-debugger','markdown-editor','qr-generator','regex-cheatsheet','regex-tester',
 'sql-formatter','text-diff','text-utilities','timestamp-converter','unit-converter'];

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

test('no tool decorates its header with a logo or eyebrow', async ({ page }) => {
  // image-toolkit was the only tool with a brand mark and a
  // "Private browser utility" eyebrow above its title.
  for (const tool of TOOLS) {
    await openTool(page, tool);
    const extras = await page.evaluate(() => {
      const header = document.querySelector('.app-header, .header, .panel-head');
      if (!header) return { imgs: 0, eyebrows: 0 };
      return {
        imgs: header.querySelectorAll('img').length,
        eyebrows: header.querySelectorAll('.eyebrow, .brand-mark, .brand-lockup').length,
      };
    });
    expect(extras.imgs, `${tool} has an image in its header`).toBe(0);
    expect(extras.eyebrows, `${tool} has an eyebrow/brand mark`).toBe(0);
  }
});

test('the title is the first thing in every header', async ({ page }) => {
  for (const tool of TOOLS) {
    await openTool(page, tool);
    const ok = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const header = h1.closest('.app-header, .header, .panel-head');
      if (!header) return true;
      // Nothing with visible text may precede the title inside the header.
      const before = [...header.querySelectorAll('*')]
        .filter((el) => el.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING)
        .filter((el) => !el.contains(h1))
        .filter((el) => el.textContent.trim().length > 0);
      return before.length === 0;
    });
    expect(ok, `${tool} has content above its title`).toBe(true);
  }
});
