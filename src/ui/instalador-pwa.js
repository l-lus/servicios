import { urlScriptConfiable } from '../core/html.js';
import { ToastManager } from './toast.js';

// ============================================================
// INSTALADOR PWA — registro del Service Worker y aviso de actualización
// ============================================================
export const InstaladorPWA = {
    registrarServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        let newWorker;

        window.addEventListener('load', () => {
            navigator.serviceWorker.register(urlScriptConfiable('./sw.js'))
                .then(registration => {
                    registration.addEventListener('updatefound', () => {
                        newWorker = registration.installing;
                        newWorker?.addEventListener('statechange', () => {
                            if (newWorker?.state === 'installed' && navigator.serviceWorker.controller) {
                                ToastManager.mostrarToast('Actualizando aplicación...', 'info');
                            }
                        });
                    });
                })
                .catch(err => console.error('Error registro SW:', err));
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    },
};
