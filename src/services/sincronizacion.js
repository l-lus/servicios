import { SecurityAndUtils } from '../core/seguridad.js';
import { esInstanteISO } from '../core/fechas.js';
import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// SINCRONIZACIÓN — fecha de modificación por factura y registro de borrados (sin DOM, sin reloj propio)
// ====================================================================
// Para que un borrado llegue a los otros dispositivos (y para saber qué versión de una factura es la más nueva) cada factura lleva `modificada`
// (instante ISO) y cada perfil un registro de borrados `{ servicio, id, fecha }` (`id: null` = se borró el servicio entero).
// Nadie tiene que acordarse de anotar nada al borrar o editar: `sellarCambios` compara lo que hay con la última instantánea guardada y
// lo deduce. Funciona igual para borrar a mano, «Limpiar datos», deshacer y rehacer.
// Todo recibe `ahora` (nunca lee el reloj). Los registros de más de DIAS_RETENCION_BORRADOS días se descartan: un dispositivo que
// estuvo sin sincronizar más tiempo que eso puede revivir lo que se borró mientras tanto.

export const DIAS_RETENCION_BORRADOS = 90;
const MS_DIA = 24 * 60 * 60 * 1000;

/** @typedef {{ servicio: string, id: string | null, fecha: string }} Borrado */
/** @typedef {{ facturas: Map<string, string>, servicios: Set<string> }} Instantanea */

/** Clave de un borrado: `servicio/factura` o `servicio/` si es el servicio entero. @param {string} servicio @param {string | null} [id] */
export const claveBorrado = (servicio, id = null) => `${servicio}/${id ?? ''}`;

/** Contenido de una factura que cuenta como «cambio» (la propia `modificada` no). @param {any} f */
const firma = (f) => JSON.stringify([f.monto, f.fecha, f.pagada, f.fechaPago ?? null, f.tipo ?? null, f.moneda ?? null, f.conCredito ?? null]);

/** Une dos listas de borrados: gana la fecha más nueva de cada clave. Descarta los vencidos y deja a lo sumo MAX_BORRADOS (los más nuevos). @param {Borrado[]} a @param {Borrado[]} b @param {Date} ahora */
function _unir(a, b, ahora) {
    const limite = new Date(ahora.getTime() - DIAS_RETENCION_BORRADOS * MS_DIA).toISOString();
    /** @type {Map<string, Borrado>} */
    const porClave = new Map();
    for (const x of [...a, ...b]) {
        if (x.fecha < limite) continue;
        const k = claveBorrado(x.servicio, x.id);
        const previo = porClave.get(k);
        if (!previo || previo.fecha < x.fecha) porClave.set(k, x);
    }
    return [...porClave.values()]
        .sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
        .slice(0, SecurityAndUtils.SECURITY_LIMITS.MAX_BORRADOS)
        .reverse();
}

