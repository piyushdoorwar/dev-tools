import { expect, test } from '@playwright/test';
import { lastCopied, openTool } from '../helpers.js';

const TOOL = 'git-cheatsheet';

const rows = (page) => page.locator('.task-row');
const row = (page, title) => page.locator('.task-row').filter({ has: page.locator('.task-title', { hasText: title }) });
const line = (page, command) => page.locator(`.cmd-line[data-command=${JSON.stringify(command)}]`);
const count = (page) => page.locator('#result-count');

async function pickCategory(page, id) {
  await page.click('#category-dd .dd__trigger');
  await page.click(`#category-dd .dd__option[data-value="${id}"]`);
}

test('opens on every task, grouped by category, with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, TOOL);

  await expect(page.locator('h1.app-title')).toHaveText('Git Cheatsheet');
  await expect(page.locator('.app-subtitle')).toHaveCount(0);
  await expect(count(page)).toHaveText(/^(\d+) of \1 tasks$/);
  await expect(page.locator('#panel-title')).toHaveText('All tasks');

  const titles = await page.locator('.section-title').evaluateAll((nodes) =>
    nodes.map((node) => node.firstChild.textContent));
  expect(titles).toEqual(expect.arrayContaining(['Setup & config', 'Stash', 'Recovery', 'Cleanup']));
  expect(titles.length).toBeGreaterThanOrEqual(10);
  expect(await rows(page).count()).toBeGreaterThanOrEqual(50);
  expect(errors).toEqual([]);
});

test('the task data is complete and consistent', async ({ page }) => {
  await openTool(page, TOOL);

  const report = await page.evaluate(() => {
    const problems = [];
    const titles = new Set();
    let total = 0;
    for (const category of globalThis.GIT_CATEGORIES) {
      if (!category.id || !category.title || !category.tasks.length) problems.push(`category ${category.id}`);
      for (const task of category.tasks) {
        total += 1;
        if (!task.title || !task.text) problems.push(`${task.title}: missing text`);
        if (!Array.isArray(task.commands) || !task.commands.length) problems.push(`${task.title}: no commands`);
        if (task.commands.some((command) => !command.startsWith('git ') && !command.startsWith('echo '))) {
          problems.push(`${task.title}: unexpected command`);
        }
        for (const level of task.danger || []) {
          if (!globalThis.GIT_DANGER[level]) problems.push(`${task.title}: unknown danger ${level}`);
        }
        if (titles.has(task.title)) problems.push(`${task.title}: duplicate`);
        titles.add(task.title);
      }
    }
    return { problems, total, categories: globalThis.GIT_CATEGORIES.length };
  });

  expect(report.problems).toEqual([]);
  expect(report.total).toBeGreaterThanOrEqual(50);
  expect(report.total).toBeLessThanOrEqual(75);
  expect(report.categories).toBeGreaterThanOrEqual(10);
});

test('search matches every term in any order across title, command, notes and category', async ({ page }) => {
  await openTool(page, TOOL);
  const total = Number((await count(page).textContent()).split(' ')[0]);

  await page.fill('#search', 'untracked stash');
  await expect(line(page, 'git stash push -u -m "work in progress"')).toBeVisible();
  const forward = await rows(page).count();
  expect(forward).toBeGreaterThan(0);
  expect(forward).toBeLessThan(total);
  await expect(count(page)).toHaveText(`${forward} of ${total} tasks`);

  await page.fill('#search', 'stash untracked');
  await expect(rows(page)).toHaveCount(forward);

  // A term found only in a note: the legacy spelling points at the modern task.
  await page.fill('#search', 'checkout -b');
  await expect(row(page, 'Create a branch and switch to it')).toBeVisible();

  // A term found only in the category label.
  await page.fill('#search', 'recovery reflog');
  await expect(row(page, 'Find lost commits')).toBeVisible();
  await expect(row(page, 'Force-delete an unmerged branch')).toHaveCount(0);

  // Terms must all match: one unknown word empties the list.
  await page.fill('#search', 'stash qwertyuiop');
  await expect(rows(page)).toHaveCount(0);

  await page.fill('#search', '');
  await expect(rows(page)).toHaveCount(total);
});

