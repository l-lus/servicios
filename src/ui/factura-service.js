import { restaFechas } from '../core/fechas.js';
import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { ModalManager } from './gestor-modales.js';
import { $, formulario } from '../core/dom.js';

// ============================================================
// FACTURA SERVICE — ciclo de vida de facturas
// ============================================================
export class FacturaService {
    constructor(app) {
        this.app = app;
    }

    get servicios() { return EstadoApp.servicios; }

    // ── Validaciones ──────────────────────────────────────────
    validarMonto(monto, permitirNegativos = false) {
        if (!monto && monto !== 0 || isNaN(monto)) {
            this.app.ui.mostrarToast('El monto debe ser un número válido', 'error'); return false;
        }
        if (!permitirNegativos && monto < 0) {
            this.app.ui.mostrarToast('El monto debe ser positivo', 'error'); return false;
        }
        if (Math.abs(monto) > 99999999) {
            this.app.ui.mostrarToast('El monto es demasiado grande', 'error'); return false;
        }
        return true;
    }

    validarFecha(fecha) {
        if (!fecha) { this.app.ui.mostrarToast('La fecha es requerida', 'error'); return false; }
        const fechaIngresada = this.app.utils.parseDate(fecha);
        const diferenciaAnios = restaFechas(fechaIngresada, new Date()) / (1000 * 60 * 60 * 24 * 365.25);
        if (diferenciaAnios > 2) {
            this.app.ui.mostrarToast('La fecha no puede ser mayor a 2 años en el futuro', 'error'); return false;
        }
        return true;
    }

