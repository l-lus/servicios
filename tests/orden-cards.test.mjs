import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DISPOSICION_POR_DEFECTO, COLUMNAS, columnasActivas, normalizarDisposicion, normalizarOrdenMovil, columnaDe,
    colocarEnLista, moverEnLista, colocarEnColumna, pasarAColumna, moverEnColumna,
} from '../src/services/orden-cards.js';
import { CARDS } from '../src/core/constantes.js';

const todas = d => [...d.izq, ...d.cen, ...d.der].sort();
const porDefecto = () => ({ izq: [...DISPOSICION_POR_DEFECTO.izq], cen: [], der: [...DISPOSICION_POR_DEFECTO.der] });

test('disposición: sin nada guardado o inválido queda la de por defecto', () => {
    assert.deepEqual(normalizarDisposicion(null), porDefecto());
    assert.deepEqual(normalizarDisposicion('basura'), porDefecto());
    assert.deepEqual(normalizarDisposicion({ izq: 'x', der: 7, cen: {} }), porDefecto());
});

test('disposición: una elección libre de tres columnas se respeta, sin repetidos ni desconocidos', () => {
    const d = normalizarDisposicion({ izq: ['servicios', 'resumen', 'nada', 'resumen'], cen: ['atajos', 'servicios'], der: ['estadisticas', 'calendario', 'atajos'] });
    assert.deepEqual(d, { izq: ['servicios', 'resumen'], cen: ['atajos'], der: ['estadisticas', 'calendario'] });
    assert.deepEqual(todas(d), [...CARDS].sort());
});

test('disposición: con 2 columnas lo del centro pasa al final de la derecha', () => {
    const d = normalizarDisposicion({ izq: ['resumen'], cen: ['atajos', 'calendario'], der: ['servicios', 'estadisticas'] }, CARDS, 2);
    assert.deepEqual(d, { izq: ['resumen'], cen: [], der: ['servicios', 'estadisticas', 'atajos', 'calendario'] });
});

test('disposición: las columnas pueden quedar vacías', () => {
    const d = normalizarDisposicion({ izq: [...CARDS], cen: [], der: [] });
    assert.deepEqual([d.cen, d.der], [[], []]);
    assert.equal(d.izq.length, CARDS.length);
});

test('disposición: una tarjeta que no existía al guardar entra al final de su columna por defecto', () => {
    assert.deepEqual(normalizarDisposicion({ izq: ['resumen', 'atajos'], der: ['servicios'] }),
        { izq: ['resumen', 'atajos', 'estadisticas', 'calendario'], cen: [], der: ['servicios'] });
});

test('disposición: acepta el formato anterior (lista con la última a la derecha) y el de dos columnas sin centro', () => {
    assert.deepEqual(normalizarDisposicion(['servicios', 'resumen', 'atajos', 'estadisticas', 'calendario']),
        { izq: ['servicios', 'resumen', 'atajos', 'estadisticas'], cen: [], der: ['calendario'] });
});

test('columnasActivas: 2 o 3', () => {
    assert.deepEqual(columnasActivas(2), ['izq', 'der']);
    assert.deepEqual(columnasActivas(3), [...COLUMNAS]);
    assert.deepEqual(columnasActivas(undefined), ['izq', 'der']);
});

test('orden del celular: parte del de escritorio (izquierda, centro y derecha) y respeta uno propio', () => {
    const base = { izq: ['resumen'], cen: ['atajos'], der: ['servicios', 'estadisticas', 'calendario'] };
    assert.deepEqual(normalizarOrdenMovil(null, base), ['resumen', 'atajos', 'servicios', 'estadisticas', 'calendario']);
    assert.deepEqual(normalizarOrdenMovil(['servicios', 'nada', 'servicios', 'resumen'], base), ['servicios', 'resumen', 'atajos', 'estadisticas', 'calendario']);
});

test('colocar y mover en una lista', () => {
    assert.deepEqual(colocarEnLista(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
    assert.deepEqual(colocarEnLista(['a', 'b', 'c'], 'a'), ['b', 'c', 'a']);
    assert.deepEqual(colocarEnLista(['a', 'b'], 'x', 'inexistente'), ['a', 'b', 'x']);
    assert.deepEqual(moverEnLista(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
    assert.deepEqual(moverEnLista(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'], 'en el borde no hace nada');
    assert.deepEqual(moverEnLista(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
});

test('colocar entre tres columnas sin mutar la original', () => {
    const d = normalizarDisposicion(null);
    const copia = JSON.stringify(d);
    const n1 = colocarEnColumna(d, 'resumen', 'der', 'servicios');
    assert.deepEqual(n1.der, ['resumen', 'servicios']);
    assert.ok(!n1.izq.includes('resumen'));
    assert.equal(columnaDe(n1, 'resumen'), 'der');
    const n2 = pasarAColumna(d, 'estadisticas', 'cen');
    assert.deepEqual([n2.izq, n2.cen], [['resumen', 'atajos', 'calendario'], ['estadisticas']]);
    assert.equal(columnaDe(n2, 'estadisticas'), 'cen');
    assert.deepEqual(pasarAColumna(n2, 'estadisticas', 'der').cen, []);
    assert.deepEqual(moverEnColumna(d, 'estadisticas', -1).izq, ['resumen', 'estadisticas', 'atajos', 'calendario']);
    assert.equal(JSON.stringify(d), copia);
    for (const x of [n1, n2]) assert.deepEqual(todas(x), [...CARDS].sort());
});
