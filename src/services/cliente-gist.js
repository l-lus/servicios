import { SecurityAndUtils } from '../core/seguridad.js';
import { RespaldoCifrado } from './respaldo-cifrado.js';
import { ImportarExportar } from './importar-exportar.js';

// ====================================================================
// CLIENTE GIST — habla con la API de GitHub Gist y decide qué se acepta de lo remoto (sin DOM)
// ====================================================================
// `fetch` se inyecta (en el navegador, el global) para probar sin red. Siguiendo el contrato de errores de los servicios, nada lanza:
// un problema esperado vuelve como `{ error, codigo }`. `codigo` es el de `RespaldoCifrado` ('sin-frase', 'frase', 'descifrado', 'sin-cifrar',
// 'formato') más 'red' (HTTP, sin conexión, archivo ausente o demasiado grande, URL inesperada).

const API = 'https://api.github.com/gists';

/** Errores al abrir el Gist que impiden darlo por bueno: no se usa ni se pisa sin que la persona lo confirme. */
export const CODIGOS_GIST_NO_CONFIABLE = ['descifrado', 'sin-frase', 'frase', 'sin-cifrar'];

/** @typedef {{ error: string, codigo: 'sin-frase' | 'frase' | 'descifrado' | 'sin-cifrar' | 'formato' | 'red' }} ErrorGist */
/** @typedef {{ servicios: any[], categorias: string[], borrados: import('./sincronizacion.js').Borrado[], crudo: any, cifrado: boolean, sal?: string | null }} LecturaGist */

/** @param {string} error @returns {ErrorGist} */
const _red = (error) => ({ error, codigo: 'red' });

/** Nombre del archivo del respaldo de un perfil dentro del Gist. @param {string} perfil */
export function nombreArchivoGist(perfil) {
    return `deltaF_${perfil}.json`;
}

/** true si el resultado es un error que impide dar por bueno el contenido del Gist. @param {object | null | undefined} err */
export function esGistNoConfiable(err) {
    return !!err && CODIGOS_GIST_NO_CONFIABLE.includes(/** @type {any} */ (err).codigo);
}

export class ClienteGist {
    /** @param {typeof fetch} fetchFn */
    constructor(fetchFn) {
        this._fetch = fetchFn;
    }

    /**
     * Baja el texto del archivo del Gist. Solo sigue `raw_url` si es del dominio de contenido de Gist y respeta el tope de tamaño.
     * @param {string} gistId @param {string} token @param {string} archivo
     * @returns {Promise<{ contenido: string } | ErrorGist>}
     */
    async descargar(gistId, token, archivo) {
        try {
            /** @type {Record<string, string>} */
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await this._fetch(`${API}/${gistId}`, { headers });
            if (!res.ok) return _red(`HTTP ${res.status}`);
            const json = await res.json();

            const fileObj = json?.files?.[archivo];
            if (!fileObj) return _red('Archivo no encontrado');

            const maxBytes = SecurityAndUtils.SECURITY_LIMITS.MAX_JSON_SIZE;
            if (fileObj.size > maxBytes) return _red('Archivo del Gist demasiado grande');

            let contenido = fileObj.content;
            if (fileObj.truncated) {
                const raw = new URL(fileObj.raw_url);
                if (raw.protocol !== 'https:' || raw.hostname !== 'gist.githubusercontent.com') return _red('URL de contenido inesperada');
                const r2 = await this._fetch(raw.href);
                if (!r2.ok) return _red(`HTTP ${r2.status}`);
                contenido = await r2.text();
            }
            if (typeof contenido !== 'string' || contenido.length > maxBytes) return _red('Archivo del Gist demasiado grande');
            return { contenido };
        } catch (err) {
            return _red(err instanceof Error ? err.message : 'No se pudo leer el Gist');
        }
    }

    /**
     * Baja el Gist, lo abre con la frase y valida sus datos. Un Gist que ya se vio cifrado (`exigirCifrado`) no se acepta en claro.
     * @param {string} gistId @param {string} token
     * @param {{ archivo: string, frase: string, exigirCifrado?: boolean }} opciones
     * @returns {Promise<LecturaGist | ErrorGist>}
     */
    async leer(gistId, token, { archivo, frase, exigirCifrado = false }) {
        const bajado = await this.descargar(gistId, token, archivo);
        if ('error' in bajado) return bajado;

        const abierto = await RespaldoCifrado.abrir(bajado.contenido, frase, { exigirCifrado });
        if ('error' in abierto) return abierto;
        try {
            const datos = ImportarExportar.normalizarDatos(abierto.datos.servicios, abierto.datos.categorias, abierto.datos.borrados);
            return { ...datos, crudo: abierto.datos, cifrado: abierto.cifrado, sal: abierto.sal };
        } catch (err) {
            return { error: err instanceof Error ? err.message : 'Respaldo inválido', codigo: 'formato' };
        }
    }

    /**
     * Crea el Gist (sin `gistId`) o reemplaza el archivo del existente. Siempre privado y con descripción neutra:
     * la descripción de un Gist es visible para quien tenga el enlace.
     * @param {{ gistId?: string | null, token: string, archivo: string, texto: string }} datos
     * @returns {Promise<{ id: string } | ErrorGist>}
     */
    async escribir({ gistId, token, archivo, texto }) {
        try {
            const res = await this._fetch(gistId ? `${API}/${gistId}` : API, {
                method: gistId ? 'PATCH' : 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: 'Servicios — respaldo cifrado',
                    public: false,
                    files: { [archivo]: { content: texto } }
                })
            });
            if (!res.ok) return _red(`HTTP ${res.status}`);
            const data = await res.json();
            if (typeof data?.id !== 'string') return _red('Respuesta inesperada de GitHub');
            return { id: data.id };
        } catch (err) {
            return _red(err instanceof Error ? err.message : 'No se pudo subir al Gist');
        }
    }
}

/**
 * Guarda de la subida automática: ¿se puede pisar el Gist con lo local?
 * - `'subir'`: la lectura salió bien y lo local no es mucho menos que lo remoto, o no se pudo comparar por otro motivo (sin red…), que no bloquea.
 * - `'no-confiable'`: la frase no abre el Gist o apareció en claro uno cifrado (`codigo`): pisarlo lo dejaría ilegible para los otros dispositivos.
 * - `'menos-datos'`: lo local es menos del umbral de lo remoto (`medida`).
 * @param {LecturaGist | ErrorGist} lectura @param {any[]} servicios @param {string[]} categorias
 * @returns {{ accion: 'subir' } | { accion: 'no-confiable', codigo: string } | { accion: 'menos-datos', medida: { local: number, remoto: number } }}
 */
export function evaluarSubidaAutomatica(lectura, servicios, categorias) {
    if ('error' in lectura) {
        return esGistNoConfiable(lectura) ? { accion: 'no-confiable', codigo: lectura.codigo } : { accion: 'subir' };
    }
    const medida = ImportarExportar.subidaAutomaticaSegura(servicios, categorias, lectura.servicios, lectura.categorias);
    return medida.segura ? { accion: 'subir' } : { accion: 'menos-datos', medida };
}
