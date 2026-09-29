import { expect, test } from '@playwright/test';
import { lastCopied, openTool } from '../helpers.js';

const TOOL = 'mime-type-lookup';
const item = (page, mime) => page.locator(`.type-item[data-mime="${mime}"]`);
const listedMimes = (page) => page.locator('.type-item .type-mime').allTextContents();
const copyRow = (page, key) => page.locator(`.copy-row[data-row="${key}"]`);

test('opens with an empty search, every type listed and the first one selected', async ({ page }) => {
  const { errors } = await openTool(page, TOOL);

  await expect(page.locator('#search')).toHaveValue('');
  const total = await page.evaluate(() => globalThis.MIME_TYPES.length);
  expect(total).toBeGreaterThan(70);
  await expect(page.locator('.type-item')).toHaveCount(total);
  await expect(page.locator('#result-count')).toHaveText(`${total} of ${total}`);

  const first = page.locator('.type-item').first();
  await expect(first).toHaveClass(/is-active/);
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.detail-mime')).toHaveText(await first.getAttribute('data-mime'));
  await expect(page.locator('.detail-list li').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the data is curated: unique types, dotless lowercase extensions, notes everywhere', async ({ page }) => {
  await openTool(page, TOOL);
  const report = await page.evaluate(() => {
    const types = globalThis.MIME_TYPES;
    const exts = types.flatMap((entry) => entry.ext);
    return {
      duplicates: types.length - new Set(types.map((entry) => entry.mime)).size,
      duplicateExts: exts.filter((ext, index) => exts.indexOf(ext) !== index),
      badMime: types.filter((entry) => !/^[a-z]+\/[a-z0-9.+-]+$/.test(entry.mime)).map((entry) => entry.mime),
      badExt: exts.filter((ext) => ext !== ext.toLowerCase() || ext.startsWith('.')),
      noNote: types.filter((entry) => !entry.note).map((entry) => entry.mime),
      required: ['application/wasm', 'application/manifest+json', 'text/calendar', 'text/vtt', 'application/x-subrip',
        'font/woff2', 'font/ttf', 'font/otf', 'image/heic', 'image/jxl', 'image/apng', 'image/vnd.microsoft.icon',
        'model/gltf-binary', 'model/gltf+json', 'application/vnd.apache.parquet', 'application/x-ndjson',
        'application/ld+json', 'application/geo+json', 'application/rss+xml', 'application/atom+xml',
        'application/zstd', 'application/vnd.rar', 'application/x-7z-compressed', 'application/x-tar',
        'application/vnd.oasis.opendocument.text', 'application/epub+zip', 'audio/flac', 'audio/aac', 'audio/mp4',
        'video/quicktime', 'video/matroska', 'video/mp2t', 'application/octet-stream']
        .filter((mime) => !types.some((entry) => entry.mime === mime)),
    };
  });
  expect(report.duplicates).toBe(0);
  expect(report.duplicateExts).toEqual([]);
  expect(report.badMime).toEqual([]);
  expect(report.badExt).toEqual([]);
  expect(report.noNote).toEqual([]);
  expect(report.required).toEqual([]);
});

test('a filename in any case finds its type, and the header copies exactly', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#search').fill('photo.WEBP');

  await expect(page.locator('.type-item').first()).toHaveAttribute('data-mime', 'image/webp');
  await expect(page.locator('.detail-mime')).toHaveText('image/webp');
  await expect(page.locator('#query-status')).toContainText('.webp');

  // Image types never get a charset.
  await copyRow(page, 'content-type').getByRole('button', { name: 'Copy Content-Type header' }).click();
  expect(await lastCopied(page)).toBe('Content-Type: image/webp');
});

test('a full media type with parameters finds the type and echoes the charset', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#search').fill('text/html; charset=utf-8');

  await expect(page.locator('.detail-mime')).toHaveText('text/html');
  await expect(page.locator('.detail-exts')).toContainText('.html');
  await expect(page.locator('.detail-echo .param-chip')).toHaveText('charset=utf-8');
  await expect(page.locator('#query-status')).toContainText('charset=utf-8');
  await expect(copyRow(page, 'content-type').locator('.copy-text')).toHaveText('Content-Type: text/html; charset=utf-8');

  // A different charset is carried into the header as typed.
  await page.locator('#search').fill('Content-Type: text/html; charset=ISO-8859-1');
  await expect(copyRow(page, 'content-type').locator('.copy-text')).toHaveText('Content-Type: text/html; charset=ISO-8859-1');

  // application/json defines no charset: the header leaves it out and says why.
  await page.locator('#search').fill('application/json; charset=utf-8');
  await expect(page.locator('.detail-mime')).toHaveText('application/json');
  await expect(copyRow(page, 'content-type').locator('.copy-text')).toHaveText('Content-Type: application/json');
  await expect(page.locator('.detail-warning')).toContainText('no charset parameter');
});

