import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EstiloCalendario } from '../core/estilo-calendario.js';
import { EstiloTarjeta } from '../core/estilo-tarjeta.js';
import { Preferencias } from '../core/preferencias.js';
import { AyudaBuscador } from './ayuda-buscador.js';
import { GestorTemas } from './gestor-temas.js';
import { TEMAS } from '../core/temas.js';
import { Motion } from '../core/movimiento.js';
import { ModalManager } from './gestor-modales.js';
import { TarjetaFondos } from './tarjeta-fondos.js';
import { ToastManager } from './toast.js';
import { VistaPrevia } from './vista-previa.js';
import { $ } from '../core/dom.js';

// ============================================================
// UI MANAGER — modales, menús, tema, blur, toast, dólar
// ============================================================
export class UIManager {
    constructor(app) {
        this.app = app;
    }

    // ── Tema ──────────────────────────────────────────────────
    cargarTema() { GestorTemas.cargar(); }

    // ── Blur / privacidad ─────────────────────────────────────
    toggleBlur() {
        this.app.blurHabilitado = !this.app.blurHabilitado;
        StorageHelper.setItem(STORAGE_KEYS.BLUR_MONTOS, this.app.blurHabilitado.toString());
        this.actualizarIndicadoresConfig();
        const el = $('resumen-toggle');
        if (!this.app.blurHabilitado) {
            this.app.resumenDesblurado = true;
            if (el) el.classList.remove('resumen-blur');
        } else {
            this.app.resumenDesblurado = false;
            if (el) el.classList.add('resumen-blur');
        }
        this.mostrarToast(`Privacidad ${this.app.blurHabilitado ? 'habilitado' : 'deshabilitado'}`, 'success');
    }

    // ── Animaciones ───────────────────────────────────────────
    toggleAnimaciones() {
        Motion.siguienteModo();
        const indicator = $('animaciones-indicator');
        if (indicator) indicator.textContent = Motion.etiqueta();
        const msg = { auto: 'Animaciones según el sistema', on: 'Animaciones reducidas', off: 'Animaciones completas' };
        this.mostrarToast(msg[Motion.modo()], 'success');
    }

    // ── Preferencias del calendario y personalización en vivo ──
    toggleHoverPopup() {
        const nuevo = !Preferencias.HOVER_POPUP.get();
        Preferencias.HOVER_POPUP.set(nuevo);
        this.actualizarIndicadoresConfig();
        this.mostrarToast(`Detalle al pasar el puntero ${nuevo ? 'habilitado' : 'deshabilitado'}`, 'success');
    }

    toggleRuedaCalendario() {
        const nuevo = !Preferencias.RUEDA_CALENDARIO.get();
        Preferencias.RUEDA_CALENDARIO.set(nuevo);
        this.actualizarIndicadoresConfig();
        this.mostrarToast(`Cambiar mes con rueda ${nuevo ? 'sin Alt' : 'con Alt + rueda'}`, 'success');
    }

    actualizarIndicadoresConfig() {
        const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
        const setToggle = (id, activo) => {
            const btn = $(id);
            if (!btn) return;
            btn.classList.toggle('btn-activo', Boolean(activo));
            btn.setAttribute('aria-pressed', String(Boolean(activo)));
        };
        setToggle('menu-toggle-ingresos', this.ingresosHabilitado());
        setToggle('menu-toggle-blur', this.app.blurHabilitado);
        setToggle('menu-toggle-hover-popup', Preferencias.HOVER_POPUP.get());
        setToggle('menu-toggle-rueda-calendario', Preferencias.RUEDA_CALENDARIO.get());
        set('animaciones-indicator', Motion.etiqueta());
        set('resumen-estilo-indicator', TarjetaFondos._getLabelFondo(TarjetaFondos.getFondoCard()));
        set('calendario-estilo-indicator', EstiloCalendario.etiqueta());
    }

    /** Cómo se vuelve de la vista previa: con `desdeModal` ese modal (Ajustes, Perfiles) se oculta al abrir, conservando su entrada del historial, y se reabre al cerrar. */
    _ciclo(desdeModal) {
        return {
            antes: desdeModal ? () => ModalManager.cerrar(desdeModal, null, { sinHistorial: true }) : undefined,
            alCerrar: () => {
                this.actualizarIndicadoresConfig();
                if (desdeModal) ModalManager.abrir(desdeModal, null, { sinHistorial: true });
            }
        };
    }

