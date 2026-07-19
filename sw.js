/* global PRECACHE_ASSETS */
importScripts('./precache-manifest.js');

const CACHE_NAME = 'dev-tools-v15';
const CORE_ASSETS = ['./', './index.html', './app.js', './styles.css', './manifest.json', './favicon.svg'];
const EXTERNAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.4.12/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/marked@18.0.6/lib/marked.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/qr-code-styling@1.6.0/lib/qr-code-styling.js',
  'https://unpkg.com/sql-formatter@15.4.2/dist/sql-formatter.min.js',
];

async function cacheOptionalAssets(cache, assets) {
  await Promise.allSettled(assets.map(async (asset) => {
    const response = await fetch(asset, { mode: asset.startsWith('http') ? 'cors' : 'same-origin' });
    if (!response.ok && response.type !== 'opaque') throw new Error(`Unable to cache ${asset}`);
    await cache.put(asset, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await cacheOptionalAssets(cache, [...PRECACHE_ASSETS, ...EXTERNAL_ASSETS]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName !== CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request, event) {
  const cached = await caches.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok || response.type === 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';
  event.respondWith(isNavigation
    ? networkFirst(event.request)
    : staleWhileRevalidate(event.request, event));
});
