import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool } from '../helpers.js';

const SYMBOLS = /[!@#$%^&*()_+[\]{}|;:,.<>?/~\-=\\]/;

async function password(page) {
  return page.locator('#passwordOutput').inputValue();
}

test('generates a password on load and regenerates on demand', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  const first = await password(page);
  expect(first.length).toBeGreaterThan(0);

  await page.locator('#regenPasswordBtn').click();
  await expect.poll(() => password(page)).not.toBe(first);
});

test('length slider drives the generated password length', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  for (const length of ['8', '32', '64']) {
    await page.locator('#lengthSlider').fill(length);
    await page.locator('#lengthSlider').dispatchEvent('input');
    await expect(page.locator('#lengthValue')).toHaveText(length);
    await expect.poll(async () => (await password(page)).length).toBe(Number(length));
  }
});

test('character-class options are honoured', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('#lengthSlider').fill('40');
  await page.locator('#lengthSlider').dispatchEvent('input');

  // Letters only: no digits, no symbols.
  await page.locator('#optNumbers').uncheck({ force: true });
  await page.locator('#optSymbols').uncheck({ force: true });
  await page.locator('#regenPasswordBtn').click();
  await expect.poll(async () => /[0-9]/.test(await password(page))).toBe(false);
  await expect.poll(async () => SYMBOLS.test(await password(page))).toBe(false);

  // Symbols on: at least one must appear.
  await page.locator('#optSymbols').check({ force: true });
  await page.locator('#regenPasswordBtn').click();
  await expect.poll(async () => SYMBOLS.test(await password(page))).toBe(true);
});

test('letter-case radios restrict the alphabet', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('#lengthSlider').fill('48');
  await page.locator('#lengthSlider').dispatchEvent('input');
  await page.locator('#optNumbers').uncheck({ force: true });
  await page.locator('#optSymbols').uncheck({ force: true });

  // The radios are visually replaced by pills, so click the label a user sees.
  await page.locator('.radio-pill', { hasText: 'Lower case' }).click();
  await page.locator('#regenPasswordBtn').click();
  await expect.poll(async () => /^[a-z]+$/.test(await password(page))).toBe(true);

  await page.locator('.radio-pill', { hasText: 'Upper case' }).click();
  await page.locator('#regenPasswordBtn').click();
  await expect.poll(async () => /^[A-Z]+$/.test(await password(page))).toBe(true);
});

test('avoid-similar removes the ambiguous glyphs', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('#lengthSlider').fill('64');
  await page.locator('#lengthSlider').dispatchEvent('input');
  await page.locator('#optAvoid').check({ force: true });

  // Sample repeatedly: O/0/l/1 must never appear.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.locator('#regenPasswordBtn').click();
    expect(await password(page)).not.toMatch(/[O0l1]/);
  }
});

test('impossible minimums explain themselves instead of yielding a bad password', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  // Ask for more required characters than the password has room for.
  await page.locator('#lengthSlider').fill('8');
  await page.locator('#lengthSlider').dispatchEvent('input');
  await page.locator('#optNumbers').check({ force: true });
  await page.locator('#optSymbols').check({ force: true });
  await page.locator('#alphaMin').fill('20');
  await page.locator('#alphaMin').dispatchEvent('input');

  const output = page.locator('#passwordOutput');
  await expect.poll(() => output.inputValue()).toBe('');
  await expect(output).toHaveAttribute('placeholder', 'Increase length or lower minimums.');

  // Recovering the constraint produces a password again.
  await page.locator('#alphaMin').fill('2');
  await page.locator('#alphaMin').dispatchEvent('input');
  await expect.poll(async () => (await output.inputValue()).length).toBe(8);
});