test('detached HEAD search finds the rescue command and copies exactly it', async ({ page }) => {
  await openTool(page, TOOL);

  await page.fill('#search', 'detached');
  await expect(page.locator('#sections')).toContainText('git switch -c rescue-work');
  await line(page, 'git switch -c rescue-work').locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git switch -c rescue-work');
  await expect(page.locator('#toast-container')).toContainText('Command copied');
});

test('each line of a multi-step task copies on its own', async ({ page }) => {
  await openTool(page, TOOL);

  const task = row(page, 'Rebase your branch onto the latest main');
  await expect(task.locator('.cmd-line')).toHaveCount(2);
  await task.locator('.cmd-line').nth(1).locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git rebase origin/main');
  await task.locator('.cmd-line').nth(0).locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git fetch origin');
});

test('discard surfaces tasks flagged as destructive', async ({ page }) => {
  await openTool(page, TOOL);

  await page.fill('#search', 'discard');
  const discard = row(page, 'Discard changes to a file');
  await expect(discard).toBeVisible();
  const badge = discard.locator('.danger-badge');
  await expect(badge).toHaveCount(1);
  expect(await badge.textContent()).toBe('Discards work');
  await expect(badge).toHaveClass(/\berror\b/);
});

test('danger badges mark history rewrites and data loss', async ({ page }) => {
  await openTool(page, TOOL);

  const push = row(page, 'Force-push after a rebase, safely').locator('.danger-badge');
  expect(await push.allTextContents()).toEqual(['Rewrites history']);
  await expect(push).toHaveClass(/\bwarning\b/);

  const hard = row(page, 'Throw away the last commit entirely').locator('.danger-badge');
  expect(await hard.allTextContents()).toEqual(['Rewrites history', 'Discards work']);

  // Additive commands carry no badge.
  await expect(row(page, 'Undo a commit that is already pushed').locator('.danger-badge')).toHaveCount(0);

  // Every flagged task renders a badge per level, and nothing else does.
  const mismatch = await page.evaluate(() => [...document.querySelectorAll('.task-row')]
    .filter((node) => (node.dataset.danger || '').split(' ').filter(Boolean).length
      !== node.querySelectorAll('.danger-badge').length)
    .map((node) => node.querySelector('.task-title').textContent));
  expect(mismatch).toEqual([]);

  // The badge label is searchable.
  await page.fill('#search', 'rewrites history');
  await expect(row(page, 'Amend the last commit')).toBeVisible();
  await expect(row(page, 'Stage a file')).toHaveCount(0);
});

