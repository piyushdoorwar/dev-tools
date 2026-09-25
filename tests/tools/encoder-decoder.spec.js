import { expect, test } from '@playwright/test';
import { captureDownload, downloadText, lastCopied, openTool, setClipboardText, typeInto } from '../helpers.js';

const input = '#input-editor';
const output = '#output-editor';

async function selectMode(page, mode) {
  await page.click(`.mode-btn[data-mode="${mode}"]`);
}

async function selectDirection(page, direction) {
  await page.click(`[data-direction="${direction}"]`);
}

async function selectOption(page, option, value) {
  await page.click(`.segment[data-option="${option}"] [data-value="${value}"]`);
}

test('opens on Base64 encode with a sample already converted', async ({ page }) => {
  const { errors } = await openTool(page, 'encoder-decoder');

  await expect(page.locator(input)).toHaveValue('Hello, world!');
  await expect(page.locator(output)).toHaveValue('SGVsbG8sIHdvcmxkIQ==');
  await expect(page.locator('#output-title')).toHaveText('Base64');
  expect(errors).toEqual([]);
});

test('encodes and decodes Base64 as UTF-8', async ({ page }) => {
  await openTool(page, 'encoder-decoder');

  await typeInto(page, input, 'héllo 🌍');
  await expect(page.locator(output)).toHaveValue('aMOpbGxvIPCfjI0=');

  await selectDirection(page, 'decode');
  await typeInto(page, input, 'aMOpbGxvIPCfjI0=');
  await expect(page.locator(output)).toHaveValue('héllo 🌍');
});

test('Base64 decoding ignores whitespace but rejects invalid characters', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectDirection(page, 'decode');

  await typeInto(page, input, 'SGVsbG8s\n IHdvcmxk\nIQ==');
  await expect(page.locator(output)).toHaveValue('Hello, world!');

  await typeInto(page, input, 'SGVsbG8*');
  await expect(page.locator(output)).toHaveValue('');
  await expect(page.locator('#input-status .status-text')).toContainText('unexpected character "*"');
  await expect(page.locator(input)).toHaveClass(/is-invalid/);
});

test('wrapping splits Base64 output at 76 characters', async ({ page }) => {
  await openTool(page, 'encoder-decoder');

  await typeInto(page, input, 'A'.repeat(200));
  expect(await page.inputValue(output)).not.toContain('\n');

  await selectOption(page, 'wrap', 'on');
  const wrapped = await page.inputValue(output);
  const lines = wrapped.split('\n');
  expect(lines.length).toBeGreaterThan(1);
  expect(Math.max(...lines.map((line) => line.length))).toBe(76);
  expect(wrapped.replaceAll('\n', '')).toBe(btoa('A'.repeat(200)));
});

test('Base64url swaps the alphabet and strips padding by default', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'base64url');

  await typeInto(page, input, '<<?>');
  const encoded = await page.inputValue(output);
  expect(encoded).toBe('PDw_Pg');
  expect(encoded).not.toMatch(/[+/=]/);

  await selectOption(page, 'padding', 'on');
  await expect(page.locator(output)).toHaveValue('PDw_Pg==');

  await selectDirection(page, 'decode');
  await typeInto(page, input, encoded);
  await expect(page.locator(output)).toHaveValue('<<?>');
});

test('URL mode distinguishes component escaping from full-URL escaping', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'url');

  await typeInto(page, input, 'https://example.com/a b?q=1&r=2');
  await expect(page.locator(output)).toHaveValue('https%3A%2F%2Fexample.com%2Fa%20b%3Fq%3D1%26r%3D2');

  await selectOption(page, 'urlScope', 'full');
  await expect(page.locator(output)).toHaveValue('https://example.com/a%20b?q=1&r=2');

  await selectDirection(page, 'decode');
  await typeInto(page, input, 'https://example.com/a%20b?q=1');
  await expect(page.locator(output)).toHaveValue('https://example.com/a b?q=1');
});

test('malformed percent-encoding reports an error instead of throwing', async ({ page }) => {
  const { errors } = await openTool(page, 'encoder-decoder');
  await selectMode(page, 'url');
  await selectDirection(page, 'decode');

  await typeInto(page, input, '100%discount');
  await expect(page.locator(output)).toHaveValue('');
  await expect(page.locator('#input-status .status-text')).toContainText('Malformed percent-encoding');
  expect(errors).toEqual([]);
});

test('HTML mode escapes markup characters and optionally everything non-ASCII', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'html');

  await typeInto(page, input, '<a href="x">Tom & Jerry\'s café</a>');
  await expect(page.locator(output)).toHaveValue('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s café&lt;/a&gt;');

  await selectOption(page, 'htmlScope', 'all');
  await expect(page.locator(output)).toHaveValue('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s caf&#xE9;&lt;/a&gt;');
});

