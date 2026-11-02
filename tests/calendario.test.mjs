import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarioVencimientos as C } from '../src/services/calendario-vencimientos.js';
import { EstadoFacturas, SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

const HOY = new Date(2026, 10, 15);   // domingo 15/11/2026
const f = (id, fecha, extra = {}) => ({ id, fecha, monto: 100, moneda: 'ars', pagada: false, ...extra });
const srv = (nombre, facturas, extra = {}) => ({ id: nombre, nombre, categoria: '', facturas, ...extra });

test('claseVencimiento: coincide con los umbrales de la lista (vencido, urgente ≤2, próximo ≤5, lejano)', () => {
    const c = (fecha, extra) => EstadoFacturas.claseVencimiento(f('x', fecha, extra), HOY);
    assert.equal(c('2026-11-14'), 'vencido');
    assert.equal(c('2026-11-15'), 'urgente');
    assert.equal(c('2026-11-17'), 'urgente');
    assert.equal(c('2026-11-18'), 'proximo');
    assert.equal(c('2026-11-20'), 'proximo');
    assert.equal(c('2026-11-21'), 'lejano');
    assert.equal(c('2026-11-01', { pagada: true }), 'pagado');
    assert.equal(c('2026-11-01', { monto: -5 }), 'favor');
    for (const [fecha, esperado] of [['2026-11-14', 'Vencido'], ['2026-11-15', 'Vence hoy'], ['2026-11-18', 'Vence en 3 días'], ['2026-11-21', 'Vence en 6 días']]) {
        const s = srv('a', [f('x', fecha)]);
        const clase = EstadoFacturas.claseVencimiento(s.facturas[0], HOY);
        assert.equal(EstadoFacturas.estadoServicio(s, HOY).claseEstado, clase, `${esperado}: la lista y el calendario usan la misma clase`);
    }
});

test('construirMes: semanas de lunes a domingo, relleno, hoy y largo del mes', () => {
    const m = C.construirMes([], { anio: 2026, mes: 10 }, HOY);   // noviembre 2026 empieza en domingo
    assert.equal(m.semanas.length, 6);
    assert.ok(m.semanas.every(s => s.length === 7));
    assert.deepEqual(m.semanas[0].map(c => c && c.dia), [null, null, null, null, null, null, 1]);
    assert.equal(m.semanas.flat().filter(Boolean).length, 30);
    assert.deepEqual(m.semanas.flat().filter(c => c?.esHoy).map(c => c.dia), [15]);
    assert.equal(C.construirMes([], { anio: 2027, mes: 1 }, HOY).semanas.length, 4, 'febrero de 2027 empieza en lunes: 4 semanas exactas');
});

test('construirMes: facturas por día, clase más urgente, totales y resumen', () => {
    const servicios = [
        srv('Luz', [f('a', '2026-11-05'), f('b', '2026-11-20', { monto: 50 }), f('o', '2026-10-30')]),
        srv('Gas', [f('c', '2026-11-05', { pagada: true, fechaPago: '2026-11-04', monto: 30 }), f('d', '2026-11-22', { moneda: 'usd', monto: 9 })]),
        srv('Tarjeta', [f('e', '2026-11-12', { conCredito: true, monto: 999 })]),
        srv('Favor', [f('g', '2026-11-03', { monto: -40 })]),
        srv(SERVICIO_INGRESOS_ID, [f('i', '2026-11-05', { monto: 5000 })]),
    ];
    const m = C.construirMes(servicios, { anio: 2026, mes: 10 }, HOY);
    const dia = n => m.semanas.flat().find(c => c?.dia === n);
    assert.deepEqual(dia(5).facturas.map(x => `${x.servicio.nombre}:${x.clase}`), ['Gas:pagado', 'Luz:vencido']);
    assert.equal(dia(5).clase, 'vencido', 'manda la más urgente');
    assert.deepEqual(dia(5).total, { ars: 130, usd: 0 });
    assert.equal(dia(20).clase, 'proximo');
    assert.equal(dia(22).clase, 'lejano');
    assert.equal(dia(3).clase, 'favor');
    assert.equal(dia(1).clase, '');
    assert.deepEqual(m.resumen, {
        facturas: 5, pagadas: 1, pendientes: 4, vencidas: 2,
        total: { ars: 100 + 50 + 30, usd: 9 }, pendiente: { ars: 150, usd: 9 },
    });
    assert.ok(!m.semanas.flat().some(c => c?.facturas.some(x => x.servicio.id === SERVICIO_INGRESOS_ID)), 'los ingresos no aparecen');
});

test('desplazarMes: cruza el año en ambos sentidos', () => {
    assert.deepEqual(C.desplazarMes({ anio: 2026, mes: 11 }, 1), { anio: 2027, mes: 0 });
    assert.deepEqual(C.desplazarMes({ anio: 2026, mes: 0 }, -1), { anio: 2025, mes: 11 });
    assert.deepEqual(C.desplazarMes({ anio: 2026, mes: 5 }, 0), { anio: 2026, mes: 5 });
});
