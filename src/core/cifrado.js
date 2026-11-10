// ====================================================================
// CIFRADO — sobre cifrado con una frase (sin DOM, con `crypto` inyectable)
// ====================================================================
// AES-GCM-256 con una clave derivada de la frase por PBKDF2-SHA-256 y una sal propia de cada destino (el Gist, el archivo exportado).
// Es el mismo esquema que usa SGC-2 (idr). Lo que sale es un «sobre» que se puede guardar o subir tal cual:
//   { formato, version, kdf, iter, sal, iv, datos }   (sal, iv y datos en base64)
// - La sal (16 bytes) hace que la misma frase dé claves distintas en cada destino; se reutiliza al volver a subir al mismo Gist.
// - El IV (12 bytes) es nuevo en cada cifrado.
// - AES-GCM autentica: cualquier alteración del sobre (datos, IV, sal, parámetros) hace fallar el descifrado. Por eso en un sobre ya no hace falta un hash aparte.
// - Frase equivocada y sobre alterado dan el mismo error: no se distinguen a propósito.
// Un sobre que viene de afuera se valida antes de usarlo (formato, versión, costo del KDF dentro de un rango, largos de sal e IV).

export const FORMATO_SOBRE = 'servicios-cifrado';
const VERSION_SOBRE = 1;
const KDF = 'PBKDF2-SHA-256';
export const ITERACIONES = 600000;
/** Un sobre ajeno no puede pedir un cálculo eterno ni uno barato. */
const ITERACIONES_MAX = 2000000;
const LARGO_SAL = 16;
const LARGO_IV = 12;
/** Largo máximo del texto base64 de `datos` (4 MB de datos más el 33 % del base64 y un margen). */
const MAX_DATOS_BASE64 = 6 * 1024 * 1024;
export const FRASE_MIN = 20;
const AAD = `${FORMATO_SOBRE}/${VERSION_SOBRE}`;

// Frase generada: 5 palabras de 3 sílabas consonante+vocal (16 × 5 = 80 sílabas por posición, 80^15 ≈ 2^95)
const CONSONANTES = 'bcdfgjklmnprstvz';
const VOCALES = 'aeiou';
const PALABRAS = 5;
const SILABAS_POR_PALABRA = 3;

/** Error esperado del cifrado. `codigo`: 'frase' (frase inválida), 'formato' (sobre mal formado) o 'descifrado' (frase incorrecta o sobre alterado). */
export class ErrorCifrado extends Error {
    /** @param {string} mensaje @param {'frase' | 'formato' | 'descifrado'} [codigo] */
    constructor(mensaje, codigo = 'formato') {
        super(mensaje);
        this.name = 'ErrorCifrado';
        this.codigo = codigo;
    }
}

// ---- base64 (por tramos: un archivo grande no desborda la pila)
/** @param {Uint8Array} bytes */
function aBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 0x8000)));
    return btoa(s);
}

/** @param {unknown} texto @param {number} [largoMax] */
function desdeBase64(texto, largoMax = MAX_DATOS_BASE64) {
    if (typeof texto !== 'string' || texto.length > largoMax || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) {
        throw new ErrorCifrado('el sobre cifrado no tiene el formato esperado', 'formato');
    }
    const s = atob(texto);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
}

// ---- la frase
/** NFC y sin espacios en los extremos (la misma frase escrita en otro teclado u otro sistema da la misma clave). @param {unknown} frase */
export function normalizarFrase(frase) {
    return String(frase === null || frase === undefined ? '' : frase).normalize('NFC').trim();
}

/**
 * `ok` solo exige el largo; `debil` es un aviso (pocos caracteres distintos, solo números, algo que se repite).
 * @param {unknown} frase
 * @returns {{ ok: boolean, frase: string, debil: boolean, motivo: string }}
 */
export function evaluarFrase(frase) {
    const f = normalizarFrase(frase);
    if (f.length < FRASE_MIN) {
        return { ok: false, frase: f, debil: false, motivo: `La frase tiene que tener al menos ${FRASE_MIN} caracteres (tiene ${f.length}).` };
    }
    const distintos = new Set(f.toLowerCase()).size;
    const debil = distintos < 8 || /^[\d\s]+$/.test(f) || /^(.{1,4})\1+$/.test(f);
    return { ok: true, frase: f, debil, motivo: debil ? 'La frase parece fácil de adivinar: conviene generar una.' : '' };
}

/**
 * Una frase al azar de palabras pronunciables. `bytesAleatorios(n)` devuelve n bytes al azar (inyectable para probar);
 * los bytes que sesgarían el resto se descartan.
 * @param {(n: number) => ArrayLike<number>} bytesAleatorios
 */
export function generarFrase(bytesAleatorios) {
    const silabas = CONSONANTES.length * VOCALES.length;
    const tope = Math.floor(256 / silabas) * silabas;
    /** @type {number[]} */
    const pila = [];
    const siguiente = () => {
        for (;;) {
            if (!pila.length) pila.push(...Array.from(bytesAleatorios(64)));
            const b = /** @type {number} */ (pila.pop());
            if (b < tope) return b % silabas;
        }
    };
    const palabras = [];
    for (let p = 0; p < PALABRAS; p++) {
        let w = '';
        for (let s = 0; s < SILABAS_POR_PALABRA; s++) {
            const i = siguiente();
            w += CONSONANTES[Math.floor(i / VOCALES.length)] + VOCALES[i % VOCALES.length];
        }
        palabras.push(w);
    }
    return palabras.join('-');
}

