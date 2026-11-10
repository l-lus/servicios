import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
    cifrar, descifrar, esSobre, sobreValido, olvidarClave, ErrorCifrado,
    normalizarFrase, evaluarFrase, generarFrase, FORMATO_SOBRE, ITERACIONES, FRASE_MIN,
} from '../src/core/cifrado.js';

const FRASE = 'una frase larga para las pruebas del cifrado';
const TEXTO = JSON.stringify({ servicios: [{ id: 'luz', nombre: 'Luz', facturas: [{ id: 'f1', monto: 15000.5 }] }], nota: 'ñandú · €' });
const cripto = /** @type {Crypto} */ (webcrypto);

/** Cambia un carácter del base64 sin salir del alfabeto. */
const tocar = (b64) => (b64[0] === 'A' ? 'B' : 'A') + b64.slice(1);

test('cifrar → descifrar devuelve el mismo texto (con tildes y símbolos) y el sobre no deja ver el contenido', async () => {
    const sobre = await cifrar(TEXTO, FRASE);
    assert.equal(sobre.formato, FORMATO_SOBRE);
    assert.equal(sobre.iter, ITERACIONES);
    assert.equal(esSobre(sobre), true);
    assert.equal(JSON.stringify(sobre).includes('Luz'), false);
    assert.equal(JSON.stringify(sobre).includes('15000'), false);
    assert.equal(await descifrar(sobre, FRASE), TEXTO);
    // sobrevive a pasar por JSON (lo que pasa al guardarlo o subirlo)
    assert.equal(await descifrar(JSON.parse(JSON.stringify(sobre)), FRASE), TEXTO);
});

test('cada cifrado usa un IV nuevo; la sal se reutiliza si se pasa y es nueva si no', async () => {
    const a = await cifrar(TEXTO, FRASE);
    const b = await cifrar(TEXTO, FRASE, { sal: a.sal });
    const c = await cifrar(TEXTO, FRASE);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.datos, b.datos);
    assert.equal(a.sal, b.sal);
    assert.notEqual(a.sal, c.sal);
    assert.equal(await descifrar(b, FRASE), TEXTO);
    assert.equal(await descifrar(c, FRASE), TEXTO);
});

test('frase equivocada o contenido alterado dan el mismo error "descifrado"', async () => {
    olvidarClave();
    const sobre = await cifrar(TEXTO, FRASE);
    const fallo = async (s, f) => assert.rejects(() => descifrar(s, f), (e) => e instanceof ErrorCifrado && e.codigo === 'descifrado');
    await fallo(sobre, 'otra frase que tampoco es la correcta');
    await fallo({ ...sobre, datos: tocar(sobre.datos) }, FRASE);
    await fallo({ ...sobre, iv: tocar(sobre.iv) }, FRASE);
    await fallo({ ...sobre, sal: tocar(sobre.sal) }, FRASE);
    olvidarClave();
    assert.equal(await descifrar(sobre, FRASE), TEXTO, 'tras los fallos el sobre bueno sigue abriendo');
});

test('la frase se normaliza: NFC y sin espacios en los extremos', async () => {
    assert.equal(normalizarFrase('  café  '), 'café');
    const sobre = await cifrar(TEXTO, `  ${FRASE}  `);
    assert.equal(await descifrar(sobre, FRASE), TEXTO);
    const conAcento = 'canción número uno para probar la normalización';
    const s2 = await cifrar(TEXTO, conAcento.normalize('NFD'));
    assert.equal(await descifrar(s2, conAcento.normalize('NFC')), TEXTO);
});

test('evaluarFrase: exige el largo y avisa cuando la frase es débil', () => {
    const corta = evaluarFrase('corta');
    assert.equal(corta.ok, false);
    assert.match(corta.motivo, new RegExp(String(FRASE_MIN)));
    assert.equal(evaluarFrase(null).ok, false);
    assert.deepEqual([evaluarFrase(FRASE).ok, evaluarFrase(FRASE).debil], [true, false]);
    assert.equal(evaluarFrase('1234567890123456789012345').debil, true, 'solo números');
    assert.equal(evaluarFrase('abababababababababababab').debil, true, 'se repite');
    assert.equal(evaluarFrase('aaaaaaaaaaaaaaaaaaaaaaaaa').debil, true, 'pocos caracteres distintos');
});