test('HTML decoding resolves named and numeric references', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'html');
  await selectDirection(page, 'decode');

  await typeInto(page, input, '&lt;b&gt;caf&eacute;&#33;&#x1F600;&lt;/b&gt;');
  await expect(page.locator(output)).toHaveValue('<b>café!😀</b>');

  await typeInto(page, input, 'a &madeupentity; b');
  await expect(page.locator(output)).toHaveValue('a &madeupentity; b');
  await expect(page.locator('#input-status .status-text')).toContainText('1 unknown entity');

  // HTML's legacy rule: a handful of named references resolve without their
  // semicolon, so a browser renders this the same way.
  await typeInto(page, input, '&notarealentity;');
  await expect(page.locator(output)).toHaveValue('¬arealentity;');
});

test('swap feeds the output back through the opposite direction', async ({ page }) => {
  await openTool(page, 'encoder-decoder');

  await typeInto(page, input, 'round trip');
  const encoded = await page.inputValue(output);

  await page.click('[data-action="swap"]');
  await expect(page.locator('.segment-btn[data-direction="decode"]')).toHaveClass(/active/);
  await expect(page.locator(input)).toHaveValue(encoded);
  await expect(page.locator(output)).toHaveValue('round trip');
});

test('copy, paste, clear, and download act on the right panel', async ({ page }) => {
  await openTool(page, 'encoder-decoder');

  await page.click('[data-action="copy-output"]');
  expect(await lastCopied(page)).toBe('SGVsbG8sIHdvcmxkIQ==');

  await setClipboardText(page, 'abc');
  await page.click('[data-action="paste-input"]');
  await expect(page.locator(input)).toHaveValue('abc');
  await expect(page.locator(output)).toHaveValue('YWJj');

  const download = await captureDownload(page, () => page.click('[data-action="download-output"]'));
  expect(download.suggestedFilename()).toBe('encoded.txt');
  expect(await downloadText(download)).toBe('YWJj');

  await page.click('[data-action="clear-input"]');
  await expect(page.locator(input)).toHaveValue('');
  await expect(page.locator(output)).toHaveValue('');
});

test('panel titles and visible options follow the mode and direction', async ({ page }) => {
  await openTool(page, 'encoder-decoder');

  await expect(page.locator('#input-title')).toHaveText('Plain Text');
  await expect(page.locator('.option-group[data-for="base64"]')).toBeVisible();
  await expect(page.locator('.option-group[data-for="url"]')).toBeHidden();

  await selectMode(page, 'url');
  await expect(page.locator('#output-title')).toHaveText('URL Encoded');
  await expect(page.locator('.option-group[data-for="url"]')).toBeVisible();
  await expect(page.locator('.option-group[data-for="base64"]')).toBeHidden();

  await selectDirection(page, 'decode');
  await expect(page.locator('#input-title')).toHaveText('URL Encoded');
  await expect(page.locator('#output-title')).toHaveText('Plain Text');
});

/* --- File mode ------------------------------------------------------------ */

// The eight-byte PNG signature plus a little padding is enough to sniff.
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function chooseFile(page, file) {
  await page.setInputFiles('#file-input', file);
}

test('File mode encodes a chosen file to a data: URI or raw Base64', async ({ page }) => {
  const { errors } = await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await expect(page.locator('#dropzone')).toBeVisible();
  await expect(page.locator(input)).toBeHidden();

  await chooseFile(page, { name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('Hello, world!') });
  await expect(page.locator(output)).toHaveValue('data:text/plain;base64,SGVsbG8sIHdvcmxkIQ==');
  await expect(page.locator('#output-title')).toHaveText('Data URI');
  await expect(page.locator('#file-name')).toHaveText('hello.txt');
  await expect(page.locator('#file-meta')).toContainText('13 bytes');

  await selectOption(page, 'fileFormat', 'base64');
  await expect(page.locator(output)).toHaveValue('SGVsbG8sIHdvcmxkIQ==');
  await expect(page.locator('#output-title')).toHaveText('Base64');
  expect(errors).toEqual([]);
});

test('File mode detects the type from the bytes when the browser gives none', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await chooseFile(page, { name: 'mystery', mimeType: '', buffer: PNG_HEAD });
  await expect(page.locator(output)).toHaveValue(`data:image/png;base64,${PNG_HEAD.toString('base64')}`);
  await expect(page.locator('#input-status .status-text')).toContainText('detected image/png');
});

