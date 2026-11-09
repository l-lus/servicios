import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { Motion } from '../core/movimiento.js';
import { Preferencias } from '../core/preferencias.js';
import { html, montar } from '../core/html.js';
import { formatearMoneda, formatearFecha } from '../core/formato.js';
import { CalendarioVencimientos } from '../services/calendario-vencimientos.js';
import { EstadoApp } from '../services/estado-app.js';
import { Anim } from './animaciones.js';
import { registrarSwipe } from './gestos.js';
import { _crearPopupFlotante } from './popups.js';
import { VistaPrevia } from './vista-previa.js';

// ============================================================
// CALENDARIO — vista mensual de vencimientos (mismo diseño y animaciones que el calendario de Horarios)
// ============================================================
const $ = id => document.getElementById(id);
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ETIQUETA_CLASE = { vencido: 'Vencida', urgente: 'Vence pronto', proximo: 'Próxima', lejano: 'Pendiente', pagado: 'Pagada', favor: 'Saldo a favor' };
const COLOR_PULSO_HOY = {
    vencido: 'var(--accent-red)',
    urgente: 'var(--accent-orange)',
    proximo: 'var(--accent-gold)',
    lejano: 'var(--accent-blue)',
    pagado: 'var(--accent-green)',
    favor: 'var(--accent-purple)'
};
// Entrada inicial: pop escalonado de los días con facturas (una sola vez al abrir)
const ENTRADA_PASO_MS = 25;
const ENTRADA_TOTAL_MAX_MS = 350;
const CIERRE_SELECTOR_INACTIVO_MS = 15000;

const importes = par => [par.ars !== 0 ? formatearMoneda(par.ars, 'ars') : '', par.usd !== 0 ? formatearMoneda(par.usd, 'usd') : ''].filter(Boolean).join(' · ') || '—';

export class CalendarioVista {
    constructor(app) {
        this.app = app;
        const hoy = new Date();
        this.visible = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
        this.abierto = false;
        this._mes = null;
        this._selectorAbierto = false;
        this._selectorMesesProtegido = false;
        this._selectorMesesGuardTimer = null;
        this._selectorMesesIdleTimer = null;
        this._hoverTimer = null;
        this._leaveTimer = null;
        this._hoverPopup = null;
    }

    init() {
        this.abierto = StorageHelper.getBoolean(STORAGE_KEYS.CALENDARIO_ABIERTO, false);
        $('calendario-content').classList.toggle('collapsed', !this.abierto);
        $('calendario-chevron').classList.toggle('collapsed', !this.abierto);
        this.render();
        if (this.abierto) setTimeout(() => this.animarEntrada(), 350);

        VistaPrevia.registrarPreparador('calendario', () => {
            const card = $('card-calendario');
            const estabaOculta = card?.classList.contains('card-oculta');
            const estabaCerrado = !this.abierto;
            if (estabaOculta) card.classList.remove('card-oculta');
            if (estabaCerrado) {
                this.abierto = true;
                $('calendario-content').classList.remove('collapsed');
                $('calendario-chevron').classList.remove('collapsed');
                this.render();
            }
            this._cerrarSelector();
            return () => {
                if (estabaCerrado) {
                    this.abierto = false;
                    $('calendario-content').classList.add('collapsed');
                    $('calendario-chevron').classList.add('collapsed');
                }
                if (estabaOculta) card?.classList.add('card-oculta');
            };
        });

        EventosApp.on('config:calendario-abierto', () => {
            const abierto = StorageHelper.getBoolean(STORAGE_KEYS.CALENDARIO_ABIERTO, false);
            if (abierto !== this.abierto) {
                this.abierto = abierto;
                $('calendario-content').classList.toggle('collapsed', !this.abierto);
                $('calendario-chevron').classList.toggle('collapsed', !this.abierto);
                if (this.abierto) this.render();
            }
        });
    }

