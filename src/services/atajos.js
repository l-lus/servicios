// ====================================================================
// ATAJOS RÁPIDOS (lista elegida por el usuario, sin DOM)
// ====================================================================
export const MAX_ATAJOS = 12;   // dos filas de 6 en móvil
export const ATAJOS_POR_DEFECTO = Object.freeze(['nueva-factura', 'calculadora', 'calendario', 'deshacer', 'rehacer', 'ayuda']);

/**
 * Lista guardada → lista válida: solo atajos que existen, sin repetir, hasta MAX_ATAJOS.
 * Sin lista guardada (nunca se tocó) quedan los de por defecto; una lista vacía es una elección válida.
 * @param {unknown} guardado
 * @param {readonly string[]} idsValidos
 * @param {number} [max]
 */
export function normalizarAtajos(guardado, idsValidos, max = MAX_ATAJOS) {
    const base = Array.isArray(guardado) ? guardado : ATAJOS_POR_DEFECTO;
    return [...new Set(base.filter(id => typeof id === 'string' && idsValidos.includes(id)))].slice(0, max);
}

/**
 * Agrega el atajo si no estaba, lo quita si estaba. Con la lista llena no agrega (`lleno`).
 * @param {readonly string[]} lista
 * @param {string} id
 * @param {number} [max]
 */
export function alternarAtajo(lista, id, max = MAX_ATAJOS) {
    if (lista.includes(id)) return { lista: lista.filter(a => a !== id), lleno: false };
    if (lista.length >= max) return { lista: [...lista], lleno: true };
    return { lista: [...lista, id], lleno: false };
}
