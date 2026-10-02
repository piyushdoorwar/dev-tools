import { expect, test } from '@playwright/test';

/** The shell is not a tool page, so openTool() does not apply; mirror its setup. */
async function openDashboard(page, path = '/') {
  const errors = [];
  await page.addInitScript(() => {
    window.__DEV_TOOLS_DISABLE_ANALYTICS__ = true;
    window.__DEV_TOOLS_DISABLE_SERVICE_WORKER__ = true;
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(path);
  await page.waitForLoadState('load');
  return { errors };
}

test('the page does not disable pinch zoom', async ({ page }) => {
  await openDashboard(page);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
});

test('opening a dialog moves focus into it, traps Tab, and restores focus on close', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#supportBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#supportModal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#modalClose')).toBeFocused();

  // Tab cycles within the dialog rather than walking into the page behind.
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('supportModal').contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(page.locator('#supportModal')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#supportBtn')).toBeFocused();
});

test('the settings dialog returns focus to its opener', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModalClose')).toBeFocused();
  await page.locator('#settingsModalClose').click();
  await expect(page.locator('#settingsBtn')).toBeFocused();
});

test('closing the command palette keeps a dialog\'s scroll lock', async ({ page }) => {
  await openDashboard(page);

  await page.locator('#supportBtn').click();
  await expect(page.locator('#supportModal')).toHaveAttribute('aria-hidden', 'false');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
  await expect(page.locator('#commandPalette')).toHaveAttribute('aria-hidden', 'false');

  await page.locator('#commandPaletteInput').press('Escape');
  await expect(page.locator('#commandPalette')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
});

test('a refused storage write does not stop a tool from opening', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function setItem() {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  const { errors } = await openDashboard(page);

  await page.locator('#toolList .menu__item[data-tool-id="sql-formatter"]').click();
  await expect(page).toHaveURL(/\/sql-formatter\/$/);
  await expect(page.locator('iframe.frame.is-visible')).toHaveAttribute('data-tool-id', 'sql-formatter');

  // Expanding saves a preference too; a refused write must not block it.
  await page.locator('#collapseBtn').click();
  await expect(page.locator('#app')).not.toHaveClass(/sidebar-collapsed/);
  await page.locator('#toolList .menu__pin[data-tool-id="jwt-debugger"]').click();
  await expect(page.locator('#toolList .menu__section-title').first()).toHaveText('Pinned');
  expect(errors).toEqual([]);
});

test('on a phone, opening a tool tucks the sidebar away and the expand button does not cover it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDashboard(page);

  await page.locator('#toolList .menu__item[data-tool-id="qr-generator"]').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#expandBtn')).toBeVisible();

  const layout = await page.evaluate(() => {
    const button = document.getElementById('expandBtn').getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    return {
      overlaps: button.bottom > main.top && button.right > main.left,
      mainHeight: main.height,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(layout.overlaps).toBe(false);
  expect(layout.mainHeight).toBeGreaterThan(650);
  expect(layout.overflow).toBe(false);

  await page.locator('#expandBtn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
});

test('on desktop, the sidebar starts as the collapsed icon rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  await expect(page.locator('#app')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('#sidebar')).toBeVisible();
  await expect(page.locator('#collapseBtn')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#collapseBtn')).toHaveAttribute('aria-label', 'Expand sidebar');

  // The rail still opens tools, and opening one leaves the sidebar as it was.
  await page.locator('#toolList .menu__item[data-tool-id="qr-generator"]').click();
  await expect(page.locator('#app')).toHaveClass(/sidebar-collapsed/);
});

test('on desktop, the sidebar remembers being expanded and collapsed across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  await page.locator('#collapseBtn').click();
  await expect(page.locator('#app')).not.toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('#collapseBtn')).toHaveAttribute('aria-expanded', 'true');
  await page.reload();
  await expect(page.locator('#app')).not.toHaveClass(/sidebar-collapsed/);

  await page.locator('#collapseBtn').click();
  await expect(page.locator('#app')).toHaveClass(/sidebar-collapsed/);
  await page.reload();
  await expect(page.locator('#app')).toHaveClass(/sidebar-collapsed/);
});

test('the saved sidebar state is applied before first paint', async ({ page }) => {
  // app.js runs at the end of <body>; without the inline guard the shell
  // would paint expanded and then snap to the rail on every load.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/app.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass(/sidebar-collapsed/);
});

test('on a phone, the home screen still shows the menu and a toggle is not saved', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDashboard(page);
  await expect(page.locator('#sidebar')).toBeVisible();

  // Hiding it on a phone is a momentary choice, not the desktop preference.
  await page.locator('#collapseBtn').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('devtools:sidebar-collapsed'))).toBeNull();
});

test('the sidebar lists every tool alphabetically, wherever it was added to the catalog', async ({ page }) => {
  const { errors } = await openDashboard(page);
  const names = await page.locator('#toolList .menu__item').evaluateAll((items) =>
    items.map((item) => item.getAttribute('data-tool-id') && (item.querySelector('.menu__name, .menu__label')?.textContent || item.textContent).trim()));
  expect(names.length).toBeGreaterThan(40);
  // Symbols are ignored, so ".env ⇄ JSON" files under E and "JSON ⇄ Toon" after "JSON Formatter".
  const key = (name) => name.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const sorted = [...names].sort((a, b) => key(a).localeCompare(key(b), 'en', { sensitivity: 'base', numeric: true }));
  expect(names).toEqual(sorted);
  expect(names.indexOf('Git Cheatsheet')).toBeGreaterThan(names.indexOf('File Compressor'));
  expect(errors).toEqual([]);
});
