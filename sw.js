const CACHE_NAME = 'SERVICIOS-v260602.0027'; 

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', event => {
  console.log('📦 SW: Instalando nueva versión...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ SW: Cache abierto:', CACHE_NAME);
        const cacheRequests = urlsToCache.map(url => {
          return new Request(url, { cache: 'reload' });
        });

        return cache.addAll(cacheRequests);
      })
      .catch(err => {
        console.error('❌ SW: Error cacheando archivos críticos:', err);
      })
  );
});
self.addEventListener('activate', event => {
  console.log('🔄 SW: Activando y limpiando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ SW: Borrando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});

// Escuchar mensajes (aunque con skipWaiting en install ya no es estrictamente necesario, se deja por compatibilidad)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
