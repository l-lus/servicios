import { STORAGE_KEYS } from './constantes.js';
import { StorageHelper } from './almacenamiento.js';

// ====================================================================
// ESTILO DE LA TARJETA DE RESUMEN
// ====================================================================
// Infraestructura de estilos de la tarjeta principal (#card-resumen).
// Por ahora solo incluye el estilo base ('clasica'); nuevos diseños se agregan a ESTILOS_TARJETA.
export const ESTILOS_TARJETA = Object.freeze([
    { id: 'clasica', label: 'Clásica' },
]);

const ID_POR_DEFECTO = 'clasica';
const _esValido = id => ESTILOS_TARJETA.some(e => e.id === id);

/** Estilo que sigue al `id` en el ciclo (vuelve al primero al terminar; un id desconocido cuenta como el primero). */
export function siguienteEstilo(id) {
    const idx = ESTILOS_TARJETA.findIndex(e => e.id === id);
    return ESTILOS_TARJETA[(Math.max(idx, 0) + 1) % ESTILOS_TARJETA.length].id;
}

export function etiquetaEstilo(id) {
    return (ESTILOS_TARJETA.find(e => e.id === id) ?? ESTILOS_TARJETA[0]).label;
}

let _estilo = null;

function actual() {
    if (_estilo === null) {
        const guardado = StorageHelper.getItem(STORAGE_KEYS.ESTILO_TARJETA, ID_POR_DEFECTO);
        _estilo = _esValido(guardado) ? guardado : ID_POR_DEFECTO;
    }
    return _estilo;
}

function _aplicar() {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-estilo-tarjeta', actual());
}

function init() {
    _aplicar();
}

function setEstilo(id) {
    if (!_esValido(id)) return;
    _estilo = id;
    StorageHelper.setItem(STORAGE_KEYS.ESTILO_TARJETA, id);
    _aplicar();
}

function siguiente() {
    setEstilo(siguienteEstilo(actual()));
}

/** Vuelve a leer el estilo guardado (después de restaurar un respaldo). */
function releer() {
    _estilo = null;
    _aplicar();
}

export const EstiloTarjeta = {
    init,
    actual,
    setEstilo,
    siguiente,
    releer,
    etiqueta: () => etiquetaEstilo(actual()),
};
