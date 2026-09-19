import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const TOOLS = ['base-converter','crypto-generator','fake-data-generator','file-compressor',
 'id-generator','image-converter','json-diff','json-toon-converter','json-xml-converter',
 'jwt-debugger','markdown-editor','qr-generator','regex-tester','sql-formatter','text-diff',
 'unit-converter'];

const shapeOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const c = getComputedStyle(el);
  const svg = el.querySelector('svg');
  return {
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
    radius: c.borderRadius,
    icon: svg ? Math.round(svg.getBoundingClientRect().width) : null,
    href: svg?.querySelector('use')?.getAttribute('href') ?? null,
  };
}, sel);

test('every info button is the same shape and glyph', async ({ page }) => {
  const seen = new Map();
  for (const tool of TOOLS) {
    await openTool(page, tool);
    const s = await shapeOf(page, 'button:has(use[href="#i-info"])');
    if (!s) continue;
    seen.set(tool, `${s.w}x${s.h} r=${s.radius} icon=${s.icon} ${s.href}`);
  }
  expect(seen.size, 'no tool exposes an info button').toBeGreaterThan(5);
  const distinct = new Set(seen.values());
  expect([...distinct], `info buttons differ: ${JSON.stringify([...seen])}`).toHaveLength(1);
  // And it is the canonical control size with the sprite glyph.
  expect([...distinct][0]).toBe('38x38 r=10px icon=18 #i-info');
});

test('icon-only buttons share one geometry', async ({ page }) => {
  for (const tool of TOOLS) {
    await openTool(page, tool);
    const odd = await page.evaluate(() => {
      return [...document.querySelectorAll('.icon-btn,.toolbar-btn,.info-btn,.action-btn')]
        .filter((el) => el.getClientRects().length > 0)
        // Skip anything inside a closed dialog: its panel is scaled down.
        .filter((el) => !el.closest('.modal,.modal-overlay,.modal-backdrop') ||
                         el.closest('.modal,.modal-overlay,.modal-backdrop').classList.contains('is-open'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          const svg = el.querySelector(':scope > svg');
          return { cls: el.className, w: Math.round(r.width),
                   icon: svg ? Math.round(svg.getBoundingClientRect().width) : null };
        })
        .filter((x) => x.w !== 38 || (x.icon !== null && x.icon !== 18));
    });
    expect(odd, `${tool} has off-spec icon buttons`).toEqual([]);
  }
});

test('a help affordance uses the info glyph, not a bare character', async ({ page }) => {
  // regex-tester's output help was a literal "?" while every other tool used
  // the shared info icon.
  await openTool(page, 'regex-tester');
  const s = await shapeOf(page, '#outputHelp');
  expect(s.href).toBe('#i-info');
  expect(s.icon).toBe(18);
});
