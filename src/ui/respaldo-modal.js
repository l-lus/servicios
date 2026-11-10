import { $, $$ } from '../core/dom.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { EstadoApp } from '../services/estado-app.js';

// ============================================================
// RESPALDO — modal para exportar todo, un mes o un rango de fechas
// ============================================================

export class RespaldoModal {
    constructor(app) {
        this.app = app;
        this.tipo = 'completo';
    }

    /** Rango elegido según el tipo ({ desde, hasta } vacíos para el respaldo completo). */
    _rango() {
        if (this.tipo === 'mes') return $('respaldo-mes').value ? ImportarExportar.rangoDeMes($('respaldo-mes').value) : null;
        if (this.tipo === 'rango') return { desde: $('respaldo-desde').value, hasta: $('respaldo-hasta').value };
        return { desde: '', hasta: '' };
    }

    _error(rango) {
        if (this.tipo === 'mes' && !rango) return 'Elegí un mes';
        if (this.tipo === 'rango') {
            if (!rango.desde && !rango.hasta) return 'Elegí al menos una fecha';
            if (rango.desde && rango.hasta && rango.desde > rango.hasta) return 'La fecha «Desde» es posterior a «Hasta»';
        }
        return '';
    }

    seleccionarTipo(tipo) {
        this.tipo = tipo;
        $$('#modal-respaldo .respaldo-tipo').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tipo === tipo)));
        $('respaldo-campos-mes').hidden = tipo !== 'mes';
        $('respaldo-campos-rango').hidden = tipo !== 'rango';
        this.actualizarResumen();
    }

    actualizarResumen() {
        const rango = this._rango();
        const error = this._error(rango);
        const texto = $('respaldo-contenido');
        const boton = $('btn-respaldo-exportar');
        if (error || !rango) { texto.textContent = error; boton.disabled = true; return; }
        const categorias = this.app.categoria.getCategorias();
        const datos = ImportarExportar.recortarPorRango(EstadoApp.servicios, categorias, rango.desde, rango.hasta);
        const hayAlgo = datos.servicios.length > 0;
        texto.textContent = hayAlgo
            ? `Incluye ${ImportarExportar.describirContenido(datos.servicios, datos.categorias)}`
            : 'No hay facturas para respaldar en este período';
        boton.disabled = !hayAlgo;
    }

    abrir() {
        const hoy = new Date();
        $('respaldo-mes').value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
        $('respaldo-desde').value = '';
        $('respaldo-hasta').value = '';
        this.seleccionarTipo('completo');
        this.app.ui.abrirModal('modal-respaldo');
    }

    async exportar() {
        const rango = this._rango();
        if (this._error(rango)) return;
        const parcial = this.tipo !== 'completo';
        this.app.ui.cerrarModal('modal-respaldo');
        await this.app.storage.exportarDatos(parcial ? { rango } : {});
    }

    bindEventos() {
        $$('#modal-respaldo .respaldo-tipo').forEach(b => {
            b.addEventListener('click', () => this.seleccionarTipo(b.dataset.tipo));
        });
        ['respaldo-mes', 'respaldo-desde', 'respaldo-hasta'].forEach(id => {
            $(id).addEventListener('input', () => this.actualizarResumen());
            $(id).addEventListener('change', () => this.actualizarResumen());
        });
        $('btn-respaldo-exportar').addEventListener('click', () => this.exportar());
        $('btn-respaldo-cancelar').addEventListener('click', () => this.app.ui.cerrarModal('modal-respaldo'));
    }
}
