import { ModalManager } from './gestor-modales.js';

// ============================================================
// FACTURA SERVICE — ciclo de vida de facturas
// ============================================================
export class FacturaService {
    constructor(app) {
        this.app = app;
    }

    get servicios() { return this.app.servicios; }

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
        const diferenciaAnios = (fechaIngresada - new Date()) / (1000 * 60 * 60 * 24 * 365.25);
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
        return Object.keys(porAno).sort((a, b) => b - a)
            .map(ano => ({ ano, items: porAno[ano], cantidad: porAno[ano].length }));
    }

    generarGrupoAno(ano, items, itemHTML, tipoLabel = 'factura', index = 0) {
        const collapsed = index > 0 ? 'collapsed' : '';
        const cantidad = items.length;
        const labelPlural = cantidad !== 1 ? `${tipoLabel}s` : tipoLabel;
        return `
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
        const lista     = document.getElementById('lista-facturas-modal');
        const titulo    = document.getElementById('modal-facturas-titulo');
        const btnBorrar = document.getElementById('btn-borrar-facturas-servicio');
        titulo.textContent = servicio.nombre;
        this.app.servicioActual = servicioId;
        document.getElementById('modal-facturas-servicio').dataset.servicioId = servicioId;
        if (btnBorrar) btnBorrar.style.display = servicio.facturas.length > 0 ? '' : 'none';
        if (servicio.facturas.length === 0) {
            lista.innerHTML = '<div class="empty-state"><p>No hay facturas registradas</p></div>';
        } else {
            const ordenadas = [...servicio.facturas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            const grupos = this.agruparPorAno(ordenadas);
            lista.innerHTML = grupos.map((grupo, index) => {
                const html = grupo.items.map(f => this.app.generarHTMLFactura(f, 'editar-factura')).join('');
                return this.generarGrupoAno(grupo.ano, grupo.items, html, 'factura', index);
            }).join('');
        }
        this.app.abrirModal('modal-facturas-servicio');
        const anoGuardado = this.app._anoExpandidoFacturas[servicioId];
        if (anoGuardado) { this.app._restaurarAnoExpandido(anoGuardado); this.app._anoExpandidoFacturas[servicioId] = null; }
        this.app._resaltarItemLista(lista, resaltar);
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
            this.app.guardarDatos();
            this.app.guardarEstado(`borrar facturas (${servicio.nombre})`);
            this.app.renderServicios();
            this.app.toastConDeshacer(`${total} factura${total !== 1 ? 's' : ''} eliminada${total !== 1 ? 's' : ''}`);
        }
    }

    // ── Modal agregar/editar ──────────────────────────────────
    abrirModal(servicioId, facturaId = null, origen = 'servicio') {
        this.app.cerrarModal('modal-facturas-servicio');
        this.app.servicioActual = servicioId;
        this.app.facturaActual  = facturaId;
        const ids     = this.app.utils.idsFormFactura(!!facturaId);
        const servicio = this.servicios.find(s => s.id === servicioId);

        // Opciones de servicio (para ambos modales)
        const optsServicios = this.servicios
            .filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        const optsHTML = optsServicios.map(s =>
            `<option value="${this.app.utils.escaparAtributoHTML(s.id)}" ${s.id === servicioId ? 'selected' : ''}>${this.app.utils.escaparHTML(s.nombre)}</option>`
        ).join('');

        if (facturaId) {
            const factura = servicio?.facturas.find(f => f.id === facturaId);
            if (!factura) return;
            this.app.origenModalFactura = origen;
            
            // Quitamos Math.abs para que muestre el signo -
            document.getElementById(ids.monto).value = factura.monto; 
            document.getElementById(ids.tipo).value  = factura.tipo || 'mensual';
            document.getElementById(ids.fecha).value = factura.fecha;
            this.app.utils.setMonedaBtn(ids.moneda, ids.btnMoneda, factura.moneda || 'ars');
            
            const btnNeg = document.getElementById(ids.btnNegativo);
            const inputMonto = document.getElementById(ids.monto);
            if (btnNeg) {
                const esNeg = factura.monto < 0;
                btnNeg.classList.toggle('activo', esNeg);
                if (inputMonto) inputMonto.dataset.negativo = esNeg ? 'true' : 'false';
            }
            
            const btnPagada = document.getElementById(ids.btnPagada);
            if (factura.pagada || factura.conCredito) {
                btnPagada.classList.add('pagada');
                btnPagada.querySelector('use')?.setAttribute('href', '#icon-cancel');
                const fpInput = document.getElementById(ids.fechaPago);
                fpInput.disabled = false; fpInput.value = factura.fechaPago || '';
                const btnCred = document.getElementById(ids.btnCredito);
                if (btnCred) btnCred.classList.add('btn-credito-visible');
                if (factura.conCredito) {
                    document.getElementById(ids.conCredito).value = 'true';
                    if (btnCred) { btnCred.classList.add('pagada'); btnCred.querySelector('use')?.setAttribute('href', '#icon-card'); }
                } else {
                    document.getElementById(ids.conCredito).value = 'false';
                    this._resetBtnCredito(btnCred);
                }
            } else {
                btnPagada.classList.remove('pagada');
                btnPagada.querySelector('use')?.setAttribute('href', '#icon-card');
                document.getElementById(ids.fechaPago).disabled = true;
                document.getElementById(ids.fechaPago).value = '';
                const btnCred = document.getElementById(ids.btnCredito);
                const inputCred = document.getElementById(ids.conCredito);
                if (inputCred) inputCred.value = 'false';
                if (btnCred) btnCred.classList.remove('btn-credito-visible');
                this._resetBtnCredito(btnCred);
            }
            // Poblar select de servicios en modal editar
            const selEdit = document.getElementById(ids.servicio);
            if (selEdit) selEdit.innerHTML = optsHTML;
            // Refrescar CustomSelects del modal editar-factura
            const csdSvcEdit = document.getElementById('editar-factura-servicio-csd');
            if (csdSvcEdit?._customSelect) csdSvcEdit._customSelect.refresh();
            const csdTipoEdit = document.getElementById('editar-factura-tipo-csd');
            if (csdTipoEdit?._customSelect) csdTipoEdit._customSelect.refresh();
            this.app.abrirModal('modal-editar-factura');
        } else {
            // Poblar select ANTES de reset para que reset no lo borre
            const selectSvc = document.getElementById('factura-servicio');
            if (selectSvc) selectSvc.innerHTML = optsHTML;
            document.getElementById('form-factura').reset();
            // Restaurar valores que reset borró
            if (selectSvc) selectSvc.innerHTML = optsHTML;
            this.app.utils.setMonedaBtn('factura-moneda', 'btn-factura-moneda', 'ars');
            document.getElementById('factura-fecha').value = this.app.utils.obtenerFechaLocal();
            document.getElementById('btn-toggle-pagada').classList.remove('pagada');
            document.getElementById('factura-fecha-pago').disabled = true;
            document.getElementById('factura-fecha-pago').value = '';
            this._resetBtnCredito(document.getElementById('btn-toggle-credito'));
            // Refrescar CustomSelects del modal nueva factura
            const csdSvcNueva = document.getElementById('factura-servicio-csd');
            if (csdSvcNueva?._customSelect) csdSvcNueva._customSelect.refresh();
            const csdTipoNueva = document.getElementById('factura-tipo-csd');
            if (csdTipoNueva?._customSelect) csdTipoNueva._customSelect.refresh();
            this.app.origenModalFactura = origen;
            if (origen === 'menu') this.app.ui.cerrarMenuAgregar();
            this.app.abrirModal('modal-agregar-factura');
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
        const btn   = document.getElementById(ids.btnCredito);
        const input = document.getElementById(ids.conCredito);
        const use   = btn.querySelector('use');
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
        const btn        = document.getElementById(btnId);
        const fpInput    = document.getElementById(inputId);
        const use        = btn.querySelector('use');
        const estaPagada = btn.classList.contains('pagada');
        const esEditar   = btnId === 'btn-editar-toggle-pagada';
        const btnCred    = document.getElementById(esEditar ? 'btn-editar-toggle-credito'  : 'btn-toggle-credito');
        const inputCred  = document.getElementById(esEditar ? 'editar-factura-con-credito' : 'factura-con-credito');
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
        const input = document.getElementById(inputId);
        const btnId = inputId === 'factura-monto' ? 'btn-toggle-negativo' : 'btn-editar-toggle-negativo';
        const btn   = document.getElementById(btnId);
        if (!input || !btn) return;
        
        const nuevoNegativo = input.dataset.negativo !== 'true';
        input.dataset.negativo = nuevoNegativo ? 'true' : 'false';
        btn.classList.toggle('activo', nuevoNegativo);
        btn.title = nuevoNegativo ? 'Cambiar a gasto normal' : 'Cambiar a saldo a favor';

        const valorActual = parseFloat(input.value) || 0;
        if (valorActual !== 0) {
            input.value = nuevoNegativo ? -Math.abs(valorActual) : Math.abs(valorActual);
        }
    }

    establecerFechaHoy(tipo = 'factura', modo = 'agregar') {
        const id    = modo === 'editar' ? `editar-${tipo}-fecha` : `${tipo}-fecha`;
        const input = document.getElementById(id);
        if (input) input.value = input.value ? '' : this.app.utils.obtenerFechaLocal();
    }

    // ── Guardar ───────────────────────────────────────────────
    guardar(e) {
        e.preventDefault();
        const esEditar   = document.getElementById('modal-editar-factura').classList.contains('active');
        const ids        = this.app.utils.idsFormFactura(esEditar);
        const montoRaw   = parseFloat(document.getElementById(ids.monto).value);
        const tipo       = document.getElementById(ids.tipo).value;
        const fecha      = document.getElementById(ids.fecha).value;
        const moneda     = document.getElementById(ids.moneda).value;
        const btnPagada  = document.getElementById(ids.btnPagada);
        const estaPagada = btnPagada.classList.contains('pagada');
        const fechaPago  = estaPagada ? document.getElementById(ids.fechaPago).value : null;
        const conCredito = estaPagada ? (document.getElementById(ids.conCredito)?.value === 'true') : false;
        const btnNeg     = document.getElementById(ids.btnNegativo);
        const esNegativo = btnNeg?.classList.contains('activo') || document.getElementById(ids.monto).dataset.negativo === 'true';
        const monto      = esNegativo ? -Math.abs(montoRaw) : Math.abs(montoRaw);
        const servicioSelId = document.getElementById(ids.servicio)?.value || this.app.servicioActual;

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
                this.app.cerrarModal('modal-editar-factura');
                this.abrirModalLista(servicioSelId); return;
            }
            Object.assign(factura, { monto, tipo, fecha, moneda, pagada: estaPagada, fechaPago: estaPagada ? fechaPago : null, conCredito });
        } else {
            facturaId = this.app.utils.generarId();
            servicio.facturas.push({ id: facturaId, monto, tipo, fecha, moneda, pagada: estaPagada, fechaPago: estaPagada ? fechaPago : null, conCredito });
        }
        this.app.utils.postGuardado(`${esEditar ? 'editar' : 'agregar'} factura (${servicio.nombre})`);
        this.app.cerrarModal(esEditar ? 'modal-editar-factura' : 'modal-agregar-factura');
        this.abrirModalLista(servicioSelId, { resaltar: facturaId });
        this.app.ui.mostrarToast(esEditar ? 'Factura actualizada' : 'Factura agregada', 'success');
    }

    // ── Eliminar ──────────────────────────────────────────────
    eliminar() {
        if (!this.app.facturaActual) return;
        const servicio = this.servicios.find(s => s.id === this.app.servicioActual);
        if (!servicio) return;
        servicio.facturas = servicio.facturas.filter(f => f.id !== this.app.facturaActual);
        this.app.guardarDatos();
        this.app.guardarEstado(`eliminar factura (${servicio.nombre})`);
        this.app.renderServicios();
        this.app.cerrarModal('modal-editar-factura');
        this.app.toastConDeshacer('Factura eliminada');
    }
}
