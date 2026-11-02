import { Anim } from './animaciones.js';

// ============================================================
// CALCULADOR SERVICE — modo calculadora flotante + calculador
//                      de período + generación de reportes
// ============================================================
export class CalculadorService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get servicios() { return this.app.servicios; }
    get modoActivo() { return this.app.modoCalculadora; }
    set modoActivo(v) { this.app.modoCalculadora = v; }
    get tipo() { return this.app.modoCalculadoraTipo; }
    set tipo(v) { this.app.modoCalculadoraTipo = v; }
    get seleccionados() { return this.app.serviciosSeleccionados; }

    // ── Modo calculadora flotante ─────────────────────────────
    activarModo(silencioso = false) {
        this.modoActivo = true;
        this.seleccionados.clear();
        document.getElementById('btn-agregar-servicio').classList.add('modo-calculadora');
        this.actualizar();
        this.app.renderServicios();
        if (!silencioso) {
            const flotante = document.getElementById('calculadora-flotante');
            flotante.classList.add('visible');
            flotante.onclick = () => {
                const arsVal = this.app._calcTotalARS ?? 0;
                const usdVal = this.app._calcTotalUSD ?? 0;
                const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(2);
                let texto = fmt(arsVal);
                if (usdVal > 0) texto += ` / ${fmt(usdVal)}`;
                navigator.clipboard.writeText(texto).then(() => {
                    const contador = document.getElementById('calculadora-contador');
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
        document.getElementById('btn-agregar-servicio').classList.remove('modo-calculadora');
        this.actualizar();
        this.app.renderServicios();
        document.getElementById('calculadora-flotante').classList.remove('visible');
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
        this.app.renderServicios();
    }

    actualizar() {
        if (!this.modoActivo) return;
        let totalARS = 0, totalUSD = 0, contadorFacturas = 0;
        const { mes: mesActual, anio: anioActual, mesSiguiente, anioSiguiente } = this.app.utils.mesActualInfo();
        this.seleccionados.forEach(servicioId => {
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (!servicio) return;
            servicio.facturas.forEach(factura => {
                if (factura.monto <= 0) return;
                const fechaFactura = this.app.utils.parseDate(factura.fecha);
                const mesF = fechaFactura.getMonth(), anioF = fechaFactura.getFullYear();
                const esMesActual = mesF === mesActual && anioF === anioActual;
                if (this.tipo === 'pendientes') {
                    if (factura.pagada) return;
                    const { mesPasado, anioPasado } = this.app.utils.mesActualInfo();
                    const esSiguiente = mesF === mesSiguiente && anioF === anioSiguiente;
                    const esPasado = mesF === mesPasado && anioF === anioPasado;
                    if (!esMesActual && !esSiguiente && !esPasado) return;
                } else if (this.tipo === 'pagados') {
                    if (!factura.pagada) return;
                    const fechaPago = factura.fechaPago ? this.app.utils.parseDate(factura.fechaPago) : null;
                    const esPagadaEsteMes = fechaPago && fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === anioActual;
                    if (!esMesActual && !esPagadaEsteMes) return;
                }
                if ((factura.moneda || 'ars') === 'usd') totalUSD += factura.monto;
                else totalARS += factura.monto;
                contadorFacturas++;
            });
        });
        this.app._calcTotalARS = totalARS;
        this.app._calcTotalUSD = totalUSD;
        document.getElementById('calculadora-total').textContent = this.app.utils.formatearMoneda(totalARS, 'ars');
        const elUSD = document.getElementById('calculadora-total-usd');
        if (totalUSD > 0) { elUSD.textContent = this.app.utils.formatearMoneda(totalUSD, 'usd'); elUSD.classList.add('visible'); }
        else { elUSD.classList.remove('visible'); }
        document.getElementById('calculadora-contador').textContent =
            `${contadorFacturas} ${contadorFacturas === 1 ? 'factura' : 'facturas'}`;
    }

    // ── Calculador de período ─────────────────────────────────
    calcularPeriodo() {
        const selectServicio = document.getElementById('calculador-servicio');
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        const resultadosContainer = document.getElementById('calculador-resultados');
        if (!selectServicio || !inputDesde || !inputHasta || !resultadosContainer) return;

        const servicioId = selectServicio.value;
        const desde = inputDesde.value, hasta = inputHasta.value;
        let totalRegistros = 0, variacionTexto = '0%', variacionUSDTexto = null;
        let _arsTotal = 0, _usdTotal = 0, _arsCount = 0, _usdCount = 0;

        if (servicioId) {
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (servicio) {
                const esServicioIngresos = servicioId === this.app.SERVICIO_INGRESOS_ID;
                let facturasFiltradas = servicio.facturas;
                if (desde) { const fd = this.app.utils.parseDate(desde); facturasFiltradas = facturasFiltradas.filter(f => this.app.utils.parseDate(f.fecha) >= fd); }
                if (hasta) { const fh = this.app.utils.parseDate(hasta); facturasFiltradas = facturasFiltradas.filter(f => this.app.utils.parseDate(f.fecha) <= fh); }
                facturasFiltradas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                totalRegistros = facturasFiltradas.length;
                facturasFiltradas.forEach(f => {
                    if ((f.moneda || 'ars') === 'usd') { _usdTotal += f.monto; _usdCount++; }
                    else { _arsTotal += f.monto; _arsCount++; }
                });
                let facturasParaVariacion = esServicioIngresos
                    ? facturasFiltradas.filter(f => f.tipo !== 'complementario')
                    : facturasFiltradas;
                const calcularVariacion = (facturas) => {
                    const total = facturas.length;
                    if (total < 2) return total === 1 ? 'N/A' : null;
                    let promPrim, promUlt;
                    if (total <= 3) { promPrim = facturas[0].monto; promUlt = facturas[total - 1].monto; }
                    else if (total <= 8) { const m = Math.floor(total / 2); promPrim = facturas.slice(0, m).reduce((s, f) => s + f.monto, 0) / m; promUlt = facturas.slice(-m).reduce((s, f) => s + f.monto, 0) / m; }
                    else { const g = Math.min(6, Math.max(3, Math.floor(total * 0.3))); promPrim = facturas.slice(0, g).reduce((s, f) => s + f.monto, 0) / g; promUlt = facturas.slice(-g).reduce((s, f) => s + f.monto, 0) / g; }
                    if (promPrim !== 0) { const v = ((promUlt - promPrim) / Math.abs(promPrim)) * 100; return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`; }
                    return promUlt > 0 ? '+∞' : '0%';
                };
                const facturasVarARS = facturasParaVariacion.filter(f => (f.moneda || 'ars') === 'ars');
                const facturasVarUSD = facturasParaVariacion.filter(f => (f.moneda || 'ars') === 'usd');
                const varARS = calcularVariacion(facturasVarARS);
                const varUSD = calcularVariacion(facturasVarUSD);
                if (varARS !== null) { variacionTexto = varARS; }
                else if (facturasVarARS.length === 0 && facturasVarUSD.length > 0) { variacionTexto = null; }
                else if (facturasParaVariacion.length === 0 && esServicioIngresos && totalRegistros > 0) { variacionTexto = 'Solo extras'; }
                else if (facturasVarARS.length === 1) { variacionTexto = 'N/A'; }
                variacionUSDTexto = varUSD;
            }
        }

        const estadoCalculador = { servicioId, desde, hasta, totalRegistros, _arsTotal, _usdTotal, variacionTexto, variacionUSDTexto };
        const calculadorCambio = this.app.utils.objetosCambiaron(this.app.ultimoEstadoCalculador, estadoCalculador);
        const _hayARS = _arsTotal !== 0, _hayUSD = _usdTotal !== 0;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const _montoHTML = _hayARS ? fmt(_arsTotal, 'ars') : _hayUSD ? fmt(_usdTotal, 'usd') : fmt(0, 'ars');
        const _montoUSDItem = _hayUSD ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Total USD</span><span class="calculador-resultado-valor">${fmt(_usdTotal, 'usd')}</span></div>` : '';
        const _promARS = _arsCount > 0 ? _arsTotal / _arsCount : 0;
        const _promUSD = _usdCount > 0 ? _usdTotal / _usdCount : 0;
        const _promHTML = _hayARS ? fmt(_promARS, 'ars') : _hayUSD ? fmt(_promUSD, 'usd') : fmt(0, 'ars');
        const _promUSDItem = _hayUSD ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Promedio USD</span><span class="calculador-resultado-valor">${fmt(_promUSD, 'usd')}</span></div>` : '';
        const _varUSDItem = variacionUSDTexto != null ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Variación USD</span><span class="calculador-resultado-valor">${variacionUSDTexto}</span></div>` : '';
        const generarResultadosHTML = (registros, variacion) => `
<div class="calculador-resultado-item"><span class="calculador-resultado-label">Facturas</span><span class="calculador-resultado-valor">${registros}</span></div>
<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Total</span><span class="calculador-resultado-valor">${_montoHTML}</span></div>
${_montoUSDItem}
<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Promedio</span><span class="calculador-resultado-valor">${_promHTML}</span></div>
${_promUSDItem}
${variacion != null ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Variación</span><span class="calculador-resultado-valor">${variacion}</span></div>` : ''}
${_varUSDItem}`;
        const html = generarResultadosHTML(totalRegistros, variacionTexto);
        if (calculadorCambio) {
            Anim.morph(resultadosContainer, html, '.calculador-resultado-valor');
            this.app.ultimoEstadoCalculador = estadoCalculador;
        } else {
            resultadosContainer.innerHTML = html;
        }
    }

    // ── Reportes ──────────────────────────────────────────────
    generarReporte() {
        if (this.app.tipoEstadisticaActual === 'individual') {
            this._generarReporteIndividual(); return;
        }
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        if (selectMes?.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año); mesSeleccionado = parseInt(mes) - 1;
        } else {
            mesSeleccionado = hoy.getMonth(); añoSeleccionado = hoy.getFullYear();
        }
        const categoriaActiva = this.app._estadisticaCategoriaActiva || null;
        const nombreMes = new Date(añoSeleccionado, mesSeleccionado, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const nombreMesCorto = new Date(añoSeleccionado, mesSeleccionado, 1).toLocaleDateString('es-AR', { month: 'long' });
        const facturasMes = [], facturasPagadasMes = [], ingresos = [];
        this.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.app.SERVICIO_INGRESOS_ID && (servicio.categoria || '') !== categoriaActiva) return;
            servicio.facturas.forEach(factura => {
                const fechaVenc = this.app.utils.parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesSeleccionado && fechaVenc.getFullYear() === añoSeleccionado;
                if (servicio.id === this.app.SERVICIO_INGRESOS_ID) {
                    if (venceEsteMes) ingresos.push({ servicio, factura });
                    return;
                }
                if (venceEsteMes) { facturasMes.push({ servicio, factura, venceEsteMes: true }); }
                else if (factura.pagada && factura.fechaPago) {
                    const fp = this.app.utils.parseDate(factura.fechaPago);
                    if (fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado) facturasPagadasMes.push({ servicio, factura, venceEsteMes: false });
                }
            });
        });
        const fmtFecha = str => !str ? '—' : this.app.utils.parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const estadoFactura = factura => {
            if (factura.conCredito) return 'Con crédito';
            if (factura.pagada) { const mp = factura.fechaPago ? this.app.utils.parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' }) : ''; return `Pagada${mp ? ` en ${mp}` : ''}`; }
            const venc = this.app.utils.parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
            return venc < hoy ? 'Vencida (pendiente)' : 'Pendiente';
        };
        const sumar = (lista, pagada) => lista.filter(({ factura: f }) => pagada ? f.pagada : !f.pagada).reduce((acc, { factura: f }) => { if ((f.moneda || 'ars') === 'usd') acc.usd += f.monto; else acc.ars += f.monto; return acc; }, { ars: 0, usd: 0 });
        const totalVencenARS = facturasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') !== 'usd' && f.monto > 0 ? a + f.monto : a, 0);
        const totalVencenUSD = facturasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') === 'usd' && f.monto > 0 ? a + f.monto : a, 0);
        const pagadasMes = sumar(facturasMes.filter(({ factura: f }) => !f.conCredito), true);
        const pendientesMes = sumar(facturasMes.filter(({ factura: f }) => !f.conCredito), false);
        const totalPagadasOtroMesARS = facturasPagadasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') !== 'usd' ? a + f.monto : a, 0);
        const totalPagadasOtroMesUSD = facturasPagadasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') === 'usd' ? a + f.monto : a, 0);
        const totalIngresosARS = ingresos.reduce((a, { factura: f }) => (f.moneda || 'ars') !== 'usd' ? a + f.monto : a, 0);
        const totalIngresosUSD = ingresos.reduce((a, { factura: f }) => (f.moneda || 'ars') === 'usd' ? a + f.monto : a, 0);
        const sep = '─'.repeat(48), sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        let txt = `${sep2}\n  REPORTE DE ESTADÍSTICAS\n  Período: ${nombreMes.toUpperCase()}${categoriaActiva ? `  |  Categoría: ${categoriaActiva}` : ''}\n  Generado: ${new Date().toLocaleString('es-AR')}\n${sep2}\n\n`;
        txt += `FACTURAS QUE VENCEN EN ${nombreMesCorto.toUpperCase()}\n${sep}\n`;
        if (facturasMes.length === 0) { txt += `  (ninguna)\n`; }
        else {
            facturasMes.forEach(({ servicio, factura }) => {
                const monto = factura.monto < 0 ? `  [saldo a favor ${fmt(Math.abs(factura.monto), factura.moneda || 'ars')}]` : fmt(factura.monto, factura.moneda || 'ars');
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento:', fmtFecha(factura.fecha))}\n${linea('  Monto:', monto)}\n${linea('  Estado:', estadoFactura(factura))}\n`;
                if (factura.pagada && factura.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(factura.fechaPago)) + '\n';
            });
            txt += `\n${sep}\n`;
            if (totalVencenARS > 0) txt += linea('  Total del mes (ARS):', fmt(totalVencenARS, 'ars')) + '\n';
            if (totalVencenUSD > 0) txt += linea('  Total del mes (USD):', fmt(totalVencenUSD, 'usd')) + '\n';
            if (pagadasMes.ars > 0) txt += linea('  Pagado (ARS):', fmt(pagadasMes.ars, 'ars')) + '\n';
            if (pagadasMes.usd > 0) txt += linea('  Pagado (USD):', fmt(pagadasMes.usd, 'usd')) + '\n';
            if (pendientesMes.ars > 0) txt += linea('  Pendiente (ARS):', fmt(pendientesMes.ars, 'ars')) + '\n';
            if (pendientesMes.usd > 0) txt += linea('  Pendiente (USD):', fmt(pendientesMes.usd, 'usd')) + '\n';
        }
        txt += `\nPAGADAS EN ${nombreMesCorto.toUpperCase()} (VENCIMIENTO OTRO MES)\n${sep}\n`;
        if (facturasPagadasMes.length === 0) { txt += `  (ninguna)\n`; }
        else {
            facturasPagadasMes.forEach(({ servicio, factura }) => {
                const mesVenc = this.app.utils.parseDate(factura.fecha).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento original:', `${fmtFecha(factura.fecha)} (${mesVenc})`)}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n${linea('  Fecha de pago:', fmtFecha(factura.fechaPago))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totalPagadasOtroMesARS > 0) txt += linea('  Subtotal (ARS):', fmt(totalPagadasOtroMesARS, 'ars')) + '\n';
            if (totalPagadasOtroMesUSD > 0) txt += linea('  Subtotal (USD):', fmt(totalPagadasOtroMesUSD, 'usd')) + '\n';
        }
        if (this.app.ui.ingresosHabilitado() && ingresos.length > 0) {
            txt += `\nINGRESOS DEL MES\n${sep}\n`;
            ingresos.forEach(({ factura }) => {
                txt += `\n  ${factura.tipo || 'regular'}\n${linea('  Fecha:', fmtFecha(factura.fecha))}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totalIngresosARS > 0) txt += linea('  Total ingresos (ARS):', fmt(totalIngresosARS, 'ars')) + '\n';
            if (totalIngresosUSD > 0) txt += linea('  Total ingresos (USD):', fmt(totalIngresosUSD, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        this.app.utils.descargarBlob(txt, `reporte_${nombreMes.replace(' ', '_')}.txt`);
        this.app.ui.mostrarToast('Reporte generado', 'success');
    }

    _generarReporteIndividual() {
        const servicioId = document.getElementById('calculador-servicio')?.value;
        const desde = document.getElementById('calculador-desde')?.value;
        const hasta = document.getElementById('calculador-hasta')?.value;
        if (!servicioId) { this.app.ui.mostrarToast('Seleccioná un servicio primero', 'info'); return; }
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const fmtFecha = str => !str ? '—' : this.app.utils.parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        let facturas = [...servicio.facturas];
        if (desde) facturas = facturas.filter(f => this.app.utils.parseDate(f.fecha) >= this.app.utils.parseDate(desde));
        if (hasta) facturas = facturas.filter(f => this.app.utils.parseDate(f.fecha) <= this.app.utils.parseDate(hasta));
        facturas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        let totalARS = 0, totalUSD = 0, pagadasARS = 0, pagadasUSD = 0, pendientesARS = 0, pendientesUSD = 0;
        facturas.forEach(f => {
            const m = f.moneda || 'ars';
            if (m === 'usd') { totalUSD += f.monto; if (f.pagada) pagadasUSD += f.monto; else pendientesUSD += f.monto; }
            else { totalARS += f.monto; if (f.pagada) pagadasARS += f.monto; else pendientesARS += f.monto; }
        });
        const arsF = facturas.filter(f => (f.moneda || 'ars') === 'ars').length;
        const usdF = facturas.filter(f => (f.moneda || 'ars') === 'usd').length;
        const promARS = arsF > 0 ? totalARS / arsF : 0;
        const promUSD = usdF > 0 ? totalUSD / usdF : 0;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const sep = '─'.repeat(48), sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
        const periodoTxt = desde || hasta ? `${desde ? fmtFecha(desde) : '—'}  →  ${hasta ? fmtFecha(hasta) : '—'}` : 'Sin filtro de fechas';
        let txt = `${sep2}\n  REPORTE INDIVIDUAL\n  Servicio: ${servicio.nombre}\n  Período: ${periodoTxt}\n  Generado: ${new Date().toLocaleString('es-AR')}\n${sep2}\n\nDETALLE DE FACTURAS (${facturas.length})\n${sep}\n`;
        if (facturas.length === 0) { txt += `  (ninguna en el período seleccionado)\n`; }
        else {
            facturas.forEach((f, i) => {
                const moneda = f.moneda || 'ars';
                let estadoTxt;
                if (f.conCredito) { estadoTxt = 'Con crédito'; }
                else if (f.pagada) { const mp = f.fechaPago ? this.app.utils.parseDate(f.fechaPago).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : ''; estadoTxt = `Pagada${mp ? ` (${mp})` : ''}`; }
                else { const venc = this.app.utils.parseDate(f.fecha); venc.setHours(0, 0, 0, 0); estadoTxt = venc < hoy ? 'Vencida (pendiente)' : 'Pendiente'; }
                txt += `\n  #${String(i + 1).padStart(2, '0')}  ${fmtFecha(f.fecha)}\n${linea('  Monto:', fmt(f.monto, moneda))}\n${linea('  Estado:', estadoTxt)}\n`;
                if (f.pagada && f.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(f.fechaPago)) + '\n';
                if (f.tipo && f.tipo !== 'mensual') txt += linea('  Tipo:', f.tipo) + '\n';
            });
            txt += `\n${sep}\n  RESUMEN\n${sep}\n`;
            if (totalARS !== 0) txt += linea('  Total ARS:', fmt(totalARS, 'ars')) + '\n';
            if (totalUSD !== 0) txt += linea('  Total USD:', fmt(totalUSD, 'usd')) + '\n';
            if (promARS !== 0) txt += linea('  Promedio ARS:', fmt(promARS, 'ars')) + '\n';
            if (promUSD !== 0) txt += linea('  Promedio USD:', fmt(promUSD, 'usd')) + '\n';
            if (pagadasARS > 0) txt += linea('  Pagado ARS:', fmt(pagadasARS, 'ars')) + '\n';
            if (pagadasUSD > 0) txt += linea('  Pagado USD:', fmt(pagadasUSD, 'usd')) + '\n';
            if (pendientesARS > 0) txt += linea('  Pendiente ARS:', fmt(pendientesARS, 'ars')) + '\n';
            if (pendientesUSD > 0) txt += linea('  Pendiente USD:', fmt(pendientesUSD, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        this.app.utils.descargarBlob(txt, `reporte_${servicio.nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.txt`);
        this.app.ui.mostrarToast('Reporte generado', 'success');
    }
}
