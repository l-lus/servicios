import { $, setColapsable } from '../core/dom.js';
import { Movimiento } from '../core/movimiento.js';
import { Animaciones } from './animaciones.js';
import { PosicionHeader } from '../core/posicion-header.js';

// ====================================================================
// VISTA PREVIA EN VIVO (ajustes de apariencia que se prueban sobre la propia tarjeta)
// ====================================================================
// Las vistas (resumen, calendario y tema) se registran con `registrarVista` y `definirOrden`: desde el panel se pasa de una a otra con las flechas del título,
// deslizando el panel (pantallas táctiles) o girando la rueda del mouse sobre él. El tema no tiene tarjeta ni velo (hay que ver los colores de toda la página)
// y en lugar de filas muestra círculos de color para elegir.

/** @typedef {{ etiqueta: string, descripcion?: string, icono?: string, valor: () => string, alTocar: () => void, visible?: () => boolean }} FilaVistaPrevia */
/** @typedef {{ id: string, etiqueta: string, fondo: string, acento: string }} OpcionCirculo */
/** @typedef {{ opciones: OpcionCirculo[], actual: () => string, alElegir: (id: string) => void }} CirculosVistaPrevia */
/** `idObjetivo` es la tarjeta que se lleva a la vista (sin él no hay tarjeta); `circulos` reemplaza a las filas; `sinVelo` deja la página sin atenuar. */
/** @typedef {{ id: string, titulo: string, idObjetivo?: string | null, filas: FilaVistaPrevia[], circulos?: CirculosVistaPrevia, sinVelo?: boolean, antes?: () => void, alCerrar?: () => void }} ConfigVistaPrevia */

const NS_SVG = 'http://www.w3.org/2000/svg';
const DEMORA_APERTURA_MS = 160;
const DEMORA_CIERRE_MS = 90;
const MARGEN_PX = 12;
/** Atajo desde las tarjetas y el encabezado (mantener y soltar sin mover): soltar sin mover el dedo dentro de este tiempo abre la vista previa. */
export const VENTANA_PERSONALIZAR_MS = 1000;
/** El aviso dura menos que la ventana para no pisarse con el panel, que aparece en el mismo lugar de la pantalla. */
export const AVISO_PERSONALIZAR_MS = 800;
const TOLERANCIA_ALINEAR_PX = 40;
/** Deslizamiento del contenido del panel al pasar de una vista a otra, y lo que hay que arrastrar (px) para que cuente como deslizar. */
const DESLIZ_MS = 130;
const DESLIZ_PX = 36;
/** Duración del desplazamiento que devuelve la página a su lugar al cerrar la vista previa. */
const DESLIZ_SALIDA_MS = 300;
const UMBRAL_DESLIZAR_PX = 50;
/** Rueda sobre el panel: lo que hay que girar para pasar de vista, y la pausa después de pasar (una vuelta rápida o la inercia del trackpad no saltan varias). */
const UMBRAL_RUEDA = 40;
const PAUSA_RUEDA_MS = 400;
const REPOSO_RUEDA_MS = 150;

/** @type {Record<string, () => (() => void) | void>} */
const _preparadores = {};

/** Vistas registradas (id -> cómo armar su configuración) y el orden en que se pasa de una a otra. */
/** @type {Record<string, () => ConfigVistaPrevia>} */
const _vistas = {};
/** @type {string[]} */
let _orden = [];

/** @type {{ cfg: ConfigVistaPrevia, objetivo: HTMLElement | null, restaurar: (() => void) | null, filas: { def: FilaVistaPrevia, envoltorio: HTMLElement, btn: HTMLElement, valor: HTMLElement }[], circulos: { def: CirculosVistaPrevia, btns: { id: string, btn: HTMLElement }[], nombre: HTMLElement } | null, observer: ResizeObserver | null, timer: any } | null} */
let _activa = null;
let _cambiando = false;
let _iniciada = false;
let _cerrando = false;

