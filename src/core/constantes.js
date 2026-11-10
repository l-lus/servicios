export const APP_NOMBRE = 'SERVICIOS';
export const APP_VERSION = 'v261110';

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
    POSICION_HEADER: 'posicion-header',            // dónde va el encabezado en PC: arriba, abajo, izquierda o derecha (ver core/posicion-header.js)
    POSICION_HEADER_MOVIL: 'posicion-header-movil', // ídem en móvil: solo arriba o abajo
    HOVER_POPUP: 'hover-popup-calendario',
    RUEDA_CALENDARIO: 'rueda-calendario',
    ESTILO_TARJETA: 'estilo-tarjeta',
    FONDO_CARD: 'fondo-card',
    BIENVENIDA_VISTA: 'bienvenida-vista',
    ORDEN_CARDS: 'orden-tarjetas',
    ORDEN_CARDS_MOVIL: 'orden-tarjetas-movil',
    COLUMNAS_CARDS: 'columnas-tarjetas',   // tamaños de las columnas con 2 columnas (se corta el orden de ORDEN_CARDS)
    ORDEN_CARDS_3: 'orden-tarjetas-3',   // orden propio con 3 columnas (sin él se parte del de 2 columnas)
    COLUMNAS_CARDS_3: 'columnas-tarjetas-3',   // tamaños de las columnas con 3 columnas (se corta el orden de ORDEN_CARDS_3)
    CARD_VISIBLE: (cual) => `tarjeta-visible-${cual}`,
    SERVICIOS_COLLAPSE: 'servicios-collapse-state',
    GIST_TOKEN: 'gist_token',
    FRASE_CIFRADO: 'frase_cifrado',   // la frase con que se cifran el Gist y los respaldos: solo en la sesión o, con «recordar», en el navegador (ver core/secretos.js); nunca va al respaldo

    DATOS_PERFIL: (perfilId) => `gestion_servicios_datos_${perfilId}`,
    HISTORIAL: (perfilId) => `gestion_servicios_historial_${perfilId}`,
    // registro de lo que se borró en este perfil (para que el borrado llegue a los otros dispositivos al sincronizar; ver services/sincronizacion.js)
    BORRADOS: (perfilId) => `gestion_servicios_borrados_${perfilId}`,
    // copia sin tocar de los datos de un perfil cuando al cargarlos hubo que descartar algo inválido (para no perderlo al próximo guardado)
    DATOS_RESCATE: (perfilId) => `gestion_servicios_rescate_${perfilId}`,
});

/** Cortes de ancho que cambian el diseño (los mismos que el CSS): escritorio desde 768px y columnas extra desde 1100px. */
export const CORTES_LAYOUT = Object.freeze({ ESCRITORIO: '(min-width: 768px)', ANCHO: '(min-width: 1100px)' });

/** Fondo de la tarjeta principal de un perfil nuevo o restablecido. */
export const FONDO_CARD_POR_DEFECTO = 'golden-gate';

/** Tarjetas de la pantalla principal, en su orden por defecto (el id del elemento es `card-<nombre>`). */
export const CARDS = Object.freeze(['resumen', 'estadisticas', 'calendario', 'servicios']);

/** Nombre para mostrar de cada tarjeta. */
export const CARDS_ETIQUETAS = Object.freeze({ resumen: 'Resumen', estadisticas: 'Estadísticas', calendario: 'Calendario', servicios: 'Servicios' });
