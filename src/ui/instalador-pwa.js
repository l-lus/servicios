import { $ } from '../core/dom.js';
import { urlScriptConfiable } from '../core/html.js';
import { Movimiento } from '../core/movimiento.js';
import { AvisoActualizacion } from './aviso-actualizacion.js';
import { IconosAnimados } from './iconos-animados.js';
import { ToastManager } from './toast.js';

// ====================================================================
// INSTALADOR PWA — instalación en dispositivo, registro del SW y búsqueda de versiones nuevas
// ====================================================================
let deferredPrompt = null;

const RONDAS_LLAMADO_MS = [1500, 15000];
const CICLOS_POR_RONDA = 3;
const PAUSA_ENTRE_CICLOS_MS = 2200;
/** @type {ReturnType<typeof setTimeout>[]} */
let _timersLlamado = [];

function _detenerLlamado() {
    _timersLlamado.forEach(clearTimeout);
    _timersLlamado = [];
    $('btn-install')?.classList.remove('llamando');
}

function _cicloLlamado() {
    const btnInstall = $('btn-install');
    if (!btnInstall) return;
    btnInstall.classList.remove('llamando');
    void btnInstall.offsetWidth;
    btnInstall.classList.add('llamando');
    IconosAnimados.rebotarFlecha(btnInstall);
}

function _iniciarLlamado() {
    _detenerLlamado();
    if (Movimiento.reducido()) return;
    RONDAS_LLAMADO_MS.forEach(inicio => {
        for (let i = 0; i < CICLOS_POR_RONDA; i++) {
            _timersLlamado.push(setTimeout(_cicloLlamado, inicio + i * PAUSA_ENTRE_CICLOS_MS));
        }
    });
}

function init() {
    const btnInstall = $('btn-install');
    if (window.matchMedia('(display-mode: standalone)').matches ||
        /** @type {any} */ (window.navigator).standalone === true) {
        if (btnInstall) btnInstall.style.display = 'none';
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = $('btn-install');
        if (btn) {
            btn.style.display = 'flex';
            _iniciarLlamado();
        }
    });

    window.addEventListener('appinstalled', () => {
        _detenerLlamado();
        const btn = $('btn-install');
        if (btn) btn.style.display = 'none';
        deferredPrompt = null;
        ToastManager.mostrarToast('¡App instalada con éxito!', 'success');
    });
}

async function instalarApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
}

function bindEventos() {
    $('btn-install')?.addEventListener('click', () => { _detenerLlamado(); instalarApp(); });
    ['pointerenter', 'focus'].forEach(ev => $('btn-install')?.addEventListener(ev, _detenerLlamado));
}

// Mínimo entre búsquedas de versión nueva al volver a la app (el navegador por sí solo revisa poco si la PWA queda abierta en segundo plano)
const BUSQUEDA_MIN_MS = 60 * 1000;
// Con la pestaña a la vista y sin recargar (típico en PC) tampoco hay otra revisión: se busca cada tanto
const BUSQUEDA_PERIODICA_MS = 15 * 60 * 1000;

let _actualizando = false;

function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

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
                    if (!nuevo || !registration.active) return;
                    _actualizando = true;
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

export const InstaladorPWA = { init, bindEventos, registrarServiceWorker };

