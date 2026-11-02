import { parseDate, inicioDeDia } from '../core/fechas.js';
import { formatearMoneda, formatearFecha } from '../core/formato.js';
import { normalizarBusqueda } from '../core/busqueda-texto.js';

// ====================================================================
// ESTADO DE FACTURAS Y SERVICIOS — reglas de dominio puras (sin DOM)
// Todas reciben `hoy` para poder probarse con una fecha fija.
// ====================================================================
export const SERVICIO_INGRESOS_ID = 'servicio-ingresos-especial';

const MS_DIA = 1000 * 60 * 60 * 24;
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

/** Factura anual pagada cuyo vencimiento cae en el año de `hoy` (o null). */
function _anualVigente(servicio, hoy) {
    return (servicio.facturas || []).find(f =>
        f.tipo === 'anual' && f.pagada && parseDate(f.fecha).getFullYear() === hoy.getFullYear()) || null;
}

export const EstadoFacturas = {
    /** Clasifica una factura: 'favor' | 'pagada' | 'vencida' | 'pendiente'. */
    clasificarFactura(factura, hoy = new Date()) {
        if (factura.monto < 0) return 'favor';
        if (factura.pagada) return 'pagada';
        return inicioDeDia(parseDate(factura.fecha)) < inicioDeDia(hoy) ? 'vencida' : 'pendiente';
    },

    /**
     * Clase de color de una factura según su vencimiento (las mismas de la lista de servicios):
     * 'favor' | 'pagado' | 'vencido' | 'urgente' (hasta 2 días) | 'proximo' (hasta 5) | 'lejano'.
     */
    claseVencimiento(factura, hoy = new Date()) {
        if (factura.monto < 0) return 'favor';
        if (factura.pagada) return 'pagado';
        const dias = Math.ceil((inicioDeDia(parseDate(factura.fecha)) - inicioDeDia(hoy)) / MS_DIA);
        if (dias < 0) return 'vencido';
        if (dias <= 2) return 'urgente';
        if (dias <= 5) return 'proximo';
        return 'lejano';
    },

    /**
     * Factura que representa al servicio en la lista: la pendiente más próxima del mes actual
     * o, si todas están pagadas, la más reciente del mes. null si el mes no tiene facturas.
     */
    ultimaFactura(servicio, hoy = new Date()) {
        if (!servicio || !servicio.facturas || servicio.facturas.length === 0) return null;

        const base = inicioDeDia(hoy);
        const primerDia = new Date(base.getFullYear(), base.getMonth(), 1);
        const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0);

        const enRango = servicio.facturas.filter(f => {
            const venc = parseDate(f.fecha);
            return venc >= primerDia && venc <= ultimoDia;
        });
        if (enRango.length === 0) return null;

        const noPagadas = enRango.filter(f => !f.pagada);
        if (noPagadas.length === 0) {
            return enRango.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        }
        return noPagadas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0];
    },

    /** Texto y clase del estado de un servicio para su fila en la lista. */
    estadoServicio(servicio, hoy = new Date()) {
        const ultima = EstadoFacturas.ultimaFactura(servicio, hoy);
        let estado = '', claseEstado = '', montoTexto = '-', fechaTexto = '';

        if (servicio.id === SERVICIO_INGRESOS_ID && ultima) {
            montoTexto = formatearMoneda(ultima.monto, ultima.moneda || 'ars');
            fechaTexto = formatearFecha(ultima.fecha);
            if (inicioDeDia(parseDate(ultima.fecha)) <= inicioDeDia(hoy)) {
                estado = 'Cobrado'; claseEstado = 'pagado';
            } else {
                estado = 'Liquidado'; claseEstado = 'lejano';
            }
            return { estado, claseEstado, montoTexto, fechaTexto };
        }

        if (ultima) {
            montoTexto = formatearMoneda(ultima.monto, ultima.moneda || 'ars');
            fechaTexto = formatearFecha(ultima.fecha);

            if (ultima.pagada) {
                estado = `Pagado ${ultima.fechaPago ? formatearFecha(ultima.fechaPago) : 'Sin fecha'}`;
                claseEstado = 'pagado';
            } else {
                const dias = Math.ceil((inicioDeDia(parseDate(ultima.fecha)) - inicioDeDia(hoy)) / MS_DIA);
                if (dias < 0) { estado = 'Vencido'; claseEstado = 'vencido'; }
                else if (dias === 0) { estado = 'Vence hoy'; claseEstado = 'urgente'; }
                else if (dias === 1) { estado = 'Vence mañana'; claseEstado = 'urgente'; }
                else if (dias <= 2) { estado = `Vence en ${dias} días`; claseEstado = 'urgente'; }
                else if (dias <= 5) { estado = `Vence en ${dias} días`; claseEstado = 'proximo'; }
                else { estado = `Vence en ${dias} días`; claseEstado = 'lejano'; }
            }
        } else if (servicio.facturas && servicio.facturas.length > 0) {
            const anual = _anualVigente(servicio, hoy);
            if (anual) {
                montoTexto = formatearMoneda(anual.monto, anual.moneda || 'ars');
                fechaTexto = formatearFecha(anual.fecha);
                estado = `Pagado ${anual.fechaPago ? formatearFecha(anual.fechaPago) : 'Sin fecha'} · Anual`;
                claseEstado = 'pagado';
            } else {
                estado = 'Sin facturas de este mes'; claseEstado = 'sin-facturas-mes';
            }
        } else {
            estado = 'Sin facturas'; claseEstado = 'sin-facturas';
        }
        return { estado, claseEstado, montoTexto, fechaTexto };
    },

    /** Búsqueda por nombre, sin distinguir mayúsculas ni acentos. El servicio de ingresos nunca se filtra por texto. */
    filtrar(servicios, termino) {
        const buscado = normalizarBusqueda(termino || '').trim();
        if (!buscado) return servicios;
        return servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID && normalizarBusqueda(s.nombre).includes(buscado));
    },

    /** Ordena una copia: 'nombre' | 'vencimiento' | 'monto-desc' | 'monto-asc'. */
    ordenar(servicios, criterio, hoy = new Date()) {
        const base = inicioDeDia(hoy);
        const ultima = s => EstadoFacturas.ultimaFactura(s, hoy);

        return [...servicios].sort((a, b) => {
            switch (criterio) {
                case 'nombre':
                    return porNombre(a, b);

                case 'vencimiento': {
                    const facturaA = ultima(a);
                    const facturaB = ultima(b);
                    const tieneA = a.facturas && a.facturas.length > 0;
                    const tieneB = b.facturas && b.facturas.length > 0;

                    // 1: sin facturas nunca → final absoluto
                    if (!tieneA && !tieneB) return porNombre(a, b);
                    if (!tieneA) return 1;
                    if (!tieneB) return -1;

                    const fechaA = facturaA ? inicioDeDia(parseDate(facturaA.fecha)) : null;
                    const fechaB = facturaB ? inicioDeDia(parseDate(facturaB.fecha)) : null;

                    const vencidaA = facturaA && !facturaA.pagada && fechaA < base;
                    const vencidaB = facturaB && !facturaB.pagada && fechaB < base;
                    const pendienteA = facturaA && !facturaA.pagada && !vencidaA;
                    const pendienteB = facturaB && !facturaB.pagada && !vencidaB;
                    const pagadaA = facturaA && facturaA.pagada;
                    const pagadaB = facturaB && facturaB.pagada;
                    const sinMesA = !facturaA;
                    const sinMesB = !facturaB;
                    const anualA = sinMesA && !!_anualVigente(a, base);
                    const anualB = sinMesB && !!_anualVigente(b, base);

                    // 2: vencidas primero
                    if (vencidaA && !vencidaB) return -1;
                    if (!vencidaA && vencidaB) return 1;
                    if (vencidaA && vencidaB) return fechaA - fechaB;

                    // 3: pendientes
                    if (pendienteA && !pendienteB) return -1;
                    if (!pendienteA && pendienteB) return 1;
                    if (pendienteA && pendienteB) return fechaA - fechaB;

                    // 4: sin facturas este mes (las anuales vigentes van con las pagadas)
                    const sinMesRealA = sinMesA && !anualA;
                    const sinMesRealB = sinMesB && !anualB;
                    if (sinMesRealA && !sinMesRealB) return -1;
                    if (!sinMesRealA && sinMesRealB) return 1;
                    if (sinMesRealA && sinMesRealB) {
                        const ultA = [...a.facturas].sort((x, y) => new Date(y.fecha) - new Date(x.fecha))[0];
                        const ultB = [...b.facturas].sort((x, y) => new Date(y.fecha) - new Date(x.fecha))[0];
                        return new Date(ultB.fecha) - new Date(ultA.fecha);
                    }

                    // 5: pagadas normales; 6: pagadas anuales vigentes al final
                    if (pagadaA && !anualA && (anualB || !pagadaB)) return -1;
                    if (pagadaB && !anualB && (anualA || !pagadaA)) return 1;
                    if (pagadaA && pagadaB && fechaA && fechaB) return fechaA - fechaB;
                    return 0;
                }

                case 'monto-desc':
                    return (ultima(b)?.monto || 0) - (ultima(a)?.monto || 0);

                case 'monto-asc':
                    return (ultima(a)?.monto || 0) - (ultima(b)?.monto || 0);

                default:
                    return 0;
            }
        });
    },
};
