import { expect, test } from '@playwright/test';
import { lastCopied, openTool } from '../helpers.js';

const item = (page, code) => page.locator(`.code-item[data-code="${code}"]`);

test('loads on 200 with the full list and no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'http-status-codes');

  await expect(page.locator('.detail-code')).toHaveText('200');
  await expect(page.locator('.detail-name')).toHaveText('OK');
  await expect(page.locator('#result-count')).toHaveText(/^\d+ of \d+$/);
  expect(await page.locator('.code-item').count()).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('every code carries a summary, a spec reference and a class', async ({ page }) => {
  await openTool(page, 'http-status-codes');

  const report = await page.evaluate(() => {
    const codes = globalThis.HTTP_STATUS_CODES;
    return {
      total: codes.length,
      duplicates: codes.length - new Set(codes.map((entry) => entry.code)).size,
      missing: codes.filter((entry) => !entry.summary || !entry.spec || !entry.url || !entry.group)
        .map((entry) => entry.code),
      badGroup: codes.filter((entry) => `${String(entry.code)[0]}xx` !== entry.group).map((entry) => entry.code),
      badLinks: codes.filter((entry) => !entry.url.startsWith('https://')).map((entry) => entry.code),
      // A related code must itself exist in the table.
      danglingRelated: codes.flatMap((entry) => (entry.related || [])
        .filter((code) => !codes.some((other) => other.code === code))),
    };
  });

  expect(report.duplicates).toBe(0);
  expect(report.missing).toEqual([]);
  expect(report.badGroup).toEqual([]);
  expect(report.badLinks).toEqual([]);
  expect(report.danglingRelated).toEqual([]);
  expect(report.total).toBeGreaterThan(60);
});

test('the reference cites RFC 9110 rather than the obsolete RFC 2616', async ({ page }) => {
  await openTool(page, 'http-status-codes');

  const specs = await page.evaluate(() => globalThis.HTTP_STATUS_CODES.map((entry) => entry.spec));
  expect(specs.some((spec) => spec.includes('RFC 9110'))).toBe(true);
  expect(specs.filter((spec) => spec.includes('RFC 2616'))).toEqual([]);
  expect(specs.filter((spec) => spec.includes('RFC 7231'))).toEqual([]);
});

test('selecting a code shows its meaning, guidance and spec link', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  await item(page, 429).click();

  await expect(page.locator('.detail-code')).toHaveText('429');
  await expect(page.locator('.detail-name')).toHaveText('Too Many Requests');
  await expect(page.locator('.detail-group')).toContainText('4xx · Client error');
  await expect(page.locator('.detail-use li').first()).toContainText('Retry-After');
  await expect(page.locator('.detail-avoid li')).not.toHaveCount(0);

  const link = page.locator('.detail-spec a');
  await expect(link).toHaveText('RFC 6585 §4');
  await expect(link).toHaveAttribute('href', /rfc-editor\.org/);
  await expect(link).toHaveAttribute('rel', /noopener/);
});

test('search matches the code, the name and the guidance text', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  const search = page.locator('#search');

  await search.fill('404');
  await expect(page.locator('.code-item')).toHaveCount(1);
  await expect(page.locator('.code-name')).toHaveText('Not Found');

  // A numeric query is a prefix, so "50" narrows to the 500s.
  await search.fill('50');
  const codes = await page.locator('.code-number').allTextContents();
  expect(codes.every((code) => code.startsWith('50'))).toBe(true);
  expect(codes.length).toBeGreaterThan(5);

  await search.fill('teapot');
  await expect(page.locator('.code-number')).toHaveText('418');

  // Prose in the notes is searchable too — this is why the tool beats a table.
  await search.fill('rate limit');
  await expect(page.locator('.code-item[data-code="429"]')).toBeVisible();

  await search.fill('optimistic concurrency');
  await expect(page.locator('.code-number')).toHaveText('412');

  // Terms match independently and in any order, so a phrase the notes spell
  // differently ("POST/redirect/GET") still finds its code.
  await search.fill('post redirect');
  await expect(page.locator('.code-item[data-code="303"]')).toBeVisible();
  await search.fill('redirect post');
  await expect(page.locator('.code-item[data-code="303"]')).toBeVisible();
});

