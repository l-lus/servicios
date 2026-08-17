// Aplicar estado de tarjetas colapsables
(function () {
    const estadisticasColapsadas = localStorage.getItem('estadisticas-collapsed') === 'true';
    const serviciosState = localStorage.getItem('servicios-collapse-state') || 'expanded';

    document.addEventListener('DOMContentLoaded', function () {
        const estadisticasContent = document.getElementById('estadisticas-content');
        const estadisticasChevron = document.getElementById('estadisticas-chevron');
        const serviciosContent = document.getElementById('servicios-content');
        const serviciosChevron = document.getElementById('servicios-chevron');

        // Aplicar estado de estadísticas
        if (!estadisticasColapsadas) {
            estadisticasContent.classList.remove('collapsed');
        } else {
            estadisticasContent.classList.add('collapsed');
            estadisticasChevron.classList.add('collapsed');
        }

        // Aplicar estado de servicios
        if (serviciosState === 'expanded') {
            serviciosContent.classList.remove('collapsed', 'semi-collapsed');
        } else if (serviciosState === 'collapsed') {
            serviciosContent.classList.add('collapsed');
            serviciosChevron.classList.add('collapsed');
        } else if (serviciosState === 'semi-collapsed') {
            serviciosContent.classList.add('semi-collapsed');
            serviciosChevron.classList.add('semi-collapsed');
        }
    });
})();

// ============================================
// NAVEGACIÓN CON BOTÓN ATRÁS (Android / PWA)
// ============================================
// Cada vez que se abre un modal, menú lateral o menú contextual,
// se apila una entrada en el historial del navegador. Al tocar el
// botón atrás del dispositivo se dispara 'popstate', que cierra la
// capa superior en vez de salir de la app.
const BackNav = (function () {
    const _pila = []; // { id, cerrar }
    let _ignorarPopstate = false;

    // Cuando un cierre (cerrar) es seguido, en el mismo tick de JS, por una
    // apertura (abrir) —el patrón típico de "cierro este modal y abro el
    // siguiente" que encadenan varias pantallas—, NO usamos history.back()
    // + history.pushState() por separado: mezclar una navegación asíncrona
    // (back) con una síncrona (pushState) en el mismo tick desincroniza el
    // historial del navegador (el siguiente "atrás" real puede saltarse un
    // paso y salir de la app). En cambio, colapsamos ese cierre+apertura en
    // un único history.replaceState(), sin gastar un paso real de historial.
    let _cierrePendiente = false;
    let _commitProgramado = false;

    window.addEventListener('popstate', () => {
        if (_ignorarPopstate) { _ignorarPopstate = false; return; }
        const top = _pila.pop();
        if (top) top.cerrar();
    });

    function _programarCommit() {
        if (_commitProgramado) return;
        _commitProgramado = true;
        queueMicrotask(() => {
            _commitProgramado = false;
            if (!_cierrePendiente) return; // ya se resolvió con un abrir() -> replaceState
            _cierrePendiente = false;
            _ignorarPopstate = true;
            history.back();
        });
    }

    function abrir(id, cerrarFn) {
        _pila.push({ id, cerrar: cerrarFn });
        if (_cierrePendiente) {
            _cierrePendiente = false;
            history.replaceState({ overlay: id }, '');
        } else {
            history.pushState({ overlay: id }, '');
        }
    }

    function cerrar(id) {
        const idx = _pila.findIndex(o => o.id === id);
        if (idx === -1) return; // no estaba trackeada (evita un history.back() de más)
        _pila.splice(idx, 1);
        _cierrePendiente = true;
        _programarCommit();
    }

    function cerrarTodo() {
        _cierrePendiente = false;
        if (_pila.length === 0) return;
        _ignorarPopstate = true;
        history.go(-_pila.length);
        _pila.length = 0;
    }

    return { abrir, cerrar, cerrarTodo };
})();

// ============================================
// APLICACIÓN DE GESTIÓN DE SERVICIOS
// ============================================

class GestionServicios {
    constructor() {
        // Sistema de perfiles — PerfilService se instancia primero porque
        // cargar() se necesita durante la construcción
        this.perfilActivo = localStorage.getItem('gestion_servicios_perfil_activo') || 'default';
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
            this._catColapsadas = JSON.parse(localStorage.getItem('cat-colapsadas') || '{}');
            this._catColapsadasAntesBusqueda = null;
        } catch (e) {
            this._catColapsadas = {};
        }

        this._agrupacionActiva = localStorage.getItem('cat-agrupacion') === 'on';
        this._vistaEstados = localStorage.getItem('vista-estados') === 'true';
        if (!this._agrupacionActiva && !this._vistaEstados) {
            // si ninguna está activa, estado por defecto
        }
        // Modo calculadora - NUEVO
        this.modoCalculadora = false;
        this.modoCalculadoraTipo = 'pendientes';
        this.serviciosSeleccionados = new Set();
        this.servicioContextual = null;

        // Historial undo/redo
        this.historial = [];
        this.historialIndex = -1;
        this.maxHistorial = 20;

        // Configuración
        this.STORAGE_KEY = 'gestion_servicios_data';
        this.THEME_KEY = 'gestion_servicios_theme';
        this.mostrandoPagadoMes = localStorage.getItem('resumen-mostrar-pagado') === 'true';
        this.resumenDesblurado = false; // Siempre empieza blureado al cargar
        this.blurHabilitado = localStorage.getItem('blur-montos') === 'true';
        this.datosResumen = { pendiente: 0, pagadoMes: 0, totalPeriodo: 0 };
        this.serviciosCollapseState = 'expanded'; // 'expanded', 'semi-collapsed', 'collapsed'

        // Timer para doble click en toggle de servicios
        this.toggleServiciosTimer = null;
        this.toggleServiciosDelay = 500;

        // Ordenamiento de lista de servicios
        this.ordenActual = localStorage.getItem('gestion_servicios_orden') || 'nombre';
        this.terminoBusqueda = '';
        this.enModoBusqueda = false;
        this._ctxServicioId = null;

        // Timer para el toast
        this.toastTimeout = null;

        // Cache para animaciones condicionales
        this.ultimoEstadoEstadisticas = null;
        this.ultimoEstadoCalculador = null;
        this.ultimoEstadoResumen = null;

        this.INGRESOS_KEY = 'ingresos-habilitado';
        this.SERVICIO_INGRESOS_ID = 'servicio-ingresos-especial';

        // Tipo de estadística seleccionado
        this.tipoEstadisticaActual = localStorage.getItem('estadisticas-tipo') || 'mensual';
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
        this.ui.cargarTema();
        this.actualizarResumenMes();
        this.renderServicios();
        this.setupEventListeners();
        this.actualizarBotonesHistorial();
        this.cargarCotizacionDolar();

        // Inicializar indicador de ingresos
        if (localStorage.getItem(this.INGRESOS_KEY) === null) {
            localStorage.setItem(this.INGRESOS_KEY, 'false');
        }
        const ingresosHabilitado = this.ingresosHabilitado();
        const indicator = document.getElementById('ingresos-indicator');
        if (indicator) {
            indicator.textContent = ingresosHabilitado ? 'SI' : 'NO';
        }
        const blurIndicator = document.getElementById('blur-indicator');
        if (blurIndicator) blurIndicator.textContent = this.blurHabilitado ? 'SI' : 'NO';

