import test from 'node:test';
import assert from 'node:assert/strict';
import { Sincronizacion, claveBorrado, DIAS_RETENCION_BORRADOS } from '../src/services/sincronizacion.js';
import { ImportarExportar as IE } from '../src/services/importar-exportar.js';
import { SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';
import { esInstanteISO } from '../src/core/fechas.js';
import { SecurityAndUtils } from '../src/core/seguridad.js';

const fac = (id, extra = {}) => ({ id, monto: 100, fecha: '2026-11-10', pagada: false, fechaPago: null, ...extra });
const srv = (id, facturas = [], extra = {}) => ({ id, nombre: id, categoria: '', facturas, ...extra });
const dia = (n) => new Date(Date.UTC(2026, 10, n, 12, 0, 0));          // 2026-11-<n> 12:00 UTC
const iso = (n) => dia(n).toISOString();
const clon = (x) => JSON.parse(JSON.stringify(x));
const borrado = (servicio, id, n) => ({ servicio, id, fecha: iso(n) });

/** Un «dispositivo»: sus datos, su registro de borrados y la instantánea del último guardado, igual que StorageService. */
function dispositivo(servicios = [], borrados = []) {
    const d = { servicios, borrados, base: Sincronizacion.instantanea(servicios) };
    d.guardar = (ahora) => { const r = Sincronizacion.sellarCambios(d.base, d.servicios, d.borrados, ahora); d.borrados = r.borrados; d.base = r.base; };
    /** Combinar lo que subió otro (lo remoto es lo que tiene `otro` después de guardar). */
    d.combinar = (otro, ahora) => {
        const borradosUnidos = Sincronizacion.unirBorrados(d.borrados, otro.borrados, ahora);
        const cuenta = IE.fusionarServicios(d.servicios, clon(otro.servicios), borradosUnidos);
        d.borrados = borradosUnidos;
        d.base = Sincronizacion.instantanea(d.servicios);
        return cuenta;
    };
    return d;
}

test('esInstanteISO: solo el formato exacto de toISOString y que exista', () => {
    assert.equal(esInstanteISO('2026-11-10T15:30:00.000Z'), true);
    for (const malo of ['2026-11-10', '2026-11-10T15:30:00Z', '2026-11-10T15:30:00.000+03:00', '2026-02-30T10:00:00.000Z', '2026-11-10T24:00:00.000Z', '2026-11-10T10:60:00.000Z', 5, null, undefined])
        assert.equal(esInstanteISO(malo), false, String(malo));
});

test('sanearBorrados: descarta lo inválido, se queda con la fecha más nueva de cada clave y respeta el tope', () => {
    const ok = borrado('luz', 'f1', 5);
    const lista = Sincronizacion.sanearBorrados([
        ok, borrado('luz', 'f1', 3), borrado('luz', null, 4),
        { servicio: 'a b', id: 'x', fecha: iso(1) }, { servicio: 'luz', id: 'x y', fecha: iso(1) }, { servicio: 'luz', id: 'f2', fecha: '2026-11-10' },
        { servicio: 'luz', id: 7, fecha: iso(1) }, null, 'x', [], { servicio: 'luz', fecha: iso(1) },
    ]);
    assert.deepEqual(lista, [ok, borrado('luz', null, 4)]);
    assert.deepEqual(Sincronizacion.sanearBorrados('nada'), []);
    assert.deepEqual(Sincronizacion.sanearBorrados(undefined), []);
    const tope = SecurityAndUtils.SECURITY_LIMITS.MAX_BORRADOS;
    const muchos = Array.from({ length: tope + 50 }, (_, i) => ({ servicio: 's', id: `f${i}`, fecha: iso(1) }));
    assert.equal(Sincronizacion.sanearBorrados(muchos).length, tope);
});

test('unirBorrados: gana la fecha más nueva, vence a los 90 días y no muta las listas', () => {
    const a = [borrado('luz', 'f1', 2)], b = [borrado('luz', 'f1', 5), borrado('gas', 'g1', 3)];
    const copia = clon([a, b]);
    const unidos = Sincronizacion.unirBorrados(a, b, dia(6));
    assert.deepEqual(unidos.map(x => [claveBorrado(x.servicio, x.id), x.fecha]).sort(), [['gas/g1', iso(3)], ['luz/f1', iso(5)]]);
    assert.deepEqual([a, b], copia);
    assert.deepEqual(Sincronizacion.unirBorrados(a, undefined, dia(6)), a);

    const viejo = { servicio: 'luz', id: 'f9', fecha: new Date(dia(6).getTime() - (DIAS_RETENCION_BORRADOS + 1) * 864e5).toISOString() };
    const reciente = { servicio: 'luz', id: 'f8', fecha: new Date(dia(6).getTime() - (DIAS_RETENCION_BORRADOS - 1) * 864e5).toISOString() };
    assert.deepEqual(Sincronizacion.unirBorrados([viejo, reciente], [], dia(6)), [reciente]);
});

test('sellarCambios: sella lo nuevo y lo cambiado, no lo que sigue igual, y anota lo borrado', () => {
    const servicios = [srv('luz', [fac('f1'), fac('f2')]), srv('gas', [fac('g1')]), srv(SERVICIO_INGRESOS_ID, [fac('i1')])];
    const d = dispositivo(servicios);
    d.servicios.find(s => s.id === 'luz').facturas.push(fac('f3'));                     // nueva
    d.servicios.find(s => s.id === 'luz').facturas[0].pagada = true;                    // cambiada
    d.servicios.find(s => s.id === 'luz').facturas.splice(1, 1);                        // f2 borrada
    d.servicios.splice(d.servicios.findIndex(s => s.id === 'gas'), 1);                  // servicio gas borrado
    d.servicios.find(s => s.id === SERVICIO_INGRESOS_ID).facturas = [];                 // ingreso borrado
    d.guardar(dia(7));

    const luz = d.servicios.find(s => s.id === 'luz');
    assert.equal(luz.facturas.find(f => f.id === 'f1').modificada, iso(7));
    assert.equal(luz.facturas.find(f => f.id === 'f3').modificada, iso(7));
    assert.deepEqual(d.borrados.map(b => claveBorrado(b.servicio, b.id)).sort(), ['gas/', 'gas/g1', 'luz/f2', `${SERVICIO_INGRESOS_ID}/i1`].sort());
    assert.ok(d.borrados.every(b => b.fecha === iso(7)));

    // un guardado sin cambios no toca nada
    d.guardar(dia(8));
    assert.equal(luz.facturas.find(f => f.id === 'f1').modificada, iso(7));
    assert.equal(d.borrados.length, 4);
    assert.ok(d.borrados.every(b => b.fecha === iso(7)));
});

test('sellarCambios: el servicio de ingresos nunca se anota como servicio borrado', () => {
    const d = dispositivo([srv(SERVICIO_INGRESOS_ID, []), srv('luz')]);
    d.servicios = [];
    d.guardar(dia(7));
    assert.deepEqual(d.borrados.map(b => b.servicio), ['luz']);
});

test('sellarCambios: lo que vuelve (deshacer) deja de figurar como borrado y se sella como nuevo', () => {
    const d = dispositivo([srv('luz', [fac('f1')])]);
    const original = clon(d.servicios);
    d.servicios = [srv('luz', [])];
    d.guardar(dia(7));
    assert.equal(d.borrados.length, 1);
    d.servicios = original;                                   // deshacer
    d.guardar(dia(8));
    assert.deepEqual(d.borrados, []);
    assert.equal(d.servicios[0].facturas[0].modificada, iso(8));
});

test('sinBorrados: quita facturas anteriores a su borrado y servicios borrados sin facturas; conserva lo modificado después', () => {
    const servicios = [
        srv('luz', [fac('f1', { modificada: iso(2) }), fac('f2', { modificada: iso(9) }), fac('f3')]),
        srv('gas', [fac('g1', { modificada: iso(2) })]),
        srv('agua', [fac('a1', { modificada: iso(9) })]),
        srv('tv', []),
    ];
    const borrados = [borrado('luz', 'f1', 5), borrado('luz', 'f2', 5), borrado('luz', 'f3', 5), borrado('gas', null, 5), borrado('agua', null, 5), borrado('tv', null, 5)];
    const r = Sincronizacion.sinBorrados(servicios, borrados);
    assert.deepEqual(r.map(s => [s.id, s.facturas.map(f => f.id)]), [['luz', ['f2']], ['agua', ['a1']]]);
    assert.equal(servicios[0].facturas.length, 3, 'no muta');
    assert.equal(Sincronizacion.sinBorrados(servicios, []), servicios);
});

test('Caso del pedido: borro una factura en A, al día siguiente abro B → B la elimina; con otra versión posterior, se conserva', () => {
    const inicial = [srv('luz', [fac('f1', { modificada: iso(1) }), fac('f2', { modificada: iso(1) })])];
    const A = dispositivo(clon(inicial)), B = dispositivo(clon(inicial));

    A.servicios[0].facturas.splice(0, 1);                    // día 10: borro f1 en A
    A.guardar(dia(10));

    const cuenta = B.combinar(A, dia(11));                   // día 11: abro B
    assert.equal(cuenta.facturasEliminadas, 1);
    assert.deepEqual(B.servicios[0].facturas.map(f => f.id), ['f2']);
    assert.deepEqual(B.borrados, A.borrados, 'B queda con el mismo registro');
    B.guardar(dia(11));
    assert.equal(B.servicios[0].facturas[0].modificada, iso(1), 'combinar no se toma como un cambio propio');

    // A y B quedaron iguales: combinar de nuevo no cambia nada
    assert.equal(IE.hayCambios(A.combinar(B, dia(12))), false);

    // B editó f1 DESPUÉS de que A la borrara (otro dispositivo, sin haber sincronizado): la edición gana
    const C = dispositivo(clon(inicial));
    C.servicios[0].facturas[0].pagada = true;
    C.guardar(dia(11));
    const cuentaC = C.combinar(A, dia(12));
    assert.equal(cuentaC.facturasEliminadas, 0);
    assert.ok(C.servicios[0].facturas.some(f => f.id === 'f1'));
});

test('Una copia vieja de B (sin el registro) no revive lo borrado al combinarse en A', () => {
    const inicial = [srv('luz', [fac('f1', { modificada: iso(1) })])];
    const A = dispositivo(clon(inicial)), B = dispositivo(clon(inicial));
    A.servicios[0].facturas = [];
    A.guardar(dia(10));
    const cuenta = A.combinar(B, dia(11));                   // lo que sube B todavía tiene f1
    assert.equal(cuenta.facturasAgregadas, 0);
    assert.deepEqual(A.servicios[0].facturas, []);
});

test('Servicio borrado en A: B lo elimina entero; con una factura posterior en B se conserva solo eso', () => {
    const inicial = [srv('luz', [fac('f1', { modificada: iso(1) })]), srv('gas', [fac('g1', { modificada: iso(1) })])];
    const A = dispositivo(clon(inicial)), B = dispositivo(clon(inicial));
    A.servicios = A.servicios.filter(s => s.id !== 'luz');
    A.guardar(dia(10));
    const cuenta = B.combinar(A, dia(11));
    assert.equal(cuenta.facturasEliminadas, 1);
    assert.equal(cuenta.serviciosEliminados, 1);
    assert.deepEqual(B.servicios.map(s => s.id), ['gas']);

    const C = dispositivo(clon(inicial));
    C.servicios[0].facturas.push(fac('f9'));
    C.guardar(dia(12));
    C.combinar(A, dia(13));
    assert.deepEqual(C.servicios.map(s => [s.id, s.facturas.map(f => f.id)]), [['luz', ['f9']], ['gas', ['g1']]]);
});

test('fusionarServicios: gana la modificación más nueva; sin fechas gana la remota; con fecha solo de un lado, esa', () => {
    const f = (extra) => srv('luz', [fac('f1', extra)]);
    const prueba = (local, remota) => { const l = [local]; const c = IE.fusionarServicios(l, [remota]); return [l[0].facturas[0].pagada, c.facturasActualizadas]; };
    assert.deepEqual(prueba(f({ modificada: iso(5) }), f({ modificada: iso(3), pagada: true })), [false, 0], 'la local es más nueva');
    assert.deepEqual(prueba(f({ modificada: iso(3) }), f({ modificada: iso(5), pagada: true })), [true, 1], 'la remota es más nueva');
    assert.deepEqual(prueba(f({}), f({ pagada: true })), [true, 1], 'sin fechas (datos de antes): gana la remota, como siempre');
    assert.deepEqual(prueba(f({ modificada: iso(2) }), f({ pagada: true })), [false, 0], 'solo la local tiene fecha');
    assert.deepEqual(prueba(f({}), f({ modificada: iso(2), pagada: true })), [true, 1], 'solo la remota tiene fecha');
});

test('compararRespaldo y compararConRemoto cuentan lo que se elimina', () => {
    const locales = [srv('luz', [fac('f1', { modificada: iso(1) }), fac('f2', { modificada: iso(1) })]), srv(SERVICIO_INGRESOS_ID, [fac('i1', { modificada: iso(1) })])];
    const remotos = [srv('luz', [fac('f2', { modificada: iso(1) })])];
    const borrados = [borrado('luz', 'f1', 5), borrado(SERVICIO_INGRESOS_ID, 'i1', 5)];
    const c = IE.compararRespaldo(locales, remotos, [], [], borrados);
    assert.equal(c.combinar, 'Elimina 1 factura, 1 ingreso (borrados en el otro dispositivo)');
    assert.equal(IE.compararRespaldo(locales, remotos, [], []).combinar, 'No modifica nada', 'sin registro de borrados no se elimina nada');

    const analisis = IE.compararConRemoto({ servicios: locales, categorias: [], borrados: [] }, { servicios: remotos, categorias: [], borrados }, dia(6));
    assert.equal(analisis.diff.facturasEliminadas, 1);
    assert.equal(analisis.diff.ingresosEliminados, 1);
    assert.equal(analisis.hayNovedades, true);
    assert.equal(analisis.borrados.length, 2);
    assert.equal(locales[0].facturas.length, 2, 'no muta lo local');

    const igual = IE.compararConRemoto({ servicios: remotos, categorias: [], borrados }, { servicios: remotos, categorias: [], borrados }, dia(6));
    assert.equal(igual.hayNovedades, false);
});

test('normalizarDatos: conserva modificada válida, rechaza una inválida y sanea el registro de borrados sin rechazar el archivo', () => {
    const r = IE.normalizarDatos([srv('luz', [fac('f1', { modificada: iso(3) })])], [], [borrado('luz', 'f0', 2), { basura: true }]);
    assert.equal(r.servicios[0].facturas[0].modificada, iso(3));
    assert.deepEqual(r.borrados, [borrado('luz', 'f0', 2)]);
    assert.deepEqual(IE.normalizarDatos([]).borrados, []);
    assert.throws(() => IE.normalizarDatos([srv('luz', [fac('f1', { modificada: 'ayer' })])]), /fecha de modificación inválida/);
});

test('armarRespaldo / hashCoincide: el registro de borrados entra al hash solo si hay; los respaldos sin él siguen verificando', async () => {
    const servicios = [srv('luz', [fac('f1')])];
    const sin = await IE.armarRespaldo(servicios, []);
    assert.equal(sin.borrados, undefined);
    assert.equal(await IE.hashCoincide(sin), true);

    const con = await IE.armarRespaldo(servicios, [], new Date(0), null, [borrado('luz', 'f0', 2)]);
    assert.deepEqual(con.borrados, [borrado('luz', 'f0', 2)]);
    assert.equal(await IE.hashCoincide(con), true);
    assert.equal(await IE.hashCoincide({ ...con, borrados: [borrado('luz', 'f1', 2)] }), false, 'tocar el registro rompe el hash');
    assert.equal(await IE.hashCoincide({ ...con, borrados: undefined }), false);
});
