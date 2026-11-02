export const APP_NOMBRE = 'SERVICIOS';
export const APP_VERSION = 'v261101';

// ============================================================
// STORAGE KEYS — única fuente de verdad de las claves de localStorage
// ============================================================
export const STORAGE_KEYS = Object.freeze({
    TEMA: 'gestion_servicios_theme',
    PERFIL_ACTIVO: 'gestion_servicios_perfil_activo',
    PERFILES: 'gestion_servicios_perfiles',
    ORDEN: 'gestion_servicios_orden',
    REDUCIR_ANIMACIONES: 'gestion_servicios_reducir_animaciones',
    CATEGORIAS: 'categorias-servicios',
    CAT_COLAPSADAS: 'cat-colapsadas',
    CAT_AGRUPACION: 'cat-agrupacion',
    VISTA_ESTADOS: 'vista-estados',
    RESUMEN_MOSTRAR_PAGADO: 'resumen-mostrar-pagado',
    BLUR_MONTOS: 'blur-montos',
    INGRESOS_HABILITADO: 'ingresos-habilitado',
    ESTADISTICAS_TIPO: 'estadisticas-tipo',
    ESTADISTICAS_COLAPSADAS: 'estadisticas-collapsed',
    CALENDARIO_ABIERTO: 'calendario-abierto',
    BIENVENIDA_VISTA: 'bienvenida-vista',
    ATAJOS: 'atajos',
    SERVICIOS_COLLAPSE: 'servicios-collapse-state',
    GIST_TOKEN: 'gist_token',

    DATOS_PERFIL: (perfilId) => `gestion_servicios_datos_${perfilId}`,
    HISTORIAL: (perfilId) => `gestion_servicios_historial_${perfilId}`,
});
