/* global PRECACHE_ASSETS */
importScripts('./precache-manifest.js');

const CACHE_NAME = 'dev-tools-v16';
const CACHE_PREFIX = 'dev-tools-v';
const CORE_ASSETS = ['./', './index.html', './app.js', './styles.css', './manifest.json', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...new Set([...CORE_ASSETS, ...PRECACHE_ASSETS])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
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
    const fallback = (await caches.match(request)) || (await caches.match('./index.html'));
    return fallback || Response.error();
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
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  try {
    return await refresh;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const protocol = new URL(event.request.url).protocol;
  if (protocol !== 'http:' && protocol !== 'https:') return;
  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';
  event.respondWith(isNavigation
    ? networkFirst(event.request)
    : staleWhileRevalidate(event.request, event));
});
