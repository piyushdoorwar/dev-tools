import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

const TOOL = 'text-encryptor';
const UNICODE = 'Grüße, мир! 你好 🔐 — naïve café\n\tsecond line with emoji 👩‍💻';
const PASSWORD = 'tr0ub4dor & 3 — пароль';

const output = '#output-editor';
const outputStatus = page => page.locator('#output-status .status-text');
const inputStatus = page => page.locator('#input-status .status-text');

// The page encrypts its sample on load; wait for that before driving it so a
// test's own click is not swallowed by the busy guard.
async function open(page) {
  const handle = await openTool(page, TOOL);
  await expect(page.locator('#run-btn')).toBeEnabled();
  await expect(page.locator(output)).not.toHaveValue('');
  return handle;
}

async function run(page) {
  await page.click('#run-btn');
  await expect(page.locator('#run-btn')).toBeEnabled();
}

// 100k keeps the suite quick; the format stores the count, so nothing else changes.
async function encrypt(page, text, password = PASSWORD, iterations = '100000') {
  await page.click(`[data-iterations="${iterations}"]`);
  await typeInto(page, '#password', password);
  await typeInto(page, '#input-editor', text);
  await run(page);
  await expect(outputStatus(page)).toHaveText(/^Encrypted in/);
  return page.inputValue(output);
}

async function decrypt(page, token, password = PASSWORD) {
  await page.click('[data-direction="decrypt"]');
  if (password !== null) await typeInto(page, '#password', password);
  await typeInto(page, '#input-editor', token);
  await run(page);
}

// Independent reader for the compact format, straight from the documented layout.
function split(token) {
  const data = Buffer.from(token, 'base64');
  return {
    data,
    version: data[0],
    kdf: data[1],
    iterations: data.readUInt32BE(2),
    salt: data.subarray(6, 22),
    iv: data.subarray(22, 34),
    ciphertext: data.subarray(34, data.length - 16),
    tag: data.subarray(data.length - 16),
  };
}

function nodeDecrypt({ salt, iv, ciphertext, tag, iterations }, password, rawKey) {
  const key = rawKey ?? crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function flipByte(token, index) {
  const data = Buffer.from(token, 'base64');
  data[index] ^= 0x01;
  return data.toString('base64');
}

test('opens with an encrypted sample at 600,000 iterations and no console errors', async ({ page }) => {
  const { errors } = await open(page);
  await expect(page.locator('h1')).toHaveText('Text Encrypt / Decrypt');
  await expect(outputStatus(page)).toContainText('correct horse battery staple');
  const parts = split(await page.inputValue(output));
  expect(parts.version).toBe(1);
  expect(parts.kdf).toBe(1);
  expect(parts.iterations).toBe(600000);
  expect(nodeDecrypt(parts, 'correct horse battery staple')).toBe(await page.inputValue('#input-editor'));
  expect(errors).toEqual([]);
});

test('round-trips unicode text through encrypt, swap and decrypt', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, UNICODE);
  expect(token).toMatch(/^[A-Za-z0-9+/]+=*$/);

  await page.click('[data-action="swap"]');
  await expect(page.locator('[data-direction="decrypt"]')).toHaveClass(/active/);
  await expect(page.locator('#input-editor')).toHaveValue(token);
  await expect(outputStatus(page)).toHaveText(/^Decrypted in/);
  expect(await page.inputValue(output)).toBe(UNICODE);

  // The same text and password encrypt differently every time: fresh salt and IV.
  await page.click('[data-direction="encrypt"]');
  const again = await encrypt(page, UNICODE);
  expect(again).not.toBe(token);
});

test('compact output decrypts with node:crypto in the test process', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, UNICODE, PASSWORD, '310000');
  const parts = split(token);
  expect(parts.iterations).toBe(310000);
  expect(parts.salt).toHaveLength(16);
  expect(parts.iv).toHaveLength(12);
  expect(parts.ciphertext).toHaveLength(Buffer.byteLength(UNICODE, 'utf8'));
  expect(nodeDecrypt(parts, PASSWORD)).toBe(UNICODE);
});

