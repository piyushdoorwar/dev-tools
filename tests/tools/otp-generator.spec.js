import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

// RFC 6238 Appendix B. The seeds are ASCII, repeated to the hash's block
// size: 20 bytes for SHA-1, 32 for SHA-256, 64 for SHA-512.
const SEEDS = {
  SHA1: '12345678901234567890',
  SHA256: '12345678901234567890123456789012',
  SHA512: '1234567890123456789012345678901234567890123456789012345678901234',
};
const TOTP_VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];
// RFC 4226 Appendix D, counters 0–9, secret "12345678901234567890".
const HOTP_VECTORS = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
// base32("12345678901234567890"), the form authenticator apps would see.
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const code = (page) => page.locator('#code');

// setFixedTime freezes Date.now() while timers keep running, so the 250 ms
// tick still fires but every code is deterministic.
async function openAt(page, seconds) {
  await page.clock.setFixedTime(seconds * 1000);
  return openTool(page, 'otp-generator');
}

test('matches the RFC 6238 Appendix B TOTP vectors for SHA-1, SHA-256 and SHA-512', async ({ page }) => {
  const { errors } = await openTool(page, 'otp-generator');
  const results = await page.evaluate(async ({ seeds, vectors }) => {
    const out = [];
    for (const [time] of vectors) {
      const row = [time];
      for (const algorithm of ['SHA1', 'SHA256', 'SHA512']) {
        row.push(await totp(new TextEncoder().encode(seeds[algorithm]), time, { algorithm, digits: 8, period: 30 }));
      }
      out.push(row);
    }
    return out;
  }, { seeds: SEEDS, vectors: TOTP_VECTORS });
  expect(results).toEqual(TOTP_VECTORS);

  // The time steps themselves, including one past 2^32 seconds.
  const steps = await page.evaluate(() => [59, 1111111109, 20000000000].map((t) => timeStep(t, 30).toString(16).toUpperCase()));
  expect(steps).toEqual(['1', '23523EC', '27BC86AA']);
  expect(errors).toEqual([]);
});

test('matches the RFC 4226 Appendix D HOTP values and handles full 64-bit counters', async ({ page }) => {
  await openTool(page, 'otp-generator');
  const codes = await page.evaluate(async (seed) => {
    const key = new TextEncoder().encode(seed);
    const out = [];
    for (let i = 0; i < 10; i += 1) out.push(await hotp(key, i));
    return out;
  }, SEEDS.SHA1);
  expect(codes).toEqual(HOTP_VECTORS);

  const edges = await page.evaluate(async (b32) => {
    const { bytes } = base32Decode(b32);
    return {
      bytes: new TextDecoder().decode(bytes),
      roundTrip: base32Encode(bytes),
      counterMax: Array.from(counterBytes(0xffffffffffffffffn)),
      counterBig: Array.from(counterBytes(2n ** 53n + 1n)),
      overflow: (() => { try { counterBytes(2n ** 64n); return 'no'; } catch { return 'threw'; } })(),
      maxCode: await hotp(bytes, 0xffffffffffffffffn, { digits: 6 }),
    };
  }, RFC_SECRET_B32);
  expect(edges.bytes).toBe(SEEDS.SHA1);
  expect(edges.roundTrip).toBe(RFC_SECRET_B32);
  expect(edges.counterMax).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  // 2^53 + 1 is not representable as a Number; a BigInt path keeps the low 1.
  expect(edges.counterBig).toEqual([0, 32, 0, 0, 0, 0, 0, 1]);
  expect(edges.overflow).toBe('threw');
  expect(edges.maxCode).toMatch(/^\d{6}$/);
});

