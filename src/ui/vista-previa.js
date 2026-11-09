import { $, setColapsable } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
// VISTA PREVIA EN VIVO (ajustes de apariencia que se prueban sobre la propia tarjeta)
// ====================================================================

/** @typedef {{ etiqueta: string, descripcion?: string, icono?: string, valor: () => string, alTocar: () => void, visible?: () => boolean }} FilaVistaPrevia */
/** @typedef {{ id: string, titulo: string, idObjetivo?: string | null, filas: FilaVistaPrevia[], antes?: () => void, alCerrar?: () => void }} ConfigVistaPrevia */

const NS_SVG = 'http://www.w3.org/2000/svg';
const DEMORA_APERTURA_MS = 160;
const DEMORA_CIERRE_MS = 90;
const MARGEN_PX = 12;
const TOLERANCIA_ALINEAR_PX = 40;

/** @type {Record<string, () => (() => void) | void>} */
const _preparadores = {};

/** @type {{ cfg: ConfigVistaPrevia, objetivo: HTMLElement | null, restaurar: (() => void) | null, filas: { def: FilaVistaPrevia, envoltorio: HTMLElement, btn: HTMLElement, valor: HTMLElement }[], observer: ResizeObserver | null, timer: any } | null} */
let _activa = null;
let _iniciada = false;
let _cerrando = false;

/** Un preparador deja visible lo que se va a probar y devuelve cómo volver al estado anterior. @param {string} id @param {() => (() => void) | void} fn */
function registrarPreparador(id, fn) {
    _preparadores[id] = fn;
}

function _icono(href) {
    const svg = document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('class', 'icon');
    const uso = document.createElementNS(NS_SVG, 'use');
    uso.setAttribute('href', href);
    svg.append(uso);
    return svg;
}

function _construirFilas(defs) {
    const cont = $('vista-previa-filas');
    if (!cont) return [];
    cont.replaceChildren();
    return defs.map(def => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const texto = document.createElement('span');
        texto.className = 'settings-list-text';
        const titulo = document.createElement('span');
        titulo.textContent = def.etiqueta;
        texto.append(titulo);
        if (def.descripcion) {
            const desc = document.createElement('span');
            desc.className = 'settings-list-desc';
            desc.textContent = def.descripcion;
            texto.append(desc);
        }
        const valor = document.createElement('span');
        btn.append(_icono(def.icono ?? '#icon-eye'), texto, valor);
        const envoltorio = document.createElement('div');
        envoltorio.className = 'collapsible';
        const interior = document.createElement('div');
        interior.className = 'collapsible-inner';
        interior.append(btn);
        envoltorio.append(interior);
        btn.addEventListener('click', () => {
            def.alTocar();
            _refrescar();
            clearTimeout(_activa?.timer);
            if (_activa) _activa.timer = setTimeout(_llevarAVista, 380);
        });
        cont.append(envoltorio);
        return { def, envoltorio, btn, valor };
    });
}

/** @param {HTMLElement} el @param {string} texto */
function _anchoConTexto(el, texto) {
    const medidor = /** @type {HTMLElement} */ (el.cloneNode(false));
    medidor.removeAttribute('style');
    medidor.textContent = texto;
    Object.assign(medidor.style, { position: 'absolute', visibility: 'hidden', width: 'auto', pointerEvents: 'none' });
    el.parentElement?.append(medidor);
    const ancho = medidor.getBoundingClientRect().width;
    medidor.remove();
    return ancho;
}

/** @param {HTMLElement} el @param {string} texto */
function _cambiarValor(el, texto) {
    const dur = Animaciones._durSiAnima('--dur-valor', el);
    const antes = el.getBoundingClientRect().width;
    if (!(dur > 1) || !(antes > 0) || el.textContent === texto) { Animaciones._animarValor(el, texto, 1); return; }
    const despues = _anchoConTexto(el, texto);
    el.style.width = `${antes}px`;
    Animaciones._animarValor(el, texto, 1);
    if (Math.abs(despues - antes) < 1) { el.style.width = ''; return; }
    void el.offsetWidth;
    el.style.transition = `width ${dur}ms ease-out`;
    el.style.width = `${despues}px`;
    clearTimeout(/** @type {any} */ (el).__finAncho);
    /** @type {any} */ (el).__finAncho = setTimeout(() => { el.style.width = ''; el.style.transition = ''; }, dur + 60);
}

/** @param {boolean} [animar] */
function _refrescar(animar = true) {
    if (!_activa) return;
    const filas = _activa.filas;
    const visibles = filas.map(f => (f.def.visible ? f.def.visible() : true));
    const aplicar = () => {
        filas.forEach((f, i) => {
            if (animar) _cambiarValor(f.valor, f.def.valor());
            else Animaciones._animarValor(f.valor, f.def.valor(), 0);
            if (f.envoltorio.classList.contains('expanded') !== visibles[i]) setColapsable(f.envoltorio, visibles[i], { animar });
        });
    };
    const cambiaVisibilidad = filas.some((f, i) => f.envoltorio.classList.contains('expanded') !== visibles[i]);
    const panel = $('vista-previa-panel');
    if (animar && !cambiaVisibilidad && panel) Animaciones._animarAlturaCambio(panel, aplicar);
    else aplicar();
}

