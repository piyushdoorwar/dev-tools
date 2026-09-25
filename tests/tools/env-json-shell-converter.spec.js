import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText } from '../helpers.js';

const TOOL = 'env-json-shell-converter';
const outputJson = async (page) => JSON.parse(await page.locator('#output').inputValue());
const pick = (page, side, format) => page.locator(`.mode-btn[data-side="${side}"][data-format="${format}"]`).click();
const chooseDialect = async (page, label) => {
  await page.locator('.options-bar .dd__trigger').click();
  await page.locator('.options-bar .dd__option', { hasText: label }).click();
};

// Values that break naive quoting in every format at once.
const TRICKY = {
  PLAIN: 'production',
  SPACES: 'hello world',
  SINGLE: "it's",
  DOUBLE: 'say "hi"',
  DOLLAR: 'p@ss$word${HOME}',
  BACKSLASH: 'C:\\Users\\ada',
  HASH: 'a #not-a-comment',
  MULTILINE: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
  MIXED: "line 'one'\n$two \"three\" \\four",
  EMPTY: '',
  URL: 'postgres://app:secret@db:5432/app?sslmode=require',
};

test('.env → JSON handles comments, export, quoting, escapes, and inline comments with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, TOOL);

  await page.fill('#input', [
    '# comment',
    '',
    'export NODE_ENV=production',
    'PORT = 8080',
    "SINGLE='literal \\n $HOME'",
    'DOUBLE="tab\\there\\nnew \\"quoted\\""',
    'INLINE=value # trailing comment',
    'HASH="a # b"',
    'EMPTY=',
    'MULTI="line one',
    'line two"',
  ].join('\n'));

  expect(await outputJson(page)).toEqual({
    NODE_ENV: 'production',
    PORT: '8080',
    SINGLE: 'literal \\n $HOME',
    DOUBLE: 'tab\there\nnew "quoted"',
    INLINE: 'value',
    HASH: 'a # b',
    EMPTY: '',
    MULTI: 'line one\nline two',
  });
  await expect(page.locator('#input-status')).toHaveClass(/is-success/);
  await expect(page.locator('#input-status')).toContainText('8 variables');
  expect(errors).toEqual([]);
});

test('${VAR} references expand against earlier keys, and turning expansion off keeps them literal', async ({ page }) => {
  await openTool(page, TOOL);

  await page.fill('#input', [
    'USER=app',
    'HOST=db',
    'URL="postgres://${USER}@$HOST/app"',
    "RAW='${USER}'",
    'LEVEL=${LEVEL:-info}',
    'ESCAPED="\\$USER"',
    'MISSING=${NOPE}',
  ].join('\n'));

  expect(await outputJson(page)).toMatchObject({
    URL: 'postgres://app@db/app',
    RAW: '${USER}',
    LEVEL: 'info',
    ESCAPED: '$USER',
    MISSING: '',
  });
  await expect(page.locator('#input-status')).toHaveClass(/is-warning/);
  await expect(page.locator('#input-status')).toContainText('$NOPE');

  await page.locator('#expand-vars').uncheck();
  expect(await outputJson(page)).toMatchObject({
    URL: 'postgres://${USER}@$HOST/app',
    LEVEL: '${LEVEL:-info}',
    MISSING: '${NOPE}',
  });
});

test('.env errors name the line, and repeated keys keep the last value with a warning', async ({ page }) => {
  await openTool(page, TOOL);

  await page.fill('#input', 'A=1\nB="never closed\nC=3');
  await expect(page.locator('#input-status')).toHaveClass(/is-error/);
  await expect(page.locator('#input-status')).toContainText('Line 2: B has an unterminated " quote');
  await expect(page.locator('#output')).toHaveValue('');

  await page.fill('#input', 'A=1\nnot an assignment');
  await expect(page.locator('#input-status')).toContainText('Line 2: expected KEY=value');

  await page.fill('#input', 'A="x" junk');
  await expect(page.locator('#input-status')).toContainText('after the closing quote of A');

  await page.fill('#input', 'A=1\nB=2\nA=3');
  expect(await outputJson(page)).toEqual({ A: '3', B: '2' });
  await expect(page.locator('#input-status')).toContainText('1 repeated key (last value kept): A');
});

