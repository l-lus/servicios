// Prueba de la actualización: instala el SW, cambia la versión servida en /tmp/updtest y comprueba el aviso con progreso.
// Uso: copiar el proyecto a /tmp/updtest y correr: node scripts/e2e/navegador.mjs /tmp/updtest scripts/e2e/actualizacion.mjs
import fs from 'node:fs';
export default async (b) => {
    console.log('SW activo:', (await b.eval(`navigator.serviceWorker.ready.then(r=>!!r.active)`)).value);
    console.log('toast inicial:', JSON.stringify((await b.eval(`document.getElementById('toast').innerText`)).value));
    // nueva versión en el servidor
    const f = '/tmp/updtest/sw.js'; let s = fs.readFileSync(f, 'utf8');
    s = s.replace(/CACHE_NAME = `\$\{CACHE_PREFIX\}[^`]+`/, 'CACHE_NAME = `${CACHE_PREFIX}v999999.9999`');
    fs.writeFileSync(f, s);
    await b.eval(`navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)`);
    const vistos = new Set();
    for (let i = 0; i < 40; i++) {
        const t = (await b.eval(`(()=>{const t=document.getElementById('toast'); return t.classList.contains('show') ? t.className+' | '+t.innerText.replace(/\\s+/g,' ') : ''})()`)).value;
        if (t) vistos.add(t);
        await b.sleep(150);
    }
    console.log('estados del aviso:'); [...vistos].forEach(v => console.log('  ', v));
    console.log('cachés:', (await b.eval(`caches.keys().then(k=>k.sort().join(','))`)).value);
    await b.eval(`document.querySelector('#toast .toast-accion')?.click(); true`);
};
