import { readFile } from 'node:fs/promises';
import { getPublicAssets } from './public-assets.mjs';

const htmlFiles = (await getPublicAssets()).filter((asset) => asset.endsWith('.html'));
const cssFiles = (await getPublicAssets()).filter((asset) => asset.endsWith('.css'));
const failures = [];

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, 'utf8');
  const externalTags = html.match(/<(?:script|link)\b[^>]*(?:src|href)=["']https:\/\/[^>]+>/gi) || [];
  for (const tag of externalTags) {
    if (!/\bintegrity=["']sha384-/i.test(tag) || !/\bcrossorigin=["']anonymous["']/i.test(tag)) {
      failures.push(`${htmlFile}: external asset is missing SHA-384 integrity metadata: ${tag}`);
    }
  }
}

for (const cssFile of cssFiles) {
  const css = await readFile(cssFile, 'utf8');
  if (/@import\s+(?:url\()?['"]?https:\/\//i.test(css)) {
    failures.push(`${cssFile}: external CSS imports are not integrity protected`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
