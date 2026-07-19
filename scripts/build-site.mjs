import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { injectCacheVersion, resolveCacheVersion } from './cache-version.mjs';
import { getPublicAssets } from './public-assets.mjs';

const rootDirectory = process.cwd();
const outputDirectory = path.join(rootDirectory, 'dist');
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const asset of [...await getPublicAssets(rootDirectory), 'precache-manifest.js']) {
  const target = path.join(outputDirectory, asset);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(rootDirectory, asset), target);
}

const cacheVersion = resolveCacheVersion();
const serviceWorkerPath = path.join(outputDirectory, 'sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
await writeFile(serviceWorkerPath, injectCacheVersion(serviceWorker, cacheVersion));
console.log(`Built deployment with cache dev-tools-v${cacheVersion}`);
