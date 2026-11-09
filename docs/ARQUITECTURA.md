# Arquitectura — Servicios

**Modelo:** el proyecto *horarios* (capas `data → core → services → ui → main.js`, grafo acíclico verificado por tests, sin build).

## Principios
1. **Sin build:** ES Modules nativos (`<script type="module" src="src/main.js">`).
2. **Capas con dependencias solo hacia abajo** (`data` < `core` < `services` < `ui` < `main.js`), verificado por `tests/architecture.test.mjs`. Sin ciclos.
3. **`services/` no toca el DOM**; habla con la UI por `EventosApp` (bus), puertos de formulario y callbacks `notify`.
4. **Offline-first:** todo archivo de `src/` y `assets/` va en `urlsToCache` de `sw.js` (lo regenera `npm run release`).
5. `core/` no conoce a la app: lo que necesita se inyecta (`StorageHelper.setProfileKeyResolver`).

## Estructura actual
```
index.html  sw.js  package.json  tsconfig.json  scripts/{release.mjs,servidor.py}  tests/  docs/
assets/{manifest.json, icons/, fonts/, styles/{tokens,base,vistas,menus-modales,utilidades-responsivo}.css}
src/main.js
src/data/   fondos (catálogo de ilustraciones SVG para la tarjeta de resumen)
src/core/   dom ($/$$/alClic), temas, estilo-calendario, estilo-tarjeta, preferencias, recarga,
            busqueda-texto, fechas, formato, html, constantes, eventos (EventosApp),
            seguridad (SecurityAndUtils), almacenamiento (StorageHelper), movimiento (Movimiento),
            debounce, tema-inicial (script clásico anti-parpadeo y pantalla de carga)
src/ui/     calendario-vista, vista-previa, tarjeta-fondos, popups, iconos-animados, recarga-gesto,
            orden-tarjetas, arrastre, bienvenida-modal, reporte-modal, respaldo-modal,
            resumen-merge, ayuda-buscador, gestor-temas, aviso-actualizacion, animaciones (Anim), gestos,
            toast, gestor-modales (ModalManager/BackNav), custom-select, instalador-pwa,
            gestion-servicios (orquestador), vista-servicios, listeners-app, servicio-service y:
            factura-service, ingreso-service, menu-contextual, categoria-service, estadisticas-service,
            ui-manager, utils-service, perfil-service, calculador-service, gist-service,
            historial-manager, storage-service
src/services/  calendario-vencimientos, resumen-anual, reporte-datos, reporte-html, orden-cards (todos puros)
               estado-facturas (EstadoFacturas: estado, última factura, filtro y orden)
               resumen-mes (ResumenMes: resumen, borde, detalle y estadísticas mensuales)
               importar-exportar (ImportarExportar: validación, respaldo con preferencias CONFIG_RESPALDO, hash, fusión y comparación)
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
| 3 | Dominio en `services/` sin DOM + tests: `EstadoFacturas`, `ResumenMes`, `ImportarExportar`, `Calculadora`, `ReportesTexto`, `GestorPerfiles`, `PilaHistorial` y el store `EstadoApp` | ✅ |
| 4 | `GestionServicios` (2.146 → 493 líneas): 75 pasamanos eliminados; vistas en `VistaServicios`, `ListenersApp`, `ServicioService` | ✅ |
| 5 | Hecho: `core/html.js` (`html```, `montar`, Trusted Types en la CSP), import/restore único (`ImportarExportar` + `CONFIG_RESPALDO`), CSS en 5 capas, versión dinámica, e2e en Firefox, `tsconfig.json`, `servidor.py` endurecido. Aviso de actualización con progreso (`aviso-actualizacion.js`, `instalador-pwa.js`, `sw.js` como en *horarios*). Todas las plantillas usan `html`` (escape automático; `crudo()` solo en lista blanca con test). Push de vencimientos: ver [PUSH-VENCIMIENTOS.md](PUSH-VENCIMIENTOS.md) | 🔶 |

