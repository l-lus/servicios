import test from 'node:test';
import assert from 'node:assert/strict';

// Sin `document`: solo localStorage simulado.
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
};
globalThis.window = globalThis;

const { GestorPerfiles, PERFIL_PRINCIPAL, MAX_PERFILES, esIdDeGist } = await import('../src/services/gestor-perfiles.js');
const { PilaHistorial, MAX_HISTORIAL } = await import('../src/services/pila-historial.js');
const { STORAGE_KEYS } = await import('../src/core/constantes.js');

test('GestorPerfiles: perfil principal por defecto, alta, validación, renombre y baja', () => {
    store.clear();
    const perfiles = GestorPerfiles.cargar();
    assert.deepEqual(Object.keys(perfiles), [PERFIL_PRINCIPAL]);

    assert.equal(GestorPerfiles.validarNombre(perfiles, '  '), 'vacio');
    assert.equal(GestorPerfiles.validarNombre(perfiles, 'principal'), 'duplicado');
    assert.equal(GestorPerfiles.validarNombre(perfiles, 'Principal', PERFIL_PRINCIPAL), null, 'renombrar a su propio nombre');

    const p = GestorPerfiles.crear(perfiles, ' Casa ', new Date(1000));
    assert.equal(p.id, 'perfil_1000');
    assert.equal(p.nombre, 'Casa');
    assert.deepEqual(GestorPerfiles.cargar(), perfiles, 'quedó persistido');
    assert.equal(GestorPerfiles.cantidadServicios(p.id), 0);

    GestorPerfiles.renombrar(perfiles, p.id, 'Casa 2');
    assert.equal(GestorPerfiles.cargar()[p.id].nombre, 'Casa 2');

    store.set(STORAGE_KEYS.DATOS_RESCATE(p.id), '[]');
    store.set(STORAGE_KEYS.DATOS_PERFIL(p.id), '{"no":"es una lista"}');
    assert.equal(GestorPerfiles.cantidadServicios(p.id), 0, 'datos guardados que no son una lista cuentan como cero');
    assert.equal(GestorPerfiles.eliminar(perfiles, PERFIL_PRINCIPAL), false);
    assert.equal(GestorPerfiles.eliminar(perfiles, p.id), true);
    assert.equal(store.has(STORAGE_KEYS.DATOS_PERFIL(p.id)), false);
    assert.equal(store.has(STORAGE_KEYS.DATOS_RESCATE(p.id)), false, 'la copia de rescate se va con el perfil');
});

test('GestorPerfiles: los perfiles guardados se validan al cargar (campos conocidos, ids con formato, el principal siempre) y no heredan de Object.prototype', () => {
    const ahora = new Date('2026-11-10T12:00:00Z');
    const gist = 'a'.repeat(32);
    store.clear();
    store.set(STORAGE_KEYS.PERFILES, JSON.stringify({
        perfil_1: { id: 'otro', nombre: '  Casa\u0000 ', creado: '2026-01-01T00:00:00.000Z', gistId: gist, gistAuto: true, gistCifrado: true, gistLastSync: '2026-11-01T10:00:00.000Z', intruso: '<b>' },
        perfil_2: { nombre: 'Negocio', creado: 'ayer', gistId: 'javascript:alert(1)', gistAuto: 'si', gistCifrado: 1, gistLastSync: {} },
        'id con espacios': { nombre: 'X' },
        perfil_3: { nombre: '' },
        perfil_4: 'no es un objeto',
        perfil_5: null,
    }));
    const perfiles = GestorPerfiles.cargar(ahora);
    assert.equal(Object.getPrototypeOf(perfiles), null);
    assert.deepEqual(Object.keys(perfiles), [PERFIL_PRINCIPAL, 'perfil_1', 'perfil_2']);
    assert.deepEqual(perfiles[PERFIL_PRINCIPAL], { id: PERFIL_PRINCIPAL, nombre: 'Principal', creado: ahora.toISOString() }, 'el principal se repone si falta');
    assert.deepEqual(perfiles.perfil_1, { id: 'perfil_1', nombre: 'Casa', creado: '2026-01-01T00:00:00.000Z', gistId: gist, gistAuto: true, gistCifrado: true, gistLastSync: '2026-11-01T10:00:00.000Z' });
    assert.deepEqual(perfiles.perfil_2, { id: 'perfil_2', nombre: 'Negocio', creado: ahora.toISOString() }, 'los campos inválidos no se cargan');

    for (const malo of ['"texto"', '[1,2]', '42', '{no es json', 'null']) {
        store.set(STORAGE_KEYS.PERFILES, malo);
        assert.deepEqual(Object.keys(GestorPerfiles.cargar(ahora)), [PERFIL_PRINCIPAL], malo);
    }

    const muchos = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`perfil_${i}`, { nombre: `P${i}` }]));
    store.set(STORAGE_KEYS.PERFILES, JSON.stringify({ ...muchos, default: { nombre: 'Mío' } }));
    const topados = GestorPerfiles.cargar(ahora);
    assert.equal(Object.keys(topados).length, MAX_PERFILES);
    assert.equal(topados[PERFIL_PRINCIPAL].nombre, 'Mío', 'el principal guardado se conserva aunque venga último');
});