test('the Interop snippets decrypt real output as published', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, UNICODE);
  await page.click('[data-view="interop"]');
  await expect(page.locator('#snippet-node')).toBeVisible();

  // Node: run the snippet exactly as the page shows it.
  const nodeSource = await page.locator('#snippet-node').textContent();
  const nodeDecryptFn = new Function('require', `${nodeSource}\nreturn decrypt;`)(createRequire(import.meta.url));
  expect(nodeDecryptFn(token, PASSWORD)).toBe(UNICODE);
  expect(() => nodeDecryptFn(token, 'wrong')).toThrow();

  // The copy button hands out the same text.
  await page.click('[data-action="copy-snippet"][data-snippet="node"]');
  expect(await lastCopied(page)).toBe(nodeSource);

  // Python: only where the `cryptography` package is installed.
  let python = true;
  try {
    execFileSync('python3', ['-c', 'import cryptography'], { stdio: 'ignore' });
  } catch {
    python = false;
  }
  test.skip(!python, 'python3 with cryptography is not installed');
  const pySource = await page.locator('#snippet-python').textContent();
  const program = `${pySource}\nimport sys\nsys.stdout.buffer.write(decrypt(sys.argv[1], sys.argv[2]).encode("utf-8"))\n`;
  // Base64url too: the snippet documents that it takes either alphabet.
  const url = Buffer.from(token, 'base64').toString('base64url');
  for (const input of [token, url]) {
    expect(execFileSync('python3', ['-c', program, input, PASSWORD]).toString('utf8')).toBe(UNICODE);
  }
});

test('a wrong password fails authentication instead of producing garbage', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, 'top secret');
  await decrypt(page, token, 'not the password');
  await expect(outputStatus(page)).toHaveText('Authentication failed — wrong password or the data was changed');
  await expect(outputStatus(page)).toHaveClass(/error/);
  await expect(page.locator(output)).toHaveValue('');
});

test('changing any single byte of the token fails', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, 'integrity matters');
  const length = Buffer.from(token, 'base64').length;
  const cases = [
    [3, /Authentication failed/],            // iterations
    [10, /Authentication failed/],           // salt
    [25, /Authentication failed/],           // IV
    [36, /Authentication failed/],           // ciphertext
    [length - 1, /Authentication failed/],   // tag
    [0, /Unknown format version 0/],         // version
    [1, /Unknown key derivation id 0|raw-key token must have zero/], // kdf id
  ];
  await page.click('[data-direction="decrypt"]');
  await typeInto(page, '#password', PASSWORD);
  for (const [index, message] of cases) {
    await typeInto(page, '#input-editor', flipByte(token, index));
    await run(page);
    await expect(outputStatus(page), `byte ${index}`).toHaveText(message);
    await expect(page.locator(output)).toHaveValue('');
  }
  // And the untouched token still decrypts.
  await typeInto(page, '#input-editor', token);
  await run(page);
  await expect(page.locator(output)).toHaveValue('integrity matters');
});

test('explains truncated, corrupt and unknown-version input', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, 'x');
  await page.click('[data-direction="decrypt"]');

  // Structure is checked as you type, before the slow key derivation.
  await typeInto(page, '#input-editor', Buffer.from(token, 'base64').subarray(0, 40).toString('base64'));
  await expect(inputStatus(page)).toHaveText('Input is truncated — 40 bytes, but a version 1 token has at least 50');
  await expect(page.locator('#input-editor')).toHaveClass(/is-invalid/);
  await run(page);
  await expect(outputStatus(page)).toContainText('truncated');

  await typeInto(page, '#input-editor', token.slice(0, 5));
  await expect(inputStatus(page)).toContainText('looks truncated');

  await typeInto(page, '#input-editor', 'this is not base64!');
  await expect(inputStatus(page)).toHaveText('Not valid Base64 or Base64url');

  const v2 = Buffer.from(token, 'base64');
  v2[0] = 2;
  await typeInto(page, '#input-editor', v2.toString('base64'));
  await expect(inputStatus(page)).toHaveText('Unknown format version 2 — this tool reads version 1');

  await typeInto(page, '#input-editor', '{"v":1,"alg":"A256GCM","kdf":"PBKDF2-SHA256"');
  await expect(inputStatus(page)).toContainText('does not parse');

  await typeInto(page, '#input-editor', token);
  await expect(inputStatus(page)).toHaveText('Compact · Base64 · 100,000 iterations');
});

test('Base64url re-encodes the same bytes and decrypt detects it', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, UNICODE);
  await page.click('[data-encoding="base64url"]');
  const url = await page.inputValue(output);
  expect(url).toMatch(/^[A-Za-z0-9_-]+$/);
  // Switching alphabet must not re-encrypt (no new salt or IV).
  expect(Buffer.from(url, 'base64url').equals(Buffer.from(token, 'base64'))).toBe(true);

  await page.click('[data-view="envelope"]');
  await expect(page.locator('#envelope-details [data-part="format"]')).toHaveText('Compact · Base64url');

  await decrypt(page, url);
  await expect(inputStatus(page)).toHaveText(/^Compact · Base64url/);
  expect(await page.inputValue(output)).toBe(UNICODE);
});

