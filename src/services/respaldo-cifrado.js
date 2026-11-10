import { cifrar, descifrar, esSobre, ErrorCifrado } from '../core/cifrado.js';
import { SecurityAndUtils } from '../core/seguridad.js';

// ====================================================================
// RESPALDO CIFRADO — cierra y abre el respaldo (archivo local o Gist) con la frase (sin DOM)
// ====================================================================
// `sellar` convierte el respaldo en el texto que se guarda o sube: un sobre cifrado (core/cifrado.js). `abrir` hace lo inverso y también lee los
// respaldos viejos, en claro. Siguiendo el contrato de errores de los servicios, ninguna de las dos lanza: un problema esperado vuelve como
// `{ error, codigo }` con `codigo` 'sin-frase' (el contenido está cifrado y falta la frase), 'frase' (frase inválida), 'descifrado' (frase incorrecta
// o contenido alterado), 'sin-cifrar' (se exigía un contenido cifrado y llegó en claro) o 'formato' (no es un respaldo).

/** @typedef {{ error: string, codigo: 'sin-frase' | 'frase' | 'descifrado' | 'sin-cifrar' | 'formato' }} ErrorRespaldo */

/** @param {unknown} err @returns {ErrorRespaldo} */
function _comoError(err) {
    if (err instanceof ErrorCifrado) return { error: err.message, codigo: err.codigo };
    return { error: 'No se pudo procesar el respaldo', codigo: 'formato' };
}

/** JSON → objeto (con el reviver que descarta claves de prototipo); null si no es un objeto. @param {string} texto */
function _parsear(texto) {
    try {
        const dato = JSON.parse(texto, SecurityAndUtils.reviverJSONSeguro);
        return dato && typeof dato === 'object' && !Array.isArray(dato) ? dato : null;
    } catch {
        return null;
    }
}

/**
 * Respaldo → texto cifrado listo para guardar o subir. `sal` (la del sobre anterior del mismo destino) se reutiliza para no derivar la clave de nuevo.
 * @param {object} respaldo
 * @param {string} frase
 * @param {{ sal?: string | null }} [opciones]
 * @returns {Promise<{ texto: string, sal: string } | ErrorRespaldo>}
 */
async function sellar(respaldo, frase, { sal = null } = {}) {
    try {
        const sobre = await cifrar(JSON.stringify(respaldo), frase, { sal });
        return { texto: JSON.stringify(sobre), sal: sobre.sal };
    } catch (err) {
        return _comoError(err);
    }
}

/**
 * Texto de un archivo o de un Gist → respaldo. Un respaldo viejo en claro se devuelve con `cifrado: false` (para avisar que conviene cifrarlo).
 * Con `exigirCifrado` (un destino que ya se sabe cifrado, como un Gist al que ya se subió) el contenido en claro se rechaza: aceptarlo dejaría que
 * quien pueda escribir ahí reemplace el sobre por un JSON plano y esquive la autenticación del cifrado.
 * @param {string} texto
 * @param {string} frase puede ir vacía si el contenido está en claro
 * @param {{ exigirCifrado?: boolean }} [opciones]
 * @returns {Promise<{ datos: any, cifrado: boolean, sal: string | null } | ErrorRespaldo>}
 */
async function abrir(texto, frase, { exigirCifrado = false } = {}) {
    if (typeof texto !== 'string' || texto.length > SecurityAndUtils.SECURITY_LIMITS.MAX_JSON_SIZE) {
        return { error: 'El contenido es demasiado grande o no es texto', codigo: 'formato' };
    }
    const dato = _parsear(texto);
    if (!dato) return { error: 'Formato de archivo inválido', codigo: 'formato' };
    if (!esSobre(dato)) {
        if (exigirCifrado) return { error: 'El contenido tendría que estar cifrado y está en claro: alguien lo cambió. No se usa', codigo: 'sin-cifrar' };
        return { datos: dato, cifrado: false, sal: null };
    }
    if (!frase) return { error: 'El contenido está cifrado: ingresá la frase de cifrado', codigo: 'sin-frase' };
    try {
        const plano = await descifrar(dato, frase);
        const datos = _parsear(plano);
        if (!datos || esSobre(datos)) return { error: 'El contenido cifrado no tiene el formato de un respaldo', codigo: 'formato' };
        return { datos, cifrado: true, sal: /** @type {any} */ (dato).sal };
    } catch (err) {
        return _comoError(err);
    }
}

export const RespaldoCifrado = { sellar, abrir };
