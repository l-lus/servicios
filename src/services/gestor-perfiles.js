import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';

// ====================================================================
// GESTOR DE PERFILES — alta, renombre, baja y persistencia (sin DOM)
// `perfiles` es el objeto { id: { id, nombre, creado } } que mantiene la app.
// ====================================================================
export const PERFIL_PRINCIPAL = 'default';
export const MAX_PERFILES = 4;

/** ¿Tiene la forma del id de un Gist de GitHub? @param {unknown} id */
export const esIdDeGist = (id) => typeof id === 'string' && /^[a-f0-9]{20,40}$/i.test(id);

const esFechaHora = (v) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** Un perfil guardado → solo sus campos conocidos y válidos, o null si no sirve. @param {string} id @param {any} p @param {Date} ahora */
function perfilSaneado(id, p, ahora) {
    if (!SecurityAndUtils.REGEX_PATTERNS.ID.test(id) || !p || typeof p !== 'object' || Array.isArray(p)) return null;
    const nombre = SecurityAndUtils.limpiarTexto(p.nombre, SecurityAndUtils.SECURITY_LIMITS.MAX_NOMBRE_LENGTH);
    if (!nombre) return null;
    /** @type {{ id: string, nombre: string, creado: string, [clave: string]: any }} */
    const limpio = { id, nombre, creado: esFechaHora(p.creado) ? p.creado : ahora.toISOString() };
    if (esIdDeGist(p.gistId)) limpio.gistId = p.gistId;
    if (typeof p.gistAuto === 'boolean') limpio.gistAuto = p.gistAuto;
    if (typeof p.gistCifrado === 'boolean') limpio.gistCifrado = p.gistCifrado;
    if (esFechaHora(p.gistLastSync)) limpio.gistLastSync = p.gistLastSync;
    return limpio;
}

export const GestorPerfiles = {
    /**
     * Lo guardado → perfiles válidos. Es un dato de afuera más (ver «Datos guardados en el navegador» en docs/ARQUITECTURA.md): cada perfil se rearma con
     * sus campos conocidos, los que no sirven se descartan y el principal siempre está. El resultado no hereda de Object.prototype (sus claves son datos).
     * @param {unknown} guardados @param {Date} [ahora]
     * @returns {Record<string, { id: string, nombre: string, creado?: string, [clave: string]: any }>}
     */
    sanear(guardados, ahora = new Date()) {
        const crudo = guardados && typeof guardados === 'object' && !Array.isArray(guardados) ? guardados : {};
        const perfiles = Object.create(null);
        perfiles[PERFIL_PRINCIPAL] = (Object.hasOwn(crudo, PERFIL_PRINCIPAL) ? perfilSaneado(PERFIL_PRINCIPAL, crudo[PERFIL_PRINCIPAL], ahora) : null)
            || { id: PERFIL_PRINCIPAL, nombre: 'Principal', creado: ahora.toISOString() };
        for (const [id, p] of Object.entries(crudo)) {
            if (Object.keys(perfiles).length >= MAX_PERFILES) break;
            const limpio = id === PERFIL_PRINCIPAL ? null : perfilSaneado(id, p, ahora);
            if (limpio) perfiles[id] = limpio;
        }
        return perfiles;
    },

    /** Perfiles guardados (validados) o, si no hay, solo el principal. */
    cargar(ahora = new Date()) {
        return GestorPerfiles.sanear(StorageHelper.getObject(STORAGE_KEYS.PERFILES, null), ahora);
    },

    /** El id del perfil activo guardado si es uno de `perfiles`; si no, el principal. @param {Record<string, any>} perfiles @param {unknown} guardado */
    activoValido(perfiles, guardado) {
        return typeof guardado === 'string' && Object.hasOwn(perfiles, guardado) ? guardado : PERFIL_PRINCIPAL;
    },

    /** Persiste los perfiles. false si no se pudo guardar. */
    guardar(perfiles) {
        try {
            return StorageHelper.setItem(STORAGE_KEYS.PERFILES, perfiles);
        } catch (error) {
            console.error('Error al guardar perfiles:', error);
            return false;
        }
    },

    puedeCrear(perfiles) {
        return Object.keys(perfiles).length < MAX_PERFILES;
    },

    /** 'vacio' | 'duplicado' | null. `idExcluido` permite renombrar un perfil sin chocar con su propio nombre. */
    validarNombre(perfiles, nombre, idExcluido = null) {
        const limpio = (nombre || '').trim();
        if (!limpio) return 'vacio';
        const existe = Object.values(perfiles).some(p =>
            p.nombre.toLowerCase() === limpio.toLowerCase() && p.id !== idExcluido);
        return existe ? 'duplicado' : null;
    },

    /** Agrega un perfil (muta `perfiles`), crea su lista de datos vacía y guarda. Devuelve el perfil. */
    crear(perfiles, nombre, ahora = new Date()) {
        const id = 'perfil_' + ahora.getTime();
        perfiles[id] = { id, nombre: nombre.trim(), creado: ahora.toISOString() };
        StorageHelper.setItem(STORAGE_KEYS.DATOS_PERFIL(id), []);
        GestorPerfiles.guardar(perfiles);
        return perfiles[id];
    },

    renombrar(perfiles, id, nombre) {
        perfiles[id].nombre = nombre.trim();
        GestorPerfiles.guardar(perfiles);
    },

    /** Quita el perfil y sus datos (el historial lo borra quien lo administra). El principal no se elimina. */
    eliminar(perfiles, id) {
        if (id === PERFIL_PRINCIPAL || !perfiles[id]) return false;
        StorageHelper.removeItem(STORAGE_KEYS.DATOS_PERFIL(id));
        StorageHelper.removeItem(STORAGE_KEYS.DATOS_RESCATE(id));
        StorageHelper.removeItem(STORAGE_KEYS.BORRADOS(id));
        delete perfiles[id];
        GestorPerfiles.guardar(perfiles);
        return true;
    },

    /** Cantidad de servicios guardados de un perfil. */
    cantidadServicios(id) {
        const guardados = StorageHelper.getObject(STORAGE_KEYS.DATOS_PERFIL(id), []);
        return Array.isArray(guardados) ? guardados.length : 0;
    },
};
