# Servicios
Página para llevar el registro de facturas a pagar (PWA, sin build, ES Modules nativos).

- Servir la carpeta con cualquier servidor estático (`python3 -m http.server`).
- `npm test` valida la arquitectura (capas, ciclos, precache del Service Worker).
- `npm run release` sube la versión y regenera el precache.
- Arquitectura y plan de migración: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
