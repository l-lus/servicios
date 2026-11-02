import { urlScriptConfiable } from '../core/html.js';
import { AvisoActualizacion } from './aviso-actualizacion.js';

// ====================================================================
// INSTALADOR PWA — registro del Service Worker y búsqueda de versiones nuevas
// ====================================================================
// Mínimo entre búsquedas de versión nueva al volver a la app (el navegador por sí solo revisa poco si la PWA queda abierta en segundo plano)
const BUSQUEDA_MIN_MS = 60 * 1000;
// Con la pestaña a la vista y sin recargar (típico en PC) tampoco hay otra revisión: se busca cada tanto
const BUSQUEDA_PERIODICA_MS = 15 * 60 * 1000;

// Hay una versión instalada y está llegando otra (se avisa y se informa el avance). No depende de que la página esté controlada
// por el worker: tras una recarga forzada (Ctrl+Shift+R) la página queda sin controlador aunque haya una versión instalada.
let _actualizando = false;

function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // El worker informa cuánto lleva descargado de la versión nueva. Solo se avisa si ya había una instalada (no en la primera visita).
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (!_actualizando) return;
        const datos = e.data;
        if (datos?.tipo === 'sw-progreso') AvisoActualizacion.progreso(datos.progreso);
        else if (datos?.tipo === 'sw-error') AvisoActualizacion.error();
    });

    const _registrar = () => {
        navigator.serviceWorker.register(urlScriptConfiable('./sw.js'))
            .then(registration => {
                registration.addEventListener('updatefound', () => {
                    const nuevo = registration.installing;
                    // sin versión activa es la primera instalación: no hay nada que avisar
                    if (!nuevo || !registration.active) return;
                    _actualizando = true;
                    // aviso inmediato: ya se sabe que hay una versión nueva aunque todavía se esté descargando
                    AvisoActualizacion.iniciar();
                    nuevo.addEventListener('statechange', () => {
                        if (nuevo.state === 'installed') { _actualizando = false; AvisoActualizacion.listo(); }
                        else if (nuevo.state === 'redundant') { _actualizando = false; AvisoActualizacion.error(); }
                    });
                });
                _buscarActualizacionAlVolver(registration);
            })
            .catch(err => console.error('Error registro SW:', err));
    };
    // Con una versión ya instalada se registra enseguida; en la primera visita se espera al load para no competir con la carga inicial.
    if (navigator.serviceWorker.controller || document.readyState === 'complete') _registrar();
    else window.addEventListener('load', _registrar);
}

function _buscarActualizacionAlVolver(registration) {
    let ultima = Date.now();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - ultima < BUSQUEDA_MIN_MS) return;
        ultima = Date.now();
        registration.update().catch(() => { });
    });
    setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        ultima = Date.now();
        registration.update().catch(() => { });
    }, BUSQUEDA_PERIODICA_MS);
}

export const InstaladorPWA = { registrarServiceWorker };
