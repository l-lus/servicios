import { ResumenMerge } from './resumen-merge.js';
import { GestorTemas } from './gestor-temas.js';
import { VistaPrevia } from './vista-previa.js';
import { AyudaBuscador } from './ayuda-buscador.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EventosApp } from '../core/eventos.js';
import { ModalManager } from './gestor-modales.js';
import { IconosAnimados } from './iconos-animados.js';
// ============================================================
// LISTENERSAPP
// ============================================================
export class ListenersApp {
    constructor(app) {
        this.app = app;
    }

    setupEventListeners() {
        // Botones principales
        document.getElementById('btn-agregar-servicio').addEventListener('click', () => {
            // Si está en modo calculadora, desactivar
            if (this.app.modoCalculadora) {
                this.app.desactivarModoCalculadora();
            } else {
                this.app.ui.toggleMenuAgregar();
            }
        });
        // Header → Perfiles → Ajustes (cada uno vuelve al anterior al cerrarse)
        document.getElementById('header-profile-btn').addEventListener('click', () => this.app.ui.abrirPerfiles());
        document.getElementById('btn-perfiles-ajustes').addEventListener('click', () => this.app.ui.abrirAjustes());
        document.getElementById('btn-cerrar-config').addEventListener('click', () => this.app.ui.cerrarModal('modal-config'));
        document.getElementById('btn-ayuda-perfiles').addEventListener('click', () => this.app.ui.abrirAyuda());
        document.getElementById('btn-ayuda-config').addEventListener('click', () => this.app.ui.abrirAyuda());
        // en Perfiles el botón abre la personalización del tema; el de Ajustes (solo visible en la bienvenida) sigue alternando claro/oscuro
        document.getElementById('theme-toggle-perfiles').addEventListener('click', () => {
            if (!VistaPrevia.activa()) this.app.ui.abrirVistaPreviaTema({ desdeModal: 'modal-selector-perfiles' });
        });
        document.getElementById('theme-toggle-config').addEventListener('click', () => GestorTemas.alternarClaroOscuro());
        document.getElementById('btn-cerrar-borrar').addEventListener('click', () => this.app.ui.cerrarModal('modal-borrar'));

        // Undo/Redo
        document.getElementById('btn-undo').addEventListener('click', () => this.app.historial_mgr.deshacer());
        document.getElementById('btn-redo').addEventListener('click', () => this.app.historial_mgr.rehacer());

        // Menú ajustes
        document.getElementById('menu-tema').addEventListener('click', () => {
            this.app.ui.abrirVistaPreviaTema({ desdeModal: 'modal-config' });
        });
        const btnExportar = document.getElementById('menu-exportar');
        const btnImportar = document.getElementById('menu-importar');
        IconosAnimados.ponerIconoFlecha(btnExportar, 'bandeja', 'subir');
        IconosAnimados.ponerIconoFlecha(btnImportar, 'bandeja', 'bajar');
        btnExportar.addEventListener('click', () => { IconosAnimados.animarFlecha(btnExportar, 'subir'); this.app.respaldo.abrir(); });
        this.app.respaldo.bindEventos();
        ResumenMerge.bindEventos();
        btnImportar.addEventListener('click', () => { IconosAnimados.animarFlecha(btnImportar, 'bajar'); this.app.storage.importarDatos('combinar'); });
        document.getElementById('menu-limpiar').addEventListener('click', () => this.app.ui.abrirModal('modal-borrar'));
        document.getElementById('menu-dolar').addEventListener('click', () => this.app.ui.cargarCotizacionDolar());
        document.getElementById('menu-borrar-todo').addEventListener('click', () => this.app.storage.limpiarDatos('todo'));
        document.getElementById('menu-borrar-servicios').addEventListener('click', () => this.app.storage.limpiarDatos('servicios'));
        document.getElementById('menu-borrar-facturas').addEventListener('click', () => this.app.storage.limpiarDatos('facturas'));
        document.getElementById('menu-borrar-ingresos').addEventListener('click', () => this.app.storage.limpiarDatos('ingresos'));
        document.getElementById('menu-borrar-categorias').addEventListener('click', () => this.app.storage.limpiarDatos('categorias'));
        document.getElementById('menu-toggle-ingresos').addEventListener('click', () => this.app.ui.toggleIngresos());
        document.getElementById('menu-toggle-blur').addEventListener('click', () => this.app.ui.toggleBlur());
        document.getElementById('menu-toggle-animaciones').addEventListener('click', () => this.app.ui.toggleAnimaciones());
        document.getElementById('menu-personalizar-resumen')?.addEventListener('click', () => this.app.ui.abrirVistaPreviaResumen({ desdeModal: 'modal-config' }));
        document.getElementById('menu-personalizar-calendario')?.addEventListener('click', () => this.app.ui.abrirVistaPreviaCalendario({ desdeModal: 'modal-config' }));
        document.getElementById('menu-toggle-hover-popup')?.addEventListener('click', () => this.app.ui.toggleHoverPopup());
        document.getElementById('menu-toggle-rueda-calendario')?.addEventListener('click', () => this.app.ui.toggleRuedaCalendario());
        EventosApp.on('tarjeta:personalizar', ({ tarjeta }) => {
            if (tarjeta === 'resumen') this.app.ui.abrirVistaPreviaResumen({});
            else if (tarjeta === 'calendario') this.app.ui.abrirVistaPreviaCalendario({});
            else if (tarjeta === 'tema') this.app.ui.abrirVistaPreviaTema({});
        });

        // Menú agregar
        document.getElementById('menu-agregar-overlay').addEventListener('click', () => this.app.ui.cerrarMenuAgregar());
        document.getElementById('menu-agregar-servicio').addEventListener('click', () => {
            this.app.ui.cerrarMenuAgregar();
            this.app.servicio.abrirModalServicio();
        });
        document.getElementById('menu-agregar-factura').addEventListener('click', () => {
            this.app.ui.cerrarMenuAgregar();
            this.app.ui.abrirModalFacturaRapida();
        });
        document.getElementById('menu-agregar-recibo').addEventListener('click', () => {
            this.app.ui.cerrarMenuAgregar();
            this.app.ingreso.abrirModal(null, true);
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
            this.app.modoCalculadoraTipo = 'pendientes';
            this.app.ui.cerrarMenuAgregar();
            this.app.activarModoCalculadora();
        });

        document.getElementById('menu-calcular-pagados').addEventListener('click', () => {
            this.app.modoCalculadoraTipo = 'pagados';
            this.app.ui.cerrarMenuAgregar();
            this.app.activarModoCalculadora();
        });

        // Listener para toggle de resumen (solo una vez)
        document.addEventListener('click', (e) => {
            if (e.target.closest('#resumen-toggle')) {
                this.app.estadisticas.toggleResumen();
            }
        });

        // Modales
        document.getElementById('modal-servicio-close').addEventListener('click', () => this.app.ui.cerrarModal('modal-agregar-servicio'));
        document.getElementById('modal-editar-servicio-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-editar-servicio');
            // Volver al modal de facturas si venimos desde ahí
            if (this.app.servicioActual) {
                this.app.factura.abrirModalLista(this.app.servicioActual);
            }
        });
        document.getElementById('modal-factura-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-agregar-factura');
            // Solo reabrir el modal de servicio si vino desde ahí
            if (this.app.origenModalFactura === 'servicio') {
                this.app.factura.abrirModalLista(this.app.servicioActual);
            }
        });

        // Menú de perfiles
        document.getElementById('menu-gist').addEventListener('click', () => {
            this.app.gist.abrirModal();
        });

        // Event listener para el botón volver del grid (modo agregar)
        document.getElementById('modal-factura-close-en-grid').addEventListener('click', () => {
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
        document.getElementById('form-servicio').addEventListener('submit', (e) => this.app.servicio.guardarServicio(e));
        document.getElementById('form-editar-servicio').addEventListener('submit', (e) => this.app.servicio.guardarServicio(e));
        document.getElementById('form-factura').addEventListener('submit', (e) => this.app.factura.guardar(e));
        document.getElementById('form-editar-factura').addEventListener('submit', (e) => this.app.factura.guardar(e));
        document.getElementById('btn-eliminar-servicio').addEventListener('click', () => this.app.servicio.eliminarServicio());
        document.getElementById('btn-borrar-facturas-servicio').addEventListener('click', () => this.app.factura.borrarTodas());
        document.getElementById('btn-fecha-hoy').addEventListener('click', () => this.app.factura.establecerFechaHoy('factura'));
        document.getElementById('btn-editar-fecha-hoy').addEventListener('click', () => this.app.factura.establecerFechaHoy('factura', 'editar'));
        document.getElementById('btn-eliminar-factura-modal').addEventListener('click', () => this.app.factura.eliminar());

        // Formulario de ingresos
        document.getElementById('form-ingreso').addEventListener('submit', (e) => this.app.ingreso.guardar(e));
        document.getElementById('form-editar-ingreso').addEventListener('submit', (e) => this.app.ingreso.guardar(e));
        document.getElementById('btn-eliminar-ingreso').addEventListener('click', () => this.app.ingreso.eliminar());
        document.getElementById('btn-ingreso-fecha-hoy').addEventListener('click', () => {
            this.app.factura.establecerFechaHoy('ingreso');
        });
        document.getElementById('btn-editar-ingreso-fecha-hoy').addEventListener('click', () => {
            this.app.factura.establecerFechaHoy('ingreso', 'editar');
        });

        document.getElementById('modal-ingreso-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-agregar-ingreso');
            if (!this.app.ingresoDesdeMenu) {
                this.app.ingreso.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
            }
        });
        document.getElementById('modal-ingreso-volver').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-editar-ingreso');
            if (!this.app.ingresoDesdeMenu) {
                this.app.ingreso.abrirModalLista(this.app.SERVICIO_INGRESOS_ID);
            }
        });

        document.getElementById('estadisticas-header').addEventListener('click', () => {
            this.app.estadisticas.toggleEstadisticas();
        });

        // Selector de tipo de estadística
        document.getElementById('estadisticas-tipo').addEventListener('change', (e) => {
            this.app.tipoEstadisticaActual = e.target.value;
            StorageHelper.setItem(STORAGE_KEYS.ESTADISTICAS_TIPO, e.target.value);
            this.app.estadisticas.cambiarTipoEstadistica();
        });

        document.getElementById('btn-calculador-ver-facturas').addEventListener('click', () => {
            const servicioId = document.getElementById('calculador-servicio').value;
            if (servicioId) this.app.factura.abrirModalLista(servicioId);
        });

        // Inicializar calculador individual
        this.app.estadisticas.inicializarCalculador();

        // Toggle de servicios colapsable (3 estados)
        document.getElementById('servicios-header').addEventListener('click', () => {
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
                const modalCat = document.getElementById('modal-nueva-categoria');
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
            if (document.getElementById('menu-agregar').classList.contains('active')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.altKey) return;

            if (/^[a-zA-Z]$/.test(e.key)) {
                e.preventDefault();
                const serviciosContent = document.getElementById('servicios-content');
                // Solo expandir desde collapsed → semi-collapsed (buscador visible, sin botones)
                // Si ya está en semi-collapsed o expanded el buscador ya es visible, no cambiar
                if (serviciosContent.classList.contains('collapsed')) {
                    this.app.vista.aplicarEstadoServicios('semi-collapsed');
                    StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');
                    this.app.serviciosCollapseState = 'semi-collapsed';
                }
                const searchInput = document.getElementById('search-input');
                searchInput.focus();
                searchInput.value = e.key;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        document.getElementById('menu-categorias').addEventListener('click', () => {
            this.app.categoria.abrirModal(null);
        });

        // Ayuda con buscador
        document.getElementById('modal-ayuda-close').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-ayuda');
        });
        AyudaBuscador.bindEventos();

        // ---- Listeners migrados desde inline handlers en el HTML ----

        // btn-reporte-estadisticas
        document.getElementById('btn-reporte-estadisticas').addEventListener('click', () => this.app.reporte.abrir());
        this.app.reporte.bindEventos();
        this.app.calendario.bindEventos();
        this.app.bienvenida.bindEventos();
        this.app.tarjetas.bindEventos();

        // Modal info-resumen (botón header + botón footer)
        document.getElementById('btn-cerrar-modal-info-resumen').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-info-resumen');
        });
        document.getElementById('btn-cerrar-modal-info-resumen-footer').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-info-resumen');
        });

        // btn-info-resumen: delegado en el contenedor estático para evitar
        // acumulación de listeners en cada llamada a _renderResumen (memory leak)
        document.getElementById('resumen-mes').addEventListener('click', (e) => {
            if (e.target.closest('#btn-info-resumen')) {
                e.stopPropagation();
                this.app.estadisticas.abrirModalInfoResumen();
            }
        });

        //gist
        const btnGistSubir = document.getElementById('btn-gist-subir');
        const btnGistBajar = document.getElementById('btn-gist-bajar');
        IconosAnimados.ponerIconoFlecha(btnGistSubir, 'nube', 'subir');
        IconosAnimados.ponerIconoFlecha(btnGistBajar, 'nube', 'bajar');
        document.getElementById('btn-gist-ir')?.addEventListener('click', () => this.app.gist.irAlGist());
        document.getElementById('gist-token-eye')?.addEventListener('click', () => this.app.gist.toggleToken());
        document.getElementById('gist-autosync-toggle')?.addEventListener('click', () => this.app.gist.toggleAuto());
        btnGistSubir?.addEventListener('click', () => this.app.gist.subir());
        btnGistBajar?.addEventListener('click', () => this.app.gist.bajar());
        document.getElementById('btn-gist-guardar')?.addEventListener('click', () => this.app.gist.guardarConfig());
        document.getElementById('btn-gist-cerrar')?.addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-gist');
        });
        document.getElementById('btn-gist-crear-token')?.addEventListener('click', () => {
            window.open('https://github.com/settings/tokens/new?description=Servicios+sync&scopes=gist', '_blank');
        });
        document.getElementById('gist-novedades-ok')?.addEventListener('click', () => this.app.gist.aplicarNovedades());
        document.getElementById('gist-novedades-ignorar-btn')?.addEventListener('click', () => this.app.ui.cerrarModal('modal-gist-novedades'));
        document.getElementById('btn-agregar-cat-servicio').addEventListener('click', () => {
            this.app.categoria.abrirModal('servicio-categoria');
        });
        document.getElementById('btn-agregar-cat-editar-servicio').addEventListener('click', () => {
            this.app.categoria.abrirModal('editar-servicio-categoria');
        });

        // Modal ordenar: cerrar
        document.getElementById('btn-cerrar-modal-ordenar').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-ordenar');
        });

        // Modal nueva-categoria: guardar / cerrar
        document.getElementById('btn-guardar-nueva-categoria').addEventListener('click', () => {
            this.app.categoria.guardarNueva();
        });
        document.getElementById('btn-cerrar-modal-categorias').addEventListener('click', () => {
            this.app.categoria.cerrarModal();
        });

        // Modal agregar-factura: toggle moneda / negativo / credito / pagada
        document.getElementById('btn-factura-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('factura-moneda', 'btn-factura-moneda');
        });
        document.getElementById('btn-toggle-negativo').addEventListener('click', () => {
            this.app.factura.toggleMontoNegativo('factura-monto');
        });
        document.getElementById('btn-toggle-credito').addEventListener('click', () => {
            this.app.factura.toggleConCredito();
        });
        document.getElementById('btn-toggle-pagada').addEventListener('click', () => {
            this.app.factura.toggleEstadoPago();
        });

        // Modal editar-factura: toggle moneda / negativo / credito / pagada
        document.getElementById('btn-editar-factura-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('editar-factura-moneda', 'btn-editar-factura-moneda');
        });
        document.getElementById('btn-editar-toggle-negativo').addEventListener('click', () => {
            this.app.factura.toggleMontoNegativo('editar-factura-monto');
        });
        document.getElementById('btn-editar-toggle-credito').addEventListener('click', () => {
            this.app.factura.toggleConCredito('editar');
        });
        document.getElementById('btn-editar-toggle-pagada').addEventListener('click', () => {
            this.app.factura.toggleEstadoPago('btn-editar-toggle-pagada', 'editar-factura-fecha-pago');
        });

        // Modal facturas-servicio: editar servicio / nueva factura / cerrar
        document.getElementById('btn-editar-servicio-desde-modal').addEventListener('click', () => {
            this.app.servicio.editarServicioDesdeModal();
        });
        document.getElementById('btn-modal-facturas-nueva-factura').addEventListener('click', () => {
            const servicioId = document.getElementById('modal-facturas-servicio').dataset.servicioId;
            this.app.factura.abrirModal(servicioId, null);
        });
        document.getElementById('btn-cerrar-modal-facturas-servicio').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-facturas-servicio');
        });

        // Modal ingresos-lista: nuevo ingreso / cerrar
        document.getElementById('btn-modal-ingresos-nuevo').addEventListener('click', () => {
            this.app.ingreso.abrirModal(null);
        });
        document.getElementById('btn-cerrar-modal-ingresos-lista').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-ingresos-lista');
        });

        // Modal agregar-ingreso: toggle moneda
        document.getElementById('btn-ingreso-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('ingreso-moneda', 'btn-ingreso-moneda');
        });

        // Modal editar-ingreso: toggle moneda
        document.getElementById('btn-editar-ingreso-moneda').addEventListener('click', () => {
            this.app.utils.toggleMoneda('editar-ingreso-moneda', 'btn-editar-ingreso-moneda');
        });

        // Modal perfiles: input Enter + botón agregar + toggle panel + cerrar
        document.getElementById('btn-toggle-agregar-perfil')?.addEventListener('click', () => {
            this.app.perfil.togglePanelAgregar();
        });
        document.getElementById('perfil-nuevo-nombre').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.app.perfil.crearInline();
            }
        });
        document.getElementById('btn-crear-perfil-inline').addEventListener('click', () => {
            this.app.perfil.crearInline();
        });
        document.getElementById('btn-cerrar-modal-perfiles').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-selector-perfiles');
        });

        // Modal editar-perfil: submit + volver
        document.getElementById('btn-eliminar-perfil-editor').addEventListener('click', () => this.app.perfil.eliminar(this.app.perfilEditando));
        document.getElementById('form-perfil').addEventListener('submit', (e) => {
            this.app.perfil.guardarEdicion(e);
        });
        document.getElementById('btn-cancelar-editar-perfil').addEventListener('click', () => {
            this.app.perfil.cancelarEditar();
        });

        // Modal debug-estadisticas: cerrar
        document.getElementById('btn-cerrar-modal-debug').addEventListener('click', () => {
            this.app.ui.cerrarModal('modal-debug-estadisticas');
        });

        // ---- Delegación de eventos para HTML generado dinámicamente ----

        // Perfiles: cambiar / eliminar / editar
        document.getElementById('perfiles-lista')?.addEventListener('click', (e) => {
            const card = e.target.closest('[data-action="cambiar-perfil"]');
            const btnEditar = e.target.closest('[data-action="editar-perfil"]');
            if (btnEditar) { e.stopPropagation(); this.app.perfil.abrirModalEditar(btnEditar.dataset.perfilId); return; }
            if (card) this.app.perfil.cambiar(card.dataset.perfilId);
        });

        // Estadísticas mensuales: abrir debug al clickear un item
        document.getElementById('estadisticas-mensual-container')?.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action="debug-estadisticas"]');
            if (item) this.app.estadisticas.abrirDebugEstadisticas(item.dataset.tipo);
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
                const header = e.target.closest('[data-action="toggle-grupo-cat"]');
                if (header) this.app.vista.toggleGrupoCat(header);
            });
            listaSvc.addEventListener('pointerdown', (e) => {
                const header = e.target.closest('[data-lp="true"]');
                if (header) this.app.vista._lpStart(e, header);
            });
            // pointerup y pointerleave cancelan el LP sin importar el target actual
            // (el dedo pudo haberse movido fuera del header durante el drag)
            listaSvc.addEventListener('pointerup', () => this.app.vista._lpCancel());
            listaSvc.addEventListener('pointerleave', () => this.app.vista._lpCancel());
            listaSvc.addEventListener('contextmenu', (e) => {
                if (e.target.closest('[data-lp="true"]') || this.app._lpFired) {
                    e.preventDefault();
                    this.app._lpFired = false;
                }
            });
        }

        // Modal facturas servicio: toggle grupos por año + editar factura al click
        document.getElementById('lista-facturas-modal')?.addEventListener('click', (e) => {
            const headerAno = e.target.closest('[data-action="toggle-grupo-ano"]');
            if (headerAno) { this.app.vista.toggleGrupoAno(headerAno); return; }
            const facturaInfo = e.target.closest('[data-action="factura-click"]');
            if (facturaInfo && facturaInfo.dataset.facturaAccion === 'editar-factura') {
                this.app.servicio.editarFactura(facturaInfo.dataset.facturaId);
            }
        });

        // Modal ingresos lista: toggle grupos por año + abrir ingreso al click
        document.getElementById('lista-ingresos-modal')?.addEventListener('click', (e) => {
            const headerAno = e.target.closest('[data-action="toggle-grupo-ano"]');
            if (headerAno) { this.app.vista.toggleGrupoAno(headerAno); return; }
            const ingresoInfo = e.target.closest('[data-action="abrir-ingreso"]');
            if (ingresoInfo) this.app.ingreso.abrirModal(ingresoInfo.dataset.ingresoId);
        });

        // Modal categorías: eliminar categoría
        document.getElementById('categorias-lista')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="eliminar-categoria"]');
            if (btn) this.app.categoria.eliminar(btn.dataset.cat);
        });

    }
}