test('a search with no match says so and leaves the count honest', async ({ page }) => {
  await openTool(page, 'http-status-codes');

  await page.fill('#search', 'zzzz');
  await expect(page.locator('#code-list')).toContainText('No status code matches');
  await expect(page.locator('#result-count')).toHaveText(/^0 of \d+$/);

  await page.click('[data-action="clear"]');
  await expect(page.locator('#search')).toHaveValue('');
  expect(await page.locator('.code-item').count()).toBeGreaterThan(50);
});

test('the class filter narrows the list to one family', async ({ page }) => {
  await openTool(page, 'http-status-codes');

  await page.click('[data-group="3xx"]');
  const codes = await page.locator('.code-number').allTextContents();
  expect(codes.every((code) => code.startsWith('3'))).toBe(true);
  await expect(page.locator('[data-group="3xx"]')).toHaveAttribute('aria-pressed', 'true');

  // Filtering away the selected code moves the detail to the first result.
  await expect(page.locator('.detail-code')).toHaveText(codes[0]);

  await page.click('[data-group="all"]');
  expect(await page.locator('.code-item').count()).toBeGreaterThan(50);
});

test('the hash is a shareable deep link in both directions', async ({ page }) => {
  await openTool(page, 'http-status-codes');

  await item(page, 418).click();
  await expect(page).toHaveURL(/#418$/);
  await expect(page).toHaveTitle("418 I'm a Teapot — HTTP Status Code");

  await page.goto('/tools/http-status-codes/#503');
  await expect(page.locator('.detail-code')).toHaveText('503');
  await expect(page.locator('.detail-name')).toHaveText('Service Unavailable');
  await expect(item(page, 503)).toHaveClass(/is-active/);
});

test('related codes cross-link the pairs people confuse', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  await item(page, 401).click();

  const chip = page.locator('.related-chip', { hasText: '403' });
  await expect(chip).toBeVisible();
  await chip.click();

  await expect(page.locator('.detail-code')).toHaveText('403');
  await expect(page.locator('.related-chip', { hasText: '401' })).toBeVisible();
});

test('non-standard codes are labelled as such', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  await item(page, 524).click();

  await expect(page.locator('.detail-group .code-badge')).toHaveText('non-standard');
  await expect(page.locator('.detail-summary')).toContainText('Cloudflare');

  // A real RFC code carries no badge.
  await item(page, 200).click();
  await expect(page.locator('.detail-group .code-badge')).toHaveCount(0);
});

test('keyboard navigation moves from the search box through the list', async ({ page }) => {
  await openTool(page, 'http-status-codes');

  await page.fill('#search', '40');
  await page.locator('#search').press('ArrowDown');
  await expect(page.locator('.detail-code')).toHaveText('400');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.detail-code')).toHaveText('401');

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.detail-code')).toHaveText('400');

  // Enter from the search box opens the first match.
  await page.fill('#search', '451');
  await page.locator('#search').press('Enter');
  await expect(page.locator('.detail-name')).toHaveText('Unavailable For Legal Reasons');
});

test('copies the detail as plain text and a deep link', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  await item(page, 422).click();

  await page.click('[data-action="copy-detail"]');
  const copied = await lastCopied(page);
  expect(copied).toContain('422 Unprocessable Content (4xx Client error)');
  expect(copied).toContain('When to use it:');
  expect(copied).toContain('Watch out for:');
  expect(copied).toContain('https://');
  expect(copied).not.toContain('`');

  await page.click('[data-action="copy-link"]');
  expect(await lastCopied(page)).toMatch(/\/tools\/http-status-codes\/#422$/);
});

test('backticked header names render as code, not literal backticks', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  await item(page, 405).click();

  await expect(page.locator('.detail-use .inline-code').first()).toHaveText('Allow');
  await expect(page.locator('.detail')).not.toContainText('`');
});

test('browsing codes replaces the hash instead of stacking history entries', async ({ page }) => {
  await openTool(page, 'http-status-codes');
  const before = await page.evaluate(() => history.length);

  await item(page, 404).click();
  await item(page, 418).click();
  await item(page, 503).click();
  await expect(page).toHaveURL(/#503$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('side by side, the page fits the viewport and the list scrolls inside its panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, 'http-status-codes');

  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900);
  const body = page.locator('.list-panel .panel-body');
  const { scroll, client } = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(scroll).toBeGreaterThan(client);
  // A code far down the list still leaves the detail in view.
  await item(page, 526).click();
  await expect(page.locator('.detail-code')).toBeInViewport();
});