/** Un preparador deja visible lo que se va a probar y devuelve cómo volver al estado anterior. @param {string} id @param {() => (() => void) | void} fn */
function registrarPreparador(id, fn) {
    _preparadores[id] = fn;
}

/** Registra una vista: `fabrica` arma su configuración cada vez que se la muestra. @param {string} id @param {() => ConfigVistaPrevia} fabrica */
function registrarVista(id, fabrica) {
    _vistas[id] = fabrica;
}

/** Orden en que se pasa de una vista a otra desde el panel (la última vuelve a la primera). @param {string[]} ids */
function definirOrden(ids) {
    _orden = ids;
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

/** En lugar de filas, círculos de color para elegir (el tema): cada uno muestra el fondo y el acento de su opción. @param {HTMLElement} cont @param {CirculosVistaPrevia} def */
function _construirCirculos(cont, def) {
    const grupo = document.createElement('div');
    grupo.className = 'vista-previa-circulos';
    grupo.setAttribute('role', 'group');
    const btns = def.opciones.map(op => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vista-previa-circulo';
        btn.style.setProperty('--muestra-fondo', op.fondo);
        btn.style.setProperty('--muestra-acento', op.acento);
        btn.setAttribute('aria-label', op.etiqueta);
        btn.title = op.etiqueta;
        btn.addEventListener('click', () => { def.alElegir(op.id); _refrescar(); });
        grupo.append(btn);
        return { id: op.id, btn };
    });
    const nombre = document.createElement('span');
    nombre.className = 'vista-previa-circulos-nombre';
    cont.append(grupo, nombre);
    if (_activa) _activa.circulos = { def, btns, nombre };
}

function _marcarCirculos() {
    const c = _activa?.circulos;
    if (!c) return;
    const actual = c.def.actual();
    c.btns.forEach(({ id, btn }) => {
        btn.classList.toggle('activo', id === actual);
        btn.setAttribute('aria-pressed', String(id === actual));
    });
    c.nombre.textContent = c.def.opciones.find(o => o.id === actual)?.etiqueta ?? '';
}

/** Arma el contenido del panel de la vista activa (título, filas o círculos), sin animar. */
function _poblar() {
    if (!_activa) return;
    const { cfg } = _activa;
    const titulo = $('vista-previa-titulo-texto');
    if (titulo) titulo.textContent = cfg.titulo;
    // las flechas del título avisan que se puede pasar a otra vista; sin otra vista a dónde ir no se muestran
    $('vista-previa-titulo')?.classList.toggle('con-otras', _orden.length > 1);
    document.body.classList.toggle('vista-previa-sin-velo', !!cfg.sinVelo);
    const cont = $('vista-previa-filas');
    _activa.circulos = null;
    if (cont) cont.classList.toggle('settings-list', !cfg.circulos);
    if (cfg.circulos && cont) {
        cont.replaceChildren();
        _activa.filas = [];
        _construirCirculos(cont, cfg.circulos);
    } else {
        _activa.filas = _construirFilas(cfg.filas);
    }
    _refrescar(false);
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
    _marcarCirculos();
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
    // el borde de arriba que deja libre el encabezado: solo cuenta si va arriba
    const encabezado = /** @type {HTMLElement | null} */ (document.querySelector('.header'));
    const bordeEncabezado = PosicionHeader.altoSuperior(encabezado ? encabezado.getBoundingClientRect().bottom : 0);
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
    const { objetivo } = _activa;
    const panel = $('vista-previa-panel');
    const velo = $('vista-previa-velo');
    if (!panel || !velo) return;

    _poblar();

    if (objetivo) {
        objetivo.classList.add('vista-previa-objetivo');
        _activa.timer = setTimeout(_llevarAVista, 60);
    }
    document.body.classList.add('vista-previa-activa');
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
    cancelAnimationFrame(_animSalida);
    _activa = { cfg, objetivo, restaurar: null, filas: [], circulos: null, observer: null, timer: null };
    _cerrando = false;
    cfg.antes?.();
    _activa.restaurar = _preparadores[cfg.id]?.() ?? null;
    setTimeout(_mostrar, DEMORA_APERTURA_MS);
}

