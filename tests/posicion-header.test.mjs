import test from 'node:test';
import assert from 'node:assert/strict';
import { posicionesPermitidas, normalizarPosicion, etiquetaPosicion } from '../src/core/posicion-header.js';

test('posicionesPermitidas: en PC las cuatro y en móvil solo arriba y abajo', () => {
    assert.deepEqual(posicionesPermitidas(true), ['top', 'bottom', 'left', 'right']);
    assert.deepEqual(posicionesPermitidas(false), ['top', 'bottom']);
});

test('normalizarPosicion: lo inválido, o un costado en móvil, vuelve a arriba', () => {
    assert.equal(normalizarPosicion('left', true), 'left');
    assert.equal(normalizarPosicion('left', false), 'top');
    assert.equal(normalizarPosicion('bottom', false), 'bottom');
    assert.equal(normalizarPosicion('nada', true), 'top');
    assert.equal(normalizarPosicion(null, true), 'top');
});

test('etiquetaPosicion: nombre en español y, si no existe, el de arriba', () => {
    assert.equal(etiquetaPosicion('right'), 'Derecha');
    assert.equal(etiquetaPosicion('x'), 'Arriba');
});
