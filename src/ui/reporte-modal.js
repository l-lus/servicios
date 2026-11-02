import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { ReporteHTML, SECCIONES_MENSUAL, SECCIONES_INDIVIDUAL } from '../services/reporte-html.js';
import { ReportesTexto } from '../services/reportes-texto.js';

// ============================================================
// REPORTE — modal para elegir formato (HTML o texto) y secciones antes de generar
// ============================================================
const $ = id => document.getElementById(id);

export class ReporteModal {
    constructor(app) {
        this.app = app;
        this.formato = 'html';
        this.modo = 'mensual';
    }

    /** Qué se va a reportar según la tarjeta de estadísticas (mes seleccionado o servicio con rango). null si falta algo. */
    _contexto() {
        if (this.app.tipoEstadisticaActual === 'individual') {
            const servicioId = $('calculador-servicio')?.value;
            const servicio = EstadoApp.servicios.find(s => s.id === servicioId);
            if (!servicio) { this.app.ui.mostrarToast('Seleccioná un servicio primero', 'info'); return null; }
            return { modo: 'individual', servicio, desde: $('calculador-desde')?.value || '', hasta: $('calculador-hasta')?.value || '' };
        }
        const valor = $('select-mes-estadisticas')?.value;
        const hoy = new Date();
        const [anio, mes] = valor ? valor.split('-').map(Number) : [hoy.getFullYear(), hoy.getMonth() + 1];
        return { modo: 'mensual', mes: mes - 1, anio, categoria: this.app._estadisticaCategoriaActiva || null };
    }

    _secciones() {
        const todas = this.modo === 'individual' ? SECCIONES_INDIVIDUAL : SECCIONES_MENSUAL;
        // Los ingresos solo se ofrecen (y se incluyen) si la función está activada
        return todas.filter(s => s.id !== 'ingresos' || this.app.ui.ingresosHabilitado());
    }

    _render() {
        const esHtml = this.formato === 'html';
        document.querySelectorAll('#modal-reporte .reporte-formato').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.formato === this.formato)));
        // El texto plano siempre incluye todo: las secciones solo aplican al reporte HTML
        $('reporte-secciones').hidden = !esHtml;
        montar($('reporte-secciones-lista'), html`${this._secciones().map(s => html`
            <button type="button" class="reporte-seccion btn-activo" data-seccion="${s.id}" aria-pressed="true">
                <span>${s.etiqueta}</span><span class="toggle-switch" aria-hidden="true"></span>
            </button>`)}`);
    }

    abrir() {
        const ctx = this._contexto();
        if (!ctx) return;
        this.modo = ctx.modo;
        $('reporte-contexto').textContent = ctx.modo === 'individual'
            ? `Servicio: ${ctx.servicio.nombre}`
            : `Mes: ${new Date(ctx.anio, ctx.mes, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}${ctx.categoria ? ` · ${ctx.categoria}` : ''}`;
        this._render();
        this.app.ui.abrirModal('modal-reporte');
    }

    generar() {
        const ctx = this._contexto();
        if (!ctx) return;
        const secciones = {};
        document.querySelectorAll('#reporte-secciones-lista .reporte-seccion').forEach(b => { secciones[b.dataset.seccion] = b.getAttribute('aria-pressed') === 'true'; });
        const esHtml = this.formato === 'html';
        if (esHtml && !Object.values(secciones).some(Boolean)) { this.app.ui.mostrarToast('Seleccioná al menos una sección', 'error'); return; }

        try {
            const ingresosHabilitado = this.app.ui.ingresosHabilitado();
            if (esHtml) {
                if (!ingresosHabilitado) secciones.ingresos = false;
                const r = ctx.modo === 'individual'
                    ? ReporteHTML.individual({ servicio: ctx.servicio, desde: ctx.desde, hasta: ctx.hasta, secciones })
                    : ReporteHTML.mensual({ servicios: EstadoApp.servicios, mes: ctx.mes, anio: ctx.anio, categoria: ctx.categoria, secciones });
                this.app.utils.descargarBlob(r.documento, r.nombreArchivo, 'text/html;charset=utf-8');
            } else {
                const r = ctx.modo === 'individual'
                    ? ReportesTexto.individual({ servicio: ctx.servicio, desde: ctx.desde, hasta: ctx.hasta })
                    : ReportesTexto.mensual({ servicios: EstadoApp.servicios, mes: ctx.mes, anio: ctx.anio, categoria: ctx.categoria, ingresosHabilitado });
                this.app.utils.descargarBlob(r.texto, r.nombreArchivo);
            }
            this.app.ui.cerrarModal('modal-reporte');
            this.app.ui.mostrarToast('Reporte generado', 'success');
        } catch (e) {
            console.error('Error generando reporte:', e);
            this.app.ui.mostrarToast('Error al generar el reporte', 'error');
        }
    }

    bindEventos() {
        document.querySelectorAll('#modal-reporte .reporte-formato').forEach(b => {
            b.addEventListener('click', () => { this.formato = b.dataset.formato; this._render(); });
        });
        $('reporte-secciones-lista').addEventListener('click', (e) => {
            const boton = e.target.closest('.reporte-seccion');
            if (!boton) return;
            const activo = boton.getAttribute('aria-pressed') !== 'true';
            boton.setAttribute('aria-pressed', String(activo));
            boton.classList.toggle('btn-activo', activo);
        });
        $('btn-reporte-generar').addEventListener('click', () => this.generar());
        $('btn-reporte-cancelar').addEventListener('click', () => this.app.ui.cerrarModal('modal-reporte'));
    }
}
