import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

// The classic OpenBSD / John the Ripper test vector: "U*U" at cost 5.
const KNOWN_HASH = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW';

async function generate(page, password, cost) {
  await typeInto(page, '#hash-password', password);
  if (cost !== undefined) await page.locator('#cost').fill(String(cost));
  await page.click('#generate-btn');
  await expect(page.locator('#hash-output')).not.toHaveValue('');
  await expect(page.locator('#generate-btn')).toBeEnabled();
  return page.inputValue('#hash-output');
}

test('generates a $2b$ hash at the chosen cost with no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'bcrypt-generator');

  const hash = await generate(page, 'correct horse battery staple', 6);
  expect(hash).toMatch(/^\$2b\$06\$[./A-Za-z0-9]{53}$/);
  await expect(page.locator('#hash-status')).toContainText('at cost 6');
  await expect(page.locator('#hash-status')).toHaveClass(/is-success/);
  // After one hash, the cost hint turns into a measured estimate.
  await expect(page.locator('#cost-estimate')).toContainText('in this browser');

  // Salts are random, so hashing again gives a different string.
  await page.click('#generate-btn');
  await expect(page.locator('#hash-output')).not.toHaveValue(hash);
  expect(errors).toEqual([]);
});

test('the cost slider shows the round count and warns below 10', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await page.locator('#cost').fill('12');
  await expect(page.locator('#cost-value')).toHaveText('12');
  await expect(page.locator('#cost-rounds')).toHaveText('4,096 rounds');
  await page.locator('#cost').fill('8');
  await expect(page.locator('#cost-estimate')).toHaveClass(/is-warning/);
});

test('the version prefix can be $2a$, $2b$ or $2y$, and relabels an existing hash', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await page.click('[data-version="2y"]');
  const hash = await generate(page, 'secret', 4);
  expect(hash.startsWith('$2y$04$')).toBe(true);

  await page.click('[data-version="2a"]');
  await expect(page.locator('#hash-output')).toHaveValue(`$2a$${hash.slice(4)}`);

  await page.locator('[data-action="copy-hash"]').click();
  expect(await lastCopied(page)).toBe(`$2a$${hash.slice(4)}`);
});

test('verifies a known test vector and rejects the wrong password', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await typeInto(page, '#verify-hash', KNOWN_HASH);
  await typeInto(page, '#verify-password', 'U*U');
  await expect(page.locator('#verdict')).toHaveClass(/is-match/);
  await expect(page.locator('#verdict-text')).toContainText('Match');

  await typeInto(page, '#verify-password', 'U*V');
  await expect(page.locator('#verdict')).toHaveClass(/is-mismatch/);
  await expect(page.locator('#verdict-text')).toContainText('No match');
});

test('verifies $2b$ and $2y$ forms of the same hash', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await typeInto(page, '#verify-password', 'U*U');
  for (const prefix of ['$2b$', '$2y$']) {
    await typeInto(page, '#verify-hash', prefix + KNOWN_HASH.slice(4));
    await expect(page.locator('#verdict')).toHaveClass(/is-match/);
  }
});

test('breaks a hash into version, cost, salt and checksum', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await typeInto(page, '#verify-hash', KNOWN_HASH);
  await expect(page.locator('#anatomy')).toBeVisible();
  const details = page.locator('#anatomy-details');
  await expect(details.locator('dd')).toHaveText(['$2a$', '5 (32 rounds)', 'CCCCCCCCCCCCCCCCCCCCC.', 'E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW']);
  await expect(page.locator('#anatomy-hash .seg-salt')).toHaveText('CCCCCCCCCCCCCCCCCCCCC.');
});

test('explains why a malformed hash cannot be verified', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await typeInto(page, '#verify-password', 'x');

  await typeInto(page, '#verify-hash', '5f4dcc3b5aa765d61d8327deb882cf99');
  await expect(page.locator('#verdict-text')).toContainText('should start with $2a$, $2b$ or $2y$');
  await expect(page.locator('#verify-hash')).toHaveClass(/is-invalid/);

  await typeInto(page, '#verify-hash', KNOWN_HASH.slice(0, -1));
  await expect(page.locator('#verdict-text')).toContainText('60 characters; this one is 59');

  await typeInto(page, '#verify-hash', `$2x$${KNOWN_HASH.slice(4)}`);
  await expect(page.locator('#verdict-text')).toContainText('$2x$');
  await expect(page.locator('#anatomy')).toBeHidden();
});

test('warns when a password is longer than bcrypt\'s 72-byte limit', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await typeInto(page, '#hash-password', 'a'.repeat(72));
  await expect(page.locator('#hash-password-note')).toBeHidden();

  // Multi-byte characters count in UTF-8 bytes, not characters: 40 × "é" is 80 bytes.
  await typeInto(page, '#hash-password', 'é'.repeat(40));
  await expect(page.locator('#hash-password-note')).toBeVisible();
  await expect(page.locator('#hash-password-note')).toContainText('80 bytes');
  await expect(page.locator('#hash-password-note')).toContainText('last 8 have no effect');
});

test('sends a generated hash to Verify, and pastes and clears there', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  const hash = await generate(page, 'round trip', 4);
  await page.locator('[data-action="send-to-verify"]').click();
  await expect(page.locator('#verify-hash')).toHaveValue(hash);
  await expect(page.locator('#verify-password')).toHaveValue('round trip');
  await expect(page.locator('#verdict')).toHaveClass(/is-match/);

  await page.locator('[data-action="clear-verify"]').click();
  await expect(page.locator('#verify-hash')).toHaveValue('');
  await expect(page.locator('#anatomy')).toBeHidden();

  await setClipboardText(page, `  ${KNOWN_HASH}\n`);
  await page.locator('[data-action="paste-hash"]').click();
  await expect(page.locator('#verify-hash')).toHaveValue(KNOWN_HASH);
});

test('Enter in the password field generates a hash', async ({ page }) => {
  await openTool(page, 'bcrypt-generator');
  await page.locator('#cost').fill('4');
  await page.locator('#hash-password').fill('enter key');
  await page.locator('#hash-password').press('Enter');
  await expect(page.locator('#hash-output')).toHaveValue(/^\$2b\$04\$/);
});

test('switching the prefix while a hash is running labels the result with the new prefix', async ({ page }) => {
  // The callback wrote bcryptjs' result verbatim, so a $2a$ picked mid-hash
  // was ignored: the switch showed $2a$ over a $2b$ hash.
  await openTool(page, 'bcrypt-generator');
  await typeInto(page, '#hash-password', 'secret');
  await page.locator('#cost').fill('12');
  // Click both in one task, so the switch lands while the rounds are running.
  await page.evaluate(() => {
    document.getElementById('generate-btn').click();
    document.querySelector('#version-switch [data-version="2a"]').click();
  });
  await expect(page.locator('#version-switch [data-version="2a"]')).toHaveClass(/active/);

  await expect(page.locator('#generate-btn')).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('#hash-output')).toHaveValue(/^\$2a\$12\$/);
});