test('category filter narrows the list and stays in the hash', async ({ page }) => {
  await openTool(page, TOOL);
  const total = Number((await count(page).textContent()).split(' ')[0]);

  await pickCategory(page, 'stash');
  await expect(page).toHaveURL(/#stash$/);
  await expect(page.locator('#category-dd .dd__value')).toHaveText('Stash');
  await expect(page.locator('#panel-title')).toHaveText('Stash');
  await expect(page.locator('.task-section')).toHaveCount(1);
  await expect(page.locator('.task-section')).toHaveAttribute('data-section', 'stash');
  const stashCount = await rows(page).count();
  await expect(count(page)).toHaveText(`${stashCount} of ${total} tasks`);

  // Search applies inside the chosen category.
  await page.fill('#search', 'drop');
  await expect(row(page, 'Delete one stash')).toBeVisible();
  await expect(page.locator('[data-section="branches"]')).toHaveCount(0);

  // Deep links and unknown values.
  await page.goto('/tools/git-cheatsheet/#rebase');
  await expect(page.locator('.task-section')).toHaveCount(1);
  await expect(page.locator('.task-section')).toHaveAttribute('data-section', 'rebase');
  await expect(page.locator('#category-dd .dd__value')).toHaveText('Rebase & history');

  await page.evaluate(() => { location.hash = 'recovery'; });
  await expect(page.locator('.task-section')).toHaveAttribute('data-section', 'recovery');

  await page.fill('#search', '');
  await page.goto('/tools/git-cheatsheet/#nonsense');
  await expect(count(page)).toHaveText(`${total} of ${total} tasks`);
  await expect(page.locator('#category-dd .dd__value')).toHaveText('All categories');

  await pickCategory(page, 'tags');
  await pickCategory(page, 'all');
  await expect(page).not.toHaveURL(/#/);
  await expect(count(page)).toHaveText(`${total} of ${total} tasks`);
});

test('the category menu is keyboard operable', async ({ page }) => {
  await openTool(page, TOOL);

  await page.focus('#category-dd .dd__trigger');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#category-dd .dd__value')).toHaveText('Setup & config');
  await expect(page).toHaveURL(/#setup$/);
});

test('placeholders render as chips and fill into commands and copies', async ({ page }) => {
  await openTool(page, TOOL);

  const create = line(page, 'git switch -c <branch>');
  await expect(create.locator('.ph')).toHaveText('<branch>');
  await expect(create.locator('.ph')).not.toHaveClass(/is-filled/);

  // Unfilled placeholders copy as written.
  await create.locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git switch -c <branch>');

  await page.fill('#fill-branch', 'feature/login');
  await page.fill('#fill-file', 'src/app.js');
  await expect(create.locator('.ph')).toHaveText('feature/login');
  await expect(create.locator('.ph')).toHaveClass(/is-filled/);
  await expect(create.locator('.ph')).toHaveAttribute('title', '<branch>');

  await create.locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git switch -c feature/login');

  await line(page, 'git restore -- <file>').locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git restore -- src/app.js');

  // Several placeholders in one line; the unfillable one stays as written.
  await page.fill('#fill-commit', 'a1b2c3d');
  await line(page, 'git restore --source=<commit> -- <file>').locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git restore --source=a1b2c3d -- src/app.js');
  await line(page, 'git clone <url>').locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git clone <url>');

  // Search still runs over the original text.
  await page.fill('#search', 'switch -c <branch>');
  await expect(row(page, 'Create a branch and switch to it')).toBeVisible();
  await page.fill('#search', '');

  await page.click('#fill-clear');
  await expect(page.locator('#fill-branch')).toHaveValue('');
  await expect(create.locator('.ph')).toHaveText('<branch>');
  await expect(page.locator('#fill-clear')).toBeDisabled();
  await create.locator('.cmd-copy').click();
  expect(await lastCopied(page)).toBe('git switch -c <branch>');
});

test('invalid branch names are flagged inline', async ({ page }) => {
  await openTool(page, TOOL);

  await page.fill('#fill-branch', 'my branch');
  await expect(page.locator('#fill-branch')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#fill-status')).toHaveClass(/\berror\b/);
  await expect(page.locator('#fill-status')).toContainText('spaces');

  await page.fill('#fill-branch', 'my-branch');
  await expect(page.locator('#fill-branch')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#fill-status')).not.toHaveClass(/\berror\b/);
});

test('the empty state is built as text and offers a way out', async ({ page }) => {
  await openTool(page, TOOL);
  const total = Number((await count(page).textContent()).split(' ')[0]);

  const hostile = '<img src=x onerror=alert(1)>';
  await page.fill('#search', hostile);
  await expect(rows(page)).toHaveCount(0);
  await expect(count(page)).toHaveText(`0 of ${total} tasks`);
  await expect(page.locator('#empty-state')).toContainText(`No task matches “${hostile}”.`);
  await expect(page.locator('#sections img')).toHaveCount(0);
  await expect(page.locator('#search-all')).toHaveCount(0);

  // A match hidden by the category filter offers to widen the search.
  await page.fill('#search', 'reflog');
  await pickCategory(page, 'tags');
  await expect(page.locator('#empty-state')).toContainText('in Tags');
  await page.click('#search-all');
  await expect(page.locator('#category-dd .dd__value')).toHaveText('All categories');
  await expect(row(page, 'Find lost commits')).toBeVisible();
});

test('help explains badges, placeholders and shared history', async ({ page }) => {
  await openTool(page, TOOL);

  await page.click('#helpBtn');
  const modal = page.locator('#helpModal');
  await expect(modal).toHaveClass(/is-open/);
  await expect(modal).toContainText('Rewrites history');
  await expect(modal).toContainText('Discards work');
  await expect(modal).toContainText('Placeholders');
  await expect(modal).toContainText('Never rewrite pushed, shared history');
  await expect(modal).toContainText('git revert');
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/is-open/);
});

test('fits a 390px screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await openTool(page, TOOL);

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.fill('#fill-file', 'a/very/long/path/to/some/deeply/nested/component/file-name.test.js');
  await page.fill('#fill-branch', 'feature/an-unreasonably-long-branch-name-for-testing');
  expect(await overflow()).toBeLessThanOrEqual(0);

  await pickCategory(page, 'recovery');
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