        // Restaurar estado de estadísticas colapsadas
        const estadisticasColapsadas = localStorage.getItem('estadisticas-collapsed') === 'true';
        if (estadisticasColapsadas) {
            document.getElementById('estadisticas-content').classList.add('collapsed');
            document.getElementById('estadisticas-chevron').classList.add('collapsed');
        } else {
            // Si está expandido, cargar el tipo guardado
            const tipoGuardado = localStorage.getItem('estadisticas-tipo') || 'mensual';
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
                localStorage.setItem('estadisticas-tipo', selEstTipo.value);
                this.cambiarTipoEstadistica();
            });
        }

        // Inicializar CustomSelects estáticos (modales, formularios)
        this._initCustomSelects();

        // Restaurar estado de servicios colapsados
        const serviciosState = localStorage.getItem('servicios-collapse-state') || 'semi-collapsed';
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
            localStorage.setItem('cat-agrupacion', this._agrupacionActiva ? 'on' : 'off');
            localStorage.setItem('vista-estados', this._vistaEstados ? 'true' : 'false');
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

        searchInput.addEventListener('input', (e) => {
            const termino = e.target.value.toLowerCase().trim();

            // Al empezar a escribir, guardar estado de grupos
            if (!this.terminoBusqueda && termino) {
                this._catColapsadasAntesBusqueda = JSON.parse(JSON.stringify(this._catColapsadas));
            }

            this.terminoBusqueda = termino;
            this.enModoBusqueda = true;
            searchClear.classList.toggle('d-flex-force', !!this.terminoBusqueda);

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
        });

        searchClear.addEventListener('click', () => {
            this._limpiarBusqueda();
        });

        searchInput.addEventListener('keydown', (e) => {
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
            localStorage.setItem('cat-agrupacion', this._agrupacionActiva ? 'on' : 'off');
            localStorage.setItem('vista-estados',  this._vistaEstados ? 'true' : 'false');
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
                    this.volverDesdeModalActivo();
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
            localStorage.setItem('estadisticas-tipo', e.target.value);
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
                const hayModalAbierto = document.querySelector('.modal.active');
                const hayMenuAbierto = document.getElementById('menu-ajustes').classList.contains('active')
                    || document.getElementById('menu-agregar').classList.contains('active');

                if (this.modoCalculadora) { this.desactivarModoCalculadora(); return; }
                if (hayModalAbierto || hayMenuAbierto) {
                    this.volverDesdeModalActivo();
                    this.cerrarMenuAjustes();
                    return;
                }
                if (this.terminoBusqueda) { this._limpiarBusqueda(); return; }
            }

            // Enter en modal nueva categoría
            if (e.key === 'Enter') {
                const modalCat = document.getElementById('modal-nueva-categoria');
                if (modalCat?.classList.contains('active')) {
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
                    localStorage.setItem('servicios-collapse-state', 'semi-collapsed');
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
            localStorage.setItem('servicios-collapse-state', 'collapsed');

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
            localStorage.setItem('servicios-collapse-state', 'semi-collapsed');

        } else if (this.serviciosCollapseState === 'semi-collapsed') {
            // De semi-collapsed a expanded (AQUÍ INICIA EL TIMER)
            this.serviciosCollapseState = 'expanded';
            this.aplicarEstadoServicios('expanded');
            localStorage.setItem('servicios-collapse-state', 'expanded');

            // Activar timer de 3 segundos
            this.toggleServiciosTimer = setTimeout(() => {
                this.toggleServiciosTimer = null;
            }, this.toggleServiciosDelay);

        } else {
            // De expanded a semi-collapsed (después de que expiró el timer)
            this.serviciosCollapseState = 'semi-collapsed';
            this.aplicarEstadoServicios('semi-collapsed');
            localStorage.setItem('servicios-collapse-state', 'semi-collapsed');

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

        if (serviciosNormales.length === 0 && !this.ingresosHabilitado()) {
            lista.innerHTML = `
                      <div class="empty-state">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                              <line x1="12" y1="9" x2="12" y2="15"/>
                              <line x1="9" y1="12" x2="15" y2="12"/>
                          </svg>
                          <p>No hay servicios registrados<br>Presiona el botón + para agregar uno</p>
                      </div>
                  `;
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
                ${items.map(generarItemServicio).join('')}
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
                ${itemsHTML}
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

        lista.innerHTML = html;

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
        localStorage.setItem('gestion_servicios_orden', this.ordenActual);
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
        } else {
            chevron.classList.add('collapsed');
            contenido.classList.add('collapsed');
            this._catColapsadas[cat] = true;
        }
        localStorage.setItem('cat-colapsadas', JSON.stringify(this._catColapsadas));
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
        localStorage.setItem('cat-colapsadas', JSON.stringify(this._catColapsadas));
        this.mostrarToast(estaColapsado ? 'Categorías expandidas' : 'Categorías colapsadas', 'info');
    }

    toggleGrupoAno(headerElement) {
        const chevron = headerElement.querySelector('.facturas-grupo-chevron');
        const contenido = headerElement.nextElementSibling;

        if (chevron.classList.contains('collapsed')) {
            const todosLosChevrons = document.querySelectorAll('.facturas-grupo-chevron:not(.collapsed)');
            const todosLosContenidos = document.querySelectorAll('.facturas-grupo-contenido:not(.collapsed)');

            todosLosChevrons.forEach(ch => ch.classList.add('collapsed'));
            todosLosContenidos.forEach(cont => cont.classList.add('collapsed'));

            chevron.classList.remove('collapsed');
            contenido.classList.remove('collapsed');
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
        const dataAccion = accion ? `data-action="factura-click" data-factura-accion="${accion}" data-factura-id="${factura.id}"` : '';
        const moneda = factura.moneda || 'ars';
        const badgeClass = moneda === 'usd' ? 'usd' : 'ars';
        const pagoBadge = factura.pagada
            ? (factura.conCredito
                ? '<span class="moneda-badge credito">Crédito</span>'
                : '<span class="moneda-badge contado">Contado</span>')
            : '';

        return `
        <div class="factura-item" data-id="${factura.id}">
            <div class="factura-info" ${dataAccion}>
                <div class="${claseMonto}">${this.formatearMoneda(factura.monto, moneda)}<span class="moneda-badge ${badgeClass}">${moneda.toUpperCase()}</span>${pagoBadge}</div>
                <div class="factura-fecha">
                    ${factura.tipo || 'mensual'} | Vence: ${this.formatearFecha(factura.fecha)}
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
        this.guardarEstado();
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

    eliminarServicio() {
        if (!this.servicioActual) return;

        if (confirm('¿Estás seguro de eliminar este servicio y todas sus facturas?')) {
            this.servicios = this.servicios.filter(s => s.id !== this.servicioActual);

            this.guardarDatos();
            this.guardarEstado();
            this.enModoBusqueda = false;
            this.renderServicios();
            this.cerrarModal('modal-editar-servicio');
            // No volver al modal de facturas porque eliminamos el servicio
            this.mostrarToast('Servicio eliminado', 'success');
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
            const item = document.querySelector(`.factura-item[data-id="${facturaId}"]`);
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

    guardarEstado() { this.historial_mgr.guardarEstado(); }
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

    limpiarDatos(tipo = 'todo') {
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

        if (confirm(mensajes[tipo] || mensajes.todo)) {
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

            this._postGuardado();
            this.actualizarBotonesHistorial();
            this.mostrarToast(toasts[tipo] || toasts.todo, 'success');
            document.getElementById('opciones-borrar').classList.remove('open');
            document.getElementById('menu-limpiar').classList.remove('open');
            this.cerrarMenuAjustes();
        }
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
        'modal-editar-factura':  'modal-factura-close-en-grid',
        'modal-agregar-factura': 'modal-factura-close',
        'modal-editar-servicio': 'modal-editar-servicio-close',
        'modal-agregar-ingreso': 'modal-ingreso-close',
        'modal-editar-ingreso':  'modal-ingreso-volver',
        'modal-editar-perfil':   'btn-cancelar-editar-perfil',
    };

    volverDesdeModalActivo() {
        const modalActivo = document.querySelector('.modal.active');
        if (!modalActivo) { this.cerrarTodosLosModales(); return; }
        const btnId = this._MODAL_VOLVER_BTN[modalActivo.id];
        if (btnId !== undefined) {
            // Modal con padre definido → simular clic en su botón volver
            const btn = document.getElementById(btnId);
            if (btn) { btn.click(); return; }
        }
        // Modal sin padre (raíz) o botón no encontrado → cerrar todo
        this.cerrarTodosLosModales();
    }

    // ========================================
    // MODALES Y MENÚS
    // ========================================

    // ── Delegación a UtilsService ─────────────────────────────
    _parseDate(str) { return this.utils.parseDate(str); }
    _postGuardado() { this.utils.postGuardado(); }
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

// ============================================================
// FACTURA SERVICE — ciclo de vida de facturas
// ============================================================
class FacturaService {
    constructor(app) {
        this.app = app;
    }

    get servicios() { return this.app.servicios; }

    // ── Validaciones ──────────────────────────────────────────
    validarMonto(monto, permitirNegativos = false) {
        if (!monto && monto !== 0 || isNaN(monto)) {
            this.app.ui.mostrarToast('El monto debe ser un número válido', 'error'); return false;
        }
        if (!permitirNegativos && monto < 0) {
            this.app.ui.mostrarToast('El monto debe ser positivo', 'error'); return false;
        }
        if (Math.abs(monto) > 99999999) {
            this.app.ui.mostrarToast('El monto es demasiado grande', 'error'); return false;
        }
        return true;
    }

    validarFecha(fecha) {
        if (!fecha) { this.app.ui.mostrarToast('La fecha es requerida', 'error'); return false; }
        const fechaIngresada = this.app.utils.parseDate(fecha);
        const diferenciaAnios = (fechaIngresada - new Date()) / (1000 * 60 * 60 * 24 * 365.25);
        if (diferenciaAnios > 2) {
            this.app.ui.mostrarToast('La fecha no puede ser mayor a 2 años en el futuro', 'error'); return false;
        }
        return true;
    }

    validarFechaPago(fechaPago) {
        if (!fechaPago) {
            this.app.ui.mostrarToast('La fecha de pago es requerida cuando se marca como pagada', 'error'); return false;
        }
        const fp = this.app.utils.parseDate(fechaPago);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0); fp.setHours(0, 0, 0, 0);
        if (fp > hoy) {
            this.app.ui.mostrarToast('La fecha de pago no puede ser en el futuro', 'error'); return false;
        }
        return true;
    }

    // ── Helpers de grupo por año ──────────────────────────────
    agruparPorAno(items) {
        const porAno = {};
        items.forEach(item => {
            const ano = this.app.utils.parseDate(item.fecha).getFullYear();
            if (!porAno[ano]) porAno[ano] = [];
            porAno[ano].push(item);
        });
        return Object.keys(porAno).sort((a, b) => b - a)
            .map(ano => ({ ano, items: porAno[ano], cantidad: porAno[ano].length }));
    }

    generarGrupoAno(ano, items, itemHTML, tipoLabel = 'factura', index = 0) {
        const collapsed = index > 0 ? 'collapsed' : '';
        const cantidad = items.length;
        const labelPlural = cantidad !== 1 ? `${tipoLabel}s` : tipoLabel;
        return `
        <div class="facturas-grupo-ano">
            <div class="facturas-grupo-header" data-action="toggle-grupo-ano">
                <div class="facturas-grupo-header-info">
                    <span class="facturas-grupo-ano-texto">${ano}</span>
                    <span class="facturas-grupo-contador">${cantidad} ${labelPlural}</span>
                </div>
                <svg class="icon facturas-grupo-chevron ${collapsed}"><use href="#icon-chevron-down" /></svg>
            </div>
            <div class="facturas-grupo-contenido ${collapsed}">${itemHTML}</div>
        </div>`;
    }

    // ── Modal lista facturas ──────────────────────────────────
    abrirModalLista(servicioId) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const lista     = document.getElementById('lista-facturas-modal');
        const titulo    = document.getElementById('modal-facturas-titulo');
        const btnBorrar = document.getElementById('btn-borrar-facturas-servicio');
        titulo.textContent = servicio.nombre;
        this.app.servicioActual = servicioId;
        document.getElementById('modal-facturas-servicio').dataset.servicioId = servicioId;
        if (btnBorrar) btnBorrar.style.display = servicio.facturas.length > 0 ? '' : 'none';
        if (servicio.facturas.length === 0) {
            lista.innerHTML = '<div class="empty-state"><p>No hay facturas registradas</p></div>';
        } else {
            const ordenadas = [...servicio.facturas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            const grupos = this.agruparPorAno(ordenadas);
            lista.innerHTML = grupos.map((grupo, index) => {
                const html = grupo.items.map(f => this.app.generarHTMLFactura(f, 'editar-factura')).join('');
                return this.generarGrupoAno(grupo.ano, grupo.items, html, 'factura', index);
            }).join('');
        }
        this.app.abrirModal('modal-facturas-servicio');
        const anoGuardado = this.app._anoExpandidoFacturas[servicioId];
        if (anoGuardado) { this.app._restaurarAnoExpandido(anoGuardado); this.app._anoExpandidoFacturas[servicioId] = null; }
    }

    borrarTodas() {
        if (!this.app.servicioActual) return;
        const servicio = this.servicios.find(s => s.id === this.app.servicioActual);
        if (!servicio) return;
        const total = servicio.facturas?.length || 0;
        if (total === 0) { this.app.ui.mostrarToast('No hay facturas para borrar', 'info'); return; }
        if (confirm(`¿Borrar las ${total} factura${total !== 1 ? 's' : ''} de "${servicio.nombre}"? Esta acción no se puede deshacer.`)) {
            servicio.facturas = [];
            this.app.guardarDatos();
            this.app.renderServicios();
            this.app.ui.mostrarToast(`${total} factura${total !== 1 ? 's' : ''} eliminada${total !== 1 ? 's' : ''}`, 'success');
        }
    }

    // ── Modal agregar/editar ──────────────────────────────────
    abrirModal(servicioId, facturaId = null, origen = 'servicio') {
        this.app.cerrarModal('modal-facturas-servicio');
        this.app.servicioActual = servicioId;
        this.app.facturaActual  = facturaId;
        const ids     = this.app.utils.idsFormFactura(!!facturaId);
        const servicio = this.servicios.find(s => s.id === servicioId);

        // Opciones de servicio (para ambos modales)
        const optsServicios = this.servicios
            .filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        const optsHTML = optsServicios.map(s =>
            `<option value="${s.id}" ${s.id === servicioId ? 'selected' : ''}>${this.app.utils.escaparHTML(s.nombre)}</option>`
        ).join('');

        if (facturaId) {
            const factura = servicio?.facturas.find(f => f.id === facturaId);
            if (!factura) return;
            this.app.origenModalFactura = origen;
            
            // Quitamos Math.abs para que muestre el signo -
            document.getElementById(ids.monto).value = factura.monto; 
            document.getElementById(ids.tipo).value  = factura.tipo || 'mensual';
            document.getElementById(ids.fecha).value = factura.fecha;
            this.app.utils.setMonedaBtn(ids.moneda, ids.btnMoneda, factura.moneda || 'ars');
            
            const btnNeg = document.getElementById(ids.btnNegativo);
            const inputMonto = document.getElementById(ids.monto);
            if (btnNeg) {
                const esNeg = factura.monto < 0;
                btnNeg.classList.toggle('activo', esNeg);
                if (inputMonto) inputMonto.dataset.negativo = esNeg ? 'true' : 'false';
            }
            
            const btnPagada = document.getElementById(ids.btnPagada);
            if (factura.pagada || factura.conCredito) {
                btnPagada.classList.add('pagada');
                btnPagada.querySelector('use')?.setAttribute('href', '#icon-cancel');
                const fpInput = document.getElementById(ids.fechaPago);
                fpInput.disabled = false; fpInput.value = factura.fechaPago || '';
                const btnCred = document.getElementById(ids.btnCredito);
                if (btnCred) btnCred.classList.add('btn-credito-visible');
                if (factura.conCredito) {
                    document.getElementById(ids.conCredito).value = 'true';
                    if (btnCred) { btnCred.classList.add('pagada'); btnCred.querySelector('use')?.setAttribute('href', '#icon-card'); }
                } else {
                    document.getElementById(ids.conCredito).value = 'false';
                    this._resetBtnCredito(btnCred);
                }
            } else {
                btnPagada.classList.remove('pagada');
                btnPagada.querySelector('use')?.setAttribute('href', '#icon-card');
                document.getElementById(ids.fechaPago).disabled = true;
                document.getElementById(ids.fechaPago).value = '';
                const btnCred = document.getElementById(ids.btnCredito);
                const inputCred = document.getElementById(ids.conCredito);
                if (inputCred) inputCred.value = 'false';
                if (btnCred) btnCred.classList.remove('btn-credito-visible');
                this._resetBtnCredito(btnCred);
            }
            // Poblar select de servicios en modal editar
            const selEdit = document.getElementById(ids.servicio);
            if (selEdit) selEdit.innerHTML = optsHTML;
            // Refrescar CustomSelects del modal editar-factura
            const csdSvcEdit = document.getElementById('editar-factura-servicio-csd');
            if (csdSvcEdit?._customSelect) csdSvcEdit._customSelect.refresh();
            const csdTipoEdit = document.getElementById('editar-factura-tipo-csd');
            if (csdTipoEdit?._customSelect) csdTipoEdit._customSelect.refresh();
            this.app.abrirModal('modal-editar-factura');
        } else {
            // Poblar select ANTES de reset para que reset no lo borre
            const selectSvc = document.getElementById('factura-servicio');
            if (selectSvc) selectSvc.innerHTML = optsHTML;
            document.getElementById('form-factura').reset();
            // Restaurar valores que reset borró
            if (selectSvc) selectSvc.innerHTML = optsHTML;
            this.app.utils.setMonedaBtn('factura-moneda', 'btn-factura-moneda', 'ars');
            document.getElementById('factura-fecha').value = this.app.utils.obtenerFechaLocal();
            document.getElementById('btn-toggle-pagada').classList.remove('pagada');
            document.getElementById('factura-fecha-pago').disabled = true;
            document.getElementById('factura-fecha-pago').value = '';
            this._resetBtnCredito(document.getElementById('btn-toggle-credito'));
            // Refrescar CustomSelects del modal nueva factura
            const csdSvcNueva = document.getElementById('factura-servicio-csd');
            if (csdSvcNueva?._customSelect) csdSvcNueva._customSelect.refresh();
            const csdTipoNueva = document.getElementById('factura-tipo-csd');
            if (csdTipoNueva?._customSelect) csdTipoNueva._customSelect.refresh();
            this.app.origenModalFactura = origen;
            if (origen === 'menu') this.app.ui.cerrarMenuAgregar();
            this.app.abrirModal('modal-agregar-factura');
        }
    }

    // ── Toggles ───────────────────────────────────────────────
    _resetBtnCredito(btn) {
        if (!btn) return;
        btn.querySelector('use')?.setAttribute('href', '#icon-cash');
        btn.classList.remove('pagada'); btn.title = 'Contado / crédito';
    }

    toggleConCredito(modo = '') {
        const esEditar = modo === 'editar';
        const ids   = this.app.utils.idsFormFactura(esEditar);
        const btn   = document.getElementById(ids.btnCredito);
        const input = document.getElementById(ids.conCredito);
        const use   = btn.querySelector('use');
        const esCredito = input.value === 'true';
        if (esCredito) {
            input.value = 'false'; use.setAttribute('href', '#icon-cash');
            btn.classList.remove('pagada'); btn.title = 'Pagada al contado';
            this.app.ui.mostrarToast('Pagada al contado', 'info');
        } else {
            input.value = 'true'; use.setAttribute('href', '#icon-card');
            btn.classList.add('pagada'); btn.title = 'Pagada con crédito';
            this.app.ui.mostrarToast('Pagada con crédito', 'info');
        }
    }

    toggleEstadoPago(btnId = 'btn-toggle-pagada', inputId = 'factura-fecha-pago') {
        const btn        = document.getElementById(btnId);
        const fpInput    = document.getElementById(inputId);
        const use        = btn.querySelector('use');
        const estaPagada = btn.classList.contains('pagada');
        const esEditar   = btnId === 'btn-editar-toggle-pagada';
        const btnCred    = document.getElementById(esEditar ? 'btn-editar-toggle-credito'  : 'btn-toggle-credito');
        const inputCred  = document.getElementById(esEditar ? 'editar-factura-con-credito' : 'factura-con-credito');
        if (estaPagada) {
            btn.classList.remove('pagada'); fpInput.disabled = true; fpInput.value = '';
            use.setAttribute('href', '#icon-card');
            if (btnCred)   btnCred.classList.remove('btn-credito-visible');
            if (inputCred) inputCred.value = 'false';
            this._resetBtnCredito(btnCred);
            this.app.ui.mostrarToast('Factura pendiente', 'info');
        } else {
            btn.classList.add('pagada'); fpInput.disabled = false;
            fpInput.value = this.app.utils.obtenerFechaLocal();
            use.setAttribute('href', '#icon-cancel');
            if (btnCred) btnCred.classList.add('btn-credito-visible');
            this.app.ui.mostrarToast('Factura pagada', 'success');
        }
    }

    toggleMontoNegativo(inputId) {
        const input = document.getElementById(inputId);
        const btnId = inputId === 'factura-monto' ? 'btn-toggle-negativo' : 'btn-editar-toggle-negativo';
        const btn   = document.getElementById(btnId);
        if (!input || !btn) return;
        
        const nuevoNegativo = input.dataset.negativo !== 'true';
        input.dataset.negativo = nuevoNegativo ? 'true' : 'false';
        btn.classList.toggle('activo', nuevoNegativo);
        btn.title = nuevoNegativo ? 'Cambiar a gasto normal' : 'Cambiar a saldo a favor';

        const valorActual = parseFloat(input.value) || 0;
        if (valorActual !== 0) {
            input.value = nuevoNegativo ? -Math.abs(valorActual) : Math.abs(valorActual);
        }
    }

    establecerFechaHoy(tipo = 'factura', modo = 'agregar') {
        const id    = modo === 'editar' ? `editar-${tipo}-fecha` : `${tipo}-fecha`;
        const input = document.getElementById(id);
        if (input) input.value = input.value ? '' : this.app.utils.obtenerFechaLocal();
    }

    // ── Guardar ───────────────────────────────────────────────
    guardar(e) {
        e.preventDefault();
        const esEditar   = document.getElementById('modal-editar-factura').classList.contains('active');
        const ids        = this.app.utils.idsFormFactura(esEditar);
        const montoRaw   = parseFloat(document.getElementById(ids.monto).value);
        const tipo       = document.getElementById(ids.tipo).value;
        const fecha      = document.getElementById(ids.fecha).value;
        const moneda     = document.getElementById(ids.moneda).value;
        const btnPagada  = document.getElementById(ids.btnPagada);
        const estaPagada = btnPagada.classList.contains('pagada');
        const fechaPago  = estaPagada ? document.getElementById(ids.fechaPago).value : null;
        const conCredito = estaPagada ? (document.getElementById(ids.conCredito)?.value === 'true') : false;
        const btnNeg     = document.getElementById(ids.btnNegativo);
        const esNegativo = btnNeg?.classList.contains('activo') || document.getElementById(ids.monto).dataset.negativo === 'true';
        const monto      = esNegativo ? -Math.abs(montoRaw) : Math.abs(montoRaw);
        const servicioSelId = document.getElementById(ids.servicio)?.value || this.app.servicioActual;

        if (!this.validarMonto(montoRaw, true)) return;
        if (!this.validarFecha(fecha)) return;
        if (estaPagada && !conCredito && !this.validarFechaPago(fechaPago)) return;

        const servicio = this.servicios.find(s => s.id === servicioSelId);
        if (!servicio) { this.app.ui.mostrarToast('Servicio no encontrado', 'error'); return; }

        if (esEditar) {
            const factura = servicio.facturas.find(f => f.id === this.app.facturaActual);
            if (!factura) return;
            if (factura.monto === monto && factura.tipo === tipo && factura.fecha === fecha &&
                factura.pagada === estaPagada && factura.fechaPago === fechaPago &&
                (factura.moneda || 'ars') === moneda) {
                this.app.ui.mostrarToast('Sin cambios', 'info');
                this.app.cerrarModal('modal-editar-factura');
                this.abrirModalLista(servicioSelId); return;
            }
            Object.assign(factura, { monto, tipo, fecha, moneda, pagada: estaPagada, fechaPago: estaPagada ? fechaPago : null, conCredito });
        } else {
            servicio.facturas.push({ id: this.app.utils.generarId(), monto, tipo, fecha, moneda, pagada: estaPagada, fechaPago: estaPagada ? fechaPago : null, conCredito });
        }
        this.app.utils.postGuardado();
        this.app.cerrarModal(esEditar ? 'modal-editar-factura' : 'modal-agregar-factura');
        this.abrirModalLista(servicioSelId);
        this.app.ui.mostrarToast(esEditar ? 'Factura actualizada' : 'Factura agregada', 'success');
    }

    // ── Eliminar ──────────────────────────────────────────────
    eliminar() {
        if (!this.app.facturaActual) return;
        const servicio = this.servicios.find(s => s.id === this.app.servicioActual);
        if (!servicio) return;
        servicio.facturas = servicio.facturas.filter(f => f.id !== this.app.facturaActual);
        this.app.guardarDatos();
        this.app.guardarEstado();
        this.app.renderServicios();
        this.app.cerrarModal('modal-editar-factura');
        this.app.ui.mostrarToast('Factura eliminada', 'success');
    }
}

// ============================================================
// INGRESO SERVICE — ciclo de vida de ingresos
// ============================================================
class IngresoService {
    constructor(app) {
        this.app = app;
    }

    get servicios() { return this.app.servicios; }

    crearServicio() {
        this.servicios.push({ id: this.app.SERVICIO_INGRESOS_ID, nombre: 'Ingresos', facturas: [], activo: false });
        this.app.guardarDatos();
    }

    abrirModalLista(servicioId) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const lista = document.getElementById('lista-ingresos-modal');
        if (servicio.facturas.length === 0) {
            lista.innerHTML = '<div class="empty-state"><p>No hay ingresos registrados</p></div>';
        } else {
            const ordenados = [...servicio.facturas].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            const grupos = this.app.factura.agruparPorAno(ordenados);
            lista.innerHTML = grupos.map((grupo, index) => {
                const html = grupo.items.map(ingreso => {
                    const tipo   = ingreso.tipo === 'complementario' ? 'Complementario' : ingreso.tipo === 'transferencia' ? 'Transferencia' : 'Regular';
                    const emoji  = ingreso.tipo === 'complementario' ? '💼' : ingreso.tipo === 'transferencia' ? '🔄' : '💵';
                    const moneda = ingreso.moneda || 'ars';
                    return `
                    <div class="factura-item" data-id="${ingreso.id}">
                        <div class="factura-info" data-action="abrir-ingreso" data-ingreso-id="${ingreso.id}">
                            <div class="factura-monto">${this.app.utils.formatearMoneda(ingreso.monto, moneda)}<span class="moneda-badge ${moneda}">${moneda.toUpperCase()}</span></div>
                            <div class="factura-fecha">${emoji} ${tipo} | Cobrado: ${this.app.utils.formatearFecha(ingreso.fecha)}</div>
                        </div>
                    </div>`;
                }).join('');
                return this.app.factura.generarGrupoAno(grupo.ano, grupo.items, html, 'ingreso', index);
            }).join('');
        }
        document.getElementById('modal-ingresos-lista').dataset.servicioId = servicioId;
        this.app.abrirModal('modal-ingresos-lista');
        const anoGuardado = this.app._anoExpandidoIngresos[servicioId];
        if (anoGuardado) { this.app._restaurarAnoExpandido(anoGuardado); this.app._anoExpandidoIngresos[servicioId] = null; }
    }

    abrirModal(ingresoId = null, desdeMenu = false) {
        if (ingresoId) {
            const modal = document.getElementById('modal-ingresos-lista');
            if (modal?.classList.contains('active')) {
                const sid  = modal.dataset.servicioId;
                const item = document.querySelector(`.factura-item[data-id="${ingresoId}"]`);
                const ano  = item?.closest('.facturas-grupo-ano')?.querySelector('.facturas-grupo-ano-texto')?.textContent || null;
                this.app._anoExpandidoIngresos[sid] = ano;
            }
        }
        this.app.cerrarModal('modal-ingresos-lista');
        this.app.ingresoActual    = ingresoId;
        this.app.ingresoDesdeMenu = desdeMenu;
        if (ingresoId) {
            const servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
            const ingreso  = servicio?.facturas.find(f => f.id === ingresoId);
            if (ingreso) {
                document.getElementById('editar-ingreso-monto').value = ingreso.monto;
                document.getElementById('editar-ingreso-tipo').value  = ingreso.tipo || 'regular';
                document.getElementById('editar-ingreso-fecha').value = ingreso.fecha;
                this.app.utils.setMonedaBtn('editar-ingreso-moneda', 'btn-editar-ingreso-moneda', ingreso.moneda || 'ars');
                // Refrescar CustomSelect editar-ingreso-tipo
                const csdEditTipo = document.getElementById('editar-ingreso-tipo-csd');
                if (csdEditTipo?._customSelect) csdEditTipo._customSelect.refresh();
            }
            this.app.abrirModal('modal-editar-ingreso');
        } else {
            document.getElementById('form-ingreso').reset();
            this.app.utils.setMonedaBtn('ingreso-moneda', 'btn-ingreso-moneda', 'ars');
            // Refrescar CustomSelect ingreso-tipo (reset puede haber alterado la opción visible)
            const csdTipo = document.getElementById('ingreso-tipo-csd');
            if (csdTipo?._customSelect) csdTipo._customSelect.refresh();
            this.app.abrirModal('modal-agregar-ingreso');
        }
    }

    guardar(e) {
        e.preventDefault();
        const esEditar = document.getElementById('modal-editar-ingreso').classList.contains('active');
        const monto  = parseFloat(document.getElementById(esEditar ? 'editar-ingreso-monto' : 'ingreso-monto').value);
        const tipo   = document.getElementById(esEditar ? 'editar-ingreso-tipo'   : 'ingreso-tipo').value;
        const fecha  = document.getElementById(esEditar ? 'editar-ingreso-fecha'  : 'ingreso-fecha').value;
        const moneda = document.getElementById(esEditar ? 'editar-ingreso-moneda' : 'ingreso-moneda').value;
        if (!this.app.factura.validarMonto(monto, false)) return;
        if (!this.app.factura.validarFecha(fecha)) return;
        let servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
        if (!servicio) { this.crearServicio(); servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID); }
        if (this.app.ingresoActual) {
            const ingreso = servicio.facturas.find(f => f.id === this.app.ingresoActual);
            if (ingreso) {
                if (ingreso.monto === monto && ingreso.tipo === tipo && ingreso.fecha === fecha && (ingreso.moneda || 'ars') === moneda) {
                    this.app.ui.mostrarToast('Sin cambios', 'info');
                    this.app.cerrarModal('modal-editar-ingreso');
                    this.abrirModalLista(this.app.SERVICIO_INGRESOS_ID); return;
                }
                Object.assign(ingreso, { monto, tipo, fecha, moneda });
            }
        } else {
            servicio.facturas.push({ id: this.app.utils.generarId(), monto, tipo, fecha, moneda, pagada: true });
        }
        this.app.guardarDatos();
        this.app.guardarEstado();
        this.app.renderServicios();
        this.app.cerrarModal(esEditar ? 'modal-editar-ingreso' : 'modal-agregar-ingreso');
        if (!this.app.ingresoDesdeMenu) this.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
        this.app.ui.mostrarToast(this.app.ingresoActual ? 'Ingreso actualizado' : 'Ingreso agregado', 'success');
    }

    eliminar() {
        const servicio = this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
        if (!servicio) return;
        servicio.facturas = servicio.facturas.filter(f => f.id !== this.app.ingresoActual);
        this.app.guardarDatos();
        this.app.guardarEstado();
        this.app.renderServicios();
        this.app.cerrarModal('modal-editar-ingreso');
        if (!this.app.ingresoDesdeMenu) this.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
        this.app.ui.mostrarToast('Ingreso eliminado', 'success');
    }
}

// ============================================================
// CONTEXT MENU SERVICE — menú contextual de servicios
// ============================================================
class ContextMenuService {
    constructor(app) {
        this.app = app;
    }

    init() {
        const menu = document.getElementById('ctx-menu-servicio');

        document.addEventListener('pointerdown', (e) => {
            if (!menu.contains(e.target)) this.cerrar();
        }, true);

        document.addEventListener('scroll', () => this.cerrar(), true);

        document.getElementById('ctx-seleccionar').addEventListener('click', () => {
            const id = this.app._ctxServicioId;
            this.cerrar();
            if (this.app.modoCalculadora) {
                this.app.calculador.desactivarModo(true);
            } else {
                this.seleccionar(id);
            }
        });

        document.getElementById('ctx-copiar-monto').addEventListener('click', () => {
            this.copiarMonto();
            this.cerrar();
        });

        document.getElementById('ctx-pagar-factura').addEventListener('click', () => {
            this.pagarFactura();
            this.cerrar();
        });
    }

    abrir(e, servicioId) {
        e.preventDefault();
        if (this.app._lpFired) { this.app._lpFired = false; return; }
        this.app._ctxServicioId = servicioId;

        const estaSeleccionado = this.app.serviciosSeleccionados.has(servicioId);

        const btnSeleccionar = document.getElementById('ctx-seleccionar');
        btnSeleccionar.childNodes[btnSeleccionar.childNodes.length - 1].textContent =
            this.app.modoCalculadora ? ' Cancelar selección' : ' Seleccionar';

        const btnCopiar = document.getElementById('ctx-copiar-monto');
        btnCopiar.childNodes[btnCopiar.childNodes.length - 1].textContent =
            (estaSeleccionado && this.app.serviciosSeleccionados.size > 1) ? ' Copiar total' : ' Copiar monto';

        const btnPagar = document.getElementById('ctx-pagar-factura');
        const btnPagarText = btnPagar.childNodes[btnPagar.childNodes.length - 1];
        if (estaSeleccionado && this.app.serviciosSeleccionados.size > 1) {
            const hayPagables = [...this.app.serviciosSeleccionados].some(id => {
                const f = this.app.obtenerUltimaFactura(id);
                return f && !f.pagada && !f.conCredito;
            });
            btnPagar.disabled = !hayPagables;
            btnPagarText.textContent = ` Pagar ${this.app.serviciosSeleccionados.size} seleccionados`;
        } else {
            const factura = this.app.obtenerUltimaFactura(servicioId);
            btnPagar.disabled = !factura || factura.pagada || !!factura.conCredito;
            btnPagarText.textContent = ' Pagar factura del mes';
        }

        const menu = document.getElementById('ctx-menu-servicio');
        const margen = 8;
        let x = e.clientX, y = e.clientY;

        menu.style.setProperty('--ctx-x', '0px');
        menu.style.setProperty('--ctx-y', '0px');
        menu.classList.add('active');

        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        if (x + mw + margen > window.innerWidth) x = window.innerWidth - mw - margen;
        if (y + mh + margen > window.innerHeight) y = window.innerHeight - mh - margen;

        menu.style.setProperty('--ctx-x', `${x}px`);
        menu.style.setProperty('--ctx-y', `${y}px`);

        BackNav.abrir('ctx-menu-servicio', () => this.cerrar());
    }

    cerrar() {
        const menu = document.getElementById('ctx-menu-servicio');
        const estabaAbierto = menu.classList.contains('active');
        menu.classList.remove('active');
        this.app._ctxServicioId = null;
        if (estabaAbierto) BackNav.cerrar('ctx-menu-servicio');
    }

    seleccionar(servicioId) {
        if (!this.app.modoCalculadora) {
            this.app.calculador.activarModo(true);
            this.app.serviciosSeleccionados.add(servicioId);
            this.app.calculador.actualizar();
            this.app.renderServicios();
            return;
        }
        if (this.app.serviciosSeleccionados.has(servicioId)) {
            this.app.serviciosSeleccionados.delete(servicioId);
            if (this.app.serviciosSeleccionados.size === 0) {
                this.app.calculador.desactivarModo(true);
                return;
            }
        } else {
            this.app.serviciosSeleccionados.add(servicioId);
        }
        this.app.calculador.actualizar();
        this.app.renderServicios();
    }

    copiarMonto() {
        const estaSeleccionado = this.app.serviciosSeleccionados.has(this.app._ctxServicioId);
        const ids = (estaSeleccionado && this.app.serviciosSeleccionados.size > 1)
            ? [...this.app.serviciosSeleccionados]
            : [this.app._ctxServicioId];

        let totalARS = 0, totalUSD = 0;
        ids.forEach(id => {
            const f = this.app.obtenerUltimaFactura(id);
            if (!f) return;
            if ((f.moneda || 'ars') === 'usd') totalUSD += f.monto;
            else totalARS += f.monto;
        });

        const partes = [];
        if (totalARS > 0) partes.push(this.app.utils.formatearMoneda(totalARS, 'ars'));
        if (totalUSD > 0) partes.push(this.app.utils.formatearMoneda(totalUSD, 'usd'));
        if (partes.length === 0) { this.app.ui.mostrarToast('Sin factura del mes', 'info'); return; }

        const texto = partes.join(' + ');
        navigator.clipboard?.writeText(texto)
            .then(() => this.app.ui.mostrarToast(`Copiado: ${texto}`, 'success'))
            .catch(() => this.app.ui.mostrarToast('No se pudo copiar', 'error'));
    }

    pagarFactura() {
        const estaSeleccionado = this.app.serviciosSeleccionados.has(this.app._ctxServicioId);
        const ids = (estaSeleccionado && this.app.serviciosSeleccionados.size > 1)
            ? [...this.app.serviciosSeleccionados]
            : [this.app._ctxServicioId];

        const hoy = this.app.utils.obtenerFechaLocal();
        let pagadas = 0;

        ids.forEach(id => {
            const servicio = this.app.servicios.find(s => s.id === id);
            const factura = this.app.obtenerUltimaFactura(id);
            if (!servicio || !factura || factura.pagada || factura.conCredito) return;
            const idx = servicio.facturas.findIndex(f => f.id === factura.id);
            if (idx === -1) return;
            servicio.facturas[idx] = { ...servicio.facturas[idx], pagada: true, fechaPago: hoy };
            pagadas++;
        });

        if (pagadas === 0) return;
        this.app.utils.postGuardado();
        if (estaSeleccionado && this.app.serviciosSeleccionados.size > 1) {
            this.app.calculador.desactivarModo(true);
        }
        this.app.ui.mostrarToast(pagadas === 1 ? 'Factura pagada ✓' : `${pagadas} facturas pagadas ✓`, 'success');
    }
}

// ============================================================
// CATEGORIA SERVICE — CRUD de categorías de servicios
// ============================================================
class CategoriaService {
    constructor(app) {
        this.app = app;
    }

    // ── Persistencia ──────────────────────────────────────────
    getCategorias() {
        return JSON.parse(localStorage.getItem('categorias-servicios') || '[]');
    }

    saveCategorias(cats) {
        localStorage.setItem('categorias-servicios', JSON.stringify(cats));
    }

    // ── Selects ───────────────────────────────────────────────
    poblarSelect(selectId, valorSeleccionado = '') {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const cats = this.getCategorias();
        sel.innerHTML = `<option value="">Sin categoría</option>`;
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (c === valorSeleccionado) opt.selected = true;
            sel.appendChild(opt);
        });
        // Refrescar CustomSelect si existe
        const csdWrapper = document.getElementById(selectId + '-csd');
        if (csdWrapper?._customSelect) csdWrapper._customSelect.refresh();
    }

    // ── Modal ─────────────────────────────────────────────────
    abrirModal(targetSelectId) {
        this.app._categoriaTargetSelect = targetSelectId;
        this.app._modalServicioOrigen = document.querySelector('.modal.active')?.id || null;
        if (this.app._modalServicioOrigen) this.app.cerrarModal(this.app._modalServicioOrigen);
        document.getElementById('nueva-categoria-nombre').value = '';
        this.renderLista();
        this.app.abrirModal('modal-nueva-categoria');
    }

    cerrarModal() {
        this.app.cerrarModal('modal-nueva-categoria');
        if (this.app._modalServicioOrigen) {
            this.app.abrirModal(this.app._modalServicioOrigen);
            this.app._modalServicioOrigen = null;
        }
    }

    // ── Render lista ──────────────────────────────────────────
    renderLista() {
        const lista = document.getElementById('categorias-lista');
        if (!lista) return;
        const cats = this.getCategorias();
        if (cats.length === 0) {
            lista.innerHTML = `<span class="sin-categorias-text">Sin categorías definidas</span>`;
            return;
        }
        lista.innerHTML = cats.map(c => `
            <span class="categoria-tag">
                <button class="categoria-tag-del" data-action="eliminar-categoria" data-cat="${this.app.escaparAtributoHTML(c)}" title="Eliminar">
                    <svg class="icon"><use href="#icon-cancel" /></svg>
                </button>
                ${this.app.escaparHTML(c)}
            </span>`).join('');
    }

    // ── CRUD ──────────────────────────────────────────────────
    eliminar(nombre) {
        const cats = this.getCategorias().filter(c => c !== nombre);
        this.saveCategorias(cats);
        this.app.servicios.forEach(s => { if (s.categoria === nombre) s.categoria = ''; });
        this.app.guardarDatos();
        this.app.guardarEstado();
        this.poblarSelect('servicio-categoria');
        this.poblarSelect('editar-servicio-categoria');
        this.renderLista();
        this.app.renderServicios();
        this.app.mostrarToast('Categoría eliminada', 'success');
    }

    guardarNueva() {
        const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
        if (!nombre) { this.app.mostrarToast('El nombre es requerido', 'error'); return; }
        const cats = this.getCategorias();
        if (cats.some(c => c.toLowerCase() === nombre.toLowerCase())) {
            this.app.mostrarToast('Esa categoría ya existe', 'error'); return;
        }
        cats.push(nombre);
        cats.sort((a, b) => a.localeCompare(b));
        this.saveCategorias(cats);
        document.getElementById('nueva-categoria-nombre').value = '';
        this.poblarSelect('servicio-categoria',
            this.app._categoriaTargetSelect === 'servicio-categoria' ? nombre : '');
        this.poblarSelect('editar-servicio-categoria',
            this.app._categoriaTargetSelect === 'editar-servicio-categoria' ? nombre : '');
        const sel = document.getElementById(this.app._categoriaTargetSelect);
        if (sel) {
            sel.value = nombre;
            // Refrescar el CSD del selector target (refleja la selección nueva)
            const csdTarget = document.getElementById(this.app._categoriaTargetSelect + '-csd');
            if (csdTarget?._customSelect) csdTarget._customSelect.refresh();
        }
        this.app.guardarEstado();
        this.renderLista();
        this.app.mostrarToast('Categoría agregada', 'success');
    }
}

// ============================================================
// ESTADISTICAS SERVICE — resumen, estadísticas, calculador
// ============================================================
class EstadisticasService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters ───────────────────────────────────────────────
    get servicios() { return this.app.servicios; }

    // ── Resumen mensual ───────────────────────────────────────
    actualizarResumenMes() {
        const { mes: mesActual, anio: añoActual } = this.app.utils.mesActualInfo();
        let totalAPagarARS = 0, totalAPagarUSD = 0;
        let totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalPagadoDelMesActualARS = 0, totalPagadoDelMesActualUSD = 0;
        let totalFacturasMesActualARS = 0, totalFacturasMesActualUSD = 0;
        let cantidadPagadasVencenEsteMes = 0, cantidadPendientesEsteMes = 0;

        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const fechaFactura = this.app.utils.parseDate(factura.fecha);
                const esDelMesActual = fechaFactura.getMonth() === mesActual && fechaFactura.getFullYear() === añoActual;
                const moneda = factura.moneda || 'ars';
                const excluir = factura.conCredito === true;
                if (esDelMesActual) {
                    if (factura.monto < 0) return;
                    const pagadaEsteMes = factura.pagada && factura.fechaPago && (() => {
                        const fp = this.app.utils.parseDate(factura.fechaPago);
                        return fp.getMonth() === mesActual && fp.getFullYear() === añoActual;
                    })();
                    const contarEnTotal = !factura.pagada || pagadaEsteMes;
                    if (factura.pagada) cantidadPagadasVencenEsteMes++;
                    if (!factura.pagada) cantidadPendientesEsteMes++;
                    if (moneda === 'usd') {
                        if (!excluir && contarEnTotal) totalFacturasMesActualUSD += factura.monto;
                        if (!factura.pagada && !excluir) totalAPagarUSD += factura.monto;
                        else if (pagadaEsteMes && !excluir) totalPagadoDelMesActualUSD += factura.monto;
                    } else {
                        if (!excluir && contarEnTotal) totalFacturasMesActualARS += factura.monto;
                        if (!factura.pagada && !excluir) totalAPagarARS += factura.monto;
                        else if (pagadaEsteMes && !excluir) totalPagadoDelMesActualARS += factura.monto;
                    }
                }
                if (factura.pagada && factura.fechaPago && factura.monto > 0 && !excluir) {
                    const fechaPago = this.app.utils.parseDate(factura.fechaPago);
                    if (fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === añoActual) {
                        if (moneda === 'usd') totalPagadoMesUSD += factura.monto;
                        else totalPagadoMesARS += factura.monto;
                    }
                }
            });
        });

        this.app.datosResumen = {
            pendienteARS: totalAPagarARS, pendienteUSD: totalAPagarUSD,
            pagadoMesARS: totalPagadoMesARS, pagadoMesUSD: totalPagadoMesUSD,
            pagadoDelMesActualARS: totalPagadoDelMesActualARS, pagadoDelMesActualUSD: totalPagadoDelMesActualUSD,
            totalPeriodoARS: totalFacturasMesActualARS, totalPeriodoUSD: totalFacturasMesActualUSD,
            cantidadPagadasVencenEsteMes, cantidadPendientesEsteMes,
            pendiente: totalAPagarARS + totalAPagarUSD,
            pagadoMes: totalPagadoMesARS,
            pagadoDelMesActual: totalPagadoDelMesActualARS,
            totalPeriodo: totalFacturasMesActualARS
        };

        this.app.mostrandoPagadoMes = localStorage.getItem('resumen-mostrar-pagado') === 'true';
        if (this.app.mostrandoPagadoMes) this.mostrarPagadoEnResumen();
        else this.mostrarPendienteEnResumen();
        this.actualizarEstadisticas();
    }

    obtenerColorBordeMasPrioritario() {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const { mes: mesActual, anio: añoActual } = this.app.utils.mesActualInfo();
        let prioridad = 5, colorBorde = '';
        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const f = this.app.utils.parseDate(factura.fecha);
                if (f.getMonth() !== mesActual || f.getFullYear() !== añoActual) return;
                if (!factura.pagada) {
                    const venc = this.app.utils.parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
                    const dias = Math.ceil((venc - hoy) / 86400000);
                    if (dias < 0 && prioridad > 1) { prioridad = 1; colorBorde = 'borde-vencido'; }
                    else if (dias <= 2 && prioridad > 1) { prioridad = 1; colorBorde = 'borde-urgente'; }
                    else if (dias <= 5 && prioridad > 2) { prioridad = 2; colorBorde = 'borde-proximo'; }
                    else if (prioridad > 3) { prioridad = 3; colorBorde = 'borde-lejano'; }
                }
            });
        });
        return colorBorde || 'borde-pagado';
    }

    // ── Helpers resumen ───────────────────────────────────────
    _actualizarBordeResumen(colorBorde) {
        const card = document.getElementById('resumen-mes')?.closest('.card');
        if (card) {
            card.classList.remove('borde-vencido', 'borde-urgente', 'borde-proximo', 'borde-lejano', 'borde-pagado');
            if (colorBorde) card.classList.add(colorBorde);
        }
    }

    _buildValorResumen(montoARS, montoUSD, textoVacio) {
        const hayARS = montoARS > 0, hayUSD = montoUSD > 0;
        if (!hayARS && !hayUSD) return { valorMostrar: `<span class="resumen-valor-vacio">${textoVacio}</span>`, hayARS, hayUSD };
        let valorMostrar;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        if (hayARS && hayUSD) {
            valorMostrar = `<div class="resumen-valor">${fmt(montoARS, 'ars')}</div><div class="resumen-valor-usd">${fmt(montoUSD, 'usd')}</div>`;
        } else {
            valorMostrar = hayUSD ? fmt(montoUSD, 'usd') : fmt(montoARS, 'ars');
        }
        return { valorMostrar, hayARS, hayUSD };
    }

    mostrarPendienteEnResumen() { this.app.mostrandoPagadoMes = false; this._renderResumen('pendiente'); }
    mostrarPagadoEnResumen() { this.app.mostrandoPagadoMes = true; this._renderResumen('pagado'); }

    _renderResumen(tipo) {
        const esPendiente = tipo === 'pendiente';
        const fechaFormateada = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const colorBorde = this.obtenerColorBordeMasPrioritario();
        const totalARS = this.app.datosResumen.totalPeriodoARS || 0;
        let montoARS, montoUSD, porcentajePagado, contador, textoVacio, icono, titulo, label;
        if (esPendiente) {
            montoARS = this.app.datosResumen.pendienteARS || 0;
            montoUSD = this.app.datosResumen.pendienteUSD || 0;
            const pagadoDelMesARS = this.app.datosResumen.pagadoMesARS || 0;
            porcentajePagado = totalARS > 0 ? Math.min((pagadoDelMesARS / totalARS) * 100, 100) : (montoUSD === 0 ? 100 : 0);
            contador = this.app.datosResumen.cantidadPendientesEsteMes || 0;
            textoVacio = 'Al día'; icono = '#icon-deuda'; titulo = 'Resumen de Deuda';
            label = `Pendiente${contador > 0 ? ` (${contador})` : ''}`;
        } else {
            montoARS = this.app.datosResumen.pagadoMesARS || 0;
            montoUSD = this.app.datosResumen.pagadoMesUSD || 0;
            porcentajePagado = totalARS > 0 ? Math.min((montoARS / totalARS) * 100, 100) : 0;
            contador = this.app.datosResumen.cantidadPagadasVencenEsteMes || 0;
            textoVacio = 'Sin pagos'; icono = '#icon-pagado'; titulo = 'Resumen de Pagos';
            label = `Pagado${contador > 0 ? ` (${contador})` : ''}`;
        }
        const estadoActual = { tipo, montoARS, montoUSD, porcentajePagado, colorBorde, fecha: fechaFormateada };
        const debeAnimar = this.app.utils.objetosCambiaron(this.app.ultimoEstadoResumen, estadoActual);
        const { valorMostrar, hayARS, hayUSD } = this._buildValorResumen(montoARS, montoUSD, textoVacio);
        const resumenHTML = `
<div class="resumen-monto" id="resumen-toggle">
    <div class="d-flex justify-content-between align-items-center">
        <div class="resumen-titulo"><svg class="icon"><use href="${icono}" /></svg> ${titulo}</div>
        <button class="icon-btn transparent btn-sm" id="btn-info-resumen">
            <svg viewBox="0 0 24 24" class="icon-md" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>
        </button>
    </div>
    ${(hayARS && hayUSD) ? valorMostrar : `<div class="resumen-valor">${valorMostrar}</div>`}
    <div class="resumen-footer">
        <div class="resumen-progreso"><div class="resumen-progreso-barra" id="resumen-progreso-barra"></div></div>
        <div class="resumen-label">${label}</div>
        <div class="resumen-fecha">${fechaFormateada}</div>
    </div>
</div>`;
        document.getElementById('resumen-mes').innerHTML = resumenHTML;
        const barra = document.getElementById('resumen-progreso-barra');
        if (barra) barra.style.setProperty('--barra-w', `${porcentajePagado}%`);
        localStorage.setItem('resumen-mostrar-pagado', esPendiente ? 'false' : 'true');
        if (this.app.blurHabilitado && !this.app.resumenDesblurado && (hayARS || hayUSD)) {
            const elBlur = document.getElementById('resumen-toggle');
            if (elBlur) elBlur.classList.add('resumen-blur');
        }
        this.app.ultimoEstadoResumen = estadoActual;
        this._actualizarBordeResumen(colorBorde);
        if (debeAnimar) {
            const toggle = document.getElementById('resumen-toggle');
            if (toggle) { toggle.classList.remove('anim-slide-down-fade', 'anim-slide-up-fade'); requestAnimationFrame(() => toggle.classList.add('anim-slide-down-fade')); }
        }
    }

    abrirModalInfoResumen() {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
        const vencenEsteMes = [], pagadasOtroMes = [];
        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                if (factura.monto < 0) return;
                const fechaVenc = this.app.utils.parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesActual && fechaVenc.getFullYear() === anioActual;
                const pagadaEsteMes = factura.pagada && factura.fechaPago && (() => {
                    const fp = this.app.utils.parseDate(factura.fechaPago);
                    return fp.getMonth() === mesActual && fp.getFullYear() === anioActual;
                })();
                if (venceEsteMes) {
                    let estado, badgeClass;
                    if (factura.conCredito) { estado = 'Con crédito'; badgeClass = 'badge-pagada-credito'; }
                    else if (factura.pagada && pagadaEsteMes) { estado = 'Pagada este mes'; badgeClass = 'badge-pagada-mes'; }
                    else if (factura.pagada && !pagadaEsteMes) { const mp = this.app.utils.parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' }); estado = `Pagada en ${mp}`; badgeClass = 'badge-pagada-antes'; }
                    else if (!factura.pagada && fechaVenc < hoy) { estado = 'Vencida'; badgeClass = 'badge-vencida'; }
                    else { estado = 'Pendiente'; badgeClass = 'badge-pendiente'; }
                    vencenEsteMes.push({ servicio: servicio.nombre, factura, estado, badgeClass });
                } else if (pagadaEsteMes) {
                    pagadasOtroMes.push({ servicio: servicio.nombre, factura, mesVenc: fechaVenc.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) });
                }
            });
        });
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const renderFila = ({ servicio, factura, estado, badgeClass }) => `
            <div class="info-resumen-fila">
                <div class="info-resumen-fila-izq"><span class="info-resumen-nombre">${servicio}</span><span class="info-resumen-badge ${badgeClass}">${estado}</span></div>
                <span class="info-resumen-monto">${fmt(factura.monto, factura.moneda || 'ars')}</span>
            </div>`;
        const renderFilaOtroMes = ({ servicio, factura, mesVenc }) => `
            <div class="info-resumen-fila">
                <div class="info-resumen-fila-izq"><span class="info-resumen-nombre">${servicio}</span><span class="info-resumen-badge badge-pagada-otro-mes">Venció ${mesVenc}</span></div>
                <span class="info-resumen-monto">${fmt(factura.monto, factura.moneda || 'ars')}</span>
            </div>`;
        let html = '';
        if (vencenEsteMes.length > 0) html += `<div class="info-resumen-grupo"><div class="info-resumen-grupo-titulo">Vencen este mes</div>${vencenEsteMes.map(renderFila).join('')}</div>`;
        if (pagadasOtroMes.length > 0) html += `<div class="info-resumen-grupo"><div class="info-resumen-grupo-titulo">Pagadas este mes (otro vencimiento)</div>${pagadasOtroMes.map(renderFilaOtroMes).join('')}</div>`;
        if (!html) html = '<div class="text-center-muted">Sin movimientos este mes</div>';
        document.getElementById('modal-info-resumen-body').innerHTML = html;
        this.app.abrirModal('modal-info-resumen');
    }

    toggleResumen() {
        const resumenActual = document.getElementById('resumen-toggle');
        const estaBlureado = resumenActual?.classList.contains('resumen-blur');
        if (!this.app.resumenDesblurado && estaBlureado) {
            this.app.resumenDesblurado = true;
            resumenActual.classList.remove('resumen-blur');
            return;
        }
        if (!this.app.resumenDesblurado) this.app.resumenDesblurado = true;
        if (resumenActual) {
            resumenActual.classList.remove('anim-slide-up-fade', 'anim-slide-down-fade');
            void resumenActual.offsetWidth;
            resumenActual.classList.add('anim-slide-up-fade');
            setTimeout(() => {
                if (this.app.mostrandoPagadoMes) this.mostrarPendienteEnResumen();
                else this.mostrarPagadoEnResumen();
                document.getElementById('resumen-toggle')?.classList.remove('resumen-blur');
            }, 190);
        } else {
            if (this.app.mostrandoPagadoMes) this.mostrarPendienteEnResumen();
            else this.mostrarPagadoEnResumen();
            document.getElementById('resumen-toggle')?.classList.remove('resumen-blur');
        }
    }

    // ── Estadísticas mensuales ────────────────────────────────
    actualizarEstadisticas() {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth(), añoActual = hoy.getFullYear();
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        const yaExisteSelector = !!selectMes;
        if (selectMes?.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año); mesSeleccionado = parseInt(mes) - 1;
        } else { mesSeleccionado = mesActual; añoSeleccionado = añoActual; }

        const categoriaActiva = this.app._estadisticaCategoriaActiva || null;
        let cantidadPendientes = 0, cantidadPagadas = 0, cantidadVencidas = 0, cantidadFacturasMes = 0;
        let totalMesARS = 0, totalMesUSD = 0, totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalIngresosARS = 0, totalIngresosUSD = 0;

        this.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.app.SERVICIO_INGRESOS_ID) {
                if ((servicio.categoria || '') !== categoriaActiva) return;
            }
            servicio.facturas.forEach(factura => {
                const fechaFactura = this.app.utils.parseDate(factura.fecha);
                const mesFactura = fechaFactura.getMonth(), añoFactura = fechaFactura.getFullYear();
                if (mesFactura === mesSeleccionado && añoFactura === añoSeleccionado) {
                    const moneda = factura.moneda || 'ars';
                    if (servicio.id === this.app.SERVICIO_INGRESOS_ID) {
                        if (moneda === 'usd') totalIngresosUSD += factura.monto;
                        else totalIngresosARS += factura.monto;
                        return;
                    }
                    if (factura.monto < 0) { cantidadPagadas++; return; }
                    cantidadFacturasMes++;
                    if (!factura.conCredito || categoriaActiva) {
                        if (moneda === 'usd') totalMesUSD += factura.monto;
                        else totalMesARS += factura.monto;
                    }
                    if (!factura.pagada) {
                        const venc = this.app.utils.parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
                        if (venc < hoy) cantidadVencidas++; else cantidadPendientes++;
                    }
                }
                if (factura.pagada && factura.fechaPago && factura.monto > 0 && servicio.id !== this.app.SERVICIO_INGRESOS_ID) {
                    const fechaPago = this.app.utils.parseDate(factura.fechaPago);
                    if (fechaPago.getMonth() === mesSeleccionado && fechaPago.getFullYear() === añoSeleccionado) {
                        cantidadPagadas++;
                        if (!factura.conCredito || categoriaActiva) {
                            const moneda = factura.moneda || 'ars';
                            if (moneda === 'usd') totalPagadoMesUSD += factura.monto;
                            else totalPagadoMesARS += factura.monto;
                        }
                    }
                }
            });
        });

        const estadoActual = { totalMesARS, totalMesUSD, totalPagadoMesARS, totalPagadoMesUSD, cantidadPendientes, cantidadPagadas, cantidadVencidas, cantidadFacturasMes, totalIngresosARS, totalIngresosUSD, mesSeleccionado, añoSeleccionado, categoriaActiva };
        const estadoCambio = this.app.utils.objetosCambiaron(this.app.ultimoEstadoEstadisticas, estadoActual);
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);

        const renderizarContenido = () => {
            const hayUSDMes = totalMesUSD > 0, hayARSMes = totalMesARS > 0;
            const montoHTML = hayARSMes ? fmt(totalMesARS, 'ars') : hayUSDMes ? fmt(totalMesUSD, 'usd') : fmt(0, 'ars');
            const montoUSDItem = hayUSDMes ? `<div class="calculador-resultado-item"><span class="estadistica-label">Monto USD</span><span class="estadistica-valor">${fmt(totalMesUSD, 'usd')}</span></div>` : '';
            let ingresosHTML = '';
            if (this.app.ui.ingresosHabilitado()) {
                const hayIngUSD = totalIngresosUSD > 0, hayIngARS = totalIngresosARS > 0;
                const ingMontoHTML = hayIngARS ? fmt(totalIngresosARS, 'ars') : hayIngUSD ? fmt(totalIngresosUSD, 'usd') : fmt(0, 'ars');
                const ingUSDItem = hayIngUSD ? `<div class="calculador-resultado-item"><span class="estadistica-label">Ingresos USD</span><span class="estadistica-valor">${fmt(totalIngresosUSD, 'usd')}</span></div>` : '';
                let porcentajeIngresosHTML = '';
                if (hayIngARS && totalMesARS > 0) {
                    const pct = (totalMesARS / totalIngresosARS) * 100;
                    const colorClass = pct < 25 ? 'text-green' : pct < 50 ? 'text-blue' : pct < 75 ? 'text-gold' : 'text-red';
                    porcentajeIngresosHTML = `<div class="calculador-resultado-item"><span class="estadistica-label">% del ingreso</span><span class="estadistica-valor ${colorClass}">${pct.toFixed(1)}%</span></div>`;
                }
                ingresosHTML = `<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="ingresos"><span class="estadistica-label">Ingresos</span><span class="estadistica-valor">${ingMontoHTML}</span></div>${ingUSDItem}${porcentajeIngresosHTML}`;
            }
            const itemsHTML = `
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas"><span class="estadistica-label">Monto en facturas</span><span class="estadistica-valor">${montoHTML}</span></div>
        ${montoUSDItem}
        ${totalPagadoMesARS > 0 ? `<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto"><span class="estadistica-label">Monto pagado</span><span class="estadistica-valor">${fmt(totalPagadoMesARS, 'ars')}</span></div>` : ''}
        ${totalPagadoMesUSD > 0 ? `<div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto"><span class="estadistica-label">Monto USD (Pagado)</span><span class="estadistica-valor">${fmt(totalPagadoMesUSD, 'usd')}</span></div>` : ''}
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas"><span class="estadistica-label">Facturas</span><span class="estadistica-valor">${cantidadFacturasMes}</span></div>
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pendientes"><span class="estadistica-label">Pendientes</span><span class="estadistica-valor">${cantidadPendientes}</span></div>
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagadas"><span class="estadistica-label">Pagadas</span><span class="estadistica-valor">${cantidadPagadas}</span></div>
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="vencidas"><span class="estadistica-label">Vencidas</span><span class="estadistica-valor">${cantidadVencidas}</span></div>
        ${ingresosHTML}`;
            const lista = document.querySelector('#estadisticas-mensual-container .estadisticas-lista');
            if (lista) {
                lista.innerHTML = itemsHTML;
                if (estadoCambio) { lista.classList.remove('anim-slide-down-fade', 'anim-slide-up-fade'); requestAnimationFrame(() => lista.classList.add('anim-slide-down-fade')); }
            }
        };

        const hayDatos = this.servicios.length > 0 && this.servicios.some(s => s.facturas?.length > 0);
        if (!yaExisteSelector || !hayDatos) {
            document.getElementById('estadisticas-mensual-container').innerHTML = `
    <div class="calculador-campo"><label class="calculador-label">Mes</label>
    <div class="custom-select-wrapper" id="select-mes-estadisticas-csd"><div class="custom-select-trigger"><span class="csd-label"></span><svg class="csd-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div><div class="custom-select-dropdown"></div></div>
    <select id="select-mes-estadisticas" class="select-mes-oculto"></select></div>
    <div id="estadisticas-categorias-tags"></div><div class="estadisticas-lista"></div>`;
            const select = document.getElementById('select-mes-estadisticas');
            select.innerHTML = this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado);
            const wrapper = document.getElementById('select-mes-estadisticas-csd');
            const cs = new CustomSelect(wrapper, select, () => this.actualizarEstadisticas());
            wrapper._customSelect = cs;
            this._renderTagsCategoriaEstadisticas();
            renderizarContenido();
            this.app.ultimoEstadoEstadisticas = estadoActual;
        } else {
            const selectActual = document.getElementById('select-mes-estadisticas');
            if (selectActual) {
                const valorActual = selectActual.value;
                selectActual.innerHTML = this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado);
                if (Array.from(selectActual.options).some(opt => opt.value === valorActual)) selectActual.value = valorActual;
                const csd = document.getElementById('select-mes-estadisticas-csd');
                if (csd?._customSelect) csd._customSelect.refresh();
            }
            this._renderTagsCategoriaEstadisticas();
            const lista = document.querySelector('#estadisticas-mensual-container .estadisticas-lista');
            if (lista && estadoCambio) {
                lista.classList.remove('anim-slide-up-fade', 'anim-slide-down-fade');
                void lista.offsetWidth;
                lista.classList.add('anim-slide-up-fade');
                setTimeout(() => { renderizarContenido(); this.app.ultimoEstadoEstadisticas = estadoActual; }, 190);
            } else if (lista) { renderizarContenido(); }
        }
    }

    _renderTagsCategoriaEstadisticas() {
        const container = document.getElementById('estadisticas-categorias-tags');
        if (!container) return;
        const cats = this.app.categoria.getCategorias();
        const catsUsadas = cats.filter(c => this.servicios.some(s => s.id !== this.app.SERVICIO_INGRESOS_ID && s.categoria === c));
        if (catsUsadas.length === 0) { container.innerHTML = ''; return; }
        const activa = this.app._estadisticaCategoriaActiva || null;
        const tagsHTML = catsUsadas.map(c => `<button class="est-cat-tag${c === activa ? ' est-cat-tag--activa' : ''}" data-cat="${this.app.utils.escaparAtributoHTML(c)}">${this.app.utils.escaparHTML(c)}</button>`).join('');
        container.innerHTML = `<div class="est-cat-tags-row">${tagsHTML}</div>`;
        container.querySelectorAll('.est-cat-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                this.app._estadisticaCategoriaActiva = this.app._estadisticaCategoriaActiva === cat ? null : cat;
                this.app.ultimoEstadoEstadisticas = null;
                this.actualizarEstadisticas();
            });
        });
    }

    toggleEstadisticas() {
        const content = document.getElementById('estadisticas-content');
        const chevron = document.getElementById('estadisticas-chevron');
        content.classList.toggle('collapsed');
        chevron.classList.toggle('collapsed');
        const estaColapsado = content.classList.contains('collapsed');
        localStorage.setItem('estadisticas-collapsed', estaColapsado);
        if (!estaColapsado) {
            document.getElementById('estadisticas-tipo').value = this.app.tipoEstadisticaActual;
            const csdEstTipo = document.getElementById('estadisticas-tipo-csd');
            if (csdEstTipo?._customSelect) csdEstTipo._customSelect.refresh();
            this.cambiarTipoEstadistica();
        }
    }

    cambiarTipoEstadistica() {
        const mensualContainer = document.getElementById('estadisticas-mensual-container');
        const individualContainer = document.getElementById('estadisticas-individual-container');
        if (this.app.tipoEstadisticaActual === 'mensual') {
            mensualContainer.classList.add('visible'); mensualContainer.classList.remove('hidden');
            individualContainer.classList.add('hidden'); individualContainer.classList.remove('visible');
            this.actualizarEstadisticas();
        } else {
            mensualContainer.classList.add('hidden'); mensualContainer.classList.remove('visible');
            individualContainer.classList.add('visible'); individualContainer.classList.remove('hidden');
            this.app.calcularPeriodo();
        }
    }

    // ── Select servicios (calculador) ─────────────────────────
    actualizarSelectServicios() {
        const select = document.getElementById('calculador-servicio');
        if (!select) return;
        const valorActual = select.value;
        const serviciosActivos = this.servicios
            .filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
        let html = '<option value="">Seleccionar servicio...</option>';
        serviciosActivos.forEach(s => {
            html += `<option value="${this.app.utils.escaparAtributoHTML(s.id)}" ${s.id === valorActual ? 'selected' : ''}>${this.app.utils.escaparHTML(s.nombre)}</option>`;
        });
        if (this.app.ui.ingresosHabilitado() && this.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID)) {
            html += `<option value="${this.app.SERVICIO_INGRESOS_ID}" ${this.app.SERVICIO_INGRESOS_ID === valorActual ? 'selected' : ''}>Ingresos</option>`;
        }
        select.innerHTML = html;
        const csd = document.getElementById('calculador-servicio-csd');
        if (csd?._customSelect) csd._customSelect.refresh();
        if (valorActual && !this.servicios.find(s => s.id === valorActual)) {
            select.value = ''; this.app.calcularPeriodo();
        } else if (valorActual) { this.app.calcularPeriodo(); }
    }

    inicializarCalculador() {
        const selectServicio = document.getElementById('calculador-servicio');
        if (!selectServicio) return;
        this.actualizarSelectServicios();
        const csdWrapper = document.getElementById('calculador-servicio-csd');
        if (csdWrapper && !csdWrapper._customSelect) {
            csdWrapper._customSelect = new CustomSelect(csdWrapper, selectServicio, () => this.app.calcularPeriodo());
        }
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        selectServicio.addEventListener('change', () => this.app.calcularPeriodo());
        inputDesde.addEventListener('change', () => this.app.calcularPeriodo());
        inputHasta.addEventListener('change', () => this.app.calcularPeriodo());
        document.getElementById('btn-calculador-desde-hoy').addEventListener('click', () => {
            inputDesde.value = inputDesde.value ? '' : this.app.utils.obtenerFechaLocal();
            this.app.calcularPeriodo();
        });
        document.getElementById('btn-calculador-hasta-hoy').addEventListener('click', () => {
            inputHasta.value = inputHasta.value ? '' : this.app.utils.obtenerFechaLocal();
            this.app.calcularPeriodo();
        });
    }

    // ── Opciones de mes ───────────────────────────────────────
    generarOpcionesMeses(mesSeleccionado, añoSeleccionado) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const mesesConFacturas = new Set();
        this.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const f = this.app.utils.parseDate(factura.fecha);
                mesesConFacturas.add(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
            });
        });
        const mesesOrdenados = Array.from(mesesConFacturas).sort((a, b) => b.localeCompare(a));
        if (mesesOrdenados.length === 0) {
            const clave = `${añoSeleccionado}-${String(mesSeleccionado + 1).padStart(2, '0')}`;
            return `<option value="${clave}">${meses[mesSeleccionado]} ${añoSeleccionado}</option>`;
        }
        return mesesOrdenados.map(clave => {
            const [año, mes] = clave.split('-');
            const esSeleccionado = parseInt(año) === añoSeleccionado && parseInt(mes) - 1 === mesSeleccionado;
            return `<option value="${clave}" ${esSeleccionado ? 'selected' : ''}>${meses[parseInt(mes) - 1]} ${año}</option>`;
        }).join('');
    }
}

// ============================================================
// UI MANAGER — modales, menús, tema, blur, toast, dólar
// ============================================================
class UIManager {
    constructor(app) {
        this.app = app;
    }

    // ── Tema ──────────────────────────────────────────────────
    cargarTema() {
        const tema = localStorage.getItem(this.app.THEME_KEY);
        if (tema === 'dark' || tema === null) {
            document.body.classList.add('dark-mode');
            if (tema === null) localStorage.setItem(this.app.THEME_KEY, 'dark');
        }
        this._actualizarIconoTema(document.body.classList.contains('dark-mode'));
    }

    toggleTema() {
        document.body.classList.toggle('dark-mode');
        const esDark = document.body.classList.contains('dark-mode');
        document.documentElement.classList.toggle('dark-mode', esDark);
        localStorage.setItem(this.app.THEME_KEY, esDark ? 'dark' : 'light');
        this._actualizarIconoTema(esDark);
        this.mostrarToast(`Tema ${esDark ? 'oscuro' : 'claro'} activado`, 'success');
        this.cerrarMenuAjustes();
    }

    _actualizarIconoTema(esDark) {
        const use = document.getElementById('icon-tema-use');
        if (use) use.setAttribute('href', esDark ? '#icon-sun' : '#icon-moon');
    }

    // ── Blur / privacidad ─────────────────────────────────────
    toggleBlur() {
        this.app.blurHabilitado = !this.app.blurHabilitado;
        localStorage.setItem('blur-montos', this.app.blurHabilitado.toString());
        const indicator = document.getElementById('blur-indicator');
        if (indicator) indicator.textContent = this.app.blurHabilitado ? 'SI' : 'NO';
        const el = document.getElementById('resumen-toggle');
        if (!this.app.blurHabilitado) {
            this.app.resumenDesblurado = true;
            if (el) el.classList.remove('resumen-blur');
        } else {
            this.app.resumenDesblurado = false;
            if (el) el.classList.add('resumen-blur');
        }
        this.mostrarToast(`Privacidad ${this.app.blurHabilitado ? 'habilitado' : 'deshabilitado'}`, 'success');
        this.cerrarMenuAjustes();
    }

    // ── Ingresos ──────────────────────────────────────────────
    ingresosHabilitado() {
        return localStorage.getItem(this.app.INGRESOS_KEY) === 'true';
    }

    toggleIngresos() {
        const nuevoEstado = !this.ingresosHabilitado();
        localStorage.setItem(this.app.INGRESOS_KEY, nuevoEstado.toString());
        const indicator = document.getElementById('ingresos-indicator');
        if (indicator) indicator.textContent = nuevoEstado ? 'SI' : 'NO';
        this.app.renderServicios();
        this.mostrarToast(`Registro de ingresos ${nuevoEstado ? 'habilitado' : 'deshabilitado'}`, 'success');
        this.cerrarMenuAjustes();
        this.app.estadisticas.actualizarSelectServicios();
        const selectServicio = document.getElementById('calculador-servicio');
        if (!nuevoEstado && selectServicio?.value === this.app.SERVICIO_INGRESOS_ID) {
            selectServicio.value = '';
            this.app.calcularPeriodo();
        }
    }

    // ── Modales ───────────────────────────────────────────────
    abrirModal(modalId) {
        const modal = document.getElementById(modalId);
        const yaAbierto = modal.classList.contains('active');
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        // Reusamos volverDesdeModalActivo (la misma lógica de "tocar afuera del modal")
        // para que el botón atrás resuelva igual los encadenados vía _MODAL_VOLVER_BTN.
        if (!yaAbierto) BackNav.abrir(modalId, () => this.app.volverDesdeModalActivo());
    }

    cerrarModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        if (!document.querySelector('.modal.active')) {
            document.body.classList.remove('modal-open');
        }
        if (modalId === 'modal-gist') this.app.gist.actualizarBotones();
        BackNav.cerrar(modalId);
    }

    cerrarTodosLosModales() {
        // Cerrar cualquier CSD en modo fixed que haya quedado en el body
        document.querySelectorAll('.custom-select-dropdown.csd-fixed').forEach(dd => {
            if (dd._csdInstance) dd._csdInstance.close();
            else if (dd.parentElement === document.body) dd.remove();
        });
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.body.classList.remove('modal-open');
        this.app._anoExpandidoFacturas = {};
        this.app._anoExpandidoIngresos = {};
        BackNav.cerrarTodo();
    }

    // ── Menú ajustes ──────────────────────────────────────────
    toggleMenuAjustes() {
        const menu = document.getElementById('menu-ajustes');
        if (menu.classList.contains('active')) {
            this.cerrarMenuAjustes();
            return;
        }
        menu.classList.add('active');
        document.getElementById('menu-overlay').classList.add('active');
        document.body.classList.add('modal-open');
        BackNav.abrir('menu-ajustes', () => this.cerrarMenuAjustes());
    }

    cerrarMenuAjustes() {
        const menu = document.getElementById('menu-ajustes');
        const overlay = document.getElementById('menu-overlay');
        menu.classList.remove('active');
        overlay.classList.remove('active');
        ['opciones-importacion', 'opciones-borrar', 'opciones-dolar',
            'menu-importar', 'menu-limpiar', 'menu-dolar'].forEach(id => {
                document.getElementById(id)?.classList.remove('open');
            });
        document.body.classList.remove('modal-open');
        BackNav.cerrar('menu-ajustes');
    }

    // ── Menú agregar ──────────────────────────────────────────
    toggleMenuAgregar() {
        const menu = document.getElementById('menu-agregar');
        if (menu.classList.contains('active')) {
            this.cerrarMenuAgregar();
            return;
        }
        menu.classList.add('active');
        document.getElementById('menu-agregar-overlay').classList.add('active');
        document.body.classList.add('modal-open');
        BackNav.abrir('menu-agregar', () => this.cerrarMenuAgregar());
    }

    cerrarMenuAgregar() {
        const menu = document.getElementById('menu-agregar');
        const overlay = document.getElementById('menu-agregar-overlay');
        menu.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        this._resetVistaMenuAgregar();
        BackNav.cerrar('menu-agregar');
    }

    _resetVistaMenuAgregar() {
        document.getElementById('menu-vista-principal')?.classList.remove('hidden-vista');
        const vistaCalc = document.getElementById('menu-vista-calcular');
        if (vistaCalc) {
            vistaCalc.classList.remove('visible-vista');
            vistaCalc.classList.add('hidden-vista');
        }
    }

    actualizarMenuAgregar() {
        const btnRecibo = document.getElementById('menu-agregar-recibo');
        if (btnRecibo) btnRecibo.classList.toggle('visible', this.ingresosHabilitado());
    }

    // ── Modal factura rápida ──────────────────────────────────
    abrirModalFacturaRapida() {
        if (this.app.servicios.length === 0) {
            this.mostrarToast('Primero debes crear un servicio', 'error');
            this.app.abrirModalServicio();
            return;
        }
        const primero = [...this.app.servicios]
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))[0];
        this.app.abrirModalFactura(primero.id, null, 'menu');
    }

    // ── Cotización dólar ──────────────────────────────────────
    async cargarCotizacionDolar() {
        try {
            const res = await fetch('https://dolarapi.com/v1/dolares');
            if (!res.ok) throw new Error('Error al obtener cotización');
            const data = await res.json();
            const oficial = data.find(d => d.casa === 'oficial');
            const mep = data.find(d => d.casa === 'bolsa');
            const fmt = v => v != null
                ? `$${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '-';
            const elOficial = document.getElementById('dolar-oficial');
            const elMep = document.getElementById('dolar-mep');
            const elHora = document.getElementById('dolar-hora');
            if (elOficial) elOficial.textContent = oficial ? fmt(oficial.venta) : '-';
            if (elMep) elMep.textContent = mep ? fmt(mep.venta) : '-';
            if (elHora) elHora.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch {
            const elHora = document.getElementById('dolar-hora');
            if (elHora) elHora.textContent = 'sin conexión';
        }
    }

    // ── Toast ─────────────────────────────────────────────────
    mostrarToast(mensaje, tipo = 'success') {
        const toast = document.getElementById('toast');
        if (this.app.toastTimeout) clearTimeout(this.app.toastTimeout);
        toast.classList.remove('show');
        setTimeout(() => {
            toast.textContent = mensaje;
            toast.className = `toast ${tipo}`;
            toast.classList.add('show');
            this.app.toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
                this.app.toastTimeout = null;
            }, 3000);
        }, 150);
    }
}

// ============================================================
// UTILS SERVICE — helpers puros, formateo, DOM liviano
// ============================================================
class UtilsService {
    constructor(app) {
        this.app = app;
    }

    // ── Helpers puros (sin DOM ni estado) ────────────────────

    plural(n, singular, plural) {
        return `${n} ${n !== 1 ? plural : singular}`;
    }

    mesActualInfo() {
        const ahora = new Date();
        const mes = ahora.getMonth();
        const anio = ahora.getFullYear();
        return {
            mes, anio,
            mesSiguiente: mes === 11 ? 0 : mes + 1,
            anioSiguiente: mes === 11 ? anio + 1 : anio,
            mesPasado: mes === 0 ? 11 : mes - 1,
            anioPasado: mes === 0 ? anio - 1 : anio,
        };
    }

    parseDate(str) {
        return new Date(str + 'T00:00:00');
    }

    objetosCambiaron(anterior, actual) {
        if (!anterior) return true;
        const keysA = Object.keys(anterior);
        const keysB = Object.keys(actual);
        if (keysA.length !== keysB.length) return true;
        for (const k of keysA) { if (anterior[k] !== actual[k]) return true; }
        return false;
    }

    formatearMoneda(monto, moneda = 'ars') {
        const decimales = (Number.isInteger(monto) || monto % 1 === 0) ? 0 : 2;
        if (moneda === 'usd') {
            return 'u$s ' + new Intl.NumberFormat('es-AR', {
                minimumFractionDigits: decimales, maximumFractionDigits: decimales
            }).format(monto);
        }
        return new Intl.NumberFormat('es-AR', {
            style: 'currency', currency: 'ARS',
            minimumFractionDigits: decimales, maximumFractionDigits: decimales
        }).format(monto);
    }

    formatearFecha(fecha) {
        return this.parseDate(fecha).toLocaleDateString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    }

    generarId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    obtenerFechaLocal() {
        const hoy = new Date();
        return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }

    escaparHTML(texto) {
        const div = document.createElement('div');
        div.textContent = texto;
        return div.innerHTML;
    }

    escaparAtributoHTML(texto) {
        if (!texto) return '';
        const div = document.createElement('div');
        div.setAttribute('data-attr', texto);
        return div.getAttribute('data-attr');
    }

    descargarBlob(contenido, nombreArchivo, tipo = 'text/plain;charset=utf-8') {
        const blob = new Blob([contenido], { type: tipo });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nombreArchivo;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    idsFormFactura(esEditar) {
        const p = esEditar ? 'editar-factura' : 'factura';
        return {
            monto: `${p}-monto`,
            tipo: `${p}-tipo`,
            fecha: `${p}-fecha`,
            moneda: `${p}-moneda`,
            fechaPago: `${p}-fecha-pago`,
            conCredito: `${p}-con-credito`,
            servicio: `${p}-servicio`,
            btnPagada: esEditar ? 'btn-editar-toggle-pagada' : 'btn-toggle-pagada',
            btnCredito: esEditar ? 'btn-editar-toggle-credito' : 'btn-toggle-credito',
            btnMoneda: esEditar ? 'btn-editar-factura-moneda' : 'btn-factura-moneda',
            btnNegativo: esEditar ? 'btn-editar-toggle-negativo' : 'btn-toggle-negativo',
        };
    }

    toggleSubMenuAjustes(opcionesId, padreId) {
        const subMenus = [
            ['opciones-importacion', 'menu-importar'],
            ['opciones-borrar', 'menu-limpiar'],
            ['opciones-dolar', 'menu-dolar'],
        ];
        const abriendo = !document.getElementById(opcionesId).classList.contains('open');
        subMenus.forEach(([oId, pId]) => {
            if (oId !== opcionesId) {
                document.getElementById(oId).classList.remove('open');
                document.getElementById(pId).classList.remove('open');
            }
        });
        document.getElementById(opcionesId).classList.toggle('open', abriendo);
        document.getElementById(padreId).classList.toggle('open', abriendo);
    }

    setMonedaBtn(hiddenId, btnId, moneda) {
        const hidden = document.getElementById(hiddenId);
        const btn = document.getElementById(btnId);
        if (!hidden || !btn) return;
        const m = (moneda || 'ars').toLowerCase();
        hidden.value = m;
        btn.textContent = m.toUpperCase();
        btn.classList.toggle('activo-usd', m === 'usd');
    }

    postGuardado() {
        this.app.guardarDatos();
        this.app.guardarEstado();
        this.app.renderServicios();
    }

    limpiarBusqueda() {
        const searchInput = document.getElementById('search-input');
        const searchClear = document.getElementById('search-clear');
        if (!searchInput) return;
        searchInput.value = '';
        this.app.terminoBusqueda = '';
        searchClear.classList.remove('d-flex-force');
        if (this.app._catColapsadasAntesBusqueda !== null) {
            this.app._catColapsadas = this.app._catColapsadasAntesBusqueda;
            this.app._catColapsadasAntesBusqueda = null;
        }
        this.app.renderServicios();
        setTimeout(() => { this.app.enModoBusqueda = false; }, 100);
    }

    toggleMoneda(hiddenId, btnId) {
        const hidden = document.getElementById(hiddenId);
        const btn = document.getElementById(btnId);
        if (!hidden || !btn) return;
        const nuevo = hidden.value === 'ars' ? 'usd' : 'ars';
        hidden.value = nuevo;
        btn.textContent = nuevo.toUpperCase();
        btn.classList.toggle('activo-usd', nuevo === 'usd');
        this.app.mostrarToast(nuevo === 'usd' ? 'Dolares' : 'Pesos', 'info');
    }
}

// ============================================================
// PERFIL SERVICE — gestión de perfiles de usuario
// ============================================================
class PerfilService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get perfiles() { return this.app.perfiles; }
    set perfiles(v) { this.app.perfiles = v; }
    get perfilActivo() { return this.app.perfilActivo; }
    set perfilActivo(v) { this.app.perfilActivo = v; }

    // ── Persistencia ──────────────────────────────────────────
    cargar() {
        try {
            const guardados = localStorage.getItem('gestion_servicios_perfiles');
            if (guardados) return JSON.parse(guardados);
        } catch (error) {
            console.error('Error al cargar perfiles:', error);
        }
        return { 'default': { id: 'default', nombre: 'Principal', creado: new Date().toISOString() } };
    }

    guardar() {
        try {
            localStorage.setItem('gestion_servicios_perfiles', JSON.stringify(this.perfiles));
        } catch (error) {
            console.error('Error al guardar perfiles:', error);
            this.app.ui.mostrarToast('Error al guardar perfiles', 'error');
        }
    }

    // ── Cambio de perfil activo ───────────────────────────────
    cambiar(perfilId) {
        if (perfilId === this.perfilActivo) return;
        this.app.guardarDatosPerfilActivo();
        this.perfilActivo = perfilId;
        localStorage.setItem('gestion_servicios_perfil_activo', perfilId);
        this.app.cargarDatosPerfilActivo();
        this.app._estadisticaCategoriaActiva = null;
        this.app.ultimoEstadoEstadisticas = null;
        this.app.renderServicios();
        this.app.ui.cerrarModal('modal-perfiles');
        this.app.ui.cerrarMenuAjustes();
        this.app.ui.mostrarToast(`Cambiado a perfil: ${this.perfiles[perfilId].nombre}`, 'success');
    }

    // ── UI — modal lista ──────────────────────────────────────
    abrirModal() {
        this.renderLista();
        this.app.ui.cerrarMenuAjustes();
        this.app.ui.abrirModal('modal-perfiles');
    }

    renderLista() {
        const lista = document.getElementById('perfiles-lista');
        const perfilesArray = Object.values(this.perfiles);
        const inputNuevo = document.getElementById('perfil-nuevo-nombre');
        if (inputNuevo) {
            const maxAlcanzado = perfilesArray.length >= 4;
            inputNuevo.disabled = maxAlcanzado;
            inputNuevo.placeholder = maxAlcanzado ? 'Máximo 4 perfiles' : 'Nombre del perfil...';
        }
        lista.innerHTML = perfilesArray.map(perfil => {
            const esActivo = perfil.id === this.perfilActivo;
            const esDefault = perfil.id === 'default';
            let cantidadServicios = 0;
            try {
                const datos = localStorage.getItem(`gestion_servicios_datos_${perfil.id}`);
                if (datos) cantidadServicios = JSON.parse(datos).length;
            } catch (e) { }
            return `
    <div class="perfil-item-card d-flex justify-content-between align-items-center ${esActivo ? 'activo' : ''}"
         data-action="cambiar-perfil" data-perfil-id="${perfil.id}">
        <div class="flex-1">
            <div class="perfil-header d-flex align-items-center gap-2">
                ${this.app.utils.escaparHTML(perfil.nombre)}
                ${esActivo ? '<span class="perfil-activo-badge">● Activo</span>' : ''}
            </div>
            <div class="perfil-stats">${this.app.utils.plural(cantidadServicios, 'servicio', 'servicios')}</div>
        </div>
        <div class="d-flex gap-2" data-action="stop-propagation">
            ${!esDefault ? `
                <button class="icon-btn text-danger" data-action="eliminar-perfil" data-perfil-id="${perfil.id}" title="Eliminar perfil">
                    <svg class="icon"><use href="#icon-trash" /></svg>
                </button>` : ''}
            <button class="icon-btn" data-action="editar-perfil" data-perfil-id="${perfil.id}" title="Editar perfil">
                <svg class="icon"><use href="#icon-edit" /></svg>
            </button>
        </div>
    </div>`;
        }).join('');
    }

    crearInline() {
        const input = document.getElementById('perfil-nuevo-nombre');
        const nombre = input.value.trim();
        if (!nombre) { this.app.ui.mostrarToast('Ingresá un nombre', 'error'); return; }
        if (Object.values(this.perfiles).some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
            this.app.ui.mostrarToast('Ya existe un perfil con ese nombre', 'error'); return;
        }
        if (Object.keys(this.perfiles).length >= 4) {
            this.app.ui.mostrarToast('Máximo 4 perfiles permitidos', 'error'); return;
        }
        const nuevoId = 'perfil_' + Date.now();
        this.perfiles[nuevoId] = { id: nuevoId, nombre, creado: new Date().toISOString() };
        localStorage.setItem(`gestion_servicios_datos_${nuevoId}`, JSON.stringify([]));
        input.value = '';
        this.guardar();
        this.app.ui.mostrarToast('Perfil creado', 'success');
        this.abrirModal();
    }

    // ── UI — modal editar ─────────────────────────────────────
    abrirModalEditar(perfilId) {
        this.app.perfilEditando = perfilId;
        const perfil = this.perfiles[perfilId];
        document.getElementById('titulo-editar-perfil').textContent = 'Editar Perfil';
        document.getElementById('perfil-nombre').value = perfil.nombre;
        const inputNuevo = document.getElementById('perfil-nuevo-nombre');
        if (inputNuevo) inputNuevo.value = '';
        this.app.ui.cerrarModal('modal-perfiles');
        this.app.ui.abrirModal('modal-editar-perfil');
    }

    cancelarEditar() {
        this.app.ui.cerrarModal('modal-editar-perfil');
        this.abrirModal();
    }

    guardarEdicion(e) {
        e.preventDefault();
        const nombre = document.getElementById('perfil-nombre').value.trim();
        if (!nombre) { this.app.ui.mostrarToast('El nombre es requerido', 'error'); return; }
        const nombreExiste = Object.values(this.perfiles).some(p =>
            p.nombre.toLowerCase() === nombre.toLowerCase() && p.id !== this.app.perfilEditando
        );
        if (nombreExiste) { this.app.ui.mostrarToast('Ya existe un perfil con ese nombre', 'error'); return; }
        if (this.app.perfilEditando) {
            this.perfiles[this.app.perfilEditando].nombre = nombre;
            if (this.app.perfilEditando === this.perfilActivo) this.app.renderServicios();
            this.app.ui.mostrarToast('Perfil actualizado', 'success');
        } else {
            if (Object.keys(this.perfiles).length >= 4) {
                this.app.ui.mostrarToast('Máximo 4 perfiles permitidos', 'error'); return;
            }
            const nuevoId = 'perfil_' + Date.now();
            this.perfiles[nuevoId] = { id: nuevoId, nombre, creado: new Date().toISOString() };
            localStorage.setItem(`gestion_servicios_datos_${nuevoId}`, JSON.stringify([]));
            this.app.ui.mostrarToast('Perfil creado', 'success');
        }
        this.guardar();
        this.app.ui.cerrarModal('modal-editar-perfil');
        this.abrirModal();
    }

    // ── Eliminar ──────────────────────────────────────────────
    eliminar(perfilId) {
        if (perfilId === 'default') {
            this.app.ui.mostrarToast('No puedes eliminar el perfil principal', 'error'); return;
        }
        const perfil = this.perfiles[perfilId];
        if (!confirm(`¿Eliminar el perfil "${perfil.nombre}"? Todos sus datos se perderán.`)) return;
        if (perfilId === this.perfilActivo) this.cambiar('default');
        localStorage.removeItem(`gestion_servicios_datos_${perfilId}`);
        delete this.perfiles[perfilId];
        this.guardar();
        this.app.ui.mostrarToast('Perfil eliminado', 'success');
        this.renderLista();
    }
}

// ============================================================
// CALCULADOR SERVICE — modo calculadora flotante + calculador
//                      de período + generación de reportes
// ============================================================
class CalculadorService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get servicios() { return this.app.servicios; }
    get modoActivo() { return this.app.modoCalculadora; }
    set modoActivo(v) { this.app.modoCalculadora = v; }
    get tipo() { return this.app.modoCalculadoraTipo; }
    set tipo(v) { this.app.modoCalculadoraTipo = v; }
    get seleccionados() { return this.app.serviciosSeleccionados; }

    // ── Modo calculadora flotante ─────────────────────────────
    activarModo(silencioso = false) {
        this.modoActivo = true;
        this.seleccionados.clear();
        document.getElementById('btn-agregar-servicio').classList.add('modo-calculadora');
        this.actualizar();
        this.app.renderServicios();
        if (!silencioso) {
            const flotante = document.getElementById('calculadora-flotante');
            flotante.classList.add('visible');
            flotante.onclick = () => {
                const arsVal = this.app._calcTotalARS ?? 0;
                const usdVal = this.app._calcTotalUSD ?? 0;
                const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(2);
                let texto = fmt(arsVal);
                if (usdVal > 0) texto += ` / ${fmt(usdVal)}`;
                navigator.clipboard.writeText(texto).then(() => {
                    const contador = document.getElementById('calculadora-contador');
                    const original = contador.textContent;
                    contador.textContent = '✓ Copiado';
                    setTimeout(() => { contador.textContent = original; }, 1200);
                });
            };
        }
    }

    desactivarModo(silencioso = false) {
        this.modoActivo = false;
        this.tipo = 'pendientes';
        this.seleccionados.clear();
        document.getElementById('btn-agregar-servicio').classList.remove('modo-calculadora');
        this.actualizar();
        this.app.renderServicios();
        document.getElementById('calculadora-flotante').classList.remove('visible');
        if (!silencioso) this.app.ui.mostrarToast('Calculadora Desactivada', 'info');
    }

    toggleServicio(servicioId) {
        if (!this.modoActivo) return;
        if (this.seleccionados.has(servicioId)) {
            this.seleccionados.delete(servicioId);
            if (this.seleccionados.size === 0) { this.desactivarModo(); return; }
        } else {
            this.seleccionados.add(servicioId);
        }
        this.actualizar();
        this.app.renderServicios();
    }

    actualizar() {
        if (!this.modoActivo) return;
        let totalARS = 0, totalUSD = 0, contadorFacturas = 0;
        const { mes: mesActual, anio: anioActual, mesSiguiente, anioSiguiente } = this.app.utils.mesActualInfo();
        this.seleccionados.forEach(servicioId => {
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (!servicio) return;
            servicio.facturas.forEach(factura => {
                if (factura.monto <= 0) return;
                const fechaFactura = this.app.utils.parseDate(factura.fecha);
                const mesF = fechaFactura.getMonth(), anioF = fechaFactura.getFullYear();
                const esMesActual = mesF === mesActual && anioF === anioActual;
                if (this.tipo === 'pendientes') {
                    if (factura.pagada) return;
                    const { mesPasado, anioPasado } = this.app.utils.mesActualInfo();
                    const esSiguiente = mesF === mesSiguiente && anioF === anioSiguiente;
                    const esPasado = mesF === mesPasado && anioF === anioPasado;
                    if (!esMesActual && !esSiguiente && !esPasado) return;
                } else if (this.tipo === 'pagados') {
                    if (!factura.pagada) return;
                    const fechaPago = factura.fechaPago ? this.app.utils.parseDate(factura.fechaPago) : null;
                    const esPagadaEsteMes = fechaPago && fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === anioActual;
                    if (!esMesActual && !esPagadaEsteMes) return;
                }
                if ((factura.moneda || 'ars') === 'usd') totalUSD += factura.monto;
                else totalARS += factura.monto;
                contadorFacturas++;
            });
        });
        this.app._calcTotalARS = totalARS;
        this.app._calcTotalUSD = totalUSD;
        document.getElementById('calculadora-total').textContent = this.app.utils.formatearMoneda(totalARS, 'ars');
        const elUSD = document.getElementById('calculadora-total-usd');
        if (totalUSD > 0) { elUSD.textContent = this.app.utils.formatearMoneda(totalUSD, 'usd'); elUSD.classList.add('visible'); }
        else { elUSD.classList.remove('visible'); }
        document.getElementById('calculadora-contador').textContent =
            `${contadorFacturas} ${contadorFacturas === 1 ? 'factura' : 'facturas'}`;
    }

    // ── Calculador de período ─────────────────────────────────
    calcularPeriodo() {
        const selectServicio = document.getElementById('calculador-servicio');
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        const resultadosContainer = document.getElementById('calculador-resultados');
        if (!selectServicio || !inputDesde || !inputHasta || !resultadosContainer) return;

        const servicioId = selectServicio.value;
        const desde = inputDesde.value, hasta = inputHasta.value;
        let totalRegistros = 0, variacionTexto = '0%', variacionUSDTexto = null;
        let _arsTotal = 0, _usdTotal = 0, _arsCount = 0, _usdCount = 0;

        if (servicioId) {
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (servicio) {
                const esServicioIngresos = servicioId === this.app.SERVICIO_INGRESOS_ID;
                let facturasFiltradas = servicio.facturas;
                if (desde) { const fd = this.app.utils.parseDate(desde); facturasFiltradas = facturasFiltradas.filter(f => this.app.utils.parseDate(f.fecha) >= fd); }
                if (hasta) { const fh = this.app.utils.parseDate(hasta); facturasFiltradas = facturasFiltradas.filter(f => this.app.utils.parseDate(f.fecha) <= fh); }
                facturasFiltradas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                totalRegistros = facturasFiltradas.length;
                facturasFiltradas.forEach(f => {
                    if ((f.moneda || 'ars') === 'usd') { _usdTotal += f.monto; _usdCount++; }
                    else { _arsTotal += f.monto; _arsCount++; }
                });
                let facturasParaVariacion = esServicioIngresos
                    ? facturasFiltradas.filter(f => f.tipo !== 'complementario')
                    : facturasFiltradas;
                const calcularVariacion = (facturas) => {
                    const total = facturas.length;
                    if (total < 2) return total === 1 ? 'N/A' : null;
                    let promPrim, promUlt;
                    if (total <= 3) { promPrim = facturas[0].monto; promUlt = facturas[total - 1].monto; }
                    else if (total <= 8) { const m = Math.floor(total / 2); promPrim = facturas.slice(0, m).reduce((s, f) => s + f.monto, 0) / m; promUlt = facturas.slice(-m).reduce((s, f) => s + f.monto, 0) / m; }
                    else { const g = Math.min(6, Math.max(3, Math.floor(total * 0.3))); promPrim = facturas.slice(0, g).reduce((s, f) => s + f.monto, 0) / g; promUlt = facturas.slice(-g).reduce((s, f) => s + f.monto, 0) / g; }
                    if (promPrim !== 0) { const v = ((promUlt - promPrim) / Math.abs(promPrim)) * 100; return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`; }
                    return promUlt > 0 ? '+∞' : '0%';
                };
                const facturasVarARS = facturasParaVariacion.filter(f => (f.moneda || 'ars') === 'ars');
                const facturasVarUSD = facturasParaVariacion.filter(f => (f.moneda || 'ars') === 'usd');
                const varARS = calcularVariacion(facturasVarARS);
                const varUSD = calcularVariacion(facturasVarUSD);
                if (varARS !== null) { variacionTexto = varARS; }
                else if (facturasVarARS.length === 0 && facturasVarUSD.length > 0) { variacionTexto = null; }
                else if (facturasParaVariacion.length === 0 && esServicioIngresos && totalRegistros > 0) { variacionTexto = 'Solo extras'; }
                else if (facturasVarARS.length === 1) { variacionTexto = 'N/A'; }
                variacionUSDTexto = varUSD;
            }
        }

        const estadoCalculador = { servicioId, desde, hasta, totalRegistros, _arsTotal, _usdTotal, variacionTexto, variacionUSDTexto };
        const calculadorCambio = this.app.utils.objetosCambiaron(this.app.ultimoEstadoCalculador, estadoCalculador);
        const _hayARS = _arsTotal !== 0, _hayUSD = _usdTotal !== 0;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const _montoHTML = _hayARS ? fmt(_arsTotal, 'ars') : _hayUSD ? fmt(_usdTotal, 'usd') : fmt(0, 'ars');
        const _montoUSDItem = _hayUSD ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Total USD</span><span class="calculador-resultado-valor">${fmt(_usdTotal, 'usd')}</span></div>` : '';
        const _promARS = _arsCount > 0 ? _arsTotal / _arsCount : 0;
        const _promUSD = _usdCount > 0 ? _usdTotal / _usdCount : 0;
        const _promHTML = _hayARS ? fmt(_promARS, 'ars') : _hayUSD ? fmt(_promUSD, 'usd') : fmt(0, 'ars');
        const _promUSDItem = _hayUSD ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Promedio USD</span><span class="calculador-resultado-valor">${fmt(_promUSD, 'usd')}</span></div>` : '';
        const _varUSDItem = variacionUSDTexto != null ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Variación USD</span><span class="calculador-resultado-valor">${variacionUSDTexto}</span></div>` : '';
        const generarResultadosHTML = (registros, variacion) => `
    <div class="calculador-resultado-item"><span class="calculador-resultado-label">Facturas</span><span class="calculador-resultado-valor">${registros}</span></div>
    <div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Total</span><span class="calculador-resultado-valor">${_montoHTML}</span></div>
    ${_montoUSDItem}
    <div class="calculador-resultado-item"><span class="calculador-resultado-label">Monto Promedio</span><span class="calculador-resultado-valor">${_promHTML}</span></div>
    ${_promUSDItem}
    ${variacion != null ? `<div class="calculador-resultado-item"><span class="calculador-resultado-label">Variación</span><span class="calculador-resultado-valor">${variacion}</span></div>` : ''}
    ${_varUSDItem}`;
        const renderizarResultados = () => {
            resultadosContainer.innerHTML = generarResultadosHTML(totalRegistros, variacionTexto);
            if (calculadorCambio) {
                resultadosContainer.classList.remove('anim-slide-down-fade', 'anim-slide-up-fade');
                requestAnimationFrame(() => {
                    resultadosContainer.classList.add('anim-slide-down-fade');
                });
            }
        };
        if (calculadorCambio) {
            resultadosContainer.classList.remove('anim-slide-up-fade', 'anim-slide-down-fade');
            void resultadosContainer.offsetWidth;
            resultadosContainer.classList.add('anim-slide-up-fade');
            setTimeout(() => { renderizarResultados(); this.app.ultimoEstadoCalculador = estadoCalculador; }, 190);
        } else {
            renderizarResultados();
        }
    }

    // ── Reportes ──────────────────────────────────────────────
    generarReporte() {
        if (this.app.tipoEstadisticaActual === 'individual') {
            this._generarReporteIndividual(); return;
        }
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        if (selectMes?.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año); mesSeleccionado = parseInt(mes) - 1;
        } else {
            mesSeleccionado = hoy.getMonth(); añoSeleccionado = hoy.getFullYear();
        }
        const categoriaActiva = this.app._estadisticaCategoriaActiva || null;
        const nombreMes = new Date(añoSeleccionado, mesSeleccionado, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const nombreMesCorto = new Date(añoSeleccionado, mesSeleccionado, 1).toLocaleDateString('es-AR', { month: 'long' });
        const facturasMes = [], facturasPagadasMes = [], ingresos = [];
        this.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.app.SERVICIO_INGRESOS_ID && (servicio.categoria || '') !== categoriaActiva) return;
            servicio.facturas.forEach(factura => {
                const fechaVenc = this.app.utils.parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesSeleccionado && fechaVenc.getFullYear() === añoSeleccionado;
                if (servicio.id === this.app.SERVICIO_INGRESOS_ID) {
                    if (venceEsteMes) ingresos.push({ servicio, factura });
                    return;
                }
                if (venceEsteMes) { facturasMes.push({ servicio, factura, venceEsteMes: true }); }
                else if (factura.pagada && factura.fechaPago) {
                    const fp = this.app.utils.parseDate(factura.fechaPago);
                    if (fp.getMonth() === mesSeleccionado && fp.getFullYear() === añoSeleccionado) facturasPagadasMes.push({ servicio, factura, venceEsteMes: false });
                }
            });
        });
        const fmtFecha = str => !str ? '—' : this.app.utils.parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const estadoFactura = factura => {
            if (factura.conCredito) return 'Con crédito';
            if (factura.pagada) { const mp = factura.fechaPago ? this.app.utils.parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' }) : ''; return `Pagada${mp ? ` en ${mp}` : ''}`; }
            const venc = this.app.utils.parseDate(factura.fecha); venc.setHours(0, 0, 0, 0);
            return venc < hoy ? 'Vencida (pendiente)' : 'Pendiente';
        };
        const sumar = (lista, pagada) => lista.filter(({ factura: f }) => pagada ? f.pagada : !f.pagada).reduce((acc, { factura: f }) => { if ((f.moneda || 'ars') === 'usd') acc.usd += f.monto; else acc.ars += f.monto; return acc; }, { ars: 0, usd: 0 });
        const totalVencenARS = facturasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') !== 'usd' && f.monto > 0 ? a + f.monto : a, 0);
        const totalVencenUSD = facturasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') === 'usd' && f.monto > 0 ? a + f.monto : a, 0);
        const pagadasMes = sumar(facturasMes.filter(({ factura: f }) => !f.conCredito), true);
        const pendientesMes = sumar(facturasMes.filter(({ factura: f }) => !f.conCredito), false);
        const totalPagadasOtroMesARS = facturasPagadasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') !== 'usd' ? a + f.monto : a, 0);
        const totalPagadasOtroMesUSD = facturasPagadasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') === 'usd' ? a + f.monto : a, 0);
        const totalIngresosARS = ingresos.reduce((a, { factura: f }) => (f.moneda || 'ars') !== 'usd' ? a + f.monto : a, 0);
        const totalIngresosUSD = ingresos.reduce((a, { factura: f }) => (f.moneda || 'ars') === 'usd' ? a + f.monto : a, 0);
        const sep = '─'.repeat(48), sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        let txt = `${sep2}\n  REPORTE DE ESTADÍSTICAS\n  Período: ${nombreMes.toUpperCase()}${categoriaActiva ? `  |  Categoría: ${categoriaActiva}` : ''}\n  Generado: ${new Date().toLocaleString('es-AR')}\n${sep2}\n\n`;
        txt += `FACTURAS QUE VENCEN EN ${nombreMesCorto.toUpperCase()}\n${sep}\n`;
        if (facturasMes.length === 0) { txt += `  (ninguna)\n`; }
        else {
            facturasMes.forEach(({ servicio, factura }) => {
                const monto = factura.monto < 0 ? `  [saldo a favor ${fmt(Math.abs(factura.monto), factura.moneda || 'ars')}]` : fmt(factura.monto, factura.moneda || 'ars');
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento:', fmtFecha(factura.fecha))}\n${linea('  Monto:', monto)}\n${linea('  Estado:', estadoFactura(factura))}\n`;
                if (factura.pagada && factura.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(factura.fechaPago)) + '\n';
            });
            txt += `\n${sep}\n`;
            if (totalVencenARS > 0) txt += linea('  Total del mes (ARS):', fmt(totalVencenARS, 'ars')) + '\n';
            if (totalVencenUSD > 0) txt += linea('  Total del mes (USD):', fmt(totalVencenUSD, 'usd')) + '\n';
            if (pagadasMes.ars > 0) txt += linea('  Pagado (ARS):', fmt(pagadasMes.ars, 'ars')) + '\n';
            if (pagadasMes.usd > 0) txt += linea('  Pagado (USD):', fmt(pagadasMes.usd, 'usd')) + '\n';
            if (pendientesMes.ars > 0) txt += linea('  Pendiente (ARS):', fmt(pendientesMes.ars, 'ars')) + '\n';
            if (pendientesMes.usd > 0) txt += linea('  Pendiente (USD):', fmt(pendientesMes.usd, 'usd')) + '\n';
        }
        txt += `\nPAGADAS EN ${nombreMesCorto.toUpperCase()} (VENCIMIENTO OTRO MES)\n${sep}\n`;
        if (facturasPagadasMes.length === 0) { txt += `  (ninguna)\n`; }
        else {
            facturasPagadasMes.forEach(({ servicio, factura }) => {
                const mesVenc = this.app.utils.parseDate(factura.fecha).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                txt += `\n  ${servicio.nombre}\n${linea('  Vencimiento original:', `${fmtFecha(factura.fecha)} (${mesVenc})`)}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n${linea('  Fecha de pago:', fmtFecha(factura.fechaPago))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totalPagadasOtroMesARS > 0) txt += linea('  Subtotal (ARS):', fmt(totalPagadasOtroMesARS, 'ars')) + '\n';
            if (totalPagadasOtroMesUSD > 0) txt += linea('  Subtotal (USD):', fmt(totalPagadasOtroMesUSD, 'usd')) + '\n';
        }
        if (this.app.ui.ingresosHabilitado() && ingresos.length > 0) {
            txt += `\nINGRESOS DEL MES\n${sep}\n`;
            ingresos.forEach(({ factura }) => {
                txt += `\n  ${factura.tipo || 'regular'}\n${linea('  Fecha:', fmtFecha(factura.fecha))}\n${linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars'))}\n`;
            });
            txt += `\n${sep}\n`;
            if (totalIngresosARS > 0) txt += linea('  Total ingresos (ARS):', fmt(totalIngresosARS, 'ars')) + '\n';
            if (totalIngresosUSD > 0) txt += linea('  Total ingresos (USD):', fmt(totalIngresosUSD, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        this.app.utils.descargarBlob(txt, `reporte_${nombreMes.replace(' ', '_')}.txt`);
        this.app.ui.mostrarToast('Reporte generado', 'success');
    }

    _generarReporteIndividual() {
        const servicioId = document.getElementById('calculador-servicio')?.value;
        const desde = document.getElementById('calculador-desde')?.value;
        const hasta = document.getElementById('calculador-hasta')?.value;
        if (!servicioId) { this.app.ui.mostrarToast('Seleccioná un servicio primero', 'info'); return; }
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const fmtFecha = str => !str ? '—' : this.app.utils.parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        let facturas = [...servicio.facturas];
        if (desde) facturas = facturas.filter(f => this.app.utils.parseDate(f.fecha) >= this.app.utils.parseDate(desde));
        if (hasta) facturas = facturas.filter(f => this.app.utils.parseDate(f.fecha) <= this.app.utils.parseDate(hasta));
        facturas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        let totalARS = 0, totalUSD = 0, pagadasARS = 0, pagadasUSD = 0, pendientesARS = 0, pendientesUSD = 0;
        facturas.forEach(f => {
            const m = f.moneda || 'ars';
            if (m === 'usd') { totalUSD += f.monto; if (f.pagada) pagadasUSD += f.monto; else pendientesUSD += f.monto; }
            else { totalARS += f.monto; if (f.pagada) pagadasARS += f.monto; else pendientesARS += f.monto; }
        });
        const arsF = facturas.filter(f => (f.moneda || 'ars') === 'ars').length;
        const usdF = facturas.filter(f => (f.moneda || 'ars') === 'usd').length;
        const promARS = arsF > 0 ? totalARS / arsF : 0;
        const promUSD = usdF > 0 ? totalUSD / usdF : 0;
        const fmt = (m, mon) => this.app.utils.formatearMoneda(m, mon);
        const sep = '─'.repeat(48), sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
        const periodoTxt = desde || hasta ? `${desde ? fmtFecha(desde) : '—'}  →  ${hasta ? fmtFecha(hasta) : '—'}` : 'Sin filtro de fechas';
        let txt = `${sep2}\n  REPORTE INDIVIDUAL\n  Servicio: ${servicio.nombre}\n  Período: ${periodoTxt}\n  Generado: ${new Date().toLocaleString('es-AR')}\n${sep2}\n\nDETALLE DE FACTURAS (${facturas.length})\n${sep}\n`;
        if (facturas.length === 0) { txt += `  (ninguna en el período seleccionado)\n`; }
        else {
            facturas.forEach((f, i) => {
                const moneda = f.moneda || 'ars';
                let estadoTxt;
                if (f.conCredito) { estadoTxt = 'Con crédito'; }
                else if (f.pagada) { const mp = f.fechaPago ? this.app.utils.parseDate(f.fechaPago).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : ''; estadoTxt = `Pagada${mp ? ` (${mp})` : ''}`; }
                else { const venc = this.app.utils.parseDate(f.fecha); venc.setHours(0, 0, 0, 0); estadoTxt = venc < hoy ? 'Vencida (pendiente)' : 'Pendiente'; }
                txt += `\n  #${String(i + 1).padStart(2, '0')}  ${fmtFecha(f.fecha)}\n${linea('  Monto:', fmt(f.monto, moneda))}\n${linea('  Estado:', estadoTxt)}\n`;
                if (f.pagada && f.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(f.fechaPago)) + '\n';
                if (f.tipo && f.tipo !== 'mensual') txt += linea('  Tipo:', f.tipo) + '\n';
            });
            txt += `\n${sep}\n  RESUMEN\n${sep}\n`;
            if (totalARS !== 0) txt += linea('  Total ARS:', fmt(totalARS, 'ars')) + '\n';
            if (totalUSD !== 0) txt += linea('  Total USD:', fmt(totalUSD, 'usd')) + '\n';
            if (promARS !== 0) txt += linea('  Promedio ARS:', fmt(promARS, 'ars')) + '\n';
            if (promUSD !== 0) txt += linea('  Promedio USD:', fmt(promUSD, 'usd')) + '\n';
            if (pagadasARS > 0) txt += linea('  Pagado ARS:', fmt(pagadasARS, 'ars')) + '\n';
            if (pagadasUSD > 0) txt += linea('  Pagado USD:', fmt(pagadasUSD, 'usd')) + '\n';
            if (pendientesARS > 0) txt += linea('  Pendiente ARS:', fmt(pendientesARS, 'ars')) + '\n';
            if (pendientesUSD > 0) txt += linea('  Pendiente USD:', fmt(pendientesUSD, 'usd')) + '\n';
        }
        txt += `\n${sep2}\n  Fin del reporte\n${sep2}\n`;
        this.app.utils.descargarBlob(txt, `reporte_${servicio.nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.txt`);
        this.app.ui.mostrarToast('Reporte generado', 'success');
    }
}

// ============================================================
// GIST SERVICE — sincronización con GitHub Gist (Adaptado)
// ============================================================
class GistService {
    constructor(app) {
        this.app = app;
        this.DEBOUNCE_MS = 3000;
        this._debounceTimer = null;
        this._subiendo = false;
    }

    get servicios() { return this.app.servicios; }
    set servicios(v) { this.app.servicios = v; }
    get perfilActivo() { return this.app.perfilActivo; }

    getToken() { return localStorage.getItem('gist_token') || ''; }
    getPerfil() { return this.app.perfiles[this.perfilActivo] || {}; }

    setPerfil(campos) {
        if (!this.app.perfiles[this.perfilActivo]) return;
        Object.assign(this.app.perfiles[this.perfilActivo], campos);
        this.app.guardarPerfiles();
    }

    esIdValido(id) { return /^[a-f0-9]{20,40}$/i.test(id || ''); }

    // ── UI ────────────────────────────────────────────────────
    toggleToken() {
        const inp = document.getElementById('gist-token');
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
    }

    toggleAuto() {
        const toggle = document.getElementById('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on');
    }

    abrirModal() {
        const perfil = this.getPerfil();
        document.getElementById('gist-token').value = this.getToken();

        const elId = document.getElementById('gist-id');
        elId.value = perfil.gistId || '';

        const toggle = document.getElementById('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on', !!perfil.gistAuto);

        const elSync = document.getElementById('gist-sync-status');
        if (perfil.gistLastSync) {
            const d = new Date(perfil.gistLastSync);
            elSync.textContent = `Última sincronización: ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            elSync.textContent = '';
        }

        // Controlar estado inicial del botón de redirección externa
        const btnIr = document.getElementById('btn-gist-ir');
        if (btnIr) btnIr.disabled = !this.esIdValido(perfil.gistId);

        // Listener en vivo para el input de Gist ID
        elId.oninput = (e) => {
            if (btnIr) btnIr.disabled = !this.esIdValido(e.target.value.trim());
        };

        this.app.ui.abrirModal('modal-gist');
    }

    guardarConfig() {
        const token = document.getElementById('gist-token').value.trim();
        const gistId = document.getElementById('gist-id').value.trim();
        const auto = document.getElementById('gist-autosync-toggle').classList.contains('on');

        if (gistId && !this.esIdValido(gistId)) {
            this.app.mostrarToast('El Gist ID tiene un formato inválido', 'error');
            return;
        }

        if (token) localStorage.setItem('gist_token', token);
        else localStorage.removeItem('gist_token');

        this.setPerfil({ gistId, gistAuto: auto });

        this.app.mostrarToast(auto ? 'Sincronización automática activada' : 'Configuración guardada', 'success');
        this.app.cerrarModal('modal-gist');
        this.actualizarBotones();
    }

    actualizarBotones() {
        // Mantiene la compatibilidad con el fallback de exportar local en tu UI
        const btnRespaldar = document.getElementById('btn-hist-respaldar');
        const btnRestaurar = document.getElementById('btn-hist-restaurar');
        const tieneGist = this.esIdValido(this.getPerfil().gistId);

        if (!btnRespaldar || !btnRestaurar) return;
        if (tieneGist) {
            btnRespaldar.onclick = () => this.subir();
            btnRestaurar.onclick = () => this.bajar();
            btnRespaldar.querySelector('use').setAttribute('href', '#icon-cloud-upload');
            btnRestaurar.querySelector('use').setAttribute('href', '#icon-cloud-download');
        } else {
            btnRespaldar.onclick = () => this.app.exportarDatos();
            btnRestaurar.onclick = () => this.app.mostrarOpcionesImportacion();
            btnRespaldar.querySelector('use').setAttribute('href', '#icon-download');
            btnRestaurar.querySelector('use').setAttribute('href', '#icon-upload');
        }
    }

    // Abrir el Gist actual en una pestaña nueva
    irAlGist() {
        const id = document.getElementById('gist-id').value.trim();
        if (this.esIdValido(id)) {
            window.open(`https://gist.github.com/${id}`, '_blank');
        }
    }

    // ── Spinner en el botón de ajustes ──────────────────────
    _spinStart() {
        document.getElementById('btn-ajustes')?.classList.add('icon-btn-spinning');
    }
    _spinStop() {
        document.getElementById('btn-ajustes')?.classList.remove('icon-btn-spinning');
    }

    _setBusy(busy) {
        this._subiendo = busy;
        const btnSubir = document.getElementById('btn-gist-subir');
        const btnBajar = document.getElementById('btn-gist-bajar');
        if (btnSubir) btnSubir.disabled = busy;
        if (btnBajar) btnBajar.disabled = busy;
        if (busy) this._spinStart(); else this._spinStop();
    }

    // ── Subida ────────────────────────────────────────────────
    async _ejecutarSubida(silencioso = false) {
        const token = this.getToken();
        const perfil = this.getPerfil();
        if (!token) { if (!silencioso) this.app.mostrarToast('Falta el token', 'error'); return; }

        this._setBusy(true);
        if (!silencioso) this.app.mostrarToast('Subiendo...', 'info');

        const categorias = this.app.categoria.getCategorias();
        const payload = JSON.stringify({ servicios: this.servicios, categorias }, null, 2);
        const filename = `deltaF_${this.perfilActivo}.json`;

        const url = this.esIdValido(perfil.gistId) ? `https://api.github.com/gists/${perfil.gistId}` : 'https://api.github.com/gists';
        const method = this.esIdValido(perfil.gistId) ? 'PATCH' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: `DeltaF backup — ${perfil.nombre || this.perfilActivo}`,
                    public: false,
                    files: { [filename]: { content: payload } }
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            this.setPerfil({ gistId: data.id, gistLastSync: new Date().toISOString() });

            const elId = document.getElementById('gist-id');
            if (elId) elId.value = data.id;

            if (!silencioso) this.app.mostrarToast('Subida exitosa ✓', 'success');
        } catch (err) {
            console.error(err);
            if (!silencioso) this.app.mostrarToast(`Error al subir: ${err.message}`, 'error');
        } finally {
            this._setBusy(false);
        }
    }

    subir() { this._ejecutarSubida(false); }

    subirAuto() {
        const perfil = this.getPerfil();
        if (!perfil.gistAuto || !this.getToken()) return;
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(async () => {
            if (this._subiendo) return;

            // Guard: si hay un gist existente, comparar tamaño antes de subir
            if (this.esIdValido(perfil.gistId)) {
                try {
                    const remoto = await this._fetchGist(perfil.gistId, this.getToken());
                    if (remoto) {
                        const categorias = this.app.categoria.getCategorias();
                        const payloadLocal = JSON.stringify({ servicios: this.servicios, categorias });
                        const payloadRemoto = JSON.stringify(remoto);
                        const umbral = 0.75;
                        if (payloadLocal.length < payloadRemoto.length * umbral) {
                            console.warn(`AutoSync bloqueado: datos locales (${payloadLocal.length}b) son menos del 75% del remoto (${payloadRemoto.length}b)`);
                            this.app.mostrarToast('⚠️ AutoSync bloqueado: los datos locales son significativamente menores que el backup. Subí manualmente si es intencional.', 'error');
                            return;
                        }
                    }
                } catch (e) {
                    // Si no se puede comparar, dejar pasar (sin internet, etc.)
                    console.warn('AutoSync guard: no se pudo comparar con remoto, se permite la subida.', e);
                }
            }

            this._ejecutarSubida(true);
        }, this.DEBOUNCE_MS);
    }

    // ── Descarga y Novedades ──────────────────────────────────
    async bajar() {
        const token = this.getToken();
        const perfil = this.getPerfil();
        if (!this.esIdValido(perfil.gistId)) { this.app.mostrarToast('Gist ID inválido', 'error'); return; }

        this._setBusy(true);
        this.app.mostrarToast('Bajando...', 'info');

        try {
            const data = await this._fetchGist(perfil.gistId, token);
            if (!data) throw new Error('Formato inválido');

            // Hacemos un merge simulado para contar diferencias
            const deepClone = JSON.parse(JSON.stringify(this.servicios));
            const diff = this.app.storage._mergeServicios.call({ INGRESOS_ID: this.app.SERVICIO_INGRESOS_ID, servicios: deepClone }, data.servicios);
            const diffCats = this.app.gist.mergeCategorias(data.categorias, true); // modo simulado si lo pasamos, sino contamos

            if (!diff.serviciosAgregados && !diff.facturasAgregadas && !diff.facturasActualizadas && !diff.ingresosAgregados && !diffCats) {
                this.setPerfil({ gistLastSync: new Date().toISOString() });
                this.app.mostrarToast('Sin cambios', 'info');
                return;
            }

            // Aplicar de verdad
            this.app._gistDatosPendientes = data;
            this.aplicarNovedades(); // Opcional: mostrar modal confirmación si querés, pero el botón "Bajar" fuerza la descarga

        } catch (err) {
            this.app.mostrarToast(`Error al bajar: ${err.message}`, 'error');
        } finally {
            this._setBusy(false);
        }
    }

    async autoSyncInit() {
        const perfil = this.getPerfil();
        if (!perfil.gistAuto || !this.getToken() || !this.esIdValido(perfil.gistId)) return;

        this._spinStart();
        try {
            const data = await this._fetchGist(perfil.gistId, this.getToken());
            if (!data) return;

            // Simular merge para ver qué es nuevo
            const deepClone = JSON.parse(JSON.stringify(this.servicios));
            const tempCtx = { INGRESOS_ID: this.app.SERVICIO_INGRESOS_ID, servicios: deepClone };
            const diff = this.app.storage._mergeServicios.call(tempCtx, data.servicios);

            // Calculamos diferencias de categorias manualmente para la UI
            const actuales = this.app.categoria.getCategorias();
            const nuevasCats = (data.categorias || []).filter(c => !actuales.some(ca => ca.toLowerCase() === c.toLowerCase())).length;

            if (diff.serviciosAgregados || diff.facturasAgregadas || diff.facturasActualizadas || diff.ingresosAgregados || nuevasCats) {

                // Mostrar chips de resumen
                const detalle = document.getElementById('gist-novedades-detalle');
                if (detalle) {
                    const chips = [];
                    if (diff.serviciosAgregados) chips.push(`<div class="gist-novedades-chip"><span>Servicios</span><span class="gist-novedades-chip-count">+${diff.serviciosAgregados}</span></div>`);
                    if (diff.facturasAgregadas) chips.push(`<div class="gist-novedades-chip"><span>Facturas nuevas</span><span class="gist-novedades-chip-count">+${diff.facturasAgregadas}</span></div>`);
                    if (diff.facturasActualizadas) chips.push(`<div class="gist-novedades-chip"><span>Actualizadas</span><span class="gist-novedades-chip-count">${diff.facturasActualizadas}</span></div>`);
                    if (diff.ingresosAgregados) chips.push(`<div class="gist-novedades-chip"><span>Ingresos</span><span class="gist-novedades-chip-count">+${diff.ingresosAgregados}</span></div>`);
                    if (nuevasCats) chips.push(`<div class="gist-novedades-chip"><span>Categorías</span><span class="gist-novedades-chip-count">+${nuevasCats}</span></div>`);
                    detalle.innerHTML = chips.join('');
                }

                this.app._gistDatosPendientes = data;
                setTimeout(() => this.app.abrirModal('modal-gist-novedades'), 600);
            }
        } catch (e) {
            console.error("AutoSync error:", e);
        } finally {
            this._spinStop();
        }
    }

    async _fetchGist(gistId, token) {
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const filename = `deltaF_${this.perfilActivo}.json`;
        const fileObj = json.files[filename];
        if (!fileObj) throw new Error('Archivo no encontrado');

        let content = fileObj.content;
        if (fileObj.truncated) {
            const r2 = await fetch(fileObj.raw_url);
            content = await r2.text();
        }

        const parsed = JSON.parse(content);
        return { servicios: parsed.servicios, categorias: parsed.categorias || [] };
    }

    aplicarNovedades() {
        const data = this.app._gistDatosPendientes;
        if (!data) return;

        const { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados } = this.app.storage._mergeServicios(data.servicios);
        const categoriasAgregadas = this.app.categoria.getCategorias().length;
        this.mergeCategorias(data.categorias); // Mutación real

        this.app.utils.postGuardado();
        this.setPerfil({ gistLastSync: new Date().toISOString() });
        this.app._gistDatosPendientes = null;

        this.app.cerrarModal('modal-gist-novedades');
        this.app.mostrarToast('Datos combinados correctamente', 'success');
    }

    mergeCategorias(catsNuevas, simulado = false) {
        if (!Array.isArray(catsNuevas) || catsNuevas.length === 0) return 0;
        const actuales = this.app.categoria.getCategorias();
        const nuevas = catsNuevas.filter(c => !actuales.some(ca => ca.toLowerCase() === c.toLowerCase()));
        if (!simulado && nuevas.length > 0) {
            this.app.categoria.saveCategorias([...actuales, ...nuevas].sort((a, b) => a.localeCompare(b)));
        }
        return nuevas.length;
    }
}

// ============================================================
// HISTORIAL MANAGER — undo/redo, estado profundo
// ============================================================
class HistorialManager {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get historial() { return this.app.historial; }
    set historial(v) { this.app.historial = v; }
    get historialIndex() { return this.app.historialIndex; }
    set historialIndex(v) { this.app.historialIndex = v; }
    get maxHistorial() { return this.app.maxHistorial; }

    // ── Inicializar ───────────────────────────────────────────
    inicializarHistorial() {
        this.historial = [];
        this.historialIndex = -1;
        if (this.app.servicios && this.app.servicios.length >= 0) {
            this.historial.push({
                servicios: JSON.parse(JSON.stringify(this.app.servicios)),
                categorias: JSON.parse(JSON.stringify(this.app.categoria.getCategorias()))
            });
            this.historialIndex = 0;
        }
        this.actualizarBotones();
    }

    // ── Guardar estado ────────────────────────────────────────
    guardarEstado() {
        const nuevoEstado = {
            servicios: JSON.parse(JSON.stringify(this.app.servicios)),
            categorias: JSON.parse(JSON.stringify(this.app.categoria.getCategorias()))
        };

        // Descartar estados futuros si estamos en medio del historial
        if (this.historialIndex < this.historial.length - 1) {
            this.historial.splice(this.historialIndex + 1);
        }

        this.historial.push(nuevoEstado);

        // FIX: cuando se hace shift() el índice no debe incrementarse
        if (this.historial.length > this.maxHistorial) {
            this.historial.shift();
        } else {
            this.historialIndex++;
        }

        this.actualizarBotones();
    }

    // ── Deshacer / Rehacer ────────────────────────────────────
    deshacer() {
        if (this.historialIndex <= 0) return;
        this.historialIndex--;
        this._aplicarEstado(this.historial[this.historialIndex]);
        this.app.ui.mostrarToast('Acción deshecha', 'success');
    }

    rehacer() {
        if (this.historialIndex >= this.historial.length - 1) return;
        this.historialIndex++;
        this._aplicarEstado(this.historial[this.historialIndex]);
        this.app.ui.mostrarToast('Acción rehecha', 'success');
    }

    _aplicarEstado(estado) {
        this.app.servicios = JSON.parse(JSON.stringify(estado.servicios));
        this.app.categoria.saveCategorias(JSON.parse(JSON.stringify(estado.categorias)));
        this.app.guardarDatos();
        this.app.renderServicios();
        this.app.ui.cerrarTodosLosModales();
        this.actualizarBotones();
    }

    // ── Botones UI ────────────────────────────────────────────
    actualizarBotones() {
        document.getElementById('btn-undo').disabled = this.historialIndex <= 0;
        document.getElementById('btn-redo').disabled = this.historialIndex >= this.historial.length - 1;
    }
}

// ============================================================
// STORAGE SERVICE — persistencia, validación, import/export
// ============================================================
class StorageService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get servicios() { return this.app.servicios; }
    set servicios(v) { this.app.servicios = v; }
    get perfilActivo() { return this.app.perfilActivo; }
    get STORAGE_KEY() { return this.app.STORAGE_KEY; }
    get INGRESOS_ID() { return this.app.SERVICIO_INGRESOS_ID; }

    // ── Carga / guardado por perfil ───────────────────────────
    cargarDatosPerfilActivo() {
        try {
            const key = `gestion_servicios_datos_${this.perfilActivo}`;
            const datos = localStorage.getItem(key);
            if (datos) {
                this.servicios = JSON.parse(datos);
            } else {
                this.servicios = [];
                localStorage.setItem(key, JSON.stringify([]));
            }
            this.app.inicializarHistorial();
        } catch (error) {
            console.error('Error al cargar datos del perfil:', error);
            this.servicios = [];
            this.app.inicializarHistorial();
        }
    }

    guardarDatosPerfilActivo() {
        try {
            const key = `gestion_servicios_datos_${this.perfilActivo}`;
            localStorage.setItem(key, JSON.stringify(this.servicios));
            // NUEVO: Auto-subida a Gist (si está habilitada)
            if (this.app.gist) this.app.gist.subirAuto();
        } catch (error) {
            console.error('Error al guardar datos del perfil:', error);
            this.app.ui.mostrarToast('Error al guardar datos', 'error');
        }
    }

    guardarDatos() {
        try {
            this.guardarDatosPerfilActivo();
        } catch (error) {
            console.error('Error al guardar datos:', error);
            this.app.ui.mostrarToast('Error al guardar datos', 'error');
        }
    }

    // ── Espacio disponible ────────────────────────────────────
    verificarEspacioDisponible() {
        try {
            const tamaño = new Blob([JSON.stringify(this.servicios)]).size;
            const tamañoMB = tamaño / (1024 * 1024);
            return { tamaño: tamañoMB, tamañoBytes: tamaño, advertencia: tamañoMB > 3, critico: tamañoMB > 4.5 };
        } catch {
            return { tamaño: 0, tamañoBytes: 0, advertencia: false, critico: false };
        }
    }

    // ── Validación de integridad ──────────────────────────────
    validarDatos(datos) {
        if (!Array.isArray(datos)) {
            console.error('Validación: datos no es un array');
            return false;
        }
        return datos.every((servicio, idx) => {
            if (typeof servicio.id !== 'string' || !servicio.id.trim()) {
                console.error(`Validación: servicio[${idx}].id inválido`); return false;
            }
            if (typeof servicio.nombre !== 'string' || !servicio.nombre.trim()) {
                console.error(`Validación: servicio[${idx}].nombre inválido`); return false;
            }
            if (servicio.nombre.length > 30) {
                console.error(`Validación: servicio[${idx}].nombre demasiado largo`); return false;
            }
            if (!Array.isArray(servicio.facturas)) {
                console.error(`Validación: servicio[${idx}].facturas no es un array`); return false;
            }
            return servicio.facturas.every((factura, fidx) => {
                if (typeof factura.id !== 'string' || !factura.id.trim()) {
                    console.error(`Validación: factura[${fidx}].id inválido en servicio[${idx}]`); return false;
                }
                if (typeof factura.monto !== 'number' || !isFinite(factura.monto)) {
                    console.error(`Validación: factura[${fidx}].monto inválido en servicio[${idx}]`); return false;
                }
                if (Math.abs(factura.monto) > 99999999) {
                    console.error(`Validación: factura[${fidx}].monto fuera de rango en servicio[${idx}]`); return false;
                }
                if (typeof factura.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(factura.fecha)) {
                    console.error(`Validación: factura[${fidx}].fecha inválida en servicio[${idx}]`); return false;
                }
                if (typeof factura.pagada !== 'boolean') {
                    console.error(`Validación: factura[${fidx}].pagada no es boolean en servicio[${idx}]`); return false;
                }
                if (factura.fechaPago != null) {
                    if (typeof factura.fechaPago !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(factura.fechaPago)) {
                        console.error(`Validación: factura[${fidx}].fechaPago inválida en servicio[${idx}]`); return false;
                    }
                }
                if (factura.tipo !== undefined) {
                    const tiposValidos = ['mensual', 'bimestral', 'semestral', 'anual', 'regular', 'complementario', 'transferencia'];
                    if (!tiposValidos.includes(factura.tipo)) {
                        console.error(`Validación: factura[${fidx}].tipo inválido en servicio[${idx}]`); return false;
                    }
                }
                return true;
            });
        });
    }

    // ── Exportar ──────────────────────────────────────────────
    exportarDatos() {
        try {
            const datos = {
                version: '1.0',
                fecha: new Date().toISOString(),
                categorias: this.app.categoria.getCategorias(),
                servicios: this.servicios
            };
            this.app.utils.descargarBlob(
                JSON.stringify(datos, null, 2),
                `servicios_${this.app.utils.obtenerFechaLocal()}.json`,
                'application/json'
            );
            this.app.ui.mostrarToast('Datos exportados correctamente', 'success');
            this.app.ui.cerrarMenuAjustes();
        } catch (error) {
            console.error('Error al exportar:', error);
            this.app.ui.mostrarToast('Error al exportar datos', 'error');
        }
    }

    // ── Importar ──────────────────────────────────────────────
    importarDatos(modo = 'reemplazar') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
                this.app.ui.mostrarToast('Archivo demasiado grande (máx 10MB)', 'error'); return;
            }
            if (!file.name.endsWith('.json')) {
                this.app.ui.mostrarToast('Solo se permiten archivos .json', 'error'); return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const datos = JSON.parse(event.target.result);
                    if (datos.version && datos.version !== '1.0') {
                        if (!confirm(`Versión ${datos.version} detectada (actual: 1.0). Puede haber incompatibilidades. ¿Continuar?`)) return;
                    }
                    if (!datos.servicios || !Array.isArray(datos.servicios)) {
                        throw new Error('Formato de archivo inválido: falta "servicios"');
                    }
                    if (!this.validarDatos(datos.servicios)) {
                        throw new Error('Datos corruptos o inválidos en el archivo');
                    }
                    const cantidad = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).length;
                    const facturas = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).reduce((a, s) => a + s.facturas.length, 0);
                    const ingresos = datos.servicios.find(s => s.id === this.INGRESOS_ID)?.facturas.length || 0;

                    if (modo === 'combinar') {
                        this._aplicarImportacion('combinar', datos);
                    } else {
                        const cats = Array.isArray(datos.categorias) ? datos.categorias : [];
                        const partes = [this.app.utils.plural(cantidad, 'servicio', 'servicios')];
                        if (facturas > 0) partes.push(this.app.utils.plural(facturas, 'factura', 'facturas'));
                        if (ingresos > 0) partes.push(this.app.utils.plural(ingresos, 'ingreso', 'ingresos'));
                        if (cats.length > 0) partes.push(this.app.utils.plural(cats.length, 'categoría', 'categorías'));
                        if (confirm(`Se restaurarán ${partes.join(', ')}. ¿Deseas reemplazar todos los datos actuales?`)) {
                            this._aplicarImportacion('reemplazar', datos);
                        }
                    }
                } catch (error) {
                    console.error('Error al importar:', error);
                    this.app.ui.mostrarToast('❌ Error: ' + error.message, 'error');
                }
            };
            reader.onerror = () => this.app.ui.mostrarToast('Error al leer el archivo', 'error');
            reader.readAsText(file);
        });

        input.click();
        document.getElementById('opciones-importacion').classList.remove('open');
        document.getElementById('menu-importar').classList.remove('open');
        this.app.ui.cerrarMenuAjustes();
    }

    // ── Merge helpers ─────────────────────────────────────────
    _mergeServicios(serviciosRemoto) {
        let serviciosAgregados = 0, facturasAgregadas = 0, facturasActualizadas = 0, ingresosAgregados = 0;
        serviciosRemoto.forEach(servicioRemoto => {
            const esIngresos = servicioRemoto.id === this.INGRESOS_ID;
            const servicioLocal = this.servicios.find(s => s.id === servicioRemoto.id);
            if (!servicioLocal) {
                this.servicios.push(servicioRemoto);
                esIngresos ? ingresosAgregados += servicioRemoto.facturas.length
                    : (serviciosAgregados++, facturasAgregadas += servicioRemoto.facturas.length);
            } else {
                servicioRemoto.facturas.forEach(f => {
                    const idx = servicioLocal.facturas.findIndex(fl => fl.id === f.id);
                    if (idx === -1) {
                        servicioLocal.facturas.push(f);
                        esIngresos ? ingresosAgregados++ : facturasAgregadas++;
                    } else {
                        const fe = servicioLocal.facturas[idx];
                        if (fe.monto !== f.monto || fe.fecha !== f.fecha || fe.pagada !== f.pagada || fe.fechaPago !== f.fechaPago) {
                            servicioLocal.facturas[idx] = f;
                            if (!esIngresos) facturasActualizadas++;
                        }
                    }
                });
            }
        });
        return { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados };
    }

    _aplicarImportacion(modo, datos) {
        const cats = Array.isArray(datos.categorias) ? datos.categorias : [];
        if (modo === 'combinar') {
            const { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados } = this._mergeServicios(datos.servicios);
            const categoriasAgregadas = this.app._mergeCategorias(datos.categorias);
            if (!serviciosAgregados && !facturasAgregadas && !facturasActualizadas && !ingresosAgregados && !categoriasAgregadas) {
                this.app.ui.mostrarToast('No hay datos nuevos para agregar', 'info'); return;
            }
            const partes = [];
            if (serviciosAgregados > 0) partes.push(this.app.utils.plural(serviciosAgregados, 'servicio', 'servicios'));
            if (facturasAgregadas > 0) partes.push(this.app.utils.plural(facturasAgregadas, 'factura nueva', 'facturas nuevas'));
            if (facturasActualizadas > 0) partes.push(this.app.utils.plural(facturasActualizadas, 'actualizada', 'actualizadas'));
            if (ingresosAgregados > 0) partes.push(this.app.utils.plural(ingresosAgregados, 'ingreso nuevo', 'ingresos nuevos'));
            if (categoriasAgregadas > 0) partes.push(this.app.utils.plural(categoriasAgregadas, 'categoría', 'categorías'));
            this.app.utils.postGuardado();
            this.app.ui.mostrarToast(`Importado: ${partes.join(', ')}`, 'success');
        } else {
            this.servicios = datos.servicios;
            this.app.categoria.saveCategorias(cats);
            this.app.utils.postGuardado();
            const cantidad = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).length;
            const facturas = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).reduce((a, s) => a + s.facturas.length, 0);
            const ingresos = datos.servicios.find(s => s.id === this.INGRESOS_ID)?.facturas.length || 0;
            const partes = [this.app.utils.plural(cantidad, 'servicio', 'servicios')];
            if (facturas > 0) partes.push(this.app.utils.plural(facturas, 'factura', 'facturas'));
            if (ingresos > 0) partes.push(this.app.utils.plural(ingresos, 'ingreso', 'ingresos'));
            if (cats.length > 0) partes.push(this.app.utils.plural(cats.length, 'categoría', 'categorías'));
            this.app.ui.mostrarToast(`Restaurados: ${partes.join(', ')}`, 'success');
        }
    }

    generarResumenComparacion(serviciosRemoto, etiqueta = 'archivo', categoriasRemoto = []) {
        const idsLocales = new Set(this.servicios.map(s => s.id));
        const soloEnRemoto = serviciosRemoto.filter(s => !idsLocales.has(s.id) && s.id !== this.INGRESOS_ID);
        const enAmbos = serviciosRemoto.filter(s => idsLocales.has(s.id) && s.id !== this.INGRESOS_ID);
        const sIngRem = serviciosRemoto.find(s => s.id === this.INGRESOS_ID);
        const sIngLoc = this.servicios.find(s => s.id === this.INGRESOS_ID);

        let facturasNuevas = 0, facturasConflicto = 0, ingresosNuevos = 0;
        enAmbos.forEach(sRem => {
            const sLoc = this.servicios.find(s => s.id === sRem.id);
            if (!sLoc) return;
            const idsLoc = new Set(sLoc.facturas.map(f => f.id));
            sRem.facturas.forEach(f => {
                if (!idsLoc.has(f.id)) { facturasNuevas++; }
                else {
                    const fLoc = sLoc.facturas.find(fl => fl.id === f.id);
                    if (fLoc && (fLoc.monto !== f.monto || fLoc.fecha !== f.fecha || fLoc.pagada !== f.pagada || fLoc.fechaPago !== f.fechaPago)) facturasConflicto++;
                }
            });
        });
        if (sIngRem) {
            const idsIngLoc = new Set((sIngLoc?.facturas || []).map(f => f.id));
            ingresosNuevos = sIngRem.facturas.filter(f => !idsIngLoc.has(f.id)).length;
        }

        const totalServRem = serviciosRemoto.filter(s => s.id !== this.INGRESOS_ID).length;
        const totalFactRem = serviciosRemoto.filter(s => s.id !== this.INGRESOS_ID).reduce((a, s) => a + s.facturas.length, 0);
        const totalIngRem = sIngRem?.facturas.length || 0;
        const catsActuales = this.app.categoria.getCategorias();
        const catsNuevas = categoriasRemoto.filter(c => !catsActuales.some(ca => ca.toLowerCase() === c.toLowerCase()));

        const facturasEnNuevos = soloEnRemoto.reduce((a, s) => a + s.facturas.length, 0);
        const partesAgregar = [];
        if (soloEnRemoto.length > 0) partesAgregar.push(this.app.utils.plural(soloEnRemoto.length, 'servicio nuevo', 'servicios nuevos'));
        if (facturasEnNuevos > 0) partesAgregar.push(this.app.utils.plural(facturasEnNuevos, 'factura nueva', 'facturas nuevas'));
        if (facturasNuevas > 0) partesAgregar.push(this.app.utils.plural(facturasNuevas, 'factura nueva en servicios existentes', 'facturas nuevas en servicios existentes'));
        if (ingresosNuevos > 0) partesAgregar.push(this.app.utils.plural(ingresosNuevos, 'ingreso nuevo', 'ingresos nuevos'));
        if (catsNuevas.length > 0) partesAgregar.push(this.app.utils.plural(catsNuevas.length, 'categoría nueva', 'categorías nuevas'));

        const partes = [];
        if (partesAgregar.length > 0) partes.push(`Agrega ${partesAgregar.join(', ')}`);
        if (facturasConflicto > 0) partes.push(facturasConflicto === 1 ? 'Se actualiza 1 factura' : `Se actualizan ${facturasConflicto} facturas`);
        const textoCombinar = partes.length > 0 ? partes.join('. ') : 'No modifica nada';

        const partesReempl = [];
        if (totalServRem > 0) partesReempl.push(this.app.utils.plural(totalServRem, 'servicio', 'servicios'));
        if (totalFactRem > 0) partesReempl.push(this.app.utils.plural(totalFactRem, 'factura', 'facturas'));
        if (totalIngRem > 0) partesReempl.push(this.app.utils.plural(totalIngRem, 'ingreso', 'ingresos'));
        if (categoriasRemoto.length > 0) partesReempl.push(this.app.utils.plural(categoriasRemoto.length, 'categoría', 'categorías'));
        const textoReemplazar = partesReempl.length > 0 ? `Carga ${partesReempl.join(', ')}` : 'No modifica nada';

        return `<strong>Combinar:</strong> ${textoCombinar}<br><strong>Reemplazar:</strong> ${textoReemplazar}`;
    }
}

