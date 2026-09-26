import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText } from '../helpers.js';

const outputJson = async (page) => JSON.parse(await page.locator('#output').inputValue());
const columnText = (page, column) =>
  page.locator(`#data-table tbody tr td:nth-child(${column + 2})`).allTextContents();

test('JSON flattening preserves prototype-named columns and missing values', async ({ page }) => {
  await openTool(page, 'csv-json-converter');
  const result = await page.evaluate(() => jsonToData('[{"__proto__":"kept","constructor":"value","toString":"text"},{}]'));
  expect(result.headers).toEqual(['__proto__', 'constructor', 'toString']);
  expect(result.rows).toEqual([['kept', 'value', 'text'], [null, null, null]]);
});

test('converts CSV with a header row into an array of typed objects with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'id,name,active,zip\n1,Ada,true,02134\n2,Grace,false,');
  expect(await outputJson(page)).toEqual([
    { id: 1, name: 'Ada', active: true, zip: '02134' },
    { id: 2, name: 'Grace', active: false, zip: '' },
  ]);
  await expect(page.locator('#status')).toContainText('2 rows · 4 columns');
  expect(errors).toEqual([]);
});

test('handles RFC 4180 quoting: embedded delimiters, escaped quotes, and line breaks', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'name,note\r\n"Hopper, Grace","She said ""hi"""\r\n"Ada","line one\nline two"\r\n');
  expect(await outputJson(page)).toEqual([
    { name: 'Hopper, Grace', note: 'She said "hi"' },
    { name: 'Ada', note: 'line one\nline two' },
  ]);
});

test('auto-detects semicolon, tab and pipe delimiters, and an explicit delimiter overrides it', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'a;b\n1;2');
  expect(await outputJson(page)).toEqual([{ a: 1, b: 2 }]);
  await expect(page.locator('#status')).toContainText('semicolon detected');

  await page.fill('#input', 'a\tb\n1\t2');
  expect(await outputJson(page)).toEqual([{ a: 1, b: 2 }]);

  await page.fill('#input', 'a|b\n1|2');
  expect(await outputJson(page)).toEqual([{ a: 1, b: 2 }]);

  // A comma inside quotes must not outvote the real delimiter.
  await page.fill('#input', '"x,y,z";b\n1;2');
  expect(await outputJson(page)).toEqual([{ 'x,y,z': 1, b: 2 }]);

  await page.locator('.options-bar .dd__trigger').click();
  await page.locator('.options-bar .dd__option', { hasText: 'Comma' }).click();
  await page.fill('#input', 'a;b,c\n1;2,3');
  expect(await outputJson(page)).toEqual([{ 'a;b': '1;2', c: 3 }]);
});

test('turning off header row and type inference produces arrays of strings', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'a,b\n1,true');
  await page.locator('#header-row').uncheck();
  await page.locator('#infer-types').uncheck();
  expect(await outputJson(page)).toEqual([['a', 'b'], ['1', 'true']]);
});

test('blank and duplicate headers get unique keys so no values are lost', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'id,,id\n1,2,3');
  expect(await outputJson(page)).toEqual([{ id: 1, column_2: 2, id_2: 3 }]);
});

test('ragged rows are padded with a warning, and an unterminated quote is reported', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'a,b,c\n1,2\n4,5,6');
  expect(await outputJson(page)).toEqual([{ a: 1, b: 2, c: '' }, { a: 4, b: 5, c: 6 }]);
  await expect(page.locator('#status')).toHaveClass(/is-warning/);
  await expect(page.locator('#status')).toContainText('1 row had a different column count');

  await page.fill('#input', 'a,b\n1,"open\n2,3');
  await expect(page.locator('#status')).toHaveClass(/is-error/);
  await expect(page.locator('#status')).toContainText('Unterminated quoted field starting on line 2');
  await expect(page.locator('#output')).toHaveValue('');
});