    toggle() {
        this._cerrarHoverPopup();
        this.abierto = !this.abierto;
        StorageHelper.setItem(STORAGE_KEYS.CALENDARIO_ABIERTO, this.abierto);
        $('calendario-content').classList.toggle('collapsed', !this.abierto);
        $('calendario-chevron').classList.toggle('collapsed', !this.abierto);
        if (this.abierto) {
            this.render();
            Anim.scrollAlExpandir($('calendario-content').closest('.card'));
            // Mientras la tarjeta termina de desplegarse el pop de los días ya se ve
            setTimeout(() => this.animarEntrada(), 150);
        }
    }

    // ── Navegación entre meses (con deslizamiento) ───────────
    navegar(delta) {
        this._cerrarHoverPopup();
        this._cerrarSelector();
        this.visible = CalendarioVencimientos.desplazarMes(this.visible, delta);
        Anim.slide($('calendario-grilla'), delta, () => this.render());
    }

    irAHoy() {
        this._cerrarHoverPopup();
        this._cerrarSelector();
        const hoy = new Date();
        const destino = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
        const delta = Math.sign((destino.anio - this.visible.anio) * 12 + (destino.mes - this.visible.mes));
        const destacar = () => {
            const el = document.querySelector('#calendario-grilla .calendario-dia.hoy');
            if (!el) return;
            const celdaHoy = this._mes?.semanas.flat().find(c => c?.esHoy);
            const colorHoy = celdaHoy?.clase ? COLOR_PULSO_HOY[celdaHoy.clase] : null;
            Anim.flashElemento(el, colorHoy ? 'campo-flash-color' : 'campo-flash', colorHoy);
        };
        if (delta === 0) { destacar(); return; }
        this.visible = destino;
        Anim.slide($('calendario-grilla'), delta, () => this.render());
        setTimeout(destacar, Motion.reducido() ? 0 : 340);
    }

    // ── Selector de meses ────────────────────────────────────
    _reiniciarInactividadSelector() {
        clearTimeout(this._selectorMesesIdleTimer);
        if (!this._selectorAbierto) return;
        this._selectorMesesIdleTimer = setTimeout(() => this._cerrarSelector(), CIERRE_SELECTOR_INACTIVO_MS);
    }

    _cerrarSelector() {
        clearTimeout(this._selectorMesesGuardTimer);
        clearTimeout(this._selectorMesesIdleTimer);
        this._selectorMesesProtegido = false;
        if (!this._selectorAbierto) return;
        this._selectorAbierto = false;
        $('calendario-selector-meses').style.display = 'none';
        $('calendario-grilla').style.display = '';
        $('calendario-nav-botones').style.display = '';
        this._pintarTitulo();
    }

    _abrirSelector() {
        this._cerrarHoverPopup();
        if (this._selectorAbierto) { this._cerrarSelector(); return; }
        // Meses con facturas (más el que se está viendo), del más nuevo al más viejo y agrupados por año
        const claves = new Set(EstadoApp.servicios.flatMap(s => s.id === this.app.SERVICIO_INGRESOS_ID ? [] : s.facturas.map(f => f.fecha.slice(0, 7))));
        claves.add(`${this.visible.anio}-${String(this.visible.mes + 1).padStart(2, '0')}`);
        const porAnio = new Map();
        [...claves].sort().reverse().forEach(c => {
            const [a, m] = c.split('-');
            if (!porAnio.has(a)) porAnio.set(a, []);
            porAnio.get(a).push(Number(m) - 1);
        });
        const selector = $('calendario-selector-meses');
        montar(selector, html`${[...porAnio].map(([anio, meses]) => html`
            <div class="selector-meses-anio-header">${anio}</div>
            ${meses.map(m => html`<button type="button" class="btn-mes-calendario${Number(anio) === this.visible.anio && m === this.visible.mes ? ' activo' : ''}" data-anio="${anio}" data-mes="${m}">${MESES[m]}</button>`)}`)}`);
        this._selectorAbierto = true;
        this._selectorMesesProtegido = true;
        clearTimeout(this._selectorMesesGuardTimer);
        this._selectorMesesGuardTimer = setTimeout(() => { this._selectorMesesProtegido = false; }, 4000);
        this._reiniciarInactividadSelector();
        $('calendario-grilla').style.display = 'none';
        $('calendario-nav-botones').style.display = 'none';
        selector.style.display = 'grid';
        $('calendario-titulo').textContent = '‹ Volver';
    }