    validarFechaPago(fechaPago) {
        if (!fechaPago) {
            this.app.ui.mostrarToast('La fecha de pago es requerida cuando se marca como pagada', 'error'); return false;
        }
        const fp = this.app.utils.parseDate(fechaPago);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0); fp.setHours(0, 0, 0, 0);
        if (fp > hoy) {
            this.app.ui.mostrarToast('La fecha de pago no puede ser en el futuro', 'error'); return false;
        }
        return true;
    }

    // ── Helpers de grupo por año ──────────────────────────────
    agruparPorAno(items) {
        const porAno = {};
        items.forEach(item => {
            const ano = this.app.utils.parseDate(item.fecha).getFullYear();
            if (!porAno[ano]) porAno[ano] = [];
            porAno[ano].push(item);
        });
        return Object.keys(porAno).sort((a, b) => Number(b) - Number(a))
            .map(ano => ({ ano, items: porAno[ano], cantidad: porAno[ano].length }));
    }

    generarGrupoAno(ano, items, itemHTML, tipoLabel = 'factura', index = 0) {
        const collapsed = index > 0 ? 'collapsed' : '';
        const cantidad = items.length;
        const labelPlural = cantidad !== 1 ? `${tipoLabel}s` : tipoLabel;
        return html`
    <div class="facturas-grupo-ano">
        <div class="facturas-grupo-header" data-action="toggle-grupo-ano">
            <div class="facturas-grupo-header-info">
                <span class="facturas-grupo-ano-texto">${ano}</span>
                <span class="facturas-grupo-contador">${cantidad} ${labelPlural}</span>
            </div>
            <svg class="icon facturas-grupo-chevron ${collapsed}"><use href="#icon-chevron-down" /></svg>
        </div>
        <div class="facturas-grupo-contenido ${collapsed}"><div class="collapsible-inner">${itemHTML}</div></div>
    </div>`;
    }

    // ── Modal lista facturas ──────────────────────────────────
    abrirModalLista(servicioId, { resaltar = null } = {}) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const lista     = $('lista-facturas-modal');
        const titulo    = $('modal-facturas-titulo');
        const btnBorrar = $('btn-borrar-facturas-servicio');
        titulo.textContent = servicio.nombre;
        this.app.servicioActual = servicioId;
        $('modal-facturas-servicio').dataset.servicioId = servicioId;
        if (btnBorrar) btnBorrar.style.display = servicio.facturas.length > 0 ? '' : 'none';
        if (servicio.facturas.length === 0) {
            montar(lista, html`<div class="empty-state"><p>No hay facturas registradas</p></div>`);
        } else {
            const ordenadas = [...servicio.facturas].sort((a, b) => restaFechas(b.fecha, a.fecha));
            const grupos = this.agruparPorAno(ordenadas);
            montar(lista, html`${grupos.map((grupo, index) => {
                const itemsHTML = grupo.items.map(f => this.app.vista.generarHTMLFactura(f, 'editar-factura'));
                return this.generarGrupoAno(grupo.ano, grupo.items, itemsHTML, 'factura', index);
            })}`);
        }
        this.app.ui.abrirModal('modal-facturas-servicio');
        const anoGuardado = this.app._anoExpandidoFacturas[servicioId];
        if (anoGuardado) { this.app.vista._restaurarAnoExpandido(anoGuardado); this.app._anoExpandidoFacturas[servicioId] = null; }
        this.app.vista._resaltarItemLista(lista, resaltar);
    }

    async borrarTodas() {
        if (!this.app.servicioActual) return;
        const servicio = this.servicios.find(s => s.id === this.app.servicioActual);
        if (!servicio) return;
        const total = servicio.facturas?.length || 0;
        if (total === 0) { this.app.ui.mostrarToast('No hay facturas para borrar', 'info'); return; }
        const confirmado = await ModalManager.confirmar(
            `¿Borrar las ${total} factura${total !== 1 ? 's' : ''} de "${servicio.nombre}"?`,
            'Borrar',
            '#icon-trash',
            { titulo: 'Borrar facturas' }
        );
        if (confirmado) {
            servicio.facturas = [];
            this.app.storage.guardarDatos();
            this.app.guardarEstado(`borrar facturas (${servicio.nombre})`);
            this.app.vista.renderServicios();
            this.app.toastConDeshacer(`${total} factura${total !== 1 ? 's' : ''} eliminada${total !== 1 ? 's' : ''}`);
        }
    }

    // ── Modal agregar/editar ──────────────────────────────────
    abrirModal(servicioId, facturaId = null, origen = 'servicio') {
        this.app.ui.cerrarModal('modal-facturas-servicio');
        this.app.servicioActual = servicioId;
        this.app.facturaActual  = facturaId;
        const ids     = this.app.utils.idsFormFactura(!!facturaId);
        const servicio = this.servicios.find(s => s.id === servicioId);

        // Opciones de servicio (para ambos modales)
        const optsServicios = this.servicios
            .filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        const optsHTML = html`${optsServicios.map(s =>
            html`<option value="${s.id}" ${s.id === servicioId ? 'selected' : ''}>${s.nombre}</option>`
        )}`;

        if (facturaId) {
            const factura = servicio?.facturas.find(f => f.id === facturaId);
            if (!factura) return;
            this.app.origenModalFactura = origen;
            
            // Quitamos Math.abs para que muestre el signo -
            $(ids.monto).value = String(factura.monto); 
            $(ids.tipo).value  = factura.tipo || 'mensual';
            $(ids.fecha).value = factura.fecha;
            this.app.utils.setMonedaBtn(ids.moneda, ids.btnMoneda, factura.moneda || 'ars');
            
            const btnNeg = $(ids.btnNegativo);
            const inputMonto = $(ids.monto);
            if (btnNeg) {
                const esNeg = factura.monto < 0;
                btnNeg.classList.toggle('activo', esNeg);
                if (inputMonto) inputMonto.dataset.negativo = esNeg ? 'true' : 'false';
            }
            
            const btnPagada = $(ids.btnPagada);
            if (factura.pagada || factura.conCredito) {
                btnPagada.classList.add('pagada');
                btnPagada.querySelector('use')?.setAttribute('href', '#icon-cancel');
                const fpInput = $(ids.fechaPago);
                fpInput.disabled = false; fpInput.value = factura.fechaPago || '';
                const btnCred = $(ids.btnCredito);
                if (btnCred) btnCred.classList.add('btn-credito-visible');
                if (factura.conCredito) {
                    $(ids.conCredito).value = 'true';
                    if (btnCred) { btnCred.classList.add('pagada'); btnCred.querySelector('use')?.setAttribute('href', '#icon-card'); }
                } else {
                    $(ids.conCredito).value = 'false';
                    this._resetBtnCredito(btnCred);
                }
            } else {
                btnPagada.classList.remove('pagada');
                btnPagada.querySelector('use')?.setAttribute('href', '#icon-card');
                $(ids.fechaPago).disabled = true;
                $(ids.fechaPago).value = '';
                const btnCred = $(ids.btnCredito);
                const inputCred = $(ids.conCredito);
                if (inputCred) inputCred.value = 'false';
                if (btnCred) btnCred.classList.remove('btn-credito-visible');
                this._resetBtnCredito(btnCred);
            }
            // Poblar select de servicios en modal editar
            const selEdit = $(ids.servicio);
            if (selEdit) montar(selEdit, optsHTML);
            // Refrescar CustomSelects del modal editar-factura
            const csdSvcEdit = $('editar-factura-servicio-csd');
            if (csdSvcEdit?._customSelect) csdSvcEdit._customSelect.refresh();
            const csdTipoEdit = $('editar-factura-tipo-csd');
            if (csdTipoEdit?._customSelect) csdTipoEdit._customSelect.refresh();
            this.app.ui.abrirModal('modal-editar-factura');
        } else {
            // Poblar select ANTES de reset para que reset no lo borre
            const selectSvc = $('factura-servicio');
            if (selectSvc) montar(selectSvc, optsHTML);
            formulario('form-factura').reset();
            // Restaurar valores que reset borró
            if (selectSvc) montar(selectSvc, optsHTML);
            this.app.utils.setMonedaBtn('factura-moneda', 'btn-factura-moneda', 'ars');
            $('factura-fecha').value = this.app.utils.obtenerFechaLocal();
            $('btn-toggle-pagada').classList.remove('pagada');
            $('factura-fecha-pago').disabled = true;
            $('factura-fecha-pago').value = '';
            this._resetBtnCredito($('btn-toggle-credito'));
            // Refrescar CustomSelects del modal nueva factura
            const csdSvcNueva = $('factura-servicio-csd');
            if (csdSvcNueva?._customSelect) csdSvcNueva._customSelect.refresh();
            const csdTipoNueva = $('factura-tipo-csd');
            if (csdTipoNueva?._customSelect) csdTipoNueva._customSelect.refresh();
            this.app.origenModalFactura = origen;
            if (origen === 'menu') this.app.ui.cerrarMenuAgregar();
            this.app.ui.abrirModal('modal-agregar-factura');
        }
    }

    // ── Toggles ───────────────────────────────────────────────
    _resetBtnCredito(btn) {
        if (!btn) return;
        btn.querySelector('use')?.setAttribute('href', '#icon-cash');
        btn.classList.remove('pagada'); btn.title = 'Contado / crédito';
    }

    toggleConCredito(modo = '') {
        const esEditar = modo === 'editar';
        const ids   = this.app.utils.idsFormFactura(esEditar);
        const btn   = $(ids.btnCredito);
        const input = $(ids.conCredito);
        const use   = /** @type {SVGUseElement} */ (btn.querySelector('use'));
        const esCredito = input.value === 'true';
        if (esCredito) {
            input.value = 'false'; use.setAttribute('href', '#icon-cash');
            btn.classList.remove('pagada'); btn.title = 'Pagada al contado';
            this.app.ui.mostrarToast('Pagada al contado', 'info');
        } else {
            input.value = 'true'; use.setAttribute('href', '#icon-card');
            btn.classList.add('pagada'); btn.title = 'Pagada con crédito';
            this.app.ui.mostrarToast('Pagada con crédito', 'info');
        }
    }

    toggleEstadoPago(btnId = 'btn-toggle-pagada', inputId = 'factura-fecha-pago') {
        const btn        = $(btnId);
        const fpInput    = $(inputId);
        const use        = /** @type {SVGUseElement} */ (btn.querySelector('use'));
        const estaPagada = btn.classList.contains('pagada');
        const esEditar   = btnId === 'btn-editar-toggle-pagada';
        const btnCred    = $(esEditar ? 'btn-editar-toggle-credito'  : 'btn-toggle-credito');
        const inputCred  = $(esEditar ? 'editar-factura-con-credito' : 'factura-con-credito');
        if (estaPagada) {
            btn.classList.remove('pagada'); fpInput.disabled = true; fpInput.value = '';
            use.setAttribute('href', '#icon-card');
            if (btnCred)   btnCred.classList.remove('btn-credito-visible');
            if (inputCred) inputCred.value = 'false';
            this._resetBtnCredito(btnCred);
            this.app.ui.mostrarToast('Factura pendiente', 'info');
        } else {
            btn.classList.add('pagada'); fpInput.disabled = false;
            fpInput.value = this.app.utils.obtenerFechaLocal();
            use.setAttribute('href', '#icon-cancel');
            if (btnCred) btnCred.classList.add('btn-credito-visible');
            this.app.ui.mostrarToast('Factura pagada', 'success');
        }
    }

    toggleMontoNegativo(inputId) {
        const input = $(inputId);
        const btnId = inputId === 'factura-monto' ? 'btn-toggle-negativo' : 'btn-editar-toggle-negativo';
        const btn   = $(btnId);
        if (!input || !btn) return;
        
        const nuevoNegativo = input.dataset.negativo !== 'true';
        input.dataset.negativo = nuevoNegativo ? 'true' : 'false';
        btn.classList.toggle('activo', nuevoNegativo);
        btn.title = nuevoNegativo ? 'Cambiar a gasto normal' : 'Cambiar a saldo a favor';

        const valorActual = parseFloat(input.value) || 0;
        if (valorActual !== 0) {
            input.value = String(nuevoNegativo ? -Math.abs(valorActual) : Math.abs(valorActual));
        }
    }

    establecerFechaHoy(tipo = 'factura', modo = 'agregar') {
        const id    = modo === 'editar' ? `editar-${tipo}-fecha` : `${tipo}-fecha`;
        const input = $(id);
        if (input) input.value = input.value ? '' : this.app.utils.obtenerFechaLocal();
    }

    // ── Guardar ───────────────────────────────────────────────
    guardar(e) {
        e.preventDefault();
        const esEditar   = $('modal-editar-factura').classList.contains('active');
        const ids        = this.app.utils.idsFormFactura(esEditar);
        const montoRaw   = parseFloat($(ids.monto).value);
        const tipo       = $(ids.tipo).value;
        const fecha      = $(ids.fecha).value;
        const moneda     = $(ids.moneda).value;
        const btnPagada  = $(ids.btnPagada);
        const estaPagada = btnPagada.classList.contains('pagada');
        const fechaPago  = estaPagada ? $(ids.fechaPago).value : null;
        const conCredito = estaPagada ? ($(ids.conCredito)?.value === 'true') : false;
        const btnNeg     = $(ids.btnNegativo);
        const esNegativo = btnNeg?.classList.contains('activo') || $(ids.monto).dataset.negativo === 'true';
        const monto      = esNegativo ? -Math.abs(montoRaw) : Math.abs(montoRaw);
        const servicioSelId = $(ids.servicio)?.value || this.app.servicioActual;

        if (!this.validarMonto(montoRaw, true)) return;
        if (!this.validarFecha(fecha)) return;
        if (estaPagada && !conCredito && !this.validarFechaPago(fechaPago)) return;

        const servicio = this.servicios.find(s => s.id === servicioSelId);
        if (!servicio) { this.app.ui.mostrarToast('Servicio no encontrado', 'error'); return; }

        let facturaId = esEditar ? this.app.facturaActual : null;
        if (esEditar) {
            const factura = servicio.facturas.find(f => f.id === this.app.facturaActual);
            if (!factura) return;
            if (factura.monto === monto && factura.tipo === tipo && factura.fecha === fecha &&
                factura.pagada === estaPagada && factura.fechaPago === fechaPago &&
                (factura.moneda || 'ars') === moneda) {
                this.app.ui.mostrarToast('Sin cambios', 'info');
                this.app.ui.cerrarModal('modal-editar-factura');
                this.abrirModalLista(servicioSelId); return;
            }
            Object.assign(factura, { monto, tipo, fecha, moneda, pagada: estaPagada, fechaPago: estaPagada ? fechaPago : null, conCredito });
        } else {
            facturaId = this.app.utils.generarId();
            servicio.facturas.push({ id: facturaId, monto, tipo, fecha, moneda, pagada: estaPagada, fechaPago: estaPagada ? fechaPago : null, conCredito });
        }
        this.app.utils.postGuardado(`${esEditar ? 'editar' : 'agregar'} factura (${servicio.nombre})`);
        this.app.ui.cerrarModal(esEditar ? 'modal-editar-factura' : 'modal-agregar-factura');
        this.abrirModalLista(servicioSelId, { resaltar: facturaId });
        this.app.ui.mostrarToast(esEditar ? 'Factura actualizada' : 'Factura agregada', 'success');
    }

    // ── Eliminar ──────────────────────────────────────────────
    eliminar() {
        if (!this.app.facturaActual) return;
        const servicio = this.servicios.find(s => s.id === this.app.servicioActual);
        if (!servicio) return;
        servicio.facturas = servicio.facturas.filter(f => f.id !== this.app.facturaActual);
        this.app.storage.guardarDatos();
        this.app.guardarEstado(`eliminar factura (${servicio.nombre})`);
        this.app.vista.renderServicios();
        this.app.ui.cerrarModal('modal-editar-factura');
        this.app.toastConDeshacer('Factura eliminada');
    }
}
