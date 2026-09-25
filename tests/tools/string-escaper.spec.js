import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

const input = '#input-editor';
const output = '#output-editor';
const inputStatus = '#input-status .status-text';

async function selectMode(page, mode) {
  await page.click(`.mode-btn[data-mode="${mode}"]`);
}

async function selectDirection(page, direction) {
  await page.click(`[data-direction="${direction}"]`);
}

async function selectOption(page, option, value) {
  await page.click(`.segment[data-option="${option}"] [data-value="${value}"]`);
}

test('opens on the slug generator with a sample already converted', async ({ page }) => {
  const { errors } = await openTool(page, 'string-escaper');

  await expect(page.locator(output)).toHaveValue(
    'hello-world-creme-brulee-and-cafe-tips\n10-reasons-why-youll-love-strasse-names',
  );
  await expect(page.locator('#output-title')).toHaveText('Slug');
  await expect(page.locator('#direction-group')).toBeHidden();
  await expect(page.locator('#output-status .status-text')).toHaveText('Generated 2 slugs');
  expect(errors).toEqual([]);
});

test('slug options change the separator, case, and allowed letters', async ({ page }) => {
  await openTool(page, 'string-escaper');

  await typeInto(page, input, '  Ünïcode — Rocks!  ');
  await expect(page.locator(output)).toHaveValue('unicode-rocks');

  await selectOption(page, 'separator', '_');
  await selectOption(page, 'slugCase', 'keep');
  await expect(page.locator(output)).toHaveValue('Unicode_Rocks');

  await selectOption(page, 'separator', '-');
  await selectOption(page, 'slugCase', 'lower');
  await typeInto(page, input, 'Привет мир');
  await expect(page.locator(output)).toHaveValue('');
  await expect(page.locator(inputStatus)).toContainText('1 line had no usable letters');

  await selectOption(page, 'slugChars', 'unicode');
  await expect(page.locator(output)).toHaveValue('привет-мир');
});

test('max length trims slugs at a word boundary where it can', async ({ page }) => {
  await openTool(page, 'string-escaper');

  await typeInto(page, input, 'Hello World Creme Brulee\nSupercalifragilistic');
  await page.fill('#slug-max', '14');
  await expect(page.locator(output)).toHaveValue('hello-world\nsupercalifragi');

  await page.fill('#slug-max', '5');
  await expect(page.locator(output)).toHaveValue('hello\nsuper');

  await page.fill('#slug-max', '');
  await expect(page.locator(output)).toHaveValue('hello-world-creme-brulee\nsupercalifragilistic');
});

test('JSON escaping handles quotes, control characters, and optional \\u escapes', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'json');

  await typeInto(page, input, 'He said "hi"\n\tC:\\dev');
  await expect(page.locator(output)).toHaveValue('"He said \\"hi\\"\\n\\tC:\\\\dev"');

  await selectOption(page, 'quotes', 'off');
  await expect(page.locator(output)).toHaveValue('He said \\"hi\\"\\n\\tC:\\\\dev');

  await selectOption(page, 'jsonAscii', 'on');
  await typeInto(page, input, 'café 😀');
  await expect(page.locator(output)).toHaveValue('caf\\u00e9 \\ud83d\\ude00');
});

test('JSON unescaping accepts quoted or bare strings and explains bad input', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'json');
  await selectDirection(page, 'unescape');

  await expect(page.locator('.option-group:has([data-option="quotes"])')).toBeHidden();

  await typeInto(page, input, '"caf\\u00e9\\n\\"ok\\""');
  await expect(page.locator(output)).toHaveValue('café\n"ok"');

  await typeInto(page, input, 'a\\tb');
  await expect(page.locator(output)).toHaveValue('a\tb');

  await typeInto(page, input, 'say "hi"');
  await expect(page.locator(output)).toHaveValue('');
  await expect(page.locator(inputStatus)).toContainText('unescaped "');
  await expect(page.locator(input)).toHaveClass(/is-invalid/);

  await typeInto(page, input, 'bad \\q');
  await expect(page.locator(inputStatus)).toContainText('Not a valid JSON string');
});

test('SQL escaping follows the chosen dialect in both directions', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'sql');

  await typeInto(page, input, "It's a \\ test\n");
  await expect(page.locator(output)).toHaveValue("'It''s a \\ test\n'");

  await selectOption(page, 'sqlDialect', 'mysql');
  await expect(page.locator(output)).toHaveValue("'It\\'s a \\\\ test\\n'");

  await selectDirection(page, 'unescape');
  await typeInto(page, input, "'a\\tb\\%c''d'");
  await expect(page.locator(output)).toHaveValue("a\tb\\%c'd");

  await selectOption(page, 'sqlDialect', 'standard');
  await typeInto(page, input, "'O''Brien'");
  await expect(page.locator(output)).toHaveValue("O'Brien");

  await typeInto(page, input, "'O'Brien'");
  await expect(page.locator(output)).toHaveValue('');
  await expect(page.locator(inputStatus)).toContainText("Lone ' at position 2");
});

