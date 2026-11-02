import { preguntarMerge } from './resumen-merge.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { ModalManager } from './gestor-modales.js';

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

    // ── Validación y normalización de datos externos ──────────
    // Todo lo que entra desde un archivo o un Gist pasa por acá: valida
    // tipos, formatos y rangos, y reconstruye cada objeto solo con los
    // campos conocidos (descarta propiedades extra en vez de rechazar el
    // archivo, para no romper backups viejos). Lanza Error con un mensaje
    // legible si algo no es válido.

    // Categorías: solo strings, saneadas, sin vacías ni duplicadas
    // (sin distinguir mayúsculas).

    // Archivo de exportación: versión de esquema + hash de integridad.
    async _construirExportacion() {
        return ImportarExportar.armarRespaldo(this.servicios, this.app.categoria.getCategorias());
    }

    // Verifica versión y hash de un archivo importado. Devuelve false si el
    // usuario decide no continuar.
    async _verificarArchivo(datos) {
        if (ImportarExportar.esVersionMasNueva(datos)) {
            const continuar = await ModalManager.confirmar(
                `El archivo es de una versión más nueva (${SecurityAndUtils.sanitizeString(String(datos.version), 20)}). Puede haber incompatibilidades. ¿Continuar?`,
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
    async exportarDatos({ rango = null } = {}) {
        try {
            let servicios = this.servicios, categorias = this.app.categoria.getCategorias();
            if (rango) ({ servicios, categorias } = ImportarExportar.recortarPorRango(servicios, categorias, rango.desde, rango.hasta));
            const datos = await ImportarExportar.armarRespaldo(servicios, categorias, new Date(), rango);
            const sufijo = !rango ? this.app.utils.obtenerFechaLocal()
                : (rango.desde && rango.hasta ? `${rango.desde}_${rango.hasta}` : (rango.desde ? `desde_${rango.desde}` : `hasta_${rango.hasta}`));
            this.app.utils.descargarBlob(JSON.stringify(datos, null, 2), `servicios_${sufijo}.json`, 'application/json');
            this.app.ui.mostrarToast(rango ? 'Respaldo parcial exportado' : 'Datos exportados correctamente', 'success');
            this.app.ui.cerrarMenuAjustes();
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
            const file = e.target.files[0];
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
                    const crudo = JSON.parse(event.target.result, SecurityAndUtils.reviverJSONSeguro);
                    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
                        throw new Error('Formato de archivo inválido');
                    }
                    if (!(await this._verificarArchivo(crudo))) return;
                    const datos = ImportarExportar.normalizarDatos(crudo.servicios, crudo.categorias);

                    const elegido = await preguntarMerge({
                        origen: file.name,
                        locales: this.servicios, categoriasLocales: this.app.categoria.getCategorias(),
                        remotos: datos.servicios, categoriasRemotas: datos.categorias,
                        modoInicial: modo, rango: crudo.rango && typeof crudo.rango === 'object' ? crudo.rango : null,
                    });
                    if (elegido) this._aplicarImportacion(elegido, datos);
                } catch (error) {
                    console.error('Error al importar:', error);
                    this.app.ui.mostrarToast('Error al importar: ' + error.message, 'error');
                }
            };
            reader.onerror = () => this.app.ui.mostrarToast('Error al leer el archivo', 'error');
            reader.readAsText(file);
        });

        input.click();
        document.getElementById('opciones-importacion').classList.remove('open');
        document.getElementById('menu-importar').classList.remove('open');
        this.app.ui.cerrarMenuAjustes();
    }

    // ── Merge helpers ─────────────────────────────────────────
    _mergeServicios(serviciosRemoto) {
        return ImportarExportar.fusionarServicios(this.servicios, serviciosRemoto);
    }

    _aplicarImportacion(modo, datos) {
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
            this.app.utils.postGuardado('importar (reemplazar)');
            const resumen = ImportarExportar.describirContenido(datos.servicios, cats);
            this.app.ui.mostrarToast(`Restaurados: ${resumen}`, 'success');
        }
    }

    generarResumenComparacion(serviciosRemoto, etiqueta = 'archivo', categoriasRemoto = []) {
        const { combinar, reemplazar } = ImportarExportar.compararRespaldo(
            this.servicios, serviciosRemoto, this.app.categoria.getCategorias(), categoriasRemoto);
        return `<strong>Combinar:</strong> ${combinar}<br><strong>Reemplazar:</strong> ${reemplazar}`;
    }

    mostrarOpcionesImportacion() {
        this.app.utils.toggleSubMenuAjustes('opciones-importacion', 'menu-importar');
    }

    mostrarOpcionesBorrar() {
        this.app.utils.toggleSubMenuAjustes('opciones-borrar', 'menu-limpiar');
    }

    toggleMenuDolar() {
        this.app.utils.toggleSubMenuAjustes('opciones-dolar', 'menu-dolar');
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
        document.getElementById('opciones-borrar').classList.remove('open');
        document.getElementById('menu-limpiar').classList.remove('open');
        this.app.ui.cerrarMenuAjustes();
    }
}