export const Sincronizacion = {
    /**
     * Lista de borrados que viene de afuera (respaldo, Gist, almacenamiento) → lista válida. No lanza: lo inválido se descarta.
     * @param {unknown} crudo @returns {Borrado[]}
     */
    sanearBorrados(crudo) {
        if (!Array.isArray(crudo)) return [];
        const R = SecurityAndUtils.REGEX_PATTERNS;
        /** @type {Map<string, Borrado>} */
        const porClave = new Map();
        for (const x of crudo.slice(0, SecurityAndUtils.SECURITY_LIMITS.MAX_BORRADOS * 2)) {
            if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
            if (typeof x.servicio !== 'string' || !R.ID.test(x.servicio)) continue;
            if (x.id !== null && (typeof x.id !== 'string' || !R.ID.test(x.id))) continue;
            if (!esInstanteISO(x.fecha)) continue;
            const k = claveBorrado(x.servicio, x.id);
            const previo = porClave.get(k);
            if (!previo || previo.fecha < x.fecha) porClave.set(k, { servicio: x.servicio, id: x.id, fecha: x.fecha });
        }
        return [...porClave.values()].slice(0, SecurityAndUtils.SECURITY_LIMITS.MAX_BORRADOS);
    },

    /** Une los borrados de dos lados (ver `_unir`). No muta las listas. @param {Borrado[]} a @param {Borrado[] | undefined | null} b @param {Date} ahora */
    unirBorrados(a, b, ahora) {
        return _unir(a, b ?? [], ahora);
    },

    /** clave → fecha del borrado, para consultar rápido. @param {Borrado[]} borrados */
    indice(borrados) {
        return new Map(borrados.map(b => [claveBorrado(b.servicio, b.id), b.fecha]));
    },

    /** Lo que hay ahora: la firma de cada factura y los ids de servicio. @param {any[]} servicios @returns {Instantanea} */
    instantanea(servicios) {
        /** @type {Instantanea} */
        const snap = { facturas: new Map(), servicios: new Set() };
        for (const s of servicios) {
            snap.servicios.add(s.id);
            for (const f of s.facturas) snap.facturas.set(claveBorrado(s.id, f.id), firma(f));
        }
        return snap;
    },

    /**
     * Compara `servicios` con la instantánea anterior `base`: a las facturas nuevas o cambiadas les pone `modificada = ahora` (MUTA las facturas),
     * anota como borrado lo que ya no está y quita el registro de lo que volvió a estar (p. ej. al deshacer). Devuelve la lista de borrados al día
     * y la instantánea nueva. El servicio de ingresos nunca se anota como servicio borrado: se vuelve a crear solo.
     * @param {Instantanea} base @param {any[]} servicios @param {Borrado[]} borrados @param {Date} ahora
     * @returns {{ borrados: Borrado[], base: Instantanea }}
     */
    sellarCambios(base, servicios, borrados, ahora) {
        const instante = ahora.toISOString();
        const actual = Sincronizacion.instantanea(servicios);
        /** @type {Borrado[]} */
        const nuevos = [];
        for (const s of servicios) {
            for (const f of s.facturas) {
                if (base.facturas.get(claveBorrado(s.id, f.id)) !== actual.facturas.get(claveBorrado(s.id, f.id))) f.modificada = instante;
            }
        }
        for (const clave of base.facturas.keys()) {
            if (actual.facturas.has(clave)) continue;
            const i = clave.indexOf('/');
            nuevos.push({ servicio: clave.slice(0, i), id: clave.slice(i + 1), fecha: instante });
        }
        for (const id of base.servicios) {
            if (!actual.servicios.has(id) && id !== SERVICIO_INGRESOS_ID) nuevos.push({ servicio: id, id: null, fecha: instante });
        }
        const vigentes = _unir(borrados, nuevos, ahora).filter(b =>
            b.id === null ? !actual.servicios.has(b.servicio) : !actual.facturas.has(claveBorrado(b.servicio, b.id)));
        return { borrados: vigentes, base: actual };
    },

    /**
     * Copia de `servicios` sin lo que un borrado deja muerto: facturas anteriores a su borrado y servicios borrados que se quedan sin facturas.
     * No muta. @param {any[]} servicios @param {Borrado[]} borrados
     */
    sinBorrados(servicios, borrados) {
        if (!borrados.length) return servicios;
        const idx = Sincronizacion.indice(borrados);
        return servicios
            .map(s => ({ ...s, facturas: s.facturas.filter((/** @type {any} */ f) => !Sincronizacion.estaMuerta(idx, s.id, f)) }))
            .filter(s => s.facturas.length > 0 || s.id === SERVICIO_INGRESOS_ID || !idx.has(claveBorrado(s.id)));
    },

    /** ¿Esta factura es anterior a su borrado, o al del servicio entero? (sin `modificada` se considera la más vieja). @param {Map<string, string>} idx @param {string} servicioId @param {any} factura */
    estaMuerta(idx, servicioId, factura) {
        const modificada = factura.modificada || '';
        const propio = idx.get(claveBorrado(servicioId, factura.id));
        const delServicio = idx.get(claveBorrado(servicioId));
        return (propio !== undefined && modificada < propio) || (delServicio !== undefined && modificada < delServicio);
    },
};
