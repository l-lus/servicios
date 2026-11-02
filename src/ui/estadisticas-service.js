import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
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
    get servicios() { return this.app.servicios; }

    // ── Resumen mensual ───────────────────────────────────────
    actualizarResumenMes() {
        const { mes: mesActual, anio: añoActual } = this.app.utils.mesActualInfo();
        let totalAPagarARS = 0, totalAPagarUSD = 0;
        let totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalPagadoDelMesActualARS = 0, totalPagadoDelMesActualUSD = 0;
        let totalFacturasMesActualARS = 0, totalFacturasMesActualUSD = 0;
        let cantidadPagadasVencenEsteMes = 0, cantidadPendientesEsteMes = 0;

        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const fechaFactura = this.app.utils.parseDate(factura.fecha);
                const esDelMesActual = fechaFactura.getMonth() === mesActual && fechaFactura.getFullYear() === añoActual;
                const moneda = factura.moneda || 'ars';
                const excluir = factura.conCredito === true;
                if (esDelMesActual) {
                    if (factura.monto < 0) return;
                    const pagadaEsteMes = factura.pagada && factura.fechaPago && (() => {
                        const fp = this.app.utils.parseDate(factura.fechaPago);
                        return fp.getMonth() === mesActual && fp.getFullYear() === añoActual;
                    })();
                    const contarEnTotal = !factura.pagada || pagadaEsteMes;
                    if (factura.pagada) cantidadPagadasVencenEsteMes++;
                    if (!factura.pagada) cantidadPendientesEsteMes++;
                    if (moneda === 'usd') {
                        if (!excluir && contarEnTotal) totalFacturasMesActualUSD += factura.monto;
                        if (!factura.pagada && !excluir) totalAPagarUSD += factura.monto;
                        else if (pagadaEsteMes && !excluir) totalPagadoDelMesActualUSD += factura.monto;
                    } else {
                        if (!excluir && contarEnTotal) totalFacturasMesActualARS += factura.monto;
                        if (!factura.pagada && !excluir) totalAPagarARS += factura.monto;
                        else if (pagadaEsteMes && !excluir) totalPagadoDelMesActualARS += factura.monto;
                    }
                }
                if (factura.pagada && factura.fechaPago && factura.monto > 0 && !excluir) {
                    const fechaPago = this.app.utils.parseDate(factura.fechaPago);
                    if (fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === añoActual) {
                        if (moneda === 'usd') totalPagadoMesUSD += factura.monto;
                        else totalPagadoMesARS += factura.monto;
                    }
                }
            });
        });

        this.app.datosResumen = {
            pendienteARS: totalAPagarARS, pendienteUSD: totalAPagarUSD,
            pagadoMesARS: totalPagadoMesARS, pagadoMesUSD: totalPagadoMesUSD,
            pagadoDelMesActualARS: totalPagadoDelMesActualARS, pagadoDelMesActualUSD: totalPagadoDelMesActualUSD,
            totalPeriodoARS: totalFacturasMesActualARS, totalPeriodoUSD: totalFacturasMesActualUSD,
            cantidadPagadasVencenEsteMes, cantidadPendientesEsteMes,
            pendiente: totalAPagarARS + totalAPagarUSD,
            pagadoMes: totalPagadoMesARS,
            pagadoDelMesActual: totalPagadoDelMesActualARS,
            totalPeriodo: totalFacturasMesActualARS
        };

        this.app.mostrandoPagadoMes = StorageHelper.getItem(STORAGE_KEYS.RESUMEN_MOSTRAR_PAGADO) === 'true';
        if (this.app.mostrandoPagadoMes) this.mostrarPagadoEnResumen();
        else this.mostrarPendienteEnResumen();
        this.actualizarEstadisticas();
    }

    obtenerColorBordeMasPrioritario() {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const { mes: mesActual, anio: añoActual } = this.app.utils.mesActualInfo();
        let prioridad = 5, colorBorde = '';
        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const f = this.app.utils.parseDate(factura.fecha);
                if (f.getMonth() !== mesActual || f.getFullYear() !== añoActual) return;
                if (!factura.pagada) {
                    const venc = this.app.utils.parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
                    const dias = Math.ceil((venc - hoy) / 86400000);
                    if (dias < 0 && prioridad > 1) { prioridad = 1; colorBorde = 'borde-vencido'; }
                    else if (dias <= 2 && prioridad > 1) { prioridad = 1; colorBorde = 'borde-urgente'; }
                    else if (dias <= 5 && prioridad > 2) { prioridad = 2; colorBorde = 'borde-proximo'; }
                    else if (prioridad > 3) { prioridad = 3; colorBorde = 'borde-lejano'; }
                }
            });
        });
        return colorBorde || 'borde-pagado';
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
        if (!hayARS && !hayUSD) return { valorMostrar: `<span class="resumen-valor-vacio">${textoVacio}</span>`, hayARS, hayUSD };
        let valorMostrar;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        if (hayARS && hayUSD) {
            valorMostrar = `<div class="resumen-valor">${fmt(montoARS, 'ars')}</div><div class="resumen-valor-usd">${fmt(montoUSD, 'usd')}</div>`;
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
        const resumenHTML = `
<div class="resumen-monto" id="resumen-toggle">
<div class="d-flex justify-content-between align-items-center">
    <div class="resumen-titulo"><svg class="icon"><use href="${icono}" /></svg> ${titulo}</div>
    <button class="icon-btn transparent btn-sm" id="btn-info-resumen">
        <svg viewBox="0 0 24 24" class="icon-md" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>
    </button>
</div>
${(hayARS && hayUSD) ? valorMostrar : `<div class="resumen-valor">${valorMostrar}</div>`}
<div class="resumen-footer">
    <div class="resumen-progreso"><div class="resumen-progreso-barra" id="resumen-progreso-barra"></div></div>
    <div class="resumen-label">${label}</div>
    <div class="resumen-fecha">${fechaFormateada}</div>
</div>
</div>`;
        const contResumen = document.getElementById('resumen-mes');
        if (debeAnimar) Anim.morph(contResumen, resumenHTML, '.resumen-valor, .resumen-valor-usd, .resumen-label');
        else contResumen.innerHTML = resumenHTML;
        const barra = document.getElementById('resumen-progreso-barra');
        if (barra) barra.style.setProperty('--barra-w', `${porcentajePagado}%`);
        StorageHelper.setItem(STORAGE_KEYS.RESUMEN_MOSTRAR_PAGADO, esPendiente ? 'false' : 'true');
        const elBlur = document.getElementById('resumen-toggle');
        if (elBlur) elBlur.classList.toggle('resumen-blur', this.app.blurHabilitado && !this.app.resumenDesblurado && (hayARS || hayUSD));
        this.app.ultimoEstadoResumen = estadoActual;
        this._actualizarBordeResumen(colorBorde);
    }

    abrirModalInfoResumen() {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
        const vencenEsteMes = [], pagadasOtroMes = [];
        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                if (factura.monto < 0) return;
                const fechaVenc = this.app.utils.parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesActual && fechaVenc.getFullYear() === anioActual;
                const pagadaEsteMes = factura.pagada && factura.fechaPago && (() => {
                    const fp = this.app.utils.parseDate(factura.fechaPago);
                    return fp.getMonth() === mesActual && fp.getFullYear() === anioActual;
                })();
                if (venceEsteMes) {
                    let estado, badgeClass;
                    if (factura.conCredito) { estado = 'Con crédito'; badgeClass = 'badge-pagada-credito'; }
                    else if (factura.pagada && pagadaEsteMes) { estado = 'Pagada este mes'; badgeClass = 'badge-pagada-mes'; }
                    else if (factura.pagada && !pagadaEsteMes) { const mp = this.app.utils.parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' }); estado = `Pagada en ${mp}`; badgeClass = 'badge-pagada-antes'; }
                    else if (!factura.pagada && fechaVenc < hoy) { estado = 'Vencida'; badgeClass = 'badge-vencida'; }
                    else { estado = 'Pendiente'; badgeClass = 'badge-pendiente'; }
                    vencenEsteMes.push({ servicio: servicio.nombre, factura, estado, badgeClass });
                } else if (pagadaEsteMes) {
                    pagadasOtroMes.push({ servicio: servicio.nombre, factura, mesVenc: fechaVenc.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) });
                }
            });
        });
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const renderFila = ({ servicio, factura, estado, badgeClass }) => `
        <div class="info-resumen-fila">
            <div class="info-resumen-fila-izq"><span class="info-resumen-nombre">${this.app.utils.escaparHTML(servicio)}</span><span class="info-resumen-badge ${badgeClass}">${estado}</span></div>
            <span class="info-resumen-monto">${fmt(factura.monto, factura.moneda || 'ars')}</span>
        </div>`;
        const renderFilaOtroMes = ({ servicio, factura, mesVenc }) => `
        <div class="info-resumen-fila">
            <div class="info-resumen-fila-izq"><span class="info-resumen-nombre">${this.app.utils.escaparHTML(servicio)}</span><span class="info-resumen-badge badge-pagada-otro-mes">Venció ${mesVenc}</span></div>
            <span class="info-resumen-monto">${fmt(factura.monto, factura.moneda || 'ars')}</span>
        </div>`;
        let html = '';
        if (vencenEsteMes.length > 0) html += `<div class="info-resumen-grupo"><div class="info-resumen-grupo-titulo">Vencen este mes</div>${vencenEsteMes.map(renderFila).join('')}</div>`;
        if (pagadasOtroMes.length > 0) html += `<div class="info-resumen-grupo"><div class="info-resumen-grupo-titulo">Pagadas este mes (otro vencimiento)</div>${pagadasOtroMes.map(renderFilaOtroMes).join('')}</div>`;
        if (!html) html = '<div class="text-center-muted">Sin movimientos este mes</div>';
        document.getElementById('modal-info-resumen-body').innerHTML = html;
        this.app.abrirModal('modal-info-resumen');
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

    // ── Estadísticas mensuales ────────────────────────────────
    actualizarEstadisticas() {
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
        let cantidadPendientes = 0, cantidadPagadas = 0, cantidadVencidas = 0, cantidadFacturasMes = 0;
        let totalMesARS = 0, totalMesUSD = 0, totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalIngresosARS = 0, totalIngresosUSD = 0;

        this.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.app.SERVICIO_INGRESOS_ID) {
                if ((servicio.categoria || '') !== categoriaActiva) return;
            }
            servicio.facturas.forEach(factura => {
                const fechaFactura = this.app.utils.parseDate(factura.fecha);
                const mesFactura = fechaFactura.getMonth(), añoFactura = fechaFactura.getFullYear();
                if (mesFactura === mesSeleccionado && añoFactura === añoSeleccionado) {
                    const moneda = factura.moneda || 'ars';
                    if (servicio.id === this.app.SERVICIO_INGRESOS_ID) {
                        if (moneda === 'usd') totalIngresosUSD += factura.monto;
                        else totalIngresosARS += factura.monto;
                        return;
                    }
                    if (factura.monto < 0) { cantidadPagadas++; return; }
                    cantidadFacturasMes++;
                    if (!factura.conCredito || categoriaActiva) {
                        if (moneda === 'usd') totalMesUSD += factura.monto;
                        else totalMesARS += factura.monto;
                    }
                    if (!factura.pagada) {
                        const venc = this.app.utils.parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
                        if (venc < hoy) cantidadVencidas++; else cantidadPendientes++;
                    }
                }
                if (factura.pagada && factura.fechaPago && factura.monto > 0 && servicio.id !== this.app.SERVICIO_INGRESOS_ID) {
                    const fechaPago = this.app.utils.parseDate(factura.fechaPago);
                    if (fechaPago.getMonth() === mesSeleccionado && fechaPago.getFullYear() === añoSeleccionado) {
                        cantidadPagadas++;
                        if (!factura.conCredito || categoriaActiva) {
                            const moneda = factura.moneda || 'ars';
                            if (moneda === 'usd') totalPagadoMesUSD += factura.monto;
                            else totalPagadoMesARS += factura.monto;
                        }
                    }
                }
            });
        });

        const estadoActual = { totalMesARS, totalMesUSD, totalPagadoMesARS, totalPagadoMesUSD, cantidadPendientes, cantidadPagadas, cantidadVencidas, cantidadFacturasMes, totalIngresosARS, totalIngresosUSD, mesSeleccionado, añoSeleccionado, categoriaActiva };
        const estadoCambio = this.app.utils.objetosCambiaron(this.app.ultimoEstadoEstadisticas, estadoActual);
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);

        const renderizarContenido = () => {
            const hayUSDMes = totalMesUSD > 0, hayARSMes = totalMesARS > 0;
            const montoHTML = hayARSMes ? fmt(totalMesARS, 'ars') : hayUSDMes ? fmt(totalMesUSD, 'usd') : fmt(0, 'ars');
            const montoUSDItem = hayUSDMes ? `<div class="calculador-resultado-item"><span class="estadistica-label">Monto USD</span><span class="estadistica-valor">${fmt(totalMesUSD, 'usd')}</span></div>` : '';
            let ingresosHTML = '';
            if (this.app.ui.ingresosHabilitado()) {
                const hayIngUSD = totalIngresosUSD > 0, hayIngARS = totalIngresosARS > 0;
                const ingMontoHTML = hayIngARS ? fmt(totalIngresosARS, 'ars') : hayIngUSD ? fmt(totalIngresosUSD, 'usd') : fmt(0, 'ars');
                const ingUSDItem = hayIngUSD ? `<div class="calculador-resultado-item"><span class="estadistica-label">Ingresos USD</span><span class="estadistica-valor">${fmt(totalIngresosUSD, 'usd')}</span></div>` : '';
                let porcentajeIngresosHTML = '';
                if (hayIngARS && totalMesARS > 0) {
                    const pct = (totalMesARS / totalIngresosARS) * 100;
                    const colorClass = pct < 25 ? 'text-green' : pct < 50 ? 'text-blue' : pct < 75 ? 'text-gold' : 'text-red';
                    porcentajeIngresosHTML = `<div class="calculador-resultado-item"><span class="estadistica-label">% del ingreso</span><span class="estadistica-valor ${colorClass}">${pct.toFixed(1)}%</span></div>`;
                }
                ingresosHTML = `<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="ingresos"><span class="estadistica-label">Ingresos</span><span class="estadistica-valor">${ingMontoHTML}</span></div>${ingUSDItem}${porcentajeIngresosHTML}`;
            }
            const itemsHTML = `
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas"><span class="estadistica-label">Monto en facturas</span><span class="estadistica-valor">${montoHTML}</span></div>
    ${montoUSDItem}
    ${totalPagadoMesARS > 0 ? `<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto"><span class="estadistica-label">Monto pagado</span><span class="estadistica-valor">${fmt(totalPagadoMesARS, 'ars')}</span></div>` : ''}
    ${totalPagadoMesUSD > 0 ? `<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto"><span class="estadistica-label">Monto USD (Pagado)</span><span class="estadistica-valor">${fmt(totalPagadoMesUSD, 'usd')}</span></div>` : ''}
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas"><span class="estadistica-label">Facturas</span><span class="estadistica-valor">${cantidadFacturasMes}</span></div>
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pendientes"><span class="estadistica-label">Pendientes</span><span class="estadistica-valor">${cantidadPendientes}</span></div>
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagadas"><span class="estadistica-label">Pagadas</span><span class="estadistica-valor">${cantidadPagadas}</span></div>
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="vencidas"><span class="estadistica-label">Vencidas</span><span class="estadistica-valor">${cantidadVencidas}</span></div>
    ${ingresosHTML}`;
            const lista = document.querySelector('#estadisticas-mensual-container .estadisticas-lista');
            if (!lista) return;
            if (estadoCambio) Anim.morph(lista, itemsHTML, '.estadistica-valor');
            else lista.innerHTML = itemsHTML;
        };

        const hayDatos = this.servicios.length > 0 && this.servicios.some(s => s.facturas?.length > 0);
        if (!yaExisteSelector || !hayDatos) {
            document.getElementById('estadisticas-mensual-container').innerHTML = `
<div class="calculador-campo"><label class="calculador-label">Mes</label>
<div class="custom-select-wrapper" id="select-mes-estadisticas-csd"><div class="custom-select-trigger"><span class="csd-label"></span><svg class="csd-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div><div class="custom-select-dropdown"></div></div>
<select id="select-mes-estadisticas" class="select-mes-oculto"></select></div>
<div id="estadisticas-categorias-tags"></div><div class="estadisticas-lista"></div>`;
            const select = document.getElementById('select-mes-estadisticas');
            select.innerHTML = this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado);
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
                selectActual.innerHTML = this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado);
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
        if (catsUsadas.length === 0) { container.innerHTML = ''; return; }
        const activa = this.app._estadisticaCategoriaActiva || null;
        const tagsHTML = catsUsadas.map(c => `<button class="est-cat-tag${c === activa ? ' est-cat-tag--activa' : ''}" data-cat="${this.app.utils.escaparAtributoHTML(c)}">${this.app.utils.escaparHTML(c)}</button>`).join('');
        container.innerHTML = `<div class="est-cat-tags-row">${tagsHTML}</div>`;
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
        const mensualContainer = document.getElementById('estadisticas-mensual-container');
        const individualContainer = document.getElementById('estadisticas-individual-container');
        if (this.app.tipoEstadisticaActual === 'mensual') {
            mensualContainer.classList.add('visible'); mensualContainer.classList.remove('hidden');
            individualContainer.classList.add('hidden'); individualContainer.classList.remove('visible');
            this.actualizarEstadisticas();
        } else {
            mensualContainer.classList.add('hidden'); mensualContainer.classList.remove('visible');
            individualContainer.classList.add('visible'); individualContainer.classList.remove('hidden');
            this.app.calcularPeriodo();
        }
    }

    // ── Select servicios (calculador) ─────────────────────────
    actualizarSelectServicios() {
        const select = document.getElementById('calculador-servicio');
        if (!select) return;
        const valorActual = select.value;
        const serviciosActivos = this.servicios
            .filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        let html = '<option value="">Seleccionar servicio...</option>';
        serviciosActivos.forEach(s => {
            html += `<option value="${this.app.utils.escaparAtributoHTML(s.id)}" ${s.id === valorActual ? 'selected' : ''}>${this.app.utils.escaparHTML(s.nombre)}</option>`;
        });
        if (this.app.ui.ingresosHabilitado() && this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID)) {
            html += `<option value="${this.app.SERVICIO_INGRESOS_ID}" ${this.app.SERVICIO_INGRESOS_ID === valorActual ? 'selected' : ''}>Ingresos</option>`;
        }
        select.innerHTML = html;
        const csd = document.getElementById('calculador-servicio-csd');
        if (csd?._customSelect) csd._customSelect.refresh();
        if (valorActual && !this.servicios.find(s => s.id === valorActual)) {
            select.value = ''; this.app.calcularPeriodo();
        } else if (valorActual) { this.app.calcularPeriodo(); }
    }

    inicializarCalculador() {
        const selectServicio = document.getElementById('calculador-servicio');
        if (!selectServicio) return;
        this.actualizarSelectServicios();
        const csdWrapper = document.getElementById('calculador-servicio-csd');
        if (csdWrapper && !csdWrapper._customSelect) {
            csdWrapper._customSelect = new CustomSelect(csdWrapper, selectServicio, () => this.app.calcularPeriodo());
        }
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        selectServicio.addEventListener('change', () => this.app.calcularPeriodo());
        inputDesde.addEventListener('change', () => this.app.calcularPeriodo());
        inputHasta.addEventListener('change', () => this.app.calcularPeriodo());
        document.getElementById('btn-calculador-desde-hoy').addEventListener('click', () => {
            inputDesde.value = inputDesde.value ? '' : this.app.utils.obtenerFechaLocal();
            this.app.calcularPeriodo();
        });
        document.getElementById('btn-calculador-hasta-hoy').addEventListener('click', () => {
            inputHasta.value = inputHasta.value ? '' : this.app.utils.obtenerFechaLocal();
            this.app.calcularPeriodo();
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
            return `<option value="${clave}">${meses[mesSeleccionado]} ${añoSeleccionado}</option>`;
        }
        return mesesOrdenados.map(clave => {
            const [año, mes] = clave.split('-');
            const esSeleccionado = parseInt(año) === añoSeleccionado && parseInt(mes) - 1 === mesSeleccionado;
            return `<option value="${clave}" ${esSeleccionado ? 'selected' : ''}>${meses[parseInt(mes) - 1]} ${año}</option>`;
        }).join('');
    }
}
