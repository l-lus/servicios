import { EventosApp } from '../core/eventos.js';
// ============================================================
// MODAL MANAGER & HISTORIAL (Popstate, jerarquía y confirmación)
// ============================================================
export const ModalManager = (function () {
    const _padres = {};
    const _accionesVolver = {
        'modal-confirmar': () => document.getElementById('modal-confirmar-cancel')?.click(),
        'modal-agregar-servicio': () => document.getElementById('modal-servicio-close')?.click(),
        'modal-editar-servicio': () => document.getElementById('modal-editar-servicio-close')?.click(),
        'modal-agregar-factura': () => document.getElementById('modal-factura-close')?.click(),
        'modal-editar-factura': () => document.getElementById('modal-factura-close-en-grid')?.click(),
        'modal-facturas-servicio': () => document.getElementById('btn-cerrar-modal-facturas-servicio')?.click(),
        'modal-ingresos-lista': () => document.getElementById('btn-cerrar-modal-ingresos-lista')?.click(),
        'modal-agregar-ingreso': () => document.getElementById('modal-ingreso-close')?.click(),
        'modal-editar-ingreso': () => document.getElementById('modal-ingreso-volver')?.click(),
        'modal-ordenar': () => document.getElementById('btn-cerrar-modal-ordenar')?.click(),
        'modal-nueva-categoria': () => document.getElementById('btn-cerrar-modal-categorias')?.click(),
        'modal-selector-perfiles': () => document.getElementById('btn-cerrar-modal-perfiles')?.click(),
        'modal-config': () => document.getElementById('btn-cerrar-config')?.click(),
        'modal-borrar': () => document.getElementById('btn-cerrar-borrar')?.click(),
        'modal-editar-perfil': () => document.getElementById('btn-cancelar-editar-perfil')?.click(),
        'modal-ayuda': () => document.getElementById('modal-ayuda-close')?.click(),
        'modal-info-resumen': () => document.getElementById('btn-cerrar-modal-info-resumen')?.click(),
        'modal-gist': () => document.getElementById('btn-gist-cerrar')?.click(),
        'modal-gist-novedades': () => document.getElementById('gist-novedades-ignorar-btn')?.click(),
        'modal-resumen-merge': () => document.getElementById('btn-resumen-merge-cancelar')?.click(),
        'modal-tarjetas': () => document.getElementById('modal-tarjetas-close')?.click(),
        'modal-bienvenida': () => document.getElementById('btn-bienvenida-omitir')?.click(),
        'modal-calendario-dia': () => document.getElementById('modal-calendario-dia-close')?.click(),
        'modal-reporte': () => document.getElementById('btn-reporte-cancelar')?.click(),
        'modal-respaldo': () => document.getElementById('btn-respaldo-cancelar')?.click(),
        'modal-debug-estadisticas': () => document.getElementById('btn-cerrar-modal-debug')?.click(),
        // 'menu-agregar' lo registra la app con registrarAccionVolver
    };

    function registrarAccionVolver(modalId, fn) {
        _accionesVolver[modalId] = fn;
    }

    let _navegandoHaciaAtras = false;
    // Cuántos popstate provocados por nuestro propio history.back() hay que ignorar (pueden encadenarse dos seguidos)
    let _popstatesAIgnorar = 0;
    let _enAlternanciaHaciaAdelante = false;
    let _enAlternanciaHaciaAtras = false;
    let _cierrePendiente = false;
    let _commitProgramado = false;

    function _programarCommit() {
        if (_commitProgramado) return;
        _commitProgramado = true;
        queueMicrotask(() => {
            _commitProgramado = false;
            if (!_cierrePendiente) return;
            _cierrePendiente = false;
            _popstatesAIgnorar++;
            history.back();
        });
    }

    // ── Origen de la animación (el modal crece desde lo que lo abrió) ──
    let _ultimoTrigger = null;
    let _ultimoClickCoords = null;
    const _origenesModal = {};
    const _triggerInfoPorModal = {};
    const SELECTOR_TRIGGER = 'button, [role="button"], a, .menu-item, .servicio-item, .factura-info, .categoria-tag, .custom-select-option, .icon-btn, [data-action]';

    window.addEventListener('pointerdown', (event) => {
        if (event.target.classList?.contains('modal')) return;
        _ultimoClickCoords = { x: event.clientX, y: event.clientY };
        _ultimoTrigger = event.target.closest(SELECTOR_TRIGGER) || event.target;
    }, true);

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const active = document.activeElement;
        if (active && active !== document.body && !active.classList.contains('modal')) {
            _ultimoTrigger = active;
            const r = active.getBoundingClientRect();
            _ultimoClickCoords = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }
    }, true);

    // transform-origin relativo a la posición final (centrada) del contenido
    function _calcularOrigen(triggerEl, coords, content) {
        let origenX = window.innerWidth / 2;
        let origenY = window.innerHeight / 2;

        const tr = triggerEl && document.body.contains(triggerEl) ? triggerEl.getBoundingClientRect() : null;
        if (tr && (tr.width > 0 || tr.height > 0)) {
            origenX = tr.left + tr.width / 2;
            origenY = tr.top + tr.height / 2;
        } else if (coords && coords.x !== undefined) {
            origenX = coords.x;
            origenY = coords.y;
        }

        // Posición de layout del contenido (offsetLeft/Top no se ven afectados
        // por el scale de la animación). Centrar sobre innerWidth falla por el
        // ancho de la barra de scroll.
        let left, top;
        const padre = content.offsetParent;
        if (padre) {
            const pr = padre.getBoundingClientRect();
            left = pr.left + content.offsetLeft;
            top = pr.top + content.offsetTop;
        } else {
            left = (window.innerWidth - (content.offsetWidth || 450)) / 2;
            top = (window.innerHeight - (content.offsetHeight || 350)) / 2;
        }
        return `${Math.round(origenX - left)}px ${Math.round(origenY - top)}px`;
    }

    function _aplicarOrigenAnimacion(modal, modalId) {
        const content = modal.querySelector('.modal-content');
        if (!content) return;

        // Volviendo a un modal padre: reusa el origen con que se abrió
        if (_enAlternanciaHaciaAtras && _origenesModal[modalId]) {
            content.style.transformOrigin = _origenesModal[modalId];
            return;
        }

        const origen = _calcularOrigen(_ultimoTrigger, _ultimoClickCoords, content);
        content.style.transformOrigin = origen;
        _origenesModal[modalId] = origen;
        _triggerInfoPorModal[modalId] = { trigger: _ultimoTrigger, coords: _ultimoClickCoords };
    }

    // Al cerrar, el modal se encoge hacia el mismo origen del que salió
    function _restaurarOrigen(modal) {
        const content = modal.querySelector('.modal-content');
        if (content && _origenesModal[modal.id]) content.style.transformOrigin = _origenesModal[modal.id];
    }

    function _limpiarOrigenDiferido(modalId) {
        setTimeout(() => {
            const modal = document.getElementById(modalId);
            if (modal && (modal.classList.contains('show') || modal.classList.contains('active'))) return;
            delete _origenesModal[modalId];
            delete _triggerInfoPorModal[modalId];
        }, 350);
    }

    window.addEventListener('resize', () => {
        document.querySelectorAll('.modal.show, .modal.active').forEach(modal => {
            const content = modal.querySelector('.modal-content');
            const info = _triggerInfoPorModal[modal.id];
            if (content && info) {
                const origen = _calcularOrigen(info.trigger, info.coords, content);
                content.style.transformOrigin = origen;
                _origenesModal[modal.id] = origen;
            }
        });
    }, { passive: true });

    function _getAccionVolver(modalId) {
        return _accionesVolver[modalId] || null;
    }

    function _ejecutarAccionCierre(modalId) {
        const accionVolver = _getAccionVolver(modalId);
        if (accionVolver) {
            accionVolver();
        } else if (_padres[modalId]) {
            alternar(modalId, _padres[modalId]);
        } else {
            cerrar(modalId);
        }

        // Fallback de seguridad: si el modal sigue abierto, forzar cierre limpio
        const el = document.getElementById(modalId);
        if (el && (el.classList.contains('show') || el.classList.contains('active'))) {
            cerrar(modalId);
        }
    }

    window.addEventListener('popstate', (event) => {
        if (_popstatesAIgnorar > 0) {
            _popstatesAIgnorar--;
            return;
        }

        _cierrePendiente = false;
        _navegandoHaciaAtras = true;

        // Context menu abierto tiene prioridad máxima
        const ctxMenu = document.getElementById('ctx-menu-servicio');
        if (ctxMenu && (ctxMenu.classList.contains('active') || ctxMenu.classList.contains('show'))) {
            _ejecutarAccionCierre('ctx-menu-servicio');
            setTimeout(() => { _navegandoHaciaAtras = false; }, 50);
            return;
        }

        // Modales en pantalla
        const modalesAbiertos = Array.from(document.querySelectorAll('.modal.show, .modal.active'));
        if (modalesAbiertos.length > 0) {
            const topModal = modalesAbiertos[modalesAbiertos.length - 1];
            _ejecutarAccionCierre(topModal.id);
            setTimeout(() => { _navegandoHaciaAtras = false; }, 50);
            return;
        }

        // Paneles laterales
        const menuAgregar = document.getElementById('menu-agregar');
        if (menuAgregar && (menuAgregar.classList.contains('active') || menuAgregar.classList.contains('show'))) {
            _ejecutarAccionCierre('menu-agregar');
            setTimeout(() => { _navegandoHaciaAtras = false; }, 50);
            return;
        }

        setTimeout(() => { _navegandoHaciaAtras = false; }, 50);
    });

    let _mousedownEnOverlay = false;

    function _handleOverlayMousedown(event) {
        _mousedownEnOverlay = (event.target === event.currentTarget) &&
            event.target.classList.contains('modal') &&
            (event.target.classList.contains('show') || event.target.classList.contains('active'));
    }

    function handleOutsideClick(event) {
        if (!_mousedownEnOverlay) return;
        _mousedownEnOverlay = false;
        if (event.target === event.currentTarget &&
            event.target.classList.contains('modal') &&
            (event.target.classList.contains('show') || event.target.classList.contains('active'))) {
            const modalId = event.target.id;
            if (modalId === 'modal-confirmar') {
                return;
            }
            _ejecutarAccionCierre(modalId);
        }
    }

    function abrir(modalId, callback = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        if (modal.classList.contains('modal')) _aplicarOrigenAnimacion(modal, modalId);
        modal.classList.add('show', 'active');
        document.body.classList.add('modal-open');

        if (!_navegandoHaciaAtras && !_enAlternanciaHaciaAtras) {
            if (_cierrePendiente) {
                _cierrePendiente = false;
                history.replaceState({ modalId: modalId }, "");
            } else {
                history.pushState({ modalId: modalId }, "");
            }
        }

        setTimeout(() => {
            modal.addEventListener('pointerdown', _handleOverlayMousedown, { passive: true });
            modal.addEventListener('mousedown', _handleOverlayMousedown);
            modal.addEventListener('click', handleOutsideClick);
        }, 100);

        if (callback) callback();
    }

    function cerrar(modalId, callback = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const estabaAbierto = modal.classList.contains('show') || modal.classList.contains('active');
        _restaurarOrigen(modal);
        modal.classList.remove('show', 'active');
        _limpiarOrigenDiferido(modalId);

        if (document.querySelectorAll('.modal.show, .modal.active, .menu-ajustes.active, .menu-ajustes.show, .menu-agregar.active, .menu-agregar.show').length === 0) {
            document.body.classList.remove('modal-open');
        }

        modal.removeEventListener('pointerdown', _handleOverlayMousedown);
        modal.removeEventListener('mousedown', _handleOverlayMousedown);
        modal.removeEventListener('click', handleOutsideClick);

        EventosApp.emit('modal:cerrado', { modalId });

        if (estabaAbierto && !_navegandoHaciaAtras && !_enAlternanciaHaciaAdelante) {
            _cierrePendiente = true;
            _programarCommit();
        }

        if (callback) callback();
    }

    function alternar(modalIdCerrar, modalIdAbrir, callbackCerrar = null, callbackAbrir = null) {
        const esHaciaAtras = (_padres[modalIdCerrar] === modalIdAbrir);

        if (esHaciaAtras) {
            _enAlternanciaHaciaAtras = true;
            delete _padres[modalIdCerrar];
        } else {
            _enAlternanciaHaciaAdelante = true;
            if (modalIdCerrar && modalIdAbrir) {
                _padres[modalIdAbrir] = modalIdCerrar;
            }
        }

        cerrar(modalIdCerrar, callbackCerrar);
        abrir(modalIdAbrir, callbackAbrir);

        _enAlternanciaHaciaAdelante = false;
        _enAlternanciaHaciaAtras = false;
    }

    /** Abre `modalId`; si `padreId` está abierto lo reemplaza y, al cerrar el hijo, se vuelve a él (como en Horarios). */
    function abrirConPadre(modalId, padreId) {
        const padre = document.getElementById(padreId);
        const abierto = padre && (padre.classList.contains('show') || padre.classList.contains('active'));
        if (abierto && modalId !== padreId) alternar(padreId, modalId);
        else abrir(modalId);
    }

    /** Cierra `modalId` y, si se había abierto desde otro modal, vuelve a ese. */
    function cerrarConRetorno(modalId) {
        const padre = _padres[modalId];
        if (padre) alternar(modalId, padre);
        else cerrar(modalId);
    }

    function cerrarTodos() {
        _cierrePendiente = false;
        document.querySelectorAll('.custom-select-dropdown.csd-fixed').forEach(dd => {
            if (dd._csdInstance) dd._csdInstance.close();
            else if (dd.parentElement === document.body) dd.remove();
        });

        document.querySelectorAll('.modal, #menu-agregar, #ctx-menu-servicio').forEach(modal => {
            _restaurarOrigen(modal);
            modal.classList.remove('show', 'active');
            _limpiarOrigenDiferido(modal.id);
            modal.removeEventListener('pointerdown', _handleOverlayMousedown);
            modal.removeEventListener('mousedown', _handleOverlayMousedown);
            modal.removeEventListener('click', handleOutsideClick);
        });
        document.querySelectorAll('#menu-agregar-overlay').forEach(el => el.classList.remove('active', 'show'));
        Object.keys(_padres).forEach(k => delete _padres[k]);
        document.body.classList.remove('modal-open');

        EventosApp.emit('modales:cerrados-todos');
    }

    function confirmar(texto, labelOk = 'Confirmar', icono = '#icon-trash', opciones = {}) {
        return new Promise((resolve) => {
            const elTexto = document.getElementById('modal-confirmar-texto');
            const elLabel = document.getElementById('modal-confirmar-label-ok');
            const elLabelCancel = document.getElementById('modal-confirmar-label-cancel');
            const elTitulo = document.getElementById('modal-confirmar-titulo');
            const elIcono = document.querySelector('#modal-confirmar-ok svg use');
            const elIconoCancel = document.querySelector('#modal-confirmar-cancel svg use');
            const btnOk = document.getElementById('modal-confirmar-ok');
            const btnCancel = document.getElementById('modal-confirmar-cancel');
            if (!elTexto || !btnOk || !btnCancel) { resolve(false); return; }

            elTexto.textContent = texto;
            if (elLabel) elLabel.textContent = labelOk;
            if (elLabelCancel) elLabelCancel.textContent = opciones.labelCancel || 'Cancelar';
            if (elTitulo) elTitulo.textContent = opciones.titulo || 'Atención';
            if (elIcono) elIcono.setAttribute('href', icono);
            if (elIconoCancel) elIconoCancel.setAttribute('href', opciones.iconoCancel || '#icon-cancel');

            const modalPadre = document.querySelector('.modal.show, .modal.active');
            const modalPadreId = modalPadre ? modalPadre.id : null;

            function ok() { cleanup(); resolve(true); }
            function cancel() { cleanup(); resolve(false); }

            function onPopstate() {
                _removeListeners();
                resolve(false);
            }

            function _removeListeners() {
                btnOk.removeEventListener('click', ok);
                btnCancel.removeEventListener('click', cancel);
                window.removeEventListener('popstate', onPopstate);
            }

            function cleanup() {
                _removeListeners();
                if (modalPadreId) {
                    alternar('modal-confirmar', modalPadreId);
                } else {
                    cerrar('modal-confirmar');
                }
            }

            btnOk.addEventListener('click', ok);
            btnCancel.addEventListener('click', cancel);
            window.addEventListener('popstate', onPopstate, { once: true });
            if (modalPadreId) {
                alternar(modalPadreId, 'modal-confirmar');
            } else {
                abrir('modal-confirmar');
            }
        });
    }

    return {
        abrir,
        cerrar,
        alternar,
        abrirConPadre,
        cerrarConRetorno,
        cerrarTodos,
        confirmar,
        ejecutarAccionCierre: _ejecutarAccionCierre,
        getPadre: (id) => _padres[id] || null,
        setPadre: (id, padreId) => { if (id && padreId) _padres[id] = padreId; },
        registrarAccionVolver
    };
})();

// Compatibilidad con llamadas legacy a BackNav
export const BackNav = {
    abrir: (id, cerrarFn) => {
        if (cerrarFn) ModalManager.registrarAccionVolver(id, cerrarFn);
        ModalManager.abrir(id);
    },
    cerrar: (id) => ModalManager.cerrar(id),
    cerrarTodo: () => ModalManager.cerrarTodos()
};
