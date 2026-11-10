import { $ } from '../core/dom.js';
import { ModalManager } from './gestor-modales.js';
import { CampoFrase } from './campo-frase.js';

// ============================================================
// PEDIR LA FRASE — al importar un archivo cifrado que no abre con la frase guardada
// ============================================================
// La frase escrita acá vale solo para ese archivo: no se guarda ni reemplaza la de Gist y Respaldar.
const ID_MODAL = 'modal-frase';
let _resolver = null;

const _campo = new CampoFrase({ input: 'frase-importar', ojo: 'frase-importar-eye' }, () => { });

function _cerrar(resultado) {
    const resolver = _resolver;
    _resolver = null;
    ModalManager.cerrarConRetorno(ID_MODAL);
    $('frase-importar').value = '';
    if (resolver) resolver(resultado);
}

/**
 * Abre el modal y devuelve la frase escrita, o null si se cancela.
 * @param {string} motivo qué se le explica a la persona (por ejemplo «La frase guardada no abre este archivo»)
 * @returns {Promise<string | null>}
 */
function pedir(motivo) {
    return new Promise((resolve) => {
        _resolver = resolve;
        $('modal-frase-motivo').textContent = motivo;
        $('frase-importar').value = '';
        $('frase-importar').type = 'password';
        ModalManager.abrirConPadre(ID_MODAL, 'modal-config');
        setTimeout(() => $('frase-importar')?.focus(), 150);
    });
}

function bindEventos() {
    _campo.vincular();
    $('btn-frase-aceptar')?.addEventListener('click', () => { if ($('frase-importar').value.trim()) _cerrar($('frase-importar').value); });
    $('btn-frase-cancelar')?.addEventListener('click', () => _cerrar(null));
    $('frase-importar')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-frase-aceptar')?.click(); });
}

export const FraseModal = { pedir, bindEventos };