test('the JSON envelope carries the same parts and decrypts', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, UNICODE);
  await page.click('[data-format="json"]');
  const doc = JSON.parse(await page.inputValue(output));
  const parts = split(token);
  expect(doc).toEqual({
    v: 1,
    alg: 'A256GCM',
    kdf: 'PBKDF2-SHA256',
    iter: 100000,
    salt: parts.salt.toString('base64'),
    iv: parts.iv.toString('base64'),
    ct: parts.ciphertext.toString('base64'),
    tag: parts.tag.toString('base64'),
  });

  await page.click('[data-encoding="base64url"]');
  const urlDoc = JSON.parse(await page.inputValue(output));
  expect(urlDoc.salt).toBe(parts.salt.toString('base64url'));

  const json = await page.inputValue(output);
  await decrypt(page, json);
  await expect(inputStatus(page)).toHaveText(/^JSON envelope · Base64url/);
  expect(await page.inputValue(output)).toBe(UNICODE);

  // Tampering a JSON field fails just like the compact form.
  const bad = { ...urlDoc, ct: Buffer.from(parts.ciphertext.map((b, i) => (i === 0 ? b ^ 1 : b))).toString('base64url') };
  await typeInto(page, '#input-editor', JSON.stringify(bad));
  await run(page);
  await expect(outputStatus(page)).toHaveText(/Authentication failed/);
});

test('the Envelope view shows every part in hex', async ({ page }) => {
  await open(page);
  const token = await encrypt(page, 'envelope me');
  const parts = split(token);
  await page.click('[data-view="envelope"]');
  const dd = (name) => page.locator(`#envelope-details [data-part="${name}"]`);
  await expect(dd('version')).toHaveText('1');
  await expect(dd('kdf')).toHaveText('PBKDF2-HMAC-SHA-256 (id 1)');
  await expect(dd('iterations')).toHaveText('100,000');
  await expect(dd('salt')).toHaveText(parts.salt.toString('hex'));
  await expect(dd('iv')).toHaveText(parts.iv.toString('hex'));
  await expect(dd('ciphertext')).toHaveText(parts.ciphertext.toString('hex'));
  await expect(dd('tag')).toHaveText(parts.tag.toString('hex'));
  await expect(dd('size')).toContainText(`${parts.data.length} bytes`);

  // In decrypt mode it describes the pasted token before any key is derived.
  await page.click('[data-direction="decrypt"]');
  await expect(page.locator('#envelope-empty')).toBeVisible();
  await typeInto(page, '#input-editor', token);
  await expect(dd('salt')).toHaveText(parts.salt.toString('hex'));
  await typeInto(page, '#input-editor', token.slice(0, 20));
  await expect(page.locator('#envelope-empty')).toHaveClass(/is-error/);
});

test('raw key mode encrypts with a generated 256-bit key', async ({ page }) => {
  await open(page);
  await page.click('[data-key-mode="raw"]');
  await expect(page.locator('#password')).toBeHidden();
  await expect(page.locator('#iterations-group')).toBeHidden();
  await expect(page.locator('#raw-key-hint')).toContainText('Generate');

  await page.click('[data-action="generate-key"]');
  const hex = await page.inputValue('#raw-key');
  expect(hex).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.locator('#raw-key-hint')).toHaveText('256-bit key ✓');
  await page.click('[data-action="copy-key"]');
  expect(await lastCopied(page)).toBe(hex);

  await typeInto(page, '#input-editor', UNICODE);
  await run(page);
  const token = await page.inputValue(output);
  const parts = split(token);
  expect(parts.kdf).toBe(0);
  expect(parts.iterations).toBe(0);
  expect(parts.salt.equals(Buffer.alloc(16))).toBe(true);
  expect(nodeDecrypt(parts, null, Buffer.from(hex, 'hex'))).toBe(UNICODE);

  // Decrypt with the same key given as Base64 instead of hex.
  await page.click('[data-direction="decrypt"]');
  await typeInto(page, '#raw-key', Buffer.from(hex, 'hex').toString('base64'));
  await typeInto(page, '#input-editor', token);
  await run(page);
  expect(await page.inputValue(output)).toBe(UNICODE);

  // A different key fails authentication.
  await typeInto(page, '#raw-key', crypto.randomBytes(32).toString('hex'));
  await run(page);
  await expect(outputStatus(page)).toHaveText('Authentication failed — wrong key or the data was changed');

  // A 128-bit key is rejected before anything runs.
  await typeInto(page, '#raw-key', 'ab'.repeat(16));
  await expect(page.locator('#raw-key-hint')).toContainText('128 bits');
  await expect(page.locator('#raw-key')).toHaveClass(/is-invalid/);

  // Password tokens ask for the right mode rather than failing mysteriously.
  await typeInto(page, '#raw-key', hex);
  const passwordToken = await page.evaluate(async () => formatEnvelope(await encryptText('x', { type: 'password', password: 'p' }, 1000)));
  await typeInto(page, '#input-editor', passwordToken);
  await run(page);
  await expect(outputStatus(page)).toHaveText('This was encrypted with a password — switch Key to Password');
});

