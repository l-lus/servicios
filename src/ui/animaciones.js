import { montar } from '../core/html.js';
import { Motion } from '../core/movimiento.js';

// ============================================================
// ANIM — helpers de animación (mutación entrada/salida, valores)
// ============================================================
export const Anim = (function () {
    'use strict';

    function aArray(valor) {
        if (valor === null || valor === undefined) return [];
        return Array.isArray(valor) ? valor : [valor];
    }

    function getCSSdur(varName) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (!raw) return 300;
        return raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
    }
    function durSiAnima(varName, el = null) {
        return (Motion.reducido() || (el && !el.offsetParent)) ? 0 : getCSSdur(varName);
    }
    const DUR_ANIM = () => getCSSdur('--dur-anim');

    function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
    function esperarAnim(extra = 50) { return esperar(DUR_ANIM() + extra); }

    function estaColapsado(el) { return !!el.closest('.collapsed'); }

    // Clona el elemento como "fantasma" fijo sobre su posición actual para
    // que pueda animar su salida mientras el original se re-renderiza.
    function _fantasmaDe(el, rect = el.getBoundingClientRect()) {
        const clon = el.cloneNode(true);
        clon.removeAttribute('id');
        clon.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        clon.classList.add('mutacion-saliente');
        clon.setAttribute('aria-hidden', 'true');

        Object.assign(clon.style, {
            position: 'fixed',
            top: rect.top + 'px',
            left: rect.left + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px',
            margin: '0',
            pointerEvents: 'none',
            zIndex: '80'
        });

        document.body.appendChild(clon);
        return clon;
    }

    const _mutacionEstado = new WeakMap();

    function _finalizarMutacionPendiente(el) {
        const estado = _mutacionEstado.get(el);
        if (!estado) return;
        clearTimeout(estado.timeout);
        if (estado.fantasma && estado.fantasma.parentNode) estado.fantasma.remove();
        el.classList.remove('mutacion-entrante');
        _mutacionEstado.delete(el);
    }

    // Anima el cambio de contenido de uno o más elementos: el estado viejo
    // sale como fantasma y el nuevo entra con .mutacion-entrante.
    // fn hace la mutación del DOM (puede devolver una promesa).
    function mutacion(elementos, fn, duracion = null) {
        const els = aArray(elementos).filter(Boolean);
        const dur = duracion ?? DUR_ANIM();

        els.forEach(_finalizarMutacionPendiente);
        if (els.length === 0 || Motion.reducido()) return Promise.resolve(fn());

        const fantasmas = [];
        els.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) fantasmas.push({ el, fantasma: _fantasmaDe(el) });
        });

        els.forEach(el => el.classList.remove('mutacion-entrante'));

        return Promise.resolve(fn()).then(resultado => {
            els.forEach(el => {
                void el.offsetWidth;
                el.classList.add('mutacion-entrante');
            });

            const timeout = setTimeout(() => {
                fantasmas.forEach(({ fantasma }) => fantasma.remove());
                els.forEach(el => {
                    el.classList.remove('mutacion-entrante');
                    _mutacionEstado.delete(el);
                });
            }, dur);

            els.forEach(el => {
                const item = fantasmas.find(m => m.el === el);
                _mutacionEstado.set(el, { timeout, fantasma: item ? item.fantasma : null });
            });

            return resultado;
        });
    }

    // Deja un fantasma que se desvanece en el lugar de un elemento que está
    // por eliminarse o reemplazarse (sin animar el que lo reemplaza).
    function fantasmaSiVisible(el) {
        if (!el || Motion.reducido()) return null;
        if (estaColapsado(el)) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        if (r.bottom < 0 || r.top > window.innerHeight) return null;

        const fantasma = _fantasmaDe(el);
        fantasma.classList.remove('nuevo-item-animacion', 'mutacion-entrante');
        const limpiar = () => fantasma.remove();
        fantasma.addEventListener('animationend', limpiar, { once: true });
        esperarAnim(150).then(limpiar);
        return fantasma;
    }

    // Marca un elemento recién creado/modificado para que entre animado.
    // delay (ms) permite esperar, p. ej., a que termine de abrirse un modal;
    // mientras tanto el elemento queda en el estado inicial (oculto).
    function marcarNuevo(el, { delay = 0 } = {}) {
        if (!el || Motion.reducido()) return;
        el.style.animationDelay = delay ? `${delay}ms` : '';
        el.classList.add('nuevo-item-animacion');
        el.addEventListener('animationend', () => {
            el.classList.remove('nuevo-item-animacion');
            el.style.animationDelay = '';
        }, { once: true });
    }

    function _rectVisibleEn(rect, clip) {
        return rect.width > 0 && rect.height > 0 &&
            rect.top >= clip.top - 1 && rect.bottom <= clip.bottom + 1 &&
            rect.bottom > 0 && rect.top < window.innerHeight;
    }

    // Re-renderiza una lista con renderFn y anima la diferencia por clave:
    // ítems nuevos entran, eliminados salen como fantasma y modificados
    // hacen la mutación salida/entrada. Con muchos cambios (búsquedas,
    // reordenamientos masivos) no anima para no saturar.
    function diffLista(cont, selector, atributoClave, renderFn, { maxCambios = 8 } = {}) {
        if (!cont || Motion.reducido() || !cont.offsetParent) { renderFn(); return; }

        const clip = cont.getBoundingClientRect();
        const antes = new Map();
        cont.querySelectorAll(selector).forEach(el => {
            if (estaColapsado(el)) return;
            antes.set(el.getAttribute(atributoClave), { el, rect: el.getBoundingClientRect(), firma: el.outerHTML });
        });

        renderFn();
        if (antes.size === 0) return;

        const despues = new Map();
        cont.querySelectorAll(selector).forEach(el => despues.set(el.getAttribute(atributoClave), el));

        const nuevos = [], eliminados = [], modificados = [];
        despues.forEach((el, clave) => {
            const previo = antes.get(clave);
            if (!previo) { if (!estaColapsado(el)) nuevos.push(el); }
            else if (previo.firma !== el.outerHTML) modificados.push({ previo, el });
        });
        antes.forEach((previo, clave) => { if (!despues.has(clave)) eliminados.push(previo); });

        if (nuevos.length + eliminados.length + modificados.length > maxCambios) return;

        const dur = DUR_ANIM();
        const fantasma = ({ el, rect }) => {
            if (!_rectVisibleEn(rect, clip)) return;
            const f = _fantasmaDe(el, rect);
            setTimeout(() => f.remove(), dur + 50);
        };

        eliminados.forEach(fantasma);
        nuevos.forEach(el => marcarNuevo(el));
        modificados.forEach(({ previo, el }) => {
            fantasma(previo);
            el.classList.add('mutacion-entrante');
            setTimeout(() => el.classList.remove('mutacion-entrante'), dur);
        });
    }

    // Texto "lógico" de un valor, aunque esté a mitad de una animación.
    function _textoValor(el) {
        const est = _valorEstado.get(el);
        return est ? est.texto : el.textContent;
    }

    function _numeroDe(texto) {
        const limpio = String(texto).replace(/[^\d-]/g, '');
        return limpio && limpio !== '-' ? parseInt(limpio, 10) : NaN;
    }

    // Reemplaza el contenido de cont por html animando el cambio:
    // si la estructura es la misma y solo cambian los textos de los
    // elementos selValores, cada valor rueda hacia arriba o abajo según
    // aumente o disminuya; si cambia la estructura, hace la mutación
    // completa (fantasma saliente + contenido entrante).
    function morph(cont, contenido, selValores) {
        if (!cont) return;
        if (Motion.reducido() || !cont.offsetParent || !cont.firstElementChild) {
            montar(cont, contenido);
            return;
        }
        const nuevo = document.createElement('div');
        montar(nuevo, contenido);

        // Los style inline los pone JS después de renderizar (la CSP no deja
        // escribirlos en el HTML), así que no cuentan como estructura.
        const firma = root => {
            const c = root.cloneNode(true);
            c.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));
            c.querySelectorAll(selValores).forEach(v => {
                if (v.children.length === 0 || v.querySelector(':scope > .valor-roll')) v.textContent = '';
            });
            return c.innerHTML.replace(/\s+/g, ' ').trim();
        };

        if (firma(cont) !== firma(nuevo)) {
            mutacion(cont, () => { montar(cont, contenido); });
            return;
        }

        const viejos = cont.querySelectorAll(selValores);
        const nuevos = nuevo.querySelectorAll(selValores);
        viejos.forEach((el, i) => {
            const n = nuevos[i];
            if (!n || n.children.length > 0) return;
            const antes = _textoValor(el), despues = n.textContent;
            if (antes === despues) return;
            const delta = _numeroDe(despues) - _numeroDe(antes);
            valor(el, despues, Number.isNaN(delta) ? 1 : (Math.sign(delta) || 1));
        });
    }

    const _valorEstado = new WeakMap();

    function _finalizarValorPendiente(el) {
        const est = _valorEstado.get(el);
        if (!est) return;
        clearTimeout(est.timeout);
        est.anims.forEach(a => a.cancel());
        _valorEstado.delete(el);
        if (el.querySelector(':scope > .valor-roll')) el.textContent = est.texto;
    }

    // Cambia el texto de un valor con desplazamiento vertical:
    // dir > 0 sube (aumentó), dir < 0 baja (disminuyó), 0 sin animación.
    function valor(el, texto, dir = 0) {
        if (!el) return;
        texto = String(texto);
        const previo = _valorEstado.get(el);
        const actual = previo ? previo.texto : el.textContent;
        _finalizarValorPendiente(el);
        if (actual === texto) { if (el.textContent !== texto) el.textContent = texto; return; }

        const dur = getCSSdur('--dur-valor');
        if (!dir || Motion.reducido() || !dur || !el.offsetParent) { el.textContent = texto; return; }

        const mk = t => { const s = document.createElement('span'); s.className = 'valor-roll-item'; s.textContent = t; return s; };
        const saliente = mk(actual), entrante = mk(texto);
        const roll = document.createElement('span');
        roll.className = 'valor-roll';
        roll.append(saliente, entrante);
        el.replaceChildren(roll);

        const opts = { duration: dur, easing: 'ease-out', fill: 'both' };
        const sgn = dir > 0 ? 1 : -1;
        const anims = [
            saliente.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-70 * sgn}%)`, opacity: 0 }], opts),
            entrante.animate([{ transform: `translateY(${70 * sgn}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], opts)
        ];
        _valorEstado.set(el, { texto, anims, timeout: setTimeout(() => _finalizarValorPendiente(el), dur) });
    }

    // ── Colapsables (acordeón) ───────────────────────────────
    // Las tarjetas (.collapsible-content) recortan su interior solo mientras
    // se animan: .asentado se pone al terminar de abrirse para que los
    // dropdowns internos no queden cortados.
    function _sincronizarAsentado(el) {
        el.classList.toggle('asentado', !el.classList.contains('collapsed'));
    }

    function initColapsables() {
        document.querySelectorAll('.collapsible-content').forEach(_sincronizarAsentado);
        document.addEventListener('transitionend', e => {
            if (e.propertyName !== 'grid-template-rows') return;
            if (e.target.classList?.contains('collapsible-content')) _sincronizarAsentado(e.target);
        });
    }

    function _contenedorScroll(el) {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const oy = getComputedStyle(p).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        }
        return null;
    }

    // Tras expandir un bloque, si quedó cortado lo trae a la vista: entero
    // si entra, o desde su comienzo si es más alto que el área visible.
    function scrollAlExpandir(el) {
        if (!el) return;
        setTimeout(() => {
            if (!el.isConnected) return;
            const cont = _contenedorScroll(el);
            const r = el.getBoundingClientRect();
            const cr = cont ? cont.getBoundingClientRect() : null;
            const top = Math.max(cr ? cr.top : 0, 0);
            const bottom = Math.min(cr ? cr.bottom : window.innerHeight, window.innerHeight);
            if (r.top >= top && r.bottom <= bottom) return;
            el.scrollIntoView({ behavior: Motion.scrollBehavior(), block: r.height <= bottom - top ? 'nearest' : 'start' });
        }, getCSSdur('--dur-collapse') + 20);
    }

    return {
        aArray, getCSSdur, durSiAnima, esperar, esperarAnim, estaColapsado,
        mutacion, fantasmaSiVisible, marcarNuevo, valor, diffLista, morph,
        initColapsables, scrollAlExpandir
    };
})();