    _pintarTitulo() {
        $('calendario-titulo').textContent = `${MESES[this.visible.mes]} ${this.visible.anio}`;
    }

    // ── Popup flotante en escritorio ─────────────────────────
    _cerrarHoverPopup() {
        clearTimeout(this._hoverTimer);
        clearTimeout(this._leaveTimer);
        if (this._hoverPopup) {
            this._hoverPopup.cerrar();
            this._hoverPopup = null;
        }
    }

    _mostrarHoverPopup(diaEl) {
        const fecha = diaEl.dataset.fecha;
        const celda = this._mes?.semanas.flat().find(c => c?.fecha === fecha);
        if (!celda || !celda.facturas.length) return;
        this._cerrarHoverPopup();
        const contenido = html`
            <div class="cal-popup-header">${formatearFecha(fecha)}</div>
            <div class="cal-popup-lista">${celda.facturas.map(({ servicio, factura, clase }) => html`
                <button type="button" class="cal-item" data-servicio="${servicio.id}" data-factura="${factura.id}">
                    <span class="cal-item-punto dia-${clase}" aria-hidden="true"></span>
                    <span class="cal-item-info">
                        <span class="cal-item-nombre">${servicio.nombre}</span>
                        <span class="cal-item-estado">${ETIQUETA_CLASE[clase]}${factura.conCredito ? ' · con crédito' : ''}</span>
                    </span>
                    <span class="cal-item-monto">${formatearMoneda(factura.monto, factura.moneda || 'ars')}</span>
                </button>`)}</div>`;
        const { popup, cerrar } = _crearPopupFlotante({
            className: 'calendario-hover-popup',
            id: 'calendario-hover-popup',
            dataset: { fecha },
            html: contenido,
            event: { currentTarget: diaEl },
            selectorTrigger: '.calendario-dia[data-n]',
            esMismoTrigger: t => t === diaEl,
            alCerrar: () => { if (this._hoverPopup?.popup === popup) this._hoverPopup = null; }
        });
        this._hoverPopup = { popup, cerrar, fecha };
        popup.addEventListener('pointerenter', () => clearTimeout(this._leaveTimer));
        popup.addEventListener('pointerleave', () => {
            this._leaveTimer = setTimeout(() => this._cerrarHoverPopup(), 150);
        });
        popup.addEventListener('click', (e) => {
            const item = e.target.closest('.cal-item');
            if (!item) return;
            this._cerrarHoverPopup();
            this.app.factura.abrirModalLista(item.dataset.servicio, { resaltar: item.dataset.factura });
        });
    }

