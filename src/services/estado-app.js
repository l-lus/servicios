// ====================================================================
// ESTADO DE LA APP — store central del dominio (sin DOM)
// Única fuente de verdad de lo que se persiste: los servicios del perfil activo
// y los perfiles. La UI lo lee y lo reasigna; las reglas viven en los demás servicios.
// ====================================================================
/**
 * @typedef {{ id: string, monto: number, fecha: string, pagada: boolean, fechaPago?: string | null, modificada?: string, moneda?: string, tipo?: string, conCredito?: boolean, [clave: string]: any }} Factura
 * @typedef {{ id: string, nombre: string, categoria: string, facturas: Factura[], [clave: string]: any }} Servicio
 */
export const EstadoApp = {
    /** Servicios (con sus facturas) del perfil activo. @type {Servicio[]} */
    servicios: [],
    /** { id: { id, nombre, creado } } @type {Record<string, { id: string, nombre: string, creado?: string, [clave: string]: any }>} */
    perfiles: {},
    /** Registro de lo borrado en el perfil activo (para que el borrado llegue a los otros dispositivos; ver services/sincronizacion.js). @type {import('./sincronizacion.js').Borrado[]} */
    borrados: [],
    /** Id del perfil activo ('default' por defecto). */
    perfilActivo: 'default',
};