    /** @returns {import('./vista-previa.js').ConfigVistaPrevia} */
    /** @returns {import('./vista-previa.js').ConfigVistaPrevia} */
    _configResumen(desdeModal) {
        return {
            id: 'resumen',
            titulo: 'Tarjeta de resumen',
            idObjetivo: 'card-resumen',
            ...this._ciclo(desdeModal),
            filas: [
                {
                    etiqueta: 'Fondo ilustrado',
                    descripcion: 'Ilustración decorativa de la tarjeta',
                    icono: '#icon-sparkle',
                    valor: () => TarjetaFondos._getLabelFondo(TarjetaFondos.getFondoCard()),
                    alTocar: () => { TarjetaFondos.toggleFondoCard(); this.actualizarIndicadoresConfig(); }
                },
                {
                    etiqueta: 'Estilo de tarjeta',
                    descripcion: 'Diseño de la tarjeta principal',
                    icono: '#icon-eye',
                    valor: () => EstiloTarjeta.etiqueta(),
                    alTocar: () => { EstiloTarjeta.siguiente(); this.actualizarIndicadoresConfig(); }
                }
            ]
        };
    }

    /** @returns {import('./vista-previa.js').ConfigVistaPrevia} */
    /** @returns {import('./vista-previa.js').ConfigVistaPrevia} */
    _configCalendario(desdeModal) {
        return {
            id: 'calendario',
            titulo: 'Calendario',
            idObjetivo: 'card-calendario',
            ...this._ciclo(desdeModal),
            filas: [
                {
                    etiqueta: 'Estilo de los días',
                    descripcion: 'Cómo se marcan los vencimientos en el calendario',
                    icono: '#icon-calendar',
                    valor: () => EstiloCalendario.etiqueta(),
                    alTocar: () => { EstiloCalendario.siguiente(); this.actualizarIndicadoresConfig(); }
                }
            ]
        };
    }

    // El tema no tiene tarjeta ni filas: se ve toda la página y se elige con círculos de color
    /** @returns {import('./vista-previa.js').ConfigVistaPrevia} */
    /** @returns {import('./vista-previa.js').ConfigVistaPrevia} */
    _configTema(desdeModal) {
        return {
            id: 'tema',
            titulo: 'Tema de color',
            sinVelo: true,
            ...this._ciclo(desdeModal),
            filas: [],
            circulos: {
                opciones: TEMAS,
                actual: () => GestorTemas.actual(),
                alElegir: (id) => { GestorTemas.elegirTema(id); this.actualizarIndicadoresConfig(); }
            }
        };
    }

    /** Las tres vistas previas están integradas: desde el panel se pasa de una a otra (ver VistaPrevia.cambiar). */
    registrarVistasPrevias() {
        VistaPrevia.registrarVista('resumen', () => this._configResumen(null));
        VistaPrevia.registrarVista('calendario', () => this._configCalendario(null));
        VistaPrevia.registrarVista('tema', () => this._configTema(null));
        VistaPrevia.definirOrden(['resumen', 'calendario', 'tema']);
    }

    abrirVistaPreviaResumen({ desdeModal = null } = {}) { VistaPrevia.abrir(this._configResumen(desdeModal)); }
    abrirVistaPreviaCalendario({ desdeModal = null } = {}) { VistaPrevia.abrir(this._configCalendario(desdeModal)); }
    abrirVistaPreviaTema({ desdeModal = null } = {}) { VistaPrevia.abrir(this._configTema(desdeModal)); }

    // ── Ingresos ──────────────────────────────────────────────
    ingresosHabilitado() {
        return StorageHelper.getItem(STORAGE_KEYS.INGRESOS_HABILITADO) === 'true';
    }

    toggleIngresos() {
        this.setIngresos(!this.ingresosHabilitado());
    }

    /** Activa o desactiva el registro de ingresos (`silencioso`: sin aviso ni cierre del menú, para el asistente inicial). */
    setIngresos(nuevoEstado, { silencioso = false } = {}) {
        StorageHelper.setItem(STORAGE_KEYS.INGRESOS_HABILITADO, nuevoEstado.toString());
        this.actualizarIndicadoresConfig();
        this.app.vista.renderServicios();
        if (!silencioso) {
            this.mostrarToast(`Registro de ingresos ${nuevoEstado ? 'habilitado' : 'deshabilitado'}`, 'success');
        }
        this.app.estadisticas.actualizarSelectServicios();
        const selectServicio = $('calculador-servicio');
        if (!nuevoEstado && selectServicio?.value === this.app.SERVICIO_INGRESOS_ID) {
            selectServicio.value = '';
            this.app.calculador.calcularPeriodo();
        }
    }

    // ── Modales ───────────────────────────────────────────────
    /** Abre un modal; si Ajustes está abierto lo reemplaza y al cerrar el modal se vuelve a Ajustes. */
    abrirModal(modalId) {
        ModalManager.abrirConPadre(modalId, 'modal-config');
    }

    cerrarModal(modalId) {
        ModalManager.cerrarConRetorno(modalId);
    }

    cerrarTodosLosModales() {
        ModalManager.cerrarTodos();
    }

