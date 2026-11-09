import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS, CARDS, CARDS_ETIQUETAS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { html, montar } from '../core/html.js';
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

const SELECTOR_ENCABEZADOS = '#card-resumen .resumen-titulo, #card-atajos, #card-estadisticas .card-header-collapsible, #card-calendario .card-header-collapsible, #card-servicios .card-header-collapsible';
const SELECTOR_CARDS = '#card-resumen, #card-atajos, #card-estadisticas, #card-calendario, #card-servicios';

const VENTANA_PERSONALIZAR_MS = 1000;
const AVISO_PERSONALIZAR_MS = 800;
const PERSONALIZABLES = { 'card-resumen': 'resumen', 'card-calendario': 'calendario' };

const _elCard = (cual) => $('card-' + cual);
const _idDeCard = (el) => el.id.replace('card-', '');
const _esCard = (el) => el.id?.startsWith('card-');

export class OrdenTarjetas {
    constructor(app) {
        this.app = app;
        this.edicion = 'pc';
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
            if (!card) return;
            const visible = this.esVisible(cual);
            card.classList.toggle('card-oculta', !visible);
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
        this.renderLista();
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
    renderLista() {
        const cont = $('lista-orden-cards');
        if (!cont) return;
        const pc = this.edicion === 'pc';
        document.querySelectorAll('#modal-tarjetas .tarjetas-modo').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.modo === 'pc') === pc)));
        $('orden-cards-contexto').textContent = pc
            ? 'En PC las tarjetas se reparten en 2 o 3 columnas (arrastrá una al borde derecho para abrir la 3.ª columna; si queda vacía se cierra sola).'
            : 'En el celular las tarjetas van en una sola columna, con su propio orden.';

        const fila = (cual, lista, i, colIdx) => html`
            <div class="orden-card-item" data-card="${cual}">
                <span class="orden-card-nombre">${CARDS_ETIQUETAS[cual]}</span>
                <button type="button" class="icon-btn" data-mover="-1" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${CARDS_ETIQUETAS[cual]}">
                    <svg class="icon orden-flecha-sube"><use href="#icon-chevron-down" /></svg>
                </button>
                <button type="button" class="icon-btn" data-mover="1" ${i === lista.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar ${CARDS_ETIQUETAS[cual]}">
                    <svg class="icon"><use href="#icon-chevron-down" /></svg>
                </button>
                ${colIdx !== null ? html`<span class="orden-columnas" role="group" aria-label="Columna de ${CARDS_ETIQUETAS[cual]}">${[0, 1, 2].map(k => html`
                    <button type="button" class="orden-col-btn" data-columna="${k}" aria-pressed="${k === colIdx}" title="Columna ${k + 1}" aria-label="Pasar ${CARDS_ETIQUETAS[cual]} a la columna ${k + 1}">${k + 1}</button>`)}</span>` : ''}
                <button type="button" class="toggle-switch ${this.esVisible(cual) ? 'on' : ''}" data-visible="${cual}" role="switch" aria-checked="${this.esVisible(cual)}" aria-label="Mostrar ${CARDS_ETIQUETAS[cual]}"><span class="toggle-thumb"></span></button>
            </div>`;

        if (pc) {
            const cols = this.obtenerColumnasPC(MAX_COLUMNAS);
            montar(cont, html`${cols.map((col, k) => html`
                <div class="orden-columna" data-columna-lista="${k}">
                    <div class="orden-columna-titulo">Columna ${k + 1}</div>
                    ${col.map((c, i) => fila(c, col, i, k))}
                </div>`)}`);
        } else {
            const lista = this.obtenerOrdenMovil();
            montar(cont, html`<div class="orden-columna">${lista.map((c, i) => fila(c, lista, i, null))}</div>`);
        }
    }

    _editaLaVisible() { return (this.edicion === 'pc') === esEscritorio(); }

    alternarVisibilidad(cual) {
        StorageHelper.setItem(STORAGE_KEYS.CARD_VISIBLE(cual), !this.esVisible(cual));
        this.aplicarVisibilidad();
        this.aplicar();
        this.app.atajos?.render();
    }

    mover(cual, delta) {
        if (this.edicion === 'pc') {
            const cols = this.obtenerColumnasPC(MAX_COLUMNAS);
            const colIdx = cols.findIndex(c => c.includes(cual));
            if (colIdx === -1) return;
            const col = cols[colIdx];
            const pos = col.indexOf(cual);
            const destinoPos = pos + delta;
            if (destinoPos < 0 || destinoPos >= col.length) return;
            const antesDe = delta < 0 ? col[pos - 1] : (col[pos + 2] ?? null);
            const nuevas = moverCard(cols, cual, colIdx, antesDe, { max: MAX_COLUMNAS, visibles: new Set(CARDS), exigirDosColumnas: true });
            if (!nuevas) return;
            this.guardarColumnasPC(nuevas);
            if (this._editaLaVisible()) uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar());
            else this.renderLista();
        } else {
            const lista = this.obtenerOrdenMovil();
            const pos = lista.indexOf(cual);
            const destinoPos = pos + delta;
            if (pos === -1 || destinoPos < 0 || destinoPos >= lista.length) return;
            const antesDe = delta < 0 ? lista[pos - 1] : (lista[pos + 2] ?? null);
            const nuevas = moverCard([lista], cual, 0, antesDe, { max: 1, visibles: new Set(CARDS), exigirDosColumnas: false });
            if (!nuevas) return;
            this.guardarOrdenMovil(nuevas.flat());
            if (this._editaLaVisible()) uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar());
            else this.renderLista();
        }
    }

    pasarDeColumna(cual, colDestino) {
        const cols = this.obtenerColumnasPC(MAX_COLUMNAS);
        const nuevas = moverCard(cols, cual, Number(colDestino), null, { max: MAX_COLUMNAS, visibles: this._tarjetasVisibles(), exigirDosColumnas: true });
        if (!nuevas) return;
        this.guardarColumnasPC(nuevas);
        if (this._editaLaVisible()) uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar());
        else this.renderLista();
    }

    restablecer() {
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS);
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL);
        StorageHelper.removeItem(STORAGE_KEYS.COLUMNAS_CARDS);
        CARDS.forEach(c => StorageHelper.removeItem(STORAGE_KEYS.CARD_VISIBLE(c)));
        this.aplicarVisibilidad();
        this.aplicar();
        this.app.atajos?.render();
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
                const header = el?.closest(SELECTOR_ENCABEZADOS);
                return header ? header.closest(SELECTOR_CARDS) : null;
            },
            capturar: (card) => card.querySelector('.resumen-titulo, .card-header-collapsible') || card,
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
        this.edicion = esEscritorio() ? 'pc' : 'movil';
        this.aplicarVisibilidad();
        this.aplicar();
        setTimeout(() => { this._listo = true; this._quitarEntrada(); }, 1500);
        consultaEscritorio.addEventListener('change', () => { this.aplicar(); });
        consultaAncho.addEventListener('change', () => { this.aplicar(); });
        EventosApp.on('config:tarjetas', () => {
            this.aplicarVisibilidad();
            this.aplicar();
        });
    }

    bindEventos() {
        this.iniciarArrastre();
        $('menu-tarjetas').addEventListener('click', () => {
            this.edicion = esEscritorio() ? 'pc' : 'movil';
            this.renderLista();
            this.app.ui.abrirModal('modal-tarjetas');
        });
        document.querySelectorAll('#modal-tarjetas .tarjetas-modo').forEach(b => {
            b.addEventListener('click', () => { this.edicion = b.dataset.modo; this.renderLista(); });
        });
        $('lista-orden-cards').addEventListener('click', (e) => {
            const item = e.target.closest('.orden-card-item');
            if (!item) return;
            const cual = item.dataset.card;
            const mover = e.target.closest('[data-mover]');
            if (mover && !mover.disabled) this.mover(cual, Number(mover.dataset.mover));
            else if (e.target.closest('[data-columna]')) this.pasarDeColumna(cual, e.target.closest('[data-columna]').dataset.columna);
            else if (e.target.closest('[data-visible]')) this.alternarVisibilidad(cual);
        });
        $('btn-tarjetas-restablecer').addEventListener('click', () => { this.restablecer(); this.app.ui.mostrarToast('Tarjetas restablecidas', 'success'); });
        $('modal-tarjetas-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-tarjetas'));
    }
}