    // ── Dibujo ───────────────────────────────────────────────
    /** Dibuja el mes visible. Se llama al cambiar de mes y cada vez que cambian los datos. */
    render() {
        const cont = $('calendario-grilla');
        if (!cont) return;
        if (!this._selectorAbierto) this._pintarTitulo();
        if (!this.abierto) return;
        const mes = CalendarioVencimientos.construirMes(EstadoApp.servicios, this.visible);
        this._mes = mes;

        const celdas = mes.semanas.flat();
        const idxHoy = celdas.findIndex(c => c?.esHoy);
        const finSemana = idxHoy === -1 ? -1 : idxHoy - (idxHoy % 7) + 6;
        const semana = idxHoy === -1 ? [] : celdas.map((c, i) => [c, i]).filter(([c, i]) => c && i >= idxHoy - (idxHoy % 7) && i <= finSemana && i % 7 !== 0 && i % 7 !== 6);
        const banda = semana.length ? { fila: 2 + Math.floor(semana[0][1] / 7), desde: 1 + (semana[0][1] % 7), hasta: 1 + (semana[semana.length - 1][1] % 7) } : null;

        montar(cont, html`${DIAS.map(d => html`<div class="calendario-dia-nombre">${d}</div>`)}${celdas.map((c, i) => {
            if (!c) return html`<div class="calendario-dia vacio"></div>`;
            const finde = i % 7 === 0 || i % 7 === 6;
            const clases = ['calendario-dia', c.clase ? `dia-${c.clase}` : 'dia-sin-factura'];
            if (c.esHoy) clases.push('hoy');
            if (!c.clase && finde) clases.push('no-laborable');
            if (c.facturas.length) clases.push('cursor-pointer');
            return html`<div class="${clases.join(' ')}" data-fecha="${c.fecha}" ${c.facturas.length ? html`role="button" tabindex="0" data-n="${c.facturas.length}" aria-label="${c.dia}: ${c.facturas.length === 1 ? '1 factura' : `${c.facturas.length} facturas`}"` : ''}><span class="calendario-dia-num">${c.dia}</span></div>`;
        })}${banda ? html`<div class="calendario-semana-actual" aria-hidden="true" data-fila="${banda.fila}" data-desde="${banda.desde}" data-hasta="${banda.hasta}"></div>` : ''}`);
        // La CSP no admite style en línea: la posición de la banda se asigna por JS (CSSOM)
        cont.querySelectorAll('.calendario-semana-actual').forEach(b => {
            b.style.gridArea = `${b.dataset.fila} / ${b.dataset.desde} / ${Number(b.dataset.fila) + 1} / ${Number(b.dataset.hasta) + 1}`;
        });

        const r = mes.resumen;
        montar($('calendario-resumen'), r.facturas === 0
            ? html`<span class="text-muted">Sin facturas este mes</span>`
            : html`<span><strong>${r.facturas}</strong> ${r.facturas === 1 ? 'factura' : 'facturas'} · pendiente <strong>${importes(r.pendiente)}</strong>${r.vencidas > 0 ? html` · <span class="cal-alerta">${r.vencidas} ${r.vencidas === 1 ? 'vencida' : 'vencidas'}</span>` : ''}</span>`);
    }

    /** Pop escalonado de los días con facturas (solo transform y opacidad). Se llama una vez al abrir la tarjeta. */
    animarEntrada() {
        const grilla = $('calendario-grilla');
        if (!grilla || Motion.reducido() || !grilla.offsetParent || this._selectorAbierto) return;
        const dias = [...grilla.querySelectorAll('.calendario-dia[data-n]')];
        if (!dias.length) return;
        const paso = Math.min(ENTRADA_PASO_MS, Math.floor(ENTRADA_TOTAL_MAX_MS / dias.length));
        grilla.style.setProperty('--cal-n', String(dias.length));
        grilla.style.setProperty('--cal-paso', `${paso}ms`);
        dias.forEach((d, i) => { d.style.setProperty('--i', String(i)); d.classList.add('cal-entrada'); });
        grilla.querySelector('.calendario-dia.hoy:not([data-n])')?.classList.add('cal-entrada-remate');
        const total = Anim.getCSSdur('--dur-cal-espera') + dias.length * paso + Anim.getCSSdur('--dur-cal-entrada') + Anim.getCSSdur('--dur-anim') + 100;
        setTimeout(() => {
            grilla.style.removeProperty('--cal-n');
            grilla.style.removeProperty('--cal-paso');
            grilla.querySelectorAll('.cal-entrada, .cal-entrada-remate').forEach(c => c.classList.remove('cal-entrada', 'cal-entrada-remate'));
        }, total);
    }

