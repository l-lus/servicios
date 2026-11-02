// Sube la versión: APP_VERSION (src/core/constantes.js) y CACHE_NAME (sw.js).
// Formato: vAAMMDD (versión visible) y vAAMMDD.HHMM (caché del Service Worker).
// También regenera la lista urlsToCache de sw.js a partir de los archivos reales.
// Uso: npm run release   (después: npm test)
import fs from 'node:fs';
import path from 'node:path';

const pad = n => String(n).padStart(2, '0');
const ahora = new Date();
const version = `v${pad(ahora.getFullYear() % 100)}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`;
const cache = `${version}.${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;

function reemplazar(archivo, regex, nuevo) {
    const original = fs.readFileSync(archivo, 'utf8');
    if (!regex.test(original)) throw new Error(`${archivo}: no se encontró el patrón ${regex}`);
    fs.writeFileSync(archivo, original.replace(regex, nuevo));
}

function listar(dir, ext) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.posix.join(dir, e.name);
        return e.isDirectory() ? listar(p, ext) : (ext.some(x => p.endsWith(x)) ? [p] : []);
    }).sort();
}

const recursos = ['index.html', ...listar('src', ['.js']), ...listar('assets', ['.css', '.json', '.svg', '.png', '.woff2'])];
const lista = ['./', ...recursos.map(r => `./${r}`)].map(r => `  '${r}',`).join('\n');

reemplazar('src/core/constantes.js', /(APP_VERSION\s*=\s*')[^']+(')/, `$1${version}$2`);
reemplazar('sw.js', /(CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\})[^`]+(`)/, `$1${cache}$2`);
reemplazar('sw.js', /const urlsToCache = \[[\s\S]*?\];/, () => `const urlsToCache = [\n${lista}\n];`);

console.log(`APP_VERSION = ${version}\nCACHE_NAME  = SERVICIOS-${cache}`);
