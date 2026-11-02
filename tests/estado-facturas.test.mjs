import test from 'node:test';
import assert from 'node:assert/strict';
import { EstadoFacturas, SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

// Sin `document` ni `localStorage`: si el servicio los toca, estos tests fallan.
const HOY = new Date(2026, 10, 15); // 15/11/2026
const f = (fecha, extra = {}) => ({ id: fecha, fecha, monto: 1000, moneda: 'ars', pagada: false, ...extra });
const srv = (nombre, facturas = [], extra = {}) => ({ id: nombre, nombre, facturas, ...extra });

test('clasificarFactura: favor, pagada, vencida y pendiente (hoy cuenta como pendiente)', () => {
    assert.equal(EstadoFacturas.clasificarFactura(f('2026-11-20', { monto: -5 }), HOY), 'favor');
    assert.equal(EstadoFacturas.clasificarFactura(f('2026-11-01', { pagada: true }), HOY), 'pagada');
    assert.equal(EstadoFacturas.clasificarFactura(f('2026-11-14'), HOY), 'vencida');
    assert.equal(EstadoFacturas.clasificarFactura(f('2026-11-15'), HOY), 'pendiente');
});

test('ultimaFactura: solo mira el mes actual; prioriza la pendiente más próxima', () => {
    assert.equal(EstadoFacturas.ultimaFactura(srv('a'), HOY), null);
    assert.equal(EstadoFacturas.ultimaFactura(srv('a', [f('2026-10-30')]), HOY), null);
    const s = srv('a', [f('2026-11-28'), f('2026-11-05'), f('2026-11-20', { pagada: true })]);
    assert.equal(EstadoFacturas.ultimaFactura(s, HOY).fecha, '2026-11-05');
});

test('ultimaFactura: si todas están pagadas devuelve la más reciente del mes', () => {
    const s = srv('a', [f('2026-11-05', { pagada: true }), f('2026-11-25', { pagada: true })]);
    assert.equal(EstadoFacturas.ultimaFactura(s, HOY).fecha, '2026-11-25');
});

test('estadoServicio: vencimientos, urgencia y pagado', () => {
    const est = (fecha, extra) => EstadoFacturas.estadoServicio(srv('a', [f(fecha, extra)]), HOY);
    assert.deepEqual(
        [est('2026-11-10').estado, est('2026-11-10').claseEstado], ['Vencido', 'vencido']);
    assert.deepEqual([est('2026-11-15').estado, est('2026-11-15').claseEstado], ['Vence hoy', 'urgente']);
    assert.deepEqual([est('2026-11-16').estado, est('2026-11-16').claseEstado], ['Vence mañana', 'urgente']);
    assert.deepEqual([est('2026-11-17').estado, est('2026-11-17').claseEstado], ['Vence en 2 días', 'urgente']);
    assert.deepEqual([est('2026-11-20').estado, est('2026-11-20').claseEstado], ['Vence en 5 días', 'proximo']);
    assert.deepEqual([est('2026-11-21').estado, est('2026-11-21').claseEstado], ['Vence en 6 días', 'lejano']);
    const pagado = est('2026-11-10', { pagada: true, fechaPago: '2026-11-09' });
    assert.equal(pagado.claseEstado, 'pagado');
    assert.match(pagado.estado, /^Pagado 09\/11\/2026$/);
    assert.equal(est('2026-11-10', { pagada: true }).estado, 'Pagado Sin fecha');
});

test('estadoServicio: sin facturas, sin facturas del mes y anual vigente', () => {
    assert.equal(EstadoFacturas.estadoServicio(srv('a'), HOY).claseEstado, 'sin-facturas');
    assert.equal(EstadoFacturas.estadoServicio(srv('a', [f('2026-09-01')]), HOY).claseEstado, 'sin-facturas-mes');
    const anual = srv('a', [f('2026-03-01', { tipo: 'anual', pagada: true, fechaPago: '2026-03-02' })]);
    const e = EstadoFacturas.estadoServicio(anual, HOY);
    assert.equal(e.claseEstado, 'pagado');
    assert.match(e.estado, /· Anual$/);
});

test('estadoServicio: el servicio de ingresos muestra Cobrado / Liquidado', () => {
    const ing = (fecha) => EstadoFacturas.estadoServicio(srv(SERVICIO_INGRESOS_ID, [f(fecha)], { id: SERVICIO_INGRESOS_ID }), HOY);
    assert.equal(ing('2026-11-10').estado, 'Cobrado');
    assert.equal(ing('2026-11-25').estado, 'Liquidado');
});

test('filtrar: por nombre sin tocar al servicio de ingresos', () => {
    const lista = [srv('Luz'), srv('Gas'), srv('Ingresos', [], { id: SERVICIO_INGRESOS_ID })];
    assert.deepEqual(EstadoFacturas.filtrar(lista, 'lu').map(s => s.nombre), ['Luz']);
    assert.equal(EstadoFacturas.filtrar(lista, '').length, 3);
});

test('ordenar: por nombre, por monto y por vencimiento (vencidas → pendientes → sin mes → pagadas → sin facturas)', () => {
    const vencida = srv('Vencida', [f('2026-11-03')]);
    const pend1 = srv('Pend1', [f('2026-11-18')]);
    const pend2 = srv('Pend2', [f('2026-11-25')]);
    const sinMes = srv('SinMes', [f('2026-09-10')]);
    const pagada = srv('Pagada', [f('2026-11-02', { pagada: true })]);
    const anual = srv('Anual', [f('2026-02-01', { tipo: 'anual', pagada: true })]);
    const vacia = srv('Vacia');
    const mezclado = [vacia, anual, pagada, sinMes, pend2, pend1, vencida];

    assert.deepEqual(
        EstadoFacturas.ordenar(mezclado, 'vencimiento', HOY).map(s => s.nombre),
        ['Vencida', 'Pend1', 'Pend2', 'SinMes', 'Pagada', 'Anual', 'Vacia']);
    assert.deepEqual(EstadoFacturas.ordenar(mezclado, 'nombre', HOY).map(s => s.nombre),
        ['Anual', 'Pagada', 'Pend1', 'Pend2', 'SinMes', 'Vacia', 'Vencida']);

    const caro = srv('Caro', [f('2026-11-20', { monto: 9000 })]);
    const barato = srv('Barato', [f('2026-11-20', { monto: 10 })]);
    assert.deepEqual(EstadoFacturas.ordenar([barato, caro], 'monto-desc', HOY).map(s => s.nombre), ['Caro', 'Barato']);
    assert.deepEqual(EstadoFacturas.ordenar([caro, barato], 'monto-asc', HOY).map(s => s.nombre), ['Barato', 'Caro']);
    assert.notEqual(EstadoFacturas.ordenar(mezclado, 'nombre', HOY), mezclado, 'no muta la lista original');
});

test('filtrar: sin distinguir mayúsculas ni acentos', () => {
    const lista = [srv('Electricidad'), srv('Gas Natural'), srv('Teléfono'), srv('Ñandú')];
    assert.deepEqual(EstadoFacturas.filtrar(lista, 'TELEFONO').map(s => s.nombre), ['Teléfono']);
    assert.deepEqual(EstadoFacturas.filtrar(lista, 'electrícidad').map(s => s.nombre), ['Electricidad']);
    assert.deepEqual(EstadoFacturas.filtrar(lista, 'nandu').map(s => s.nombre), ['Ñandú']);
    assert.equal(EstadoFacturas.filtrar(lista, '  ').length, 4);
});
