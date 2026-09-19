import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateRawSync, zstdDecompressSync } from 'node:zlib';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__DEV_TOOLS_DISABLE_ANALYTICS__ = true;
    window.__DEV_TOOLS_DISABLE_SERVICE_WORKER__ = true;
  });
});

test('Cloudflare Analytics uses the configured token on the dashboard', async ({ page }) => {
  await page.route('https://static.cloudflareinsights.com/beacon.min.js', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'export {};',
  }));
  await page.goto('/');
  const loaded = await page.evaluate(() => {
    window.__DEV_TOOLS_DISABLE_ANALYTICS__ = false;
    window.DevToolsAnalytics.load();
    const beacon = document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]');
    return {
      type: beacon?.type,
      config: JSON.parse(beacon?.dataset.cfBeacon || '{}'),
    };
  });
  expect(loaded).toEqual({
    type: 'module',
    config: { token: 'e9cd556fb46f4880a8842d37e2dfe3fb' },
  });
});

const TOOL_ROUTES = [
  'base-converter',
  'crypto-generator',
  'fake-data-generator',
  'file-compressor',
  'html-preview',
  'id-generator',
  'image-converter',
  'json-diff',
  'json-toon-converter',
  'json-xml-converter',
  'jwt-debugger',
  'markdown-editor',
  'qr-generator',
  'regex-tester',
  'sql-formatter',
  'text-diff',
  'unit-converter',
];

test('quick launch and recently used cards open their tools', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await page.locator('#quickLaunchTools [data-tool-id="markdown-editor"]').click();
  await expect(page.locator('iframe[data-tool-id="markdown-editor"]')).toHaveClass(/is-visible/);
  await expect(page).toHaveURL(/\/markdown-editor\/$/);

  await page.locator('#brandHome').click();
  const recent = page.locator('#recentTools [data-tool-id="markdown-editor"]');
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(page.locator('iframe[data-tool-id="markdown-editor"]')).toHaveClass(/is-visible/);
});

test('dashboard uses clean routes and migrates legacy or direct-load URLs', async ({ page }) => {
  await page.goto('/#toon-to-json-converter');
  await expect(page).toHaveURL(/\/toon-to-json-converter\/$/);
  await expect(page.locator('iframe[data-tool-id="toon-json-converter"]')).toHaveClass(/is-visible/);

  await page.goto('/?route=image-converter');
  await expect(page).toHaveURL(/\/image-converter\/$/);
  await expect(page.locator('iframe[data-tool-id="image-converter"]')).toHaveClass(/is-visible/);

  await page.locator('[data-tool-id="markdown-editor"].menu__item').click();
  await expect(page).toHaveURL(/\/markdown-editor\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/image-converter\/$/);
  await expect(page.locator('iframe[data-tool-id="image-converter"]')).toHaveClass(/is-visible/);
});

test('clean tool routes are indexable pages with crawlable navigation and route metadata', async ({ page }) => {
  const response = await page.goto('/html-preview/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('HTML Preview — Free Online Developer Tool | Dev Tools');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/html-preview\/$/,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /HTML, CSS, and JavaScript/);
  await expect(page.locator('#toolAbout')).toBeAttached();
  await expect(page.locator('#toolAboutTitle')).toHaveText('HTML Preview');
  await expect(page.locator('#toolList a.menu__item[href]')).toHaveCount(19);

  await page.locator('#brandHome').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#allToolLinks a[href]')).toHaveCount(19);
});

test('info modal keeps the basic content and appends details for the active tool', async ({ page }) => {
  await page.goto('/');

  await page.locator('#supportBtn').click();
  await expect(page.locator('#supportModal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#supportModal')).toContainText('piyushdoorwar+devtools@gmail.com');
  await expect(page.locator('#toolAbout')).toBeHidden();
  await page.locator('#modalClose').click();

  await page.locator('#toolList .menu__item[data-tool-id="image-converter"]').click();
  await page.locator('#supportBtn').click();
  await expect(page.locator('#toolAbout')).toBeVisible();
  await expect(page.locator('#toolAboutLabel')).toHaveText('Image Converter');
  await expect(page.locator('#toolAboutDescription')).toContainText('Convert PNG, JPEG, WebP, SVG, and BMP');
  await expect(page.locator('#toolAboutCapabilities li')).toHaveCount(3);
  await page.locator('#modalClose').click();

  await page.locator('#toolList .menu__item[data-tool-id="jwt-debugger"]').click();
  await page.locator('#supportBtn').click();
  await expect(page.locator('#toolAboutLabel')).toHaveText('JWT Debugger');
  await expect(page.locator('#toolAboutDescription')).toContainText('JSON Web Tokens');
});

test('dashboard creates an iframe only for the selected tool', async ({ page }) => {
  await page.goto('/');
  for (const link of await page.locator('#toolList .menu__item').all()) {
    await link.hover();
  }
  await page.waitForTimeout(250);
  await expect(page.locator('#frameHost iframe')).toHaveCount(0);

  await page.locator('#toolList .menu__item[data-tool-id="image-converter"]').click();
  await expect(page.locator('#frameHost iframe')).toHaveCount(1);
  await expect(page.locator('iframe[data-tool-id="image-converter"]')).toHaveClass(/is-visible/);
});

test('pinned cards use an icon without visible pinned text', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('devtools:pinned-tools', JSON.stringify(['id-generator']));
  });
  await page.reload();
  const badge = page.locator('#quickLaunchTools [data-tool-id="id-generator"] .empty__feature-badge');
  await expect(badge).toHaveAttribute('aria-label', 'Pinned');
  await expect(badge.locator('svg')).toBeVisible();
  await expect(badge).toHaveText('');
});

