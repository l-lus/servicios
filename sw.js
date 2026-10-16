// Prefijo propio: el origen (GitHub Pages) es compartido con otras apps,
// así que solo se tocan las cachés que empiezan con CACHE_PREFIX
// (CACHE_NAME tiene que empezar con ese prefijo).
const CACHE_NAME = 'SERVICIOS-v261016.0042';
const CACHE_PREFIX = 'SERVICIOS-';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './app.js',
  './styles.css',
  './flash.js',
];

// Instalación: cache: 'reload' evita que addAll tome versiones viejas de la
// caché HTTP. skipWaiting solo si todo se cacheó: si falla, la versión
// anterior sigue activa con su caché completa.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.error('SW: error cacheando archivos críticos:', err);
        throw err;
      })
  );
});

// Activación: borra solo las cachés viejas de esta app
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres
          .filter(nombre => nombre.startsWith(CACHE_PREFIX) && nombre !== CACHE_NAME)
          .map(nombre => caches.delete(nombre))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first sobre la caché de esta app, fallback a red
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  // Fuera del scope del SW (otras apps del mismo origen): no intervenir
  if (!url.href.startsWith(self.registration.scope)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request, { ignoreSearch: true }).then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') return cache.match('./index.html');
            return Response.error();
          });
      })
    )
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
