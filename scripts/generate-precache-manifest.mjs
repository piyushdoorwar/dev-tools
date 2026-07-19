import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderPrecacheManifest } from './precache.mjs';
import { getPublicAssets } from './public-assets.mjs';

const rootDirectory = process.cwd();
const outputPath = path.join(rootDirectory, 'precache-manifest.js');
const assets = (await getPublicAssets(rootDirectory))
  .filter((asset) => asset !== 'precache-manifest.js');
const contents = renderPrecacheManifest(assets);

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== contents) {
    console.error('precache-manifest.js is out of date. Run npm run precache.');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, contents);
}