test('dashboard search filters tools without an external utility library', async ({ page }) => {
  await page.goto('/');
  await page.locator('#toolSearch').fill('image');
  await expect(page.locator('#toolList .menu__item')).toHaveCount(1);
  await expect(page.locator('#toolList .menu__item')).toContainText('Image Converter');
  await page.locator('#toolSearch').fill('no-such-tool');
  await expect(page.locator('#toolList')).toContainText('No matching tools.');
});

test('markdown preview renders formatting and strips executable HTML', async ({ page }) => {
  await page.goto('/tools/markdown-editor/');
  await page.evaluate(() => { window.__markdownXss = false; });
  await page.locator('#editor').fill('**safe**\n\n<img src=x onerror="window.__markdownXss=true">');
  await page.locator('#editor').dispatchEvent('input');
  await expect(page.locator('#preview strong')).toHaveText('safe');
  await expect(page.locator('#preview img')).not.toHaveAttribute('onerror', /.+/);
  expect(await page.evaluate(() => window.__markdownXss)).toBe(false);
});

test('markdown editor opens a local file and renders its contents', async ({ page }) => {
  await page.goto('/tools/markdown-editor/');
  await page.locator('#markdownFileInput').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported note\n\nOpened from the file system.'),
  });

  await expect(page.locator('#editor')).toHaveValue('# Imported note\n\nOpened from the file system.');
  await expect(page.locator('#preview h1')).toHaveText('Imported note');
  await expect(page.locator('#preview')).toContainText('Opened from the file system.');
});