    /** Abre el detalle de un día. */
    abrirDia(fecha) {
        this._cerrarHoverPopup();
        const celda = this._mes?.semanas.flat().find(c => c?.fecha === fecha);
        if (!celda || !celda.facturas.length) return;
        $('calendario-dia-titulo').textContent = formatearFecha(fecha);
        montar($('calendario-dia-lista'), html`${celda.facturas.map(({ servicio, factura, clase }) => html`
            <button type="button" class="cal-item" data-servicio="${servicio.id}" data-factura="${factura.id}">
                <span class="cal-item-punto dia-${clase}" aria-hidden="true"></span>
                <span class="cal-item-info">
                    <span class="cal-item-nombre">${servicio.nombre}</span>
                    <span class="cal-item-estado">${ETIQUETA_CLASE[clase]}${factura.conCredito ? ' · con crédito' : ''}</span>
                </span>
                <span class="cal-item-monto">${formatearMoneda(factura.monto, factura.moneda || 'ars')}</span>
            </button>`)}`);
        this.app.ui.abrirModal('modal-calendario-dia');
    }

    /** Desde el detalle del día: abre las facturas del servicio resaltando la elegida. */
    abrirFactura(servicioId, facturaId) {
        this.app.ui.cerrarModal('modal-calendario-dia');
        this.app.factura.abrirModalLista(servicioId, { resaltar: facturaId });
    }

    bindEventos() {
        $('calendario-header').addEventListener('click', () => this.toggle());
        $('calendario-anterior').addEventListener('click', () => this.navegar(-1));
        $('calendario-siguiente').addEventListener('click', () => this.navegar(1));
        $('calendario-hoy').addEventListener('click', () => this.irAHoy());
        $('calendario-titulo').addEventListener('click', () => this._abrirSelector());
        const selectorMeses = $('calendario-selector-meses');
        ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(ev => {
            selectorMeses.addEventListener(ev, () => this._reiniciarInactividadSelector(), { passive: true });
        });
        selectorMeses.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-mes-calendario');
            if (!btn) return;
            e.stopPropagation();
            const destino = { anio: Number(btn.dataset.anio), mes: Number(btn.dataset.mes) };
            const esMismoMes = destino.anio === this.visible.anio && destino.mes === this.visible.mes;
            if (esMismoMes && this._selectorMesesProtegido) {
                this._selectorMesesProtegido = false;
                return;
            }
            this._cerrarSelector();
            this.visible = destino;
            this.render();
        });
        const abrir = (e) => {
            const dia = e.target.closest('.calendario-dia[data-n]');
            if (dia) this.abrirDia(dia.dataset.fecha);
        };
        const grilla = $('calendario-grilla');
        grilla.addEventListener('click', abrir);
        grilla.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } });
        grilla.addEventListener('wheel', (e) => {
            if (!e.altKey && !Preferencias.RUEDA_CALENDARIO.get()) return;
            if (e.deltaY === 0) return;
            e.preventDefault();
            this.navegar(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });
        grilla.addEventListener('pointerover', (e) => {
            if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
            if (!Preferencias.HOVER_POPUP.get()) return;
            const dia = e.target.closest('.calendario-dia[data-n]');
            if (!dia) return;
            clearTimeout(this._leaveTimer);
            if (this._hoverPopup?.fecha === dia.dataset.fecha) return;
            clearTimeout(this._hoverTimer);
            this._hoverTimer = setTimeout(() => this._mostrarHoverPopup(dia), 160);
        });
        grilla.addEventListener('pointerout', (e) => {
            const dia = e.target.closest('.calendario-dia[data-n]');
            if (!dia || dia.contains(e.relatedTarget)) return;
            clearTimeout(this._hoverTimer);
            this._leaveTimer = setTimeout(() => this._cerrarHoverPopup(), 150);
        });
        registrarSwipe(grilla.parentNode, dir => this.navegar(dir));
        $('calendario-dia-lista').addEventListener('click', (e) => {
            const item = e.target.closest('.cal-item');
            if (item) this.abrirFactura(item.dataset.servicio, item.dataset.factura);
        });
        $('modal-calendario-dia-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-calendario-dia'));
    }
}

