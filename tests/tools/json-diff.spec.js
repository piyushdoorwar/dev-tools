import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

async function compare(page, left, right) {
  await typeInto(page, '#left-editor', left);
  await typeInto(page, '#right-editor', right);
}

async function stats(page) {
  return page.evaluate(() => ({
    added: document.getElementById('stat-added').textContent,
    removed: document.getElementById('stat-removed').textContent,
    modified: document.getElementById('stat-modified').textContent,
  }));
}

test('valid JSON on both sides reports Valid JSON', async ({ page }) => {
  await openTool(page, 'json-diff');
  await compare(page, '{"a":1}', '{"a":1}');

  await expect(page.locator('#left-status .status-text')).toHaveText('Valid JSON');
  await expect(page.locator('#right-status .status-text')).toHaveText('Valid JSON');
  await expect.poll(() => stats(page)).toEqual({ added: '0', removed: '0', modified: '0' });
});

test('malformed JSON is reported without breaking the other pane', async ({ page }) => {
  await openTool(page, 'json-diff');
  await compare(page, '{"a":', '{"a":1}');

  await expect(page.locator('#left-status .status-text')).not.toHaveText('Valid JSON');
  await expect(page.locator('#right-status .status-text')).toHaveText('Valid JSON');
});

test('added, removed, and modified keys are counted', async ({ page }) => {
  await openTool(page, 'json-diff');

  await compare(page, '{"a":1}', '{"a":1,"b":2}');
  await expect.poll(async () => (await stats(page)).added).toBe('1');

  await compare(page, '{"a":1,"b":2}', '{"a":1}');
  await expect.poll(async () => (await stats(page)).removed).toBe('1');

  await compare(page, '{"a":1}', '{"a":2}');
  await expect.poll(async () => (await stats(page)).modified).toBe('1');
});

test('nested objects and arrays are compared by path', async ({ page }) => {
  await openTool(page, 'json-diff');
  await compare(
    page,
    JSON.stringify({ user: { name: 'ada', tags: ['x', 'y'] } }),
    JSON.stringify({ user: { name: 'grace', tags: ['x', 'y'] } }),
  );
  await expect.poll(async () => (await stats(page)).modified).toBe('1');

  await compare(
    page,
    JSON.stringify({ list: [1, 2, 3] }),
    JSON.stringify({ list: [1, 2, 3, 4] }),
  );
  await expect.poll(async () => (await stats(page)).added).toBe('1');
});

test('beautify reformats using the configured indent', async ({ page }) => {
  await openTool(page, 'json-diff');
  await typeInto(page, '#left-editor', '{"a":{"b":1}}');

  await page.locator('[data-action="beautify"][data-editor="left"]').click();
  const beautified = await page.locator('#left-editor').inputValue();
  expect(beautified).toContain('\n');
  expect(JSON.parse(beautified)).toEqual({ a: { b: 1 } });
});

test('indent settings change the beautified output', async ({ page }) => {
  await openTool(page, 'json-diff');

  await page.evaluate(() => openSettingsModal());
  await expect(page.locator('#settingsModal')).toHaveAttribute('aria-hidden', 'false');

  await page.locator('#indentSize').fill('4');
  await page.locator('#indentSize').dispatchEvent('change');
  await page.locator('#settingsCloseBtn').click();

  await typeInto(page, '#left-editor', '{"a":1}');
  await page.locator('[data-action="beautify"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{\n    "a": 1\n}');
});

