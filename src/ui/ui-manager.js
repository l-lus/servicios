import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { GestorTemas } from './gestor-temas.js';
import { Motion } from '../core/movimiento.js';
import { ModalManager } from './gestor-modales.js';
import { ToastManager } from './toast.js';

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
        const indicator = document.getElementById('blur-indicator');
        if (indicator) indicator.textContent = this.app.blurHabilitado ? 'SI' : 'NO';
        const el = document.getElementById('resumen-toggle');
        if (!this.app.blurHabilitado) {
            this.app.resumenDesblurado = true;
            if (el) el.classList.remove('resumen-blur');
        } else {
            this.app.resumenDesblurado = false;
            if (el) el.classList.add('resumen-blur');
        }
        this.mostrarToast(`Privacidad ${this.app.blurHabilitado ? 'habilitado' : 'deshabilitado'}`, 'success');
        this.cerrarMenuAjustes();
    }

    // ── Animaciones ───────────────────────────────────────────
    toggleAnimaciones() {
        Motion.siguienteModo();
        const indicator = document.getElementById('animaciones-indicator');
        if (indicator) indicator.textContent = Motion.etiqueta();
        const msg = { auto: 'Animaciones según el sistema', on: 'Animaciones reducidas', off: 'Animaciones completas' };
        this.mostrarToast(msg[Motion.modo()], 'success');
    }

    // ── Ingresos ──────────────────────────────────────────────
    ingresosHabilitado() {
        return StorageHelper.getItem(STORAGE_KEYS.INGRESOS_HABILITADO) === 'true';
    }

    toggleIngresos() {
        const nuevoEstado = !this.ingresosHabilitado();
        StorageHelper.setItem(STORAGE_KEYS.INGRESOS_HABILITADO, nuevoEstado.toString());
        const indicator = document.getElementById('ingresos-indicator');
        if (indicator) indicator.textContent = nuevoEstado ? 'SI' : 'NO';
        this.app.vista.renderServicios();
        this.mostrarToast(`Registro de ingresos ${nuevoEstado ? 'habilitado' : 'deshabilitado'}`, 'success');
        this.cerrarMenuAjustes();
        this.app.estadisticas.actualizarSelectServicios();
        const selectServicio = document.getElementById('calculador-servicio');
        if (!nuevoEstado && selectServicio?.value === this.app.SERVICIO_INGRESOS_ID) {
            selectServicio.value = '';
            this.app.calculador.calcularPeriodo();
        }
    }

    // ── Modales ───────────────────────────────────────────────
    abrirModal(modalId) {
        ModalManager.abrir(modalId);
    }

    cerrarModal(modalId) {
        ModalManager.cerrar(modalId);
    }

    cerrarTodosLosModales() {
        ModalManager.cerrarTodos();
    }

    // ── Menú ajustes ──────────────────────────────────────────
    toggleMenuAjustes() {
        const menu = document.getElementById('menu-ajustes');
        if (menu.classList.contains('active') || menu.classList.contains('show')) {
            this.cerrarMenuAjustes();
            return;
        }
        document.getElementById('menu-overlay')?.classList.add('active');
        ModalManager.abrir('menu-ajustes');
    }

    cerrarMenuAjustes() {
        const menu = document.getElementById('menu-ajustes');
        const overlay = document.getElementById('menu-overlay');
        const estabaAbierto = menu && (menu.classList.contains('active') || menu.classList.contains('show'));
        if (!estabaAbierto) return;

        overlay?.classList.remove('active');
        ['opciones-importacion', 'opciones-borrar', 'opciones-dolar',
            'menu-importar', 'menu-limpiar', 'menu-dolar'].forEach(id => {
                document.getElementById(id)?.classList.remove('open');
            });
        ModalManager.cerrar('menu-ajustes');
    }

    // ── Menú agregar ──────────────────────────────────────────
    toggleMenuAgregar() {
        const menu = document.getElementById('menu-agregar');
        if (menu.classList.contains('active') || menu.classList.contains('show')) {
            this.cerrarMenuAgregar();
            return;
        }
        document.getElementById('menu-agregar-overlay')?.classList.add('active');
        ModalManager.abrir('menu-agregar');
    }

    cerrarMenuAgregar() {
        const menu = document.getElementById('menu-agregar');
        const overlay = document.getElementById('menu-agregar-overlay');
        const estabaAbierto = menu && (menu.classList.contains('active') || menu.classList.contains('show'));
        if (!estabaAbierto) return;

        overlay?.classList.remove('active');
        this._resetVistaMenuAgregar();
        ModalManager.cerrar('menu-agregar');
    }

    _resetVistaMenuAgregar() {
        document.getElementById('menu-vista-principal')?.classList.remove('hidden-vista');
        const vistaCalc = document.getElementById('menu-vista-calcular');
        if (vistaCalc) {
            vistaCalc.classList.remove('visible-vista');
            vistaCalc.classList.add('hidden-vista');
        }
    }

    actualizarMenuAgregar() {
        const btnRecibo = document.getElementById('menu-agregar-recibo');
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
            const elOficial = document.getElementById('dolar-oficial');
            const elMep = document.getElementById('dolar-mep');
            const elHora = document.getElementById('dolar-hora');
            if (elOficial) elOficial.textContent = oficial ? fmt(oficial.venta) : '-';
            if (elMep) elMep.textContent = mep ? fmt(mep.venta) : '-';
            if (elHora) elHora.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch {
            const elHora = document.getElementById('dolar-hora');
            if (elHora) elHora.textContent = 'sin conexión';
        }
    }

    // ── Toast ─────────────────────────────────────────────────
    mostrarToast(mensaje, tipo = 'success', duracion = 3000, detalle = null, accion = null) {
        ToastManager.mostrarToast(mensaje, tipo, duracion, detalle, accion);
    }

    volverDesdeModalActivo() {
        // 1. Context menu abierto tiene prioridad máxima
        const ctxMenu = document.getElementById('ctx-menu-servicio');
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
        const menuAjustes = document.getElementById('menu-ajustes');
        if (menuAjustes && (menuAjustes.classList.contains('active') || menuAjustes.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('menu-ajustes');
            return;
        }

        const menuAgregar = document.getElementById('menu-agregar');
        if (menuAgregar && (menuAgregar.classList.contains('active') || menuAgregar.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('menu-agregar');
            return;
        }

        this.cerrarTodosLosModales();
    }
}
