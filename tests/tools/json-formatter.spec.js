import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, typeInto } from '../helpers.js';

const BOOKS = JSON.stringify({
  store: {
    book: [
      { title: 'A', author: 'Ann', price: 8.5, tags: ['x'] },
      { title: 'B', author: 'Bob', price: 12, isbn: '1-2', tags: ['x', 'y'] },
      { title: 'C', author: 'Cat', price: 9.99, isbn: '3-4', tags: [] },
    ],
  },
});

const outputJson = async (page) => JSON.parse(await page.locator('#output').inputValue());

test('formats with the chosen indent and minifies', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await typeInto(page, '#input', '{"a":[1,{"b":null}]}');
  await expect(page.locator('#output')).toHaveValue('{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ]\n}');
  await expect(page.locator('#input-status')).toContainText('Valid JSON');

  await page.locator('.option .dd__trigger').click();
  await page.locator('.option .dd__option[data-value="tab"]').click();
  await expect(page.locator('#output')).toHaveValue('{\n\t"a": [\n\t\t1,\n\t\t{\n\t\t\t"b": null\n\t\t}\n\t]\n}');

  await page.locator('.mode-btn[data-style="minified"]').click();
  await expect(page.locator('#output')).toHaveValue('{"a":[1,{"b":null}]}');
  await expect(page.locator('#output-status')).toContainText('Minified');
  await expect(page.locator('#indent-option')).toHaveClass(/is-disabled/);
});

test('keeps key order and number literals that JSON.parse would change', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await typeInto(page, '#input', '{"b":1,"10":2,"2":3,"id":12345678901234567890,"price":1.50,"e":1e3}');
  await page.locator('.mode-btn[data-style="minified"]').click();
  await expect(page.locator('#output')).toHaveValue('{"b":1,"10":2,"2":3,"id":12345678901234567890,"price":1.50,"e":1e3}');
  await expect(page.locator('#input-status')).toContainText('1 large number kept exact');
});

test('sort keys orders every object recursively', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await typeInto(page, '#input', '{"b":{"z":1,"a":2},"a":[{"y":1,"x":2}],"10":0,"2":0}');
  await page.locator('#sort-keys').check();
  await page.locator('.mode-btn[data-style="minified"]').click();
  await expect(page.locator('#output')).toHaveValue('{"10":0,"2":0,"a":[{"x":2,"y":1}],"b":{"a":2,"z":1}}');
});

test('parse errors name the line and column, and clicking jumps there', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await typeInto(page, '#input', '{\n  "a": 1,\n  "b": 2,\n}');
  await expect(page.locator('#input-status')).toHaveClass(/is-error/);
  await expect(page.locator('#input-status')).toContainText('Line 4, column 1: Trailing comma');

  await page.locator('#input-status').click();
  const caret = await page.locator('#input').evaluate((el) => el.selectionStart);
  expect(caret).toBe('{\n  "a": 1,\n  "b": 2,\n'.length);
});

test('duplicate keys are flagged', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await typeInto(page, '#input', '{"id":1,\n"id":2}');
  await expect(page.locator('#input-status')).toHaveClass(/is-warning/);
  await expect(page.locator('#input-status')).toContainText('Duplicate key "id" at line 2');
  await expect(page.locator('#output')).toHaveValue('{\n  "id": 2\n}');
});

test('JSONPath queries filter values and report normalized paths', async ({ page }) => {
  await openTool(page, 'json-formatter');
  await typeInto(page, '#input', BOOKS);

  const cases = [
    ['$.store.book[*].author', ['Ann', 'Bob', 'Cat']],
    ['$..price', [8.5, 12, 9.99]],
    ['$.store.book[?@.price < 10].title', ['A', 'C']],
    ['$.store.book[?(@.isbn && @.price > 10)].title', ['B']],
    ['$.store.book[-1:].title', ['C']],
    ['$.store.book[::-1].title', ['C', 'B', 'A']],
    ["$.store.book[?match(@.author, 'B.*')].title", ['B']],
    ['$.store.book[?length(@.tags) >= 1].title', ['A', 'B']],
    ['store.book[0].title', ['A']],
    ['$.nothing', []],
  ];
  for (const [query, expected] of cases) {
    await typeInto(page, '#query', query);
    expect(await outputJson(page), query).toEqual(expected);
  }
  await expect(page.locator('#output-status')).toContainText('No matches');

  await typeInto(page, '#query', '$..isbn');
  await expect(page.locator('#output-status')).toContainText('2 matches');
  await expect(page.locator('#output-title')).toHaveText('Query result');
  await page.locator('.mode-btn[data-result="paths"]').click();
  expect(await outputJson(page)).toEqual(["$['store']['book'][1]['isbn']", "$['store']['book'][2]['isbn']"]);
});

