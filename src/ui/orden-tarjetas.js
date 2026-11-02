import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS, CARDS, CARDS_ETIQUETAS } from '../core/constantes.js';
import { html, montar } from '../core/html.js';
import { normalizarOrdenCards, fusionarOrdenVisibles, columnaDeCard } from '../services/orden-cards.js';
import { uiAnimarReubicacion, uiArrastreLargo, REUBICACION_MS } from './arrastre.js';

// ============================================================
// ORDEN DE TARJETAS — visibilidad y posición (arrastre con pulsación larga, teclado y lista en Ajustes)
// ============================================================
const $ = id => document.getElementById(id);

// Escritorio (2 columnas) y móvil (1 columna apilada) tienen cada uno su orden. Mismo corte que el CSS (min-width: 768px).
// Mientras no se haya ordenado en móvil, se parte del orden de escritorio.
const consultaEscritorio = window.matchMedia('(min-width: 768px)');
const esEscritorio = () => consultaEscritorio.matches;
const claveOrden = () => (esEscritorio() ? STORAGE_KEYS.ORDEN_CARDS : STORAGE_KEYS.ORDEN_CARDS_MOVIL);

// Desde dónde se arrastra cada tarjeta: su encabezado (en el resumen, el título; el resto del resumen toca para alternar)
const SELECTOR_ENCABEZADOS = '#card-resumen .resumen-titulo, #card-atajos .card-header-sin-chevron, #card-estadisticas .card-header-collapsible, #card-calendario .card-header-collapsible, #card-servicios .card-header-collapsible';
const SELECTOR_CARDS = '#card-resumen, #card-atajos, #card-estadisticas, #card-calendario, #card-servicios';

export class OrdenTarjetas {
    constructor(app) {
        this.app = app;
    }