test('ranking puts exact extensions first, then prefixes, then mentions', async ({ page }) => {
  await openTool(page, TOOL);
  const search = page.locator('#search');

  await search.fill('js');
  const js = await listedMimes(page);
  expect(js[0]).toBe('text/javascript');
  expect(js.indexOf('application/json')).toBeGreaterThan(0);
  const groups = await page.locator('.list-group').allTextContents();
  expect(groups.slice(0, 2).map((text) => text.toLowerCase())).toEqual(['exact match', 'starts with']);
  await expect(page.locator('.detail-mime')).toHaveText('text/javascript');

  // An exact media type outranks everything that merely starts with it.
  await search.fill('image/png');
  expect((await listedMimes(page))[0]).toBe('image/png');

  // A top-level type is a prefix of all of its subtypes.
  await search.fill('font');
  const fonts = await listedMimes(page);
  expect(fonts.slice(0, 5).every((mime) => mime.startsWith('font/'))).toBe(true);

  // Prose in the notes is searchable, below the structural matches.
  await search.fill('subtitles');
  const subs = await listedMimes(page);
  expect(subs).toContain('text/vtt');
  await expect(page.locator('.list-group').first()).toHaveText(/mentioned/i);

  // Aliases land on the canonical type.
  await search.fill('image/jpg');
  await expect(page.locator('.detail-mime')).toHaveText('image/jpeg');
  await expect(page.locator('.alias-chip', { hasText: 'image/jpg' })).toBeVisible();
  await search.fill('application/javascript');
  await expect(page.locator('.detail-mime')).toHaveText('text/javascript');
});

test('multi-part filenames match their compound or final extension', async ({ page }) => {
  await openTool(page, TOOL);
  const search = page.locator('#search');

  await search.fill('archive.tar.gz');
  await expect(page.locator('.detail-mime')).toHaveText('application/gzip');
  await expect(page.locator('#query-status')).toContainText('.tar.gz');
  // Server config maps one extension at a time, so the compound one is left out.
  await expect(copyRow(page, 'nginx').locator('.copy-text')).toHaveText('types { application/gzip gz tgz; }');

  await search.fill('.gz');
  await expect(page.locator('.detail-mime')).toHaveText('application/gzip');

  // .ts is ambiguous, and the detail says so.
  await search.fill('.ts');
  await expect(page.locator('.detail-mime')).toHaveText('video/mp2t');
  await expect(page.locator('.detail-list')).toContainText('TypeScript');
});

test('nonsense and extensionless names show a graceful no-match state', async ({ page }) => {
  await openTool(page, TOOL);
  const search = page.locator('#search');

  await search.fill('not-real-abc');
  await expect(page.locator('#type-list')).toContainText('No match');
  await expect(page.locator('.type-item')).toHaveCount(0);
  await expect(page.locator('#result-count')).toHaveText(/^0 of \d+$/);
  await expect(page.locator('#query-status')).toHaveClass(/error/);

  await search.fill('Dockerfile');
  await expect(page.locator('.empty-title')).toHaveText('No match for “Dockerfile”');
  await expect(page.locator('.empty-hint')).toContainText('no extension');

  await search.fill('report.xyz');
  await expect(page.locator('.empty-hint')).toContainText('.xyz');

  // Markup in the query stays text.
  await search.fill('<img src=x onerror=alert(1)>');
  await expect(page.locator('#type-list img')).toHaveCount(0);
  await expect(page.locator('.empty-title')).toContainText('<img');

  // The fallback chip jumps to octet-stream and clears the search.
  await page.locator('.empty-actions .related-chip', { hasText: 'application/octet-stream' }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('.detail-mime')).toHaveText('application/octet-stream');
  await expect(item(page, 'application/octet-stream')).toHaveClass(/is-active/);

  // The clear control lives in the search field and only shows when useful.
  await expect(page.locator('.search-clear')).toBeHidden();
  await search.fill('zzz');
  await page.click('.search-clear');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(page.locator('.search-clear')).toBeHidden();
  expect(await page.locator('.type-item').count()).toBeGreaterThan(70);
});

