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

const { GestorPerfiles, PERFIL_PRINCIPAL, MAX_PERFILES } = await import('../src/services/gestor-perfiles.js');
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

    assert.equal(GestorPerfiles.eliminar(perfiles, PERFIL_PRINCIPAL), false);
    assert.equal(GestorPerfiles.eliminar(perfiles, p.id), true);
    assert.equal(store.has(STORAGE_KEYS.DATOS_PERFIL(p.id)), false);
});

test('GestorPerfiles: máximo de perfiles', () => {
    store.clear();
    const perfiles = GestorPerfiles.cargar();
    for (let i = 1; i < MAX_PERFILES; i++) GestorPerfiles.crear(perfiles, `P${i}`, new Date(i));
    assert.equal(GestorPerfiles.puedeCrear(perfiles), false);
});

const estado = n => ({ servicios: [{ id: String(n) }], categorias: [] });
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

test('PilaHistorial.eliminarDePerfil borra la clave del perfil', () => {
    store.set(STORAGE_KEYS.HISTORIAL('x'), '{}');
    PilaHistorial.eliminarDePerfil('x');
    assert.equal(store.has(STORAGE_KEYS.HISTORIAL('x')), false);
});
