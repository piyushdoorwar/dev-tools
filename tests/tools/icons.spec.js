import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const TOOLS = [
  'base-converter','bcrypt-generator','chmod-calculator', 'color-converter','cron-expression-generator', 'crypto-generator','docker-compose-converter','encoder-decoder','env-json-shell-converter', 'fake-data-generator', 'file-compressor',
  'hash-generator','html-preview', 'http-status-codes','id-generator', 'image-toolkit', 'json-diff', 'json-formatter', 'json-toon-converter',
  'json-xml-converter','json-yaml-toml-converter', 'jwt-debugger', 'markdown-editor', 'qr-generator',
  'regex-cheatsheet','regex-tester', 'sql-formatter', 'string-escaper', 'subnet-calculator', 'text-diff','text-utilities','timestamp-converter', 'unit-converter','url-parser',
];

for (const tool of TOOLS) {
  test(`${tool}: every sprite icon resolves and paints`, async ({ page }) => {
    await openTool(page, tool);

    const report = await page.evaluate(() => {
      const sprite = document.getElementById('dt-icon-sprite');
      const uses = [...document.querySelectorAll('use')];
      const missing = [];
      const zeroSized = [];

      for (const use of uses) {
        const id = (use.getAttribute('href') || '').replace('#', '');
        if (!id) continue;
        // A <use> pointing at nothing renders nothing, silently.
        if (!document.getElementById(id)) { missing.push(id); continue; }
        const host = use.closest('svg');
        // Skip icons inside panels the tool hides by default.
        if (!host || host.getClientRects().length === 0) continue;
        const box = host.getBoundingClientRect();
        if (box.width < 4 || box.height < 4) zeroSized.push(`${id} ${box.width}x${box.height}`);
      }
      return {
        spritePresent: Boolean(sprite),
        spriteTakesSpace: sprite ? sprite.getBoundingClientRect().height > 0 : false,
        useCount: uses.length,
        missing,
        zeroSized,
      };
    });

    expect(report.spritePresent, 'icon sprite was not injected').toBe(true);
    expect(report.spriteTakesSpace, 'sprite must not occupy layout space').toBe(false);
    expect(report.missing, 'use refs with no matching symbol').toEqual([]);
    expect(report.zeroSized, 'icons collapsed to zero size').toEqual([]);
  });
}

test('icons render identically across tools', async ({ page }) => {
  // The same icon in two different tools must resolve to the same symbol.
  const boxes = {};
  for (const tool of ['jwt-debugger', 'base-converter']) {
    await openTool(page, tool);
    boxes[tool] = await page.evaluate(() => {
      const use = document.querySelector('use[href="#i-copy"]');
      const symbol = document.getElementById('i-copy');
      return { symbolHtml: symbol.innerHTML, strokeWidth: symbol.getAttribute('stroke-width') };
    });
  }
  expect(boxes['jwt-debugger'].symbolHtml).toBe(boxes['base-converter'].symbolHtml);
  expect(boxes['jwt-debugger'].strokeWidth).toBe('2');
});
