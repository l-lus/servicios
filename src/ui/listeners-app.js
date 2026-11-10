import { ResumenMerge } from './resumen-merge.js';
import { VistaPrevia } from './vista-previa.js';
import { AyudaBuscador } from './ayuda-buscador.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { ModalManager } from './gestor-modales.js';
import { IconosAnimados } from './iconos-animados.js';
import { $, delegado, valorDe } from '../core/dom.js';
// ============================================================
// LISTENERSAPP
// ============================================================
export class ListenersApp {
    constructor(app) {
        this.app = app;
    }

    setupEventListeners() {
        // Botones principales
        $('btn-agregar-servicio').addEventListener('click', () => {
            // Si está en modo calculadora, desactivar
            if (this.app.modoCalculadora) {
                this.app.desactivarModoCalculadora();
            } else {
                this.app.ui.toggleMenuAgregar();
            }
        });
        // Header → Perfiles → Ajustes (cada uno vuelve al anterior al cerrarse)
        $('header-profile-btn').addEventListener('click', () => this.app.ui.abrirPerfiles());
        $('btn-perfiles-ajustes').addEventListener('click', () => this.app.ui.abrirAjustes());
        $('btn-cerrar-config').addEventListener('click', () => this.app.ui.cerrarModal('modal-config'));
        $('btn-ayuda-perfiles').addEventListener('click', () => this.app.ui.abrirAyuda());
        $('btn-ayuda-config').addEventListener('click', () => this.app.ui.abrirAyuda());
        // en Perfiles el botón abre la personalización del tema
        $('theme-toggle-perfiles').addEventListener('click', () => {
            if (!VistaPrevia.activa()) this.app.ui.abrirVistaPreviaTema({ desdeModal: 'modal-selector-perfiles' });
        });
        $('btn-cerrar-borrar').addEventListener('click', () => this.app.ui.cerrarModal('modal-borrar'));

        // Undo/Redo
        $('btn-undo').addEventListener('click', () => this.app.historial_mgr.deshacer());
        $('btn-redo').addEventListener('click', () => this.app.historial_mgr.rehacer());

        // Menú ajustes
        $('menu-tema').addEventListener('click', () => {
            this.app.ui.abrirVistaPreviaTema({ desdeModal: 'modal-config' });
        });
        const btnExportar = $('menu-exportar');
        const btnImportar = $('menu-importar');
        IconosAnimados.ponerIconoFlecha(btnExportar, 'bandeja', 'subir');
        IconosAnimados.ponerIconoFlecha(btnImportar, 'bandeja', 'bajar');
        btnExportar.addEventListener('click', () => { IconosAnimados.animarFlecha(btnExportar, 'subir'); this.app.respaldo.abrir(); });
        this.app.respaldo.bindEventos();
        ResumenMerge.bindEventos();
        btnImportar.addEventListener('click', () => { IconosAnimados.animarFlecha(btnImportar, 'bajar'); this.app.storage.importarDatos('combinar'); });
        $('menu-limpiar').addEventListener('click', () => this.app.ui.abrirModal('modal-borrar'));
        $('menu-dolar').addEventListener('click', () => this.app.ui.cargarCotizacionDolar());
        $('menu-borrar-todo').addEventListener('click', () => this.app.storage.limpiarDatos('todo'));
        $('menu-borrar-servicios').addEventListener('click', () => this.app.storage.limpiarDatos('servicios'));
        $('menu-borrar-facturas').addEventListener('click', () => this.app.storage.limpiarDatos('facturas'));
        $('menu-borrar-ingresos').addEventListener('click', () => this.app.storage.limpiarDatos('ingresos'));
        $('menu-borrar-categorias').addEventListener('click', () => this.app.storage.limpiarDatos('categorias'));
        $('menu-toggle-ingresos').addEventListener('click', () => this.app.ui.toggleIngresos());
        $('menu-toggle-blur').addEventListener('click', () => this.app.ui.toggleBlur());
        $('menu-toggle-animaciones').addEventListener('click', () => this.app.ui.toggleAnimaciones());
        $('menu-personalizar-resumen')?.addEventListener('click', () => this.app.ui.abrirVistaPreviaResumen({ desdeModal: 'modal-config' }));
        $('menu-personalizar-calendario')?.addEventListener('click', () => this.app.ui.abrirVistaPreviaCalendario({ desdeModal: 'modal-config' }));
        $('menu-toggle-hover-popup')?.addEventListener('click', () => this.app.ui.toggleHoverPopup());
        $('menu-toggle-rueda-calendario')?.addEventListener('click', () => this.app.ui.toggleRuedaCalendario());
        EventosApp.on('tarjeta:personalizar', ({ tarjeta }) => {
            if (tarjeta === 'resumen') this.app.ui.abrirVistaPreviaResumen({});
            else if (tarjeta === 'calendario') this.app.ui.abrirVistaPreviaCalendario({});
            else if (tarjeta === 'tema') this.app.ui.abrirVistaPreviaTema({});
        });

        // Menú agregar
        $('menu-agregar-overlay').addEventListener('click', () => this.app.ui.cerrarMenuAgregar());
        $('menu-agregar-servicio').addEventListener('click', () => {
            this.app.ui.cerrarMenuAgregar();
            this.app.servicio.abrirModalServicio();
        });
        $('menu-agregar-factura').addEventListener('click', () => {
            this.app.ui.cerrarMenuAgregar();
            this.app.ui.abrirModalFacturaRapida();
        });
        $('menu-agregar-recibo').addEventListener('click', () => {
            this.app.ui.cerrarMenuAgregar();
            this.app.ingreso.abrirModal(null, true);
        });
        $('menu-agregar-calcular').addEventListener('click', () => {
            $('menu-vista-principal').classList.add('hidden-vista');
            const vistaCalc = $('menu-vista-calcular');
            vistaCalc.classList.add('visible-vista');
            vistaCalc.classList.remove('anim-slide-up');
            void vistaCalc.offsetWidth; // reflow para reiniciar animación
            vistaCalc.classList.add('anim-slide-up');
        });

        $('menu-calcular-volver').addEventListener('click', () => {
            $('menu-vista-calcular').classList.remove('visible-vista');
            $('menu-vista-calcular').classList.add('hidden-vista');
            const vistaPrincipal = $('menu-vista-principal');
            vistaPrincipal.classList.remove('hidden-vista');
            vistaPrincipal.classList.remove('anim-slide-up');
            void vistaPrincipal.offsetWidth;
            vistaPrincipal.classList.add('anim-slide-up');
        });

        $('menu-calcular-pendientes').addEventListener('click', () => {
            this.app.modoCalculadoraTipo = 'pendientes';
            this.app.ui.cerrarMenuAgregar();
            this.app.activarModoCalculadora();
        });

        $('menu-calcular-pagados').addEventListener('click', () => {
            this.app.modoCalculadoraTipo = 'pagados';
            this.app.ui.cerrarMenuAgregar();
            this.app.activarModoCalculadora();
        });

        // Listener para toggle de resumen (solo una vez)
        document.addEventListener('click', (e) => {
            if (delegado(e, '#resumen-toggle')) {
                this.app.estadisticas.toggleResumen();
            }
        });

        // Modales
        $('modal-servicio-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-agregar-servicio'));
        $('modal-editar-servicio-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-editar-servicio');
            // Volver al modal de facturas si venimos desde ahí
            if (this.app.servicioActual) {
                this.app.factura.abrirModalLista(this.app.servicioActual);
            }
        });
        $('modal-factura-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-agregar-factura');
            // Solo reabrir el modal de servicio si vino desde ahí
            if (this.app.origenModalFactura === 'servicio') {
                this.app.factura.abrirModalLista(this.app.servicioActual);
            }
        });

        // Menú de perfiles
        $('menu-gist').addEventListener('click', () => {
            this.app.gist.abrirModal();
        });

        // Event listener para el botón volver del grid (modo agregar)
        $('modal-factura-close-en-grid').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-editar-factura');
            // Solo reabrir el modal de servicio si vino desde ahí
            if (this.app.origenModalFactura === 'servicio') {
                this.app.factura.abrirModalLista(this.app.servicioActual);
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
        $('form-servicio').addEventListener('submit', (e) => this.app.servicio.guardarServicio(e));
        $('form-editar-servicio').addEventListener('submit', (e) => this.app.servicio.guardarServicio(e));
        $('form-factura').addEventListener('submit', (e) => this.app.factura.guardar(e));
        $('form-editar-factura').addEventListener('submit', (e) => this.app.factura.guardar(e));
        $('btn-eliminar-servicio').addEventListener('click', () => this.app.servicio.eliminarServicio());
        $('btn-borrar-facturas-servicio').addEventListener('click', () => this.app.factura.borrarTodas());
        $('btn-fecha-hoy').addEventListener('click', () => this.app.factura.establecerFechaHoy('factura'));
        $('btn-editar-fecha-hoy').addEventListener('click', () => this.app.factura.establecerFechaHoy('factura', 'editar'));
        $('btn-eliminar-factura-modal').addEventListener('click', () => this.app.factura.eliminar());

        // Formulario de ingresos
        $('form-ingreso').addEventListener('submit', (e) => this.app.ingreso.guardar(e));
        $('form-editar-ingreso').addEventListener('submit', (e) => this.app.ingreso.guardar(e));
        $('btn-eliminar-ingreso').addEventListener('click', () => this.app.ingreso.eliminar());
        $('btn-ingreso-fecha-hoy').addEventListener('click', () => {
            this.app.factura.establecerFechaHoy('ingreso');
        });
        $('btn-editar-ingreso-fecha-hoy').addEventListener('click', () => {
            this.app.factura.establecerFechaHoy('ingreso', 'editar');
        });

        $('modal-ingreso-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-agregar-ingreso');
            if (!this.app.ingresoDesdeMenu) {
                this.app.ingreso.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
            }
        });
        $('modal-ingreso-volver').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-editar-ingreso');
            if (!this.app.ingresoDesdeMenu) {
                this.app.ingreso.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
            }
        });

        $('estadisticas-header').addEventListener('click', () => {
            this.app.estadisticas.toggleEstadisticas();
        });

        // Selector de tipo de estadística
        $('estadisticas-tipo').addEventListener('change', (e) => {
            this.app.tipoEstadisticaActual = valorDe(e);
            StorageHelper.setItem(STORAGE_KEYS.ESTADISTICAS_TIPO, valorDe(e));
            this.app.estadisticas.cambiarTipoEstadistica();
        });

        $('btn-calculador-ver-facturas').addEventListener('click', () => {
            const servicioId = $('calculador-servicio').value;
            if (servicioId) this.app.factura.abrirModalLista(servicioId);
        });

        // Inicializar calculador individual
        this.app.estadisticas.inicializarCalculador();

        // Toggle de servicios colapsable (3 estados)
        $('servicios-header').addEventListener('click', () => {
            this.app.vista.toggleServicios();
        });
        // Atajos de teclado
        document.addEventListener('keydown', (e) => {
            // ESC: cerrar modales, menús, modo calculadora o búsqueda
            if (e.key === 'Escape') {
                const hayCapaAbierta = document.querySelector(
                    '.modal.show, .modal.active, .menu-agregar.active, .menu-agregar.show, #ctx-menu-servicio.active, #ctx-menu-servicio.show'
                );

                if (this.app.modoCalculadora) { this.app.desactivarModoCalculadora(); return; }
                if (hayCapaAbierta) {
                    e.preventDefault();
                    this.app.ui.volverDesdeModalActivo();
                    return;
                }
                if (this.app.terminoBusqueda) { this.app.utils.limpiarBusqueda(); return; }
            }

            // Enter en modal nueva categoría
            if (e.key === 'Enter') {
                const modalCat = $('modal-nueva-categoria');
                if (modalCat && (modalCat.classList.contains('active') || modalCat.classList.contains('show'))) {
                    e.preventDefault();
                    this.app.categoria.guardarNueva();
                    return;
                }
            }

            // Ctrl/Cmd + Z/Y para undo/redo
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault(); this.app.historial_mgr.deshacer();
                } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                    e.preventDefault(); this.app.historial_mgr.rehacer();
                }
                return; // no continuar al bloque de letra suelta
            }

            // Atajo de letra suelta → foco al buscador (solo desktop, sin modales/menús)
            if (window.innerWidth < 768) return;
            if (document.querySelector('.modal.active')) return;
            if ($('menu-agregar').classList.contains('active')) return;
            const destino = /** @type {HTMLElement} */ (e.target);
            if (destino.tagName === 'INPUT' || destino.tagName === 'TEXTAREA' || destino.isContentEditable) return;
            if (e.altKey) return;

            if (/^[a-zA-Z]$/.test(e.key)) {
                e.preventDefault();
                const serviciosContent = $('servicios-content');
                // Solo expandir desde collapsed → semi-collapsed (buscador visible, sin botones)
                // Si ya está en semi-collapsed o expanded el buscador ya es visible, no cambiar
                if (serviciosContent.classList.contains('collapsed')) {
                    this.app.vista.aplicarEstadoServicios('semi-collapsed');
                    StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');
                    this.app.serviciosCollapseState = 'semi-collapsed';
                }
                const searchInput = $('search-input');
                searchInput.focus();
                searchInput.value = e.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        $('menu-categorias').addEventListener('click', () => {
            this.app.categoria.abrirModal(null);
        });

        // Ayuda con buscador
        $('modal-ayuda-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-ayuda');
        });
        AyudaBuscador.bindEventos();

        // ---- Listeners migrados desde inline handlers en el HTML ----

        // btn-reporte-estadisticas
        $('btn-reporte-estadisticas').addEventListener('click', () => this.app.reporte.abrir());
        this.app.reporte.bindEventos();
        this.app.calendario.bindEventos();
        this.app.bienvenida.bindEventos();
        this.app.tarjetas.bindEventos();

        // Modal info-resumen (botón header + botón footer)
        $('btn-cerrar-modal-info-resumen').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-info-resumen');
        });
        $('btn-cerrar-modal-info-resumen-footer').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-info-resumen');
        });

        // btn-info-resumen: delegado en el contenedor estático para evitar
        // acumulación de listeners en cada llamada a _renderResumen (memory leak)
        $('resumen-mes').addEventListener('click', (e) => {
            if (delegado(e, '#btn-info-resumen')) {
                e.stopPropagation();
                this.app.estadisticas.abrirModalInfoResumen();
            }
        });

        //gist
        const btnGistSubir = $('btn-gist-subir');
        const btnGistBajar = $('btn-gist-bajar');
        IconosAnimados.ponerIconoFlecha(btnGistSubir, 'nube', 'subir');
        IconosAnimados.ponerIconoFlecha(btnGistBajar, 'nube', 'bajar');
        $('btn-gist-ir')?.addEventListener('click', () => this.app.gist.irAlGist());
        $('gist-token-eye')?.addEventListener('click', () => this.app.gist.toggleToken());
        $('gist-autosync-toggle')?.addEventListener('click', () => this.app.gist.toggleAuto());
        $('gist-frase-eye')?.addEventListener('click', () => this.app.gist.toggleFrase());
        $('btn-gist-generar-frase')?.addEventListener('click', () => this.app.gist.generarFrase());
        $('gist-recordar-frase-toggle')?.addEventListener('click', () => this.app.gist.toggleRecordarFrase());
        btnGistSubir?.addEventListener('click', () => this.app.gist.subir());
        btnGistBajar?.addEventListener('click', () => this.app.gist.bajar());
        $('btn-gist-guardar')?.addEventListener('click', () => this.app.gist.guardarConfig());
        $('btn-gist-cerrar')?.addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-gist');
        });
        $('btn-gist-crear-token')?.addEventListener('click', () => {
            window.open('https://github.com/settings/tokens/new?description=Servicios+sync&scopes=gist', '_blank');
        });
        $('gist-novedades-ok')?.addEventListener('click', () => this.app.gist.aplicarNovedades());
        $('gist-novedades-ignorar-btn')?.addEventListener('click', () => this.app.ui.cerrarModal('modal-gist-novedades'));
        $('btn-agregar-cat-servicio').addEventListener('click', () => {
            this.app.categoria.abrirModal('servicio-categoria');
        });
        $('btn-agregar-cat-editar-servicio').addEventListener('click', () => {
            this.app.categoria.abrirModal('editar-servicio-categoria');
        });

        // Modal ordenar: cerrar
        $('btn-cerrar-modal-ordenar').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-ordenar');
        });

        // Modal nueva-categoria: guardar / cerrar
        $('btn-guardar-nueva-categoria').addEventListener('click', () => {
            this.app.categoria.guardarNueva();
        });
        $('btn-cerrar-modal-categorias').addEventListener('click', () => {
            this.app.categoria.cerrarModal();
        });

        // Modal agregar-factura: toggle moneda / negativo / credito / pagada
        $('btn-factura-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('factura-moneda', 'btn-factura-moneda');
        });
        $('btn-toggle-negativo').addEventListener('click', () => {
            this.app.factura.toggleMontoNegativo('factura-monto');
        });
        $('btn-toggle-credito').addEventListener('click', () => {
            this.app.factura.toggleConCredito();
        });
        $('btn-toggle-pagada').addEventListener('click', () => {
            this.app.factura.toggleEstadoPago();
        });

        // Modal editar-factura: toggle moneda / negativo / credito / pagada
        $('btn-editar-factura-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('editar-factura-moneda', 'btn-editar-factura-moneda');
        });
        $('btn-editar-toggle-negativo').addEventListener('click', () => {
            this.app.factura.toggleMontoNegativo('editar-factura-monto');
        });
        $('btn-editar-toggle-credito').addEventListener('click', () => {
            this.app.factura.toggleConCredito('editar');
        });
        $('btn-editar-toggle-pagada').addEventListener('click', () => {
            this.app.factura.toggleEstadoPago('btn-editar-toggle-pagada', 'editar-factura-fecha-pago');
        });

        // Modal facturas-servicio: editar servicio / nueva factura / cerrar
        $('btn-editar-servicio-desde-modal').addEventListener('click', () => {
            this.app.servicio.editarServicioDesdeModal();
        });
        $('btn-modal-facturas-nueva-factura').addEventListener('click', () => {
            const servicioId = $('modal-facturas-servicio').dataset.servicioId;
            this.app.factura.abrirModal(servicioId, null);
        });
        $('btn-cerrar-modal-facturas-servicio').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-facturas-servicio');
        });

        // Modal ingresos-lista: nuevo ingreso / cerrar
        $('btn-modal-ingresos-nuevo').addEventListener('click', () => {
            this.app.ingreso.abrirModal(null);
        });
        $('btn-cerrar-modal-ingresos-lista').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-ingresos-lista');
        });

        // Modal agregar-ingreso: toggle moneda
        $('btn-ingreso-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('ingreso-moneda', 'btn-ingreso-moneda');
        });

        // Modal editar-ingreso: toggle moneda
        $('btn-editar-ingreso-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('editar-ingreso-moneda', 'btn-editar-ingreso-moneda');
        });

        // Modal perfiles: input Enter + botón agregar + toggle panel + cerrar
        $('btn-toggle-agregar-perfil')?.addEventListener('click', () => {
            this.app.perfil.togglePanelAgregar();
        });
        $('perfil-nuevo-nombre').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.app.perfil.crearInline();
            }
        });
        $('btn-crear-perfil-inline').addEventListener('click', () => {
            this.app.perfil.crearInline();
        });
        $('btn-cerrar-modal-perfiles').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-selector-perfiles');
        });

        // Modal editar-perfil: submit + volver
        $('btn-eliminar-perfil-editor').addEventListener('click', () => this.app.perfil.eliminar(this.app.perfilEditando));
        $('form-perfil').addEventListener('submit', (e) => {
            this.app.perfil.guardarEdicion(e);
        });
        $('btn-cancelar-editar-perfil').addEventListener('click', () => {
            this.app.perfil.cancelarEditar();
        });

        // Modal debug-estadisticas: cerrar
        $('btn-cerrar-modal-debug').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-debug-estadisticas');
        });

        // ---- Delegación de eventos para HTML generado dinámicamente ----

        // Perfiles: cambiar / eliminar / editar
        $('perfiles-lista')?.addEventListener('click', (e) => {
            const card = delegado(e, '[data-action="cambiar-perfil"]');
            const btnEditar = delegado(e, '[data-action="editar-perfil"]');
            if (btnEditar) { e.stopPropagation(); this.app.perfil.abrirModalEditar(btnEditar.dataset.perfilId); return; }
            if (card) this.app.perfil.cambiar(card.dataset.perfilId);
        });

        // Estadísticas mensuales: abrir debug al clickear un item
        $('estadisticas-mensual-container')?.addEventListener('click', (e) => {
            const item = delegado(e, '[data-action="debug-estadisticas"]');
            if (item) this.app.estadisticas.abrirDebugEstadisticas(item.dataset.tipo);
        });

        // Lista de servicios: toggle grupos por categoría + long press
        const listaSvc = $('servicios-lista');
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
                    this.app.vista._lpCancel();
                }
            }, { passive: true });
            // El browser dispara pointercancel cuando toma control del touch (scroll nativo)
            listaSvc.addEventListener('pointercancel', () => {
                _scrolled = true;
                this.app.vista._lpCancel();
            });

            listaSvc.addEventListener('click', (e) => {
                if (_scrolled) return;
                const header = delegado(e, '[data-action="toggle-grupo-cat"]');
                if (header) this.app.vista.toggleGrupoCat(header);
            });
            listaSvc.addEventListener('pointerdown', (e) => {
                const header = delegado(e, '[data-lp="true"]');
                if (header) this.app.vista._lpStart(e, header);
            });
            // pointerup y pointerleave cancelan el LP sin importar el target actual
            // (el dedo pudo haberse movido fuera del header durante el drag)
            listaSvc.addEventListener('pointerup', () => this.app.vista._lpCancel());
            listaSvc.addEventListener('pointerleave', () => this.app.vista._lpCancel());
            listaSvc.addEventListener('contextmenu', (e) => {
                if (delegado(e, '[data-lp="true"]') || this.app._lpFired) {
                    e.preventDefault();
                    this.app._lpFired = false;
                }
            });
        }

        // Modal facturas servicio: toggle grupos por año + editar factura al click
        $('lista-facturas-modal')?.addEventListener('click', (e) => {
            const headerAno = delegado(e, '[data-action="toggle-grupo-ano"]');
            if (headerAno) { this.app.vista.toggleGrupoAno(headerAno); return; }
            const facturaInfo = delegado(e, '[data-action="factura-click"]');
            if (facturaInfo && facturaInfo.dataset.facturaAccion === 'editar-factura') {
                this.app.servicio.editarFactura(facturaInfo.dataset.facturaId);
            }
        });

        // Modal ingresos lista: toggle grupos por año + abrir ingreso al click
        $('lista-ingresos-modal')?.addEventListener('click', (e) => {
            const headerAno = delegado(e, '[data-action="toggle-grupo-ano"]');
            if (headerAno) { this.app.vista.toggleGrupoAno(headerAno); return; }
            const ingresoInfo = delegado(e, '[data-action="abrir-ingreso"]');
            if (ingresoInfo) this.app.ingreso.abrirModal(ingresoInfo.dataset.ingresoId);
        });

        // Modal categorías: eliminar categoría
        $('categorias-lista')?.addEventListener('click', (e) => {
            const btn = delegado(e, '[data-action="eliminar-categoria"]');
            if (btn) this.app.categoria.eliminar(btn.dataset.cat);
        });

    }
}
