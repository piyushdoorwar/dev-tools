import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getPublicAssets } from '../scripts/public-assets.mjs';

const TOKEN = 'e9cd556fb46f4880a8842d37e2dfe3fb';
const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';

test('ships the configured Cloudflare Analytics loader', async () => {
  const [analytics, dashboard] = await Promise.all([
    readFile('analytics.js', 'utf8'),
    readFile('index.html', 'utf8'),
  ]);

  assert.match(analytics, new RegExp(TOKEN));
  assert.match(analytics, new RegExp(BEACON_URL.replaceAll('.', '\\.')));
  assert.match(dashboard, /<script src="\.\/analytics\.js"><\/script>/);
});

test('every standalone tool loads analytics through the shared tool script', async () => {
  const publicAssets = await getPublicAssets();
  const toolPages = publicAssets.filter((asset) => /^tools\/[^/]+\/index\.html$/.test(asset));
  assert.ok(toolPages.length > 0);

  for (const toolPage of toolPages) {
    const html = await readFile(toolPage, 'utf8');
    assert.match(html, /<script\b[^>]*src=["']\.\.\/main\.js["'][^>]*><\/script>/, `${toolPage} must load tools/main.js`);
  }

  const sharedToolScript = await readFile('tools/main.js', 'utf8');
  assert.match(sharedToolScript, /new URL\('\.\.\/analytics\.js'/);
});
