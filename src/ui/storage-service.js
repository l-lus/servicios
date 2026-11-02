import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { SecurityAndUtils } from '../core/seguridad.js';
import { ModalManager } from './gestor-modales.js';

// ============================================================
// STORAGE SERVICE — persistencia, validación, import/export
// ============================================================
export class StorageService {
    constructor(app) {
        this.app = app;
    }

    // ── Getters de conveniencia ───────────────────────────────
    get servicios() { return this.app.servicios; }
    set servicios(v) { this.app.servicios = v; }
    get perfilActivo() { return this.app.perfilActivo; }
    get INGRESOS_ID() { return this.app.SERVICIO_INGRESOS_ID; }

    // ── Carga / guardado por perfil ───────────────────────────
    cargarDatosPerfilActivo() {
        try {
            const key = STORAGE_KEYS.DATOS_PERFIL(this.perfilActivo);
            this.servicios = StorageHelper.getObject(key, []);
            this.app.inicializarHistorial();
        } catch (error) {
            console.error('Error al cargar datos del perfil:', error);
            this.servicios = [];
            this.app.inicializarHistorial();
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
    normalizarDatos(servicios, categorias = []) {
        const L = SecurityAndUtils.SECURITY_LIMITS;
        const R = SecurityAndUtils.REGEX_PATTERNS;
        const TIPOS = ['mensual', 'bimestral', 'semestral', 'anual', 'regular', 'complementario', 'transferencia'];
        const MONEDAS = ['ars', 'usd'];
        const esObjeto = o => o !== null && typeof o === 'object' && !Array.isArray(o);
        const fallar = msg => { throw new Error(msg); };
        const textoOpcional = (v, max, donde) => {
            if (v === undefined || v === null || v === '') return '';
            if (typeof v !== 'string' || v.length > max) fallar(`${donde} inválido`);
            return v;
        };

        if (!Array.isArray(servicios)) fallar('Formato inválido: falta "servicios"');
        if (categorias !== undefined && categorias !== null && !Array.isArray(categorias)) fallar('Formato inválido: "categorias" no es una lista');

        const idsServicios = new Set();
        const serviciosOk = servicios.map((s, i) => {
            const donde = `servicio ${i + 1}`;
            if (!esObjeto(s)) fallar(`${donde}: formato inválido`);
            if (typeof s.id !== 'string' || !R.ID.test(s.id)) fallar(`${donde}: id inválido`);
            if (idsServicios.has(s.id)) fallar(`${donde}: id duplicado`);
            idsServicios.add(s.id);
            if (typeof s.nombre !== 'string' || !s.nombre.trim() || s.nombre.length > L.MAX_NOMBRE_LENGTH) fallar(`${donde}: nombre inválido`);
            if (!Array.isArray(s.facturas)) fallar(`${donde}: facturas no es una lista`);

            const idsFacturas = new Set();
            const facturas = s.facturas.map((f, j) => {
                const dondeF = `factura ${j + 1} de "${s.nombre}"`;
                if (!esObjeto(f)) fallar(`${dondeF}: formato inválido`);
                if (typeof f.id !== 'string' || !R.ID.test(f.id)) fallar(`${dondeF}: id inválido`);
                if (idsFacturas.has(f.id)) fallar(`${dondeF}: id duplicado`);
                idsFacturas.add(f.id);
                if (typeof f.monto !== 'number' || !Number.isFinite(f.monto) || Math.abs(f.monto) > L.MAX_MONTO) fallar(`${dondeF}: monto inválido`);
                if (typeof f.fecha !== 'string' || !R.FECHA.test(f.fecha)) fallar(`${dondeF}: fecha inválida`);
                if (typeof f.pagada !== 'boolean') fallar(`${dondeF}: estado de pago inválido`);
                if (f.fechaPago != null && (typeof f.fechaPago !== 'string' || !R.FECHA.test(f.fechaPago))) fallar(`${dondeF}: fecha de pago inválida`);
                if (f.tipo !== undefined && !TIPOS.includes(f.tipo)) fallar(`${dondeF}: tipo inválido`);
                if (f.moneda !== undefined && f.moneda !== null && !MONEDAS.includes(f.moneda)) fallar(`${dondeF}: moneda inválida`);
                if (f.conCredito !== undefined && typeof f.conCredito !== 'boolean') fallar(`${dondeF}: crédito inválido`);

                const limpia = { id: f.id, monto: f.monto, fecha: f.fecha, pagada: f.pagada, fechaPago: f.fechaPago ?? null };
                if (f.tipo !== undefined) limpia.tipo = f.tipo;
                if (f.moneda) limpia.moneda = f.moneda;
                if (f.conCredito !== undefined) limpia.conCredito = f.conCredito;
                return limpia;
            });

            const limpio = { id: s.id, nombre: s.nombre, categoria: textoOpcional(s.categoria, L.MAX_NOMBRE_LENGTH, `${donde}: categoría`), facturas };
            if (s.activo !== undefined) {
                if (typeof s.activo !== 'boolean') fallar(`${donde}: activo inválido`);
                limpio.activo = s.activo;
            }
            return limpio;
        });

        const categoriasOk = this._normalizarCategorias(categorias || []);
        if (categoriasOk.length > L.MAX_CATEGORIAS) fallar(`Máximo ${L.MAX_CATEGORIAS} categorías`);
        return { servicios: serviciosOk, categorias: categoriasOk };
    }

    // Categorías: solo strings, saneadas, sin vacías ni duplicadas
    // (sin distinguir mayúsculas).
    _normalizarCategorias(categorias) {
        const L = SecurityAndUtils.SECURITY_LIMITS;
        const vistas = new Set();
        return categorias
            .filter(c => typeof c === 'string')
            .map(c => SecurityAndUtils.sanitizeString(c, L.MAX_NOMBRE_LENGTH))
            .filter(c => {
                const clave = c.toLowerCase();
                if (!c || vistas.has(clave)) return false;
                vistas.add(clave);
                return true;
            });
    }

    // Archivo de exportación: versión de esquema + hash de integridad.
    async _construirExportacion() {
        const contenido = { servicios: this.servicios, categorias: this.app.categoria.getCategorias() };
        return {
            version: SecurityAndUtils.SECURITY_LIMITS.SCHEMA_VERSION,
            fecha: new Date().toISOString(),
            hash: await SecurityAndUtils.calcularHashSHA256(contenido),
            ...contenido
        };
    }

    // Verifica versión y hash de un archivo importado. Devuelve false si el
    // usuario decide no continuar.
    async _verificarArchivo(datos) {
        const actual = SecurityAndUtils.SECURITY_LIMITS.SCHEMA_VERSION;
        const version = datos.version === '1.0' ? 1 : Number(datos.version);
        if (datos.version !== undefined && (!Number.isFinite(version) || version > actual)) {
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
        if (datos.hash === undefined) return true;
        const hash = await SecurityAndUtils.calcularHashSHA256({ servicios: datos.servicios, categorias: datos.categorias });
        if (hash === datos.hash) return true;
        this.app.ui.mostrarToast(`${origen} fue modificado o está dañado (la verificación de integridad no coincide). Revisá los datos importados`, 'warning', 6000);
        return false;
    }

    // ── Exportar ──────────────────────────────────────────────
    async exportarDatos() {
        try {
            const datos = await this._construirExportacion();
            this.app.utils.descargarBlob(
                JSON.stringify(datos, null, 2),
                `servicios_${this.app.utils.obtenerFechaLocal()}.json`,
                'application/json'
            );
            this.app.ui.mostrarToast('Datos exportados correctamente', 'success');
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
                    const datos = this.normalizarDatos(crudo.servicios, crudo.categorias);
                    const cantidad = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).length;
                    const facturas = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).reduce((a, s) => a + s.facturas.length, 0);
                    const ingresos = datos.servicios.find(s => s.id === this.INGRESOS_ID)?.facturas.length || 0;

                    if (modo === 'combinar') {
                        this._aplicarImportacion('combinar', datos);
                    } else {
                        const cats = datos.categorias;
                        const partes = [this.app.utils.plural(cantidad, 'servicio', 'servicios')];
                        if (facturas > 0) partes.push(this.app.utils.plural(facturas, 'factura', 'facturas'));
                        if (ingresos > 0) partes.push(this.app.utils.plural(ingresos, 'ingreso', 'ingresos'));
                        if (cats.length > 0) partes.push(this.app.utils.plural(cats.length, 'categoría', 'categorías'));
                        const reemplazar = await ModalManager.confirmar(
                            `Se restaurarán ${partes.join(', ')}. ¿Deseas reemplazar todos los datos actuales?`,
                            'Reemplazar',
                            '#icon-upload',
                            { titulo: 'Reemplazar datos' }
                        );
                        if (reemplazar) {
                            this._aplicarImportacion('reemplazar', datos);
                        }
                    }
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
        let serviciosAgregados = 0, facturasAgregadas = 0, facturasActualizadas = 0, ingresosAgregados = 0;
        serviciosRemoto.forEach(servicioRemoto => {
            const esIngresos = servicioRemoto.id === this.INGRESOS_ID;
            const servicioLocal = this.servicios.find(s => s.id === servicioRemoto.id);
            if (!servicioLocal) {
                this.servicios.push(servicioRemoto);
                esIngresos ? ingresosAgregados += servicioRemoto.facturas.length
                    : (serviciosAgregados++, facturasAgregadas += servicioRemoto.facturas.length);
            } else {
                servicioRemoto.facturas.forEach(f => {
                    const idx = servicioLocal.facturas.findIndex(fl => fl.id === f.id);
                    if (idx === -1) {
                        servicioLocal.facturas.push(f);
                        esIngresos ? ingresosAgregados++ : facturasAgregadas++;
                    } else {
                        const fe = servicioLocal.facturas[idx];
                        if (fe.monto !== f.monto || fe.fecha !== f.fecha || fe.pagada !== f.pagada || fe.fechaPago !== f.fechaPago) {
                            servicioLocal.facturas[idx] = f;
                            if (!esIngresos) facturasActualizadas++;
                        }
                    }
                });
            }
        });
        return { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados };
    }

    _aplicarImportacion(modo, datos) {
        const cats = Array.isArray(datos.categorias) ? datos.categorias : [];
        if (modo === 'combinar') {
            const { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados } = this._mergeServicios(datos.servicios);
            const categoriasAgregadas = this.app._mergeCategorias(datos.categorias);
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
            const cantidad = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).length;
            const facturas = datos.servicios.filter(s => s.id !== this.INGRESOS_ID).reduce((a, s) => a + s.facturas.length, 0);
            const ingresos = datos.servicios.find(s => s.id === this.INGRESOS_ID)?.facturas.length || 0;
            const partes = [this.app.utils.plural(cantidad, 'servicio', 'servicios')];
            if (facturas > 0) partes.push(this.app.utils.plural(facturas, 'factura', 'facturas'));
            if (ingresos > 0) partes.push(this.app.utils.plural(ingresos, 'ingreso', 'ingresos'));
            if (cats.length > 0) partes.push(this.app.utils.plural(cats.length, 'categoría', 'categorías'));
            this.app.ui.mostrarToast(`Restaurados: ${partes.join(', ')}`, 'success');
        }
    }

    generarResumenComparacion(serviciosRemoto, etiqueta = 'archivo', categoriasRemoto = []) {
        const idsLocales = new Set(this.servicios.map(s => s.id));
        const soloEnRemoto = serviciosRemoto.filter(s => !idsLocales.has(s.id) && s.id !== this.INGRESOS_ID);
        const enAmbos = serviciosRemoto.filter(s => idsLocales.has(s.id) && s.id !== this.INGRESOS_ID);
        const sIngRem = serviciosRemoto.find(s => s.id === this.INGRESOS_ID);
        const sIngLoc = this.servicios.find(s => s.id === this.INGRESOS_ID);

        let facturasNuevas = 0, facturasConflicto = 0, ingresosNuevos = 0;
        enAmbos.forEach(sRem => {
            const sLoc = this.servicios.find(s => s.id === sRem.id);
            if (!sLoc) return;
            const idsLoc = new Set(sLoc.facturas.map(f => f.id));
            sRem.facturas.forEach(f => {
                if (!idsLoc.has(f.id)) { facturasNuevas++; }
                else {
                    const fLoc = sLoc.facturas.find(fl => fl.id === f.id);
                    if (fLoc && (fLoc.monto !== f.monto || fLoc.fecha !== f.fecha || fLoc.pagada !== f.pagada || fLoc.fechaPago !== f.fechaPago)) facturasConflicto++;
                }
            });
        });
        if (sIngRem) {
            const idsIngLoc = new Set((sIngLoc?.facturas || []).map(f => f.id));
            ingresosNuevos = sIngRem.facturas.filter(f => !idsIngLoc.has(f.id)).length;
        }

        const totalServRem = serviciosRemoto.filter(s => s.id !== this.INGRESOS_ID).length;
        const totalFactRem = serviciosRemoto.filter(s => s.id !== this.INGRESOS_ID).reduce((a, s) => a + s.facturas.length, 0);
        const totalIngRem = sIngRem?.facturas.length || 0;
        const catsActuales = this.app.categoria.getCategorias();
        const catsNuevas = categoriasRemoto.filter(c => !catsActuales.some(ca => ca.toLowerCase() === c.toLowerCase()));

        const facturasEnNuevos = soloEnRemoto.reduce((a, s) => a + s.facturas.length, 0);
        const partesAgregar = [];
        if (soloEnRemoto.length > 0) partesAgregar.push(this.app.utils.plural(soloEnRemoto.length, 'servicio nuevo', 'servicios nuevos'));
        if (facturasEnNuevos > 0) partesAgregar.push(this.app.utils.plural(facturasEnNuevos, 'factura nueva', 'facturas nuevas'));
        if (facturasNuevas > 0) partesAgregar.push(this.app.utils.plural(facturasNuevas, 'factura nueva en servicios existentes', 'facturas nuevas en servicios existentes'));
        if (ingresosNuevos > 0) partesAgregar.push(this.app.utils.plural(ingresosNuevos, 'ingreso nuevo', 'ingresos nuevos'));
        if (catsNuevas.length > 0) partesAgregar.push(this.app.utils.plural(catsNuevas.length, 'categoría nueva', 'categorías nuevas'));

        const partes = [];
        if (partesAgregar.length > 0) partes.push(`Agrega ${partesAgregar.join(', ')}`);
        if (facturasConflicto > 0) partes.push(facturasConflicto === 1 ? 'Se actualiza 1 factura' : `Se actualizan ${facturasConflicto} facturas`);
        const textoCombinar = partes.length > 0 ? partes.join('. ') : 'No modifica nada';

        const partesReempl = [];
        if (totalServRem > 0) partesReempl.push(this.app.utils.plural(totalServRem, 'servicio', 'servicios'));
        if (totalFactRem > 0) partesReempl.push(this.app.utils.plural(totalFactRem, 'factura', 'facturas'));
        if (totalIngRem > 0) partesReempl.push(this.app.utils.plural(totalIngRem, 'ingreso', 'ingresos'));
        if (categoriasRemoto.length > 0) partesReempl.push(this.app.utils.plural(categoriasRemoto.length, 'categoría', 'categorías'));
        const textoReemplazar = partesReempl.length > 0 ? `Carga ${partesReempl.join(', ')}` : 'No modifica nada';

        return `<strong>Combinar:</strong> ${textoCombinar}<br><strong>Reemplazar:</strong> ${textoReemplazar}`;
    }
}
