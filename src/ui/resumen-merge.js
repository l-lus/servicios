import { $ } from '../core/dom.js';
import { html, montar } from '../core/html.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { ModalManager } from './gestor-modales.js';

// ============================================================
// RESUMEN PREVIO AL MERGE — muestra qué haría Combinar y qué haría Reemplazar antes de aplicar
// ============================================================
// Lo usan la restauración desde archivo y la descarga del Gist: un solo camino para decidir.
const ID_MODAL = 'modal-resumen-merge';
let _resolver = null;
let _modo = 'combinar';

const clon = obj => JSON.parse(JSON.stringify(obj));

function _seleccionar(modo) {
    _modo = modo;
    document.querySelectorAll('#modal-resumen-merge .merge-opcion').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
    });
    const alerta = $('merge-alerta');
    if (alerta) alerta.hidden = modo !== 'reemplazar' || !alerta.textContent;
    const boton = $('btn-resumen-merge-aplicar');
    if (boton) boton.textContent = modo === 'reemplazar' ? 'Reemplazar' : 'Combinar';
}

function _cerrar(resultado) {
    const resolver = _resolver;
    _resolver = null;
    ModalManager.cerrarConRetorno(ID_MODAL);
    if (resolver) resolver(resultado);
}

/** Texto de lo que se pierde al reemplazar ('' si no se pierde nada). */
export function describirPerdidas({ servicios, facturas, ingresos }) {
    const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
    const partes = [];
    if (servicios > 0) partes.push(plural(servicios, 'servicio', 'servicios'));
    if (facturas > 0) partes.push(plural(facturas, 'factura', 'facturas'));
    if (ingresos > 0) partes.push(plural(ingresos, 'ingreso', 'ingresos'));
    return partes.length ? `Se perderán ${partes.join(', ')} que solo están en este dispositivo.` : '';
}

/**
 * Abre el modal y devuelve 'combinar', 'reemplazar' o null (canceló).
 * @param {{ origen: string, locales: any[], categoriasLocales: string[], remotos: any[], categoriasRemotas: string[], modoInicial?: string, rango?: {desde: string, hasta: string} | null }} p
 */
export function preguntarMerge({ origen, locales, categoriasLocales, remotos, categoriasRemotas, modoInicial = 'combinar', rango = null }) {
    const { combinar, reemplazar } = ImportarExportar.compararRespaldo(locales, remotos, categoriasLocales, categoriasRemotas);

    // Cómo quedarían los datos con cada opción
    const fusion = clon(locales);
    ImportarExportar.fusionarServicios(fusion, clon(remotos));
    const { lista: catsFusion } = ImportarExportar.fusionarCategorias(categoriasLocales, categoriasRemotas);
    const quedaCombinar = ImportarExportar.describirContenido(fusion, catsFusion);
    const quedaReemplazar = ImportarExportar.describirContenido(remotos, categoriasRemotas);

    $('merge-origen').textContent = `Origen: ${origen}`;
    const parcial = $('merge-aviso-parcial');
    parcial.hidden = !rango;
    if (rango) {
        const f = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '…');
        parcial.textContent = `Respaldo parcial: solo incluye facturas del ${f(rango.desde)} al ${f(rango.hasta)}. Conviene combinar.`;
    }
    montar($('merge-texto-combinar'), html`${combinar}`);
    montar($('merge-texto-reemplazar'), html`${reemplazar}`);
    montar($('merge-queda-combinar'), html`Quedarían: ${quedaCombinar}`);
    montar($('merge-queda-reemplazar'), html`Quedarían: ${quedaReemplazar}`);
    $('merge-alerta').textContent = describirPerdidas(ImportarExportar.perdidasAlReemplazar(locales, remotos));
    _seleccionar(modoInicial === 'reemplazar' ? 'reemplazar' : 'combinar');

    return new Promise(resolve => {
        if (_resolver) _resolver(null);
        _resolver = resolve;
        ModalManager.abrirConPadre(ID_MODAL, 'modal-config');
    });
}

export const ResumenMerge = {
    preguntar: preguntarMerge,
    bindEventos() {
        document.querySelectorAll('#modal-resumen-merge .merge-opcion').forEach(b => {
            b.addEventListener('click', () => _seleccionar(b.dataset.modo));
        });
        $('btn-resumen-merge-aplicar')?.addEventListener('click', () => _cerrar(_modo));
        $('btn-resumen-merge-cancelar')?.addEventListener('click', () => _cerrar(null));
    },
};