test('shows a deterministic TOTP code, neighbours and countdown under a mocked clock', async ({ page }) => {
  const { errors } = await openAt(page, 59);
  await typeInto(page, '#secret-input', RFC_SECRET_B32);
  await page.locator('[data-option="digits"] [data-value="8"]').click();

  await expect(code(page)).toHaveAttribute('data-code', '94287082');
  await expect(code(page)).toHaveText('94287082');
  await expect(page.locator('#prev-code')).toHaveText(await page.evaluate(() => hotp(new TextEncoder().encode('12345678901234567890'), 0, { digits: 8 })));
  await expect(page.locator('#next-code')).toHaveText(await page.evaluate(() => hotp(new TextEncoder().encode('12345678901234567890'), 2, { digits: 8 })));
  // 59 s into the epoch is 1 s before the step rolls over.
  await expect(page.locator('#ring-seconds')).toHaveText('1');
  await expect(page.locator('#ring')).toHaveClass(/is-ending/);
  await expect(page.locator('#code-meta')).toContainText('Step 1');

  // The RFC's SHA-512 vectors use a 64-byte seed, not the 20-byte one.
  await page.locator('[data-option="algorithm"] [data-value="SHA512"]').click();
  const sha512Seed = await page.evaluate((s) => base32Encode(new TextEncoder().encode(s)), SEEDS.SHA512);
  await typeInto(page, '#secret-input', sha512Seed);
  await expect(code(page)).toHaveAttribute('data-code', '90693936');

  await page.clock.setFixedTime(1111111111 * 1000);
  await expect(code(page)).toHaveAttribute('data-code', '99943326');

  await code(page).click();
  expect(await lastCopied(page)).toBe('99943326');
  expect(errors).toEqual([]);
});

test('rolls to the next code when the period elapses', async ({ page }) => {
  await page.clock.install({ time: 1234567890 * 1000 });
  await openTool(page, 'otp-generator');
  await typeInto(page, '#secret-input', RFC_SECRET_B32);
  await page.locator('[data-option="digits"] [data-value="8"]').click();
  await expect(code(page)).toHaveAttribute('data-code', '89005924');
  const next = await page.locator('#next-code').textContent();

  // 1234567890 is 0 s into its step, so 30 s later the next step is current.
  await page.clock.runFor(30_000);
  await expect(code(page)).toHaveAttribute('data-code', next);
  await expect(page.locator('#prev-code')).toHaveText('89005924');
});

