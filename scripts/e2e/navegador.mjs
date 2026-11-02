// Prueba de humo en Firefox headless (WebDriver BiDi, sin dependencias). Uso: npm run e2e
// Para comparar contra otra versión: node scripts/e2e/navegador.mjs <carpeta-base> scripts/e2e/flujos.mjs y diff de las salidas.
// Mini cliente WebDriver BiDi para Firefox: carga la app, junta errores de consola y ejecuta un guion.
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || '.';
const base = process.argv[4] || 'http://localhost:8777/index.html';
const guion = process.argv[3] ? (await import(path.resolve(process.argv[3]))).default : async () => {};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
}).listen(8777);

const profile = fs.mkdtempSync('/tmp/ffprof-');
const ff = spawn('firefox', ['--headless', '--remote-debugging-port=9333', '--profile', profile, '--no-remote', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60; i++) { try { ws = new WebSocket('ws://127.0.0.1:9333/session'); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; }); break; } catch { await sleep(500); ws = null; } }
if (!ws) { console.log('no conecta'); ff.kill(); srv.close(); process.exit(1); }

let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { ok, no } = pend.get(m.id); pend.delete(m.id); m.type === 'error' ? no(new Error(m.error + ': ' + m.message)) : ok(m.result); }
    else if (m.method === 'log.entryAdded' && ['error', 'warn'].includes(m.params.level)) logs.push(`[${m.params.level}] ${m.params.text}`);
};
const send = (method, params = {}) => new Promise((ok, no) => { const i = ++id; pend.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params })); });

await send('session.new', { capabilities: {} });
await send('session.subscribe', { events: ['log.entryAdded'] });
const { contexts } = await send('browsingContext.getTree');
const ctx = contexts[0].context;
const api = {
    ctx, logs, sleep,
    ir: url => send('browsingContext.navigate', { context: ctx, url, wait: 'complete' }),
    eval: async (expr) => {
        const r = await send('script.evaluate', { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: 'none', serializationOptions: { maxObjectDepth: 4 } });
        if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
        return r.result;
    },
    shot: async (file) => { const r = await send('browsingContext.captureScreenshot', { context: ctx }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    setViewport: (w, h) => send('browsingContext.setViewport', { context: ctx, viewport: { width: w, height: h } }),
};
try {
    await api.setViewport(420, 900);
    api.url = base; await api.ir(base);
    await sleep(1500);
    await guion(api);
} catch (e) { console.log('ERROR del guion:', e.message); }
console.log('--- consola (errores/avisos):'); console.log(logs.length ? logs.join('\n') : '(vacía)');
try { await send('browser.close'); } catch {}
ff.kill(); srv.close(); fs.rmSync(profile, { recursive: true, force: true });
process.exit(0);