test('ID generators match standards and decode current timestamps', async ({ page }) => {
  await page.goto('/tools/id-generator/');
  const result = await page.evaluate(async () => {
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const v3 = generateUUIDv3(namespace, 'www.widgets.com');
    const v5 = await generateUUIDv5(namespace, 'www.widgets.com');
    const v7 = generateUUIDv7();
    decodeValue(v7);
    const v7Time = document.querySelector('[data-field="time"] input')?.value;
    const ulid = generateUlid();
    decodeValue(ulid);
    const ulidTime = document.querySelector('[data-field="time"] input')?.value;
    return { v3, v5, v7, v7Time, ulid, ulidTime, now: Date.now() };
  });

  expect(result.v3).toBe('3d813cbb-47fb-32ba-91df-831e1593ac29');
  expect(result.v5).toBe('21f7f8de-8051-5b89-8680-0195ef798b6a');
  expect(result.v7).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(Math.abs(Date.parse(result.v7Time) - result.now)).toBeLessThan(2_000);
  expect(result.ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(Math.abs(Date.parse(result.ulidTime) - result.now)).toBeLessThan(2_000);
});

test('JSON Diff accepts every valid JSON primitive', async ({ page }) => {
  await page.goto('/tools/json-diff/');
  await page.locator('#left-editor').fill('false');
  await page.locator('#right-editor').fill('true');
  await page.locator('#left-editor').dispatchEvent('input');
  await page.locator('#right-editor').dispatchEvent('input');
  await expect(page.locator('#left-status .status-text')).toHaveText('Valid JSON');
  await expect(page.locator('#right-status .status-text')).toHaveText('Valid JSON');
  await expect(page.locator('#stat-modified')).toHaveText('1');

  for (const primitive of ['0', 'null', '""']) {
    await page.locator('#left-editor').fill(primitive);
    await page.locator('#left-editor').dispatchEvent('input');
    await expect(page.locator('#left-status .status-text')).toHaveText('Valid JSON');
  }
});

test('TOON conversion round-trips nested and delimiter-sensitive JSON', async ({ page }) => {
  await page.goto('/tools/json-toon-converter/');
  const result = await page.evaluate(() => {
    currentDelimiter = '|';
    currentIndent = 2;
    const fixtures = [
      {
        title: 'a|b: c',
        enabled: false,
        count: 0,
        nested: { empty: null, list: [1, 'two|three', { deep: true }] },
        rows: [{ id: 1, label: 'one|first' }, { id: 2, label: 'two' }],
      },
      [1, 'root|value', { nested: ['x', false] }],
      {},
      { '@root': { preserved: true } },
    ];
    return fixtures.map((fixture) => {
      const toon = jsonToToon(fixture, 2, '|');
      return { toon, parsed: toonToJSON(toon), fixture };
    });
  });

  for (const item of result) expect(item.parsed).toEqual(item.fixture);
  expect(result[0].toon).toContain('rows[2]');
});

test('TOON validation rejects malformed input', async ({ page }) => {
  await page.goto('/tools/json-toon-converter/');
  const result = await page.evaluate(() => {
    try {
      validateToon('this is not Toon syntax');
      return 'accepted';
    } catch (error) {
      return error.message;
    }
  });
  expect(result).toContain('Invalid Toon line');
});

test('JSON/XML conversion emits valid XML for arrays and invalid XML key names', async ({ page }) => {
  await page.goto('/tools/json-xml-converter/');
  const result = await page.evaluate(() => {
    const source = [{ 'not valid': 'one' }, { '1st': 'two' }];
    const xml = jsonToXML(source);
    const parsed = new DOMParser().parseFromString(xml, 'text/xml');
    return {
      xml,
      parserError: Boolean(parsed.querySelector('parsererror')),
      rootCount: parsed.children.length,
      roundTrip: xmlToJSON(xml),
    };
  });

  expect(result.parserError).toBe(false);
  expect(result.rootCount).toBe(1);
  expect(result.xml).toContain('data-json-key="not valid"');
  expect(result.roundTrip.root.item[0]['not valid']).toBe('one');
  expect(result.roundTrip.root.item[1]['1st']).toBe('two');
});

test('JWT signing and verification work for HMAC, RSA-PSS, and ECDSA', async ({ page }) => {
  await page.goto('/tools/jwt-debugger/');

  const hsValid = await page.evaluate(async () => {
    const data = `${base64UrlEncode('{"alg":"HS256","typ":"JWT"}')}.${base64UrlEncode('{"sub":"123"}')}`;
    const signature = await computeSignature(data, 'correct horse battery staple', 'HS256');
    const repeated = await computeSignature(data, 'correct horse battery staple', 'HS256');
    return signature === repeated && signature.length > 20;
  });
  expect(hsValid).toBe(true);

  const psToken = await page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSA-PSS', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const toPem = (buffer, label) => {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----`;
    };
    const privatePem = toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey), 'PRIVATE KEY');
    const publicPem = toPem(await crypto.subtle.exportKey('spki', pair.publicKey), 'PUBLIC KEY');
    const data = `${base64UrlEncode('{"alg":"PS256","typ":"JWT"}')}.${base64UrlEncode('{"sub":"123"}')}`;
    return { token: `${data}.${await computeSignature(data, privatePem, 'PS256')}`, publicPem };
  });
  await page.locator('#jwtInput').fill(psToken.token);
  await page.locator('#jwtInput').dispatchEvent('input');
  await page.locator('#publicKeyTextarea').fill(psToken.publicPem);
  await page.locator('#verifyBtn').click();
  await expect(page.locator('.status-label')).toHaveText('Signature verified');

  const esValid = await page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const buffer = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const pem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
    const data = 'header.payload';
    const encoded = await computeSignature(data, pem, 'ES256');
    const signature = base64UrlDecodeBytes(encoded);
    return signature?.length === 64 && await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, signature, new TextEncoder().encode(data));
  });
  expect(esValid).toBe(true);
});

test('JWT verification uses the original encoded signing input', async ({ page }) => {
  await page.goto('/tools/jwt-debugger/');
  const token = await page.evaluate(async () => {
    const header = base64UrlEncode('{"typ":"JWT",  "alg":"HS256"}');
    const payload = base64UrlEncode('{"sub":"123",  "admin":true}');
    const data = `${header}.${payload}`;
    return `${data}.${await computeSignature(data, 'test-secret', 'HS256')}`;
  });
  await page.locator('#jwtInput').fill(token);
  await page.locator('#jwtInput').dispatchEvent('input');
  await page.locator('#secretTextarea').fill('test-secret');
  await page.locator('#verifyBtn').click();
  await expect(page.locator('.status-label')).toHaveText('Signature verified');
});

test('HTML Preview loads HTML mode and exports connected assets', async ({ page }) => {
  await page.goto('/tools/html-preview/');
  const result = await page.evaluate(() => {
    htmlEditor.setValue('<main><h1>Hello</h1></main>');
    htmlEditor.refresh();
    return {
      hasXmlMode: Boolean(CodeMirror.modes.xml),
      tags: htmlEditor.getWrapperElement().querySelectorAll('.cm-tag').length,
      exported: buildExportHtml('<main>Hello</main>'),
    };
  });
  expect(result.hasXmlMode).toBe(true);
  expect(result.tags).toBeGreaterThan(0);
  expect(result.exported).toContain('href="styles.css"');
  expect(result.exported).toContain('src="script.js"');
});

