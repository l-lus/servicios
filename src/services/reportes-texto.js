import { parseDate, inicioDeDia } from '../core/fechas.js';
import { formatearMoneda } from '../core/formato.js';
import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// REPORTES DE TEXTO — arman el contenido de los .txt descargables (sin DOM)
// ====================================================================
export const ReportesTexto = {
    /** Reporte del mes/año elegido (con filtro opcional por categoría). Devuelve { texto, nombreArchivo }. */
    mensual({ servicios, mes, anio, categoria = null, ingresosHabilitado = false, hoy = new Date(), ahora = new Date() }) {
        hoy = inicioDeDia(hoy);
        const mesSeleccionado = mes, añoSeleccionado = anio;
        const categoriaActiva = categoria || null;
        const nombreMes = new Date(añoSeleccionado, mesSeleccionado, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const nombreMesCorto = new Date(añoSeleccionado, mesSeleccionado, 1).toLocaleDateString('es-AR', { month: 'long' });
        const facturasMes = [], facturasPagadasMes = [], ingresos = [];
        servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== SERVICIO_INGRESOS_ID && (servicio.categoria || '') !== categoriaActiva) return;
            servicio.facturas.forEach(factura => {
                const fechaVenc = parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesSeleccionado && fechaVenc.getFullYear() === añoSeleccionado;
                if (servicio.id === SERVICIO_INGRESOS_ID) {
                    if (venceEsteMes) ingresos.push({ servicio, factura });
                    return;
                }
                if (venceEsteMes) { facturasMes.push({ servicio, factura, venceEsteMes: true }); }
                else if (factura.pagada && factura.fechaPago) {
                    const fp = parseDate(factura.fechaPago);
                    if (fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado) facturasPagadasMes.push({ servicio, factura, venceEsteMes: false });
                }
            });
        });
        const fmtFecha = str => !str ? '—' : parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const estadoFactura = factura => {
            if (factura.conCredito) return 'Con crédito';
            if (factura.pagada) { const mp = factura.fechaPago ? parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' }) : ''; return `Pagada${mp ? ` en ${mp}` : ''}`; }
            const venc = parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
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
        const fmt = (m, mon) => formatearMoneda(m, mon);
        let txt = `${sep2}\n  REPORTE DE ESTADÍSTICAS\n  Período: ${nombreMes.toUpperCase()}${categoriaActiva ? `  |  Categoría: ${categoriaActiva}` : ''}\n  Generado: ${ahora.toLocaleString('es-AR')}\n${sep2}\n\n`;
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
                const mesVenc = parseDate(factura.fecha).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento original:', `${fmtFecha(factura.fecha)} (${mesVenc})`)}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n${linea('  Fecha de pago:', fmtFecha(factura.fechaPago))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totalPagadasOtroMesARS > 0) txt += linea('  Subtotal (ARS):', fmt(totalPagadasOtroMesARS, 'ars')) + '\n';
            if (totalPagadasOtroMesUSD > 0) txt += linea('  Subtotal (USD):', fmt(totalPagadasOtroMesUSD, 'usd')) + '\n';
        }
        if (ingresosHabilitado && ingresos.length > 0) {
            txt += `\nINGRESOS DEL MES\n${sep}\n`;
            ingresos.forEach(({ factura }) => {
                txt += `\n  ${factura.tipo || 'regular'}\n${linea('  Fecha:', fmtFecha(factura.fecha))}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totalIngresosARS > 0) txt += linea('  Total ingresos (ARS):', fmt(totalIngresosARS, 'ars')) + '\n';
            if (totalIngresosUSD > 0) txt += linea('  Total ingresos (USD):', fmt(totalIngresosUSD, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        return { texto: txt, nombreArchivo: `reporte_${nombreMes.replace(/\s+/g, '_')}.txt` };
    },

    /** Reporte de un servicio en el rango [desde, hasta]. Devuelve { texto, nombreArchivo }. */
    individual({ servicio, desde = '', hasta = '', hoy = new Date(), ahora = new Date() }) {
        hoy = inicioDeDia(hoy);
        const fmtFecha = str => !str ? '—' : parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        let facturas = [...servicio.facturas];
        if (desde) facturas = facturas.filter(f => parseDate(f.fecha) >= parseDate(desde));
        if (hasta) facturas = facturas.filter(f => parseDate(f.fecha) <= parseDate(hasta));
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
        const fmt = (m, mon) => formatearMoneda(m, mon);
        const sep = '─'.repeat(48), sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
        const periodoTxt = desde || hasta ? `${desde ? fmtFecha(desde) : '—'}  →  ${hasta ? fmtFecha(hasta) : '—'}` : 'Sin filtro de fechas';
        let txt = `${sep2}\n  REPORTE INDIVIDUAL\n  Servicio: ${servicio.nombre}\n  Período: ${periodoTxt}\n  Generado: ${ahora.toLocaleString('es-AR')}\n${sep2}\n\nDETALLE DE FACTURAS (${facturas.length})\n${sep}\n`;
        if (facturas.length === 0) { txt += `  (ninguna en el período seleccionado)\n`; }
        else {
            facturas.forEach((f, i) => {
                const moneda = f.moneda || 'ars';
                let estadoTxt;
                if (f.conCredito) { estadoTxt = 'Con crédito'; }
                else if (f.pagada) { const mp = f.fechaPago ? parseDate(f.fechaPago).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : ''; estadoTxt = `Pagada${mp ? ` (${mp})` : ''}`; }
                else { const venc = parseDate(f.fecha); venc.setHours(0, 0, 0, 0); estadoTxt = venc < hoy ? 'Vencida (pendiente)' : 'Pendiente'; }
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
        return { texto: txt, nombreArchivo: `reporte_${servicio.nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.txt` };
    },
};
