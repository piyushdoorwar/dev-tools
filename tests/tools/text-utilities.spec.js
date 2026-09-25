import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

const setInput = (page, value) => typeInto(page, '#input', value);
const stat = (page, key) => page.locator(`.stat-cell[data-stat="${key}"] .stat-cell-value`);

test('opens in clean mode with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'text-utilities');

  await expect(page.locator('#clean-panel')).toBeVisible();
  await expect(page.locator('#count-panel')).toBeHidden();
  await expect(page.locator('#lorem-panel')).toBeHidden();
  await expect(page.locator('#tab-clean')).toHaveClass(/active/);
  expect(errors).toEqual([]);
});

test('the mode tabs follow the URL hash in both directions', async ({ page }) => {
  await openTool(page, 'text-utilities');

  await page.click('#tab-count');
  await expect(page).toHaveURL(/#count$/);
  await expect(page.locator('#count-panel')).toBeVisible();
  await expect(page).toHaveTitle('Word, Character and Token Counter');

  await page.click('#tab-lorem');
  await expect(page.locator('#lorem-panel')).toBeVisible();
  await expect(page).toHaveTitle('Lorem Ipsum Generator');

  // A deep link — the route each catalog entry points at — lands on its mode.
  await page.goto('/tools/text-utilities/#count');
  await expect(page.locator('#count-panel')).toBeVisible();
  await expect(page.locator('#tab-count')).toHaveClass(/active/);
});

test('live counts track the input', async ({ page }) => {
  await openTool(page, 'text-utilities');

  await expect(page.locator('#chip-words')).toHaveText('0');
  await setInput(page, 'one two three\nfour five');

  await expect(page.locator('#chip-words')).toHaveText('5');
  await expect(page.locator('#chip-lines')).toHaveText('2');
  await expect(page.locator('#chip-chars')).toHaveText('23');
});

test('the count panel reports every statistic', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await page.click('#tab-count');
  await setInput(page, 'The cat sat. The cat ran!\n\nA second paragraph about the cat.');

  await expect(stat(page, 'words')).toHaveText('12');
  await expect(stat(page, 'uniqueWords')).toHaveText('8');
  await expect(stat(page, 'sentences')).toHaveText('3');
  await expect(stat(page, 'paragraphs')).toHaveText('2');
  await expect(stat(page, 'lines')).toHaveText('3');
  await expect(stat(page, 'charactersNoSpaces')).toHaveText('48');

  // "cat" and "the" both appear three times; ties are broken alphabetically.
  const top = page.locator('.frequency-row').first();
  await expect(top.locator('.frequency-word')).toHaveText('cat');
  await expect(top.locator('.frequency-count')).toContainText('3');
  await expect(page.locator('.frequency-row').nth(1).locator('.frequency-word')).toHaveText('the');
});

test('character counting is code-point based, not UTF-16 based', async ({ page }) => {
  await openTool(page, 'text-utilities');

  // A naive `.length` reports 2 for this emoji.
  await setInput(page, '🙂');
  await expect(page.locator('#chip-chars')).toHaveText('1');
});

test('the token estimate scales with the text and is never zero for words', async ({ page }) => {
  await openTool(page, 'text-utilities');

  // A short word is one token, as it is in a real byte-pair encoder.
  await setInput(page, 'hello');
  await expect(page.locator('#chip-tokens')).toHaveText('1');

  await setInput(page, 'hello world, this is a prompt.');
  const tokens = Number(await page.locator('#chip-tokens').textContent());
  const words = Number(await page.locator('#chip-words').textContent());
  expect(tokens).toBeGreaterThan(words);
  expect(tokens).toBeLessThan(words * 4);
});

test('reading and speaking time are derived from the word count', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await page.click('#tab-count');

  await setInput(page, Array.from({ length: 400 }, () => 'word').join(' '));
  await expect(stat(page, 'readingTime')).toHaveText('2 min');
  await expect(stat(page, 'speakingTime')).toContainText('3 min');
});

