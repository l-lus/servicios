import test from 'node:test';
import assert from 'node:assert/strict';

// El módulo importa toast.js, que no toca el DOM al cargarse: alcanza con globals mínimos.
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
globalThis.matchMedia = () => ({ matches: false, addEventListener() { } });

const { porcentajeValido, AvisoActualizacion } = await import('../src/ui/aviso-actualizacion.js');
const { ToastManager } = await import('../src/ui/toast.js');

test('porcentajeValido: acota a 0–100, redondea y descarta lo que no es número', () => {
    assert.equal(porcentajeValido(0), 0);
    assert.equal(porcentajeValido(42.6), 43);
    assert.equal(porcentajeValido('55'), 55);
    assert.equal(porcentajeValido(250), 100);
    assert.equal(porcentajeValido(-3), 0);
    assert.equal(porcentajeValido(null), null);
    assert.equal(porcentajeValido(undefined), null);
    assert.equal(porcentajeValido(''), null);
    assert.equal(porcentajeValido('abc'), null);
    assert.equal(porcentajeValido(NaN), null);
});

test('AvisoActualizacion.listo: toast sin botón y con acción al tocar', () => {
    let llamado = null;
    const origMostrar = ToastManager.mostrarToast;
    const origFinalizar = ToastManager.finalizarProgreso;
    try {
        ToastManager.finalizarProgreso = () => { };
        ToastManager.mostrarToast = (mensaje, tipo, duracion, detalle, accion) => {
            llamado = { mensaje, tipo, duracion, detalle, accion };
        };
        AvisoActualizacion.listo();
        assert.ok(llamado, 'Se debió llamar a mostrarToast');
        assert.match(llamado.mensaje, /recargar/i);
        assert.equal(llamado.tipo, 'success');
        assert.equal(typeof llamado.accion, 'function', 'La acción debe ser una función (al tocar el toast)');
        assert.equal(llamado.accion.label, undefined, 'No debe tener botón con label');
    } finally {
        ToastManager.mostrarToast = origMostrar;
        ToastManager.finalizarProgreso = origFinalizar;
    }
});
