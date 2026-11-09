import { STORAGE_KEYS } from './constantes.js';
import { SecurityAndUtils } from './seguridad.js';

// ============================================================
// STORAGE HELPER (Persistencia tipada, cuotas, perfiles)
// ============================================================
export const StorageHelper = (function () {
    'use strict';

    let notify = { mostrarToast: () => { } };
    function configurarNotificaciones(handlers) { notify = { ...notify, ...handlers }; }

    // La capa superior inyecta cómo conocer el perfil activo (core no conoce a la app)
    let _resolverPerfil = () => null;
    function setProfileKeyResolver(fn) { _resolverPerfil = typeof fn === 'function' ? fn : () => null; }

    function _getKey(key, useProfile) {
        if (!useProfile) return key;
        const perfilActivo = _resolverPerfil() || localStorage.getItem(STORAGE_KEYS.PERFIL_ACTIVO) || 'default';
        return `${key}_${perfilActivo}`;
    }

    function setItem(key, value, useProfile = false, { silencioso = false } = {}) {
        try {
            const finalKey = _getKey(key, useProfile);
            const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
            localStorage.setItem(finalKey, valueToStore);
            return true;
        } catch (e) {
            if (silencioso) return false;
            console.error(`Error guardando en Storage (${key}):`, e);
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                notify.mostrarToast('Almacenamiento lleno, no se pudo guardar', 'error');
            }
            return false;
        }
    }

    function getItem(key, defaultValue = null, useProfile = false) {
        try {
            const value = localStorage.getItem(_getKey(key, useProfile));
            return value !== null ? value : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    function getBoolean(key, defaultValue = false, useProfile = false) {
        const val = getItem(key, null, useProfile);
        if (val === null) return defaultValue;
        return val === 'true';
    }

    function getNumber(key, defaultValue = 0, useProfile = false) {
        const val = getItem(key, null, useProfile);
        if (val === null) return defaultValue;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    function getObject(key, defaultValue = null, useProfile = false) {
        const val = getItem(key, null, useProfile);
        if (!val) return defaultValue;
        try {
            return JSON.parse(val, SecurityAndUtils.reviverJSONSeguro);
        } catch (e) {
            return defaultValue;
        }
    }

    function removeItem(key, useProfile = false) {
        try {
            localStorage.removeItem(_getKey(key, useProfile));
        } catch (e) { }
    }

    return {
        setItem,
        getItem,
        getBoolean,
        getNumber,
        getObject,
        removeItem,
        configurarNotificaciones,
        setProfileKeyResolver
    };
})();

export const Almacenamiento = StorageHelper;

