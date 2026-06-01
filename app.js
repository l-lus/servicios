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

// Aplicar tema INMEDIATAMENTE antes de renderizar (evitar parpadeo)
(function () {
    try {
        var tema = localStorage.getItem('gestion_servicios_theme');
        if (tema === 'dark' || tema === null) {
            // Si es dark O primera vez (null), activar modo oscuro
            document.body.classList.add('dark-mode');
        } else if (tema === 'light') {
            document.body.classList.remove('dark-mode');
        }
    } catch (e) {
        // En caso de error, modo oscuro por defecto
        document.body.classList.add('dark-mode');
    }
})();

// ============================================
// APLICACIÓN DE GESTIÓN DE SERVICIOS
// ============================================

class GestionServicios {
    constructor() {
        // Sistema de perfiles - NUEVO
        this.perfilActivo = localStorage.getItem('gestion_servicios_perfil_activo') || 'default';
        this.perfiles = this.cargarPerfiles();

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

        // Cargar datos del perfil activo - NUEVO
        this.cargarDatosPerfilActivo();

        this.init();
        this.gistAutoSyncInit();
    }

    // ========================================
    // INICIALIZACIÓN
    // ========================================

    init() {
        this.cargarTema();
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
            searchClear.classList.toggle('d-flex-imp', !!this.terminoBusqueda);

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
        this.actualizarBotonesGist();

        // Inicializar menú contextual
        this._ctxInit();

    }

    // ========================================
    // GESTIÓN DE PERFILES
    // ========================================

    cargarPerfiles() {
        try {
            const perfilesGuardados = localStorage.getItem('gestion_servicios_perfiles');
            if (perfilesGuardados) {
                return JSON.parse(perfilesGuardados);
            }
        } catch (error) {
            console.error('Error al cargar perfiles:', error);
        }

        // Perfil por defecto
        return {
            'default': {
                id: 'default',
                nombre: 'Principal',
                creado: new Date().toISOString()
            }
        };
    }

    guardarPerfiles() {
        try {
            localStorage.setItem('gestion_servicios_perfiles', JSON.stringify(this.perfiles));
        } catch (error) {
            console.error('Error al guardar perfiles:', error);
            this.mostrarToast('Error al guardar perfiles', 'error');
        }
    }

    cancelarEditarPerfil() {
        this.cerrarModal('modal-editar-perfil');
        this.abrirModalPerfiles();
    }

    cargarDatosPerfilActivo() {
        try {
            const key = `gestion_servicios_datos_${this.perfilActivo}`;
            const datos = localStorage.getItem(key);
            if (datos) {
                this.servicios = JSON.parse(datos);
            } else {
                this.servicios = [];
                // Guardar array vacío para que no se confunda con datos viejos
                localStorage.setItem(key, JSON.stringify([]));
            }

            // NUEVO: Inicializar historial con el estado cargado
            this.inicializarHistorial();

        } catch (error) {
            console.error('Error al cargar datos del perfil:', error);
            this.servicios = [];
            this.inicializarHistorial(); // También inicializar en caso de error
        }
    }

    guardarDatosPerfilActivo() {
        try {
            const key = `gestion_servicios_datos_${this.perfilActivo}`;
            localStorage.setItem(key, JSON.stringify(this.servicios));
        } catch (error) {
            console.error('Error al guardar datos del perfil:', error);
            this.mostrarToast('Error al guardar datos', 'error');
        }
    }

    cambiarPerfil(perfilId) {
        if (perfilId === this.perfilActivo) return;

        // Guardar datos del perfil actual
        this.guardarDatosPerfilActivo();

        // Cambiar al nuevo perfil
        this.perfilActivo = perfilId;
        localStorage.setItem('gestion_servicios_perfil_activo', perfilId);

        // Cargar datos del nuevo perfil
        this.cargarDatosPerfilActivo(); // Esta función ahora también inicializa el historial

        // Resetear filtro de categoría al cambiar de perfil
        this._estadisticaCategoriaActiva = null;
        this.ultimoEstadoEstadisticas = null;

        // Actualizar interfaz
        this.renderServicios();
        this.cerrarModal('modal-perfiles');
        this.cerrarMenuAjustes();

        const nombrePerfil = this.perfiles[perfilId].nombre;
        this.mostrarToast(`Cambiado a perfil: ${nombrePerfil}`, 'success');
    }

    abrirModalPerfiles() {
        this.renderListaPerfiles();
        this.cerrarMenuAjustes();
        this.abrirModal('modal-perfiles');
    }

    renderListaPerfiles() {
        const lista = document.getElementById('perfiles-lista');
        const perfilesArray = Object.values(this.perfiles);

        // Deshabilitar input si se alcanzó el máximo
        const inputNuevo = document.getElementById('perfil-nuevo-nombre');
        if (inputNuevo) {
            const maxAlcanzado = perfilesArray.length >= 4;
            inputNuevo.disabled = maxAlcanzado;
            inputNuevo.placeholder = maxAlcanzado ? 'Máximo 4 perfiles' : 'Nombre del perfil...';
        }

        lista.innerHTML = perfilesArray.map(perfil => {
            const esActivo = perfil.id === this.perfilActivo;
            const esDefault = perfil.id === 'default';

            // Contar datos del perfil
            const key = `gestion_servicios_datos_${perfil.id}`;
            let cantidadServicios = 0;
            try {
                const datos = localStorage.getItem(key);
                if (datos) {
                    const servicios = JSON.parse(datos);
                    cantidadServicios = servicios.length;
                }
            } catch (e) { }

            return `
    <div class="perfil-item-card d-flex justify-content-between align-items-center ${esActivo ? 'activo' : ''}" 
         data-action="cambiar-perfil" data-perfil-id="${perfil.id}">
        <div class="flex-1">
            <div class="perfil-header d-flex align-items-center gap-2">
                ${this.escaparHTML(perfil.nombre)}
                ${esActivo ? '<span class="perfil-activo-badge">● Activo</span>' : ''}
            </div>
            <div class="perfil-stats">
                ${this._plural(cantidadServicios, 'servicio', 'servicios')}
            </div>
        </div>
        <div class="d-flex gap-2" data-action="stop-propagation">
            ${!esDefault ? `
                <button class="icon-btn text-danger" data-action="eliminar-perfil" data-perfil-id="${perfil.id}" title="Eliminar perfil">
                    <svg class="icon"><use href="#icon-trash" /></svg>
                </button>
            ` : ''}
            <button class="icon-btn" data-action="editar-perfil" data-perfil-id="${perfil.id}" title="Editar perfil">
                <svg class="icon"><use href="#icon-edit" /></svg>
            </button>
         </div>
    </div>
`;
        }).join('');
    }

    crearPerfilInline() {
        const input = document.getElementById('perfil-nuevo-nombre');
        const nombre = input.value.trim();

        if (!nombre) {
            this.mostrarToast('Ingresá un nombre', 'error');
            return;
        }

        const nombreExiste = Object.values(this.perfiles).some(p =>
            p.nombre.toLowerCase() === nombre.toLowerCase()
        );
        if (nombreExiste) {
            this.mostrarToast('Ya existe un perfil con ese nombre', 'error');
            return;
        }

        if (Object.keys(this.perfiles).length >= 4) {
            this.mostrarToast('Máximo 4 perfiles permitidos', 'error');
            return;
        }

        const nuevoId = 'perfil_' + Date.now();
        this.perfiles[nuevoId] = {
            id: nuevoId,
            nombre: nombre,
            creado: new Date().toISOString()
        };
        localStorage.setItem(`gestion_servicios_datos_${nuevoId}`, JSON.stringify([]));

        input.value = '';
        this.guardarPerfiles();
        this.mostrarToast('Perfil creado', 'success');
        this.abrirModalPerfiles();
    }

    abrirModalEditarPerfil(perfilId) {
        this.perfilEditando = perfilId;
        const perfil = this.perfiles[perfilId];
        document.getElementById('titulo-editar-perfil').textContent = 'Editar Perfil';
        document.getElementById('perfil-nombre').value = perfil.nombre;
        const inputNuevo = document.getElementById('perfil-nuevo-nombre');
        if (inputNuevo) inputNuevo.value = '';
        this.cerrarModal('modal-perfiles');
        this.abrirModal('modal-editar-perfil');
    }

    guardarPerfil(e) {
        e.preventDefault();

        const nombre = document.getElementById('perfil-nombre').value.trim();

        if (!nombre) {
            this.mostrarToast('El nombre es requerido', 'error');
            return;
        }

        // Validar nombre duplicado
        const nombreExiste = Object.values(this.perfiles).some(perfil =>
            perfil.nombre.toLowerCase() === nombre.toLowerCase() &&
            perfil.id !== this.perfilEditando
        );

        if (nombreExiste) {
            this.mostrarToast('Ya existe un perfil con ese nombre', 'error');
            return;
        }

        if (this.perfilEditando) {
            // Editar perfil existente
            this.perfiles[this.perfilEditando].nombre = nombre;

            // Si editamos el perfil activo, actualizar el header
            if (this.perfilEditando === this.perfilActivo) {
                this.renderServicios();
            }

            this.mostrarToast('Perfil actualizado', 'success');
        } else {
            // Crear nuevo perfil
            if (Object.keys(this.perfiles).length >= 4) {
                this.mostrarToast('Máximo 4 perfiles permitidos', 'error');
                return;
            }

            const nuevoId = 'perfil_' + Date.now();
            this.perfiles[nuevoId] = {
                id: nuevoId,
                nombre: nombre,
                creado: new Date().toISOString()
            };

            // Inicializar datos vacíos para el nuevo perfil
            const key = `gestion_servicios_datos_${nuevoId}`;
            localStorage.setItem(key, JSON.stringify([]));

            this.mostrarToast('Perfil creado', 'success');
        }

        this.guardarPerfiles();
        this.cerrarModal('modal-editar-perfil');
        this.abrirModalPerfiles();
    }

    eliminarPerfil(perfilId) {
        if (perfilId === 'default') {
            this.mostrarToast('No puedes eliminar el perfil principal', 'error');
            return;
        }

        const perfil = this.perfiles[perfilId];

        if (!confirm(`¿Eliminar el perfil "${perfil.nombre}"? Todos sus datos se perderán.`)) {
            return;
        }

        // Si es el perfil activo, cambiar al default
        if (perfilId === this.perfilActivo) {
            this.cambiarPerfil('default');
        }

        // Eliminar datos del perfil
        const key = `gestion_servicios_datos_${perfilId}`;
        localStorage.removeItem(key);

        // Eliminar perfil
        delete this.perfiles[perfilId];
        this.guardarPerfiles();

        this.mostrarToast('Perfil eliminado', 'success');
        this.renderListaPerfiles();
    }

    // ========================================
    // MENÚ CONTEXTUAL Y CALCULADORA
    // ========================================

    activarModoCalculadora(silencioso = false) {
        this.modoCalculadora = true;
        this.serviciosSeleccionados.clear();

        const btnAdd = document.getElementById('btn-agregar-servicio');
        btnAdd.classList.add('modo-calculadora');

        this.actualizarCalculadora();
        this.renderServicios();

        if (!silencioso) {
            const flotante = document.getElementById('calculadora-flotante');
            flotante.classList.add('visible');

            flotante.onclick = () => {
                const arsVal = this._calcTotalARS ?? 0;
                const usdVal = this._calcTotalUSD ?? 0;
                const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(2);
                let texto = fmt(arsVal);
                if (usdVal > 0) texto += ` / ${fmt(usdVal)}`;
                navigator.clipboard.writeText(texto).then(() => {
                    const contador = document.getElementById('calculadora-contador');
                    const textoOriginal = contador.textContent;
                    contador.textContent = '✓ Copiado';
                    setTimeout(() => { contador.textContent = textoOriginal; }, 1200);
                });
            };
        }
    }

    desactivarModoCalculadora(silencioso = false) {
        this.modoCalculadora = false;
        this.modoCalculadoraTipo = 'pendientes';
        this.serviciosSeleccionados.clear();

        const btnAdd = document.getElementById('btn-agregar-servicio');
        btnAdd.classList.remove('modo-calculadora');

        this.actualizarCalculadora();
        this.renderServicios();

        document.getElementById('calculadora-flotante').classList.remove('visible');
        if (!silencioso) this.mostrarToast('Calculadora Desactivada', 'info');
    }

    toggleServicioCalculadora(servicioId) {
        if (!this.modoCalculadora) return;

        if (this.serviciosSeleccionados.has(servicioId)) {
            this.serviciosSeleccionados.delete(servicioId);

            // Si no quedan servicios seleccionados, salir del modo
            if (this.serviciosSeleccionados.size === 0) {
                this.desactivarModoCalculadora();
                return;
            }
        } else {
            this.serviciosSeleccionados.add(servicioId);
        }

        this.actualizarCalculadora();
        this.renderServicios();
    }

    actualizarCalculadora() {
        if (!this.modoCalculadora) return;

        let totalARS = 0;
        let totalUSD = 0;
        let contadorFacturas = 0;

        const { mes: mesActual, anio: anioActual, mesSiguiente, anioSiguiente } = this._mesActualInfo();

        this.serviciosSeleccionados.forEach(servicioId => {
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (!servicio) return;

            servicio.facturas.forEach(factura => {
                /* if (factura.monto > 0 && !factura.conCredito) { 
                NO CONTAR FACTURAS CON CREDITO COMENTADO */
                if (factura.monto > 0) {
                    const fechaFactura = this._parseDate(factura.fecha);
                    const mesFactura = fechaFactura.getMonth();
                    const anioFactura = fechaFactura.getFullYear();
                    const esMesActual = (mesFactura === mesActual && anioFactura === anioActual);

                    if (this.modoCalculadoraTipo === 'pendientes') {
                        if (factura.pagada) return;
                        const { mesPasado, anioPasado } = this._mesActualInfo();
                        const esMesSiguiente = (mesFactura === mesSiguiente && anioFactura === anioSiguiente);
                        const esMesPasado = (mesFactura === mesPasado && anioFactura === anioPasado);
                        if (!esMesActual && !esMesSiguiente && !esMesPasado) return;
                    } else if (this.modoCalculadoraTipo === 'pagados') {
                        if (!factura.pagada) return;
                        const fechaPago = factura.fechaPago ? this._parseDate(factura.fechaPago) : null;
                        const esPagadaEsteMes = fechaPago && fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === anioActual;
                        if (!esMesActual && !esPagadaEsteMes) return;
                    }

                    if ((factura.moneda || 'ars') === 'usd') {
                        totalUSD += factura.monto;
                    } else {
                        totalARS += factura.monto;
                    }
                    contadorFacturas++;
                }
            });
        });

        // Mostrar ARS (siempre visible, aunque sea $0)
        this._calcTotalARS = totalARS;
        this._calcTotalUSD = totalUSD;
        document.getElementById('calculadora-total').textContent = this.formatearMoneda(totalARS, 'ars');

        // Mostrar USD solo si hay monto
        const elUSD = document.getElementById('calculadora-total-usd');
        if (totalUSD > 0) {
            elUSD.textContent = this.formatearMoneda(totalUSD, 'usd');
            elUSD.classList.add('visible');
        } else {
            elUSD.classList.remove('visible');
        }

        // Actualizar contador con plural correcto
        const textoFacturas = contadorFacturas === 1 ? 'factura' : 'facturas';
        document.getElementById('calculadora-contador').textContent = `${contadorFacturas} ${textoFacturas}`;
    }

    validarMonto(monto, permitirNegativos = false) {
        // Validar que sea un número
        if (!monto && monto !== 0 || isNaN(monto)) {
            this.mostrarToast('El monto debe ser un número válido', 'error');
            return false;
        }

        // Validar que sea positivo (solo si no se permiten negativos)
        if (!permitirNegativos && monto < 0) {
            this.mostrarToast('El monto debe ser positivo', 'error');
            return false;
        }

        // Validar tamaño máximo
        if (Math.abs(monto) > 99999999) {
            this.mostrarToast('El monto es demasiado grande', 'error');
            return false;
        }

        return true;
    }

    validarFecha(fecha) {
        // Validar que la fecha no esté vacía
        if (!fecha) {
            this.mostrarToast('La fecha es requerida', 'error');
            return false;
        }

        // FIX: usar 'T00:00:00' para forzar interpretación local (sin el sufijo,
        // new Date('YYYY-MM-DD') interpreta en UTC y da un día de diferencia en GMT-3)
        const fechaIngresada = this._parseDate(fecha);
        const fechaActual = new Date();

        // Calcular la diferencia en años
        const diferenciaAnios = (fechaIngresada - fechaActual) / (1000 * 60 * 60 * 24 * 365.25);

        // Validar que no sea mayor a 2 años en el futuro
        if (diferenciaAnios > 2) {
            this.mostrarToast('La fecha no puede ser mayor a 2 años en el futuro', 'error');
            return false;
        }

        return true;
    }

    validarFechaPago(fechaPago) {
        // Si no hay fecha de pago, es requerida
        if (!fechaPago) {
            this.mostrarToast('La fecha de pago es requerida cuando se marca como pagada', 'error');
            return false;
        }

        // Convertir a fecha local (agregar 'T00:00:00' fuerza interpretación local)
        const fechaPagoDate = this._parseDate(fechaPago);
        const fechaActual = new Date();

        // Resetear horas para comparar solo las fechas
        fechaPagoDate.setHours(0, 0, 0, 0);
        fechaActual.setHours(0, 0, 0, 0);

        // Validar que no sea una fecha futura
        if (fechaPagoDate > fechaActual) {
            this.mostrarToast('La fecha de pago no puede ser en el futuro', 'error');
            return false;
        }

        return true;
    }

