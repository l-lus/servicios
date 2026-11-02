import { fechaLocalISO } from '../core/fechas.js';
import { EstadoFacturas, SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// CALENDARIO DE VENCIMIENTOS — arma la grilla de un mes con las facturas de cada día (sin DOM)
// ====================================================================
// De más a menos urgente: el color de un día es el de su factura más urgente.
const PRIORIDAD = ['vencido', 'urgente', 'proximo', 'lejano', 'pagado', 'favor'];

const mon = f => ((f.moneda || 'ars') === 'usd' ? 'usd' : 'ars');

export const CalendarioVencimientos = {
    PRIORIDAD,

    /** Clase más urgente de una lista de clases (o '' si está vacía). */
    claseDelDia(clases) {
        return PRIORIDAD.find(c => clases.includes(c)) || '';
    },

    /** Mes anterior o siguiente de { anio, mes } (mes 0–11). */
    desplazarMes({ anio, mes }, delta) {
        const d = new Date(anio, mes + delta, 1);
        return { anio: d.getFullYear(), mes: d.getMonth() };
    },

    /**
     * Grilla de un mes (semanas de domingo a sábado, como en Horarios). Cada celda es `null` (relleno) o
     * { fecha, dia, esHoy, facturas: [{ servicio, factura, clase }], clase, total: { ars, usd } }.
     * `resumen` cuenta lo que vence en el mes: { facturas, pagadas, pendientes, vencidas, total, pendiente }.
     */
    construirMes(servicios, { anio, mes }, hoy = new Date()) {
        const porFecha = new Map();
        let facturas = 0, pagadas = 0, pendientes = 0, vencidas = 0;
        const total = { ars: 0, usd: 0 }, pendiente = { ars: 0, usd: 0 };

        servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const [a, m] = factura.fecha.split('-').map(Number);
                if (a !== anio || m - 1 !== mes) return;
                const clase = EstadoFacturas.claseVencimiento(factura, hoy);
                if (!porFecha.has(factura.fecha)) porFecha.set(factura.fecha, []);
                porFecha.get(factura.fecha).push({ servicio, factura, clase });
                if (factura.monto <= 0) return;
                facturas++;
                if (!factura.conCredito) total[mon(factura)] += factura.monto;
                if (factura.pagada) pagadas++;
                else {
                    pendientes++;
                    if (clase === 'vencido') vencidas++;
                    if (!factura.conCredito) pendiente[mon(factura)] += factura.monto;
                }
            });
        });

        const hoyISO = fechaLocalISO(hoy);
        const diasEnMes = new Date(anio, mes + 1, 0).getDate();
        const primerDia = new Date(anio, mes, 1).getDay();   // domingo = 0
        const celdas = Array(primerDia).fill(null);
        for (let dia = 1; dia <= diasEnMes; dia++) {
            const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const delDia = (porFecha.get(fecha) || []).sort((x, y) => x.servicio.nombre.localeCompare(y.servicio.nombre, 'es', { sensitivity: 'base' }));
            const totalDia = { ars: 0, usd: 0 };
            delDia.forEach(({ factura: f }) => { if (f.monto > 0 && !f.conCredito) totalDia[mon(f)] += f.monto; });
            celdas.push({ fecha, dia, esHoy: fecha === hoyISO, facturas: delDia, clase: CalendarioVencimientos.claseDelDia(delDia.map(x => x.clase)), total: totalDia });
        }
        while (celdas.length % 7 !== 0) celdas.push(null);
        const semanas = [];
        for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));

        return { anio, mes, semanas, resumen: { facturas, pagadas, pendientes, vencidas, total, pendiente } };
    },
};
