import { SecurityAndUtils } from '../core/seguridad.js';
import { registrarSwipe } from './gestos.js';
import { $ } from '../core/dom.js';

// ============================================================
// TOAST MANAGER (Cola, deduplicación, velocidad dinámica, swipe)
// ============================================================
export const ToastManager = (function () {
    const _toastQueue = [];
    let _toastRunning = false;
    let _toastTimeout = null;
    let _mensajeActual = null;
    let _toastAccionActual = null;
    const MAX_TOAST_QUEUE = 5;
    const ESPERA_ANIM_MS = 350;

    // Toast con barra de progreso (p. ej. descarga de una actualización): entra en la cola como cualquier otro y se
    // queda en pantalla hasta que termina (tocarlo o deslizarlo no lo cierra); los que lleguen mientras tanto esperan
    // detrás. Si algo se cuelga, se retira solo pasado un tiempo.
    const PROGRESO_MAX_MS = 45000;
    let _timerProgreso = null;
    /** @type {{ mensaje: string, porcentaje: number | null } | null} */
    let _progreso = null;
    let _progresoVisible = false;

    // accion (opcional): { label, fn } muestra un botón dentro del toast (p. ej. "Deshacer").
    // Si accion es una función, al tocar el toast se ejecuta esa acción.
    // Tocar el resto del toast cuando hay un botón solo lo cierra.
    /** @param {string} mensaje @param {string} [tipo] @param {number} [duracion] @param {string | null} [detalle] @param {{ label: string, fn: () => void } | (() => void) | null} [accion] */
    /** @param {string} mensaje @param {string} [tipo] @param {number} [duracion] @param {string | null} [detalle] @param {{ label: string, fn: () => void } | (() => void) | null} [accion] */
    function mostrarToast(mensaje, tipo = 'info', duracion = 3000, detalle = null, accion = null) {
        const texto = detalle ? `${mensaje}, ${detalle}` : mensaje;
        const textoLimpio = SecurityAndUtils.limpiarTexto(texto, 200);
        const ultimo = _toastQueue[_toastQueue.length - 1];
        const actual = _toastRunning ? _mensajeActual : null;
        if ((ultimo && ultimo.mensaje === textoLimpio) || actual === textoLimpio) return;
        _toastQueue.push({ mensaje: textoLimpio, tipo, duracionBase: duracion, accion });
        if (_toastQueue.length > MAX_TOAST_QUEUE) {
            _toastQueue.splice(0, _toastQueue.length - MAX_TOAST_QUEUE);
        }
        if (!_toastRunning) _procesarToastQueue();
    }

    function _procesarToastQueue() {
        if (_toastQueue.length === 0) {
            _toastRunning = false;
            _mensajeActual = null;
            _toastAccionActual = null;
            if (_progreso) _mostrarProgreso();
            return;
        }

        _toastRunning = true;
        const actual = _toastQueue.shift();
        const toast = $('toast');
        if (!toast) return;

        toast.classList.remove('show');
        _mensajeActual = actual.mensaje;
        const texto = document.createElement('span');
        texto.className = 'toast-texto';
        texto.textContent = actual.mensaje;
        toast.replaceChildren(texto);

        const tieneBoton = actual.accion && typeof actual.accion === 'object' && actual.accion.label;
        if (tieneBoton) {
            _toastAccionActual = null;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toast-accion';
            btn.textContent = actual.accion.label;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                _cerrarToastActual();
                actual.accion.fn?.();
            }, { once: true });
            toast.appendChild(btn);
        } else if (typeof actual.accion === 'function') {
            _toastAccionActual = actual.accion;
        } else {
            _toastAccionActual = null;
        }

        const esAccionable = !!_toastAccionActual;
        toast.className = `toast ${actual.tipo}${tieneBoton ? ' toast-con-accion' : ''}${esAccionable ? ' toast-accionable' : ''}`;
        let duracionFinal = actual.duracionBase || 3000;
        // Con cola se acorta, salvo si tiene acción (hay que darle tiempo)
        if (_toastQueue.length >= 1 && !actual.accion) {
            duracionFinal = Math.floor(duracionFinal / 2);
        }

        setTimeout(() => {
            toast.classList.add('show');
            _habilitarCierreToast();
            _toastTimeout = setTimeout(() => {
                toast.classList.remove('show');
                _toastTimeout = null;
                _toastAccionActual = null;
                setTimeout(() => _procesarToastQueue(), 350);
            }, duracionFinal);
        }, 10);
    }

    function _pintarProgreso() {
        const toast = $('toast');
        if (!toast || !_progreso) return;
        const texto = toast.querySelector('.toast-texto');
        const barra = /** @type {HTMLProgressElement | null} */ (toast.querySelector('.toast-progreso'));
        const { mensaje, porcentaje } = _progreso;
        if (texto) texto.textContent = porcentaje === null ? mensaje : `${mensaje} ${porcentaje} %`;
        if (barra) { if (porcentaje === null) barra.removeAttribute('value'); else barra.value = porcentaje; }
    }

    function _mostrarProgreso() {
        const toast = $('toast');
        if (!toast || !_progreso) return;
        _toastRunning = true;
        _progresoVisible = true;
        _toastAccionActual = null;
        _habilitarCierreToast();
        toast.className = 'toast info toast-con-progreso';
        const texto = document.createElement('span');
        texto.className = 'toast-texto';
        const barra = document.createElement('progress');
        barra.className = 'toast-progreso';
        barra.max = 100;
        toast.replaceChildren(texto, barra);
        _pintarProgreso();
        requestAnimationFrame(() => { if (_progresoVisible) toast.classList.add('show'); });
        // seguro contra una descarga que nunca termina: no deja la cola bloqueada
        clearTimeout(_timerProgreso);
        _timerProgreso = setTimeout(_descartarProgreso, PROGRESO_MAX_MS);
    }

    function _ocultarProgreso() {
        clearTimeout(_timerProgreso);
        _progresoVisible = false;
        $('toast')?.classList.remove('show');
    }

    function _descartarProgreso() {
        if (!_progresoVisible) return;
        _progreso = null;
        _ocultarProgreso();
        setTimeout(() => _procesarToastQueue(), ESPERA_ANIM_MS);
    }

    /** Muestra un toast con barra de progreso (indeterminada hasta que se informe un porcentaje). */
    function iniciarProgreso(mensaje) {
        _progreso = { mensaje: SecurityAndUtils.limpiarTexto(mensaje, 200), porcentaje: null };
        if (!_toastRunning) _mostrarProgreso();
    }

    /** @param {number} porcentaje entero de 0 a 100 */
    function actualizarProgreso(porcentaje) {
        if (!_progreso) return;
        _progreso.porcentaje = porcentaje;
        if (_progresoVisible) _pintarProgreso();
    }

    /** Retira el toast de progreso (si estaba a la vista); lo que siga se muestra con `mostrarToast`. */
    function finalizarProgreso() {
        _progreso = null;
        if (!_progresoVisible) return;
        _ocultarProgreso();
        setTimeout(() => _procesarToastQueue(), ESPERA_ANIM_MS);
    }

    function _cerrarToastActual() {
        // el toast de progreso no se cierra al tocarlo ni al deslizarlo: se retira solo al terminar
        if (_progresoVisible) return;
        if (_toastTimeout) { clearTimeout(_toastTimeout); _toastTimeout = null; }
        _toastAccionActual = null;
        const toast = $('toast');
        if (!toast || !toast.classList.contains('show')) return;
        toast.classList.remove('show');
        setTimeout(() => _procesarToastQueue(), 350);
    }

    function _habilitarCierreToast() {
        const toast = $('toast');
        if (!toast || toast.dataset.cierreInit) return;
        toast.dataset.cierreInit = '1';
        toast.addEventListener('click', () => {
            const accion = _toastAccionActual;
            _cerrarToastActual();
            if (typeof accion === 'function') {
                accion();
            }
        });
        registrarSwipe(toast, () => _cerrarToastActual(), { minX: 40 });
    }

    return {
        mostrarToast,
        iniciarProgreso,
        actualizarProgreso,
        finalizarProgreso,
        cerrarActual: _cerrarToastActual
    };
})();
