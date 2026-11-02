import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { Motion } from '../core/movimiento.js';
import { html, icono, montar } from '../core/html.js';
import { MAX_ATAJOS, normalizarAtajos, alternarAtajo } from '../services/atajos.js';
import { GestorTemas } from './gestor-temas.js';

// ============================================================
// ATAJOS — tarjeta de botones rápidos que la persona elige (hasta MAX_ATAJOS)
// ============================================================
const $ = id => document.getElementById(id);
// Muchas acciones ya existen como botones de otras partes (aunque estén ocultas): se las dispara desde acá para que haya un solo camino
const click = id => () => $(id)?.click();
const ETIQUETAS_ANIMACIONES = { auto: 'Auto', on: 'Sí', off: 'No' };

export class AtajosCard {
    constructor(app) {
        this.app = app;
        /**
         * Catálogo de atajos. `estado()` devuelve lo que cambia con la situación (ícono, título, desactivado) y `accion()` lo que hace.
         * El orden es el de la lista del selector.
         */
        this.catalogo = [
            { id: 'nueva-factura', nombre: 'Nueva factura', descripcion: 'Carga una factura de un servicio existente',
                estado: () => ({ icono: '#icon-plus', titulo: 'Nueva factura' }), accion: () => this.app.ui.abrirModalFacturaRapida() },
            { id: 'nuevo-servicio', nombre: 'Nuevo servicio', descripcion: 'Agrega un servicio (luz, gas, internet…)',
                estado: () => ({ icono: '#icon-add', titulo: 'Nuevo servicio' }), accion: () => this.app.servicio.abrirModalServicio() },
            { id: 'nuevo-ingreso', nombre: 'Nuevo ingreso', descripcion: 'Registra un cobro (requiere activar ingresos)',
                estado: () => ({ icono: '#icon-cash', titulo: 'Nuevo ingreso', desactivado: !this.app.ui.ingresosHabilitado() }),
                accion: () => this.app.ingreso.abrirModal(null, true) },
            { id: 'calculadora', nombre: 'Calculadora', descripcion: 'Suma los servicios que elijas (pendientes o pagados)',
                estado: () => ({ icono: '#icon-stats', titulo: this.app.modoCalculadora ? 'Salir de la calculadora' : 'Calculadora' }),
                accion: () => (this.app.modoCalculadora ? this.app.calculador.desactivarModo() : this.app.calculador.activarModo()) },
            { id: 'buscar', nombre: 'Buscar servicio', descripcion: 'Lleva el cursor al buscador de la lista',
                estado: () => ({ icono: '#icon-search', titulo: 'Buscar servicio' }), accion: () => { $('search-input')?.scrollIntoView({ block: 'center' }); $('search-input')?.focus(); } },
            { id: 'ordenar', nombre: 'Ordenar y ver', descripcion: 'Orden y forma de la lista',
                estado: () => ({ icono: '#icon-sort', titulo: 'Ordenar y ver' }), accion: click('btn-sort') },
            { id: 'calendario', nombre: 'Calendario', descripcion: 'Abre o cierra el calendario de vencimientos',
                estado: () => ({ icono: '#icon-calendar', titulo: 'Calendario de vencimientos' }),
                accion: () => { this.app.calendario.toggle(); if (this.app.calendario.abierto) $('card-calendario')?.scrollIntoView({ block: 'start' }); } },
            { id: 'deshacer', nombre: 'Deshacer', descripcion: 'Deshace el último cambio',
                estado: () => ({ icono: '#icon-undo', titulo: 'Deshacer (Ctrl+Z)', desactivado: !!$('btn-undo')?.disabled }), accion: click('btn-undo') },
            { id: 'rehacer', nombre: 'Rehacer', descripcion: 'Vuelve a aplicar el cambio deshecho',
                estado: () => ({ icono: '#icon-redo', titulo: 'Rehacer (Ctrl+Y)', desactivado: !!$('btn-redo')?.disabled }), accion: click('btn-redo') },
            { id: 'respaldar', nombre: 'Respaldar', descripcion: 'Exporta todo, un mes o un rango',
                estado: () => ({ icono: '#icon-download', titulo: 'Respaldar' }), accion: () => this.app.respaldo.abrir() },
            { id: 'restaurar', nombre: 'Restaurar', descripcion: 'Importa un respaldo con resumen previo',
                estado: () => ({ icono: '#icon-upload', titulo: 'Restaurar desde archivo' }), accion: () => this.app.storage.importarDatos('combinar') },
            { id: 'sincronizar', nombre: 'Sincronizar', descripcion: 'Abre la sincronización con Gist',
                estado: () => ({ icono: '#icon-cloud-sync', titulo: 'Sincronización' }), accion: click('menu-gist') },
            { id: 'reporte', nombre: 'Reporte', descripcion: 'Genera el reporte de las estadísticas',
                estado: () => ({ icono: '#icon-download', titulo: 'Reporte' }), accion: () => this.app.reporte.abrir() },
            { id: 'tema', nombre: 'Tema', descripcion: 'Abre el selector de temas de color',
                estado: () => ({ icono: GestorTemas.actual() === 'light' ? '#icon-moon' : '#icon-sun', titulo: 'Tema' }), accion: () => this.app.ui.abrirModal('modal-temas') },
            { id: 'privacidad', nombre: 'Privacidad', descripcion: 'Desenfoca los montos del resumen',
                estado: () => ({ icono: '#icon-eye', titulo: 'Privacidad de montos' }), accion: () => this.app.ui.toggleBlur() },
            { id: 'animaciones', nombre: 'Reducir animaciones', descripcion: 'Alterna entre Auto, Sí y No',
                estado: () => ({ icono: '#icon-clock', titulo: `Reducir animaciones: ${ETIQUETAS_ANIMACIONES[Motion.modo()]}` }), accion: () => this.app.ui.toggleAnimaciones() },
            { id: 'categorias', nombre: 'Categorías', descripcion: 'Crea o borra categorías',
                estado: () => ({ icono: '#icon-categorias', titulo: 'Categorías' }), accion: () => this.app.categoria.abrirModal(null) },
            { id: 'perfiles', nombre: 'Perfiles', descripcion: 'Cambia o administra los perfiles',
                estado: () => ({ icono: '#icon-users', titulo: 'Perfiles' }), accion: () => this.app.ui.abrirPerfiles() },
            { id: 'ayuda', nombre: 'Ayuda', descripcion: 'Abre la ayuda con buscador',
                estado: () => ({ icono: '#icon-help', titulo: 'Ayuda' }), accion: () => this.app.ui.abrirAyuda() },
            { id: 'ajustes', nombre: 'Ajustes', descripcion: 'Abre el menú de ajustes',
                estado: () => ({ icono: '#icon-settings', titulo: 'Ajustes' }), accion: () => this.app.ui.abrirAjustes() },
        ];
        this._ids = this.catalogo.map(a => a.id);
    }

