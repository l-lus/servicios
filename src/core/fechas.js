// ====================================================================
// FECHAS — utilidades puras sobre fechas ISO (YYYY-MM-DD)
// ====================================================================
const MS_DIA = 1000 * 60 * 60 * 24;

const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** ¿Es una fecha 'YYYY-MM-DD' que existe en el calendario? ('2026-02-30' o '2026-13-01' no lo son). Para validar fechas que vienen de afuera. @param {unknown} v */
export function esFechaISO(v) {
    const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
    if (!m) return false;
    const anio = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    if (mes < 1 || mes > 12 || dia < 1) return false;
    const bisiesto = anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
    return dia <= (mes === 2 && bisiesto ? 29 : DIAS_POR_MES[mes - 1]);
}

/**
 * ¿Es un instante en el formato exacto de `Date.toISOString()` ('2026-11-10T15:30:00.000Z') y existe en el calendario?
 * Con ese formato fijo, comparar dos instantes como texto equivale a compararlos en el tiempo. Para validar instantes que vienen de afuera.
 * @param {unknown} v
 */
export function esInstanteISO(v) {
    const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/.exec(v) : null;
    return !!m && esFechaISO(m[1]);
}

/** 'YYYY-MM-DD' → Date a medianoche local. */
export function parseDate(str) {
    return new Date(str + 'T00:00:00');
}

/** Copia de `fecha` (o ahora) a medianoche local. */
export function inicioDeDia(fecha = new Date()) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** Fecha local de hoy como 'YYYY-MM-DD'. */
export function fechaLocalISO(fecha = new Date()) {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

/** Milisegundos de `a` menos `b` (para ordenar y comparar). Acepta Date o fecha ISO; null cuenta como 0. @param {Date | string | number | null} a @param {Date | string | number | null} b */
export function restaFechas(a, b) {
    return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}

/** Días enteros desde `hoy` hasta la fecha ISO (negativo si ya pasó). */
export function diasHasta(fechaISO, hoy = new Date()) {
    return Math.ceil(restaFechas(inicioDeDia(parseDate(fechaISO)), inicioDeDia(hoy)) / MS_DIA);
}
