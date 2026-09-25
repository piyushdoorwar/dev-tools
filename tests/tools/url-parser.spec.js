import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText } from '../helpers.js';

const part = (page, name) => page.locator(`[data-part="${name}"]`);
const rows = (page) => page.locator('#params-body tr');
const keyInput = (page, i) => rows(page).nth(i).locator('input[data-field="key"]');
const valueInput = (page, i) => rows(page).nth(i).locator('input[data-field="value"]');
const detail = (page, term) => page.locator('#details dt', { hasText: term }).locator('xpath=following-sibling::dd[1]');

test('splits a full URL into every component and decodes the query with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'url-parser');

  await page.fill('#url-input', 'https://ada:p%40ss@Example.com:8443/a/caf%C3%A9?q=hello+world&tag=js&tag=css&debug#top');
  await expect(part(page, 'scheme')).toHaveValue('https');
  await expect(part(page, 'user')).toHaveValue('ada');
  await expect(part(page, 'pass')).toHaveValue('p%40ss');
  await expect(part(page, 'host')).toHaveValue('Example.com');
  await expect(part(page, 'port')).toHaveValue('8443');
  await expect(part(page, 'path')).toHaveValue('/a/caf%C3%A9');
  await expect(part(page, 'fragment')).toHaveValue('top');

  await expect(rows(page)).toHaveCount(4);
  await expect(valueInput(page, 0)).toHaveValue('hello world');
  await expect(keyInput(page, 3)).toHaveValue('debug');
  await expect(page.locator('#params-meta')).toContainText('4 parameters · 1 repeated key');
  await expect(keyInput(page, 1)).toHaveClass(/is-repeated/);

  await expect(page.locator('#status')).toHaveClass(/is-success/);
  await expect(detail(page, 'Origin')).toHaveText('https://example.com:8443');
  await expect(detail(page, 'Path segments')).toHaveText('acafé');
  expect(errors).toEqual([]);
});

test('parsing and rebuilding is lossless, unlike the WHATWG URL class', async ({ page }) => {
  await openTool(page, 'url-parser');
  const samples = [
    'HTTP://Example.COM:80/a/../b/./c?x=1&&y=%7e&z#',
    'https://user@[2001:DB8::1]:8080/p?q',
    'https://host:/empty-port',
    'mailto:ada@example.com?subject=Hi%20there',
    'file:///etc/hosts',
    '//cdn.example.com/lib.js?v=2',
    '/search?q=a+b#frag',
    'urn:isbn:0451450523',
  ];
  const results = await page.evaluate((list) => list.map((text) => buildUrl(parseUrl(text))), samples);
  expect(results).toEqual(samples);
});

test('editing a parameter rewrites only that parameter and keeps the others byte-for-byte', async ({ page }) => {
  await openTool(page, 'url-parser');

  await page.fill('#url-input', 'https://x.test/?redirect=https%3a%2F%2Fa.test&q=old&n=%7e');
  await valueInput(page, 1).fill('new value & more');
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/?redirect=https%3a%2F%2Fa.test&q=new+value+%26+more&n=%7e');

  await keyInput(page, 2).fill('name');
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/?redirect=https%3a%2F%2Fa.test&q=new+value+%26+more&name=%7e');
  // The row being typed into is never rebuilt under the cursor.
  await expect(keyInput(page, 2)).toBeFocused();
});

test('parameters can be added, excluded, removed, sorted and cleared', async ({ page }) => {
  await openTool(page, 'url-parser');
  await page.fill('#url-input', 'https://x.test/p?b=2&a=1#h');

  await page.getByRole('button', { name: '+ Add parameter' }).click();
  await expect(keyInput(page, 2)).toBeFocused();
  await page.keyboard.type('c');
  await valueInput(page, 2).fill('3');
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/p?b=2&a=1&c=3#h');

  await rows(page).nth(0).locator('input[type="checkbox"]').uncheck();
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/p?a=1&c=3#h');
  await expect(rows(page).nth(0)).toHaveClass(/is-excluded/);
  await expect(page.locator('#params-meta')).toContainText('1 excluded');
  await rows(page).nth(0).locator('input[type="checkbox"]').check();

  await page.locator('[data-action="sort"]').click();
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/p?a=1&b=2&c=3#h');

  await rows(page).nth(1).getByRole('button', { name: /Remove parameter/ }).click();
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/p?a=1&c=3#h');

  await page.locator('[data-action="clear-params"]').click();
  await expect(page.locator('#url-input')).toHaveValue('https://x.test/p#h');
  await expect(page.locator('#params-empty')).toBeVisible();
});

test('editing a component field rebuilds the URL', async ({ page }) => {
  await openTool(page, 'url-parser');
  await page.fill('#url-input', 'http://example.com/a?x=1');

  await part(page, 'scheme').fill('https');
  await part(page, 'port').fill('8080');
  await part(page, 'path').fill('/v2/items');
  await part(page, 'fragment').fill('list');
  await part(page, 'user').fill('bot');
  await expect(page.locator('#url-input')).toHaveValue('https://bot@example.com:8080/v2/items?x=1#list');

  await part(page, 'port').fill('');
  await part(page, 'user').fill('');
  await expect(page.locator('#url-input')).toHaveValue('https://example.com/v2/items?x=1#list');
});

test('the + is space option switches between form and RFC 3986 decoding', async ({ page }) => {
  await openTool(page, 'url-parser');
  await page.fill('#url-input', '/s?q=a+b%20c');
  await expect(valueInput(page, 0)).toHaveValue('a b c');

  await page.locator('#plus-spaces').uncheck();
  await expect(valueInput(page, 0)).toHaveValue('a+b c');
  await valueInput(page, 0).fill('x y');
  await expect(page.locator('#url-input')).toHaveValue('/s?q=x%20y');
});

