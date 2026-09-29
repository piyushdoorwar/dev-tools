import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText } from '../helpers.js';

const TOOL = 'meta-tag-generator';
const CARD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="red"/></svg>';

const tags = (page) => page.locator('#output').textContent();

// Count every request the page makes for a given image URL, and serve it.
async function routeImage(page, url, { fail = false } = {}) {
  const hits = { count: 0, referer: undefined };
  await page.route(url, (route) => {
    hits.count += 1;
    hits.referer = route.request().headers().referer;
    return fail
      ? route.fulfill({ status: 404, body: 'nope' })
      : route.fulfill({ contentType: 'image/svg+xml', body: CARD_SVG });
  });
  return hits;
}

test('opens with a populated sample, grouped tags and no errors', async ({ page }) => {
  const { errors } = await openTool(page, TOOL);

  await expect(page.locator('#title')).not.toHaveValue('');
  await expect(page.locator('#description')).not.toHaveValue('');
  const markup = await tags(page);
  expect(markup).toMatch(/^<!-- SEO -->\n<title>/);
  expect(markup).toContain('\n\n<!-- Open Graph -->\n');
  expect(markup).toContain('\n\n<!-- Twitter / X -->\n');
  expect(markup).toContain('<meta property="og:type" content="article">');
  expect(markup).toContain('<meta name="twitter:site" content="@exampleeng">');
  expect(markup).toContain('<meta name="theme-color" content="#6739B7">');
  await expect(page.locator('#tagCount')).toHaveText('17 tags · 0 warnings');
  await expect(page.locator('.app-subtitle')).toHaveCount(0);
  await expect(page.locator('.google-result .g-title')).toHaveText('How we cut our CI build times in half');
  expect(errors).toEqual([]);
});

test('escapes attribute values and keeps the preview literal', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#title').fill('A "quote" <script>');
  await page.locator('#description').fill('One & two');

  const markup = await tags(page);
  expect(markup).toContain('<title>A &quot;quote&quot; &lt;script&gt;</title>');
  expect(markup).toContain('<meta property="og:title" content="A &quot;quote&quot; &lt;script&gt;">');
  expect(markup).toContain('content="One &amp; two"');
  expect(markup).not.toContain('<script>');
  await expect(page.locator('.g-title')).toHaveText('A "quote" <script>');
  await expect(page.locator('#output script')).toHaveCount(0);
});

test('card type follows the image: summary_large_image with one, summary without', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#image').fill('https://example.com/image.png');
  let markup = await tags(page);
  expect(markup).toContain('<meta name="twitter:card" content="summary_large_image">');
  expect(markup).toContain('<meta property="og:image" content="https://example.com/image.png">');
  expect(markup).toContain('property="og:image:alt"');

  await page.getByRole('tab', { name: 'X', exact: true }).click();
  await expect(page.locator('.x-card.is-large')).toBeVisible();

  await page.locator('#image').fill('');
  markup = await tags(page);
  expect(markup).toContain('<meta name="twitter:card" content="summary">');
  expect(markup).not.toContain('og:image');
  expect(markup).not.toContain('image:alt');
  await expect(page.locator('.x-card.is-summary')).toBeVisible();
});

test('an unsafe URL is flagged inline and only its tags are omitted', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#url').fill('javascript:alert(1)');

  await expect(page.locator('#url')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#url-hint')).toContainText('HTTP');
  await expect(page.locator('#url-hint')).toHaveClass(/is-error/);
  expect(await page.locator('#url-hint').evaluate((node) => getComputedStyle(node).color)).toBe('rgb(255, 107, 157)');
  await expect(page.locator('#detailsStatus')).toHaveClass(/error/);

  const markup = await tags(page);
  expect(markup).not.toContain('javascript:');
  expect(markup).not.toContain('rel="canonical"');
  expect(markup).not.toContain('og:url');
  // Everything else is still generated.
  expect(markup).toContain('<title>');
  expect(markup).toContain('og:title');
  await expect(page.locator('#tagCount')).toContainText('1 error');

  // A relative image path is rejected the same way.
  await page.locator('#image').fill('/og.png');
  await expect(page.locator('#image-hint')).toContainText('HTTP');
  expect(await tags(page)).toContain('content="summary"');

  await page.locator('#url').fill('https://example.com/ok');
  await expect(page.locator('#url')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#url-hint')).not.toHaveClass(/is-error/);
  expect(await tags(page)).toContain('<link rel="canonical" href="https://example.com/ok">');
});

test('handle and theme colour are validated and normalised', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#handle').fill('no spaces allowed');
  await expect(page.locator('#handle')).toHaveAttribute('aria-invalid', 'true');
  expect(await tags(page)).not.toContain('twitter:site');

  await page.locator('#handle').fill('acme_dev');
  expect(await tags(page)).toContain('<meta name="twitter:site" content="@acme_dev">');

  await page.locator('#theme').fill('#zzz');
  await expect(page.locator('#theme')).toHaveAttribute('aria-invalid', 'true');
  expect(await tags(page)).not.toContain('theme-color');

  await page.locator('#theme').fill('0f0');
  expect(await tags(page)).toContain('<meta name="theme-color" content="#00FF00">');
  await page.locator('#theme').fill('');
  expect(await tags(page)).not.toContain('theme-color');
});