test('password field masks by default, reveals on demand, and hints strength', async ({ page }) => {
  await open(page);
  const field = page.locator('#password');
  await expect(field).toHaveAttribute('type', 'password');
  await page.click('#toggle-password');
  await expect(field).toHaveAttribute('type', 'text');
  await expect(page.locator('#toggle-password')).toHaveText('Hide');
  await expect(page.locator('#toggle-password')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#toggle-password');
  await expect(field).toHaveAttribute('type', 'password');

  const hint = page.locator('#password-strength');
  await typeInto(page, '#password', 'abc');
  await expect(hint).toHaveClass(/is-weak/);
  await typeInto(page, '#password', 'abcdefghij');
  await expect(hint).toHaveClass(/is-fair/);
  await typeInto(page, '#password', 'abcdefghijklm');
  await expect(hint).toHaveClass(/is-good/);
  await typeInto(page, '#password', 'four random words here');
  await expect(hint).toHaveClass(/is-strong/);

  await typeInto(page, '#password', '');
  await typeInto(page, '#input-editor', 'no password');
  await run(page);
  await expect(outputStatus(page)).toHaveText('Enter a password');
});

test('shows a busy state while the key is derived', async ({ page }) => {
  await open(page);
  await page.click('[data-iterations="1000000"]');
  await expect(outputStatus(page)).toContainText('Out of date');
  await page.click('#run-btn');
  await expect(page.locator('#run-btn')).toBeDisabled();
  await expect(page.locator('#run-btn')).toHaveText('Encrypting…');
  await expect(page.locator('#output-panel')).toHaveAttribute('aria-busy', 'true');
  await expect(outputStatus(page)).toContainText('1,000,000 PBKDF2 iterations');
  await expect(page.locator('#run-btn')).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('#run-btn')).toHaveText('Encrypt');
  expect(split(await page.inputValue(output)).iterations).toBe(1000000);
});

test('Ctrl+Enter runs, and copy, paste, clear and the view hash work', async ({ page }) => {
  await open(page);
  await page.click('[data-iterations="100000"]');
  await typeInto(page, '#password', PASSWORD);
  await setClipboardText(page, 'from the clipboard');
  await page.click('[data-action="paste"]');
  await expect(page.locator('#input-editor')).toHaveValue('from the clipboard');
  await page.locator('#input-editor').press('Control+Enter');
  await expect(outputStatus(page)).toHaveText(/^Encrypted in/);
  const token = await page.inputValue(output);
  expect(nodeDecrypt(split(token), PASSWORD)).toBe('from the clipboard');

  await page.click('[data-action="copy"]');
  expect(await lastCopied(page)).toBe(token);

  await page.click('[data-view="interop"]');
  expect(new URL(page.url()).hash).toBe('#interop');
  await page.reload();
  await expect(page.locator('[data-pane="interop"]')).toBeVisible();
  await expect(page.locator('[data-view="interop"]')).toHaveAttribute('aria-selected', 'true');

  await page.click('[data-view="output"]');
  await page.click('[data-action="clear"]');
  await expect(page.locator('#input-editor')).toHaveValue('');
  await expect(page.locator(output)).toHaveValue('');
});

test('editing the input while the key is derived marks the finished result out of date', async ({ page }) => {
  // markStale() skips while busy, so an edit made during a slow PBKDF2 run
  // used to finish with a green "Encrypted in" status over ciphertext of the old text.
  await open(page);
  await page.click('[data-iterations="1000000"]');
  await page.click('#run-btn');
  await expect(page.locator('#run-btn')).toBeDisabled();
  await typeInto(page, '#input-editor', 'typed while busy');

  await expect(page.locator('#run-btn')).toBeEnabled({ timeout: 15000 });
  await expect(outputStatus(page)).toContainText('Out of date');
});

test('the output header fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const panel = await page.locator('#output-panel').boundingBox();
  const actions = await page.locator('#output-panel .action-bar').boundingBox();
  expect(actions.x + actions.width).toBeLessThanOrEqual(panel.x + panel.width);
});
