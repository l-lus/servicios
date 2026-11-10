import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityAndUtils } from '../src/core/seguridad.js';

test('limpiarTexto: quita caracteres de control y espacios de los extremos, recorta al máximo y no toca los símbolos', () => {
    const { limpiarTexto } = SecurityAndUtils;
    assert.equal(limpiarTexto("  O'Higgins \"1\" <b> & data: onda=1 `x`  "), "O'Higgins \"1\" <b> & data: onda=1 `x`");
    assert.equal(limpiarTexto('a\u0000b\tc\nd\u007f'), 'abcd');
    assert.equal(limpiarTexto('abcdef', 3), 'abc');
    assert.equal(limpiarTexto('x'.repeat(500)).length, SecurityAndUtils.SECURITY_LIMITS.MAX_STRING_LENGTH);
    for (const v of [null, undefined, 5, {}, ['a']]) assert.equal(limpiarTexto(v), '', 'lo que no es texto queda vacío');
});

test('diccionarioDeBanderas: copia sin prototipo que solo conserva las claves en true (las claves son datos: «constructor» no existe hasta marcarla)', () => {
    const { diccionarioDeBanderas } = SecurityAndUtils;
    const d = diccionarioDeBanderas({ Casa: true, constructor: true, Auto: false, Raro: 'true', Obj: {}, ['x'.repeat(200)]: true });
    assert.equal(Object.getPrototypeOf(d), null);
    assert.deepEqual(Object.keys(d), ['Casa', 'constructor']);
    assert.equal(JSON.stringify(d), '{"Casa":true,"constructor":true}', 'se guarda como un objeto común');

    const vacio = diccionarioDeBanderas({});
    for (const clave of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.equal(vacio[clave], undefined, clave);
    for (const malo of [null, undefined, 'texto', 7, ['a'], true]) assert.deepEqual(Object.keys(diccionarioDeBanderas(malo)), [], String(malo));

    const copia = diccionarioDeBanderas(d);
    delete copia.Casa;
    assert.equal(d.Casa, true, 'es una copia');
    assert.equal(Object.keys(diccionarioDeBanderas(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, true])), 10)).length, 10, 'tope de claves');
});