test('trim, empty-line and duplicate removal run in a fixed order', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, '  beta  \nalpha\n\nalpha\n  beta');

  // Trim is on by default, so the two "beta" lines are duplicates of each other.
  await expect(page.locator('#output')).toHaveValue('beta\nalpha\n\nalpha\nbeta');

  await page.check('#op-empty');
  await page.check('#op-dedupe');
  await expect(page.locator('#output')).toHaveValue('beta\nalpha');
  await expect(page.locator('#pipeline')).toHaveText(
    'Applied in order: Trim → Remove empty lines → Remove duplicates');
});

test('duplicate removal and sorting can ignore case', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'Beta\nbeta\nalpha');

  await page.check('#op-dedupe');
  await expect(page.locator('#output')).toHaveValue('Beta\nbeta\nalpha');

  await page.check('#op-ignore-case');
  await expect(page.locator('#output')).toHaveValue('Beta\nalpha');
});

test('every sort order rearranges the lines', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'pear\nfig\nbanana');

  const sortBy = async (value) => {
    await page.click('#sort-trigger');
    await page.click(`#sort-menu .dd__option[data-value="${value}"]`);
  };

  await sortBy('asc');
  await expect(page.locator('#output')).toHaveValue('banana\nfig\npear');

  await sortBy('desc');
  await expect(page.locator('#output')).toHaveValue('pear\nfig\nbanana');

  await sortBy('length-asc');
  await expect(page.locator('#output')).toHaveValue('fig\npear\nbanana');

  await sortBy('reverse');
  await expect(page.locator('#output')).toHaveValue('banana\nfig\npear');

  // Shuffle keeps every line, order aside.
  await sortBy('shuffle');
  const shuffled = (await page.locator('#output').inputValue()).split('\n').sort();
  expect(shuffled).toEqual(['banana', 'fig', 'pear']);
});

test('case conversion covers lower, upper, title and sentence', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'the QUICK brown fox. it jumped HIGH!');

  const caseBy = async (value) => {
    await page.click('#case-trigger');
    await page.click(`#case-menu .dd__option[data-value="${value}"]`);
  };

  await caseBy('upper');
  await expect(page.locator('#output')).toHaveValue('THE QUICK BROWN FOX. IT JUMPED HIGH!');

  await caseBy('lower');
  await expect(page.locator('#output')).toHaveValue('the quick brown fox. it jumped high!');

  await caseBy('title');
  await expect(page.locator('#output')).toHaveValue('The Quick Brown Fox. It Jumped High!');

  await caseBy('sentence');
  await expect(page.locator('#output')).toHaveValue('The quick brown fox. It jumped high!');
});

test('line numbering pads to a consistent width', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n'));

  await page.check('#op-number');
  const lines = (await page.locator('#output').inputValue()).split('\n');
  expect(lines[0]).toBe(' 1. line 0');
  expect(lines[9]).toBe('10. line 9');
});

test('collapsing repeated spaces leaves the line breaks alone', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'a    b\tc\nd     e');

  await page.check('#op-collapse');
  await expect(page.locator('#output')).toHaveValue('a b c\nd e');
});

test('the cleaned output can replace the input, copy and download', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'b\na\nb');
  await page.check('#op-dedupe');

  await page.click('[data-action="copy-output"]');
  expect(await lastCopied(page)).toBe('b\na');

  const download = await captureDownload(page, () => page.click('[data-action="download"]'));
  expect(await downloadText(download)).toBe('b\na');

  await page.click('[data-action="apply-to-input"]');
  await expect(page.locator('#input')).toHaveValue('b\na');
  await expect(page.locator('#chip-lines')).toHaveText('2');
});

