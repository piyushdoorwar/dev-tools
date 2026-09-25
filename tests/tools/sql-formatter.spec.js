import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, typeInto } from '../helpers.js';

const output = (page) => page.locator('#output-editor');

/** Every formatting option lives inside the settings modal. */
async function openSettings(page) {
  await page.locator('[data-tooltip="Settings"]').click();
  await expect(page.locator('#settingsModal')).toHaveClass(/is-open/);
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

test('a PostgreSQL cast is formatted instead of failing as PL/SQL', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  expect(await page.evaluate(() => detectDialect('SELECT id::text FROM users'))).toBe('postgresql');
  const result = await format(page, 'select id::text, name from users');
  expect(result).not.toMatch(/Formatting error/);
  expect(result).toContain('id::text');
  // A real Oracle bind variable is still recognised.
  expect(await page.evaluate(() => detectDialect('SELECT a FROM t WHERE x = :id'))).toBe('plsql');
});

test('sigils inside strings and comments do not pick the dialect', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  const detected = await page.evaluate(() => ({
    email: detectDialect("SELECT * FROM users WHERE email = 'bob@example.com'"),
    time: detectDialect("SELECT * FROM t WHERE note = 'at:noon'"),
    comment: detectDialect('SELECT a FROM t -- ping @ops'),
  }));
  expect(detected).toEqual({ email: 'sql', time: 'sql', comment: 'sql' });
});

test('copying or downloading an empty editor says so instead of doing nothing', async ({ page }) => {
  await openTool(page, 'sql-formatter');

  await page.locator('[data-tooltip="Copy formatted SQL"]').click();
  await expect(page.locator('#toast-container .toast-message')).toContainText(/nothing to copy/i);
  expect(await lastCopied(page)).toBeNull();

  await page.locator('[data-tooltip="Download formatted SQL"]').click();
  await expect(page.locator('#toast-container .toast-message').last()).toContainText(/nothing to download/i);
});

test('a successful copy is acknowledged', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  await format(page, 'select id from users');

  await page.locator('[data-tooltip="Copy formatted SQL"]').click();
  await expect(page.locator('#toast-container .toast-message')).toContainText(/copied/i);
});

test('long input lines scroll instead of wrapping, so the gutter stays aligned', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  await typeInto(page, '#editor', `SELECT ${'column_name_that_is_long, '.repeat(20)}x FROM t`);

  const editor = await page.locator('#editor').evaluate((node) => ({
    whiteSpace: getComputedStyle(node).whiteSpace,
    scrolls: node.scrollWidth > node.clientWidth,
  }));
  expect(editor.whiteSpace).toBe('pre');
  expect(editor.scrolls).toBe(true);
});

test('stacked editors keep a fixed height and scroll on their own at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'sql-formatter');
  await page.locator('[data-tooltip="Load sample SQL"]').click();
  await expect(output(page)).not.toHaveValue('');

  const layout = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.workspace .panel')].map((panel) => panel.getBoundingClientRect().height);
    const input = document.getElementById('editor');
    input.scrollTop = 200;
    input.dispatchEvent(new Event('scroll'));
    return {
      panels,
      inputScrolls: input.scrollHeight > input.clientHeight,
      gutterSynced: Math.abs(document.getElementById('line-numbers').scrollTop - input.scrollTop) <= 1,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  layout.panels.forEach((height) => expect(height).toBeLessThan(812));
  expect(layout.inputScrolls).toBe(true);
  expect(layout.gutterSynced).toBe(true);
  expect(layout.overflow).toBe(false);
});

test('toolbar buttons have accessible names', async ({ page }) => {
  await openTool(page, 'sql-formatter');
  const unnamed = await page.locator('.toolbar-btn').evaluateAll((buttons) => buttons
    .filter((button) => !button.getAttribute('aria-label')).length);
  expect(unnamed).toBe(0);
  await expect(page.locator('#settingsModal .modal-close')).toHaveAttribute('aria-label', /close/i);
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
  await expect(page.locator('#settingsModal')).toHaveClass(/is-open/);

  await page.locator('#settingsModal .modal-close').click();
  await expect(page.locator('#settingsModal')).not.toHaveClass(/is-open/);
});
