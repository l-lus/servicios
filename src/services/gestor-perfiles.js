import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';

// ====================================================================
// GESTOR DE PERFILES — alta, renombre, baja y persistencia (sin DOM)
// `perfiles` es el objeto { id: { id, nombre, creado } } que mantiene la app.
// ====================================================================
export const PERFIL_PRINCIPAL = 'default';
export const MAX_PERFILES = 4;

export const GestorPerfiles = {
    /** Perfiles guardados o, si no hay, solo el principal. */
    cargar(ahora = new Date()) {
        try {
            const guardados = StorageHelper.getObject(STORAGE_KEYS.PERFILES, null);
            if (guardados) return guardados;
        } catch (error) {
            console.error('Error al cargar perfiles:', error);
        }
        return { [PERFIL_PRINCIPAL]: { id: PERFIL_PRINCIPAL, nombre: 'Principal', creado: ahora.toISOString() } };
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
