import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ejecuta sw.js tal cual en un contexto aislado con un `self`, una caché y un `fetch` simulados,
// para comprobar instalación, limpieza de cachés y modo sin conexión sin un navegador.
const codigoSw = fs.readFileSync('sw.js', 'utf8');

function crearEntorno({ fallaEn = null, sinRed = false, enCache = [], cachesExistentes = [] } = {}) {
    /** @type {Record<string, Function>} */
    const manejadores = {};
    const mensajes = [];
    const guardados = [];
    const borradas = [];
    const estado = { saltoLaEspera: false, reclamo: false, pedidosARed: 0 };
    const cliente = { postMessage: m => mensajes.push(m) };
    const self = {
        addEventListener: (tipo, fn) => { manejadores[tipo] = fn; },
        clients: { matchAll: async () => [cliente], claim: async () => { estado.reclamo = true; } },
        skipWaiting: async () => { estado.saltoLaEspera = true; },
        registration: { scope: 'http://localhost/app/' },
    };
    const contexto = vm.createContext({
        self,
        console: { error() { }, log() { } },
        URL,
        location: { origin: 'http://localhost' },
        Request: class { constructor(url, opciones) { this.url = url; this.cache = opciones?.cache; } },
        Response: { error: () => ({ type: 'error' }) },
        fetch: async (pedido) => {
            estado.pedidosARed++;
            if (sinRed) throw new TypeError('Failed to fetch');
            return { ok: pedido.url !== fallaEn, status: pedido.url === fallaEn ? 500 : 200, clone() { return this; } };
        },
        caches: {
            open: async () => ({ put: async (url) => { guardados.push(url); } }),
            keys: async () => cachesExistentes,
            delete: async (nombre) => { borradas.push(nombre); return true; },
            match: async (pedido) => (enCache.includes(typeof pedido === 'string' ? pedido : pedido.url) ? { type: 'cacheada', url: pedido.url ?? pedido } : null),
        },
    });
    vm.runInContext(codigoSw, contexto);
    return {
        manejadores, mensajes, guardados, borradas, estado,
        urls: /** @type {string[]} */ (vm.runInContext('urlsToCache', contexto)),
        nombre: /** @type {string} */ (vm.runInContext('CACHE_NAME', contexto)),
        prefijo: /** @type {string} */ (vm.runInContext('CACHE_PREFIX', contexto)),
    };
}

async function instalar(entorno) {
    let promesa;
    entorno.manejadores.install({ waitUntil: p => { promesa = p; } });
    await promesa;
}

test('Service Worker: la instalación guarda todos los archivos, informa el avance de 0 a 100 y toma el control', async () => {
    const entorno = crearEntorno();
    await instalar(entorno);

    assert.deepEqual([...entorno.guardados].sort(), [...entorno.urls].sort());
    const avances = entorno.mensajes.filter(m => m.tipo === 'sw-progreso').map(m => m.progreso);
    assert.equal(avances[0], 0);
    assert.equal(avances[avances.length - 1], 100);
    assert.ok(avances.every((p, i) => Number.isInteger(p) && (i === 0 || p > avances[i - 1])), 'el avance es entero y siempre crece');
    assert.equal(entorno.estado.saltoLaEspera, true);
    assert.equal(entorno.mensajes.some(m => m.tipo === 'sw-error'), false);
});

test('Service Worker: si falla un archivo, la instalación falla, avisa el error y no toma el control', async () => {
    const entorno = crearEntorno({ fallaEn: './src/main.js' });
    await assert.rejects(() => instalar(entorno));

    assert.equal(entorno.estado.saltoLaEspera, false, 'se conserva la versión anterior');
    assert.ok(entorno.mensajes.some(m => m.tipo === 'sw-error'));
    assert.equal(entorno.mensajes.some(m => m.progreso === 100), false);
});

test('Service Worker: al activarse borra solo las cachés viejas propias y nunca las de otras apps del mismo origen', async () => {
    const base = crearEntorno();
    const entorno = crearEntorno({ cachesExistentes: [base.nombre, `${base.prefijo}v000000.0000`, 'horarios-v1-cache', 'otra-app-v1'] });
    let promesa;
    entorno.manejadores.activate({ waitUntil: p => { promesa = p; } });
    await promesa;

    assert.deepEqual(entorno.borradas, [`${base.prefijo}v000000.0000`]);
    assert.equal(entorno.estado.reclamo, true);
});

test('Service Worker: el nombre de la caché empieza con el prefijo propio (si no, la limpieza no la reconocería)', () => {
    const { nombre, prefijo } = crearEntorno();
    assert.ok(nombre.startsWith(prefijo));
});

test('Service Worker sin conexión: una navegación cae a index.html precacheado y otro recurso falla con Response.error()', async () => {
    const entorno = crearEntorno({ sinRed: true, enCache: ['./index.html'] });
    const responder = async (url, mode) => {
        let promesa;
        entorno.manejadores.fetch({ request: { method: 'GET', url, mode }, respondWith: p => { promesa = p; } });
        return promesa;
    };
    assert.equal((await responder('http://localhost/app/otra-pagina', 'navigate')).type, 'cacheada');
    assert.deepEqual(await responder('http://localhost/app/assets/icons/icon-512.png', 'no-cors'), { type: 'error' });
});

test('Service Worker: no interviene en pedidos que no son GET, de otro origen o fuera de su scope', () => {
    const entorno = crearEntorno();
    const intercepta = (request) => {
        let respondio = false;
        entorno.manejadores.fetch({ request, respondWith: () => { respondio = true; } });
        return respondio;
    };
    assert.equal(intercepta({ method: 'GET', url: 'http://localhost/app/index.html', mode: 'navigate' }), true);
    assert.equal(intercepta({ method: 'POST', url: 'http://localhost/app/api', mode: 'cors' }), false);
    assert.equal(intercepta({ method: 'GET', url: 'https://api.github.com/gists', mode: 'cors' }), false);
    assert.equal(intercepta({ method: 'GET', url: 'http://localhost/otra-app/index.html', mode: 'navigate' }), false);
});
