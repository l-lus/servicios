import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { GestorPerfiles } from '../services/gestor-perfiles.js';
import { ModalManager } from './gestor-modales.js';

// ============================================================
// PERFIL SERVICE — gestión de perfiles de usuario
// ============================================================
export class PerfilService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get perfiles() { return EstadoApp.perfiles; }
    set perfiles(v) { EstadoApp.perfiles = v; }
    get perfilActivo() { return EstadoApp.perfilActivo; }
    set perfilActivo(v) { EstadoApp.perfilActivo = v; }

    // ── Persistencia ──────────────────────────────────────────
    cargar() {
        return GestorPerfiles.cargar();
    }

    guardar() {
        if (!GestorPerfiles.guardar(this.perfiles)) this.app.ui.mostrarToast('Error al guardar perfiles', 'error');
    }

    // ── Cambio de perfil activo ───────────────────────────────
    cambiar(perfilId) {
        if (perfilId === this.perfilActivo) return;
        this.app.storage.guardarDatosPerfilActivo();
        this.perfilActivo = perfilId;
        StorageHelper.setItem(STORAGE_KEYS.PERFIL_ACTIVO, perfilId);
        this.app.storage.cargarDatosPerfilActivo();
        this.app._estadisticaCategoriaActiva = null;
        this.app.ultimoEstadoEstadisticas = null;
        this.app.vista.renderServicios();
        this.app.ui.cerrarModal('modal-perfiles');
        this.app.ui.cerrarMenuAjustes();
        this.app.ui.mostrarToast(`Cambiado a perfil: ${this.perfiles[perfilId].nombre}`, 'success');
    }

    // ── UI — modal lista ──────────────────────────────────────
    abrirModal() {
        this.renderLista();
        this.app.ui.cerrarMenuAjustes();
        this.app.ui.abrirModal('modal-perfiles');
    }

    renderLista() {
        const lista = document.getElementById('perfiles-lista');
        const perfilesArray = Object.values(this.perfiles);
        const inputNuevo = document.getElementById('perfil-nuevo-nombre');
        if (inputNuevo) {
            const maxAlcanzado = !GestorPerfiles.puedeCrear(this.perfiles);
            inputNuevo.disabled = maxAlcanzado;
            inputNuevo.placeholder = maxAlcanzado ? 'Máximo 4 perfiles' : 'Nombre del perfil...';
        }
        montar(lista, html`${perfilesArray.map(perfil => {
            const esActivo = perfil.id === this.perfilActivo;
            const esDefault = perfil.id === 'default';
            const cantidadServicios = GestorPerfiles.cantidadServicios(perfil.id);
            return html`
<div class="perfil-item-card d-flex justify-content-between align-items-center ${esActivo ? 'activo' : ''}"
     data-action="cambiar-perfil" data-perfil-id="${perfil.id}">
    <div class="flex-1">
        <div class="perfil-header d-flex align-items-center gap-2">
            ${perfil.nombre}
            ${esActivo ? html`<span class="perfil-activo-badge">● Activo</span>` : ''}
        </div>
        <div class="perfil-stats">${this.app.utils.plural(cantidadServicios, 'servicio', 'servicios')}</div>
    </div>
    <div class="d-flex gap-2" data-action="stop-propagation">
        ${!esDefault ? html`
            <button class="icon-btn text-danger" data-action="eliminar-perfil" data-perfil-id="${perfil.id}" title="Eliminar perfil">
                <svg class="icon"><use href="#icon-trash" /></svg>
            </button>` : ''}
        <button class="icon-btn" data-action="editar-perfil" data-perfil-id="${perfil.id}" title="Editar perfil">
            <svg class="icon"><use href="#icon-edit" /></svg>
        </button>
    </div>
</div>`;
        })}`);
    }

    crearInline() {
        const input = document.getElementById('perfil-nuevo-nombre');
        const nombre = input.value.trim();
        const error = GestorPerfiles.validarNombre(this.perfiles, nombre);
        if (error === 'vacio') { this.app.ui.mostrarToast('Ingresá un nombre', 'error'); return; }
        if (error === 'duplicado') { this.app.ui.mostrarToast('Ya existe un perfil con ese nombre', 'error'); return; }
        if (!GestorPerfiles.puedeCrear(this.perfiles)) { this.app.ui.mostrarToast('Máximo 4 perfiles permitidos', 'error'); return; }
        GestorPerfiles.crear(this.perfiles, nombre);
        input.value = '';
        this.app.ui.mostrarToast('Perfil creado', 'success');
        this.abrirModal();
    }

    // ── UI — modal editar ─────────────────────────────────────
    abrirModalEditar(perfilId) {
        this.app.perfilEditando = perfilId;
        const perfil = this.perfiles[perfilId];
        document.getElementById('titulo-editar-perfil').textContent = 'Editar Perfil';
        document.getElementById('perfil-nombre').value = perfil.nombre;
        const inputNuevo = document.getElementById('perfil-nuevo-nombre');
        if (inputNuevo) inputNuevo.value = '';
        this.app.ui.cerrarModal('modal-perfiles');
        this.app.ui.abrirModal('modal-editar-perfil');
    }

    cancelarEditar() {
        this.app.ui.cerrarModal('modal-editar-perfil');
        this.abrirModal();
    }

    guardarEdicion(e) {
        e.preventDefault();
        const nombre = document.getElementById('perfil-nombre').value.trim();
        const error = GestorPerfiles.validarNombre(this.perfiles, nombre, this.app.perfilEditando);
        if (error === 'vacio') { this.app.ui.mostrarToast('El nombre es requerido', 'error'); return; }
        if (error === 'duplicado') { this.app.ui.mostrarToast('Ya existe un perfil con ese nombre', 'error'); return; }
        if (this.app.perfilEditando) {
            GestorPerfiles.renombrar(this.perfiles, this.app.perfilEditando, nombre);
            if (this.app.perfilEditando === this.perfilActivo) this.app.vista.renderServicios();
            this.app.ui.mostrarToast('Perfil actualizado', 'success');
        } else {
            if (!GestorPerfiles.puedeCrear(this.perfiles)) { this.app.ui.mostrarToast('Máximo 4 perfiles permitidos', 'error'); return; }
            GestorPerfiles.crear(this.perfiles, nombre);
            this.app.ui.mostrarToast('Perfil creado', 'success');
        }
        this.app.ui.cerrarModal('modal-editar-perfil');
        this.abrirModal();
    }

    async eliminar(perfilId) {
        if (perfilId === 'default') {
            this.app.ui.mostrarToast('No puedes eliminar el perfil principal', 'error'); return;
        }
        const perfil = this.perfiles[perfilId];
        const confirmado = await ModalManager.confirmar(
            `¿Eliminar el perfil "${perfil.nombre}"? Todos sus datos se perderán.`,
            'Eliminar',
            '#icon-trash',
            { titulo: 'Eliminar perfil' }
        );
        if (!confirmado) return;
        if (perfilId === this.perfilActivo) this.cambiar('default');
        GestorPerfiles.eliminar(this.perfiles, perfilId);
        this.app.historial_mgr.eliminarDePerfil(perfilId);
        this.app.ui.mostrarToast('Perfil eliminado', 'success');
        this.renderLista();
    }
}
