import { CARDS } from '../core/constantes.js';

// ====================================================================
// ORDEN DE LAS TARJETAS (sin DOM)
// ====================================================================
// El orden es una lista con todas las tarjetas, ocultas incluidas: en escritorio la última va a la columna derecha.
export const CARDS_EN_DERECHA = 1;

/**
 * Orden guardado → orden válido. Descarta lo desconocido y repetido; una tarjeta que no estaba cuando se guardó (ej. "calendario", agregada después)
 * entra en el lugar que le toca por defecto, sin tocar el orden que ya había elegido el usuario.
 * @param {unknown} guardado
 * @param {readonly string[]} [cards]
 */
export function normalizarOrdenCards(guardado, cards = CARDS) {
    const orden = Array.isArray(guardado) ? [...new Set(guardado.filter(c => cards.includes(c)))] : [];
    cards.forEach((c, i) => {
        if (!orden.includes(c)) orden.splice(Math.min(i, orden.length), 0, c);
    });
    return orden;
}

/**
 * Las tarjetas visibles se reordenaron entre sí: las ocultas conservan su lugar en el orden completo (si no, al arrastrar pasarían
 * a ser "las últimas" y empujarían tarjetas visibles a otra columna).
 * @param {readonly string[]} ordenCompleto
 * @param {readonly string[]} visiblesNuevo mismas tarjetas visibles, en su nuevo orden
 */
export function fusionarOrdenVisibles(ordenCompleto, visiblesNuevo) {
    const visibles = new Set(visiblesNuevo);
    let k = 0;
    const orden = ordenCompleto.map(c => (visibles.has(c) ? visiblesNuevo[k++] : c));
    visiblesNuevo.forEach(c => { if (!orden.includes(c)) orden.push(c); });
    return orden;
}

/** Columna (0 izquierda, 1 derecha) de la tarjeta en la posición `idx` de un orden de `total` tarjetas. */
export function columnaDeCard(idx, total) {
    return idx >= total - CARDS_EN_DERECHA ? 1 : 0;
}
