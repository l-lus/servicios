import test from 'node:test';
import assert from 'node:assert/strict';
import { restaFechas, diasHasta, esFechaISO } from '../src/core/fechas.js';

test('restaFechas: milisegundos entre fechas ISO o Date, con el signo para ordenar; null cuenta como 0', () => {
    assert.equal(restaFechas('2026-11-11', '2026-11-10'), 24 * 60 * 60 * 1000, 'un día');
    assert.ok(restaFechas('2026-11-10', '2026-11-11') < 0);
    assert.equal(restaFechas('2026-11-10', '2026-11-10'), 0);
    assert.equal(restaFechas(new Date(5), new Date(2)), 3);
    assert.equal(restaFechas(null, null), 0);
    assert.deepEqual(['2026-12-01', '2026-11-03', '2026-11-20'].sort(restaFechas), ['2026-11-03', '2026-11-20', '2026-12-01']);
});

test('diasHasta: días enteros hasta la fecha, negativos si ya pasó', () => {
    const hoy = new Date(2026, 10, 10, 15, 30);
    assert.equal(diasHasta('2026-11-10', hoy), 0);
    assert.equal(diasHasta('2026-11-12', hoy), 2);
    assert.equal(diasHasta('2026-11-03', hoy), -7);
});

test('esFechaISO: solo fechas YYYY-MM-DD que existen en el calendario', () => {
    for (const f of ['2026-11-10', '2026-01-31', '2024-02-29', '2000-02-29', '2026-12-31']) assert.equal(esFechaISO(f), true, f);
    for (const f of ['2026-99-99', '2026-13-01', '2026-00-10', '2026-11-00', '2026-11-31', '2026-02-29', '1900-02-29',
        '10/11/2026', '2026-1-5', '2026-11-10T00:00:00', ' 2026-11-10', '', null, undefined, 20261110, new Date()]) {
        assert.equal(esFechaISO(f), false, String(f));
    }
});
