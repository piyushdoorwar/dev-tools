import { createHash } from 'node:crypto';
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

/* --- Strength analyser ----------------------------------------------------- */

async function analyse(page, value) {
  const input = page.locator('#analyseInput');
  await input.fill(value);
  await input.dispatchEvent('input');
}

const scoreOf = (page) => page.locator('#analyseScore').getAttribute('data-score');
const weaknessTypes = (page) => page.locator('#analyseWeaknesses .weakness')
  .evaluateAll((items) => items.map((item) => item.dataset.type));

async function openAnalyser(page) {
  await openTool(page, 'crypto-generator');
  await page.locator('.mode-tab[data-mode="analyse"]').click();
  await expect(page.locator('#mode-analyse')).toBeVisible();
}

test('the analyser tab is hash-linked and unknown hashes fall back', async ({ page }) => {
  await openAnalyser(page);
  await expect(page).toHaveURL(/#analyse$/);

  await page.reload();
  await expect(page.locator('#mode-analyse')).toBeVisible();
  await expect(page.locator('.mode-tab[data-mode="analyse"]')).toHaveAttribute('aria-selected', 'true');

  await page.evaluate(() => { window.location.hash = 'hashes'; });
  await expect(page.locator('#mode-hashes')).toBeVisible();

  await page.evaluate(() => { window.location.hash = 'nonsense'; });
  await expect(page.locator('#mode-passwords')).toBeVisible();
});

test('the analyser arrives seeded and the password never reaches the URL', async ({ page }) => {
  await openAnalyser(page);
  await expect(page.locator('#analyseInput')).toHaveValue('Tr0ub4dor&3');
  await expect(page.locator('#analyseScore')).not.toHaveAttribute('data-score', '');
  await analyse(page, 'hunter2-secret');
  expect(page.url()).not.toContain('hunter2');
  await expect(page.locator('#analyseNote')).toContainText('never sent');
});

test('common passwords and their l33t spellings score 0', async ({ page }) => {
  await openAnalyser(page);

  await analyse(page, 'password');
  expect(await scoreOf(page)).toBe('0');
  await expect(page.locator('#analyseLabel')).toHaveText('Very weak');
  expect(await weaknessTypes(page)).toContain('common');

  await analyse(page, 'P@ssw0rd');
  expect(await scoreOf(page)).toBe('0');
  const types = await weaknessTypes(page);
  expect(types).toContain('common');
  expect(types).toContain('l33t');
  await expect(page.locator('#analyseWeaknesses .weakness[data-type="l33t"]')).toContainText('password');
});

test('keyboard walks, sequences, repeats and dates are named', async ({ page }) => {
  await openAnalyser(page);

  await analyse(page, 'qwertyuiop');
  expect(await weaknessTypes(page)).toContain('keyboard');
  expect(Number(await scoreOf(page))).toBeLessThanOrEqual(1);

  await analyse(page, 'zxcvfr4');
  expect(await weaknessTypes(page)).toContain('keyboard');

  for (const sequence of ['abcd', '1234', '9876']) {
    await analyse(page, sequence);
    expect(await weaknessTypes(page), sequence).toContain('sequence');
  }

  await analyse(page, 'abcabcabc');
  expect(await scoreOf(page)).toBe('0');
  expect(await weaknessTypes(page)).toContain('repeat');

  await analyse(page, 'aaaa');
  expect(await weaknessTypes(page)).toContain('repeat');

  await analyse(page, '19871987');
  expect(Number(await scoreOf(page))).toBeLessThanOrEqual(1);
  const dateTypes = await weaknessTypes(page);
  expect(dateTypes).toContain('repeat');
  expect(dateTypes).toContain('date');

  for (const date of ['2024', '12/05/1990']) {
    await analyse(page, date);
    expect(await weaknessTypes(page), date).toContain('date');
  }
});

test('short passwords are called out; long ones are not', async ({ page }) => {
  await openAnalyser(page);
  await analyse(page, 'xK9#mQ2');
  expect(await weaknessTypes(page)).toContain('length');
  await analyse(page, 'xK9#mQ2$vL7!pR4@');
  expect(await weaknessTypes(page)).not.toContain('length');
});

test('passphrases and random strings score high; Tr0ub4dor&3 is only moderate', async ({ page }) => {
  await openAnalyser(page);

  await analyse(page, 'correct horse battery staple');
  expect(Number(await scoreOf(page))).toBeGreaterThanOrEqual(3);

  await analyse(page, 'Tr0ub4dor&3');
  const moderate = Number(await scoreOf(page));
  expect(moderate).toBeGreaterThanOrEqual(1);
  expect(moderate).toBeLessThanOrEqual(3);
  expect(await weaknessTypes(page)).toContain('l33t');

  await analyse(page, 'xK9#mQ2$vL7!pR4@nT8w');
  expect(await scoreOf(page)).toBe('4');
  await expect(page.locator('#analyseLabel')).toHaveText('Very strong');
  await expect(page.locator('#analyseWeaknesses .weakness-none')).toBeVisible();
  await expect(page.locator('#analyseMeter')).toHaveAttribute('aria-valuenow', '4');
});

test('guesses, entropy and every attack model get a crack time', async ({ page }) => {
  await openAnalyser(page);

  await analyse(page, 'password');
  await expect(page.locator('#analyseGuesses')).toHaveText(/^10\^\d+\.\d\d$/);
  await expect(page.locator('#analyseEntropy')).toHaveText(/bits$/);
  const rows = page.locator('#analyseCrackTimes .crack-row');
  await expect(rows).toHaveCount(4);
  for (const id of ['onlineThrottled', 'onlineUnthrottled', 'offlineSlow', 'offlineFast']) {
    await expect(rows.locator(`xpath=self::*[@data-attack="${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-attack="offlineFast"] .crack-time')).toHaveText('less than a second');
  await expect(page.locator('[data-attack="onlineThrottled"] .crack-time')).toHaveText(/minute/);

  await analyse(page, 'xK9#mQ2$vL7!pR4@nT8w');
  await expect(page.locator('[data-attack="offlineFast"] .crack-time')).toHaveText('centuries');
});

test('an empty password returns the analyser to its neutral state', async ({ page }) => {
  await openAnalyser(page);
  await analyse(page, 'password');
  await analyse(page, '');

  await expect(page.locator('#analyseScore')).toHaveAttribute('data-score', '');
  await expect(page.locator('#analyseLabel')).toHaveText('Waiting for a password');
  await expect(page.locator('#analyseGuesses')).toHaveText('–');
  await expect(page.locator('#analyseWeaknesses .weakness')).toHaveCount(0);
  await expect(page.locator('#analyseWeaknesses .weakness-empty')).toBeVisible();
  await expect(page.locator('#analyseCrackTimes .crack-time').first()).toHaveText('–');

  // The clear button does the same.
  await analyse(page, 'password');
  await page.locator('#analyseClearBtn').click();
  await expect(page.locator('#analyseInput')).toHaveValue('');
  await expect(page.locator('#analyseScore')).toHaveAttribute('data-score', '');
});

test('show/hide toggles the password field', async ({ page }) => {
  await openAnalyser(page);
  const input = page.locator('#analyseInput');
  const toggle = page.locator('#analyseToggleBtn');
  await expect(input).toHaveAttribute('type', 'password');

  await toggle.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Hide password');

  await toggle.click();
  await expect(input).toHaveAttribute('type', 'password');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('a generated password can be sent to the analyser', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('#lengthSlider').fill('32');
  await page.locator('#lengthSlider').dispatchEvent('input');
  const generated = await password(page);

  await page.locator('#analyseGeneratedBtn').click();
  await expect(page.locator('#mode-analyse')).toBeVisible();
  await expect(page.locator('#analyseInput')).toHaveValue(generated);
  expect(Number(await scoreOf(page))).toBe(4);
});

test('analysis stays fast on long input', async ({ page }) => {
  await openAnalyser(page);
  const elapsed = await page.evaluate(() => {
    const start = performance.now();
    analysePassword('aB3$'.repeat(8) + 'correcthorse'.repeat(4) + 'q1w2e3r4t5y6'.repeat(4));
    analysePassword('x'.repeat(500));
    return performance.now() - start;
  });
  expect(elapsed).toBeLessThan(1000);
});

test('a slower earlier hash run cannot overwrite a newer one', async ({ page }) => {
  // Switching "All" then a single algorithm started two runs; the four-digest
  // one finished last and replaced the single SHA256 row the user asked for.
  await openTool(page, 'crypto-generator');
  await page.locator('.mode-tab[data-mode="hashes"]').click();
  await page.evaluate(() => {
    const input = document.getElementById('hashInput');
    const select = document.getElementById('algoSelect');
    input.value = 'abc';
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    select.value = 'sha256';
    select.dispatchEvent(new Event('change'));
  });

  await page.waitForTimeout(300);
  await expect(page.locator('#hashList .hash-row')).toHaveCount(1);
  await expect(page.locator('#hashList .hash-label')).toHaveText('SHA256');
});

test('MD5 of text with a lone surrogate hashes instead of throwing', async ({ page }) => {
  // unescape(encodeURIComponent()) threw URIError, an uncaught rejection that
  // left the result list stale.
  const { errors } = await openTool(page, 'crypto-generator');
  await page.locator('.mode-tab[data-mode="hashes"]').click();
  await page.locator('#algoSelect').selectOption('md5');
  await page.evaluate(() => {
    const input = document.getElementById('hashInput');
    input.value = 'a\uD800';
    input.dispatchEvent(new Event('input'));
  });

  const expected = createHash('md5').update(Buffer.from('a\uFFFD', 'utf8')).digest('hex');
  await expect(page.locator('#hashList .hash-value')).toHaveText(expected);
  expect(errors).toEqual([]);
});

test('bulk download with impossible settings explains itself', async ({ page }) => {
  await openTool(page, 'crypto-generator');
  await page.locator('#lengthSlider').fill('8');
  await page.locator('#lengthSlider').dispatchEvent('input');
  await page.locator('#alphaMin').fill('20');
  await page.locator('#alphaMin').dispatchEvent('input');
  await page.locator('#bulkToggle').evaluate((toggle) => {
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  });

  await page.locator('#bulkDownloadBtn').click();
  await expect(page.locator('#toast-container .toast')).toContainText('Increase length or lower minimums.');
});

test('on a phone the options and mode tabs fit without squeezing labels', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'crypto-generator');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Each alphabet pill stays on one line.
  for (const pill of await page.locator('.radio-pill').all()) {
    const box = await pill.boundingBox();
    expect(box.height).toBeLessThan(44);
  }
  // The three mode tabs share a single row.
  const tops = await page.locator('.mode-tab').evaluateAll((tabs) => tabs.map((tab) => Math.round(tab.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});
