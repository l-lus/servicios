// Prefijo propio: el origen (GitHub Pages) es compartido con otras apps,
// así que solo se tocan las cachés que empiezan con CACHE_PREFIX
// (CACHE_NAME tiene que empezar con ese prefijo).
const CACHE_PREFIX = 'SERVICIOS-';
const CACHE_NAME = `${CACHE_PREFIX}v261101.2251`;

const urlsToCache = [
  './',
  './index.html',
  './src/core/almacenamiento.js',
  './src/core/constantes.js',
  './src/core/debounce.js',
  './src/core/eventos.js',
  './src/core/fechas.js',
  './src/core/formato.js',
  './src/core/html.js',
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
  './src/ui/aviso-actualizacion.js',
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
  './assets/styles/base.css',
  './assets/styles/menus-modales.css',
  './assets/styles/tokens.css',
  './assets/styles/utilidades-responsivo.css',
  './assets/styles/vistas.css',
];

// Avisa a las pestañas abiertas cómo va la descarga de la versión nueva (la página muestra el aviso con barra de progreso)
function avisarAClientes(mensaje) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clientes => clientes.forEach(c => c.postMessage(mensaje)))
    .catch(() => { });
}

// Instalación: descarga todos los archivos en paralelo (sin usar la caché HTTP) e informa el avance.
// Es todo o nada: si falla uno, la instalación falla y se conserva la versión anterior.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const total = urlsToCache.length;
    let descargados = 0;
    let ultimoAviso = -1;
    const informar = () => {
      const porcentaje = Math.floor((descargados / total) * 100);
      if (porcentaje === ultimoAviso) return;
      ultimoAviso = porcentaje;
      avisarAClientes({ tipo: 'sw-progreso', progreso: porcentaje, version: CACHE_NAME });
    };
    try {
      informar();
      await Promise.all(urlsToCache.map(async url => {
        const respuesta = await fetch(new Request(url, { cache: 'reload' }));
        if (!respuesta.ok) throw new Error(`${url}: HTTP ${respuesta.status}`);
        await cache.put(url, respuesta);
        descargados++;
        informar();
      }));
    } catch (err) {
      console.error('SW: falló la descarga de archivos en el install:', err);
      await avisarAClientes({ tipo: 'sw-error', version: CACHE_NAME });
      throw err;
    }
    await self.skipWaiting();
  })());
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

  const matchOpts = { cacheName: CACHE_NAME, ignoreSearch: true };

  event.respondWith(
    caches.match(event.request, matchOpts).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(async () => {
          // Sin conexión: una navegación cae a la app precacheada; cualquier otro recurso falla como error de red
          if (event.request.mode === 'navigate') {
            const app = (await caches.match('./index.html', matchOpts)) || (await caches.match('./', matchOpts));
            if (app) return app;
          }
          return Response.error();
        });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