test('jq queries: pipes, construction, builtins, and one result per line', async ({ page }) => {
  await openTool(page, 'json-formatter');
  await typeInto(page, '#input', BOOKS);

  await page.locator('.query-bar .dd__trigger').click();
  await page.locator('.query-bar .dd__option[data-value="jq"]').click();
  await expect(page).toHaveURL(/#jq$/);
  await expect(page.locator('#result-switch')).toBeHidden();

  const cases = [
    ['[.store.book[] | select(.price < 10) | .title]', ['A', 'C']],
    ['.store.book | map({title, cheap: (.price < 10)})', [{ title: 'A', cheap: true }, { title: 'B', cheap: false }, { title: 'C', cheap: true }]],
    ['[.store.book[].price] | add | . * 100 | round', 3049],
    ['.store.book | sort_by(-.price) | map(.title)', ['B', 'C', 'A']],
    ['[.store.book[] | .isbn // "none"]', ['none', '1-2', '3-4']],
    ['reduce .store.book[] as $b (0; . + ($b.tags | length))', 3],
    ['.store.book[0] | "\\(.title) by \\(.author)"', 'A by Ann'],
    ['del(.store.book[1:]) | .store.book | length', 1],
    ['.store.book[0].price |= . * 2 | .store.book[0].price', 17],
    ['[.store.book[] | if .price > 10 then "high" elif .price > 9 then "mid" else "low" end]', ['low', 'high', 'mid']],
    ['.store.book | group_by(.isbn != null) | map(length)', [1, 2]],
    ['[paths(type == "string")] | length', 11],
  ];
  for (const [query, expected] of cases) {
    await typeInto(page, '#query', query);
    await expect(page.locator('#output-status'), query).toContainText('1 result');
    expect(await outputJson(page), query).toEqual(expected);
  }

  await page.locator('.mode-btn[data-style="minified"]').click();
  await typeInto(page, '#query', '.store.book[] | {title}');
  await expect(page.locator('#output')).toHaveValue('{"title":"A"}\n{"title":"B"}\n{"title":"C"}');
  await expect(page.locator('#output-status')).toContainText('3 results');
});

test('a broken query keeps the last result, dimmed, and explains the error', async ({ page }) => {
  await openTool(page, 'json-formatter');
  await page.goto('/tools/json-formatter/#jq');
  await typeInto(page, '#input', BOOKS);

  await typeInto(page, '#query', '.store.book[0].title');
  await expect(page.locator('#output')).toHaveValue('"A"');

  await typeInto(page, '#query', '.store.book[0].title |');
  await expect(page.locator('#output-status')).toHaveClass(/is-error/);
  await expect(page.locator('#output-status')).toContainText('ended unexpectedly');
  await expect(page.locator('#output')).toHaveValue('"A"');
  await expect(page.locator('#output')).toHaveClass(/is-stale/);
  await expect(page.locator('#query')).toHaveAttribute('aria-invalid', 'true');

  await typeInto(page, '#query', '.store.book[0].title | tonumber');
  await expect(page.locator('#output-status')).toContainText('Cannot parse "A" as a number');

  await typeInto(page, '#query', 'foo(1)');
  await expect(page.locator('#output-status')).toContainText('Unknown function "foo"');
});

test('runaway queries are stopped instead of freezing the page', async ({ page }) => {
  await openTool(page, 'json-formatter');
  await page.goto('/tools/json-formatter/#jq');
  await typeInto(page, '#input', '0');
  await typeInto(page, '#query', '[range(100000000)] | length');
  await expect(page.locator('#output-status')).toHaveClass(/is-error/);
  await expect(page.locator('#output-status')).toContainText('too large');
});

test('each language keeps its own query and the hash restores the language', async ({ page }) => {
  await openTool(page, 'json-formatter');
  await typeInto(page, '#input', BOOKS);
  const pickLang = async (lang) => {
    await page.locator('.query-bar .dd__trigger').click();
    await page.locator(`.query-bar .dd__option[data-value="${lang}"]`).click();
  };

  await typeInto(page, '#query', '$..title');
  await pickLang('jq');
  await expect(page.locator('#query')).toHaveValue('');
  await expect(page.locator('#query')).toHaveAttribute('placeholder', /select/);
  await typeInto(page, '#query', '.store | keys');
  expect(await outputJson(page)).toEqual(['book']);

  await pickLang('jsonpath');
  await expect(page.locator('#query')).toHaveValue('$..title');
  await pickLang('jq');
  await expect(page.locator('#query')).toHaveValue('.store | keys');

  // A reload lands on the language the hash names.
  await page.reload();
  await expect(page.locator('#query-lang')).toHaveValue('jq');
  await expect(page.locator('.query-bar .dd__value')).toHaveText('jq');
});

test('help examples load the sample and run the query', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await page.locator('#helpBtn').click();
  await page.locator('.example[data-lang="jq"]').first().click();
  await expect(page.locator('#helpModal')).not.toHaveClass(/is-open/);
  await expect(page.locator('#query-lang')).toHaveValue('jq');
  await expect(page.locator('#output')).toHaveValue('"Sayings of the Century"\n"Moby Dick"');

  // Every example in the help must run cleanly against the sample.
  const examples = await page.locator('.example').evaluateAll((els) => els.map((el) => el.dataset.query));
  for (const [index, query] of examples.entries()) {
    await page.locator('#helpBtn').click();
    await page.locator('.example').nth(index).click();
    await expect(page.locator('#query')).toHaveValue(query);
    await expect(page.locator('#output-status'), query).toHaveClass(/is-success/);
  }
});

