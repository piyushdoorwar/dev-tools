import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

test('JSON round-trips through TOON without losing structure', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  const results = await page.evaluate(() => {
    const fixtures = [
      { name: 'ada', active: true, count: 0, nested: { list: [1, 'two', { deep: null }] } },
      [1, 'two', { three: false }],
      {},
      [],
      { 'key with spaces': 'value', 'unicode': 'héllo €' },
    ];
    return fixtures.map((fixture) => ({
      fixture,
      parsed: toonToJSON(jsonToToon(fixture, 2, ',')),
    }));
  });

  for (const { fixture, parsed } of results) expect(parsed).toEqual(fixture);
});

test('a custom delimiter survives values that contain it', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  const result = await page.evaluate(() => {
    currentDelimiter = '|';
    currentIndent = 2;
    const fixture = { title: 'a|b: c', rows: [{ id: 1, label: 'one|first' }] };
    const toon = jsonToToon(fixture, 2, '|');
    return { toon, parsed: toonToJSON(toon) };
  });

  expect(result.parsed).toEqual({ title: 'a|b: c', rows: [{ id: 1, label: 'one|first' }] });
});

test('malformed TOON is rejected with a helpful message', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  const message = await page.evaluate(() => {
    try {
      validateToon('this is not Toon syntax');
      return null;
    } catch (error) {
      return error.message;
    }
  });

  expect(message).toContain('Invalid Toon line');
});

test('typing JSON converts live into the TOON pane', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  await typeInto(page, '#left-editor', '{"greeting":"hi"}');
  await expect(page.locator('#right-editor')).toHaveValue(/greeting/);
  await expect(page.locator('#left-status')).toContainText(/Valid/i);
});

test('invalid JSON is reported instead of converted', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  await typeInto(page, '#left-editor', '{"broken":');
  await expect(page.locator('#left-status')).not.toContainText('Valid JSON');
});

test('the token statistics report a reduction for the sample', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  await page.locator('[data-action="load-sample"]').click();
  await expect(page.locator('#left-editor')).not.toHaveValue('');

  await page.locator('[data-action="open-info"]').click();
  await expect(page.locator('#info-modal')).toBeVisible();

  const stats = await page.evaluate(() => ({
    json: Number(document.getElementById('modal-json-tokens').textContent.replace(/\D/g, '')),
    toon: Number(document.getElementById('modal-toon-tokens').textContent.replace(/\D/g, '')),
  }));

  expect(stats.json).toBeGreaterThan(0);
  expect(stats.toon).toBeGreaterThan(0);
  expect(stats.toon).toBeLessThanOrEqual(stats.json);
});

test('beautify reformats the JSON pane', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  await typeInto(page, '#left-editor', '{"a":{"b":1}}');
  await page.locator('[data-action="beautify-left"]').click();

  const value = await page.locator('#left-editor').inputValue();
  expect(value).toContain('\n');
  expect(JSON.parse(value)).toEqual({ a: { b: 1 } });
});

test('copy, paste, clear, and download act on a pane', async ({ page }) => {
  await openTool(page, 'json-toon-converter');
  await typeInto(page, '#left-editor', '{"a":1}');

  await page.locator('[data-action="copy-left"]').click();
  expect(await lastCopied(page)).toBe('{"a":1}');

  const download = await captureDownload(page, () => page.locator('[data-action="download-left"]').click());
  expect(await downloadText(download)).toContain('"a"');

  await setClipboardText(page, '{"pasted":1}');
  await page.locator('[data-action="paste-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{"pasted":1}');

  await page.locator('[data-action="clear-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
});

test('the settings and info modals open and close', async ({ page }) => {
  await openTool(page, 'json-toon-converter');

  // Token stats only become reachable once there is something to measure.
  await page.locator('[data-action="load-sample"]').click();
  await expect(page.locator('#left-editor')).not.toHaveValue('');

  await page.locator('[data-action="open-info"]').click();
  await expect(page.locator('#info-modal')).toBeVisible();
  await page.locator('#info-close').click();
  await expect(page.locator('#info-modal')).toBeHidden();

  await page.locator('[data-action="open-settings"]').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.locator('#settings-close').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
});
