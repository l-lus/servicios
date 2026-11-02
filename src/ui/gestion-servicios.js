import { BienvenidaModal } from './bienvenida-modal.js';
import { CalendarioVista } from './calendario-vista.js';
import { ReporteModal } from './reporte-modal.js';
import { RespaldoModal } from './respaldo-modal.js';
import { normalizarBusqueda } from '../core/busqueda-texto.js';
import { EstadoApp } from '../services/estado-app.js';
import { ListenersApp } from './listeners-app.js';
import { ServicioService } from './servicio-service.js';
import { VistaServicios } from './vista-servicios.js';
import { EventosApp } from '../core/eventos.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { debounce } from '../core/debounce.js';
import { Motion } from '../core/movimiento.js';
import { EstadoFacturas, SERVICIO_INGRESOS_ID } from '../services/estado-facturas.js';
import { Anim } from './animaciones.js';
import { CalculadorService } from './calculador-service.js';
import { CategoriaService } from './categoria-service.js';
import { CustomSelect } from './custom-select.js';
import { EstadisticasService } from './estadisticas-service.js';
import { FacturaService } from './factura-service.js';
import { ModalManager } from './gestor-modales.js';
import { GistService } from './gist-service.js';
import { HistorialManager } from './historial-manager.js';
import { IngresoService } from './ingreso-service.js';
import { ContextMenuService } from './menu-contextual.js';
import { PerfilService } from './perfil-service.js';
import { StorageService } from './storage-service.js';
import { UIManager } from './ui-manager.js';
import { UtilsService } from './utils-service.js';

// ============================================
// APLICACIÓN DE GESTIÓN DE SERVICIOS
// ============================================

