import test from 'node:test';
import assert from 'node:assert/strict';

// core/dom.js solo toca el DOM al llamarse: con un documento mínimo simulado alcanza para probar los helpers.
class Element { constructor(id, hijos = []) { this.id = id; this.hijos = hijos; } closest(sel) { return sel === `#${this.id}` ? this : null; } }
const elementos = [new Element('a'), new Element('b')];
globalThis.Element = Element;
globalThis.document = {
    getElementById: (id) => elementos.find(e => e.id === id) ?? null,
    querySelectorAll: (sel) => (sel === '.todos' ? elementos : []),
};

const { $, $$, delegado, valorDe, formulario, selectPorId } = await import('../src/core/dom.js');

test('$ y compañía: buscan por id y devuelven null si no existe', () => {
    assert.equal($('a'), elementos[0]);
    assert.equal(formulario('b'), elementos[1]);
    assert.equal(selectPorId('b'), elementos[1]);
    assert.equal($('nada'), null);
});

test('$$: lista de elementos como array (con forEach, map y length)', () => {
    assert.deepEqual($$('.todos'), elementos);
    assert.ok(Array.isArray($$('.todos')));
    assert.deepEqual($$('.ninguno'), []);
});

test('delegado: el elemento que contiene el objetivo o null (también si el objetivo no es un elemento)', () => {
    assert.equal(delegado({ target: elementos[0] }, '#a'), elementos[0]);
    assert.equal(delegado({ target: elementos[0] }, '#otro'), null);
    assert.equal(delegado({ target: null }, '#a'), null);
    assert.equal(delegado({ target: {} }, '#a'), null, 'un objetivo que no es Element (texto, document) no lanza');
});

test('valorDe: el valor del campo que originó el evento', () => {
    assert.equal(valorDe({ target: { value: 'hola' } }), 'hola');
});