    _porId(id) { return this.catalogo.find(a => a.id === id); }

    obtener() {
        return normalizarAtajos(StorageHelper.getObject(STORAGE_KEYS.ATAJOS, null), this._ids, MAX_ATAJOS);
    }

    _guardar(lista) { StorageHelper.setItem(STORAGE_KEYS.ATAJOS, lista); }

    _aplicarEstado(btn, def) {
        const { icono: href, titulo, desactivado } = def.estado();
        btn.title = titulo;
        btn.setAttribute('aria-label', titulo);
        btn.disabled = !!desactivado;
        btn.querySelector('use')?.setAttribute('href', href);
    }

    /** Actualiza ícono, título y desactivado de los botones ya dibujados (sin recrearlos, para no perder el foco del teclado). */
    actualizarEstados() {
        $('atajos-botones')?.querySelectorAll('button[data-atajo]').forEach(btn => {
            const def = this._porId(btn.dataset.atajo);
            if (def) this._aplicarEstado(btn, def);
        });
    }

    render() {
        const grilla = $('atajos-botones');
        if (!grilla) return;
        const defs = this.obtener().flatMap(id => this._porId(id) ?? []);
        montar(grilla, defs.length
            ? html`${defs.map(def => html`<button class="atajo-btn" id="atajo-${def.id}" data-atajo="${def.id}" type="button">${icono(def.estado().icono)}</button>`)}`
            : html`<p class="atajos-vacio">Sin atajos. Tocá el lápiz para elegirlos.</p>`);
        this.actualizarEstados();
    }

    _renderSelector() {
        const lista = $('lista-atajos-opciones');
        const elegidos = this.obtener();
        const llena = elegidos.length >= MAX_ATAJOS;
        montar(lista, html`${this.catalogo.map(def => {
            const activo = elegidos.includes(def.id);
            return html`<button type="button" class="atajo-opcion${activo ? ' btn-activo' : ''}" data-atajo="${def.id}" ${!activo && llena ? 'disabled' : ''}>
                ${icono(def.estado().icono)}
                <span class="atajo-opcion-texto"><span>${def.nombre}</span><span class="atajo-opcion-desc">${def.descripcion}</span></span>
                <span class="toggle-switch ${activo ? 'on' : ''}" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </button>`;
        })}`);
        $('atajos-contador').textContent = `${elegidos.length}/${MAX_ATAJOS}`;
    }

    // Con la lista ya dibujada solo se actualiza cada fila (no se rearma), para que los interruptores se animen
    _sincronizarSelector() {
        const elegidos = this.obtener();
        const llena = elegidos.length >= MAX_ATAJOS;
        $('lista-atajos-opciones').querySelectorAll('button[data-atajo]').forEach(btn => {
            const activo = elegidos.includes(btn.dataset.atajo);
            btn.classList.toggle('btn-activo', activo);
            btn.querySelector('.toggle-switch')?.classList.toggle('on', activo);
            btn.disabled = !activo && llena;
        });
        $('atajos-contador').textContent = `${elegidos.length}/${MAX_ATAJOS}`;
    }

    abrirSelector() {
        this._renderSelector();
        this.app.ui.abrirModal('modal-atajos');
    }

    bindEventos() {
        $('atajos-botones').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-atajo]');
            if (!btn || btn.disabled) return;
            this._porId(btn.dataset.atajo)?.accion();
            // Algunas acciones cambian el estado de su propio botón (calculadora activa, tema)
            setTimeout(() => this.actualizarEstados(), 50);
        });
        $('btn-atajos-editar').addEventListener('click', () => this.abrirSelector());
        $('lista-atajos-opciones').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-atajo]');
            if (!btn || btn.disabled) return;
            const { lista, lleno } = alternarAtajo(this.obtener(), btn.dataset.atajo, MAX_ATAJOS);
            if (lleno) { this.app.ui.mostrarToast(`Máximo ${MAX_ATAJOS} atajos`, 'info'); return; }
            this._guardar(lista);
            this._sincronizarSelector();
            this.render();
        });
        $('modal-atajos-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-atajos'));
        // Lo que cambia el aspecto de un atajo (tema, ingresos, historial) vuelve a pintarlos
        EventosApp.on('tema:cambio', () => this.actualizarEstados());
    }
}
