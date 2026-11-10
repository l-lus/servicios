// Anti-clickjacking: GitHub Pages no permite enviar el header
// frame-ancestors / X-Frame-Options, y como <meta> los navegadores los ignoran.
if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { /** @type {Window} */ (window.top).location = window.self.location.href; } catch (e) { /* sin acceso al almacenamiento o a window.top: se usan los valores por defecto */ }
}

// Listas válidas (copias de TEMAS en core/temas.js, de ESTILOS_CALENDARIO en core/estilo-calendario.js y de POSICIONES_HEADER en core/posicion-header.js: este
// script clásico no puede importar módulos; tests/architecture.test.mjs verifica que coincidan). Un valor guardado
// que no esté en la lista se trata como el valor por defecto, igual que hacen esos módulos.
var TEMAS_VALIDOS = ['light', 'dark', 'medianoche', 'pink', 'green', 'blue', 'lilac', 'crema'];
var POSICIONES_HEADER_VALIDAS = ['top', 'bottom', 'left', 'right'];
var ESTILOS_CALENDARIO_VALIDOS = ['legacy', 'relleno-aro', 'cuadrado-aro', 'aro-grueso', 'contorno-brillo', 'subrayado', 'punto'];

(function () {
    var html = document.documentElement;
    // Suprimir transiciones ANTES del primer paint
    html.classList.add('no-transition');
    try {
        var tema = localStorage.getItem('gestion_servicios_theme') || '';
        if (TEMAS_VALIDOS.indexOf(tema) === -1) tema = 'dark';
        if (tema === 'dark') html.classList.add('dark-mode');
        else if (tema !== 'light') html.setAttribute('data-theme', tema);
    } catch (e) { /* sin acceso al almacenamiento: se usan los valores por defecto */ }
    // Restaurar transiciones después del primer frame pintado
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            html.classList.remove('no-transition');
        });
    });
}());

// Estilo de los días del calendario (ver EstiloCalendario): el CSS solo mira <html data-estilo-calendario>; sin valor guardado queda el original ('legacy').
(function () {
    try {
        var e = localStorage.getItem('estilo-calendario') || 'legacy';
        document.documentElement.setAttribute('data-estilo-calendario', ESTILOS_CALENDARIO_VALIDOS.indexOf(e) === -1 ? 'legacy' : e);
    } catch (err) { /* sin acceso al almacenamiento: se usan los valores por defecto */ }
}());

// Posición del encabezado (ver PosicionHeader): el CSS solo mira <html data-header-pos>. PC y móvil guardan la suya (mismo corte que el CSS: 768px);
// en móvil solo valen arriba y abajo. Sin valor guardado (o inválido para ese modo) queda arriba.
(function () {
    try {
        var escritorio = window.matchMedia('(min-width: 768px)').matches;
        var p = localStorage.getItem(escritorio ? 'posicion-header' : 'posicion-header-movil') || 'top';
        if (POSICIONES_HEADER_VALIDAS.indexOf(p) === -1 || (!escritorio && (p === 'left' || p === 'right'))) p = 'top';
        document.documentElement.setAttribute('data-header-pos', p);
    } catch (err) { /* sin acceso al almacenamiento: se usan los valores por defecto */ }
}());

// Reducir animaciones: 'on' | 'off' | 'auto' (sin valor = auto, sigue al sistema).
// Misma regla que Motion en app.js; el CSS solo mira <html data-motion>.
(function () {
    try {
        var m = localStorage.getItem('gestion_servicios_reducir_animaciones');
        var reducir = m === 'on' || (m !== 'off' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.setAttribute('data-motion', reducir ? 'reduce' : 'full');
    } catch (e) { /* sin acceso al almacenamiento: se usan los valores por defecto */ }
}());

// Pantalla de carga: oculta el HTML estático (CSS: html.cargando) hasta que main.js lo quita al terminar de iniciar la UI.
// Red de seguridad: si el módulo falla o tarda demasiado, se muestra la página igual.
(function () {
    var html = document.documentElement;
    html.classList.add('cargando');
    setTimeout(function () { html.classList.remove('cargando'); }, 8000);
}());
