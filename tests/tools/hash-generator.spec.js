import { createHash, createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

// Expected values come from Node's own crypto, so the page is checked against
// an independent implementation rather than against constants copied from it.
const NODE_NAMES = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha384: 'sha384', sha512: 'sha512' };
const ALGORITHMS = Object.keys(NODE_NAMES);
const SAMPLE = 'The quick brown fox jumps over the lazy dog';

const hash = (algorithm, data, encoding = 'hex') => createHash(NODE_NAMES[algorithm]).update(data).digest(encoding);
const hmac = (algorithm, key, data, encoding = 'hex') => createHmac(NODE_NAMES[algorithm], key).update(data).digest(encoding);

const value = (page, algorithm) => page.locator(`.digest-row[data-algorithm="${algorithm}"] .digest-value`);

async function expectDigests(page, expected) {
  for (const algorithm of ALGORITHMS) {
    await expect(value(page, algorithm), algorithm).toHaveText(expected(algorithm));
  }
}

test('opens with a sample and every digest matches Node', async ({ page }) => {
  const { errors } = await openTool(page, 'hash-generator');

  await expect(page.locator('#textInput')).toHaveValue(SAMPLE);
  await expectDigests(page, (algorithm) => hash(algorithm, SAMPLE));
  await expect(page.locator('#byteCount')).toHaveText('43 bytes');
  expect(errors).toEqual([]);
});

test('hashes text as UTF-8, including the empty string', async ({ page }) => {
  await openTool(page, 'hash-generator');

  await typeInto(page, '#textInput', 'héllo 🌍');
  await expectDigests(page, (algorithm) => hash(algorithm, Buffer.from('héllo 🌍', 'utf8')));
  await expect(page.locator('#byteCount')).toHaveText('11 bytes');

  await typeInto(page, '#textInput', '');
  await expect(value(page, 'md5')).toHaveText('d41d8cd98f00b204e9800998ecf8427e');
  await expectDigests(page, (algorithm) => hash(algorithm, ''));
});

test('MD5 and SHA padding is correct at every block boundary', async ({ page }) => {
  // 55/56 and 119/120 bytes are where the length field stops fitting in the
  // final block (64-byte blocks for MD5/SHA-1/SHA-256, 128 for SHA-384/512).
  await openTool(page, 'hash-generator');
  for (const length of [1, 55, 56, 63, 64, 65, 111, 112, 119, 120, 128, 1000]) {
    const text = 'a'.repeat(length);
    await typeInto(page, '#textInput', text);
    await expectDigests(page, (algorithm) => hash(algorithm, text));
  }
});

test('output switches between lowercase hex, uppercase hex, and Base64', async ({ page }) => {
  await openTool(page, 'hash-generator');

  await page.click('#formatSwitch [data-value="HEX"]');
  await expect(value(page, 'sha256')).toHaveText(hash('sha256', SAMPLE).toUpperCase());

  await page.click('#formatSwitch [data-value="base64"]');
  await expectDigests(page, (algorithm) => hash(algorithm, SAMPLE, 'base64'));
});

test('HMAC mode keys every algorithm and matches RFC 2104', async ({ page }) => {
  await openTool(page, 'hash-generator');
  await page.click('.mode-btn[data-mode="hmac"]');

  await expect(page.locator('#keyRow')).toBeVisible();
  await expect(page.locator('#outputTitle')).toHaveText('HMAC');
  await expect(page).toHaveURL(/#hmac$/);

  await typeInto(page, '#keyInput', 'key');
  await expectDigests(page, (algorithm) => hmac(algorithm, 'key', SAMPLE));
  await expect(value(page, 'sha256')).toHaveText('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');

  // A key longer than the block size is hashed first.
  const longKey = 'k'.repeat(200);
  await typeInto(page, '#keyInput', longKey);
  await expectDigests(page, (algorithm) => hmac(algorithm, longKey, SAMPLE));

  // An empty key is legal HMAC, even though SubtleCrypto's importKey refuses it.
  await typeInto(page, '#keyInput', '');
  await expectDigests(page, (algorithm) => hmac(algorithm, '', SAMPLE));
});

test('HMAC keys can be given as hex or Base64, and bad keys are reported', async ({ page }) => {
  const { errors } = await openTool(page, 'hash-generator');
  await page.click('.mode-btn[data-mode="hmac"]');
  const key = Buffer.from([0x0b, 0xff, 0x00, 0x7f, 0x80, 0x10]);

  await page.click('#keyEncoding [data-value="hex"]');
  await typeInto(page, '#keyInput', key.toString('hex'));
  await expectDigests(page, (algorithm) => hmac(algorithm, key, SAMPLE));

  await typeInto(page, '#keyInput', 'abc');
  await expect(page.locator('#keyError')).toHaveText(/even number/);
  await expect(page.locator('#keyInput')).toHaveAttribute('aria-invalid', 'true');
  await expect(value(page, 'sha256')).toHaveText('—');

  await page.click('#keyEncoding [data-value="base64"]');
  await typeInto(page, '#keyInput', key.toString('base64'));
  await expect(page.locator('#keyError')).toBeHidden();
  await expectDigests(page, (algorithm) => hmac(algorithm, key, SAMPLE));
  expect(errors).toEqual([]);
});

test('file mode hashes the exact bytes of a chosen file', async ({ page }) => {
  await openTool(page, 'hash-generator');
  const buffer = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) & 0xff));

  await page.click('[data-source="file"]');
  await expect(page).toHaveURL(/#file$/);
  await expect(page.locator('#dropzone')).toBeVisible();
  await expect(page.locator('#textInput')).toBeHidden();
  await expect(value(page, 'md5')).toHaveText('—');

  await page.setInputFiles('#fileInput', { name: 'blob.bin', mimeType: 'application/octet-stream', buffer });
  await expect(page.locator('#fileName')).toHaveText('blob.bin');
  await expect(page.locator('#byteCount')).toHaveText('4.88 KB');
  await expectDigests(page, (algorithm) => hash(algorithm, buffer));

  await page.click('.mode-btn[data-mode="hmac"]');
  await expect(page).toHaveURL(/#hmac-file$/);
  await typeInto(page, '#keyInput', 'secret');
  await expectDigests(page, (algorithm) => hmac(algorithm, 'secret', buffer));

  await page.click('[data-action="clear-file"]');
  await expect(value(page, 'sha1')).toHaveText('—');
});

