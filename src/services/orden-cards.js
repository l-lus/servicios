import { CARDS } from '../core/constantes.js';

// ====================================================================
// DISPOSICIÓN DE LAS TARJETAS (sin DOM)
// ====================================================================
// En escritorio hay dos columnas y cada tarjeta se asigna a la que se quiera: { izq: [...], der: [...] }.
// En el celular todo va en una sola columna: una lista con el orden. Las dos disposiciones son independientes.

/** Disposición de escritorio por defecto. */
export const DISPOSICION_POR_DEFECTO = Object.freeze({
    izq: Object.freeze(['resumen', 'atajos', 'estadisticas', 'calendario']),
    der: Object.freeze(['servicios']),
});

const otraColumna = c => (c === 'izq' ? 'der' : 'izq');
const sinRepetir = (lista, cards) => [...new Set(lista.filter(c => cards.includes(c)))];

/**
 * Lo guardado → disposición válida de escritorio. Acepta el formato anterior (una lista donde la última tarjeta va a la derecha).
 * Descarta lo desconocido y repetido; una tarjeta que no estaba al guardar entra al final de su columna por defecto.
 * @param {unknown} guardado
 * @param {readonly string[]} [cards]
 * @returns {{ izq: string[], der: string[] }}
 */
export function normalizarDisposicion(guardado, cards = CARDS) {
    let izq = [], der = [];
    if (Array.isArray(guardado)) {
        const lista = sinRepetir(guardado, cards);
        der = lista.slice(-1);
        izq = lista.slice(0, -1);
    } else if (guardado && typeof guardado === 'object') {
        const g = /** @type {any} */ (guardado);
        izq = Array.isArray(g.izq) ? sinRepetir(g.izq, cards) : [];
        der = Array.isArray(g.der) ? sinRepetir(g.der, cards).filter(c => !izq.includes(c)) : [];
    }
    const puestas = new Set([...izq, ...der]);
    cards.filter(c => !puestas.has(c)).forEach(c => {
        (DISPOSICION_POR_DEFECTO.der.includes(c) ? der : izq).push(c);
    });
    return { izq, der };
}

/**
 * Lo guardado → orden válido del celular. Sin orden propio se parte del de escritorio (izquierda y luego derecha).
 * @param {unknown} guardado
 * @param {{ izq: readonly string[], der: readonly string[] }} [base]
 * @param {readonly string[]} [cards]
 */
export function normalizarOrdenMovil(guardado, base = DISPOSICION_POR_DEFECTO, cards = CARDS) {
    const lista = Array.isArray(guardado) ? sinRepetir(guardado, cards) : [...base.izq, ...base.der].filter(c => cards.includes(c));
    cards.filter(c => !lista.includes(c)).forEach(c => lista.push(c));
    return lista;
}

/** Columna ('izq' | 'der') en que está la tarjeta. */
export function columnaDe(disposicion, cual) {
    return disposicion.izq.includes(cual) ? 'izq' : 'der';
}

/** Saca `cual` de la lista y lo inserta antes de `antesDe` (o al final si es null o no está). */
export function colocarEnLista(lista, cual, antesDe = null) {
    const sin = lista.filter(c => c !== cual);
    const idx = antesDe ? sin.indexOf(antesDe) : -1;
    if (idx === -1) sin.push(cual); else sin.splice(idx, 0, cual);
    return sin;
}

/** Sube (-1) o baja (1) una posición dentro de la lista. */
export function moverEnLista(lista, cual, delta) {
    const i = lista.indexOf(cual), j = i + delta;
    if (i === -1 || j < 0 || j >= lista.length) return [...lista];
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
}

/** Nueva disposición con `cual` en `columna`, antes de `antesDe` (o al final). No muta la original. */
export function colocarEnColumna(disposicion, cual, columna, antesDe = null) {
    const nueva = { izq: disposicion.izq.filter(c => c !== cual), der: disposicion.der.filter(c => c !== cual) };
    nueva[columna] = colocarEnLista(nueva[columna], cual, antesDe);
    return nueva;
}

/** Nueva disposición con la tarjeta movida a la otra columna (al final de ella). */
export function pasarAOtraColumna(disposicion, cual) {
    return colocarEnColumna(disposicion, cual, otraColumna(columnaDe(disposicion, cual)));
}

/** Nueva disposición con la tarjeta una posición arriba (-1) o abajo (1) dentro de su columna. */
export function moverEnColumna(disposicion, cual, delta) {
    const col = columnaDe(disposicion, cual);
    return { ...disposicion, [col]: moverEnLista(disposicion[col], cual, delta) };
}
