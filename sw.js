// Prefijo propio: el origen (GitHub Pages) es compartido con otras apps,
// así que solo se tocan las cachés que empiezan con CACHE_PREFIX
// (CACHE_NAME tiene que empezar con ese prefijo).
const CACHE_PREFIX = 'SERVICIOS-';
const CACHE_NAME = `${CACHE_PREFIX}v261101.2243`;

const urlsToCache = [
  './',
  './index.html',
  './src/core/almacenamiento.js',
  './src/core/constantes.js',
  './src/core/debounce.js',
  './src/core/eventos.js',
  './src/core/fechas.js',
  './src/core/formato.js',
  './src/core/movimiento.js',
  './src/core/seguridad.js',
  './src/core/tema-inicial.js',
  './src/main.js',
  './src/services/calculadora.js',
  './src/services/estado-app.js',
  './src/services/estado-facturas.js',
  './src/services/gestor-perfiles.js',
  './src/services/importar-exportar.js',
  './src/services/pila-historial.js',
  './src/services/reportes-texto.js',
  './src/services/resumen-mes.js',
  './src/ui/animaciones.js',
  './src/ui/calculador-service.js',
  './src/ui/categoria-service.js',
  './src/ui/custom-select.js',
  './src/ui/estadisticas-service.js',
  './src/ui/factura-service.js',
  './src/ui/gestion-servicios.js',
  './src/ui/gestor-modales.js',
  './src/ui/gestos.js',
  './src/ui/gist-service.js',
  './src/ui/historial-manager.js',
  './src/ui/ingreso-service.js',
  './src/ui/instalador-pwa.js',
  './src/ui/listeners-app.js',
  './src/ui/menu-contextual.js',
  './src/ui/perfil-service.js',
  './src/ui/servicio-service.js',
  './src/ui/storage-service.js',
  './src/ui/toast.js',
  './src/ui/ui-manager.js',
  './src/ui/utils-service.js',
  './src/ui/vista-servicios.js',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/icon.svg',
  './assets/manifest.json',
  './assets/styles/app.css',
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
