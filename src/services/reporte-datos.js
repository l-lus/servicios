import { parseDate, inicioDeDia } from '../core/fechas.js';
import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';
import { Calculadora } from './calculadora.js';

// ====================================================================
// DATOS DE REPORTES — arman lo que cuentan los reportes (texto y HTML) sin dar formato (sin DOM)
// ====================================================================
const moneda = f => ((f.moneda || 'ars') === 'usd' ? 'usd' : 'ars');
const sumar = (lista, filtro = () => true) => lista.reduce((acc, f) => {
    if (filtro(f)) acc[moneda(f)] += f.monto;
    return acc;
}, { ars: 0, usd: 0 });

/** Estado de una factura para mostrar: 'Con crédito', 'Pagada…', 'Vencida (pendiente)' o 'Pendiente'. */
export function estadoFactura(factura, hoy, formatoPago = 'mes') {
    if (factura.conCredito) return 'Con crédito';
    if (factura.pagada) {
        const opciones = formatoPago === 'mes-anio' ? { month: 'long', year: 'numeric' } : { month: 'long' };
        const mp = factura.fechaPago ? parseDate(factura.fechaPago).toLocaleDateString('es-AR', opciones) : '';
        if (formatoPago === 'mes-anio') return `Pagada${mp ? ` (${mp})` : ''}`;
        return `Pagada${mp ? ` en ${mp}` : ''}`;
    }
    return inicioDeDia(parseDate(factura.fecha)) < inicioDeDia(hoy) ? 'Vencida (pendiente)' : 'Pendiente';
}

export const ReporteDatos = {
    /** Un mes (mes 0–11 y año), con filtro opcional por categoría. */
    mensual({ servicios, mes, anio, categoria = null, hoy = new Date() }) {
        const activa = categoria || null;
        const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const nombreMesCorto = new Date(anio, mes, 1).toLocaleDateString('es-AR', { month: 'long' });
        const venceEsteMes = [], pagadasOtroMes = [], ingresos = [];

        servicios.forEach(servicio => {
            if (activa && servicio.id !== SERVICIO_INGRESOS_ID && (servicio.categoria || '') !== activa) return;
            servicio.facturas.forEach(factura => {
                const venc = parseDate(factura.fecha);
                const venceAca = venc.getMonth() === mes && venc.getFullYear() === anio;
                if (servicio.id === SERVICIO_INGRESOS_ID) {
                    if (venceAca) ingresos.push({ servicio, factura });
                    return;
                }
                if (venceAca) {
                    venceEsteMes.push({ servicio, factura, estado: estadoFactura(factura, hoy) });
                } else if (factura.pagada && factura.fechaPago) {
                    const fp = parseDate(factura.fechaPago);
                    if (fp.getMonth() === mes && fp.getFullYear() === anio) pagadasOtroMes.push({ servicio, factura });
                }
            });
        });

        const normales = venceEsteMes.filter(({ factura: f }) => !f.conCredito);
        const totales = {
            vencen: sumar(venceEsteMes.map(x => x.factura), f => !f.conCredito && f.monto > 0),
            pagadas: sumar(normales.map(x => x.factura), f => f.pagada),
            pendientes: sumar(normales.map(x => x.factura), f => !f.pagada),
            pagadasOtroMes: sumar(pagadasOtroMes.map(x => x.factura), f => !f.conCredito),
            ingresos: sumar(ingresos.map(x => x.factura)),
        };

        // Gasto del mes por categoría (solo facturas que vencen en el mes, sin créditos ni saldos a favor)
        const porCat = new Map();
        venceEsteMes.forEach(({ servicio, factura: f }) => {
            if (f.conCredito || f.monto <= 0) return;
            const clave = servicio.categoria || '';
            const fila = porCat.get(clave) || { categoria: clave, ars: 0, usd: 0, cantidad: 0 };
            fila[moneda(f)] += f.monto;
            fila.cantidad++;
            porCat.set(clave, fila);
        });
        const porCategoria = [...porCat.values()].sort((a, b) => (b.ars + b.usd) - (a.ars + a.usd));

        return { nombreMes, nombreMesCorto, categoria: activa, venceEsteMes, pagadasOtroMes, ingresos, totales, porCategoria };
    },

    /** Un servicio en el rango [desde, hasta] (ISO, opcionales). */
    individual({ servicio, desde = '', hasta = '', hoy = new Date() }) {
        const facturas = Calculadora.facturasEnRango(servicio, desde, hasta);
        const total = sumar(facturas);
        const pagado = sumar(facturas, f => f.pagada);
        const pendiente = sumar(facturas, f => !f.pagada);
        const cuenta = m => facturas.filter(f => moneda(f) === m).length;
        const promedio = { ars: cuenta('ars') > 0 ? total.ars / cuenta('ars') : 0, usd: cuenta('usd') > 0 ? total.usd / cuenta('usd') : 0 };
        const filas = facturas.map(f => ({ factura: f, estado: estadoFactura(f, hoy, 'mes-anio') }));
        return { servicio, desde, hasta, facturas: filas, totales: { total, promedio, pagado, pendiente }, analisis: Calculadora.analizarPeriodo(servicio, desde, hasta) };
    },
};