/** Desliza el contenido del panel (título y filas) hacia un costado (saliendo) o desde él (entrando). Devuelve las animaciones, para cancelarlas cuando ya no hacen falta. */
async function _deslizar(dx, entrando) {
    if (Movimiento.reducido()) return [];
    const quieto = { transform: 'translateX(0)', opacity: 1 };
    const lejos = { transform: `translateX(${dx}px)`, opacity: 0 };
    const anims = [$('vista-previa-titulo-texto'), $('vista-previa-filas')]
        .filter(el => el)
        .map(el => /** @type {HTMLElement} */ (el).animate(entrando ? [lejos, quieto] : [quieto, lejos], { duration: DESLIZ_MS, easing: 'ease-out', fill: 'forwards' }));
    await Promise.all(anims.map(a => a.finished.catch(() => {})));
    return anims;
}

/** Pasa a la vista de al lado en el orden (`delta` 1 = la siguiente, -1 = la anterior). La vista previa sigue abierta: solo cambia lo que se prueba. @param {number} delta */
async function cambiar(delta) {
    if (!_activa || _cerrando || _cambiando || _orden.length < 2) return;
    const i = _orden.indexOf(_activa.cfg.id);
    if (i < 0) return;
    const nueva = _vistas[_orden[(i + delta + _orden.length) % _orden.length]]?.();
    if (!nueva) return;
    const objetivo = nueva.idObjetivo ? $(nueva.idObjetivo) : null;
    if (nueva.idObjetivo && !objetivo) return;
    _cambiando = true;
    try {
        const salida = await _deslizar(-delta * DESLIZ_PX, false);
        const activa = _activa;
        if (!activa || _cerrando) return;
        // sale lo anterior (lo que había preparado se deshace) y entra lo nuevo; Ajustes (antes/alCerrar) sigue siendo a donde se vuelve al cerrar
        clearTimeout(activa.timer);
        activa.objetivo?.classList.remove('vista-previa-objetivo');
        activa.restaurar?.();
        activa.cfg = { ...nueva, antes: activa.cfg.antes, alCerrar: activa.cfg.alCerrar };
        activa.objetivo = objetivo;
        activa.restaurar = _preparadores[nueva.id]?.() ?? null;
        Animaciones._animarAlturaCambio($('vista-previa-panel'), () => _poblar());
        objetivo?.classList.add('vista-previa-objetivo');
        _medirPanel();
        // la tarjeta se anima al prepararse: se encuadra cuando termina
        activa.timer = setTimeout(_llevarAVista, 380);
        salida.forEach(a => a.cancel());
        const entrada = await _deslizar(delta * DESLIZ_PX, true);
        entrada.forEach(a => a.cancel());
    } finally {
        _cambiando = false;
    }
}

