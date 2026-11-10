import test from 'node:test';
import assert from 'node:assert/strict';
import { ClienteGist, nombreArchivoGist, esGistNoConfiable, evaluarSubidaAutomatica } from '../src/services/cliente-gist.js';
import { RespaldoCifrado } from '../src/services/respaldo-cifrado.js';
import { ImportarExportar } from '../src/services/importar-exportar.js';

const FRASE = 'una frase larga para probar el cliente del gist';
const ARCHIVO = nombreArchivoGist('default');
const servicios = [{ id: 'luz', nombre: 'Luz', categoria: '', facturas: [{ id: 'f1', monto: 15000, fecha: '2026-11-03', pagada: false, fechaPago: null }] }];

const respuesta = (cuerpo, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => cuerpo, text: async () => String(cuerpo) });
/** fetch falso: registra las llamadas y responde con lo que se le pasa (función o valor). */
function falso(responder) {
    const llamadas = [];
    const fn = async (url, opciones) => { llamadas.push({ url, opciones }); return typeof responder === 'function' ? responder(url, opciones) : responder; };
    fn.llamadas = llamadas;
    return fn;
}
async function sobre(srvs = servicios, frase = FRASE) {
    const respaldo = await ImportarExportar.armarRespaldo(srvs, ['Casa']);
    return (await RespaldoCifrado.sellar(respaldo, frase)).texto;
}
const gistCon = (content, extra = {}) => respuesta({ files: { [ARCHIVO]: { content, size: content.length, ...extra } } });

test('nombreArchivoGist: un archivo por perfil', () => {
    assert.equal(nombreArchivoGist('casa'), 'deltaF_casa.json');
});

test('leer: abre un Gist cifrado con la frase, valida los datos y devuelve la sal', async () => {
    const f = falso(gistCon(await sobre()));
    const lectura = await new ClienteGist(f).leer('abc123', 'tok', { archivo: ARCHIVO, frase: FRASE });
    assert.ok(!('error' in lectura));
    assert.equal(lectura.cifrado, true);
    assert.ok(lectura.sal);
    assert.equal(lectura.servicios[0].nombre, 'Luz');
    assert.deepEqual(lectura.categorias, ['Casa']);
    assert.equal(f.llamadas[0].url, 'https://api.github.com/gists/abc123');
    assert.equal(f.llamadas[0].opciones.headers.Authorization, 'Bearer tok');
});

test('leer: frase equivocada → descifrado; sin frase → sin-frase; ambos son «no confiables»', async () => {
    const contenido = await sobre();
    const cliente = new ClienteGist(falso(gistCon(contenido)));
    const mala = await cliente.leer('abc', '', { archivo: ARCHIVO, frase: 'otra frase distinta y larga' });
    assert.equal(mala.codigo, 'descifrado');
    assert.equal(esGistNoConfiable(mala), true);
    const sinFrase = await cliente.leer('abc', '', { archivo: ARCHIVO, frase: '' });
    assert.equal(esGistNoConfiable(sinFrase), true);
});

test('leer: un Gist que ya se vio cifrado y llega en claro se rechaza (sin-cifrar); sin esa marca se lee igual', async () => {
    const claro = JSON.stringify(await ImportarExportar.armarRespaldo(servicios, []));
    const cliente = new ClienteGist(falso(gistCon(claro)));
    const degradado = await cliente.leer('abc', '', { archivo: ARCHIVO, frase: FRASE, exigirCifrado: true });
    assert.equal(degradado.codigo, 'sin-cifrar');
    const viejo = await cliente.leer('abc', '', { archivo: ARCHIVO, frase: FRASE });
    assert.ok(!('error' in viejo));
    assert.equal(viejo.cifrado, false);
});

