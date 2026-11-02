import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumenAnual as R } from '../src/services/resumen-anual.js';
import { SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

const f = (id, fecha, extra = {}) => ({ id, fecha, monto: 100, moneda: 'ars', pagada: false, ...extra });
const srv = (id, facturas, categoria = '') => ({ id, nombre: id, categoria, facturas });

const servicios = [
    srv('luz', [f('a', '2026-01-10', { monto: 100, pagada: true }), f('b', '2026-03-10', { monto: 300 }), f('c', '2026-03-20', { monto: 50 }), f('p', '2025-06-01', { monto: 200 })], 'Casa'),
    srv('net', [f('d', '2026-03-05', { monto: 10, moneda: 'usd' }), f('e', '2026-07-01', { monto: 999, conCredito: true }), f('g', '2026-07-02', { monto: -50 })], 'Hogar'),
    srv('gas', [f('h', '2026-12-31', { monto: 150, pagada: true })]),
    srv(SERVICIO_INGRESOS_ID, [f('i', '2026-05-01', { monto: 4000 }), f('j', '2025-05-01', { monto: 9 })]),
];

test('aniosDisponibles: de mayor a menor, sin ingresos, y el año actual si no hay facturas', () => {
    assert.deepEqual(R.aniosDisponibles(servicios), [2026, 2025]);
    assert.deepEqual(R.aniosDisponibles([], new Date(2030, 0, 1)), [2030]);
    assert.deepEqual(R.aniosDisponibles([srv(SERVICIO_INGRESOS_ID, [f('i', '2019-01-01')])], new Date(2030, 0, 1)), [2030]);
});

test('calcular: totales por mes y moneda, sin créditos ni saldos a favor ni ingresos', () => {
    const r = R.calcular(servicios, 2026);
    assert.deepEqual(r.total, { ars: 600, usd: 10 });
    assert.deepEqual(r.pendiente, { ars: 350, usd: 10 });
    assert.equal(r.facturas, 5);
    assert.equal(r.pagadas, 2);
    assert.deepEqual(r.meses.map(m => m.ars), [100, 0, 350, 0, 0, 0, 0, 0, 0, 0, 0, 150]);
    assert.equal(r.meses[2].usd, 10);
    assert.equal(r.meses[2].cantidad, 3);
    assert.deepEqual(r.ingresos, { ars: 4000, usd: 0 });
    assert.deepEqual(r.anterior, { ars: 200, usd: 0 });
});

test('calcular: promedio por mes con gasto, extremos, categorías, variación y % del ingreso', () => {
    const r = R.calcular(servicios, 2026);
    assert.equal(r.medida, 'ars');
    assert.deepEqual(r.promedio, { ars: 200, usd: 10 }, 'cada moneda se promedia sobre sus propios meses');
    assert.equal(r.mesMayor, 2);
    assert.equal(r.mesMenor, 0);
    assert.deepEqual(r.porCategoria.map(c => [c.categoria, c.ars, c.usd, c.cantidad]), [['Casa', 450, 0, 3], ['', 150, 0, 1], ['Hogar', 0, 10, 1]]);
    assert.equal(r.variacion, 200);                 // 600 vs 200
    assert.equal(r.porcentajeIngreso, 15);          // 600 de 4000
});

test('calcular: año sin datos y casos sin comparación', () => {
    const vacio = R.calcular(servicios, 2020);
    assert.equal(vacio.facturas, 0);
    assert.equal(vacio.mesMayor, null);
    assert.equal(vacio.mesMenor, null);
    assert.equal(vacio.variacion, null);
    assert.equal(vacio.porcentajeIngreso, null);
    const unMes = R.calcular([srv('x', [f('a', '2026-02-01')])], 2026);
    assert.equal(unMes.mesMayor, 1);
    assert.equal(unMes.mesMenor, null, 'con un solo mes no hay "menor"');
    const soloUsd = R.calcular([srv('x', [f('a', '2026-02-01', { moneda: 'usd', monto: 5 }), f('b', '2026-04-01', { moneda: 'usd', monto: 9 })])], 2026);
    assert.equal(soloUsd.medida, 'usd');
    assert.equal(soloUsd.mesMayor, 3);
    assert.equal(soloUsd.mesMenor, 1);
});
