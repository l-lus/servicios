import { parseDate, restaFechas } from '../core/fechas.js';
import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// CALCULADORA — suma de servicios seleccionados y análisis de un período (sin DOM)
// ====================================================================
const mesInfo = (hoy) => {
    const mes = hoy.getMonth(), anio = hoy.getFullYear();
    return {
        mes, anio,
        mesSiguiente: mes === 11 ? 0 : mes + 1, anioSiguiente: mes === 11 ? anio + 1 : anio,
        mesPasado: mes === 0 ? 11 : mes - 1, anioPasado: mes === 0 ? anio - 1 : anio,
    };
};

export const Calculadora = {
    /**
     * Total de las facturas de los servicios elegidos. tipo 'pendientes': impagas del mes pasado, actual y siguiente;
     * 'pagados': las del mes actual y las pagadas este mes; cualquier otro tipo suma todo lo positivo.
     */
    totalSeleccion(servicios, ids, tipo, hoy = new Date()) {
        const { mes, anio, mesSiguiente, anioSiguiente, mesPasado, anioPasado } = mesInfo(hoy);
        let totalARS = 0, totalUSD = 0, cantidad = 0;
        ids.forEach(id => {
            const servicio = servicios.find(s => s.id === id);
            if (!servicio) return;
            servicio.facturas.forEach(factura => {
                if (factura.monto <= 0) return;
                const f = parseDate(factura.fecha);
                const mesF = f.getMonth(), anioF = f.getFullYear();
                const esMesActual = mesF === mes && anioF === anio;
                if (tipo === 'pendientes') {
                    if (factura.pagada) return;
                    const esSiguiente = mesF === mesSiguiente && anioF === anioSiguiente;
                    const esPasado = mesF === mesPasado && anioF === anioPasado;
                    if (!esMesActual && !esSiguiente && !esPasado) return;
                } else if (tipo === 'pagados') {
                    if (!factura.pagada) return;
                    const fp = factura.fechaPago ? parseDate(factura.fechaPago) : null;
                    const pagadaEsteMes = fp && fp.getMonth() === mes && fp.getFullYear() === anio;
                    if (!esMesActual && !pagadaEsteMes) return;
                }
                if ((factura.moneda || 'ars') === 'usd') totalUSD += factura.monto;
                else totalARS += factura.monto;
                cantidad++;
            });
        });
        return { totalARS, totalUSD, cantidad };
    },

    /** Variación porcentual entre el inicio y el final de una serie de facturas: '+4.2%', 'N/A', '+∞', '0%' o null. */
    variacion(facturas) {
        const total = facturas.length;
        if (total < 2) return total === 1 ? 'N/A' : null;
        let promPrim, promUlt;
        const prom = (lista, n) => lista.reduce((s, f) => s + f.monto, 0) / n;
        if (total <= 3) { promPrim = facturas[0].monto; promUlt = facturas[total - 1].monto; }
        else if (total <= 8) { const m = Math.floor(total / 2); promPrim = prom(facturas.slice(0, m), m); promUlt = prom(facturas.slice(-m), m); }
        else { const g = Math.min(6, Math.max(3, Math.floor(total * 0.3))); promPrim = prom(facturas.slice(0, g), g); promUlt = prom(facturas.slice(-g), g); }
        if (promPrim !== 0) { const v = ((promUlt - promPrim) / Math.abs(promPrim)) * 100; return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`; }
        return promUlt > 0 ? '+∞' : '0%';
    },

    /** Facturas de un servicio dentro de [desde, hasta] (ISO, ambos opcionales), ordenadas por fecha. No muta el servicio. */
    facturasEnRango(servicio, desde, hasta) {
        let lista = [...servicio.facturas];
        if (desde) { const fd = parseDate(desde); lista = lista.filter(f => parseDate(f.fecha) >= fd); }
        if (hasta) { const fh = parseDate(hasta); lista = lista.filter(f => parseDate(f.fecha) <= fh); }
        return lista.sort((a, b) => restaFechas(a.fecha, b.fecha));
    },

    /** Totales, cantidades y variación de un servicio en el período. */
    analizarPeriodo(servicio, desde, hasta) {
        const esIngresos = servicio.id === SERVICIO_INGRESOS_ID;
        const facturas = Calculadora.facturasEnRango(servicio, desde, hasta);
        let arsTotal = 0, usdTotal = 0, arsCount = 0, usdCount = 0;
        facturas.forEach(f => {
            if ((f.moneda || 'ars') === 'usd') { usdTotal += f.monto; usdCount++; }
            else { arsTotal += f.monto; arsCount++; }
        });
        const paraVariacion = esIngresos ? facturas.filter(f => f.tipo !== 'complementario') : facturas;
        const varARSLista = paraVariacion.filter(f => (f.moneda || 'ars') === 'ars');
        const varUSDLista = paraVariacion.filter(f => (f.moneda || 'ars') === 'usd');
        const varARS = Calculadora.variacion(varARSLista);
        const varUSD = Calculadora.variacion(varUSDLista);
        /** @type {string | null} */
        let variacionTexto = '0%';
        if (varARS !== null) variacionTexto = varARS;
        else if (varARSLista.length === 0 && varUSDLista.length > 0) variacionTexto = null;
        else if (paraVariacion.length === 0 && esIngresos && facturas.length > 0) variacionTexto = 'Solo extras';
        else if (varARSLista.length === 1) variacionTexto = 'N/A';
        return { totalRegistros: facturas.length, arsTotal, usdTotal, arsCount, usdCount, variacionTexto, variacionUSDTexto: varUSD };
    },
};