test('og:type comes from the shared dropdown', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('.type-dd .dd__trigger').click();
  await page.locator('.type-dd .dd__option[data-value="product"]').click();
  await expect(page.locator('.type-dd .dd__value')).toHaveText('product');
  expect(await tags(page)).toContain('<meta property="og:type" content="product">');
});

test('counters warn past 60 and 160 characters', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#title').fill('x'.repeat(42));
  await expect(page.locator('#title-count')).toHaveText('42 / 60');
  await expect(page.locator('#title-count')).not.toHaveClass(/is-warning/);

  await page.locator('#title').fill('word '.repeat(15).trim());
  await expect(page.locator('#title-count')).toHaveText('74 / 60');
  await expect(page.locator('#title-count')).toHaveClass(/is-warning/);
  await expect(page.locator('#title-hint')).toHaveClass(/is-warning/);
  await expect(page.locator('#tagCount')).toContainText('1 warning');
  // Google truncates the mock around 60 characters.
  const shown = await page.locator('.g-title').textContent();
  expect(shown.endsWith('…')).toBe(true);
  expect(shown.length).toBeLessThanOrEqual(62);

  await page.locator('#description').fill('d'.repeat(170));
  await expect(page.locator('#description-count')).toHaveText('170 / 160');
  await expect(page.locator('#description-count')).toHaveClass(/is-warning/);
  await expect(page.locator('#tagCount')).toContainText('2 warnings');
});

test('blank fields emit no empty tags and the preview shows placeholders', async ({ page }) => {
  await openTool(page, TOOL);
  await page.getByRole('button', { name: 'Clear' }).click();

  const markup = await tags(page);
  expect(markup).not.toContain('<title>');
  expect(markup).not.toContain('content=""');
  expect(markup).not.toContain('og:title');
  expect(markup).toContain('og:type');
  expect(markup).toContain('twitter:card');
  await expect(page.locator('#title')).toBeFocused();

  const title = page.locator('.g-title');
  await expect(title).toHaveText('Add a title');
  await expect(title).toHaveClass(/is-placeholder/);
  await expect(page.locator('.g-crumb')).toHaveText('Add a canonical URL');
  await expect(page.locator('.g-crumb')).toHaveClass(/is-placeholder/);
  await expect(page.locator('#filledCount')).toHaveText('1 of 9 filled');

  await page.getByRole('button', { name: 'Load sample' }).click();
  await expect(page.locator('#title')).not.toHaveValue('');
  await expect(title).not.toHaveClass(/is-placeholder/);
});

test('preview surfaces switch by click, keyboard and hash', async ({ page }) => {
  await openTool(page, TOOL);
  const tab = (name) => page.getByRole('tab', { name, exact: true });

  await tab('Facebook').click();
  await expect(tab('Facebook')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.fb-card')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#facebook');

  await tab('Facebook').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('X')).toBeFocused();
  await expect(page.locator('.x-post')).toBeVisible();
  await page.keyboard.press('End');
  await expect(tab('Slack')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.slack-unfurl')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Google')).toHaveAttribute('aria-selected', 'true');

  await page.goto(`/tools/${TOOL}/#linkedin`);
  await expect(tab('LinkedIn')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.li-card')).toBeVisible();

  await page.goto(`/tools/${TOOL}/#nonsense`);
  await expect(tab('Google')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.badge')).toContainText('Illustrative');
});

test('the image loads only on request, with no referrer, and survives other edits', async ({ page }) => {
  await openTool(page, TOOL);
  const hits = await routeImage(page, 'https://preview.example/card.svg');

  await page.getByRole('tab', { name: 'Facebook', exact: true }).click();
  await page.locator('#image').fill('https://preview.example/card.svg');
  await page.locator('#title').fill('Still no request');
  expect(hits.count).toBe(0);
  await expect(page.locator('.card-media img')).toHaveCount(0);

  const load = page.getByRole('button', { name: 'Load image' });
  await expect(load).toBeVisible();
  await load.click();
  await expect(page.locator('.card-media img')).toBeVisible();
  expect(hits.count).toBe(1);
  expect(hits.referer).toBeUndefined();
  expect(await page.locator('.card-media img').evaluate((img) => img.referrerPolicy)).toBe('no-referrer');

  // Typing in other fields or switching surfaces keeps the loaded image.
  await page.locator('#title').fill('Edited title');
  await page.locator('#alt').fill('A red rectangle');
  await page.getByRole('tab', { name: 'LinkedIn', exact: true }).click();
  await expect(page.locator('.card-media img')).toBeVisible();
  await expect(page.locator('.card-media img')).toHaveAttribute('alt', 'A red rectangle');
  expect(hits.count).toBe(1);

  // A new image URL resets it to the opt-in placeholder.
  await page.locator('#image').fill('https://preview.example/other.svg');
  await expect(page.locator('.card-media img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load image' })).toBeVisible();
});