    setupEventListeners() {
        // Botones principales
        document.getElementById('btn-agregar-servicio').addEventListener('click', () => {
            // Si está en modo calculadora, desactivar
            if (this.modoCalculadora) {
                this.desactivarModoCalculadora();
            } else {
                this.toggleMenuAgregar();
            }
        });
        document.getElementById('btn-ajustes').addEventListener('click', () => this.toggleMenuAjustes());
        document.getElementById('menu-overlay').addEventListener('click', () => this.cerrarMenuAjustes());
        document.getElementById('btn-cerrar-menu').addEventListener('click', () => this.cerrarMenuAjustes());

        // Undo/Redo
        document.getElementById('btn-undo').addEventListener('click', () => this.deshacer());
        document.getElementById('btn-redo').addEventListener('click', () => this.rehacer());

        // Menú ajustes
        document.getElementById('menu-tema').addEventListener('click', () => this.toggleTema());
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
        document.getElementById('menu-toggle-ingresos').addEventListener('click', () => this.toggleIngresos());
        document.getElementById('menu-toggle-blur').addEventListener('click', () => this.toggleBlur());

        // Menú agregar
        document.getElementById('menu-agregar-overlay').addEventListener('click', () => this.cerrarMenuAgregar());
        document.getElementById('menu-agregar-servicio').addEventListener('click', () => {
            this.cerrarMenuAgregar();
            this.abrirModalServicio();
        });
        document.getElementById('menu-agregar-factura').addEventListener('click', () => {
            this.cerrarMenuAgregar();
            this.abrirModalFacturaRapida();
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
                this.toggleResumen();
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
            this.abrirModalGist();
        });

        document.getElementById('menu-perfiles').addEventListener('click', () => {
            this.abrirModalPerfiles();
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
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.cerrarTodosLosModales();
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
            this.toggleEstadisticas();
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
        this.inicializarCalculador();

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
                    this.cerrarTodosLosModales();
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
                if (serviciosContent.classList.contains('collapsed') || serviciosContent.classList.contains('semi-collapsed')) {
                    serviciosContent.classList.remove('collapsed', 'semi-collapsed');
                    document.getElementById('servicios-chevron').classList.remove('collapsed', 'semi-collapsed');
                    localStorage.setItem('servicios-collapse-state', 'expanded');
                    this.serviciosCollapseState = 'expanded';
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
            this.generarReporteEstadisticas();
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
                this.abrirModalInfoResumen();
            }
        });

        // Gist modal: toggle visibilidad token
        document.getElementById('btn-gist-toggle-token').addEventListener('click', () => {
            const i = document.getElementById('gist-token');
            i.type = i.type === 'password' ? 'text' : 'password';
        });

        // Gist modal: subir / bajar
        document.getElementById('gist-btn-subir').addEventListener('click', () => this.gistSubir());
        document.getElementById('gist-btn-bajar').addEventListener('click', () => this.gistBajar());

        // Gist modal: ciclar autosync / merge
        document.getElementById('gist-autosync-btn').addEventListener('click', () => this.gistCiclarAutoSync());
        document.getElementById('gist-merge-btn').addEventListener('click', () => this.gistCiclarMerge());

        // Gist modal: guardar / cerrar
        document.getElementById('btn-gist-guardar').addEventListener('click', () => this.gistGuardarConfig());
        document.getElementById('btn-gist-cerrar').addEventListener('click', () => {
            this.cerrarModal('modal-gist');
            this.toggleMenuAjustes();
        });

        // Modal gist-merge: combinar / reemplazar / cancelar
        document.getElementById('btn-gist-merge-combinar').addEventListener('click', () => this.gistMergeAplicar('merge'));
        document.getElementById('btn-gist-merge-reemplazar').addEventListener('click', () => this.gistMergeAplicar('replace'));
        document.getElementById('btn-gist-merge-cancelar').addEventListener('click', () => this.cerrarModal('modal-gist-merge'));

        // Modal agregar-servicio: botón agregar categoría
        document.getElementById('btn-agregar-cat-servicio').addEventListener('click', () => {
            this.abrirModalNuevaCategoria('servicio-categoria');
        });

        // Modal editar-servicio: botón agregar categoría
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
            this.guardarPerfil(e);
        });
        document.getElementById('btn-cancelar-editar-perfil').addEventListener('click', () => {
            this.cancelarEditarPerfil();
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
            if (btnEliminar) { e.stopPropagation(); this.eliminarPerfil(btnEliminar.dataset.perfilId); return; }
            if (btnEditar) { e.stopPropagation(); this.abrirModalEditarPerfil(btnEditar.dataset.perfilId); return; }
            if (card) this.cambiarPerfil(card.dataset.perfilId);
        });

        // Estadísticas mensuales: abrir debug al clickear un item
        document.getElementById('estadisticas-mensual-container')?.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action="debug-estadisticas"]');
            if (item) this.abrirDebugEstadisticas(item.dataset.tipo);
        });

        // Lista de servicios: toggle grupos por categoría + long press
        const listaSvc = document.getElementById('servicios-lista');
        if (listaSvc) {
            listaSvc.addEventListener('click', (e) => {
                const header = e.target.closest('[data-action="toggle-grupo-cat"]');
                if (header) this.toggleGrupoCat(header);
            });
            listaSvc.addEventListener('pointerdown', (e) => {
                const header = e.target.closest('[data-lp="true"]');
                if (header) this._lpStart(e, header);
            });
            listaSvc.addEventListener('pointerup', (e) => {
                if (e.target.closest('[data-lp="true"]')) this._lpCancel();
            });
            listaSvc.addEventListener('pointerleave', (e) => {
                if (e.target.closest('[data-lp="true"]')) this._lpCancel();
            });
            listaSvc.addEventListener('contextmenu', (e) => {
                if (e.target.closest('[data-lp="true"]')) e.preventDefault();
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

    actualizarResumenMes() {
        const { mes: mesActual, anio: añoActual } = this._mesActualInfo();

        let totalAPagarARS = 0, totalAPagarUSD = 0;
        let totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalPagadoDelMesActualARS = 0, totalPagadoDelMesActualUSD = 0;
        let totalFacturasMesActualARS = 0, totalFacturasMesActualUSD = 0;
        let cantidadPagadasVencenEsteMes = 0;
        let cantidadPendientesEsteMes = 0;

        this.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const fechaFactura = this._parseDate(factura.fecha);
                const mesFactura = fechaFactura.getMonth();
                const añoFactura = fechaFactura.getFullYear();
                const esDelMesActual = mesFactura === mesActual && añoFactura === añoActual;
                const moneda = factura.moneda || 'ars';

                const excluir = factura.conCredito === true;

                if (esDelMesActual) {
                    if (factura.monto < 0) return;
                    // Pagada fuera del mes actual: no cuenta ni en total ni en pagado (barra consistente)
                    const pagadaEsteMes = factura.pagada && factura.fechaPago &&
                        (() => { const fp = this._parseDate(factura.fechaPago); return fp.getMonth() === mesActual && fp.getFullYear() === añoActual; })();
                    const contarEnTotal = !factura.pagada || pagadaEsteMes;
                    if (factura.pagada) cantidadPagadasVencenEsteMes++;
                    if (!factura.pagada) cantidadPendientesEsteMes++;
                    if (moneda === 'usd') {
                        if (!excluir && contarEnTotal) totalFacturasMesActualUSD += factura.monto;
                        if (!factura.pagada && !excluir) { totalAPagarUSD += factura.monto; }
                        else if (pagadaEsteMes && !excluir) { totalPagadoDelMesActualUSD += factura.monto; }
                    } else {
                        if (!excluir && contarEnTotal) totalFacturasMesActualARS += factura.monto;
                        if (!factura.pagada && !excluir) { totalAPagarARS += factura.monto; }
                        else if (pagadaEsteMes && !excluir) { totalPagadoDelMesActualARS += factura.monto; }
                    }
                }

                if (factura.pagada && factura.fechaPago && factura.monto > 0 && !excluir) {
                    const fechaPago = this._parseDate(factura.fechaPago);
                    if (fechaPago.getMonth() === mesActual && fechaPago.getFullYear() === añoActual) {
                        if (moneda === 'usd') { totalPagadoMesUSD += factura.monto; }
                        else { totalPagadoMesARS += factura.monto; }
                    }
                }
            });
        });

        this.datosResumen = {
            pendienteARS: totalAPagarARS,
            pendienteUSD: totalAPagarUSD,
            pagadoMesARS: totalPagadoMesARS,
            pagadoMesUSD: totalPagadoMesUSD,
            pagadoDelMesActualARS: totalPagadoDelMesActualARS,
            pagadoDelMesActualUSD: totalPagadoDelMesActualUSD,
            totalPeriodoARS: totalFacturasMesActualARS,
            totalPeriodoUSD: totalFacturasMesActualUSD,
            cantidadPagadasVencenEsteMes,
            cantidadPendientesEsteMes,
            // Compatibilidad legacy (usa ARS para la barra de progreso)
            pendiente: totalAPagarARS + totalAPagarUSD,
            pagadoMes: totalPagadoMesARS,
            pagadoDelMesActual: totalPagadoDelMesActualARS,
            totalPeriodo: totalFacturasMesActualARS
        };

        const estadoGuardado = localStorage.getItem('resumen-mostrar-pagado');
        this.mostrandoPagadoMes = estadoGuardado === 'true';

        if (this.mostrandoPagadoMes) {
            this.mostrarPagadoEnResumen();
        } else {
            this.mostrarPendienteEnResumen();
        }

        this.actualizarEstadisticas();
    }

    obtenerColorBordeMasPrioritario() {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const { mes: mesActual, anio: añoActual } = this._mesActualInfo();

        let prioridad = 5; // 1=vencido/urgente, 2=proximo, 3=lejano, 4=pagado, 5=sin estado
        let colorBorde = '';

        this.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const fechaFactura = this._parseDate(factura.fecha);
                const mesFactura = fechaFactura.getMonth();
                const añoFactura = fechaFactura.getFullYear();

                // Verificar si es del mes actual
                const esDelMesActual = mesFactura === mesActual && añoFactura === añoActual;

                if (!esDelMesActual) return;

                // AHORA AMBAS VISTAS evalúan solo las facturas PENDIENTES para determinar el color
                if (!factura.pagada) {
                    const vencimiento = this._parseDate(factura.fecha);
                    vencimiento.setHours(0, 0, 0, 0);
                    const diasRestantes = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));

                    if (diasRestantes < 0) {
                        // Vencido - máxima prioridad
                        if (prioridad > 1) {
                            prioridad = 1;
                            colorBorde = 'borde-vencido';
                        }
                    } else if (diasRestantes <= 2) {
                        // Urgente (hoy, mañana, pasado)
                        if (prioridad > 1) {
                            prioridad = 1;
                            colorBorde = 'borde-urgente';
                        }
                    } else if (diasRestantes <= 5) {
                        // Próximo (3-5 días)
                        if (prioridad > 2) {
                            prioridad = 2;
                            colorBorde = 'borde-proximo';
                        }
                    } else {
                        // Lejano (más de 6 días)
                        if (prioridad > 3) {
                            prioridad = 3;
                            colorBorde = 'borde-lejano';
                        }
                    }
                }
            });
        });

        // Si no hay pendientes, usar verde
        if (!colorBorde) {
            colorBorde = 'borde-pagado';
        }

        return colorBorde;
    }

    // ── Helpers reutilizables ──────────────────────────────────────

    _plural(n, singular, plural) {
        return `${n} ${n !== 1 ? plural : singular}`;
    }

    _mesActualInfo() {
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

    _postGuardado() {
        this.guardarDatos();
        this.guardarEstado();
        this.renderServicios(); // → actualizarResumenMes() → actualizarEstadisticas() ya incluido
    }

    // Helper 1: parsear fecha en hora local (evita offset UTC en GMT-3)
    _parseDate(str) {
        return new Date(str + 'T00:00:00');
    }

    // Helper 2: limpiar el buscador y restaurar grupos colapsados previos
    _limpiarBusqueda() {
        const searchInput = document.getElementById('search-input');
        const searchClear = document.getElementById('search-clear');
        if (!searchInput) return;
        searchInput.value = '';
        this.terminoBusqueda = '';
        searchClear.classList.remove('d-flex-imp');
        if (this._catColapsadasAntesBusqueda !== null) {
            this._catColapsadas = this._catColapsadasAntesBusqueda;
            this._catColapsadasAntesBusqueda = null;
        }
        this.renderServicios();
        setTimeout(() => { this.enModoBusqueda = false; }, 100);
    }

    // Helper 3: descargar contenido como archivo
    _descargarBlob(contenido, nombreArchivo, tipo = 'text/plain;charset=utf-8') {
        const blob = new Blob([contenido], { type: tipo });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Helper 4: IDs de campos del formulario de factura según modo editar/agregar
    _idsFormFactura(esEditar) {
        const p = esEditar ? 'editar-factura' : 'factura';
        return {
            monto:       `${p}-monto`,
            tipo:        `${p}-tipo`,
            fecha:       `${p}-fecha`,
            moneda:      `${p}-moneda`,
            fechaPago:   `${p}-fecha-pago`,
            conCredito:  `${p}-con-credito`,
            servicio:    `${p}-servicio`,
            btnPagada:   esEditar ? 'btn-editar-toggle-pagada'  : 'btn-toggle-pagada',
            btnCredito:  esEditar ? 'btn-editar-toggle-credito' : 'btn-toggle-credito',
            btnMoneda:   esEditar ? 'btn-editar-factura-moneda' : 'btn-factura-moneda',
            btnNegativo: esEditar ? 'btn-editar-toggle-negativo': 'btn-toggle-negativo',
        };
    }

    // Helper 5: abrir/cerrar un submenú del menú ajustes, cerrando los otros
    _toggleSubMenuAjustes(opcionesId, padreId) {
        const subMenus = [
            ['opciones-importacion', 'menu-importar'],
            ['opciones-borrar',      'menu-limpiar'],
            ['opciones-dolar',       'menu-dolar'],
        ];
        const abriendo = !document.getElementById(opcionesId).classList.contains('open');
        // Cerrar todos los que no son el activo
        subMenus.forEach(([oId, pId]) => {
            if (oId !== opcionesId) {
                document.getElementById(oId).classList.remove('open');
                document.getElementById(pId).classList.remove('open');
            }
        });
        document.getElementById(opcionesId).classList.toggle('open', abriendo);
        document.getElementById(padreId).classList.toggle('open', abriendo);
    }

    _aplicarBlurResumen(hayMonto) {
        if (this.blurHabilitado && !this.resumenDesblurado && hayMonto) {
            const el = document.getElementById('resumen-toggle');
            if (el) el.classList.add('resumen-blur');
        }
    }

    _actualizarBordeResumen(colorBorde) {
        const cardResumen = document.getElementById('resumen-mes').closest('.card');
        if (cardResumen) {
            cardResumen.classList.remove('borde-vencido', 'borde-urgente', 'borde-proximo', 'borde-lejano', 'borde-pagado');
            if (colorBorde) cardResumen.classList.add(colorBorde);
        }
    }

    _buildValorResumen(montoARS, montoUSD, textoVacio) {
        const hayARS = montoARS > 0;
        const hayUSD = montoUSD > 0;
        if (!hayARS && !hayUSD) return { valorMostrar: `<span class="resumen-valor-vacio">${textoVacio}</span>`, hayARS, hayUSD };
        let valorMostrar;
        if (hayARS && hayUSD) {
            valorMostrar = `<div class="resumen-valor">${this.formatearMoneda(montoARS, 'ars')}</div>
                        <div class="resumen-valor-usd">${this.formatearMoneda(montoUSD, 'usd')}</div>`;
        } else if (hayUSD) {
            valorMostrar = this.formatearMoneda(montoUSD, 'usd');
        } else {
            valorMostrar = this.formatearMoneda(montoARS, 'ars');
        }
        return { valorMostrar, hayARS, hayUSD };
    }

    // ── Resumen unificado ──────────────────────────────────────────

    mostrarPendienteEnResumen() {
        this.mostrandoPagadoMes = false;
        this._renderResumen('pendiente');
    }

    mostrarPagadoEnResumen() {
        this.mostrandoPagadoMes = true;
        this._renderResumen('pagado');
    }

    _renderResumen(tipo) {
        const esPendiente = tipo === 'pendiente';
        const fechaFormateada = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const colorBorde = this.obtenerColorBordeMasPrioritario();

        const totalARS = this.datosResumen.totalPeriodoARS || 0;

        let montoARS, montoUSD, porcentajePagado, contador, textoVacio, icono, titulo, label;

        if (esPendiente) {
            montoARS = this.datosResumen.pendienteARS || 0;
            montoUSD = this.datosResumen.pendienteUSD || 0;
            const pagadoDelMesARS = this.datosResumen.pagadoMesARS || 0;
            porcentajePagado = totalARS > 0 ? Math.min((pagadoDelMesARS / totalARS) * 100, 100) : (montoUSD === 0 ? 100 : 0);
            contador = this.datosResumen.cantidadPendientesEsteMes || 0;
            textoVacio = 'Al día';
            icono = '#icon-deuda';
            titulo = 'Resumen de Deuda';
            label = `Pendiente${contador > 0 ? ` (${contador})` : ''}`;
        } else {
            montoARS = this.datosResumen.pagadoMesARS || 0;
            montoUSD = this.datosResumen.pagadoMesUSD || 0;
            porcentajePagado = totalARS > 0 ? Math.min((montoARS / totalARS) * 100, 100) : 0;
            contador = this.datosResumen.cantidadPagadasVencenEsteMes || 0;
            textoVacio = 'Sin pagos';
            icono = '#icon-pagado';
            titulo = 'Resumen de Pagos';
            label = `Pagado${contador > 0 ? ` (${contador})` : ''}`;
        }

        const estadoActual = { tipo, montoARS, montoUSD, porcentajePagado, colorBorde, fecha: fechaFormateada };
        const debeAnimar = this._objetosCambiaron(this.ultimoEstadoResumen, estadoActual);

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
        <div class="resumen-progreso">
            <div class="resumen-progreso-barra" id="resumen-progreso-barra"></div>
        </div>
        <div class="resumen-label">${label}</div>
        <div class="resumen-fecha">${fechaFormateada}</div>
    </div>
</div>
`;
        document.getElementById('resumen-mes').innerHTML = resumenHTML;

        // Aplicar width de la barra de progreso via custom property (no viola CSP)
        const barra = document.getElementById('resumen-progreso-barra');
        if (barra) barra.style.setProperty('--barra-w', `${porcentajePagado}%`);

        // Animar si los datos cambiaron
        if (debeAnimar) {
            const toggle = document.getElementById('resumen-toggle');
            if (toggle) {
                toggle.classList.remove('anim-slide-down-fade');
                void toggle.offsetWidth;
                toggle.classList.add('anim-slide-down-fade');
            }
        }
        localStorage.setItem('resumen-mostrar-pagado', esPendiente ? 'false' : 'true');
        this._aplicarBlurResumen(hayARS || hayUSD);
        this.ultimoEstadoResumen = estadoActual;
        this._actualizarBordeResumen(colorBorde);
    }

    abrirModalInfoResumen() {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth();
        const anioActual = hoy.getFullYear();

        // Grupos de facturas
        const vencenEsteMes = []; // facturas cuyo vencimiento es este mes
        const pagadasOtroMes = []; // pagadas este mes pero vencían otro mes

        this.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                if (factura.monto < 0) return;

                const fechaVenc = this._parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesActual && fechaVenc.getFullYear() === anioActual;

                const pagadaEsteMes = factura.pagada && factura.fechaPago && (() => {
                    const fp = this._parseDate(factura.fechaPago);
                    return fp.getMonth() === mesActual && fp.getFullYear() === anioActual;
                })();

                if (venceEsteMes) {
                    let estado, badgeClass;
                    if (factura.conCredito) {
                        estado = 'Con crédito'; badgeClass = 'badge-pagada-credito';
                    } else if (factura.pagada && pagadaEsteMes) {
                        estado = 'Pagada este mes'; badgeClass = 'badge-pagada-mes';
                    } else if (factura.pagada && !pagadaEsteMes) {
                        const mesPago = this._parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' });
                        estado = `Pagada en ${mesPago}`; badgeClass = 'badge-pagada-antes';
                    } else if (!factura.pagada && fechaVenc < hoy) {
                        estado = 'Vencida'; badgeClass = 'badge-vencida';
                    } else {
                        estado = 'Pendiente'; badgeClass = 'badge-pendiente';
                    }
                    vencenEsteMes.push({ servicio: servicio.nombre, factura, estado, badgeClass });
                } else if (pagadaEsteMes) {
                    const mesNombre = fechaVenc.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    pagadasOtroMes.push({ servicio: servicio.nombre, factura, mesVenc: mesNombre });
                }
            });
        });

        const renderFila = ({ servicio, factura, estado, badgeClass }) => `
                    <div class="info-resumen-fila">
                        <div class="info-resumen-fila-izq">
                            <span class="info-resumen-nombre">${servicio}</span>
                            <span class="info-resumen-badge ${badgeClass}">${estado}</span>
                        </div>
                        <span class="info-resumen-monto">${this.formatearMoneda(factura.monto, factura.moneda || 'ars')}</span>
                    </div>`;

        const renderFilaOtroMes = ({ servicio, factura, mesVenc }) => `
                    <div class="info-resumen-fila">
                        <div class="info-resumen-fila-izq">
                            <span class="info-resumen-nombre">${servicio}</span>
                            <span class="info-resumen-badge badge-pagada-otro-mes">Venció ${mesVenc}</span>
                        </div>
                        <span class="info-resumen-monto">${this.formatearMoneda(factura.monto, factura.moneda || 'ars')}</span>
                    </div>`;

        let html = '';

        if (vencenEsteMes.length > 0) {
            html += `<div class="info-resumen-grupo">
                        <div class="info-resumen-grupo-titulo">Vencen este mes</div>
                        ${vencenEsteMes.map(renderFila).join('')}
                    </div>`;
        }

        if (pagadasOtroMes.length > 0) {
            html += `<div class="info-resumen-grupo">
                        <div class="info-resumen-grupo-titulo">Pagadas este mes (otro vencimiento)</div>
                        ${pagadasOtroMes.map(renderFilaOtroMes).join('')}
                    </div>`;
        }

        if (!html) {
            html = '<div class="text-center-muted">Sin movimientos este mes</div>';
        }

        document.getElementById('modal-info-resumen-body').innerHTML = html;
        this.abrirModal('modal-info-resumen');
    }

    toggleResumen() {
        const resumenActual = document.getElementById('resumen-toggle');

        // Si está blureado, desblurear y no cambiar vista
        const estaBlureado = resumenActual && resumenActual.classList.contains('resumen-blur');
        if (!this.resumenDesblurado && estaBlureado) {
            this.resumenDesblurado = true;
            resumenActual.classList.remove('resumen-blur');
            return;
        }
        if (!this.resumenDesblurado) this.resumenDesblurado = true;

        // Ya desblurado: toggle normal de vista
        if (resumenActual) {
            resumenActual.classList.remove('anim-slide-up-fade');
            void resumenActual.offsetWidth;
            resumenActual.classList.add('anim-slide-up-fade');
            setTimeout(() => {
                if (this.mostrandoPagadoMes) {
                    this.mostrarPendienteEnResumen();
                } else {
                    this.mostrarPagadoEnResumen();
                }
                // Mantener desblurado tras el cambio de vista
                const nuevo = document.getElementById('resumen-toggle');
                if (nuevo) nuevo.classList.remove('resumen-blur');
            }, 190);
        } else {
            if (this.mostrandoPagadoMes) {
                this.mostrarPendienteEnResumen();
            } else {
                this.mostrarPagadoEnResumen();
            }
            const nuevo = document.getElementById('resumen-toggle');
            if (nuevo) nuevo.classList.remove('resumen-blur');
        }
    }

    actualizarEstadisticas() {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth();
        const añoActual = hoy.getFullYear();

        // Obtener el mes seleccionado del selector (si existe)
        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        const yaExisteSelector = !!selectMes;

        if (selectMes && selectMes.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año);
            mesSeleccionado = parseInt(mes) - 1;
        } else {
            // Por defecto usar mes actual
            mesSeleccionado = mesActual;
            añoSeleccionado = añoActual;
        }

        // Categoría activa (filtro)
        const categoriaActiva = this._estadisticaCategoriaActiva || null;

        // Calcular estadísticas del mes seleccionado
        let cantidadPendientes = 0;
        let cantidadPagadas = 0;
        let cantidadVencidas = 0;
        let cantidadFacturasMes = 0;
        let totalMesARS = 0, totalMesUSD = 0;
        let totalPagadoMesARS = 0, totalPagadoMesUSD = 0;
        let totalIngresosARS = 0, totalIngresosUSD = 0;

        this.servicios.forEach(servicio => {
            // Filtrar por categoría si hay una activa (ingresos siempre pasan)
            if (categoriaActiva && servicio.id !== this.SERVICIO_INGRESOS_ID) {
                const catServicio = servicio.categoria || '';
                if (catServicio !== categoriaActiva) return;
            }

            servicio.facturas.forEach(factura => {
                const fechaFactura = this._parseDate(factura.fecha);
                const mesFactura = fechaFactura.getMonth();
                const añoFactura = fechaFactura.getFullYear();

                // Solo contar facturas del mes seleccionado
                if (mesFactura === mesSeleccionado && añoFactura === añoSeleccionado) {
                    const moneda = factura.moneda || 'ars';

                    // Si es del servicio de ingresos, solo sumar al total de ingresos
                    if (servicio.id === this.SERVICIO_INGRESOS_ID) {
                        if (moneda === 'usd') totalIngresosUSD += factura.monto;
                        else totalIngresosARS += factura.monto;
                        return;
                    }

                    // Saldos a favor (negativos): cuentan como pagadas pero no suman al monto
                    if (factura.monto < 0) {
                        cantidadPagadas++;
                        return;
                    }

                    // Facturas normales (positivas)
                    // Con categoría activa se muestra el monto real sin excluir crédito
                    cantidadFacturasMes++;
                    if (!factura.conCredito || categoriaActiva) {
                        if (moneda === 'usd') totalMesUSD += factura.monto;
                        else totalMesARS += factura.monto;
                    }

                    if (!factura.pagada) {
                        const vencimiento = this._parseDate(factura.fecha);
                        vencimiento.setHours(0, 0, 0, 0);
                        if (vencimiento < hoy) {
                            cantidadVencidas++;
                        } else {
                            cantidadPendientes++;
                        }
                    }
                }

                // Pagado en este mes por fecha de pago (sin importar el vencimiento)
                if (factura.pagada && factura.fechaPago && factura.monto > 0
                    && servicio.id !== this.SERVICIO_INGRESOS_ID) {
                    const fechaPago = this._parseDate(factura.fechaPago);
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

        // Crear un hash del estado actual para comparación
        const estadoActual = {
            totalMesARS, totalMesUSD,
            totalPagadoMesARS, totalPagadoMesUSD,
            cantidadPendientes,
            cantidadPagadas,
            cantidadVencidas,
            cantidadFacturasMes,
            totalIngresosARS, totalIngresosUSD,
            mesSeleccionado,
            añoSeleccionado,
            categoriaActiva
        };

        // Comparar con el estado anterior
        const estadoCambio = this._objetosCambiaron(this.ultimoEstadoEstadisticas, estadoActual);

        // Función para renderizar el contenido
        const renderizarContenido = () => {
            const hayUSDMes = totalMesUSD > 0;
            const hayARSMes = totalMesARS > 0;

            const montoHTML = hayARSMes
                ? this.formatearMoneda(totalMesARS, 'ars')
                : hayUSDMes
                    ? this.formatearMoneda(totalMesUSD, 'usd')
                    : this.formatearMoneda(0, 'ars');

            const montoUSDItem = hayUSDMes ? `
    <div class="calculador-resultado-item">
        <span class="estadistica-label">Monto USD</span>
        <span class="estadistica-valor">${this.formatearMoneda(totalMesUSD, 'usd')}</span>
    </div>` : '';

            let ingresosHTML = '';
            if (this.ingresosHabilitado()) {
                const hayIngUSD = totalIngresosUSD > 0;
                const hayIngARS = totalIngresosARS > 0;
                const ingMontoHTML = hayIngARS
                    ? this.formatearMoneda(totalIngresosARS, 'ars')
                    : hayIngUSD
                        ? this.formatearMoneda(totalIngresosUSD, 'usd')
                        : this.formatearMoneda(0, 'ars');

                const ingUSDItem = hayIngUSD ? `
    <div class="calculador-resultado-item">
        <span class="estadistica-label">Ingresos USD</span>
        <span class="estadistica-valor">${this.formatearMoneda(totalIngresosUSD, 'usd')}</span>
    </div>` : '';

                // Porcentaje de ingresos: solo si hay ingresos ARS y facturas ARS en el mes
                let porcentajeIngresosHTML = '';
                if (hayIngARS && totalMesARS > 0) {
                    const porcentaje = (totalMesARS / totalIngresosARS) * 100;
                    const porcentajeTexto = porcentaje.toFixed(1) + '%';
                    // Color según el nivel: verde < 25%, azul < 50%, amarillo < 75%, rojo >= 75%
                    const colorClass = porcentaje < 25 ? 'text-green' : porcentaje < 50 ? 'text-blue' : porcentaje < 75 ? 'text-gold' : 'text-red';
                    porcentajeIngresosHTML = `
<div class="calculador-resultado-item">
    <span class="estadistica-label">% del ingreso</span>
    <span class="estadistica-valor ${colorClass}">${porcentajeTexto}</span>
</div>`;
                }

                ingresosHTML = `
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="ingresos">
        <span class="estadistica-label">Ingresos</span>
        <span class="estadistica-valor">${ingMontoHTML}</span>
    </div>
    ${ingUSDItem}
    ${porcentajeIngresosHTML}`;
            }

            const itemsHTML = `
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas">
        <span class="estadistica-label">Monto en facturas</span>
        <span class="estadistica-valor">${montoHTML}</span>
    </div>
    ${montoUSDItem}
    ${totalPagadoMesARS > 0 ? `
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto">
        <span class="estadistica-label">Monto pagado</span>
        <span class="estadistica-valor">${this.formatearMoneda(totalPagadoMesARS, 'ars')}</span>
    </div>` : ''}
    ${totalPagadoMesUSD > 0 ? `
    <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagado-monto">
        <span class="estadistica-label">Monto USD (Pagado)</span>
        <span class="estadistica-valor">${this.formatearMoneda(totalPagadoMesUSD, 'usd')}</span>
    </div>` : ''}
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="facturas">
            <span class="estadistica-label">Facturas</span>
            <span class="estadistica-valor">${cantidadFacturasMes}</span>
        </div>    
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pendientes">
            <span class="estadistica-label">Pendientes</span>
            <span class="estadistica-valor">${cantidadPendientes}</span>
        </div>
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="pagadas">
            <span class="estadistica-label">Pagadas</span>
            <span class="estadistica-valor">${cantidadPagadas}</span>
        </div>
        <div class="calculador-resultado-item" data-action="debug-estadisticas" data-tipo="vencidas">
            <span class="estadistica-label">Vencidas</span>
            <span class="estadistica-valor">${cantidadVencidas}</span>
        </div>
        ${ingresosHTML}
`;

            const lista = document.querySelector('#estadisticas-mensual-container .estadisticas-lista');
            if (lista) {
                lista.innerHTML = itemsHTML;
                // Solo animar si hubo cambio
                if (estadoCambio) {
                    lista.classList.add('opacity-0');
                    setTimeout(() => {
                        lista.classList.remove('anim-slide-down-fade', 'opacity-0');
                        void lista.offsetWidth;
                        lista.classList.add('anim-slide-down-fade', 'opacity-1');
                    }, 10);
                }
            }
        };

        // Si no hay datos, forzar regeneración completa
        const hayDatos = this.servicios.length > 0 &&
            this.servicios.some(s => s.facturas && s.facturas.length > 0);

        // Si es la primera vez O no hay datos, crear/recrear toda la estructura
        if (!yaExisteSelector || !hayDatos) {
            const estadisticasHTML = `
    <div class="calculador-campo">
    <label class="calculador-label">Mes</label>
    <div class="custom-select-wrapper" id="select-mes-estadisticas-csd">
        <div class="custom-select-trigger">
            <span class="csd-label"></span>
            <svg class="csd-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        </div>
        <div class="custom-select-dropdown"></div>
    </div>
    <select id="select-mes-estadisticas" class="select-mes-oculto"></select>
    </div>
    <div id="estadisticas-categorias-tags"></div>
    <div class="estadisticas-lista"></div>
`;
            document.getElementById('estadisticas-mensual-container').innerHTML = estadisticasHTML;

            // Poblar select nativo y montar custom dropdown
            const select = document.getElementById('select-mes-estadisticas');
            select.innerHTML = this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado);
            const wrapper = document.getElementById('select-mes-estadisticas-csd');
            const cs = new CustomSelect(wrapper, select, () => this.actualizarEstadisticas());
            wrapper._customSelect = cs;

            // Renderizar tags de categoría
            this._renderTagsCategoriaEstadisticas();

            // Renderizar contenido inicial
            renderizarContenido();
            this.ultimoEstadoEstadisticas = estadoActual;
        } else {
            // Si hay datos y el selector ya existe, solo actualizar las opciones
            const selectActual = document.getElementById('select-mes-estadisticas');
            if (selectActual) {
                const valorActual = selectActual.value;
                selectActual.innerHTML = this.generarOpcionesMeses(mesSeleccionado, añoSeleccionado);

                // Intentar mantener la selección anterior si existe
                if (Array.from(selectActual.options).some(opt => opt.value === valorActual)) {
                    selectActual.value = valorActual;
                }
                // Refrescar custom dropdown
                const csd = document.getElementById('select-mes-estadisticas-csd');
                if (csd && csd._customSelect) csd._customSelect.refresh();
            }

            // Actualizar tags de categoría
            this._renderTagsCategoriaEstadisticas();

            // Solo animar si el estado cambió
            const lista = document.querySelector('#estadisticas-mensual-container .estadisticas-lista');
            if (lista && estadoCambio) {
                // Animación de salida
                lista.classList.remove('anim-slide-up-fade');
                void lista.offsetWidth;
                lista.classList.add('anim-slide-up-fade');

                // Después de la animación de salida, cambiar contenido
                setTimeout(() => {
                    renderizarContenido();
                    this.ultimoEstadoEstadisticas = estadoActual;
                }, 190);
            } else if (lista && !estadoCambio) {
                // No animar, pero actualizar contenido por si hay cambios de formato
                renderizarContenido();
            }
        }
    }

    _renderTagsCategoriaEstadisticas() {
        const container = document.getElementById('estadisticas-categorias-tags');
        if (!container) return;

        const cats = this._getCategorias();
        // Solo mostrar si hay categorías asignadas a algún servicio normal
        const catsUsadas = cats.filter(c =>
            this.servicios.some(s => s.id !== this.SERVICIO_INGRESOS_ID && s.categoria === c)
        );

        if (catsUsadas.length === 0) {
            container.innerHTML = '';
            return;
        }

        const activa = this._estadisticaCategoriaActiva || null;

        const tagsHTML = catsUsadas.map(c => {
            const esActiva = c === activa;
            return `<button class="est-cat-tag${esActiva ? ' est-cat-tag--activa' : ''}" data-cat="${this.escaparAtributoHTML(c)}">${this.escaparHTML(c)}</button>`;
        }).join('');

        container.innerHTML = `<div class="est-cat-tags-row">${tagsHTML}</div>`;

        container.querySelectorAll('.est-cat-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                if (this._estadisticaCategoriaActiva === cat) {
                    // Desactivar filtro
                    this._estadisticaCategoriaActiva = null;
                } else {
                    this._estadisticaCategoriaActiva = cat;
                }
                this.ultimoEstadoEstadisticas = null; // forzar re-render
                this.actualizarEstadisticas();
            });
        });
    }

    toggleEstadisticas() {
        const estadisticasContent = document.getElementById('estadisticas-content');
        const chevron = document.getElementById('estadisticas-chevron');

        estadisticasContent.classList.toggle('collapsed');
        chevron.classList.toggle('collapsed');

        const estaColapsado = estadisticasContent.classList.contains('collapsed');
        localStorage.setItem('estadisticas-collapsed', estaColapsado);

        if (!estaColapsado) {
            // Cargar el tipo seleccionado
            document.getElementById('estadisticas-tipo').value = this.tipoEstadisticaActual;
            this.cambiarTipoEstadistica();
        }
    }

    cambiarTipoEstadistica() {
        const mensualContainer = document.getElementById('estadisticas-mensual-container');
        const individualContainer = document.getElementById('estadisticas-individual-container');

        if (this.tipoEstadisticaActual === 'mensual') {
            mensualContainer.classList.add('visible');
            mensualContainer.classList.remove('hidden');
            individualContainer.classList.add('hidden');
            individualContainer.classList.remove('visible');
            this.actualizarEstadisticas();
        } else if (this.tipoEstadisticaActual === 'individual') {
            mensualContainer.classList.add('hidden');
            mensualContainer.classList.remove('visible');
            individualContainer.classList.add('visible');
            individualContainer.classList.remove('hidden');
            this.calcularPeriodo();
        }
    }

    // ========================================
    // CALCULADOR
    // ========================================

    inicializarCalculador() {
        const selectServicio = document.getElementById('calculador-servicio');
        if (!selectServicio) return;

        this.actualizarSelectServicios();

        // Montar custom dropdown de servicio
        const csdWrapper = document.getElementById('calculador-servicio-csd');
        if (csdWrapper && !csdWrapper._customSelect) {
            const cs = new CustomSelect(csdWrapper, selectServicio, () => this.calcularPeriodo());
            csdWrapper._customSelect = cs;
        }

        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        const btnDesde = document.getElementById('btn-calculador-desde-hoy');
        const btnHasta = document.getElementById('btn-calculador-hasta-hoy');

        selectServicio.addEventListener('change', () => this.calcularPeriodo());
        inputDesde.addEventListener('change', () => this.calcularPeriodo());
        inputHasta.addEventListener('change', () => this.calcularPeriodo());

        btnDesde.addEventListener('click', () => {
            inputDesde.value = inputDesde.value ? '' : this.obtenerFechaLocal();
            this.calcularPeriodo();
        });

        btnHasta.addEventListener('click', () => {
            inputHasta.value = inputHasta.value ? '' : this.obtenerFechaLocal();
            this.calcularPeriodo();
        });
    }

    actualizarSelectServicios() {
        const select = document.getElementById('calculador-servicio');
        if (!select) return;

        const valorActual = select.value;

        // Obtener servicios activos ordenados alfabéticamente
        const serviciosActivos = this.servicios
            .filter(s => s.id !== this.SERVICIO_INGRESOS_ID)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

        // Construir opciones
        let html = '<option value="">Seleccionar servicio...</option>';

        // Agregar servicios normales
        serviciosActivos.forEach(servicio => {
            const selected = servicio.id === valorActual ? 'selected' : '';
            html += `<option value="${this.escaparAtributoHTML(servicio.id)}" ${selected}>${this.escaparHTML(servicio.nombre)}</option>`;
        });

        // Agregar servicio de ingresos si está habilitado
        if (this.ingresosHabilitado()) {
            const servicioIngresos = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
            if (servicioIngresos) {
                const selected = this.SERVICIO_INGRESOS_ID === valorActual ? 'selected' : '';
                html += `<option value="${this.SERVICIO_INGRESOS_ID}" ${selected}>Ingresos</option>`;
            }
        }

        select.innerHTML = html;

        // Refrescar custom dropdown si ya existe
        const csdWrapper = document.getElementById('calculador-servicio-csd');
        if (csdWrapper && csdWrapper._customSelect) csdWrapper._customSelect.refresh();

        // Si el servicio seleccionado ya no existe, limpiar la selección y recalcular
        if (valorActual && !this.servicios.find(s => s.id === valorActual)) {
            select.value = '';
            this.calcularPeriodo();
        } else if (valorActual) {
            // Si hay un servicio seleccionado válido, recalcular
            this.calcularPeriodo();
        }
    }

    calcularPeriodo() {
        const selectServicio = document.getElementById('calculador-servicio');
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');
        const resultadosContainer = document.getElementById('calculador-resultados');

        if (!selectServicio || !inputDesde || !inputHasta || !resultadosContainer) {
            return;
        }

        const servicioId = selectServicio.value;
        const desde = inputDesde.value;
        const hasta = inputHasta.value;

        let totalRegistros = 0;
        let variacionTexto = '0%';
        let variacionUSDTexto = null;

        // Variables de moneda — se calculan una sola vez
        let _arsTotal = 0, _usdTotal = 0;
        let _arsCount = 0, _usdCount = 0;

        if (servicioId) {
            const servicio = this.servicios.find(s => s.id === servicioId);

            if (servicio) {
                const esServicioIngresos = servicioId === this.SERVICIO_INGRESOS_ID;

                // Filtrar facturas por rango de fechas (único pase)
                let facturasFiltradas = servicio.facturas;

                if (desde) {
                    const fechaDesde = this._parseDate(desde);
                    facturasFiltradas = facturasFiltradas.filter(f =>
                        this._parseDate(f.fecha) >= fechaDesde
                    );
                }

                if (hasta) {
                    const fechaHasta = this._parseDate(hasta);
                    facturasFiltradas = facturasFiltradas.filter(f =>
                        this._parseDate(f.fecha) <= fechaHasta
                    );
                }

                // Ordenar por fecha (más antiguas primero) — necesario para variación
                facturasFiltradas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

                totalRegistros = facturasFiltradas.length;

                // Calcular totales por moneda — único pase, reutilizado abajo
                facturasFiltradas.forEach(f => {
                    if ((f.moneda || 'ars') === 'usd') {
                        _usdTotal += f.monto;
                        _usdCount++;
                    } else {
                        _arsTotal += f.monto;
                        _arsCount++;
                    }
                });

                // Para variación: excluir complementarios si es servicio de ingresos
                let facturasParaVariacion = facturasFiltradas;
                if (esServicioIngresos) {
                    facturasParaVariacion = facturasFiltradas.filter(f => f.tipo !== 'complementario');
                }

                // Helper para calcular variación dado un array de facturas
                const calcularVariacion = (facturas) => {
                    const total = facturas.length;
                    if (total >= 2) {
                        let promPrim, promUlt;
                        if (total <= 3) {
                            promPrim = facturas[0].monto;
                            promUlt = facturas[total - 1].monto;
                        } else if (total <= 8) {
                            const mitad = Math.floor(total / 2);
                            promPrim = facturas.slice(0, mitad).reduce((s, f) => s + f.monto, 0) / mitad;
                            promUlt = facturas.slice(-mitad).reduce((s, f) => s + f.monto, 0) / mitad;
                        } else {
                            const g = Math.min(6, Math.max(3, Math.floor(total * 0.3)));
                            promPrim = facturas.slice(0, g).reduce((s, f) => s + f.monto, 0) / g;
                            promUlt = facturas.slice(-g).reduce((s, f) => s + f.monto, 0) / g;
                        }
                        if (promPrim !== 0) {
                            const v = ((promUlt - promPrim) / Math.abs(promPrim)) * 100;
                            return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
                        } else {
                            return promUlt > 0 ? '+∞' : '0%';
                        }
                    } else if (total === 1) {
                        return 'N/A';
                    }
                    return null;
                };

                // Calcular variación por moneda usando las facturas ya filtradas
                const facturasVariacionARS = facturasParaVariacion.filter(f => (f.moneda || 'ars') === 'ars');
                const facturasVariacionUSD = facturasParaVariacion.filter(f => (f.moneda || 'ars') === 'usd');

                const varARS = calcularVariacion(facturasVariacionARS);
                const varUSD = calcularVariacion(facturasVariacionUSD);

                if (varARS !== null) {
                    variacionTexto = varARS;
                } else if (facturasVariacionARS.length === 0 && facturasVariacionUSD.length > 0) {
                    variacionTexto = null;
                } else if (facturasParaVariacion.length === 0 && esServicioIngresos && totalRegistros > 0) {
                    variacionTexto = 'Solo extras';
                } else if (facturasVariacionARS.length === 1) {
                    variacionTexto = 'N/A';
                }

                variacionUSDTexto = varUSD;
            }
        }

        // Hash del estado para comparar y evitar re-renders innecesarios
        const estadoCalculador = {
            servicioId, desde, hasta,
            totalRegistros,
            _arsTotal, _usdTotal,
            variacionTexto, variacionUSDTexto
        };

        const calculadorCambio = this._objetosCambiaron(this.ultimoEstadoCalculador, estadoCalculador);

        // Construir HTML reutilizando las vars ya calculadas (_arsTotal, _usdTotal, etc.)
        const _hayARS = _arsTotal !== 0;
        const _hayUSD = _usdTotal !== 0;

        const _montoHTML = _hayARS
            ? this.formatearMoneda(_arsTotal, 'ars')
            : _hayUSD ? this.formatearMoneda(_usdTotal, 'usd') : this.formatearMoneda(0, 'ars');

        const _montoUSDItem = _hayUSD ? `
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Monto Total USD</span>
        <span class="calculador-resultado-valor">${this.formatearMoneda(_usdTotal, 'usd')}</span>
    </div>` : '';

        const _promARS = _arsCount > 0 ? _arsTotal / _arsCount : 0;
        const _promUSD = _usdCount > 0 ? _usdTotal / _usdCount : 0;
        const _promHTML = _hayARS
            ? this.formatearMoneda(_promARS, 'ars')
            : _hayUSD ? this.formatearMoneda(_promUSD, 'usd') : this.formatearMoneda(0, 'ars');

        const _promUSDItem = _hayUSD ? `
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Monto Promedio USD</span>
        <span class="calculador-resultado-valor">${this.formatearMoneda(_promUSD, 'usd')}</span>
    </div>` : '';

        const _varUSDItem = variacionUSDTexto !== null && variacionUSDTexto !== undefined ? `
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Variación USD</span>
        <span class="calculador-resultado-valor">${variacionUSDTexto}</span>
    </div>` : '';

        const generarResultadosHTML = (registros, variacion) => `
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Facturas</span>
        <span class="calculador-resultado-valor">${registros}</span>
    </div>
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Monto Total</span>
        <span class="calculador-resultado-valor">${_montoHTML}</span>
    </div>
    ${_montoUSDItem}
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Monto Promedio</span>
        <span class="calculador-resultado-valor">${_promHTML}</span>
    </div>
    ${_promUSDItem}
    ${variacion !== null && variacion !== undefined ? `
    <div class="calculador-resultado-item">
        <span class="calculador-resultado-label">Variación</span>
        <span class="calculador-resultado-valor">${variacion}</span>
    </div>` : ''}
    ${_varUSDItem}
`;

        const renderizarResultados = () => {
            resultadosContainer.innerHTML = generarResultadosHTML(totalRegistros, variacionTexto);

            if (calculadorCambio) {
                resultadosContainer.classList.add('opacity-0');
                setTimeout(() => {
                    resultadosContainer.classList.remove('anim-slide-down-fade', 'opacity-0');
                    void resultadosContainer.offsetWidth;
                    resultadosContainer.classList.add('anim-slide-down-fade', 'opacity-1');
                }, 10);
            }
        };

        if (calculadorCambio) {
            resultadosContainer.classList.remove('anim-slide-up-fade');
            void resultadosContainer.offsetWidth;
            resultadosContainer.classList.add('anim-slide-up-fade');
            setTimeout(() => {
                renderizarResultados();
                this.ultimoEstadoCalculador = estadoCalculador;
            }, 190);
        } else {
            renderizarResultados();
        }
    }

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

    generarOpcionesMeses(mesSeleccionado, añoSeleccionado) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

        // Obtener todos los meses que tienen facturas
        const mesesConFacturas = new Set();

        this.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).forEach(servicio => {
            servicio.facturas.forEach(factura => {
                const fechaFactura = this._parseDate(factura.fecha);
                const año = fechaFactura.getFullYear();
                const mes = fechaFactura.getMonth();
                const claveMes = `${año}-${String(mes + 1).padStart(2, '0')}`;
                mesesConFacturas.add(claveMes);
            });
        });

        // Ordenar meses de más reciente a más antiguo
        const mesesOrdenados = Array.from(mesesConFacturas).sort((a, b) => b.localeCompare(a));

        // Si no hay meses con facturas, mostrar solo el mes actual
        if (mesesOrdenados.length === 0) {
            const claveActual = `${añoSeleccionado}-${String(mesSeleccionado + 1).padStart(2, '0')}`;
            return `<option value="${claveActual}">${meses[mesSeleccionado]} ${añoSeleccionado}</option>`;
        }

        // Generar opciones
        return mesesOrdenados.map(claveMes => {
            const [año, mes] = claveMes.split('-');
            const nombreMes = meses[parseInt(mes) - 1];
            const esSeleccionado = parseInt(año) === añoSeleccionado && parseInt(mes) - 1 === mesSeleccionado;
            return `<option value="${claveMes}" ${esSeleccionado ? 'selected' : ''}>${nombreMes} ${año}</option>`;
        }).join('');
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
                    this.toggleServicioCalculadora(servicioId);
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
            this.actualizarMenuAgregar();
        });

        // Restaurar posición de scroll
        requestAnimationFrame(() => {
            window.scrollTo(0, scrollPos);
        });

        // Solo actualizar resumen y calculador si no estamos filtrando por búsqueda
        if (!this.enModoBusqueda) {
            this.actualizarResumenMes();
            this.actualizarSelectServicios();
            this.calcularPeriodo();
        }
    }

    crearServicioIngresos() {
        const servicioIngresos = {
            id: this.SERVICIO_INGRESOS_ID,
            nombre: 'Ingresos',
            facturas: [],
            activo: false  // ← AGREGADO: Deshabilitado por defecto
        };
        this.servicios.push(servicioIngresos);
        this.guardarDatos();
    }

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

    abrirModalFacturasServicio(servicioId) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;

        const modal = document.getElementById('modal-facturas-servicio');
        const titulo = document.getElementById('modal-facturas-titulo');
        const listaFacturas = document.getElementById('lista-facturas-modal');

        titulo.textContent = servicio.nombre;
        const tagCategoria = document.getElementById('modal-facturas-categoria');
        if (tagCategoria) {
            if (servicio.categoria) {
                tagCategoria.textContent = servicio.categoria;
                tagCategoria.classList.add('visible');
            } else {
                tagCategoria.classList.remove('visible');
            }
        }

        if (servicio.facturas.length === 0) {
            listaFacturas.innerHTML = '<p class="mensaje-sin-facturas">No hay facturas registradas</p>';
        } else {
            const facturasOrdenadas = [...servicio.facturas].sort((a, b) =>
                new Date(b.fecha) - new Date(a.fecha)
            );

            const grupos = this.agruparPorAno(facturasOrdenadas);

            listaFacturas.innerHTML = grupos.map((grupo, index) => {
                const facturasHTML = grupo.items
                    .map(f => this.generarHTMLFactura(f, 'editar-factura'))
                    .join('');

                return this.generarGrupoAno(
                    grupo.ano,
                    grupo.items,
                    facturasHTML,
                    'factura',
                    index
                );
            }).join('');
        }

        modal.dataset.servicioId = servicioId;
        this.abrirModal('modal-facturas-servicio');
        const anoGuardado = this._anoExpandidoFacturas[servicioId];
        if (anoGuardado) {
            this._restaurarAnoExpandido(anoGuardado);
            this._anoExpandidoFacturas[servicioId] = null;
        }
    }

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

    agruparPorAno(items) {
        const itemsPorAno = {};
        items.forEach(item => {
            const ano = this._parseDate(item.fecha).getFullYear();
            if (!itemsPorAno[ano]) {
                itemsPorAno[ano] = [];
            }
            itemsPorAno[ano].push(item);
        });

        return Object.keys(itemsPorAno)
            .sort((a, b) => b - a)
            .map(ano => ({
                ano,
                items: itemsPorAno[ano],
                cantidad: itemsPorAno[ano].length
            }));
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
                <svg class="icon facturas-grupo-chevron ${collapsed}"><use href="#icon-chevron-down"/></svg>
            </div>
            <div class="facturas-grupo-contenido ${collapsed}">
                ${itemHTML}
            </div>
        </div>
    `;
    }

    // ── Categorías ──────────────────────────────────────────────
    _getCategorias() {
        return JSON.parse(localStorage.getItem('categorias-servicios') || '[]');
    }

    _saveCategorias(cats) {
        localStorage.setItem('categorias-servicios', JSON.stringify(cats));
    }

    _poblarSelectCategorias(selectId, valorSeleccionado = '') {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        const cats = this._getCategorias();
        // Mantener primera opción "Sin categoría"
        sel.innerHTML = `<option value="">Sin categoría</option>`;
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            if (c === valorSeleccionado) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    abrirModalNuevaCategoria(targetSelectId) {
        this._categoriaTargetSelect = targetSelectId;
        // Recordar qué modal de servicio estaba abierto para reabrirlo al volver
        this._modalServicioOrigen = document.querySelector('.modal.active')?.id || null;
        if (this._modalServicioOrigen) this.cerrarModal(this._modalServicioOrigen);
        document.getElementById('nueva-categoria-nombre').value = '';
        this._renderCategorias();
        this.abrirModal('modal-nueva-categoria');
    }

    cerrarModalCategorias() {
        this.cerrarModal('modal-nueva-categoria');
        if (this._modalServicioOrigen) {
            this.abrirModal(this._modalServicioOrigen);
            this._modalServicioOrigen = null;
        }
    }

    _renderCategorias() {
        const lista = document.getElementById('categorias-lista');
        if (!lista) return;
        const cats = this._getCategorias();
        if (cats.length === 0) {
            lista.innerHTML = `<span class="sin-categorias-text">Sin categorías definidas</span>`;
            return;
        }
        lista.innerHTML = cats.map(c => `
                    <span class="categoria-tag">
                        <button class="categoria-tag-del" data-action="eliminar-categoria" data-cat="${this.escaparAtributoHTML(c)}" title="Eliminar">
                            <svg class="icon">
                        <use href="#icon-cancel" />
                    </svg>
                        </button>
                        ${this.escaparHTML(c)}
                    </span>
                `).join('');
    }

    eliminarCategoria(nombre) {
        let cats = this._getCategorias().filter(c => c !== nombre);
        this._saveCategorias(cats);
        // Si algún servicio usaba esta categoría, limpiarla
        this.servicios.forEach(s => { if (s.categoria === nombre) s.categoria = ''; });
        this.guardarDatos();
        this.guardarEstado();
        this._poblarSelectCategorias('servicio-categoria');
        this._poblarSelectCategorias('editar-servicio-categoria');
        this._renderCategorias();
        this.renderServicios();
        this.mostrarToast('Categoría eliminada', 'success');
    }

    guardarNuevaCategoria() {
        const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
        if (!nombre) {
            this.mostrarToast('El nombre es requerido', 'error');
            return;
        }
        const cats = this._getCategorias();
        if (cats.some(c => c.toLowerCase() === nombre.toLowerCase())) {
            this.mostrarToast('Esa categoría ya existe', 'error');
            return;
        }
        cats.push(nombre);
        cats.sort((a, b) => a.localeCompare(b));
        this._saveCategorias(cats);
        document.getElementById('nueva-categoria-nombre').value = '';
        this._poblarSelectCategorias('servicio-categoria',
            this._categoriaTargetSelect === 'servicio-categoria' ? nombre : '');
        this._poblarSelectCategorias('editar-servicio-categoria',
            this._categoriaTargetSelect === 'editar-servicio-categoria' ? nombre : '');
        const sel = document.getElementById(this._categoriaTargetSelect);
        if (sel) sel.value = nombre;
        this.guardarEstado();
        this._renderCategorias();
        this.mostrarToast('Categoría agregada', 'success');
    }
    // ────────────────────────────────────────────────────────────

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

    borrarFacturasServicio() {
        if (!this.servicioActual) return;
        const servicio = this.servicios.find(s => s.id === this.servicioActual);
        if (!servicio) return;
        const total = servicio.facturas?.length || 0;
        if (total === 0) { this.mostrarToast('No hay facturas para borrar', 'info'); return; }

        if (confirm(`¿Borrar las ${total} factura${total !== 1 ? 's' : ''} de "${servicio.nombre}"? Esta acción no se puede deshacer.`)) {
            servicio.facturas = [];
            this.guardarDatos();
            this.renderServicios();
            this.mostrarToast(`${total} factura${total !== 1 ? 's' : ''} eliminada${total !== 1 ? 's' : ''}`, 'success');
        }
    }

    // ========================================
    // GESTIÓN DE FACTURAS
    // ========================================

    abrirModalFactura(servicioId, facturaId = null, origen = 'servicio') {
        this.cerrarModal('modal-facturas-servicio');
        this.servicioActual = servicioId;
        this.facturaActual = facturaId;
        this.origenModalFactura = origen; // Guardar el origen

        const esEditar = facturaId !== null;
        const modalId = esEditar ? 'modal-editar-factura' : 'modal-agregar-factura';
        const form = document.getElementById(esEditar ? 'form-editar-factura' : 'form-factura');
        const selectServicio = document.getElementById(esEditar ? 'editar-factura-servicio' : 'factura-servicio');
        const btnTogglePagada = document.getElementById(esEditar ? 'btn-editar-toggle-pagada' : 'btn-toggle-pagada');
        const inputFechaPago = document.getElementById(esEditar ? 'editar-factura-fecha-pago' : 'factura-fecha-pago');

        form.reset();
        inputFechaPago.disabled = true;
        btnTogglePagada.classList.remove('pagada');
        // Resetear explícitamente el icono al estado inicial (no pagado)
        const iconUse = btnTogglePagada.querySelector('use');
        if (iconUse) {
            iconUse.setAttribute('href', '#icon-card');
        }

        // Resetear estado del botón toggle de monto (AGREGAR)
        if (!esEditar) {
            this.actualizarEstadoBotonToggle('factura-monto', 'btn-toggle-negativo');
            this.setMonedaBtn('factura-moneda', 'btn-factura-moneda', 'ars');
            const btnCreditoAgregar = document.getElementById('btn-toggle-credito');
            btnCreditoAgregar.classList.remove('btn-credito-visible');
            document.getElementById('factura-con-credito').value = 'false';
            this._resetBtnCredito(btnCreditoAgregar);
        }

        const serviciosOrdenados = [...this.servicios]
            .filter(s => s.id !== this.SERVICIO_INGRESOS_ID)
            .sort((a, b) =>
                a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
            );

        selectServicio.innerHTML = serviciosOrdenados.map(servicio => {
            const selected = servicio.id === servicioId ? 'selected' : '';
            return `<option value="${this.escaparAtributoHTML(servicio.id)}" ${selected}>${this.escaparHTML(servicio.nombre)}</option>`;
        }).join('');

        if (esEditar) {
            // MODO EDITAR
            const servicio = this.servicios.find(s => s.id === servicioId);
            if (servicio) {
                const factura = servicio.facturas.find(f => f.id === facturaId);
                if (factura) {
                    document.getElementById('editar-factura-monto').value = factura.monto;
                    // Actualizar estado del botón según el monto cargado (EDITAR)
                    this.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');

                    document.getElementById('editar-factura-tipo').value = factura.tipo || 'mensual';
                    document.getElementById('editar-factura-fecha').value = factura.fecha;
                    this.setMonedaBtn('editar-factura-moneda', 'btn-editar-factura-moneda', factura.moneda || 'ars');
                    selectServicio.value = servicioId;

                    const btnCredito = document.getElementById('btn-editar-toggle-credito');
                    const inputCredito = document.getElementById('editar-factura-con-credito');
                    if (factura.pagada) {
                        btnTogglePagada.classList.add('pagada');
                        inputFechaPago.disabled = false;
                        if (iconUse) iconUse.setAttribute('href', '#icon-cancel');
                        inputFechaPago.value = factura.fechaPago || this.obtenerFechaLocal();
                        if (btnCredito) btnCredito.classList.add('btn-credito-visible');
                        if (inputCredito) inputCredito.value = factura.conCredito ? 'true' : 'false';
                        if (factura.conCredito) {
                            btnCredito.classList.add('pagada');
                            btnCredito.querySelector('use').setAttribute('href', '#icon-card');
                        } else {
                            this._resetBtnCredito(btnCredito);
                        }
                    } else {
                        if (btnCredito) { btnCredito.classList.remove('btn-credito-visible'); }
                        if (inputCredito) inputCredito.value = 'false';
                        this._resetBtnCredito(btnCredito);
                    }
                }
            }
        }

        this.abrirModal(modalId);
    }

    toggleConCredito(modo = '') {
        const esEditar = modo === 'editar';
        const ids = this._idsFormFactura(esEditar);
        const btn = document.getElementById(ids.btnCredito);
        const input = document.getElementById(ids.conCredito);
        const iconUse = btn.querySelector('use');
        const esCredito = input.value === 'true';

        if (esCredito) {
            input.value = 'false';
            iconUse.setAttribute('href', '#icon-cash');
            btn.classList.remove('pagada');
            btn.title = 'Pagada al contado';
            this.mostrarToast('Pagada al contado', 'info');
        } else {
            input.value = 'true';
            iconUse.setAttribute('href', '#icon-card');
            btn.classList.add('pagada');
            btn.title = 'Pagada con crédito';
            this.mostrarToast('Pagada con crédito', 'info');
        }
    }

    _resetBtnCredito(btn) {
        if (!btn) return;
        const iconUse = btn.querySelector('use');
        if (iconUse) iconUse.setAttribute('href', '#icon-cash');
        btn.classList.remove('pagada');
        btn.title = 'Contado / crédito';
    }

    toggleEstadoPago(btnId = 'btn-toggle-pagada', inputId = 'factura-fecha-pago') {
        const btnTogglePagada = document.getElementById(btnId);
        const inputFechaPago = document.getElementById(inputId);
        const iconUse = btnTogglePagada.querySelector('use');
        const estaPagada = btnTogglePagada.classList.contains('pagada');
        const esEditar = btnId === 'btn-editar-toggle-pagada';

        const btnCredito = document.getElementById(esEditar ? 'btn-editar-toggle-credito' : 'btn-toggle-credito');
        const inputCredito = document.getElementById(esEditar ? 'editar-factura-con-credito' : 'factura-con-credito');

        if (estaPagada) {
            btnTogglePagada.classList.remove('pagada');
            inputFechaPago.disabled = true;
            inputFechaPago.value = '';
            iconUse.setAttribute('href', '#icon-card');
            if (btnCredito) { btnCredito.classList.remove('btn-credito-visible'); }
            if (inputCredito) { inputCredito.value = 'false'; }
            this._resetBtnCredito(btnCredito);
            this.mostrarToast('Factura pendiente', 'info');
        } else {
            btnTogglePagada.classList.add('pagada');
            inputFechaPago.disabled = false;
            inputFechaPago.value = this.obtenerFechaLocal();
            iconUse.setAttribute('href', '#icon-cancel');
            if (btnCredito) { btnCredito.classList.add('btn-credito-visible'); }
            this.mostrarToast('Factura pagada', 'success');
        }
    }

    toggleMontoNegativo(inputId) {
        const input = document.getElementById(inputId);

        if (!input) return;

        const valor = parseFloat(input.value) || 0;

        // Si el valor es 0, no hacer nada
        if (valor === 0) {
            this.mostrarToast('Ingresa un monto primero', 'info');
            return;
        }

        // Cambiar el signo
        input.value = -valor;

        // Toast informativo
        this.mostrarToast(valor > 0 ? 'Saldo a favor' : 'Gasto normal', 'info');

        // Actualizar estado del botón
        const btnId = inputId === 'factura-monto' ? 'btn-toggle-negativo' : 'btn-editar-toggle-negativo';
        this.actualizarEstadoBotonToggle(inputId, btnId);
    }

    actualizarEstadoBotonToggle(inputId, btnId) {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);

        if (!input || !btn) return;

        const valor = parseFloat(input.value) || 0;

        if (valor < 0) {
            btn.classList.add('pagada');
            btn.title = 'Cambiar a gasto normal';
        } else {
            btn.classList.remove('pagada');
            btn.title = 'Cambiar a saldo a favor';
        }
    }

    guardarFactura(e) {
        e.preventDefault();

        // Detectar si estamos en modo agregar o editar
        const esEditar = document.getElementById('modal-editar-factura').classList.contains('active');
        const ids = this._idsFormFactura(esEditar);

        const monto = parseFloat(document.getElementById(ids.monto).value);
        const tipo = document.getElementById(ids.tipo).value;
        const fecha = document.getElementById(ids.fecha).value;
        const moneda = document.getElementById(ids.moneda).value;
        const btnTogglePagada = document.getElementById(ids.btnPagada);
        const estaPagada = btnTogglePagada.classList.contains('pagada');
        const fechaPago = estaPagada ? document.getElementById(ids.fechaPago).value : null;
        const conCredito = estaPagada ? (document.getElementById(ids.conCredito)?.value === 'true') : false;
        const servicioSeleccionadoId = document.getElementById(ids.servicio).value;

        // Validar monto (permitir negativos para saldos a favor)
        if (!this.validarMonto(monto, true)) {
            return;
        }

        // Validar fecha
        if (!this.validarFecha(fecha)) {
            return;
        }

        // Validar fecha de pago si la factura está marcada como pagada
        if (estaPagada && !this.validarFechaPago(fechaPago)) {
            return;
        }

        // Validar que no exista otra factura con la misma fecha en el mismo servicio
        const servicioDestino = this.servicios.find(s => s.id === servicioSeleccionadoId);
        if (servicioDestino) {
            const facturaConMismaFecha = servicioDestino.facturas.find(f =>
                f.fecha === fecha && f.id !== this.facturaActual
            );

            if (facturaConMismaFecha) {
                this.mostrarToast('❌ Ya existe una factura con esta fecha de vencimiento para este servicio', 'error');
                return;
            }
        }

        // Verificar si el servicio cambió
        const servicioAnteriorId = this.servicioActual;
        const servicioNuevoId = servicioSeleccionadoId;
        const cambiodeServicio = servicioAnteriorId !== servicioNuevoId;

        let esNueva = !this.facturaActual;

        if (this.facturaActual) {
            // Editar factura existente
            const servicioAnterior = this.servicios.find(s => s.id === servicioAnteriorId);
            if (servicioAnterior) {
                const factura = servicioAnterior.facturas.find(f => f.id === this.facturaActual);
                if (factura) {
                    if (cambiodeServicio) {
                        // Mover la factura a otro servicio
                        servicioAnterior.facturas = servicioAnterior.facturas.filter(f => f.id !== this.facturaActual);

                        factura.monto = monto;
                        factura.tipo = tipo;
                        factura.fecha = fecha;
                        factura.pagada = estaPagada;
                        factura.fechaPago = fechaPago;
                        factura.moneda = moneda;
                        factura.conCredito = conCredito;

                        const servicioNuevo = this.servicios.find(s => s.id === servicioNuevoId);
                        if (servicioNuevo) {
                            servicioNuevo.facturas.push(factura);
                        }
                    } else {
                        // Actualizar en el mismo servicio
                        // Verificar si hubo cambios
                        if (factura.monto === monto &&
                            factura.tipo === tipo &&
                            factura.fecha === fecha &&
                            factura.pagada === estaPagada &&
                            factura.fechaPago === fechaPago &&
                            (factura.moneda || 'ars') === moneda &&
                            (factura.conCredito || false) === conCredito) {
                            this.mostrarToast('Sin cambios', 'info');
                            this.cerrarModal('modal-editar-factura');
                            this.abrirModalFacturasServicio(servicioAnteriorId);
                            return;
                        }
                        factura.monto = monto;
                        factura.tipo = tipo;
                        factura.fecha = fecha;
                        factura.pagada = estaPagada;
                        factura.fechaPago = fechaPago;
                        factura.moneda = moneda;
                        factura.conCredito = conCredito;
                    }
                }
            }
        } else {
            // Crear nueva factura
            const nuevaFactura = {
                id: this.generarId(),
                monto: monto,
                tipo: tipo,
                fecha: fecha,
                pagada: estaPagada,
                fechaPago: fechaPago,
                moneda: moneda,
                conCredito: conCredito
            };

            const servicioDestino = this.servicios.find(s => s.id === servicioNuevoId);
            if (servicioDestino) {
                servicioDestino.facturas.push(nuevaFactura);
            }
        }

        this.guardarDatos();
        this.guardarEstado();
        this.enModoBusqueda = false;

        // Resetear botones antes de cerrar
        this.actualizarEstadoBotonToggle('factura-monto', 'btn-toggle-negativo');
        this.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');

        this.cerrarModal(esEditar ? 'modal-editar-factura' : 'modal-agregar-factura');

        // Re-renderizar todos los servicios para aplicar el ordenamiento
        this.renderServicios();

        // Siempre reabrir el modal del servicio al GUARDAR (tanto desde menú como desde servicio)
        const servicioParaAbrir = cambiodeServicio ? servicioNuevoId : servicioAnteriorId;
        this.abrirModalFacturasServicio(servicioParaAbrir);

        this.mostrarToast(esNueva ? 'Factura agregada' : 'Factura actualizada', 'success');
    }

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

    establecerFechaHoy(tipo = 'factura', modo = 'agregar') {
        const campoId = modo === 'editar' ? `editar-${tipo}-fecha` : `${tipo}-fecha`;
        const inputFecha = document.getElementById(campoId);

        if (inputFecha) {
            inputFecha.value = inputFecha.value ? '' : this.obtenerFechaLocal();
        }
    }

    eliminarFacturaDesdeModal() {
        if (!this.facturaActual) return;

        const servicio = this.servicios.find(s => s.id === this.servicioActual);
        if (!servicio) return;

        servicio.facturas = servicio.facturas.filter(f => f.id !== this.facturaActual);

        this.guardarDatos();
        this.guardarEstado();
        this.renderServicios();
        this.enModoBusqueda = false;
        this.actualizarEstadoBotonToggle('editar-factura-monto', 'btn-editar-toggle-negativo');

        this.cerrarModal('modal-editar-factura');
        this.mostrarToast('Factura eliminada', 'success');
    }

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

    guardarEstado() {
        // Crear una copia profunda del estado actual DESPUÉS del cambio
        const nuevoEstado = {
            servicios: JSON.parse(JSON.stringify(this.servicios)),
            categorias: JSON.parse(JSON.stringify(this._getCategorias()))
        };

        // Si estamos en medio del historial, eliminar estados futuros
        if (this.historialIndex < this.historial.length - 1) {
            this.historial.splice(this.historialIndex + 1);
        }

        // Agregar el nuevo estado
        this.historial.push(nuevoEstado);

        // Limitar el tamaño del historial.
        // FIX: cuando se hace shift() el array pierde su primer elemento,
        // por lo que el índice no debe incrementarse (ya apunta al último).
        if (this.historial.length > this.maxHistorial) {
            this.historial.shift();
            // historialIndex queda en maxHistorial - 1, que es correcto
        } else {
            this.historialIndex++;
        }

        this.actualizarBotonesHistorial();
    }

    inicializarHistorial() {
        this.historial = [];
        this.historialIndex = -1;

        if (this.servicios && this.servicios.length >= 0) {
            this.historial.push({
                servicios: JSON.parse(JSON.stringify(this.servicios)),
                categorias: JSON.parse(JSON.stringify(this._getCategorias()))
            });
            this.historialIndex = 0;
        }

        this.actualizarBotonesHistorial();
    }

    deshacer() {
        if (this.historialIndex > 0) {
            this.historialIndex--;
            const estado = this.historial[this.historialIndex];
            this.servicios = JSON.parse(JSON.stringify(estado.servicios));
            this._saveCategorias(JSON.parse(JSON.stringify(estado.categorias)));
            this.guardarDatos();
            this.renderServicios();
            this.cerrarTodosLosModales();
            this.actualizarBotonesHistorial();
            this.mostrarToast('Acción deshecha', 'success');
        }
    }

    rehacer() {
        if (this.historialIndex < this.historial.length - 1) {
            this.historialIndex++;
            const estado = this.historial[this.historialIndex];
            this.servicios = JSON.parse(JSON.stringify(estado.servicios));
            this._saveCategorias(JSON.parse(JSON.stringify(estado.categorias)));
            this.guardarDatos();
            this.renderServicios();
            this.cerrarTodosLosModales();
            this.actualizarBotonesHistorial();
            this.mostrarToast('Acción rehecha', 'success');
        }
    }

    actualizarBotonesHistorial() {
        const puedeDeshacer = this.historialIndex > 0;
        const puedeRehacer = this.historialIndex < this.historial.length - 1;

        document.getElementById('btn-undo').disabled = !puedeDeshacer;
        document.getElementById('btn-redo').disabled = !puedeRehacer;
    }

    // ========================================
    // PERSISTENCIA DE DATOS
    // ========================================

    // NOTA: este método quedó obsoleto cuando se implementó el sistema de perfiles.
    // El flujo real de carga es: constructor → cargarDatosPerfilActivo() → inicializarHistorial()
    // Se conserva por compatibilidad pero NO debe llamarse directamente.
    // TODO: eliminar en la próxima limpieza de código.
    cargarDatos() {
        try {
            const datos = localStorage.getItem(this.STORAGE_KEY);
            if (datos) {
                const parsed = JSON.parse(datos);

                // Validación de integridad
                if (this.validarDatos(parsed)) {
                    this.servicios = parsed;
                } else {
                    console.error('Datos corruptos detectados');
                    this.servicios = [];
                }
            }

            // Inicializar historial con estado actual (después de cargar)
            this.historial = [{
                servicios: JSON.parse(JSON.stringify(this.servicios)),
                categorias: JSON.parse(JSON.stringify(this._getCategorias()))
            }];
            this.historialIndex = 0;
        } catch (error) {
            console.error('Error al cargar datos:', error);
            this.servicios = [];
            this.historial = [{ servicios: [], categorias: [] }];
            this.historialIndex = 0;
        }
    }

    verificarEspacioDisponible() {
        try {
            const datos = JSON.stringify(this.servicios);
            const tamaño = new Blob([datos]).size;
            const tamañoMB = tamaño / (1024 * 1024);

            return {
                tamaño: tamañoMB,
                tamañoBytes: tamaño,
                advertencia: tamañoMB > 3,
                critico: tamañoMB > 4.5
            };
        } catch (error) {
            return {
                tamaño: 0,
                tamañoBytes: 0,
                advertencia: false,
                critico: false
            };
        }
    }

    guardarDatos() {
        try {
            this.guardarDatosPerfilActivo();
        } catch (error) {
            console.error('Error al guardar datos:', error);
            this.mostrarToast('Error al guardar datos', 'error');
        }
    }

    validarDatos(datos) {
        // Validar que sea un array
        if (!Array.isArray(datos)) {
            console.error('Validación: datos no es un array');
            return false;
        }

        // Validar cada servicio
        return datos.every((servicio, idx) => {
            // Validar ID del servicio
            if (typeof servicio.id !== 'string' || !servicio.id.trim()) {
                console.error(`Validación: servicio[${idx}].id inválido`);
                return false;
            }

            // Validar nombre del servicio
            if (typeof servicio.nombre !== 'string' || !servicio.nombre.trim()) {
                console.error(`Validación: servicio[${idx}].nombre inválido`);
                return false;
            }

            if (servicio.nombre.length > 30) {
                console.error(`Validación: servicio[${idx}].nombre demasiado largo`);
                return false;
            }

            // Validar array de facturas
            if (!Array.isArray(servicio.facturas)) {
                console.error(`Validación: servicio[${idx}].facturas no es un array`);
                return false;
            }

            // Validar cada factura
            return servicio.facturas.every((factura, fidx) => {
                // Validar ID
                if (typeof factura.id !== 'string' || !factura.id.trim()) {
                    console.error(`Validación: factura[${fidx}].id inválido en servicio[${idx}]`);
                    return false;
                }

                // Validar monto
                if (typeof factura.monto !== 'number') {
                    console.error(`Validación: factura[${fidx}].monto no es número en servicio[${idx}]`);
                    return false;
                }

                if (!isFinite(factura.monto)) {
                    console.error(`Validación: factura[${fidx}].monto no es finito en servicio[${idx}]`);
                    return false;
                }

                if (Math.abs(factura.monto) > 99999999) {
                    console.error(`Validación: factura[${fidx}].monto fuera de rango en servicio[${idx}]`);
                    return false;
                }

                // Validar fecha
                if (typeof factura.fecha !== 'string') {
                    console.error(`Validación: factura[${fidx}].fecha no es string en servicio[${idx}]`);
                    return false;
                }

                if (!/^\d{4}-\d{2}-\d{2}$/.test(factura.fecha)) {
                    console.error(`Validación: factura[${fidx}].fecha formato inválido en servicio[${idx}]`);
                    return false;
                }

                // Validar estado de pago
                if (typeof factura.pagada !== 'boolean') {
                    console.error(`Validación: factura[${fidx}].pagada no es boolean en servicio[${idx}]`);
                    return false;
                }

                // Validar fecha de pago (opcional)
                if (factura.fechaPago !== null && factura.fechaPago !== undefined) {
                    if (typeof factura.fechaPago !== 'string') {
                        console.error(`Validación: factura[${fidx}].fechaPago no es string en servicio[${idx}]`);
                        return false;
                    }
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(factura.fechaPago)) {
                        console.error(`Validación: factura[${fidx}].fechaPago formato inválido en servicio[${idx}]`);
                        return false;
                    }
                }

                // Validar tipo (opcional)
                if (factura.tipo !== undefined) {
                    const tiposValidos = ['mensual', 'bimestral', 'semestral', 'anual', 'regular', 'complementario', 'transferencia'];
                    if (!tiposValidos.includes(factura.tipo)) {
                        console.error(`Validación: factura[${fidx}].tipo inválido en servicio[${idx}]`);
                        return false;
                    }
                }

                return true;
            });
        });
    }

    // ========================================
    // IMPORTAR/EXPORTAR
    // ========================================

    exportarDatos() {
        try {
            const datos = {
                version: '1.0',
                fecha: new Date().toISOString(),
                categorias: this._getCategorias(),
                servicios: this.servicios
            };

            const json = JSON.stringify(datos, null, 2);
            this._descargarBlob(json, `servicios_${this.obtenerFechaLocal()}.json`, 'application/json');

            this.mostrarToast('Datos exportados correctamente', 'success');
            this.cerrarMenuAjustes();
        } catch (error) {
            console.error('Error al exportar:', error);
            this.mostrarToast('Error al exportar datos', 'error');
        }
    }

    _generarResumenComparacion(serviciosRemoto, etiqueta = 'archivo', categoriasRemoto = []) {
        const INGRESOS_ID = this.SERVICIO_INGRESOS_ID;
        const idsLocales = new Set(this.servicios.map(s => s.id));
        const idsRemoto = new Set(serviciosRemoto.map(s => s.id));

        const soloEnRemoto = serviciosRemoto.filter(s => !idsLocales.has(s.id) && s.id !== INGRESOS_ID);
        const enAmbos = serviciosRemoto.filter(s => idsLocales.has(s.id) && s.id !== INGRESOS_ID);
        const servicioIngresosRemoto = serviciosRemoto.find(s => s.id === INGRESOS_ID);
        const servicioIngresosLocal = this.servicios.find(s => s.id === INGRESOS_ID);

        let facturasNuevas = 0, facturasConflicto = 0, ingresosNuevos = 0;

        enAmbos.forEach(sRemoto => {
            const sLocal = this.servicios.find(s => s.id === sRemoto.id);
            if (!sLocal) return;
            const idsFacturasLocales = new Set(sLocal.facturas.map(f => f.id));
            sRemoto.facturas.forEach(f => {
                if (!idsFacturasLocales.has(f.id)) {
                    facturasNuevas++;
                } else {
                    const fLocal = sLocal.facturas.find(fl => fl.id === f.id);
                    if (fLocal && (fLocal.monto !== f.monto || fLocal.fecha !== f.fecha ||
                        fLocal.pagada !== f.pagada || fLocal.fechaPago !== f.fechaPago)) {
                        facturasConflicto++;
                    }
                }
            });
        });

        if (servicioIngresosRemoto) {
            const idsIngLocal = new Set((servicioIngresosLocal?.facturas || []).map(f => f.id));
            ingresosNuevos = servicioIngresosRemoto.facturas.filter(f => !idsIngLocal.has(f.id)).length;
        }

        const totalFacturasRemoto = serviciosRemoto
            .filter(s => s.id !== INGRESOS_ID)
            .reduce((acc, s) => acc + s.facturas.length, 0);
        const totalIngresosRemoto = servicioIngresosRemoto?.facturas.length || 0;
        const totalServiciosRemoto = serviciosRemoto.filter(s => s.id !== INGRESOS_ID).length;

        // Categorías nuevas
        const catsActuales = this._getCategorias();
        const catsNuevas = categoriasRemoto.filter(c => !catsActuales.some(ca => ca.toLowerCase() === c.toLowerCase()));

        // Qué haría combinar
        const facturasEnServiciosNuevos = soloEnRemoto.reduce((acc, s) => acc + s.facturas.length, 0);
        const partesAgregar = [];
        if (soloEnRemoto.length > 0) partesAgregar.push(this._plural(soloEnRemoto.length, 'servicio nuevo', 'servicios nuevos'));
        if (facturasEnServiciosNuevos > 0) partesAgregar.push(this._plural(facturasEnServiciosNuevos, 'factura nueva', 'facturas nuevas'));
        if (facturasNuevas > 0) partesAgregar.push(this._plural(facturasNuevas, 'factura nueva en servicios existentes', 'facturas nuevas en servicios existentes'));
        if (ingresosNuevos > 0) partesAgregar.push(this._plural(ingresosNuevos, 'ingreso nuevo', 'ingresos nuevos'));
        if (catsNuevas.length > 0) partesAgregar.push(this._plural(catsNuevas.length, 'categoría nueva', 'categorías nuevas'));
        const partes = [];
        if (partesAgregar.length > 0) partes.push(`Agrega ${partesAgregar.join(', ')}`);
        if (facturasConflicto > 0) partes.push(facturasConflicto === 1 ? 'Se actualiza 1 factura' : `Se actualizan ${facturasConflicto} facturas`);
        const textoCombinar = partes.length > 0 ? partes.join('. ') : 'No modifica nada';

        // Qué haría reemplazar
        const partesReempl = [];
        if (totalServiciosRemoto > 0) partesReempl.push(this._plural(totalServiciosRemoto, 'servicio', 'servicios'));
        if (totalFacturasRemoto > 0) partesReempl.push(this._plural(totalFacturasRemoto, 'factura', 'facturas'));
        if (totalIngresosRemoto > 0) partesReempl.push(this._plural(totalIngresosRemoto, 'ingreso', 'ingresos'));
        if (categoriasRemoto.length > 0) partesReempl.push(this._plural(categoriasRemoto.length, 'categoría', 'categorías'));
        const textoReemplazar = partesReempl.length > 0 ? `Carga ${partesReempl.join(', ')}` : 'No modifica nada';

        return `
        <strong>Combinar:</strong> ${textoCombinar}<br>
        <strong>Reemplazar:</strong> ${textoReemplazar}
    `;
    }

    _mergeServicios(serviciosRemoto) {
        let serviciosAgregados = 0, facturasAgregadas = 0, facturasActualizadas = 0, ingresosAgregados = 0;
        serviciosRemoto.forEach(servicioRemoto => {
            const esIngresos = servicioRemoto.id === this.SERVICIO_INGRESOS_ID;
            const servicioLocal = this.servicios.find(s => s.id === servicioRemoto.id);
            if (!servicioLocal) {
                this.servicios.push(servicioRemoto);
                if (!esIngresos) {
                    serviciosAgregados++;
                    facturasAgregadas += servicioRemoto.facturas.length;
                } else {
                    ingresosAgregados += servicioRemoto.facturas.length;
                }
            } else {
                servicioRemoto.facturas.forEach(f => {
                    const idx = servicioLocal.facturas.findIndex(fl => fl.id === f.id);
                    if (idx === -1) {
                        servicioLocal.facturas.push(f);
                        esIngresos ? ingresosAgregados++ : facturasAgregadas++;
                    } else {
                        const fe = servicioLocal.facturas[idx];
                        if (fe.monto !== f.monto || fe.fecha !== f.fecha ||
                            fe.pagada !== f.pagada || fe.fechaPago !== f.fechaPago) {
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
            const categoriasAgregadas = this._mergeCategorias(datos.categorias);

            if (serviciosAgregados === 0 && facturasAgregadas === 0 && facturasActualizadas === 0 && ingresosAgregados === 0 && categoriasAgregadas === 0) {
                this.mostrarToast('No hay datos nuevos para agregar', 'info');
                return;
            }

            const partes = [];
            if (serviciosAgregados > 0) partes.push(this._plural(serviciosAgregados, 'servicio', 'servicios'));
            if (facturasAgregadas > 0) partes.push(this._plural(facturasAgregadas, 'factura nueva', 'facturas nuevas'));
            if (facturasActualizadas > 0) partes.push(this._plural(facturasActualizadas, 'actualizada', 'actualizadas'));
            if (ingresosAgregados > 0) partes.push(this._plural(ingresosAgregados, 'ingreso nuevo', 'ingresos nuevos'));
            if (categoriasAgregadas > 0) partes.push(this._plural(categoriasAgregadas, 'categoría', 'categorías'));

            this._postGuardado();
            this.mostrarToast(`Importado: ${partes.join(', ')}`, 'success');
        } else {
            this.servicios = datos.servicios;
            this._saveCategorias(cats);
            this._postGuardado();

            const cantidad = datos.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).length;
            const facturas = datos.servicios
                .filter(s => s.id !== this.SERVICIO_INGRESOS_ID)
                .reduce((acc, s) => acc + s.facturas.length, 0);
            const ingresos = datos.servicios
                .find(s => s.id === this.SERVICIO_INGRESOS_ID)?.facturas.length || 0;

            const partes = [];
            partes.push(this._plural(cantidad, 'servicio', 'servicios'));
            if (facturas > 0) partes.push(this._plural(facturas, 'factura', 'facturas'));
            if (ingresos > 0) partes.push(this._plural(ingresos, 'ingreso', 'ingresos'));
            if (cats.length > 0) partes.push(this._plural(cats.length, 'categoría', 'categorías'));

            this.mostrarToast(`Restaurados: ${partes.join(', ')}`, 'success');
        }
    }

    mostrarOpcionesImportacion() {
        this._toggleSubMenuAjustes('opciones-importacion', 'menu-importar');
    }

    importarDatos(modo = 'reemplazar') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const maxSize = 10 * 1024 * 1024;
            if (file.size > maxSize) {
                this.mostrarToast('Archivo demasiado grande (máx 10MB)', 'error');
                return;
            }

            if (!file.name.endsWith('.json')) {
                this.mostrarToast('Solo se permiten archivos .json', 'error');
                return;
            }

            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const datos = JSON.parse(event.target.result);

                    // Validar versión
                    if (datos.version && datos.version !== '1.0') {
                        const continuar = confirm(
                            `Versión ${datos.version} detectada (actual: 1.0). Puede haber incompatibilidades. ¿Continuar?`
                        );
                        if (!continuar) return;
                    }

                    // Validar estructura
                    if (!datos.servicios || !Array.isArray(datos.servicios)) {
                        throw new Error('Formato de archivo inválido: falta "servicios"');
                    }

                    // Validar integridad de datos
                    if (!this.validarDatos(datos.servicios)) {
                        throw new Error('Datos corruptos o inválidos en el archivo');
                    }

                    const cantidad = datos.servicios.filter(s => s.id !== this.SERVICIO_INGRESOS_ID).length;
                    const facturas = datos.servicios
                        .filter(s => s.id !== this.SERVICIO_INGRESOS_ID)
                        .reduce((acc, s) => acc + s.facturas.length, 0);
                    const ingresos = datos.servicios
                        .find(s => s.id === this.SERVICIO_INGRESOS_ID)?.facturas.length || 0;

                    if (modo === 'combinar') {
                        this._aplicarImportacion('combinar', datos);
                    } else {
                        const cats = Array.isArray(datos.categorias) ? datos.categorias : [];
                        const cantCats = cats.length;
                        const partes = [];
                        partes.push(this._plural(cantidad, 'servicio', 'servicios'));
                        if (facturas > 0) partes.push(this._plural(facturas, 'factura', 'facturas'));
                        if (ingresos > 0) partes.push(this._plural(ingresos, 'ingreso', 'ingresos'));
                        if (cantCats > 0) partes.push(this._plural(cantCats, 'categoría', 'categorías'));

                        const mensaje = `Se restaurarán ${partes.join(', ')}. ¿Deseas reemplazar todos los datos actuales?`;
                        if (confirm(mensaje)) {
                            this._aplicarImportacion('reemplazar', datos);
                        }
                    }
                } catch (error) {
                    console.error('Error al importar:', error);
                    this.mostrarToast('❌ Error: ' + error.message, 'error');
                }
            };

            reader.onerror = () => {
                this.mostrarToast('Error al leer el archivo', 'error');
            };

            reader.readAsText(file);
        });

        input.click();
        // Ocultar opciones después de seleccionar
        document.getElementById('opciones-importacion').classList.remove('open');
        document.getElementById('menu-importar').classList.remove('open');
        this.cerrarMenuAjustes();
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

    cargarTema() {
        const tema = localStorage.getItem(this.THEME_KEY);
        if (tema === 'dark' || tema === null) {
            // Si es dark O primera vez (null), activar modo oscuro
            document.body.classList.add('dark-mode');
            // Guardar preferencia si es la primera vez
            if (tema === null) {
                localStorage.setItem(this.THEME_KEY, 'dark');
            }
        }
        // Sincronizar ícono con el tema cargado
        const esDark = document.body.classList.contains('dark-mode');
        this._actualizarIconoTema(esDark);
    }

    async cargarCotizacionDolar() {
        try {
            const res = await fetch('https://dolarapi.com/v1/dolares');
            if (!res.ok) throw new Error('Error al obtener cotización');
            const data = await res.json();

            const oficial = data.find(d => d.casa === 'oficial');
            const mep = data.find(d => d.casa === 'bolsa');

            const fmt = (v) => v != null ? `$${Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

            const elOficial = document.getElementById('dolar-oficial');
            const elMep = document.getElementById('dolar-mep');
            const elHora = document.getElementById('dolar-hora');

            if (elOficial) elOficial.textContent = oficial ? fmt(oficial.venta) : '-';
            if (elMep) elMep.textContent = mep ? fmt(mep.venta) : '-';
            if (elHora) {
                const ahora = new Date();
                elHora.textContent = ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
            }
        } catch (e) {
            const elHora = document.getElementById('dolar-hora');
            if (elHora) elHora.textContent = 'sin conexión';
        }
    }

    toggleTema() {
        document.body.classList.toggle('dark-mode');
        const esDark = document.body.classList.contains('dark-mode');
        localStorage.setItem(this.THEME_KEY, esDark ? 'dark' : 'light');
        this._actualizarIconoTema(esDark);
        this.mostrarToast(`Tema ${esDark ? 'oscuro' : 'claro'} activado`, 'success');
        this.cerrarMenuAjustes();
    }

    _actualizarIconoTema(esDark) {
        const use = document.getElementById('icon-tema-use');
        if (use) use.setAttribute('href', esDark ? '#icon-sun' : '#icon-moon');
    }

    toggleBlur() {
        this.blurHabilitado = !this.blurHabilitado;
        localStorage.setItem('blur-montos', this.blurHabilitado.toString());

        const indicator = document.getElementById('blur-indicator');
        if (indicator) indicator.textContent = this.blurHabilitado ? 'SI' : 'NO';

        // Si se deshabilita, desblurear inmediatamente
        if (!this.blurHabilitado) {
            this.resumenDesblurado = true;
            const el = document.getElementById('resumen-toggle');
            if (el) el.classList.remove('resumen-blur');
        } else {
            // Si se habilita, volver a blurear
            this.resumenDesblurado = false;
            const el = document.getElementById('resumen-toggle');
            if (el) el.classList.add('resumen-blur');
        }

        this.mostrarToast(`Privacidad ${this.blurHabilitado ? 'habilitado' : 'deshabilitado'}`, 'success');
        this.cerrarMenuAjustes();
    }

    toggleIngresos() {
        const habilitado = localStorage.getItem(this.INGRESOS_KEY) !== 'false';
        const nuevoEstado = !habilitado;

        localStorage.setItem(this.INGRESOS_KEY, nuevoEstado.toString());

        // Actualizar indicador visual
        const indicator = document.getElementById('ingresos-indicator');
        indicator.textContent = nuevoEstado ? 'SI' : 'NO';

        // Re-renderizar servicios
        this.renderServicios();

        this.mostrarToast(`Registro de ingresos ${nuevoEstado ? 'habilitado' : 'deshabilitado'}`, 'success');
        this.cerrarMenuAjustes();

        // Actualizar calculador
        this.actualizarSelectServicios();

        // Si el servicio de ingresos estaba seleccionado y se deshabilitó, limpiar
        const selectServicio = document.getElementById('calculador-servicio');
        if (!nuevoEstado && selectServicio && selectServicio.value === this.SERVICIO_INGRESOS_ID) {
            selectServicio.value = '';
            this.calcularPeriodo();
        }
    }

    ingresosHabilitado() {
        const valor = localStorage.getItem(this.INGRESOS_KEY);
        // Si es null (primera vez), retornar false; si es 'true' retornar true; si es 'false' retornar false
        return valor === 'true';
    }

    // ========================================
    // MODALES Y MENÚS
    // ========================================

    abrirModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }

    cerrarModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('active');
        // Solo quitar modal-open si no queda ningún otro modal activo
        if (!document.querySelector('.modal.active')) {
            document.body.classList.remove('modal-open');
        }
        if (modalId === 'modal-gist') this.actualizarBotonesGist();
    }

    cerrarTodosLosModales() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.classList.remove('modal-open');

        // Limpiar años guardados al cerrar por backdrop
        this._anoExpandidoFacturas = {};
        this._anoExpandidoIngresos = {};
    }

    toggleMenuAjustes() {
        const menu = document.getElementById('menu-ajustes');
        const overlay = document.getElementById('menu-overlay');
        menu.classList.toggle('active');
        overlay.classList.toggle('active');

        // Bloquear/desbloquear scroll
        if (menu.classList.contains('active')) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }

    cerrarMenuAjustes() {
        const menu = document.getElementById('menu-ajustes');
        const overlay = document.getElementById('menu-overlay');
        menu.classList.remove('active');
        overlay.classList.remove('active');

        // Cerrar submenús animados
        document.getElementById('opciones-importacion')?.classList.remove('open');
        document.getElementById('opciones-borrar')?.classList.remove('open');
        document.getElementById('opciones-dolar')?.classList.remove('open');
        document.getElementById('menu-importar')?.classList.remove('open');
        document.getElementById('menu-limpiar')?.classList.remove('open');
        document.getElementById('menu-dolar')?.classList.remove('open');

        // Restaurar scroll del body
        document.body.classList.remove('modal-open');
    }

    toggleMenuAgregar() {
        const menu = document.getElementById('menu-agregar');
        const overlay = document.getElementById('menu-agregar-overlay');
        menu.classList.toggle('active');
        overlay.classList.toggle('active');
        // Bloquear/desbloquear scroll
        if (menu.classList.contains('active')) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
            // Resetear a vista principal al cerrar
            const vistaPrincipal = document.getElementById('menu-vista-principal');
            const vistaCalcular = document.getElementById('menu-vista-calcular');
            if (vistaPrincipal) { vistaPrincipal.classList.remove('hidden-vista'); }
            if (vistaCalcular) { vistaCalcular.classList.remove('visible-vista'); vistaCalcular.classList.add('hidden-vista'); }
        }
    }

    cerrarMenuAgregar() {
        const menu = document.getElementById('menu-agregar');
        const overlay = document.getElementById('menu-agregar-overlay');
        menu.classList.remove('active');
        overlay.classList.remove('active');
        document.body.classList.remove('modal-open');
        // Resetear a vista principal
        const vistaPrincipal = document.getElementById('menu-vista-principal');
        const vistaCalcular = document.getElementById('menu-vista-calcular');
        if (vistaPrincipal) { vistaPrincipal.classList.remove('hidden-vista'); }
        if (vistaCalcular) { vistaCalcular.classList.remove('visible-vista'); vistaCalcular.classList.add('hidden-vista'); }
    }

    actualizarMenuAgregar() {
        const btnRecibo = document.getElementById('menu-agregar-recibo');
        if (btnRecibo) {
            btnRecibo.classList.toggle('visible', this.ingresosHabilitado());
        }
    }

    abrirModalFacturaRapida() {
        // Si no hay servicios, mostrar mensaje y abrir modal de servicio
        if (this.servicios.length === 0) {
            this.mostrarToast('Primero debes crear un servicio', 'error');
            this.abrirModalServicio();
            return;
        }

        // Obtener el primer servicio en orden alfabético
        const serviciosOrdenados = [...this.servicios].sort((a, b) =>
            a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        );

        // Abrir modal de factura con el primer servicio alfabético indicando que viene del menú
        this.abrirModalFactura(serviciosOrdenados[0].id, null, 'menu');
    }
    // ========================================
    // UTILIDADES
    // ========================================

    generarId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    obtenerFechaLocal() {
        const hoy = new Date();
        return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    }

    // Comparación shallow de objetos planos (evita JSON.stringify para detección de cambios)
    _objetosCambiaron(anterior, actual) {
        if (!anterior) return true;
        const keysA = Object.keys(anterior);
        const keysB = Object.keys(actual);
        if (keysA.length !== keysB.length) return true;
        for (const k of keysA) {
            if (anterior[k] !== actual[k]) return true;
        }
        return false;
    }

    formatearMoneda(monto, moneda = 'ars') {
        const esEntero = Number.isInteger(monto) || monto % 1 === 0;
        const decimales = esEntero ? 0 : 2;
        if (moneda === 'usd') {
            return 'u$s ' + new Intl.NumberFormat('es-AR', {
                minimumFractionDigits: decimales,
                maximumFractionDigits: decimales
            }).format(monto);
        }
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: decimales,
            maximumFractionDigits: decimales
        }).format(monto);
    }

    // Alterna entre ARS y USD en los campos ocultos + actualiza el botón visual
    toggleMoneda(hiddenId, btnId) {
        const hidden = document.getElementById(hiddenId);
        const btn = document.getElementById(btnId);
        if (!hidden || !btn) return;
        const nuevo = hidden.value === 'ars' ? 'usd' : 'ars';
        hidden.value = nuevo;
        btn.textContent = nuevo.toUpperCase();
        btn.classList.toggle('activo-usd', nuevo === 'usd');
        this.mostrarToast(nuevo === 'usd' ? 'Dolares' : 'Pesos', 'info');
    }

    // Fija la moneda de un icon-btn desde código (usado al cargar datos para editar)
    setMonedaBtn(hiddenId, btnId, moneda) {
        const hidden = document.getElementById(hiddenId);
        const btn = document.getElementById(btnId);
        if (!hidden || !btn) return;
        const m = (moneda || 'ars').toLowerCase();
        hidden.value = m;
        btn.textContent = m.toUpperCase();
        btn.classList.toggle('activo-usd', m === 'usd');
    }

    formatearFecha(fecha) {
        const date = this._parseDate(fecha);
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
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

    // ========================================
    // GESTIÓN DE INGRESOS
    // ========================================

    abrirModalIngresosLista(servicioId) {
        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;

        const lista = document.getElementById('lista-ingresos-modal');

        if (servicio.facturas.length === 0) {
            lista.innerHTML = '<div class="empty-state"><p>No hay ingresos registrados</p></div>';
        } else {
            const ingresosOrdenados = [...servicio.facturas].sort((a, b) =>
                new Date(b.fecha) - new Date(a.fecha)
            );

            const grupos = this.agruparPorAno(ingresosOrdenados);

            lista.innerHTML = grupos.map((grupo, index) => {
                const ingresosHTML = grupo.items.map(ingreso => {
                    const tipoTexto = ingreso.tipo === 'complementario' ? 'Complementario' : ingreso.tipo === 'transferencia' ? 'Transferencia' : 'Regular';
                    const tipoEmoji = ingreso.tipo === 'complementario' ? '💼' : ingreso.tipo === 'transferencia' ? '🔄' : '💵';
                    const monedaIngreso = ingreso.moneda || 'ars';
                    const badgeClass = monedaIngreso === 'usd' ? 'usd' : 'ars';

                    return `
                         <div class="factura-item" data-id="${ingreso.id}">
                             <div class="factura-info" data-action="abrir-ingreso" data-ingreso-id="${ingreso.id}">
                                 <div class="factura-monto">${this.formatearMoneda(ingreso.monto, monedaIngreso)}<span class="moneda-badge ${badgeClass}">${monedaIngreso.toUpperCase()}</span></div>
                                 <div class="factura-fecha">${tipoEmoji} ${tipoTexto} | Cobrado: ${this.formatearFecha(ingreso.fecha)}</div>
                             </div>
                         </div>
                     `;
                }).join('');

                return this.generarGrupoAno(grupo.ano, grupo.items, ingresosHTML, 'ingreso', index);
            }).join('');
        }

        document.getElementById('modal-ingresos-lista').dataset.servicioId = servicioId;
        this.abrirModal('modal-ingresos-lista');
        const anoGuardado = this._anoExpandidoIngresos[servicioId];
        if (anoGuardado) {
            this._restaurarAnoExpandido(anoGuardado);
            this._anoExpandidoIngresos[servicioId] = null;
        }
    }

    abrirModalIngreso(ingresoId = null, desdeMenu = false) {
        if (ingresoId) {
            const modal = document.getElementById('modal-ingresos-lista');
            if (modal?.classList.contains('active')) {
                const sid = modal.dataset.servicioId;
                const item = document.querySelector(`.factura-item[data-id="${ingresoId}"]`);
                const grupo = item?.closest('.facturas-grupo-ano');
                const ano = grupo?.querySelector('.facturas-grupo-ano-texto')?.textContent || null;
                this._anoExpandidoIngresos[sid] = ano;
            }
        }

        this.cerrarModal('modal-ingresos-lista');
        this.ingresoActual = ingresoId;
        this.ingresoDesdeMenu = desdeMenu;

        if (ingresoId) {
            const servicio = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
            if (servicio) {
                const ingreso = servicio.facturas.find(f => f.id === ingresoId);
                if (ingreso) {
                    document.getElementById('editar-ingreso-monto').value = ingreso.monto;
                    document.getElementById('editar-ingreso-tipo').value = ingreso.tipo || 'regular';
                    document.getElementById('editar-ingreso-fecha').value = ingreso.fecha;
                    this.setMonedaBtn('editar-ingreso-moneda', 'btn-editar-ingreso-moneda', ingreso.moneda || 'ars');
                }
            }
            this.abrirModal('modal-editar-ingreso');
        } else {
            document.getElementById('form-ingreso').reset();
            this.setMonedaBtn('ingreso-moneda', 'btn-ingreso-moneda', 'ars');
            this.abrirModal('modal-agregar-ingreso');
        }
    }

    guardarIngreso(e) {
        e.preventDefault();

        // Detectar si estamos en modo agregar o editar
        const esEditar = document.getElementById('modal-editar-ingreso').classList.contains('active');

        const monto = parseFloat(document.getElementById(esEditar ? 'editar-ingreso-monto' : 'ingreso-monto').value);
        const tipo = document.getElementById(esEditar ? 'editar-ingreso-tipo' : 'ingreso-tipo').value;
        const fecha = document.getElementById(esEditar ? 'editar-ingreso-fecha' : 'ingreso-fecha').value;
        const moneda = document.getElementById(esEditar ? 'editar-ingreso-moneda' : 'ingreso-moneda').value;

        // Validar monto (no permitir negativos en ingresos)
        if (!this.validarMonto(monto, false)) {
            return;
        }

        // Validar fecha
        if (!this.validarFecha(fecha)) {
            return;
        }

        // Obtener o crear servicio de ingresos
        let servicio = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
        if (!servicio) {
            this.crearServicioIngresos();
            servicio = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
        }

        if (this.ingresoActual) {
            // Editar ingreso existente
            const ingreso = servicio.facturas.find(f => f.id === this.ingresoActual);
            if (ingreso) {
                // Verificar si hubo cambios
                if (ingreso.monto === monto && ingreso.tipo === tipo && ingreso.fecha === fecha && (ingreso.moneda || 'ars') === moneda) {
                    this.mostrarToast('Sin cambios', 'info');
                    this.cerrarModal('modal-editar-ingreso');
                    this.abrirModalIngresosLista(this.SERVICIO_INGRESOS_ID);
                    return;
                }
                ingreso.monto = monto;
                ingreso.tipo = tipo;
                ingreso.fecha = fecha;
                ingreso.moneda = moneda;
            }
        } else {
            // Crear nuevo ingreso
            const nuevoIngreso = {
                id: this.generarId(),
                monto: monto,
                tipo: tipo,
                fecha: fecha,
                moneda: moneda,
                pagada: true // Los ingresos siempre están "pagados" (cobrados)
            };
            servicio.facturas.push(nuevoIngreso);
        }

        this.guardarDatos();
        this.guardarEstado();
        this.renderServicios();
        this.cerrarModal(esEditar ? 'modal-editar-ingreso' : 'modal-agregar-ingreso');
        if (!this.ingresoDesdeMenu) {
            this.abrirModalIngresosLista(this.SERVICIO_INGRESOS_ID);
        }
        this.mostrarToast(this.ingresoActual ? 'Ingreso actualizado' : 'Ingreso agregado', 'success');
    }

    eliminarIngreso() {

        const servicio = this.servicios.find(s => s.id === this.SERVICIO_INGRESOS_ID);
        if (servicio) {
            servicio.facturas = servicio.facturas.filter(f => f.id !== this.ingresoActual);
            this.guardarDatos();
            this.guardarEstado();
            this.renderServicios();
            this.cerrarModal('modal-editar-ingreso');
            if (!this.ingresoDesdeMenu) {
                this.abrirModalIngresosLista(this.SERVICIO_INGRESOS_ID);
            }
            this.mostrarToast('Ingreso eliminado', 'success');
        }
    }

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

    gistGetToken() {
        return localStorage.getItem('gist_token') || '';
    }

    gistGetPerfil() {
        return this.perfiles[this.perfilActivo] || {};
    }

    gistSetPerfil(campos) {
        if (!this.perfiles[this.perfilActivo]) return;
        Object.assign(this.perfiles[this.perfilActivo], campos);
        this.guardarPerfiles();
    }

    gistEsIdValido(id) {
        return /^[a-f0-9]{20,40}$/i.test(id || '');
    }

    // Clave por hora para límites de auto-sync (se resetea al cambiar de hora)
    _gistClaveHoraActual() {
        const ahora = new Date();
        return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')} ${String(ahora.getHours()).padStart(2, '0')}`;
    }

    // Devuelve true si ya alcanzó el límite de syncs de ese tipo en esta hora
    gistSuperaLimite(tipo, limite) {
        const perfil = this.gistGetPerfil();
        const claveHora = this._gistClaveHoraActual();
        const fechaGuardada = perfil[`gistSyncFecha_${tipo}`];
        const count = perfil[`gistSyncCount_${tipo}`] ?? 0;
        if (fechaGuardada !== claveHora) return false; // hora nueva, contador resetado
        return count >= limite;
    }

    // Marca una sync del tipo indicado (incrementa contador si es la misma hora)
    gistMarcarSync(tipo) {
        const perfil = this.gistGetPerfil();
        const claveHora = this._gistClaveHoraActual();
        const fechaGuardada = perfil[`gistSyncFecha_${tipo}`];
        const count = fechaGuardada === claveHora ? (perfil[`gistSyncCount_${tipo}`] ?? 0) : 0;
        this.gistSetPerfil({
            [`gistSyncFecha_${tipo}`]: claveHora,
            [`gistSyncCount_${tipo}`]: count + 1
        });
    }

    // Rango horario — soporta rangos que cruzan medianoche
    gistDentroDelRango() {
        const perfil = this.gistGetPerfil();
        const desde = perfil.gistRangoDesde || '00:00';
        const hasta = perfil.gistRangoHasta || '23:59';
        const ahora = new Date();
        const hhmm = ahora.getHours().toString().padStart(2, '0') + ':' + ahora.getMinutes().toString().padStart(2, '0');
        if (desde <= hasta) {
            return hhmm >= desde && hhmm <= hasta; // rango normal
        } else {
            return hhmm >= desde || hhmm <= hasta; // cruza medianoche
        }
    }

    // Comportamiento de bajada: 'merge' | 'replace'
    gistGetMergeBehavior() {
        return this.gistGetPerfil().gistMergeBehavior || 'merge';
    }

    async gistCalcularHash(texto) {
        const encoder = new TextEncoder();
        const data = encoder.encode(texto);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    actualizarBotonesGist() {
        const btnRespaldar = document.getElementById('btn-hist-respaldar');
        const btnRestaurar = document.getElementById('btn-hist-restaurar');
        if (!btnRespaldar || !btnRestaurar) return;

        const tieneGist = this.gistEsIdValido(this.gistGetPerfil().gistId);

        if (tieneGist) {
            btnRespaldar.title = 'Subir a Gist';
            btnRespaldar.onclick = () => this.gistSubir();
            btnRespaldar.querySelector('use').setAttribute('href', '#icon-cloud-upload');

            btnRestaurar.title = 'Bajar de Gist';
            btnRestaurar.onclick = () => this.gistBajar();
            btnRestaurar.querySelector('use').setAttribute('href', '#icon-cloud-download');
        } else {
            btnRespaldar.title = 'Respaldar';
            btnRespaldar.onclick = () => this.exportarDatos();
            btnRespaldar.querySelector('use').setAttribute('href', '#icon-download');

            btnRestaurar.title = 'Restaurar';
            btnRestaurar.onclick = () => this.importarDatos('reemplazar');
            btnRestaurar.querySelector('use').setAttribute('href', '#icon-upload');
        }
    }

    gistCiclarAutoSync() {
        const estados = ['Sin automatizar', 'Restaurar al iniciar', 'Respaldo automático'];
        const actual = this._gistAutoSyncTemp ?? (this.gistGetPerfil().gistAutoSync ?? 0);
        this._gistAutoSyncTemp = (actual + 1) % 3;
        document.getElementById('gist-autosync-btn').textContent = estados[this._gistAutoSyncTemp];
        document.getElementById('gist-rango-container').classList.toggle('visible', this._gistAutoSyncTemp > 0);
    }

    gistCiclarMerge() {
        const opciones = ['merge', 'replace'];
        const etiquetas = ['Combinar (no reemplaza existentes)', 'Reemplazar todo con datos del Gist'];
        const actual = this._gistMergeBehaviorTemp ?? (this.gistGetMergeBehavior());
        const siguiente = actual === 'merge' ? 'replace' : 'merge';
        this._gistMergeBehaviorTemp = siguiente;
        document.getElementById('gist-merge-btn').textContent = etiquetas[opciones.indexOf(siguiente)];
    }

    abrirModalGist() {
        const perfil = this.gistGetPerfil();
        const token = this.gistGetToken();
        const autoSync = perfil.gistAutoSync ?? 0;
        const merge = perfil.gistMergeBehavior || 'merge';
        const estados = ['Sin automatizar', 'Restaurar al iniciar', 'Respaldo automático'];
        const etiquetasMerge = { merge: 'Combinar (no reemplaza existentes)', replace: 'Reemplazar todo con datos del Gist' };

        this._gistAutoSyncTemp = autoSync;
        this._gistMergeBehaviorTemp = merge;

        document.getElementById('gist-token').value = token;
        document.getElementById('gist-id').value = perfil.gistId || '';
        document.getElementById('gist-autosync-btn').textContent = estados[autoSync];
        document.getElementById('gist-rango-container').classList.toggle('visible', autoSync > 0);
        document.getElementById('gist-rango-desde').value = perfil.gistRangoDesde || '00:00';
        document.getElementById('gist-rango-hasta').value = perfil.gistRangoHasta || '23:59';
        document.getElementById('gist-merge-btn').textContent = etiquetasMerge[merge];

        const elSync = document.getElementById('gist-ultima-sync');
        if (perfil.gistLastSync) {
            elSync.textContent = `Última sincronización: ${perfil.gistLastSync}`;
            elSync.classList.add('visible');
        } else {
            elSync.classList.remove('visible');
        }

        this.abrirModal('modal-gist');
    }

    gistGuardarConfig() {
        const token = document.getElementById('gist-token').value.trim();
        const gistId = document.getElementById('gist-id').value.trim();
        const autoSync = this._gistAutoSyncTemp ?? 0;
        const merge = this._gistMergeBehaviorTemp ?? 'merge';
        const desde = document.getElementById('gist-rango-desde').value;
        const hasta = document.getElementById('gist-rango-hasta').value;

        if (token) {
            localStorage.setItem('gist_token', token);
        } else {
            localStorage.removeItem('gist_token');
        }

        this.gistSetPerfil({
            gistId: gistId || '',
            gistAutoSync: autoSync,
            gistRangoDesde: desde || '00:00',
            gistRangoHasta: hasta || '23:59',
            gistMergeBehavior: merge,
        });

        this.mostrarToast('Configuración guardada', 'success');
        this.cerrarModal('modal-gist');
        this.actualizarBotonesGist();
    }

    _gistGuardarCredencialesModal() {
        const inputToken = document.getElementById('gist-token');
        const inputId = document.getElementById('gist-id');
        if (inputToken?.value.trim()) localStorage.setItem('gist_token', inputToken.value.trim());
        if (inputId?.value.trim()) this.gistSetPerfil({ gistId: inputId.value.trim() });
    }

    async gistSubir() {
        const token = this.gistGetToken();
        const perfil = this.gistGetPerfil();
        if (!token) { this.mostrarToast('Falta el token', 'error'); return; }

        this._gistGuardarCredencialesModal();
        const inputId = document.getElementById('gist-id');

        const categorias = this._getCategorias();
        const datos = JSON.stringify({ servicios: this.servicios, categorias }, null, 2);
        const hash = await this.gistCalcularHash(datos);
        const contenido = JSON.stringify({ hash, servicios: this.servicios, categorias }, null, 2);
        const nombreArchivo = `deltaF_${this.perfilActivo}.json`;

        const btnSubir = document.getElementById('gist-btn-subir');
        if (btnSubir) btnSubir.disabled = true;

        try {
            this.mostrarToast('Subiendo...', 'info');
            const perfilActual = this.gistGetPerfil();
            let url, method;
            if (this.gistEsIdValido(perfilActual.gistId)) {
                url = `https://api.github.com/gists/${perfilActual.gistId}`;
                method = 'PATCH';
            } else {
                url = 'https://api.github.com/gists';
                method = 'POST';
            }

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${this.gistGetToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: `DeltaF backup — ${this.perfiles[this.perfilActivo]?.nombre || this.perfilActivo}`,
                    public: false,
                    files: { [nombreArchivo]: { content: contenido } }
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const ahora = new Date().toLocaleString('es-AR');
            this.gistSetPerfil({ gistId: json.id, gistLastSync: ahora });
            this.gistMarcarSync('subir');

            if (inputId) inputId.value = json.id;
            const elSync = document.getElementById('gist-ultima-sync');
            if (elSync) { elSync.textContent = `Última sincronización: ${ahora}`; elSync.classList.add('visible'); }

            this.mostrarToast('Subida exitosa ✓', 'success');
        } catch (err) {
            console.error(err);
            this.mostrarToast('Error al subir', 'error');
        } finally {
            if (btnSubir) btnSubir.disabled = false;
        }
    }

    // Descarga del Gist y retorna los servicios parseados (sin aplicar aún)
    async _gistDescargar() {
        const token = this.gistGetToken();
        const perfil = this.gistGetPerfil();
        if (!token) throw new Error('Falta el token');
        if (!this.gistEsIdValido(perfil.gistId)) throw new Error('Gist ID inválido');

        const res = await fetch(`https://api.github.com/gists/${perfil.gistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const nombreArchivo = `deltaF_${this.perfilActivo}.json`;
        const archivoObj = json.files[nombreArchivo];
        if (!archivoObj) throw new Error('Archivo no encontrado en el Gist');

        let parsed;
        try { parsed = JSON.parse(archivoObj.content); } catch { throw new Error('JSON inválido'); }

        const datosStr = JSON.stringify({ servicios: parsed.servicios, categorias: parsed.categorias || [] }, null, 2);
        const hashEsperado = await this.gistCalcularHash(datosStr);
        if (hashEsperado !== parsed.hash) throw new Error('Hash no coincide — datos corruptos');

        const servicios = parsed.servicios;
        const categorias = parsed.categorias || [];
        if (!Array.isArray(servicios)) throw new Error('Estructura inválida');

        return { servicios, categorias };
    }

    async gistBajar(esAutomatico = false) {
        this._gistGuardarCredencialesModal();

        const btnBajar = document.getElementById('gist-btn-bajar');
        if (btnBajar) btnBajar.disabled = true;

        try {
            this.mostrarToast('Bajando...', 'info');
            const { servicios: serviciosGist, categorias: categoriasGist } = await this._gistDescargar();

            // Analizar diferencias
            const fechasLocales = new Set(this.servicios.map(s => s.id));
            const fechasGist = new Set(serviciosGist.map(s => s.id));

            const soloEnGist = serviciosGist.filter(s => !fechasLocales.has(s.id));
            const enAmbos = serviciosGist.filter(s => fechasLocales.has(s.id));
            const soloLocal = this.servicios.filter(s => !fechasGist.has(s.id));

            this._gistDatosPendientes = { servicios: serviciosGist, categorias: categoriasGist };

            if (esAutomatico) {
                this.gistMergeAplicar(this.gistGetMergeBehavior(), true);
            } else {
                const resumen = document.getElementById('gist-merge-resumen');
                if (resumen) {
                    resumen.innerHTML = this._generarResumenComparacion(serviciosGist, 'Gist', categoriasGist);
                }
                this.abrirModal('modal-gist-merge');
            }
        } catch (err) {
            console.error(err);
            this.mostrarToast(`Error al bajar: ${err.message}`, 'error');
        } finally {
            if (btnBajar) btnBajar.disabled = false;
        }
    }

    _mergeCategorias(catsNuevas) {
        if (!Array.isArray(catsNuevas) || catsNuevas.length === 0) return 0;
        const actuales = this._getCategorias();
        const nuevas = catsNuevas.filter(c => !actuales.some(ca => ca.toLowerCase() === c.toLowerCase()));
        if (nuevas.length > 0) this._saveCategorias([...actuales, ...nuevas].sort((a, b) => a.localeCompare(b)));
        return nuevas.length;
    }

    gistMergeAplicar(modo, esAutomatico = false) {
        const { servicios: serviciosGist, categorias: categoriasGist } = this._gistDatosPendientes || {};
        if (!serviciosGist) return;

        let toastMsg;

        if (modo === 'replace') {
            this.servicios = serviciosGist;
            this._saveCategorias(categoriasGist.length > 0 ? categoriasGist : this._getCategorias());
            toastMsg = 'Datos reemplazados ✓';
        } else {
            const { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados } = this._mergeServicios(serviciosGist);
            const categoriasAgregadas = this._mergeCategorias(categoriasGist);

            if (serviciosAgregados === 0 && facturasAgregadas === 0 && facturasActualizadas === 0 && ingresosAgregados === 0 && categoriasAgregadas === 0) {
                this._gistDatosPendientes = null;
                this.cerrarModal('modal-gist-merge');
                this.mostrarToast('No hay datos nuevos para agregar', 'info');
                return;
            }

            const partes = [];
            if (serviciosAgregados > 0) partes.push(this._plural(serviciosAgregados, 'servicio', 'servicios'));
            if (facturasAgregadas > 0) partes.push(this._plural(facturasAgregadas, 'factura nueva', 'facturas nuevas'));
            if (facturasActualizadas > 0) partes.push(this._plural(facturasActualizadas, 'actualizada', 'actualizadas'));
            if (ingresosAgregados > 0) partes.push(this._plural(ingresosAgregados, 'ingreso nuevo', 'ingresos nuevos'));
            if (categoriasAgregadas > 0) partes.push(this._plural(categoriasAgregadas, 'categoría', 'categorías'));
            toastMsg = `Importado: ${partes.join(', ')}`;
        }

        this._postGuardado();

        const ahora = new Date().toLocaleString('es-AR');
        this.gistSetPerfil({ gistLastSync: ahora });
        this.gistMarcarSync('bajar');

        const elSync = document.getElementById('gist-ultima-sync');
        if (elSync) { elSync.textContent = `Última sincronización: ${ahora}`; elSync.classList.add('visible'); }

        this._gistDatosPendientes = null;
        this.cerrarModal('modal-gist-merge');
        this.mostrarToast(toastMsg, 'success');
    }

    async gistAutoSyncInit() {
        const perfil = this.gistGetPerfil();
        const token = this.gistGetToken();
        const autoSync = perfil.gistAutoSync ?? 0;
        if (!token || !this.gistEsIdValido(perfil.gistId)) return;

        // modo 1 = Restaurar: baja si está en rango y no superó 2 bajas/hora
        if (autoSync === 1 && this.gistDentroDelRango() && !this.gistSuperaLimite('bajar', 2)) {
            setTimeout(() => this.gistBajar(true), 2000);
        }
        // modo 2 = Respaldo: sube si está en rango y no superó 1 subida/hora
        else if (autoSync === 2 && this.gistDentroDelRango() && !this.gistSuperaLimite('subir', 1)) {
            setTimeout(() => this.gistSubir(), 2000);
        }
    }

    generarReporteEstadisticas() {
        if (this.tipoEstadisticaActual === 'individual') {
            this._generarReporteIndividual();
            return;
        }
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const mesActual = hoy.getMonth();
        const añoActual = hoy.getFullYear();

        const selectMes = document.getElementById('select-mes-estadisticas');
        let mesSeleccionado, añoSeleccionado;
        if (selectMes && selectMes.value) {
            const [año, mes] = selectMes.value.split('-');
            añoSeleccionado = parseInt(año);
            mesSeleccionado = parseInt(mes) - 1;
        } else {
            mesSeleccionado = mesActual;
            añoSeleccionado = añoActual;
        }

        const categoriaActiva = this._estadisticaCategoriaActiva || null;
        const nombreMes = new Date(añoSeleccionado, mesSeleccionado, 1)
            .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
        const nombreMesCorto = new Date(añoSeleccionado, mesSeleccionado, 1)
            .toLocaleDateString('es-AR', { month: 'long' });

        // Recolectar facturas involucradas
        const facturasMes = [];       // vencen en el mes seleccionado
        const facturasPagadasMes = []; // pagadas en el mes pero vencen otro mes
        const ingresos = [];

        this.servicios.forEach(servicio => {
            if (categoriaActiva && servicio.id !== this.SERVICIO_INGRESOS_ID) {
                if ((servicio.categoria || '') !== categoriaActiva) return;
            }

            servicio.facturas.forEach(factura => {
                const fechaVenc = this._parseDate(factura.fecha);
                const venceEsteMes = fechaVenc.getMonth() === mesSeleccionado && fechaVenc.getFullYear() === añoSeleccionado;

                if (servicio.id === this.SERVICIO_INGRESOS_ID) {
                    const fechaIngreso = this._parseDate(factura.fecha);
                    if (fechaIngreso.getMonth() === mesSeleccionado && fechaIngreso.getFullYear() === añoSeleccionado) {
                        ingresos.push({ servicio, factura });
                    }
                    return;
                }

                if (venceEsteMes) {
                    facturasMes.push({ servicio, factura, venceEsteMes: true });
                } else if (factura.pagada && factura.fechaPago) {
                    const fechaPago = this._parseDate(factura.fechaPago);
                    if (fechaPago.getMonth() === mesSeleccionado && fechaPago.getFullYear() === añoSeleccionado) {
                        facturasPagadasMes.push({ servicio, factura, venceEsteMes: false });
                    }
                }
            });
        });

        // Helper para formatear fecha legible
        const fmtFecha = (str) => {
            if (!str) return '—';
            return this._parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        // Helper estado factura
        const estadoFactura = (factura) => {
            if (factura.conCredito) return 'Con crédito';
            if (factura.pagada) {
                const mp = factura.fechaPago ? this._parseDate(factura.fechaPago).toLocaleDateString('es-AR', { month: 'long' }) : '';
                return `Pagada${mp ? ` en ${mp}` : ''}`;
            }
            const venc = this._parseDate(factura.fecha);
            venc.setHours(0, 0, 0, 0);
            return venc < hoy ? 'Vencida (pendiente)' : 'Pendiente';
        };

        // Calcular totales
        const sumar = (lista, pagada) => lista
            .filter(({ factura: f }) => pagada ? f.pagada : !f.pagada)
            .reduce((acc, { factura: f }) => {
                if ((f.moneda || 'ars') === 'usd') acc.usd += f.monto;
                else acc.ars += f.monto;
                return acc;
            }, { ars: 0, usd: 0 });

        const totalVencenARS = facturasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') !== 'usd' && f.monto > 0 ? a + f.monto : a, 0);
        const totalVencenUSD = facturasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') === 'usd' && f.monto > 0 ? a + f.monto : a, 0);
        const pagadasMes = sumar(facturasMes.filter(({ factura: f }) => !f.conCredito), true);
        const pendientesMes = sumar(facturasMes.filter(({ factura: f }) => !f.conCredito), false);
        const totalPagadasOtroMesARS = facturasPagadasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') !== 'usd' ? a + f.monto : a, 0);
        const totalPagadasOtroMesUSD = facturasPagadasMes.reduce((a, { factura: f }) => !f.conCredito && (f.moneda || 'ars') === 'usd' ? a + f.monto : a, 0);
        const totalIngresosARS = ingresos.reduce((a, { factura: f }) => (f.moneda || 'ars') !== 'usd' ? a + f.monto : a, 0);
        const totalIngresosUSD = ingresos.reduce((a, { factura: f }) => (f.moneda || 'ars') === 'usd' ? a + f.monto : a, 0);

        const sep = '─'.repeat(48);
        const sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;
        const fmt = (m, mon) => this.formatearMoneda(m, mon);

        let txt = '';
        txt += `${'═'.repeat(48)}\n`;
        txt += `  REPORTE DE ESTADÍSTICAS\n`;
        txt += `  Período: ${nombreMes.toUpperCase()}${categoriaActiva ? `  |  Categoría: ${categoriaActiva}` : ''}\n`;
        txt += `  Generado: ${new Date().toLocaleString('es-AR')}\n`;
        txt += `${sep2}\n\n`;

        // ── Facturas que vencen en el mes ──
        txt += `FACTURAS QUE VENCEN EN ${nombreMesCorto.toUpperCase()}\n`;
        txt += `${sep}\n`;
        if (facturasMes.length === 0) {
            txt += `  (ninguna)\n`;
        } else {
            facturasMes.forEach(({ servicio, factura }) => {
                const monto = factura.monto < 0
                    ? `  [saldo a favor ${fmt(Math.abs(factura.monto), factura.moneda || 'ars')}]`
                    : fmt(factura.monto, factura.moneda || 'ars');
                txt += `\n  ${servicio.nombre}\n`;
                txt += linea('  Vencimiento:', fmtFecha(factura.fecha)) + '\n';
                txt += linea('  Monto:', monto) + '\n';
                txt += linea('  Estado:', estadoFactura(factura)) + '\n';
                if (factura.pagada && factura.fechaPago) {
                    txt += linea('  Fecha de pago:', fmtFecha(factura.fechaPago)) + '\n';
                }
            });
            txt += `\n${sep}\n`;
            if (totalVencenARS > 0) txt += linea('  Total del mes (ARS):', fmt(totalVencenARS, 'ars')) + '\n';
            if (totalVencenUSD > 0) txt += linea('  Total del mes (USD):', fmt(totalVencenUSD, 'usd')) + '\n';
            if (pagadasMes.ars > 0) txt += linea('  Pagado (ARS):', fmt(pagadasMes.ars, 'ars')) + '\n';
            if (pagadasMes.usd > 0) txt += linea('  Pagado (USD):', fmt(pagadasMes.usd, 'usd')) + '\n';
            if (pendientesMes.ars > 0) txt += linea('  Pendiente (ARS):', fmt(pendientesMes.ars, 'ars')) + '\n';
            if (pendientesMes.usd > 0) txt += linea('  Pendiente (USD):', fmt(pendientesMes.usd, 'usd')) + '\n';
        }

        // ── Pagadas en el mes pero con otro vencimiento ──
        txt += `\nPAGADAS EN ${nombreMesCorto.toUpperCase()} (VENCIMIENTO OTRO MES)\n`;
        txt += `${sep}\n`;
        if (facturasPagadasMes.length === 0) {
            txt += `  (ninguna)\n`;
        } else {
            facturasPagadasMes.forEach(({ servicio, factura }) => {
                const mesVenc = this._parseDate(factura.fecha).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                txt += `\n  ${servicio.nombre}\n`;
                txt += linea('  Vencimiento original:', `${fmtFecha(factura.fecha)} (${mesVenc})`) + '\n';
                txt += linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars')) + '\n';
                txt += linea('  Fecha de pago:', fmtFecha(factura.fechaPago)) + '\n';
            });
            txt += `\n${sep}\n`;
            if (totalPagadasOtroMesARS > 0) txt += linea('  Subtotal (ARS):', fmt(totalPagadasOtroMesARS, 'ars')) + '\n';
            if (totalPagadasOtroMesUSD > 0) txt += linea('  Subtotal (USD):', fmt(totalPagadasOtroMesUSD, 'usd')) + '\n';
        }

        // ── Ingresos ──
        if (this.ingresosHabilitado() && ingresos.length > 0) {
            txt += `\nINGRESOS DEL MES\n`;
            txt += `${sep}\n`;
            ingresos.forEach(({ factura }) => {
                txt += `\n  ${factura.tipo || 'regular'}\n`;
                txt += linea('  Fecha:', fmtFecha(factura.fecha)) + '\n';
                txt += linea('  Monto:', fmt(factura.monto, factura.moneda || 'ars')) + '\n';
            });
            txt += `\n${sep}\n`;
            if (totalIngresosARS > 0) txt += linea('  Total ingresos (ARS):', fmt(totalIngresosARS, 'ars')) + '\n';
            if (totalIngresosUSD > 0) txt += linea('  Total ingresos (USD):', fmt(totalIngresosUSD, 'usd')) + '\n';
        }

        txt += `\n${sep2}\n`;
        txt += `  Fin del reporte\n`;
        txt += `${'═'.repeat(48)}\n`;

        this._descargarBlob(txt, `reporte_${nombreMes.replace(' ', '_')}.txt`);
        this.mostrarToast('Reporte generado', 'success');
    }

    _generarReporteIndividual() {
        const selectServicio = document.getElementById('calculador-servicio');
        const inputDesde = document.getElementById('calculador-desde');
        const inputHasta = document.getElementById('calculador-hasta');

        const servicioId = selectServicio?.value;
        const desde = inputDesde?.value;
        const hasta = inputHasta?.value;

        if (!servicioId) {
            this.mostrarToast('Seleccioná un servicio primero', 'info');
            return;
        }

        const servicio = this.servicios.find(s => s.id === servicioId);
        if (!servicio) return;

        const fmtFecha = (str) => {
            if (!str) return '—';
            return this._parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Filtrar facturas por rango
        let facturas = [...servicio.facturas];
        if (desde) facturas = facturas.filter(f => this._parseDate(f.fecha) >= this._parseDate(desde));
        if (hasta) facturas = facturas.filter(f => this._parseDate(f.fecha) <= this._parseDate(hasta));
        facturas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        // Totales
        let totalARS = 0, totalUSD = 0;
        let pagadasARS = 0, pagadasUSD = 0;
        let pendientesARS = 0, pendientesUSD = 0;

        facturas.forEach(f => {
            const moneda = f.moneda || 'ars';
            const monto = f.monto;
            if (moneda === 'usd') { totalUSD += monto; if (f.pagada) pagadasUSD += monto; else pendientesUSD += monto; }
            else { totalARS += monto; if (f.pagada) pagadasARS += monto; else pendientesARS += monto; }
        });

        const promARS = facturas.filter(f => (f.moneda || 'ars') === 'ars').length > 0
            ? totalARS / facturas.filter(f => (f.moneda || 'ars') === 'ars').length : 0;
        const promUSD = facturas.filter(f => (f.moneda || 'ars') === 'usd').length > 0
            ? totalUSD / facturas.filter(f => (f.moneda || 'ars') === 'usd').length : 0;

        const fmt = (m, mon) => this.formatearMoneda(m, mon);
        const sep = '─'.repeat(48);
        const sep2 = '═'.repeat(48);
        const linea = (label, valor) => `  ${label.padEnd(28)} ${valor}`;

        const periodoTxt = desde || hasta
            ? `${desde ? fmtFecha(desde) : '—'}  →  ${hasta ? fmtFecha(hasta) : '—'}`
            : 'Sin filtro de fechas';

        let txt = '';
        txt += `${sep2}\n`;
        txt += `  REPORTE INDIVIDUAL\n`;
        txt += `  Servicio: ${servicio.nombre}\n`;
        txt += `  Período: ${periodoTxt}\n`;
        txt += `  Generado: ${new Date().toLocaleString('es-AR')}\n`;
        txt += `${sep2}\n\n`;

        txt += `DETALLE DE FACTURAS (${facturas.length})\n`;
        txt += `${sep}\n`;

        if (facturas.length === 0) {
            txt += `  (ninguna en el período seleccionado)\n`;
        } else {
            facturas.forEach((f, i) => {
                const moneda = f.moneda || 'ars';
                let estadoTxt;
                if (f.conCredito) estadoTxt = 'Con crédito';
                else if (f.pagada) {
                    const mp = f.fechaPago ? this._parseDate(f.fechaPago).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : '';
                    estadoTxt = `Pagada${mp ? ` (${mp})` : ''}`;
                } else {
                    const venc = this._parseDate(f.fecha);
                    venc.setHours(0, 0, 0, 0);
                    estadoTxt = venc < hoy ? 'Vencida (pendiente)' : 'Pendiente';
                }

                txt += `\n  #${String(i + 1).padStart(2, '0')}  ${fmtFecha(f.fecha)}\n`;
                txt += linea('  Monto:', fmt(f.monto, moneda)) + '\n';
                txt += linea('  Estado:', estadoTxt) + '\n';
                if (f.pagada && f.fechaPago) txt += linea('  Fecha de pago:', fmtFecha(f.fechaPago)) + '\n';
                if (f.tipo && f.tipo !== 'mensual') txt += linea('  Tipo:', f.tipo) + '\n';
            });

            txt += `\n${sep}\n`;
            txt += `  RESUMEN\n`;
            txt += `${sep}\n`;
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

        this._descargarBlob(txt, `reporte_${servicio.nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.txt`);
        this.mostrarToast('Reporte generado', 'success');
    }

    // ========================================
    // MENÚ CONTEXTUAL SERVICIOS
    // ========================================

    _ctxInit() {
        const menu = document.getElementById('ctx-menu-servicio');

        document.addEventListener('pointerdown', (e) => {
            if (!menu.contains(e.target)) this._ctxCerrar();
        }, true);

        document.addEventListener('scroll', () => this._ctxCerrar(), true);

        document.getElementById('ctx-seleccionar').addEventListener('click', () => {
            const id = this._ctxServicioId;
            this._ctxCerrar();
            if (this.modoCalculadora) {
                this.desactivarModoCalculadora(true);
            } else {
                this._ctxSeleccionar(id);
            }
        });

        document.getElementById('ctx-copiar-monto').addEventListener('click', () => {
            this._ctxCopiarMonto();
            this._ctxCerrar();
        });

        document.getElementById('ctx-pagar-factura').addEventListener('click', () => {
            this._ctxPagarFactura();
            this._ctxCerrar();
        });
    }

    _ctxAbrir(e, servicioId) {
        e.preventDefault();
        this._ctxServicioId = servicioId;

        const estaSeleccionado = this.serviciosSeleccionados.has(servicioId);

        // Texto de seleccionar
        const btnSeleccionar = document.getElementById('ctx-seleccionar');
        btnSeleccionar.childNodes[btnSeleccionar.childNodes.length - 1].textContent =
            this.modoCalculadora ? ' Cancelar selección' : ' Seleccionar';

        // Texto de copiar monto
        const btnCopiar = document.getElementById('ctx-copiar-monto');
        btnCopiar.childNodes[btnCopiar.childNodes.length - 1].textContent =
            (estaSeleccionado && this.serviciosSeleccionados.size > 1) ? ' Copiar total' : ' Copiar monto';

        // Pagar: si está seleccionado, paga todas las seleccionadas; sino solo esta
        // Habilitado si hay al menos una factura del mes pagable en el scope
        const btnPagar = document.getElementById('ctx-pagar-factura');
        const btnPagarText = btnPagar.childNodes[btnPagar.childNodes.length - 1];
        if (estaSeleccionado && this.serviciosSeleccionados.size > 1) {
            const hayPagables = [...this.serviciosSeleccionados].some(id => {
                const f = this.obtenerUltimaFactura(id);
                return f && !f.pagada && !f.conCredito;
            });
            btnPagar.disabled = !hayPagables;
            btnPagarText.textContent = ` Pagar ${this.serviciosSeleccionados.size} seleccionados`;
        } else {
            const factura = this.obtenerUltimaFactura(servicioId);
            btnPagar.disabled = !factura || factura.pagada || !!factura.conCredito;
            btnPagarText.textContent = ' Pagar factura del mes';
        }

        const menu = document.getElementById('ctx-menu-servicio');
        const margen = 8;
        let x = e.clientX;
        let y = e.clientY;

        menu.style.setProperty('--ctx-x', '0px');
        menu.style.setProperty('--ctx-y', '0px');
        menu.classList.add('active');

        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;

        if (x + mw + margen > window.innerWidth) x = window.innerWidth - mw - margen;
        if (y + mh + margen > window.innerHeight) y = window.innerHeight - mh - margen;

        menu.style.setProperty('--ctx-x', `${x}px`);
        menu.style.setProperty('--ctx-y', `${y}px`);
    }

    _ctxCerrar() {
        document.getElementById('ctx-menu-servicio').classList.remove('active');
        this._ctxServicioId = null;
    }

    _ctxSeleccionar(servicioId) {
        if (!this.modoCalculadora) {
            this.activarModoCalculadora(true);
            this.serviciosSeleccionados.add(servicioId);
            this.actualizarCalculadora();
            this.renderServicios();
            return;
        }
        if (this.serviciosSeleccionados.has(servicioId)) {
            this.serviciosSeleccionados.delete(servicioId);
            if (this.serviciosSeleccionados.size === 0) {
                this.desactivarModoCalculadora(true);
                return;
            }
        } else {
            this.serviciosSeleccionados.add(servicioId);
        }
        this.actualizarCalculadora();
        this.renderServicios();
    }

    _ctxCopiarMonto() {
        const estaSeleccionado = this.serviciosSeleccionados.has(this._ctxServicioId);
        const ids = (estaSeleccionado && this.serviciosSeleccionados.size > 1)
            ? [...this.serviciosSeleccionados]
            : [this._ctxServicioId];

        let totalARS = 0;
        let totalUSD = 0;

        ids.forEach(id => {
            const factura = this.obtenerUltimaFactura(id);
            if (!factura) return;
            if ((factura.moneda || 'ars') === 'usd') {
                totalUSD += factura.monto;
            } else {
                totalARS += factura.monto;
            }
        });

        const partes = [];
        if (totalARS > 0) partes.push(this.formatearMoneda(totalARS, 'ars'));
        if (totalUSD > 0) partes.push(this.formatearMoneda(totalUSD, 'usd'));
        if (partes.length === 0) { this.mostrarToast('Sin factura del mes', 'info'); return; }

        const texto = partes.join(' + ');
        navigator.clipboard?.writeText(texto).then(() => {
            this.mostrarToast(`Copiado: ${texto}`, 'success');
        }).catch(() => {
            this.mostrarToast('No se pudo copiar', 'error');
        });
    }

    _ctxPagarFactura() {
        const estaSeleccionado = this.serviciosSeleccionados.has(this._ctxServicioId);
        const ids = (estaSeleccionado && this.serviciosSeleccionados.size > 1)
            ? [...this.serviciosSeleccionados]
            : [this._ctxServicioId];

        const hoy = this.obtenerFechaLocal();
        let pagadas = 0;

        ids.forEach(id => {
            const servicio = this.servicios.find(s => s.id === id);
            const factura = this.obtenerUltimaFactura(id);
            if (!servicio || !factura || factura.pagada || factura.conCredito) return;
            const idx = servicio.facturas.findIndex(f => f.id === factura.id);
            if (idx === -1) return;
            servicio.facturas[idx] = { ...servicio.facturas[idx], pagada: true, fechaPago: hoy };
            pagadas++;
        });

        if (pagadas === 0) return;

        this._postGuardado();
        if (estaSeleccionado && this.serviciosSeleccionados.size > 1) {
            this.desactivarModoCalculadora(true);
        }
        this.mostrarToast(pagadas === 1 ? 'Factura pagada ✓' : `${pagadas} facturas pagadas ✓`, 'success');
    }

    mostrarToast(mensaje, tipo = 'success') {
        const toast = document.getElementById('toast');

        // Cancelar el timeout anterior si existe
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        // Ocultar el toast actual si está visible
        toast.classList.remove('show');

        // Pequeño delay para permitir que la animación de salida se complete
        setTimeout(() => {
            toast.textContent = mensaje;
            toast.className = `toast ${tipo}`;
            toast.classList.add('show');

            // Guardar el nuevo timeout
            this.toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
                this.toastTimeout = null;
            }, 3000);
        }, 150);
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
                e.preventDefault();
                e.stopPropagation();
                this.select(el.dataset.value);
            });
        });
        const sel = this.native.options[this.native.selectedIndex];
        this.labelEl.textContent = sel ? sel.text : '';
    }

    select(value) {
        this.native.value = value;
        this.close();
        this.refresh();
        if (this.onChange) this.onChange();
    }

    toggle() {
        this.wrapper.classList.contains('open') ? this.close() : this.open();
    }

    open() {
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
        this.wrapper.classList.add('open');
        document.addEventListener('pointerdown', this._boundClose, true);
    }

    close() {
        this.wrapper.classList.remove('open');
        document.removeEventListener('pointerdown', this._boundClose, true);
    }

    _onOutsideClick(e) {
        if (!this.wrapper.contains(e.target)) {
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