test('GestorPerfiles.activoValido: el perfil activo guardado solo vale si es uno de los perfiles (nunca una clave heredada como __proto__)', () => {
    const perfiles = GestorPerfiles.sanear({ perfil_1: { nombre: 'Casa' } });
    assert.equal(GestorPerfiles.activoValido(perfiles, 'perfil_1'), 'perfil_1');
    for (const malo of ['__proto__', 'constructor', 'toString', 'perfil_9', '', null, undefined, 5]) {
        assert.equal(GestorPerfiles.activoValido(perfiles, malo), PERFIL_PRINCIPAL, String(malo));
    }
    assert.equal(GestorPerfiles.activoValido({}, 'constructor'), PERFIL_PRINCIPAL, 'tampoco con un objeto común');
    assert.equal(perfiles.__proto__, undefined);
});

test('esIdDeGist: solo el formato hexadecimal de un id de Gist', () => {
    assert.equal(esIdDeGist('0123456789abcdefABCDEF0123456789'), true);
    for (const malo of ['', 'abc', 'g'.repeat(32), 'a'.repeat(41), '../../x', null, undefined, 123]) assert.equal(esIdDeGist(malo), false, String(malo));
});

test('GestorPerfiles: máximo de perfiles', () => {
    store.clear();
    const perfiles = GestorPerfiles.cargar();
    for (let i = 1; i < MAX_PERFILES; i++) GestorPerfiles.crear(perfiles, `P${i}`, new Date(i));
    assert.equal(GestorPerfiles.puedeCrear(perfiles), false);
});

const estado = n => ({ servicios: [{ id: String(n), nombre: `S${n}`, categoria: '', facturas: [] }], categorias: [] });
const nueva = (t = { v: 1000 }) => new PilaHistorial({ clave: () => 'hist_test', ahora: () => t.v });

test('PilaHistorial: deshacer, rehacer y descarte de lo rehacible al guardar', () => {
    store.clear();
    const h = nueva();
    h.iniciar(estado(0));
    h.guardar(estado(1), 'uno');
    h.guardar(estado(2), 'dos');
    assert.deepEqual([h.puedeDeshacer(), h.puedeRehacer()], [true, false]);

    const d = h.deshacer();
    assert.equal(d.estado.servicios[0].id, '1');
    assert.equal(d.descripcion, 'dos', 'la descripción es la de la acción deshecha');
    assert.equal(h.rehacer().estado.servicios[0].id, '2');

    h.deshacer(); h.deshacer();
    assert.equal(h.deshacer(), null, 'ya no hay más para deshacer');
    h.guardar(estado(9), 'nueva');
    assert.equal(h.puedeRehacer(), false);
});

test('PilaHistorial: tope de estados y restauración persistida (con TTL)', () => {
    store.clear();
    const t = { v: 1000 };
    const h = nueva(t);
    h.iniciar(estado(0));
    for (let i = 1; i <= MAX_HISTORIAL + 5; i++) h.guardar(estado(i));
    assert.equal(h.tamano, MAX_HISTORIAL);

    const otra = nueva(t);
    otra.iniciar(estado(MAX_HISTORIAL + 5));
    assert.equal(otra.tamano, MAX_HISTORIAL, 'recuperó la pila guardada');
    assert.equal(otra.puedeDeshacer(), true);

    const cambiado = nueva(t);
    cambiado.iniciar(estado(777));
    assert.equal(cambiado.tamano, MAX_HISTORIAL, 'el estado distinto se agrega arriba (y se descarta el más viejo)');

    t.v += 25 * 60 * 60 * 1000;
    const vencida = nueva(t);
    vencida.iniciar(estado(1));
    assert.equal(vencida.tamano, 1, 'pasadas 24 h la pila guardada se descarta');
});

test('PilaHistorial: el historial guardado se valida al cargar; con una entrada inválida (o de más) se descarta entero y lo válido se normaliza', () => {
    const guardar = (history, currentIndex = history.length - 1) =>
        store.set('hist_test', JSON.stringify({ history, currentIndex, timestamp: 1000 }));
    const entrada = (n, extra = {}) => ({ estado: estado(n), descripcion: `paso ${n}`, ...extra });
    const cargar = () => { const h = nueva(); h.iniciar(estado(2)); return h; };

    guardar([entrada(1), entrada(2)]);
    assert.equal(cargar().tamano, 2, 'un historial válido se recupera');

    const conExtra = entrada(1);
    conExtra.estado.servicios[0].intruso = '<img src=x>';
    conExtra.descripcion = { no: 'es texto' };
    guardar([conExtra, entrada(2)]);
    const h = cargar();
    const paso = h.deshacer();
    assert.deepEqual(paso.estado, estado(1), 'las propiedades desconocidas no se cargan');
    assert.equal(paso.descripcion, 'paso 2');

    for (const mala of [
        { estado: { servicios: [{ id: 'sin nombre', facturas: [] }], categorias: [] } },
        { estado: { servicios: 'x', categorias: [] } },
        { estado: null },
        null,
    ]) {
        guardar([entrada(1), mala, entrada(2)]);
        assert.equal(cargar().tamano, 1, 'con una entrada inválida queda solo el estado actual');
    }
    guardar(Array.from({ length: MAX_HISTORIAL + 1 }, (_, i) => entrada(i)).concat(entrada(2)));
    assert.equal(cargar().tamano, 1, 'más entradas de las que guarda la app: no lo escribió la app');
    guardar([entrada(1), entrada(2)], 7);
    assert.equal(cargar().tamano, 1, 'índice fuera de rango');
});

test('PilaHistorial.eliminarDePerfil borra la clave del perfil', () => {
    store.set(STORAGE_KEYS.HISTORIAL('x'), '{}');
    PilaHistorial.eliminarDePerfil('x');
    assert.equal(store.has(STORAGE_KEYS.HISTORIAL('x')), false);
});
