import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarOrdenCards, fusionarOrdenVisibles, columnaDeCard, CARDS_EN_DERECHA } from '../src/services/orden-cards.js';
import { CARDS } from '../src/core/constantes.js';

test('orden de tarjetas: sin orden guardado o inválido queda el de por defecto', () => {
    assert.deepEqual(normalizarOrdenCards(null), [...CARDS]);
    assert.deepEqual(normalizarOrdenCards(['x', 'y']), [...CARDS]);
});

test('orden de tarjetas: una tarjeta que no existía al guardar entra en su lugar por defecto sin tocar lo elegido', () => {
    // el calendario se agregó después: un orden viejo sin él lo incorpora
    const orden = normalizarOrdenCards(['servicios', 'resumen', 'atajos', 'estadisticas']);
    assert.equal(orden.length, CARDS.length);
    assert.deepEqual(orden.filter(c => c !== 'calendario'), ['servicios', 'resumen', 'atajos', 'estadisticas']);
});

test('orden de tarjetas: un orden completo se respeta y se descartan repetidos y desconocidos', () => {
    const invertido = [...CARDS].reverse();
    assert.deepEqual(normalizarOrdenCards(invertido), invertido);
    assert.deepEqual(normalizarOrdenCards(['atajos', 'atajos', 'nada', ...CARDS.filter(c => c !== 'atajos')]), ['atajos', ...CARDS.filter(c => c !== 'atajos')]);
});

test('orden de tarjetas: reordenar las visibles deja las ocultas en su lugar', () => {
    assert.deepEqual(fusionarOrdenVisibles(['a', 'oculta', 'b', 'c'], ['c', 'b', 'a']), ['c', 'oculta', 'b', 'a']);
    assert.deepEqual(fusionarOrdenVisibles(['a', 'b'], ['b', 'a']), ['b', 'a']);
});

test('orden de tarjetas: en escritorio la última va a la columna derecha', () => {
    assert.equal(CARDS_EN_DERECHA, 1);
    assert.deepEqual([0, 1, 2, 3, 4].map(i => columnaDeCard(i, 5)), [0, 0, 0, 0, 1]);
});
