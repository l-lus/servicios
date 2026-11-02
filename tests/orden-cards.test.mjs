import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DISPOSICION_POR_DEFECTO, normalizarDisposicion, normalizarOrdenMovil, columnaDe,
    colocarEnLista, moverEnLista, colocarEnColumna, pasarAOtraColumna, moverEnColumna,
} from '../src/services/orden-cards.js';
import { CARDS } from '../src/core/constantes.js';

const todas = d => [...d.izq, ...d.der].sort();

test('disposición: sin nada guardado o inválido queda la de por defecto', () => {
    assert.deepEqual(normalizarDisposicion(null), { izq: [...DISPOSICION_POR_DEFECTO.izq], der: [...DISPOSICION_POR_DEFECTO.der] });
    assert.deepEqual(normalizarDisposicion('basura'), normalizarDisposicion(undefined));
    assert.deepEqual(normalizarDisposicion({ izq: 'x', der: 7 }), normalizarDisposicion(null));
});

test('disposición: una elección libre de columnas se respeta, sin repetidos ni desconocidos', () => {
    const d = normalizarDisposicion({ izq: ['servicios', 'resumen', 'nada', 'resumen'], der: ['atajos', 'servicios', 'estadisticas', 'calendario'] });
    assert.deepEqual(d, { izq: ['servicios', 'resumen'], der: ['atajos', 'estadisticas', 'calendario'] });
    assert.deepEqual(todas(d), [...CARDS].sort());
});

test('disposición: una columna puede quedar vacía', () => {
    const d = normalizarDisposicion({ izq: [...CARDS], der: [] });
    assert.deepEqual(d.der, []);
    assert.equal(d.izq.length, CARDS.length);
});

test('disposición: una tarjeta que no existía al guardar entra al final de su columna por defecto', () => {
    const d = normalizarDisposicion({ izq: ['resumen', 'atajos'], der: ['servicios'] });
    assert.deepEqual(d, { izq: ['resumen', 'atajos', 'estadisticas', 'calendario'], der: ['servicios'] });
});

test('disposición: acepta el formato anterior (lista con la última a la derecha)', () => {
    assert.deepEqual(normalizarDisposicion(['servicios', 'resumen', 'atajos', 'estadisticas', 'calendario']),
        { izq: ['servicios', 'resumen', 'atajos', 'estadisticas'], der: ['calendario'] });
});

test('orden del celular: parte del de escritorio (izquierda y luego derecha) y respeta uno propio', () => {
    const base = { izq: ['resumen', 'atajos'], der: ['servicios', 'estadisticas', 'calendario'] };
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

test('colocar entre columnas sin mutar la original', () => {
    const d = normalizarDisposicion(null);
    const copia = JSON.stringify(d);
    const n1 = colocarEnColumna(d, 'resumen', 'der', 'servicios');
    assert.deepEqual(n1.der, ['resumen', 'servicios']);
    assert.ok(!n1.izq.includes('resumen'));
    assert.equal(columnaDe(n1, 'resumen'), 'der');
    const n2 = colocarEnColumna(d, 'servicios', 'izq', 'atajos');
    assert.deepEqual(n2, { izq: ['resumen', 'servicios', 'atajos', 'estadisticas', 'calendario'], der: [] });
    assert.deepEqual(pasarAOtraColumna(d, 'atajos').der, ['servicios', 'atajos']);
    assert.deepEqual(pasarAOtraColumna(pasarAOtraColumna(d, 'atajos'), 'atajos').izq.slice(-1), ['atajos']);
    assert.deepEqual(moverEnColumna(d, 'estadisticas', -1).izq, ['resumen', 'estadisticas', 'atajos', 'calendario']);
    assert.equal(JSON.stringify(d), copia);
    for (const x of [n1, n2]) assert.deepEqual(todas(x), [...CARDS].sort());
});
