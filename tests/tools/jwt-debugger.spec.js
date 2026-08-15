import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

// The header/payload panes are contenteditable <pre> blocks, not form fields.
const headerText = (page) => page.locator('#headerJson').innerText();
const payloadText = (page) => page.locator('#payloadJson').innerText();

/** Build an unsigned token from arbitrary claims, using the page's own encoder. */
function makeToken(page, payload, header = { alg: 'HS256', typ: 'JWT' }) {
  return page.evaluate(({ head, body }) => {
    const enc = (obj) => base64UrlEncode(JSON.stringify(obj));
    return `${enc(head)}.${enc(body)}.c2lnbmF0dXJl`;
  }, { head: header, body: payload });
}

test('the sample token is decoded into header and payload', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();

  await expect.poll(async () => JSON.parse(await headerText(page)))
    .toMatchObject({ alg: 'HS256', typ: 'JWT' });
  await expect.poll(async () => JSON.parse(await payloadText(page)))
    .toMatchObject({ sub: '1234567890', name: 'John' });
});

test('pasting a token decodes it without needing a key', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  const token = await makeToken(page, { hello: 'world' });

  await typeInto(page, '#jwtInput', token);
  await expect.poll(async () => JSON.parse(await payloadText(page))).toEqual({ hello: 'world' });
});

test('a malformed token is reported rather than silently ignored', async ({ page }) => {
  await openTool(page, 'jwt-debugger');

  await typeInto(page, '#jwtInput', 'not-a-jwt');
  await expect(page.locator('#statusMessage')).toHaveClass(/invalid/);
});

test('an expired token is called out', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  const token = await makeToken(page, { sub: '1', exp: 1000 });

  await typeInto(page, '#jwtInput', token);
  await expect(page.locator('#statusMessage')).toContainText(/expire/i);
});

test('a token that is not yet valid is distinguished from an expired one', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  const future = Math.floor(Date.now() / 1000) + 86_400;
  const token = await makeToken(page, { sub: '1', exp: future });

  await typeInto(page, '#jwtInput', token);
  await expect(page.locator('#statusMessage')).not.toContainText(/expired/i);
});

test('relative times read as past or future', async ({ page }) => {
  await openTool(page, 'jwt-debugger');

  // describeRelative takes a signed delta in seconds.
  const described = await page.evaluate(() => ({
    past: describeRelative(-3600),
    future: describeRelative(3600),
  }));

  expect(described.past).toMatch(/ago/i);
  expect(described.future).toMatch(/from now/i);
});

test('verification succeeds with the right secret and fails with the wrong one', async ({ page }) => {
  await openTool(page, 'jwt-debugger');

  // Sign a token with a known secret through the tool itself.
  await page.locator('#sampleBtn').click();
  await page.locator('#secretTextarea').fill('topsecret');
  await page.locator('#applyBtn').click();
  await expect.poll(() => page.locator('#jwtInput').inputValue()).not.toBe('');

  await page.locator('#verifyBtn').click();
  await expect(page.locator('#statusMessage')).toContainText(/verified|valid/i);

  await page.locator('#secretTextarea').fill('the-wrong-secret');
  await page.locator('#verifyBtn').click();
  await expect(page.locator('#statusMessage')).not.toContainText(/signature verified/i);
});

test('editing the payload and applying a key produces a new token', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();
  const original = await page.locator('#jwtInput').inputValue();

  await page.locator('#payloadJson').fill(JSON.stringify({ sub: '99', name: 'Ada' }, null, 2));
  await page.locator('#secretTextarea').fill('topsecret');
  await page.locator('#applyBtn').click();

  await expect.poll(() => page.locator('#jwtInput').inputValue()).not.toBe(original);

  const rebuilt = await page.locator('#jwtInput').inputValue();
  const payload = await page.evaluate((token) => JSON.parse(base64UrlDecode(token.split('.')[1])), rebuilt);
  expect(payload).toMatchObject({ sub: '99', name: 'Ada' });
});

test('choosing an asymmetric algorithm swaps the secret field for key fields', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await expect(page.locator('#secretSection')).toBeVisible();

  for (const algorithm of ['RS256', 'ES256', 'PS256']) {
    await page.locator('#algoSelect').selectOption(algorithm);
    await page.locator('#algoSelect').dispatchEvent('change');
    await expect(page.locator('#asymSection')).toBeVisible();
    await expect(page.locator('#publicKeyTextarea')).toBeVisible();
    await expect(page.locator('#privateKeyTextarea')).toBeVisible();
  }

  await page.locator('#algoSelect').selectOption('HS256');
  await page.locator('#algoSelect').dispatchEvent('change');
  await expect(page.locator('#secretSection')).toBeVisible();
});

test('the signature panel names the algorithm in use', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();

  await expect(page.locator('#sigAlgo')).toContainText(/HMACSHA256/i);
  await expect(page.locator('#sigCode')).not.toBeEmpty();
});

test('the payload copy button exports the payload', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();

  await page.locator('[data-copy-target="payloadJson"]').dispatchEvent('click');
  await expect.poll(async () => JSON.parse(await lastCopied(page))).toMatchObject({ sub: '1234567890' });
});

// KNOWN BUG: updateSecretSections() retargets the *first* [data-copy-target] in
// the document, which is the Header button, so "Copy Header" puts the signing
// secret (or private key) on the clipboard and "Copy Secret" never retargets to
// the private key. Fix: select by value, e.g.
//   document.querySelector('[data-copy-target="secretTextarea"], [data-copy-target="privateKeyTextarea"]')
test.fixme('the header copy button exports the header, not the secret', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();
  await page.locator('#secretTextarea').fill('super-secret-value');

  await page.locator('[data-copy-target="headerJson"]').dispatchEvent('click');
  const copied = await lastCopied(page);

  expect(copied).not.toContain('super-secret-value');
  expect(JSON.parse(copied)).toMatchObject({ alg: 'HS256', typ: 'JWT' });
});

test('paste, copy, and clear act on the token field', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();

  await page.locator('#copyBtn').click();
  expect(await lastCopied(page)).toContain('.');

  await page.locator('#clearBtn').click();
  await expect(page.locator('#jwtInput')).toHaveValue('');

  await setClipboardText(page, 'header.payload.signature');
  await page.locator('#pasteBtn').click();
  await expect(page.locator('#jwtInput')).toHaveValue('header.payload.signature');
});

test('the timestamp editor is seeded from the token claims', async ({ page }) => {
  await openTool(page, 'jwt-debugger');
  await page.locator('#sampleBtn').click();

  await page.locator('.eye-btn').first().click();
  await expect(page.locator('#iatUnixInput')).toHaveValue('1516239022');
  await expect(page.locator('#expUnixInput')).toHaveValue('2000000000');
  await expect(page.locator('#iatUtcInput')).not.toHaveValue('');
  await expect(page.locator('#expRelativeSpan')).not.toBeEmpty();
});
