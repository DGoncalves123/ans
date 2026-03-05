const CACHE_NAME = 'mz2synth-cache-v1';
const sw = globalThis;

// These URLs are cached at install time to make the app installable/offline-capable.
const CORE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.ico',
  'pwa-icon.svg',
  'mz2synth.js',
  'mz2synth.wasm',
  'synth-worker.js',
];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_URLS))
  );
  sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  sw.clients.claim();
});

const isNavigationRequest = (request) => request.mode === 'navigate';

const shouldPersistForever = (url) => {
  if (url.origin !== sw.location.origin) {
    return false;
  }

  // Cache build artifacts and static assets indefinitely.
  return (
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webmanifest')
  );
};

sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(event.request);
          return cached || cache.match('./');
        })
    );
    return;
  }

  if (!shouldPersistForever(requestUrl)) {
    return;
  }

  // Cache-first strategy: once fetched, items stay cached until CACHE_NAME changes.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