test('sample shows off preserved order; format-in-place, copy, and download work', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await page.locator('[data-action="sample"]').click();
  await expect(page.locator('#input-status')).toContainText('Sample loaded');
  await expect(page.locator('#output')).toHaveValue(/"warehouses": \{\n {4}"10": "Leeds",\n {4}"2": "Bristol"/);
  await expect(page.locator('#output')).toHaveValue(/"orderId": 12345678901234567890/);
  await expect(page.locator('#output')).toHaveValue(/"price": 399\.00/);

  await page.locator('#sort-keys').check();
  await page.locator('[data-action="format-input"]').click();
  await expect(page.locator('#input')).toHaveValue(await page.locator('#output').inputValue());

  await page.locator('[data-action="copy"]').click();
  expect(await lastCopied(page)).toBe(await page.locator('#output').inputValue());

  const download = await captureDownload(page, () => page.locator('[data-action="download"]').click());
  expect(download.suggestedFilename()).toBe('formatted.json');
  expect(await downloadText(download)).toBe(`${await page.locator('#output').inputValue()}\n`);

  await page.locator('[data-action="clear"]').click();
  await expect(page.locator('#output')).toHaveValue('');
});

test('opening a file with duplicate keys keeps the warning instead of repainting it as success', async ({ page }) => {
  await openTool(page, 'json-formatter');

  await page.locator('#file-input').setInputFiles({ name: 'dupes.json', mimeType: 'application/json', buffer: Buffer.from('{"id":1,"id":2}') });
  await expect(page.locator('#input')).toHaveValue('{"id":1,"id":2}');
  await expect(page.locator('#input-status')).toHaveClass(/is-warning/);
  await expect(page.locator('#input-status')).not.toHaveClass(/is-success/);
  await expect(page.locator('#input-status')).toContainText('Duplicate key "id"');

  await page.locator('#file-input').setInputFiles({ name: 'clean.json', mimeType: 'application/json', buffer: Buffer.from('{"id":1}') });
  await expect(page.locator('#input-status')).toHaveClass(/is-success/);
  await expect(page.locator('#input-status')).toContainText('Opened clean.json');
});

test('engine agrees with JSON.parse on ordinary documents', async ({ page }) => {
  await openTool(page, 'json-formatter');
  const ok = await page.evaluate(() => {
    const docs = ['{"a":"\\u00e9\\n\\"x\\"","b":[true,false,null,-0.5,1e-7],"c":{}}', '[]', '"s"', '0', '[[[]]]', '{"k":"😀 ☃"}'];
    return docs.every((text) => {
      const ours = window.JsonQuery.stringify(window.JsonQuery.parseJson(text).value, { indent: '' });
      return JSON.stringify(JSON.parse(ours)) === JSON.stringify(JSON.parse(text));
    });
  });
  expect(ok).toBe(true);
});
