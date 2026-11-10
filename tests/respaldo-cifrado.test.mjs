import test from 'node:test';
import assert from 'node:assert/strict';
import { RespaldoCifrado } from '../src/services/respaldo-cifrado.js';
import { ImportarExportar } from '../src/services/importar-exportar.js';

const FRASE = 'una frase larga para probar el respaldo cifrado';
const servicios = [{ id: 'luz', nombre: 'Luz', categoria: '', facturas: [{ id: 'f1', monto: 15000, fecha: '2026-11-03', pagada: false, fechaPago: null }] }];

test('sellar → abrir: el respaldo vuelve igual, el texto no muestra montos ni nombres y trae su sal', async () => {
    const respaldo = await ImportarExportar.armarRespaldo(servicios, ['Casa'], new Date('2026-11-01T00:00:00Z'));
    const sellado = await RespaldoCifrado.sellar(respaldo, FRASE);
    assert.ok('texto' in sellado);
    assert.equal(sellado.texto.includes('Luz'), false);
    assert.equal(sellado.texto.includes('15000'), false);
    const abierto = await RespaldoCifrado.abrir(sellado.texto, FRASE);
    assert.ok('datos' in abierto);
    assert.deepEqual(abierto.datos, JSON.parse(JSON.stringify(respaldo)));
    assert.equal(abierto.cifrado, true);
    assert.equal(abierto.sal, sellado.sal);
    // el hash interno sigue coincidiendo después de pasar por el sobre
    assert.equal(await ImportarExportar.hashCoincide(abierto.datos), true);
});

test('abrir lee también un respaldo viejo en claro y avisa que no estaba cifrado', async () => {
    const respaldo = await ImportarExportar.armarRespaldo(servicios, []);
    const abierto = await RespaldoCifrado.abrir(JSON.stringify(respaldo), '');
    assert.ok('datos' in abierto);
    assert.equal(abierto.cifrado, false);
    assert.equal(abierto.sal, null);
    assert.equal(abierto.datos.servicios[0].id, 'luz');
});

test('abrir distingue: falta la frase, frase inválida, frase incorrecta y contenido alterado', async () => {
    const { texto } = /** @type {{ texto: string }} */ (await RespaldoCifrado.sellar({ servicios, categorias: [] }, FRASE));
    assert.equal((await RespaldoCifrado.abrir(texto, '')).codigo, 'sin-frase');
    assert.equal((await RespaldoCifrado.abrir(texto, 'corta')).codigo, 'frase');
    assert.equal((await RespaldoCifrado.abrir(texto, 'otra frase igual de larga que la correcta')).codigo, 'descifrado');
    const sobre = JSON.parse(texto);
    sobre.datos = (sobre.datos[0] === 'A' ? 'B' : 'A') + sobre.datos.slice(1);
    assert.equal((await RespaldoCifrado.abrir(JSON.stringify(sobre), FRASE)).codigo, 'descifrado');
});

test('abrir rechaza sin lanzar lo que no es un respaldo: texto roto, arrays, tamaño excesivo, parámetros del sobre inválidos', async () => {
    for (const malo of ['no es json', '[]', '"texto"', '42', 'null']) {
        const r = await RespaldoCifrado.abrir(malo, FRASE);
        assert.equal(r.codigo, 'formato', malo);
    }
    assert.equal((await RespaldoCifrado.abrir('x'.repeat(5 * 1024 * 1024), FRASE)).codigo, 'formato');
    assert.equal((await RespaldoCifrado.abrir(/** @type {any} */ (null), FRASE)).codigo, 'formato');
    const { texto } = /** @type {{ texto: string }} */ (await RespaldoCifrado.sellar({ servicios: [] }, FRASE));
    const sobre = JSON.parse(texto);
    assert.equal((await RespaldoCifrado.abrir(JSON.stringify({ ...sobre, iter: 10 }), FRASE)).codigo, 'formato');
});

test('abrir no confunde un sobre dentro de otro sobre con un respaldo', async () => {
    const { texto: interior } = /** @type {{ texto: string }} */ (await RespaldoCifrado.sellar({ servicios: [] }, FRASE));
    const { texto: doble } = /** @type {{ texto: string }} */ (await RespaldoCifrado.sellar(JSON.parse(interior), FRASE));
    assert.equal((await RespaldoCifrado.abrir(doble, FRASE)).codigo, 'formato');
});

test('una clave peligrosa de prototipo dentro del respaldo cifrado se descarta al abrir', async () => {
    const { texto } = /** @type {{ texto: string }} */ (await RespaldoCifrado.sellar(JSON.parse('{"servicios":[],"__proto__":{"x":1},"constructor":{"y":2}}'), FRASE));
    const r = /** @type {any} */ (await RespaldoCifrado.abrir(texto, FRASE));
    assert.equal(r.datos.x, undefined);
    assert.equal({}.x, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(r.datos, 'constructor'), false);
});

test('sellar con una frase corta devuelve el error "frase" en vez de lanzar', async () => {
    assert.equal((await RespaldoCifrado.sellar({ servicios: [] }, 'corta')).codigo, 'frase');
});
