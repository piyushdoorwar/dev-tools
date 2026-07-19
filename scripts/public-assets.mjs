import { readdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT_ASSETS = new Set([
  '404.html',
  'app.js',
  'favicon.svg',
  'index.html',
  'manifest.json',
  'styles.css',
  'sw.js',
]);
const PUBLIC_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.svg']);

async function walk(directory, rootDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolute, rootDirectory));
    } else if (PUBLIC_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.relative(rootDirectory, absolute).split(path.sep).join('/'));
    }
  }
  return files;
}

export async function getPublicAssets(rootDirectory = process.cwd()) {
  const toolAssets = await walk(path.join(rootDirectory, 'tools'), rootDirectory);
  return [...ROOT_ASSETS, ...toolAssets].sort();
}
