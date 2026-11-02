# Servicios
Página para llevar el registro de facturas a pagar (PWA, sin build, ES Modules nativos).

- `./iniciar.sh` (Linux/Mac), `iniciar.ps1` o `iniciar.bat` (Windows): sirve la app en http://127.0.0.1:8002 sin caché (`./iniciar.sh 8060 0.0.0.0` para otro puerto o la red local).
- `npm test` valida la arquitectura (capas, ciclos, precache del Service Worker).
- `npm run release` sube la versión y regenera el precache.
- Arquitectura y plan de migración: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
- Avisos push de vencimientos (diseño pendiente): [docs/PUSH-VENCIMIENTOS.md](docs/PUSH-VENCIMIENTOS.md).