test('Image Converter detects formats, converts locally, and honors metadata cleanup', async ({ page }) => {
  await page.goto('/tools/image-converter/');
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff3366';
    context.fillRect(0, 0, 3, 2);
    const original = new Uint8Array(await new Promise((resolve) => {
      canvas.toBlob(async (blob) => resolve(await blob.arrayBuffer()), 'image/png');
    }));

    const type = new TextEncoder().encode('tEXt');
    const data = new TextEncoder().encode('Comment\0AI-MARKER-123');
    const crcInput = new Uint8Array(type.length + data.length);
    crcInput.set(type);
    crcInput.set(data, type.length);
    let crc = 0xffffffff;
    for (const byte of crcInput) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const chunk = new Uint8Array(12 + data.length);
    new DataView(chunk.buffer).setUint32(0, data.length);
    chunk.set(type, 4);
    chunk.set(data, 8);
    new DataView(chunk.buffer).setUint32(8 + data.length, crc);

    const withMetadata = new Uint8Array(original.length + chunk.length);
    withMetadata.set(original.slice(0, -12));
    withMetadata.set(chunk, original.length - 12);
    withMetadata.set(original.slice(-12), original.length - 12 + chunk.length);
    const transfer = new DataTransfer();
    transfer.items.add(new File([withMetadata], 'private-photo.png', { type: 'application/octet-stream' }));
    const input = document.querySelector('#fileInput');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.locator('#sourceStatus')).toHaveText('Loaded');
  await expect(page.locator('#sourceFormat')).toHaveText('PNG');
  await expect(page.locator('#sourceDimensions')).toHaveText('3 × 2');
  await expect(page.locator('#outputFormat')).toHaveValue('jpeg');
  await page.locator('#convertBtn').click();
  await expect(page.locator('#resultPanel')).toBeVisible();
  await expect(page.locator('#resultFormat')).toHaveText('JPEG');
  const jpegResult = await page.evaluate(async () => {
    const blob = await fetch(document.querySelector('#resultImage').src).then((response) => response.blob());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      type: blob.type,
      signature: [...bytes.slice(0, 3)],
      hasMarker: new TextDecoder().decode(bytes).includes('AI-MARKER-123'),
    };
  });
  expect(jpegResult).toEqual({ type: 'image/jpeg', signature: [255, 216, 255], hasMarker: false });

  await page.locator('#outputFormat').selectOption('png');
  await page.locator('#stripMetadata').uncheck();
  await expect(page.locator('#formatHelp')).toContainText('preserve the original file bytes');
  await page.locator('#convertBtn').click();
  const preservedMarker = await page.evaluate(async () => {
    const bytes = await fetch(document.querySelector('#resultImage').src).then((response) => response.arrayBuffer());
    return new TextDecoder().decode(bytes).includes('AI-MARKER-123');
  });
  expect(preservedMarker).toBe(true);

  await page.locator('#stripMetadata').check();
  await page.locator('#convertBtn').click();
  const strippedMarker = await page.evaluate(async () => {
    const bytes = await fetch(document.querySelector('#resultImage').src).then((response) => response.arrayBuffer());
    return new TextDecoder().decode(bytes).includes('AI-MARKER-123');
  });
  expect(strippedMarker).toBe(false);
});

test('Image Converter rejects animated GIFs instead of flattening them', async ({ page }) => {
  await page.goto('/tools/image-converter/');
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new TextEncoder().encode('GIF89a')], 'animation.gif', { type: 'image/gif' }));
    const input = document.querySelector('#fileInput');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#toast')).toContainText('Animated GIFs are not supported');
  await expect(page.locator('#sourceStatus')).toHaveText('Waiting');
});

test('JSON Diff renders error messages as text', async ({ page }) => {
  await page.goto('/tools/json-diff/');
  const result = await page.evaluate(async () => {
    window.__toastInjection = false;
    showToast('<img src=x onerror="window.__toastInjection=true">', 'error');
    await new Promise((resolve) => setTimeout(resolve, 50));
    const message = document.querySelector('.toast-message');
    return {
      executed: window.__toastInjection,
      text: message?.textContent,
      childCount: message?.children.length,
    };
  });
  expect(result.executed).toBe(false);
  expect(result.text).toContain('<img src=x');
  expect(result.childCount).toBe(0);
});

test('nested fake-data fields cannot pollute object prototypes', async ({ page }) => {
  await page.goto('/tools/fake-data-generator/');
  const result = await page.evaluate(() => {
    delete Object.prototype.devToolsPolluted;
    const target = {};
    setNestedValue(target, '__proto__.devToolsPolluted', 'yes');
    const output = JSON.stringify(target);
    const polluted = ({}).devToolsPolluted;
    delete Object.prototype.devToolsPolluted;
    return { output, polluted };
  });
  expect(result.polluted).toBeUndefined();
  expect(result.output).toBe('{"__proto__":{"devToolsPolluted":"yes"}}');
});

test('Base Converter treats text as UTF-8 bytes and rejects oversized values', async ({ page }) => {
  await page.goto('/tools/base-converter/');
  await page.locator('#text-input').fill('😀');
  await page.locator('#text-input').dispatchEvent('input');
  await expect(page.locator('#decimal-input')).toHaveValue('240 159 152 128');
  await expect(page.locator('#hex-input')).toHaveValue('F0 9F 98 80');

  await page.locator('#decimal-input').fill('99999999');
  await page.locator('#decimal-input').dispatchEvent('input');
  await expect(page.locator('[data-row="decimal"]')).toHaveClass(/is-invalid/);

  await page.evaluate(() => showToast('Copy failed', 'error'));
  await expect(page.locator('#toast-container .toast-message', { hasText: 'Copy failed' })).toHaveText('Copy failed');
});