test('File mode decodes a data: URI with a preview, details and download', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await selectDirection(page, 'decode');
  await expect(page.locator('#file-result')).toBeVisible();
  await expect(page.locator(output)).toBeHidden();
  // The output-format option only applies when encoding.
  await expect(page.locator('.option-group[data-for="file"]')).toBeHidden();

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>';
  await typeInto(page, input, `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  await expect(page.locator('#file-preview img')).toBeVisible();
  const details = page.locator('#file-details dd');
  await expect(details).toHaveText(['image/svg+xml', `${svg.length} bytes`, 'data URI', 'decoded.svg']);

  const download = await captureDownload(page, () => page.click('[data-action="download-output"]'));
  expect(download.suggestedFilename()).toBe('decoded.svg');
  expect(await downloadText(download)).toBe(svg);
});

test('File mode decodes raw Base64 by sniffing the signature, and percent-encoded data: URIs', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await selectDirection(page, 'decode');
  const details = page.locator('#file-details dd');

  await typeInto(page, input, PNG_HEAD.toString('base64'));
  await expect(details.nth(0)).toHaveText('image/png');
  await expect(details.nth(2)).toHaveText('file signature');
  await expect(details.nth(3)).toHaveText('decoded.png');

  await typeInto(page, input, Buffer.from('{"ok":true}').toString('base64'));
  await expect(details.nth(0)).toHaveText('application/json');
  await expect(page.locator('#file-preview pre')).toHaveText('{"ok":true}');

  // RFC 2397: no ;base64 means percent-encoded, and no type means text/plain.
  await typeInto(page, input, 'data:,caf%C3%A9%20%F0%9F%8C%8D');
  await expect(details.nth(0)).toHaveText('text/plain');
  await expect(page.locator('#file-preview pre')).toHaveText('café 🌍');

  await typeInto(page, input, 'data:image/png;base64');
  await expect(page.locator('#input-status .status-text')).toContainText('needs a comma');
  await typeInto(page, input, 'not*base64');
  await expect(page.locator('#input-status .status-text')).toContainText('unexpected character "*"');
});

test('File mode swap round-trips decoded bytes back into a file to encode', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await chooseFile(page, { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('round trip') });
  const encoded = await page.inputValue(output);

  await page.click('[data-action="swap"]');
  await expect(page.locator(input)).toHaveValue(encoded);
  await expect(page.locator('#file-details dd').nth(1)).toHaveText('10 bytes');

  await page.click('[data-action="swap"]');
  await expect(page.locator('#dropzone')).toBeVisible();
  await expect(page.locator('#file-name')).toHaveText('decoded.txt');
  await expect(page.locator(output)).toHaveValue(encoded);
});

test('dropping a file on the input switches to File mode from any mode', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'url');
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['dropped'], 'drop.txt', { type: 'text/plain' }));
    return data;
  });
  await page.dispatchEvent('.left-panel', 'drop', { dataTransfer: transfer });
  await expect(page.locator('.mode-btn[data-mode="file"]')).toHaveClass(/active/);
  await expect(page.locator(output)).toHaveValue(`data:text/plain;base64,${Buffer.from('dropped').toString('base64')}`);
});

test('File mode sample loads an SVG and clear removes the file', async ({ page }) => {
  await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await page.click('[data-action="load-sample"]');
  await expect(page.locator('#file-name')).toHaveText('sample.svg');
  await expect(page.locator('#dropzone-preview')).toBeVisible();
  await expect(page.locator(output)).toHaveValue(/^data:image\/svg\+xml;base64,/);

  await page.click('[data-action="clear-input"]');
  await expect(page.locator('#file-name')).toHaveText('Drop a file here or click to choose');
  await expect(page.locator(output)).toHaveValue('');
});

test('a data: URI with a malformed name parameter still decodes', async ({ page }) => {
  // decodeURIComponent() on the name threw URIError, which escaped as an
  // uncaught exception and left the output panel stale.
  const { errors } = await openTool(page, 'encoder-decoder');
  await selectMode(page, 'file');
  await selectDirection(page, 'decode');

  await typeInto(page, input, 'data:text/plain;name=bad%E0name.txt;base64,SGk=');
  await expect(page.locator('#file-details dd')).toHaveText(['text/plain', '2 bytes', 'data URI', 'bad%E0name.txt']);
  expect(errors).toEqual([]);
});

test('stacked on a phone, both editors keep a usable height and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openTool(page, 'encoder-decoder');

  for (const selector of [input, output]) {
    const box = await page.locator(selector).boundingBox();
    expect(box.height, `${selector} is too short to edit in`).toBeGreaterThan(200);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
