import test from 'node:test';
import assert from 'node:assert/strict';

const crearAlmacen = ({ falla = false } = {}) => {
    const datos = new Map();
    return {
        datos,
        getItem: (k) => (falla ? (() => { throw new Error('sin acceso'); })() : (datos.has(k) ? datos.get(k) : null)),
        setItem: (k, v) => { if (falla) throw new Error('cuota'); datos.set(k, String(v)); },
        removeItem: (k) => { datos.delete(k); },
    };
};
const { Secretos } = await import('../src/core/secretos.js');
const poner = (opciones) => { globalThis.sessionStorage = crearAlmacen(opciones); globalThis.localStorage = crearAlmacen(opciones); };

test('sin recordar, el valor queda solo en la sesión y no toca el almacenamiento permanente', () => {
    poner();
    assert.equal(Secretos.guardar('frase', 'abc'), true);
    assert.equal(Secretos.leer('frase'), 'abc');
    assert.equal(globalThis.sessionStorage.datos.get('frase'), 'abc');
    assert.equal(globalThis.localStorage.datos.has('frase'), false);
    assert.equal(Secretos.esRecordado('frase'), false);
});

test('con recordar queda en este navegador y se saca de la sesión; al volver a no recordar, el recordado se borra', () => {
    poner();
    Secretos.guardar('frase', 'abc');
    Secretos.guardar('frase', 'abc', true);
    assert.equal(globalThis.localStorage.datos.get('frase'), 'abc');
    assert.equal(globalThis.sessionStorage.datos.has('frase'), false);
    assert.equal(Secretos.esRecordado('frase'), true);
    assert.equal(Secretos.leer('frase'), 'abc');
    Secretos.guardar('frase', 'abc', false);
    assert.equal(globalThis.localStorage.datos.has('frase'), false, 'ya no queda de forma permanente');
    assert.equal(Secretos.esRecordado('frase'), false);
    assert.equal(Secretos.leer('frase'), 'abc');
});

test('un valor vacío, o olvidar, lo borra de los dos lugares', () => {
    poner();
    Secretos.guardar('frase', 'abc', true);
    Secretos.guardar('otra', 'xyz');
    assert.equal(Secretos.guardar('frase', ''), true);
    Secretos.olvidar('otra');
    assert.equal(Secretos.leer('frase'), '');
    assert.equal(Secretos.leer('otra'), '');
});

test('la sesión manda sobre lo recordado cuando hay los dos', () => {
    poner();
    globalThis.localStorage.datos.set('frase', 'vieja');
    globalThis.sessionStorage.datos.set('frase', 'nueva');
    assert.equal(Secretos.leer('frase'), 'nueva');
});

test('si el almacenamiento falla o no existe, nada lanza: leer da vacío y guardar da false', () => {
    poner({ falla: true });
    assert.equal(Secretos.leer('frase'), '');
    assert.equal(Secretos.guardar('frase', 'abc'), false);
    assert.equal(Secretos.guardar('frase', 'abc', true), false);
    assert.equal(Secretos.esRecordado('frase'), false);
    Secretos.olvidar('frase');
    delete globalThis.sessionStorage;
    delete globalThis.localStorage;
    assert.equal(Secretos.leer('frase'), '');
    assert.equal(Secretos.guardar('frase', 'abc'), false);
});
