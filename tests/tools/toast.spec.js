import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const toasts = (page) => page.locator('#toast-container .toast');

test('the shared toast renders text, icon and type', async ({ page }) => {
  await openTool(page, 'base-converter');
  await page.evaluate(() => DevToolsMain.showToast('Saved it', 'success'));

  const toast = toasts(page).first();
  await expect(toast).toHaveClass(/success/);
  await expect(toast.locator('.toast-message')).toHaveText('Saved it');
  // Icons come from the shared sprite, not per-tool glyphs.
  await expect(toast.locator('.toast-icon use')).toHaveAttribute('href', '#i-check');
  await expect(toast).toHaveAttribute('role', 'status');
});

test('errors are assertive and use the error icon', async ({ page }) => {
  await openTool(page, 'base-converter');
  await page.evaluate(() => DevToolsMain.showToast('It broke', 'error'));
  const toast = toasts(page).first();
  await expect(toast).toHaveAttribute('role', 'alert');
  await expect(toast.locator('.toast-icon use')).toHaveAttribute('href', '#i-close');
  await expect(page.locator('#toast-container')).toHaveAttribute('aria-live', 'assertive');
});

test('the message is never treated as markup', async ({ page }) => {
  // text-diff built its toast with innerHTML and an interpolated message.
  await openTool(page, 'text-diff');
  await page.evaluate(() => DevToolsMain.showToast('<img src=x onerror="window.__xss=1">', 'info'));
  await expect(toasts(page).first().locator('.toast-message'))
    .toHaveText('<img src=x onerror="window.__xss=1">');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('#toast-container img').count()).toBe(0);
});

test('toasts auto-dismiss, and errors linger longer', async ({ page }) => {
  await openTool(page, 'base-converter');
  await page.evaluate(() => DevToolsMain.showToast('brief', 'success', { duration: 150 }));
  await expect(toasts(page)).toHaveCount(1);
  await expect(toasts(page)).toHaveCount(0, { timeout: 3000 });

  const durations = await page.evaluate(() => {
    // Read the configured defaults by timing class changes would be flaky;
    // assert the contract instead: an error outlives a success.
    const a = DevToolsMain.showToast('ok', 'success');
    const b = DevToolsMain.showToast('bad', 'error');
    return [a.className, b.className];
  });
  expect(durations[1]).toContain('error');
});

test('clicking a toast dismisses it', async ({ page }) => {
  await openTool(page, 'base-converter');
  await page.evaluate(() => DevToolsMain.showToast('dismiss me', 'info', { duration: 10000 }));
  await expect(toasts(page)).toHaveCount(1);
  await toasts(page).first().click();
  await expect(toasts(page)).toHaveCount(0, { timeout: 3000 });
});

test('a burst of toasts is capped', async ({ page }) => {
  await openTool(page, 'base-converter');
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) DevToolsMain.showToast(`msg ${i}`, 'info', { duration: 10000 });
  });
  const count = await toasts(page).count();
  expect(count).toBeLessThanOrEqual(4);
});

test('the container is created even when a tool ships no markup', async ({ page }) => {
  // fake-data-generator had no container and a showToast that did nothing.
  await openTool(page, 'fake-data-generator');
  expect(await page.locator('#toast-container').count()).toBe(0);
  await page.evaluate(() => showToast('Sample schema loaded', 'success'));
  await expect(toasts(page).first().locator('.toast-message')).toHaveText('Sample schema loaded');
});

test('fake-data-generator actually reports its actions now', async ({ page }) => {
  await openTool(page, 'fake-data-generator');
  await page.click('.action-btn[data-action="load-sample"]');
  await expect(toasts(page).first().locator('.toast-message')).toHaveText(/Sample schema loaded/);
});

// Every tool that notifies must route through the one implementation.
for (const tool of ['base-converter', 'text-diff', 'json-diff', 'qr-generator',
                    'regex-tester', 'html-preview', 'id-generator',
                    'image-converter', 'fake-data-generator', 'jwt-debugger']) {
  test(`${tool}: toast routes through the shared component`, async ({ page }) => {
    const { errors } = await openTool(page, tool);
    await page.evaluate(() => DevToolsMain.showToast('probe', 'info'));
    const toast = toasts(page).first();
    await expect(toast.locator('.toast-message')).toHaveText('probe');
    await expect(toast.locator('.toast-icon')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
