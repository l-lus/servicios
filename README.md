# Servicios
Página para llevar el registro de facturas a pagar (PWA, sin build, ES Modules nativos).

- `./iniciar.sh` (Linux/Mac), `iniciar.ps1` o `iniciar.bat` (Windows): sirve la app en http://127.0.0.1:8002 sin caché (`./iniciar.sh 8060 0.0.0.0` para otro puerto o la red local).
- `npm test` valida la arquitectura (capas, ciclos, precache del Service Worker, CSP/Trusted Types, tokens CSS, IDs del DOM y servidor de desarrollo) y las reglas de dominio.
- `npm run release` sube la versión y regenera el precache.
- Arquitectura y plan de migración: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
- Avisos push de vencimientos (diseño pendiente): [docs/PUSH-VENCIMIENTOS.md](docs/PUSH-VENCIMIENTOS.md).
- Pendientes de seguridad, arquitectura y escalabilidad: [docs/PENDIENTES.md](docs/PENDIENTES.md).

## Funciones
Servicios y facturas con estados por vencimiento, calendario personalizable (7 estilos de marcado de días, popup flotante al pasar el mouse en PC y cambio de mes con rueda), resumen del mes con fondos ilustrados SVG y vista previa en vivo (resumen, calendario y tema en un mismo panel, con flechas, deslizamiento y rueda), estadísticas (mensual, individual y anual), calculadora, categorías, perfiles, ingresos, reportes (HTML/texto), respaldo (todo, mes o rango, con preferencias visuales incluidas salvo el tema, que es de cada dispositivo; cifrado opcional con frase) con resumen previo al restaurar (lo borrado en otro dispositivo se elimina al combinar, con confirmación), sincronización con Gist siempre cifrada con una frase (AES-GCM, PBKDF2), 8 temas, encabezado reubicable (arriba, abajo o a un costado), disposición orgánica de 2 o 3 columnas en PC (cada una con su propio orden) y orden propio en móvil, y ayuda con buscador. Funciona sin conexión.
