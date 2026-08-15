import { expect, test } from '@playwright/test';
import { openTool } from '../helpers.js';

const TEXT = Buffer.from('The quick brown fox jumps over the lazy dog.\n'.repeat(200));

async function queue(page, files) {
  await page.locator('#fileInput').setInputFiles(files);
  await expect(page.locator('#fileTableBody tr')).not.toHaveCount(0);
}

test('queueing a file fills the table and the summary counters', async ({ page }) => {
  await openTool(page, 'file-compressor');

  await expect(page.locator('#generateBtn')).toBeDisabled();
  await queue(page, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: TEXT }]);

  await expect(page.locator('#fileCount')).toHaveText(/1/);
  await expect(page.locator('#totalSize')).not.toHaveText('0 B');
  await expect(page.locator('#generateBtn')).toBeEnabled();
});

test('several files can be queued at once', async ({ page }) => {
  await openTool(page, 'file-compressor');

  await queue(page, [
    { name: 'one.txt', mimeType: 'text/plain', buffer: TEXT },
    { name: 'two.txt', mimeType: 'text/plain', buffer: TEXT },
    { name: 'three.txt', mimeType: 'text/plain', buffer: TEXT },
  ]);

  await expect(page.locator('#fileTableBody tr')).toHaveCount(3);
  await expect(page.locator('#fileCount')).toHaveText(/3/);
});

test('clearing the queue restores the empty state', async ({ page }) => {
  await openTool(page, 'file-compressor');
  await queue(page, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: TEXT }]);

  await page.locator('#clearBtn').click();
  await expect(page.locator('#fileCount')).toHaveText(/0/);
  await expect(page.locator('#generateBtn')).toBeDisabled();
});

test('every algorithm produces a downloadable archive', async ({ page }) => {
  test.setTimeout(120_000);
  await openTool(page, 'file-compressor');

  for (const algorithm of ['store', 'deflate', 'lzma', 'zstd']) {
    await queue(page, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: TEXT }]);

    await page.locator('#algorithmTrigger').click();
    await page.locator(`.algo-option[data-value="${algorithm}"]`).click();
    await page.locator('#generateBtn').click();

    await expect(page.locator('#doneState')).not.toHaveClass(/hidden/, { timeout: 40_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#downloadBtn').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    await page.locator('#clearBtn').click();
  }
});

test('compression reports the size saved', async ({ page }) => {
  test.setTimeout(60_000);
  await openTool(page, 'file-compressor');
  await queue(page, [{ name: 'repetitive.txt', mimeType: 'text/plain', buffer: TEXT }]);

  await page.locator('#algorithmTrigger').click();
  await page.locator('.algo-option[data-value="deflate"]').click();
  await page.locator('#generateBtn').click();

  await expect(page.locator('#doneState')).not.toHaveClass(/hidden/, { timeout: 40_000 });
  await expect(page.locator('#doneOriginal')).not.toBeEmpty();
  await expect(page.locator('#doneCompressed')).not.toBeEmpty();
  // Highly repetitive text must shrink.
  await expect(page.locator('#doneSaved')).not.toHaveText(/^0/);
});

test('queue limits are enforced with a readable message', async ({ page }) => {
  await openTool(page, 'file-compressor');

  const messages = await page.evaluate(() => ({
    tooManyFiles: FileCompressorValidation.validateQueueLimits(5_001, 1),
    tooManyBytes: FileCompressorValidation.validateQueueLimits(1, 501 * 1024 * 1024),
    withinLimits: FileCompressorValidation.validateQueueLimits(10, 1024),
  }));

  expect(messages.tooManyFiles).toContain('5,000 files');
  expect(messages.tooManyBytes).toContain('500 MB');
  expect(messages.withinLimits).toBeFalsy();
});

test('the algorithm picker exposes every mode', async ({ page }) => {
  await openTool(page, 'file-compressor');

  await page.locator('#algorithmTrigger').click();
  await expect(page.locator('#algorithmMenu')).toBeVisible();

  for (const algorithm of ['store', 'deflate', 'lzma', 'zstd']) {
    await expect(page.locator(`.algo-option[data-value="${algorithm}"]`)).toHaveCount(1);
  }

  await page.locator('.algo-option[data-value="lzma"]').click();
  await expect(page.locator('#algorithmValue')).toContainText(/lzma/i);
});

test('the info modal opens and closes', async ({ page }) => {
  await openTool(page, 'file-compressor');

  await page.locator('#infoBtn').click();
  await expect(page.locator('#infoModal')).toBeVisible();

  await page.locator('#closeInfoBtn').click();
  await expect(page.locator('#infoModal')).toBeHidden();
});
