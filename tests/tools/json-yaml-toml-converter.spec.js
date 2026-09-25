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

/* ---------- Format task (#yaml-yaml, #json-json, #toml-toml) ---------- */

const task = (page, name) => page.locator(`.mode-btn[data-task="${name}"]`);
const splitDocs = (text) => text.split(/^---$/m).map(doc => doc.trim()).filter(Boolean);

async function openFormatter(page, format = 'yaml') {
  await openTool(page, 'json-yaml-toml-converter');
  await page.goto(`/tools/json-yaml-toml-converter/#${format}-${format}`);
  await expect(task(page, 'format')).toHaveAttribute('aria-pressed', 'true');
}

async function pickIndent(page, value) {
  await page.locator('#format-options .dd__trigger').click();
  await page.locator(`#format-options .dd__option[data-value="${value}"]`).click();
}

test('#yaml-yaml deep-links to the YAML formatter with a seeded multi-document sample', async ({ page }) => {
  await openFormatter(page, 'yaml');

  await expect(page).toHaveTitle('YAML Formatter');
  await expect(page.locator('#right-title')).toHaveText('Formatted YAML');
  await expect(page.locator('#to-switcher')).toBeHidden();
  await expect(page.locator('[data-action="swap"]')).toBeHidden();
  await expect(page.locator('#format-options')).toBeVisible();
  await expect(page.locator('#format-note')).toContainText('comments are not kept');
  await expect(page.locator('#left-status')).toContainText('2 documents');
  await expect(page.locator('#right-status')).toContainText('Formatted YAML');
  await expect(page.locator('#right-editor')).toHaveValue(/^apiVersion: v1\nkind: Service\nmetadata:\n  name: web\n/);
});

test('Format and Convert switch the task and write the hash', async ({ page }) => {
  await openTool(page, 'json-yaml-toml-converter');
  await expect(page.locator('#format-options')).toBeHidden();

  await typeInto(page, '#left-editor', '{"b":1,"a":[1,2]}');
  await task(page, 'format').click();
  await expect(page).toHaveURL(/#json-json$/);
  await expect(page.locator('#right-title')).toHaveText('Formatted JSON');
  // Input is kept, and key order is too.
  await expect(page.locator('#left-editor')).toHaveValue('{"b":1,"a":[1,2]}');
  await expect(page.locator('#right-editor')).toHaveValue('{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');

  await pick(page, 'from', 'yaml').click();
  await expect(page).toHaveURL(/#yaml-yaml$/);

  await task(page, 'convert').click();
  await expect(page).toHaveURL(/#yaml-json$/);
  await expect(page.locator('#to-switcher')).toBeVisible();
  await expect(page.locator('#format-options')).toBeHidden();
});

test('YAML formats with a 2- or 4-space indent, keeping key order and scalars as written', async ({ page }) => {
  await openFormatter(page, 'yaml');

  await typeInto(page, '#left-editor', 'zeta:   {b: 1, a: [x, z]}\nalpha:\n      released: 2024-05-01\n      port: 8080\n');
  await expect(page.locator('#right-editor')).toHaveValue(
    'zeta:\n  b: 1\n  a:\n    - x\n    - z\nalpha:\n  released: 2024-05-01\n  port: 8080\n');
  await expect(page.locator('#right-status')).toContainText('2-space indent');

  await pickIndent(page, '4');
  await expect(page.locator('#right-editor')).toHaveValue(
    'zeta:\n    b: 1\n    a:\n        - x\n        - z\nalpha:\n    released: 2024-05-01\n    port: 8080\n');
  await expect(page.locator('#right-status')).toContainText('4-space indent');
});

test('multi-document YAML keeps its document count when formatted', async ({ page }) => {
  await openFormatter(page, 'yaml');

  await typeInto(page, '#left-editor', 'kind: A\n---\nkind:    B\n---\n- one\n-    two\n');
  await expect(page.locator('#left-status')).toContainText('3 documents');
  await expect(page.locator('#right-status')).toContainText('3 documents');
  const docs = splitDocs(await page.locator('#right-editor').inputValue());
  expect(docs).toEqual(['kind: A', 'kind: B', '- one\n- two']);
});

test('a visible warning appears when YAML comments would be dropped', async ({ page }) => {
  await openFormatter(page, 'yaml');
  const warning = page.locator('#comment-warning');

  await typeInto(page, '#left-editor', 'name: web\nurl: "http://x/#anchor"\ntag: a#b\n');
  await expect(warning).toBeHidden();

  await typeInto(page, '#left-editor', '# owner: platform\nname: web  # inline\n');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('comments');
  await expect(page.locator('#right-editor')).not.toHaveValue(/#/);

  // Converting never warns: it never claimed to keep comments.
  await task(page, 'convert').click();
  await expect(warning).toBeHidden();
});

test('YAML errors give a 1-based line and column', async ({ page }) => {
  await openFormatter(page, 'yaml');

  await typeInto(page, '#left-editor', 'a: 1\nb:\n  c: 2\n d: 3\n');
  const status = page.locator('#left-status .status-text');
  await expect(status).toHaveClass(/error/);
  await expect(status).toContainText('Line 4, column 2');
  await expect(page.locator('#right-status')).toContainText('Waiting for valid input');

  const messages = await page.evaluate(() => [['json', '{\n  "a": 1,\n}'], ['toml', 'a = 1\nb = \n']].map(([format, text]) => {
    try { parseDocuments(format, text); return 'no error'; } catch (e) { return describeParseError(format, e, text); }
  }));
  expect(messages[0]).toMatch(/^Line 3, column 1: /);
  expect(messages[1]).toMatch(/^Line 2, column \d+: /);
});

test('TOML and JSON format in place', async ({ page }) => {
  await openFormatter(page, 'toml');
  await expect(page.locator('#right-title')).toHaveText('Formatted TOML');
  // smol-toml's writer has no indent setting.
  await expect(page.locator('.indent-option')).toBeHidden();

  await typeInto(page, '#left-editor', 'title="x"   # comment\n[owner]\nname  =  "y"\n');
  await expect(page.locator('#right-editor')).toHaveValue('title = "x"\n\n[owner]\nname = "y"\n');
  await expect(page.locator('#comment-warning')).toBeVisible();

  await pick(page, 'from', 'json').click();
  await expect(page).toHaveURL(/#json-json$/);
  await expect(page.locator('#format-note')).not.toContainText('comments');
  await typeInto(page, '#left-editor', '{"z":{"y":1},"a":2}');
  await pickIndent(page, '4');
  await expect(page.locator('#right-editor')).toHaveValue('{\n    "z": {\n        "y": 1\n    },\n    "a": 2\n}');
});

for (const width of [375, 600, 900]) {
  test(`fits a ${width}px viewport: usable editors, no clipped toolbar, no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openTool(page, 'json-yaml-toml-converter');
    await page.locator('[data-action="load-sample"]').click();

    // Hidden tooltips on the right-most buttons used to widen the page.
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    for (const side of ['left', 'right']) {
      const panel = await page.locator(`.${side}-panel`).boundingBox();
      const rights = await page.locator(`#${side}-actions .action-btn`).evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().right));
      for (const right of rights) expect(right).toBeLessThanOrEqual(panel.x + panel.width);
      // At 375px the input editor used to be about 30px tall.
      expect((await page.locator(`#${side}-editor`).boundingBox()).height).toBeGreaterThan(250);
    }
  });
}