    // ── Perfiles y ajustes (modales: header → Perfiles → Ajustes → cada opción) ──
    abrirPerfiles() {
        this.app.perfil.abrirModal();
    }

    /** Ajustes: si Perfiles está abierto se pasa de uno a otro (y Cerrar vuelve); si no, se abre directo. */
    abrirAjustes() {
        this.actualizarIndicadoresConfig();
        ModalManager.abrirConPadre('modal-config', 'modal-selector-perfiles');
    }

    abrirAyuda() {
        AyudaBuscador.limpiar();
        const padre = ['modal-config', 'modal-selector-perfiles'].find(id => $(id)?.classList.contains('show'));
        if (padre) ModalManager.alternar(padre, 'modal-ayuda');
        else ModalManager.abrir('modal-ayuda');
    }

    // ── Menú agregar ──────────────────────────────────────────
    toggleMenuAgregar() {
        const menu = $('menu-agregar');
        if (menu.classList.contains('active') || menu.classList.contains('show')) {
            this.cerrarMenuAgregar();
            return;
        }
        $('menu-agregar-overlay')?.classList.add('active');
        ModalManager.abrir('menu-agregar');
    }

    cerrarMenuAgregar() {
        const menu = $('menu-agregar');
        const overlay = $('menu-agregar-overlay');
        const estabaAbierto = menu && (menu.classList.contains('active') || menu.classList.contains('show'));
        if (!estabaAbierto) return;

        overlay?.classList.remove('active');
        this._resetVistaMenuAgregar();
        ModalManager.cerrar('menu-agregar');
    }

    _resetVistaMenuAgregar() {
        $('menu-vista-principal')?.classList.remove('hidden-vista');
        const vistaCalc = $('menu-vista-calcular');
        if (vistaCalc) {
            vistaCalc.classList.remove('visible-vista');
            vistaCalc.classList.add('hidden-vista');
        }
    }

    actualizarMenuAgregar() {
        const btnRecibo = $('menu-agregar-recibo');
        if (btnRecibo) btnRecibo.classList.toggle('visible', this.ingresosHabilitado());
    }

    // ── Modal factura rápida ──────────────────────────────────
    abrirModalFacturaRapida() {
        if (EstadoApp.servicios.length === 0) {
            this.mostrarToast('Primero debes crear un servicio', 'error');
            this.app.servicio.abrirModalServicio();
            return;
        }
        const primero = [...EstadoApp.servicios]
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))[0];
        this.app.factura.abrirModal(primero.id, null, 'menu');
    }

    // ── Cotización dólar ──────────────────────────────────────
    async cargarCotizacionDolar() {
        try {
            const res = await fetch('https://dolarapi.com/v1/dolares');
            if (!res.ok) throw new Error('Error al obtener cotización');
            const data = await res.json();
            const oficial = data.find(d => d.casa === 'oficial');
            const mep = data.find(d => d.casa === 'bolsa');
            const fmt = v => v != null
                ? `$${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '-';
            const elOficial = $('dolar-oficial');
            const elMep = $('dolar-mep');
            const elHora = $('dolar-hora');
            if (elOficial) elOficial.textContent = oficial ? fmt(oficial.venta) : '-';
            if (elMep) elMep.textContent = mep ? fmt(mep.venta) : '-';
            if (elHora) elHora.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch {
            const elHora = $('dolar-hora');
            if (elHora) elHora.textContent = 'sin conexión';
        }
    }

    // ── Toast ─────────────────────────────────────────────────
    /** @param {string} mensaje @param {string} [tipo] @param {number} [duracion] @param {string | null} [detalle] @param {{ label: string, fn: () => void } | (() => void) | null} [accion] */
    mostrarToast(mensaje, tipo = 'success', duracion = 3000, detalle = null, accion = null) {
        ToastManager.mostrarToast(mensaje, tipo, duracion, detalle, accion);
    }

    cerrarToastActual() {
        ToastManager.cerrarActual();
    }

    volverDesdeModalActivo() {
        // 1. Context menu abierto tiene prioridad máxima
        const ctxMenu = $('ctx-menu-servicio');
        if (ctxMenu && (ctxMenu.classList.contains('active') || ctxMenu.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('ctx-menu-servicio');
            return;
        }

        // 2. Modales en pantalla (el superior en orden DOM)
        const modales = Array.from(document.querySelectorAll('.modal.show, .modal.active'));
        if (modales.length > 0) {
            const topModal = modales[modales.length - 1];
            ModalManager.ejecutarAccionCierre(topModal.id);
            return;
        }

        // 3. Paneles laterales
        const menuAgregar = $('menu-agregar');
        if (menuAgregar && (menuAgregar.classList.contains('active') || menuAgregar.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('menu-agregar');
            return;
        }

        this.cerrarTodosLosModales();
    }
}

