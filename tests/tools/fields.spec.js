import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const TOOLS = ['base-converter','chmod-calculator','color-converter','cron-expression-generator','crypto-generator','encoder-decoder','fake-data-generator','file-compressor',
 'http-status-codes','id-generator','image-converter','json-diff','json-toon-converter','json-xml-converter',
 'jwt-debugger','markdown-editor','qr-generator','regex-cheatsheet','regex-tester','sql-formatter','text-diff','text-utilities','timestamp-converter',
 'unit-converter'];

const TEXTY = "input[type='text'],input[type='tel'],input[type='url'],input[type='email']," +
              "input[type='number'],input[type='search'],input:not([type])";

async function fields(page) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const c = getComputedStyle(el);
      return { id: el.id || el.name || el.placeholder || '(anon)',
               padLeft: parseFloat(c.paddingLeft), padRight: parseFloat(c.paddingRight) };
    }), TEXTY);
}

for (const tool of TOOLS) {
  test(`${tool}: text fields are never flush against their border`, async ({ page }) => {
    await openTool(page, tool);
    const cramped = (await fields(page)).filter((f) => f.padLeft < 10 || f.padRight < 10);
    expect(cramped, `${tool} has fields with no inner padding`).toEqual([]);
  });
}

test('qr-generator fields in every content tab have inner padding', async ({ page }) => {
  // These forms are hidden until their tab is picked, so a page-load check
  // misses them — which is how they shipped with padding-left: 0.
  await openTool(page, 'qr-generator');
  for (const type of ['text','website','email','phone','whatsapp','contact','wifi','upi']) {
    await page.click(`.pill[data-content-type="${type}"]`);
    const cramped = (await fields(page)).filter((f) => f.padLeft < 10);
    expect(cramped, `qr ${type} tab has flush fields`).toEqual([]);
  }
});

test('a deliberate per-field padding override still wins', async ({ page }) => {
  // qr's country-code input reserves room for the flag. The fix must not
  // flatten intentional overrides.
  await openTool(page, 'qr-generator');
  await page.click('.pill[data-content-type="phone"]');
  const pad = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.getElementById('phoneCode')).paddingLeft));
  expect(pad).toBeGreaterThan(30);
});

test('a blanket padding reset cannot flatten form controls', async ({ page }) => {
  // Eight tools reset `* { padding: 0 }` inside @layer tool, which beat the
  // field shape declared in @layer base.
  for (const tool of ['qr-generator', 'json-diff', 'text-diff', 'base-converter']) {
    await openTool(page, tool);
    const probe = await page.evaluate(() => {
      const el = document.createElement('input');
      el.type = 'text';
      document.body.appendChild(el);
      const pad = parseFloat(getComputedStyle(el).paddingLeft);
      el.remove();
      return pad;
    });
    expect(probe, `${tool} flattens a bare text input`).toBeGreaterThan(10);
  }
});
