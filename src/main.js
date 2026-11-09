import { APP_NOMBRE, APP_VERSION, STORAGE_KEYS } from './core/constantes.js';
import { StorageHelper } from './core/almacenamiento.js';
import { ToastManager } from './ui/toast.js';
import { GestionServicios } from './ui/gestion-servicios.js';
import { InstaladorPWA } from './ui/instalador-pwa.js';
import { RecargaGesto } from './ui/recarga-gesto.js';

// ====================================================================
// MAIN — arranque de la aplicación
// ====================================================================

// Los toasts del almacenamiento (p. ej. cuota llena) los muestra la UI
StorageHelper.configurarNotificaciones({ mostrarToast: ToastManager.mostrarToast });

InstaladorPWA.registrarServiceWorker();


// Aplicar estado de tarjetas colapsables
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const estadisticasColapsadas = StorageHelper.getBoolean(STORAGE_KEYS.ESTADISTICAS_COLAPSADAS);
        const serviciosState = StorageHelper.getItem(STORAGE_KEYS.SERVICIOS_COLLAPSE, 'expanded');
        const estadisticasContent = document.getElementById('estadisticas-content');
        const estadisticasChevron = document.getElementById('estadisticas-chevron');
        const serviciosContent = document.getElementById('servicios-content');
        const serviciosChevron = document.getElementById('servicios-chevron');

        // Aplicar estado de estadísticas
        if (!estadisticasColapsadas) {
            estadisticasContent.classList.remove('collapsed');
        } else {
            estadisticasContent.classList.add('collapsed');
            estadisticasChevron.classList.add('collapsed');
        }

        // Aplicar estado de servicios
        if (serviciosState === 'expanded') {
            serviciosContent.classList.remove('collapsed', 'semi-collapsed');
        } else if (serviciosState === 'collapsed') {
            serviciosContent.classList.add('collapsed');
            serviciosChevron.classList.add('collapsed');
        } else if (serviciosState === 'semi-collapsed') {
            serviciosContent.classList.add('semi-collapsed');
            serviciosChevron.classList.add('semi-collapsed');
        }
    });
})();

new GestionServicios();

// Versión visible en el menú de ajustes (la sube `npm run release`)
const elVersion = document.getElementById('menu-version');
if (elVersion) elVersion.textContent = `${APP_NOMBRE} ${APP_VERSION}`;

document.documentElement.classList.remove('cargando');
RecargaGesto.entrar();

