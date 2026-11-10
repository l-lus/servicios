import { $ } from '../core/dom.js';
import { FraseCifrado } from './frase-cifrado.js';

// ====================================================================
// CAMPO DE FRASE — el bloque «frase de cifrado» que comparten el modal de Gist, el de Respaldar y el de pedir la frase al importar
// ====================================================================
// Cada modal tiene su propio marcado (con sus ids); esta clase le da el comportamiento: mostrar u ocultar la frase, generar una al azar, el interruptor
// «Recordar en este navegador» y guardarla (en la sesión o, con «Recordar», en el navegador) validando el largo mínimo.

/** @typedef {{ input: string, ojo?: string, generar?: string, recordar?: string }} IdsCampoFrase */
/** @typedef {(mensaje: string, tipo?: string, duracion?: number) => void} Avisar */

export class CampoFrase {
    /** @param {IdsCampoFrase} ids @param {Avisar} avisar cómo mostrar un aviso al usuario (toast) */
    constructor(ids, avisar) {
        this.ids = ids;
        this.avisar = avisar;
    }

    /** Conecta los botones del bloque (una sola vez, al iniciar la app). */
    vincular() {
        const { ojo, generar, recordar } = this.ids;
        if (ojo) $(ojo)?.addEventListener('click', () => this.alternarVisible());
        if (generar) $(generar)?.addEventListener('click', () => this.generar());
        if (recordar) $(recordar)?.addEventListener('click', () => $(recordar)?.classList.toggle('on'));
    }

    /** Lo que muestra el campo al abrir el modal: la frase guardada (oculta) y el interruptor según esté recordada. */
    cargar() {
        const campo = $(this.ids.input);
        if (campo) { campo.value = FraseCifrado.actual(); campo.type = 'password'; }
        if (this.ids.recordar) $(this.ids.recordar)?.classList.toggle('on', FraseCifrado.recordada());
    }

    alternarVisible() {
        const campo = $(this.ids.input);
        if (campo) campo.type = campo.type === 'password' ? 'text' : 'password';
    }

    /** Pone una frase nueva al azar, a la vista para poder anotarla. */
    generar() {
        const campo = $(this.ids.input);
        if (!campo) return;
        campo.value = FraseCifrado.generar();
        campo.type = 'text';
        this.avisar('Frase generada: anotala en un lugar seguro. Sin ella no se puede recuperar lo cifrado', 'info', 7000);
    }

    /** Lo que hay escrito en el campo. */
    valor() {
        return $(this.ids.input)?.value ?? '';
    }

    /**
     * Valida la frase escrita y la guarda (en la sesión o, con «Recordar», en este navegador). Un campo vacío olvida la frase.
     * Devuelve false solo si lo escrito no es una frase válida. Con `avisar` false no muestra nada (para guardar sin molestar).
     * @param {{ avisar?: boolean }} [opciones]
     */
    confirmar({ avisar = true } = {}) {
        const frase = this.valor();
        const recordar = !!(this.ids.recordar && $(this.ids.recordar)?.classList.contains('on'));
        if (!frase.trim()) { FraseCifrado.olvidar(); return true; }
        const evaluada = FraseCifrado.evaluar(frase);
        if (!evaluada.ok) {
            if (avisar) this.avisar(evaluada.motivo, 'error');
            return false;
        }
        if (!FraseCifrado.guardar(frase, recordar) && avisar) this.avisar('No se pudo guardar la frase en este navegador', 'warning');
        if (evaluada.debil && avisar) this.avisar(evaluada.motivo, 'warning', 5000);
        return true;
    }
}
