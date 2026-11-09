import { Recarga } from '../core/recarga.js';
import { Animaciones } from './animaciones.js';

// ====================================================================
// RECARGA POR GESTO — "tirar para recargar" propio, con fundido de las tarjetas
// ====================================================================

const UMBRAL_PX = 90;
const AMORTIGUACION = 0.5;
const MARGEN_INICIO_PX = 10;
const MAX_ESPERA_GESTO_MS = 350;
const LIMPIEZA_ENTRADA_MS = 1500;
const CLASE_ANIMANDO = 'recarga-animando';
const CLASE_RECARGANDO = 'recargando';
const CLASE_ENTRADA = 'entrada-pagina';

const raiz = () => document.documentElement;

/** @type {{ y: number, x: number, t: number, activo: boolean } | null} */
let _gesto = null;
let _recargando = false;
let _iniciado = false;

function _setProgreso(valor) {
    raiz().style.setProperty('--recarga-progreso', valor.toFixed(3));
}

function _puedeIniciar(/** @type {EventTarget | null} */ destino) {
    if (_recargando || window.scrollY > 0) return false;
    if (document.body.classList.contains('modal-open')) return false;
    for (let el = /** @type {HTMLElement | null} */ (destino); el && el !== document.body; el = el.parentElement) {
        if (el.scrollTop > 0) return false;
    }
    return true;
}

function _alTocar(/** @type {TouchEvent} */ e) {
    _gesto = null;
    if (e.touches.length !== 1 || !_puedeIniciar(e.target)) return;
    const t = e.touches[0];
    _gesto = { y: t.clientY, x: t.clientX, t: performance.now(), activo: false };
}

function _alMover(/** @type {TouchEvent} */ e) {
    if (!_gesto || e.touches.length !== 1) return;
    if (e.defaultPrevented || window.scrollY > 0) return _cancelar();

    const t = e.touches[0];
    const dy = t.clientY - _gesto.y;
    const dx = Math.abs(t.clientX - _gesto.x);

    if (!_gesto.activo) {
        if (dy < -MARGEN_INICIO_PX || dx > Math.abs(dy)) { _gesto = null; return; }
        if (dy < MARGEN_INICIO_PX) return;
        if (performance.now() - _gesto.t > MAX_ESPERA_GESTO_MS) { _gesto = null; return; }
        _gesto.activo = true;
        raiz().classList.remove(CLASE_ANIMANDO);
    }
    _setProgreso(Math.min(Math.max(dy, 0) * AMORTIGUACION / UMBRAL_PX, 1));
}

function _alSoltar() {
    if (!_gesto) return;
    const { activo } = _gesto;
    _gesto = null;
    if (!activo) return;

    const progreso = parseFloat(raiz().style.getPropertyValue('--recarga-progreso')) || 0;
    if (progreso >= 1) _recargar();
    else _restaurar();
}

function _cancelar() {
    const activo = _gesto?.activo;
    _gesto = null;
    if (activo) _restaurar();
}

function _restaurar() {
    raiz().classList.add(CLASE_ANIMANDO);
    _setProgreso(0);
}

async function _recargar() {
    if (_recargando) return;
    _recargando = true;
    raiz().classList.add(CLASE_ANIMANDO, CLASE_RECARGANDO);
    await Animaciones.esperar(Animaciones.DUR_RECARGA() + 50);
    location.reload();
}

function entrar() {
    const html = raiz();
    html.classList.add(CLASE_ENTRADA);
    const limpiar = () => html.classList.remove(CLASE_ENTRADA);
    document.querySelector('.container')?.addEventListener('animationend', limpiar, { once: true });
    setTimeout(limpiar, LIMPIEZA_ENTRADA_MS);
}

function bindEventos() {
    if (_iniciado) return;
    _iniciado = true;
    Recarga.definirManejador(_recargar);
    window.addEventListener('touchstart', _alTocar, { passive: true });
    window.addEventListener('touchmove', _alMover, { passive: true });
    window.addEventListener('touchend', _alSoltar, { passive: true });
    window.addEventListener('touchcancel', _cancelar, { passive: true });
    window.addEventListener('pageshow', (e) => {
        if (!e.persisted) return;
        _recargando = false;
        raiz().classList.remove(CLASE_RECARGANDO);
        _setProgreso(0);
    });
}

export const RecargaGesto = { bindEventos, entrar };
