import { parseDate } from './fechas.js';

// ====================================================================
// FORMATO — monedas y fechas para mostrar (es-AR), sin DOM
// ====================================================================
export function formatearMoneda(monto, moneda = 'ars') {
    const decimales = (Number.isInteger(monto) || monto % 1 === 0) ? 0 : 2;
    if (moneda === 'usd') {
        return 'u$s ' + new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: decimales, maximumFractionDigits: decimales
        }).format(monto);
    }
    return new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: 'ARS',
        minimumFractionDigits: decimales, maximumFractionDigits: decimales
    }).format(monto);
}

export function formatearFecha(fecha) {
    return parseDate(fecha).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}