test('strength readout responds to password quality', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  await page.locator('#lengthSlider').fill('8');
  await page.locator('#lengthSlider').dispatchEvent('input');
  await page.locator('#optSymbols').uncheck({ force: true });
  await page.locator('#optNumbers').uncheck({ force: true });
  const weak = await page.locator('#strengthText').textContent();

  await page.locator('#lengthSlider').fill('64');
  await page.locator('#lengthSlider').dispatchEvent('input');
  await page.locator('#optSymbols').check({ force: true });
  await page.locator('#optNumbers').check({ force: true });
  const strong = await page.locator('#strengthText').textContent();

  expect(weak).toBeTruthy();
  expect(strong).toBeTruthy();
  expect(strong).not.toBe(weak);
});

test('copy sends the current password to the clipboard', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  const value = await password(page);
  await page.locator('#copyPasswordBtn').click();
  expect(await lastCopied(page)).toBe(value);
});

test('bulk mode downloads the requested number of unique passwords', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  await page.locator('label.switch').click();
  await page.locator('#bulkCount').fill('25');
  await page.locator('#bulkCount').dispatchEvent('input');
  await expect(page.locator('#bulkDownloadBtn')).toHaveText(/25 passwords/);

  const download = await captureDownload(page, () => page.locator('#bulkDownloadBtn').click());
  expect(download.suggestedFilename()).toBe('passwords.txt');

  const lines = (await downloadText(download)).split('\n').filter(Boolean);
  expect(lines).toHaveLength(25);
  expect(new Set(lines).size).toBe(25);
});

test('hash mode digests text with every algorithm', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('.mode-tab[data-mode="hashes"]').click();

  await page.locator('#hashInput').fill('abc');
  await page.locator('#hashInput').dispatchEvent('input');
  await page.locator('#algoSelect').selectOption('all');
  await page.locator('#algoSelect').dispatchEvent('change');

  await expect(page.locator('#hashList .hash-row')).toHaveCount(4);

  const digests = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('#hashList .hash-row')].map((row) => [
      row.querySelector('.hash-label').textContent.trim(),
      row.querySelector('.hash-value').textContent.trim(),
    ]),
  ));

  // Published digests for "abc".
  expect(digests.MD5).toBe('900150983cd24fb0d6963f7d28e17f72');
  expect(digests.SHA1).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  expect(digests.SHA256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(digests.SHA512).toMatch(/^ddaf35a193617aba/);
});

test('a salt changes the digest', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('.mode-tab[data-mode="hashes"]').click();
  await page.locator('#algoSelect').selectOption('sha256');

  await page.locator('#hashInput').fill('abc');
  await page.locator('#hashInput').dispatchEvent('input');
  await expect(page.locator('#hashList .hash-value')).toHaveText(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );

  await page.locator('#saltInput').fill('pepper');
  await page.locator('#saltInput').dispatchEvent('input');
  await expect(page.locator('#hashList .hash-value')).not.toHaveText(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('clearing the hash input empties the result list', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('.mode-tab[data-mode="hashes"]').click();

  await page.locator('#hashInput').fill('abc');
  await page.locator('#hashInput').dispatchEvent('input');
  await expect(page.locator('#hashList .hash-row')).not.toHaveCount(0);

  await page.locator('#hashInput').fill('');
  await page.locator('#hashInput').dispatchEvent('input');
  await expect(page.locator('#hashList .hash-row')).toHaveCount(0);
  await expect(page.locator('#hashList .helper-text')).toBeVisible();
});

test('mode tabs swap the visible panel', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  await expect(page.locator('#mode-passwords')).toBeVisible();
  await page.locator('.mode-tab[data-mode="hashes"]').click();
  await expect(page.locator('#mode-hashes')).toBeVisible();
  await expect(page.locator('#mode-passwords')).toBeHidden();

  await page.locator('.mode-tab[data-mode="passwords"]').click();
  await expect(page.locator('#mode-passwords')).toBeVisible();
});

test('the security modal opens and closes', async ({ page }) => {
  await openTool(page, 'crypto-generator');

  await page.locator('#securityInfoBtn').click();
  await expect(page.locator('#securityInfoModal')).toHaveAttribute('aria-hidden', 'false');

  await page.keyboard.press('Escape');
  await expect(page.locator('#securityInfoModal')).toHaveAttribute('aria-hidden', 'true');
});
