import { STORAGE_KEYS } from '../core/constantes.js';
import { Secretos } from '../core/secretos.js';
import { normalizarFrase, evaluarFrase, generarFrase } from '../core/cifrado.js';

// ====================================================================
// FRASE DE CIFRADO — la frase con la que se cierran el Gist y los respaldos exportados
// ====================================================================
// Una sola para toda la app. Vive en la sesión y solo se guarda en este navegador si la persona toca «Recordar» (core/secretos.js).
// Nunca va en el respaldo, en un log ni en un mensaje. Si se pierde, lo cifrado con ella no se puede recuperar.

const CLAVE = STORAGE_KEYS.FRASE_CIFRADO;

/** La frase guardada ('' si no hay). */
const actual = () => normalizarFrase(Secretos.leer(CLAVE));

/** ¿Hay una frase guardada y válida (con el largo mínimo)? */
const disponible = () => evaluarFrase(actual()).ok;

/** ¿Está guardada de forma permanente en este navegador? */
const recordada = () => Secretos.esRecordado(CLAVE);

/** Guarda la frase (solo para la sesión o, con `recordar`, en este navegador); vacía la olvida. Devuelve false si no se pudo guardar. @param {string} frase @param {boolean} [recordar] */
const guardar = (frase, recordar = false) => Secretos.guardar(CLAVE, normalizarFrase(frase), recordar);

const olvidar = () => Secretos.olvidar(CLAVE);

/** Una frase nueva al azar (5 palabras pronunciables). */
const generar = () => generarFrase((n) => crypto.getRandomValues(new Uint8Array(n)));

export const FraseCifrado = { actual, disponible, recordada, guardar, olvidar, generar, evaluar: evaluarFrase };