test('QR country metadata and flags load without runtime external requests', async ({ page }) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4173')) externalRequests.push(request.url());
  });
  await page.goto('/tools/qr-generator/');
  await page.getByRole('button', { name: 'Mobile' }).click();
  await page.locator('#phoneCode').fill('91');
  await expect(page.locator('#phoneFlag')).toHaveAttribute('src', /^data:image\/svg\+xml/);
  expect(externalRequests).toEqual([]);
});

test('File Compressor creates compatible ZIP data for every algorithm', async ({ page }, testInfo) => {
  await page.goto('/tools/file-compressor/');
  const limitMessages = await page.evaluate(() => ({
    files: FileCompressorValidation.validateQueueLimits(5_001, 1),
    bytes: FileCompressorValidation.validateQueueLimits(1, 501 * 1024 * 1024),
  }));
  expect(limitMessages.files).toContain('5,000 files');
  expect(limitMessages.bytes).toContain('500 MB');
  const expected = Buffer.from('The quick brown fox jumps over the lazy dog.\n'.repeat(400));

  for (const algorithm of ['store', 'deflate', 'lzma', 'zstd']) {
    await page.locator('#fileInput').setInputFiles({
      name: 'café-文件.txt',
      mimeType: 'text/plain',
      buffer: expected,
    });
    await page.locator('#algorithmTrigger').click();
    await page.locator(`.algo-option[data-value="${algorithm}"]`).click();
    await page.locator('#generateBtn').click();
    await expect(page.locator('#doneState')).not.toHaveClass(/hidden/, { timeout: 30_000 });
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#downloadBtn').click();
    const download = await downloadPromise;
    const archivePath = testInfo.outputPath(`${algorithm}.zip`);
    await download.saveAs(archivePath);

    const archive = readFileSync(archivePath);
    const flags = archive.readUInt16LE(6);
    const method = archive.readUInt16LE(8);
    const compressedSize = archive.readUInt32LE(18);
    const nameLength = archive.readUInt16LE(26);
    const extraLength = archive.readUInt16LE(28);
    const payloadOffset = 30 + nameLength + extraLength;
    const payload = archive.subarray(payloadOffset, payloadOffset + compressedSize);
    expect(flags & 0x0800).toBe(0x0800);

    if (method === 0) expect(payload).toEqual(expected);
    if (method === 8) expect(inflateRawSync(payload)).toEqual(expected);
    if (method === 14) {
      const output = execFileSync('python3', [
        '-c',
        'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); i=z.infolist()[0]; assert i.filename == "café-文件.txt"; sys.stdout.buffer.write(z.read(i))',
        archivePath,
      ]);
      expect(output).toEqual(expected);
    }
    if (method === 93) expect(zstdDecompressSync(payload)).toEqual(expected);
    await page.locator('#clearBtn').click();
  }
});

test('regex evaluation is interrupted before a catastrophic pattern freezes the page', async ({ page }) => {
  await page.goto('/tools/regex-tester/');
  await page.locator('#regexInput').fill('(a+)+$');
  await page.locator('#textInput').fill(`${'a'.repeat(60_000)}!`);
  await page.locator('#textInput').dispatchEvent('input');
  await expect(page.locator('#regexError')).toContainText('exceeded 300 ms', { timeout: 3_000 });
  expect(await page.evaluate(() => document.body.dataset.responsive = 'yes')).toBe('yes');
});

test('large text comparisons use bounded memory and finish promptly', async ({ page }) => {
  await page.goto('/tools/text-diff/');
  const result = await page.evaluate(() => {
    const left = Array.from({ length: 2_500 }, (_, index) => `left-${index}`);
    const right = Array.from({ length: 2_500 }, (_, index) => `right-${index}`);
    const started = performance.now();
    const operations = diffSequence(left, right);
    return { elapsed: performance.now() - started, count: operations.length };
  });
  expect(result.count).toBe(5_000);
  expect(result.elapsed).toBeLessThan(1_000);
});

test('SQL formatter still formats input after copied handlers were removed', async ({ page }) => {
  await page.goto('/tools/sql-formatter/');
  await page.locator('#editor').fill('select id,name from users where active=true order by name');
  await page.locator('#editor').dispatchEvent('input');
  await expect(page.locator('#output-editor')).toHaveValue(/SELECT[\s\S]+FROM[\s\S]+WHERE/i);
});

test('mobile sidebar collapse fills the viewport and ID controls do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#collapseBtn').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  const dashboardLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    mainWidth: document.querySelector('main').getBoundingClientRect().width,
  }));
  expect(dashboardLayout.scrollWidth).toBe(dashboardLayout.clientWidth);
  expect(dashboardLayout.mainWidth).toBeGreaterThan(340);

  await page.goto('/tools/id-generator/');
  const idLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(idLayout.scrollWidth).toBe(idLayout.clientWidth);
});