test('tolerates spaces, lower case and missing padding, and explains bad characters', async ({ page }) => {
  await openAt(page, 59);
  await page.locator('[data-option="digits"] [data-value="8"]').click();
  await typeInto(page, '#secret-input', 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq');
  await expect(code(page)).toHaveAttribute('data-code', '94287082');
  await expect(page.locator('#secret-status')).toContainText('20 bytes (160-bit key)');

  // "MZXW6===" is "foo" with padding; the unpadded form must decode the same.
  const same = await page.evaluate(() => [base32Decode('MZXW6===').bytes, base32Decode('mzxw6').bytes].map((b) => Array.from(b)));
  expect(same[0]).toEqual([102, 111, 111]);
  expect(same[1]).toEqual([102, 111, 111]);

  await typeInto(page, '#secret-input', 'JBSWY3DPEHPK3PX1');
  await expect(page.locator('#secret-status')).toContainText('"1" at position 16 is not Base32');
  await expect(page.locator('#secret-status')).toContainText('did you mean I or L');
  await expect(page.locator('#secret-status')).toHaveClass(/is-error/);
  await expect(page.locator('#secret-input')).toHaveClass(/is-invalid/);
  await expect(code(page)).toHaveAttribute('data-code', '');

  await typeInto(page, '#secret-input', 'JBSWY3DPE');
  await expect(page.locator('#secret-status')).toContainText('truncated');

  // A short but valid key still works, with a warning.
  await typeInto(page, '#secret-input', 'JBSWY3DPEHPK3PXP');
  await expect(page.locator('#secret-status')).toContainText('at least 128 bits');
  await expect(page.locator('#secret-status')).toHaveClass(/is-warning/);
});

test('generates a random 160-bit Base32 secret', async ({ page }) => {
  await openTool(page, 'otp-generator');
  await page.getByRole('button', { name: 'Generate secret' }).click();
  const first = await page.locator('#secret-input').inputValue();
  expect(first).toMatch(/^[A-Z2-7]{32}$/);
  await expect(page.locator('#secret-status')).toContainText('20 bytes');
  await expect(code(page)).toHaveAttribute('data-code', /^\d{6}$/);
  await page.getByRole('button', { name: 'Generate secret' }).click();
  expect(await page.locator('#secret-input').inputValue()).not.toBe(first);
});

test('validates typed codes against a ±1 step window and names the step', async ({ page }) => {
  await openAt(page, 1111111111);
  await typeInto(page, '#secret-input', RFC_SECRET_B32);
  await page.locator('[data-option="digits"] [data-value="8"]').click();
  await expect(code(page)).toHaveAttribute('data-code', '14050471');
  const prev = await page.locator('#prev-code').textContent();
  const next = await page.locator('#next-code').textContent();

  await typeInto(page, '#validate-input', '1405 0471');
  await expect(page.locator('#validate-result')).toHaveText('Valid — current period');
  await typeInto(page, '#validate-input', prev);
  await expect(page.locator('#validate-result')).toHaveText('Valid — previous period, clock may be 30 s behind');
  await typeInto(page, '#validate-input', next);
  await expect(page.locator('#validate-result')).toHaveText('Valid — next period, clock may be 30 s ahead');
  // 1111111109 is the previous step's RFC value.
  await typeInto(page, '#validate-input', '07081804');
  await expect(page.locator('#validate-result')).toContainText('previous period');
  await typeInto(page, '#validate-input', '00000000');
  await expect(page.locator('#validate-result')).toHaveText('Not valid — no match within ±1 step (±30 s)');
  await typeInto(page, '#validate-input', '1234');
  await expect(page.locator('#validate-result')).toHaveText('Expected 8 digits, got 4');
});

test('HOTP tab shows the counter code, steps the counter, and keeps the tab in the hash', async ({ page }) => {
  await openTool(page, 'otp-generator');
  await page.getByRole('tab', { name: 'HOTP' }).click();
  await expect(page).toHaveURL(/#hotp$/);
  await expect(page.locator('#ring')).toBeHidden();
  await expect(page.locator('#period-input')).toBeHidden();
  await typeInto(page, '#secret-input', RFC_SECRET_B32);
  await expect(code(page)).toHaveAttribute('data-code', HOTP_VECTORS[0]);
  await expect(page.locator('#next-code')).toHaveText(HOTP_VECTORS[1]);

  for (let i = 1; i <= 3; i += 1) {
    await page.getByRole('button', { name: 'Increment counter' }).click();
    await expect(code(page)).toHaveAttribute('data-code', HOTP_VECTORS[i]);
  }
  await expect(page.locator('#counter-input')).toHaveValue('3');
  await expect(page.locator('#prev-label')).toHaveText('Counter 2');
  await page.getByRole('button', { name: 'Decrement counter' }).click();
  await expect(code(page)).toHaveAttribute('data-code', HOTP_VECTORS[2]);

  await typeInto(page, '#counter-input', '9');
  await expect(code(page)).toHaveAttribute('data-code', HOTP_VECTORS[9]);
  await typeInto(page, '#validate-input', HOTP_VECTORS[8]);
  await expect(page.locator('#validate-result')).toContainText('counter 8, one behind');
  await typeInto(page, '#validate-input', HOTP_VECTORS[9]);
  await expect(page.locator('#validate-result')).toHaveText('Valid — counter 9 (current)');

  await expect(page.locator('#uri-output')).toContainText('otpauth://hotp/');
  await expect(page.locator('#uri-output')).toContainText('counter=9');

  await page.reload();
  await expect(page.getByRole('tab', { name: 'HOTP' })).toHaveAttribute('aria-selected', 'true');
});

test('builds the otpauth URI with an encoded label and renders a QR', async ({ page }) => {
  await openTool(page, 'otp-generator');
  await typeInto(page, '#secret-input', 'jbsw y3dp ehpk 3pxp');
  await typeInto(page, '#issuer-input', 'ACME Co');
  await typeInto(page, '#account-input', 'john.doe@example.com');
  await page.locator('[data-option="algorithm"] [data-value="SHA256"]').click();
  await page.locator('[data-option="digits"] [data-value="7"]').click();
  await typeInto(page, '#period-input', '60');

  const expected = 'otpauth://totp/ACME%20Co:john.doe%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=7&period=60';
  await expect(page.locator('#uri-output')).toHaveText(expected);
  await expect(page.locator('#qr svg, #qr canvas').first()).toBeVisible();
  await page.locator('[data-action="copy-uri"]').click();
  expect(await lastCopied(page)).toBe(expected);
  await expect(code(page)).toHaveAttribute('data-code', /^\d{7}$/);
});

test('importing an otpauth URI fills every field', async ({ page }) => {
  const { errors } = await openAt(page, 59);
  const uri = `otpauth://totp/Example%20Org:alice%40example.com?secret=${RFC_SECRET_B32.toLowerCase()}&issuer=Example%20Org&algorithm=SHA1&digits=8&period=30`;
  await typeInto(page, '#uri-input', uri);

  await expect(page.locator('#secret-input')).toHaveValue(RFC_SECRET_B32);
  await expect(page.locator('#issuer-input')).toHaveValue('Example Org');
  await expect(page.locator('#account-input')).toHaveValue('alice@example.com');
  await expect(page.locator('[data-option="digits"] [data-value="8"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-option="algorithm"] [data-value="SHA1"]')).toHaveAttribute('aria-checked', 'true');
  await expect(code(page)).toHaveAttribute('data-code', '94287082');

  // An HOTP URI via the paste button switches the tab and sets the counter.
  await setClipboardText(page, `otpauth://hotp/Bank:bob?secret=${RFC_SECRET_B32}&algorithm=SHA512&digits=6&counter=4`);
  await page.locator('[data-action="paste-uri"]').click();
  await expect(page.getByRole('tab', { name: 'HOTP' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#counter-input')).toHaveValue('4');
  await expect(page.locator('#issuer-input')).toHaveValue('Bank');
  await expect(page.locator('#account-input')).toHaveValue('bob');
  await expect(page.locator('[data-option="algorithm"] [data-value="SHA512"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-option="digits"] [data-value="6"]')).toHaveAttribute('aria-checked', 'true');
  const expected = await page.evaluate((s) => hotp(new TextEncoder().encode(s), 4, { algorithm: 'SHA512', digits: 6 }), SEEDS.SHA1);
  await expect(code(page)).toHaveAttribute('data-code', expected);

  // Round trip: the built URI parses back to the same fields.
  const parsed = await page.evaluate(() => {
    const p = parseOtpauthUri(document.getElementById('uri-output').textContent);
    return { ...p, counter: String(p.counter) };
  });
  expect(parsed).toMatchObject({ type: 'hotp', issuer: 'Bank', account: 'bob', algorithm: 'SHA512', digits: 6, counter: '4' });

  expect(await page.evaluate(() => parseOtpauthUri('otpauth://totp/x?issuer=y').error)).toContain('no secret');
  expect(await page.evaluate(() => parseOtpauthUri('https://example.com').error)).toContain('Not an otpauth');
  expect(errors).toEqual([]);
});

test('arrives with a sample and copy actions work', async ({ page }) => {
  const { errors } = await openAt(page, 1700000000);
  await expect(page.locator('#secret-input')).toHaveValue(RFC_SECRET_B32);
  await expect(page.locator('#secret-status')).toHaveClass(/is-success/);
  await expect(code(page)).toHaveAttribute('data-code', /^\d{6}$/);
  await expect(page.locator('#uri-output')).toContainText(`otpauth://totp/DevTools:alice%40example.com?secret=${RFC_SECRET_B32}`);

  const current = await code(page).getAttribute('data-code');
  await page.locator('[data-action="copy-code"]').click();
  expect(await lastCopied(page)).toBe(current);
  await page.locator('[data-action="copy-secret"]').click();
  expect(await lastCopied(page)).toBe(RFC_SECRET_B32);

  await page.locator('[data-action="clear"]').click();
  await expect(page.locator('#secret-input')).toHaveValue('');
  await expect(code(page)).toHaveAttribute('data-code', '');
  await page.locator('[data-action="sample"]').click();
  await expect(code(page)).toHaveAttribute('data-code', current);
  expect(errors).toEqual([]);
});