test('the category filter narrows by top-level type', async ({ page }) => {
  await openTool(page, TOOL);

  await page.click('[data-category="image"]');
  await expect(page.locator('[data-category="image"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-category="all"]')).toHaveAttribute('aria-pressed', 'false');
  const images = await listedMimes(page);
  expect(images.length).toBeGreaterThan(8);
  expect(images.every((mime) => mime.startsWith('image/'))).toBe(true);
  // The selection moves to the first visible type when the old one is hidden.
  await expect(page.locator('.detail-mime')).toHaveText(images[0]);

  await page.click('[data-category="font"]');
  expect((await listedMimes(page)).every((mime) => mime.startsWith('font/'))).toBe(true);

  // Search and filter combine.
  await page.click('[data-category="audio"]');
  await page.locator('#search').fill('ogg');
  expect(await listedMimes(page)).toEqual(expect.arrayContaining(['audio/ogg']));
  expect((await listedMimes(page)).includes('video/ogg')).toBe(false);

  // Arrow keys move along the segment.
  await page.locator('[data-category="audio"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-category="video"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-category="video"]')).toBeFocused();

  await page.click('[data-category="all"]');
  await page.locator('#search').fill('');
  expect(await page.locator('.type-item').count()).toBeGreaterThan(70);
});

test('the list is a keyboard-navigable listbox', async ({ page }) => {
  await openTool(page, TOOL);
  await expect(page.locator('#type-list')).toHaveAttribute('role', 'listbox');
  await expect(page.locator('.type-item').first()).toHaveAttribute('role', 'option');

  const search = page.locator('#search');
  await search.fill('image/');
  const mimes = await listedMimes(page);
  await search.press('ArrowDown');
  await expect(item(page, mimes[0])).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(item(page, mimes[1])).toBeFocused();
  await expect(item(page, mimes[1])).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.detail-mime')).toHaveText(mimes[1]);
  // Roving tabindex: only the selected option is a tab stop.
  expect(await page.locator('.type-item[tabindex="0"]').count()).toBe(1);

  await page.keyboard.press('End');
  await expect(page.locator('.detail-mime')).toHaveText(mimes.at(-1));
  await page.keyboard.press('Home');
  await expect(page.locator('.detail-mime')).toHaveText(mimes[0]);
  // Up from the first option returns to the search box.
  await page.keyboard.press('ArrowUp');
  await expect(search).toBeFocused();

  // Clicking selects too.
  await item(page, mimes[2]).click();
  await expect(page.locator('.detail-mime')).toHaveText(mimes[2]);
});

test('detail copy rows give the header, nginx, Apache and HTML lines', async ({ page }) => {
  await openTool(page, TOOL);
  await page.locator('#search').fill('woff2');
  await expect(page.locator('.detail-mime')).toHaveText('font/woff2');

  const expected = {
    'content-type': 'Content-Type: font/woff2',
    nginx: 'types { font/woff2 woff2; }',
    apache: 'AddType font/woff2 .woff2',
  };
  for (const [key, text] of Object.entries(expected)) {
    await expect(copyRow(page, key).locator('.copy-text')).toHaveText(text);
    await copyRow(page, key).getByRole('button').click();
    expect(await lastCopied(page)).toBe(text);
  }
  await expect(copyRow(page, 'html').locator('.copy-text')).toContainText('rel="preload"');
  await expect(copyRow(page, 'html').locator('.copy-text')).toContainText('crossorigin');

  // Text types default to UTF-8; several extensions share one config line.
  await page.locator('#search').fill('.htm');
  await expect(copyRow(page, 'content-type').locator('.copy-text')).toHaveText('Content-Type: text/html; charset=utf-8');
  await expect(copyRow(page, 'apache').locator('.copy-text')).toHaveText('AddType text/html .html .htm');

  // Without an extension-specific snippet the HTML row is an accept= hint.
  await page.locator('#search').fill('docx');
  await expect(copyRow(page, 'html').locator('.copy-text')).toContainText('accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"');

  // Types with no extension have no server mapping to copy.
  await page.locator('#search').fill('multipart/form-data');
  await expect(copyRow(page, 'content-type')).toBeVisible();
  await expect(copyRow(page, 'nginx')).toHaveCount(0);

  // Copy detail gives a plain-text summary.
  await page.click('[data-action="copy-detail"]');
  const detail = await lastCopied(page);
  expect(detail).toContain('multipart/form-data');
  expect(detail).toContain('boundary');
  expect(detail).not.toContain('`');
});

