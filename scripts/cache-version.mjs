const LOCAL_CACHE_VERSION = 16;

export function resolveCacheVersion(environment = process.env) {
  const candidate = environment.CACHE_VERSION
    ?? environment.GITHUB_RUN_NUMBER
    ?? LOCAL_CACHE_VERSION;
  const version = String(candidate).trim();

  if (!/^[1-9]\d*$/.test(version)) {
    throw new Error(`Cache version must be a positive integer, received: ${version || '(empty)'}`);
  }

  return version;
}

export function injectCacheVersion(serviceWorker, version) {
  const declaration = /const CACHE_NAME = 'dev-tools-v\d+';/;
  if (!declaration.test(serviceWorker)) {
    throw new Error('Unable to find the service-worker cache declaration');
  }
  return serviceWorker.replace(declaration, `const CACHE_NAME = 'dev-tools-v${version}';`);
}