// ---- clave
/** @type {{ frase: string, sal: string, iter: number, clave: CryptoKey } | null} */
let _claveCache = null;   // derivar tarda ~medio segundo: se reutiliza mientras no cambien frase, sal ni costo

/** @param {string} frase @param {string} sal base64 @param {number} iter @param {Crypto} cripto */
async function derivarClave(frase, sal, iter, cripto) {
    const c = _claveCache;
    if (c && c.frase === frase && c.sal === sal && c.iter === iter) return c.clave;
    const material = await cripto.subtle.importKey('raw', new TextEncoder().encode(frase), 'PBKDF2', false, ['deriveKey']);
    const clave = await cripto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: /** @type {BufferSource} */ (desdeBase64(sal, 64)), iterations: iter }, material,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    _claveCache = { frase, sal, iter, clave };
    return clave;
}

/** Descarta la clave derivada de la memoria (al cambiar o quitar la frase). */
export function olvidarClave() {
    _claveCache = null;
}

// ---- sobre
/** ¿Parece un sobre de este formato? No valida los parámetros (para eso está `sobreValido`): sirve para distinguirlo de un JSON plano. @param {unknown} dato */
export function esSobre(dato) {
    return !!dato && typeof dato === 'object' && !Array.isArray(dato) && /** @type {any} */ (dato).formato === FORMATO_SOBRE;
}

/**
 * Valida la forma de un sobre que viene de afuera; lo devuelve o lanza ErrorCifrado.
 * @param {unknown} sobre
 * @returns {{ formato: string, version: number, kdf: string, iter: number, sal: string, iv: string, datos: string }}
 */
export function sobreValido(sobre) {
    const mal = (/** @type {string} */ m) => new ErrorCifrado(m, 'formato');
    if (!sobre || typeof sobre !== 'object' || Array.isArray(sobre)) throw mal('el contenido no es un sobre cifrado de Servicios');
    const s = /** @type {any} */ (sobre);
    if (s.formato !== FORMATO_SOBRE) throw mal('el contenido no está cifrado por Servicios (¿es de otra app?)');
    if (s.version !== VERSION_SOBRE || s.kdf !== KDF) throw mal('el contenido cifrado es de una versión que esta app no conoce');
    if (!Number.isInteger(s.iter) || s.iter < ITERACIONES || s.iter > ITERACIONES_MAX) throw mal('el contenido cifrado tiene parámetros no válidos');
    if (desdeBase64(s.sal, 64).length !== LARGO_SAL || desdeBase64(s.iv, 64).length !== LARGO_IV) throw mal('el contenido cifrado tiene parámetros no válidos');
    if (typeof s.datos !== 'string' || s.datos.length < 24) throw mal('el contenido cifrado no tiene datos');
    return s;
}

/**
 * Texto → sobre. `sal` (base64) se reutiliza si ya hay un sobre del mismo destino; sin ella se genera una nueva.
 * @param {string} texto
 * @param {string} frase
 * @param {{ sal?: string | null, cripto?: Crypto }} [opciones]
 */
export async function cifrar(texto, frase, { sal = null, cripto = globalThis.crypto } = {}) {
    const e = evaluarFrase(frase);
    if (!e.ok) throw new ErrorCifrado(e.motivo, 'frase');
    // una sal que viene de afuera (la de un Gist existente) se valida: solo se acepta una de largo correcto
    if (sal !== null && desdeBase64(sal, 64).length !== LARGO_SAL) throw new ErrorCifrado('la sal no es válida', 'formato');
    const salB64 = sal || aBase64(cripto.getRandomValues(new Uint8Array(LARGO_SAL)));
    const iv = cripto.getRandomValues(new Uint8Array(LARGO_IV));
    const clave = await derivarClave(e.frase, salB64, ITERACIONES, cripto);
    const cifrado = new Uint8Array(await cripto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(AAD) }, clave, new TextEncoder().encode(texto)));
    return { formato: FORMATO_SOBRE, version: VERSION_SOBRE, kdf: KDF, iter: ITERACIONES, sal: salB64, iv: aBase64(iv), datos: aBase64(cifrado) };
}

/**
 * Sobre → texto. Con la frase equivocada o el sobre alterado AES-GCM falla: un solo error, 'descifrado'.
 * @param {unknown} sobre
 * @param {string} frase
 * @param {{ cripto?: Crypto }} [opciones]
 */
export async function descifrar(sobre, frase, { cripto = globalThis.crypto } = {}) {
    const s = sobreValido(sobre);
    const e = evaluarFrase(frase);
    if (!e.ok) throw new ErrorCifrado(e.motivo, 'frase');
    const clave = await derivarClave(e.frase, s.sal, s.iter, cripto);
    try {
        const plano = await cripto.subtle.decrypt(
            { name: 'AES-GCM', iv: /** @type {BufferSource} */ (desdeBase64(s.iv, 64)), additionalData: new TextEncoder().encode(AAD) },
            clave, /** @type {BufferSource} */ (desdeBase64(s.datos)));
        return new TextDecoder('utf-8', { fatal: true }).decode(plano);
    } catch (err) {
        if (err instanceof ErrorCifrado) throw err;
        throw new ErrorCifrado('No se pudo descifrar: la frase es incorrecta o el contenido fue alterado.', 'descifrado');
    }
}
