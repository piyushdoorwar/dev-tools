import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

async function compare(page, left, right) {
  await typeInto(page, '#left-editor', left);
  await typeInto(page, '#right-editor', right);
  await page.waitForFunction(() => document.getElementById('stat-added') !== null);
}

async function stats(page) {
  return page.evaluate(() => ({
    added: document.getElementById('stat-added').textContent,
    removed: document.getElementById('stat-removed').textContent,
    modified: document.getElementById('stat-modified').textContent,
  }));
}

test('identical text reports no differences', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'alpha\nbeta\ngamma', 'alpha\nbeta\ngamma');
  await expect.poll(() => stats(page)).toEqual({ added: '0', removed: '0', modified: '0' });
});

test('added and removed lines are counted separately', async ({ page }) => {
  await openTool(page, 'text-diff');

  await compare(page, 'one\ntwo', 'one\ntwo\nthree');
  await expect.poll(async () => (await stats(page)).added).toBe('1');

  await compare(page, 'one\ntwo\nthree', 'one\ntwo');
  await expect.poll(async () => (await stats(page)).removed).toBe('1');
});

test('a changed line counts as modified, not add plus remove', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'the quick fox', 'the slow fox');
  await expect.poll(async () => (await stats(page)).modified).toBe('1');
});

test('line endings are normalised so CRLF alone is not a difference', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'one\r\ntwo\r\nthree', 'one\ntwo\nthree');
  await expect.poll(() => stats(page)).toEqual({ added: '0', removed: '0', modified: '0' });
});

test('normalize strips trailing whitespace from a side', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'alpha   \nbeta\t\n', 'alpha\nbeta\n');

  await page.locator('[data-action="normalize"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('alpha\nbeta\n');
  await expect.poll(() => stats(page)).toEqual({ added: '0', removed: '0', modified: '0' });
});

test('undo reverses the last edit in a pane', async ({ page }) => {
  await openTool(page, 'text-diff');

  // Undo is wired to the browser's native undo stack, so the text has to be
  // typed rather than assigned for there to be anything to roll back.
  await page.locator('#left-editor').click();
  await page.keyboard.type('first line');
  await expect(page.locator('#left-editor')).toHaveValue('first line');

  await page.locator('[data-action="undo"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).not.toHaveValue('first line');
});

test('the sample button fills both panes with comparable text', async ({ page }) => {
  await openTool(page, 'text-diff');
  await page.locator('[data-action="sample"]').first().click();

  await expect(page.locator('#left-editor')).not.toHaveValue('');
  await expect(page.locator('#right-editor')).not.toHaveValue('');
});

test('clear empties only the side it belongs to', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'left side', 'right side');

  await page.locator('[data-action="clear"][data-editor="left"]').click();
  await expect(page.locator('#left-editor')).toHaveValue('');
  await expect(page.locator('#right-editor')).toHaveValue('right side');
});

test('copy and paste move text in and out of a pane', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'copy me', '');

  await page.locator('[data-action="copy"][data-editor="left"]').click();
  expect(await lastCopied(page)).toBe('copy me');

  await setClipboardText(page, 'pasted text');
  await page.locator('[data-action="paste"][data-editor="right"]').click();
  await expect(page.locator('#right-editor')).toHaveValue('pasted text');
});

test('download writes the pane contents to a file', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'downloadable content', '');

  const download = await captureDownload(
    page,
    () => page.locator('[data-action="download"][data-editor="left"]').click(),
  );
  expect(await downloadText(download)).toContain('downloadable content');
});

test('line numbers track the content of each pane', async ({ page }) => {
  await openTool(page, 'text-diff');
  await compare(page, 'a\nb\nc\nd', 'a');

  await expect(page.locator('#left-line-numbers .line-number')).toHaveCount(4);
  await expect(page.locator('#right-line-numbers .line-number')).toHaveCount(1);
});

test('the diff legend modal opens and closes', async ({ page }) => {
  await openTool(page, 'text-diff');

  await page.locator('#diffLegendBtn').click();
  await expect(page.locator('#diffLegendModal')).toBeVisible();

  await page.locator('#diffLegendCloseBtn').click();
  await expect(page.locator('#diffLegendModal')).toBeHidden();
});
