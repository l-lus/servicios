// ============================================================
// GESTOS TÁCTILES (Swipe con bloqueo direccional)
// ============================================================
export function registrarSwipe(el, callback, { minX = 50, maxY = 80, ignoreInputs = false } = {}) {
    if (!el || el.dataset.swipeInit) return;
    el.dataset.swipeInit = '1';
    let _x = null, _y = null;
    let _direccionBloqueada = null;

    el.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) return;
        if (ignoreInputs && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return;
        _x = e.touches[0].clientX;
        _y = e.touches[0].clientY;
        _direccionBloqueada = null;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
        if (_x === null || _y === null) return;

        const dx = Math.abs(e.touches[0].clientX - _x);
        const dy = Math.abs(e.touches[0].clientY - _y);

        if (!_direccionBloqueada && (dx > 5 || dy > 5)) {
            _direccionBloqueada = dx > dy ? 'x' : 'y';
        }

        if (_direccionBloqueada === 'x' && e.cancelable) {
            e.preventDefault();
        }
    }, { passive: false });

    el.addEventListener('touchend', e => {
        if (_x === null || _direccionBloqueada === 'y') {
            _x = null; _y = null;
            return;
        }

        const dx = e.changedTouches[0].clientX - _x;
        const dy = e.changedTouches[0].clientY - _y;
        _x = null; _y = null;

        if (Math.abs(dy) > maxY) return;
        if (Math.abs(dx) < minX) return;

        callback(dx < 0 ? 1 : -1);
    }, { passive: true });
}
