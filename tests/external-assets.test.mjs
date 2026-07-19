import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EXTERNAL_ASSETS,
  fetchExternalAsset,
  localizeExternalReferences,
  verifyIntegrity,
} from '../scripts/external-assets.mjs';
import { getPublicAssets } from '../scripts/public-assets.mjs';

test('tracks every external script and stylesheet used by the source pages', async () => {
  const htmlFiles = (await getPublicAssets()).filter((asset) => asset.endsWith('.html'));
  const discoveredSources = new Set();

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const tags = html.match(/<(?:script|link)\b[^>]*(?:src|href)=["']https:\/\/[^>]+>/gi) || [];
    for (const tag of tags) {
      const source = tag.match(/(?:src|href)=["'](https:\/\/[^"']+)/i)?.[1];
      if (source) discoveredSources.add(source);
    }
  }

  assert.deepEqual(
    [...discoveredSources].sort(),
    EXTERNAL_ASSETS.filter((asset) => asset.htmlReference !== false).map((asset) => asset.source).sort(),
  );
});

test('uses unique versioned output paths and SHA-384 digests', () => {
  assert.equal(new Set(EXTERNAL_ASSETS.map((asset) => asset.source)).size, EXTERNAL_ASSETS.length);
  assert.equal(new Set(EXTERNAL_ASSETS.map((asset) => asset.output)).size, EXTERNAL_ASSETS.length);
  for (const asset of EXTERNAL_ASSETS) {
    assert.match(asset.output, /^vendor\/.+\/\d[^/]*\/.+/);
    assert.match(asset.integrity, /^sha384-[A-Za-z0-9+/]{64}$/);
  }
});

test('localizes asset URLs relative to each generated page', () => {
  const asset = EXTERNAL_ASSETS[0];
  const html = `<link href="${asset.source}">`;
  assert.equal(
    localizeExternalReferences(html, 'tools/markdown-editor/index.html'),
    '<link href="../../vendor/highlight.js/11.9.0/atom-one-dark.min.css">',
  );
});

test('checks downloaded bytes against their integrity digest', () => {
  const bytes = Buffer.from('known content');
  assert.equal(
    verifyIntegrity(bytes, 'sha384-YyPPYXGTm/DpIJSsl/WUz1yNYAP5poiO/wrFJoaaC3YXwQo04gUecQAAeykJSYmF'),
    true,
  );
  assert.equal(verifyIntegrity(Buffer.from('changed'), EXTERNAL_ASSETS[0].integrity), false);
});

test('retries transient external download failures', async () => {
  let attempts = 0;
  const response = await fetchExternalAsset('https://example.test/asset.js', async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('temporary network failure');
    return { ok: true, status: 200 };
  }, { attempts: 3, timeoutMs: 100 });

  assert.equal(response.ok, true);
  assert.equal(attempts, 3);
});
