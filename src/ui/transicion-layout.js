import { CARDS, CORTES_LAYOUT } from '../core/constantes.js';
import { Motion } from '../core/movimiento.js';
import { uiAnimarDesdePosiciones, REUBICACION_MS } from './arrastre.js';

// ====================================================================
// TRANSICIÓN DE DISEÑO (al cruzar un corte de ancho: celular <-> escritorio)
// ====================================================================
// Al achicar o agrandar la ventana (o girar el celular) y cruzar un corte de ancho, el CSS y el reparto de las tarjetas en columnas (orden-tarjetas.js) cambian de
// golpe: el encabezado y las tarjetas saltaban a su lugar nuevo. Acá se los desliza a él, con la misma animación que al reubicarlos arrastrando (FLIP).
//
// El problema es que cuando el navegador avisa del cruce el diseño nuevo ya está aplicado y no hay dónde medir "cómo estaba": por eso se guarda de antemano dónde está
// cada elemento (en cada cuadro de un redimensionado, al desplazar y cuando cambia el contenido) y, al cruzar, se compara con esa foto.

/** Los cortes de ancho que cambian el diseño (los mismos que el CSS y orden-tarjetas.js). */
const CORTES = [CORTES_LAYOUT.ESCRITORIO, CORTES_LAYOUT.ANCHO];
/** Mientras se desliza no se guardan fotos: los elementos están a medio camino. */
const DURACION_MS = REUBICACION_MS + 100;
const REINTENTO_FOTO_MS = 250;
/** Para lo que cambia seguido (el desplazamiento, el contenido): una foto como mucho cada tanto. Al redimensionar sí hace falta una por cuadro. */
const ESPERA_FOTO_LENTA_MS = 250;

const _SELECTOR_TARJETAS = CARDS.map(c => `#card-${c}:not(.card-oculta)`).join(', ');

/** Lo que cambia de lugar con el diseño: el encabezado y las tarjetas visibles. */
export const elementosDelLayout = () => /** @type {HTMLElement[]} */ ([
    document.querySelector('.header'),
    ...document.querySelectorAll(_SELECTOR_TARJETAS),
].filter(Boolean));
export const claveDelLayout = (/** @type {HTMLElement} */ el) => el.id || 'header';

/** @type {Map<string, DOMRect>} */
let _foto = new Map();
let _fotoPendiente = false;
let _cruzando = false;
let _hasta = 0;
let _iniciada = false;
let _timerFotoLenta = 0;

function _medir() {
    return new Map(elementosDelLayout().map(el => [claveDelLayout(el), el.getBoundingClientRect()]));
}

/** Guarda dónde está cada elemento, en el próximo cuadro. Si algo se está animando (una tarjeta que se despliega, una reubicación) espera: mediría a medio camino. */
function _programarFoto() {
    if (_fotoPendiente) return;
    _fotoPendiente = true;
    requestAnimationFrame(() => {
        _fotoPendiente = false;
        if (_cruzando) return;
        if (performance.now() < _hasta || elementosDelLayout().some(el => el.getAnimations().length)) {
            setTimeout(_programarFoto, REINTENTO_FOTO_MS);
            return;
        }
        _foto = _medir();
    });
}

function _programarFotoLenta() {
    if (_timerFotoLenta) return;
    _timerFotoLenta = window.setTimeout(() => { _timerFotoLenta = 0; _programarFoto(); }, ESPERA_FOTO_LENTA_MS);
}

function _alCruzarCorte() {
    if (_cruzando) return;   // dos cortes en el mismo cuadro: una sola animación
    _cruzando = true;
    const antes = _foto;   // la foto del último cuadro con el diseño anterior: todavía no la pisó nadie
    // el diseño nuevo ya está puesto, pero todavía no se pintó: en el próximo cuadro (después de que los demás oyentes del cambio, como el reparto en columnas, terminen)
    requestAnimationFrame(() => {
        _cruzando = false;
        const ahora = _medir();
        if (!Motion.reducido() && antes.size > 0) {
            _hasta = performance.now() + DURACION_MS;
            uiAnimarDesdePosiciones(elementosDelLayout, claveDelLayout, antes, { encima: document.querySelector('.header') });
        }
        _foto = ahora;
    });
}

function iniciar() {
    if (_iniciada) return;
    _iniciada = true;
    CORTES.forEach(q => window.matchMedia(q).addEventListener('change', _alCruzarCorte));
    window.addEventListener('resize', _programarFoto);
    window.addEventListener('scroll', _programarFotoLenta, { passive: true });
    // el contenido cambia el alto de las tarjetas (se despliegan, llegan facturas) y con eso la posición de las de abajo
    const raiz = document.querySelector('.container');
    if (raiz) new MutationObserver(_programarFotoLenta).observe(raiz, { childList: true, subtree: true, attributes: true, characterData: true });
    _programarFoto();
}

export const TransicionLayout = { iniciar };
