import test from 'node:test';
import assert from 'node:assert/strict';
import { ImportarExportar as IE } from '../src/services/importar-exportar.js';
import { SERVICIO_INGRESOS_ID } from '../src/services/estado-facturas.js';

const fac = (id, extra = {}) => ({ id, monto: 100, fecha: '2026-11-10', pagada: false, fechaPago: null, ...extra });
const srv = (id, facturas = [], extra = {}) => ({ id, nombre: id, categoria: '', facturas, ...extra });

test('normalizarDatos: acepta datos válidos y descarta propiedades extra', () => {
    const r = IE.normalizarDatos([{ ...srv('luz', [{ ...fac('f1'), intruso: 1 }]), otro: 'x' }], ['Casa', 'casa', '']);
    assert.deepEqual(r.servicios[0], { id: 'luz', nombre: 'luz', categoria: '', facturas: [fac('f1')] });
    assert.deepEqual(r.categorias, ['Casa'], 'sin duplicados (sin distinguir mayúsculas) ni vacías');
});

test('normalizarDatos: rechaza estructuras inválidas con un mensaje legible', () => {
    assert.throws(() => IE.normalizarDatos('nada'), /falta "servicios"/);
    assert.throws(() => IE.normalizarDatos([srv('a bc')]), /id inválido/);
    assert.throws(() => IE.normalizarDatos([srv('a'), srv('a')]), /id duplicado/);
    assert.throws(() => IE.normalizarDatos([srv('a', [fac('f', { monto: 'x' })])]), /monto inválido/);
    assert.throws(() => IE.normalizarDatos([srv('a', [fac('f', { monto: 1e12 })])]), /monto inválido/);
    assert.throws(() => IE.normalizarDatos([srv('a', [fac('f', { fecha: '10/11/2026' })])]), /fecha inválida/);
    assert.throws(() => IE.normalizarDatos([srv('a', [fac('f', { moneda: 'eur' })])]), /moneda inválida/);
    assert.throws(() => IE.normalizarDatos([srv('a', [fac('f', { tipo: 'raro' })])]), /tipo inválido/);
    assert.throws(() => IE.normalizarDatos([srv('a', [fac('f'), fac('f')])]), /id duplicado/);
});

test('armarRespaldo: incluye versión, fecha y un hash que luego coincide (o no si se edita)', async () => {
    const r = await IE.armarRespaldo([srv('a', [fac('f1')])], ['Casa'], new Date('2026-11-01T00:00:00Z'));
    assert.equal(r.fecha, '2026-11-01T00:00:00.000Z');
    assert.equal(IE.esVersionMasNueva(r), false);
    assert.equal(await IE.hashCoincide(r), true);
    r.servicios[0].facturas[0].monto = 5;
    assert.equal(await IE.hashCoincide(r), false);
    assert.equal(await IE.hashCoincide({ servicios: [], categorias: [] }), true, 'v1 sin hash');
    assert.equal(IE.esVersionMasNueva({ version: 99 }), true);
    assert.equal(IE.esVersionMasNueva({ version: '1.0' }), false);
});

test('fusionarServicios: agrega servicios y facturas nuevas, actualiza las cambiadas y cuenta los ingresos aparte', () => {
    const locales = [srv('luz', [fac('f1'), fac('f2')]), srv(SERVICIO_INGRESOS_ID, [fac('i1')])];
    const remotos = [
        srv('luz', [fac('f1', { pagada: true }), fac('f2'), fac('f3')]),
        srv('gas', [fac('g1'), fac('g2')]),
        srv(SERVICIO_INGRESOS_ID, [fac('i1'), fac('i2')]),
    ];
    const diff = IE.fusionarServicios(locales, remotos);
    assert.deepEqual(diff, { serviciosAgregados: 1, facturasAgregadas: 3, facturasActualizadas: 1, ingresosAgregados: 1 });
    assert.equal(locales.find(s => s.id === 'luz').facturas.length, 3);
    assert.equal(locales.find(s => s.id === 'luz').facturas[0].pagada, true);
    assert.equal(locales.length, 3);
});

test('simularFusion cuenta lo mismo sin tocar los datos locales', () => {
    const locales = [srv('luz', [fac('f1')])];
    const copia = JSON.stringify(locales);
    const diff = IE.simularFusion(locales, [srv('luz', [fac('f1'), fac('f2')])]);
    assert.equal(diff.facturasAgregadas, 1);
    assert.equal(JSON.stringify(locales), copia);
});

