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
