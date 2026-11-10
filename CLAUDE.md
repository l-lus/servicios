# Servicios — facturas y vencimientos (PWA sin build)

Frontend vanilla en **ES Modules nativos** (sin bundler, sin dependencias en el cliente), PWA offline-first, datos en `localStorage`.
Idioma del proyecto: español (código, mensajes, docs). Lo que pida el usuario manda sobre este archivo.
Proyectos hermanos de referencia (misma línea arquitectónica): `../horarios` (frontend idéntico en capas) y `../cctv_monitor` (rigor de seguridad, helpers y tests). Ante la duda de cómo se resuelve algo, mirar cómo lo resolvieron ahí.
La fuente de verdad de la arquitectura es `docs/ARQUITECTURA.md`: si el cambio altera estructura, capas o convenciones, se actualiza en el mismo cambio.

## Flujo obligatorio tras cada cambio (código, estilos o HTML)
1. `npm run release` — sube `APP_VERSION` (`src/core/constantes.js`) y `CACHE_NAME` y regenera `urlsToCache` de `sw.js`.
2. `npm test` — debe quedar en verde. Si se toca el flujo de la UI, correr también `npm run e2e` (Firefox headless; falla ante errores de consola).
3. `npm run typecheck` (`tsc` + JSDoc, también en CI) debe quedar sin errores: detecta fallos de tipos que `npm test` no ve. Los tipos van como comentarios JSDoc; el navegador recibe el JS tal cual.

**Regla de commits: un commit local por cada cambio / punto tocado** (nunca agrupar varios cambios o puntos independientes en un solo commit). Cada cambio termina con su propio commit local, con `release` y tests en verde. Nunca `push`: el usuario copia los archivos a mano.

## Capas (dependencias solo hacia abajo, sin ciclos)
```
core  <  services  <  ui  <  main.js
```
- `core/`: utilidades puras y transversales (fechas, formato, html, eventos, almacenamiento, seguridad). No conoce la app: lo que necesita se **inyecta** (ej. `StorageHelper.setProfileKeyResolver`). No toca el DOM de la app.
- `services/`: reglas de negocio, cálculos, estado (`EstadoApp`), importar/exportar. **Sin `document`/`$()`**; habla con la UI por el bus `EventosApp`, puertos de formulario y callbacks `notify`. Funciones **puras**: reciben `hoy` y los datos (nunca leen reloj ni DOM propios) y se prueban en Node.
- `ui/`: DOM, modales, eventos, animaciones. Es la única capa que renderiza.
- `main.js`: solo arranque; sin lógica de negocio.
- Sin `window.app` ni globales: el acoplamiento va por `EventosApp`.
- Lo vigila `tests/architecture.test.mjs`. **Si un test de arquitectura molesta, se corrige el código, no el test.**

### Dónde poner código nuevo
| Qué | Dónde |
|---|---|
| Función pura genérica, sin dominio ni DOM | `src/core/` |
| Regla de negocio, cálculo, API externa | `src/services/` (sin DOM) |
| DOM, modales, eventos, animaciones | `src/ui/` |
- **Helperización, cero duplicación (prioridad del proyecto)**: antes de escribir cualquier lógica, buscar si ya existe un helper (`grep` por el patrón, no solo por el nombre). Si un fragmento aparece (o va a aparecer) por segunda vez, se extrae a un helper en la capa que corresponda y se reemplazan **todos** los usos, no solo el nuevo. Los helpers nuevos llevan test, y se listan en `docs/ARQUITECTURA.md` para que la próxima sesión los encuentre. Helpers conocidos: (`core/fechas.js`, `core/formato.js`, `core/html.js`, `core/busqueda-texto.js`, `ui/toast.js`, `ui/gestor-modales.js`, `ui/custom-select.js`, `ui/arrastre.js`, `ui/gestos.js`…). No duplicar; extraer y reutilizar.
- Lógica de decisión en funciones puras; efectos (reloj, red, storage) inyectados, para probar sin navegador.
- Un módulo, una responsabilidad. Un orquestador (`gestion-servicios.js`) no debe crecer con métodos pasamanos (`foo(){ this.x.foo() }`): la UI llama directo al módulo dueño.
- Las clases nuevas no reciben `app` entero: reciben solo lo que usan.

## Convenciones de código
- Imports relativos **con extensión `.js`** y a archivos existentes.
- Todo `.js` o `.css` nuevo queda en el precache (lo hace `npm run release`; no editar `urlsToCache` a mano).
- CSS en 5 capas de cascada en `assets/styles/` (orden fijo en `index.html`). Colores, espacios, radios y tipografía salen de **tokens** (`tokens.css`); toda `var(--x)` usada debe estar definida. Íconos: solo `#icon-…` del sprite existente.
- Un tema nuevo necesita su bloque de variables en `tokens.css` y su entrada en `core/temas.js` (y en `tema-inicial.js`).
- Nada de estilos en línea ni `<style>` en `index.html` (CSP `style-src 'self'`); lo dinámico va por `element.style` o clases.
- Atajo, gesto o función nueva visible: actualizar la **ayuda** (`ayuda-buscador`), `README.md` y los docs.
- Cambios de movimiento/animación respetan `prefers-reduced-motion` (`core/movimiento.js`).
- Nombres, comentarios y mensajes de usuario en español (es-AR para fechas y moneda, vía `core/formato.js`).

## Seguridad (no relajar)
- **HTML**: solo con la etiqueta ``html`…` `` y `montar()` de `core/html.js` (escape automático; Trusted Types en la CSP). `innerHTML`/`outerHTML=`/`insertAdjacentHTML` únicamente dentro de `montar`. `crudo()` solo para constantes fijas del código (hay test con lista blanca), jamás con datos. Prohibidos los escapes manuales.
- **CSP**: `script-src 'self'`, sin handlers inline (`onclick=`), sin `eval`, sin scripts inline. Eventos con `addEventListener`.
- **Datos no confiables**: respaldos importados, `localStorage` al cargar, Gist y cualquier JSON externo se validan y sanean (`core/seguridad.js`, `ImportarExportar`) con listas cerradas/regex/rangos antes de usarse. Diccionarios con claves de datos: `Map` u `Object.create(null)`, nunca `{}`.
- Números que llegan como texto: parsear con validación de rango, nunca `parseInt` a ciegas.
- Exportaciones CSV: neutralizar celdas que empiezan con `=`, `+`, `-`, `@`.
- Secretos (tokens de Gist, claves de push) nunca en el código, en logs ni en el respaldo exportado.
- Almacenamiento solo por `StorageHelper` (namespace y perfil resueltos ahí); manejar cuota y fallo de lectura.

## Tests
- Todo cambio con test. Dominio en `services/` → test en `tests/*.test.mjs` **sin DOM**. Una regla estructural nueva (capa, seguridad, precache) → test en `architecture.test.mjs`.
- Un bug corregido deja un test que lo reproduce.
- `npm test` = `node --test tests/*.mjs` (sin dependencias). `npm run e2e` para flujos reales de navegador.

## Mantenimiento
- Antes de editar, leer el módulo y buscar usos; cambios chicos y localizados, sin refactors ajenos al pedido.
- Al terminar un cambio estructural: actualizar `docs/ARQUITECTURA.md` (estructura, plan, "dónde poner código") y el `README.md`.
- Código muerto, pasamanos y duplicados se eliminan al detectarlos, con su test.
- No tocar `assets/icons/` ni la fuente Inter salvo pedido expreso.