test('categorías: nuevas sin distinguir mayúsculas y fusión ordenada', () => {
    assert.deepEqual(IE.categoriasNuevas(['Casa'], ['casa', 'Auto']), ['Auto']);
    assert.deepEqual(IE.fusionarCategorias(['Casa'], ['Auto', 'casa']), { lista: ['Auto', 'Casa'], agregadas: 1 });
    const actuales = ['Casa'];
    assert.equal(IE.fusionarCategorias(actuales, null).lista, actuales);
});

test('describirContenido y compararRespaldo', () => {
    const remotos = [srv('luz', [fac('f1'), fac('f2')]), srv(SERVICIO_INGRESOS_ID, [fac('i1')])];
    assert.equal(IE.describirContenido(remotos, ['Casa']), '1 servicio, 2 facturas, 1 ingreso, 1 categoría');
    assert.equal(IE.describirContenido([], []), '0 servicios');

    const vacio = IE.compararRespaldo([], [], [], []);
    assert.deepEqual(vacio, { combinar: 'No modifica nada', reemplazar: 'No modifica nada' });

    const locales = [srv('luz', [fac('f1')])];
    const c = IE.compararRespaldo(locales, [srv('luz', [fac('f1', { monto: 7 }), fac('f2')]), srv('gas', [fac('g1')])], [], ['Casa']);
    assert.equal(c.combinar, 'Agrega 1 servicio nuevo, 1 factura nueva, 1 factura nueva en servicios existentes, 1 categoría nueva. Se actualiza 1 factura');
    assert.equal(c.reemplazar, 'Carga 2 servicios, 3 facturas, 1 categoría');
});

test('rangoDeMes y recortarPorRango: solo las facturas del rango, sin servicios vacíos ni categorías sin uso', () => {
    assert.deepEqual(IE.rangoDeMes('2026-02'), { desde: '2026-02-01', hasta: '2026-02-28' });
    assert.deepEqual(IE.rangoDeMes('2028-02'), { desde: '2028-02-01', hasta: '2028-02-29' });
    assert.deepEqual(IE.rangoDeMes('2026-12'), { desde: '2026-12-01', hasta: '2026-12-31' });

    const servicios = [
        { ...srv('luz', [fac('a', { fecha: '2026-10-05' }), fac('b', { fecha: '2026-11-05' })]), categoria: 'Casa' },
        { ...srv('gas', [fac('c', { fecha: '2026-09-01' })]), categoria: 'Hogar' },
        srv(SERVICIO_INGRESOS_ID, [fac('i', { fecha: '2026-11-01' })]),
    ];
    const r = IE.recortarPorRango(servicios, ['Casa', 'Hogar'], '2026-11-01', '2026-11-30');
    assert.deepEqual(r.servicios.map(s => [s.id, s.facturas.map(f => f.id)]), [['luz', ['b']], [SERVICIO_INGRESOS_ID, ['i']]]);
    assert.deepEqual(r.categorias, ['Casa']);
    assert.equal(servicios[0].facturas.length, 2, 'no muta lo original');
    assert.equal(IE.recortarPorRango(servicios, ['Casa'], '', '').servicios.length, 3, 'sin límites incluye todo con facturas');
    assert.equal(IE.recortarPorRango(servicios, [], '2026-10-01', '').servicios.length, 2, 'solo desde');
});

test('armarRespaldo: el rango queda afuera del hash', async () => {
    const r = await IE.armarRespaldo([], [], new Date(0), { desde: '2026-11-01', hasta: '' });
    assert.deepEqual(r.rango, { desde: '2026-11-01', hasta: '' });
    assert.equal(await IE.hashCoincide(r), true);
    assert.equal((await IE.armarRespaldo([], [], new Date(0))).rango, undefined);
});

test('contar y perdidasAlReemplazar: lo local que no está en el respaldo', () => {
    const locales = [srv('luz', [fac('a'), fac('b')]), srv('gas', [fac('c')]), srv(SERVICIO_INGRESOS_ID, [fac('i1'), fac('i2')])];
    const remotos = [srv('luz', [fac('a')]), srv(SERVICIO_INGRESOS_ID, [fac('i1')])];
    assert.deepEqual(IE.contar(locales), { servicios: 2, facturas: 3, ingresos: 2 });
    assert.deepEqual(IE.perdidasAlReemplazar(locales, remotos), { servicios: 1, facturas: 2, ingresos: 1 });
    assert.deepEqual(IE.perdidasAlReemplazar(remotos, locales), { servicios: 0, facturas: 0, ingresos: 0 });
});