test('dropping a file on the text input switches to file mode', async ({ page }) => {
  await openTool(page, 'hash-generator');
  const contents = 'line one\r\nline two\r\n';

  await page.evaluate((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'crlf.txt', { type: 'text/plain' }));
    const target = document.getElementById('textInput');
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, contents);

  await expect(page.locator('[data-source="file"]')).toHaveClass(/active/);
  await expect(page.locator('#fileName')).toHaveText('crlf.txt');
  // CRLF survives in file mode, unlike a textarea, which normalises to LF.
  await expectDigests(page, (algorithm) => hash(algorithm, contents));
});

test('deep links select HMAC and file mode on load', async ({ page }) => {
  await openTool(page, 'hash-generator');
  await page.goto('/tools/hash-generator/#hmac-file');
  await expect(page.locator('.mode-btn[data-mode="hmac"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-source="file"]')).toHaveClass(/active/);

  await page.goto('/tools/hash-generator/#nonsense');
  await expect(page.locator('.mode-btn[data-mode="digest"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-source="text"]')).toHaveClass(/active/);
});

test('compare finds the matching algorithm from hex, Base64, or sha256sum output', async ({ page }) => {
  await openTool(page, 'hash-generator');
  const compare = page.locator('#compareInput');
  const result = page.locator('#compareResult');

  await compare.fill(hash('sha256', SAMPLE).toUpperCase());
  await expect(result).toHaveText('Matches SHA-256');
  await expect(page.locator('.digest-row[data-algorithm="sha256"]')).toHaveClass(/is-match/);

  await compare.fill(`${hash('md5', SAMPLE)}  fox.txt`);
  await expect(result).toHaveText('Matches MD5');
  await expect(page.locator('.digest-row.is-match')).toHaveCount(1);

  await compare.fill(hash('sha512', SAMPLE, 'base64'));
  await expect(result).toHaveText('Matches SHA-512');

  await compare.fill(`sha1=${hash('sha1', SAMPLE)}`);
  await expect(result).toHaveText('Matches SHA-1');

  await compare.fill('deadbeef');
  await expect(result).toHaveText('Does not match any digest above');
  await expect(compare).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.digest-row.is-match')).toHaveCount(0);

  // The comparison follows the input, not just the compare field.
  await compare.fill(hash('sha256', 'other'));
  await typeInto(page, '#textInput', 'other');
  await expect(result).toHaveText('Matches SHA-256');
});

test('copies a single digest and a labelled list of all of them', async ({ page }) => {
  await openTool(page, 'hash-generator');

  await page.click('.digest-row[data-algorithm="sha1"] [data-action="copy-digest"]');
  await expect.poll(() => lastCopied(page)).toBe(hash('sha1', SAMPLE));

  await page.click('[data-action="copy-all"]');
  const all = await lastCopied(page);
  const lines = all.split('\n');
  expect(lines).toHaveLength(5);
  expect(lines[0]).toMatch(new RegExp(`^MD5\\s+${hash('md5', SAMPLE)}$`));
  expect(lines[4]).toMatch(new RegExp(`^SHA-512\\s+${hash('sha512', SAMPLE)}$`));
});

test('paste, clear, and sample drive the text input', async ({ page }) => {
  await openTool(page, 'hash-generator');

  await setClipboardText(page, 'pasted');
  await page.click('[data-action="paste"]');
  await expect(page.locator('#textInput')).toHaveValue('pasted');
  await expect(value(page, 'sha256')).toHaveText(hash('sha256', 'pasted'));

  await page.click('[data-action="clear"]');
  await expect(page.locator('#textInput')).toHaveValue('');
  await expect(value(page, 'sha256')).toHaveText(hash('sha256', ''));

  await page.click('[data-action="sample"]');
  await expect(page.locator('#textInput')).toHaveValue(SAMPLE);
});

test('help modal explains the tool and closes with Escape', async ({ page }) => {
  await openTool(page, 'hash-generator');
  await page.click('#helpBtn');
  await expect(page.locator('#helpModal')).toHaveClass(/is-open/);
  await expect(page.locator('#helpModal')).toContainText('trailing newline');
  await page.keyboard.press('Escape');
  await expect(page.locator('#helpModal')).not.toHaveClass(/is-open/);
});
