import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
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
