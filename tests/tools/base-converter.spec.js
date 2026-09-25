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

// ---------------------------------------------------------------- Integer mode

async function openInteger(page) {
  await openTool(page, 'base-converter');
  await page.click('[data-view="integer"]');
  await expect(page.locator('[data-pane="integer"]')).toBeVisible();
}

const out = (page, key) => page.locator(`#int-out-${key}`);

async function pickBase(page, base) {
  await page.locator('.int-base-dd .dd__trigger').click();
  await page.locator(`.int-base-dd .dd__option[data-value="${base}"]`).click();
}

test('integer mode: 255 converts to every radix', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', '255');

  await expect(out(page, 'hex')).toHaveValue('ff');
  await expect(out(page, 'bin')).toHaveValue('11111111');
  await expect(out(page, 'oct')).toHaveValue('377');
  await expect(out(page, 'dec')).toHaveValue('255');
  await expect(out(page, 'b32')).toHaveValue('7v');
  await expect(out(page, 'b36')).toHaveValue('73');
  await expect(page.locator('#int-stat-bits')).toHaveText('8 bits');
  await expect(page.locator('#int-stat-bytes')).toHaveText('1 byte');
  await expect(page.locator('#int-stat-signed')).toHaveText('9 bits');
});

test('integer mode: 0x / 0b / 0o prefixes pick the base and _ separates digits', async ({ page }) => {
  await openInteger(page);

  await typeInto(page, '#int-input', '0x1F');
  await expect(out(page, 'dec')).toHaveValue('31');
  await expect(page.locator('#int-stat-base')).toHaveText('Base 16');

  await typeInto(page, '#int-input', '0b1010');
  await expect(out(page, 'dec')).toHaveValue('10');

  await typeInto(page, '#int-input', '0o17');
  await expect(out(page, 'dec')).toHaveValue('15');

  await typeInto(page, '#int-input', '1_000_000');
  await expect(out(page, 'hex')).toHaveValue('f4240');

  await typeInto(page, '#int-input', 'ff ff');
  await expect(page.locator('#int-error')).toBeVisible();
  await pickBase(page, '16');
  await expect(out(page, 'dec')).toHaveValue('65535');
});

test('integer mode: base 36 "zz" is 1295', async ({ page }) => {
  await openInteger(page);
  await pickBase(page, '36');
  await typeInto(page, '#int-input', 'zz');
  await expect(out(page, 'dec')).toHaveValue('1295');
  await expect(page.locator('#int-stat-base')).toHaveText('Base 36');
});

test('integer mode: huge values stay exact (2^200)', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', `0x1${'0'.repeat(50)}`);

  await expect(out(page, 'dec')).toHaveValue((2n ** 200n).toString());
  await expect(out(page, 'bin')).toHaveValue(`1${'0'.repeat(200)}`);
  await expect(out(page, 'b36')).toHaveValue((2n ** 200n).toString(36));
  await expect(page.locator('#int-stat-bits')).toHaveText('201 bits');
  await expect(page.locator('#int-stat-bytes')).toHaveText('26 bytes');

  // Round-trips through a non-power-of-two base without precision loss.
  await pickBase(page, '10');
  await typeInto(page, '#int-input', (2n ** 200n + 1n).toString());
  await expect(out(page, 'hex')).toHaveValue(`1${'0'.repeat(49)}1`);
});

test('integer mode: negatives are sign-magnitude, and wrap in two\'s complement', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', '-1');

  await expect(out(page, 'hex')).toHaveValue('-1');
  await expect(page.locator('#int-stat-sign')).toHaveText('Negative');

  for (const [width, hex] of [['8', 'ff'], ['16', 'ffff'], ['32', 'ffffffff']]) {
    await page.click(`[data-width="${width}"]`);
    await expect(out(page, 'twos-hex')).toHaveValue(hex);
    await expect(out(page, 'twos-signed')).toHaveValue('-1');
    await expect(out(page, 'twos-unsigned')).toHaveValue(((1n << BigInt(width)) - 1n).toString());
    await expect(page.locator('#twos-warning')).toBeHidden();
  }
  await page.click('[data-width="8"]');
  await expect(out(page, 'twos-bin')).toHaveValue('11111111');

  await typeInto(page, '#int-input', '-0x80');
  await expect(out(page, 'twos-hex')).toHaveValue('80');
  await expect(page.locator('#twos-warning')).toBeHidden();
});

test('integer mode: a value too wide for the width warns and shows both ranges', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', '300');
  await page.click('[data-width="8"]');

  await expect(page.locator('#twos-warning')).toBeVisible();
  await expect(page.locator('#twos-warning')).toContainText("doesn't fit in 8 bits");
  await expect(page.locator('#twos-range')).toHaveText('8-bit · signed -128 … 127 · unsigned 0 … 255');
  // Truncated to the low byte, as a cast would.
  await expect(out(page, 'twos-hex')).toHaveValue('2c');

  await page.click('[data-width="16"]');
  await expect(page.locator('#twos-warning')).toBeHidden();
  await expect(out(page, 'twos-hex')).toHaveValue('012c');

  // 200 fits unsigned but not signed: no warning, but the signed reading differs.
  await typeInto(page, '#int-input', '200');
  await page.click('[data-width="8"]');
  await expect(page.locator('#twos-warning')).toBeHidden();
  await expect(out(page, 'twos-signed')).toHaveValue('-56');
});

