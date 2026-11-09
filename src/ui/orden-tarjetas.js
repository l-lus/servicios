import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS, CARDS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import {
    normalizarOrdenCards, columnasDesdeOrden, prepararColumnas, moverCard, tamanosDeColumnas, MAX_COLUMNAS,
} from '../services/orden-cards.js';
import { uiAnimarReubicacion, uiArrastreLargo, REUBICACION_MS } from './arrastre.js';
import { VistaPrevia } from './vista-previa.js';

// ============================================================
// DISPOSICIÓN DE TARJETAS — visibilidad, columnas orgánicas en PC y orden propio en el celular
// ============================================================
const $ = id => document.getElementById(id);

const consultaEscritorio = window.matchMedia('(min-width: 768px)');
const consultaAncho = window.matchMedia('(min-width: 1100px)');
const esEscritorio = () => consultaEscritorio.matches;
const maxColumnas = () => (!esEscritorio() ? 1 : consultaAncho.matches ? MAX_COLUMNAS : 2);

const SELECTOR_ENCABEZADOS = '#card-resumen, #card-estadisticas .card-header-collapsible, #card-calendario .card-header-collapsible, #card-servicios .card-header-collapsible';
const SELECTOR_CARDS = '#card-resumen, #card-estadisticas, #card-calendario, #card-servicios';

const VENTANA_PERSONALIZAR_MS = 1000;
const AVISO_PERSONALIZAR_MS = 800;
const PERSONALIZABLES = { 'card-resumen': 'resumen', 'card-calendario': 'calendario' };

const _elCard = (cual) => $('card-' + cual);
const _idDeCard = (el) => el.id.replace('card-', '');
const _esCard = (el) => el.id?.startsWith('card-');

export class OrdenTarjetas {
    constructor(app) {
        this.app = app;
        this._recienArrastrado = false;
    }

    // ── Estado guardado ──────────────────────────────────────
    esVisible(cual) { return StorageHelper.getBoolean(STORAGE_KEYS.CARD_VISIBLE(cual), true); }

    _tarjetasVisibles() {
        return new Set(CARDS.filter(c => this.esVisible(c)));
    }

