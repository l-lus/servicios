// ============================================================
// SEGURIDAD Y UTILIDADES (límites, limpieza de texto, IDs, hash)
// ============================================================
export const SecurityAndUtils = (function () {
    'use strict';

    const SECURITY_LIMITS = {
        MAX_STRING_LENGTH: 100,
        MAX_JSON_SIZE: 4 * 1024 * 1024,
        MAX_NOMBRE_LENGTH: 30,
        MAX_CATEGORIAS: 100,
        // Topes de cantidad para datos que vienen de afuera: muy por encima de un uso real (y de lo que entra en el almacenamiento), frenan un archivo armado para colgar la app
        MAX_SERVICIOS: 2000,
        MAX_FACTURAS_POR_SERVICIO: 20000,
        MAX_MONTO: 99999999,
        // v1 = '1.0' (sin hash); v2 agrega hash SHA-256 de { servicios, categorias }
        SCHEMA_VERSION: 2,
    };

    // Las fechas se validan con esFechaISO (core/fechas.js), que además comprueba que existan en el calendario
    const REGEX_PATTERNS = {
        ID: /^[A-Za-z0-9_-]{1,100}$/,
    };

    /**
     * Texto que viene de afuera (formulario, respaldo, Gist) listo para guardar: sin caracteres de control, sin espacios en los extremos y con un largo máximo.
     * No quita ni escapa símbolos (comillas, <, &…): son datos válidos y el escape lo hace html`...` al mostrarlos.
     * @param {unknown} str @param {number} [maxLength]
     */
    function limpiarTexto(str, maxLength = SECURITY_LIMITS.MAX_STRING_LENGTH) {
        if (typeof str !== 'string') return '';
        return str.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, maxLength);
    }

    function escapeHtml(s) {
        return s == null ? '' : String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const CLAVES_PROTO_PELIGROSAS = ['__proto__', 'constructor', 'prototype'];

    function reviverJSONSeguro(key, value) {
        return CLAVES_PROTO_PELIGROSAS.includes(key) ? undefined : value;
    }

    /**
     * Diccionario de banderas cuyas claves son datos (nombres de categorías, ids…): una copia que no hereda de Object.prototype (una clave como
     * «constructor» o «toString» no existe hasta que se la marca) y que solo conserva las claves en `true`. Sirve para validar uno guardado (lista de claves u objeto) y para copiarlo; para guardarlo: `Object.keys(d)`.
     * @param {unknown} crudo @param {number} [maxClaves] @param {number} [maxLargo]
     * @returns {Record<string, true>}
     */
    function diccionarioDeBanderas(crudo, maxClaves = 500, maxLargo = SECURITY_LIMITS.MAX_STRING_LENGTH) {
        const limpio = Object.create(null);
        if (!crudo || typeof crudo !== 'object') return limpio;
        // Se guarda como lista de claves (un objeto guardado perdería «constructor» al leerlo: reviverJSONSeguro descarta esa clave); el objeto es el formato viejo
        const claves = Array.isArray(crudo) ? crudo : Object.keys(crudo).filter(clave => crudo[clave] === true);
        claves.slice(0, maxClaves).forEach(clave => {
            if (typeof clave === 'string' && clave.length <= maxLargo) limpio[clave] = true;
        });
        return limpio;
    }

    function generarIDSeguro() {
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            const array = new Uint32Array(4);
            crypto.getRandomValues(array);
            return Array.from(array, num => num.toString(36)).join('');
        }
        const timestamp = Date.now().toString(36);
        const random1 = Math.random().toString(36).substring(2, 11);
        const random2 = Math.random().toString(36).substring(2, 11);
        return `${timestamp}-${random1}${random2}`;
    }

    async function calcularHashSHA256(data) {
        const buffer = new TextEncoder().encode(JSON.stringify(data));
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    }

    return {
        SECURITY_LIMITS,
        REGEX_PATTERNS,
        limpiarTexto,
        escapeHtml,
        reviverJSONSeguro,
        diccionarioDeBanderas,
        generarIDSeguro,
        calcularHashSHA256
    };
})();
