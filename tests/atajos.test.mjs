import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarAtajos, alternarAtajo, ATAJOS_POR_DEFECTO, MAX_ATAJOS } from '../src/services/atajos.js';

const VALIDOS = ['nueva-factura', 'nuevo-servicio', 'calculadora', 'calendario', 'deshacer', 'rehacer', 'tema', 'ayuda', 'ajustes', 'perfiles', 'reporte'];

test('atajos: sin lista guardada quedan los de por defecto', () => {
    assert.deepEqual(normalizarAtajos(null, VALIDOS), [...ATAJOS_POR_DEFECTO]);
    assert.deepEqual(normalizarAtajos('basura', VALIDOS), [...ATAJOS_POR_DEFECTO]);
});

test('atajos: una lista vacía guardada se respeta', () => {
    assert.deepEqual(normalizarAtajos([], VALIDOS), []);
});

test('atajos: descarta desconocidos y repetidos y respeta el máximo', () => {
    assert.deepEqual(normalizarAtajos(['tema', 'nada', 'tema', 7, 'ayuda'], VALIDOS), ['tema', 'ayuda']);
    const muchos = Array.from({ length: MAX_ATAJOS + 5 }, (_, i) => `a${i}`);
    assert.equal(normalizarAtajos(muchos, muchos).length, MAX_ATAJOS);
});

test('atajos: alternar agrega al final, quita y no pasa del máximo', () => {
    assert.deepEqual(alternarAtajo(['tema'], 'ayuda'), { lista: ['tema', 'ayuda'], lleno: false });
    assert.deepEqual(alternarAtajo(['tema', 'ayuda'], 'tema'), { lista: ['ayuda'], lleno: false });
    const llena = Array.from({ length: MAX_ATAJOS }, (_, i) => `a${i}`);
    assert.deepEqual(alternarAtajo(llena, 'otro'), { lista: llena, lleno: true });
    assert.equal(alternarAtajo(llena, llena[0]).lista.length, MAX_ATAJOS - 1);
});

test('atajos: los de por defecto existen en el catálogo de la tarjeta', async () => {
    globalThis.window = globalThis;
    const src = await import('node:fs').then(fs => fs.readFileSync('src/ui/atajos.js', 'utf8'));
    for (const id of ATAJOS_POR_DEFECTO) assert.match(src, new RegExp(`id: '${id}'`), `falta el atajo ${id} en el catálogo`);
});
