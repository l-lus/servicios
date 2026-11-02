// ====================================================================
// TEMAS — catálogo de temas de color (sin DOM)
// ====================================================================
// `fondo`, `tarjeta` y `texto` son solo para dibujar la muestra del selector; los colores reales están en assets/styles/tokens.css.
// 'light' no lleva atributo y 'dark' usa la clase dark-mode; los demás se aplican con <html data-theme="id">.
// src/core/tema-inicial.js (script clásico, no puede importar) tiene una copia de los ids: tests/architecture.test.mjs verifica que coincidan.
export const TEMAS = Object.freeze([
    { id: 'light', etiqueta: 'Claro', fondo: '#ffffff', tarjeta: '#f0f4f9', texto: '#1f1f1f' },
    { id: 'dark', etiqueta: 'Oscuro', fondo: '#131314', tarjeta: '#1e1f20', texto: '#e3e3e3' },
    { id: 'medianoche', etiqueta: 'Medianoche', fondo: '#0b1120', tarjeta: '#131c2e', texto: '#e2e8f0' },
    { id: 'pink', etiqueta: 'Rosa', fondo: '#fdf1f6', tarjeta: '#ffffff', texto: '#4a2c39' },
    { id: 'green', etiqueta: 'Verde', fondo: '#f0f8f2', tarjeta: '#ffffff', texto: '#24402c' },
    { id: 'blue', etiqueta: 'Azul', fondo: '#eef4fc', tarjeta: '#ffffff', texto: '#223449' },
    { id: 'lilac', etiqueta: 'Lila', fondo: '#f6f3fc', tarjeta: '#ffffff', texto: '#3a2e4f' },
    { id: 'crema', etiqueta: 'Crema', fondo: '#fbf6ee', tarjeta: '#ffffff', texto: '#423223' },
]);

export const TEMA_POR_DEFECTO = 'dark';

/** Id válido (o el tema por defecto si el valor guardado no existe o está corrupto). */
export function normalizarTema(valor) {
    return TEMAS.some(t => t.id === valor) ? valor : TEMA_POR_DEFECTO;
}

export function etiquetaTema(id) {
    return (TEMAS.find(t => t.id === id) || TEMAS[1]).etiqueta;
}
