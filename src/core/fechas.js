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

/** Días enteros desde `hoy` hasta la fecha ISO (negativo si ya pasó). */
export function diasHasta(fechaISO, hoy = new Date()) {
    return Math.ceil((inicioDeDia(parseDate(fechaISO)) - inicioDeDia(hoy)) / MS_DIA);
}
