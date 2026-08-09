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
import {
  markInternalToolPage,
  renderHomePage,
  renderLlms,
  renderLlmsFull,
  renderRobots,
  renderSitemap,
  renderToolRoutePage,
  TOOL_CATALOG,
} from './seo.mjs';

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
  let localizedHtml = localizeExternalReferences(html, htmlAsset);
  const internalTool = TOOL_CATALOG.find((tool) => htmlAsset === `tools/${tool.toolPath}/index.html`);
  if (internalTool) localizedHtml = markInternalToolPage(localizedHtml, internalTool);
  const externalTags = (localizedHtml.match(/<(?:script|link)\b[^>]*(?:src|href)=["']https:\/\/[^>]+>/gi) || [])
    .filter((tag) => !/<link\b[^>]*\brel=["']canonical["']/i.test(tag));
  if (externalTags.length) {
    throw new Error(`${htmlAsset} contains an unvendored external asset: ${externalTags[0]}`);
  }
  await writeFile(htmlPath, localizedHtml);
}

const homePath = path.join(outputDirectory, 'index.html');
const homePage = renderHomePage(await readFile(homePath, 'utf8'));
await writeFile(homePath, homePage);

for (const tool of TOOL_CATALOG) {
  const routeDirectory = path.join(outputDirectory, tool.route);
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(path.join(routeDirectory, 'index.html'), renderToolRoutePage(homePage, tool));
}

await Promise.all([
  writeFile(path.join(outputDirectory, 'sitemap.xml'), renderSitemap()),
  writeFile(path.join(outputDirectory, 'robots.txt'), renderRobots()),
  writeFile(path.join(outputDirectory, 'llms.txt'), renderLlms()),
  writeFile(path.join(outputDirectory, 'llms-full.txt'), renderLlmsFull()),
]);

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
  `Built deployment with cache dev-tools-v${cacheVersion}, ${TOOL_CATALOG.length} indexable routes, and ${EXTERNAL_ASSETS.length} vendored assets`,
);
