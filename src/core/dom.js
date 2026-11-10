// ====================================================================
// DOM & COLLAPSIBLES — helpers compartidos
// ====================================================================
/**
 * getElementById tipado como input: casi todos los usos leen .value/.disabled/.checked.
 * Puede devolver null si el id no existe (por eso el código usa `?.` o `if (el)`).
 * Un select personalizado (ui/custom-select.js) deja su instancia en `_customSelect`.
 * @typedef {HTMLInputElement & { _customSelect?: any, _csdInstance?: any }} ElementoApp
 * @param {string} id
 * @returns {ElementoApp}
 */
export const $ = id => /** @type {ElementoApp} */ (document.getElementById(id));

/** Un <form> por id (para `reset()`, `elements`…). @param {string} id */
export const formulario = id => /** @type {HTMLFormElement} */ (document.getElementById(id));

/** Un <select> por id (para `options`, `selectedIndex`…). @param {string} id */
export const selectPorId = id => /** @type {HTMLSelectElement} */ (document.getElementById(id));

/**
 * Todos los elementos de `selector` (dentro de `raiz`) como lista tipada, igual que `$` los tipa como campos.
 * @param {string} selector
 * @param {ParentNode} [raiz]
 * @returns {ElementoApp[]}
 */
export const $$ = (selector, raiz = document) => /** @type {ElementoApp[]} */ ([...raiz.querySelectorAll(selector)]);

/** El valor del campo que originó el evento (`input`, `change`…). @param {Event} evento */
export const valorDe = (evento) => /** @type {HTMLInputElement} */ (evento.target).value;

/**
 * El elemento de `selector` que contiene el objetivo del evento (delegación de eventos); null si el objetivo no es un elemento o no está dentro de uno.
 * @param {Event} evento
 * @param {string} selector
 * @returns {ElementoApp | null}
 */
export const delegado = (evento, selector) => (evento.target instanceof Element ? /** @type {ElementoApp | null} */ (evento.target.closest(selector)) : null);

// ====================================================================
// COLAPSABLES — helper compartido
// ====================================================================
export function setColapsable(el, abierto, { animar = true } = {}) {
    if (!el) return;
    const aplicar = () => {
        if (el.classList.contains('collapsible-content')) {
            el.classList.toggle('collapsed', !abierto);
        } else {
            el.classList.toggle('expanded', abierto);
        }
    };
    if (animar) {
        aplicar();
        return;
    }
    el.classList.add('sin-transicion');
    aplicar();
    void el.offsetHeight;
    el.classList.remove('sin-transicion');
}

/** ¿Esa altura ocupa más de una línea de texto del elemento? (necesita el elemento en el documento) */
export function superaUnaLinea(el, altura) {
    const estilo = getComputedStyle(el);
    const alto = parseFloat(estilo.lineHeight) || parseFloat(estilo.fontSize) * 1.2;
    return altura > alto * 1.5;
}

/**
 * Enlaza varios botones de una vez: `alClic({ 'btn-x': () => hacerAlgo() })`. Un id que no está en la página se ignora.
 * @param {Record<string, (e: MouseEvent) => any>} manejadores
 */
export function alClic(manejadores) {
    Object.entries(manejadores).forEach(([id, fn]) => $(id)?.addEventListener('click', fn));
}