test('leer: HTTP de error, archivo ausente y red caída vuelven como error «red» sin lanzar', async () => {
    const http = await new ClienteGist(falso(respuesta({}, { ok: false, status: 404 }))).leer('a', '', { archivo: ARCHIVO, frase: FRASE });
    assert.deepEqual(http, { error: 'HTTP 404', codigo: 'red' });
    const sinArchivo = await new ClienteGist(falso(respuesta({ files: {} }))).leer('a', '', { archivo: ARCHIVO, frase: FRASE });
    assert.equal(sinArchivo.codigo, 'red');
    const caida = await new ClienteGist(async () => { throw new TypeError('Failed to fetch'); }).leer('a', '', { archivo: ARCHIVO, frase: FRASE });
    assert.deepEqual(caida, { error: 'Failed to fetch', codigo: 'red' });
    assert.equal(esGistNoConfiable(caida), false);
});

test('descargar: respeta el tope de tamaño, también el del contenido ya bajado', async () => {
    const grande = await new ClienteGist(falso(gistCon('x', { size: 1e9 }))).descargar('a', '', ARCHIVO);
    assert.match(grande.error, /demasiado grande/);
    const noTexto = await new ClienteGist(falso(respuesta({ files: { [ARCHIVO]: { content: 5, size: 1 } } }))).descargar('a', '', ARCHIVO);
    assert.equal(noTexto.codigo, 'red');
});

test('descargar: contenido truncado → solo se sigue raw_url si es https de gist.githubusercontent.com', async () => {
    const truncado = (raw_url) => respuesta({ files: { [ARCHIVO]: { content: 'x', size: 1, truncated: true, raw_url } } });
    const ajeno = falso(truncado('https://evil.example/raw'));
    assert.match((await new ClienteGist(ajeno).descargar('a', 'tok', ARCHIVO)).error, /URL de contenido inesperada/);
    assert.equal(ajeno.llamadas.length, 1, 'no se pidió la URL ajena');
    const http = falso(truncado('http://gist.githubusercontent.com/raw'));
    assert.match((await new ClienteGist(http).descargar('a', 'tok', ARCHIVO)).error, /URL de contenido inesperada/);

    const bueno = falso((url) => url.includes('githubusercontent') ? respuesta('texto completo') : truncado('https://gist.githubusercontent.com/u/id/raw/x'));
    assert.deepEqual(await new ClienteGist(bueno).descargar('a', 'tok', ARCHIVO), { contenido: 'texto completo' });
    assert.equal(bueno.llamadas[1].opciones, undefined, 'el token no viaja al dominio de contenido');
});

test('escribir: crea (POST) o reemplaza (PATCH) un Gist privado, con descripción sin datos del perfil', async () => {
    const nuevo = falso(respuesta({ id: 'nuevo1' }));
    assert.deepEqual(await new ClienteGist(nuevo).escribir({ gistId: null, token: 'tok', archivo: ARCHIVO, texto: 'sobre' }), { id: 'nuevo1' });
    assert.equal(nuevo.llamadas[0].url, 'https://api.github.com/gists');
    assert.equal(nuevo.llamadas[0].opciones.method, 'POST');
    const cuerpo = JSON.parse(nuevo.llamadas[0].opciones.body);
    assert.equal(cuerpo.public, false);
    assert.equal(cuerpo.files[ARCHIVO].content, 'sobre');
    assert.equal(cuerpo.description.includes('default'), false);

    const existente = falso(respuesta({ id: 'abc' }));
    await new ClienteGist(existente).escribir({ gistId: 'abc', token: 'tok', archivo: ARCHIVO, texto: 's' });
    assert.equal(existente.llamadas[0].url, 'https://api.github.com/gists/abc');
    assert.equal(existente.llamadas[0].opciones.method, 'PATCH');
});

test('escribir: HTTP de error, respuesta sin id y red caída vuelven como error sin lanzar', async () => {
    const datos = { gistId: null, token: 't', archivo: ARCHIVO, texto: 's' };
    assert.deepEqual(await new ClienteGist(falso(respuesta({}, { ok: false, status: 401 }))).escribir(datos), { error: 'HTTP 401', codigo: 'red' });
    assert.equal((await new ClienteGist(falso(respuesta({}))).escribir(datos)).codigo, 'red');
    assert.equal((await new ClienteGist(async () => { throw new Error('offline'); }).escribir(datos)).error, 'offline');
});

