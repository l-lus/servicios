import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';

// ============================================================
// HISTORIAL MANAGER — undo/redo, estado profundo
// ============================================================
export class HistorialManager {
    constructor(app) {
        this.app = app;
        this._stack = [];   // [{ estado: { servicios, categorias }, descripcion }]
        this._index = -1;
        this.MAX_HISTORIAL = 20;
        this.TTL_MS = 24 * 60 * 60 * 1000;
    }

    // ── Helpers ───────────────────────────────────────────────
    _clonar(obj) {
        try { return structuredClone(obj); }
        catch (e) { return JSON.parse(JSON.stringify(obj), SecurityAndUtils.reviverJSONSeguro); }
    }

    _estadoActual() {
        return this._clonar({
            servicios: this.app.servicios,
            categorias: this.app.categoria.getCategorias()
        });
    }

    _key() { return STORAGE_KEYS.HISTORIAL(this.app.perfilActivo); }

    _esEntradaValida(e) {
        return e && typeof e === 'object' && e.estado &&
            Array.isArray(e.estado.servicios) && Array.isArray(e.estado.categorias);
    }

    // ── Persistencia ──────────────────────────────────────────
    // El historial es prescindible: si no entra en el almacenamiento se
    // guardan menos estados viejos (nunca se descarta el actual) y, si aun
    // así no entra, se descarta en silencio. La memoria no se toca.
    _persistir() {
        let desde = 0;
        while (this._stack.length > 0) {
            const ok = StorageHelper.setItem(this._key(), {
                history: this._stack.slice(desde),
                currentIndex: this._index - desde,
                timestamp: Date.now()
            }, false, { silencioso: true });
            if (ok) return;
            if (desde >= this._index) break;
            desde = Math.min(this._index, desde + Math.max(1, Math.floor((this._stack.length - desde) / 2)));
        }
        StorageHelper.removeItem(this._key());
    }

    _cargar() {
        const data = StorageHelper.getObject(this._key(), null);
        if (!data) return false;
        const vencido = Date.now() - (data.timestamp || 0) > this.TTL_MS;
        const stack = Array.isArray(data.history) ? data.history : [];
        const index = Number.isInteger(data.currentIndex) ? data.currentIndex : -1;
        if (vencido || stack.length === 0 || index < 0 || index >= stack.length ||
            !stack.every(e => this._esEntradaValida(e))) {
            StorageHelper.removeItem(this._key());
            return false;
        }
        this._stack = stack.slice(-this.MAX_HISTORIAL);
        this._index = Math.min(index - (stack.length - this._stack.length), this._stack.length - 1);
        if (this._index < 0) { this._stack = []; this._index = -1; return false; }
        return true;
    }

    // ── Inicializar ───────────────────────────────────────────
    // Restaura el historial guardado del perfil activo. Los datos guardados
    // son siempre la fuente de verdad: si difieren del estado actual del
    // historial (cambios que no pasaron por guardarEstado), se agregan como
    // un estado nuevo en lugar de pisarlos.
    inicializarHistorial() {
        this._stack = [];
        this._index = -1;
        const actual = this._estadoActual();
        if (this._cargar()) {
            const tope = this._stack[this._index].estado;
            if (JSON.stringify(tope) !== JSON.stringify(actual)) {
                this._push(actual, null);
            }
        } else {
            this._push(actual, null);
        }
        this._persistir();
        this.actualizarBotones();
    }

    // ── Guardar estado ────────────────────────────────────────
    _push(estado, descripcion) {
        if (this._index < this._stack.length - 1) this._stack.splice(this._index + 1);
        this._stack.push({ estado, descripcion });
        if (this._stack.length > this.MAX_HISTORIAL) this._stack.shift();
        this._index = this._stack.length - 1;
    }

    guardarEstado(descripcion = null) {
        this._push(this._estadoActual(), descripcion);
        this._persistir();
        this.actualizarBotones();
    }

    // ── Deshacer / Rehacer ────────────────────────────────────
    deshacer() {
        if (!this.puedeDeshacer()) return;
        const descripcion = this._stack[this._index].descripcion;
        this._index--;
        this._aplicarEstado(this._stack[this._index].estado);
        this.app.ui.mostrarToast('Deshecho', 'info', undefined, descripcion);
    }

    rehacer() {
        if (!this.puedeRehacer()) return;
        this._index++;
        const { estado, descripcion } = this._stack[this._index];
        this._aplicarEstado(estado);
        this.app.ui.mostrarToast('Rehecho', 'info', undefined, descripcion);
    }

    puedeDeshacer() { return this._index > 0; }
    indiceActual() { return this._index; }
    puedeRehacer() { return this._index < this._stack.length - 1; }

    _aplicarEstado(estado) {
        const copia = this._clonar(estado);
        this.app.servicios = copia.servicios;
        this.app.categoria.saveCategorias(copia.categorias);
        this.app.guardarDatos();
        this.app._marcarRenderAnimado();
        this.app.renderServicios();
        this.app.ui.cerrarTodosLosModales();
        this._persistir();
        this.actualizarBotones();
    }

    // ── Limpieza ──────────────────────────────────────────────
    eliminarDePerfil(perfilId) {
        StorageHelper.removeItem(STORAGE_KEYS.HISTORIAL(perfilId));
    }

    // ── Botones UI ────────────────────────────────────────────
    actualizarBotones() {
        const undo = document.getElementById('btn-undo');
        const redo = document.getElementById('btn-redo');
        if (undo) undo.disabled = !this.puedeDeshacer();
        if (redo) redo.disabled = !this.puedeRehacer();
    }
}
