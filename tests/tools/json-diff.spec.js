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
