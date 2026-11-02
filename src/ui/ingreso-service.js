// ============================================================
// INGRESO SERVICE — ciclo de vida de ingresos
// ============================================================
export class IngresoService {
    constructor(app) {
        this.app = app;
    }

    get servicios() { return this.app.servicios; }

    crearServicio() {
        this.servicios.push({ id: this.app.SERVICIO_INGRESOS_ID, nombre: 'Ingresos', facturas: [], activo: false });
        this.app.guardarDatos();
    }

    abrirModalLista(servicioId, { resaltar = null } = {}) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const lista = document.getElementById('lista-ingresos-modal');
        if (servicio.facturas.length === 0) {
            lista.innerHTML = '<div class="empty-state"><p>No hay ingresos registrados</p></div>';
        } else {
            const ordenados = [...servicio.facturas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            const grupos = this.app.factura.agruparPorAno(ordenados);
            lista.innerHTML = grupos.map((grupo, index) => {
                const html = grupo.items.map(ingreso => {
                    const tipo   = ingreso.tipo === 'complementario' ? 'Complementario' : ingreso.tipo === 'transferencia' ? 'Transferencia' : 'Regular';
                    const emoji  = ingreso.tipo === 'complementario' ? '💼' : ingreso.tipo === 'transferencia' ? '🔄' : '💵';
                    const moneda = ingreso.moneda === 'usd' ? 'usd' : 'ars';
                    const idAttr = this.app.utils.escaparAtributoHTML(ingreso.id);
                    return `
                <div class="factura-item" data-id="${idAttr}">
                    <div class="factura-info" data-action="abrir-ingreso" data-ingreso-id="${idAttr}">
                        <div class="factura-monto">${this.app.utils.formatearMoneda(ingreso.monto, moneda)}<span class="moneda-badge ${moneda}">${moneda.toUpperCase()}</span></div>
                        <div class="factura-fecha">${emoji} ${tipo} | Cobrado: ${this.app.utils.formatearFecha(ingreso.fecha)}</div>
                    </div>
                </div>`;
                }).join('');
                return this.app.factura.generarGrupoAno(grupo.ano, grupo.items, html, 'ingreso', index);
            }).join('');
        }
        document.getElementById('modal-ingresos-lista').dataset.servicioId = servicioId;
        this.app.abrirModal('modal-ingresos-lista');
        const anoGuardado = this.app._anoExpandidoIngresos[servicioId];
        if (anoGuardado) { this.app._restaurarAnoExpandido(anoGuardado); this.app._anoExpandidoIngresos[servicioId] = null; }
        this.app._resaltarItemLista(lista, resaltar);
    }

    abrirModal(ingresoId = null, desdeMenu = false) {
        if (ingresoId) {
            const modal = document.getElementById('modal-ingresos-lista');
            if (modal?.classList.contains('active')) {
                const sid  = modal.dataset.servicioId;
                const item = document.querySelector(`.factura-item[data-id="${CSS.escape(ingresoId)}"]`);
                const ano  = item?.closest('.facturas-grupo-ano')?.querySelector('.facturas-grupo-ano-texto')?.textContent || null;
                this.app._anoExpandidoIngresos[sid] = ano;
            }
        }
        this.app.cerrarModal('modal-ingresos-lista');
        this.app.ingresoActual    = ingresoId;
        this.app.ingresoDesdeMenu = desdeMenu;
        if (ingresoId) {
            const servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
            const ingreso  = servicio?.facturas.find(f => f.id === ingresoId);
            if (ingreso) {
                document.getElementById('editar-ingreso-monto').value = ingreso.monto;
                document.getElementById('editar-ingreso-tipo').value  = ingreso.tipo || 'regular';
                document.getElementById('editar-ingreso-fecha').value = ingreso.fecha;
                this.app.utils.setMonedaBtn('editar-ingreso-moneda', 'btn-editar-ingreso-moneda', ingreso.moneda || 'ars');
                // Refrescar CustomSelect editar-ingreso-tipo
                const csdEditTipo = document.getElementById('editar-ingreso-tipo-csd');
                if (csdEditTipo?._customSelect) csdEditTipo._customSelect.refresh();
            }
            this.app.abrirModal('modal-editar-ingreso');
        } else {
            document.getElementById('form-ingreso').reset();
            this.app.utils.setMonedaBtn('ingreso-moneda', 'btn-ingreso-moneda', 'ars');
            // Refrescar CustomSelect ingreso-tipo (reset puede haber alterado la opción visible)
            const csdTipo = document.getElementById('ingreso-tipo-csd');
            if (csdTipo?._customSelect) csdTipo._customSelect.refresh();
            this.app.abrirModal('modal-agregar-ingreso');
        }
    }

    guardar(e) {
        e.preventDefault();
        const esEditar = document.getElementById('modal-editar-ingreso').classList.contains('active');
        const monto  = parseFloat(document.getElementById(esEditar ? 'editar-ingreso-monto' : 'ingreso-monto').value);
        const tipo   = document.getElementById(esEditar ? 'editar-ingreso-tipo'   : 'ingreso-tipo').value;
        const fecha  = document.getElementById(esEditar ? 'editar-ingreso-fecha'  : 'ingreso-fecha').value;
        const moneda = document.getElementById(esEditar ? 'editar-ingreso-moneda' : 'ingreso-moneda').value;
        if (!this.app.factura.validarMonto(monto, false)) return;
        if (!this.app.factura.validarFecha(fecha)) return;
        let servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
        if (!servicio) { this.crearServicio(); servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID); }
        let ingresoId = this.app.ingresoActual;
        if (this.app.ingresoActual) {
            const ingreso = servicio.facturas.find(f => f.id === this.app.ingresoActual);
            if (ingreso) {
                if (ingreso.monto === monto && ingreso.tipo === tipo && ingreso.fecha === fecha && (ingreso.moneda || 'ars') === moneda) {
                    this.app.ui.mostrarToast('Sin cambios', 'info');
                    this.app.cerrarModal('modal-editar-ingreso');
                    this.abrirModalLista(this.app.SERVICIO_INGRESOS_ID); return;
                }
                Object.assign(ingreso, { monto, tipo, fecha, moneda });
            }
        } else {
            ingresoId = this.app.utils.generarId();
            servicio.facturas.push({ id: ingresoId, monto, tipo, fecha, moneda, pagada: true });
        }
        this.app.guardarDatos();
        this.app.guardarEstado(this.app.ingresoActual ? 'editar ingreso' : 'agregar ingreso');
        this.app.renderServicios();
        this.app.cerrarModal(esEditar ? 'modal-editar-ingreso' : 'modal-agregar-ingreso');
        if (!this.app.ingresoDesdeMenu) this.abrirModalLista(this.app.SERVICIO_INGRESOS_ID, { resaltar: ingresoId });
        this.app.ui.mostrarToast(this.app.ingresoActual ? 'Ingreso actualizado' : 'Ingreso agregado', 'success');
    }

    eliminar() {
        const servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
        if (!servicio) return;
        servicio.facturas = servicio.facturas.filter(f => f.id !== this.app.ingresoActual);
        this.app.guardarDatos();
        this.app.guardarEstado('eliminar ingreso');
        this.app.renderServicios();
        this.app.cerrarModal('modal-editar-ingreso');
        if (!this.app.ingresoDesdeMenu) this.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
        this.app.toastConDeshacer('Ingreso eliminado');
    }
}
