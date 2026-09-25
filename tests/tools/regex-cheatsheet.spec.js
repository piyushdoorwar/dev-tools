import { expect, test } from '@playwright/test';
import { lastCopied, openTool } from '../helpers.js';

const card = (page, id) => page.locator(`.pattern-card[data-pattern="${id}"]`);

test('opens on the syntax reference with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'regex-cheatsheet');

  await expect(page.locator('#syntax-panel')).toBeVisible();
  await expect(page.locator('#patterns-panel')).toBeHidden();
  expect(await page.locator('.syntax-row').count()).toBeGreaterThan(40);
  await expect(page.locator('#result-count')).toHaveText(/^\d+ of \d+ rows$/);
  expect(errors).toEqual([]);
});

test('every library pattern matches its own samples and rejects the rest', async ({ page }) => {
  // The whole promise of the library is that a copied pattern behaves as the
  // card claims, so assert it against the samples the card displays.
  await openTool(page, 'regex-cheatsheet');

  const failures = await page.evaluate(() => {
    const problems = [];
    for (const entry of globalThis.REGEX_PATTERNS) {
      let regex;
      try {
        regex = new RegExp(entry.pattern, entry.flags);
      } catch (error) {
        problems.push(`${entry.id}: does not compile — ${error.message}`);
        continue;
      }
      if (!entry.good.length || !entry.bad.length) problems.push(`${entry.id}: needs both good and bad samples`);
      for (const sample of entry.good) {
        regex.lastIndex = 0;
        if (!regex.test(sample)) problems.push(`${entry.id}: should match ${JSON.stringify(sample)}`);
      }
      for (const sample of entry.bad) {
        regex.lastIndex = 0;
        if (regex.test(sample)) problems.push(`${entry.id}: should not match ${JSON.stringify(sample)}`);
      }
    }
    return problems;
  });

  expect(failures).toEqual([]);
});

test('the pattern library has unique ids and complete cards', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');

  const report = await page.evaluate(() => {
    const entries = globalThis.REGEX_PATTERNS;
    return {
      total: entries.length,
      duplicates: entries.length - new Set(entries.map((entry) => entry.id)).size,
      incomplete: entries.filter((entry) => !entry.name || !entry.category || !entry.description).map((entry) => entry.id),
      sections: globalThis.REGEX_CHEATSHEET.length,
      emptyRows: globalThis.REGEX_CHEATSHEET.filter((section) => !section.rows.length).map((section) => section.id),
    };
  });

  expect(report.duplicates).toBe(0);
  expect(report.incomplete).toEqual([]);
  expect(report.emptyRows).toEqual([]);
  expect(report.total).toBeGreaterThan(30);
  expect(report.sections).toBeGreaterThan(5);
});

test('the tabs and the hash stay in step', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');

  await page.click('#tab-patterns');
  await expect(page).toHaveURL(/#patterns$/);
  await expect(page.locator('#patterns-panel')).toBeVisible();
  await expect(page).toHaveTitle(/Patterns Library/);
  await expect(page.locator('#result-count')).toHaveText(/patterns$/);

  await page.goto('/tools/regex-cheatsheet/#patterns');
  await expect(page.locator('#patterns-panel')).toBeVisible();
  await expect(page.locator('#tab-patterns')).toHaveClass(/active/);
});

test('search filters the syntax rows by token, meaning and example', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');
  const search = page.locator('#search');

  await search.fill('lookbehind');
  const rows = page.locator('.syntax-row');
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(page.locator('.syntax-section')).toHaveCount(1);

  // Terms may appear in any order and in different words.
  await search.fill('lazy quantifier');
  await expect(page.locator('.syntax-row')).toHaveCount(1);
  await expect(page.locator('.syntax-token')).toHaveText('*?  +?  ??  {n,m}?');

  // "backtracking" is named in both the catastrophic-backtracking trap and the
  // escaping one, so match on content rather than a count.
  await search.fill('backtracking');
  await expect(page.locator('.syntax-row', { hasText: 'exponential time' })).toHaveCount(1);

  await search.fill('qqqqq');
  await expect(page.locator('#sections')).toContainText('Nothing in the syntax reference matches');
  await expect(page.locator('#result-count')).toHaveText(/^0 of \d+ rows$/);
});

test('search filters the pattern library too', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');
  await page.click('#tab-patterns');

  await page.fill('#search', 'uuid');
  await expect(page.locator('.pattern-card')).toHaveCount(1);
  await expect(page.locator('.pattern-name')).toContainText('UUID');

  // Searching the prose finds patterns whose name does not contain the term.
  await page.fill('#search', 'snake_case');
  await expect(card(page, 'camel-to-snake')).toBeVisible();

  await page.fill('#search', 'qqqqq');
  await expect(page.locator('#pattern-list')).toContainText('No pattern matches');
});

