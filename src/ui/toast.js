import { SecurityAndUtils } from '../core/seguridad.js';
import { registrarSwipe } from './gestos.js';

// ============================================================
// TOAST MANAGER (Cola, deduplicación, velocidad dinámica, swipe)
// ============================================================
export const ToastManager = (function () {
    const _toastQueue = [];
    let _toastRunning = false;
    let _toastTimeout = null;
    let _mensajeActual = null;
    const MAX_TOAST_QUEUE = 5;

    // accion (opcional): { label, fn } muestra un botón dentro del toast
    // (p. ej. "Deshacer"). Tocar el resto del toast solo lo cierra.
    function mostrarToast(mensaje, tipo = 'info', duracion = 3000, detalle = null, accion = null) {
        const texto = detalle ? `${mensaje}, ${detalle}` : mensaje;
        const textoLimpio = SecurityAndUtils.sanitizeString(texto, 200);
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
            return;
        }

        _toastRunning = true;
        const actual = _toastQueue.shift();
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.classList.remove('show');
        _mensajeActual = actual.mensaje;
        const texto = document.createElement('span');
        texto.className = 'toast-texto';
        texto.textContent = actual.mensaje;
        toast.replaceChildren(texto);
        if (actual.accion) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toast-accion';
            btn.textContent = actual.accion.label;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                _cerrarToastActual();
                actual.accion.fn();
            }, { once: true });
            toast.appendChild(btn);
        }
        toast.className = `toast ${actual.tipo}${actual.accion ? ' toast-con-accion' : ''}`;
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
                setTimeout(() => _procesarToastQueue(), 350);
            }, duracionFinal);
        }, 10);
    }

    function _cerrarToastActual() {
        if (_toastTimeout) { clearTimeout(_toastTimeout); _toastTimeout = null; }
        const toast = document.getElementById('toast');
        if (!toast || !toast.classList.contains('show')) return;
        toast.classList.remove('show');
        setTimeout(() => _procesarToastQueue(), 350);
    }

    function _habilitarCierreToast() {
        const toast = document.getElementById('toast');
        if (!toast || toast.dataset.cierreInit) return;
        toast.dataset.cierreInit = '1';
        toast.addEventListener('click', () => _cerrarToastActual());
        registrarSwipe(toast, () => _cerrarToastActual(), { minX: 40 });
    }

    return {
        mostrarToast,
        cerrarActual: _cerrarToastActual
    };
})();
