# Directivas del proyecto

- Después de cada cambio en código, estilos o HTML: `npm run release` (sube `APP_VERSION`, `CACHE_NAME` y regenera `urlsToCache` de `sw.js`) y luego `npm test`.
- Capas: `core` → `services` → `ui` → `main.js`. Nunca importar hacia arriba. Detalle y plan en `docs/ARQUITECTURA.md`.
