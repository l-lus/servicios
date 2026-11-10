import { parseDate, fechaLocalISO } from '../core/fechas.js';
import { formatearMoneda, formatearFecha, plural } from '../core/formato.js';
import { SecurityAndUtils } from '../core/seguridad.js';
import { $ } from '../core/dom.js';

// ============================================================
// UTILS SERVICE — helpers puros, formateo, DOM liviano
// ============================================================
export class UtilsService {
    constructor(app) {
        this.app = app;
    }

    // ── Helpers puros (sin DOM ni estado) ────────────────────

    plural(n, singular, pl) {
        return plural(n, singular, pl);
    }

    mesActualInfo() {
        const ahora = new Date();
        const mes = ahora.getMonth();
        const anio = ahora.getFullYear();
        return {
            mes, anio,
            mesSiguiente: mes === 11 ? 0 : mes + 1,
            anioSiguiente: mes === 11 ? anio + 1 : anio,
            mesPasado: mes === 0 ? 11 : mes - 1,
            anioPasado: mes === 0 ? anio - 1 : anio,
        };
    }

    parseDate(str) {
        return parseDate(str);
    }

    objetosCambiaron(anterior, actual) {
        if (!anterior) return true;
        const keysA = Object.keys(anterior);
        const keysB = Object.keys(actual);
        if (keysA.length !== keysB.length) return true;
        for (const k of keysA) { if (anterior[k] !== actual[k]) return true; }
        return false;
    }

    formatearMoneda(monto, moneda = 'ars') {
        return formatearMoneda(monto, moneda);
    }

    formatearFecha(fecha) {
        return formatearFecha(fecha);
    }

    generarId() {
        return SecurityAndUtils.generarIDSeguro();
    }

    obtenerFechaLocal() {
        return fechaLocalISO();
    }

    descargarBlob(contenido, nombreArchivo, tipo = 'text/plain;charset=utf-8') {
        const blob = new Blob([contenido], { type: tipo });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nombreArchivo;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    idsFormFactura(esEditar) {
        const p = esEditar ? 'editar-factura' : 'factura';
        return {
            monto: `${p}-monto`,
            tipo: `${p}-tipo`,
            fecha: `${p}-fecha`,
            moneda: `${p}-moneda`,
            fechaPago: `${p}-fecha-pago`,
            conCredito: `${p}-con-credito`,
            servicio: `${p}-servicio`,
            btnPagada: esEditar ? 'btn-editar-toggle-pagada' : 'btn-toggle-pagada',
            btnCredito: esEditar ? 'btn-editar-toggle-credito' : 'btn-toggle-credito',
            btnMoneda: esEditar ? 'btn-editar-factura-moneda' : 'btn-factura-moneda',
            btnNegativo: esEditar ? 'btn-editar-toggle-negativo' : 'btn-toggle-negativo',
        };
    }

    setMonedaBtn(hiddenId, btnId, moneda) {
        const hidden = $(hiddenId);
        const btn = $(btnId);
        if (!hidden || !btn) return;
        const m = (moneda || 'ars').toLowerCase();
        hidden.value = m;
        btn.textContent = m.toUpperCase();
        btn.classList.toggle('activo-usd', m === 'usd');
    }

    postGuardado(descripcion = null) {
        this.app.storage.guardarDatos();
        this.app.guardarEstado(descripcion);
        this.app.vista.renderServicios();
    }

    limpiarBusqueda() {
        const searchInput = $('search-input');
        const searchClear = $('search-clear');
        if (!searchInput) return;
        // Que un filtrado pendiente no reaplique el término viejo
        this.app._busquedaDebounced?.cancel();
        searchInput.value = '';
        this.app.terminoBusqueda = '';
        searchClear.classList.remove('d-flex-force');
        if (this.app._catColapsadasAntesBusqueda !== null) {
            this.app._catColapsadas = this.app._catColapsadasAntesBusqueda;
            this.app._catColapsadasAntesBusqueda = null;
        }
        this.app.vista.renderServicios();
        setTimeout(() => { this.app.enModoBusqueda = false; }, 100);
    }

    toggleMoneda(hiddenId, btnId) {
        const hidden = $(hiddenId);
        const btn = $(btnId);
        if (!hidden || !btn) return;
        const nuevo = hidden.value === 'ars' ? 'usd' : 'ars';
        hidden.value = nuevo;
        btn.textContent = nuevo.toUpperCase();
        btn.classList.toggle('activo-usd', nuevo === 'usd');
        this.app.mostrarToast(nuevo === 'usd' ? 'Dolares' : 'Pesos', 'info');
    }
}
