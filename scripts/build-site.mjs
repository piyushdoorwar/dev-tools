import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { injectCacheVersion, resolveCacheVersion } from './cache-version.mjs';
import {
  downloadExternalAssets,
  EXTERNAL_ASSETS,
  localizeExternalReferences,
} from './external-assets.mjs';
import { renderPrecacheManifest } from './precache.mjs';
import { getPublicAssets } from './public-assets.mjs';

const rootDirectory = process.cwd();
const outputDirectory = path.join(rootDirectory, 'dist');
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const publicAssets = await getPublicAssets(rootDirectory);
for (const asset of publicAssets) {
  const target = path.join(outputDirectory, asset);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(rootDirectory, asset), target);
}

await downloadExternalAssets(outputDirectory);

for (const htmlAsset of publicAssets.filter((asset) => asset.endsWith('.html'))) {
  const htmlPath = path.join(outputDirectory, htmlAsset);
  const html = await readFile(htmlPath, 'utf8');
  const localizedHtml = localizeExternalReferences(html, htmlAsset);
  const externalTags = localizedHtml.match(/<(?:script|link)\b[^>]*(?:src|href)=["']https:\/\/[^>]+>/gi);
  if (externalTags) {
    throw new Error(`${htmlAsset} contains an unvendored external asset: ${externalTags[0]}`);
  }
  await writeFile(htmlPath, localizedHtml);
}

const precacheAssets = [...publicAssets, ...EXTERNAL_ASSETS.map((asset) => asset.output)].sort();
await writeFile(
  path.join(outputDirectory, 'precache-manifest.js'),
  renderPrecacheManifest(precacheAssets),
);

const cacheVersion = resolveCacheVersion();
const serviceWorkerPath = path.join(outputDirectory, 'sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
await writeFile(serviceWorkerPath, injectCacheVersion(serviceWorker, cacheVersion));
console.log(
  `Built deployment with cache dev-tools-v${cacheVersion} and ${EXTERNAL_ASSETS.length} vendored assets`,
);
