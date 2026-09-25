import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, typeInto } from '../helpers.js';

// RFC 7638 §3.1 example RSA key and its SHA-256 thumbprint.
const RFC7638_JWK = {
  kty: 'RSA',
  n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
  e: 'AQAB',
  alg: 'RS256',
  kid: '2011-04-29',
};
const RFC7638_THUMBPRINT = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs';

// [algorithm button, size/curve button, expected SSH type, SSH curve id]
const SIGNING_KEYS = [
  ['rsa', '2048', 'ssh-rsa', null],
  ['ec', 'P-256', 'ecdsa-sha2-nistp256', 'nistp256'],
  ['ec', 'P-384', 'ecdsa-sha2-nistp384', 'nistp384'],
  ['ec', 'P-521', 'ecdsa-sha2-nistp521', 'nistp521'],
  ['ed25519', 'Ed25519', 'ssh-ed25519', null],
];

async function generate(page, algo, param) {
  // Wait for the arrival sample so a later click is not swallowed by it.
  await expect(page.locator('#generate-btn')).toBeEnabled();
  await page.click(`[data-algo="${algo}"]`);
  if (param) await page.click(`[data-param="${param}"]`);
  const before = await page.inputValue('#out-spki');
  await page.click('#generate-btn');
  await expect(page.locator('#generate-btn')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#out-spki')).not.toHaveValue(before);
  await expect(page.locator('#status')).toHaveClass(/is-success/);
}

// Splits an RFC 4251 wire blob into its length-prefixed fields.
function sshFields(blob) {
  const fields = [];
  let offset = 0;
  while (offset < blob.length) {
    const length = blob.readUInt32BE(offset);
    fields.push(blob.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length;
  }
  expect(offset, 'SSH blob has trailing bytes').toBe(blob.length);
  return fields;
}

function readOutputs(page) {
  return page.evaluate(() => ({
    ssh: document.getElementById('out-ssh').value,
    spki: document.getElementById('out-spki').value,
    pkcs8: document.getElementById('out-pkcs8').value,
    publicJwk: JSON.parse(document.getElementById('out-jwk-public').value),
    privateJwk: JSON.parse(document.getElementById('out-jwk-private').value),
  }));
}

// Imports the PEMs back through WebCrypto and signs/verifies with them, which
// proves the DER is well-formed and that the two halves belong together.
function signVerify(page, importAlgo, signAlgo) {
  return page.evaluate(async ({ importAlgo, signAlgo }) => {
    const der = (pem) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
    const spki = document.getElementById('out-spki').value;
    const pkcs8 = document.getElementById('out-pkcs8').value;
    const publicJwk = JSON.parse(document.getElementById('out-jwk-public').value);
    const privateKey = await crypto.subtle.importKey('pkcs8', der(pkcs8), importAlgo, false, ['sign']);
    const publicKey = await crypto.subtle.importKey('spki', der(spki), importAlgo, false, ['verify']);
    const jwkKey = await crypto.subtle.importKey('jwk', publicJwk, importAlgo, false, ['verify']);
    const data = new TextEncoder().encode('key pair round trip');
    const signature = await crypto.subtle.sign(signAlgo, privateKey, data);
    const tampered = new TextEncoder().encode('key pair round trip!');
    return {
      verified: await crypto.subtle.verify(signAlgo, publicKey, signature, data),
      viaJwk: await crypto.subtle.verify(signAlgo, jwkKey, signature, data),
      rejectsTampered: !(await crypto.subtle.verify(signAlgo, publicKey, signature, tampered)),
    };
  }, { importAlgo, signAlgo });
}

const IMPORT_ALGOS = {
  rsa: [{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }],
  'P-256': [{ name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }],
  'P-384': [{ name: 'ECDSA', namedCurve: 'P-384' }, { name: 'ECDSA', hash: 'SHA-384' }],
  'P-521': [{ name: 'ECDSA', namedCurve: 'P-521' }, { name: 'ECDSA', hash: 'SHA-512' }],
  ed25519: [{ name: 'Ed25519' }, { name: 'Ed25519' }],
};

test('arrives with a generated Ed25519 sample and no console errors', async ({ page }) => {
  const { errors } = await openTool(page, 'key-pair-generator');
  await expect(page.locator('#status')).toHaveClass(/is-success/);
  await expect(page.locator('[data-algo="ed25519"]')).toHaveClass(/active/);
  await expect(page.locator('#out-ssh')).toHaveValue(/^ssh-ed25519 [A-Za-z0-9+/]+=* user@devtools$/);
  await expect(page.locator('#out-pkcs8')).toHaveValue(/^-----BEGIN PRIVATE KEY-----\n/);
  await expect(page.locator('#key-summary')).toContainText('Ed25519');
  await expect(page.locator('#key-summary')).toContainText('SHA256:');
  expect(errors).toEqual([]);
});

for (const [algo, param, sshType, curveId] of SIGNING_KEYS) {
  test(`${algo} ${param}: PEM, JWK and OpenSSH output round-trip`, async ({ page }) => {
    const { errors } = await openTool(page, 'key-pair-generator');
    await generate(page, algo, param);
    const out = await readOutputs(page);

    expect(out.spki).toMatch(/^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PUBLIC KEY-----\n$/);
    expect(out.pkcs8).toMatch(/^-----BEGIN PRIVATE KEY-----\n([A-Za-z0-9+/=]{1,64}\n)+-----END PRIVATE KEY-----\n$/);

    const [importAlgo, signAlgo] = IMPORT_ALGOS[algo === 'ec' ? param : algo];
    const result = await signVerify(page, importAlgo, signAlgo);
    expect(result).toEqual({ verified: true, viaJwk: true, rejectsTampered: true });

    // JWKs: the public one carries no private members; kid is the thumbprint.
    expect(out.publicJwk.d).toBeUndefined();
    expect(typeof out.privateJwk.d).toBe('string');
    expect(out.privateJwk.kid).toBe(out.publicJwk.kid);
    expect(out.publicJwk.kid).toBe(await page.evaluate((jwk) => jwkThumbprint(jwk), out.publicJwk));
    expect(out.publicJwk.key_ops).toBeUndefined();

    // OpenSSH line: "<type> <base64 blob> <comment>", blob fields per RFC 4253 / 5656 / 8709.
    const [type, b64, comment] = out.ssh.split(' ');
    expect(type).toBe(sshType);
    expect(comment).toBe('user@devtools');
    const blob = Buffer.from(b64, 'base64');
    const fields = sshFields(blob);
    expect(fields[0].toString()).toBe(sshType);
    if (algo === 'rsa') {
      expect([...fields[1]]).toEqual([1, 0, 1]);
      // A 2048-bit modulus has its top bit set, so the mpint gains a 0x00.
      expect(fields[2].length).toBe(257);
      expect(fields[2][0]).toBe(0);
      expect(fields[2].subarray(1).toString('base64url')).toBe(out.publicJwk.n);
    } else if (curveId) {
      expect(fields[1].toString()).toBe(curveId);
      expect(fields[2][0]).toBe(4);
      expect(fields[2].subarray(1).toString('base64url')).toBe(
        Buffer.concat([Buffer.from(out.publicJwk.x, 'base64url'), Buffer.from(out.publicJwk.y, 'base64url')]).toString('base64url'),
      );
    } else {
      expect(blob.length).toBe(4 + 11 + 4 + 32);
      expect(fields[1].toString('base64url')).toBe(out.publicJwk.x);
    }

    // Fingerprints in the details list match independent Node computations.
    const sshFp = `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
    const spkiDer = Buffer.from(out.spki.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    const spkiFp = createHash('sha256').update(spkiDer).digest('base64');
    await expect(page.locator('#details')).toContainText(sshFp);
    await expect(page.locator('#details')).toContainText(spkiFp);
    await expect(page.locator('#key-summary')).toContainText(sshFp);
    expect(errors).toEqual([]);
  });
}

test('X25519 exports PEM and JWK for key agreement, with no SSH line', async ({ page }) => {
  const { errors } = await openTool(page, 'key-pair-generator');
  await generate(page, 'x25519');
  await expect(page.locator('[data-output="ssh"]')).toBeHidden();
  const out = await readOutputs(page);
  expect(out.spki).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
  expect(out.publicJwk).toMatchObject({ kty: 'OKP', crv: 'X25519', use: 'enc' });

  const agrees = await page.evaluate(async () => {
    const der = (pem) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
    const mine = await crypto.subtle.importKey('pkcs8', der(document.getElementById('out-pkcs8').value), { name: 'X25519' }, false, ['deriveBits']);
    const minePub = await crypto.subtle.importKey('spki', der(document.getElementById('out-spki').value), { name: 'X25519' }, true, []);
    const peer = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const a = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: peer.publicKey }, mine, 256));
    const b = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: minePub }, peer.privateKey, 256));
    return a.length === 32 && a.every((byte, i) => byte === b[i]);
  });
  expect(agrees).toBe(true);
  await expect(page.locator('#details')).toContainText('no X25519 key type');
  expect(errors).toEqual([]);
});

test('RSA 4096 shows a busy Generate button until the key is ready', async ({ page }) => {
  test.setTimeout(60_000);
  await openTool(page, 'key-pair-generator');
  await expect(page.locator('#generate-btn')).toBeEnabled();
  await page.click('[data-algo="rsa"]');
  await page.click('[data-param="4096"]');
  await page.click('#generate-btn');
  await expect(page.locator('#generate-btn')).toHaveClass(/is-busy/);
  await expect(page.locator('#generate-btn')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toHaveText('Generating…');
  await expect(page.locator('#generate-btn')).toBeEnabled({ timeout: 45_000 });
  await expect(page.locator('#generate-btn')).not.toHaveClass(/is-busy/);
  await expect(page.locator('#details')).toContainText('4096 bits, e = 65537');
  const n = await page.evaluate(() => JSON.parse(document.getElementById('out-jwk-public').value).n);
  expect(Buffer.from(n, 'base64url').length).toBe(512);
});

test('jwkThumbprint matches the RFC 7638 test vector', async ({ page }) => {
  await openTool(page, 'key-pair-generator');
  expect(await page.evaluate((jwk) => jwkThumbprint(jwk), RFC7638_JWK)).toBe(RFC7638_THUMBPRINT);
});

test('sshMpint pads values with the high bit set and strips leading zeros', async ({ page }) => {
  await openTool(page, 'key-pair-generator');
  const encoded = await page.evaluate(() => [
    [...sshMpint(new Uint8Array([0x80]))],
    [...sshMpint(new Uint8Array([0x00, 0x00, 0x7f]))],
    [...sshMpint(new Uint8Array([0x00]))],
  ]);
  // RFC 4251 §5 examples: 0x80 → 00 00 00 02 00 80; zero → 00 00 00 00.
  expect(encoded).toEqual([[0, 0, 0, 2, 0, 0x80], [0, 0, 0, 1, 0x7f], [0, 0, 0, 0]]);
});

test('editing the comment updates the SSH line without regenerating', async ({ page }) => {
  await openTool(page, 'key-pair-generator');
  await expect(page.locator('#status')).toHaveClass(/is-success/);
  const spki = await page.inputValue('#out-spki');
  const blob = (await page.inputValue('#out-ssh')).split(' ')[1];

  await typeInto(page, '#ssh-comment', 'deploy@ci  runner');
  await expect(page.locator('#out-ssh')).toHaveValue(`ssh-ed25519 ${blob} deploy@ci runner`);
  await typeInto(page, '#ssh-comment', '');
  await expect(page.locator('#out-ssh')).toHaveValue(`ssh-ed25519 ${blob}`);
  expect(await page.inputValue('#out-spki')).toBe(spki);
});

test('each output copies and downloads with a matching file name', async ({ page }) => {
  await openTool(page, 'key-pair-generator');
  await expect(page.locator('#status')).toHaveClass(/is-success/);
  const out = await readOutputs(page);

  await page.locator('[data-output="ssh"] [data-action="copy"]').click();
  expect(await lastCopied(page)).toBe(`${out.ssh}\n`);
  await page.locator('[data-output="pkcs8"] [data-action="copy"]').click();
  expect(await lastCopied(page)).toBe(out.pkcs8);

  const cases = [
    ['ssh', 'id_ed25519.pub', `${out.ssh}\n`],
    ['spki', 'id_ed25519_public.pem', out.spki],
    ['pkcs8', 'id_ed25519_private.pem', out.pkcs8],
    ['jwk-public', 'id_ed25519_public.jwk.json', JSON.stringify(out.publicJwk, null, 2)],
    ['jwk-private', 'id_ed25519_private.jwk.json', JSON.stringify(out.privateJwk, null, 2)],
  ];
  for (const [output, name, body] of cases) {
    const download = await captureDownload(page, () => page.locator(`[data-output="${output}"] [data-action="download"]`).click());
    expect(download.suggestedFilename()).toBe(name);
    expect(await downloadText(download)).toBe(body);
  }

  // Fingerprint values in the details list copy on click.
  await page.locator('#details .copy-value').first().click();
  expect(await lastCopied(page)).toMatch(/^SHA256:/);
});

test('an algorithm the browser lacks is disabled with an explanation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = SubtleCrypto.prototype.generateKey;
    SubtleCrypto.prototype.generateKey = function generateKey(algorithm, ...rest) {
      const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
      if (/^(Ed25519|X25519)$/i.test(name)) return Promise.reject(new DOMException('Unrecognized name', 'NotSupportedError'));
      return original.call(this, algorithm, ...rest);
    };
  });
  const { errors } = await openTool(page, 'key-pair-generator');
  await expect(page.locator('#status')).toHaveClass(/is-success/);
  await expect(page.locator('[data-algo="ed25519"]')).toBeDisabled();
  await expect(page.locator('[data-algo="x25519"]')).toBeDisabled();
  await expect(page.locator('#support-note')).toBeVisible();
  await expect(page.locator('#support-note')).toContainText('Ed25519 and X25519 are not available');
  // Falls back to a P-256 sample.
  await expect(page.locator('[data-algo="ec"]')).toHaveClass(/active/);
  await expect(page.locator('#out-ssh')).toHaveValue(/^ecdsa-sha2-nistp256 /);
  expect(errors).toEqual([]);
});

test('the help modal explains formats and ssh-keygen conversion', async ({ page }) => {
  await openTool(page, 'key-pair-generator');
  await page.click('#helpBtn');
  await expect(page.locator('#helpModal')).toHaveClass(/is-open/);
  await expect(page.locator('#helpModal')).toContainText('ssh-keygen -i -m PKCS8');
  await expect(page.locator('#helpModal')).toContainText('RFC 7638');
});

test('picking an algorithm before generating keeps the shown key\'s SSH line in step with it', async ({ page }) => {
  // renderAlgo() hid the SSH output whenever X25519 was *selected*, so the
  // displayed Ed25519 key lost its public key line; and after generating an
  // X25519 key, selecting RSA revealed an empty SSH box.
  await openTool(page, 'key-pair-generator');
  await expect(page.locator('#generate-btn')).toBeEnabled();
  await expect(page.locator('#out-ssh')).toHaveValue(/^ssh-ed25519 /);

  await page.click('[data-algo="x25519"]');
  await expect(page.locator('[data-output="ssh"]')).toBeVisible();

  await page.click('#generate-btn');
  await expect(page.locator('#out-jwk-public')).toHaveValue(/X25519/);
  await page.click('[data-algo="rsa"]');
  await expect(page.locator('[data-output="ssh"]')).toBeHidden();
});
