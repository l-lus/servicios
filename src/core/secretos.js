// ====================================================================
// SECRETOS — valores que no deben quedarse en el navegador salvo que la persona lo pida (la frase de cifrado)
// ====================================================================
// Sin «recordar» el valor vive en `sessionStorage` (hasta cerrar la pestaña); con «recordar», en `localStorage` (queda en este navegador).
// Nunca van al respaldo ni a los logs. Si el almacenamiento no está disponible (modo privado, cuota), las funciones no lanzan: leer devuelve ''.

/** @param {'sessionStorage' | 'localStorage'} cual @returns {Storage | null} */
function _almacen(cual) {
    try { return globalThis[cual] ?? null; } catch { return null; }
}

/** @param {'sessionStorage' | 'localStorage'} cual @param {string} clave */
function _leer(cual, clave) {
    try { return _almacen(cual)?.getItem(clave) ?? ''; } catch { return ''; }
}

/** @param {'sessionStorage' | 'localStorage'} cual @param {string} clave */
function _quitar(cual, clave) {
    try { _almacen(cual)?.removeItem(clave); } catch { /* sin acceso al almacenamiento */ }
}

/** El valor guardado ('' si no hay): primero el de la sesión, después el recordado. @param {string} clave */
function leer(clave) {
    return _leer('sessionStorage', clave) || _leer('localStorage', clave);
}

/** ¿Está guardado de forma permanente en este navegador? @param {string} clave */
function esRecordado(clave) {
    return _leer('localStorage', clave) !== '';
}

/** Quita el valor de los dos lugares. @param {string} clave */
function olvidar(clave) {
    _quitar('sessionStorage', clave);
    _quitar('localStorage', clave);
}

/**
 * Guarda el valor: solo para la sesión o, con `recordar`, en este navegador. Un valor vacío lo olvida. Devuelve false si no se pudo guardar.
 * @param {string} clave @param {string} valor @param {boolean} [recordar]
 */
function guardar(clave, valor, recordar = false) {
    if (!valor) { olvidar(clave); return true; }
    const donde = recordar ? 'localStorage' : 'sessionStorage';
    const otro = recordar ? 'sessionStorage' : 'localStorage';
    try {
        const almacen = _almacen(donde);
        if (!almacen) return false;
        almacen.setItem(clave, valor);
        _quitar(otro, clave);
        return true;
    } catch {
        return false;
    }
}

export const Secretos = { leer, guardar, olvidar, esRecordado };
