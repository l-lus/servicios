import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizarOrdenCards, columnasDesdeOrden, tamanosDeColumnas, prepararColumnas, moverCard, esTamanosColumnasValidos, MAX_COLUMNAS
} from '../src/services/orden-cards.js';
import { CARDS } from '../src/core/constantes.js';

const ORDEN = ['resumen', 'estadisticas', 'calendario', 'servicios'];

test('normalizarOrdenCards: sin nada guardado, inválido o en formato anterior devuelve todas las tarjetas', () => {
    assert.deepEqual(normalizarOrdenCards(null), [...CARDS]);
    assert.deepEqual(normalizarOrdenCards('basura'), [...CARDS]);
    assert.deepEqual(normalizarOrdenCards({ izq: ['servicios', 'resumen'], cen: ['estadisticas'], der: ['calendario'] }),
        ['servicios', 'resumen', 'estadisticas', 'calendario']);
});

test('Columnas: sin tamaños guardados se usa el reparto por defecto (todas a la izquierda salvo la última, que va a la derecha)', () => {
    assert.deepEqual(columnasDesdeOrden(ORDEN), [['resumen', 'estadisticas', 'calendario'], ['servicios']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, [3, 1]), [['resumen', 'estadisticas', 'calendario'], ['servicios']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, [2, 1, 1]), [['resumen', 'estadisticas'], ['calendario'], ['servicios']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, [0, 4]), [ORDEN]);   // una columna vacía no existe
    // tamaños que no suman el total o inválidos: reparto por defecto
    assert.deepEqual(columnasDesdeOrden(ORDEN, [3]), [['resumen', 'estadisticas', 'calendario'], ['servicios']]);
    assert.deepEqual(columnasDesdeOrden(ORDEN, 'x'), [['resumen', 'estadisticas', 'calendario'], ['servicios']]);
});

test('Columnas: validación de tamaños (hasta 3, enteros; la primera puede ser 0 por compatibilidad)', () => {
    assert.equal(esTamanosColumnasValidos([1, 2]), true);
    assert.equal(esTamanosColumnasValidos([0, 3]), true);
    assert.equal(esTamanosColumnasValidos([1, 0]), false);
    assert.equal(esTamanosColumnasValidos([1, 1, 1, 1]), false);
    assert.equal(esTamanosColumnasValidos([1.5, 1]), false);
    assert.equal(esTamanosColumnasValidos([]), false);
    assert.equal(esTamanosColumnasValidos([1, 2], 4), false);
    assert.equal(MAX_COLUMNAS, 3);
});

test('Columnas: mover una tarjeta a otra columna, entre dos tarjetas o al final', () => {
    const base = [['resumen'], ['estadisticas', 'servicios']];
    assert.deepEqual(moverCard(base, 'resumen', 1, 'servicios'), [['estadisticas', 'resumen', 'servicios']]);
    assert.deepEqual(moverCard(base, 'servicios', 0), [['resumen', 'servicios'], ['estadisticas']]);
    assert.deepEqual(moverCard(base, 'servicios', 1, 'estadisticas'), [['resumen'], ['servicios', 'estadisticas']]);
    assert.equal(moverCard(base, 'estadisticas', 1, 'servicios'), null);   // ya está ahí: sin cambio
});

test('Columnas: soltar en el hueco de la derecha abre una columna nueva, y una columna vacía desaparece', () => {
    const base = [['resumen'], ['estadisticas', 'servicios']];
    const tres = moverCard(base, 'servicios', 2);
    assert.deepEqual(tres, [['resumen'], ['estadisticas'], ['servicios']]);
    assert.deepEqual(tamanosDeColumnas(tres), [1, 1, 1]);
    // la única tarjeta de una columna al hueco de al lado no cambia nada (la columna se vacía y se vuelve a abrir)
    assert.equal(moverCard(tres, 'servicios', 3), null);
    // vaciar una columna del medio la quita
    assert.deepEqual(moverCard(tres, 'estadisticas', 0), [['resumen', 'estadisticas'], ['servicios']]);
    // la primera columna también desaparece si se vacía: la segunda pasa a ser la primera
    assert.deepEqual(moverCard([['resumen'], ['estadisticas', 'servicios']], 'resumen', 1), [['estadisticas', 'servicios', 'resumen']]);
});

test('Columnas: nunca más de 3 columnas con tarjetas visibles', () => {
    const tres = [['resumen'], ['estadisticas'], ['servicios']];
    assert.equal(moverCard(tres, 'servicios', 3), null);
    assert.equal(moverCard([['resumen', 'estadisticas'], ['servicios']], 'estadisticas', 2, null, { max: 2 }), null);
    // una columna de tarjetas ocultas no cuenta
    const visibles = new Set(['resumen', 'estadisticas']);
    assert.deepEqual(moverCard([['resumen'], ['estadisticas'], ['servicios']], 'resumen', 3, null, { max: 3, visibles }), [['estadisticas'], ['servicios'], ['resumen']]);
});

test('Columnas: preparar para dibujar funde columnas sin tarjetas visibles y respeta el máximo', () => {
    const cols = [['resumen'], ['estadisticas'], ['servicios']];
    assert.deepEqual(prepararColumnas(cols), cols);
    assert.deepEqual(prepararColumnas(cols, 2), [['resumen'], ['estadisticas', 'servicios']]);
    assert.deepEqual(prepararColumnas(cols, 3, new Set(['resumen', 'servicios'])), [['resumen', 'estadisticas'], ['servicios']]);
    // una primera columna sin tarjetas visibles se funde con la siguiente
    assert.deepEqual(prepararColumnas(cols, 3, new Set(['estadisticas', 'servicios'])), [['resumen', 'estadisticas'], ['servicios']]);
    // no modifica lo que recibe
    assert.deepEqual(cols, [['resumen'], ['estadisticas'], ['servicios']]);
});

test('Columnas: en escritorio un movimiento nunca deja una sola columna', () => {
    const opc = { exigirDosColumnas: true };
    // la única tarjeta de una columna no puede pasar a la otra (quedaría una sola)
    assert.equal(moverCard([['resumen', 'estadisticas'], ['servicios']], 'servicios', 0, null, opc), null);
    // pero sí se puede cambiar de lugar dentro de la derecha o pasar de una columna derecha a otra
    assert.deepEqual(moverCard([['resumen'], ['estadisticas', 'servicios']], 'servicios', 1, 'estadisticas', opc), [['resumen'], ['servicios', 'estadisticas']]);
    assert.deepEqual(moverCard([['resumen'], ['estadisticas'], ['servicios']], 'servicios', 1, null, opc), [['resumen'], ['estadisticas', 'servicios']]);
    // las tarjetas ocultas no cuentan: si 'servicios' está oculta, la derecha tiene una sola visible
    const visibles = new Set(['resumen', 'estadisticas']);
    assert.equal(moverCard([['resumen'], ['estadisticas', 'servicios']], 'estadisticas', 0, null, { ...opc, visibles }), null);
    // si ya había una sola columna, se puede mover libremente
    assert.deepEqual(moverCard([['resumen', 'estadisticas']], 'estadisticas', 0, 'resumen', opc), [['estadisticas', 'resumen']]);
    // sin la restricción (móvil) se permite
    assert.deepEqual(moverCard([['resumen', 'estadisticas'], ['servicios']], 'servicios', 0), [['resumen', 'estadisticas', 'servicios']]);
});