test('an image that fails to load is reported in the card and clears on change', async ({ page }) => {
  const { errors } = await openTool(page, TOOL);
  await routeImage(page, 'https://preview.example/missing.png', { fail: true });

  await page.getByRole('tab', { name: 'Slack', exact: true }).click();
  await page.locator('#image').fill('https://preview.example/missing.png');
  await page.getByRole('button', { name: 'Load image' }).click();
  await expect(page.locator('.media-error')).toHaveText('Image could not be loaded');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('.notice.error, #error')).toHaveCount(0);

  await page.locator('#image').fill('https://preview.example/another.png');
  await expect(page.locator('.media-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load image' })).toBeVisible();
  // The 404 itself is logged by the browser; nothing else may be.
  expect(errors.filter((message) => !/404|Failed to load resource/.test(message))).toEqual([]);
});

test('copy and download deliver the same tags', async ({ page }) => {
  await openTool(page, TOOL);
  const markup = await tags(page);

  await page.getByRole('button', { name: 'Copy tags' }).click();
  expect(await lastCopied(page)).toBe(markup);

  const download = await captureDownload(page, () => page.getByRole('button', { name: 'Download meta-tags.html' }).click());
  expect(download.suggestedFilename()).toBe('meta-tags.html');
  expect(await downloadText(download)).toBe(`${markup}\n`);
});

test('paste imports tags from existing HTML without loading anything', async ({ page }) => {
  await openTool(page, TOOL);
  let requests = 0;
  await page.route('https://imported.example/**', (route) => {
    requests += 1;
    return route.abort();
  });

  await setClipboardText(page, `<!doctype html><html><head>
    <title>Imported &amp; page</title>
    <meta name="description" content="From the clipboard">
    <link rel="canonical" href="https://imported.example/page">
    <meta property="og:image" content="https://imported.example/card.png">
    <meta property="og:type" content="profile">
    <meta name="twitter:site" content="@imported">
    <script>window.__pwned = true</script>
  </head><body><img src="https://imported.example/tracker.gif"></body></html>`);
  await page.getByRole('button', { name: 'Paste HTML to import its tags' }).click();

  await expect(page.locator('#title')).toHaveValue('Imported & page');
  await expect(page.locator('#description')).toHaveValue('From the clipboard');
  await expect(page.locator('#url')).toHaveValue('https://imported.example/page');
  await expect(page.locator('#image')).toHaveValue('https://imported.example/card.png');
  await expect(page.locator('#handle')).toHaveValue('@imported');
  await expect(page.locator('#site')).toHaveValue('');
  await expect(page.locator('.type-dd .dd__value')).toHaveText('profile');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(requests).toBe(0);

  await setClipboardText(page, 'just some text');
  await page.getByRole('button', { name: 'Paste HTML to import its tags' }).click();
  await expect(page.locator('#title')).toHaveValue('Imported & page');
});

test('help modal covers platforms, image size, absolute URLs and caching', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#helpBtn').click();
  const modal = page.locator('#helpModal');
  await expect(modal).toHaveClass(/is-open/);
  await expect(modal).toContainText('twitter:card');
  await expect(modal).toContainText('1200 × 630');
  await expect(modal).toContainText('absolute');
  await expect(modal).toContainText('Sharing Debugger');
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/is-open/);
});

test('fills the viewport on desktop without page scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, TOOL);
  const layout = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.panel')].map((panel) => panel.getBoundingClientRect());
    return {
      scroll: document.documentElement.scrollHeight - innerHeight,
      bottom: Math.max(...panels.map((box) => box.bottom)),
      code: document.querySelector('#output').getBoundingClientRect().height,
    };
  });
  expect(layout.scroll).toBeLessThanOrEqual(1);
  expect(layout.bottom).toBeGreaterThan(900 - 40);
  expect(layout.code).toBeGreaterThan(150);
});

test('fits a 390px phone with no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await openTool(page, TOOL);
  for (const surface of ['Google', 'Facebook', 'X', 'LinkedIn', 'Slack']) {
    await page.getByRole('tab', { name: surface, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), surface).toBe(true);
  }
  await page.locator('#url').fill('javascript:alert(1)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
