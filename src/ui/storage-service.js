import { preguntarMerge } from './resumen-merge.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { ModalManager } from './gestor-modales.js';
import { RespaldoCifrado } from '../services/respaldo-cifrado.js';
import { FraseCifrado } from './frase-cifrado.js';
import { FraseModal } from './frase-modal.js';

// ============================================================
// STORAGE SERVICE — persistencia, validación, import/export
// ============================================================
export class StorageService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get servicios() { return EstadoApp.servicios; }
    set servicios(v) { EstadoApp.servicios = v; }
    get perfilActivo() { return EstadoApp.perfilActivo; }
    get INGRESOS_ID() { return this.app.SERVICIO_INGRESOS_ID; }

    // ── Carga / guardado por perfil ───────────────────────────
    cargarDatosPerfilActivo() {
        try {
            const key = STORAGE_KEYS.DATOS_PERFIL(this.perfilActivo);
            this.servicios = StorageHelper.getObject(key, []);
            this.app.historial_mgr.inicializarHistorial();
        } catch (error) {
            console.error('Error al cargar datos del perfil:', error);
            this.servicios = [];
            this.app.historial_mgr.inicializarHistorial();
        }
    }

    guardarDatosPerfilActivo() {
        try {
            const key = STORAGE_KEYS.DATOS_PERFIL(this.perfilActivo);
            const ok = StorageHelper.setItem(key, this.servicios);
            // Auto-subida a Gist (si está habilitada)
            if (ok && this.app.gist) this.app.gist.subirAuto();
        } catch (error) {
            console.error('Error al guardar datos del perfil:', error);
            this.app.ui.mostrarToast('Error al guardar datos', 'error');
        }
    }

    guardarDatos() {
        try {
            this.guardarDatosPerfilActivo();
        } catch (error) {
            console.error('Error al guardar datos:', error);
            this.app.ui.mostrarToast('Error al guardar datos', 'error');
        }
    }

    // ── Espacio disponible ────────────────────────────────────
    verificarEspacioDisponible() {
        try {
            const tamaño = new Blob([JSON.stringify(this.servicios)]).size;
            const tamañoMB = tamaño / (1024 * 1024);
            return { tamaño: tamañoMB, tamañoBytes: tamaño, advertencia: tamañoMB > 3, critico: tamañoMB > 4.5 };
        } catch {
            return { tamaño: 0, tamañoBytes: 0, advertencia: false, critico: false };
        }
    }

    // La validación y normalización de datos externos vive en ImportarExportar (services/importar-exportar.js).

    // Archivo de exportación: versión de esquema + hash de integridad.
    async _construirExportacion() {
        return ImportarExportar.armarRespaldo(this.servicios, this.app.categoria.getCategorias());
    }

    // Verifica versión y hash de un archivo importado. Devuelve false si el
    // usuario decide no continuar.
    async _verificarArchivo(datos) {
        if (ImportarExportar.esVersionMasNueva(datos)) {
            const continuar = await ModalManager.confirmar(
                `El archivo es de una versión más nueva (${SecurityAndUtils.limpiarTexto(String(datos.version), 20)}). Puede haber incompatibilidades. ¿Continuar?`,
                'Continuar', '#icon-help', { titulo: 'Versión detectada' }
            );
            if (!continuar) return false;
        }
        await this.advertirIntegridad(datos, 'El archivo');
        return true;
    }

    // El hash detecta archivos editados a mano o dañados. No impide
    // restaurar (la validación de estructura ya protege los datos): solo
    // avisa para que el usuario revise lo importado.
    async advertirIntegridad(datos, origen) {
        if (await ImportarExportar.hashCoincide(datos)) return true;
        this.app.ui.mostrarToast(`${origen} fue modificado o está dañado (la verificación de integridad no coincide). Revisá los datos importados`, 'warning', 6000);
        return false;
    }

    // ── Exportar ──────────────────────────────────────────────
    /** Con `cifrar` el archivo se guarda como un sobre cifrado con la frase (en vez del JSON en claro). @param {{ rango?: { desde?: string, hasta?: string } | null, cifrar?: boolean }} [opciones] */
    async exportarDatos({ rango = null, cifrar = false } = {}) {
        try {
            let servicios = this.servicios, categorias = this.app.categoria.getCategorias();
            if (rango) ({ servicios, categorias } = ImportarExportar.recortarPorRango(servicios, categorias, rango.desde, rango.hasta));
            const datos = await ImportarExportar.armarRespaldo(servicios, categorias, new Date(), rango);
            const sufijo = !rango ? this.app.utils.obtenerFechaLocal()
                : (rango.desde && rango.hasta ? `${rango.desde}_${rango.hasta}` : (rango.desde ? `desde_${rango.desde}` : `hasta_${rango.hasta}`));
            let contenido = JSON.stringify(datos, null, 2);
            let nombre = `servicios_${sufijo}.json`;
            if (cifrar) {
                const sellado = await RespaldoCifrado.sellar(datos, FraseCifrado.actual());
                if ('error' in sellado) { this.app.ui.mostrarToast(`No se pudo cifrar: ${sellado.error}`, 'error'); return; }
                contenido = sellado.texto;
                nombre = `servicios_${sufijo}.cifrado.json`;
            }
            this.app.utils.descargarBlob(contenido, nombre, 'application/json');
            this.app.ui.mostrarToast(`${rango ? 'Respaldo parcial exportado' : 'Datos exportados correctamente'}${cifrar ? ' (cifrado)' : ''}`, 'success');
        } catch (error) {
            console.error('Error al exportar:', error);
            this.app.ui.mostrarToast('Error al exportar datos', 'error');
        }
    }

    // ── Importar ──────────────────────────────────────────────
    importarDatos(modo = 'reemplazar') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.addEventListener('change', (e) => {
            const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
            if (!file) return;
            const maxBytes = SecurityAndUtils.SECURITY_LIMITS.MAX_JSON_SIZE;
            if (file.size > maxBytes) {
                this.app.ui.mostrarToast(`Archivo demasiado grande (máx ${maxBytes / (1024 * 1024)}MB)`, 'error'); return;
            }
            if (!file.name.endsWith('.json')) {
                this.app.ui.mostrarToast('Solo se permiten archivos .json', 'error'); return;
            }
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const crudo = await this._leerArchivo(/** @type {string} */ (reader.result));
                    if (!crudo) return;
                    if (!(await this._verificarArchivo(crudo))) return;
                    const datos = ImportarExportar.normalizarDatos(crudo.servicios, crudo.categorias);

                    const elegido = await preguntarMerge({
                        origen: file.name,
                        locales: this.servicios, categoriasLocales: this.app.categoria.getCategorias(),
                        remotos: datos.servicios, categoriasRemotas: datos.categorias,
                        modoInicial: modo, rango: crudo.rango && typeof crudo.rango === 'object' ? crudo.rango : null,
                    });
                    if (elegido) this._aplicarImportacion(elegido, datos, crudo);
                } catch (error) {
                    console.error('Error al importar:', error);
                    this.app.ui.mostrarToast('Error al importar: ' + error.message, 'error');
                }
            };
            reader.onerror = () => this.app.ui.mostrarToast('Error al leer el archivo', 'error');
            reader.readAsText(file);
        });

        input.click();
    }

    /**
     * Texto de un archivo importado → respaldo. Un archivo cifrado se abre con la frase guardada; si falta o no lo abre, se pide la frase de ese archivo.
     * Devuelve null si la persona cancela; los errores de formato salen como Error con mensaje legible.
     * @param {string} texto
     */
    async _leerArchivo(texto) {
        let abierto = await RespaldoCifrado.abrir(texto, FraseCifrado.actual());
        while ('error' in abierto && ['sin-frase', 'frase', 'descifrado'].includes(abierto.codigo)) {
            const motivo = abierto.codigo === 'sin-frase'
                ? 'El archivo está cifrado. Ingresá la frase con que se exportó.'
                : 'La frase no abre este archivo (es otra, o el archivo fue alterado). Probá con la frase correcta.';
            const frase = await FraseModal.pedir(motivo);
            if (!frase) return null;
            abierto = await RespaldoCifrado.abrir(texto, frase);
        }
        if ('error' in abierto) throw new Error(abierto.error);
        return abierto.datos;
    }

    // ── Merge helpers ─────────────────────────────────────────
    _mergeServicios(serviciosRemoto) {
        return ImportarExportar.fusionarServicios(this.servicios, serviciosRemoto);
    }

    _aplicarImportacion(modo, datos, crudo = null) {
        const cats = Array.isArray(datos.categorias) ? datos.categorias : [];
        if (modo === 'combinar') {
            const { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados } = this._mergeServicios(datos.servicios);
            const categoriasAgregadas = this.app.gist.mergeCategorias(datos.categorias);
            if (!serviciosAgregados && !facturasAgregadas && !facturasActualizadas && !ingresosAgregados && !categoriasAgregadas) {
                this.app.ui.mostrarToast('No hay datos nuevos para agregar', 'info'); return;
            }
            const partes = [];
            if (serviciosAgregados > 0) partes.push(this.app.utils.plural(serviciosAgregados, 'servicio', 'servicios'));
            if (facturasAgregadas > 0) partes.push(this.app.utils.plural(facturasAgregadas, 'factura nueva', 'facturas nuevas'));
            if (facturasActualizadas > 0) partes.push(this.app.utils.plural(facturasActualizadas, 'actualizada', 'actualizadas'));
            if (ingresosAgregados > 0) partes.push(this.app.utils.plural(ingresosAgregados, 'ingreso nuevo', 'ingresos nuevos'));
            if (categoriasAgregadas > 0) partes.push(this.app.utils.plural(categoriasAgregadas, 'categoría', 'categorías'));
            this.app.utils.postGuardado('importar (combinar)');
            this.app.ui.mostrarToast(`Importado: ${partes.join(', ')}`, 'success');
        } else {
            this.servicios = datos.servicios;
            this.app.categoria.saveCategorias(cats);
            if (crudo) ImportarExportar.aplicarConfigImportada(crudo);
            this.app.utils.postGuardado('importar (reemplazar)');
            const resumen = ImportarExportar.describirContenido(datos.servicios, cats);
            this.app.ui.mostrarToast(`Restaurados: ${resumen}`, 'success');
        }
    }

    async limpiarDatos(tipo = 'todo') {
        const mensajes = {
            todo: '¿Estás seguro de eliminar TODOS los datos? (servicios, facturas, ingresos y categorías)',
            servicios: '¿Estás seguro de eliminar todos los servicios y sus facturas? Los ingresos y categorías se conservarán.',
            facturas: '¿Estás seguro de eliminar todas las facturas de todos los servicios? Los servicios se conservarán vacíos.',
            ingresos: '¿Estás seguro de eliminar todos los ingresos registrados?',
            categorias: '¿Estás seguro de eliminar todas las categorías?'
        };

        const toasts = {
            todo: 'Todos los datos han sido eliminados',
            servicios: 'Todos los servicios han sido eliminados',
            facturas: 'Todas las facturas han sido eliminadas',
            ingresos: 'Todos los ingresos han sido eliminados',
            categorias: 'Todas las categorías han sido eliminadas'
        };

        const confirmado = await ModalManager.confirmar(
            mensajes[tipo] || mensajes.todo,
            'Borrar',
            '#icon-trash',
            { titulo: 'Eliminar datos' }
        );
        if (!confirmado) return;

        if (tipo === 'todo') {
            EstadoApp.servicios = [];
            this.app.categoria.saveCategorias([]);
        } else if (tipo === 'servicios') {
            // Eliminar todos los servicios excepto el de ingresos
            EstadoApp.servicios = EstadoApp.servicios.filter(s => s.id === this.app.SERVICIO_INGRESOS_ID);
        } else if (tipo === 'facturas') {
            // Vaciar facturas de todos los servicios normales (no ingresos)
            EstadoApp.servicios = EstadoApp.servicios.map(s => {
                if (s.id === this.app.SERVICIO_INGRESOS_ID) return s;
                return { ...s, facturas: [] };
            });
        } else if (tipo === 'ingresos') {
            // Eliminar todas las facturas del servicio de ingresos
            const servicioIngresos = EstadoApp.servicios.find(s => s.id === this.app.SERVICIO_INGRESOS_ID);
            if (servicioIngresos) {
                servicioIngresos.facturas = [];
            }
        } else if (tipo === 'categorias') {
            // Limpiar categorías y quitar la categoría asignada a los servicios
            this.app.categoria.saveCategorias([]);
            EstadoApp.servicios = EstadoApp.servicios.map(s => ({ ...s, categoria: '' }));
        }

        const etiquetas = { todo: 'todos los datos', servicios: 'servicios', facturas: 'facturas', ingresos: 'ingresos', categorias: 'categorías' };
        this.app._postGuardado(`borrar ${etiquetas[tipo] || etiquetas.todo}`);
        this.app.historial_mgr.actualizarBotones();
        this.app.toastConDeshacer(toasts[tipo] || toasts.todo);
    }
}