    obtenerOrdenPC() {
        return normalizarOrdenCards(StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS, null));
    }

    guardarOrdenPC(orden) {
        StorageHelper.setItem(STORAGE_KEYS.ORDEN_CARDS, orden);
    }

    obtenerTamanosPC() {
        return StorageHelper.getObject(STORAGE_KEYS.COLUMNAS_CARDS, null);
    }

    guardarColumnasPC(columnas) {
        this.guardarOrdenPC(columnas.flat());
        StorageHelper.setItem(STORAGE_KEYS.COLUMNAS_CARDS, tamanosDeColumnas(columnas));
    }

    obtenerColumnasPC(max = maxColumnas()) {
        const orden = this.obtenerOrdenPC();
        const tamanos = this.obtenerTamanosPC();
        return prepararColumnas(columnasDesdeOrden(orden, tamanos), max, this._tarjetasVisibles());
    }

    obtenerOrdenMovil() {
        const guardado = StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS_MOVIL, null)
            ?? StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS, null);
        return normalizarOrdenCards(guardado);
    }

    guardarOrdenMovil(lista) {
        StorageHelper.setItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL, lista);
    }

    _columnasActuales() {
        if (!esEscritorio()) return [this.obtenerOrdenMovil()];
        return this.obtenerColumnasPC(maxColumnas());
    }

    _guardarColumnasActuales(columnas) {
        if (esEscritorio()) this.guardarColumnasPC(columnas);
        else this.guardarOrdenMovil(columnas.flat());
    }

    // ── Aplicar al DOM ───────────────────────────────────────
    aplicarVisibilidad() {
        CARDS.forEach(cual => {
            const card = _elCard(cual);
            const visible = this.esVisible(cual);
            if (card) card.classList.toggle('card-oculta', !visible);
            const btn = $('btn-toggle-card-' + cual);
            if (btn) {
                btn.classList.toggle('btn-activo', visible);
                btn.setAttribute('aria-pressed', String(visible));
            }
        });
    }

    _contenedores() {
        return [document.querySelector('.sidebar-left'), document.querySelector('.main-content'), $('columna-centro')];
    }

    _actualizarColumnas() {
        const contenedores = this._contenedores();
        const hayTarjetaVisible = (c) => Array.from(c.children).some(el => _esCard(el) && !el.classList.contains('card-oculta'));
        let n = 1;
        contenedores.forEach((c, i) => {
            if (!c || i === 0) return;
            const vacia = !esEscritorio() || !hayTarjetaVisible(c);
            c.classList.toggle('columna-vacia', vacia);
            if (!vacia) n++;
        });
        document.querySelector('.main-grid')?.classList.toggle('cols-3', n === 3);
        const raiz = document.querySelector('.container');
        if (raiz) {
            raiz.dataset.columnas = String(n);
            raiz.style.setProperty('--columnas', String(n));
        }
    }

    aplicar(columnas = null) {
        const contenedores = this._contenedores();
        if (contenedores.some(c => !c)) return;
        if (this._listo) this._quitarEntrada();
        const cols = columnas ?? this._columnasActuales();
        cols.forEach((col, ci) => col.forEach(cual => {
            const card = _elCard(cual);
            if (!card) return;
            const destino = !esEscritorio() ? contenedores[0] : contenedores[Math.min(ci, contenedores.length - 1)];
            destino?.appendChild(card);
        }));
        this._actualizarColumnas();
        this.renderLista(cols);
    }

    _quitarEntrada() {
        document.querySelectorAll('.card-fade-in').forEach(c => c.classList.remove('card-fade-in', 'delay-1', 'delay-2'));
    }

    obtenerCardsVisibles() {
        const cards = [];
        this._contenedores().forEach(col => {
            if (!col) return;
            Array.from(col.children).forEach(el => {
                if (_esCard(el) && !el.classList.contains('card-oculta')) cards.push(el);
            });
        });
        return cards;
    }

    // ── Lista en Ajustes ─────────────────────────────────────
    renderLista(cols = this._columnasActuales()) {
        const etiqueta = $('label-orden-cards');
        if (etiqueta) etiqueta.textContent = `Tarjetas y posición (${esEscritorio() ? 'PC' : 'celular'})`;
        const lista = $('lista-orden-cards');
        if (!lista) return;
        cols.flat().forEach(cual => {
            const item = $('orden-item-' + cual);
            if (item) lista.appendChild(item);
        });
    }

    alternarVisibilidad(cual) {
        StorageHelper.setItem(STORAGE_KEYS.CARD_VISIBLE(cual), !this.esVisible(cual));
        this.aplicarVisibilidad();
        this.aplicar();
    }

    restablecer() {
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS);
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL);
        StorageHelper.removeItem(STORAGE_KEYS.COLUMNAS_CARDS);
        CARDS.forEach(c => StorageHelper.removeItem(STORAGE_KEYS.CARD_VISIBLE(c)));
        this.aplicarVisibilidad();
        this.aplicar();
    }

    // ── Arrastre en lista de Ajustes ─────────────────────────
    iniciarDragOrdenCards() {
        const lista = $('lista-orden-cards');
        if (!lista) return;

        let draggingEl = null;
        let dragClone = null;
        let startY = 0;
        let initialYOffset = 0;
        let dragTimer = null;
        const DRAG_DELAY = 150;

        const getCardFromItem = (el) => {
            const handle = el?.classList?.contains('drag-handle') ? el : el?.querySelector('.drag-handle');
            return handle?.dataset?.card;
        };

        const initDrag = (item, clientY) => {
            draggingEl = item;
            const rect = item.getBoundingClientRect();
            initialYOffset = clientY - rect.top;
            dragClone = item.cloneNode(true);
            dragClone.classList.add('drag-clone');
            Object.assign(dragClone.style, {
                top: `${rect.top}px`, left: `${rect.left}px`,
                width: `${rect.width}px`, height: `${rect.height}px`
            });
            document.body.appendChild(dragClone);
            draggingEl.classList.add('arrastrando');
            if (navigator.vibrate) { try { navigator.vibrate(30); } catch (_) { } }
        };

        const moveDrag = (clientY) => {
            if (!dragClone || !draggingEl) return;
            const area = lista.getBoundingClientRect();
            const alto = dragClone.getBoundingClientRect().height;
            const top = Math.min(Math.max(clientY - initialYOffset, area.top), Math.max(area.top, area.bottom - alto));
            dragClone.style.top = `${top}px`;

            const target = [...lista.querySelectorAll('.orden-card-item')].find(item => {
                if (item === draggingEl) return false;
                const r = item.getBoundingClientRect();
                return clientY >= r.top && clientY <= r.bottom;
            });

            if (target) {
                const targetRect = target.getBoundingClientRect();
                const targetMiddle = targetRect.top + targetRect.height / 2;
                if (clientY < targetMiddle) lista.insertBefore(draggingEl, target);
                else lista.insertBefore(draggingEl, target.nextSibling);
            }
        };

        const endDrag = () => {
            clearTimeout(dragTimer);
            if (!draggingEl) return;
            if (dragClone) {
                dragClone.remove();
                dragClone = null;
            }
            draggingEl.classList.remove('arrastrando');

            const itemsDOM = Array.from(lista.querySelectorAll('.orden-card-item'));
            const nuevoOrden = itemsDOM.map(i => getCardFromItem(i)).filter(Boolean);
            if (esEscritorio()) this.guardarOrdenPC(nuevoOrden);
            else this.guardarOrdenMovil(nuevoOrden);
            this.aplicar();

            draggingEl = null;
            this._recienArrastrado = true;
            setTimeout(() => { this._recienArrastrado = false; }, 50);
        };

        const bindStart = (eventType, getY, opts) => lista.addEventListener(eventType, (e) => {
            const item = e.target.closest('.drag-handle')?.closest('.orden-card-item');
            if (!item) return;
            startY = getY(e);
            dragTimer = setTimeout(() => initDrag(item, startY), DRAG_DELAY);
        }, opts);

        const bindMove = (target, eventType, getY, opts) => target.addEventListener(eventType, (e) => {
            if (!draggingEl) { if (Math.abs(getY(e) - startY) > 10) clearTimeout(dragTimer); return; }
            e.preventDefault();
            moveDrag(getY(e));
        }, opts);

        bindStart('touchstart', e => e.touches[0].clientY, { passive: true });
        bindStart('mousedown', e => e.clientY);
        bindMove(lista, 'touchmove', e => e.touches[0].clientY, { passive: false });
        bindMove(document, 'mousemove', e => e.clientY);
        lista.addEventListener('touchend', endDrag);
        lista.addEventListener('touchcancel', endDrag);
        document.addEventListener('mouseup', endDrag);
    }

    // ── Arrastre y teclado sobre las tarjetas ────────────────
    _evaluarNuevasColumnas(arrastrado, columnas, clientX, clientY) {
        const contenedores = this._contenedores();
        const zonas = [];
        contenedores.forEach((c, i) => {
            if (c && (i === 0 || !c.classList.contains('columna-vacia'))) zonas.push({ indice: i, el: c });
        });
        if (!zonas.length) return null;

        const opciones = { max: maxColumnas(), visibles: this._tarjetasVisibles(), exigirDosColumnas: esEscritorio() };
        const id = _idDeCard(arrastrado);

        const raiz = document.querySelector('.container');
        if (raiz && esEscritorio() && columnas.length < maxColumnas()) {
            const r = raiz.getBoundingClientRect();
            if (clientX > r.right - Math.min(100, r.width * 0.08)) return moverCard(columnas, id, columnas.length, null, opciones);
        }

        const distancia = (z) => { const r = z.el.getBoundingClientRect(); return clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0; };
        const zona = zonas.reduce((mejor, z) => (distancia(z) < distancia(mejor) ? z : mejor), zonas[0]);

        const antes = Array.from(zona.el.children)
            .filter(el => _esCard(el) && el !== arrastrado && !el.classList.contains('card-oculta'))
            .find(el => { const r = el.getBoundingClientRect(); return clientY < r.top + r.height / 2; });

        return moverCard(columnas, id, zona.indice, antes ? _idDeCard(antes) : null, opciones);
    }

    _columnasTrasTecla(id, tecla) {
        const columnas = this._columnasActuales();
        const visibles = this._tarjetasVisibles();
        const colActual = columnas.findIndex(c => c.includes(id));
        if (colActual === -1) return null;
        const enColumna = (i) => columnas[i].filter(c => visibles.has(c));
        const pos = enColumna(colActual).indexOf(id);
        const opciones = { max: maxColumnas(), visibles, exigirDosColumnas: esEscritorio() };

        const vertical = tecla === 'ArrowUp' || tecla === 'ArrowDown' || maxColumnas() === 1;
        const atras = tecla === 'ArrowLeft' || tecla === 'ArrowUp';

        if (vertical) {
            const propias = enColumna(colActual);
            if (atras ? pos <= 0 : pos >= propias.length - 1) return null;
            return moverCard(columnas, id, colActual, atras ? propias[pos - 1] : (propias[pos + 2] ?? null), opciones);
        }
        const destino = colActual + (atras ? -1 : 1);
        if (destino < 0) return null;
        return moverCard(columnas, id, destino, destino < columnas.length ? (enColumna(destino)[pos] ?? null) : null, opciones);
    }

    iniciarArrastre() {
        let columnasInicial = null;
        let columnasEnCurso = null;
        let deslizandoHasta = 0;

        const reubicar = (columnas, encima) => {
            columnasEnCurso = columnas;
            return uiAnimarReubicacion(
                () => this.obtenerCardsVisibles(),
                c => c.id,
                () => this.aplicar(columnas),
                { encima }
            );
        };

        uiArrastreLargo(document, {
            elegir: (e) => {
                if (VistaPrevia.activa()) return null;
                const el = e.target instanceof Element ? e.target : null;
                if (!el || el.closest('#btn-info-resumen')) return null;
                const header = el.closest(SELECTOR_ENCABEZADOS);
                return header ? header.closest(SELECTOR_CARDS) : null;
            },
            capturar: (card) => card.querySelector('.card-header-collapsible') || card,
            alEmpezar: (card) => {
                columnasInicial = this._columnasActuales();
                columnasEnCurso = columnasInicial;
                card.classList.add('reordenando');
                document.body.classList.add('tarjeta-arrastrando-activa');
                if (card.id in PERSONALIZABLES) {
                    this.app.ui.mostrarToast('Soltá para personalizar', 'info', AVISO_PERSONALIZAR_MS);
                }
            },
            alPrimerMovimiento: () => this.app.ui.cerrarToastActual?.(),
            alMover: (e, card) => {
                if (performance.now() < deslizandoHasta || !columnasEnCurso) return;
                const nuevas = this._evaluarNuevasColumnas(card, columnasEnCurso, e.clientX, e.clientY);
                if (!nuevas) return;
                if (reubicar(nuevas, card).length > 0) {
                    deslizandoHasta = performance.now() + REUBICACION_MS;
                }
            },
            alTerminar: (card, confirmar, { movido, duracion }) => {
                card.classList.remove('reordenando');
                document.body.classList.remove('tarjeta-arrastrando-activa');
                const destino = confirmar ? columnasEnCurso : columnasInicial;
                if (destino) {
                    const preparadas = esEscritorio()
                        ? prepararColumnas(destino, maxColumnas(), this._tarjetasVisibles())
                        : [destino.flat()];
                    uiAnimarReubicacion(
                        () => this.obtenerCardsVisibles(),
                        c => c.id,
                        () => this.aplicar(preparadas)
                    );
                    if (confirmar) this._guardarColumnasActuales(preparadas);
                } else {
                    this._actualizarColumnas();
                }
                columnasInicial = null;
                columnasEnCurso = null;
                if (confirmar && !movido && duracion <= VENTANA_PERSONALIZAR_MS && card.id in PERSONALIZABLES) {
                    this.app.ui.cerrarToastActual?.();
                    if (navigator.vibrate) { try { navigator.vibrate(20); } catch (_) { } }
                    EventosApp.emit('tarjeta:personalizar', { tarjeta: PERSONALIZABLES[card.id] });
                }
            },
        });

        document.addEventListener('keydown', (e) => {
            if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            if (VistaPrevia.activa()) return;
            const header = e.target instanceof Element ? e.target.closest(SELECTOR_ENCABEZADOS) : null;
            const card = header?.closest(SELECTOR_CARDS);
            if (!card) return;
            const nuevas = this._columnasTrasTecla(_idDeCard(card), e.key);
            if (!nuevas) return;
            e.preventDefault();
            reubicar(nuevas, card);
            this._guardarColumnasActuales(nuevas);
            columnasEnCurso = null;
            (header ?? card).focus();
        });
    }

    // ── Inicio ───────────────────────────────────────────────
    init() {
        this.aplicarVisibilidad();
        this.aplicar();
        setTimeout(() => { this._listo = true; this._quitarEntrada(); }, 1500);
        consultaEscritorio.addEventListener('change', () => { this.aplicar(); });
        consultaAncho.addEventListener('change', () => { this.aplicar(); });
        EventosApp.on('config:tarjetas', () => {
            this.aplicarVisibilidad();
            this.aplicar();
            this.renderLista();
        });
    }

    bindEventos() {
        this.iniciarArrastre();
        this.iniciarDragOrdenCards();
        CARDS.forEach(cual => {
            $('btn-toggle-card-' + cual)?.addEventListener('click', () => {
                if (this._recienArrastrado) return;
                this.alternarVisibilidad(cual);
            });
        });
    }
}

