import { STORAGE_KEYS } from '../core/constantes.js';
import { PilaHistorial, clonar } from '../services/pila-historial.js';

// ============================================================
// HISTORIAL MANAGER — undo/redo: une la pila (services) con la app y los botones
// ============================================================
export class HistorialManager {
    constructor(app) {
        this.app = app;
        this._pila = new PilaHistorial({ clave: () => STORAGE_KEYS.HISTORIAL(this.app.perfilActivo) });
    }

    _estadoActual() {
        return clonar({
            servicios: this.app.servicios,
            categorias: this.app.categoria.getCategorias()
        });
    }

    inicializarHistorial() {
        this._pila.iniciar(this._estadoActual());
        this.actualizarBotones();
    }

    guardarEstado(descripcion = null) {
        this._pila.guardar(this._estadoActual(), descripcion);
        this.actualizarBotones();
    }

    deshacer() {
        const paso = this._pila.deshacer();
        if (!paso) return;
        this._aplicarEstado(paso.estado);
        this.app.ui.mostrarToast('Deshecho', 'info', undefined, paso.descripcion);
    }

    rehacer() {
        const paso = this._pila.rehacer();
        if (!paso) return;
        this._aplicarEstado(paso.estado);
        this.app.ui.mostrarToast('Rehecho', 'info', undefined, paso.descripcion);
    }

    puedeDeshacer() { return this._pila.puedeDeshacer(); }
    puedeRehacer() { return this._pila.puedeRehacer(); }
    indiceActual() { return this._pila.indiceActual(); }

    _aplicarEstado(estado) {
        this.app.servicios = estado.servicios;
        this.app.categoria.saveCategorias(estado.categorias);
        this.app.guardarDatos();
        this.app._marcarRenderAnimado();
        this.app.renderServicios();
        this.app.ui.cerrarTodosLosModales();
        this._pila.persistir();
        this.actualizarBotones();
    }

    eliminarDePerfil(perfilId) {
        PilaHistorial.eliminarDePerfil(perfilId);
    }

    actualizarBotones() {
        const undo = document.getElementById('btn-undo');
        const redo = document.getElementById('btn-redo');
        if (undo) undo.disabled = !this.puedeDeshacer();
        if (redo) redo.disabled = !this.puedeRehacer();
    }
}