test('evaluarSubidaAutomatica: sube, frena por Gist no confiable, por novedades sin combinar, o por tener mucho menos que lo remoto', async () => {
    const ahora = new Date('2026-11-12T12:00:00Z');
    const local = (servicios_, borrados = []) => ({ servicios: servicios_, categorias: ['Casa'], borrados });
    const lectura = { servicios, categorias: ['Casa'], borrados: [], crudo: {}, cifrado: true };
    assert.deepEqual(evaluarSubidaAutomatica(lectura, local(servicios), ahora), { accion: 'subir', borrados: [] });

    assert.deepEqual(evaluarSubidaAutomatica({ error: 'x', codigo: 'sin-cifrar' }, local(servicios), ahora), { accion: 'no-confiable', codigo: 'sin-cifrar' });
    assert.deepEqual(evaluarSubidaAutomatica({ error: 'x', codigo: 'descifrado' }, local(servicios), ahora), { accion: 'no-confiable', codigo: 'descifrado' });
    // sin red u otro motivo para no comparar: no bloquea
    assert.deepEqual(evaluarSubidaAutomatica({ error: 'x', codigo: 'red' }, local(servicios), ahora), { accion: 'subir', borrados: null });

    // lo local es mucho menos que lo remoto, pero lo remoto no trae nada nuevo para combinar (todo está borrado acá hace poco)
    const muchos = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, monto: 1000 + i, fecha: '2026-11-10', pagada: false, fechaPago: null, modificada: '2026-11-01T00:00:00.000Z' }));
    const remotoGrande = { ...lectura, servicios: [{ id: 'luz', nombre: 'Luz', categoria: '', facturas: muchos }] };
    const borradosLocales = muchos.map(f => ({ servicio: 'luz', id: f.id, fecha: '2026-11-11T00:00:00.000Z' }));
    const veredicto = evaluarSubidaAutomatica(remotoGrande, local([{ id: 'luz', nombre: 'Luz', categoria: '', facturas: [] }], borradosLocales), ahora);
    assert.equal(veredicto.accion, 'menos-datos');
    assert.ok(veredicto.medida.local < veredicto.medida.remoto);
});

test('evaluarSubidaAutomatica: lo que el Gist trae y acá falta (registros, o borrados de otro dispositivo) frena la subida; los borrados del Gist se conservan al subir', () => {
    const ahora = new Date('2026-11-12T12:00:00Z');
    const f1 = { id: 'f1', monto: 15000, fecha: '2026-11-03', pagada: false, fechaPago: null, modificada: '2026-11-01T00:00:00.000Z' };
    const local = { servicios: [{ id: 'luz', nombre: 'Luz', categoria: '', facturas: [f1] }], categorias: [], borrados: [] };
    const remoto = (servicios_, borrados = []) => ({ servicios: servicios_, categorias: [], borrados, crudo: {}, cifrado: true });

    // otro dispositivo agregó una factura
    const conNueva = evaluarSubidaAutomatica(remoto([{ id: 'luz', nombre: 'Luz', categoria: '', facturas: [f1, { ...f1, id: 'f2' }] }]), local, ahora);
    assert.equal(conNueva.accion, 'novedades');
    assert.equal(conNueva.analisis.diff.facturasAgregadas, 1);

    // otro dispositivo borró f1 (acá sigue)
    const borrado = { servicio: 'luz', id: 'f1', fecha: '2026-11-05T00:00:00.000Z' };
    const conBorrado = evaluarSubidaAutomatica(remoto([{ id: 'luz', nombre: 'Luz', categoria: '', facturas: [] }], [borrado]), local, ahora);
    assert.equal(conBorrado.accion, 'novedades');
    assert.equal(conBorrado.analisis.diff.facturasEliminadas, 1);

    // el Gist sabe de un borrado de algo que acá nunca estuvo: no hay nada que combinar, pero al subir ese registro no se pierde
    const ajeno = { servicio: 'luz', id: 'f9', fecha: '2026-11-05T00:00:00.000Z' };
    const sinNada = evaluarSubidaAutomatica(remoto(local.servicios, [ajeno]), local, ahora);
    assert.deepEqual(sinNada, { accion: 'subir', borrados: [ajeno] });
});