// ============================================================
// CUSTOM SELECT — dropdown con scroll, sincroniza select oculto
// ============================================================
class CustomSelect {
    constructor(wrapper, nativeSelect, onChange) {
        this.wrapper = wrapper;
        this.native = nativeSelect;
        this.onChange = onChange;
        this.trigger = wrapper.querySelector('.custom-select-trigger');
        this.labelEl = wrapper.querySelector('.csd-label');
        this.dropdown = wrapper.querySelector('.custom-select-dropdown');
        this._boundClose = this._onOutsideClick.bind(this);
        this._boundEsc = this._onEsc.bind(this);
        this._boundScroll = this._onScroll.bind(this);
        this._boundResize = this._onResize.bind(this);
        // ¿Está dentro de un contenedor con overflow recortado (modal, sidebar…)?
        this._useFixed = !!wrapper.closest('.modal, .modal-content, .menu-ajustes');
        this.trigger.addEventListener('pointerdown', e => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });
        this.refresh();
    }

    refresh() {
        const options = Array.from(this.native.options);
        this.dropdown.innerHTML = options.map(opt =>
            `<div class="custom-select-option${opt.selected ? ' selected' : ''}" data-value="${opt.value}">${opt.text}</div>`
        ).join('');
        this.dropdown.querySelectorAll('.custom-select-option').forEach(el => {
            el.addEventListener('pointerdown', e => {
                e.stopPropagation();
                const startY = e.clientY;
                let moved = false;
                const onMove = mv => { if (Math.abs(mv.clientY - startY) > 6) moved = true; };
                const onUp = up => {
                    el.removeEventListener('pointermove', onMove);
                    el.removeEventListener('pointerup', onUp);
                    el.removeEventListener('pointercancel', onUp);
                    if (!moved) { up.stopPropagation(); this.select(el.dataset.value); }
                };
                el.addEventListener('pointermove', onMove);
                el.addEventListener('pointerup', onUp);
                el.addEventListener('pointercancel', onUp);
            });
        });
        const sel = this.native.options[this.native.selectedIndex];
        this.labelEl.textContent = sel ? sel.text : '';
    }

    select(value) {
        this.native.value = value;
        this.close();
        this._absorbNextEvents();
        this.refresh();
        if (this.onChange) this.onChange();
    }

    _absorbNextEvents() {
        const absorb = e => { e.stopPropagation(); e.preventDefault(); };
        const opts = { capture: true, once: true, passive: false };
        document.addEventListener('click', absorb, opts);
        setTimeout(() => { document.removeEventListener('click', absorb, opts); }, 300);
    }

    toggle() {
        this.wrapper.classList.contains('open') ? this.close() : this.open();
    }

    // Posiciona el dropdown en coordenadas fijas (viewport) cuando el wrapper
    // está dentro de un contenedor con overflow recortado.
    _positionFixed() {
        const rect = this.trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const above = spaceBelow < 260 && spaceAbove > spaceBelow;
        const dd = this.dropdown;
        dd.style.position = 'fixed';
        dd.style.left     = rect.left + 'px';
        dd.style.width    = rect.width + 'px';
        dd.style.right    = 'auto';
        dd.style.zIndex   = '9999';
        if (above) {
            dd.style.top    = 'auto';
            dd.style.bottom = (window.innerHeight - rect.top) + 'px';
            dd.classList.add('dropdown-above');
            dd.classList.remove('dropdown-below');
        } else {
            dd.style.top    = rect.bottom + 'px';
            dd.style.bottom = 'auto';
            dd.classList.add('dropdown-below');
            dd.classList.remove('dropdown-above');
        }
    }

    _clearFixed() {
        const dd = this.dropdown;
        dd.style.position = '';
        dd.style.left     = '';
        dd.style.width    = '';
        dd.style.right    = '';
        dd.style.top      = '';
        dd.style.bottom   = '';
        dd.style.zIndex   = '';
    }

    open() {
        if (this._useFixed) {
            // Mover el dropdown al body para escapar del overflow del modal
            document.body.appendChild(this.dropdown);
            this.dropdown._csdInstance = this; // referencia para cleanup externo
            this._positionFixed();
            this.dropdown.classList.add('csd-fixed');
            // Forzar reflow antes de añadir la clase de animación
            void this.dropdown.offsetWidth;
            this.dropdown.classList.add('csd-open');
        } else {
            const rect = this.wrapper.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceBelow < 260 && spaceAbove > spaceBelow) {
                this.dropdown.classList.add('dropdown-above');
                this.dropdown.classList.remove('dropdown-below');
            } else {
                this.dropdown.classList.add('dropdown-below');
                this.dropdown.classList.remove('dropdown-above');
            }
        }
        this.wrapper.classList.add('open');
        document.addEventListener('pointerdown', this._boundClose, true);
        document.addEventListener('keydown', this._boundEsc, true);
        window.addEventListener('scroll', this._boundScroll, { capture: true, passive: true });
        if (this._useFixed) {
            window.addEventListener('resize', this._boundResize, { passive: true });
        }
    }

    close() {
        if (this._useFixed && this.dropdown.parentElement === document.body) {
            this.dropdown.classList.remove('csd-open');
            // Devolver el dropdown a su lugar original en el wrapper tras la transición
            const delay = 150;
            setTimeout(() => {
                if (this.dropdown.parentElement === document.body) {
                    this._clearFixed();
                    this.dropdown.classList.remove('csd-fixed');
                    this.wrapper.appendChild(this.dropdown);
                }
            }, delay);
        }
        this.wrapper.classList.remove('open');
        document.removeEventListener('pointerdown', this._boundClose, true);
        document.removeEventListener('keydown', this._boundEsc, true);
        window.removeEventListener('scroll', this._boundScroll, { capture: true, passive: true });
        window.removeEventListener('resize', this._boundResize);
    }

    _onScroll(e) {
        if (this._useFixed) {
            // En modo fixed: reposicionar si el scroll es dentro del modal,
            // cerrar si es externo
            if (this.dropdown.contains(e.target)) return;
            if (this.wrapper.closest('.modal-content, .menu-ajustes')?.contains(e.target)) {
                this._positionFixed();
            } else {
                this.close();
            }
        } else {
            if (this.wrapper.contains(e.target)) return;
            this.close();
        }
    }

    _onResize() {
        if (this._useFixed) this._positionFixed();
    }

    _onEsc(e) {
        if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }

    _onOutsideClick(e) {
        // En modo fixed, el dropdown está en body — hay que chequear ambos
        if (!this.wrapper.contains(e.target) && !this.dropdown.contains(e.target)) {
            e.preventDefault();
            this.close();
        }
    }
}

window.app = new GestionServicios();

if ('serviceWorker' in navigator) {
    let newWorker;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('✅ SW registrado:', registration.scope);
                registration.addEventListener('updatefound', () => {
                    newWorker = registration.installing;

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🚀 Nueva versión disponible. Actualizando...');
                            if (window.app && typeof window.app.mostrarToast === 'function') {
                                window.app.mostrarToast('Actualizando aplicación...', 'info');
                            }
                        }
                    });
                });
            })
            .catch(err => console.error('❌ Error registro SW:', err));
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        console.log('🔄 Controlador cambiado, recargando página...');
        window.location.reload();
    });
}