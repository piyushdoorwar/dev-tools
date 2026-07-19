import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getPublicAssets } from './public-assets.mjs';

const scripts = (await getPublicAssets()).filter((asset) =>
  asset.endsWith('.js') && !asset.endsWith('.min.js') && asset !== 'sw.js');

for (const script of scripts) {
  execFileSync(process.execPath, ['--check', path.resolve(script)], { stdio: 'inherit' });
}
