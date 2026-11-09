import { STORAGE_KEYS } from './constantes.js';
import { StorageHelper } from './almacenamiento.js';

// ====================================================================
// PREFERENCIAS BOOLEANAS (clave, valor por defecto y si van por perfil, en un solo lugar)
// ====================================================================
const _pref = (clave, porDefecto, porPerfil = false) => Object.freeze({
    clave,
    get: () => StorageHelper.getBoolean(clave, porDefecto, porPerfil),
    /** @param {boolean} valor */
    set: (valor) => StorageHelper.setItem(clave, valor, porPerfil),
});

export const Preferencias = Object.freeze({
    BLUR_MONTOS: _pref(STORAGE_KEYS.BLUR_MONTOS, false),
    INGRESOS_HABILITADO: _pref(STORAGE_KEYS.INGRESOS_HABILITADO, false),
    RESUMEN_MOSTRAR_PAGADO: _pref(STORAGE_KEYS.RESUMEN_MOSTRAR_PAGADO, false),
    CALENDARIO_ABIERTO: _pref(STORAGE_KEYS.CALENDARIO_ABIERTO, false),
    RUEDA_CALENDARIO: _pref(STORAGE_KEYS.RUEDA_CALENDARIO, true),
    HOVER_POPUP: _pref(STORAGE_KEYS.HOVER_POPUP, false),
});