test('config exportable en respaldos: valida, exporta y detecta cambios de preferencias', async () => {
    const exportable = IE.obtenerConfigExportable();
    assert.equal('gestion_servicios_theme' in exportable, false, 'el tema es de cada dispositivo: no viaja en el respaldo');
    assert.equal(JSON.stringify(exportable).includes('frase'), false, 'la frase de cifrado y el token nunca viajan en el respaldo');
    assert.equal('gist_token' in exportable || 'frase_cifrado' in exportable, false);
    assert.equal(typeof exportable['estilo-calendario'], 'string');
    assert.equal(typeof exportable['estilo-tarjeta'], 'string');
    assert.equal(typeof exportable['posicion-header'], 'string');
    assert.equal(typeof exportable['posicion-header-movil'], 'string');
    assert.equal(typeof exportable['fondo-card'], 'string');
    assert.equal(typeof exportable['hover-popup-calendario'], 'boolean');
    assert.equal(typeof exportable['rueda-calendario'], 'boolean');
    assert.equal(typeof exportable['calendario-abierto'], 'boolean');
    assert.equal(typeof exportable['gestion_servicios_orden'], 'string');
    assert.equal(typeof exportable['cat-agrupacion'], 'string');
    assert.equal(typeof exportable['vista-estados'], 'string');
    assert.equal(typeof exportable['servicios-collapse-state'], 'string');
    assert.equal(typeof exportable['estadisticas-tipo'], 'string');
    assert.equal(typeof exportable['estadisticas-collapsed'], 'string');
    assert.equal(typeof exportable['resumen-mostrar-pagado'], 'string');
    assert.equal(Array.isArray(exportable['orden-tarjetas']), true);
    assert.equal(Array.isArray(exportable['columnas-tarjetas']), true);
    assert.equal(Array.isArray(exportable['orden-tarjetas-3']), true);
    assert.equal(Array.isArray(exportable['columnas-tarjetas-3']), true);

    assert.equal(IE.validarCamposConfigImport({
        'estilo-calendario': 'cuadrado-aro',
        'estilo-tarjeta': 'clasica',
        'posicion-header': 'left',
        'posicion-header-movil': 'bottom',
        'fondo-card': 'obelisco',
        'hover-popup-calendario': false,
        'rueda-calendario': true,
        'calendario-abierto': true,
        'orden-tarjetas': ['servicios', 'resumen'],
        'columnas-tarjetas': [2, 3],
        'orden-tarjetas-3': ['calendario', 'resumen'],
        'columnas-tarjetas-3': [1, 1, 2],
        'gestion_servicios_orden': 'vencimiento',
        'cat-agrupacion': 'on',
        'vista-estados': 'true',
        'servicios-collapse-state': 'expanded',
        'estadisticas-tipo': 'anual',
        'estadisticas-collapsed': 'false',
        'resumen-mostrar-pagado': 'true',
    }), true);

    assert.equal(IE.validarCamposConfigImport({ 'gestion_servicios_theme': 'inexistente' }), true, 'un respaldo viejo con tema se acepta y el tema se ignora');
    assert.equal(IE.calcularCambiosConfigImport({ 'gestion_servicios_theme': 'crema' }).includes('tema'), false);
    assert.equal(IE.validarCamposConfigImport({ 'estilo-calendario': 'inexistente' }), false);
    assert.equal(IE.validarCamposConfigImport({ 'columnas-tarjetas': [0, 0] }), false);
    assert.equal(IE.validarCamposConfigImport({ 'posicion-header-movil': 'left' }), false, 'un costado no vale en móvil');
    assert.equal(IE.validarCamposConfigImport({ 'posicion-header': 'arriba' }), false);
    assert.equal(IE.validarCamposConfigImport({ 'gestion_servicios_orden': 'inexistente' }), false);
    assert.equal(IE.validarCamposConfigImport({ 'servicios-collapse-state': 'inexistente' }), false);

    const cambios = IE.calcularCambiosConfigImport({
        'estilo-calendario': 'punto',
        'hover-popup-calendario': true,
        'gestion_servicios_orden': 'monto-desc',
    });
    assert.equal(cambios.includes('estilo del calendario'), true);
    assert.equal(cambios.includes('popup del calendario (PC)'), true);
    assert.equal(cambios.includes('orden de servicios'), true);
});