test('JSON → shell writes safely quoted Bash, fish, and PowerShell and skips invalid names', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'json');
  await pick(page, 'to', 'shell');

  await page.fill('#input', JSON.stringify({ A: 'plain', B: "it's here", C: '', 'my.key': 'x' }));
  await expect(page.locator('#output')).toHaveValue([
    'export A=plain',
    "export B='it'\\''s here'",
    "export C=''",
  ].join('\n'));
  await expect(page.locator('#output-status')).toHaveClass(/is-warning/);
  await expect(page.locator('#output-status')).toContainText('1 key skipped');

  await chooseDialect(page, 'fish');
  await expect(page.locator('#output')).toHaveValue([
    'set -gx A plain',
    "set -gx B 'it\\'s here'",
    "set -gx C ''",
  ].join('\n'));

  await chooseDialect(page, 'PowerShell');
  await expect(page.locator('#output')).toHaveValue([
    "$env:A = 'plain'",
    "$env:B = 'it''s here'",
    "$env:C = ''",
    "${env:my.key} = 'x'",
  ].join('\n'));
  await expect(page.locator('#output-status')).toHaveClass(/is-success/);
});

test('shell input understands export lists, declare -x, fish set, ANSI-C quotes, and skips other commands', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'shell');

  await page.fill('#input', [
    '#!/usr/bin/env bash',
    'export A=1 B="two words"',
    "declare -x C='single $literal'",
    'D=bare; export E=$D-suffix',
    "export F=$'line\\nbreak'",
    'set -gx G fish value',
    'export H="$(whoami)"',
    'echo "ignored"',
    'FOO=1 npm start',
    'export A',
    'export LONG=first\\',
    'second',
  ].join('\n'));

  expect(await outputJson(page)).toEqual({
    A: '1',
    B: 'two words',
    C: 'single $literal',
    D: 'bare',
    E: 'bare-suffix',
    F: 'line\nbreak',
    G: 'fish value',
    H: '$(whoami)',
    LONG: 'firstsecond',
  });
  await expect(page.locator('#input-status')).toContainText('2 lines skipped');
});

test('PowerShell $env: lines are read with their own quoting rules', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'shell');

  await page.fill('#input', [
    "$env:A = 'it''s'",
    '$env:B = "tab`tand `"quote`""',
    '${env:my.key} = "x"',
    '$env:C = "$env:A!"',
    '$env:D = 42',
  ].join('\n'));

  expect(await outputJson(page)).toEqual({ A: "it's", B: 'tab\tand "quote"', 'my.key': 'x', C: "it's!", D: '42' });
});

test('JSON input accepts objects and [{name, value}] lists and flattens values to strings', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'json');
  await pick(page, 'to', 'env');

  await page.fill('#input', JSON.stringify({ PORT: 8080, DEBUG: false, NONE: null, FLAGS: { a: 1 }, NOTE: 'two words', KEY: 'a\nb' }));
  await expect(page.locator('#output')).toHaveValue([
    'PORT=8080',
    'DEBUG=false',
    'NONE=',
    `FLAGS='{"a":1}'`,
    "NOTE='two words'",
    'KEY="a\\nb"',
  ].join('\n'));
  await expect(page.locator('#input-status')).toContainText('1 nested value written as JSON text');

  // Kubernetes container env / ECS task definition shape.
  await page.fill('#input', JSON.stringify([
    { name: 'A', value: '1' },
    { name: 'SECRET', valueFrom: { secretKeyRef: { name: 's', key: 'k' } } },
    { Name: 'B', Value: 'two' },
  ]));
  await expect(page.locator('#output')).toHaveValue("A=1\nB=two");
  await expect(page.locator('#input-status')).toContainText('SECRET has no value');

  await page.fill('#input', '"just a string"');
  await expect(page.locator('#input-status')).toHaveClass(/is-error/);
  await expect(page.locator('#input-status')).toContainText('Expected a JSON object');
});

test('typed JSON output and key sorting', async ({ page }) => {
  await openTool(page, TOOL);

  await page.fill('#input', 'ZIP=02134\nPORT=8080\nRATIO=0.5\nON=true\nBIG=12345678901234567890\nNAME=app');
  await page.locator('#typed-values').check();
  await page.locator('#sort-keys').check();

  const json = await page.locator('#output').inputValue();
  expect(Object.keys(JSON.parse(json))).toEqual(['BIG', 'NAME', 'ON', 'PORT', 'RATIO', 'ZIP']);
  expect(JSON.parse(json)).toEqual({ BIG: '12345678901234567890', NAME: 'app', ON: true, PORT: 8080, RATIO: 0.5, ZIP: '02134' });
});