test('generated lorem ipsum lands in the input and is counted', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await page.click('#tab-lorem');

  await page.fill('#lorem-count', '2');
  await page.click('[data-action="generate"]');

  const text = await page.locator('#input').inputValue();
  expect(text.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit')).toBe(true);
  expect(text.split(/\n\s*\n/)).toHaveLength(2);
  await expect(page.locator('#lorem-preview')).toContainText('Generated 2 paragraphs');
  expect(Number(await page.locator('#chip-words').textContent())).toBeGreaterThan(20);
});

test('lorem honours the unit, the count and the classic-opening switch', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await page.click('#tab-lorem');

  await page.click('#unit-trigger');
  await page.click('#unit-menu .dd__option[data-value="words"]');
  await page.fill('#lorem-count', '12');
  await page.click('[data-action="generate"]');
  await expect(page.locator('#chip-words')).toHaveText('12');

  await page.click('#unit-trigger');
  await page.click('#unit-menu .dd__option[data-value="list"]');
  await page.fill('#lorem-count', '5');
  await page.uncheck('#lorem-classic');
  await page.click('[data-action="generate"]');
  const lines = (await page.locator('#input').inputValue()).split('\n');
  expect(lines).toHaveLength(5);
  expect(lines.every((line) => line.trim().length > 0)).toBe(true);
  expect(lines[0].startsWith('Lorem ipsum dolor')).toBe(false);
});

test('lorem can append instead of replacing', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'Keep me.');
  await page.click('#tab-lorem');
  await page.check('#lorem-append');
  await page.fill('#lorem-count', '1');
  await page.click('[data-action="generate"]');

  const text = await page.locator('#input').inputValue();
  expect(text.startsWith('Keep me.')).toBe(true);
  expect(text.length).toBeGreaterThan('Keep me.'.length + 20);
});

test('an out-of-range lorem count is clamped rather than obeyed', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await page.click('#tab-lorem');

  await page.fill('#lorem-count', '900');
  await page.click('[data-action="generate"]');
  await expect(page.locator('#lorem-count')).toHaveValue('200');

  await page.fill('#lorem-count', '0');
  await page.click('[data-action="generate"]');
  await expect(page.locator('#lorem-count')).toHaveValue('1');
});

test('paste, sample, clear and the counts copy work together', async ({ page }) => {
  await openTool(page, 'text-utilities');

  await page.click('[data-action="sample"]');
  await expect(page.locator('#input')).toHaveValue(/the quick brown fox/);

  // The counts copy lives in the count panel.
  await page.click('#tab-count');
  await page.click('[data-action="copy-stats"]');
  const copied = await lastCopied(page);
  expect(copied).toContain('Words: ');
  expect(copied).toContain('Tokens (estimate): ');

  await setClipboardText(page, 'pasted text');
  await page.click('[data-action="paste"]');
  await expect(page.locator('#input')).toHaveValue('pasted text');

  await page.click('[data-action="clear"]');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#chip-words')).toHaveText('0');
  await expect(page.locator('#output')).toHaveValue('');
});

test('switching modes replaces the history entry instead of pushing one', async ({ page }) => {
  await openTool(page, 'text-utilities');
  const before = await page.evaluate(() => history.length);

  await page.click('#tab-count');
  await page.click('#tab-lorem');
  await page.click('#tab-clean');
  await expect(page).toHaveURL(/#clean$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('pasting an empty clipboard leaves the input untouched', async ({ page }) => {
  await openTool(page, 'text-utilities');
  await setInput(page, 'keep this');

  await setClipboardText(page, '');
  await page.click('[data-action="paste"]');
  await expect(page.locator('.toast')).toContainText('Clipboard is empty');
  await expect(page.locator('#input')).toHaveValue('keep this');
});

test('copying with nothing to copy warns instead of copying empty text', async ({ page }) => {
  await openTool(page, 'text-utilities');

  await page.click('[data-action="copy-output"]');
  await expect(page.locator('.toast')).toContainText('Nothing to copy');
  expect(await lastCopied(page)).toBeNull();
});