test('a pattern card shows the literal, its samples and its caveat', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');
  await page.click('#tab-patterns');

  const email = card(page, 'email');
  await expect(email.locator('.pattern-literal')).toHaveText('/^[^\\s@]+@[^\\s@.]+\\.[^\\s@]{2,}$/');
  await expect(email.locator('.sample--good').first()).toContainText('dev@example.com');
  await expect(email.locator('.sample--bad').first()).toContainText('no-at-sign.com');
  // The honest caveat matters more than the pattern here.
  await expect(email.locator('.pattern-note')).toContainText('No regex validates email correctly');
});

test('copy gives the raw pattern and the JavaScript literal', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');
  await page.click('#tab-patterns');

  const slug = card(page, 'slug');
  await slug.getByRole('button', { name: 'Copy pattern' }).click();
  expect(await lastCopied(page)).toBe('^[a-z0-9]+(?:-[a-z0-9]+)*$');

  await slug.getByRole('button', { name: 'Copy as /…/' }).click();
  expect(await lastCopied(page)).toBe('/^[a-z0-9]+(?:-[a-z0-9]+)*$/');

  // Syntax rows copy their token.
  await page.click('#tab-syntax');
  await page.locator('.syntax-row').first().hover();
  await page.locator('.syntax-row').first().locator('.syntax-copy').click();
  expect(await lastCopied(page)).toBe('.');
});

test('"Test it" hands the pattern, flags and samples to the tester', async ({ page }) => {
  // Standalone (not inside the dashboard) the handover is a plain navigation.
  await openTool(page, 'regex-cheatsheet');
  await page.click('#tab-patterns');
  await card(page, 'iso-date').getByRole('button', { name: 'Test it' }).click();

  await expect(page).toHaveURL(/\/tools\/regex-tester\/#pattern=/);
  await expect(page.locator('#regexInput')).toHaveValue('^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$');
  await expect(page.locator('#textInput')).toHaveValue(/2026-09-21/);
  await expect(page.locator('.toast')).toContainText('Pattern loaded from the cheat sheet');

  // And the tester actually matched the samples it was handed.
  await expect(page.locator('#matchCount')).not.toHaveText('0');
});

test('flags travel with the pattern', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');
  await page.click('#tab-patterns');
  await card(page, 'duplicate-word').getByRole('button', { name: 'Test it' }).click();

  await expect(page.locator('#regexInput')).toHaveValue('\\b(\\w+)\\s+\\1\\b');
  await expect(page.locator('.flag-btn[data-flag="g"]')).toHaveClass(/active/);
  await expect(page.locator('.flag-btn[data-flag="i"]')).toHaveClass(/active/);
  await expect(page.locator('.flag-btn[data-flag="m"]')).not.toHaveClass(/active/);
});

test('the tester links back to the full cheat sheet', async ({ page }) => {
  await openTool(page, 'regex-tester');

  await page.click('#openCheatSheetBtn');
  await expect(page.locator('#cheatSheetModal')).toHaveClass(/is-open|active/);
  await page.click('#openFullCheatSheetBtn');

  await expect(page).toHaveURL(/\/tools\/regex-cheatsheet\/$/);
  await expect(page.locator('h1')).toHaveText('Regex Cheat Sheet');
});

test('the dashboard opens the tester in place when a tool asks it to', async ({ page }) => {
  // Inside the shell the handover must not navigate the top window: the
  // sidebar, the route and the frame all have to end up on the tester.
  await page.addInitScript(() => {
    window.__DEV_TOOLS_DISABLE_ANALYTICS__ = true;
    window.__DEV_TOOLS_DISABLE_SERVICE_WORKER__ = true;
  });
  await page.goto('/regex-cheatsheet/');
  await page.waitForLoadState('load');

  const frame = page.frameLocator('iframe[data-tool-id="regex-cheatsheet"]');
  await frame.locator('#tab-patterns').click();
  await frame.locator('.pattern-card[data-pattern="semver"]')
    .getByRole('button', { name: 'Test it' }).click();

  await expect(page).toHaveURL(/\/regex-tester\/$/);
  await expect(page.locator('iframe[data-tool-id="regex-tester"]')).toHaveClass(/is-visible/);
  await expect(page.locator('.menu__item[data-tool-id="regex-tester"]')).toHaveAttribute('aria-current', 'true');

  const tester = page.frameLocator('iframe[data-tool-id="regex-tester"]');
  await expect(tester.locator('#regexInput')).toHaveValue(/\(0\|\[1-9\]\\d\*\)/);
});

test('switching tabs replaces the history entry instead of pushing one', async ({ page }) => {
  await openTool(page, 'regex-cheatsheet');
  const before = await page.evaluate(() => history.length);

  await page.click('#tab-patterns');
  await page.click('#tab-syntax');
  await page.click('#tab-patterns');
  await expect(page).toHaveURL(/#patterns$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('on a wide screen pattern cards sit two to a row under full-width headings', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openTool(page, 'regex-cheatsheet');
  await page.click('#tab-patterns');

  const cards = page.locator('.pattern-card');
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x + first.width - 1);

  const heading = await page.locator('#pattern-list > .section-title').first().boundingBox();
  const list = await page.locator('#pattern-list').boundingBox();
  expect(heading.width).toBeGreaterThan(list.width - 2);
});
