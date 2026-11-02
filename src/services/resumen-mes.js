import { parseDate, inicioDeDia } from '../core/fechas.js';
import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// RESUMEN DEL MES Y ESTADÍSTICAS MENSUALES — cálculo puro (sin DOM)
// Reciben `servicios` y `hoy`; devuelven datos para que la UI los dibuje.
// ====================================================================
const MS_DIA = 86400000;
const enMes = (fecha, mes, anio) => fecha.getMonth() === mes && fecha.getFullYear() === anio;

export const ResumenMes = {
    /** Totales del mes en curso (ARS/USD), cantidades y pagos del mes. */
    calcular(servicios, hoy = new Date()) {
        const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
        let totalAPagarARS = 0, totalAPagarUSD = 0;
        let totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalPagadoDelMesActualARS = 0, totalPagadoDelMesActualUSD = 0;
        let totalFacturasMesActualARS = 0, totalFacturasMesActualUSD = 0;
        let cantidadPagadasVencenEsteMes = 0, cantidadPendientesEsteMes = 0;

        servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const esDelMesActual = enMes(parseDate(factura.fecha), mesActual, anioActual);
                const moneda = factura.moneda || 'ars';
                const excluir = factura.conCredito === true;
                if (esDelMesActual) {
                    if (factura.monto < 0) return;
                    const pagadaEsteMes = factura.pagada && factura.fechaPago
                        && enMes(parseDate(factura.fechaPago), mesActual, anioActual);
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
                    if (enMes(parseDate(factura.fechaPago), mesActual, anioActual)) {
                        if (moneda === 'usd') totalPagadoMesUSD += factura.monto;
                        else totalPagadoMesARS += factura.monto;
                    }
                }
            });
        });

        return {
            pendienteARS: totalAPagarARS, pendienteUSD: totalAPagarUSD,
            pagadoMesARS: totalPagadoMesARS, pagadoMesUSD: totalPagadoMesUSD,
            pagadoDelMesActualARS: totalPagadoDelMesActualARS, pagadoDelMesActualUSD: totalPagadoDelMesActualUSD,
            totalPeriodoARS: totalFacturasMesActualARS, totalPeriodoUSD: totalFacturasMesActualUSD,
            cantidadPagadasVencenEsteMes, cantidadPendientesEsteMes,
            pendiente: totalAPagarARS + totalAPagarUSD,
            pagadoMes: totalPagadoMesARS,
            pagadoDelMesActual: totalPagadoDelMesActualARS,
            totalPeriodo: totalFacturasMesActualARS,
        };
    },

    /** Clase de borde de la tarjeta de resumen según la factura más urgente del mes. */
    colorBorde(servicios, hoy = new Date()) {
        const base = inicioDeDia(hoy);
        const mesActual = base.getMonth(), anioActual = base.getFullYear();
        let prioridad = 5, colorBorde = '';
        servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                if (!enMes(parseDate(factura.fecha), mesActual, anioActual)) return;
                if (!factura.pagada) {
                    const dias = Math.ceil((inicioDeDia(parseDate(factura.fecha)) - base) / MS_DIA);
                    if (dias < 0 && prioridad > 1) { prioridad = 1; colorBorde = 'borde-vencido'; }
                    else if (dias <= 2 && prioridad > 1) { prioridad = 1; colorBorde = 'borde-urgente'; }
                    else if (dias <= 5 && prioridad > 2) { prioridad = 2; colorBorde = 'borde-proximo'; }
                    else if (prioridad > 3) { prioridad = 3; colorBorde = 'borde-lejano'; }
                }
            });
        });
        return colorBorde || 'borde-pagado';
    },

    /**
     * Detalle del modal "info resumen": facturas que vencen este mes (con su estado)
     * y las pagadas este mes que vencían en otro.
     */
    detalle(servicios, hoy = new Date()) {
        const base = inicioDeDia(hoy);
        const mesActual = base.getMonth(), anioActual = base.getFullYear();
        const vencenEsteMes = [], pagadasOtroMes = [];
        servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                if (factura.monto < 0) return;
                const fechaVenc = parseDate(factura.fecha);
                const venceEsteMes = enMes(fechaVenc, mesActual, anioActual);
                const pagadaEsteMes = factura.pagada && factura.fechaPago
                    && enMes(parseDate(factura.fechaPago), mesActual, anioActual);
                if (venceEsteMes) {
                    let estado, badgeClass;
                    if (factura.conCredito) { estado = 'Con crédito'; badgeClass = 'badge-pagada-credito'; }
                    else if (factura.pagada && pagadaEsteMes) { estado = 'Pagada este mes'; badgeClass = 'badge-pagada-mes'; }
                    else if (factura.pagada && !pagadaEsteMes) {
                        const mp = parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' });
                        estado = `Pagada en ${mp}`; badgeClass = 'badge-pagada-antes';
                    }
                    else if (!factura.pagada && fechaVenc < base) { estado = 'Vencida'; badgeClass = 'badge-vencida'; }
                    else { estado = 'Pendiente'; badgeClass = 'badge-pendiente'; }
                    vencenEsteMes.push({ servicio: servicio.nombre, factura, estado, badgeClass });
                } else if (pagadaEsteMes) {
                    pagadasOtroMes.push({
                        servicio: servicio.nombre, factura,
                        mesVenc: fechaVenc.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                    });
                }
            });
        });
        return { vencenEsteMes, pagadasOtroMes };
    },

    /** Totales y cantidades de un mes/año elegido (con filtro opcional por categoría). */
    estadisticasMes(servicios, { mes, anio, categoria = null, hoy = new Date() }) {
        const base = inicioDeDia(hoy);
        let cantidadPendientes = 0, cantidadPagadas = 0, cantidadVencidas = 0, cantidadFacturasMes = 0;
        let totalMesARS = 0, totalMesUSD = 0, totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalIngresosARS = 0, totalIngresosUSD = 0;

        servicios.forEach(servicio => {
            if (categoria && servicio.id !== SERVICIO_INGRESOS_ID) {
                if ((servicio.categoria || '') !== categoria) return;
            }
            servicio.facturas.forEach(factura => {
                const fechaFactura = parseDate(factura.fecha);
                if (enMes(fechaFactura, mes, anio)) {
                    const moneda = factura.moneda || 'ars';
                    if (servicio.id === SERVICIO_INGRESOS_ID) {
                        if (moneda === 'usd') totalIngresosUSD += factura.monto;
                        else totalIngresosARS += factura.monto;
                        return;
                    }
                    if (factura.monto < 0) { cantidadPagadas++; return; }
                    cantidadFacturasMes++;
                    if (!factura.conCredito || categoria) {
                        if (moneda === 'usd') totalMesUSD += factura.monto;
                        else totalMesARS += factura.monto;
                    }
                    if (!factura.pagada) {
                        if (inicioDeDia(fechaFactura) < base) cantidadVencidas++; else cantidadPendientes++;
                    }
                }
                if (factura.pagada && factura.fechaPago && factura.monto > 0 && servicio.id !== SERVICIO_INGRESOS_ID) {
                    if (enMes(parseDate(factura.fechaPago), mes, anio)) {
                        cantidadPagadas++;
                        if (!factura.conCredito || categoria) {
                            if ((factura.moneda || 'ars') === 'usd') totalPagadoMesUSD += factura.monto;
                            else totalPagadoMesARS += factura.monto;
                        }
                    }
                }
            });
        });

        return { totalMesARS, totalMesUSD, totalPagadoMesARS, totalPagadoMesUSD, cantidadPendientes, cantidadPagadas, cantidadVencidas, cantidadFacturasMes, totalIngresosARS, totalIngresosUSD };
    },
};
