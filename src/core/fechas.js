// ====================================================================
// FECHAS — utilidades puras sobre fechas ISO (YYYY-MM-DD)
// ====================================================================
const MS_DIA = 1000 * 60 * 60 * 24;

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