export class GestionServicios {
    constructor() {
        // core/ no conoce a la app: se le inyecta cómo resolver el perfil activo
        StorageHelper.setProfileKeyResolver(() => EstadoApp.perfilActivo);

        // Acciones de "volver" que dependen de servicios de la app
        ModalManager.registrarAccionVolver('menu-ajustes', () => this.ui.cerrarMenuAjustes());
        ModalManager.registrarAccionVolver('menu-agregar', () => this.ui.cerrarMenuAgregar());

        // Eventos del gestor de modales (el gestor ya no conoce a la app)
        EventosApp.on('modal:cerrado', ({ modalId }) => {
            if (modalId === 'modal-gist') this.gist?.actualizarBotones();
        });
        EventosApp.on('modales:cerrados-todos', () => {
            this._anoExpandidoFacturas = {};
            this._anoExpandidoIngresos = {};
        });

        // Sistema de perfiles — PerfilService se instancia primero porque
        // cargar() se necesita durante la construcción
        EstadoApp.perfilActivo = StorageHelper.getItem(STORAGE_KEYS.PERFIL_ACTIVO) || 'default';
        this.perfil = new PerfilService(this);
        EstadoApp.perfiles = this.perfil.cargar();

        // Datos y estado
        EstadoApp.servicios = [];
        this.servicioActual = null;
        this.facturaActual = null;
        this.origenModalFactura = null; // 'menu' o 'servicio'
        this._anoExpandidoFacturas = {};
        this._anoExpandidoIngresos = {};
        try {
            this._catColapsadas = StorageHelper.getObject(STORAGE_KEYS.CAT_COLAPSADAS, {});
            this._catColapsadasAntesBusqueda = null;
        } catch (e) {
            this._catColapsadas = {};
        }

        this._agrupacionActiva = StorageHelper.getItem(STORAGE_KEYS.CAT_AGRUPACION) === 'on';
        this._vistaEstados = StorageHelper.getItem(STORAGE_KEYS.VISTA_ESTADOS) === 'true';
        if (!this._agrupacionActiva && !this._vistaEstados) {
            // si ninguna está activa, estado por defecto
        }
        // Modo calculadora - NUEVO
        this.modoCalculadora = false;
        this.modoCalculadoraTipo = 'pendientes';
        this.serviciosSeleccionados = new Set();
        this.servicioContextual = null;

        // Configuración
        this.mostrandoPagadoMes = StorageHelper.getItem(STORAGE_KEYS.RESUMEN_MOSTRAR_PAGADO) === 'true';
        this.resumenDesblurado = false; // Siempre empieza blureado al cargar
        this.blurHabilitado = StorageHelper.getItem(STORAGE_KEYS.BLUR_MONTOS) === 'true';
        this.datosResumen = { pendiente: 0, pagadoMes: 0, totalPeriodo: 0 };
        this.serviciosCollapseState = 'expanded'; // 'expanded', 'semi-collapsed', 'collapsed'

        // Timer para doble click en toggle de servicios
        this.toggleServiciosTimer = null;
        this.toggleServiciosDelay = 500;

        // Ordenamiento de lista de servicios
        this.ordenActual = StorageHelper.getItem(STORAGE_KEYS.ORDEN) || 'nombre';
        this.terminoBusqueda = '';
        this.enModoBusqueda = false;
        this._ctxServicioId = null;
        this.BUSQUEDA_DEBOUNCE_MS = 200;
        this._busquedaDebounced = null;

        // Timer para el toast
        this.toastTimeout = null;

        // Cache para animaciones condicionales
        this.ultimoEstadoEstadisticas = null;
        this.ultimoEstadoCalculador = null;
        this.ultimoEstadoResumen = null;

        this.SERVICIO_INGRESOS_ID = SERVICIO_INGRESOS_ID;

        // Tipo de estadística seleccionado
        this.tipoEstadisticaActual = StorageHelper.getItem(STORAGE_KEYS.ESTADISTICAS_TIPO) || 'mensual';
        this._estadisticaCategoriaActiva = null;

        // Estado de modales/flujos de servicios auxiliares
        this.ingresoActual         = null;
        this.ingresoDesdeMenu      = false;
        this.perfilEditando        = null;
        this._gistDatosPendientes  = null;
        this._lpTimer              = null;
        this._lpFired              = false;
        this._categoriaTargetSelect = null;
        this._modalServicioOrigen  = null;
        this._calcTotalARS         = 0;
        this._calcTotalUSD         = 0;
        this._gistAutoSyncTemp     = null;
        this._gistMergeBehaviorTemp = null;

        // Servicios auxiliares
        this.factura = new FacturaService(this);
        this.ingreso = new IngresoService(this);
        this.ctx = new ContextMenuService(this);
        this.categoria = new CategoriaService(this);
        this.estadisticas = new EstadisticasService(this);
        this.ui = new UIManager(this);
        this.utils = new UtilsService(this);
        this.calculador = new CalculadorService(this);
        this.gist = new GistService(this);
        this.historial_mgr = new HistorialManager(this);
        this.storage = new StorageService(this);
        this.respaldo = new RespaldoModal(this);
        this.reporte = new ReporteModal(this);
        this.calendario = new CalendarioVista(this);
        this.bienvenida = new BienvenidaModal(this);
        this.vista = new VistaServicios(this);
        this.listeners = new ListenersApp(this);
        this.servicio = new ServicioService(this);

        // Cargar datos del perfil activo - NUEVO (debe ir después de instanciar this.storage)
        this.storage.cargarDatosPerfilActivo();

        this.init();
        this.gistAutoSyncInit();
        this.bienvenida.chequearYMostrar();
    }

    // ========================================
    // INICIALIZACIÓN
    // ========================================

