import { EstadoApp } from '../services/estado-app.js';
import { BackNav } from './gestor-modales.js';
import { $ } from '../core/dom.js';

// ============================================================
// CONTEXT MENU SERVICE — menú contextual de servicios
// ============================================================
export class ContextMenuService {
    constructor(app) {
        this.app = app;
    }

    init() {
        const menu = $('ctx-menu-servicio');

        document.addEventListener('pointerdown', (e) => {
            if (!menu.contains(e.target)) this.cerrar();
        }, true);

        document.addEventListener('scroll', () => this.cerrar(), true);

        $('ctx-seleccionar').addEventListener('click', () => {
            const id = this.app._ctxServicioId;
            this.cerrar();
            if (this.app.modoCalculadora) {
                this.app.calculador.desactivarModo(true);
            } else {
                this.seleccionar(id);
            }
        });

        $('ctx-copiar-monto').addEventListener('click', () => {
            this.copiarMonto();
            this.cerrar();
        });

        $('ctx-pagar-factura').addEventListener('click', () => {
            this.pagarFactura();
            this.cerrar();
        });
    }

    abrir(e, servicioId) {
        e.preventDefault();
        if (this.app._lpFired) { this.app._lpFired = false; return; }
        this.app._ctxServicioId = servicioId;

        const estaSeleccionado = this.app.serviciosSeleccionados.has(servicioId);

        const btnSeleccionar = $('ctx-seleccionar');
        btnSeleccionar.childNodes[btnSeleccionar.childNodes.length - 1].textContent =
            this.app.modoCalculadora ? ' Cancelar selección' : ' Seleccionar';

        const btnCopiar = $('ctx-copiar-monto');
        btnCopiar.childNodes[btnCopiar.childNodes.length - 1].textContent =
            (estaSeleccionado && this.app.serviciosSeleccionados.size > 1) ? ' Copiar total' : ' Copiar monto';

        const btnPagar = $('ctx-pagar-factura');
        const btnPagarText = btnPagar.childNodes[btnPagar.childNodes.length - 1];
        if (estaSeleccionado && this.app.serviciosSeleccionados.size > 1) {
            const hayPagables = [...this.app.serviciosSeleccionados].some(id => {
                const f = this.app.vista.obtenerUltimaFactura(id);
                return f && !f.pagada && !f.conCredito;
            });
            btnPagar.disabled = !hayPagables;
            btnPagarText.textContent = ` Pagar ${this.app.serviciosSeleccionados.size} seleccionados`;
        } else {
            const factura = this.app.vista.obtenerUltimaFactura(servicioId);
            btnPagar.disabled = !factura || factura.pagada || !!factura.conCredito;
            btnPagarText.textContent = ' Pagar factura del mes';
        }

        const menu = $('ctx-menu-servicio');
        const margen = 8;
        let x = e.clientX, y = e.clientY;

        menu.style.setProperty('--ctx-x', '0px');
        menu.style.setProperty('--ctx-y', '0px');
        menu.classList.add('active');

        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        if (x + mw + margen > window.innerWidth) x = window.innerWidth - mw - margen;
        if (y + mh + margen > window.innerHeight) y = window.innerHeight - mh - margen;

        menu.style.setProperty('--ctx-x', `${x}px`);
        menu.style.setProperty('--ctx-y', `${y}px`);

        BackNav.abrir('ctx-menu-servicio', () => this.cerrar());
    }

    cerrar() {
        const menu = $('ctx-menu-servicio');
        const estabaAbierto = menu.classList.contains('active');
        menu.classList.remove('active');
        this.app._ctxServicioId = null;
        if (estabaAbierto) BackNav.cerrar('ctx-menu-servicio');
    }

    seleccionar(servicioId) {
        if (!this.app.modoCalculadora) {
            this.app.calculador.activarModo(true);
            this.app.serviciosSeleccionados.add(servicioId);
            this.app.calculador.actualizar();
            this.app.vista.renderServicios();
            return;
        }
        if (this.app.serviciosSeleccionados.has(servicioId)) {
            this.app.serviciosSeleccionados.delete(servicioId);
            if (this.app.serviciosSeleccionados.size === 0) {
                this.app.calculador.desactivarModo(true);
                return;
            }
        } else {
            this.app.serviciosSeleccionados.add(servicioId);
        }
        this.app.calculador.actualizar();
        this.app.vista.renderServicios();
    }

    copiarMonto() {
        const estaSeleccionado = this.app.serviciosSeleccionados.has(this.app._ctxServicioId);
        const ids = (estaSeleccionado && this.app.serviciosSeleccionados.size > 1)
            ? [...this.app.serviciosSeleccionados]
            : [this.app._ctxServicioId];

        let totalARS = 0, totalUSD = 0;
        ids.forEach(id => {
            const f = this.app.vista.obtenerUltimaFactura(id);
            if (!f) return;
            if ((f.moneda || 'ars') === 'usd') totalUSD += f.monto;
            else totalARS += f.monto;
        });

        const partes = [];
        if (totalARS > 0) partes.push(this.app.utils.formatearMoneda(totalARS, 'ars'));
        if (totalUSD > 0) partes.push(this.app.utils.formatearMoneda(totalUSD, 'usd'));
        if (partes.length === 0) { this.app.ui.mostrarToast('Sin factura del mes', 'info'); return; }

        const texto = partes.join(' + ');
        navigator.clipboard?.writeText(texto)
            .then(() => this.app.ui.mostrarToast(`Copiado: ${texto}`, 'success'))
            .catch(() => this.app.ui.mostrarToast('No se pudo copiar', 'error'));
    }

    pagarFactura() {
        const estaSeleccionado = this.app.serviciosSeleccionados.has(this.app._ctxServicioId);
        const ids = (estaSeleccionado && this.app.serviciosSeleccionados.size > 1)
            ? [...this.app.serviciosSeleccionados]
            : [this.app._ctxServicioId];

        const hoy = this.app.utils.obtenerFechaLocal();
        let pagadas = 0;
        let ultimoNombre = '';

        ids.forEach(id => {
            const servicio = EstadoApp.servicios.find(s => s.id === id);
            const factura = this.app.vista.obtenerUltimaFactura(id);
            if (!servicio || !factura || factura.pagada || factura.conCredito) return;
            const idx = servicio.facturas.findIndex(f => f.id === factura.id);
            if (idx === -1) return;
            servicio.facturas[idx] = { ...servicio.facturas[idx], pagada: true, fechaPago: hoy };
            ultimoNombre = servicio.nombre;
            pagadas++;
        });

        if (pagadas === 0) return;
        this.app.utils.postGuardado(pagadas === 1 ? `pagar factura (${ultimoNombre})` : `pagar ${pagadas} facturas`);
        if (estaSeleccionado && this.app.serviciosSeleccionados.size > 1) {
            this.app.calculador.desactivarModo(true);
        }
        this.app.toastConDeshacer(pagadas === 1 ? 'Factura pagada ✓' : `${pagadas} facturas pagadas ✓`);
    }
}
