import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, typeInto } from '../helpers.js';

const output = (page) => page.locator('#output-editor');

/** Every formatting option lives inside the settings modal. */
async function openSettings(page) {
  await page.locator('[data-tooltip="Settings"]').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/active/);
}

/** Pick a value on one of the segmented case controls. */
function caseButton(page, setting, value) {
  return page.locator(`.case-btn[data-setting="${setting}"][data-value="${value}"]`);
}

async function format(page, sql) {
  await typeInto(page, '#editor', sql);
  await expect(output(page)).not.toHaveValue('');
  return output(page).inputValue();
}

test('a flat query is expanded onto multiple lines', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  const result = await format(page, 'select id, name from users where id = 1 order by name');
  expect(result.split('\n').length).toBeGreaterThan(1);
  expect(result).toMatch(/FROM/i);
  expect(result).toMatch(/WHERE/i);
});

test('keyword casing follows the setting', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  await format(page, 'select id from users');
  await openSettings(page);

  await caseButton(page, 'keywordCase', 'upper').click();
  await expect.poll(() => output(page).inputValue()).toContain('SELECT');

  await caseButton(page, 'keywordCase', 'lower').click();
  await expect.poll(() => output(page).inputValue()).toContain('select');
});

test('identifier casing is configurable independently of keywords', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  await format(page, 'select MyColumn from MyTable');
  await openSettings(page);

  await caseButton(page, 'identifiersCase', 'lower').click();
  await expect.poll(() => output(page).inputValue()).toContain('mycolumn');

  await caseButton(page, 'identifiersCase', 'upper').click();
  await expect.poll(() => output(page).inputValue()).toContain('MYCOLUMN');
});

test('minify collapses the query onto one line', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  await format(page, 'select id,\n name\nfrom users\nwhere id = 1');
  await openSettings(page);

  await page.locator('#minify').check({ force: true });
  await page.locator('#minify').dispatchEvent('change');

  await expect.poll(async () => (await output(page).inputValue()).trim().split('\n').length).toBe(1);
});

test('comments can be stripped', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  const withComment = 'select id -- keep me\nfrom users';

  expect(await format(page, withComment)).toContain('keep me');
  await openSettings(page);

  await page.locator('#removeComments').check({ force: true });
  await page.locator('#removeComments').dispatchEvent('change');
  await expect.poll(async () => output(page).inputValue()).not.toContain('keep me');
});

test('the dialect is detected from the syntax used', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  const detected = await page.evaluate(() => ({
    tsql: detectDialect('SELECT [id] FROM [users]'),
    tsqlVar: detectDialect('SELECT @count'),
    mysql: detectDialect('SELECT `id` FROM `users`'),
    postgres: detectDialect('SELECT id FROM users WHERE name ILIKE \'a%\''),
    plain: detectDialect('SELECT id FROM users'),
  }));

  expect(detected).toEqual({
    tsql: 'tsql',
    tsqlVar: 'tsql',
    mysql: 'mysql',
    postgres: 'postgresql',
    plain: 'sql',
  });
});

test('the detected dialect is shown in the toolbar', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  await format(page, 'SELECT `id` FROM `users`');
  await expect(page.locator('#sql-type-hint')).toContainText(/MYSQL/i);
});

test('the sample loads and formats', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  await page.locator('[data-tooltip="Load sample SQL"]').click();
  await expect(page.locator('#editor')).not.toHaveValue('');
  await expect(output(page)).not.toHaveValue('');
});

test('invalid SQL does not wipe the editor', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  await typeInto(page, '#editor', 'SELECT FROM WHERE ((((');
  await expect(page.locator('#editor')).toHaveValue('SELECT FROM WHERE ((((');
});

test('undo and redo step through the editor history', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  // History entries are debounced by 500ms, so let each edit settle.
  await typeInto(page, '#editor', 'select 1');
  await page.waitForTimeout(700);
  await typeInto(page, '#editor', 'select 2');
  await page.waitForTimeout(700);
  await expect(page.locator('#editor')).toHaveValue('select 2');

  await page.locator('[data-tooltip="Undo (Ctrl+Z)"]').click();
  await expect(page.locator('#editor')).toHaveValue('select 1');

  await page.locator('[data-tooltip="Redo (Ctrl+Y)"]').click();
  await expect(page.locator('#editor')).toHaveValue('select 2');
});

test('copy and download deliver the formatted SQL', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  const formatted = await format(page, 'select id from users');

  await page.locator('[data-tooltip="Copy formatted SQL"]').click();
  expect(await lastCopied(page)).toBe(formatted);

  const download = await captureDownload(
    page,
    () => page.locator('[data-tooltip="Download formatted SQL"]').click(),
  );
  expect(await downloadText(download)).toContain('users');
});

test('line numbers track both editors', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  await format(page, 'select 1\nunion all\nselect 2');

  await expect.poll(() => page.locator('#line-numbers').innerText())
    .toMatch(/1[\s\S]*2[\s\S]*3/);
  await expect.poll(() => page.locator('#output-line-numbers').innerText()).toMatch(/1/);
});

test('the settings modal opens and closes', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  await page.locator('[data-tooltip="Settings"]').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/active/);

  await page.locator('#settingsModal .modal-close').click();
  await expect(page.locator('#settingsModal')).not.toHaveClass(/active/);
});
