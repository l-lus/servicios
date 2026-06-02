(function () {
    var html = document.documentElement;
    // Suprimir transiciones ANTES del primer paint
    html.classList.add('no-transition');
    try {
        var tema = localStorage.getItem('gestion_servicios_theme');
        if (tema === 'dark' || tema === null) {
            html.classList.add('dark-mode');
        }
    } catch (e) { }
    // Restaurar transiciones después del primer frame pintado
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            html.classList.remove('no-transition');
        });
    });
}());

// Parche anti parpadeo blanco en modo oscuro
