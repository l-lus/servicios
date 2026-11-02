import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS, CARDS, CARDS_ETIQUETAS } from '../core/constantes.js';
import { html, montar } from '../core/html.js';
import {
    normalizarDisposicion, normalizarOrdenMovil, columnaDe, columnasActivas, colocarEnColumna, colocarEnLista,
    moverEnColumna, moverEnLista, pasarAColumna,
} from '../services/orden-cards.js';
import { uiAnimarReubicacion, uiArrastreLargo, REUBICACION_MS } from './arrastre.js';

// ============================================================
// DISPOSICIÓN DE TARJETAS — visibilidad, columnas libres en PC y orden propio en el celular
// ============================================================
// PC: 2 o 3 columnas del mismo ancho y cada tarjeta va a la que se elija ({ izq, cen, der }). Celular: una sola columna con su propio orden.
// Se cambia desde Ajustes (lista con botones, para PC o celular) o arrastrando el título de una tarjeta (o con Alt + flechas).
const $ = id => document.getElementById(id);

// Mismos cortes que el CSS: escritorio desde 768 px; la tercera columna solo se muestra desde 1100 px (más angosto se vuelve a 2)
const consultaEscritorio = window.matchMedia('(min-width: 768px)');
const consultaAncho = window.matchMedia('(min-width: 1100px)');
const esEscritorio = () => consultaEscritorio.matches;
const NOMBRES_COLUMNA = { izq: 'Columna 1', cen: 'Columna 2', der: 'Columna 3' };

// Desde dónde se arrastra cada tarjeta: su encabezado (en el resumen, el título; el resto del resumen toca para alternar)
const SELECTOR_ENCABEZADOS = '#card-resumen .resumen-titulo, #card-atajos, #card-estadisticas .card-header-collapsible, #card-calendario .card-header-collapsible, #card-servicios .card-header-collapsible';
const SELECTOR_CARDS = '#card-resumen, #card-atajos, #card-estadisticas, #card-calendario, #card-servicios';

export class OrdenTarjetas {
    constructor(app) {
        this.app = app;
        /** Qué disposición se está editando en Ajustes: 'pc' o 'movil' (por defecto, la del dispositivo actual). */
        this.edicion = 'pc';
    }

    // ── Estado guardado ──────────────────────────────────────
    /** Columnas elegidas para PC (2 o 3). */
    columnasPC() { return Number(StorageHelper.getItem(STORAGE_KEYS.COLUMNAS_PC, '2')) === 3 ? 3 : 2; }

    /** Columnas que se ven ahora: 1 en celular; en PC las elegidas (3 solo si hay ancho suficiente). */
    columnasEfectivas() {
        if (!esEscritorio()) return 1;
        return this.columnasPC() === 3 && consultaAncho.matches ? 3 : 2;
    }

