import { expect, test } from '@playwright/test';
import { captureDownload, lastCopied, openTool, typeInto } from '../helpers.js';

const pick = (page, side, format) => page.locator(`.mode-btn[data-side="${side}"][data-format="${format}"]`);

test('data round-trips through every format pair without losing structure', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  const results = await page.evaluate(() => {
    const fixture = {
      name: 'svc',
      port: 8080,
      ratio: 0.5,
      enabled: true,
      tags: ['a', 'b'],
      nested: { deep: { list: [1, 2, 3] } },
      rows: [{ id: 1, label: 'one' }, { id: 2, label: 'two' }],
      'key with spaces': 'héllo €',
    };
    const formats = ['json', 'yaml', 'toml'];
    const out = [];
    for (const from of formats) {
      for (const to of formats) {
        if (from === to) continue;
        const text = stringifyDocuments(from, [fixture]);
        const converted = stringifyDocuments(to, parseDocuments(from, text));
        out.push({ pair: `${from}-${to}`, parsed: parseDocuments(to, converted)[0], fixture });
      }
    }
    return out;
  });

  for (const { pair, parsed, fixture } of results) expect(parsed, pair).toEqual(fixture);
});

test('typing JSON converts live into YAML by default', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await typeInto(page, '#left-editor', '{"apiVersion":"v1","kind":"Service","spec":{"ports":[{"port":80}]}}');
  await expect(page.locator('#right-editor')).toHaveValue(/kind: Service/);
  await expect(page.locator('#right-editor')).toHaveValue(/- port: 80/);
  await expect(page.locator('#left-status')).toContainText('Valid JSON');
  await expect(page.locator('#right-title')).toHaveText('YAML Output');
});

test('multi-document YAML becomes a JSON array', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await pick(page, 'from', 'yaml').click();
  await expect(page.locator('#left-title')).toHaveText('YAML Input');
  await expect(pick(page, 'to', 'json')).toHaveAttribute('aria-pressed', 'true');

  await typeInto(page, '#left-editor', 'kind: Service\n---\nkind: Deployment\n');
  await expect(page.locator('#left-status')).toContainText('2 documents');
  await expect(page.locator('#right-status')).toContainText('array');
  expect(JSON.parse(await page.locator('#right-editor').inputValue())).toEqual([
    { kind: 'Service' },
    { kind: 'Deployment' },
  ]);
});

test('TOML converts to JSON with tables and arrays of tables', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');
  await page.goto('/tools/json-yaml-toml-converter/#toml-json');
  await expect(page.locator('#left-title')).toHaveText('TOML Input');

  await typeInto(page, '#left-editor', '[package]\nname = "demo"\nversion = "0.1.0"\n\n[[bin]]\nname = "cli"\n');
  expect(JSON.parse(await page.locator('#right-editor').inputValue())).toEqual({
    package: { name: 'demo', version: '0.1.0' },
    bin: [{ name: 'cli' }],
  });
});

test('values TOML cannot represent are explained, not swallowed', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');
  await page.goto('/tools/json-yaml-toml-converter/#json-toml');

  await typeInto(page, '#left-editor', '{"a":{"b":null}}');
  await expect(page.locator('#right-status')).toContainText('TOML has no null');
  await expect(page.locator('#right-status')).toContainText('a.b');

  await typeInto(page, '#left-editor', '[1,2]');
  await expect(page.locator('#right-status')).toContainText('top level');
});

test('invalid input is reported with the parser message', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await pick(page, 'from', 'yaml').click();
  await typeInto(page, '#left-editor', 'a: [1, 2\n');
  await expect(page.locator('#left-status .status-text')).toHaveClass(/error/);
  await expect(page.locator('#left-status')).not.toContainText('Valid');
});

test('swap carries the output over as the new input and updates the hash', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await typeInto(page, '#left-editor', '{"name":"demo","port":3000}');
  await expect(page.locator('#right-editor')).toHaveValue(/name: demo/);

  await page.locator('[data-action="swap"]').click();
  await expect(page).toHaveURL(/#yaml-json$/);
  await expect(page.locator('#left-editor')).toHaveValue(/name: demo/);
  expect(JSON.parse(await page.locator('#right-editor').inputValue())).toEqual({ name: 'demo', port: 3000 });
});

test('choosing the output format keeps the input and reconverts', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await typeInto(page, '#left-editor', '{"title":"x","owner":{"name":"y"}}');
  await pick(page, 'to', 'toml').click();
  await expect(page).toHaveURL(/#json-toml$/);
  await expect(page.locator('#left-editor')).toHaveValue('{"title":"x","owner":{"name":"y"}}');
  await expect(page.locator('#right-editor')).toHaveValue(/\[owner\]/);
});

test('sample, copy, and download follow the chosen formats', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await pick(page, 'from', 'toml').click();
  await pick(page, 'to', 'json').click();
  await page.locator('[data-action="load-sample"]').click();
  await expect(page.locator('#left-editor')).toHaveValue(/\[server\]/);
  await expect(page.locator('#right-status')).toContainText('Converted to JSON');
  const output = JSON.parse(await page.locator('#right-editor').inputValue());
  expect(output.server).toEqual({ host: '0.0.0.0', port: 8080, tls: false });

  await page.locator('[data-action="copy-right"]').click();
  expect(JSON.parse(await lastCopied(page))).toEqual(output);

  const download = await captureDownload(page, () => page.locator('[data-action="download-left"]').click());
  expect(download.suggestedFilename()).toBe('data.toml');
});

test('sort keys reorders the input recursively in its own format', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');

  await typeInto(page, '#left-editor', '{"b":1,"a":{"z":1,"m":2}}');
  await page.locator('[data-action="sort-keys"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{\n  "a": {\n    "m": 2,\n    "z": 1\n  },\n  "b": 1\n}');
  await expect(page.locator('#right-editor')).toHaveValue(/^a:\n  m: 2\n  z: 1\nb: 1/);
});