## Funciones tomadas de Horarios
Aviso de actualización con progreso · ayuda con buscador · búsqueda sin acentos · 8 temas de color · calendario de vencimientos con 7 estilos de días (`data-estilo-calendario`), popup flotante al pasar el mouse y cambio de mes con rueda ·
vista previa en vivo (`VistaPrevia`) · fondos ilustrados SVG y estructura de estilo para la tarjeta de resumen · header flotante tipo píldora al hacer scroll en PC · pantalla de carga inicial (`html.cargando`) y gesto de recarga con fundido (`RecargaGesto`) ·
íconos animados (`IconosAnimados`) y llamado de atención de instalación PWA · modal de perfiles con alta colapsable flotante ·
reportes HTML · respaldo por rango, preferencias (`CONFIG_RESPALDO`) y resumen previo al merge · estadísticas anuales · bienvenida · disposición orgánica de 2 o 3 columnas en PC y orden independiente en móvil ·
tokens de diseño (Inter, escalas de texto/espacio/radios, colores). Pendiente: [avisos push](PUSH-VENCIMIENTOS.md).

## Verificación
- `npm test`: arquitectura (capas, ciclos, precache, CSP/Trusted Types, CSS, IDs del DOM), servidor de desarrollo y dominio sin DOM.
- `npm run e2e`: Firefox headless por WebDriver BiDi; recorre menús, modales, altas, búsqueda, orden, calculadora y undo/redo y falla si hay errores en consola. Sirve para comparar contra otra versión (`node scripts/e2e/navegador.mjs <carpeta> scripts/e2e/flujos.mjs` y `diff`).

## Dónde poner código nuevo
- Catálogos estáticos sin lógica → `src/data/`.
- Función pura sin dominio ni DOM → `src/core/`.
- Regla de negocio, cálculo, API externa → `src/services/` (sin `document`).
- DOM, modales, eventos → `src/ui/`.
- Todo `.js` nuevo: import con extensión `.js` y `npm run release`.
- **Un commit local por cada cambio / punto tocado**: cada ajuste, funcionalidad o corrección lleva su propio commit individual (sin `git push`) tras correr `npm run release` y `npm test`.

## Navegación de ajustes
Header (perfil) → modal Perfiles → modal Ajustes → cada opción. `ModalManager.abrirConPadre/cerrarConRetorno` (y `alternar`) recuerdan el modal padre: cerrar un hijo vuelve al anterior, como en Horarios. `UIManager.abrirModal/cerrarModal` aplican esa regla cuando Ajustes está abierto.

## Disposición de tarjetas
PC: 2 o 3 columnas orgánicas (`COLUMNAS_CARDS` guarda los tamaños; arrastrar una tarjeta al borde derecho en pantallas `>= 1100px` abre la tercera columna y cualquier columna vacía se cierra sola). Celular: una lista independiente (`ORDEN_CARDS_MOVIL`). Lógica pura en `services/orden-cards.js`; UI en `ui/orden-tarjetas.js`.

## Tokens de diseño (CSS)
Todo valor visual sale de `assets/styles/tokens.css`; lo vigilan los tests `Tokens:` de `tests/architecture.test.mjs`.
- Apilado: `--z-*` (locales: fondo < sobre < sticky < animando < elevado; globales: header < vista-previa < popup < agregar-overlay < agregar < ajustes < modal < menu < calc < toast). Nada de `z-index` numérico.
- Color y sombra: `--c-*`, `--c-*-soft` (fondos de badges), `--text-*`, `--shadow-*`, `--overlay-*`, `--toggle-track-off`. Nada de `#hex` ni `rgba()` fuera de `tokens.css` (salvo `--muestra-*` de las vistas previas de tema).
- Espacio: `--space-*` en gap/padding/margin (solo se admiten hairlines de 1px, negativos y huecos de layout ≥ 2rem). Tipografía: `--text-*`, `--fw-*`, `--lh-*`; radios: `--radius-*` (`50%` para círculos).
- Íconos: `--icon-sm|base|mid|btn` (rem) y `--icon-md|lg` (em, acompañan al texto); el tamaño de un `svg`/`.icon*` nunca va en px (excepciones: caja del `.icon-btn`, ícono grande del estado vacío, `.stats-card-bg__layer svg`).
- Anchos de modal: `--modal-w-sm|md|lg|xl` (420 / 500 / 600 / 800px). Puntos de corte: 768px y 1024px (`@media` no admite `var()`, por eso se repiten literales: no inventar otros).
- Tiempos y curvas: `--dur-*`, `--ease-*`, `--transition-*`.
- Sin fallbacks en `var(--token, …)` para tokens definidos. Un token sin uso se borra (salvo escalas reservadas: `--fw-normal`, `--radius-xl`, `--icon-sm`, `--icon-lg`).
- Token nuevo: se define en `tokens.css` (y se redefine en cada tema si cambia con él) y se usa en el mismo cambio.
