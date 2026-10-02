import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT_ASSETS = new Set([
  '404.html',
  'analytics.js',
  'app.js',
  'favicon.svg',
  'index.html',
  'manifest.json',
  'styles.css',
  'sw.js',
  'social-preview.png',
  'tool-catalog.js',
]);
const PUBLIC_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.png', '.svg']);
// Shared static assets (self-hosted fonts and their licence) live in assets/.
const ASSET_EXTENSIONS = new Set([...PUBLIC_EXTENSIONS, '.woff2', '.txt']);

async function walk(directory, rootDirectory, extensions = PUBLIC_EXTENSIONS) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolute, rootDirectory, extensions));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(path.relative(rootDirectory, absolute).split(path.sep).join('/'));
    }
  }
  return files;
}

export async function getPublicAssets(rootDirectory = process.cwd()) {
  const toolAssets = await walk(path.join(rootDirectory, 'tools'), rootDirectory);
  const sharedAssets = await walk(path.join(rootDirectory, 'assets'), rootDirectory, ASSET_EXTENSIONS);
  return [...ROOT_ASSETS, ...sharedAssets, ...toolAssets].sort();
}
