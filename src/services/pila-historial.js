import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';
import { ImportarExportar } from './importar-exportar.js';

// ====================================================================
// PILA DE HISTORIAL — deshacer/rehacer con persistencia por perfil (sin DOM)
// Cada entrada es { estado: { servicios, categorias }, descripcion }.
// ====================================================================
export const MAX_HISTORIAL = 20;
export const TTL_HISTORIAL_MS = 24 * 60 * 60 * 1000;

export function clonar(obj) {
    try { return structuredClone(obj); }
    catch { return JSON.parse(JSON.stringify(obj), SecurityAndUtils.reviverJSONSeguro); }
}

/**
 * Entrada guardada → entrada validada como cualquier dato de afuera (ImportarExportar.normalizarDatos), o null si no es válida.
 * @param {any} e
 */
function entradaSaneada(e) {
    if (!e || typeof e !== 'object' || !e.estado || typeof e.estado !== 'object' || !Array.isArray(e.estado.categorias)) return null;
    try {
        const estado = ImportarExportar.normalizarDatos(e.estado.servicios, e.estado.categorias);
        return { estado, descripcion: typeof e.descripcion === 'string' ? SecurityAndUtils.limpiarTexto(e.descripcion) : null };
    } catch {
        return null;
    }
}

export class PilaHistorial {
    /** @param {{ clave: () => string, ahora?: () => number }} opciones `clave`: clave de storage del perfil activo. */
    constructor({ clave, ahora = () => Date.now() }) {
        this._clave = clave;
        this._ahora = ahora;
        this._stack = [];
        this._index = -1;
    }

    puedeDeshacer() { return this._index > 0; }
    puedeRehacer() { return this._index < this._stack.length - 1; }
    indiceActual() { return this._index; }
    get tamano() { return this._stack.length; }

    // El historial es prescindible: si no entra en el almacenamiento se guardan menos estados
    // viejos (nunca se descarta el actual) y, si aun así no entra, se descarta en silencio.
    persistir() {
        let desde = 0;
        while (this._stack.length > 0) {
            const ok = StorageHelper.setItem(this._clave(), {
                history: this._stack.slice(desde),
                currentIndex: this._index - desde,
                timestamp: this._ahora()
            }, false, { silencioso: true });
            if (ok) return;
            if (desde >= this._index) break;
            desde = Math.min(this._index, desde + Math.max(1, Math.floor((this._stack.length - desde) / 2)));
        }
        StorageHelper.removeItem(this._clave());
    }

    _cargar() {
        const data = StorageHelper.getObject(this._clave(), null);
        if (!data) return false;
        const vencido = this._ahora() - (data.timestamp || 0) > TTL_HISTORIAL_MS;
        // El historial es prescindible: con una sola entrada inválida (o más de las que la app guarda) se descarta entero
        const guardado = !vencido && Array.isArray(data.history) && data.history.length <= MAX_HISTORIAL ? data.history : [];
        const stack = guardado.map(entradaSaneada);
        const index = Number.isInteger(data.currentIndex) ? data.currentIndex : -1;
        if (stack.length === 0 || index < 0 || index >= stack.length || stack.includes(null)) {
            StorageHelper.removeItem(this._clave());
            return false;
        }
        this._stack = stack.slice(-MAX_HISTORIAL);
        this._index = Math.min(index - (stack.length - this._stack.length), this._stack.length - 1);
        if (this._index < 0) { this._stack = []; this._index = -1; return false; }
        return true;
    }

    /**
     * Restaura el historial guardado del perfil activo. Los datos guardados son la fuente de verdad:
     * si difieren del tope de la pila (cambios que no pasaron por guardar) se agregan como estado nuevo.
     */
    iniciar(estadoActual) {
        this._stack = [];
        this._index = -1;
        if (this._cargar()) {
            if (JSON.stringify(this._stack[this._index].estado) !== JSON.stringify(estadoActual)) this._push(estadoActual, null);
        } else {
            this._push(estadoActual, null);
        }
        this.persistir();
    }

    _push(estado, descripcion) {
        if (this._index < this._stack.length - 1) this._stack.splice(this._index + 1);
        this._stack.push({ estado, descripcion });
        if (this._stack.length > MAX_HISTORIAL) this._stack.shift();
        this._index = this._stack.length - 1;
    }

    /** Agrega un estado (descarta lo que se podía rehacer) y persiste. */
    guardar(estado, descripcion = null) {
        this._push(estado, descripcion);
        this.persistir();
    }

    /** Retrocede un paso: devuelve { estado, descripcion } (descripción de la acción deshecha) o null. */
    deshacer() {
        if (!this.puedeDeshacer()) return null;
        const descripcion = this._stack[this._index].descripcion;
        this._index--;
        return { estado: clonar(this._stack[this._index].estado), descripcion };
    }

    /** Avanza un paso: devuelve { estado, descripcion } o null. */
    rehacer() {
        if (!this.puedeRehacer()) return null;
        this._index++;
        const { estado, descripcion } = this._stack[this._index];
        return { estado: clonar(estado), descripcion };
    }

    static eliminarDePerfil(perfilId) {
        StorageHelper.removeItem(STORAGE_KEYS.HISTORIAL(perfilId));
    }
}
