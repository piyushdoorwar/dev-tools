import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, typeInto } from '../helpers.js';

const FIELDS = ['text', 'decimal', 'binary', 'hex', 'octal'];

async function readAll(page) {
  return page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, document.getElementById(`${key}-input`).value]),
  ), FIELDS);
}

test('loads a sample and mirrors it across every base', async ({ page }) => {
  await openTool(page, 'base-converter');

  const values = await readAll(page);
  expect(values.text).toBe('Hello');
  expect(values.decimal).toBe('72 101 108 108 111');
  expect(values.binary).toBe('01001000 01100101 01101100 01101100 01101111');
  expect(values.hex).toBe('48 65 6C 6C 6F');
  expect(values.octal).toBe('110 145 154 154 157');
});

test('editing any field drives all the others', async ({ page }) => {
  await openTool(page, 'base-converter');

  await typeInto(page, '#hex-input', '41 42 43');
  expect(await readAll(page)).toMatchObject({
    text: 'ABC',
    decimal: '65 66 67',
    binary: '01000001 01000010 01000011',
    octal: '101 102 103',
  });

  await typeInto(page, '#binary-input', '01111010');
  expect(await readAll(page)).toMatchObject({ text: 'z', decimal: '122', hex: '7A' });

  await typeInto(page, '#octal-input', '110 151');
  expect(await readAll(page)).toMatchObject({ text: 'Hi', decimal: '72 105' });

  await typeInto(page, '#decimal-input', '33');
  expect(await readAll(page)).toMatchObject({ text: '!', hex: '21' });
});

test('text is treated as UTF-8, so non-ASCII expands to several bytes', async ({ page }) => {
  await openTool(page, 'base-converter');

  await typeInto(page, '#text-input', 'é');
  expect(await readAll(page)).toMatchObject({ decimal: '195 169', hex: 'C3 A9' });

  await typeInto(page, '#text-input', '€');
  expect(await readAll(page)).toMatchObject({ decimal: '226 130 172' });
});

test('an unbroken hex or binary run is split into bytes', async ({ page }) => {
  await openTool(page, 'base-converter');

  await typeInto(page, '#hex-input', '48656C6C6F');
  expect(await readAll(page)).toMatchObject({ text: 'Hello' });

  await typeInto(page, '#binary-input', '0100100001101001');
  expect(await readAll(page)).toMatchObject({ text: 'Hi' });
});

test('0x / 0b / 0o prefixes are accepted', async ({ page }) => {
  await openTool(page, 'base-converter');

  await typeInto(page, '#hex-input', '0x41');
  expect(await readAll(page)).toMatchObject({ text: 'A' });

  await typeInto(page, '#binary-input', '0b01000010');
  expect(await readAll(page)).toMatchObject({ text: 'B' });
});

test('invalid digits mark the row instead of corrupting the other fields', async ({ page }) => {
  await openTool(page, 'base-converter');

  await typeInto(page, '#hex-input', 'ZZ');
  await expect(page.locator('[data-row="hex"]')).toHaveClass(/is-invalid/);

  await typeInto(page, '#binary-input', '012');
  await expect(page.locator('[data-row="binary"]')).toHaveClass(/is-invalid/);

  // A valid entry clears the marker again.
  await typeInto(page, '#binary-input', '01000001');
  await expect(page.locator('[data-row="binary"]')).not.toHaveClass(/is-invalid/);
});

test('byte values above 255 are rejected', async ({ page }) => {
  await openTool(page, 'base-converter');

  await typeInto(page, '#decimal-input', '256');
  await expect(page.locator('[data-row="decimal"]')).toHaveClass(/is-invalid/);

  await typeInto(page, '#decimal-input', '255');
  await expect(page.locator('[data-row="decimal"]')).not.toHaveClass(/is-invalid/);
});

test('clear empties every field', async ({ page }) => {
  await openTool(page, 'base-converter');

  await page.locator('[data-action="clear-all"]').click();
  const values = await readAll(page);
  for (const key of FIELDS) expect(values[key]).toBe('');
});

test('the sample button restores a working conversion', async ({ page }) => {
  await openTool(page, 'base-converter');
  await page.locator('[data-action="clear-all"]').click();

  await page.locator('[data-action="paste-sample"]').click();
  expect(await readAll(page)).toMatchObject({ text: 'Hello', hex: '48 65 6C 6C 6F' });
});

test('per-field copy places that representation on the clipboard', async ({ page }) => {
  await openTool(page, 'base-converter');

  await page.locator('[data-action="copy-field"][data-target="hex"]').click();
  expect(await lastCopied(page)).toBe('48 65 6C 6C 6F');

  await page.locator('[data-action="copy-field"][data-target="binary"]').click();
  expect(await lastCopied(page)).toBe('01001000 01100101 01101100 01101100 01101111');
});

test('per-field download writes that representation to a file', async ({ page }) => {
  await openTool(page, 'base-converter');

  const download = await captureDownload(
    page,
    () => page.locator('[data-action="download-field"][data-target="decimal"]').click(),
  );
  expect(await downloadText(download)).toContain('72 101 108 108 111');
});

test('the schema help modal opens and closes', async ({ page }) => {
  await openTool(page, 'base-converter');

  await page.locator('#schemaHelpBtn').click();
  await expect(page.locator('#schemaHelpModal')).toBeVisible();

  await page.locator('#schemaHelpCloseBtn').click();
  await expect(page.locator('#schemaHelpModal')).toBeHidden();
});
