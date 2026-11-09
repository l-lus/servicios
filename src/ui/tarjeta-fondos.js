import { STORAGE_KEYS, FONDO_CARD_POR_DEFECTO } from '../core/constantes.js';
import { $ } from '../core/dom.js';
import { EventosApp } from '../core/eventos.js';
import { FONDOS_SVG } from '../data/fondos.js';
import { Almacenamiento } from '../core/almacenamiento.js';
import { aHtmlConfiable, crudo, montar } from '../core/html.js';

// ====================================================================
//           FONDOS ILUSTRADOS DE LA TARJETA DE RESUMEN Y COLOR HEADER
// ====================================================================
function setHeaderColor(colorHeader) {
    const header = document.querySelector('.header');
    if (!header) return;
    header.classList.remove('progress-green', 'progress-red', 'progress-purple', 'progress-orange', 'progress-gold', 'progress-blue');
    if (colorHeader && colorHeader !== 'transparent') {
        header.classList.add('progress-' + colorHeader);
    }
}

let _fondoCard = FONDO_CARD_POR_DEFECTO;
let _bgFadeTimer = null;
let _bgActiveLayer = 'a';
let _bgUltimaFirma = null;

function setFondoCard(valor) {
    _fondoCard = valor || FONDO_CARD_POR_DEFECTO;
}

function asegurarContenedorFondo(card = $('card-resumen')) {
    let bg = $('resumen-card-bg');
    if (!bg && card) {
        bg = document.createElement('div');
        bg.id = 'resumen-card-bg';
        bg.className = 'stats-card-bg';
        bg.setAttribute('aria-hidden', 'true');
        card.prepend(bg);
    } else if (bg && card && bg.parentElement !== card) {
        card.prepend(bg);
    }
    return bg;
}

EventosApp.on('config:fondo-card', () => {
    _fondoCard = Almacenamiento.getItem(STORAGE_KEYS.FONDO_CARD, FONDO_CARD_POR_DEFECTO, true);
    const bg = asegurarContenedorFondo();
    if (bg) actualizarFondoCard(bg.dataset.estado || 'blue');
});

function toggleFondoCard() {
    const ids = [...FONDOS_SVG.map(f => f.id), 'ninguno'];
    const idx = ids.indexOf(_fondoCard);
    _fondoCard = ids[(idx + 1) % ids.length];
    Almacenamiento.setItem(STORAGE_KEYS.FONDO_CARD, _fondoCard, true);
    const bg = asegurarContenedorFondo();
    if (bg) actualizarFondoCard(bg.dataset.estado || 'blue');
}

const _buscarFondo = (id) => FONDOS_SVG.find(f => f.id === id);

function _getLabelFondo(id) {
    if (id === 'ninguno') return 'Sin fondo';
    const fondo = _buscarFondo(id);
    return fondo ? fondo.label : id;
}

const _svgSaneados = new Map();

function _getSvgFondo(id, color) {
    const fondo = _buscarFondo(id);
    if (!fondo) return '';
    const clave = `${id}|${color}`;
    if (!_svgSaneados.has(clave)) _svgSaneados.set(clave, _sanitizarSVG(fondo.svg(color)));
    return _svgSaneados.get(clave);
}

function _sanitizarSVG(svgStr) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(aHtmlConfiable(crudo(svgStr)), 'image/svg+xml'); // SVG del catálogo propio (data/fondos.js)

    const TAGS_BLOQUEADOS = ['script', 'foreignObject', 'use', 'iframe', 'object', 'embed', 'link'];
    TAGS_BLOQUEADOS.forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    const ATTRS_BLOQUEADOS = /^on|^xlink:href$|^href$/i;
    doc.querySelectorAll('*').forEach(el => {
        [...el.attributes].forEach(attr => {
            if (ATTRS_BLOQUEADOS.test(attr.name)) el.removeAttribute(attr.name);
        });
    });

    doc.querySelectorAll('[style]').forEach(el => {
        const safe = (el.getAttribute('style') || '').replace(/@import|url\s*\(/gi, '');
        el.setAttribute('style', safe);
    });

    const svgEl = doc.querySelector('svg');
    return svgEl ? svgEl.outerHTML : '';
}

// Colores del fondo por estado. Van como valor literal porque se escriben en el atributo fill del SVG, que no resuelve var(--token)
const COLORES_FONDO = {
    blue: 'rgba(76,114,172,0.12)',
    green: 'rgba(76,172,140,0.12)',
    red: 'rgba(172,90,76,0.12)',
    purple: 'rgba(140,80,200,0.12)',
    gold: 'rgba(172,155,76,0.12)',
    orange: 'rgba(210, 120, 50, 0.12)',
    esperando: 'rgba(140,150,170,0.07)'
};

/** @param {string} estado @param {any} [colorOverride] */
function actualizarFondoCard(estado, colorOverride = null) {
    const bg = asegurarContenedorFondo();
    if (!bg) return;
    bg.dataset.estado = estado;
    setHeaderColor(colorOverride || estado);

    const claveColor = colorOverride || estado;
    const color = COLORES_FONDO[claveColor] || COLORES_FONDO.blue;

    const firma = `${_fondoCard}|${color}`;
    if (firma === _bgUltimaFirma && bg.children.length > 0) return;
    _bgUltimaFirma = firma;

    if (_fondoCard === 'ninguno') {
        bg.replaceChildren();
        return;
    }

    let layerA = /** @type {HTMLElement} */ (bg.querySelector('.stats-card-bg__layer[data-layer="a"]'));
    let layerB = /** @type {HTMLElement} */ (bg.querySelector('.stats-card-bg__layer[data-layer="b"]'));
    if (!layerA) {
        layerA = document.createElement('div');
        layerA.className = 'stats-card-bg__layer';
        layerA.dataset.layer = 'a';
        bg.appendChild(layerA);
    }
    if (!layerB) {
        layerB = document.createElement('div');
        layerB.className = 'stats-card-bg__layer';
        layerB.dataset.layer = 'b';
        bg.appendChild(layerB);
    }

    const nuevoSVG = _getSvgFondo(_fondoCard, color);
    const incoming = _bgActiveLayer === 'a' ? layerB : layerA;
    const outgoing = _bgActiveLayer === 'a' ? layerA : layerB;

    incoming.style.zIndex = '2';
    incoming.classList.remove('visible');
    montar(incoming, crudo(nuevoSVG)); // SVG del catálogo propio, ya pasado por _sanitizarSVG

    outgoing.style.zIndex = '1';
    outgoing.classList.remove('visible');

    if (_bgFadeTimer) { clearTimeout(_bgFadeTimer); _bgFadeTimer = null; }

    void incoming.offsetHeight;
    incoming.classList.add('visible');

    _bgActiveLayer = _bgActiveLayer === 'a' ? 'b' : 'a';
    _bgFadeTimer = setTimeout(() => {
        outgoing.replaceChildren();
        outgoing.classList.remove('visible');
        _bgFadeTimer = null;
    }, 650);
}

export const TarjetaFondos = {
    setHeaderColor,
    asegurarContenedorFondo,
    getFondoCard: () => _fondoCard,
    setFondoCard,
    toggleFondoCard,
    _getLabelFondo,
    actualizarFondoCard
};
