# Avisos push de vencimientos — diseño (pendiente de implementar)

**Estado:** solo diseño. Nada de esto está en el código todavía.
**Objetivo:** avisar de facturas que vencen (o vencieron) aunque la app esté cerrada, usando un Worker de Cloudflare en el plan **gratuito** que se despierte **2 o 3 veces por día**, no cada pocos minutos como el de *horarios*.

## 1. Idea central: la app prepara todo y el Worker solo reparte

En *horarios* el Worker corre cada 2 minutos porque el aviso depende de una hora exacta del día. Acá no hace falta: un vencimiento es una **fecha**, no un horario. Entonces:

1. **La app calcula** qué avisos corresponden y los sube ya armados, indexados por **día de aviso** (no por día de vencimiento).
2. **El Worker no calcula nada**: en cada ejecución del cron busca los avisos de *hoy* (hora Argentina) y los manda.

Así el Worker no necesita entender facturas, monedas ni reglas de negocio, y esas reglas siguen en `services/` donde ya tienen tests.

```
App (cuando cambian los datos)            Worker (cron 08:00 · 13:00 · 20:00 AR)
 EstadoFacturas ──► tabla de avisos ──►   KV: venc:{hash(ownerToken)}:{id}
 (vencen / vencidas / sin pagar)  POST     │
                                  /api/    ├─ list(prefix "venc:")      ← 1 operación list por corrida
                                  schedule ├─ por cada dispositivo: ¿hay avisos para hoy y este turno?
                                           └─ web push → Service Worker → notificación
```

## 2. Cron: 3 corridas por día

Cloudflare programa los crons en **UTC**; Argentina es UTC-3 todo el año (sin horario de verano).

```toml
# wrangler.toml
[triggers]
crons = ["0 11 * * *", "0 16 * * *", "0 23 * * *"]   # 08:00, 13:00 y 20:00 hora Argentina
```

| Turno | UTC | Argentina | Uso sugerido |
|---|---|---|---|
| `m` (mañana) | 11:00 | 08:00 | "Hoy vence…" / "Vencida" |
| `t` (tarde) | 16:00 | 13:00 | recordatorio si sigue impaga (opcional) |
| `n` (noche) | 23:00 | 20:00 | "Mañana vence…" |

Si 2 corridas alcanzan, se eliminan `t` y se queda con mañana y noche. El Worker deduce el turno de la hora de la corrida (`controller.scheduledTime`), no del texto del cron.

## 3. Datos que sube la app

Un único `POST /api/schedule` que **reemplaza** la tabla completa del dispositivo (idempotente):

```jsonc
{
  "id": "<id de instalación>",
  "ownerToken": "<token aleatorio guardado en localStorage>",
  "subscription": { /* PushSubscription */ },
  "avisos": [
    { "dia": "2026-11-09", "turno": "n", "titulo": "Mañana vence", "cuerpo": "Luz, Gas" },
    { "dia": "2026-11-10", "turno": "m", "titulo": "Hoy vence",    "cuerpo": "Luz, Gas" }
  ]
}
```

- **`dia`** es el día en que debe sonar, en `YYYY-MM-DD` hora Argentina. La app decide las reglas (p. ej. "1 día antes" y "el mismo día") y arma la tabla para los próximos ~35 días.
- **Sin montos** en el cuerpo por defecto: nombres de servicios nada más. Lo que viaja al Worker queda en KV, así que conviene que sea lo mínimo. Si se quiere el monto, que sea una opción explícita.
- Se **sube de nuevo** cada vez que cambia algo relevante (alta/pago/borrado de una factura, cambio de perfil), con *debounce* y **solo si la tabla cambió** (comparar un hash contra el último subido) para no gastar escrituras.
- Pagar una factura quita su aviso en la siguiente subida: no hace falta un endpoint de "cancelar por factura". `/api/cancel` queda solo para desactivar todo.
- Con varios perfiles se arma una sola tabla (todos los perfiles que tengan avisos activados) o una por perfil; decidir antes de implementar (ver §8).

## 4. Qué hace el Worker en cada corrida

```text
scheduled(controller):
  hoy   = fechaAR(controller.scheduledTime)          // 'YYYY-MM-DD'
  turno = turnoPorHora(controller.scheduledTime)     // 'm' | 't' | 'n'
  claves = KV.list({ prefix: 'venc:' })              // 1 sola operación list
  por cada clave (con límite de concurrencia):
    registro = KV.get(clave)
    avisos   = registro.avisos.filter(a => a.dia === hoy && a.turno === turno && !registro.enviados?.includes(clave_aviso))
    si hay: enviar UN push agrupado (varios avisos → una notificación)
            410/404 de la suscripción → borrar el registro
            éxito → marcar enviados (put con el mismo TTL) para no repetir si el cron se reintenta
```

Se reutiliza de `horarios-push/src/index.js` (copiar, no inventar de nuevo): VAPID y cifrado del payload, CORS con `ALLOWED_ORIGINS`, `APP_SECRET`, `ownerToken` + anclaje del endpoint, lectura acotada del body, rate limiting nativo y limpieza por `expirationTtl`.

