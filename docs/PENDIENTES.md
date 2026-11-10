# Pendientes — seguridad, arquitectura y escalabilidad

Sale de la auditoría del 10/11/2026. Contexto: app estática en GitHub Pages, sin servidor propio, sincronización por Gist; todo lo de acá se resuelve con las funciones gratuitas de GitHub.

Lo que ya se hizo en esa tanda (no está pendiente): validación de lo guardado en el navegador al cargar, rechazo del Gist degradado a texto en claro, CSP sin `https:` en `img-src`, `limpiarTexto` en lugar del saneador por lista negra, fechas reales y topes de cantidad al importar. Ver «Datos guardados en el navegador» y «Cifrado y secretos» en [ARQUITECTURA.md](ARQUITECTURA.md).

## Seguridad

### 1. El origen se comparte con las otras apps de la cuenta (el más importante)
`usuario.github.io/servicios` y `usuario.github.io/horarios` son el mismo origen: comparten `localStorage`. Cualquier página publicada bajo esa cuenta puede leer `gist_token` y, con «Recordar» activado, `frase_cifrado`. La CSP de esta app no la protege de un fallo en otra.

Opciones gratuitas, de más a menos efectiva:
- **Publicar esta app desde una organización gratuita de GitHub** (`otra-org.github.io/servicios`): es otro origen, con su propio almacenamiento. No requiere dominio ni hosting. Al mudar hay que exportar un respaldo y restaurarlo en la dirección nueva.
- **Guardar el token cifrado con la frase** (el mismo sobre de `core/cifrado.js`): sin la frase, el token guardado no sirve. Protege solo si la frase no está «recordada» en el mismo navegador. Implica pedir la frase antes de sincronizar y corregir la nota de ARQUITECTURA.md que dice que el token no se puede cifrar.
- Como mínimo: no activar «Recordar» la frase en navegadores donde se usen otras apps del mismo origen.

### 2. Alcance del token de Gist
El enlace «crear token» (`listeners-app.js`) genera un token clásico con permiso `gist`: lee y escribe **todos** los gists de la cuenta y no vence. Pendiente: apuntar el enlace a un token de grano fino (solo permiso «Gists», con vencimiento) y explicarlo en la ayuda. Sigue alcanzando a todos los gists, pero a nada más de la cuenta.

### 3. El Gist no tiene protección contra versiones viejas
El cifrado autentica el contenido pero no su antigüedad: quien pueda escribir el Gist puede reponer un sobre anterior válido. Mitigación posible: guardar en el perfil la fecha del último respaldo aceptado y avisar si lo bajado es más viejo.

### 4. Fuera del código
- Quien controla el repositorio controla la app (no hay forma de firmar lo publicado y el Service Worker se actualiza solo): 2FA en la cuenta de GitHub y protección de la rama que publica.
- Dependabot para las acciones del workflow y `typescript` (gratuito).

## Arquitectura

- **`GistService` está en `ui/` con `fetch` y la lógica de sincronización**, contra la regla «API externa → `services/`». Es el módulo más sensible y no tiene tests unitarios. Extraer un cliente a `services/` con `fetch` inyectado (subir, bajar, decidir si se acepta lo remoto) y dejar en `ui/` solo el modal y los avisos.
- **Acoplamiento por `app`**: 20 clases de `ui/` reciben `app` entero (unos 720 usos de `this.app.`, 156 en `listeners-app.js`). Ir pasando a cada clase solo lo que usa, empezando por las más chicas.
- **Diccionarios con claves de datos**: quedan objetos `{}` indexados por datos en `ui/` (por ejemplo `_anoExpandidoFacturas`). Revisarlos con `grep` y pasarlos a `Map` u `Object.create(null)`; la categoría «constructor» ya rompió dos de estos.
- **CI**: el workflow corre `typecheck` y `test`, no `e2e`. Sumar Firefox headless al workflow, incluido `scripts/e2e/datos-guardados.mjs`.
- `tsconfig.json` tiene `strict: false`; evaluar activarlo por carpetas (`core/` y `services/` primero).

## Escalabilidad

- **Sincronización sin registro de borrados**: se sube y baja el archivo entero y «combinar» solo agrega. Una factura borrada en un dispositivo reaparece cuando otro, desactualizado, sube. Hace falta marcar borrados (id + fecha) y una fecha de modificación por factura para resolver conflictos; hoy gana siempre lo remoto.
- **Almacenamiento**: todo el perfil se serializa en cada guardado, más hasta 20 copias del historial, dentro de los ~5 MB de `localStorage` que además se comparten con las otras apps del origen. Alcanza para años de uso personal. Si hiciera falta más: IndexedDB detrás de `StorageHelper` (hoy su API es síncrona, es un cambio grande).
- **Cada guardado con sincronización automática** hace una lectura y una escritura del Gist completo. Con muchos datos conviene comparar antes un hash local y saltear la subida si no cambió nada.
