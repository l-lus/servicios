import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// RESUMEN ANUAL — totales por mes y por categoría de un año (sin DOM)
// ====================================================================
const mon = f => ((f.moneda || 'ars') === 'usd' ? 'usd' : 'ars');
const anioDe = fecha => Number(fecha.slice(0, 4));
const mesDe = fecha => Number(fecha.slice(5, 7)) - 1;
const monto = par => par.ars + par.usd;

export const ResumenAnual = {
    /** Años con facturas (de mayor a menor); si no hay ninguna, el año de `hoy`. */
    aniosDisponibles(servicios, hoy = new Date()) {
        const anios = new Set();
        servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID).forEach(s => s.facturas.forEach(f => anios.add(anioDe(f.fecha))));
        return anios.size ? [...anios].sort((a, b) => b - a) : [hoy.getFullYear()];
    },

    /** Gasto de un año: por mes (meses 0–11), por categoría, promedio, extremos y comparación con el año anterior. */
    calcular(servicios, anio) {
        const meses = Array.from({ length: 12 }, (_, mes) => ({ mes, ars: 0, usd: 0, cantidad: 0, pagadas: 0 }));
        const categorias = new Map();
        const total = { ars: 0, usd: 0 }, pendiente = { ars: 0, usd: 0 }, anterior = { ars: 0, usd: 0 }, ingresos = { ars: 0, usd: 0 };
        let facturas = 0, pagadas = 0;

        servicios.forEach(servicio => {
            const esIngresos = servicio.id === SERVICIO_INGRESOS_ID;
            servicio.facturas.forEach(f => {
                const a = anioDe(f.fecha);
                if (esIngresos) { if (a === anio) ingresos[mon(f)] += f.monto; return; }
                if (f.monto <= 0 || f.conCredito) return;       // saldos a favor y créditos no son gasto
                if (a === anio - 1) { anterior[mon(f)] += f.monto; return; }
                if (a !== anio) return;
                const fila = meses[mesDe(f.fecha)];
                fila[mon(f)] += f.monto;
                fila.cantidad++;
                total[mon(f)] += f.monto;
                facturas++;
                if (f.pagada) { fila.pagadas++; pagadas++; } else pendiente[mon(f)] += f.monto;
                const clave = servicio.categoria || '';
                const cat = categorias.get(clave) || { categoria: clave, ars: 0, usd: 0, cantidad: 0 };
                cat[mon(f)] += f.monto;
                cat.cantidad++;
                categorias.set(clave, cat);
            });
        });

        // Los extremos se miden en la moneda con más movimiento del año (ARS salvo que solo haya USD) y el promedio, en cada una
        const medida = total.ars > 0 || total.usd === 0 ? 'ars' : 'usd';
        const mesesDe = m => meses.filter(x => x[m] > 0).length;
        const ordenados = meses.filter(x => x[medida] > 0).sort((x, y) => y[medida] - x[medida]);
        const promedio = { ars: mesesDe('ars') ? total.ars / mesesDe('ars') : 0, usd: mesesDe('usd') ? total.usd / mesesDe('usd') : 0 };
        const variacion = anterior.ars > 0 && total.ars > 0 ? ((total.ars - anterior.ars) / anterior.ars) * 100 : null;
        const porcentajeIngreso = ingresos.ars > 0 && total.ars > 0 ? (total.ars / ingresos.ars) * 100 : null;

        return {
            anio, meses, total, pendiente, promedio, anterior, ingresos, facturas, pagadas, medida,
            mesMayor: ordenados.length ? ordenados[0].mes : null,
            mesMenor: ordenados.length > 1 ? ordenados[ordenados.length - 1].mes : null,
            porCategoria: [...categorias.values()].sort((a, b) => monto(b) - monto(a)),
            variacion, porcentajeIngreso,
        };
    },
};
