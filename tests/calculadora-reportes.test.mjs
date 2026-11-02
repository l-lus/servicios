import test from 'node:test';
import assert from 'node:assert/strict';
import { Calculadora } from '../src/services/calculadora.js';
import { ReportesTexto } from '../src/services/reportes-texto.js';
import { SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

const HOY = new Date(2026, 10, 15);
const f = (id, fecha, extra = {}) => ({ id, fecha, monto: 100, moneda: 'ars', pagada: false, ...extra });
const srv = (id, facturas) => ({ id, nombre: id, categoria: '', facturas });

test('totalSeleccion: pendientes (mes pasado/actual/siguiente), pagados y moneda', () => {
    const luz = srv('luz', [
        f('a', '2026-10-20'), f('b', '2026-11-10'), f('c', '2026-12-05'), f('d', '2027-02-01'),   // d fuera de rango
        f('e', '2026-11-03', { pagada: true, fechaPago: '2026-11-04' }),
        f('g', '2026-11-12', { moneda: 'usd', monto: 7 }), f('h', '2026-11-12', { monto: -9 }),
    ]);
    const p = Calculadora.totalSeleccion([luz], ['luz', 'inexistente'], 'pendientes', HOY);
    assert.deepEqual(p, { totalARS: 300, totalUSD: 7, cantidad: 4 });
    const g = Calculadora.totalSeleccion([luz], new Set(['luz']), 'pagados', HOY);
    assert.deepEqual(g, { totalARS: 100, totalUSD: 0, cantidad: 1 });
});

test('variacion: casos borde y rangos de promedio', () => {
    const m = (...montos) => montos.map((monto, i) => f(String(i), '2026-01-01', { monto }));
    assert.equal(Calculadora.variacion([]), null);
    assert.equal(Calculadora.variacion(m(5)), 'N/A');
    assert.equal(Calculadora.variacion(m(100, 110)), '+10.0%');
    assert.equal(Calculadora.variacion(m(100, 90, 50)), '-50.0%');
    assert.equal(Calculadora.variacion(m(100, 100, 200, 200)), '+100.0%');
    assert.equal(Calculadora.variacion(m(0, 5)), '+∞');
    assert.equal(Calculadora.variacion(m(0, 0)), '0%');
});

test('analizarPeriodo: filtra por rango, no muta el servicio y trata los ingresos aparte', () => {
    const luz = srv('luz', [f('a', '2026-03-01', { monto: 100 }), f('b', '2026-01-01', { monto: 50 }), f('c', '2026-05-01', { monto: 150 })]);
    const antes = JSON.stringify(luz);
    const r = Calculadora.analizarPeriodo(luz, '2026-02-01', '');
    assert.equal(r.totalRegistros, 2);
    assert.equal(r.arsTotal, 250);
    assert.equal(r.variacionTexto, '+50.0%');
    assert.equal(r.variacionUSDTexto, null);
    assert.equal(JSON.stringify(luz), antes, 'orden original intacto');

    const ing = srv(SERVICIO_INGRESOS_ID, [f('x', '2026-01-01', { tipo: 'complementario' })]);
    assert.equal(Calculadora.analizarPeriodo(ing, '', '').variacionTexto, 'Solo extras');
});

test('ReportesTexto.mensual: secciones, totales y nombre de archivo', () => {
    const servicios = [
        srv('Luz', [f('a', '2026-11-05'), f('b', '2026-11-20', { pagada: true, fechaPago: '2026-11-18', monto: 50 }), f('c', '2026-10-25', { pagada: true, fechaPago: '2026-11-02', monto: 70 })]),
        srv(SERVICIO_INGRESOS_ID, [f('i', '2026-11-01', { monto: 900 })]),
    ];
    const { texto, nombreArchivo } = ReportesTexto.mensual({ servicios, mes: 10, anio: 2026, ingresosHabilitado: true, hoy: HOY, ahora: new Date(2026, 10, 15, 9) });
    assert.match(nombreArchivo, /^reporte_noviembre_de_2026\.txt$/);
    assert.match(texto, /REPORTE DE ESTADÍSTICAS/);
    assert.match(texto, /Vencida \(pendiente\)/);
    assert.match(texto, /Pagada en noviembre/);
    assert.match(texto, /PAGADAS EN NOVIEMBRE/);
    assert.match(texto, /INGRESOS DEL MES/);
    assert.doesNotMatch(ReportesTexto.mensual({ servicios, mes: 10, anio: 2026, ingresosHabilitado: false, hoy: HOY }).texto, /INGRESOS DEL MES/);
});

test('ReportesTexto.individual: detalle, rango y resumen', () => {
    const luz = srv('Luz Hogar', [f('a', '2026-11-05'), f('b', '2026-11-20', { pagada: true, fechaPago: '2026-11-18', monto: 50 })]);
    const { texto, nombreArchivo } = ReportesTexto.individual({ servicio: luz, desde: '2026-11-01', hoy: HOY });
    assert.equal(nombreArchivo, 'reporte_Luz_Hogar_2026-11-01_hoy.txt');
    assert.match(texto, /DETALLE DE FACTURAS \(2\)/);
    assert.match(texto, /Vencida \(pendiente\)/);
    assert.match(texto, /Total ARS:/);
    assert.match(ReportesTexto.individual({ servicio: luz, hasta: '2020-01-01', hoy: HOY }).texto, /ninguna en el período/);
});
