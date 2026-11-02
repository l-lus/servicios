# Arquitectura — Servicios

**Modelo:** el proyecto *horarios* (capas `core → services → ui → main.js`, grafo acíclico verificado por tests, sin build).

## Principios
1. **Sin build:** ES Modules nativos (`<script type="module" src="src/main.js">`).
2. **Capas con dependencias solo hacia abajo** (`core` < `services` < `ui` < `main.js`), verificado por `tests/architecture.test.mjs`. Sin ciclos.
3. **`services/` no toca el DOM**; habla con la UI por `EventosApp` (bus), puertos de formulario y callbacks `notify`.
4. **Offline-first:** todo archivo de `src/` y `assets/` va en `urlsToCache` de `sw.js` (lo regenera `npm run release`).
5. `core/` no conoce a la app: lo que necesita se inyecta (`StorageHelper.setProfileKeyResolver`).

## Estructura actual
```
index.html  sw.js  package.json  scripts/release.mjs  tests/  docs/
assets/{manifest.json, icons/, styles/app.css}
src/main.js
src/core/   constantes, eventos (EventosApp), seguridad (SecurityAndUtils), almacenamiento (StorageHelper),
            movimiento (Motion), debounce, tema-inicial (script clásico anti-parpadeo)
src/ui/     animaciones (Anim), gestos, toast, gestor-modales (ModalManager/BackNav), custom-select,
            instalador-pwa, gestion-servicios (orquestador) y las clases heredadas:
            factura-service, ingreso-service, menu-contextual, categoria-service, estadisticas-service,
            ui-manager, utils-service, perfil-service, calculador-service, gist-service,
            historial-manager, storage-service
src/core/   + fechas.js, formato.js (fechas ISO y formato es-AR, puros)
src/services/  estado-facturas (EstadoFacturas: estado, última factura, filtro y orden)
               resumen-mes (ResumenMes: resumen, borde, detalle y estadísticas mensuales)
               importar-exportar (ImportarExportar: validación, respaldo, hash, fusión y comparación)
               — puros: reciben `hoy` y los datos; probados en tests/*.test.mjs sin DOM
```

## Diagnóstico inicial (antes de migrar)
- `app.js` de 6.545 líneas en un IIFE; 13 clases que recibían `app` y lo usaban ~430 veces (`this.app.*`).
- `GestionServicios`: ~100 métodos, casi la mitad pasamanos (`foo(){ this.x.foo() }`).
- Dominio mezclado con DOM (`obtenerEstadoFactura` devolvía HTML), 30 `innerHTML` con escape manual, sin tests/tipos/CI.

## Plan
| Fase | Contenido | Estado |
|---|---|---|
| 1 | Módulos ES, `package.json`, tests de arquitectura, `release`, CI | ✅ |
| 2 | Extraer `core/` y utilidades genéricas de `ui/`; quitar `window.app` | ✅ |
| 3 | Mover dominio a `services/` sin DOM + tests. Hecho: estado de factura, resumen/estadísticas del mes, import/export/merge. Falta: calculadora y período, perfiles, historial, `EstadoApp` | 🔶 |
| 4 | Dividir `GestionServicios`, eliminar pasamanos y `this.app.*` | ⏳ |
| 5 | `html```/`montar` + Trusted Types, import/restore único, aviso de actualización, buscador de ayuda, CSS en capas, push opcional | ⏳ |

## Dónde poner código nuevo
- Función pura sin dominio ni DOM → `src/core/`.
- Regla de negocio, cálculo, API externa → `src/services/` (sin `document`).
- DOM, modales, eventos → `src/ui/`.
- Todo `.js` nuevo: import con extensión `.js` y `npm run release`.
