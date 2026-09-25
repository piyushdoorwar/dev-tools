import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText } from '../helpers.js';

// Generated with OpenSSL for these tests (keys discarded). Expected values
// below come from `openssl x509 -noout -text / -fingerprint`.
const fixture = (name) => readFileSync(new URL(`../fixtures/certs/${name}`, import.meta.url), 'utf8');
const LEAF = fixture('leaf.pem');
const ROOT = fixture('root-ca.pem');
const EXPIRED = fixture('expired-ed25519.pem');
const LEAF_SHA256 = 'A6:C7:C3:32:50:2E:F7:7A:28:AB:59:C8:80:EB:F3:36:95:7B:8D:F7:A6:F9:A2:4C:DB:51:34:B4:39:56:F6:0D';
const LEAF_SHA1 = '98:30:15:EB:B6:9C:09:B4:BB:ED:5B:EB:DE:64:DA:09:11:B9:97:04';
const LEAF_PIN = 'g/ptgDMnuxq0McAnHaGAHEXtyMMbiiDFRICF/RKvk+0=';

const field = (page, id) => page.locator(`[data-field="${id}"] dd`);

// Validity is judged against the clock, so pin it inside the leaf's window.
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
  return openTool(page, 'certificate-decoder');
}

test('decodes a certificate: subject, issuer, SANs, expiry and key, with no console errors', async ({ page }) => {
  const { errors } = await open(page);
  await page.fill('#input', LEAF);

  await expect(page.locator('#certTitle')).toHaveText('devtools.example');
  await expect(page.locator('.cert-subtitle')).toHaveText('Issued by DevTools Example Root CA');

  const subject = page.locator('[data-card="subject"]');
  await expect(subject).toContainText('San Francisco');
  await expect(subject).toContainText('DevTools Example');
  await expect(page.locator('[data-card="issuer"]')).toContainText('DevTools Example Root CA');

  const sans = page.locator('.san-chip');
  await expect(sans).toHaveCount(4);
  await expect(sans.nth(0)).toHaveText(/DNS\s*devtools\.example/);
  await expect(sans.nth(1)).toHaveText(/DNS\s*\*\.devtools\.example/);
  await expect(sans.nth(2)).toHaveText(/IP\s*192\.0\.2\.10/);
  await expect(sans.nth(3)).toHaveText(/Email\s*admin@devtools\.example/i);

  await expect(field(page, 'not-before')).toHaveText('2026-03-01 00:00:00 UTC');
  await expect(field(page, 'not-after')).toHaveText('2035-03-01 00:00:00 UTC');
  await expect(page.locator('#badgeRow')).toContainText('Valid');
  await expect(page.locator('#badgeRow')).toContainText('Leaf');

  await expect(field(page, 'key-algorithm')).toHaveText('RSA');
  await expect(field(page, 'key-size')).toHaveText('2048 bits');
  await expect(field(page, 'signature-algorithm')).toHaveText('ecdsa-with-SHA256');
  expect(errors).toEqual([]);
});

test('reads key usage, extended key usage, basic constraints, policies and revocation endpoints', async ({ page }) => {
  await open(page);
  await page.fill('#input', LEAF);

  await expect(page.locator('[data-field="basic-constraints"] dt')).toHaveText('Basic constraints (critical)');
  await expect(field(page, 'basic-constraints')).toHaveText('Not a CA');
  await expect(field(page, 'key-usage')).toContainText('Digital signature');
  await expect(field(page, 'key-usage')).toContainText('Key encipherment');
  await expect(field(page, 'eku')).toContainText('TLS server authentication');
  await expect(field(page, 'eku')).toContainText('TLS client authentication');
  await expect(field(page, 'policies')).toContainText('Organization validated (OV)');
  await expect(field(page, 'crl')).toHaveText('http://crl.devtools.example/root.crl');
  await expect(field(page, 'ocsp')).toHaveText('http://ocsp.devtools.example');
  await expect(field(page, 'ca-issuers')).toHaveText('http://ca.devtools.example/root.crt');
});