    init() {
        Motion.init();
        this.calendario.init();
        Anim.initColapsables();
        this.ui.cargarTema();
        this.estadisticas.actualizarResumenMes();
        this.vista.renderServicios();
        this.listeners.setupEventListeners();
        this.historial_mgr.actualizarBotones();
        this.ui.cargarCotizacionDolar();

        // Inicializar indicador de ingresos
        if (StorageHelper.getItem(STORAGE_KEYS.INGRESOS_HABILITADO) === null) {
            StorageHelper.setItem(STORAGE_KEYS.INGRESOS_HABILITADO, 'false');
        }
        const ingresosHabilitado = this.ui.ingresosHabilitado();
        const indicator = document.getElementById('ingresos-indicator');
        if (indicator) {
            indicator.textContent = ingresosHabilitado ? 'SI' : 'NO';
        }
        const blurIndicator = document.getElementById('blur-indicator');
        if (blurIndicator) blurIndicator.textContent = this.blurHabilitado ? 'SI' : 'NO';
        const animIndicator = document.getElementById('animaciones-indicator');
        if (animIndicator) animIndicator.textContent = Motion.etiqueta();

        // Restaurar estado de estadísticas colapsadas
        const estadisticasColapsadas = StorageHelper.getItem(STORAGE_KEYS.ESTADISTICAS_COLAPSADAS) === 'true';
        if (estadisticasColapsadas) {
            document.getElementById('estadisticas-content').classList.add('collapsed');
            document.getElementById('estadisticas-chevron').classList.add('collapsed');
        } else {
            // Si está expandido, cargar el tipo guardado
            const tipoGuardado = StorageHelper.getItem(STORAGE_KEYS.ESTADISTICAS_TIPO) || 'mensual';
            this.tipoEstadisticaActual = tipoGuardado;
            document.getElementById('estadisticas-tipo').value = tipoGuardado;
            this.estadisticas.cambiarTipoEstadistica();
        }

        // Inicializar CustomSelect para estadisticas-tipo
        const csdEstTipo = document.getElementById('estadisticas-tipo-csd');
        const selEstTipo = document.getElementById('estadisticas-tipo');
        if (csdEstTipo && selEstTipo && !csdEstTipo._customSelect) {
            csdEstTipo._customSelect = new CustomSelect(csdEstTipo, selEstTipo, () => {
                this.tipoEstadisticaActual = selEstTipo.value;
                StorageHelper.setItem(STORAGE_KEYS.ESTADISTICAS_TIPO, selEstTipo.value);
                this.estadisticas.cambiarTipoEstadistica();
            });
        }

        // Inicializar CustomSelects estáticos (modales, formularios)
        this._initCustomSelects();

        // Restaurar estado de servicios colapsados
        const serviciosState = StorageHelper.getItem(STORAGE_KEYS.SERVICIOS_COLLAPSE) || 'semi-collapsed';
        this.serviciosCollapseState = serviciosState;
        this.vista.aplicarEstadoServicios(serviciosState);

        // Botón ordenar
        document.getElementById('btn-sort').addEventListener('click', () => {
            const select = document.getElementById('select-orden');
            if (select) select.value = this.ordenActual;
            const selectVista = document.getElementById('select-vista');
            if (selectVista) {
                if (this._vistaEstados) selectVista.value = 'estados';
                else if (this._agrupacionActiva) selectVista.value = 'categorias';
                else selectVista.value = 'todo';
            }
            // Refrescar CustomSelects del modal-ordenar
            const csdOrden = document.getElementById('select-orden-csd');
            if (csdOrden?._customSelect) csdOrden._customSelect.refresh();
            const csdVista = document.getElementById('select-vista-csd');
            if (csdVista?._customSelect) csdVista._customSelect.refresh();
            this.ui.abrirModal('modal-ordenar');
        });

        document.getElementById('select-orden').addEventListener('change', () => {
            this.vista.aplicarOrden();
        });

        document.getElementById('select-vista').addEventListener('change', (e) => this.vista.cambiarVista(e.target.value));

        // Listeners para sincronizar botón toggle de monto con el input
        document.getElementById('factura-monto').addEventListener('input', (e) => {
            this.servicio.actualizarEstadoBotonToggle('factura-monto', 'btn-toggle-negativo');
        });

        document.getElementById('editar-factura-monto').addEventListener('input', (e) => {
            this.servicio.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');
        });

        // Buscador
        const searchInput = document.getElementById('search-input');
        const searchClear = document.getElementById('search-clear');

        // Filtrar y re-renderizar la lista es lo costoso: se agrupa por
        // debounce. El botón de limpiar sí responde en cada tecla.
        const aplicarBusqueda = (termino) => {
            // Al empezar a escribir, guardar estado de grupos
            if (!this.terminoBusqueda && termino) {
                this._catColapsadasAntesBusqueda = JSON.parse(JSON.stringify(this._catColapsadas));
            }

            this.terminoBusqueda = termino;
            this.enModoBusqueda = true;

            // Si hay búsqueda activa, expandir grupos con resultados
            if (this.terminoBusqueda) {
                EstadoApp.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).forEach(servicio => {
                    const coincide = normalizarBusqueda(servicio.nombre).includes(this.terminoBusqueda);
                    if (coincide) {
                        // Expandir grupo por categoría
                        const cat = servicio.categoria || '';
                        delete this._catColapsadas[cat];
                        // Expandir grupo por estado
                        const claseEstado = this.vista.calcularEstadoServicio(servicio).claseEstado;
                        const esPendiente = ['vencido', 'urgente', 'proximo', 'lejano'].includes(claseEstado);
                        const keyEstado = esPendiente ? '__estado_pendiente' : `__estado_${claseEstado}`;
                        delete this._catColapsadas[keyEstado];
                    }
                });
            }

            this.vista.renderServicios();
        };
        this._busquedaDebounced = debounce(aplicarBusqueda, this.BUSQUEDA_DEBOUNCE_MS);

