import test from 'node:test';
import assert from 'node:assert/strict';
import { ReporteHTML } from '../src/services/reporte-html.js';
import { ReporteDatos } from '../src/services/reporte-datos.js';
import { SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

const HOY = new Date(2026, 10, 15), AHORA = new Date(2026, 10, 15, 9);
const f = (id, fecha, extra = {}) => ({ id, fecha, monto: 100, moneda: 'ars', pagada: false, ...extra });
const servicios = [
    { id: 'luz', nombre: 'Luz <script>alert(1)</script>', categoria: 'Casa', facturas: [f('a', '2026-11-05'), f('b', '2026-11-20', { pagada: true, fechaPago: '2026-11-18', monto: 50 }), f('c', '2026-10-25', { pagada: true, fechaPago: '2026-11-02', monto: 70 })] },
    { id: 'gas', nombre: 'Gas', categoria: '', facturas: [f('g', '2026-11-09', { monto: 300 })] },
    { id: SERVICIO_INGRESOS_ID, nombre: 'Ingresos', categoria: '', facturas: [f('i', '2026-11-01', { monto: 900 })] },
];

test('ReporteDatos.mensual: totales, pagadas de otro mes, ingresos y gasto por categoría ordenado', () => {
    const d = ReporteDatos.mensual({ servicios, mes: 10, anio: 2026, hoy: HOY });
    assert.equal(d.venceEsteMes.length, 3);
    assert.equal(d.pagadasOtroMes.length, 1);
    assert.deepEqual(d.totales.vencen, { ars: 450, usd: 0 });
    assert.deepEqual(d.totales.pagadas, { ars: 50, usd: 0 });
    assert.deepEqual(d.totales.pendientes, { ars: 400, usd: 0 });
    assert.deepEqual(d.totales.ingresos, { ars: 900, usd: 0 });
    assert.deepEqual(d.porCategoria.map(c => [c.categoria, c.ars]), [['', 300], ['Casa', 150]]);
});

test('ReporteHTML.mensual: documento autocontenido, con CSP propia, escapado y secciones elegibles', () => {
    const { documento, nombreArchivo } = ReporteHTML.mensual({ servicios, mes: 10, anio: 2026, hoy: HOY, ahora: AHORA });
    assert.equal(nombreArchivo, 'reporte_noviembre_de_2026.html');
    assert.match(documento, /^<!DOCTYPE html>/);
    assert.match(documento, /Content-Security-Policy" content="default-src 'none'/);
    assert.doesNotMatch(documento, /<script>alert/, 'el nombre del servicio se escapa');
    assert.match(documento, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    for (const t of ['Resumen del mes', 'Facturas que vencen en noviembre', 'Pagadas en noviembre', 'Gasto por categoría', 'Ingresos del mes']) assert.match(documento, new RegExp(t));
    assert.match(documento, /Vencida \(pendiente\)/);
    assert.match(documento, /11% del total|% del total del mes/);

    const solo = ReporteHTML.mensual({ servicios, mes: 10, anio: 2026, hoy: HOY, ahora: AHORA, secciones: { resumen: false, vencen: false, pagadasOtroMes: false, ingresos: false } }).documento;
    assert.match(solo, /Gasto por categoría/);
    assert.doesNotMatch(solo, /Resumen del mes|Ingresos del mes|Facturas que vencen/);
});

test('ReporteHTML.individual: resumen y detalle del rango', () => {
    const { documento, nombreArchivo } = ReporteHTML.individual({ servicio: { ...servicios[1], nombre: 'Gas Natural' }, desde: '2026-01-01', hoy: HOY, ahora: AHORA });
    assert.equal(nombreArchivo, 'reporte_Gas_Natural_2026-01-01_hoy.html');
    assert.match(documento, /Detalle de facturas/);
    assert.match(documento, /Reporte de Gas Natural/);
    const sinDetalle = ReporteHTML.individual({ servicio: servicios[1], secciones: { detalle: false }, hoy: HOY, ahora: AHORA }).documento;
    assert.doesNotMatch(sinDetalle, /Detalle de facturas/);
});