test('cifrar y descifrar con una frase corta fallan con el código "frase" antes de tocar nada', async () => {
    await assert.rejects(() => cifrar(TEXTO, 'corta'), (e) => e.codigo === 'frase');
    const sobre = await cifrar(TEXTO, FRASE);
    await assert.rejects(() => descifrar(sobre, 'corta'), (e) => e.codigo === 'frase');
});

test('sobreValido rechaza lo que viene de afuera mal formado, de otra app o con parámetros fuera de rango', async () => {
    const bueno = await cifrar(TEXTO, FRASE);
    assert.equal(sobreValido(bueno), bueno);
    const malo = (cambio) => assert.throws(() => sobreValido({ ...bueno, ...cambio }), (e) => e instanceof ErrorCifrado && e.codigo === 'formato');
    for (const basura of [null, undefined, 'texto', 42, [], {}]) assert.throws(() => sobreValido(basura), ErrorCifrado);
    malo({ formato: 'sgc2-cifrado' });
    malo({ version: 2 });
    malo({ kdf: 'otro' });
    malo({ iter: 1000 });                 // costo demasiado bajo
    malo({ iter: 50000000 });             // costo que colgaría el navegador
    malo({ iter: 600000.5 });
    malo({ sal: 'AAAA' });                // largo incorrecto
    malo({ sal: '***' });                 // fuera del alfabeto base64
    malo({ iv: 'AAAA' });
    malo({ datos: 'corto' });
    malo({ datos: 12345 });
    assert.equal(esSobre({ servicios: [], categorias: [] }), false, 'un JSON plano no es un sobre');
    assert.equal(esSobre(null), false);
});

test('cifrar no acepta una sal ajena de largo incorrecto', async () => {
    await assert.rejects(() => cifrar(TEXTO, FRASE, { sal: 'AAAA' }), (e) => e.codigo === 'formato');
    await assert.rejects(() => cifrar(TEXTO, FRASE, { sal: '<script>' }), (e) => e.codigo === 'formato');
});

test('un sobre no se descifra con parámetros del KDF alterados (el costo va en el sobre y se valida antes de derivar)', async () => {
    const sobre = await cifrar(TEXTO, FRASE);
    await assert.rejects(() => descifrar({ ...sobre, iter: ITERACIONES - 1 }, FRASE), (e) => e.codigo === 'formato');
    await assert.rejects(() => descifrar({ ...sobre, iter: 99999999 }, FRASE), (e) => e.codigo === 'formato');
});

test('generarFrase: 5 palabras de 3 sílabas, sin sesgo y determinista con bytes dados; la frase generada alcanza el mínimo y no es débil', () => {
    const bytes = (n) => Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    const frase = generarFrase(bytes);
    assert.match(frase, /^([bcdfgjklmnprstvz][aeiou]){3}(-([bcdfgjklmnprstvz][aeiou]){3}){4}$/);
    assert.equal(frase, generarFrase(bytes));
    const e = evaluarFrase(frase);
    assert.deepEqual([e.ok, e.debil], [true, false]);
    // los bytes >= tope (240) se descartan: con solo bytes altos al principio sigue saliendo una frase válida
    const conAltos = (() => { let primera = true; return (n) => { if (primera) { primera = false; return Array(n).fill(255); } return bytes(n); }; })();
    assert.match(generarFrase(conAltos), /^([bcdfgjklmnprstvz][aeiou]){3}(-([bcdfgjklmnprstvz][aeiou]){3}){4}$/);
    // con bytes de verdad al azar salen frases distintas
    const real = (n) => cripto.getRandomValues(new Uint8Array(n));
    assert.notEqual(generarFrase(real), generarFrase(real));
});

test('con la misma frase, la sal propia de cada destino hace que uno no abra el contenido del otro', async () => {
    olvidarClave();
    const a = await cifrar(TEXTO, FRASE);
    const b = await cifrar(TEXTO, FRASE, { sal: a.sal });
    const otroDestino = await cifrar(TEXTO, FRASE);
    // con la sal de otro destino el contenido no abre
    await assert.rejects(() => descifrar({ ...a, sal: otroDestino.sal }, FRASE), (e) => e.codigo === 'descifrado');
    assert.equal(await descifrar(b, FRASE), TEXTO);
});