        searchInput.addEventListener('input', (e) => {
            const termino = normalizarBusqueda(e.target.value).trim();
            searchClear.classList.toggle('d-flex-force', !!termino);
            // Vaciar el campo restaura la lista al instante
            if (!termino) { this._busquedaDebounced.cancel(); aplicarBusqueda(termino); return; }
            this._busquedaDebounced(termino);
        });

        searchClear.addEventListener('click', () => {
            this.utils.limpiarBusqueda();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._busquedaDebounced.flush();
            if (e.key === 'Escape') {
                this.utils.limpiarBusqueda();
                searchInput.blur();
            }
        });

        // Inicializar botones de respaldo/restauración según Gist
        this.gist.actualizarBotones();

        // Inicializar menú contextual
        this.ctx.init();

    }

    // ========================================
    // GESTIÓN DE PERFILES
    // ========================================

    // ── Delegación a PerfilService ────────────────────────────
    // ========================================
    // CUSTOM SELECTS — inicialización global
    // ========================================

    _initCustomSelects() {
        // Helper para inicializar un CSD ligado a un <select> nativo
        const init = (wrapperId, selectId, onChange) => {
            const wrapper = document.getElementById(wrapperId);
            const native  = document.getElementById(selectId);
            if (wrapper && native && !wrapper._customSelect) {
                wrapper._customSelect = new CustomSelect(wrapper, native, onChange);
            }
        };

        // Modal factura nueva — servicio y tipo
        init('factura-servicio-csd', 'factura-servicio', null);
        init('factura-tipo-csd',     'factura-tipo',     null);

        // Modal editar factura — servicio y tipo
        init('editar-factura-servicio-csd', 'editar-factura-servicio', null);
        init('editar-factura-tipo-csd',     'editar-factura-tipo',     null);

        // Modal nuevo servicio — categoría
        init('servicio-categoria-csd', 'servicio-categoria', null);

        // Modal editar servicio — categoría
        init('editar-servicio-categoria-csd', 'editar-servicio-categoria', null);

        // Modal ordenar — orden y vista
        init('select-orden-csd', 'select-orden', () => this.vista.aplicarOrden());
        init('select-vista-csd', 'select-vista', () => {
            const val = document.getElementById('select-vista').value;
            this._vistaEstados    = val === 'estados';
            this._agrupacionActiva = val === 'categorias';
            StorageHelper.setItem(STORAGE_KEYS.CAT_AGRUPACION, this._agrupacionActiva ? 'on' : 'off');
            StorageHelper.setItem(STORAGE_KEYS.VISTA_ESTADOS,  this._vistaEstados ? 'true' : 'false');
            this.vista.renderServicios();
        });

        // Modal nuevo ingreso — tipo
        init('ingreso-tipo-csd', 'ingreso-tipo', null);

        // Modal editar ingreso — tipo
        init('editar-ingreso-tipo-csd', 'editar-ingreso-tipo', null);
    }

    // ========================================
    // MENÚ CONTEXTUAL Y CALCULADORA
    // ========================================

    // ── Delegación a CalculadorService ───────────────────────
    activarModoCalculadora(silencioso = false) { this.calculador.activarModo(silencioso); }
    desactivarModoCalculadora(silencioso = false) { this.calculador.desactivarModo(silencioso); }

    // ========================================
    // GESTIÓN DE FECHA
    // ========================================

    // ── Delegación a EstadisticasService ─────────────────────



    // ========================================
    // GESTIÓN DE SERVICIOS
    // ========================================












    // Anima el ítem recién guardado en la lista de facturas/ingresos,
    // expandiendo su año si estaba colapsado. Espera a que termine de
    // abrirse el modal para que la animación se vea.



    // ── Categorías ──────────────────────────────────────────────
    // ── Delegación a CategoriaService ────────────────────────




    // ========================================
    // GESTIÓN DE FACTURAS
    // ========================================





    // ========================================
    // SISTEMA UNDO/REDO
    // ========================================

    guardarEstado(descripcion = null) { this.historial_mgr.guardarEstado(descripcion); this._marcarRenderAnimado(); }

    // Toast de éxito con botón "Deshacer". Solo deshace si el historial
    // sigue en el estado que dejó esta acción; si después hubo otra, avisa
    // en lugar de deshacer algo distinto de lo que dice el toast.
    toastConDeshacer(mensaje) {
        const indice = this.historial_mgr.indiceActual();
        this.ui.mostrarToast(mensaje, 'success', 5000, null, {
            label: 'Deshacer',
            fn: () => {
                if (this.historial_mgr.indiceActual() !== indice || !this.historial_mgr.puedeDeshacer()) {
                    this.ui.mostrarToast('Esa acción ya no se puede deshacer desde acá', 'info');
                    return;
                }
                this.historial_mgr.deshacer();
            }
        });
    }

    // Los renders que siguen a un cambio de datos (guardar, deshacer) animan
    // la lista; los de búsqueda, orden o filtros no. La marca dura hasta que
    // termina la tarea actual.
    _marcarRenderAnimado() {
        this._animarRender = true;
        queueMicrotask(() => { this._animarRender = false; });
    }
    // ========================================
    // PERSISTENCIA DE DATOS
    // ========================================

    // NOTA: este método quedó obsoleto cuando se implementó el sistema de perfiles.
    // El flujo real de carga es: constructor → cargarDatosPerfilActivo() → inicializarHistorial()
    // Se conserva por compatibilidad pero NO debe llamarse directamente.
    // TODO: eliminar en la próxima limpieza de código.





    // ========================================
    // TEMA
    // ========================================

    // ── Delegación a UIManager ────────────────────────────────

    // ========================================
    // MODALES Y MENÚS
    // ========================================

    // ── Delegación a UtilsService ─────────────────────────────
    _postGuardado(descripcion = null) { this.utils.postGuardado(descripcion); }
    // ========================================
    // GESTIÓN DE INGRESOS
    // ========================================


    // ========================================
    // GIST SYNC
    // ========================================

    // ── Delegación a GistService ──────────────────────────────
    async gistBajar(esAutomatico = false) { await this.gist.bajar(esAutomatico); }
    async gistAutoSyncInit() {
        // Debounce de 3s al arrancar: da tiempo a que la UI cargue antes de verificar novedades
        setTimeout(() => this.gist.autoSyncInit(), 3000);
    }



    // ========================================
    // MENÚ CONTEXTUAL SERVICIOS
    // ========================================

    // ── Delegación a ContextMenuService ──────────────────────
    mostrarToast(mensaje, tipo = 'success') { this.ui.mostrarToast(mensaje, tipo); }
}