test('integer mode: invalid digits get a precise error', async ({ page }) => {
  await openInteger(page);
  await pickBase(page, '16');
  await typeInto(page, '#int-input', 'fg');

  await expect(page.locator('#int-error')).toHaveText("'g' is not a valid base-16 digit");
  await expect(page.locator('[data-int-row="input"]')).toHaveClass(/is-invalid/);
  await expect(out(page, 'dec')).toHaveValue('');

  await typeInto(page, '#int-input', 'ff');
  await expect(page.locator('#int-error')).toBeHidden();
  await expect(out(page, 'dec')).toHaveValue('255');

  await pickBase(page, 'auto');
  await typeInto(page, '#int-input', '12a');
  await expect(page.locator('#int-error')).toContainText("'a' is not a valid base-10 digit");
  await typeInto(page, '#int-input', '0x');
  await expect(page.locator('#int-error')).toHaveText('Enter digits after the 0x prefix');
});

test('integer mode: grouping by nibble and byte, and letter case', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', '0x1ff');

  await expect(out(page, 'bin-nibble')).toHaveValue('0001 1111 1111');
  await expect(out(page, 'bin-byte')).toHaveValue('00000001 11111111');
  await expect(out(page, 'hex-byte')).toHaveValue('01 ff');
  await expect(page.locator('#int-stat-bytes')).toHaveText('2 bytes');

  await page.click('[data-case="upper"]');
  await expect(out(page, 'hex')).toHaveValue('1FF');
  await expect(out(page, 'hex-byte')).toHaveValue('01 FF');
  await expect(out(page, 'twos-hex')).toHaveValue('000001FF');
});

test('integer mode: custom output base', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', '100');
  await typeInto(page, '#int-custom-base', '7');
  await expect(out(page, 'custom')).toHaveValue('202');

  await typeInto(page, '#int-custom-base', '40');
  await expect(page.locator('[data-int-row="custom"]')).toHaveClass(/is-invalid/);
  await typeInto(page, '#int-custom-base', '36');
  await expect(out(page, 'custom')).toHaveValue('2s');
});

test('integer mode: editing an output converts back without touching that field', async ({ page }) => {
  await openInteger(page);
  await pickBase(page, '10');

  await typeInto(page, '#int-out-hex', '0xFF');
  await expect(out(page, 'hex')).toHaveValue('0xFF');
  await expect(out(page, 'dec')).toHaveValue('255');
  await expect(out(page, 'bin')).toHaveValue('11111111');
  await expect(page.locator('#int-input')).toHaveValue('255');

  // A bad digit marks only that row; the rest keep the last good value.
  await typeInto(page, '#int-out-bin', '102');
  await expect(page.locator('[data-int-row="bin"]')).toHaveClass(/is-invalid/);
  await expect(page.locator('[data-int-row="bin"] .int-row-error')).toHaveText("'2' is not a valid base-2 digit");
  await expect(out(page, 'dec')).toHaveValue('255');

  await typeInto(page, '#int-out-bin', '-101');
  await expect(page.locator('[data-int-row="bin"]')).not.toHaveClass(/is-invalid/);
  await expect(page.locator('#int-input')).toHaveValue('-5');
});

test('integer mode: each output row copies its value', async ({ page }) => {
  await openInteger(page);
  await typeInto(page, '#int-input', '255');

  await page.click('[data-int-copy="hex"]');
  expect(await lastCopied(page)).toBe('ff');
  await page.click('[data-int-copy="bin-byte"]');
  expect(await lastCopied(page)).toBe('11111111');
  await page.click('[data-int-copy="twos-hex"]');
  expect(await lastCopied(page)).toBe('000000ff');
});

test('integer mode: header clear and sample act on the integer view only', async ({ page }) => {
  await openInteger(page);

  await page.locator('[data-action="clear-all"]').click();
  await expect(page.locator('#int-input')).toHaveValue('');
  await expect(out(page, 'hex')).toHaveValue('');
  expect(await page.locator('#text-input').inputValue()).toBe('Hello');

  await page.locator('[data-action="paste-sample"]').click();
  await expect(page.locator('#int-input')).toHaveValue('0xDEAD_BEEF');
  await expect(out(page, 'dec')).toHaveValue('3735928559');
});

test('the mode is kept in the URL hash and restored on reload', async ({ page }) => {
  await openInteger(page);
  await expect(page).toHaveURL(/#integer$/);

  await page.reload();
  await expect(page.locator('[data-view="integer"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-pane="integer"]')).toBeVisible();
  await expect(page.locator('[data-pane="text"]')).toBeHidden();

  // Back to text mode by hash; an unknown value falls back to the default.
  await page.goto('/tools/base-converter/#nonsense');
  await page.reload();
  await expect(page.locator('[data-pane="text"]')).toBeVisible();
  await expect(page.locator('[data-view="text"]')).toHaveAttribute('aria-selected', 'true');
});

test('every row is reachable on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'base-converter');

  // The content area used to clip (overflow: hidden) under a 100vh body, so the
  // hex and octal rows could not be scrolled to at all.
  const octal = page.locator('#octal-input');
  await octal.scrollIntoViewIfNeeded();
  await expect(octal).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('on a wide screen the editors fill the height instead of leaving a gap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTool(page, 'base-converter');

  const bottom = await page.locator('[data-row="octal"]').evaluate((el) => el.getBoundingClientRect().bottom);
  expect(900 - bottom).toBeLessThan(60);
});

test('the tips dialog fits a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'base-converter');

  await page.locator('#schemaHelpBtn').click();
  await expect(page.locator('#schemaHelpModal')).toBeVisible();
  const box = await page.locator('#schemaHelpModal .modal-content').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await expect(page.locator('#schemaHelpCloseBtn')).toBeInViewport();
});
