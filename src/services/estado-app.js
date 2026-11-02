// ====================================================================
// ESTADO DE LA APP — store central del dominio (sin DOM)
// Única fuente de verdad de lo que se persiste: los servicios del perfil activo
// y los perfiles. La UI lo lee y lo reasigna; las reglas viven en los demás servicios.
// ====================================================================
export const EstadoApp = {
    /** Servicios (con sus facturas) del perfil activo. */
    servicios: [],
    /** { id: { id, nombre, creado } } */
    perfiles: {},
    /** Id del perfil activo ('default' por defecto). */
    perfilActivo: 'default',
};
