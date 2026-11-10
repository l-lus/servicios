import { $, delegado, $$ } from '../core/dom.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EstadoApp } from '../services/estado-app.js';
import { GestorTemas } from './gestor-temas.js';

// ============================================================
// BIENVENIDA — asistente de primer uso: ingresos, forma de la lista y tema
// ============================================================

export class BienvenidaModal {
    constructor(app) {
        this.app = app;
    }

    _vista() {
        return this.app._vistaEstados ? 'estados' : (this.app._agrupacionActiva ? 'categorias' : 'todo');
    }

    _pintar() {
        const ingresos = this.app.ui.ingresosHabilitado();
        $('bienvenida-ingresos').setAttribute('aria-pressed', String(ingresos));
        $('bienvenida-ingresos').classList.toggle('on', ingresos);
        $$('#modal-bienvenida .bienvenida-vista').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vista === this._vista())));
    }

    /** Muestra el asistente una sola vez, y solo si todavía no hay servicios cargados. */
    async chequearYMostrar() {
        if (StorageHelper.getBoolean(STORAGE_KEYS.BIENVENIDA_VISTA, false)) return;
        if (EstadoApp.servicios.length > 0) { this._marcarVista(); return; }
        await new Promise(r => setTimeout(r, 800));
        this._pintar();
        this.app.ui.abrirModal('modal-bienvenida');
    }

    _marcarVista() {
        StorageHelper.setItem(STORAGE_KEYS.BIENVENIDA_VISTA, 'true');
    }

    cerrar({ agregar = false } = {}) {
        this._marcarVista();
        this.app.ui.cerrarModal('modal-bienvenida');
        if (agregar) this.app.servicio.abrirModalServicio();
    }

    bindEventos() {
        $('bienvenida-ingresos').addEventListener('click', () => {
            this.app.ui.setIngresos(!this.app.ui.ingresosHabilitado(), { silencioso: true });
            this._pintar();
        });
        $$('#modal-bienvenida .bienvenida-vista').forEach(b => {
            b.addEventListener('click', () => { this.app.vista.cambiarVista(b.dataset.vista); this._pintar(); });
        });
        $('bienvenida-temas').addEventListener('click', (e) => {
            const opcion = delegado(e, '.tema-opcion');
            if (opcion) GestorTemas.elegirTema(opcion.dataset.tema);
        });
        $('btn-bienvenida-agregar').addEventListener('click', () => this.cerrar({ agregar: true }));
        $('btn-bienvenida-omitir').addEventListener('click', () => this.cerrar());
    }
}