test('the table renders every row and sorts ascending, descending, then back to source order', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'name,age\nCarol,9\nalice,100\nBob,25');
  await expect(page.locator('#data-table thead th')).toHaveText(['#', /name/, /age/]);
  await expect(page.locator('#data-table tbody tr')).toHaveCount(3);

  const ageHeader = page.locator('#data-table thead th').nth(2);
  await ageHeader.locator('button').click();
  await expect(ageHeader).toHaveAttribute('aria-sort', 'ascending');
  expect(await columnText(page, 1)).toEqual(['9', '25', '100']);

  await ageHeader.locator('button').click();
  await expect(ageHeader).toHaveAttribute('aria-sort', 'descending');
  expect(await columnText(page, 1)).toEqual(['100', '25', '9']);

  await ageHeader.locator('button').click();
  await expect(ageHeader).toHaveAttribute('aria-sort', 'none');
  expect(await columnText(page, 1)).toEqual(['9', '100', '25']);

  // Text sorts case-insensitively.
  await page.locator('#data-table thead th').nth(1).locator('button').click();
  expect(await columnText(page, 0)).toEqual(['alice', 'Bob', 'Carol']);

  // Sorting the table never reorders the JSON output.
  expect((await outputJson(page)).map((row) => row.name)).toEqual(['Carol', 'alice', 'Bob']);
});

test('the filter narrows table rows and reports the match count', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.click('[data-action="sample"]');
  await expect(page.locator('#data-table tbody tr')).toHaveCount(5);

  await page.fill('#filter', 'london');
  await expect(page.locator('#data-table tbody tr')).toHaveCount(1);
  await expect(page.locator('#table-meta')).toContainText('1 of 5 rows');

  await page.fill('#filter', '');
  await expect(page.locator('#data-table tbody tr')).toHaveCount(5);
});

test('switching to the JSON view shows the text output and hides the filter', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.fill('#input', 'a\n1');
  await page.click('[data-view="text"]');
  await expect(page.locator('#output')).toBeVisible();
  await expect(page.locator('#filter')).toBeHidden();
  await expect(page.locator('#data-table')).toBeHidden();

  await page.click('[data-view="table"]');
  await expect(page.locator('#data-table')).toBeVisible();
});

test('JSON to CSV flattens nested objects, unions keys, and quotes where needed', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.click('[data-mode="json-csv"]');
  await expect(page).toHaveURL(/#json-csv$/);
  await expect(page.locator('#input-title')).toHaveText('JSON Input');
  await expect(page.locator('#text-view-btn')).toHaveText('CSV');
  await expect(page.locator('#infer-types')).toBeHidden();

  await page.fill('#input', JSON.stringify([
    { id: 1, user: { name: 'Hopper, Grace' }, tags: ['a', 'b'] },
    { id: 2, note: 'say "hi"', user: { name: 'Ada' } },
  ]));
  await expect(page.locator('#output')).toHaveValue(
    'id,user.name,tags,note\n1,"Hopper, Grace","[""a"",""b""]",\n2,Ada,,"say ""hi"""',
  );
  await expect(page.locator('#data-table tbody tr')).toHaveCount(2);

  await page.locator('#header-row').uncheck();
  await expect(page.locator('#output')).toHaveValue(/^1,"Hopper, Grace"/);
});

test('JSON to CSV rejects invalid JSON and non-object items with a clear status', async ({ page }) => {
  await openTool(page, 'csv-json-converter');
  await page.click('[data-mode="json-csv"]');

  await page.fill('#input', '[{"a":1},');
  await expect(page.locator('#status')).toHaveClass(/is-error/);
  await expect(page.locator('#status')).toContainText('Invalid JSON');

  await page.fill('#input', '[{"a":1}, 5]');
  await expect(page.locator('#status')).toContainText('Item 1 is not an object');
});

test('switching direction carries the output across, so a round trip is lossless', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  const csv = 'name,city\n"Hopper, Grace",New York\nAda,London';
  await page.fill('#input', csv);
  await page.locator('#infer-types').uncheck();
  await page.click('[data-mode="json-csv"]');
  await expect(page.locator('#input')).toHaveValue(/"name": "Hopper, Grace"/);
  await expect(page.locator('#output')).toHaveValue(csv);
});

