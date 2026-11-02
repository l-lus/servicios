import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { ModalManager } from './gestor-modales.js';

// ============================================================
// PERFIL SERVICE — gestión de perfiles de usuario
// ============================================================
export class PerfilService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get perfiles() { return this.app.perfiles; }
    set perfiles(v) { this.app.perfiles = v; }
    get perfilActivo() { return this.app.perfilActivo; }
    set perfilActivo(v) { this.app.perfilActivo = v; }

    // ── Persistencia ──────────────────────────────────────────
    cargar() {
        try {
            const guardados = StorageHelper.getObject(STORAGE_KEYS.PERFILES, null);
            if (guardados) return guardados;
        } catch (error) {
            console.error('Error al cargar perfiles:', error);
        }
        return { 'default': { id: 'default', nombre: 'Principal', creado: new Date().toISOString() } };
    }

    guardar() {
        try {
            StorageHelper.setItem(STORAGE_KEYS.PERFILES, this.perfiles);
        } catch (error) {
            console.error('Error al guardar perfiles:', error);
            this.app.ui.mostrarToast('Error al guardar perfiles', 'error');
        }
    }

    // ── Cambio de perfil activo ───────────────────────────────
    cambiar(perfilId) {
        if (perfilId === this.perfilActivo) return;
        this.app.guardarDatosPerfilActivo();
        this.perfilActivo = perfilId;
        StorageHelper.setItem(STORAGE_KEYS.PERFIL_ACTIVO, perfilId);
        this.app.cargarDatosPerfilActivo();
        this.app._estadisticaCategoriaActiva = null;
        this.app.ultimoEstadoEstadisticas = null;
        this.app.renderServicios();
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
            const maxAlcanzado = perfilesArray.length >= 4;
            inputNuevo.disabled = maxAlcanzado;
            inputNuevo.placeholder = maxAlcanzado ? 'Máximo 4 perfiles' : 'Nombre del perfil...';
        }
        lista.innerHTML = perfilesArray.map(perfil => {
            const esActivo = perfil.id === this.perfilActivo;
            const esDefault = perfil.id === 'default';
            let cantidadServicios = 0;
            try {
                cantidadServicios = StorageHelper.getObject(STORAGE_KEYS.DATOS_PERFIL(perfil.id), []).length;
            } catch (e) { }
            return `
<div class="perfil-item-card d-flex justify-content-between align-items-center ${esActivo ? 'activo' : ''}"
     data-action="cambiar-perfil" data-perfil-id="${this.app.utils.escaparAtributoHTML(perfil.id)}">
    <div class="flex-1">
        <div class="perfil-header d-flex align-items-center gap-2">
            ${this.app.utils.escaparHTML(perfil.nombre)}
            ${esActivo ? '<span class="perfil-activo-badge">● Activo</span>' : ''}
        </div>
        <div class="perfil-stats">${this.app.utils.plural(cantidadServicios, 'servicio', 'servicios')}</div>
    </div>
    <div class="d-flex gap-2" data-action="stop-propagation">
        ${!esDefault ? `
            <button class="icon-btn text-danger" data-action="eliminar-perfil" data-perfil-id="${this.app.utils.escaparAtributoHTML(perfil.id)}" title="Eliminar perfil">
                <svg class="icon"><use href="#icon-trash" /></svg>
            </button>` : ''}
        <button class="icon-btn" data-action="editar-perfil" data-perfil-id="${this.app.utils.escaparAtributoHTML(perfil.id)}" title="Editar perfil">
            <svg class="icon"><use href="#icon-edit" /></svg>
        </button>
    </div>
</div>`;
        }).join('');
    }

    crearInline() {
        const input = document.getElementById('perfil-nuevo-nombre');
        const nombre = input.value.trim();
        if (!nombre) { this.app.ui.mostrarToast('Ingresá un nombre', 'error'); return; }
        if (Object.values(this.perfiles).some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
            this.app.ui.mostrarToast('Ya existe un perfil con ese nombre', 'error'); return;
        }
        if (Object.keys(this.perfiles).length >= 4) {
            this.app.ui.mostrarToast('Máximo 4 perfiles permitidos', 'error'); return;
        }
        const nuevoId = 'perfil_' + Date.now();
        this.perfiles[nuevoId] = { id: nuevoId, nombre, creado: new Date().toISOString() };
        StorageHelper.setItem(STORAGE_KEYS.DATOS_PERFIL(nuevoId), []);
        input.value = '';
        this.guardar();
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
        if (!nombre) { this.app.ui.mostrarToast('El nombre es requerido', 'error'); return; }
        const nombreExiste = Object.values(this.perfiles).some(p =>
            p.nombre.toLowerCase() === nombre.toLowerCase() && p.id !== this.app.perfilEditando
        );
        if (nombreExiste) { this.app.ui.mostrarToast('Ya existe un perfil con ese nombre', 'error'); return; }
        if (this.app.perfilEditando) {
            this.perfiles[this.app.perfilEditando].nombre = nombre;
            if (this.app.perfilEditando === this.perfilActivo) this.app.renderServicios();
            this.app.ui.mostrarToast('Perfil actualizado', 'success');
        } else {
            if (Object.keys(this.perfiles).length >= 4) {
                this.app.ui.mostrarToast('Máximo 4 perfiles permitidos', 'error'); return;
            }
            const nuevoId = 'perfil_' + Date.now();
            this.perfiles[nuevoId] = { id: nuevoId, nombre, creado: new Date().toISOString() };
            StorageHelper.setItem(STORAGE_KEYS.DATOS_PERFIL(nuevoId), []);
            this.app.ui.mostrarToast('Perfil creado', 'success');
        }
        this.guardar();
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
        StorageHelper.removeItem(STORAGE_KEYS.DATOS_PERFIL(perfilId));
        this.app.historial_mgr.eliminarDePerfil(perfilId);
        delete this.perfiles[perfilId];
        this.guardar();
        this.app.ui.mostrarToast('Perfil eliminado', 'success');
        this.renderLista();
    }
}