test('every tool loads without local errors, duplicate IDs, or nameless visible controls', async ({ page }) => {
  const pageErrors = [];
  const localFailures = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:4173') && response.status() >= 400) {
      localFailures.push(`${response.status()} ${response.url()}`);
    }
  });

  for (const route of TOOL_ROUTES) {
    await page.goto(`/tools/${route}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').first()).toBeVisible();
    const audit = await page.evaluate(() => {
      const duplicateIds = [...document.querySelectorAll('[id]')]
        .map((element) => element.id)
        .filter((id, index, ids) => ids.indexOf(id) !== index);
      const controls = [...document.querySelectorAll('button, input:not([type="hidden"]), textarea, select, [contenteditable="true"]')]
        .filter((element) => element.getClientRects().length > 0);
      const nameless = controls.filter((element) => {
        if (element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.title) return false;
        if (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) return false;
        if (element.closest('label')) return false;
        if (element.matches('button') && element.textContent.trim()) return false;
        if (element.placeholder) return false;
        return true;
      }).map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`);
      return { duplicateIds: [...new Set(duplicateIds)], nameless };
    });
    expect(audit.duplicateIds, `${route} has duplicate IDs`).toEqual([]);
    expect(audit.nameless, `${route} has nameless controls`).toEqual([]);
  }

  expect(localFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// --- Fixes from the 2026-09-19 review ---------------------------------------

test('the JWT copy buttons keep their own targets when the algorithm changes', async ({ page }) => {
  // updateSecretSections() used to grab the first [data-copy-target] in the
  // document — the Copy Header button — and repoint it at the signing key, so
  // "Copy Header" put the secret (or the RSA private key) on the clipboard.
  await page.goto('/tools/jwt-debugger/');
  const targets = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('[data-copy-target]')].map((button) => [button.dataset.copyTarget, true])
  ));
  const headerTarget = () => page.evaluate(() =>
    document.querySelector('[title^="Copy Header"]').dataset.copyTarget);

  expect(await headerTarget()).toBe('headerJson');
  for (const algorithm of ['RS256', 'ES256', 'PS256', 'HS256']) {
    await page.selectOption('#algoSelect', algorithm);
    expect(await headerTarget(), `Copy Header leaked the key for ${algorithm}`).toBe('headerJson');
  }
  expect(await targets()).toHaveProperty('secretTextarea');
});

test('the JWT status never claims an unverified signature is intact', async ({ page }) => {
  await page.goto('/tools/jwt-debugger/');
  const status = () => page.locator('.status-label').textContent();

  // Decoding alone proves nothing about the signature.
  expect(await status()).not.toMatch(/intact/i);
  expect(await status()).toMatch(/not verified/i);

  // Editing the payload leaves the old signature covering content it no longer
  // signs; that used to still report a checkmark.
  await page.evaluate(() => {
    const payload = document.getElementById('payloadJson');
    payload.textContent = JSON.stringify({ sub: '1', name: 'Edited', exp: 2000000000 }, null, 2);
    payload.dispatchEvent(new Event('input'));
  });
  expect(await status()).toMatch(/no longer matches/i);

  // A missing key now reports instead of failing silently.
  await page.fill('#secretTextarea', '');
  await page.click('#verifyBtn');
  await expect(page.locator('#toast-container .toast')).toHaveText(/Secret is required/i);
});

test('generated Nano IDs keep their mixed-case alphabet', async ({ page }) => {
  // The case toggle was applied to every ID type, so nanoid output was
  // lowercased — dropping it from a 64-character alphabet to 38.
  await page.goto('/tools/id-generator/');
  await page.selectOption('#id-type', 'nanoid');
  await page.fill('#count-input', '12');
  await page.click('#generate-btn');

  const ids = (await page.locator('#output-area').textContent()).trim().split('\n');
  expect(ids).toHaveLength(12);
  expect(ids.every((id) => id.length === 21)).toBe(true);
  expect(ids.some((id) => /[A-Z]/.test(id)), 'nanoid output was case-folded').toBe(true);

  // Neither case option may be forced onto a mixed-case format.
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll('.case-option')].every((button) => button.disabled));
  expect(disabled).toBe(true);
});

test('selecting ULID does not leave later ID types uppercased', async ({ page }) => {
  await page.goto('/tools/id-generator/');
  await page.selectOption('#id-type', 'ulid');
  await page.click('#generate-btn');
  await page.selectOption('#id-type', 'uuid-v4');
  await page.fill('#count-input', '3');
  await page.click('#generate-btn');

  const ids = (await page.locator('#output-area').textContent()).trim().split('\n');
  expect(ids.every((id) => id === id.toLowerCase()), 'UUIDs inherited ULID casing').toBe(true);
});

