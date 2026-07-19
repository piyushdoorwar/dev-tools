import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateRawSync, zstdDecompressSync } from 'node:zlib';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__DEV_TOOLS_DISABLE_SERVICE_WORKER__ = true;
  });
});

const TOOL_ROUTES = [
  'base-converter',
  'crypto-generator',
  'fake-data-generator',
  'file-compressor',
  'html-preview',
  'id-generator',
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
  await expect(page).toHaveURL(/#markdown-editor$/);

  await page.locator('#brandHome').click();
  const recent = page.locator('#recentTools [data-tool-id="markdown-editor"]');
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(page.locator('iframe[data-tool-id="markdown-editor"]')).toHaveClass(/is-visible/);
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

test('markdown preview renders formatting and strips executable HTML', async ({ page }) => {
  await page.goto('/tools/markdown-editor/');
  await page.evaluate(() => { window.__markdownXss = false; });
  await page.locator('#editor').fill('**safe**\n\n<img src=x onerror="window.__markdownXss=true">');
  await page.locator('#editor').dispatchEvent('input');
  await expect(page.locator('#preview strong')).toHaveText('safe');
  await expect(page.locator('#preview img')).not.toHaveAttribute('onerror', /.+/);
  expect(await page.evaluate(() => window.__markdownXss)).toBe(false);
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