test('reads bare query strings, scheme-less hosts and relative references', async ({ page }) => {
  await openTool(page, 'url-parser');

  await page.fill('#url-input', 'a=1&b=two%20words');
  await expect(rows(page)).toHaveCount(2);
  await expect(valueInput(page, 1)).toHaveValue('two words');
  await expect(part(page, 'host')).toBeDisabled();
  await expect(page.locator('#status')).toContainText('Query string');
  await valueInput(page, 0).fill('9');
  await expect(page.locator('#url-input')).toHaveValue('a=9&b=two%20words');

  await page.fill('#url-input', 'localhost:3000/api?x=1');
  await expect(part(page, 'host')).toHaveValue('localhost');
  await expect(part(page, 'port')).toHaveValue('3000');
  await expect(page.locator('#status')).toHaveClass(/is-warning/);
  await expect(page.locator('#status')).toContainText('read as https://');
  await expect(page.locator('.seg-scheme')).toHaveClass(/is-assumed/);

  await page.fill('#url-input', 'tel:5551234');
  await expect(part(page, 'scheme')).toHaveValue('tel');
  await expect(part(page, 'path')).toHaveValue('5551234');

  await page.fill('#url-input', '/docs/intro?lang=en#setup');
  await expect(page.locator('#status')).toContainText('Relative reference');
  await expect(part(page, 'path')).toHaveValue('/docs/intro');
});

test('reports normalization, punycode hosts, default ports and bad encoding', async ({ page }) => {
  await openTool(page, 'url-parser');

  await page.fill('#url-input', 'https://Bücher.example:443/a/../b?x=100%');
  await expect(detail(page, 'Host as sent')).toHaveText('xn--bcher-kva.example');
  await expect(detail(page, 'Port')).toContainText('443 is the default for https');
  await expect(detail(page, 'Normalized')).toContainText('https://xn--bcher-kva.example/b?x=100%');
  await expect(valueInput(page, 0)).toHaveValue('100%');
  await expect(valueInput(page, 0)).toHaveAttribute('aria-invalid', 'true');

  await page.locator('[data-action="copy-normalized"]').click();
  expect(await lastCopied(page)).toBe('https://xn--bcher-kva.example/b?x=100%');

  await page.fill('#url-input', 'https://exa mple.com/');
  await expect(page.locator('#status')).toContainText('whitespace');

  await page.fill('#url-input', 'https://example.com:99999/');
  await expect(page.locator('#status')).toHaveClass(/is-error/);
  await expect(page.locator('#status')).toContainText('Browsers would reject');
});

test('the breakdown colours each part and matches the URL text exactly', async ({ page }) => {
  await openTool(page, 'url-parser');
  const url = 'https://u:p@h.test:1/p?k=v&f#x';
  await page.fill('#url-input', url);
  await expect(page.locator('#breakdown')).toHaveText(url);
  await expect(page.locator('#breakdown .seg-host')).toHaveText('h.test');
  await expect(page.locator('#breakdown .seg-key')).toHaveText(['k', 'f']);
  await expect(page.locator('#breakdown .seg-value')).toHaveText('v');
  await expect(page.locator('#breakdown .seg-fragment')).toHaveText('x');
});

test('sample, paste, copy, copy-as-JSON and clear actions work', async ({ page }) => {
  await openTool(page, 'url-parser');

  await page.locator('[data-action="sample"]').click();
  await expect(part(page, 'host')).toHaveValue('api.example.com');

  await page.locator('[data-action="copy-json"]').click();
  expect(JSON.parse(await lastCopied(page))).toEqual({
    q: 'hello world',
    tag: ['js', 'css'],
    redirect_uri: 'https://app.example.com/callback',
    page: '2',
    debug: '',
  });

  await setClipboardText(page, 'https://pasted.test/?a=1');
  await page.locator('[data-action="paste"]').click();
  await expect(part(page, 'host')).toHaveValue('pasted.test');

  await page.locator('[data-action="copy"]').click();
  expect(await lastCopied(page)).toBe('https://pasted.test/?a=1');

  await page.locator('[data-action="clear"]').click();
  await expect(page.locator('#url-input')).toHaveValue('');
  await expect(page.locator('#status')).toHaveText('Ready');
  await expect(rows(page)).toHaveCount(0);
});

test('the help modal opens and closes', async ({ page }) => {
  await openTool(page, 'url-parser');
  await page.click('#helpBtn');
  await expect(page.locator('#helpModal')).toHaveClass(/is-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#helpModal')).not.toHaveClass(/is-open/);
});

test('an empty input shows no empty breakdown box', async ({ page }) => {
  await openTool(page, 'url-parser');

  await expect(page.locator('#breakdown')).toBeHidden();
  await page.click('[data-action="sample"]');
  await expect(page.locator('#breakdown')).toBeVisible();
  await page.click('[data-action="clear"]');
  await expect(page.locator('#breakdown')).toBeHidden();
});

test('the Components and Query Parameters headers line up side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, 'url-parser');

  const parts = await page.locator('.parts-panel .panel-header').boundingBox();
  const params = await page.locator('.params-panel .panel-header').boundingBox();
  expect(Math.abs(parts.height - params.height)).toBeLessThan(1);
});

test('at phone width the parameter table fits, remove buttons included', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'url-parser');
  await page.click('[data-action="sample"]');

  const wrap = page.locator('.params-panel .table-wrap');
  const { scroll, client } = await wrap.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);
  const panel = await page.locator('.params-panel').boundingBox();
  const remove = await page.locator('[data-field="remove"]').first().boundingBox();
  expect(remove.x + remove.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
