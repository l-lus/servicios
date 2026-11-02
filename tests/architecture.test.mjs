import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkJs(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(walkJs(fullPath));
        } else if (entry.name.endsWith('.js')) {
            results.push(fullPath.split(path.sep).join('/'));
        }
    }
    return results.sort();
}

const srcFiles = walkJs('src');

function buildDependencyGraph() {
    const graph = {};
    const rawImports = {};
    for (const file of srcFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const resolvedList = [];
        const rawList = [];
        const regex = /import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            const spec = match[1];
            rawList.push(spec);
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
            resolvedList.push(resolved);
        }
        graph[file] = resolvedList;
        rawImports[file] = rawList;
    }
    return { graph, rawImports };
}

test('Arquitectura: Todos los imports relativos tienen extensión .js explícita y apuntan a archivos existentes', () => {
    const { graph, rawImports } = buildDependencyGraph();
    for (const file of srcFiles) {
        for (const spec of rawImports[file]) {
            assert.ok(spec.startsWith('.'), `${file}: el import "${spec}" debe ser relativo`);
            assert.ok(spec.endsWith('.js'), `${file}: el import "${spec}" debe incluir extensión .js para funcionar en el navegador`);
        }
        for (const target of graph[file]) {
            assert.ok(fs.existsSync(target), `${file}: el archivo importado "${target}" no existe`);
        }
    }
});

test('Arquitectura: Cero violaciones de capas (core <= services <= ui <= main.js)', () => {
    const { graph } = buildDependencyGraph();
    const layerRank = {
        core: 1,
        services: 2,
        ui: 3,
        'main.js': 4
    };
    const getLayer = (f) => f.split('/')[1];

    const violations = [];
    for (const [file, imports] of Object.entries(graph)) {
        const fromLayer = getLayer(file);
        for (const target of imports) {
            const toLayer = getLayer(target);
            if (layerRank[toLayer] > layerRank[fromLayer]) {
                violations.push(`${file} (${fromLayer}) -> ${target} (${toLayer})`);
            }
        }
    }
    assert.deepEqual(violations, [], `Se encontraron violaciones de capa:\n${violations.join('\n')}`);
});

test('Arquitectura: Grafo de módulos acíclico (cero dependencias circulares)', () => {
    const { graph } = buildDependencyGraph();
    const visited = new Set();
    const stack = [];
    const onStack = new Set();
    const cycles = [];

    function dfs(node) {
        visited.add(node);
        stack.push(node);
        onStack.add(node);
        for (const next of (graph[node] || [])) {
            if (!visited.has(next)) {
                dfs(next);
            } else if (onStack.has(next)) {
                const idx = stack.indexOf(next);
                cycles.push(stack.slice(idx).concat(next).join(' -> '));
            }
        }
        stack.pop();
        onStack.delete(node);
    }

    for (const file of srcFiles) {
        if (!visited.has(file)) dfs(file);
    }

    assert.deepEqual(cycles, [], `Se encontraron ciclos de dependencias:\n${cycles.join('\n')}`);
});