/** Deslizar el panel hacia los costados (pantallas táctiles) pasa a la vista de al lado: hacia la izquierda, la siguiente. */
function _bindDeslizar() {
    const panel = $('vista-previa-panel');
    if (!panel) return;
    let inicio = null;
    let tragarClic = false;
    panel.addEventListener('pointerdown', (e) => {
        inicio = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    });
    panel.addEventListener('pointerup', (e) => {
        if (!inicio || e.pointerId !== inicio.id) return;
        const dx = e.clientX - inicio.x;
        const dy = e.clientY - inicio.y;
        inicio = null;
        if (Math.abs(dx) < UMBRAL_DESLIZAR_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        // el dedo que se levanta sobre un botón no debe contar además como toque
        tragarClic = true;
        setTimeout(() => { tragarClic = false; }, 120);
        cambiar(dx < 0 ? 1 : -1);
    });
    panel.addEventListener('pointercancel', () => { inicio = null; });
    panel.addEventListener('click', (e) => {
        if (!tragarClic) return;
        e.stopPropagation();
        e.preventDefault();
    }, true);
}

/** La rueda del mouse (o el desplazamiento horizontal del trackpad) sobre el panel pasa de vista: hacia abajo la siguiente, hacia arriba la anterior. */
function _bindRueda() {
    const panel = $('vista-previa-panel');
    if (!panel) return;
    let acumulado = 0;
    let hastaPausa = 0;
    let timerReposo = null;
    panel.addEventListener('wheel', (e) => {
        if (!_activa || _cerrando) return;
        // el panel está fijo sobre la página: sin esto la rueda desplazaría lo que hay detrás
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 4 || performance.now() < hastaPausa) return;
        clearTimeout(timerReposo);
        timerReposo = setTimeout(() => { acumulado = 0; }, REPOSO_RUEDA_MS);
        acumulado += delta;
        if (Math.abs(acumulado) < UMBRAL_RUEDA) return;
        const direccion = acumulado > 0 ? 1 : -1;
        acumulado = 0;
        hastaPausa = performance.now() + PAUSA_RUEDA_MS;
        cambiar(direccion);
    }, { passive: false });
}

function cerrar() {
    if (!_activa || _cerrando) return;
    _cerrando = true;
    history.back();
    setTimeout(() => { if (_activa && _cerrando) _finalizar(); }, 600);
}

/** Animación en curso del desplazamiento de salida (ver `_soltarEspacioInferior`). */
let _animSalida = 0;

function _quitarEspacioInferior() {
    document.body.classList.remove('vista-previa-activa');
    document.body.style.removeProperty('--vp-panel-h');
}

/**
 * Al cerrar, el espacio que se reservó abajo para el panel se quita; si la página estaba desplazada hacia ese espacio, el navegador la acomoda de golpe (salta arriba).
 * Para que sea suave se lleva primero el desplazamiento hasta donde queda sin ese espacio y recién entonces se lo quita.
 */
function _soltarEspacioInferior() {
    cancelAnimationFrame(_animSalida);
    const reservado = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    const maximo = Math.max(0, document.documentElement.scrollHeight - reservado - window.innerHeight);
    const desde = window.scrollY;
    if (desde <= maximo + 1 || Movimiento.reducido()) { _quitarEspacioInferior(); return; }
    const inicio = performance.now();
    const paso = (/** @type {number} */ ahora) => {
        // otra vista previa abierta mientras tanto se queda con el espacio
        if (_activa) return;
        const t = Math.min(1, (ahora - inicio) / DESLIZ_SALIDA_MS);
        window.scrollTo(0, desde + (maximo - desde) * (1 - Math.pow(1 - t, 3)));
        if (t < 1) _animSalida = requestAnimationFrame(paso);
        else _quitarEspacioInferior();
    };
    _animSalida = requestAnimationFrame(paso);
}

function _finalizar() {
    const activa = _activa;
    if (!activa) return;
    _activa = null;
    _cerrando = false;
    clearTimeout(activa.timer);
    activa.observer?.disconnect();
    if (activa.objetivo) activa.objetivo.classList.remove('vista-previa-objetivo');
    document.body.classList.remove('vista-previa-sin-velo');
    _soltarEspacioInferior();
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
    $('vista-previa-anterior')?.addEventListener('click', () => cambiar(-1));
    $('vista-previa-siguiente')?.addEventListener('click', () => cambiar(1));
    _bindDeslizar();
    _bindRueda();
    $('vista-previa-velo')?.addEventListener('click', () => cerrar());
    window.addEventListener('popstate', () => { if (_activa && document.body.classList.contains('vista-previa-activa')) _finalizar(); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _activa && document.body.classList.contains('vista-previa-activa')) { e.preventDefault(); cerrar(); }
    });
    window.addEventListener('resize', () => { _medirPanel(); });
}

export const VistaPrevia = { abrir, cerrar, cambiar, bindEventos, registrarPreparador, registrarVista, definirOrden, activa: () => !!_activa };
