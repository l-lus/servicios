export const APP_NOMBRE = 'SERVICIOS';
export const APP_VERSION = 'v261109';

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
    ESTILO_CALENDARIO: 'estilo-calendario',
    HOVER_POPUP: 'hover-popup-calendario',
    RUEDA_CALENDARIO: 'rueda-calendario',
    ESTILO_TARJETA: 'estilo-tarjeta',
    FONDO_CARD: 'fondo-card',
    BIENVENIDA_VISTA: 'bienvenida-vista',
    ORDEN_CARDS: 'orden-tarjetas',
    ORDEN_CARDS_MOVIL: 'orden-tarjetas-movil',
    COLUMNAS_CARDS: 'columnas-tarjetas',
    CARD_VISIBLE: (cual) => `tarjeta-visible-${cual}`,
    SERVICIOS_COLLAPSE: 'servicios-collapse-state',
    GIST_TOKEN: 'gist_token',

    DATOS_PERFIL: (perfilId) => `gestion_servicios_datos_${perfilId}`,
    HISTORIAL: (perfilId) => `gestion_servicios_historial_${perfilId}`,
});

/** Fondo de la tarjeta principal de un perfil nuevo o restablecido. */
export const FONDO_CARD_POR_DEFECTO = 'golden-gate';

/** Tarjetas de la pantalla principal, en su orden por defecto (el id del elemento es `card-<nombre>`). */
export const CARDS = Object.freeze(['resumen', 'estadisticas', 'calendario', 'servicios']);

/** Nombre para mostrar de cada tarjeta. */
export const CARDS_ETIQUETAS = Object.freeze({ resumen: 'Resumen', estadisticas: 'Estadísticas', calendario: 'Calendario', servicios: 'Servicios' });
