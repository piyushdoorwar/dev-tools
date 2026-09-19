import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

// tool -> [container, beforePanel, afterPanel, desktop width]
const SPLITS = {
  'markdown-editor': ['.workspace', '.panel:first-child', '.right-panel', 1400],
  'sql-formatter': ['.workspace', '.panel:first-child', '.right-panel', 1400],
  'unit-converter': ['.workspace', '.panel:first-child', '.right-panel', 1400],
  'html-preview': ['.panels', '.editor-panel', '.preview-panel', 1400],
};

const widthOf = (page, sel) => page.evaluate(
  (s) => document.querySelector(s).getBoundingClientRect().width, sel);

for (const [tool, [container, before, after, w]] of Object.entries(SPLITS)) {
  test(`${tool}: dragging the handle resizes both panes`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    const { errors } = await openTool(page, tool);

    const handle = page.locator('.resizer');
    await expect(handle).toBeVisible();

    const startBefore = await widthOf(page, before);
    const startAfter = await widthOf(page, after);

    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const endBefore = await widthOf(page, before);
    const endAfter = await widthOf(page, after);

    expect(endBefore, 'left pane should shrink').toBeLessThan(startBefore - 100);
    expect(endAfter, 'right pane should grow').toBeGreaterThan(startAfter + 100);
    expect(errors).toEqual([]);
  });

  test(`${tool}: the handle is keyboard operable`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await openTool(page, tool);

    const handle = page.locator('.resizer');
    await expect(handle).toHaveAttribute('role', 'separator');

    await handle.focus();
    const start = await widthOf(page, before);
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    const moved = await widthOf(page, before);
    expect(moved, 'ArrowLeft should shrink the left pane').toBeLessThan(start);

    // Double-click restores an even split.
    await handle.dblclick();
    const a = await widthOf(page, before);
    const b = await widthOf(page, after);
    expect(Math.abs(a - b)).toBeLessThan(30);
  });
}

test('dragging does not select page text', async ({ page }) => {
  // None of the old implementations called preventDefault, so dragging the
  // handle swept a text selection across the panels.
  await page.setViewportSize({ width: 1400, height: 900 });
  await openTool(page, 'sql-formatter');
  const box = await page.locator('.resizer').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 250, box.y + 200, { steps: 12 });
  await page.mouse.up();
  const selected = await page.evaluate(() => String(document.getSelection()));
  expect(selected).toBe('');
});

test('touch drag resizes the split', async ({ page }) => {
  // The old mouse-only handlers ignored touch entirely.
  await page.setViewportSize({ width: 1400, height: 900 });
  await openTool(page, 'sql-formatter');
  const before = '.panel:first-child';
  const start = await widthOf(page, before);

  const box = await page.locator('.resizer').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(({ cx, cy }) => {
    const handle = document.querySelector('.resizer');
    const opts = (x) => ({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, button: 0 });
    handle.setPointerCapture = () => {};
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = () => {};
    handle.dispatchEvent(new PointerEvent('pointerdown', opts(cx)));
    handle.dispatchEvent(new PointerEvent('pointermove', opts(cx - 200)));
    handle.dispatchEvent(new PointerEvent('pointerup', opts(cx - 200)));
  }, { cx, cy });

  expect(await widthOf(page, before)).toBeLessThan(start - 100);
});

test('the handle is hidden and panes reset when panels stack', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openTool(page, 'sql-formatter');

  // Drag first so there are inline flex values to clean up.
  const box = await page.locator('.resizer').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 200, box.y, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => document.querySelector('.panel').style.flex)).not.toBe('');

  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('.resizer')).toBeHidden();
  // Stale inline widths would fight the stacked layout.
  await expect.poll(() => page.evaluate(
    () => document.querySelector('.panel').style.flex)).toBe('');
});
