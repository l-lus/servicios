import { crudo, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';

// ============================================================
// CATEGORIA SERVICE — CRUD de categorías de servicios
// ============================================================
export class CategoriaService {
    constructor(app) {
        this.app = app;
    }

    // ── Persistencia ──────────────────────────────────────────
    getCategorias() {
        return StorageHelper.getObject(STORAGE_KEYS.CATEGORIAS, []);
    }

    saveCategorias(cats) {
        StorageHelper.setItem(STORAGE_KEYS.CATEGORIAS, cats);
    }

    // ── Selects ───────────────────────────────────────────────
    poblarSelect(selectId, valorSeleccionado = '') {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const cats = this.getCategorias();
        montar(sel, crudo(`<option value="">Sin categoría</option>`));
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (c === valorSeleccionado) opt.selected = true;
            sel.appendChild(opt);
        });
        // Refrescar CustomSelect si existe
        const csdWrapper = document.getElementById(selectId + '-csd');
        if (csdWrapper?._customSelect) csdWrapper._customSelect.refresh();
    }

    // ── Modal ─────────────────────────────────────────────────
    abrirModal(targetSelectId) {
        this.app._categoriaTargetSelect = targetSelectId;
        this.app._modalServicioOrigen = document.querySelector('.modal.active')?.id || null;
        if (this.app._modalServicioOrigen) this.app.ui.cerrarModal(this.app._modalServicioOrigen);
        document.getElementById('nueva-categoria-nombre').value = '';
        this.renderLista();
        this.app.ui.abrirModal('modal-nueva-categoria');
    }

    cerrarModal() {
        this.app.ui.cerrarModal('modal-nueva-categoria');
        if (this.app._modalServicioOrigen) {
            this.app.ui.abrirModal(this.app._modalServicioOrigen);
            this.app._modalServicioOrigen = null;
        }
    }

    // ── Render lista ──────────────────────────────────────────
    renderLista() {
        const lista = document.getElementById('categorias-lista');
        if (!lista) return;
        const cats = this.getCategorias();
        if (cats.length === 0) {
            montar(lista, crudo(`<span class="sin-categorias-text">Sin categorías definidas</span>`));
            return;
        }
        montar(lista, crudo(cats.map(c => `
        <span class="categoria-tag">
            <button class="categoria-tag-del" data-action="eliminar-categoria" data-cat="${this.app.utils.escaparAtributoHTML(c)}" title="Eliminar">
                <svg class="icon"><use href="#icon-cancel" /></svg>
            </button>
            ${this.app.utils.escaparHTML(c)}
        </span>`).join('')));
    }

    // ── CRUD ──────────────────────────────────────────────────
    eliminar(nombre) {
        const cats = this.getCategorias().filter(c => c !== nombre);
        this.saveCategorias(cats);
        EstadoApp.servicios.forEach(s => { if (s.categoria === nombre) s.categoria = ''; });
        this.app.storage.guardarDatos();
        this.app.guardarEstado(`eliminar categoría (${nombre})`);
        this.poblarSelect('servicio-categoria');
        this.poblarSelect('editar-servicio-categoria');
        this.renderLista();
        this.app.vista.renderServicios();
        this.app.toastConDeshacer('Categoría eliminada');
    }

    guardarNueva() {
        // Mismo saneamiento que las categorías importadas (ver StorageService._normalizarCategorias)
        const nombre = SecurityAndUtils.sanitizeString(document.getElementById('nueva-categoria-nombre').value,
            SecurityAndUtils.SECURITY_LIMITS.MAX_NOMBRE_LENGTH);
        if (!nombre) { this.app.mostrarToast('El nombre es requerido', 'error'); return; }
        const cats = this.getCategorias();
        if (cats.some(c => c.toLowerCase() === nombre.toLowerCase())) {
            this.app.mostrarToast('Esa categoría ya existe', 'error'); return;
        }
        cats.push(nombre);
        cats.sort((a, b) => a.localeCompare(b));
        this.saveCategorias(cats);
        document.getElementById('nueva-categoria-nombre').value = '';
        this.poblarSelect('servicio-categoria',
            this.app._categoriaTargetSelect === 'servicio-categoria' ? nombre : '');
        this.poblarSelect('editar-servicio-categoria',
            this.app._categoriaTargetSelect === 'editar-servicio-categoria' ? nombre : '');
        const sel = document.getElementById(this.app._categoriaTargetSelect);
        if (sel) {
            sel.value = nombre;
            // Refrescar el CSD del selector target (refleja la selección nueva)
            const csdTarget = document.getElementById(this.app._categoriaTargetSelect + '-csd');
            if (csdTarget?._customSelect) csdTarget._customSelect.refresh();
        }
        this.app.guardarEstado(`agregar categoría (${nombre})`);
        this.renderLista();
        this.app.mostrarToast('Categoría agregada', 'success');
    }
}