test('shell escaping offers single, double, and ANSI-C quoting', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'shell');

  await typeInto(page, input, "it's $HOME");
  await expect(page.locator(output)).toHaveValue("'it'\\''s $HOME'");

  await selectOption(page, 'shellStyle', 'double');
  await typeInto(page, input, 'say "hi" $USER `id` \\ now!');
  await expect(page.locator(output)).toHaveValue('"say \\"hi\\" \\$USER \\`id\\` \\\\ now!"');
  await expect(page.locator(inputStatus)).toContainText('history expansion');

  await selectOption(page, 'shellStyle', 'ansi');
  await typeInto(page, input, "a\nb'c\x01");
  await expect(page.locator(output)).toHaveValue("$'a\\nb\\'c\\x01'");
});

test('shell unescaping splits words without expanding variables', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'shell');
  await selectDirection(page, 'unescape');
  await page.click('[data-action="load-sample"]');

  await expect(page.locator(output)).toHaveValue("grep\n-r\nit's\n$HOME/My Docs\ntab\there");
  await expect(page.locator(inputStatus)).toHaveText('5 words, one per line · 1 expansion shown literally');

  await typeInto(page, input, "a\\ b 'c d' \"e\\\"f\" $'\\x41\\u00e9'");
  await expect(page.locator(output)).toHaveValue('a b\nc d\ne"f\nAé');

  await typeInto(page, input, "'unterminated");
  await expect(page.locator(output)).toHaveValue('');
  await expect(page.locator(inputStatus)).toContainText('Unterminated single quote');
});

test('regex escaping covers syntax characters and optionally the slash', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'regex');

  const text = 'a.b*c+d?(e)[f]{g}|h^i$j\\k/l-m';
  await typeInto(page, input, text);
  const escaped = await page.inputValue(output);
  expect(escaped).toBe('a\\.b\\*c\\+d\\?\\(e\\)\\[f\\]\\{g\\}\\|h\\^i\\$j\\\\k\\/l-m');
  // Valid under the strict `u` flag and matches the original text literally.
  expect(await page.evaluate(([pattern, source]) => new RegExp(`^${pattern}$`, 'u').test(source), [escaped, text])).toBe(true);

  await selectOption(page, 'regexSlash', 'off');
  await expect(page.locator(output)).toHaveValue('a\\.b\\*c\\+d\\?\\(e\\)\\[f\\]\\{g\\}\\|h\\^i\\$j\\\\k/l-m');

  await selectDirection(page, 'unescape');
  await typeInto(page, input, '\\$9\\.99 \\d+');
  await expect(page.locator(output)).toHaveValue('$9.99 \\d+');
  await expect(page.locator(inputStatus)).toContainText('1 escape like \\d has regex meaning');
});

test('HTML attribute escaping covers quotes and optionally whitespace', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'html-attr');

  await typeInto(page, input, 'Tom & "Jerry\'s" <b>\nnext');
  await expect(page.locator(output)).toHaveValue('"Tom &amp; &quot;Jerry&#39;s&quot; &lt;b&gt;\nnext"');

  await selectOption(page, 'attrWhitespace', 'encode');
  await selectOption(page, 'quotes', 'off');
  await expect(page.locator(output)).toHaveValue('Tom &amp; &quot;Jerry&#39;s&quot; &lt;b&gt;&#10;next');

  await selectDirection(page, 'unescape');
  await typeInto(page, input, "'it&#39;s &amp; &eacute; &bogus;'");
  await expect(page.locator(output)).toHaveValue("it's & é &bogus;");
  await expect(page.locator(inputStatus)).toContainText('1 unknown entity');
});

test('swap feeds the output back through the opposite direction', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'shell');

  await typeInto(page, input, "don't panic");
  const escaped = await page.inputValue(output);

  await page.click('[data-action="swap"]');
  await expect(page.locator('.segment-btn[data-direction="unescape"]')).toHaveClass(/active/);
  await expect(page.locator(input)).toHaveValue(escaped);
  await expect(page.locator(output)).toHaveValue("don't panic");
});

test('the mode is kept in the hash and restored on load', async ({ page }) => {
  await openTool(page, 'string-escaper');

  await selectMode(page, 'regex');
  await expect(page).toHaveURL(/#regex$/);

  await page.goto('/tools/string-escaper/#sql');
  await expect(page.locator('.mode-btn[data-mode="sql"]')).toHaveClass(/active/);

  await page.reload();
  await expect(page.locator('.mode-btn[data-mode="sql"]')).toHaveClass(/active/);
  await expect(page.locator('#output-title')).toHaveText('SQL Literal');

  // Switching to slug from unescape falls back to the only direction it has.
  await selectDirection(page, 'unescape');
  await selectMode(page, 'slug');
  await expect(page.locator('.segment-btn[data-direction="escape"]')).toHaveClass(/active/);
  await expect(page.locator('#input-title')).toHaveText('Plain Text');
});

test('copy, paste, clear, and download act on the right panel', async ({ page }) => {
  await openTool(page, 'string-escaper');
  await selectMode(page, 'json');

  await setClipboardText(page, 'a"b');
  await page.click('[data-action="paste-input"]');
  await expect(page.locator(input)).toHaveValue('a"b');
  await expect(page.locator(output)).toHaveValue('"a\\"b"');

  await page.click('[data-action="copy-output"]');
  expect(await lastCopied(page)).toBe('"a\\"b"');

  const download = await captureDownload(page, () => page.click('[data-action="download-output"]'));
  expect(download.suggestedFilename()).toBe('escaped.txt');
  expect(await downloadText(download)).toBe('"a\\"b"');

  await page.click('[data-action="clear-input"]');
  await expect(page.locator(input)).toHaveValue('');
  await expect(page.locator(output)).toHaveValue('');
});
