import { CORTES_LAYOUT } from '../core/constantes.js';
import { PosicionHeader, posicionesPermitidas } from '../core/posicion-header.js';
import { EventosApp } from '../core/eventos.js';
import { ToastManager } from './toast.js';
import { uiAnimarReubicacion, uiArrastreLargo } from './arrastre.js';
import { elementosDelLayout, claveDelLayout } from './transicion-layout.js';
import { VistaPrevia, VENTANA_PERSONALIZAR_MS, AVISO_PERSONALIZAR_MS } from './vista-previa.js';

// ====================================================================
// UI REUBICAR EL ENCABEZADO (mantener presionado y arrastrar, como las tarjetas)
// ====================================================================
// Se mantiene presionado el encabezado (en un lugar que no sea un botón) y, ya levantado, se arrastra: el encabezado se pone en vivo en el borde más cercano
// al puntero (arriba, abajo, a la izquierda o a la derecha; en móvil solo arriba y abajo), con el mismo deslizamiento que las tarjetas, y las tarjetas se acomodan
// al lugar que deja. Al soltar queda ahí (Escape cancela y vuelve a donde estaba). El dibujo de cada posición es del CSS (<html data-header-pos>, ver core/posicion-header.js).
// Atajo para el tema (igual que el de las tarjetas): mantener presionado y soltar sin mover dentro de VENTANA_PERSONALIZAR_MS abre la vista previa del tema.
// Además mantiene medidas las variables CSS que dependen del encabezado: --header-alto (su altura, el margen que se deja abajo cuando va abajo) y
// --app-header-h (lo que ocupa arriba: 0 si va abajo o a un costado).
const _consultaEscritorio = window.matchMedia(CORTES_LAYOUT.ESCRITORIO);

// Controles del encabezado que conservan su toque o clic normal: no inician el arrastre
const _SELECTOR_CONTROLES = 'button, a, input, select, textarea';

/** Lo que más cerca del borde nuevo tiene que estar el puntero, respecto del actual, para que el encabezado cambie de lugar (evita saltos en las diagonales). */
const HISTERESIS_PX = 24;

/** De los lugares permitidos, el del borde de la ventana más cercano al puntero; el actual solo se deja si otro gana por más que la histéresis. */
function _posicionMasCercana(x, y, permitidas, actual) {
    const distancia = { top: y, bottom: window.innerHeight - y, left: x, right: window.innerWidth - x };
    const mejor = permitidas.reduce((m, id) => (distancia[id] < distancia[m] ? id : m), permitidas[0]);
    if (!permitidas.includes(actual)) return mejor;
    return distancia[mejor] < distancia[actual] - HISTERESIS_PX ? mejor : actual;
}

function _medirOffsets() {
    const header = document.querySelector('.header');
    if (!header) return;
    const alto = header.getBoundingClientRect().height;
    const raiz = document.documentElement.style;
    raiz.setProperty('--app-header-h', `${PosicionHeader.altoSuperior(alto)}px`);
    raiz.setProperty('--header-alto', `${alto}px`);
}

function iniciar() {
    let permitidas = [];
    let destino = null;

    PosicionHeader.init();
    EventosApp.on('header:posicion', _medirOffsets);
    const header = document.querySelector('.header');
    if (header) new ResizeObserver(_medirOffsets).observe(header);
    _medirOffsets();

    // El encabezado se muestra en `id` en el acto (sin guardarlo), animando su deslizamiento y el de las tarjetas
    const mostrarEn = (id, el) => uiAnimarReubicacion(elementosDelLayout, claveDelLayout, () => PosicionHeader.previsualizar(id), { encima: el });

    uiArrastreLargo(document, {
        elegir: (e) => {
            const el = e.target instanceof Element ? e.target : null;
            if (!el) return null;
            const encabezado = el.closest('.header');
            if (!encabezado || el.closest(_SELECTOR_CONTROLES)) return null;
            // con la vista previa abierta no se puede reubicar: son modos excluyentes (igual que con las tarjetas)
            if (VistaPrevia.activa()) return null;
            return encabezado;
        },
        alEmpezar: (encabezado) => {
            permitidas = posicionesPermitidas(_consultaEscritorio.matches);
            destino = PosicionHeader.actual();
            encabezado.classList.add('reubicando');
            document.body.classList.add('header-arrastrando-activa');
            ToastManager.mostrarToast('Soltá para personalizar', 'info', AVISO_PERSONALIZAR_MS);
        },
        // en cuanto el dedo se mueve es una reubicación: el aviso de personalizar ya no corresponde
        alPrimerMovimiento: () => ToastManager.cerrarActual(),
        alMover: (e, encabezado) => {
            const nueva = _posicionMasCercana(e.clientX, e.clientY, permitidas, destino);
            if (nueva === destino) return;
            destino = nueva;
            mostrarEn(destino, encabezado);
        },
        alTerminar: (encabezado, confirmar, { movido, duracion }) => {
            encabezado.classList.remove('reubicando');
            document.body.classList.remove('header-arrastrando-activa');
            if (confirmar && destino) PosicionHeader.setPosicion(destino);   // ya se ve ahí: solo se guarda
            else uiAnimarReubicacion(elementosDelLayout, claveDelLayout, () => PosicionHeader.restaurar(), { encima: encabezado });
            destino = null;
            // mantener y soltar sin mover (y dentro de la ventana) = personalizar el tema
            if (confirmar && !movido && duracion <= VENTANA_PERSONALIZAR_MS) {
                ToastManager.cerrarActual();
                if (navigator.vibrate) { try { navigator.vibrate(20); } catch (_) { /* la vibración es opcional */ } }
                EventosApp.emit('tarjeta:personalizar', { tarjeta: 'tema' });
            }
        },
    });
}

export const HeaderPosicion = { iniciar };
