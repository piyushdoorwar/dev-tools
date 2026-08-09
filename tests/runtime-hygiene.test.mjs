import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('application code does not register deprecated unload handlers', async () => {
  const files = [
    'app.js',
    'index.html',
    'tools/image-converter/script.js',
  ];
  for (const file of files) {
    const contents = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(contents, /(?:beforeunload|addEventListener\s*\(\s*['"]unload['"])/i, file);
  }
});