    obtenerDisposicion() {
        return normalizarDisposicion(StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS, null), CARDS, this.columnasPC());
    }

    guardarDisposicion(d) { StorageHelper.setItem(STORAGE_KEYS.ORDEN_CARDS, d); }

    obtenerOrdenMovil() {
        return normalizarOrdenMovil(StorageHelper.getObject(STORAGE_KEYS.ORDEN_CARDS_MOVIL, null), this.obtenerDisposicion(), CARDS);
    }

    guardarOrdenMovil(lista) { StorageHelper.setItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL, lista); }

    esVisible(cual) { return StorageHelper.getBoolean(STORAGE_KEYS.CARD_VISIBLE(cual), true); }

    // ── Aplicar al DOM ───────────────────────────────────────
    aplicarVisibilidad() {
        CARDS.forEach(cual => { const card = $('card-' + cual); if (card) card.style.display = this.esVisible(cual) ? '' : 'none'; });
    }

    /** Contenedores de las columnas (el del centro solo se ve con 3 columnas; en el celular todo va en el primero). */
    _columnas() {
        return { izq: document.querySelector('.sidebar-left'), cen: $('columna-centro'), der: document.querySelector('.main-content') };
    }

    /** Coloca las tarjetas según la disposición del dispositivo actual (o la que se pase). */
    aplicar(layout = null) {
        const cols = this._columnas();
        if (!cols.izq || !cols.der || !cols.cen) return;
        // Al volver a insertar una tarjeta el navegador reinicia su animación de entrada (y la tarjeta parpadea desde invisible):
        // una vez cargada la pantalla se les quita la clase de entrada, que ya cumplió su función
        if (this._listo) this._quitarEntrada();
        const n = this.columnasEfectivas();
        document.querySelector('.main-grid')?.classList.toggle('cols-3', n === 3);
        if (n === 1) {
            const lista = Array.isArray(layout) ? layout : this.obtenerOrdenMovil();
            lista.forEach(cual => { const c = $('card-' + cual); if (c) cols.izq.appendChild(c); });
        } else {
            const d = layout?.izq ? layout : this.obtenerDisposicion();
            // Con 2 columnas lo del centro se muestra a continuación de la derecha (sin tocar lo guardado)
            const destino = { izq: cols.izq, cen: n === 3 ? cols.cen : cols.der, der: cols.der };
            const orden = n === 3 ? ['izq', 'cen', 'der'] : ['izq', 'der', 'cen'];
            orden.forEach(col => d[col].forEach(cual => { const c = $('card-' + cual); if (c) destino[col].appendChild(c); }));
        }
        this.renderLista();
    }

    _quitarEntrada() {
        document.querySelectorAll('.card-fade-in').forEach(c => c.classList.remove('card-fade-in', 'delay-1', 'delay-2'));
    }

    /** Tarjetas visibles en el orden en que se ven (columna izquierda y luego derecha). */
    obtenerCardsVisibles() {
        const { izq, cen, der } = this._columnas();
        const cards = [];
        [izq, cen, der].forEach(col => {
            if (!col) return;
            Array.from(col.children).forEach(el => { if (el.id?.startsWith('card-') && el.style.display !== 'none') cards.push(el); });
        });
        return cards;
    }

    /** Disposición guardada del dispositivo actual (PC: { izq, cen, der }; celular: lista). */
    _actual() { return esEscritorio() ? this.obtenerDisposicion() : this.obtenerOrdenMovil(); }

    _guardarActual(layout) { if (esEscritorio()) this.guardarDisposicion(layout); else this.guardarOrdenMovil(layout); }

    // ── Lista en Ajustes ─────────────────────────────────────
    renderLista() {
        const cont = $('lista-orden-cards');
        if (!cont) return;
        const pc = this.edicion === 'pc';
        const n = this.columnasPC();
        document.querySelectorAll('#modal-tarjetas .tarjetas-modo').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.modo === 'pc') === pc)));
        document.querySelectorAll('#modal-tarjetas .tarjetas-cols').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n)));
        $('tarjetas-columnas').hidden = !pc;
        $('orden-cards-contexto').textContent = pc
            ? `En PC: ${n} columnas del mismo ancho${n === 3 ? ' (en pantallas angostas se muestran 2)' : ''}. Elegí en cuál va cada tarjeta y su orden.`
            : 'En el celular las tarjetas van en una sola columna, con su propio orden.';

        const activas = columnasActivas(n);
        const fila = (cual, lista, i, columnaActual) => html`
            <div class="orden-card-item" data-card="${cual}">
                <span class="orden-card-nombre">${CARDS_ETIQUETAS[cual]}</span>
                <button type="button" class="icon-btn" data-mover="-1" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir ${CARDS_ETIQUETAS[cual]}">
                    <svg class="icon orden-flecha-sube"><use href="#icon-chevron-down" /></svg>
                </button>
                <button type="button" class="icon-btn" data-mover="1" ${i === lista.length - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar ${CARDS_ETIQUETAS[cual]}">
                    <svg class="icon"><use href="#icon-chevron-down" /></svg>
                </button>
                ${columnaActual ? html`<span class="orden-columnas" role="group" aria-label="Columna de ${CARDS_ETIQUETAS[cual]}">${activas.map((col, k) => html`
                    <button type="button" class="orden-col-btn" data-columna="${col}" aria-pressed="${col === columnaActual}" title="${NOMBRES_COLUMNA[col]}" aria-label="Pasar ${CARDS_ETIQUETAS[cual]} a la ${NOMBRES_COLUMNA[col].toLowerCase()}">${k + 1}</button>`)}</span>` : ''}
                <button type="button" class="toggle-switch ${this.esVisible(cual) ? 'on' : ''}" data-visible="${cual}" role="switch" aria-checked="${this.esVisible(cual)}" aria-label="Mostrar ${CARDS_ETIQUETAS[cual]}"><span class="toggle-thumb"></span></button>
            </div>`;

        if (pc) {
            const d = this.obtenerDisposicion();
            montar(cont, html`${activas.map((col, k) => html`
                <div class="orden-columna" data-columna-lista="${col}">
                    <div class="orden-columna-titulo">Columna ${k + 1}</div>
                    ${d[col].length ? d[col].map((c, i) => fila(c, d[col], i, col)) : html`<div class="orden-columna-vacia">Vacía</div>`}
                </div>`)}`);
        } else {
            const lista = this.obtenerOrdenMovil();
            montar(cont, html`<div class="orden-columna">${lista.map((c, i) => fila(c, lista, i, null))}</div>`);
        }
    }

    /** ¿La disposición que se edita es la que se ve ahora en pantalla? */
    _editaLaVisible() { return (this.edicion === 'pc') === esEscritorio(); }

    _cambiarLayout(nueva) {
        if (this.edicion === 'pc') this.guardarDisposicion(nueva); else this.guardarOrdenMovil(nueva);
        if (this._editaLaVisible()) uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar(nueva));
        else this.renderLista();
    }

    alternarVisibilidad(cual) {
        StorageHelper.setItem(STORAGE_KEYS.CARD_VISIBLE(cual), !this.esVisible(cual));
        this.aplicarVisibilidad();
        this.renderLista();
        this.app.atajos?.render();
    }

    mover(cual, delta) {
        this._cambiarLayout(this.edicion === 'pc'
            ? moverEnColumna(this.obtenerDisposicion(), cual, delta)
            : moverEnLista(this.obtenerOrdenMovil(), cual, delta));
    }

    pasarDeColumna(cual, columna) {
        this._cambiarLayout(pasarAColumna(this.obtenerDisposicion(), cual, columna));
    }

    /** 2 o 3 columnas en PC. Al pasar a 2, lo que había en la del medio se une a la última. */
    cambiarColumnas(n) {
        StorageHelper.setItem(STORAGE_KEYS.COLUMNAS_PC, n);
        this.guardarDisposicion(this.obtenerDisposicion());
        if (this._editaLaVisible() || esEscritorio()) uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar());
        else this.renderLista();
    }

    restablecer() {
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS);
        StorageHelper.removeItem(STORAGE_KEYS.ORDEN_CARDS_MOVIL);
        StorageHelper.removeItem(STORAGE_KEYS.COLUMNAS_PC);
        CARDS.forEach(c => StorageHelper.removeItem(STORAGE_KEYS.CARD_VISIBLE(c)));
        this.aplicarVisibilidad();
        this.aplicar();
    }

    // ── Arrastre y teclado sobre las tarjetas ────────────────
    /**
     * A dónde iría la tarjeta arrastrada según el puntero: columna (en PC, la mitad en que está el puntero) y la tarjeta
     * visible de esa columna delante de la cual se insertaría (null = al final). Devuelve la nueva disposición o null si no cambia.
     */
    _evaluarDestino(arrastrado, clientX, clientY) {
        const id = arrastrado.id.replace('card-', '');
        const cols = this._columnas();
        const visibles = this.obtenerCardsVisibles().filter(c => c !== arrastrado);
        const n = this.columnasEfectivas();
        let columna = 'izq';
        if (n > 1) {
            // La columna es la más cercana al puntero (por el centro horizontal de cada contenedor)
            columna = columnasActivas(n).reduce((mejor, col) => {
                const r = cols[col].getBoundingClientRect(), rm = cols[mejor].getBoundingClientRect();
                return Math.abs(clientX - (r.left + r.width / 2)) < Math.abs(clientX - (rm.left + rm.width / 2)) ? col : mejor;
            }, 'izq');
        }
        const contenedor = cols[columna];
        const enColumna = visibles.filter(c => c.parentElement === contenedor);
        const siguiente = enColumna.find(c => { const r = c.getBoundingClientRect(); return clientY < r.top + r.height / 2; });
        const antesDe = siguiente ? siguiente.id.replace('card-', '') : null;

        const actual = this._actual();
        const nueva = n > 1 ? colocarEnColumna(actual, id, columna, antesDe) : colocarEnLista(actual, id, antesDe);
        return JSON.stringify(nueva) === JSON.stringify(actual) ? null : nueva;
    }

    iniciarArrastre() {
        let inicial = null, enCurso = null, deslizandoHasta = 0;

        uiArrastreLargo(document, {
            elegir: (e) => {
                const el = e.target instanceof Element ? e.target : null;
                const header = el?.closest(SELECTOR_ENCABEZADOS);
                return header ? header.closest(SELECTOR_CARDS) : null;
            },
            capturar: (card) => card.querySelector('.resumen-titulo, .card-header-collapsible') || card,
            alEmpezar: (card) => {
                inicial = this._actual();
                enCurso = inicial;
                card.classList.add('reordenando');
                document.body.classList.add('tarjeta-arrastrando-activa');
            },
            alMover: (e, card) => {
                if (performance.now() < deslizandoHasta) return;
                const nueva = this._evaluarDestino(card, e.clientX, e.clientY);
                if (!nueva) return;
                // Se mueve a la vista (sin guardar) y se anima; se guarda al soltar
                this._guardarTemporal(nueva);
                enCurso = nueva;
                const animadas = uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar(nueva), { encima: card });
                if (animadas.length > 0) deslizandoHasta = performance.now() + REUBICACION_MS;
            },
            alTerminar: (card, confirmar) => {
                card.classList.remove('reordenando');
                document.body.classList.remove('tarjeta-arrastrando-activa');
                const final = confirmar ? enCurso : inicial;
                if (!confirmar && inicial) uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar(final));
                if (final) this._guardarActual(final);
                inicial = null;
                enCurso = null;
            },
        });

        // Con teclado (Alt + flechas sobre el encabezado): ↑/↓ cambian de lugar en la columna, ←/→ pasan a la otra columna (en PC)
        document.addEventListener('keydown', (e) => {
            if (!e.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            const header = e.target instanceof Element ? e.target.closest(SELECTOR_ENCABEZADOS) : null;
            const card = header?.closest(SELECTOR_CARDS);
            if (!card) return;
            const id = card.id.replace('card-', '');
            const visibles = this.obtenerCardsVisibles();
            const actual = this._actual();
            let nueva = null;

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                const hermanas = visibles.filter(c => c.parentElement === card.parentElement);
                const i = hermanas.indexOf(card);
                const vecina = hermanas[e.key === 'ArrowUp' ? i - 1 : i + 1];
                if (!vecina) return;
                const idVecina = vecina.id.replace('card-', '');
                // arriba: antes de la vecina; abajo: antes de la que sigue a la vecina (o al final)
                const antesDe = e.key === 'ArrowUp' ? idVecina : (hermanas[i + 2]?.id.replace('card-', '') ?? null);
                nueva = this.columnasEfectivas() > 1 ? colocarEnColumna(actual, id, columnaDe(actual, id), antesDe) : colocarEnLista(actual, id, antesDe);
            } else if (this.columnasEfectivas() > 1) {
                const activas = columnasActivas(this.columnasEfectivas());
                const k = activas.indexOf(columnaDe(actual, id));
                const destinoCol = activas[k + (e.key === 'ArrowRight' ? 1 : -1)];
                if (!destinoCol) return;
                const destino = visibles.filter(c => c !== card && c.parentElement === this._columnas()[destinoCol]);
                const r = card.getBoundingClientRect();
                const delante = destino.find(c => c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2 > r.top);
                nueva = colocarEnColumna(actual, id, destinoCol, delante ? delante.id.replace('card-', '') : null);
            }
            if (!nueva) return;
            e.preventDefault();
            this._guardarActual(nueva);
            uiAnimarReubicacion(() => this.obtenerCardsVisibles(), c => c.id, () => this.aplicar(nueva), { encima: card });
            (header ?? card).focus();
        });
    }

    /** Durante el arrastre la disposición se guarda para que `_actual()` refleje lo que se ve. */
    _guardarTemporal(layout) { this._guardarActual(layout); }

    // ── Inicio ───────────────────────────────────────────────
    init() {
        this.edicion = esEscritorio() ? 'pc' : 'movil';
        this.aplicarVisibilidad();
        this.aplicar();
        // Pasada la animación de entrada, reordenar no debe volver a animar las tarjetas
        setTimeout(() => { this._listo = true; this._quitarEntrada(); }, 1500);
        // Al pasar de escritorio a celular (o al revés) o al cambiar el ancho se arma el diseño del modo nuevo
        consultaEscritorio.addEventListener('change', () => { this.aplicar(); });
        consultaAncho.addEventListener('change', () => { this.aplicar(); });
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
        document.querySelectorAll('#modal-tarjetas .tarjetas-cols').forEach(b => {
            b.addEventListener('click', () => this.cambiarColumnas(Number(b.dataset.n)));
        });
        $('btn-tarjetas-restablecer').addEventListener('click', () => { this.restablecer(); this.app.ui.mostrarToast('Tarjetas restablecidas', 'success'); });
        $('modal-tarjetas-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-tarjetas'));
    }
}
