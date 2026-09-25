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

test('tabular arrays keep the original key order through a round trip', async ({ page }) => {
  await openTool(page, 'json-toon-converter');
  const result = await page.evaluate(() => {
    const source = { users: [{ name: 'ada', id: 1, role: 'admin' }, { name: 'bob', id: 2, role: 'dev' }] };
    const toon = jsonToToon(source, 2, ',');
    return { header: toon.split('\n')[0], keys: Object.keys(toonToJSON(toon).users[0]) };
  });
  expect(result.header).toBe('users[2]{name,id,role}:');
  expect(result.keys).toEqual(['name', 'id', 'role']);
});

test('paste converts the pasted text, however long the clipboard read takes', async ({ page }) => {
  await openTool(page, 'json-toon-converter');
  // A slow clipboard: the old code converted on a fixed 100ms timer.
  await page.evaluate(() => {
    navigator.clipboard.readText = () => new Promise((resolve) => setTimeout(() => resolve('{"slow":true}'), 400));
  });
  await page.locator('[data-action="paste-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{"slow":true}');
  await expect(page.locator('#right-editor')).toHaveValue('slow: true');
});

test('a paste error stays on screen instead of reverting to Ready', async ({ page }) => {
  await page.clock.install();
  await openTool(page, 'json-toon-converter');
  await setClipboardText(page, '{"broken":');
  await page.locator('[data-action="paste-left"]').click();
  await expect(page.locator('#left-status .status-text')).toHaveClass(/error/);
  await page.clock.runFor(3000);
  await expect(page.locator('#left-status .status-text')).toHaveClass(/error/);
});

test('undo steps back over beautify one edit at a time; mode switches reset it', async ({ page }) => {
  await openTool(page, 'json-toon-converter');
  await typeInto(page, '#left-editor', '{"a":1}');
  await page.locator('[data-action="beautify-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{\n  "a": 1\n}');
  await page.locator('[data-action="undo-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{"a":1}');

  await page.locator('.mode-btn[data-mode="toon-json"]').click();
  await page.locator('[data-action="undo-left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
});

for (const width of [375, 800]) {
  test(`fits a ${width}px viewport with every toolbar button inside its panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openTool(page, 'json-toon-converter');
    await page.locator('[data-action="load-sample"]').click();

    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    for (const side of ['left', 'right']) {
      const panel = await page.locator(`.${side}-panel`).boundingBox();
      const rights = await page.locator(`.${side}-panel .action-btn`).evaluateAll((els) =>
        els.filter((el) => el.offsetParent).map((el) => el.getBoundingClientRect().right));
      for (const right of rights) expect(right).toBeLessThanOrEqual(panel.x + panel.width);
      expect((await page.locator(`#${side}-editor`).boundingBox()).height).toBeGreaterThan(250);
    }
  });
}