test('shows serial, key identifiers, fingerprints and the SPKI pin, matching OpenSSL', async ({ page }) => {
  await open(page);
  await page.fill('#input', LEAF);

  await expect(field(page, 'serial')).toHaveText('0A:1B:2C:3D:4E:5F');
  await expect(field(page, 'sha256')).toHaveText(LEAF_SHA256);
  await expect(field(page, 'sha1')).toHaveText(LEAF_SHA1);
  await expect(field(page, 'ski')).toHaveText('2F:5A:2E:FF:01:FB:A5:92:8C:D8:AA:8C:96:5D:C8:69:52:7D:1A:7E');
  await expect(field(page, 'aki')).toHaveText('F8:D3:F2:A0:92:D1:A7:2D:84:DB:63:DC:6C:69:63:0B:C3:73:5F:B3');
  await expect(field(page, 'spki-pin')).toHaveText(LEAF_PIN);
});

test('a pasted chain gets one tab per certificate and each signature is verified against its issuer', async ({ page }) => {
  await open(page);
  await page.fill('#input', `${LEAF}\n${ROOT}`);

  const tabs = page.locator('.chain-item');
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('#summaryBadge')).toHaveText('2 certificates');
  await expect(tabs.nth(0)).toContainText('Leaf');
  await expect(tabs.nth(1)).toContainText('Root');
  await expect(field(page, 'signed-by')).toHaveText('#2 DevTools Example Root CA');
  await expect(page.locator('[data-field="signature-check"]')).toContainText('Signature verified');

  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#certTitle')).toHaveText('DevTools Example Root CA');
  await expect(field(page, 'basic-constraints')).toHaveText('CA, path length 0');
  await expect(field(page, 'key-curve')).toHaveText('P-384');
  await expect(field(page, 'signed-by')).toHaveText('Itself (self-signed)');
  await expect(page.locator('[data-field="signature-check"]')).toContainText('Signature verified');

  // Arrow keys move between tabs.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#certTitle')).toHaveText('devtools.example');
});

test('a certificate whose issuer is missing says so instead of claiming a verified chain', async ({ page }) => {
  await open(page);
  await page.fill('#input', LEAF);
  await expect(field(page, 'signed-by')).toHaveText('DevTools Example Root CA — not in the pasted chain');
  await expect(page.locator('[data-field="signature-check"]')).not.toContainText('verified');
});

test('a tampered signature is reported as not matching', async ({ page }) => {
  await open(page);
  // Flip a byte inside the root's signature (the last Base64 line).
  const tampered = ROOT.replace('vXNhpE4C0dpNXY7nDG6jwTY1RyLA1xEfCAxWanlsOzP0Bh/WB9+E7+MRdKKwVSGm', 'vXNhpE4C0dpNXY7nDG6jwTY1RyLA1xEfCAxWanlsOzP0Bh/WB9+E7+MRdKKwVSGn');
  expect(tampered).not.toBe(ROOT);
  await page.fill('#input', tampered);
  await expect(page.locator('[data-field="signature-check"]')).toContainText('Signature does not match');
});

test('expiry status: expired, expiring soon and not yet valid', async ({ page }) => {
  await open(page);

  await page.fill('#input', EXPIRED);
  await expect(page.locator('#badgeRow')).toContainText('Expired');
  await expect(page.locator('#validityDetail')).toContainText('ago');
  await expect(field(page, 'key-algorithm')).toHaveText('Ed25519');
  await expect(page.locator('[data-field="signature-check"]')).toContainText('Signature verified');

  await page.clock.setFixedTime(new Date('2035-02-20T00:00:00Z'));
  await page.fill('#input', '');
  await page.fill('#input', LEAF);
  await expect(page.locator('#badgeRow')).toContainText('Expires soon');
  await expect(page.locator('#validityDetail')).toContainText('9 days left');

  await page.clock.setFixedTime(new Date('2026-01-15T00:00:00Z'));
  await page.fill('#input', '');
  await page.fill('#input', LEAF);
  await expect(page.locator('#badgeRow')).toContainText('Not yet valid');
});

