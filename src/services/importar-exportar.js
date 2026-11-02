import { SecurityAndUtils } from '../core/seguridad.js';
import { plural } from '../core/formato.js';
import { SERVICIO_INGRESOS_ID } from './estado-facturas.js';

// ====================================================================
// IMPORTAR / EXPORTAR — validación, respaldo, fusión y comparación (sin DOM)
// Un solo camino para archivo local y Gist: normalizar → verificar → fusionar/reemplazar.
// ====================================================================
const mismaCategoria = (a, b) => a.toLowerCase() === b.toLowerCase();
const cambioFactura = (a, b) => a.monto !== b.monto || a.fecha !== b.fecha || a.pagada !== b.pagada || a.fechaPago !== b.fechaPago;
const sinIngresos = servicios => servicios.filter(s => s.id !== SERVICIO_INGRESOS_ID);

export const ImportarExportar = {
    // ── Validación y normalización de datos externos ──────────
    // Todo lo que entra desde un archivo o un Gist pasa por acá: valida tipos, formatos y rangos,
    // y reconstruye cada objeto solo con los campos conocidos (descarta propiedades extra en vez de
    // rechazar el archivo, para no romper backups viejos). Lanza Error con un mensaje legible.
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

        const categoriasOk = ImportarExportar.normalizarCategorias(categorias || []);
        if (categoriasOk.length > L.MAX_CATEGORIAS) fallar(`Máximo ${L.MAX_CATEGORIAS} categorías`);
        return { servicios: serviciosOk, categorias: categoriasOk };
    },

    // Categorías: solo strings, saneadas, sin vacías ni duplicadas
    // (sin distinguir mayúsculas).
    normalizarCategorias(categorias) {
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
    },

    // ── Respaldo ──────────────────────────────────────────────
    /** Archivo de exportación: versión de esquema + hash de integridad. */
    async armarRespaldo(servicios, categorias, ahora = new Date(), rango = null) {
        const contenido = { servicios, categorias };
        return {
            version: SecurityAndUtils.SECURITY_LIMITS.SCHEMA_VERSION,
            fecha: ahora.toISOString(),
            hash: await SecurityAndUtils.calcularHashSHA256(contenido),
            // Respaldo parcial: queda fuera del hash (que solo cubre los datos) y sirve para avisar al restaurarlo
            ...(rango ? { rango: { desde: rango.desde || '', hasta: rango.hasta || '' } } : {}),
            ...contenido
        };
    },

    /** Primer y último día de un mes 'YYYY-MM' como fechas ISO. */
    rangoDeMes(mes) {
        const [anio, m] = mes.split('-').map(Number);
        const ultimo = new Date(anio, m, 0).getDate();
        const mm = String(m).padStart(2, '0');
        return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
    },

    /**
     * Copia de los datos con solo las facturas cuya fecha está en [desde, hasta] (ISO, '' = sin límite).
     * Los servicios sin facturas en el rango no se incluyen, y las categorías se limitan a las que usan los servicios incluidos.
     */
    recortarPorRango(servicios, categorias, desde = '', hasta = '') {
        const enRango = f => (!desde || f.fecha >= desde) && (!hasta || f.fecha <= hasta);
        const incluidos = servicios
            .map(s => ({ ...s, facturas: s.facturas.filter(enRango).map(f => ({ ...f })) }))
            .filter(s => s.facturas.length > 0);
        const usadas = new Set(incluidos.map(s => (s.categoria || '').toLowerCase()).filter(Boolean));
        return { servicios: incluidos, categorias: categorias.filter(c => usadas.has(c.toLowerCase())) };
    },

    /** Cantidades de un conjunto de servicios: { servicios, facturas, ingresos } (los ingresos no cuentan como servicio ni como factura). */
    contar(servicios) {
        const normales = sinIngresos(servicios);
        return {
            servicios: normales.length,
            facturas: normales.reduce((a, s) => a + s.facturas.length, 0),
            ingresos: servicios.find(s => s.id === SERVICIO_INGRESOS_ID)?.facturas.length || 0,
        };
    },

    /** Lo que hay en `locales` y no en `remotos`, o sea lo que se pierde al reemplazar: { servicios, facturas, ingresos }. */
    perdidasAlReemplazar(locales, remotos) {
        let servicios = 0, facturas = 0, ingresos = 0;
        locales.forEach(local => {
            const remoto = remotos.find(r => r.id === local.id);
            const esIngresos = local.id === SERVICIO_INGRESOS_ID;
            if (!remoto && !esIngresos) servicios++;
            const idsRemotos = new Set((remoto?.facturas || []).map(f => f.id));
            const perdidas = local.facturas.filter(f => !idsRemotos.has(f.id)).length;
            if (esIngresos) ingresos += perdidas; else facturas += perdidas;
        });
        return { servicios, facturas, ingresos };
    },

    /** true si el respaldo declara una versión de esquema más nueva que la soportada. */
    esVersionMasNueva(datos) {
        const actual = SecurityAndUtils.SECURITY_LIMITS.SCHEMA_VERSION;
        const version = datos.version === '1.0' ? 1 : Number(datos.version);
        return datos.version !== undefined && (!Number.isFinite(version) || version > actual);
    },

    /** true si el hash coincide o no hay hash (versión 1); false si el archivo fue modificado o está dañado. */
    async hashCoincide(datos) {
        if (datos.hash === undefined) return true;
        const hash = await SecurityAndUtils.calcularHashSHA256({ servicios: datos.servicios, categorias: datos.categorias });
        return hash === datos.hash;
    },

    // ── Fusión ────────────────────────────────────────────────
    /** Fusiona `remotos` dentro de `locales` (MUTA `locales`) y cuenta lo agregado/actualizado. */
    fusionarServicios(locales, remotos) {
        let serviciosAgregados = 0, facturasAgregadas = 0, facturasActualizadas = 0, ingresosAgregados = 0;
        remotos.forEach(servicioRemoto => {
            const esIngresos = servicioRemoto.id === SERVICIO_INGRESOS_ID;
            const servicioLocal = locales.find(s => s.id === servicioRemoto.id);
            if (!servicioLocal) {
                locales.push(servicioRemoto);
                if (esIngresos) ingresosAgregados += servicioRemoto.facturas.length;
                else { serviciosAgregados++; facturasAgregadas += servicioRemoto.facturas.length; }
            } else {
                servicioRemoto.facturas.forEach(f => {
                    const idx = servicioLocal.facturas.findIndex(fl => fl.id === f.id);
                    if (idx === -1) {
                        servicioLocal.facturas.push(f);
                        if (esIngresos) ingresosAgregados++; else facturasAgregadas++;
                    } else if (cambioFactura(servicioLocal.facturas[idx], f)) {
                        servicioLocal.facturas[idx] = f;
                        if (!esIngresos) facturasActualizadas++;
                    }
                });
            }
        });
        return { serviciosAgregados, facturasAgregadas, facturasActualizadas, ingresosAgregados };
    },

    /** Lo que cambiaría fusionar `remotos` en `locales`, sin tocar `locales`. */
    simularFusion(locales, remotos) {
        return ImportarExportar.fusionarServicios(JSON.parse(JSON.stringify(locales)), JSON.parse(JSON.stringify(remotos)));
    },

    categoriasNuevas(actuales, remotas) {
        return (remotas || []).filter(c => !actuales.some(ca => mismaCategoria(ca, c)));
    },

    /** Lista de categorías resultante de combinar (ordenada) y cuántas se agregaron. */
    fusionarCategorias(actuales, remotas) {
        const nuevas = ImportarExportar.categoriasNuevas(actuales, Array.isArray(remotas) ? remotas : []);
        if (nuevas.length === 0) return { lista: actuales, agregadas: 0 };
        return { lista: [...actuales, ...nuevas].sort((a, b) => a.localeCompare(b)), agregadas: nuevas.length };
    },

    // ── Textos ────────────────────────────────────────────────
    /** '3 servicios, 10 facturas, 2 ingresos, 1 categoría' (omite lo que es cero). */
    describirContenido(servicios, categorias) {
        const normales = sinIngresos(servicios);
        const facturas = normales.reduce((a, s) => a + s.facturas.length, 0);
        const ingresos = servicios.find(s => s.id === SERVICIO_INGRESOS_ID)?.facturas.length || 0;
        const partes = [plural(normales.length, 'servicio', 'servicios')];
        if (facturas > 0) partes.push(plural(facturas, 'factura', 'facturas'));
        if (ingresos > 0) partes.push(plural(ingresos, 'ingreso', 'ingresos'));
        if (categorias.length > 0) partes.push(plural(categorias.length, 'categoría', 'categorías'));
        return partes.join(', ');
    },

    /** Resume qué haría Combinar y qué haría Reemplazar al aplicar `remotos` sobre `locales`. */
    compararRespaldo(locales, remotos, categoriasActuales, categoriasRemotas) {
        const idsLocales = new Set(locales.map(s => s.id));
        const soloEnRemoto = sinIngresos(remotos).filter(s => !idsLocales.has(s.id));
        const enAmbos = sinIngresos(remotos).filter(s => idsLocales.has(s.id));
        const ingRem = remotos.find(s => s.id === SERVICIO_INGRESOS_ID);
        const ingLoc = locales.find(s => s.id === SERVICIO_INGRESOS_ID);

        let facturasNuevas = 0, facturasConflicto = 0;
        enAmbos.forEach(sRem => {
            const sLoc = locales.find(s => s.id === sRem.id);
            const idsLoc = new Set(sLoc.facturas.map(f => f.id));
            sRem.facturas.forEach(f => {
                if (!idsLoc.has(f.id)) facturasNuevas++;
                else {
                    const fLoc = sLoc.facturas.find(fl => fl.id === f.id);
                    if (fLoc && cambioFactura(fLoc, f)) facturasConflicto++;
                }
            });
        });
        const idsIngLoc = new Set((ingLoc?.facturas || []).map(f => f.id));
        const ingresosNuevos = ingRem ? ingRem.facturas.filter(f => !idsIngLoc.has(f.id)).length : 0;
        const catsNuevas = ImportarExportar.categoriasNuevas(categoriasActuales, categoriasRemotas);
        const facturasEnNuevos = soloEnRemoto.reduce((a, s) => a + s.facturas.length, 0);

        const agregar = [];
        if (soloEnRemoto.length > 0) agregar.push(plural(soloEnRemoto.length, 'servicio nuevo', 'servicios nuevos'));
        if (facturasEnNuevos > 0) agregar.push(plural(facturasEnNuevos, 'factura nueva', 'facturas nuevas'));
        if (facturasNuevas > 0) agregar.push(plural(facturasNuevas, 'factura nueva en servicios existentes', 'facturas nuevas en servicios existentes'));
        if (ingresosNuevos > 0) agregar.push(plural(ingresosNuevos, 'ingreso nuevo', 'ingresos nuevos'));
        if (catsNuevas.length > 0) agregar.push(plural(catsNuevas.length, 'categoría nueva', 'categorías nuevas'));

        const partes = [];
        if (agregar.length > 0) partes.push(`Agrega ${agregar.join(', ')}`);
        if (facturasConflicto > 0) partes.push(facturasConflicto === 1 ? 'Se actualiza 1 factura' : `Se actualizan ${facturasConflicto} facturas`);

        const contenido = ImportarExportar.describirContenido(remotos, categoriasRemotas);
        const hayAlgo = sinIngresos(remotos).length > 0 || categoriasRemotas.length > 0 || !!ingRem?.facturas.length;
        return {
            combinar: partes.length > 0 ? partes.join('. ') : 'No modifica nada',
            reemplazar: hayAlgo ? `Carga ${contenido}` : 'No modifica nada',
        };
    },
};
