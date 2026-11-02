// Anti-clickjacking: GitHub Pages no permite enviar el header
// frame-ancestors / X-Frame-Options, y como <meta> los navegadores los ignoran.
if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; }
    catch (e) { document.documentElement.style.display = 'none'; }
}

// Lista válida de temas (copia de TEMAS en core/temas.js: este script clásico no puede importar módulos; tests/architecture.test.mjs
// verifica que coincidan). Un valor guardado que no esté en la lista se trata como el tema por defecto ('dark').
var TEMAS_VALIDOS = ['light', 'dark', 'medianoche', 'pink', 'green', 'blue', 'lilac', 'crema'];

(function () {
    var html = document.documentElement;
    // Suprimir transiciones ANTES del primer paint
    html.classList.add('no-transition');
    try {
        var tema = localStorage.getItem('gestion_servicios_theme');
        if (TEMAS_VALIDOS.indexOf(tema) === -1) tema = 'dark';
        if (tema === 'dark') html.classList.add('dark-mode');
        else if (tema !== 'light') html.setAttribute('data-theme', tema);
    } catch (e) { }
    // Restaurar transiciones después del primer frame pintado
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            html.classList.remove('no-transition');
        });
    });
}());

// Reducir animaciones: 'on' | 'off' | 'auto' (sin valor = auto, sigue al sistema).
// Misma regla que Motion en app.js; el CSS solo mira <html data-motion>.
(function () {
    try {
        var m = localStorage.getItem('gestion_servicios_reducir_animaciones');
        var reducir = m === 'on' || (m !== 'off' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        document.documentElement.setAttribute('data-motion', reducir ? 'reduce' : 'full');
    } catch (e) { }
}());

// Parche anti parpadeo blanco en modo oscuro