test('the regex sample text contains real newlines', async ({ page }) => {
  // The sample was built with '\\n' inside single quotes, so it loaded as one
  // line of literal backslash-n and the m/s flags had nothing to act on.
  await page.goto('/tools/regex-tester/');
  await page.click('#sampleBtn');

  const text = await page.locator('#textInput').inputValue();
  expect(text).not.toContain('\\n');
  expect(text.split('\n').length).toBeGreaterThan(5);
});

test('the Toon sample parses back to the JSON it came from', async ({ page }) => {
  // The hand-written Toon sample had no indentation, so Load Sample produced an
  // empty output pane and the status bar still read "Ready".
  await page.goto('/tools/json-toon-converter/#toon-json');
  await page.click('[data-action="load-sample"]');

  await expect(page.locator('#left-status .status-text')).toHaveText(/Valid Toon/);
  const parsed = JSON.parse(await page.locator('#right-editor').inputValue());
  expect(parsed.person.hobbies).toEqual(['reading', 'coding', 'traveling']);
  expect(parsed.person.address.city).toBe('New York');
});

test('invalid Toon input reports the parse error instead of resetting to Ready', async ({ page }) => {
  await page.goto('/tools/json-toon-converter/#toon-json');
  await page.locator('#left-editor').fill('person:\n  name: "unterminated\n  junk');
  await page.locator('#left-editor').dispatchEvent('input');

  await expect(page.locator('#left-status .status-text')).toHaveClass(/error/);
  await expect(page.locator('#left-status .status-text')).toHaveText(/^✗/);
  await expect(page.locator('#right-editor')).toHaveValue('');
});

test('unit conversions too small for the precision show exponent form, not zero', async ({ page }) => {
  // toFixed(4) flattened 1 J in kWh (2.78e-7) to a flat "0".
  await page.goto('/tools/unit-converter/#energy');
  await page.locator('#value-input').fill('1');
  await page.locator('#value-input').dispatchEvent('input');

  const readings = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.result-row')].map((row) => [
      row.querySelector('.result-row-key').textContent,
      row.querySelector('.result-row-value').textContent,
    ])
  ));
  expect(readings.kWh).toMatch(/^2\.7+8e-7$/);
  expect(readings.eV).toMatch(/e\+18$/);
  // Ordinary magnitudes keep their grouped decimal formatting.
  expect(readings.kJ).toBe('0.001');
});