test('tab indentation is available as an alternative', async ({ page }) => {
  await openTool(page, 'json-diff');

  await page.evaluate(() => openSettingsModal());
  await page.locator('#indentType').selectOption('tabs');
  await page.locator('#indentType').dispatchEvent('change');
  await page.locator('#settingsCloseBtn').click();

  await typeInto(page, '#left-editor', '{"a":1}');
  await page.locator('[data-action="beautify"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('{\n\t"a": 1\n}');
});

test('validate reports the outcome for the pane', async ({ page }) => {
  await openTool(page, 'json-diff');

  await typeInto(page, '#left-editor', '{"ok":true}');
  await page.locator('[data-action="validate"][data-editor="left"]').click();
  await expect(page.locator('#left-status .status-text')).toHaveText('Valid JSON');
});

test('undo reverses the last edit in a pane', async ({ page }) => {
  await openTool(page, 'json-diff');

  // Undo delegates to the browser's native undo stack, so the text must be
  // typed rather than assigned for there to be anything to roll back.
  await page.locator('#left-editor').click();
  await page.keyboard.type('{"a":1}');
  await expect(page.locator('#left-editor')).toHaveValue('{"a":1}');

  await page.locator('[data-action="undo"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).not.toHaveValue('{"a":1}');
});

test('sample, clear, copy, paste, and download all work on a pane', async ({ page }) => {
  await openTool(page, 'json-diff');

  await page.locator('[data-action="sample"]').first().click();
  await expect(page.locator('#left-editor')).not.toHaveValue('');

  await page.locator('[data-action="copy"][data-editor="left"]').click();
  expect(await lastCopied(page)).toBeTruthy();

  const download = await captureDownload(
    page,
    () => page.locator('[data-action="download"][data-editor="left"]').click(),
  );
  expect((await downloadText(download)).length).toBeGreaterThan(0);

  await setClipboardText(page, '{"pasted":true}');
  await page.locator('[data-action="paste"][data-editor="right"]').click();
  await expect(page.locator('#right-editor')).toHaveValue('{"pasted":true}');

  await page.locator('[data-action="clear"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
});

test('every JSON primitive is accepted as a whole document', async ({ page }) => {
  await openTool(page, 'json-diff');

  for (const primitive of ['0', '-1.5', 'null', 'true', 'false', '""', '"text"', '[]', '{}']) {
    await typeInto(page, '#left-editor', primitive);
    await expect(page.locator('#left-status .status-text')).toHaveText('Valid JSON');
  }
});

test('the diff legend modal opens and closes', async ({ page }) => {
  await openTool(page, 'json-diff');

  await page.locator('#diffLegendBtn').click();
  await expect(page.locator('#diffLegendModal')).toBeVisible();

  await page.locator('#diffLegendCloseBtn').click();
  await expect(page.locator('#diffLegendModal')).toBeHidden();
});

const markedLines = (page, side) => page.locator(`#${side}-highlights .highlight-line`).evaluateAll((lines) =>
  lines.flatMap((line, index) => (/line-diff-/.test(line.className) ? [index] : [])));

test('highlights land on the changed path, not the first line naming the key', async ({ page }) => {
  await openTool(page, 'json-diff');
  const left = JSON.stringify({ a: { id: 1 }, b: { id: 1 }, list: [{ id: 1 }, { id: 1 }] }, null, 2);
  const right = JSON.stringify({ a: { id: 1 }, b: { id: 2 }, list: [{ id: 1 }, { id: 3 }] }, null, 2);
  await compare(page, left, right);
  await expect.poll(async () => (await stats(page)).modified).toBe('2');

  const expected = right.split('\n').flatMap((line, index) => (/"id": [23]/.test(line) ? [index] : []));
  expect(expected).toHaveLength(2);
  await expect.poll(() => markedLines(page, 'right')).toEqual(expected);
  await expect.poll(() => markedLines(page, 'left')).toEqual(expected);
});

test('keys that also appear as values or in siblings map to their own line', async ({ page }) => {
  await openTool(page, 'json-diff');
  const left = '{\n  "name": "x",\n  "user": {\n    "name": "y"\n  },\n  "tags": ["name", "a"]\n}';
  const right = '{\n  "name": "x",\n  "user": {\n    "name": "z"\n  },\n  "tags": ["name",\n    "b"]\n}';
  await compare(page, left, right);
  await expect.poll(async () => (await stats(page)).modified).toBe('2');
  await expect.poll(() => markedLines(page, 'right')).toEqual([3, 6]);
});

test('Tab indents through the undo stack and refreshes the diff', async ({ page }) => {
  await openTool(page, 'json-diff');
  await page.locator('#left-editor').click();
  await page.keyboard.type('{"a":1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('}');

  await expect(page.locator('#left-editor')).toHaveValue('{"a":1  }');
  await expect(page.locator('#left-status .char-count')).toHaveText('9 characters');
  await expect(page.locator('#left-status .status-text')).toHaveText('Valid JSON');

  await page.keyboard.press('Control+z');
  await expect(page.locator('#left-editor')).not.toHaveValue('{"a":1  }');
});

for (const width of [375, 800]) {
  test(`fits a ${width}px viewport without clipping the toolbar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await openTool(page, 'json-diff');
    await page.locator('[data-action="sample"]').first().click();

    // Polled: the confirmation toast slides in from off-screen right.
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    for (const side of ['left', 'right']) {
      const panel = await page.locator(`.${side}-panel`).boundingBox();
      const last = await page.locator(`.${side}-panel [data-action="clear"]`).boundingBox();
      expect(last.x + last.width).toBeLessThanOrEqual(panel.x + panel.width);
      const editor = await page.locator(`#${side}-editor`).boundingBox();
      expect(editor.height).toBeGreaterThan(250);
    }

    const info = await page.locator('#diffLegendBtn').boundingBox();
    expect(info.x + info.width).toBeLessThanOrEqual(width);

    await page.locator('#diffLegendBtn').click();
    await expect(page.locator('#diffLegendModal')).toBeVisible();
    const dialog = await page.locator('#diffLegendModal .modal-content').boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(width);
  });
}