    // ── Estado guardado ──────────────────────────────────────
    obtenerOrden() {
        const guardado = StorageHelper.getObject(claveOrden(), null) ?? StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS, null);
        return normalizarOrdenCards(guardado, CARDS);
    }

    guardarOrden(orden) { StorageHelper.setItem(claveOrden(), orden); }

    esVisible(cual) { return StorageHelper.getBoolean(STORAGE_KEYS.CARD_VISIBLE(cual), true); }

    // ── Aplicar al DOM ───────────────────────────────────────
    aplicarVisibilidad() {
        CARDS.forEach(cual => { const card = $('card-' + cual); if (card) card.style.display = this.esVisible(cual) ? '' : 'none'; });
    }

    /** Columnas de escritorio: la izquierda es la barra lateral, la derecha el contenido principal (en móvil se apila todo en la primera). */
    _columnas() {
        const izquierda = document.querySelector('.sidebar-left');
        const derecha = document.querySelector('.main-content');
        return { izquierda, derecha };
    }

    aplicarOrden(orden) {
        const { izquierda, derecha } = this._columnas();
        if (!izquierda || !derecha) return;
        // La columna derecha es para la última tarjeta *visible* (si no, ocultar la última dejaría la derecha vacía)
        const visibles = orden.filter(c => this.esVisible(c));
        orden.forEach(cual => {
            const card = $('card-' + cual);
            if (!card) return;
            const idx = visibles.indexOf(cual);
            const aLaDerecha = esEscritorio() && idx !== -1 && columnaDeCard(idx, visibles.length) === 1;
            (aLaDerecha ? derecha : izquierda).appendChild(card);
        });
        this.renderLista();
    }

    obtenerCardsVisibles() {
        const { izquierda, derecha } = this._columnas();
        const cards = [];
        [izquierda, derecha].forEach(columna => {
            if (!columna) return;
            Array.from(columna.children).forEach(el => {
                if (el.id && el.id.startsWith('card-') && el.style.display !== 'none') cards.push(el);
            });
        });
        return cards;
    }

    // ── Lista en Ajustes (visibilidad + subir/bajar) ─────────
    renderLista() {
        const lista = $('lista-orden-cards');
        if (!lista) return;
        const orden = this.obtenerOrden();
        $('orden-cards-contexto').textContent = esEscritorio() ? 'Orden en PC' : 'Orden en celular';
        montar(lista, html`${orden.map((cual, i) => html`
            <div class="orden-card-item" data-card="${cual}">
                <span class="orden-card-nombre">${CARDS_ETIQUETAS[cual]}</span>
                <button type="button" class="icon-btn" data-mover="-1" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${CARDS_ETIQUETAS[cual]}">
                    <svg class="icon orden-flecha-sube"><use href="#icon-chevron-down" /></svg>
                </button>
                <button type="button" class="icon-btn" data-mover="1" ${i === orden.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar ${CARDS_ETIQUETAS[cual]}">
                    <svg class="icon"><use href="#icon-chevron-down" /></svg>
                </button>
                <button type="button" class="toggle-switch ${this.esVisible(cual) ? 'on' : ''}" data-visible="${cual}" role="switch" aria-checked="${this.esVisible(cual)}" aria-label="Mostrar ${CARDS_ETIQUETAS[cual]}"><span class="toggle-thumb"></span></button>
            </div>`)}`);
    }

    alternarVisibilidad(cual) {
        StorageHelper.setItem(STORAGE_KEYS.CARD_VISIBLE(cual), !this.esVisible(cual));
        this.aplicarVisibilidad();
        this.aplicarOrden(this.obtenerOrden());
        this.app.atajos?.render();
    }

    mover(cual, delta) {
        const orden = [...this.obtenerOrden()];
        const i = orden.indexOf(cual), j = i + delta;
        if (i === -1 || j < 0 || j >= orden.length) return;
        [orden[i], orden[j]] = [orden[j], orden[i]];
        this.guardarOrden(orden);
        uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicarOrden(orden));
    }

    restablecer() {
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS);
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL);
        CARDS.forEach(c => StorageHelper.removeItem(STORAGE_KEYS.CARD_VISIBLE(c)));
        this.aplicarVisibilidad();
        this.aplicarOrden(normalizarOrdenCards(null, CARDS));
    }

    // ── Arrastre y teclado sobre las tarjetas ────────────────
    /** El arrastrado se intercambia con el vecino de su columna o, si el puntero pasó a la otra columna, con el que está a su altura. */
    _evaluarNuevoOrden(arrastrado, visibles, clientX, clientY) {
        const idxActual = visibles.indexOf(arrastrado);
        if (idxActual === -1 || visibles.length <= 1) return null;
        const rects = visibles.map(c => c.getBoundingClientRect());
        const enDerecha = rects.map(r => Math.abs(r.left - rects[0].left) > 50);
        const dosColumnas = enDerecha.some(Boolean) && enDerecha.some(x => !x);
        const mitad = (i) => rects[i].top + rects[i].height / 2;
        const indicesDe = (derecha) => visibles.map((_, i) => i).filter(i => enDerecha[i] === derecha);

        let columnaCursor = enDerecha[idxActual];
        if (dosColumnas) {
            const finIzq = Math.max(...indicesDe(false).map(i => rects[i].right));
            const inicioDer = Math.min(...indicesDe(true).map(i => rects[i].left));
            columnaCursor = clientX >= (finIzq + inicioDer) / 2;
        }

        let targetIdx = null;
        if (columnaCursor === enDerecha[idxActual]) {
            const misma = indicesDe(columnaCursor);
            const pos = misma.indexOf(idxActual);
            if (pos > 0 && clientY < mitad(misma[pos - 1])) targetIdx = misma[pos - 1];
            else if (pos < misma.length - 1 && clientY > mitad(misma[pos + 1])) targetIdx = misma[pos + 1];
        } else {
            const otra = indicesDe(columnaCursor);
            targetIdx = otra.reduce((mejor, i) => (Math.abs(clientY - mitad(i)) < Math.abs(clientY - mitad(mejor)) ? i : mejor), otra[0]);
        }
        if (targetIdx === null || targetIdx === idxActual) return null;
        const nueva = [...visibles];
        [nueva[idxActual], nueva[targetIdx]] = [nueva[targetIdx], nueva[idxActual]];
        return nueva;
    }

    iniciarArrastre() {
        let ordenInicial = null, ordenEnCurso = null, deslizandoHasta = 0;

        // Reubica las tarjetas visibles en `visiblesNuevo` (las ocultas conservan su lugar) con la animación de deslizamiento
        const reubicar = (visiblesNuevo, encima) => {
            const nuevoOrden = fusionarOrdenVisibles(ordenEnCurso ?? this.obtenerOrden(), visiblesNuevo.map(c => c.id.replace('card-', '')));
            ordenEnCurso = nuevoOrden;
            return uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicarOrden(nuevoOrden), { encima });
        };

        uiArrastreLargo(document, {
            elegir: (e) => {
                const el = e.target instanceof Element ? e.target : null;
                const header = el?.closest(SELECTOR_ENCABEZADOS);
                return header ? header.closest(SELECTOR_CARDS) : null;
            },
            capturar: (card) => card.querySelector('.resumen-titulo, .card-header-sin-chevron, .card-header-collapsible') || card,
            alEmpezar: (card) => {
                ordenInicial = this.obtenerOrden();
                ordenEnCurso = ordenInicial;
                card.classList.add('reordenando');
                document.body.classList.add('tarjeta-arrastrando-activa');
            },
            alMover: (e, card) => {
                if (performance.now() < deslizandoHasta) return;
                const nuevos = this._evaluarNuevoOrden(card, this.obtenerCardsVisibles(), e.clientX, e.clientY);
                if (nuevos && reubicar(nuevos, card).length > 0) deslizandoHasta = performance.now() + REUBICACION_MS;
            },
            alTerminar: (card, confirmar) => {
                card.classList.remove('reordenando');
                document.body.classList.remove('tarjeta-arrastrando-activa');
                if (confirmar) {
                    this.guardarOrden(ordenEnCurso);
                    this.aplicarOrden(ordenEnCurso);
                } else if (ordenInicial) {
                    uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicarOrden(ordenInicial));
                    this.guardarOrden(ordenInicial);
                }
                ordenInicial = null;
                ordenEnCurso = null;
            },
        });

        // Con teclado (Alt + flechas sobre el encabezado): intercambia con la visible anterior o siguiente
        document.addEventListener('keydown', (e) => {
            if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            const header = e.target instanceof Element ? e.target.closest(SELECTOR_ENCABEZADOS) : null;
            const card = header?.closest(SELECTOR_CARDS);
            if (!card) return;
            const visibles = this.obtenerCardsVisibles();
            const idx = visibles.indexOf(card);
            const atras = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
            if (idx === -1 || (atras ? idx <= 0 : idx >= visibles.length - 1)) return;
            e.preventDefault();
            const nueva = [...visibles];
            const otro = atras ? idx - 1 : idx + 1;
            [nueva[idx], nueva[otro]] = [nueva[otro], nueva[idx]];
            ordenEnCurso = this.obtenerOrden();
            reubicar(nueva, card);
            this.guardarOrden(ordenEnCurso);
            ordenEnCurso = null;
        });
    }

    // ── Inicio ───────────────────────────────────────────────
    init() {
        this.aplicarVisibilidad();
        this.aplicarOrden(this.obtenerOrden());
        // Al pasar de escritorio a móvil (o al revés) se arma el diseño del modo nuevo
        consultaEscritorio.addEventListener('change', () => this.aplicarOrden(this.obtenerOrden()));
    }

    bindEventos() {
        this.iniciarArrastre();
        $('menu-tarjetas').addEventListener('click', () => {
            this.renderLista();
            this.app.ui.abrirModal('modal-tarjetas');
        });
        $('lista-orden-cards').addEventListener('click', (e) => {
            const mover = e.target.closest('[data-mover]');
            const visible = e.target.closest('[data-visible]');
            if (mover && !mover.disabled) this.mover(mover.closest('.orden-card-item').dataset.card, Number(mover.dataset.mover));
            else if (visible) this.alternarVisibilidad(visible.dataset.visible);
        });
        $('btn-tarjetas-restablecer').addEventListener('click', () => { this.restablecer(); this.app.ui.mostrarToast('Tarjetas restablecidas', 'success'); });
        $('modal-tarjetas-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-tarjetas'));
    }
}