test('decodes SPKI and PKCS#1 public keys to the same key and pin', async ({ page }) => {
  await open(page);

  await page.fill('#input', fixture('leaf-spki.pub'));
  await expect(page.locator('#badgeRow')).toContainText('Public key');
  await expect(field(page, 'key-size')).toHaveText('2048 bits');
  await expect(field(page, 'spki-pin')).toHaveText(LEAF_PIN);

  await page.fill('#input', fixture('leaf-pkcs1.pub'));
  await expect(field(page, 'key-algorithm')).toHaveText('RSA (PKCS#1)');
  await expect(field(page, 'spki-pin')).toHaveText(LEAF_PIN);

  await page.fill('#input', fixture('root-ca-spki.pub'));
  await expect(page.locator('#certTitle')).toHaveText('EC P-384');
  await expect(field(page, 'spki-pin')).toHaveText('xd0hxe7rfSs1RJSF7iIu2CO7SYBw75/vyzAhviQmbk0=');
});

test('decodes a CSR with its requested SANs and verifies its self-signature', async ({ page }) => {
  await open(page);
  await page.fill('#input', fixture('leaf.csr'));

  await expect(page.locator('#badgeRow')).toContainText('Certificate request');
  await expect(page.locator('#certTitle')).toHaveText('devtools.example');
  await expect(page.locator('.san-chip')).toHaveCount(4);
  await expect(page.locator('[data-field="signature-check"]')).toContainText('Signature verified');
});

test('accepts bare Base64 DER and Base64 of a whole PEM file', async ({ page }) => {
  await open(page);

  await page.fill('#input', LEAF.replace(/-----[^-]+-----/g, '').trim());
  await expect(field(page, 'sha256')).toHaveText(LEAF_SHA256);

  await page.fill('#input', Buffer.from(LEAF).toString('base64'));
  await expect(field(page, 'sha256')).toHaveText(LEAF_SHA256);
});

test('opening a binary DER file shows it as PEM and decodes it', async ({ page }) => {
  await open(page);
  await page.setInputFiles('#fileInput', new URL('../fixtures/certs/leaf.der', import.meta.url).pathname);

  await expect(page.locator('#input')).toHaveValue(/^-----BEGIN CERTIFICATE-----\n/);
  await expect(field(page, 'sha256')).toHaveText(LEAF_SHA256);
});

test('private keys are recognised and not decoded; bad input explains itself', async ({ page }) => {
  await open(page);

  await page.fill('#input', '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----');
  await expect(page.locator('[data-notice="private-key"]')).toContainText('not decoded');

  await page.fill('#input', 'hello world');
  await expect(page.locator('[data-notice="error"]')).toContainText('No certificate found');

  await page.fill('#input', '-----BEGIN CERTIFICATE-----\nMIIBAAAA\n-----END CERTIFICATE-----');
  await expect(page.locator('[data-notice="error"]')).toContainText('truncated');

  await page.fill('#input', '');
  await expect(page.locator('.output-empty')).toBeVisible();
});

test('sample, paste, copy value, copy JSON and clear all work', async ({ page }) => {
  await open(page);

  await page.click('[data-action="sample"]');
  await expect(page.locator('.chain-item')).toHaveCount(2);

  await page.locator('[data-field="sha256"] .copy-btn').click();
  expect(await lastCopied(page)).toBe(LEAF_SHA256);

  await page.locator('[data-card="sans"] .copy-btn').click();
  expect(await lastCopied(page)).toBe('devtools.example\n*.devtools.example\n192.0.2.10\nadmin@devtools.example');

  await page.click('[data-action="copy-json"]');
  const json = JSON.parse(await lastCopied(page));
  expect(json).toHaveLength(2);
  expect(json[0].subject.CN).toBe('devtools.example');
  expect(json[0].notAfter).toBe('2035-03-01T00:00:00.000Z');
  expect(json[0].fingerprints.sha256).toBe(LEAF_SHA256);
  expect(json[1].issuer.CN).toBe('DevTools Example Root CA');

  await page.click('[data-action="clear"]');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('.output-empty')).toBeVisible();

  await setClipboardText(page, EXPIRED);
  await page.click('[data-action="paste"]');
  await expect(page.locator('#certTitle')).toHaveText('expired.devtools.example');
});

test('at phone width the placeholder wraps and validity dates keep a gap', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);

  const editor = page.locator('#input');
  const { scroll, client } = await editor.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);

  await page.fill('#input', LEAF);
  const row = page.locator('.validity-dates .field-row').first();
  await expect(row).toBeVisible();
  const dt = await row.locator('dt').boundingBox();
  const dd = await row.locator('dd').boundingBox();
  expect(dd.x - (dt.x + dt.width)).toBeGreaterThanOrEqual(8);
});
