import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

// tool -> a selector that opens its primary modal, and the modal root
const MODALS = {
  'base-converter':      ['#schemaHelpBtn', '#schemaHelpModal'],
  'bcrypt-generator':    ['#helpBtn', '#helpModal'],
  'chmod-calculator':    ['#helpBtn', '#helpModal'],
  'cron-expression-generator': ['#helpBtn', '#helpModal'],
  'crypto-generator':    ['#securityInfoBtn', '#securityInfoModal'],
  'docker-compose-converter': ['#helpBtn', '#helpModal'],
  'env-json-shell-converter': ['#helpBtn', '#helpModal'],
  'fake-data-generator': ['#schemaHelpBtn', '#schemaHelpModal'],
  'http-status-codes':   ['#helpBtn', '#helpModal'],
  'json-formatter':      ['#helpBtn', '#helpModal'],
  'key-pair-generator':  ['#helpBtn', '#helpModal'],
  'otp-generator':       ['#helpBtn', '#helpModal'],
  'regex-cheatsheet':    ['#helpBtn', '#helpModal'],
  'regex-tester':        ['#openCheatSheetBtn', '#cheatSheetModal'],
  'string-escaper':      ['#helpBtn', '#helpModal'],
  'subnet-calculator':   ['#helpBtn', '#helpModal'],
  'text-encryptor':      ['#helpBtn', '#helpModal'],
  'text-utilities':      ['#helpBtn', '#helpModal'],
  'timestamp-converter': ['#helpBtn', '#helpModal'],
  'user-agent-parser':   ['#helpBtn', '#helpModal'],
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
  const TOOLS = ['base-converter', 'bcrypt-generator', 'crypto-generator','docker-compose-converter','encoder-decoder', 'env-json-shell-converter', 'fake-data-generator', 'file-compressor',
    'hash-generator', 'image-toolkit', 'json-diff', 'json-toon-converter', 'jwt-debugger', 'markdown-editor',
    'qr-generator', 'regex-tester', 'sql-formatter', 'string-escaper', 'subnet-calculator', 'text-diff'];
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

test('tip lists in modals render without list markers', async ({ page }) => {
  // Each tip is already a card, so an <ol> marker sat outside the card and
  // read as stray numbering.
  await openTool(page, 'fake-data-generator');
  await page.click('#schemaHelpBtn');

  const list = page.locator('.tip-list');
  await expect(list).toHaveCount(1);

  const info = await page.evaluate(() => {
    const ul = document.querySelector('.tip-list');
    const li = ul.querySelector('li');
    return {
      tag: ul.tagName,
      listStyle: getComputedStyle(ul).listStyleType,
      markerWidth: getComputedStyle(li, '::marker').width,
      // A left indent only exists to make room for markers.
      padLeft: parseFloat(getComputedStyle(ul).paddingLeft),
    };
  });

  expect(info.tag, 'tips are not ordered steps').toBe('UL');
  expect(info.listStyle).toBe('none');
  expect(info.padLeft).toBe(0);
});

test('a closed modal is never visible in any tool', async ({ page }) => {
  // A tool that ships no overlay layout rendered its dialog inline, on the
  // page, permanently — the shared layer now hides closed dialogs regardless.
  const TOOLS = ['base-converter','bcrypt-generator','chmod-calculator','cron-expression-generator','crypto-generator','docker-compose-converter','encoder-decoder','env-json-shell-converter','fake-data-generator',
    'file-compressor','hash-generator','http-status-codes','image-toolkit','json-diff','json-toon-converter','json-xml-converter',
    'jwt-debugger','markdown-editor','qr-generator','regex-cheatsheet','regex-tester','sql-formatter','string-escaper','subnet-calculator','text-diff','text-utilities',
    'timestamp-converter'];

  for (const tool of TOOLS) {
    await openTool(page, tool);
    const showing = await page.evaluate(() =>
      [...document.querySelectorAll('[data-modal]')]
        .filter((m) => !m.classList.contains('is-open'))
        .filter((m) => getComputedStyle(m).visibility !== 'hidden'
                    && getComputedStyle(m).display !== 'none')
        .map((m) => m.id || m.className));
    expect(showing, `${tool} renders a closed dialog`).toEqual([]);
  }
});

test('text buttons keep their horizontal padding', async ({ page }) => {
  // The blanket `* { padding: 0 }` reset several tools use also flattens
  // .btn, whose padding comes from the base layer.
  const TOOLS = ['timestamp-converter','encoder-decoder','qr-generator','unit-converter',
    'id-generator','fake-data-generator','json-toon-converter'];

  for (const tool of TOOLS) {
    await openTool(page, tool);
    const flat = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => b.getClientRects().length > 0)
        .filter((b) => b.textContent.trim().length > 1)
        .filter((b) => !b.closest('.dd__menu'))
        .filter((b) => parseFloat(getComputedStyle(b).paddingLeft) < 6)
        .map((b) => `${b.className}:"${b.textContent.trim().slice(0, 20)}"`));
    expect(flat, `${tool} has text buttons with no padding`).toEqual([]);
  }
});

test('the close button sits beside the title, not under it', async ({ page }) => {
  // main.css gives .modal-header its padding and rule but not its row layout,
  // so a tool that omits `display: flex` wraps the close button onto its own
  // line. Cheap to miss by eye, cheap to assert.
  const CASES = [
    ['timestamp-converter', '#helpBtn', '#helpModal'],
    ['cron-expression-generator', '#helpBtn', '#helpModal'],
    ['base-converter', '#schemaHelpBtn', '#schemaHelpModal'],
    ['crypto-generator', '#securityInfoBtn', '#securityInfoModal'],
  ];

  for (const [tool, trigger, modal] of CASES) {
    await openTool(page, tool);
    await page.click(trigger);
    const geometry = await page.evaluate((sel) => {
      const header = document.querySelector(`${sel} .modal-header`);
      const title = header.querySelector('.modal-title, h2, h3');
      const close = header.querySelector('.modal-close');
      const t = title.getBoundingClientRect();
      const c = close.getBoundingClientRect();
      return { titleRight: t.right, closeLeft: c.left,
               sameRow: Math.abs((t.top + t.height / 2) - (c.top + c.height / 2)) < 12 };
    }, modal);

    expect(geometry.sameRow, `${tool}: close button wrapped below the title`).toBe(true);
    expect(geometry.closeLeft, `${tool}: close button is not to the right`).
      toBeGreaterThan(geometry.titleRight);
  }
});