test('Service Worker (sw.js): Todos los módulos de src/ están en urlsToCache y todas las rutas existen', () => {
    const swContent = fs.readFileSync('sw.js', 'utf8');
    const match = swContent.match(/const\s+urlsToCache\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'No se encontró urlsToCache en sw.js');

    const cachedPaths = [];
    const strRegex = /['"]([^'"]+)['"]/g;
    let m;
    while ((m = strRegex.exec(match[1])) !== null) {
        cachedPaths.push(m[1]);
    }

    for (const cached of cachedPaths) {
        if (cached === './') continue;
        const diskPath = cached.replace(/^\.\//, '');
        assert.ok(fs.existsSync(diskPath), `Ruta en sw.js urlsToCache no existe en disco: ${cached}`);
    }

    const cachedNormalized = new Set(cachedPaths.map(p => p.replace(/^\.\//, '')));
    const missingFromSw = srcFiles.filter(f => !cachedNormalized.has(f));
    assert.deepEqual(missingFromSw, [], `Módulos de src/ faltantes en sw.js urlsToCache:\n${missingFromSw.join('\n')}`);
});

test('Versión: APP_VERSION de constantes.js coincide con el prefijo de CACHE_NAME en sw.js', () => {
    const constantes = fs.readFileSync('src/core/constantes.js', 'utf8');
    const version = constantes.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
    assert.ok(version, 'No se encontró APP_VERSION en src/core/constantes.js');
    const sw = fs.readFileSync('sw.js', 'utf8');
    const cache = sw.match(/CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}([^`]+)`/)?.[1];
    assert.ok(cache, 'No se encontró CACHE_NAME en sw.js');
    assert.ok(cache.startsWith(`${version}.`), `CACHE_NAME "${cache}" debe empezar con "${version}."`);
});

test('Íconos: todo "#icon-..." usado en src/ e index.html existe en el sprite', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const definidos = new Set([...html.matchAll(/<symbol id="(icon-[\w-]+)"/g)].map(m => m[1]));
    const faltantes = [];
    for (const archivo of [...srcFiles, 'index.html']) {
        const contenido = fs.readFileSync(archivo, 'utf8');
        for (const m of contenido.matchAll(/#(icon-[\w-]+)/g)) {
            if (!definidos.has(m[1])) faltantes.push(`${archivo}: #${m[1]}`);
        }
    }
    // un ícono inexistente se renderiza vacío (el botón queda sin dibujo)
    assert.deepEqual([...new Set(faltantes)], [], 'Íconos usados que no están definidos en el sprite');
});

test('CSP: index.html no usa estilos en línea (style-src \'self\' los bloquea)', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /style-src 'self'/, 'la política esperada es style-src \'self\'');
    const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
    assert.equal(/<style[\s>]/i.test(sinComentarios), false, 'hay un bloque <style> en index.html');
    const atributos = [...sinComentarios.matchAll(/\sstyle\s*=\s*"([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(atributos, [], 'hay atributos style="..." en index.html');
});

test('Capas: src/services no accede al DOM (document / $())', () => {
    const reDom = /\bdocument\.(getElementById|querySelector|querySelectorAll|body|createElement|documentElement|activeElement)\b|(?<![\w.])\$\(/g;
    const violaciones = [];
    for (const file of srcFiles.filter(f => f.startsWith('src/services/'))) {
        const codigo = fs.readFileSync(file, 'utf8')
            .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        const usos = (codigo.match(reDom) || []).length;
        if (usos > 0) violaciones.push(`${file}: ${usos} usos`);
    }
    assert.deepEqual(violaciones, [], `Los servicios deben hablar con la UI vía notify/EventosApp/Formularios:\n${violaciones.join('\n')}`);
});

// tsc no lo detecta: en archivos JS con strict:false las propiedades de un objeto literal no se validan
function clavesDeObjetoExportado(content, inicio) {
    let i = inicio, depth = 1, nivel1 = '';
    while (depth && i < content.length) {
        const c = content[i];
        if ('{(['.includes(c)) { depth++; if (depth === 2) nivel1 += ' '; }
        else if ('})]'.includes(c)) depth--;
        else if (depth === 1) nivel1 += c;
        i++;
    }
    return new Set([...nivel1.matchAll(/(?:^|[,\n])\s*(?:async\s+)?(['"]?)([\w$]+)\1\s*(?=[:,\n]|\s*$)/g)].map(m => m[2]));
}

test('Módulos: cada Modulo.miembro y cada const { ... } = Modulo existen en el objeto exportado', () => {
    const archivos = [...srcFiles, ...fs.readdirSync('tests').map(f => `tests/${f}`)];
    const contenidos = Object.fromEntries(archivos.map(f => [f, fs.readFileSync(f, 'utf8')]));
    const exportados = {};
    for (const file of srcFiles) {
        for (const m of contenidos[file].matchAll(/export const (\w+) = (?:Object\.freeze\()?\{/g)) {
            exportados[m[1]] = { file, claves: clavesDeObjetoExportado(contenidos[file], m.index + m[0].length) };
        }
    }
    const problemas = [];
    for (const [file, content] of Object.entries(contenidos)) {
        for (const [nombre, { file: def, claves }] of Object.entries(exportados)) {
            if (file === def || !new RegExp(`import \\{[^}]*\\b${nombre}\\b[^}]*\\} from`).test(content)) continue;
            const aliases = [nombre, ...[...content.matchAll(new RegExp(`\\b${nombre} as (\\w+)`, 'g'))].map(m => m[1])];
            for (const alias of aliases) {
                for (const m of content.matchAll(new RegExp(`(?<![\\w$])${alias}\\.([\\w$]+)`, 'g'))) {
                    if (!claves.has(m[1])) problemas.push(`${file}: ${alias}.${m[1]}`);
                }
                for (const m of content.matchAll(new RegExp(`const \\{([^}]*)\\} = ${alias};`, 'g'))) {
                    for (const parte of m[1].split(',')) {
                        const clave = parte.trim().split(':')[0].trim();
                        if (clave && !claves.has(clave)) problemas.push(`${file}: { ${clave} } = ${alias}`);
                    }
                }
            }
        }
    }
    assert.deepEqual(problemas, [], `Miembros inexistentes:\n${problemas.join('\n')}`);
});

test('Service Worker (sw.js): todo recurso local que pide la app (index.html, url() de los CSS, íconos y fuentes) está precacheado', () => {
    const sw = fs.readFileSync('sw.js', 'utf8');
    const precache = new Set([...sw.split('];')[0].matchAll(/'\.\/([^']+)'/g)].map(m => m[1]));
    const pedidos = new Map();   // ruta → quién la pide
    const anotar = (ruta, origen) => { if (!pedidos.has(ruta)) pedidos.set(ruta, origen); };

    const html = fs.readFileSync('index.html', 'utf8');
    for (const m of html.matchAll(/(?:href|src)="\.\/([^"#?]+)"/g)) anotar(m[1], 'index.html');
    for (const css of fs.readdirSync('assets/styles').filter(f => f.endsWith('.css'))) {
        const ruta = `assets/styles/${css}`;
        for (const m of fs.readFileSync(ruta, 'utf8').matchAll(/url\(\s*['"]?([^'")]+)/g)) {
            if (/^(data:|#|https?:)/.test(m[1])) continue;
            anotar(path.posix.normalize(path.posix.join('assets/styles', m[1])), ruta);
        }
    }
    for (const archivo of [...srcFiles, 'sw.js']) {
        for (const m of fs.readFileSync(archivo, 'utf8').matchAll(/['"`]\.\/(assets\/[^'"`?#]+)/g)) anotar(m[1], archivo);
    }

    const faltan = [...pedidos].filter(([ruta]) => !precache.has(ruta)).map(([ruta, origen]) => `${ruta} (lo pide ${origen})`);
    assert.deepEqual(faltan, [], 'Agregalos a urlsToCache en sw.js para que funcionen sin conexión');
    assert.ok(pedidos.size >= 4, 'el test encontró los recursos (si no, revisar las expresiones)');
});

test('Capas: nadie usa window.app (el acoplamiento va por EventosApp / registrarAccionVolver)', () => {
    const violaciones = srcFiles.filter(f => /window\.app\b/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(violaciones, []);
});

test('Capas: src/core no toca el DOM de la app (document.getElementById / querySelector)', () => {
    const re = /document\.(getElementById|querySelector|querySelectorAll)\b/;
    const permitidos = new Set(['src/core/movimiento.js']);
    const violaciones = srcFiles.filter(f => f.startsWith('src/core/') && !permitidos.has(f) && re.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(violaciones, []);
});

test('HTML seguro: innerHTML, outerHTML= e insertAdjacentHTML solo dentro de core/html.js (montar)', () => {
    const SINK = /\.(innerHTML|outerHTML)\s*=(?!=)|insertAdjacentHTML\s*\(|\binnerHTML\s*:/;
    const violaciones = srcFiles
        .filter(f => f !== 'src/core/html.js')
        .flatMap(f => fs.readFileSync(f, 'utf8').split('\n')
            .map((l, i) => [l, i + 1])
            .filter(([l]) => SINK.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*'))
            .map(([, n]) => `${f}:${n}`));
    assert.deepEqual(violaciones, [], 'Usá montar(el, html`...`) o replaceChildren() para limpiar');
});

test('CSP: index.html exige Trusted Types con la única política de core/html.js', () => {
    const htmlIndex = fs.readFileSync('index.html', 'utf8');
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(htmlIndex)?.[1] ?? '';
    assert.match(csp, /require-trusted-types-for 'script'/);
    assert.match(csp, /trusted-types servicios;/);
    assert.match(fs.readFileSync('src/core/html.js', 'utf8'), /createPolicy\?\.\('servicios'/);
});

test('Arquitectura CSS: las 5 hojas de assets/styles/ se cargan en orden de cascada en index.html', () => {
    const esperado = ['tokens', 'base', 'vistas', 'menus-modales', 'utilidades-responsivo'].map(n => `assets/styles/${n}.css`);
    const enDisco = fs.readdirSync('assets/styles').filter(f => f.endsWith('.css')).map(f => `assets/styles/${f}`).sort();
    assert.deepEqual(enDisco, [...esperado].sort(), 'assets/styles/ debe tener exactamente las 5 capas');
    const html = fs.readFileSync('index.html', 'utf8');
    const links = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(links, esperado, 'orden de cascada de las hojas CSS en index.html');
});

test('HTML seguro: ninguna plantilla usa crudo() con datos; solo constantes del código (lista blanca)', () => {
    // crudo() marca HTML como confiable sin escapar: solo para constantes fijas. Cada uso nuevo debe revisarse y agregarse acá.
    const permitidos = {
        'src/ui/vista-servicios.js': 1,       // ícono SVG de alerta de categoría (path fijo)
        'src/services/reporte-html.js': 1,    // hoja de estilos constante del reporte
    };
    const usos = Object.fromEntries(srcFiles
        .filter(f => f !== 'src/core/html.js')
        .map(f => [f, (fs.readFileSync(f, 'utf8').match(/(?<![\w$.])crudo\(/g) || []).length])
        .filter(([, n]) => n > 0));
    assert.deepEqual(usos, permitidos);
});

test('HTML seguro: no quedan escapes manuales (escaparHTML / escapeHtml) fuera de core/', () => {
    const violaciones = srcFiles
        .filter(f => !f.startsWith('src/core/'))
        .filter(f => /escaparHTML|escaparAtributoHTML|escapeHtml/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(violaciones, [], 'Usá html`...`: escapa cada interpolación');
});

test('tema-inicial.js: su lista de temas coincide con core/temas.js', async () => {
    const codigo = fs.readFileSync('src/core/tema-inicial.js', 'utf8');
    const lista = JSON.parse(/var TEMAS_VALIDOS = (\[[^\]]*\]);/.exec(codigo)[1].replace(/'/g, '"'));
    const { TEMAS } = await import('../src/core/temas.js');
    assert.deepEqual(lista, TEMAS.map(t => t.id));
});

test('Temas: cada tema tiene su bloque de variables en tokens.css', async () => {
    const css = fs.readFileSync('assets/styles/tokens.css', 'utf8');
    const { TEMAS } = await import('../src/core/temas.js');
    for (const { id } of TEMAS.filter(t => t.id !== 'light' && t.id !== 'dark')) {
        assert.match(css, new RegExp(`html\\[data-theme="${id}"\\] body`), `falta el tema ${id} en tokens.css`);
    }
});

test('Tokens: toda variable CSS usada está definida (en tokens.css o en la propia regla)', () => {
    const css = fs.readdirSync('assets/styles').filter(f => f.endsWith('.css')).map(f => fs.readFileSync(`assets/styles/${f}`, 'utf8')).join('\n');
    const definidas = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    const usadas = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
    // Las asigna JS con style.setProperty (la CSP no admite style en línea)
    const dinamicas = new Set(['--barra-w', '--ctx-x', '--ctx-y', '--cal-n', '--cal-paso', '--i']);
    const sinDefinir = [...usadas].filter(v => !definidas.has(v) && !dinamicas.has(v)).sort();
    assert.deepEqual(sinDefinir, [], 'Variables usadas sin definir');
});

test('Tokens: la fuente Inter está declarada, existe en disco y se precachea', () => {
    const tokens = fs.readFileSync('assets/styles/tokens.css', 'utf8');
    assert.match(tokens, /@font-face[^}]*font-family: 'Inter'/);
    assert.ok(fs.existsSync('assets/fonts/inter-latin.woff2'));
    assert.match(fs.readFileSync('sw.js', 'utf8'), /assets\/fonts\/inter-latin\.woff2/);
});

// ─── Tokens de diseño: lo que ya existe como token no se vuelve a escribir a mano ───
const CSS_DIR = 'assets/styles';
const cssSinTokens = () => fs.readdirSync(CSS_DIR)
    .filter(f => f.endsWith('.css') && f !== 'tokens.css')
    .map(f => ({ f, lineas: fs.readFileSync(`${CSS_DIR}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, '')).split('\n') }));

function violacionesCss(regex, { permitir = () => false } = {}) {
    return cssSinTokens().flatMap(({ f, lineas }) => lineas
        .map((l, i) => [i + 1, l])
        .filter(([, l]) => regex.test(l) && !permitir(l))
        .map(([n, l]) => `${f}:${n}: ${l.trim()}`));
}

test('Tokens: z-index solo con var(--z-*) (la escala vive en tokens.css)', () => {
    assert.deepEqual(violacionesCss(/z-index:\s*-?\d/), []);
});

test('Tokens: sin colores ni sombras con valores fijos fuera de tokens.css (salvo las muestras de tema)', () => {
    const v = violacionesCss(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/, { permitir: l => /^\s*--muestra-/.test(l) });
    assert.deepEqual(v, [], 'usar un token (--c-*, --text-*, --shadow-*, --overlay-*) o agregarlo a tokens.css');
});

test('Tokens: sin font-size, font-weight ni border-radius numéricos (salvo 50% y 0)', () => {
    const v = violacionesCss(/(font-size|font-weight):\s*[\d.]|border-radius:\s*(?!0\b|50%)[\d.]/);
    assert.deepEqual(v, []);
});

test('Tokens: sin fallbacks en var() de tokens definidos (un fallback distinto del token engaña)', () => {
    const tokens = fs.readFileSync(`${CSS_DIR}/tokens.css`, 'utf8');
    const definidos = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    const v = violacionesCss(/var\(--[\w-]+\s*,/, { permitir: l => [...l.matchAll(/var\((--[\w-]+)\s*,/g)].every(m => !definidos.has(m[1])) });
    assert.deepEqual(v, []);
});

test('Tokens: todo token definido en tokens.css se usa (en CSS, JS o HTML) o es parte de una escala reservada', () => {
    const tokens = fs.readFileSync(`${CSS_DIR}/tokens.css`, 'utf8');
    const definidos = [...new Set([...tokens.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1]))];
    const todo = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(`${CSS_DIR}/${f}`, 'utf8')).join('\n')
        + srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n') + fs.readFileSync('index.html', 'utf8');
    // Escalas completas que se dejan definidas aunque hoy no se usen todos los escalones
    const reservados = new Set(['--fw-normal', '--radius-xl', '--icon-sm', '--icon-lg']);
    const sinUso = definidos.filter(t => !reservados.has(t) && !new RegExp(`${t}(?![\\w-])`).test(todo.replace(new RegExp(`^\\s*${t}\\s*:.*$`, 'gm'), '')));
    assert.deepEqual(sinUso, [], 'borrar el token o usarlo');
});

test('Tokens: espaciado (gap/padding/margin) con la escala --space-*; solo quedan hairlines de 1px, negativos y huecos de layout >= 2rem', () => {
    const v = violacionesCss(/(?:^|[{;])\s*(gap|row-gap|column-gap|padding|margin)[\w-]*:[^;]*(?<![\w.-])(?!1px\b)(0?\.\d+|[0-1](\.\d+)?)(rem|px)\b/,
        { permitir: l => /0\.875rem/.test(l) && /padding:/.test(l) });
    assert.deepEqual(v, [], 'usar var(--space-*) (xs, sm, md, lg…) o agregar el escalón a tokens.css');
});

test('Tokens: el tamaño de los íconos (svg / .icon*) sale de --icon-*; solo se admiten la caja del botón, el ícono grande del estado vacío y el punto de color de la ayuda', () => {
    const permitido = /^\.icon-btn \{|^\.btn-add|^\.empty-state svg|^\.ayuda-color/;
    const v = cssSinTokens().flatMap(({ f, lineas }) => {
        let sel = '';
        return lineas.flatMap((l, i) => {
            if (l.includes('{')) sel = l.trim();
            return /svg|icon|csd-arrow/.test(sel) && !permitido.test(sel) && /^\s*(width|height):\s*[\d.]+(px|rem|em)\s*;/.test(l)
                ? [`${f}:${i + 1}: ${sel} ${l.trim()}`] : [];
        });
    });
    assert.deepEqual(v, [], 'usar var(--icon-sm|base|mid|btn|md|lg)');
});

test('Tokens: el ancho máximo de los modales sale de --modal-w-*', () => {
    const v = cssSinTokens().flatMap(({ f, lineas }) => {
        let sel = '';
        return lineas.flatMap((l, i) => {
            if (l.includes('{')) sel = l.trim();
            return /modal-content|\.modal-lg/.test(sel) && /^\s*max-width:\s*[\d.]+(px|rem)/.test(l) ? [`${f}:${i + 1}: ${sel} ${l.trim()}`] : [];
        });
    });
    assert.deepEqual(v, [], 'usar var(--modal-w-sm|md|lg|xl)');
});
