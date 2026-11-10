import { EventosApp } from '../core/eventos.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { html, montar } from '../core/html.js';
import { TEMAS, etiquetaTema, normalizarTema } from '../core/temas.js';

// ============================================================
// GESTOR DE TEMAS — aplica el tema, sincroniza la barra del sistema y dibuja el selector
// ============================================================
let _actual = 'dark';

function temaGuardado() {
    return normalizarTema(StorageHelper.getItem(STORAGE_KEYS.TEMA, null));
}

function sincronizarBarraDelSistema() {
    const color = getComputedStyle(document.body).getPropertyValue('--bg-body').trim();
    if (!/^#[0-9a-f]{3,8}$/i.test(color)) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
    }
    meta.setAttribute('content', color);
}

/** Aplica el tema al documento (sin guardarlo). */
function aplicarTema(tema) {
    _actual = normalizarTema(tema);
    const raiz = document.documentElement;
    raiz.classList.toggle('dark-mode', _actual === 'dark');
    if (_actual === 'light' || _actual === 'dark') raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', _actual);
    const indicador = document.getElementById('tema-indicator');
    if (indicador) indicador.textContent = etiquetaTema(_actual);
    document.querySelectorAll('.tema-opcion').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.tema === _actual));
    });
    sincronizarBarraDelSistema();
    EventosApp.emit('tema:cambio', _actual);
}

/** Aplica y guarda el tema elegido. */
function elegirTema(tema) {
    aplicarTema(tema);
    StorageHelper.setItem(STORAGE_KEYS.TEMA, _actual);
}

/** Pasa al siguiente tema de la lista y lo guarda. */
function siguienteTema() {
    const idx = TEMAS.findIndex(t => t.id === _actual);
    const sig = TEMAS[(idx + 1) % TEMAS.length].id;
    elegirTema(sig);
}

/** Dibuja las muestras del selector (una por tema). */
function renderSelector(idLista = 'bienvenida-temas') {
    const lista = document.getElementById(idLista);
    if (!lista) return;
    montar(lista, html`${TEMAS.map(t => html`
        <button type="button" class="tema-opcion" data-tema="${t.id}" aria-pressed="${t.id === _actual}">
            <span class="tema-muestra" data-fondo="${t.fondo}" data-tarjeta="${t.tarjeta}" data-texto="${t.texto}">
                <span class="tema-muestra-tarjeta"></span>
                <span class="tema-muestra-linea"></span>
            </span>
            <span class="tema-etiqueta">${t.etiqueta}</span>
        </button>`)}`);
    // La CSP no admite style en línea: los colores de cada muestra se asignan por JS (CSSOM)
    lista.querySelectorAll('.tema-muestra').forEach(m => {
        m.style.setProperty('--muestra-fondo', m.dataset.fondo);
        m.style.setProperty('--muestra-tarjeta', m.dataset.tarjeta);
        m.style.setProperty('--muestra-texto', m.dataset.texto);
    });
}

EventosApp.on('config:tema', (tema) => aplicarTema(tema));

export const GestorTemas = {
    temaGuardado,
    aplicarTema,
    elegirTema,
    siguienteTema,
    renderSelector,
    actual: () => _actual,
    etiqueta: () => etiquetaTema(_actual),
    cargar() { renderSelector('bienvenida-temas'); aplicarTema(temaGuardado()); },
};

