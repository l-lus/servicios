import { EventosApp } from '../core/eventos.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { debounce } from '../core/debounce.js';
import { Motion } from '../core/movimiento.js';
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
        StorageHelper.setProfileKeyResolver(() => this.perfilActivo);

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
        this.perfilActivo = StorageHelper.getItem(STORAGE_KEYS.PERFIL_ACTIVO) || 'default';
        this.perfil = new PerfilService(this);
        this.perfiles = this.perfil.cargar();

        // Datos y estado
        this.servicios = [];
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

        this.SERVICIO_INGRESOS_ID = 'servicio-ingresos-especial';

        // Tipo de estadística seleccionado
        this.tipoEstadisticaActual = StorageHelper.getItem(STORAGE_KEYS.ESTADISTICAS_TIPO) || 'mensual';
        this._estadisticaCategoriaActiva = null;

        // Estado de modales/flujos de servicios auxiliares
        this.ingresoActual         = null;
        this.ingresoDesdeMenu      = false;
        this.perfilEditando        = null;
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

        // Cargar datos del perfil activo - NUEVO (debe ir después de instanciar this.storage)
        this.cargarDatosPerfilActivo();

        this.init();
        this.gistAutoSyncInit();
    }

    // ========================================
    // INICIALIZACIÓN
    // ========================================

    init() {
        Motion.init();
        Anim.initColapsables();
        this.ui.cargarTema();
        this.actualizarResumenMes();
        this.renderServicios();
        this.setupEventListeners();
        this.actualizarBotonesHistorial();
        this.cargarCotizacionDolar();

        // Inicializar indicador de ingresos
        if (StorageHelper.getItem(STORAGE_KEYS.INGRESOS_HABILITADO) === null) {
            StorageHelper.setItem(STORAGE_KEYS.INGRESOS_HABILITADO, 'false');
        }
        const ingresosHabilitado = this.ingresosHabilitado();
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
            this.cambiarTipoEstadistica();
        }

        // Inicializar CustomSelect para estadisticas-tipo
        const csdEstTipo = document.getElementById('estadisticas-tipo-csd');
        const selEstTipo = document.getElementById('estadisticas-tipo');
        if (csdEstTipo && selEstTipo && !csdEstTipo._customSelect) {
            csdEstTipo._customSelect = new CustomSelect(csdEstTipo, selEstTipo, () => {
                this.tipoEstadisticaActual = selEstTipo.value;
                StorageHelper.setItem(STORAGE_KEYS.ESTADISTICAS_TIPO, selEstTipo.value);
                this.cambiarTipoEstadistica();
            });
        }

        // Inicializar CustomSelects estáticos (modales, formularios)
        this._initCustomSelects();

        // Restaurar estado de servicios colapsados
        const serviciosState = StorageHelper.getItem(STORAGE_KEYS.SERVICIOS_COLLAPSE) || 'semi-collapsed';
        this.serviciosCollapseState = serviciosState;
        this.aplicarEstadoServicios(serviciosState);

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
            this.abrirModal('modal-ordenar');
        });

        document.getElementById('select-orden').addEventListener('change', () => {
            this.aplicarOrden();
        });

        document.getElementById('select-vista').addEventListener('change', (e) => {
            const val = e.target.value;
            this._vistaEstados = val === 'estados';
            this._agrupacionActiva = val === 'categorias';
            StorageHelper.setItem(STORAGE_KEYS.CAT_AGRUPACION, this._agrupacionActiva ? 'on' : 'off');
            StorageHelper.setItem(STORAGE_KEYS.VISTA_ESTADOS, this._vistaEstados ? 'true' : 'false');
            this.renderServicios();
        });

        // Listeners para sincronizar botón toggle de monto con el input
        document.getElementById('factura-monto').addEventListener('input', (e) => {
            this.actualizarEstadoBotonToggle('factura-monto', 'btn-toggle-negativo');
        });

        document.getElementById('editar-factura-monto').addEventListener('input', (e) => {
            this.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');
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
                this.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).forEach(servicio => {
                    const coincide = servicio.nombre.toLowerCase().includes(this.terminoBusqueda);
                    if (coincide) {
                        // Expandir grupo por categoría
                        const cat = servicio.categoria || '';
                        delete this._catColapsadas[cat];
                        // Expandir grupo por estado
                        const claseEstado = this.calcularEstadoServicio(servicio).claseEstado;
                        const esPendiente = ['vencido', 'urgente', 'proximo', 'lejano'].includes(claseEstado);
                        const keyEstado = esPendiente ? '__estado_pendiente' : `__estado_${claseEstado}`;
                        delete this._catColapsadas[keyEstado];
                    }
                });
            }

            this.renderServicios();
        };
        this._busquedaDebounced = debounce(aplicarBusqueda, this.BUSQUEDA_DEBOUNCE_MS);

        searchInput.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase().trim();
            searchClear.classList.toggle('d-flex-force', !!termino);
            // Vaciar el campo restaura la lista al instante
            if (!termino) { this._busquedaDebounced.cancel(); aplicarBusqueda(termino); return; }
            this._busquedaDebounced(termino);
        });

        searchClear.addEventListener('click', () => {
            this._limpiarBusqueda();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._busquedaDebounced.flush();
            if (e.key === 'Escape') {
                this._limpiarBusqueda();
                searchInput.blur();
            }
        });

        // Inicializar botones de respaldo/restauración según Gist
        this.gist.actualizarBotones();

        // Inicializar menú contextual
        this._ctxInit();

    }

    // ========================================
    // GESTIÓN DE PERFILES
    // ========================================

    // ── Delegación a PerfilService ────────────────────────────
    guardarPerfiles() { this.perfil.guardar(); }
    crearPerfilInline() { this.perfil.crearInline(); }

    cargarDatosPerfilActivo() { this.storage.cargarDatosPerfilActivo(); }
    guardarDatosPerfilActivo() { this.storage.guardarDatosPerfilActivo(); }

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
        init('select-orden-csd', 'select-orden', () => this.aplicarOrden());
        init('select-vista-csd', 'select-vista', () => {
            const val = document.getElementById('select-vista').value;
            this._vistaEstados    = val === 'estados';
            this._agrupacionActiva = val === 'categorias';
            StorageHelper.setItem(STORAGE_KEYS.CAT_AGRUPACION, this._agrupacionActiva ? 'on' : 'off');
            StorageHelper.setItem(STORAGE_KEYS.VISTA_ESTADOS,  this._vistaEstados ? 'true' : 'false');
            this.renderServicios();
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
    actualizarCalculadora() { this.calculador.actualizar(); }

    validarMonto(monto, neg)                     { return this.factura.validarMonto(monto, neg); }

    validarFecha(fecha)                          { return this.factura.validarFecha(fecha); }

    validarFechaPago(fp)                         { return this.factura.validarFechaPago(fp); }

    setupEventListeners() {
        // Botones principales
        document.getElementById('btn-agregar-servicio').addEventListener('click', () => {
            // Si está en modo calculadora, desactivar
            if (this.modoCalculadora) {
                this.desactivarModoCalculadora();
            } else {
                this.ui.toggleMenuAgregar();
            }
        });
        document.getElementById('btn-ajustes').addEventListener('click', () => this.toggleMenuAjustes());
        document.getElementById('menu-overlay').addEventListener('click', () => this.cerrarMenuAjustes());
        document.getElementById('btn-cerrar-menu').addEventListener('click', () => this.cerrarMenuAjustes());

        // Undo/Redo
        document.getElementById('btn-undo').addEventListener('click', () => this.deshacer());
        document.getElementById('btn-redo').addEventListener('click', () => this.rehacer());

        // Menú ajustes
        document.getElementById('menu-tema').addEventListener('click', () => this.ui.toggleTema());
        document.getElementById('menu-exportar').addEventListener('click', () => this.exportarDatos());
        document.getElementById('menu-importar').addEventListener('click', () => this.mostrarOpcionesImportacion());
        document.getElementById('menu-importar-reemplazar').addEventListener('click', () => this.importarDatos('reemplazar'));
        document.getElementById('menu-importar-combinar').addEventListener('click', () => this.importarDatos('combinar'));
        document.getElementById('menu-limpiar').addEventListener('click', () => this.mostrarOpcionesBorrar());
        document.getElementById('menu-dolar').addEventListener('click', () => this.toggleMenuDolar());
        document.getElementById('menu-borrar-todo').addEventListener('click', () => this.limpiarDatos('todo'));
        document.getElementById('menu-borrar-servicios').addEventListener('click', () => this.limpiarDatos('servicios'));
        document.getElementById('menu-borrar-facturas').addEventListener('click', () => this.limpiarDatos('facturas'));
        document.getElementById('menu-borrar-ingresos').addEventListener('click', () => this.limpiarDatos('ingresos'));
        document.getElementById('menu-borrar-categorias').addEventListener('click', () => this.limpiarDatos('categorias'));
        document.getElementById('menu-toggle-ingresos').addEventListener('click', () => this.ui.toggleIngresos());
        document.getElementById('menu-toggle-blur').addEventListener('click', () => this.ui.toggleBlur());
        document.getElementById('menu-toggle-animaciones').addEventListener('click', () => this.ui.toggleAnimaciones());

        // Menú agregar
        document.getElementById('menu-agregar-overlay').addEventListener('click', () => this.cerrarMenuAgregar());
        document.getElementById('menu-agregar-servicio').addEventListener('click', () => {
            this.cerrarMenuAgregar();
            this.abrirModalServicio();
        });
        document.getElementById('menu-agregar-factura').addEventListener('click', () => {
            this.cerrarMenuAgregar();
            this.ui.abrirModalFacturaRapida();
        });
        document.getElementById('menu-agregar-recibo').addEventListener('click', () => {
            this.cerrarMenuAgregar();
            this.abrirModalIngreso(null, true);
        });
        document.getElementById('menu-agregar-calcular').addEventListener('click', () => {
            document.getElementById('menu-vista-principal').classList.add('hidden-vista');
            const vistaCalc = document.getElementById('menu-vista-calcular');
            vistaCalc.classList.add('visible-vista');
            vistaCalc.classList.remove('anim-slide-up');
            void vistaCalc.offsetWidth; // reflow para reiniciar animación
            vistaCalc.classList.add('anim-slide-up');
        });

        document.getElementById('menu-calcular-volver').addEventListener('click', () => {
            document.getElementById('menu-vista-calcular').classList.remove('visible-vista');
            document.getElementById('menu-vista-calcular').classList.add('hidden-vista');
            const vistaPrincipal = document.getElementById('menu-vista-principal');
            vistaPrincipal.classList.remove('hidden-vista');
            vistaPrincipal.classList.remove('anim-slide-up');
            void vistaPrincipal.offsetWidth;
            vistaPrincipal.classList.add('anim-slide-up');
        });

        document.getElementById('menu-calcular-pendientes').addEventListener('click', () => {
            this.modoCalculadoraTipo = 'pendientes';
            this.cerrarMenuAgregar();
            this.activarModoCalculadora();
        });

        document.getElementById('menu-calcular-pagados').addEventListener('click', () => {
            this.modoCalculadoraTipo = 'pagados';
            this.cerrarMenuAgregar();
            this.activarModoCalculadora();
        });

        // Listener para toggle de resumen (solo una vez)
        document.addEventListener('click', (e) => {
            if (e.target.closest('#resumen-toggle')) {
                this.estadisticas.toggleResumen();
            }
        });

        // Modales
        document.getElementById('modal-servicio-close').addEventListener('click', () => this.cerrarModal('modal-agregar-servicio'));
        document.getElementById('modal-editar-servicio-close').addEventListener('click', () => {
            this.cerrarModal('modal-editar-servicio');
            // Volver al modal de facturas si venimos desde ahí
            if (this.servicioActual) {
                this.abrirModalFacturasServicio(this.servicioActual);
            }
        });
        document.getElementById('modal-factura-close').addEventListener('click', () => {
            this.cerrarModal('modal-agregar-factura');
            // Solo reabrir el modal de servicio si vino desde ahí
            if (this.origenModalFactura === 'servicio') {
                this.abrirModalFacturasServicio(this.servicioActual);
            }
        });

        // Menú de perfiles
        document.getElementById('menu-gist').addEventListener('click', () => {
            this.cerrarMenuAjustes();
            this.gist.abrirModal();
        });

        document.getElementById('menu-perfiles').addEventListener('click', () => {
            this.perfil.abrirModal();
        });

        // Event listener para el botón volver del grid (modo agregar)
        document.getElementById('modal-factura-close-en-grid').addEventListener('click', () => {
            this.cerrarModal('modal-editar-factura');
            // Solo reabrir el modal de servicio si vino desde ahí
            if (this.origenModalFactura === 'servicio') {
                this.abrirModalFacturasServicio(this.servicioActual);
            }
        });

        // Cerrar modales al hacer click fuera
        // Solo si el pointerdown también empezó en el overlay (no si viene de arrastrar desde dentro)
        document.querySelectorAll('.modal').forEach(modal => {
            let _downOnOverlay = false;
            modal.addEventListener('pointerdown', (e) => {
                _downOnOverlay = e.target === modal;
            }, { passive: true });
            modal.addEventListener('click', (e) => {
                if (e.target === modal && _downOnOverlay) {
                    _downOnOverlay = false;
                    if (modal.id === 'modal-confirmar') return;
                    ModalManager.ejecutarAccionCierre(modal.id);
                }
            });
        });

        // Formularios
        document.getElementById('form-servicio').addEventListener('submit', (e) => this.guardarServicio(e));
        document.getElementById('form-editar-servicio').addEventListener('submit', (e) => this.guardarServicio(e));
        document.getElementById('form-factura').addEventListener('submit', (e) => this.guardarFactura(e));
        document.getElementById('form-editar-factura').addEventListener('submit', (e) => this.guardarFactura(e));
        document.getElementById('btn-eliminar-servicio').addEventListener('click', () => this.eliminarServicio());
        document.getElementById('btn-borrar-facturas-servicio').addEventListener('click', () => this.borrarFacturasServicio());
        document.getElementById('btn-fecha-hoy').addEventListener('click', () => this.establecerFechaHoy('factura'));
        document.getElementById('btn-editar-fecha-hoy').addEventListener('click', () => this.establecerFechaHoy('factura', 'editar'));
        document.getElementById('btn-eliminar-factura-modal').addEventListener('click', () => this.eliminarFacturaDesdeModal());

        // Formulario de ingresos
        document.getElementById('form-ingreso').addEventListener('submit', (e) => this.guardarIngreso(e));
        document.getElementById('form-editar-ingreso').addEventListener('submit', (e) => this.guardarIngreso(e));
        document.getElementById('btn-eliminar-ingreso').addEventListener('click', () => this.eliminarIngreso());
        document.getElementById('btn-ingreso-fecha-hoy').addEventListener('click', () => {
            this.establecerFechaHoy('ingreso');
        });
        document.getElementById('btn-editar-ingreso-fecha-hoy').addEventListener('click', () => {
            this.establecerFechaHoy('ingreso', 'editar');
        });

        document.getElementById('modal-ingreso-close').addEventListener('click', () => {
            this.cerrarModal('modal-agregar-ingreso');
            if (!this.ingresoDesdeMenu) {
                this.abrirModalIngresosLista(this.SERVICIO_INGRESOS_ID);
            }
        });
        document.getElementById('modal-ingreso-volver').addEventListener('click', () => {
            this.cerrarModal('modal-editar-ingreso');
            if (!this.ingresoDesdeMenu) {
                this.abrirModalIngresosLista(this.SERVICIO_INGRESOS_ID);
            }
        });

        document.getElementById('estadisticas-header').addEventListener('click', () => {
            this.estadisticas.toggleEstadisticas();
        });

        // Selector de tipo de estadística
        document.getElementById('estadisticas-tipo').addEventListener('change', (e) => {
            this.tipoEstadisticaActual = e.target.value;
            StorageHelper.setItem(STORAGE_KEYS.ESTADISTICAS_TIPO, e.target.value);
            this.cambiarTipoEstadistica();
        });

        document.getElementById('btn-calculador-ver-facturas').addEventListener('click', () => {
            const servicioId = document.getElementById('calculador-servicio').value;
            if (servicioId) this.abrirModalFacturasServicio(servicioId);
        });

        // Inicializar calculador individual
        this.estadisticas.inicializarCalculador();

        // Toggle de servicios colapsable (3 estados)
        document.getElementById('servicios-header').addEventListener('click', () => {
            this.toggleServicios();
        });
        // Atajos de teclado
        document.addEventListener('keydown', (e) => {
            // ESC: cerrar modales, menús, modo calculadora o búsqueda
            if (e.key === 'Escape') {
                const hayCapaAbierta = document.querySelector(
                    '.modal.show, .modal.active, .menu-ajustes.active, .menu-ajustes.show, .menu-agregar.active, .menu-agregar.show, #ctx-menu-servicio.active, #ctx-menu-servicio.show'
                );

                if (this.modoCalculadora) { this.desactivarModoCalculadora(); return; }
                if (hayCapaAbierta) {
                    e.preventDefault();
                    this.volverDesdeModalActivo();
                    return;
                }
                if (this.terminoBusqueda) { this._limpiarBusqueda(); return; }
            }

            // Enter en modal nueva categoría
            if (e.key === 'Enter') {
                const modalCat = document.getElementById('modal-nueva-categoria');
                if (modalCat && (modalCat.classList.contains('active') || modalCat.classList.contains('show'))) {
                    e.preventDefault();
                    this.guardarNuevaCategoria();
                    return;
                }
            }

            // Ctrl/Cmd + Z/Y para undo/redo
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault(); this.deshacer();
                } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                    e.preventDefault(); this.rehacer();
                }
                return; // no continuar al bloque de letra suelta
            }

            // Atajo de letra suelta → foco al buscador (solo desktop, sin modales/menús)
            if (window.innerWidth < 768) return;
            if (document.querySelector('.modal.active')) return;
            if (document.getElementById('menu-ajustes').classList.contains('active')) return;
            if (document.getElementById('menu-agregar').classList.contains('active')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.altKey) return;

            if (/^[a-zA-Z]$/.test(e.key)) {
                e.preventDefault();
                const serviciosContent = document.getElementById('servicios-content');
                // Solo expandir desde collapsed → semi-collapsed (buscador visible, sin botones)
                // Si ya está en semi-collapsed o expanded el buscador ya es visible, no cambiar
                if (serviciosContent.classList.contains('collapsed')) {
                    this.aplicarEstadoServicios('semi-collapsed');
                    StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');
                    this.serviciosCollapseState = 'semi-collapsed';
                }
                const searchInput = document.getElementById('search-input');
                searchInput.focus();
                searchInput.value = e.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        document.getElementById('menu-categorias').addEventListener('click', () => {
            this.cerrarMenuAjustes();
            this.abrirModalNuevaCategoria(null);
        });

        // Menu informacion
        document.getElementById('menu-informacion').addEventListener('click', () => {
            this.cerrarMenuAjustes();
            this.abrirModal('modal-informacion');
        });

        // Cerrar modal informacion
        document.getElementById('modal-informacion-close').addEventListener('click', () => {
            this.cerrarModal('modal-informacion');
        });

        // ---- Listeners migrados desde inline handlers en el HTML ----

        // btn-reporte-estadisticas
        document.getElementById('btn-reporte-estadisticas').addEventListener('click', () => {
            this.calculador.generarReporte();
        });

        // Modal info-resumen (botón header + botón footer)
        document.getElementById('btn-cerrar-modal-info-resumen').addEventListener('click', () => {
            this.cerrarModal('modal-info-resumen');
        });
        document.getElementById('btn-cerrar-modal-info-resumen-footer').addEventListener('click', () => {
            this.cerrarModal('modal-info-resumen');
        });

        // btn-info-resumen: delegado en el contenedor estático para evitar
        // acumulación de listeners en cada llamada a _renderResumen (memory leak)
        document.getElementById('resumen-mes').addEventListener('click', (e) => {
            if (e.target.closest('#btn-info-resumen')) {
                e.stopPropagation();
                this.estadisticas.abrirModalInfoResumen();
            }
        });

        //gist
        document.getElementById('btn-gist-ir')?.addEventListener('click', () => this.gist.irAlGist());
        document.getElementById('gist-token-eye')?.addEventListener('click', () => this.gist.toggleToken());
        document.getElementById('gist-autosync-toggle')?.addEventListener('click', () => this.gist.toggleAuto());
        document.getElementById('btn-gist-subir')?.addEventListener('click', () => this.gist.subir());
        document.getElementById('btn-gist-bajar')?.addEventListener('click', () => this.gist.bajar());
        document.getElementById('btn-gist-guardar')?.addEventListener('click', () => this.gist.guardarConfig());
        document.getElementById('btn-gist-cerrar')?.addEventListener('click', () => {
            this.cerrarModal('modal-gist');
            this.toggleMenuAjustes();
        });
        document.getElementById('btn-gist-crear-token')?.addEventListener('click', () => {
            window.open('https://github.com/settings/tokens/new?description=Servicios+sync&scopes=gist', '_blank');
        });
        document.getElementById('gist-novedades-ok')?.addEventListener('click', () => this.gist.aplicarNovedades());
        document.getElementById('gist-novedades-ignorar-btn')?.addEventListener('click', () => this.cerrarModal('modal-gist-novedades'));
        document.getElementById('btn-agregar-cat-servicio').addEventListener('click', () => {
            this.abrirModalNuevaCategoria('servicio-categoria');
        });
        document.getElementById('btn-agregar-cat-editar-servicio').addEventListener('click', () => {
            this.abrirModalNuevaCategoria('editar-servicio-categoria');
        });

        // Modal ordenar: cerrar
        document.getElementById('btn-cerrar-modal-ordenar').addEventListener('click', () => {
            this.cerrarModal('modal-ordenar');
        });

        // Modal nueva-categoria: guardar / cerrar
        document.getElementById('btn-guardar-nueva-categoria').addEventListener('click', () => {
            this.guardarNuevaCategoria();
        });
        document.getElementById('btn-cerrar-modal-categorias').addEventListener('click', () => {
            this.cerrarModalCategorias();
        });

        // Modal agregar-factura: toggle moneda / negativo / credito / pagada
        document.getElementById('btn-factura-moneda').addEventListener('click', () => {
            this.toggleMoneda('factura-moneda', 'btn-factura-moneda');
        });
        document.getElementById('btn-toggle-negativo').addEventListener('click', () => {
            this.toggleMontoNegativo('factura-monto');
        });
        document.getElementById('btn-toggle-credito').addEventListener('click', () => {
            this.toggleConCredito();
        });
        document.getElementById('btn-toggle-pagada').addEventListener('click', () => {
            this.toggleEstadoPago();
        });

        // Modal editar-factura: toggle moneda / negativo / credito / pagada
        document.getElementById('btn-editar-factura-moneda').addEventListener('click', () => {
            this.toggleMoneda('editar-factura-moneda', 'btn-editar-factura-moneda');
        });
        document.getElementById('btn-editar-toggle-negativo').addEventListener('click', () => {
            this.toggleMontoNegativo('editar-factura-monto');
        });
        document.getElementById('btn-editar-toggle-credito').addEventListener('click', () => {
            this.toggleConCredito('editar');
        });
        document.getElementById('btn-editar-toggle-pagada').addEventListener('click', () => {
            this.toggleEstadoPago('btn-editar-toggle-pagada', 'editar-factura-fecha-pago');
        });

        // Modal facturas-servicio: editar servicio / nueva factura / cerrar
        document.getElementById('btn-editar-servicio-desde-modal').addEventListener('click', () => {
            this.editarServicioDesdeModal();
        });
        document.getElementById('btn-modal-facturas-nueva-factura').addEventListener('click', () => {
            const servicioId = document.getElementById('modal-facturas-servicio').dataset.servicioId;
            this.abrirModalFactura(servicioId, null);
        });
        document.getElementById('btn-cerrar-modal-facturas-servicio').addEventListener('click', () => {
            this.cerrarModal('modal-facturas-servicio');
        });

        // Modal ingresos-lista: nuevo ingreso / cerrar
        document.getElementById('btn-modal-ingresos-nuevo').addEventListener('click', () => {
            this.abrirModalIngreso(null);
        });
        document.getElementById('btn-cerrar-modal-ingresos-lista').addEventListener('click', () => {
            this.cerrarModal('modal-ingresos-lista');
        });

        // Modal agregar-ingreso: toggle moneda
        document.getElementById('btn-ingreso-moneda').addEventListener('click', () => {
            this.toggleMoneda('ingreso-moneda', 'btn-ingreso-moneda');
        });

        // Modal editar-ingreso: toggle moneda
        document.getElementById('btn-editar-ingreso-moneda').addEventListener('click', () => {
            this.toggleMoneda('editar-ingreso-moneda', 'btn-editar-ingreso-moneda');
        });

        // Modal perfiles: input Enter + botón agregar + cerrar
        document.getElementById('perfil-nuevo-nombre').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.crearPerfilInline();
            }
        });
        document.getElementById('btn-crear-perfil-inline').addEventListener('click', () => {
            this.crearPerfilInline();
        });
        document.getElementById('btn-cerrar-modal-perfiles').addEventListener('click', () => {
            this.cerrarModal('modal-perfiles');
        });

        // Modal editar-perfil: submit + volver
        document.getElementById('form-perfil').addEventListener('submit', (e) => {
            this.perfil.guardarEdicion(e);
        });
        document.getElementById('btn-cancelar-editar-perfil').addEventListener('click', () => {
            this.perfil.cancelarEditar();
        });

        // Modal debug-estadisticas: cerrar
        document.getElementById('btn-cerrar-modal-debug').addEventListener('click', () => {
            this.cerrarModal('modal-debug-estadisticas');
        });

        // ---- Delegación de eventos para HTML generado dinámicamente ----

        // Perfiles: cambiar / eliminar / editar
        document.getElementById('perfiles-lista')?.addEventListener('click', (e) => {
            const card = e.target.closest('[data-action="cambiar-perfil"]');
            const btnEliminar = e.target.closest('[data-action="eliminar-perfil"]');
            const btnEditar = e.target.closest('[data-action="editar-perfil"]');
            const stop = e.target.closest('[data-action="stop-propagation"]');
            if (btnEliminar) { e.stopPropagation(); this.perfil.eliminar(btnEliminar.dataset.perfilId); return; }
            if (btnEditar) { e.stopPropagation(); this.perfil.abrirModalEditar(btnEditar.dataset.perfilId); return; }
            if (card) this.perfil.cambiar(card.dataset.perfilId);
        });

        // Estadísticas mensuales: abrir debug al clickear un item
        document.getElementById('estadisticas-mensual-container')?.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action="debug-estadisticas"]');
            if (item) this.abrirDebugEstadisticas(item.dataset.tipo);
        });

        // Lista de servicios: toggle grupos por categoría + long press
        const listaSvc = document.getElementById('servicios-lista');
        if (listaSvc) {
            // Detectar si el pointerdown derivó en scroll para ignorar el click posterior
            let _pdownY = 0;
            let _scrolled = false;
            listaSvc.addEventListener('pointerdown', (e) => {
                _pdownY = e.clientY;
                _scrolled = false;
            }, { passive: true });
            listaSvc.addEventListener('pointermove', (e) => {
                if (!_scrolled && Math.abs(e.clientY - _pdownY) > 8) {
                    _scrolled = true;
                    // Cancelar long press en cuanto se detecta intención de scroll
                    this._lpCancel();
                }
            }, { passive: true });
            // El browser dispara pointercancel cuando toma control del touch (scroll nativo)
            listaSvc.addEventListener('pointercancel', () => {
                _scrolled = true;
                this._lpCancel();
            });

            listaSvc.addEventListener('click', (e) => {
                if (_scrolled) return;
                const header = e.target.closest('[data-action="toggle-grupo-cat"]');
                if (header) this.toggleGrupoCat(header);
            });
            listaSvc.addEventListener('pointerdown', (e) => {
                const header = e.target.closest('[data-lp="true"]');
                if (header) this._lpStart(e, header);
            });
            // pointerup y pointerleave cancelan el LP sin importar el target actual
            // (el dedo pudo haberse movido fuera del header durante el drag)
            listaSvc.addEventListener('pointerup', () => this._lpCancel());
            listaSvc.addEventListener('pointerleave', () => this._lpCancel());
            listaSvc.addEventListener('contextmenu', (e) => {
                if (e.target.closest('[data-lp="true"]') || this._lpFired) {
                    e.preventDefault();
                    this._lpFired = false;
                }
            });
        }

        // Modal facturas servicio: toggle grupos por año + editar factura al click
        document.getElementById('lista-facturas-modal')?.addEventListener('click', (e) => {
            const headerAno = e.target.closest('[data-action="toggle-grupo-ano"]');
            if (headerAno) { this.toggleGrupoAno(headerAno); return; }
            const facturaInfo = e.target.closest('[data-action="factura-click"]');
            if (facturaInfo && facturaInfo.dataset.facturaAccion === 'editar-factura') {
                this.editarFactura(facturaInfo.dataset.facturaId);
            }
        });

        // Modal ingresos lista: toggle grupos por año + abrir ingreso al click
        document.getElementById('lista-ingresos-modal')?.addEventListener('click', (e) => {
            const headerAno = e.target.closest('[data-action="toggle-grupo-ano"]');
            if (headerAno) { this.toggleGrupoAno(headerAno); return; }
            const ingresoInfo = e.target.closest('[data-action="abrir-ingreso"]');
            if (ingresoInfo) this.abrirModalIngreso(ingresoInfo.dataset.ingresoId);
        });

        // Modal categorías: eliminar categoría
        document.getElementById('categorias-lista')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="eliminar-categoria"]');
            if (btn) this.eliminarCategoria(btn.dataset.cat);
        });

    }

    // ========================================
    // GESTIÓN DE FECHA
    // ========================================

    // ── Delegación a EstadisticasService ─────────────────────
    actualizarResumenMes() { this.estadisticas.actualizarResumenMes(); }
    cambiarTipoEstadistica() { this.estadisticas.cambiarTipoEstadistica(); }

    calcularPeriodo() { this.calculador.calcularPeriodo(); }

    toggleServicios() {
        // Si estamos en expanded y hay timer activo (clic rápido después de abrir botones)
        if (this.serviciosCollapseState === 'expanded' && this.toggleServiciosTimer !== null) {
            // Cerrar todo de golpe
            clearTimeout(this.toggleServiciosTimer);
            this.toggleServiciosTimer = null;
            this.serviciosCollapseState = 'collapsed';
            this.aplicarEstadoServicios('collapsed');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'collapsed');

            // Limpiar búsqueda al colapsar
            if (this.terminoBusqueda) this._limpiarBusqueda();
            return;
        }

        // Limpiar timer si existe
        if (this.toggleServiciosTimer !== null) {
            clearTimeout(this.toggleServiciosTimer);
            this.toggleServiciosTimer = null;
        }

        // Ciclo normal de estados
        if (this.serviciosCollapseState === 'collapsed') {
            // De collapsed a semi-collapsed
            this.serviciosCollapseState = 'semi-collapsed';
            this.aplicarEstadoServicios('semi-collapsed');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');

        } else if (this.serviciosCollapseState === 'semi-collapsed') {
            // De semi-collapsed a expanded (AQUÍ INICIA EL TIMER)
            this.serviciosCollapseState = 'expanded';
            this.aplicarEstadoServicios('expanded');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'expanded');

            // Activar timer de 3 segundos
            this.toggleServiciosTimer = setTimeout(() => {
                this.toggleServiciosTimer = null;
            }, this.toggleServiciosDelay);

        } else {
            // De expanded a semi-collapsed (después de que expiró el timer)
            this.serviciosCollapseState = 'semi-collapsed';
            this.aplicarEstadoServicios('semi-collapsed');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');

            // Limpiar búsqueda al contraer
            if (this.terminoBusqueda) this._limpiarBusqueda();
        }
    }

    obtenerEstadoFactura(factura) {
        let estadoPago = '';
        let claseMonto = 'factura-monto';

        if (factura.monto < 0) {
            estadoPago = '<div class="factura-estado-pagado">Saldo a favor</div>';
            claseMonto = 'factura-monto factura-monto-favor';
        } else if (factura.pagada) {
            estadoPago = '<div class="factura-estado-pagado">✓ Pagada</div>';
        } else {
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const vencimiento = this._parseDate(factura.fecha);
            vencimiento.setHours(0, 0, 0, 0);

            if (vencimiento < hoy) {
                estadoPago = '<div class="factura-estado-vencido">⚠ Vencida</div>';
            } else {
                estadoPago = '<div class="factura-estado-pendiente">⏱ Pendiente</div>';
            }
        }

        return { estadoPago, claseMonto };
    }

    aplicarEstadoServicios(estado) {
        const contenido = document.getElementById('servicios-content');
        const chevron = document.getElementById('servicios-chevron');

        // Remover todas las clases de estado
        contenido.classList.remove('collapsed', 'semi-collapsed');
        chevron.classList.remove('collapsed', 'semi-collapsed');

        if (estado === 'collapsed') {
            contenido.classList.add('collapsed');
            chevron.classList.add('collapsed');
        } else if (estado === 'semi-collapsed') {
            contenido.classList.add('semi-collapsed');
            chevron.classList.add('semi-collapsed');
        } else {
            // Estado expanded - chevron normal
            chevron.classList.remove('semi-collapsed');
        }
    }

    // ========================================
    // GESTIÓN DE SERVICIOS
    // ========================================

    calcularEstadoServicio(servicio) {
        const ultimaFactura = this.obtenerUltimaFactura(servicio.id);
        let estado = '', claseEstado = '', montoTexto = '-', fechaTexto = '';

        // Lógica especial para el servicio de ingresos
        if (servicio.id === this.SERVICIO_INGRESOS_ID && ultimaFactura) {
            const moneda = ultimaFactura.moneda || 'ars';
            montoTexto = this.formatearMoneda(ultimaFactura.monto, moneda);
            fechaTexto = this.formatearFecha(ultimaFactura.fecha);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            const fechaCobro = this._parseDate(ultimaFactura.fecha);
            fechaCobro.setHours(0, 0, 0, 0);
            if (fechaCobro <= hoy) {
                estado = 'Cobrado';
                claseEstado = 'pagado';
            } else {
                estado = 'Liquidado';
                claseEstado = 'lejano';
            }
            return { estado, claseEstado, montoTexto, fechaTexto };
        }

        if (ultimaFactura) {
            const moneda = ultimaFactura.moneda || 'ars';
            montoTexto = this.formatearMoneda(ultimaFactura.monto, moneda);
            fechaTexto = this.formatearFecha(ultimaFactura.fecha);

            if (ultimaFactura.pagada) {
                const fechaPagoTexto = ultimaFactura.fechaPago
                    ? this.formatearFecha(ultimaFactura.fechaPago)
                    : 'Sin fecha';
                estado = `Pagado ${fechaPagoTexto}`;
                claseEstado = 'pagado';
            } else {
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const vencimiento = this._parseDate(ultimaFactura.fecha);
                vencimiento.setHours(0, 0, 0, 0);
                const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

                if (diasRestantes < 0) {
                    estado = 'Vencido';
                    claseEstado = 'vencido';
                } else if (diasRestantes === 0) {
                    estado = 'Vence hoy';
                    claseEstado = 'urgente';
                } else if (diasRestantes === 1) {
                    estado = 'Vence mañana';
                    claseEstado = 'urgente';
                } else if (diasRestantes <= 2) {
                    estado = `Vence en ${diasRestantes} días`;
                    claseEstado = 'urgente';
                } else if (diasRestantes <= 5) {
                    estado = `Vence en ${diasRestantes} días`;
                    claseEstado = 'proximo';
                } else {
                    estado = `Vence en ${diasRestantes} días`;
                    claseEstado = 'lejano';
                }
            }
        } else {
            // Cuando obtenerUltimaFactura retorna null
            if (servicio.facturas && servicio.facturas.length > 0) {
                // Verificar si hay una factura anual pagada que cubra el año actual
                const hoy = new Date();
                const facturaAnualVigente = servicio.facturas.find(f => {
                    if (f.tipo !== 'anual' || !f.pagada) return false;
                    const fechaVenc = this._parseDate(f.fecha);
                    return fechaVenc.getFullYear() === hoy.getFullYear();
                });

                if (facturaAnualVigente) {
                    const moneda = facturaAnualVigente.moneda || 'ars';
                    montoTexto = this.formatearMoneda(facturaAnualVigente.monto, moneda);
                    fechaTexto = this.formatearFecha(facturaAnualVigente.fecha);
                    const fechaPagoAnual = facturaAnualVigente.fechaPago
                        ? this.formatearFecha(facturaAnualVigente.fechaPago)
                        : 'Sin fecha';
                    estado = `Pagado ${fechaPagoAnual} · Anual`;
                    claseEstado = 'pagado';
                } else {
                    estado = 'Sin facturas de este mes';
                    claseEstado = 'sin-facturas-mes';
                }
            } else {
                estado = 'Sin facturas';
                claseEstado = 'sin-facturas';
            }
        }

        return { estado, claseEstado, montoTexto, fechaTexto };
    }

    renderServicios() {
        const indicador = document.getElementById('perfil-indicador');
        if (indicador && this.perfilActivo !== 'default') {
            indicador.textContent = `${this.perfiles[this.perfilActivo].nombre}`;
        } else if (indicador) {
            indicador.textContent = '';
        }

        const lista = document.getElementById('servicios-lista');
        if (!lista) return;

        const scrollPos = window.scrollY;

        // Separar servicios normales del servicio de ingresos
        const serviciosNormales = this.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID);
        const servicioIngresos = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);

        const pintar = (contenido) => {
            const fn = () => { lista.innerHTML = contenido; };
            if (this._animarRender) Anim.diffLista(lista, '.servicio-wrapper', 'data-id', fn);
            else fn();
        };

        if (serviciosNormales.length === 0 && !this.ingresosHabilitado()) {
            pintar(`
                  <div class="empty-state">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="12" y1="9" x2="12" y2="15"/>
                          <line x1="9" y1="12" x2="15" y2="12"/>
                      </svg>
                      <p>No hay servicios registrados<br>Presiona el botón + para agregar uno</p>
                  </div>
              `);
            this.actualizarResumenMes();
            return;
        }

        // Filtrar servicios normales
        let serviciosFiltrados = this.aplicarFiltro(serviciosNormales);

        // Ordenar servicios según el orden actual
        const serviciosOrdenados = this.ordenarServicios(serviciosFiltrados);

        // Renderizar servicios normales agrupados por categoría
        const generarItemServicio = (servicio) => {
            const { estado, claseEstado, montoTexto, fechaTexto } = this.calcularEstadoServicio(servicio);
            const claseCalculando = this.serviciosSeleccionados.has(servicio.id) ? 'calculando' : '';
            return `
   <div class="servicio-wrapper" data-id="${this.escaparAtributoHTML(servicio.id)}">
  <div class="servicio-item ${claseEstado} ${claseCalculando}" data-id="${this.escaparAtributoHTML(servicio.id)}">
                      <div class="servicio-nombre">${this.escaparHTML(servicio.nombre)}</div>
                       <div class="servicio-info">
                          <span class="servicio-monto">${montoTexto}</span>
                           ${fechaTexto ? `<span class="servicio-fecha">${fechaTexto}</span>` : ''}
                       </div>
                    ${estado ? `<span class="servicio-estado estado-${claseEstado}">${estado}</span>` : ''}
                   </div>
               </div>
             `;
        };

        // Agrupar por categoría
        const gruposCat = {};
        serviciosOrdenados.forEach(servicio => {
            const cat = servicio.categoria || '';
            if (!gruposCat[cat]) gruposCat[cat] = [];
            gruposCat[cat].push(servicio);
        });

        // Ordenar: categorías nombradas alfabéticamente, sin categoría al final
        const catKeys = Object.keys(gruposCat).sort((a, b) => {
            if (a === '' && b !== '') return 1;
            if (a !== '' && b === '') return -1;
            return a.localeCompare(b);
        });

        let html = '';

        // Si solo hay una categoría (o ninguna), no mostrar encabezado de grupo
        if (this._vistaEstados) {
            const grupos = [
                { key: 'pendiente', label: 'Pendientes', clases: ['vencido', 'urgente', 'proximo', 'lejano'] },
                { key: 'sin-facturas-mes', label: 'Sin facturas este mes', clases: ['sin-facturas-mes'] },
                { key: 'pagado', label: 'Pagados', clases: ['pagado'] },
                { key: 'sin-facturas', label: 'Sin facturas', clases: ['sin-facturas'] },
            ];
            grupos.forEach(grupo => {
                const items = serviciosOrdenados.filter(s => grupo.clases.includes(this.calcularEstadoServicio(s).claseEstado));
                if (items.length === 0) return;
                const collapsed = this._catColapsadas[`__estado_${grupo.key}`] ? 'collapsed' : '';
                html += `
    <div class="servicios-grupo-cat" data-cat="__estado_${grupo.key}">
        <div class="servicios-grupo-cat-header" data-action="toggle-grupo-cat" data-lp="true">
            <div class="servicios-grupo-cat-header-info">
                <span class="servicios-grupo-cat-texto">${grupo.label}</span>
                <span class="servicios-grupo-cat-contador">(${items.length})</span>
            </div>
            <svg class="icon servicios-grupo-cat-chevron ${collapsed}"><use href="#icon-chevron-down"/></svg>
        </div>
        <div class="servicios-grupo-cat-contenido ${collapsed}">
            <div class="collapsible-inner">${items.map(generarItemServicio).join('')}</div>
        </div>
    </div>`;
            });
        } else if (catKeys.length <= 1 || !this._agrupacionActiva) {
            html = serviciosOrdenados.map(generarItemServicio).join('');
        } else {
            catKeys.forEach(cat => {
                const items = gruposCat[cat];
                const catLabel = cat || 'Sin categoría';
                const collapsed = this._catColapsadas[cat] ? 'collapsed' : '';
                const cantidad = items.length;
                const itemsHTML = items.map(generarItemServicio).join('');

                // Calcular el estado de alerta más prioritario de la categoría
                const prioridad = { 'vencido': 4, 'urgente': 3, 'proximo': 2, 'sin-facturas-mes': 1 };
                let mejorAlerta = null;
                items.forEach(s => {
                    const { claseEstado } = this.calcularEstadoServicio(s);
                    if (prioridad[claseEstado] && (!mejorAlerta || prioridad[claseEstado] > prioridad[mejorAlerta])) {
                        mejorAlerta = claseEstado;
                    }
                });

                // Generar icono indicador si hay alertas
                let alertaIconHTML = '';
                if (mejorAlerta) {
                    const svgPath = (mejorAlerta === 'proximo' || mejorAlerta === 'sin-facturas-mes')
                        ? '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/>'
                        : '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="currentColor"/>';
                    alertaIconHTML = `<svg class="cat-alerta-icon ${mejorAlerta}" viewBox="0 0 24 24" width="14" height="14">${svgPath}</svg>`;
                }

                html += `
    <div class="servicios-grupo-cat" data-cat="${this.escaparAtributoHTML(cat)}">
        <div class="servicios-grupo-cat-header" data-action="toggle-grupo-cat" data-lp="true">
            <div class="servicios-grupo-cat-header-info">
                <span class="servicios-grupo-cat-texto">${this.escaparHTML(catLabel)}</span>
                <span class="servicios-grupo-cat-contador">(${cantidad})</span>
            </div>
            <div class="d-flex align-items-center gap-1">
               ${alertaIconHTML}
             <svg class="icon servicios-grupo-cat-chevron ${collapsed}"><use href="#icon-chevron-down"/></svg>
         </div>
        </div>
        <div class="servicios-grupo-cat-contenido ${collapsed}">
            <div class="collapsible-inner">${itemsHTML}</div>
        </div>
    </div>
                    `;
            });
        }

        // Agregar servicio de ingresos si está habilitado Y (no hay búsqueda O coincide con la búsqueda)
        if (this.ingresosHabilitado() && (!this.terminoBusqueda || 'ingresos'.includes(this.terminoBusqueda))) {
            // Línea separadora
            if (serviciosOrdenados.length > 0) {
                html += `<div class="separator-line"></div>`;
            }

            // Crear servicio de ingresos si no existe
            if (!servicioIngresos) {
                this.crearServicioIngresos();
            }

            const ingresos = servicioIngresos || this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
            if (ingresos) {
                const { estado, claseEstado, montoTexto, fechaTexto } = this.calcularEstadoServicio(ingresos);

                const claseCalculandoIngresos = this.serviciosSeleccionados.has(ingresos.id) ? 'calculando' : '';

                html += `
   <div class="servicio-wrapper" data-id="${this.escaparAtributoHTML(ingresos.id)}">
  <div class="servicio-item ${claseEstado} ${claseCalculandoIngresos}" data-id="${this.escaparAtributoHTML(ingresos.id)}">
                          <div class="servicio-nombre">${this.escaparHTML(ingresos.nombre)}</div>
                           <div class="servicio-info">
                              <span class="servicio-monto">${montoTexto}</span>
                               ${fechaTexto ? `<span class="servicio-fecha">${fechaTexto}</span>` : ''}
                           </div>
                        ${estado ? `<span class="servicio-estado estado-${claseEstado}">${estado}</span>` : ''}
                       </div>
                   </div>
                 `;
            }
        }

        pintar(html);

        // Eventos de click en servicios
        lista.querySelectorAll('.servicio-item').forEach(item => {
            const servicioId = item.dataset.id;
            const esIngresos = servicioId === this.SERVICIO_INGRESOS_ID;

            item.addEventListener('click', (e) => {
                // Evitar que se dispare si se hace click en un botón
                if (e.target.closest('button')) return;

                // Si está en modo calculadora, toggle selección
                if (this.modoCalculadora) {
                    this.calculador.toggleServicio(servicioId);
                    return;
                }

                if (esIngresos) {
                    this.abrirModalIngresosLista(servicioId);
                } else {
                    this.abrirModalFacturasServicio(servicioId);
                }
            });

            // Menú contextual (solo servicios normales, no ingresos)
            if (!esIngresos) {
                item.addEventListener('contextmenu', (e) => {
                    this._ctxAbrir(e, servicioId);
                });
            }

            // Actualizar menú flotante
            this.ui.actualizarMenuAgregar();
        });

        // Restaurar posición de scroll
        requestAnimationFrame(() => {
            window.scrollTo(0, scrollPos);
        });

        // Solo actualizar resumen y calculador si no estamos filtrando por búsqueda
        if (!this.enModoBusqueda) {
            this.actualizarResumenMes();
            this.estadisticas.actualizarSelectServicios();
            this.calcularPeriodo();
        }
    }

    crearServicioIngresos()                      { this.ingreso.crearServicio(); }

    aplicarFiltro(servicios) {
        let resultado = servicios;

        // Filtro por búsqueda de texto
        if (this.terminoBusqueda) {
            resultado = resultado.filter(servicio =>
                servicio.id !== this.SERVICIO_INGRESOS_ID &&
                servicio.nombre.toLowerCase().includes(this.terminoBusqueda)
            );
        }
        return resultado;
    }

    ordenarServicios(servicios) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        return [...servicios].sort((a, b) => {
            switch (this.ordenActual) {
                case 'nombre':
                    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

                case 'vencimiento':
                    const facturaA = this.obtenerUltimaFactura(a.id);
                    const facturaB = this.obtenerUltimaFactura(b.id);

                    const tieneFacturasA = a.facturas && a.facturas.length > 0;
                    const tieneFacturasB = b.facturas && b.facturas.length > 0;

                    // PRIORIDAD 1: Sin facturas nunca → final absoluto
                    if (!tieneFacturasA && !tieneFacturasB) return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
                    if (!tieneFacturasA) return 1;
                    if (!tieneFacturasB) return -1;

                    // Calcular estados para los que sí tienen facturas
                    const fechaA = facturaA ? this._parseDate(facturaA.fecha) : null;
                    const fechaB = facturaB ? this._parseDate(facturaB.fecha) : null;
                    if (fechaA) fechaA.setHours(0, 0, 0, 0);
                    if (fechaB) fechaB.setHours(0, 0, 0, 0);

                    const vencidaA = facturaA && !facturaA.pagada && fechaA < hoy;
                    const vencidaB = facturaB && !facturaB.pagada && fechaB < hoy;
                    const pendienteA = facturaA && !facturaA.pagada && !vencidaA;
                    const pendienteB = facturaB && !facturaB.pagada && !vencidaB;
                    const pagadaA = facturaA && facturaA.pagada;
                    const pagadaB = facturaB && facturaB.pagada;
                    const sinMesA = !facturaA;
                    const sinMesB = !facturaB;
                    const anualVigenteA = sinMesA && a.facturas.some(f => f.tipo === 'anual' && f.pagada && this._parseDate(f.fecha).getFullYear() === hoy.getFullYear());
                    const anualVigenteB = sinMesB && b.facturas.some(f => f.tipo === 'anual' && f.pagada && this._parseDate(f.fecha).getFullYear() === hoy.getFullYear());

                    // PRIORIDAD 2: VENCIDAS primero
                    if (vencidaA && !vencidaB) return -1;
                    if (!vencidaA && vencidaB) return 1;
                    if (vencidaA && vencidaB) return fechaA - fechaB;

                    // PRIORIDAD 3: PENDIENTES
                    if (pendienteA && !pendienteB) return -1;
                    if (!pendienteA && pendienteB) return 1;
                    if (pendienteA && pendienteB) return fechaA - fechaB;

                    // PRIORIDAD 4: SIN FACTURAS ESTE MES (excluye anuales vigentes que van con pagados)
                    const sinMesRealA = sinMesA && !anualVigenteA;
                    const sinMesRealB = sinMesB && !anualVigenteB;

                    if (sinMesRealA && !sinMesRealB) return -1;
                    if (!sinMesRealA && sinMesRealB) return 1;
                    if (sinMesRealA && sinMesRealB) {
                        const ultimaA = [...a.facturas].sort((x, y) => new Date(y.fecha) - new Date(x.fecha))[0];
                        const ultimaB = [...b.facturas].sort((x, y) => new Date(y.fecha) - new Date(x.fecha))[0];
                        return new Date(ultimaB.fecha) - new Date(ultimaA.fecha);
                    }

                    // PRIORIDAD 5: PAGADAS normales
                    if (pagadaA && !anualVigenteA && (anualVigenteB || !pagadaB)) return -1;
                    if (pagadaB && !anualVigenteB && (anualVigenteA || !pagadaA)) return 1;
                    if (pagadaA && pagadaB && fechaA && fechaB) return fechaA - fechaB;

                    // PRIORIDAD 6: PAGADAS ANUALES VIGENTES → al final
                    return 0;

                case 'monto-desc':
                    const montoA = this.obtenerUltimaFactura(a.id)?.monto || 0;
                    const montoB = this.obtenerUltimaFactura(b.id)?.monto || 0;
                    return montoB - montoA;

                case 'monto-asc':
                    const montoAsc_A = this.obtenerUltimaFactura(a.id)?.monto || 0;
                    const montoAsc_B = this.obtenerUltimaFactura(b.id)?.monto || 0;
                    return montoAsc_A - montoAsc_B;

                default:
                    return 0;
            }
        });
    }

    aplicarOrden() {
        const select = document.getElementById('select-orden');
        this.ordenActual = select.value;
        StorageHelper.setItem(STORAGE_KEYS.ORDEN, this.ordenActual);
        this.renderServicios();
        this.mostrarToast('Orden aplicado', 'success');
    }

    abrirModalFacturasServicio(id)               { this.factura.abrirModalLista(id); }

    toggleGrupoCat(headerElement) {
        if (this._lpFired) { this._lpFired = false; return; }
        const chevron = headerElement.querySelector('.servicios-grupo-cat-chevron');
        const contenido = headerElement.nextElementSibling;
        const cat = headerElement.closest('.servicios-grupo-cat')?.dataset.cat ?? '';

        const estaColapsado = chevron.classList.contains('collapsed');
        if (estaColapsado) {
            chevron.classList.remove('collapsed');
            contenido.classList.remove('collapsed');
            delete this._catColapsadas[cat];
            Anim.scrollAlExpandir(headerElement.closest('.servicios-grupo-cat'));
        } else {
            chevron.classList.add('collapsed');
            contenido.classList.add('collapsed');
            this._catColapsadas[cat] = true;
        }
        StorageHelper.setItem(STORAGE_KEYS.CAT_COLAPSADAS, this._catColapsadas);
    }

    _lpStart(event, headerElement) {
        this._lpTimer = setTimeout(() => {
            this._lpFired = true;
            this.toggleTodosGruposCat(headerElement);
        }, 500);
        this._lpFired = false;
    }

    _lpCancel() {
        clearTimeout(this._lpTimer);
    }

    toggleTodosGruposCat(headerElement) {
        // Determinar estado del grupo tocado
        const chevronTocado = headerElement.querySelector('.servicios-grupo-cat-chevron');
        const estaColapsado = chevronTocado.classList.contains('collapsed');

        // Seleccionar todos los grupos visibles
        const todosHeaders = document.querySelectorAll('.servicios-grupo-cat-header');
        todosHeaders.forEach(header => {
            const chevron = header.querySelector('.servicios-grupo-cat-chevron');
            const contenido = header.nextElementSibling;
            const cat = header.closest('.servicios-grupo-cat')?.dataset.cat ?? '';
            if (estaColapsado) {
                // Expandir todos
                chevron.classList.remove('collapsed');
                contenido.classList.remove('collapsed');
                delete this._catColapsadas[cat];
            } else {
                // Colapsar todos
                chevron.classList.add('collapsed');
                contenido.classList.add('collapsed');
                this._catColapsadas[cat] = true;
            }
        });
        StorageHelper.setItem(STORAGE_KEYS.CAT_COLAPSADAS, this._catColapsadas);
        this.mostrarToast(estaColapsado ? 'Categorías expandidas' : 'Categorías colapsadas', 'info');
    }

    toggleGrupoAno(headerElement) {
        const chevron = headerElement.querySelector('.facturas-grupo-chevron');
        const contenido = headerElement.nextElementSibling;

        if (chevron.classList.contains('collapsed')) {
            // Acordeón: abrir un año cierra los demás de la misma lista
            const grupo = headerElement.closest('.facturas-grupo-ano');
            const lista = grupo?.parentElement || document;
            lista.querySelectorAll('.facturas-grupo-chevron:not(.collapsed)').forEach(ch => ch.classList.add('collapsed'));
            lista.querySelectorAll('.facturas-grupo-contenido:not(.collapsed)').forEach(cont => cont.classList.add('collapsed'));

            chevron.classList.remove('collapsed');
            contenido.classList.remove('collapsed');
            Anim.scrollAlExpandir(grupo);
        } else {
            chevron.classList.add('collapsed');
            contenido.classList.add('collapsed');
        }
    }

    abrirModalServicio(servicioId = null) {
        this.servicioActual = servicioId;

        if (servicioId) {
            // Modo editar - usar modal separado
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (servicio) {
                document.getElementById('editar-servicio-nombre').value = servicio.nombre;
                this._poblarSelectCategorias('editar-servicio-categoria', servicio.categoria || '');
            }
            this.abrirModal('modal-editar-servicio');
        } else {
            // Modo nuevo
            document.getElementById('form-servicio').reset();
            this._poblarSelectCategorias('servicio-categoria', '');
            this.abrirModal('modal-agregar-servicio');
        }
    }

    // Anima el ítem recién guardado en la lista de facturas/ingresos,
    // expandiendo su año si estaba colapsado. Espera a que termine de
    // abrirse el modal para que la animación se vea.
    _resaltarItemLista(lista, id) {
        if (!lista || !id) return;
        const item = lista.querySelector(`.factura-item[data-id="${CSS.escape(id)}"]`);
        if (!item) return;
        const grupo = item.closest('.facturas-grupo-contenido.collapsed');
        if (grupo) {
            const ano = grupo.previousElementSibling?.querySelector('.facturas-grupo-ano-texto')?.textContent;
            this._restaurarAnoExpandido(ano);
        }
        Anim.marcarNuevo(item, { delay: Anim.getCSSdur('--dur-pop') });
    }

    _restaurarAnoExpandido(anoObjetivo) {
        if (!anoObjetivo) return;
        const headers = document.querySelectorAll('.facturas-grupo-header');
        let encontrado = false;
        headers.forEach(header => {
            const textoAno = header.querySelector('.facturas-grupo-ano-texto')?.textContent;
            if (textoAno === anoObjetivo) encontrado = true;
        });
        if (!encontrado) return;  // si el año no existe, no tocar nada

        headers.forEach(header => {
            const textoAno = header.querySelector('.facturas-grupo-ano-texto')?.textContent;
            const chevron = header.querySelector('.facturas-grupo-chevron');
            const contenido = header.nextElementSibling;
            if (textoAno === anoObjetivo) {
                chevron.classList.remove('collapsed');
                contenido.classList.remove('collapsed');
            } else {
                chevron.classList.add('collapsed');
                contenido.classList.add('collapsed');
            }
        });
    }

    generarHTMLFactura(factura, accion = null) {
        const { estadoPago, claseMonto } = this.obtenerEstadoFactura(factura);
        const esc = t => this.escaparAtributoHTML(t);
        const dataAccion = accion ? `data-action="factura-click" data-factura-accion="${esc(accion)}" data-factura-id="${esc(factura.id)}"` : '';
        const moneda = factura.moneda === 'usd' ? 'usd' : 'ars';
        const badgeClass = moneda;
        const pagoBadge = factura.pagada
            ? (factura.conCredito
                ? '<span class="moneda-badge credito">Crédito</span>'
                : '<span class="moneda-badge contado">Contado</span>')
            : '';

        return `
    <div class="factura-item" data-id="${esc(factura.id)}">
        <div class="factura-info" ${dataAccion}>
            <div class="${claseMonto}">${this.formatearMoneda(factura.monto, moneda)}<span class="moneda-badge ${badgeClass}">${moneda.toUpperCase()}</span>${pagoBadge}</div>
            <div class="factura-fecha">
                ${this.escaparHTML(factura.tipo || 'mensual')} | Vence: ${this.formatearFecha(factura.fecha)}
            </div>
            ${estadoPago}
        </div>
    </div>
`;
    }

    agruparPorAno(items)                         { return this.factura.agruparPorAno(items); }

    generarGrupoAno(ano, its, html, lbl, idx)    { return this.factura.generarGrupoAno(ano, its, html, lbl, idx); }

    // ── Categorías ──────────────────────────────────────────────
    // ── Delegación a CategoriaService ────────────────────────
    _getCategorias() { return this.categoria.getCategorias(); }
    _saveCategorias(cats) { this.categoria.saveCategorias(cats); }
    _poblarSelectCategorias(id, val) { this.categoria.poblarSelect(id, val); }
    abrirModalNuevaCategoria(targetSelectId) { this.categoria.abrirModal(targetSelectId); }
    cerrarModalCategorias() { this.categoria.cerrarModal(); }
    _renderCategorias() { this.categoria.renderLista(); }
    eliminarCategoria(nombre) { this.categoria.eliminar(nombre); }
    guardarNuevaCategoria() { this.categoria.guardarNueva(); }

    guardarServicio(e) {
        e.preventDefault();

        // Detectar si estamos en modo agregar o editar
        const esEditar = document.getElementById('modal-editar-servicio').classList.contains('active');
        const nombre = esEditar
            ? document.getElementById('editar-servicio-nombre').value.trim()
            : document.getElementById('servicio-nombre').value.trim();
        const categoria = esEditar
            ? document.getElementById('editar-servicio-categoria').value
            : document.getElementById('servicio-categoria').value;

        if (!nombre) {
            this.mostrarToast('El nombre del servicio es obligatorio', 'error');
            return;
        }

        // Validar que no exista otro servicio con el mismo nombre (case insensitive)
        const nombreExiste = this.servicios.some(s =>
            s.id !== this.servicioActual &&
            s.nombre.toLowerCase() === nombre.toLowerCase()
        );

        if (nombreExiste) {
            this.mostrarToast('Ya existe un servicio con ese nombre', 'error');
            return;
        }

        if (this.servicioActual) {
            // Editar servicio existente
            const servicio = this.servicios.find(s => s.id === this.servicioActual);
            if (servicio) {
                // Verificar si hubo cambios
                if (servicio.nombre === nombre && (servicio.categoria || '') === categoria) {
                    this.mostrarToast('Sin cambios', 'info');
                    this.cerrarModal('modal-editar-servicio');
                    // Volver al modal de facturas
                    if (this.servicioActual) {
                        this.abrirModalFacturasServicio(this.servicioActual);
                    }
                    return;
                }
                servicio.nombre = nombre;
                servicio.categoria = categoria;
                this.mostrarToast('Servicio actualizado', 'success');
            }
        } else {
            // Crear nuevo servicio
            const nuevoServicio = {
                id: this.generarId(),
                nombre: nombre,
                categoria: categoria,
                facturas: []
            };
            this.servicios.push(nuevoServicio);
            this.mostrarToast('Servicio creado', 'success');
        }

        this.guardarDatos();
        this.guardarEstado(`${esEditar ? 'editar' : 'crear'} servicio (${nombre})`);
        this.enModoBusqueda = false;
        this.renderServicios();
        this.cerrarModal(esEditar ? 'modal-editar-servicio' : 'modal-agregar-servicio');
        // Volver al modal de facturas después de guardar
        if (esEditar && this.servicioActual) {
            this.abrirModalFacturasServicio(this.servicioActual);
        }
    }

    editarServicio(servicioId) {
        this.abrirModalServicio(servicioId);
    }

    editarServicioDesdeModal() {
        const modal = document.getElementById('modal-facturas-servicio');
        const servicioId = modal.dataset.servicioId;
        if (servicioId) {
            this.cerrarModal('modal-facturas-servicio');
            this.editarServicio(servicioId);
        }
    }

    async eliminarServicio() {
        if (!this.servicioActual) return;

        const confirmado = await ModalManager.confirmar(
            '¿Estás seguro de eliminar este servicio y todas sus facturas?',
            'Eliminar',
            '#icon-trash',
            { titulo: 'Eliminar servicio' }
        );
        if (confirmado) {
            const eliminado = this.servicios.find(s => s.id === this.servicioActual);
            this.servicios = this.servicios.filter(s => s.id !== this.servicioActual);

            this.guardarDatos();
            this.guardarEstado(`eliminar servicio${eliminado ? ` (${eliminado.nombre})` : ''}`);
            this.enModoBusqueda = false;
            this.renderServicios();
            this.cerrarModal('modal-editar-servicio');
            // No volver al modal de facturas porque eliminamos el servicio
            this.toastConDeshacer('Servicio eliminado');
        }
    }

    borrarFacturasServicio()                     { this.factura.borrarTodas(); }

    // ========================================
    // GESTIÓN DE FACTURAS
    // ========================================

    abrirModalFactura(sId, fId, origen)          { this.factura.abrirModal(sId, fId, origen); }

    toggleConCredito(modo)                       { this.factura.toggleConCredito(modo); }

    _resetBtnCredito(btn) {
        if (!btn) return;
        const iconUse = btn.querySelector('use');
        if (iconUse) iconUse.setAttribute('href', '#icon-cash');
        btn.classList.remove('pagada');
        btn.title = 'Contado / crédito';
    }

    toggleEstadoPago(btnId, inputId)             { this.factura.toggleEstadoPago(btnId, inputId); }

    toggleMontoNegativo(inputId)                 { this.factura.toggleMontoNegativo(inputId); }

    actualizarEstadoBotonToggle(inputId, btnId) {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);

        if (!input || !btn) return;

        const valor = parseFloat(input.value) || 0;

        if (valor < 0) {
            btn.classList.add('activo');
            input.dataset.negativo = 'true';
            btn.title = 'Cambiar a gasto normal';
        } else {
            btn.classList.remove('activo');
            input.dataset.negativo = 'false';
            btn.title = 'Cambiar a saldo a favor';
        }
    }

    guardarFactura(e)                            { this.factura.guardar(e); }

    editarFactura(facturaId) {
        const servicio = this.servicios.find(s => s.facturas.some(f => f.id === facturaId));
        if (!servicio) return;
        const factura = servicio.facturas.find(f => f.id === facturaId);
        if (!factura) return;

        const modal = document.getElementById('modal-facturas-servicio');
        if (modal?.classList.contains('active')) {
            const sid = modal.dataset.servicioId;
            const item = document.querySelector(`.factura-item[data-id="${CSS.escape(facturaId)}"]`);
            const grupo = item?.closest('.facturas-grupo-ano');
            const ano = grupo?.querySelector('.facturas-grupo-ano-texto')?.textContent || null;
            this._anoExpandidoFacturas[sid] = ano;
        }

        this.cerrarModal('modal-facturas-servicio');
        this.abrirModalFactura(servicio.id, facturaId);
        this.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');
    }

    establecerFechaHoy(tipo, modo)               { this.factura.establecerFechaHoy(tipo, modo); }

    eliminarFacturaDesdeModal()                  { this.factura.eliminar(); }

    obtenerUltimaFactura(servicioId) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio || !servicio.facturas || servicio.facturas.length === 0) {
            return null;
        }

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Obtener el primer día del mes actual
        const primerDiaMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

        // Obtener el último día del mes actual (no el siguiente)
        const ultimoDiaMesActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

        // Filtrar facturas que estén entre el primer día y el último día del mes actual
        const facturasEnRango = servicio.facturas.filter(f => {
            const fechaVencimiento = this._parseDate(f.fecha);
            return fechaVencimiento >= primerDiaMesActual && fechaVencimiento <= ultimoDiaMesActual;
        });

        // Si no hay facturas en el rango, retornar null
        if (facturasEnRango.length === 0) {
            return null;
        }

        // Filtrar facturas no pagadas dentro del rango
        const facturasNoPagadas = facturasEnRango.filter(f => !f.pagada);

        // Si no hay facturas pendientes en el rango, mostrar la más reciente del rango (incluso si está pagada)
        if (facturasNoPagadas.length === 0) {
            return facturasEnRango.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        }

        // Devolver la factura no pagada con vencimiento más próximo dentro del rango
        return facturasNoPagadas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0];
    }

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
                this.deshacer();
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
    inicializarHistorial() { this.historial_mgr.inicializarHistorial(); }
    deshacer() { this.historial_mgr.deshacer(); }
    rehacer() { this.historial_mgr.rehacer(); }
    actualizarBotonesHistorial() { this.historial_mgr.actualizarBotones(); }

    // ========================================
    // PERSISTENCIA DE DATOS
    // ========================================

    // NOTA: este método quedó obsoleto cuando se implementó el sistema de perfiles.
    // El flujo real de carga es: constructor → cargarDatosPerfilActivo() → inicializarHistorial()
    // Se conserva por compatibilidad pero NO debe llamarse directamente.
    // TODO: eliminar en la próxima limpieza de código.

    guardarDatos() { this.storage.guardarDatos(); }
    exportarDatos() { this.storage.exportarDatos(); }
    importarDatos(modo) { this.storage.importarDatos(modo); }

    _generarResumenComparacion(serviciosRemoto, etiqueta, categoriasRemoto) {
        return this.storage.generarResumenComparacion(serviciosRemoto, etiqueta, categoriasRemoto);
    }
    _mergeServicios(serviciosRemoto) { return this.storage._mergeServicios(serviciosRemoto); }

    mostrarOpcionesImportacion() {
        this._toggleSubMenuAjustes('opciones-importacion', 'menu-importar');
    }

    mostrarOpcionesBorrar() {
        this._toggleSubMenuAjustes('opciones-borrar', 'menu-limpiar');
    }

    toggleMenuDolar() {
        this._toggleSubMenuAjustes('opciones-dolar', 'menu-dolar');
    }

    async limpiarDatos(tipo = 'todo') {
        const mensajes = {
            todo: '¿Estás seguro de eliminar TODOS los datos? (servicios, facturas, ingresos y categorías)',
            servicios: '¿Estás seguro de eliminar todos los servicios y sus facturas? Los ingresos y categorías se conservarán.',
            facturas: '¿Estás seguro de eliminar todas las facturas de todos los servicios? Los servicios se conservarán vacíos.',
            ingresos: '¿Estás seguro de eliminar todos los ingresos registrados?',
            categorias: '¿Estás seguro de eliminar todas las categorías?'
        };

        const toasts = {
            todo: 'Todos los datos han sido eliminados',
            servicios: 'Todos los servicios han sido eliminados',
            facturas: 'Todas las facturas han sido eliminadas',
            ingresos: 'Todos los ingresos han sido eliminados',
            categorias: 'Todas las categorías han sido eliminadas'
        };

        const confirmado = await ModalManager.confirmar(
            mensajes[tipo] || mensajes.todo,
            'Borrar',
            '#icon-trash',
            { titulo: 'Eliminar datos' }
        );
        if (!confirmado) return;

        if (tipo === 'todo') {
            this.servicios = [];
            this._saveCategorias([]);
        } else if (tipo === 'servicios') {
            // Eliminar todos los servicios excepto el de ingresos
            this.servicios = this.servicios.filter(s => s.id === this.SERVICIO_INGRESOS_ID);
        } else if (tipo === 'facturas') {
            // Vaciar facturas de todos los servicios normales (no ingresos)
            this.servicios = this.servicios.map(s => {
                if (s.id === this.SERVICIO_INGRESOS_ID) return s;
                return { ...s, facturas: [] };
            });
        } else if (tipo === 'ingresos') {
            // Eliminar todas las facturas del servicio de ingresos
            const servicioIngresos = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
            if (servicioIngresos) {
                servicioIngresos.facturas = [];
            }
        } else if (tipo === 'categorias') {
            // Limpiar categorías y quitar la categoría asignada a los servicios
            this._saveCategorias([]);
            this.servicios = this.servicios.map(s => ({ ...s, categoria: '' }));
        }

        const etiquetas = { todo: 'todos los datos', servicios: 'servicios', facturas: 'facturas', ingresos: 'ingresos', categorias: 'categorías' };
        this._postGuardado(`borrar ${etiquetas[tipo] || etiquetas.todo}`);
        this.actualizarBotonesHistorial();
        this.toastConDeshacer(toasts[tipo] || toasts.todo);
        document.getElementById('opciones-borrar').classList.remove('open');
        document.getElementById('menu-limpiar').classList.remove('open');
        this.cerrarMenuAjustes();
    }

    // ========================================
    // TEMA
    // ========================================

    // ── Delegación a UIManager ────────────────────────────────
    ingresosHabilitado() { return this.ui.ingresosHabilitado(); }
    abrirModal(modalId) { this.ui.abrirModal(modalId); }
    cerrarModal(modalId) { this.ui.cerrarModal(modalId); }
    cerrarTodosLosModales() { this.ui.cerrarTodosLosModales(); }
    toggleMenuAjustes() { this.ui.toggleMenuAjustes(); }
    cerrarMenuAjustes() { this.ui.cerrarMenuAjustes(); }
    cerrarMenuAgregar() { this.ui.cerrarMenuAgregar(); }
    async cargarCotizacionDolar() { await this.ui.cargarCotizacionDolar(); }

    // Mapa de modales hijo → id del botón "volver" que se debe simular al cerrar con ESC/overlay.
    // Modales que no aparecen aquí no tienen padre → cerrarTodosLosModales normalmente.
    _MODAL_VOLVER_BTN = {
        'modal-editar-factura':     'modal-factura-close-en-grid',
        'modal-agregar-factura':    'modal-factura-close',
        'modal-editar-servicio':    'modal-editar-servicio-close',
        'modal-agregar-servicio':   'modal-servicio-close',
        'modal-agregar-ingreso':    'modal-ingreso-close',
        'modal-editar-ingreso':     'modal-ingreso-volver',
        'modal-editar-perfil':      'btn-cancelar-editar-perfil',
        'modal-nueva-categoria':    'btn-cerrar-modal-categorias',
        'modal-ordenar':            'btn-cerrar-modal-ordenar',
        'modal-perfiles':           'btn-cerrar-modal-perfiles',
        'modal-informacion':        'modal-informacion-close',
        'modal-info-resumen':       'btn-cerrar-modal-info-resumen',
        'modal-gist':               'btn-gist-cerrar',
        'modal-gist-novedades':     'gist-novedades-ignorar-btn',
        'modal-debug-estadisticas': 'btn-cerrar-modal-debug',
        'modal-facturas-servicio':  'btn-cerrar-modal-facturas-servicio',
        'modal-ingresos-lista':     'btn-cerrar-modal-ingresos-lista',
    };

    volverDesdeModalActivo() {
        // 1. Context menu abierto tiene prioridad máxima
        const ctxMenu = document.getElementById('ctx-menu-servicio');
        if (ctxMenu && (ctxMenu.classList.contains('active') || ctxMenu.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('ctx-menu-servicio');
            return;
        }

        // 2. Modales en pantalla (el superior en orden DOM)
        const modales = Array.from(document.querySelectorAll('.modal.show, .modal.active'));
        if (modales.length > 0) {
            const topModal = modales[modales.length - 1];
            ModalManager.ejecutarAccionCierre(topModal.id);
            return;
        }

        // 3. Paneles laterales
        const menuAjustes = document.getElementById('menu-ajustes');
        if (menuAjustes && (menuAjustes.classList.contains('active') || menuAjustes.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('menu-ajustes');
            return;
        }

        const menuAgregar = document.getElementById('menu-agregar');
        if (menuAgregar && (menuAgregar.classList.contains('active') || menuAgregar.classList.contains('show'))) {
            ModalManager.ejecutarAccionCierre('menu-agregar');
            return;
        }

        this.cerrarTodosLosModales();
    }

    // ========================================
    // MODALES Y MENÚS
    // ========================================

    // ── Delegación a UtilsService ─────────────────────────────
    _parseDate(str) { return this.utils.parseDate(str); }
    _postGuardado(descripcion = null) { this.utils.postGuardado(descripcion); }
    _limpiarBusqueda() { this.utils.limpiarBusqueda(); }
    _idsFormFactura(esEditar) { return this.utils.idsFormFactura(esEditar); }
    _toggleSubMenuAjustes(oId, pId) { this.utils.toggleSubMenuAjustes(oId, pId); }
    generarId() { return this.utils.generarId(); }
    obtenerFechaLocal() { return this.utils.obtenerFechaLocal(); }
    formatearMoneda(monto, moneda) { return this.utils.formatearMoneda(monto, moneda); }
    toggleMoneda(hiddenId, btnId) { this.utils.toggleMoneda(hiddenId, btnId); }
    setMonedaBtn(hiddenId, btnId, mon) { this.utils.setMonedaBtn(hiddenId, btnId, mon); }
    formatearFecha(fecha) { return this.utils.formatearFecha(fecha); }
    escaparHTML(texto) { return this.utils.escaparHTML(texto); }
    escaparAtributoHTML(texto) { return this.utils.escaparAtributoHTML(texto); }

    // ========================================
    // GESTIÓN DE INGRESOS
    // ========================================

    abrirModalIngresosLista(id)                  { this.ingreso.abrirModalLista(id); }

    abrirModalIngreso(id, desdeMenu)             { this.ingreso.abrirModal(id, desdeMenu); }

    guardarIngreso(e)                            { this.ingreso.guardar(e); }

    eliminarIngreso()                            { this.ingreso.eliminar(); }

    abrirDebugEstadisticas(tipo) {
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        if (selectMes && selectMes.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año);
            mesSeleccionado = parseInt(mes) - 1;
        } else {
            const hoy = new Date();
            mesSeleccionado = hoy.getMonth();
            añoSeleccionado = hoy.getFullYear();
        }

        const categoriaActiva = this._estadisticaCategoriaActiva || null;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        const titulos = {
            'facturas': 'Facturas del mes',
            'pendientes': 'Pendientes',
            'pagadas': 'Pagadas este mes',
            'vencidas': 'Vencidas',
            'pagado-monto': 'Monto pagado',
            'ingresos': 'Ingresos',
        };

        document.getElementById('modal-debug-titulo').textContent = titulos[tipo] || 'Detalle';

        let items = [];

        this.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.SERVICIO_INGRESOS_ID) {
                if ((servicio.categoria || '') !== categoriaActiva) return;
            }

            servicio.facturas.forEach(factura => {
                const fechaVenc = this._parseDate(factura.fecha);
                fechaVenc.setHours(0, 0, 0, 0);
                const esDelMes = fechaVenc.getMonth() === mesSeleccionado && fechaVenc.getFullYear() === añoSeleccionado;
                const esServicioIngresos = servicio.id === this.SERVICIO_INGRESOS_ID;
                const moneda = factura.moneda || 'ars';

                let incluir = false;

                switch (tipo) {
                    case 'facturas':
                        // Igual que cantidadFacturasMes: del mes, positivas, no ingresos
                        incluir = esDelMes && !esServicioIngresos && factura.monto >= 0;
                        break;

                    case 'pendientes':
                        // Igual que cantidadPendientes: del mes, no pagadas, no vencidas
                        incluir = esDelMes && !esServicioIngresos && !factura.pagada
                            && factura.monto > 0 && fechaVenc >= hoy;
                        break;

                    case 'vencidas':
                        // Igual que cantidadVencidas: del mes, no pagadas, fecha pasada
                        incluir = esDelMes && !esServicioIngresos && !factura.pagada
                            && factura.monto > 0 && fechaVenc < hoy;
                        break;

                    case 'pagadas':
                        // Igual que cantidadPagadas: pagada, fechaPago en el mes seleccionado
                        if (factura.pagada && factura.monto >= 0 && factura.fechaPago && !esServicioIngresos) {
                            const fp = this._parseDate(factura.fechaPago);
                            incluir = fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado;
                        }
                        break;

                    case 'pagado-monto':
                        // Igual que totalPagadoMesARS/USD: pagada, fechaPago en el mes, no crédito (salvo cat activa)
                        if (factura.pagada && factura.monto > 0 && factura.fechaPago && !esServicioIngresos
                            && (!factura.conCredito || categoriaActiva)) {
                            const fp = this._parseDate(factura.fechaPago);
                            incluir = fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado;
                        }
                        break;

                    case 'ingresos':
                        // Igual que totalIngresosARS/USD: del mes, servicio ingresos
                        incluir = esDelMes && esServicioIngresos;
                        break;
                }

                if (incluir) items.push({ servicio, factura });
            });
        });

        const lista = document.getElementById('modal-debug-lista');
        if (items.length === 0) {
            lista.innerHTML = `<span class="text-center-muted d-block sin-facturas-text">Sin facturas para mostrar</span>`;
        } else {
            lista.innerHTML = items.map(({ servicio, factura }) => {
                const moneda = factura.moneda || 'ars';
                const estadoBadge = factura.pagada
                    ? `<span class="debug-badge debug-badge-success">Pagada ${factura.fechaPago ? this.formatearFecha(factura.fechaPago) : ''}</span>`
                    : `<span class="debug-badge debug-badge-warning">Pendiente</span>`;
                return `
    <div class="debug-card">
        <div class="debug-card-title">${this.escaparHTML(servicio.nombre)}</div>
        <div class="d-flex justify-content-between align-items-center text-muted text-sm">
            <span>Vence: ${this.formatearFecha(factura.fecha)}</span>
            <span>${this.formatearMoneda(factura.monto, moneda)}</span>
        </div>
        <div class="mt-1">${estadoBadge}</div>
    </div>`;
            }).join('');
        }

        this.abrirModal('modal-debug-estadisticas');
    }

    // ========================================
    // GIST SYNC
    // ========================================

    // ── Delegación a GistService ──────────────────────────────
    async gistCalcularHash(texto) { return this.gist.calcularHash(texto); }
    async gistSubir() { await this.gist.subir(); }
    async _gistDescargar() { return this.gist._descargar(); }
    async gistBajar(esAutomatico = false) { await this.gist.bajar(esAutomatico); }
    _mergeCategorias(catsNuevas) { return this.gist.mergeCategorias(catsNuevas); }
    gistMergeAplicar(modo, esAuto) { this.gist.mergeAplicar(modo, esAuto); }
    async gistAutoSyncInit() {
        // Debounce de 3s al arrancar: da tiempo a que la UI cargue antes de verificar novedades
        setTimeout(() => this.gist.autoSyncInit(), 3000);
    }



    // ========================================
    // MENÚ CONTEXTUAL SERVICIOS
    // ========================================

    // ── Delegación a ContextMenuService ──────────────────────
    _ctxInit() { this.ctx.init(); }
    _ctxAbrir(e, servicioId) { this.ctx.abrir(e, servicioId); }
    _ctxCerrar() { this.ctx.cerrar(); }
    _ctxSeleccionar(servicioId) { this.ctx.seleccionar(servicioId); }
    _ctxCopiarMonto() { this.ctx.copiarMonto(); }
    _ctxPagarFactura() { this.ctx.pagarFactura(); }

    mostrarToast(mensaje, tipo = 'success') { this.ui.mostrarToast(mensaje, tipo); }
}
