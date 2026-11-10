import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { Calculadora } from '../services/calculadora.js';
import { Anim } from './animaciones.js';
import { $ } from '../core/dom.js';

// ============================================================
// CALCULADOR SERVICE — modo calculadora flotante + calculador
//                      de período + generación de reportes
// ============================================================
export class CalculadorService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get servicios() { return EstadoApp.servicios; }
    get modoActivo() { return this.app.modoCalculadora; }
    set modoActivo(v) { this.app.modoCalculadora = v; }
    get tipo() { return this.app.modoCalculadoraTipo; }
    set tipo(v) { this.app.modoCalculadoraTipo = v; }
    get seleccionados() { return this.app.serviciosSeleccionados; }

    // ── Modo calculadora flotante ─────────────────────────────
    activarModo(silencioso = false) {
        this.modoActivo = true;
        this.seleccionados.clear();
        $('btn-agregar-servicio').classList.add('modo-calculadora');
        this.actualizar();
        this.app.vista.renderServicios();
        if (!silencioso) {
            const flotante = $('calculadora-flotante');
            flotante.classList.add('visible');
            flotante.onclick = () => {
                const arsVal = this.app._calcTotalARS ?? 0;
                const usdVal = this.app._calcTotalUSD ?? 0;
                const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(2);
                let texto = fmt(arsVal);
                if (usdVal > 0) texto += ` / ${fmt(usdVal)}`;
                navigator.clipboard.writeText(texto).then(() => {
                    const contador = $('calculadora-contador');
                    const original = contador.textContent;
                    contador.textContent = '✓ Copiado';
                    setTimeout(() => { contador.textContent = original; }, 1200);
                });
            };
        }
    }

    desactivarModo(silencioso = false) {
        this.modoActivo = false;
        this.tipo = 'pendientes';
        this.seleccionados.clear();
        $('btn-agregar-servicio').classList.remove('modo-calculadora');
        this.actualizar();
        this.app.vista.renderServicios();
        $('calculadora-flotante').classList.remove('visible');
        if (!silencioso) this.app.ui.mostrarToast('Calculadora Desactivada', 'info');
    }

    toggleServicio(servicioId) {
        if (!this.modoActivo) return;
        if (this.seleccionados.has(servicioId)) {
            this.seleccionados.delete(servicioId);
            if (this.seleccionados.size === 0) { this.desactivarModo(); return; }
        } else {
            this.seleccionados.add(servicioId);
        }
        this.actualizar();
        this.app.vista.renderServicios();
    }

    actualizar() {
        if (!this.modoActivo) return;
        const { totalARS, totalUSD, cantidad: contadorFacturas } = Calculadora.totalSeleccion(this.servicios, this.seleccionados, this.tipo);
        this.app._calcTotalARS = totalARS;
        this.app._calcTotalUSD = totalUSD;
        $('calculadora-total').textContent = this.app.utils.formatearMoneda(totalARS, 'ars');
        const elUSD = $('calculadora-total-usd');
        if (totalUSD > 0) { elUSD.textContent = this.app.utils.formatearMoneda(totalUSD, 'usd'); elUSD.classList.add('visible'); }
        else { elUSD.classList.remove('visible'); }
        $('calculadora-contador').textContent =
            `${contadorFacturas} ${contadorFacturas === 1 ? 'factura' : 'facturas'}`;
    }

    // ── Calculador de período ─────────────────────────────────
    calcularPeriodo() {
        const selectServicio = $('calculador-servicio');
        const inputDesde = $('calculador-desde');
        const inputHasta = $('calculador-hasta');
        const resultadosContainer = $('calculador-resultados');
        if (!selectServicio || !inputDesde || !inputHasta || !resultadosContainer) return;

        const servicioId = selectServicio.value;
        const desde = inputDesde.value, hasta = inputHasta.value;
        let totalRegistros = 0, variacionTexto = '0%', variacionUSDTexto = null;
        let _arsTotal = 0, _usdTotal = 0, _arsCount = 0, _usdCount = 0;

        const servicio = servicioId ? this.servicios.find(s => s.id === servicioId) : null;
        if (servicio) {
            ({ totalRegistros, variacionTexto, variacionUSDTexto, arsTotal: _arsTotal, usdTotal: _usdTotal, arsCount: _arsCount, usdCount: _usdCount } =
                Calculadora.analizarPeriodo(servicio, desde, hasta));
        }

        const estadoCalculador = { servicioId, desde, hasta, totalRegistros, _arsTotal, _usdTotal, variacionTexto, variacionUSDTexto };
        const calculadorCambio = this.app.utils.objetosCambiaron(this.app.ultimoEstadoCalculador, estadoCalculador);
        const _hayARS = _arsTotal !== 0, _hayUSD = _usdTotal !== 0;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const _montoHTML = _hayARS ? fmt(_arsTotal, 'ars') : _hayUSD ? fmt(_usdTotal, 'usd') : fmt(0, 'ars');
        const _montoUSDItem = _hayUSD ? html`<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Total USD</span><span class="calculador-resultado-valor">${fmt(_usdTotal, 'usd')}</span></div>` : '';
        const _promARS = _arsCount > 0 ? _arsTotal / _arsCount : 0;
        const _promUSD = _usdCount > 0 ? _usdTotal / _usdCount : 0;
        const _promHTML = _hayARS ? fmt(_promARS, 'ars') : _hayUSD ? fmt(_promUSD, 'usd') : fmt(0, 'ars');
        const _promUSDItem = _hayUSD ? html`<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Promedio USD</span><span class="calculador-resultado-valor">${fmt(_promUSD, 'usd')}</span></div>` : '';
        const _varUSDItem = variacionUSDTexto != null ? html`<div class="calculador-resultado-item"><span class="calculador-resultado-label">Variación USD</span><span class="calculador-resultado-valor">${variacionUSDTexto}</span></div>` : '';
        const generarResultadosHTML = (registros, variacion) => html`
<div class="calculador-resultado-item"><span class="calculador-resultado-label">Facturas</span><span class="calculador-resultado-valor">${registros}</span></div>
<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Total</span><span class="calculador-resultado-valor">${_montoHTML}</span></div>
${_montoUSDItem}
<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Promedio</span><span class="calculador-resultado-valor">${_promHTML}</span></div>
${_promUSDItem}
${variacion != null ? html`<div class="calculador-resultado-item"><span class="calculador-resultado-label">Variación</span><span class="calculador-resultado-valor">${variacion}</span></div>` : ''}
${_varUSDItem}`;
        const resultadosHTML = generarResultadosHTML(totalRegistros, variacionTexto);
        if (calculadorCambio) {
            Anim.morph(resultadosContainer, resultadosHTML, '.calculador-resultado-valor');
            this.app.ultimoEstadoCalculador = estadoCalculador;
        } else {
            montar(resultadosContainer, resultadosHTML);
        }
    }
}