Se **elimina** de esa base: la lógica de "notificaciones cuyo horario ya pasó" que corre cada 2 minutos y el cron `*/2 * * * *`.

## 5. Límites del plan gratuito y cómo se respetan

Verificar los números vigentes en la documentación de Cloudflare antes de implementar; al momento de escribir esto:

| Recurso | Límite gratuito (aprox.) | Uso de este diseño |
|---|---|---|
| Invocaciones del Worker | 100.000 / día | 3 crons + las subidas desde la app (decenas) |
| KV `list` | 1.000 / día | **3 / día** (en *horarios* eran 720) |
| KV lecturas | 100.000 / día | 3 × (nº de dispositivos) |
| KV escrituras | 1.000 / día | pocas: una por subida con cambios + una por envío |
| Tiempo de CPU por invocación | ~10 ms | **riesgo principal**, ver abajo |
| Cron Triggers | 5 por cuenta | 3 |

**CPU:** el cifrado de Web Push (ECDH + HKDF + AES-GCM + firma VAPID) es lo más caro. Con 1 a 3 dispositivos entra de sobra usando Web Crypto nativo. Si algún día hay muchos dispositivos, partir las corridas por lotes (por ejemplo, cada cron procesa un subconjunto por prefijo de hash) o pasar al plan pago. Medir con `wrangler tail` el tiempo real de la primera corrida.

## 6. Cambios en la app (cuando se implemente)

| Pieza | Capa | Detalle |
|---|---|---|
| `services/avisos-vencimientos.js` | `services` | **Puro, con tests:** de `servicios` + `hoy` + preferencias → tabla de `avisos` (reglas "un día antes", "el mismo día", "vencida"), agrupando por día/turno y excluyendo pagadas, saldos a favor, `conCredito` e ingresos. |
| `services/recordatorio-push.js` | `services` | Cliente HTTP del Worker: `suscribir`, `subirAvisos` (con hash para no repetir), `cancelar`. Sin DOM; avisa por `EventosApp`. |
| `ui/notificaciones.js` | `ui` | Modal en Ajustes: activar/desactivar, turnos, días de anticipación, si incluir montos, botón "notificación de prueba". |
| `sw.js` | raíz | Manejadores `push` (con payload acotado como texto) y `notificationclick` (enfocar la PWA o abrirla). Copiar de *horarios*. |
| `assets/icons/badge-96.png` | assets | Ícono monocromo para la notificación; agregarlo al precache. |
| `index.html` | — | `connect-src` debe incluir la URL del Worker. |
| `core/constantes.js` | `core` | `STORAGE_KEYS` nuevas (token propietario, preferencias, hash de la última subida). |

El token propietario y las preferencias van en `localStorage` bajo el prefijo de la app. Hay que ejecutar `npm run release` al sumar archivos nuevos al precache.

## 7. Pasos de despliegue del Worker (`servicios-push`)

1. Copiar `horarios/horarios-push` a un directorio nuevo y renombrar (`name = "servicios-push"`, KV `SERVICIOS_KV`).
2. Generar claves VAPID propias (`npm run generate-vapid`); **no reutilizar** las de *horarios*.
3. `npx wrangler kv namespace create SERVICIOS_KV` y pegar el id en `wrangler.toml`.
4. `npx wrangler secret put VAPID_PRIVATE_KEY` y `npx wrangler secret put APP_SECRET`.
5. Completar `ALLOWED_ORIGINS` con el origen de GitHub Pages.
6. Reemplazar el cron por los 3 de §2 y la lógica de §4.
7. `npm run deploy`; probar con la notificación de prueba y con `wrangler tail`.

## 8. Decisiones abiertas

- **Cantidad de turnos:** 2 (mañana/noche) o 3.
- **Reglas por defecto:** ¿"1 día antes" + "el mismo día"? ¿Insistir con las vencidas? Si sí, cuántos días como máximo.
- **Montos en la notificación:** desactivado por defecto o no.
- **Perfiles:** una tabla por perfil o una sola para todos.
- **Avisos ya enviados:** guardar la marca en el registro (una escritura por envío) o aceptar un posible duplicado si el cron se reintenta (ahorra escrituras).
- **Zona horaria:** fija en Argentina (UTC-3). Si la app se usa en otro huso, hay que subir la zona en el registro.

## 9. Criterios de aceptación

- El Worker se ejecuta exactamente 3 veces por día (ver el panel de Cloudflare) y no supera 1 operación `list` por corrida.
- Una factura que vence mañana genera un único push la noche anterior; si se paga antes, no llega.
- Cambiar de dispositivo o reinstalar no deja avisos duplicados (el `ownerToken` y el anclaje del endpoint lo impiden, como en *horarios*).
- `services/avisos-vencimientos.js` tiene tests sin DOM que cubren: pagadas, saldo a favor, `conCredito`, ingresos, fin de mes/año y días de anticipación.
- Sin conexión o con el Worker caído, la app sigue funcionando y avisa una sola vez (como `recordatorio-push` de *horarios*).
