import test from 'node:test';
import assert from 'node:assert/strict';
import { ResumenMes } from '../src/services/resumen-mes.js';
import { SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

const HOY = new Date(2026, 10, 15);
const f = (fecha, extra = {}) => ({ fecha, monto: 100, moneda: 'ars', pagada: false, ...extra });
const srv = (id, facturas, extra = {}) => ({ id, nombre: id, facturas, ...extra });

const SERVICIOS = [
    srv('luz', [
        f('2026-11-05'),                                                    // vencida ARS 100
        f('2026-11-20', { monto: 50 }),                                     // pendiente ARS 50
        f('2026-11-10', { pagada: true, fechaPago: '2026-11-09', monto: 30 }), // pagada este mes
        f('2026-10-28', { pagada: true, fechaPago: '2026-11-02', monto: 70 }), // vencía en octubre, pagada en noviembre
    ]),
    srv('streaming', [f('2026-11-22', { monto: 10, moneda: 'usd' })]),
    srv('tarjeta', [f('2026-11-12', { monto: 999, conCredito: true })]),
    srv('favor', [f('2026-11-03', { monto: -40 })]),
    srv(SERVICIO_INGRESOS_ID, [f('2026-11-01', { monto: 5000 })]),
];

test('calcular: pendientes, pagados del mes y totales por moneda (excluye créditos, favores e ingresos)', () => {
    const r = ResumenMes.calcular(SERVICIOS, HOY);
    assert.equal(r.pendienteARS, 150);
    assert.equal(r.pendienteUSD, 10);
    assert.equal(r.pagadoMesARS, 100);            // 30 + 70 pagadas en noviembre
    assert.equal(r.pagadoDelMesActualARS, 30);    // solo la que además vencía en noviembre
    assert.equal(r.totalPeriodoARS, 180);         // 100 + 50 + 30
    assert.equal(r.totalPeriodoUSD, 10);
    assert.equal(r.cantidadPendientesEsteMes, 4); // incluye la con crédito (se cuenta pero no suma)
    assert.equal(r.cantidadPagadasVencenEsteMes, 1);
    assert.equal(r.pendiente, 160);
});

test('colorBorde: toma la factura más urgente del mes', () => {
    assert.equal(ResumenMes.colorBorde(SERVICIOS, HOY), 'borde-vencido');
    assert.equal(ResumenMes.colorBorde([srv('a', [f('2026-11-16')])], HOY), 'borde-urgente');
    assert.equal(ResumenMes.colorBorde([srv('a', [f('2026-11-19')])], HOY), 'borde-proximo');
    assert.equal(ResumenMes.colorBorde([srv('a', [f('2026-11-28')])], HOY), 'borde-lejano');
    assert.equal(ResumenMes.colorBorde([srv('a', [f('2026-11-28', { pagada: true })])], HOY), 'borde-pagado');
    assert.equal(ResumenMes.colorBorde([], HOY), 'borde-pagado');
});

test('detalle: estado de cada factura que vence y pagadas de otro vencimiento', () => {
    const { vencenEsteMes, pagadasOtroMes } = ResumenMes.detalle(SERVICIOS, HOY);
    const estados = Object.fromEntries(vencenEsteMes.map(x => [`${x.servicio}:${x.factura.fecha}`, x.estado]));
    assert.equal(estados['luz:2026-11-05'], 'Vencida');
    assert.equal(estados['luz:2026-11-20'], 'Pendiente');
    assert.equal(estados['luz:2026-11-10'], 'Pagada este mes');
    assert.equal(estados['tarjeta:2026-11-12'], 'Con crédito');
    assert.ok(!('favor:2026-11-03' in estados), 'los saldos a favor no aparecen');
    assert.equal(pagadasOtroMes.length, 1);
    assert.match(pagadasOtroMes[0].mesVenc, /octubre/);
});

test('estadisticasMes: totales del mes elegido, ingresos aparte y filtro por categoría', () => {
    const r = ResumenMes.estadisticasMes(SERVICIOS, { mes: 10, anio: 2026, hoy: HOY });
    assert.equal(r.totalMesARS, 180);
    assert.equal(r.totalMesUSD, 10);
    assert.equal(r.totalIngresosARS, 5000);
    assert.equal(r.cantidadVencidas, 2);        // luz 11-05 y tarjeta 11-12
    assert.equal(r.cantidadPendientes, 2);
    assert.equal(r.cantidadFacturasMes, 5);
    assert.equal(r.cantidadPagadas, 3);         // favor + 2 pagos hechos en noviembre
    assert.equal(r.totalPagadoMesARS, 100);

    const conCat = [srv('a', [f('2026-11-20', { monto: 7 })], { categoria: 'Casa' }), srv('b', [f('2026-11-20', { monto: 9 })], { categoria: 'Auto' })];
    assert.equal(ResumenMes.estadisticasMes(conCat, { mes: 10, anio: 2026, categoria: 'Casa', hoy: HOY }).totalMesARS, 7);
    const otroMes = ResumenMes.estadisticasMes(SERVICIOS, { mes: 9, anio: 2026, hoy: HOY });
    assert.equal(otroMes.totalMesARS, 70);
});
