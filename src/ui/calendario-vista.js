import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { html, montar } from '../core/html.js';
import { formatearMoneda, formatearFecha } from '../core/formato.js';
import { CalendarioVencimientos } from '../services/calendario-vencimientos.js';
import { EstadoApp } from '../services/estado-app.js';
import { Anim } from './animaciones.js';

// ============================================================
// CALENDARIO — vista mensual de vencimientos: cada día con el color de su factura más urgente
// ============================================================
const $ = id => document.getElementById(id);
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const ETIQUETA_CLASE = { vencido: 'Vencida', urgente: 'Vence pronto', proximo: 'Próxima', lejano: 'Pendiente', pagado: 'Pagada', favor: 'Saldo a favor' };

const importes = par => [par.ars !== 0 ? formatearMoneda(par.ars, 'ars') : '', par.usd !== 0 ? formatearMoneda(par.usd, 'usd') : ''].filter(Boolean).join(' · ') || '—';

export class CalendarioVista {
    constructor(app) {
        this.app = app;
        const hoy = new Date();
        this.visible = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
        this.abierto = false;
        this._mes = null;
    }

    init() {
        this.abierto = StorageHelper.getBoolean(STORAGE_KEYS.CALENDARIO_ABIERTO, false);
        $('calendario-content').classList.toggle('collapsed', !this.abierto);
        $('calendario-chevron').classList.toggle('collapsed', !this.abierto);
        this.render();
    }

    toggle() {
        this.abierto = !this.abierto;
        StorageHelper.setItem(STORAGE_KEYS.CALENDARIO_ABIERTO, this.abierto);
        $('calendario-content').classList.toggle('collapsed', !this.abierto);
        $('calendario-chevron').classList.toggle('collapsed', !this.abierto);
        if (this.abierto) {
            this.render();
            Anim.scrollAlExpandir($('calendario-content').closest('.card'));
        }
    }

    cambiarMes(delta) {
        this.visible = CalendarioVencimientos.desplazarMes(this.visible, delta);
        this.render();
    }

    irAHoy() {
        const hoy = new Date();
        this.visible = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
        this.render();
    }

    /** Dibuja el mes visible. Se llama al cambiar de mes y cada vez que cambian los datos. */
    render() {
        const cont = $('calendario-grilla');
        if (!cont || !this.abierto) return;
        const mes = CalendarioVencimientos.construirMes(EstadoApp.servicios, this.visible);
        this._mes = mes;
        const titulo = new Date(mes.anio, mes.mes, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        $('calendario-titulo').textContent = titulo;

        montar(cont, html`
            <div class="cal-semana cal-semana--cabecera" aria-hidden="true">${DIAS.map(d => html`<span class="cal-cabecera">${d}</span>`)}</div>
            ${mes.semanas.map(semana => html`
            <div class="cal-semana" role="row">${semana.map(c => c
                ? html`<button type="button" class="cal-dia${c.clase ? ` cal-dia--${c.clase}` : ''}${c.esHoy ? ' cal-dia--hoy' : ''}" data-fecha="${c.fecha}"
                        aria-label="${c.dia}: ${c.facturas.length === 1 ? '1 factura' : `${c.facturas.length} facturas`}${c.esHoy ? ' (hoy)' : ''}">
                        <span class="cal-dia-numero">${c.dia}</span>${c.facturas.length > 1 ? html`<span class="cal-dia-cantidad">${c.facturas.length}</span>` : ''}
                    </button>`
                : html`<span class="cal-vacio"></span>`)}</div>`)}`);

        const r = mes.resumen;
        montar($('calendario-resumen'), r.facturas === 0
            ? html`<span class="text-muted">Sin facturas este mes</span>`
            : html`<span><strong>${r.facturas}</strong> ${r.facturas === 1 ? 'factura' : 'facturas'} · pendiente <strong>${importes(r.pendiente)}</strong>${r.vencidas > 0 ? html` · <span class="cal-alerta">${r.vencidas} ${r.vencidas === 1 ? 'vencida' : 'vencidas'}</span>` : ''}</span>`);
    }

    /** Abre el detalle de un día. */
    abrirDia(fecha) {
        const celda = this._mes?.semanas.flat().find(c => c?.fecha === fecha);
        if (!celda) return;
        $('calendario-dia-titulo').textContent = formatearFecha(fecha);
        const lista = $('calendario-dia-lista');
        montar(lista, celda.facturas.length === 0
            ? html`<p class="text-muted text-center-muted">No hay facturas que venzan este día</p>`
            : html`${celda.facturas.map(({ servicio, factura, clase }) => html`
                <button type="button" class="cal-item" data-servicio="${servicio.id}" data-factura="${factura.id}">
                    <span class="cal-item-punto cal-dia--${clase}" aria-hidden="true"></span>
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
        $('calendario-anterior').addEventListener('click', () => this.cambiarMes(-1));
        $('calendario-siguiente').addEventListener('click', () => this.cambiarMes(1));
        $('calendario-titulo').addEventListener('click', () => this.irAHoy());
        $('calendario-grilla').addEventListener('click', (e) => {
            const dia = e.target.closest('.cal-dia');
            if (dia) this.abrirDia(dia.dataset.fecha);
        });
        $('calendario-dia-lista').addEventListener('click', (e) => {
            const item = e.target.closest('.cal-item');
            if (item) this.abrirFactura(item.dataset.servicio, item.dataset.factura);
        });
        $('modal-calendario-dia-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-calendario-dia'));
    }
}