test('a #json-csv deep link opens in JSON to CSV mode', async ({ page }) => {
  await openTool(page, 'csv-json-converter');
  await page.goto('/tools/csv-json-converter/#json-csv');
  await expect(page.locator('[data-mode="json-csv"]')).toHaveClass(/active/);
  await expect(page.locator('#input-title')).toHaveText('JSON Input');
});

test('copy, download, paste, sample and clear actions work', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await setClipboardText(page, 'x,y\n1,2');
  await page.click('[data-action="paste"]');
  await expect(page.locator('#input')).toHaveValue('x,y\n1,2');

  await page.click('[data-action="copy"]');
  expect(JSON.parse(await lastCopied(page))).toEqual([{ x: 1, y: 2 }]);

  const download = await captureDownload(page, () => page.click('[data-action="download"]'));
  expect(download.suggestedFilename()).toBe('data.json');
  expect(JSON.parse(await downloadText(download))).toEqual([{ x: 1, y: 2 }]);

  await page.click('[data-action="clear"]');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#output')).toHaveValue('');
  await expect(page.locator('#empty-state')).toBeVisible();

  await page.click('[data-action="sample"]');
  await expect(page.locator('#output')).not.toHaveValue('');
});

test('opening a .json file switches to JSON to CSV mode', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  await page.locator('#file-input').setInputFiles({
    name: 'people.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[{"a":1,"b":"two"}]'),
  });
  await expect(page.locator('[data-mode="json-csv"]')).toHaveClass(/active/);
  await expect(page.locator('#output')).toHaveValue('a,b\n1,two');
});

test('every icon button shows its tooltip on hover and keyboard focus, inside the viewport', async ({ page }) => {
  await openTool(page, 'csv-json-converter');

  const buttons = page.locator('.action-btn[data-tooltip]');
  expect(await buttons.count()).toBe(7);

  const tooltip = (locator) => locator.evaluate((node) => {
    const style = getComputedStyle(node, '::after');
    return { content: style.content, visibility: style.visibility };
  });

  for (const button of await buttons.all()) {
    const label = await button.getAttribute('data-tooltip');
    await expect(button).toHaveAttribute('aria-label', label);
    expect(await tooltip(button)).toEqual({ content: `"${label}"`, visibility: 'hidden' });

    await button.hover();
    await expect.poll(async () => (await tooltip(button)).visibility).toBe('visible');
    await page.mouse.move(0, 0);
  }

  // Keyboard users get it too.
  const copy = page.locator('[data-action="copy"]');
  await copy.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await tooltip(copy)).visibility).toBe('visible');

  // Bubbles anchor to the button's right edge and grow leftward, so the
  // right-most button's tooltip can't run off-screen.
  const help = page.locator('#helpBtn');
  expect(await help.evaluate((node) => getComputedStyle(node, '::after').right)).toBe('0px');
  const box = await help.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
});

test('a failed clipboard write is reported as a failure, not as copied', async ({ page }) => {
  await openTool(page, 'csv-json-converter');
  await page.fill('#input', 'a\n1');
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
  });
  await page.locator('[data-action="copy"]').click();
  await expect(page.locator('.toast').last()).toContainText('Copy failed');
  await expect(page.locator('.toast', { hasText: 'copied' })).toHaveCount(0);
});

test('on a phone the filter fills the row beside the copy and download buttons', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'csv-json-converter');
  await page.locator('[data-action="sample"]').click();

  const filter = await page.locator('#filter').boundingBox();
  const download = await page.locator('[data-action="download"]').boundingBox();
  const panel = await page.locator('.output-panel').boundingBox();
  expect(filter.width).toBeGreaterThan(200);
  expect(download.x + download.width).toBeLessThanOrEqual(panel.x + panel.width);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