test('the hash is a shareable deep link in both directions', async ({ page }) => {
  await openTool(page, TOOL);

  await page.locator('#search').fill('webp');
  await expect(page).toHaveURL(/#image\/webp$/);
  await expect(page).toHaveTitle('image/webp — MIME Type Lookup');

  await page.click('[data-action="copy-link"]');
  expect(await lastCopied(page)).toMatch(/\/tools\/mime-type-lookup\/#image\/webp$/);

  // A fresh load of a deep link.
  await page.goto('about:blank');
  await page.goto('/tools/mime-type-lookup/#font/woff2');
  await expect(page.locator('#search')).toHaveValue('');
  await expect(page.locator('.detail-mime')).toHaveText('font/woff2');
  await expect(item(page, 'font/woff2')).toHaveClass(/is-active/);

  // A hash change in an open page follows along; an alias resolves.
  await page.evaluate(() => { window.location.hash = '#image/jpg'; });
  await expect(page.locator('.detail-mime')).toHaveText('image/jpeg');

  // An unknown hash falls back to the default selection on load.
  await page.goto('about:blank');
  await page.goto('/tools/mime-type-lookup/#nope/nothing');
  await expect(page.locator('.detail-mime')).toHaveText(await page.locator('.type-item').first().getAttribute('data-mime'));
});

test('the help modal covers the common Content-Type pitfalls', async ({ page }) => {
  await openTool(page, TOOL);
  await page.click('#helpBtn');
  const modal = page.locator('#helpModal');
  await expect(modal).toHaveClass(/is-open/);
  for (const text of ['charset=utf-8', 'nosniff', 'RFC 9239', 'video/mp2t', 'image/jpg', 'application/json', 'IANA']) {
    await expect(modal).toContainText(text);
  }
  // One section per topic, never cards nested inside a card.
  expect(await modal.locator('.modal-section').count()).toBeGreaterThanOrEqual(2);
  expect(await modal.locator('.modal-section-title').count()).toBe(await modal.locator('.modal-section').count());
  await expect(modal.locator('.legend-intro')).toHaveCount(0);
  await expect(modal.locator('.tip-list .tip-list')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/is-open/);
});

test('fits a phone without horizontal scroll and without console errors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await openTool(page, TOOL);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await fits()).toBe(true);
  await page.locator('#search').fill('docx');
  await expect(page.locator('.detail-mime')).toHaveText(/wordprocessingml/);
  expect(await fits()).toBe(true);
  expect(errors).toEqual([]);
});

test('the tool no longer depends on the retired utility layer', async ({ page }) => {
  await openTool(page, TOOL);
  const refs = await page.evaluate(() => [...document.querySelectorAll('script[src], link[href]')]
    .map((node) => node.getAttribute('src') || node.getAttribute('href'))
    .filter((url) => url.includes('utility-')));
  expect(refs).toEqual([]);
  expect(await page.locator('.app-subtitle').count()).toBe(0);
  // A lookup page carries only the help control in its header.
  await expect(page.locator('.header-actions .action-btn')).toHaveCount(1);
  await expect(page.locator('.header-actions #helpBtn')).toBeVisible();
  expect(await page.evaluate(() => typeof window.UtilityUI)).toBe('undefined');
});

test('list rows are styled rows and the count shares the filter line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, TOOL);
  const row = await page.evaluate(() => {
    const item = document.querySelector('.type-item[data-mime="text/html"]');
    const [mime, exts, tag] = item.children;
    const box = (node) => node.getBoundingClientRect();
    return {
      display: getComputedStyle(item).display,
      classes: [...item.children].map((node) => node.className),
      mimeFont: getComputedStyle(mime).fontFamily,
      chips: exts.querySelectorAll('.ext-chip').length,
      chipBorder: getComputedStyle(exts.querySelector('.ext-chip')).borderTopStyle,
      gapAfterMime: box(exts).left - box(mime).right,
      tagBorder: getComputedStyle(tag).borderTopStyle,
      height: box(item).height,
    };
  });
  expect(row.display).toBe('grid');
  expect(row.classes).toEqual(['type-mime', 'type-exts', 'category-tag cat-text']);
  expect(row.mimeFont).toMatch(/Mono/);
  expect(row.chips).toBe(2);
  expect(row.chipBorder).toBe('solid');
  expect(row.gapAfterMime).toBeGreaterThan(4);
  expect(row.tagBorder).toBe('solid');
  expect(row.height).toBeLessThan(48);

  // The result count sits on the filter's line, at its right.
  for (const width of [1440, 1100, 980]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const segment = document.getElementById('category-filter').getBoundingClientRect();
      const count = document.getElementById('result-count').getBoundingClientRect();
      return { sameLine: Math.abs((segment.top + segment.height / 2) - (count.top + count.height / 2)) < 6,
               right: count.left >= segment.right, oneLine: count.height < 24 };
    });
    expect(geometry, `at ${width}px`).toEqual({ sameLine: true, right: true, oneLine: true });
  }
});
