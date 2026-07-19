import assert from 'node:assert/strict';
import test from 'node:test';
import { injectCacheVersion, resolveCacheVersion } from '../scripts/cache-version.mjs';

test('uses an explicit cache version first', () => {
  assert.equal(resolveCacheVersion({ CACHE_VERSION: '92', GITHUB_RUN_NUMBER: '57' }), '92');
});

test('uses the GitHub workflow run number for deployments', () => {
  assert.equal(resolveCacheVersion({ GITHUB_RUN_NUMBER: '57' }), '57');
});

test('keeps local builds deterministic', () => {
  assert.equal(resolveCacheVersion({}), '16');
});

test('rejects unsafe cache versions', () => {
  assert.throws(() => resolveCacheVersion({ CACHE_VERSION: '../bad' }), /positive integer/);
  assert.throws(() => resolveCacheVersion({ CACHE_VERSION: '0' }), /positive integer/);
});

test('rewrites only the deployment cache declaration', () => {
  const source = "const CACHE_NAME = 'dev-tools-v16';\nconst value = 'dev-tools-v16';\n";
  assert.equal(
    injectCacheVersion(source, '57'),
    "const CACHE_NAME = 'dev-tools-v57';\nconst value = 'dev-tools-v16';\n",
  );
});
