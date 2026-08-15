import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

async function run(page, pattern, text) {
  await typeInto(page, '#regexInput', pattern);
  await typeInto(page, '#textInput', text);
}

test('matches are counted and listed', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, '\\d+', 'a1 bb22 ccc333');

  await expect(page.locator('#matchCount')).toHaveText(/3 matches/);
  await expect(page.locator('#matchList .match-item, #matchList li, #matchList > *')).not.toHaveCount(0);
});

test('the global flag controls whether every occurrence is found', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, 'a', 'aaa');

  await expect(page.locator('#matchCount')).toHaveText(/3 matches/);

  await page.locator('[data-flag="g"]').click();
  await expect(page.locator('#matchCount')).toHaveText(/1 match/);
});

test('the ignore-case flag changes what matches', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, 'abc', 'ABC abc');

  await expect(page.locator('#matchCount')).toHaveText(/1 match/);

  await page.locator('[data-flag="i"]').click();
  await expect(page.locator('#matchCount')).toHaveText(/2 matches/);
});

test('multiline and dotall flags behave as documented', async ({ page }) => {
  await openTool(page, 'regex-tester');

  await run(page, '^b', 'a\nb');
  await expect(page.locator('#matchCount')).toHaveText(/0 matches/);
  await page.locator('[data-flag="m"]').click();
  await expect(page.locator('#matchCount')).toHaveText(/1 match/);

  await run(page, 'a.b', 'a\nb');
  await expect(page.locator('#matchCount')).toHaveText(/0 matches/);
  await page.locator('[data-flag="s"]').click();
  await expect(page.locator('#matchCount')).toHaveText(/1 match/);
});

test('an invalid pattern reports an error instead of throwing', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, '([unclosed', 'anything');

  await expect(page.locator('#regexError')).not.toBeEmpty();
  await expect(page.locator('#regexInputWrap')).toHaveClass(/has-error/);

  // Recovering the pattern clears the error.
  await typeInto(page, '#regexInput', '[unclosed]');
  await expect(page.locator('#regexInputWrap')).not.toHaveClass(/has-error/);
});

test('capture groups feed the output template', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, '(\\w+)@(\\w+)\\.com', 'ada@example.com grace@test.com');

  await typeInto(page, '#outputTemplate', '$1 at $2\\n');
  await expect(page.locator('#outputList')).toContainText('ada at example');
  await expect(page.locator('#outputList')).toContainText('grace at test');
});

test('named groups are available to the template', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, '(?<year>\\d{4})-(?<month>\\d{2})', '2024-05 2025-11');

  await typeInto(page, '#outputTemplate', '$<month>/$<year>\\n');
  await expect(page.locator('#outputList')).toContainText('05/2024');
  await expect(page.locator('#outputList')).toContainText('11/2025');
});

test('the output meta reports how many items were produced', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, '\\d', '1 2 3 4');

  await expect(page.locator('#outputMeta')).toHaveText(/4 items/);
});

test('a catastrophic pattern is interrupted rather than freezing the page', async ({ page }) => {
  await openTool(page, 'regex-tester');

  await run(page, '(a+)+$', `${'a'.repeat(40)}b`);
  // The worker is terminated and the UI stays responsive.
  await expect(page.locator('#matchCount')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#regexInput')).toBeEditable();
});

test('match navigation moves between hits', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await run(page, '\\d+', 'a1 b2 c3');

  await expect(page.locator('#matchCount')).toHaveText(/3 matches/);
  await page.locator('#nextMatchBtn').click();
  await expect(page.locator('#matchCount')).toContainText(/of 3|3 matches/);
  await page.locator('#prevMatchBtn').click();
  await expect(page.locator('#matchCount')).toBeVisible();
});

test('the sample populates a working pattern, text, and template', async ({ page }) => {
  await openTool(page, 'regex-tester');

  await page.locator('#sampleBtn').click();
  await expect(page.locator('#regexInput')).not.toHaveValue('');
  await expect(page.locator('#textInput')).not.toHaveValue('');
  await expect(page.locator('#matchCount')).not.toHaveText(/0 matches/);
});

test('clear empties the inputs', async ({ page }) => {
  await openTool(page, 'regex-tester');
  await page.locator('#sampleBtn').click();
  await expect(page.locator('#regexInput')).not.toHaveValue('');

  await page.locator('#clearBtn').click();
  await expect(page.locator('#regexInput')).toHaveValue('');
  await expect(page.locator('#textInput')).toHaveValue('');
});

test('paste fills the pattern and copy exports the output', async ({ page }) => {
  await openTool(page, 'regex-tester');

  await setClipboardText(page, '\\w+');
  await page.locator('#pasteRegexBtn').click();
  await expect(page.locator('#regexInput')).toHaveValue('\\w+');

  await typeInto(page, '#textInput', 'one two');
  await page.locator('#copyOutputBtn').click();
  expect(await lastCopied(page)).toBeTruthy();
});

test('the cheat sheet modal opens and closes', async ({ page }) => {
  await openTool(page, 'regex-tester');

  await page.locator('#openCheatSheetBtn').click();
  await expect(page.locator('#cheatSheetModal')).toBeVisible();

  await page.locator('#closeCheatSheetBtn').click();
  await expect(page.locator('#cheatSheetModal')).toBeHidden();
});
