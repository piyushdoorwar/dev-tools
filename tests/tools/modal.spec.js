import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

// tool -> a selector that opens its primary modal, and the modal root
const MODALS = {
  'base-converter':      ['#schemaHelpBtn', '#schemaHelpModal'],
  'crypto-generator':    ['#securityInfoBtn', '#securityInfoModal'],
  'fake-data-generator': ['#schemaHelpBtn', '#schemaHelpModal'],
  'regex-tester':        ['#openCheatSheetBtn', '#cheatSheetModal'],
};

for (const [tool, [trigger, modal]] of Object.entries(MODALS)) {
  test(`${tool}: modal opens, traps focus, and restores it on close`, async ({ page }) => {
    const { errors } = await openTool(page, tool);
    const root = page.locator(modal);

    await expect(root).not.toHaveClass(/is-open/);
    await page.click(trigger);
    await expect(root).toHaveClass(/is-open/);
    await expect(root).toHaveAttribute('aria-modal', 'true');
    await expect(root).toHaveAttribute('aria-hidden', 'false');

    // Scroll is locked while a dialog is up.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    // Focus must stay inside the dialog, however far we Tab.
    await expect.poll(async () => page.evaluate((sel) =>
      document.querySelector(sel).contains(document.activeElement), modal)).toBe(true);
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate((sel) =>
      document.querySelector(sel).contains(document.activeElement), modal),
      'Tab escaped the modal').toBe(true);
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate((sel) =>
      document.querySelector(sel).contains(document.activeElement), modal),
      'Shift+Tab escaped the modal').toBe(true);

    // Escape closes, scroll unlocks, focus returns to the trigger.
    await page.keyboard.press('Escape');
    await expect(root).not.toHaveClass(/is-open/);
    await expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await page.evaluate((sel) =>
      document.activeElement === document.querySelector(sel), trigger),
      'focus was not returned to the trigger').toBe(true);

    expect(errors).toEqual([]);
  });

  test(`${tool}: clicking the scrim closes, clicking the panel does not`, async ({ page }) => {
    await openTool(page, tool);
    const root = page.locator(modal);
    await page.click(trigger);
    await expect(root).toHaveClass(/is-open/);

    // Inside the panel: must stay open.
    await root.locator('.modal-content, .modal-panel, .modal-card').first().click({ position: { x: 5, y: 5 } });
    await expect(root).toHaveClass(/is-open/);

    // The scrim itself: closes.
    await root.click({ position: { x: 3, y: 3 } });
    await expect(root).not.toHaveClass(/is-open/);
  });
}

test('every modal root is wired to the shared component', async ({ page }) => {
  const TOOLS = ['base-converter', 'crypto-generator', 'fake-data-generator', 'file-compressor',
    'image-converter', 'json-diff', 'json-toon-converter', 'jwt-debugger', 'markdown-editor',
    'qr-generator', 'regex-tester', 'sql-formatter', 'text-diff'];
  for (const tool of TOOLS) {
    await openTool(page, tool);
    const report = await page.evaluate(() => {
      const roots = [...document.querySelectorAll('[data-modal]')];
      return {
        count: roots.length,
        unready: roots.filter((r) => !r.dataset.modalReady).map((r) => r.id || r.className),
        // A stale state class would leave a dialog stuck open or unstyled.
        legacyState: roots.filter((r) =>
          r.className.includes('active') || r.className.includes('show')).map((r) => r.className),
      };
    });
    expect(report.count, `${tool} has no modal roots`).toBeGreaterThan(0);
    expect(report.unready, `${tool} has un-initialised modals`).toEqual([]);
    expect(report.legacyState, `${tool} still uses a legacy state class`).toEqual([]);
  }
});

test('jwt-debugger modal no longer relies on inline display', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('.eye-btn').first().click();
  const modal = page.locator('#datetimeModal');
  await expect(modal).toHaveClass(/is-open/);
  // It used style.display, which no shared rule could ever override.
  expect(await page.evaluate(() => document.getElementById('datetimeModal').style.display)).toBe('');
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/is-open/);
});
