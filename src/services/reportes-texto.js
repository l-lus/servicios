import { parseDate } from '../core/fechas.js';
import { formatearMoneda } from '../core/formato.js';
import { ReporteDatos } from './reporte-datos.js';

// ====================================================================
// REPORTES DE TEXTO — arman el contenido de los .txt descargables (sin DOM)
// ====================================================================
const fmtFecha = str => (!str ? '—' : parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
const sep = '─'.repeat(48), sep2 = '═'.repeat(48);
const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
const fmt = (m, mon) => formatearMoneda(m, mon);

export const ReportesTexto = {
    /** Reporte del mes/año elegido (con filtro opcional por categoría). Devuelve { texto, nombreArchivo }. */
    mensual({ servicios, mes, anio, categoria = null, ingresosHabilitado = false, hoy = new Date(), ahora = new Date() }) {
        const d = ReporteDatos.mensual({ servicios, mes, anio, categoria, hoy });
        const { nombreMes, nombreMesCorto, venceEsteMes, pagadasOtroMes, ingresos, totales } = d;
        let txt = `${sep2}\n  REPORTE DE ESTADÍSTICAS\n  Período: ${nombreMes.toUpperCase()}${d.categoria ? `  |  Categoría: ${d.categoria}` : ''}\n  Generado: ${ahora.toLocaleString('es-AR')}\n${sep2}\n\n`;
        txt += `FACTURAS QUE VENCEN EN ${nombreMesCorto.toUpperCase()}\n${sep}\n`;
        if (venceEsteMes.length === 0) { txt += `  (ninguna)\n`; }
        else {
            venceEsteMes.forEach(({ servicio, factura, estado }) => {
                const monto = factura.monto < 0 ? `  [saldo a favor ${fmt(Math.abs(factura.monto), factura.moneda || 'ars')}]` : fmt(factura.monto, factura.moneda || 'ars');
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento:', fmtFecha(factura.fecha))}\n${linea('  Monto:', monto)}\n${linea('  Estado:', estado)}\n`;
                if (factura.pagada && factura.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(factura.fechaPago)) + '\n';
            });
            txt += `\n${sep}\n`;
            if (totales.vencen.ars > 0) txt += linea('  Total del mes (ARS):', fmt(totales.vencen.ars, 'ars')) + '\n';
            if (totales.vencen.usd > 0) txt += linea('  Total del mes (USD):', fmt(totales.vencen.usd, 'usd')) + '\n';
            if (totales.pagadas.ars > 0) txt += linea('  Pagado (ARS):', fmt(totales.pagadas.ars, 'ars')) + '\n';
            if (totales.pagadas.usd > 0) txt += linea('  Pagado (USD):', fmt(totales.pagadas.usd, 'usd')) + '\n';
            if (totales.pendientes.ars > 0) txt += linea('  Pendiente (ARS):', fmt(totales.pendientes.ars, 'ars')) + '\n';
            if (totales.pendientes.usd > 0) txt += linea('  Pendiente (USD):', fmt(totales.pendientes.usd, 'usd')) + '\n';
        }
        txt += `\nPAGADAS EN ${nombreMesCorto.toUpperCase()} (VENCIMIENTO OTRO MES)\n${sep}\n`;
        if (pagadasOtroMes.length === 0) { txt += `  (ninguna)\n`; }
        else {
            pagadasOtroMes.forEach(({ servicio, factura }) => {
                const mesVenc = parseDate(factura.fecha).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento original:', `${fmtFecha(factura.fecha)} (${mesVenc})`)}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n${linea('  Fecha de pago:', fmtFecha(factura.fechaPago))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totales.pagadasOtroMes.ars > 0) txt += linea('  Subtotal (ARS):', fmt(totales.pagadasOtroMes.ars, 'ars')) + '\n';
            if (totales.pagadasOtroMes.usd > 0) txt += linea('  Subtotal (USD):', fmt(totales.pagadasOtroMes.usd, 'usd')) + '\n';
        }
        if (ingresosHabilitado && ingresos.length > 0) {
            txt += `\nINGRESOS DEL MES\n${sep}\n`;
            ingresos.forEach(({ factura }) => {
                txt += `\n  ${factura.tipo || 'regular'}\n${linea('  Fecha:', fmtFecha(factura.fecha))}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totales.ingresos.ars > 0) txt += linea('  Total ingresos (ARS):', fmt(totales.ingresos.ars, 'ars')) + '\n';
            if (totales.ingresos.usd > 0) txt += linea('  Total ingresos (USD):', fmt(totales.ingresos.usd, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        return { texto: txt, nombreArchivo: `reporte_${nombreMes.replace(/\s+/g, '_')}.txt` };
    },

    /** Reporte de un servicio en el rango [desde, hasta]. Devuelve { texto, nombreArchivo }. */
    individual({ servicio, desde = '', hasta = '', hoy = new Date(), ahora = new Date() }) {
        const { facturas, totales } = ReporteDatos.individual({ servicio, desde, hasta, hoy });
        const { total, promedio, pagado, pendiente } = totales;
        const periodoTxt = desde || hasta ? `${desde ? fmtFecha(desde) : '—'}  →  ${hasta ? fmtFecha(hasta) : '—'}` : 'Sin filtro de fechas';
        let txt = `${sep2}\n  REPORTE INDIVIDUAL\n  Servicio: ${servicio.nombre}\n  Período: ${periodoTxt}\n  Generado: ${ahora.toLocaleString('es-AR')}\n${sep2}\n\nDETALLE DE FACTURAS (${facturas.length})\n${sep}\n`;
        if (facturas.length === 0) { txt += `  (ninguna en el período seleccionado)\n`; }
        else {
            facturas.forEach(({ factura: f, estado }, i) => {
                txt += `\n  #${String(i + 1).padStart(2, '0')}  ${fmtFecha(f.fecha)}\n${linea('  Monto:', fmt(f.monto, f.moneda || 'ars'))}\n${linea('  Estado:', estado)}\n`;
                if (f.pagada && f.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(f.fechaPago)) + '\n';
                if (f.tipo && f.tipo !== 'mensual') txt += linea('  Tipo:', f.tipo) + '\n';
            });
            txt += `\n${sep}\n  RESUMEN\n${sep}\n`;
            if (total.ars !== 0) txt += linea('  Total ARS:', fmt(total.ars, 'ars')) + '\n';
            if (total.usd !== 0) txt += linea('  Total USD:', fmt(total.usd, 'usd')) + '\n';
            if (promedio.ars !== 0) txt += linea('  Promedio ARS:', fmt(promedio.ars, 'ars')) + '\n';
            if (promedio.usd !== 0) txt += linea('  Promedio USD:', fmt(promedio.usd, 'usd')) + '\n';
            if (pagado.ars > 0) txt += linea('  Pagado ARS:', fmt(pagado.ars, 'ars')) + '\n';
            if (pagado.usd > 0) txt += linea('  Pagado USD:', fmt(pagado.usd, 'usd')) + '\n';
            if (pendiente.ars > 0) txt += linea('  Pendiente ARS:', fmt(pendiente.ars, 'ars')) + '\n';
            if (pendiente.usd > 0) txt += linea('  Pendiente USD:', fmt(pendiente.usd, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        return { texto: txt, nombreArchivo: `reporte_${servicio.nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.txt` };
    },
};