function _llevarAVista() {
    if (!_activa || !_activa.objetivo) return;
    const encabezado = document.querySelector('.header');
    const bordeEncabezado = encabezado ? encabezado.getBoundingClientRect().bottom : 0;
    const libreSup = bordeEncabezado + MARGEN_PX;
    const libreInf = window.innerHeight - _alturaReservada() - MARGEN_PX;
    const r = _activa.objetivo.getBoundingClientRect();
    const panel = $('vista-previa-panel');
    const finVisible = window.innerHeight - (panel ? panel.offsetHeight : 0);
    if (r.top >= bordeEncabezado && r.bottom <= finVisible) return;
    let delta = 0;
    if (r.height > libreInf - libreSup || r.top < libreSup) {
        delta = r.top - libreSup;
        if (r.top >= bordeEncabezado && Math.abs(delta) <= TOLERANCIA_ALINEAR_PX) delta = 0;
    } else if (r.bottom > libreInf) delta = r.bottom - libreInf;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: Movimiento.scrollBehavior() });
}

function _alturaReservada() {
    const panel = $('vista-previa-panel');
    if (!panel) return 0;
    const filas = _activa ? _activa.filas : [];
    const alto = (/** @type {{ btn: HTMLElement }} */ f) => f.btn.offsetHeight;
    const base = panel.offsetHeight - filas.reduce((suma, f) => suma + f.envoltorio.offsetHeight, 0);
    const fijas = filas.filter(f => !f.def.visible).reduce((suma, f) => suma + alto(f), 0);
    const subopciones = Math.max(0, ...filas.filter(f => f.def.visible).map(alto));
    return Math.ceil(base + fijas + subopciones);
}

function _medirPanel() {
    const panel = $('vista-previa-panel');
    if (panel) document.body.style.setProperty('--vp-panel-h', `${_alturaReservada()}px`);
}

function _mostrar() {
    if (!_activa) return;
    const { cfg, objetivo } = _activa;
    const panel = $('vista-previa-panel');
    const velo = $('vista-previa-velo');
    if (!panel || !velo) return;

    $('vista-previa-titulo')?.replaceChildren(cfg.titulo);
    _activa.filas = _construirFilas(cfg.filas);
    _refrescar(false);

    if (objetivo) {
        objetivo.classList.add('vista-previa-objetivo');
        _activa.timer = setTimeout(_llevarAVista, 60);
    }
    document.body.classList.add('vista-previa-activa');
    if (!objetivo) {
        document.body.classList.add('vista-previa-sin-objetivo');
    }
    velo.classList.add('show');
    panel.classList.add('show');
    panel.inert = false;
    history.pushState({ vistaPrevia: true }, '');

    _medirPanel();
    _activa.observer = new ResizeObserver(() => { _medirPanel(); });
    _activa.observer.observe(panel);
    _activa.filas.find(f => !f.def.visible)?.btn.focus({ preventScroll: true });
}

/** @param {ConfigVistaPrevia} cfg */
function abrir(cfg) {
    if (_activa) return;
    const objetivo = cfg.idObjetivo ? $(cfg.idObjetivo) : null;
    if (cfg.idObjetivo && !objetivo) return;
    _activa = { cfg, objetivo, restaurar: null, filas: [], observer: null, timer: null };
    _cerrando = false;
    cfg.antes?.();
    _activa.restaurar = _preparadores[cfg.id]?.() ?? null;
    setTimeout(_mostrar, DEMORA_APERTURA_MS);
}

function cerrar() {
    if (!_activa || _cerrando) return;
    _cerrando = true;
    history.back();
    setTimeout(() => { if (_activa && _cerrando) _finalizar(); }, 600);
}

function _finalizar() {
    const activa = _activa;
    if (!activa) return;
    _activa = null;
    _cerrando = false;
    clearTimeout(activa.timer);
    activa.observer?.disconnect();
    if (activa.objetivo) activa.objetivo.classList.remove('vista-previa-objetivo');
    document.body.classList.remove('vista-previa-activa', 'vista-previa-sin-objetivo');
    document.body.style.removeProperty('--vp-panel-h');
    $('vista-previa-velo')?.classList.remove('show');
    const panel = $('vista-previa-panel');
    if (panel && document.activeElement instanceof HTMLElement && panel.contains(document.activeElement)) document.activeElement.blur();
    panel?.classList.remove('show');
    if (panel) panel.inert = true;
    activa.restaurar?.();
    if (activa.cfg.alCerrar) setTimeout(() => activa.cfg.alCerrar?.(), DEMORA_CIERRE_MS);
}

function bindEventos() {
    if (_iniciada) return;
    _iniciada = true;
    $('vista-previa-listo')?.addEventListener('click', () => cerrar());
    $('vista-previa-velo')?.addEventListener('click', () => cerrar());
    window.addEventListener('popstate', () => { if (_activa && document.body.classList.contains('vista-previa-activa')) _finalizar(); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _activa && document.body.classList.contains('vista-previa-activa')) { e.preventDefault(); cerrar(); }
    });
    window.addEventListener('resize', () => { _medirPanel(); });
}

export const VistaPrevia = { abrir, cerrar, bindEventos, registrarPreparador, activa: () => !!_activa };
