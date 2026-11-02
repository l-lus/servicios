// ============================================================
// DEBOUNCE — agrupa llamadas seguidas en una sola
// ============================================================
// Devuelve una función que ejecuta fn recién cuando pasan ms sin nuevas
// llamadas. .cancel() descarta la pendiente y .flush() la ejecuta ya.
export function debounce(fn, ms) {
    let timer = null, ultimosArgs = null;
    function ejecutar() {
        timer = null;
        const args = ultimosArgs;
        ultimosArgs = null;
        fn(...args);
    }
    function debounced(...args) {
        ultimosArgs = args;
        clearTimeout(timer);
        timer = setTimeout(ejecutar, ms);
    }
    debounced.cancel = () => { clearTimeout(timer); timer = null; ultimosArgs = null; };
    debounced.flush = () => { if (timer !== null) { clearTimeout(timer); ejecutar(); } };
    return debounced;
}
