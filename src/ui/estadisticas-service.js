import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { ResumenAnual } from '../services/resumen-anual.js';
import { ResumenMes } from '../services/resumen-mes.js';
import { Anim } from './animaciones.js';
import { CustomSelect } from './custom-select.js';

// ============================================================
// ESTADISTICAS SERVICE — resumen, estadísticas, calculador
// ============================================================
export class EstadisticasService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters ───────────────────────────────────────────────
    get servicios() { return EstadoApp.servicios; }

    // ── Resumen mensual ───────────────────────────────────────
    actualizarResumenMes() {
        this.app.datosResumen = ResumenMes.calcular(this.servicios);

        this.app.mostrandoPagadoMes = StorageHelper.getItem(STORAGE_KEYS.RESUMEN_MOSTRAR_PAGADO) === 'true';
        if (this.app.mostrandoPagadoMes) this.mostrarPagadoEnResumen();
        else this.mostrarPendienteEnResumen();
        this.actualizarEstadisticas();
    }

    obtenerColorBordeMasPrioritario() {
        return ResumenMes.colorBorde(this.servicios);
    }

    // ── Helpers resumen ───────────────────────────────────────
    _actualizarBordeResumen(colorBorde) {
        const card = document.getElementById('resumen-mes')?.closest('.card');
        if (card) {
            card.classList.remove('borde-vencido', 'borde-urgente', 'borde-proximo', 'borde-lejano', 'borde-pagado');
            if (colorBorde) card.classList.add(colorBorde);
        }
    }

    _buildValorResumen(montoARS, montoUSD, textoVacio) {
        const hayARS = montoARS > 0, hayUSD = montoUSD > 0;
        if (!hayARS && !hayUSD) return { valorMostrar: html`<span class="resumen-valor-vacio">${textoVacio}</span>`, hayARS, hayUSD };
        let valorMostrar;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        if (hayARS && hayUSD) {
            valorMostrar = html`<div class="resumen-valor">${fmt(montoARS, 'ars')}</div><div class="resumen-valor-usd">${fmt(montoUSD, 'usd')}</div>`;
        } else {
            valorMostrar = hayUSD ? fmt(montoUSD, 'usd') : fmt(montoARS, 'ars');
        }
        return { valorMostrar, hayARS, hayUSD };
    }

    mostrarPendienteEnResumen() { this.app.mostrandoPagadoMes = false; this._renderResumen('pendiente'); }
    mostrarPagadoEnResumen() { this.app.mostrandoPagadoMes = true; this._renderResumen('pagado'); }

    _renderResumen(tipo) {
        const esPendiente = tipo === 'pendiente';
        const fechaFormateada = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const colorBorde = this.obtenerColorBordeMasPrioritario();
        const totalARS = this.app.datosResumen.totalPeriodoARS || 0;
        let montoARS, montoUSD, porcentajePagado, contador, textoVacio, icono, titulo, label;
        if (esPendiente) {
            montoARS = this.app.datosResumen.pendienteARS || 0;
            montoUSD = this.app.datosResumen.pendienteUSD || 0;
            const pagadoDelMesARS = this.app.datosResumen.pagadoMesARS || 0;
            porcentajePagado = totalARS > 0 ? Math.min((pagadoDelMesARS / totalARS) * 100, 100) : (montoUSD === 0 ? 100 : 0);
            contador = this.app.datosResumen.cantidadPendientesEsteMes || 0;
            textoVacio = 'Al día'; icono = '#icon-deuda'; titulo = 'Resumen de Deuda';
            label = `Pendiente${contador > 0 ? ` (${contador})` : ''}`;
        } else {
            montoARS = this.app.datosResumen.pagadoMesARS || 0;
            montoUSD = this.app.datosResumen.pagadoMesUSD || 0;
            porcentajePagado = totalARS > 0 ? Math.min((montoARS / totalARS) * 100, 100) : 0;
            contador = this.app.datosResumen.cantidadPagadasVencenEsteMes || 0;
            textoVacio = 'Sin pagos'; icono = '#icon-pagado'; titulo = 'Resumen de Pagos';
            label = `Pagado${contador > 0 ? ` (${contador})` : ''}`;
        }
        const estadoActual = { tipo, montoARS, montoUSD, porcentajePagado, colorBorde, fecha: fechaFormateada };
        const debeAnimar = this.app.utils.objetosCambiaron(this.app.ultimoEstadoResumen, estadoActual);
        const { valorMostrar, hayARS, hayUSD } = this._buildValorResumen(montoARS, montoUSD, textoVacio);
        const resumenHTML = html`
<div class="resumen-monto" id="resumen-toggle">
<div class="d-flex justify-content-between align-items-center">
    <div class="resumen-titulo"><svg class="icon"><use href="${icono}" /></svg> ${titulo}</div>
    <button class="icon-btn transparent btn-sm" id="btn-info-resumen">
        <svg viewBox="0 0 24 24" class="icon-md" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>
    </button>
</div>
${(hayARS && hayUSD) ? valorMostrar : html`<div class="resumen-valor">${valorMostrar}</div>`}
<div class="resumen-footer">
    <div class="resumen-progreso"><div class="resumen-progreso-barra" id="resumen-progreso-barra"></div></div>
    <div class="resumen-label">${label}</div>
    <div class="resumen-fecha">${fechaFormateada}</div>
</div>
</div>`;
        const contResumen = document.getElementById('resumen-mes');
        if (debeAnimar) Anim.morph(contResumen, resumenHTML, '.resumen-valor, .resumen-valor-usd, .resumen-label');
        else montar(contResumen, resumenHTML);
        const barra = document.getElementById('resumen-progreso-barra');
        if (barra) barra.style.setProperty('--barra-w', `${porcentajePagado}%`);
        StorageHelper.setItem(STORAGE_KEYS.RESUMEN_MOSTRAR_PAGADO, esPendiente ? 'false' : 'true');
        const elBlur = document.getElementById('resumen-toggle');
        if (elBlur) elBlur.classList.toggle('resumen-blur', this.app.blurHabilitado && !this.app.resumenDesblurado && (hayARS || hayUSD));
        this.app.ultimoEstadoResumen = estadoActual;
        this._actualizarBordeResumen(colorBorde);
    }

    abrirModalInfoResumen() {
        const { vencenEsteMes, pagadasOtroMes } = ResumenMes.detalle(this.servicios);
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const renderFila = ({ servicio, factura, estado, badgeClass }) => html`
        <div class="info-resumen-fila">
            <div class="info-resumen-fila-izq"><span class="info-resumen-nombre">${servicio}</span><span class="info-resumen-badge ${badgeClass}">${estado}</span></div>
            <span class="info-resumen-monto">${fmt(factura.monto, factura.moneda || 'ars')}</span>
        </div>`;
        const renderFilaOtroMes = ({ servicio, factura, mesVenc }) => html`
        <div class="info-resumen-fila">
            <div class="info-resumen-fila-izq"><span class="info-resumen-nombre">${servicio}</span><span class="info-resumen-badge badge-pagada-otro-mes">Venció ${mesVenc}</span></div>
            <span class="info-resumen-monto">${fmt(factura.monto, factura.moneda || 'ars')}</span>
        </div>`;
        const partes = [];
        if (vencenEsteMes.length > 0) partes.push(html`<div class="info-resumen-grupo"><div class="info-resumen-grupo-titulo">Vencen este mes</div>${vencenEsteMes.map(renderFila)}</div>`);
        if (pagadasOtroMes.length > 0) partes.push(html`<div class="info-resumen-grupo"><div class="info-resumen-grupo-titulo">Pagadas este mes (otro vencimiento)</div>${pagadasOtroMes.map(renderFilaOtroMes)}</div>`);
        if (partes.length === 0) partes.push(html`<div class="text-center-muted">Sin movimientos este mes</div>`);
        montar(document.getElementById('modal-info-resumen-body'), html`${partes}`);
        this.app.ui.abrirModal('modal-info-resumen');
    }

    toggleResumen() {
        const resumenActual = document.getElementById('resumen-toggle');
        const estaBlureado = resumenActual?.classList.contains('resumen-blur');
        if (!this.app.resumenDesblurado && estaBlureado) {
            this.app.resumenDesblurado = true;
            resumenActual.classList.remove('resumen-blur');
            return;
        }
        if (!this.app.resumenDesblurado) this.app.resumenDesblurado = true;
        if (this.app.mostrandoPagadoMes) this.mostrarPendienteEnResumen();
        else this.mostrarPagadoEnResumen();
    }

    // ── Estadísticas anuales ──────────────────────────────────
    actualizarEstadisticasAnuales() {
        const cont = document.getElementById('estadisticas-anual-container');
        if (!cont) return;
        const anios = ResumenAnual.aniosDisponibles(this.servicios);
        const anio = anios.includes(this._anioAnual) ? this._anioAnual : anios[0];
        this._anioAnual = anio;

        if (!document.getElementById('select-anio-estadisticas')) {
            montar(cont, html`
<div class="calculador-campo"><label class="calculador-label">Año</label>
<div class="custom-select-wrapper" id="select-anio-estadisticas-csd"><div class="custom-select-trigger"><span class="csd-label"></span><svg class="csd-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div><div class="custom-select-dropdown"></div></div>
<select id="select-anio-estadisticas" class="select-mes-oculto"></select></div>
<div class="estadisticas-lista" id="estadisticas-anual-lista"></div>`);
            const select = document.getElementById('select-anio-estadisticas');
            const wrapper = document.getElementById('select-anio-estadisticas-csd');
            wrapper._customSelect = new CustomSelect(wrapper, select, () => {
                this._anioAnual = Number(select.value);
                this.actualizarEstadisticasAnuales();
            });
        }
        const select = document.getElementById('select-anio-estadisticas');
        montar(select, html`${anios.map(a => html`<option value="${a}" ${a === anio ? 'selected' : ''}>${a}</option>`)}`);
        select.value = String(anio);
        document.getElementById('select-anio-estadisticas-csd')._customSelect.refresh();

        const r = ResumenAnual.calcular(this.servicios, anio);
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const par = p => (p.ars > 0 || p.usd === 0 ? fmt(p.ars, 'ars') : fmt(p.usd, 'usd'));
        const nombreMes = i => new Date(2000, i, 1).toLocaleDateString('es-AR', { month: 'long' });
        const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
        const item = (label, valor, clase = '') => html`<div class="calculador-resultado-item"><span class="estadistica-label">${label}</span><span class="estadistica-valor ${clase}">${valor}</span></div>`;
        const medida = r.medida;
        const maximoMes = Math.max(1, ...r.meses.map(m => m[medida]));
        const maximoCat = Math.max(1, ...r.porCategoria.map(c => c[medida]));

        const colorVar = r.variacion === null ? '' : (r.variacion > 0 ? 'text-red' : 'text-green');
        const filas = html`
    ${item('Total del año', par(r.total))}
    ${r.total.ars > 0 && r.total.usd > 0 ? item('Total USD', fmt(r.total.usd, 'usd')) : ''}
    ${item('Promedio mensual', par(r.promedio))}
    ${r.mesMayor !== null ? item('Mes de mayor gasto', `${cap(nombreMes(r.mesMayor))} · ${fmt(r.meses[r.mesMayor][medida], medida)}`) : ''}
    ${r.mesMenor !== null ? item('Mes de menor gasto', `${cap(nombreMes(r.mesMenor))} · ${fmt(r.meses[r.mesMenor][medida], medida)}`) : ''}
    ${r.variacion !== null ? item(`Vs. ${anio - 1}`, `${r.variacion > 0 ? '+' : ''}${r.variacion.toFixed(1)}%`, colorVar) : ''}
    ${item('Facturas', `${r.facturas} (${r.pagadas} ${r.pagadas === 1 ? 'pagada' : 'pagadas'})`)}
    ${r.pendiente.ars > 0 || r.pendiente.usd > 0 ? item('Pendiente', par(r.pendiente)) : ''}
    ${this.app.ui.ingresosHabilitado() && r.porcentajeIngreso !== null ? item('% del ingreso anual', `${r.porcentajeIngreso.toFixed(1)}%`) : ''}
    <div class="anual-grafico" role="list" aria-label="Gasto por mes">${r.meses.map(m => html`
        <div class="anual-fila${m.mes === r.mesMayor ? ' anual-fila--mayor' : ''}" role="listitem">
            <span class="anual-etiqueta">${cap(nombreMes(m.mes).slice(0, 3))}</span>
            <span class="anual-pista"><span class="anual-barra" data-pct="${Math.round((m[medida] / maximoMes) * 100)}"></span></span>
            <span class="anual-monto">${m[medida] > 0 ? fmt(m[medida], medida) : '—'}</span>
        </div>`)}
    </div>
    ${r.porCategoria.length ? html`
    <div class="anual-grafico anual-categorias" role="list" aria-label="Gasto por categoría">
        <div class="anual-subtitulo">Por categoría</div>${r.porCategoria.slice(0, 6).map(c => html`
        <div class="anual-fila" role="listitem">
            <span class="anual-etiqueta anual-etiqueta--cat">${c.categoria || 'Sin categoría'}</span>
            <span class="anual-pista"><span class="anual-barra" data-pct="${Math.round((c[medida] / maximoCat) * 100)}"></span></span>
            <span class="anual-monto">${fmt(c[medida], medida)}</span>
        </div>`)}
    </div>` : ''}`;
        const lista = document.getElementById('estadisticas-anual-lista');
        montar(lista, r.facturas === 0 ? html`<span class="text-center-muted d-block sin-facturas-text">Sin facturas en ${anio}</span>` : filas);
        // La CSP no admite style en línea: el ancho de cada barra se asigna por JS (CSSOM)
        lista.querySelectorAll('.anual-barra').forEach(b => b.style.setProperty('--barra-w', `${b.dataset.pct}%`));
    }

    // ── Estadísticas mensuales ────────────────────────────────
    actualizarEstadisticas() {
        if (this.app.tipoEstadisticaActual === 'anual') { this.actualizarEstadisticasAnuales(); return; }
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth(), añoActual = hoy.getFullYear();
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        const yaExisteSelector = !!selectMes;
        if (selectMes?.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año); mesSeleccionado = parseInt(mes) - 1;
        } else { mesSeleccionado = mesActual; añoSeleccionado = añoActual; }

        const categoriaActiva = this.app._estadisticaCategoriaActiva || null;
        const { totalMesARS, totalMesUSD, totalPagadoMesARS, totalPagadoMesUSD, cantidadPendientes, cantidadPagadas, cantidadVencidas, cantidadFacturasMes, totalIngresosARS, totalIngresosUSD } =
            ResumenMes.estadisticasMes(this.servicios, { mes: mesSeleccionado, anio: añoSeleccionado, categoria: categoriaActiva });

        const estadoActual = { totalMesARS, totalMesUSD, totalPagadoMesARS, totalPagadoMesUSD, cantidadPendientes, cantidadPagadas, cantidadVencidas, cantidadFacturasMes, totalIngresosARS, totalIngresosUSD, mesSeleccionado, añoSeleccionado, categoriaActiva };
        const estadoCambio = this.app.utils.objetosCambiaron(this.app.ultimoEstadoEstadisticas, estadoActual);
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);

        const renderizarContenido = () => {
            const hayUSDMes = totalMesUSD > 0, hayARSMes = totalMesARS > 0;
            const montoHTML = hayARSMes ? fmt(totalMesARS, 'ars') : hayUSDMes ? fmt(totalMesUSD, 'usd') : fmt(0, 'ars');
            const montoUSDItem = hayUSDMes ? html`<div class="calculador-resultado-item"><span class="estadistica-label">Monto USD</span><span class="estadistica-valor">${fmt(totalMesUSD, 'usd')}</span></div>` : '';
            let ingresosHTML = '';
            if (this.app.ui.ingresosHabilitado()) {
                const hayIngUSD = totalIngresosUSD > 0, hayIngARS = totalIngresosARS > 0;
                const ingMontoHTML = hayIngARS ? fmt(totalIngresosARS, 'ars') : hayIngUSD ? fmt(totalIngresosUSD, 'usd') : fmt(0, 'ars');
                const ingUSDItem = hayIngUSD ? html`<div class="calculador-resultado-item"><span class="estadistica-label">Ingresos USD</span><span class="estadistica-valor">${fmt(totalIngresosUSD, 'usd')}</span></div>` : '';
                let porcentajeIngresosHTML = '';
                if (hayIngARS && totalMesARS > 0) {
                    const pct = (totalMesARS / totalIngresosARS) * 100;
                    const colorClass = pct < 25 ? 'text-green' : pct < 50 ? 'text-blue' : pct < 75 ? 'text-gold' : 'text-red';
                    porcentajeIngresosHTML = html`<div class="calculador-resultado-item"><span class="estadistica-label">% del ingreso</span><span class="estadistica-valor ${colorClass}">${pct.toFixed(1)}%</span></div>`;
                }
                ingresosHTML = html`<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="ingresos"><span class="estadistica-label">Ingresos</span><span class="estadistica-valor">${ingMontoHTML}</span></div>${ingUSDItem}${porcentajeIngresosHTML}`;
            }
            const itemsHTML = html`
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas"><span class="estadistica-label">Monto en facturas</span><span class="estadistica-valor">${montoHTML}</span></div>
    ${montoUSDItem}
    ${totalPagadoMesARS > 0 ? html`<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto"><span class="estadistica-label">Monto pagado</span><span class="estadistica-valor">${fmt(totalPagadoMesARS, 'ars')}</span></div>` : ''}
    ${totalPagadoMesUSD > 0 ? html`<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto"><span class="estadistica-label">Monto USD (Pagado)</span><span class="estadistica-valor">${fmt(totalPagadoMesUSD, 'usd')}</span></div>` : ''}
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas"><span class="estadistica-label">Facturas</span><span class="estadistica-valor">${cantidadFacturasMes}</span></div>
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pendientes"><span class="estadistica-label">Pendientes</span><span class="estadistica-valor">${cantidadPendientes}</span></div>
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagadas"><span class="estadistica-label">Pagadas</span><span class="estadistica-valor">${cantidadPagadas}</span></div>
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="vencidas"><span class="estadistica-label">Vencidas</span><span class="estadistica-valor">${cantidadVencidas}</span></div>
    ${ingresosHTML}`;
            const lista = document.querySelector('#estadisticas-mensual-container .estadisticas-lista');
            if (!lista) return;
            if (estadoCambio) Anim.morph(lista, itemsHTML, '.estadistica-valor');
            else montar(lista, itemsHTML);
        };

        const hayDatos = this.servicios.length > 0 && this.servicios.some(s => s.facturas?.length > 0);
        if (!yaExisteSelector || !hayDatos) {
            montar(document.getElementById('estadisticas-mensual-container'), html`
<div class="calculador-campo"><label class="calculador-label">Mes</label>
<div class="custom-select-wrapper" id="select-mes-estadisticas-csd"><div class="custom-select-trigger"><span class="csd-label"></span><svg class="csd-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div><div class="custom-select-dropdown"></div></div>
<select id="select-mes-estadisticas" class="select-mes-oculto"></select></div>
<div id="estadisticas-categorias-tags"></div><div class="estadisticas-lista"></div>`);
            const select = document.getElementById('select-mes-estadisticas');
            montar(select, this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado));
            const wrapper = document.getElementById('select-mes-estadisticas-csd');
            const cs = new CustomSelect(wrapper, select, () => this.actualizarEstadisticas());
            wrapper._customSelect = cs;
            this._renderTagsCategoriaEstadisticas();
            renderizarContenido();
            this.app.ultimoEstadoEstadisticas = estadoActual;
        } else {
            const selectActual = document.getElementById('select-mes-estadisticas');
            if (selectActual) {
                const valorActual = selectActual.value;
                montar(selectActual, this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado));
                if (Array.from(selectActual.options).some(opt => opt.value === valorActual)) selectActual.value = valorActual;
                const csd = document.getElementById('select-mes-estadisticas-csd');
                if (csd?._customSelect) csd._customSelect.refresh();
            }
            this._renderTagsCategoriaEstadisticas();
            renderizarContenido();
            this.app.ultimoEstadoEstadisticas = estadoActual;
        }
    }

    _renderTagsCategoriaEstadisticas() {
        const container = document.getElementById('estadisticas-categorias-tags');
        if (!container) return;
        const cats = this.app.categoria.getCategorias();
        const catsUsadas = cats.filter(c => this.servicios.some(s => s.id !== this.app.SERVICIO_INGRESOS_ID && s.categoria === c));
        if (catsUsadas.length === 0) { container.replaceChildren(); return; }
        const activa = this.app._estadisticaCategoriaActiva || null;
        const tagsHTML = catsUsadas.map(c => html`<button class="est-cat-tag${c === activa ? ' est-cat-tag--activa' : ''}" data-cat="${c}">${c}</button>`);
        montar(container, html`<div class="est-cat-tags-row">${tagsHTML}</div>`);
        container.querySelectorAll('.est-cat-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                this.app._estadisticaCategoriaActiva = this.app._estadisticaCategoriaActiva === cat ? null : cat;
                this.app.ultimoEstadoEstadisticas = null;
                this.actualizarEstadisticas();
            });
        });
    }

    toggleEstadisticas() {
        const content = document.getElementById('estadisticas-content');
        const chevron = document.getElementById('estadisticas-chevron');
        content.classList.toggle('collapsed');
        chevron.classList.toggle('collapsed');
        const estaColapsado = content.classList.contains('collapsed');
        StorageHelper.setItem(STORAGE_KEYS.ESTADISTICAS_COLAPSADAS, estaColapsado);
        if (!estaColapsado) {
            document.getElementById('estadisticas-tipo').value = this.app.tipoEstadisticaActual;
            const csdEstTipo = document.getElementById('estadisticas-tipo-csd');
            if (csdEstTipo?._customSelect) csdEstTipo._customSelect.refresh();
            this.cambiarTipoEstadistica();
        }
    }

    cambiarTipoEstadistica() {
        const tipo = this.app.tipoEstadisticaActual;
        const contenedores = { mensual: 'estadisticas-mensual-container', individual: 'estadisticas-individual-container', anual: 'estadisticas-anual-container' };
        Object.entries(contenedores).forEach(([clave, id]) => {
            const el = document.getElementById(id);
            el.classList.toggle('visible', clave === tipo);
            el.classList.toggle('hidden', clave !== tipo);
        });
        // El reporte solo existe para el mes y para un servicio
        document.getElementById('btn-reporte-estadisticas').classList.toggle('hidden', tipo === 'anual');
        if (tipo === 'mensual') this.actualizarEstadisticas();
        else if (tipo === 'anual') this.actualizarEstadisticasAnuales();
        else this.app.calculador.calcularPeriodo();
    }

    // ── Select servicios (calculador) ─────────────────────────
    actualizarSelectServicios() {
        const select = document.getElementById('calculador-servicio');
        if (!select) return;
        const valorActual = select.value;
        const serviciosActivos = this.servicios
            .filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        const opciones = [html`<option value="">Seleccionar servicio...</option>`];
        serviciosActivos.forEach(s => {
            opciones.push(html`<option value="${s.id}" ${s.id === valorActual ? 'selected' : ''}>${s.nombre}</option>`);
        });
        if (this.app.ui.ingresosHabilitado() && this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID)) {
            opciones.push(html`<option value="${this.app.SERVICIO_INGRESOS_ID}" ${this.app.SERVICIO_INGRESOS_ID === valorActual ? 'selected' : ''}>Ingresos</option>`);
        }
        montar(select, html`${opciones}`);
        const csd = document.getElementById('calculador-servicio-csd');
        if (csd?._customSelect) csd._customSelect.refresh();
        if (valorActual && !this.servicios.find(s => s.id === valorActual)) {
            select.value = ''; this.app.calculador.calcularPeriodo();
        } else if (valorActual) { this.app.calculador.calcularPeriodo(); }
    }

    inicializarCalculador() {
        const selectServicio = document.getElementById('calculador-servicio');
        if (!selectServicio) return;
        this.actualizarSelectServicios();
        const csdWrapper = document.getElementById('calculador-servicio-csd');
        if (csdWrapper && !csdWrapper._customSelect) {
            csdWrapper._customSelect = new CustomSelect(csdWrapper, selectServicio, () => this.app.calculador.calcularPeriodo());
        }
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        selectServicio.addEventListener('change', () => this.app.calculador.calcularPeriodo());
        inputDesde.addEventListener('change', () => this.app.calculador.calcularPeriodo());
        inputHasta.addEventListener('change', () => this.app.calculador.calcularPeriodo());
        document.getElementById('btn-calculador-desde-hoy').addEventListener('click', () => {
            inputDesde.value = inputDesde.value ? '' : this.app.utils.obtenerFechaLocal();
            this.app.calculador.calcularPeriodo();
        });
        document.getElementById('btn-calculador-hasta-hoy').addEventListener('click', () => {
            inputHasta.value = inputHasta.value ? '' : this.app.utils.obtenerFechaLocal();
            this.app.calculador.calcularPeriodo();
        });
    }

    // ── Opciones de mes ───────────────────────────────────────
    generarOpcionesMeses(mesSeleccionado, añoSeleccionado) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const mesesConFacturas = new Set();
        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const f = this.app.utils.parseDate(factura.fecha);
                mesesConFacturas.add(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
            });
        });
        const mesesOrdenados = Array.from(mesesConFacturas).sort((a, b) => b.localeCompare(a));
        if (mesesOrdenados.length === 0) {
            const clave = `${añoSeleccionado}-${String(mesSeleccionado + 1).padStart(2, '0')}`;
            return html`<option value="${clave}">${meses[mesSeleccionado]} ${añoSeleccionado}</option>`;
        }
        return html`${mesesOrdenados.map(clave => {
            const [año, mes] = clave.split('-');
            const esSeleccionado = parseInt(año) === añoSeleccionado && parseInt(mes) - 1 === mesSeleccionado;
            return html`<option value="${clave}" ${esSeleccionado ? 'selected' : ''}>${meses[parseInt(mes) - 1]} ${año}</option>`;
        })}`;
    }

    abrirDebugEstadisticas(tipo) {
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        if (selectMes && selectMes.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año);
            mesSeleccionado = parseInt(mes) - 1;
        } else {
            const hoy = new Date();
            mesSeleccionado = hoy.getMonth();
            añoSeleccionado = hoy.getFullYear();
        }

        const categoriaActiva = this.app._estadisticaCategoriaActiva || null;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        const titulos = {
            'facturas': 'Facturas del mes',
            'pendientes': 'Pendientes',
            'pagadas': 'Pagadas este mes',
            'vencidas': 'Vencidas',
            'pagado-monto': 'Monto pagado',
            'ingresos': 'Ingresos',
        };

        document.getElementById('modal-debug-titulo').textContent = titulos[tipo] || 'Detalle';

        let items = [];

        EstadoApp.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.app.SERVICIO_INGRESOS_ID) {
                if ((servicio.categoria || '') !== categoriaActiva) return;
            }

            servicio.facturas.forEach(factura => {
                const fechaVenc = this.app.utils.parseDate(factura.fecha);
                fechaVenc.setHours(0, 0, 0, 0);
                const esDelMes = fechaVenc.getMonth() === mesSeleccionado && fechaVenc.getFullYear() === añoSeleccionado;
                const esServicioIngresos = servicio.id === this.app.SERVICIO_INGRESOS_ID;
                const moneda = factura.moneda || 'ars';

                let incluir = false;

                switch (tipo) {
                    case 'facturas':
                        // Igual que cantidadFacturasMes: del mes, positivas, no ingresos
                        incluir = esDelMes && !esServicioIngresos && factura.monto >= 0;
                        break;

                    case 'pendientes':
                        // Igual que cantidadPendientes: del mes, no pagadas, no vencidas
                        incluir = esDelMes && !esServicioIngresos && !factura.pagada
                            && factura.monto > 0 && fechaVenc >= hoy;
                        break;

                    case 'vencidas':
                        // Igual que cantidadVencidas: del mes, no pagadas, fecha pasada
                        incluir = esDelMes && !esServicioIngresos && !factura.pagada
                            && factura.monto > 0 && fechaVenc < hoy;
                        break;

                    case 'pagadas':
                        // Igual que cantidadPagadas: pagada, fechaPago en el mes seleccionado
                        if (factura.pagada && factura.monto >= 0 && factura.fechaPago && !esServicioIngresos) {
                            const fp = this.app.utils.parseDate(factura.fechaPago);
                            incluir = fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado;
                        }
                        break;

                    case 'pagado-monto':
                        // Igual que totalPagadoMesARS/USD: pagada, fechaPago en el mes, no crédito (salvo cat activa)
                        if (factura.pagada && factura.monto > 0 && factura.fechaPago && !esServicioIngresos
                            && (!factura.conCredito || categoriaActiva)) {
                            const fp = this.app.utils.parseDate(factura.fechaPago);
                            incluir = fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado;
                        }
                        break;

                    case 'ingresos':
                        // Igual que totalIngresosARS/USD: del mes, servicio ingresos
                        incluir = esDelMes && esServicioIngresos;
                        break;
                }

                if (incluir) items.push({ servicio, factura });
            });
        });

        const lista = document.getElementById('modal-debug-lista');
        if (items.length === 0) {
            montar(lista, html`<span class="text-center-muted d-block sin-facturas-text">Sin facturas para mostrar</span>`);
        } else {
            montar(lista, html`${items.map(({ servicio, factura }) => {
                const moneda = factura.moneda || 'ars';
                const estadoBadge = factura.pagada
                    ? html`<span class="debug-badge debug-badge-success">Pagada ${factura.fechaPago ? this.app.utils.formatearFecha(factura.fechaPago) : ''}</span>`
                    : html`<span class="debug-badge debug-badge-warning">Pendiente</span>`;
                return html`
    <div class="debug-card">
        <div class="debug-card-title">${servicio.nombre}</div>
        <div class="d-flex justify-content-between align-items-center text-muted text-sm">
            <span>Vence: ${this.app.utils.formatearFecha(factura.fecha)}</span>
            <span>${this.app.utils.formatearMoneda(factura.monto, moneda)}</span>
        </div>
        <div class="mt-1">${estadoBadge}</div>
    </div>`;
            })}`);
        }

        this.app.ui.abrirModal('modal-debug-estadisticas');
    }
}
