import { EstadoApp } from '../services/estado-app.js';
import { ModalManager } from './gestor-modales.js';
import { $, formulario } from '../core/dom.js';
// ============================================================
// SERVICIOSERVICE
// ============================================================
export class ServicioService {
    constructor(app) {
        this.app = app;
    }

    abrirModalServicio(servicioId = null) {
        this.app.servicioActual = servicioId;

        if (servicioId) {
            // Modo editar - usar modal separado
            const servicio = EstadoApp.servicios.find(s => s.id === servicioId);
            if (servicio) {
                $('editar-servicio-nombre').value = servicio.nombre;
                this.app.categoria.poblarSelect('editar-servicio-categoria', servicio.categoria || '');
            }
            this.app.ui.abrirModal('modal-editar-servicio');
        } else {
            // Modo nuevo
            formulario('form-servicio').reset();
            this.app.categoria.poblarSelect('servicio-categoria', '');
            this.app.ui.abrirModal('modal-agregar-servicio');
        }
    }

    guardarServicio(e) {
        e.preventDefault();

        // Detectar si estamos en modo agregar o editar
        const esEditar = $('modal-editar-servicio').classList.contains('active');
        const nombre = esEditar
            ? $('editar-servicio-nombre').value.trim()
            : $('servicio-nombre').value.trim();
        const categoria = esEditar
            ? $('editar-servicio-categoria').value
            : $('servicio-categoria').value;

        if (!nombre) {
            this.app.mostrarToast('El nombre del servicio es obligatorio', 'error');
            return;
        }

        // Validar que no exista otro servicio con el mismo nombre (case insensitive)
        const nombreExiste = EstadoApp.servicios.some(s =>
            s.id !== this.app.servicioActual &&
            s.nombre.toLowerCase() === nombre.toLowerCase()
        );

        if (nombreExiste) {
            this.app.mostrarToast('Ya existe un servicio con ese nombre', 'error');
            return;
        }

        if (this.app.servicioActual) {
            // Editar servicio existente
            const servicio = EstadoApp.servicios.find(s => s.id === this.app.servicioActual);
            if (servicio) {
                // Verificar si hubo cambios
                if (servicio.nombre === nombre && (servicio.categoria || '') === categoria) {
                    this.app.mostrarToast('Sin cambios', 'info');
                    this.app.ui.cerrarModal('modal-editar-servicio');
                    // Volver al modal de facturas
                    if (this.app.servicioActual) {
                        this.app.factura.abrirModalLista(this.app.servicioActual);
                    }
                    return;
                }
                servicio.nombre = nombre;
                servicio.categoria = categoria;
                this.app.mostrarToast('Servicio actualizado', 'success');
            }
        } else {
            // Crear nuevo servicio
            const nuevoServicio = {
                id: this.app.utils.generarId(),
                nombre: nombre,
                categoria: categoria,
                facturas: []
            };
            EstadoApp.servicios.push(nuevoServicio);
            this.app.mostrarToast('Servicio creado', 'success');
        }

        this.app.storage.guardarDatos();
        this.app.guardarEstado(`${esEditar ? 'editar' : 'crear'} servicio (${nombre})`);
        this.app.enModoBusqueda = false;
        this.app.vista.renderServicios();
        this.app.ui.cerrarModal(esEditar ? 'modal-editar-servicio' : 'modal-agregar-servicio');
        // Volver al modal de facturas después de guardar
        if (esEditar && this.app.servicioActual) {
            this.app.factura.abrirModalLista(this.app.servicioActual);
        }
    }

    editarServicio(servicioId) {
        this.abrirModalServicio(servicioId);
    }

    editarServicioDesdeModal() {
        const modal = $('modal-facturas-servicio');
        const servicioId = modal.dataset.servicioId;
        if (servicioId) {
            this.app.ui.cerrarModal('modal-facturas-servicio');
            this.editarServicio(servicioId);
        }
    }

    async eliminarServicio() {
        if (!this.app.servicioActual) return;

        const confirmado = await ModalManager.confirmar(
            '¿Estás seguro de eliminar este servicio y todas sus facturas?',
            'Eliminar',
            '#icon-trash',
            { titulo: 'Eliminar servicio' }
        );
        if (confirmado) {
            const eliminado = EstadoApp.servicios.find(s => s.id === this.app.servicioActual);
            EstadoApp.servicios = EstadoApp.servicios.filter(s => s.id !== this.app.servicioActual);

            this.app.storage.guardarDatos();
            this.app.guardarEstado(`eliminar servicio${eliminado ? ` (${eliminado.nombre})` : ''}`);
            this.app.enModoBusqueda = false;
            this.app.vista.renderServicios();
            this.app.ui.cerrarModal('modal-editar-servicio');
            // No volver al modal de facturas porque eliminamos el servicio
            this.app.toastConDeshacer('Servicio eliminado');
        }
    }

    _resetBtnCredito(btn) {
        if (!btn) return;
        const iconUse = btn.querySelector('use');
        if (iconUse) iconUse.setAttribute('href', '#icon-cash');
        btn.classList.remove('pagada');
        btn.title = 'Contado / crédito';
    }

    actualizarEstadoBotonToggle(inputId, btnId) {
        const input = $(inputId);
        const btn = $(btnId);

        if (!input || !btn) return;

        const valor = parseFloat(input.value) || 0;

        if (valor < 0) {
            btn.classList.add('activo');
            input.dataset.negativo = 'true';
            btn.title = 'Cambiar a gasto normal';
        } else {
            btn.classList.remove('activo');
            input.dataset.negativo = 'false';
            btn.title = 'Cambiar a saldo a favor';
        }
    }

    editarFactura(facturaId) {
        const servicio = EstadoApp.servicios.find(s => s.facturas.some(f => f.id === facturaId));
        if (!servicio) return;
        const factura = servicio.facturas.find(f => f.id === facturaId);
        if (!factura) return;

        const modal = $('modal-facturas-servicio');
        if (modal?.classList.contains('active')) {
            const sid = modal.dataset.servicioId;
            const item = document.querySelector(`.factura-item[data-id="${CSS.escape(facturaId)}"]`);
            const grupo = item?.closest('.facturas-grupo-ano');
            const ano = grupo?.querySelector('.facturas-grupo-ano-texto')?.textContent || null;
            if (sid) this.app._anoExpandidoFacturas[sid] = ano;
        }

        this.app.ui.cerrarModal('modal-facturas-servicio');
        this.app.factura.abrirModal(servicio.id, facturaId);
        this.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');
    }
}
