import { crudo, html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { EstadoFacturas } from '../services/estado-facturas.js';
import { Anim } from './animaciones.js';
import { $ } from '../core/dom.js';
// ============================================================
// VISTASERVICIOS
// ============================================================
export class VistaServicios {
    constructor(app) {
        this.app = app;
    }

    toggleServicios() {
        // Si estamos en expanded y hay timer activo (clic rápido después de abrir botones)
        if (this.app.serviciosCollapseState === 'expanded' && this.app.toggleServiciosTimer !== null) {
            // Cerrar todo de golpe
            clearTimeout(this.app.toggleServiciosTimer);
            this.app.toggleServiciosTimer = null;
            this.app.serviciosCollapseState = 'collapsed';
            this.aplicarEstadoServicios('collapsed');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'collapsed');

            // Limpiar búsqueda al colapsar
            if (this.app.terminoBusqueda) this.app.utils.limpiarBusqueda();
            return;
        }

        // Limpiar timer si existe
        if (this.app.toggleServiciosTimer !== null) {
            clearTimeout(this.app.toggleServiciosTimer);
            this.app.toggleServiciosTimer = null;
        }

        // Ciclo normal de estados
        if (this.app.serviciosCollapseState === 'collapsed') {
            // De collapsed a semi-collapsed
            this.app.serviciosCollapseState = 'semi-collapsed';
            this.aplicarEstadoServicios('semi-collapsed');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');

        } else if (this.app.serviciosCollapseState === 'semi-collapsed') {
            // De semi-collapsed a expanded (AQUÍ INICIA EL TIMER)
            this.app.serviciosCollapseState = 'expanded';
            this.aplicarEstadoServicios('expanded');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'expanded');

            // Activar timer de 3 segundos
            this.app.toggleServiciosTimer = setTimeout(() => {
                this.app.toggleServiciosTimer = null;
            }, this.app.toggleServiciosDelay);

        } else {
            // De expanded a semi-collapsed (después de que expiró el timer)
            this.app.serviciosCollapseState = 'semi-collapsed';
            this.aplicarEstadoServicios('semi-collapsed');
            StorageHelper.setItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'semi-collapsed');

            // Limpiar búsqueda al contraer
            if (this.app.terminoBusqueda) this.app.utils.limpiarBusqueda();
        }
    }

    obtenerEstadoFactura(factura) {
        const tipo = EstadoFacturas.clasificarFactura(factura);
        const vista = {
            favor: [html`<div class="factura-estado-pagado">Saldo a favor</div>`, 'factura-monto factura-monto-favor'],
            pagada: [html`<div class="factura-estado-pagado">✓ Pagada</div>`, 'factura-monto'],
            vencida: [html`<div class="factura-estado-vencido">⚠ Vencida</div>`, 'factura-monto'],
            pendiente: [html`<div class="factura-estado-pendiente">⏱ Pendiente</div>`, 'factura-monto'],
        }[tipo];
        return { estadoPago: vista[0], claseMonto: vista[1] };
    }

    aplicarEstadoServicios(estado) {
        const contenido = $('servicios-content');
        const chevron = $('servicios-chevron');

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

    calcularEstadoServicio(servicio) {
        return EstadoFacturas.estadoServicio(servicio);
    }

    renderServicios() {
        const nombrePerfil = $('nombre-perfil-header');
        if (nombrePerfil) nombrePerfil.textContent = EstadoApp.perfiles[EstadoApp.perfilActivo]?.nombre || '';

        const lista = $('servicios-lista');
        if (!lista) return;

        const scrollPos = window.scrollY;

        // Separar servicios normales del servicio de ingresos
        const serviciosNormales = EstadoApp.servicios.filter(s => s.id !== this.app.SERVICIO_INGRESOS_ID);
        const servicioIngresos = EstadoApp.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);

        const pintar = (contenido) => {
            const fn = () => { montar(lista, contenido); };
            if (this.app._animarRender) Anim.diffLista(lista, '.servicio-wrapper', 'data-id', fn);
            else fn();
        };

        if (serviciosNormales.length === 0 && !this.app.ui.ingresosHabilitado()) {
            pintar(html`
                  <div class="empty-state">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="12" y1="9" x2="12" y2="15"/>
                          <line x1="9" y1="12" x2="15" y2="12"/>
                      </svg>
                      <p>No hay servicios registrados<br>Presiona el botón + para agregar uno</p>
                  </div>
              `);
            this.app.estadisticas.actualizarResumenMes();
            return;
        }

        // Filtrar servicios normales
        let serviciosFiltrados = this.aplicarFiltro(serviciosNormales);

        // Ordenar servicios según el orden actual
        const serviciosOrdenados = this.ordenarServicios(serviciosFiltrados);

        // Renderizar servicios normales agrupados por categoría
        const generarItemServicio = (servicio) => {
            const { estado, claseEstado, montoTexto, fechaTexto } = this.calcularEstadoServicio(servicio);
            const claseCalculando = this.app.serviciosSeleccionados.has(servicio.id) ? 'calculando' : '';
            return html`
   <div class="servicio-wrapper" data-id="${servicio.id}">
  <div class="servicio-item ${claseEstado} ${claseCalculando}" data-id="${servicio.id}">
                      <div class="servicio-nombre">${servicio.nombre}</div>
                       <div class="servicio-info">
                          <span class="servicio-monto">${montoTexto}</span>
                           ${fechaTexto ? html`<span class="servicio-fecha">${fechaTexto}</span>` : ''}
                       </div>
                    ${estado ? html`<span class="servicio-estado estado-${claseEstado}">${estado}</span>` : ''}
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

        const partes = [];

        // Renderizar servicios normales agrupados según la opción de vista
        if (this.app._vistaEstados) {
            const grupos = [
                { key: 'pendiente', label: 'Pendientes', clases: ['vencido', 'urgente', 'proximo', 'lejano'] },
                { key: 'sin-facturas-mes', label: 'Sin facturas este mes', clases: ['sin-facturas-mes'] },
                { key: 'pagado', label: 'Pagados', clases: ['pagado'] },
                { key: 'sin-facturas', label: 'Sin facturas', clases: ['sin-facturas'] },
            ];
            grupos.forEach(grupo => {
                const items = serviciosOrdenados.filter(s => grupo.clases.includes(this.calcularEstadoServicio(s).claseEstado));
                if (items.length === 0) return;
                const collapsed = this.app._catColapsadas[`__estado_${grupo.key}`] ? 'collapsed' : '';
                partes.push(html`
    <div class="servicios-grupo-cat" data-cat="__estado_${grupo.key}">
        <div class="servicios-grupo-cat-header" data-action="toggle-grupo-cat" data-lp="true">
            <div class="servicios-grupo-cat-header-info">
                <span class="servicios-grupo-cat-texto">${grupo.label}</span>
                <span class="servicios-grupo-cat-contador">(${items.length})</span>
            </div>
            <svg class="icon servicios-grupo-cat-chevron ${collapsed}"><use href="#icon-chevron-down"/></svg>
        </div>
        <div class="servicios-grupo-cat-contenido ${collapsed}">
            <div class="collapsible-inner">
                <div class="servicios-mosaico">
                    ${items.map(generarItemServicio)}
                </div>
            </div>
        </div>
    </div>`);
            });
        } else if (catKeys.length <= 1 || !this.app._agrupacionActiva) {
            if (serviciosOrdenados.length > 0) {
                partes.push(html`
    <div class="servicios-mosaico">
        ${serviciosOrdenados.map(generarItemServicio)}
    </div>`);
            }
        } else {
            catKeys.forEach(cat => {
                const items = gruposCat[cat];
                const catLabel = cat || 'Sin categoría';
                const collapsed = this.app._catColapsadas[cat] ? 'collapsed' : '';
                const cantidad = items.length;
                const itemsHTML = items.map(generarItemServicio);

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
                let alertaIconHTML = html``;
                if (mejorAlerta) {
                    const svgPath = (mejorAlerta === 'proximo' || mejorAlerta === 'sin-facturas-mes')
                        ? '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/>'
                        : '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1.2" fill="currentColor"/>';
                    alertaIconHTML = html`<svg class="cat-alerta-icon ${mejorAlerta}" viewBox="0 0 24 24" width="14" height="14">${crudo(svgPath)}</svg>`;
                }

                partes.push(html`
    <div class="servicios-grupo-cat" data-cat="${cat}">
        <div class="servicios-grupo-cat-header" data-action="toggle-grupo-cat" data-lp="true">
            <div class="servicios-grupo-cat-header-info">
                <span class="servicios-grupo-cat-texto">${catLabel}</span>
                <span class="servicios-grupo-cat-contador">(${cantidad})</span>
            </div>
            <div class="d-flex align-items-center gap-1">
               ${alertaIconHTML}
             <svg class="icon servicios-grupo-cat-chevron ${collapsed}"><use href="#icon-chevron-down"/></svg>
         </div>
        </div>
        <div class="servicios-grupo-cat-contenido ${collapsed}">
            <div class="collapsible-inner">
                <div class="servicios-mosaico">
                    ${itemsHTML}
                </div>
            </div>
        </div>
    </div>
                    `);
            });
        }

        // Agregar servicio de ingresos si está habilitado Y (no hay búsqueda O coincide con la búsqueda)
        if (this.app.ui.ingresosHabilitado() && (!this.app.terminoBusqueda || 'ingresos'.includes(this.app.terminoBusqueda))) {
            // Crear servicio de ingresos si no existe
            if (!servicioIngresos) {
                this.app.ingreso.crearServicio();
            }

            const ingresos = servicioIngresos || EstadoApp.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
            if (ingresos) {
                partes.push(html`
                    <div class="servicios-mosaico">
                        ${generarItemServicio(ingresos)}
                    </div>
                `);
            }
        }

        pintar(html`${partes}`);

        // Eventos de click en servicios
        lista.querySelectorAll('.servicio-item').forEach(item => {
            const servicioId = item.dataset.id;
            const esIngresos = servicioId === this.app.SERVICIO_INGRESOS_ID;

            item.addEventListener('click', (e) => {
                // Evitar que se dispare si se hace click en un botón
                if (e.target.closest('button')) return;

                // Si está en modo calculadora, toggle selección
                if (this.app.modoCalculadora) {
                    this.app.calculador.toggleServicio(servicioId);
                    return;
                }

                if (esIngresos) {
                    this.app.ingreso.abrirModalLista(servicioId);
                } else {
                    this.app.factura.abrirModalLista(servicioId);
                }
            });

            // Menú contextual (solo servicios normales, no ingresos)
            if (!esIngresos) {
                item.addEventListener('contextmenu', (e) => {
                    this.app.ctx.abrir(e, servicioId);
                });
            }

            // Actualizar menú flotante
            this.app.ui.actualizarMenuAgregar();
        });

        this.app.calendario.render();

        // Restaurar posición de scroll
        requestAnimationFrame(() => {
            window.scrollTo(0, scrollPos);
        });

        // Solo actualizar resumen y calculador si no estamos filtrando por búsqueda
        if (!this.app.enModoBusqueda) {
            this.app.estadisticas.actualizarResumenMes();
            this.app.estadisticas.actualizarSelectServicios();
            this.app.calculador.calcularPeriodo();
        }
    }

    aplicarFiltro(servicios) {
        return EstadoFacturas.filtrar(servicios, this.app.terminoBusqueda);
    }

    ordenarServicios(servicios) {
        return EstadoFacturas.ordenar(servicios, this.app.ordenActual);
    }

    /** Forma de la lista: 'todo' (plana), 'categorias' (agrupada) o 'estados' (agrupada por estado). */
    cambiarVista(valor) {
        this.app._vistaEstados = valor === 'estados';
        this.app._agrupacionActiva = valor === 'categorias';
        StorageHelper.setItem(STORAGE_KEYS.CAT_AGRUPACION, this.app._agrupacionActiva ? 'on' : 'off');
        StorageHelper.setItem(STORAGE_KEYS.VISTA_ESTADOS, this.app._vistaEstados ? 'true' : 'false');
        this.renderServicios();
    }

    aplicarOrden() {
        const select = $('select-orden');
        this.app.ordenActual = select.value;
        StorageHelper.setItem(STORAGE_KEYS.ORDEN, this.app.ordenActual);
        this.renderServicios();
        this.app.mostrarToast('Orden aplicado', 'success');
    }

    toggleGrupoCat(headerElement) {
        if (this.app._lpFired) { this.app._lpFired = false; return; }
        const chevron = headerElement.querySelector('.servicios-grupo-cat-chevron');
        const contenido = headerElement.nextElementSibling;
        const cat = headerElement.closest('.servicios-grupo-cat')?.dataset.cat ?? '';

        const estaColapsado = chevron.classList.contains('collapsed');
        if (estaColapsado) {
            chevron.classList.remove('collapsed');
            contenido.classList.remove('collapsed');
            delete this.app._catColapsadas[cat];
            Anim.scrollAlExpandir(headerElement.closest('.servicios-grupo-cat'));
        } else {
            chevron.classList.add('collapsed');
            contenido.classList.add('collapsed');
            this.app._catColapsadas[cat] = true;
        }
        StorageHelper.setItem(STORAGE_KEYS.CAT_COLAPSADAS, this.app._catColapsadas);
    }

    _lpStart(event, headerElement) {
        this.app._lpTimer = setTimeout(() => {
            this.app._lpFired = true;
            this.toggleTodosGruposCat(headerElement);
        }, 500);
        this.app._lpFired = false;
    }

    _lpCancel() {
        clearTimeout(this.app._lpTimer);
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
                delete this.app._catColapsadas[cat];
            } else {
                // Colapsar todos
                chevron.classList.add('collapsed');
                contenido.classList.add('collapsed');
                this.app._catColapsadas[cat] = true;
            }
        });
        StorageHelper.setItem(STORAGE_KEYS.CAT_COLAPSADAS, this.app._catColapsadas);
        this.app.mostrarToast(estaColapsado ? 'Categorías expandidas' : 'Categorías colapsadas', 'info');
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
        const moneda = factura.moneda === 'usd' ? 'usd' : 'ars';
        const badgeClass = moneda;
        const pagoBadge = factura.pagada
            ? (factura.conCredito
                ? html`<span class="moneda-badge credito">Crédito</span>`
                : html`<span class="moneda-badge contado">Contado</span>`)
            : '';

        return html`
    <div class="factura-item" data-id="${factura.id}">
        <div class="factura-info" ${accion ? html`data-action="factura-click" data-factura-accion="${accion}" data-factura-id="${factura.id}"` : ''}>
            <div class="${claseMonto}">${this.app.utils.formatearMoneda(factura.monto, moneda)}<span class="moneda-badge ${badgeClass}">${moneda.toUpperCase()}</span>${pagoBadge}</div>
            <div class="factura-fecha">
                ${factura.tipo || 'mensual'} | Vence: ${this.app.utils.formatearFecha(factura.fecha)}
            </div>
            ${estadoPago}
        </div>
    </div>
`;
    }

    obtenerUltimaFactura(servicioId) {
        return EstadoFacturas.ultimaFactura(EstadoApp.servicios.find(s => s.id === servicioId));
    }
}