for (const target of ['env', 'shell']) {
  test(`tricky values survive JSON → ${target} → JSON unchanged`, async ({ page }) => {
    await openTool(page, TOOL);
    await pick(page, 'from', 'json');
    await pick(page, 'to', target);
    await page.fill('#input', JSON.stringify(TRICKY));

    await page.locator('[data-action="swap"]').click();
    await expect(page).toHaveURL(new RegExp(`#${target}-json$`));
    await expect(page.locator('#input-status')).toHaveClass(/is-success/);
    expect(await outputJson(page)).toEqual(TRICKY);
  });
}

test('the hash deep-links a direction, and picking the other side\'s format swaps', async ({ page }) => {
  await openTool(page, TOOL);
  await page.goto(`/tools/${TOOL}/#shell-env`);

  await expect(page.locator('#input-title')).toHaveText('Shell Input');
  await expect(page.locator('#output-title')).toHaveText('.env Output');

  await page.fill('#input', "export A='x y'");
  await expect(page.locator('#output')).toHaveValue("A='x y'");

  // Choosing .env as the input is the same as swapping.
  await pick(page, 'from', 'env');
  await expect(page).toHaveURL(/#env-shell$/);
  await expect(page.locator('#input')).toHaveValue("A='x y'");
  await expect(page.locator('#output')).toHaveValue("export A='x y'");
});

test('paste, copy, download, and opening a file that switches the input format', async ({ page }) => {
  await openTool(page, TOOL);

  await setClipboardText(page, 'A=1');
  await page.locator('[data-action="paste"]').click();
  await expect(page.locator('#output')).toHaveValue('{\n  "A": "1"\n}');

  await page.locator('[data-action="copy"]').click();
  expect(await lastCopied(page)).toBe('{\n  "A": "1"\n}');

  let download = await captureDownload(page, () => page.locator('[data-action="download"]').click());
  expect(download.suggestedFilename()).toBe('env.json');
  expect(await downloadText(download)).toBe('{\n  "A": "1"\n}\n');

  await page.locator('#file-input').setInputFiles({ name: 'vars.sh', mimeType: 'text/plain', buffer: Buffer.from('export B=2\n') });
  await expect(page.locator('#input-title')).toHaveText('Shell Input');
  await expect(page.locator('#output')).toHaveValue('{\n  "B": "2"\n}');

  await pick(page, 'to', 'env');
  download = await captureDownload(page, () => page.locator('[data-action="download"]').click());
  expect(download.suggestedFilename()).toBe('vars.env');
  expect(await downloadText(download)).toBe('B=2\n');
});

test('every input format has a sample that converts cleanly', async ({ page }) => {
  await openTool(page, TOOL);
  for (const [from, to] of [['env', 'json'], ['shell', 'env'], ['json', 'shell']]) {
    await page.goto(`/tools/${TOOL}/#${from}-${to}`);
    await page.locator('[data-action="sample"]').click();
    await expect(page.locator('#output')).not.toHaveValue('');
    await expect(page.locator('#input-status')).not.toHaveClass(/is-error/);
  }
  await page.goto(`/tools/${TOOL}/#env-json`);
  await page.locator('[data-action="sample"]').click();
  expect(await outputJson(page)).toMatchObject({
    DATABASE_URL: 'postgres://app@localhost:5432/app',
    PRIVATE_KEY: '-----BEGIN KEY-----\nMIIBOgIBAAJBAK\n-----END KEY-----',
    GREETING: 'Hello, world',
  });
});

test('fish output reads back: \\\' and \\\\ inside fish single quotes are escapes', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'json');
  await pick(page, 'to', 'shell');
  await page.fill('#input', JSON.stringify(TRICKY));
  await chooseDialect(page, 'fish');
  await expect(page.locator('#output')).toHaveValue(/set -gx SINGLE 'it\\'s'/);

  // Swap carries the fish text over as the input; it used to fail with
  // "unterminated ' quote" at the first \'.
  await page.locator('[data-action="swap"]').click();
  await expect(page.locator('#input-status')).not.toHaveClass(/is-error/);
  expect(await outputJson(page)).toEqual(TRICKY);
});

test('fish set keeps values that start with a dash; only leading flags are options', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'shell');
  await page.fill('#input', "set -gx --export A '-----BEGIN-----'\nset -x B two words");
  expect(await outputJson(page)).toEqual({ A: '-----BEGIN-----', B: 'two words' });
});

test('POSIX single quotes still treat backslashes literally', async ({ page }) => {
  await openTool(page, TOOL);
  await pick(page, 'from', 'shell');
  await page.fill('#input', "export A='C:\\dir\\'\nexport B='x'");
  expect(await outputJson(page)).toEqual({ A: 'C:\\dir\\', B: 'x' });
});