test('hashes cover the input verbatim, including surrounding whitespace', async ({ page }) => {
  // The input was trimmed before hashing, so digests silently disagreed with
  // sha256sum for anything with leading or trailing whitespace.
  await page.goto('/tools/crypto-generator/');
  await page.click('.mode-tab[data-mode="hashes"]');
  await page.selectOption('#algoSelect', 'sha256');

  // Hashing is debounced, so wait for the digest to settle on each input.
  const digestOf = async (value, expected) => {
    await page.fill('#hashInput', value);
    await expect.poll(() => page.locator('.hash-value').first().textContent()).toBe(expected);
    return page.locator('.hash-value').first().textContent();
  };

  // Vectors from node:crypto — the trailing space must change the digest.
  await digestOf('abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await digestOf('abc ', '5488613c42b0d34d60f7aa9e94be317a3ee102a2bbd91ccc73cc79fbc2269955');
  await digestOf(' abc', 'd92b1cb3a32147b86a4db0647e4bf6eda6cf160fd3b2da264c5b088c9f9ccbfa');
});

test('the bulk password count accepts multi-digit typing', async ({ page }) => {
  // Clamping on every input event rewrote the field mid-keystroke, so typing
  // "15" from empty produced "1000".
  await page.goto('/tools/crypto-generator/');
  await page.evaluate(() => {
    const toggle = document.getElementById('bulkToggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const field = page.locator('#bulkCount');
  await field.fill('');
  await field.pressSequentially('15');
  await expect(field).toHaveValue('15');
  await expect(page.locator('#bulkDownloadBtn')).toHaveText(/Download 15 passwords/);

  // Out-of-range entries still snap once the field is committed.
  await field.fill('9999');
  await field.blur();
  await expect(field).toHaveValue('1000');
});

test('password strength reflects the alphabet, not just the toggles', async ({ page }) => {
  await page.goto('/tools/crypto-generator/');
  const label = page.locator('#strengthText');
  const setLength = (n) => page.locator('#lengthSlider').fill(String(n));

  await page.locator('#optNumbers').check({ force: true });
  await page.locator('#optSymbols').check({ force: true });

  // 32 chars over the full alphabet is ~200 bits; it must not read "Balanced".
  await setLength(32);
  await expect(label).toHaveText('Elite');

  // A short lowercase-only password is genuinely weak.
  await page.locator('#optNumbers').uncheck({ force: true });
  await page.locator('#optSymbols').uncheck({ force: true });
  await page.locator('input[name="alphaCase"][value="lower"]').check({ force: true });
  await setLength(8);
  await expect(label).toHaveText('Weak');

  // Case selection changes the alphabet, so it must change the score.
  // 16 chars: 26 symbols -> ~75 bits (Balanced), 52 symbols -> ~91 bits (Strong).
  await setLength(16);
  const lowerOnly = await label.textContent();
  await page.locator('input[name="alphaCase"][value="mixed"]').check({ force: true });
  await setLength(16);
  const mixedCase = await label.textContent();
  expect([lowerOnly, mixedCase]).toEqual(['Balanced', 'Strong']);
});

test('an oversized v3/v5 namespace reports instead of failing silently', async ({ page }) => {
  // normalizedNamespace fed an odd-length string to hexToBytes, which returned
  // null and threw, leaving an empty output pane and an unhandled rejection.
  const rejections = [];
  page.on('pageerror', (error) => rejections.push(error.message));
  await page.goto('/tools/id-generator/');
  await page.selectOption('#id-type', 'uuid-v5');
  await page.fill('#namespace-input', 'a'.repeat(33));
  await page.fill('#name-input', 'test');
  await page.click('#generate-btn');

  await expect(page.locator('#toast')).toHaveText(/128-bit UUID/);
  expect(rejections).toEqual([]);

  // A well-formed namespace still produces the standard RFC 4122 v5 value.
  await page.fill('#namespace-input', '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
  await page.fill('#name-input', 'www.example.com');
  await page.fill('#count-input', '1');
  await page.click('#generate-btn');
  await expect(page.locator('#output-area')).toHaveText('2ed6657d-e927-568b-95e1-2665a8aea6a2');
});

test('SQL minify never fuses operators into a comment', async ({ page }) => {
  // "1 - -1" collapsed to "1--1", commenting out the rest of the statement.
  await page.goto('/tools/sql-formatter/');
  await page.click('.toolbar-btn[data-tooltip="Settings"]');
  await page.check('#minify');
  await page.locator('#editor').fill('SELECT 1 - -1 AS v FROM t;');
  await page.locator('#editor').dispatchEvent('input');

  const output = page.locator('#output-editor');
  await expect(output).not.toHaveValue(/--/);
  await expect(output).toHaveValue(/1 - -1/);
  // Punctuation is still tightened, so minify keeps doing its job.
  await page.locator('#editor').fill('SELECT a ,  b FROM t WHERE x = 1;');
  await page.locator('#editor').dispatchEvent('input');
  await expect(output).toHaveValue('SELECT a,b FROM t WHERE x=1;');
});

test('SQL comment removal survives apostrophes and respects string literals', async ({ page }) => {
  // The quote scanner had no comment state, so "-- don't" opened a phantom
  // string literal and corrupted the rest of the statement.
  await page.goto('/tools/sql-formatter/');
  await page.click('.toolbar-btn[data-tooltip="Settings"]');
  await page.check('#removeComments');
  const editor = page.locator('#editor');
  const output = page.locator('#output-editor');

  await editor.fill("SELECT a -- don't do this\nFROM t WHERE b = 'x';");
  await editor.dispatchEvent('input');
  await expect(output).not.toHaveValue(/Formatting error/);
  await expect(output).toHaveValue(/'x'/);
  await expect(output).not.toHaveValue(/don't/);

  // A comment marker inside a string literal is data, not a comment.
  await editor.fill("SELECT '-- not a comment' AS s FROM t;");
  await editor.dispatchEvent('input');
  await expect(output).toHaveValue(/'-- not a comment'/);

  // A block comment stands in for whitespace rather than vanishing.
  await editor.fill('SELECT a/*x*/b FROM t;');
  await editor.dispatchEvent('input');
  await expect(output).not.toHaveValue(/\bab\b/);
});

test('the base converter does not toast on page load', async ({ page }) => {
  await page.goto('/tools/base-converter/', { waitUntil: 'commit' });
  const seen = await page.evaluate(async () => {
    const found = [];
    for (let i = 0; i < 40; i++) {
      const container = document.getElementById('toast-container');
      if (container) [...container.children].forEach((node) => found.push(node.textContent));
      if (found.length) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return found;
  });
  expect(seen).toEqual([]);
  // The sample is still seeded, just without the announcement.
  await expect(page.locator('#text-input')).toHaveValue('Hello');

  // An explicit sample click still confirms itself.
  await page.click('.action-btn[data-action="paste-sample"]');
  await expect(page.locator('#toast-container .toast')).toHaveText(/Loaded sample input/);
});

test('HTML preview CSS cannot close its own style block', async ({ page }) => {
  await page.goto('/tools/html-preview/');
  await page.evaluate(() => {
    cssEditor.setValue('body::after { content: "</style>"; color: red; }');
    htmlEditor.setValue('<p id="probe">hello</p>');
  });
  await expect.poll(async () => page.evaluate(() => {
    const doc = document.getElementById('preview-iframe').srcdoc;
    const first = doc.indexOf('</style>');
    return first === doc.lastIndexOf('</style>');
  })).toBe(true);

  const leaked = await page.evaluate(() => {
    const doc = document.getElementById('preview-iframe').srcdoc;
    return doc.slice(doc.indexOf('</style>'), doc.indexOf('</style>') + 40);
  });
  expect(leaked).not.toMatch(/color: red/);
});
