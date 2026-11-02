import { StorageHelper } from './almacenamiento.js';
import { STORAGE_KEYS } from './constantes.js';

// ============================================================
// MOTION (preferencia de animaciones: auto | on | off)
// ============================================================
// 'on' = reducir animaciones, 'off' = animaciones completas, 'auto' = sigue al
// sistema (prefers-reduced-motion). El CSS solo mira <html data-motion>, que
// flash.js aplica antes del primer paint con la misma regla.
export const Motion = (function () {
    'use strict';

    const MODOS = ['auto', 'on', 'off'];
    const ETIQUETAS = { auto: 'Auto', on: 'SI', off: 'NO' };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let modo = null;
    let iniciado = false;

    function _modo() {
        if (modo === null) {
            const guardado = StorageHelper.getItem(STORAGE_KEYS.REDUCIR_ANIMACIONES, 'auto');
            modo = MODOS.includes(guardado) ? guardado : 'auto';
        }
        return modo;
    }
    function reducido() {
        const m = _modo();
        return m === 'on' || (m === 'auto' && mq.matches);
    }
    function _aplicar() {
        document.documentElement.setAttribute('data-motion', reducido() ? 'reduce' : 'full');
    }
    function init() {
        if (iniciado) return;
        iniciado = true;
        mq.addEventListener?.('change', _aplicar);
        _aplicar();
    }
    function setModo(nuevo) {
        if (!MODOS.includes(nuevo)) return;
        modo = nuevo;
        StorageHelper.setItem(STORAGE_KEYS.REDUCIR_ANIMACIONES, nuevo);
        _aplicar();
    }
    function siguienteModo() {
        setModo(MODOS[(MODOS.indexOf(_modo()) + 1) % MODOS.length]);
    }
    return {
        init, reducido, setModo, siguienteModo, modo: _modo,
        etiqueta: () => ETIQUETAS[_modo()],
        scrollBehavior: () => (reducido() ? 'auto' : 'smooth')
    };
})();
