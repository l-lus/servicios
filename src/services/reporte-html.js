import { html, crudo } from '../core/html.js';
import { parseDate } from '../core/fechas.js';
import { formatearMoneda } from '../core/formato.js';
import { ReporteDatos } from './reporte-datos.js';

// ====================================================================
// REPORTE HTML — documento autocontenido para guardar, imprimir o compartir (sin DOM)
// ====================================================================
export const SECCIONES_MENSUAL = Object.freeze([
    { id: 'resumen', etiqueta: 'Resumen del mes' },
    { id: 'vencen', etiqueta: 'Facturas que vencen en el mes' },
    { id: 'pagadasOtroMes', etiqueta: 'Pagadas este mes (otro vencimiento)' },
    { id: 'categorias', etiqueta: 'Gasto por categoría' },
    { id: 'ingresos', etiqueta: 'Ingresos del mes' },
]);

export const SECCIONES_INDIVIDUAL = Object.freeze([
    { id: 'resumen', etiqueta: 'Resumen' },
    { id: 'detalle', etiqueta: 'Detalle de facturas' },
]);

const fecha = str => (!str ? '—' : parseDate(str).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
const monto = (m, mon) => formatearMoneda(m, mon || 'ars');
const claseEstado = estado => (estado.startsWith('Vencida') ? 'bad' : estado.startsWith('Pagada') ? 'ok' : estado === 'Con crédito' ? 'info' : 'warn');

/** Una celda por moneda con importe: "$ 1.000 · u$s 5" (o "—" si no hay nada). */
function importes(par) {
    const partes = [];
    if (par.ars !== 0) partes.push(monto(par.ars, 'ars'));
    if (par.usd !== 0) partes.push(monto(par.usd, 'usd'));
    return partes.length ? partes.join(' · ') : '—';
}

const tarjeta = (titulo, valor, clase = '') => html`<div class="tarjeta ${clase}"><div class="tarjeta-titulo">${titulo}</div><div class="tarjeta-valor">${valor}</div></div>`;

function seccionResumenMensual(d) {
    const { vencen, pagadas, pendientes } = d.totales;
    const total = vencen.ars + vencen.usd;
    const pct = total > 0 ? Math.round(((pagadas.ars + pagadas.usd) / total) * 100) : 0;
    return html`
<section class="seccion">
    <h2>Resumen del mes</h2>
    <div class="tarjetas">
        ${tarjeta('Total del mes', importes(vencen))}
        ${tarjeta('Pagado', importes(pagadas), 'ok')}
        ${tarjeta('Pendiente', importes(pendientes), 'bad')}
        ${tarjeta('Facturas', String(d.venceEsteMes.length))}
    </div>
    <div class="barra" role="img" aria-label="${pct}% pagado"><div class="barra-relleno" style="width:${pct}%"></div></div>
    <p class="barra-texto">${pct}% del total del mes está pagado</p>
</section>`;
}

function seccionVencen(d) {
    const filas = d.venceEsteMes.map(({ servicio, factura, estado }) => html`
        <tr>
            <td>${servicio.nombre}</td>
            <td>${fecha(factura.fecha)}</td>
            <td class="num">${factura.monto < 0 ? `Saldo a favor ${monto(Math.abs(factura.monto), factura.moneda)}` : monto(factura.monto, factura.moneda)}</td>
            <td><span class="tag tag-${claseEstado(estado)}">${estado}</span></td>
            <td>${factura.pagada && factura.fechaPago ? fecha(factura.fechaPago) : ''}</td>
        </tr>`);
    return html`
<section class="seccion">
    <h2>Facturas que vencen en ${d.nombreMesCorto}</h2>
    <table>
        <thead><tr><th>Servicio</th><th>Vence</th><th class="num">Monto</th><th>Estado</th><th>Pagada el</th></tr></thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="5" class="vacio">Ninguna</td></tr>`}</tbody>
    </table>
</section>`;
}

function seccionPagadasOtroMes(d) {
    const filas = d.pagadasOtroMes.map(({ servicio, factura }) => html`
        <tr>
            <td>${servicio.nombre}</td>
            <td>${fecha(factura.fecha)}</td>
            <td class="num">${monto(factura.monto, factura.moneda)}</td>
            <td>${fecha(factura.fechaPago)}</td>
        </tr>`);
    return html`
<section class="seccion">
    <h2>Pagadas en ${d.nombreMesCorto} (vencían en otro mes)</h2>
    <table>
        <thead><tr><th>Servicio</th><th>Vencimiento</th><th class="num">Monto</th><th>Pagada el</th></tr></thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="4" class="vacio">Ninguna</td></tr>`}</tbody>
    </table>
</section>`;
}

function seccionCategorias(d) {
    const maximo = Math.max(1, ...d.porCategoria.map(c => c.ars + c.usd));
    const filas = d.porCategoria.map(c => html`
        <tr>
            <td>${c.categoria || 'Sin categoría'}</td>
            <td class="num">${c.cantidad}</td>
            <td class="num">${importes({ ars: c.ars, usd: c.usd })}</td>
            <td class="celda-barra"><div class="barra barra-fina"><div class="barra-relleno" style="width:${Math.round(((c.ars + c.usd) / maximo) * 100)}%"></div></div></td>
        </tr>`);
    return html`
<section class="seccion">
    <h2>Gasto por categoría</h2>
    <table>
        <thead><tr><th>Categoría</th><th class="num">Facturas</th><th class="num">Monto</th><th></th></tr></thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="4" class="vacio">Sin facturas</td></tr>`}</tbody>
    </table>
</section>`;
}

function seccionIngresos(d) {
    const filas = d.ingresos.map(({ factura }) => html`
        <tr><td>${factura.tipo || 'regular'}</td><td>${fecha(factura.fecha)}</td><td class="num">${monto(factura.monto, factura.moneda)}</td></tr>`);
    return html`
<section class="seccion">
    <h2>Ingresos del mes</h2>
    <table>
        <thead><tr><th>Tipo</th><th>Fecha</th><th class="num">Monto</th></tr></thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="3" class="vacio">Ninguno</td></tr>`}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">${importes(d.totales.ingresos)}</td></tr></tfoot>
    </table>
</section>`;
}

function seccionResumenIndividual(d) {
    const { total, promedio, pagado, pendiente } = d.totales;
    const variacion = d.analisis.variacionTexto;
    return html`
<section class="seccion">
    <h2>Resumen</h2>
    <div class="tarjetas">
        ${tarjeta('Facturas', String(d.facturas.length))}
        ${tarjeta('Total', importes(total))}
        ${tarjeta('Promedio', importes(promedio))}
        ${variacion != null ? tarjeta('Variación', variacion) : ''}
        ${tarjeta('Pagado', importes(pagado), 'ok')}
        ${tarjeta('Pendiente', importes(pendiente), 'bad')}
    </div>
</section>`;
}

function seccionDetalleIndividual(d) {
    const filas = d.facturas.map(({ factura: f, estado }, i) => html`
        <tr>
            <td class="num">${i + 1}</td>
            <td>${fecha(f.fecha)}</td>
            <td>${f.tipo || 'mensual'}</td>
            <td class="num">${monto(f.monto, f.moneda)}</td>
            <td><span class="tag tag-${claseEstado(estado)}">${estado}</span></td>
            <td>${f.pagada && f.fechaPago ? fecha(f.fechaPago) : ''}</td>
        </tr>`);
    return html`
<section class="seccion">
    <h2>Detalle de facturas</h2>
    <table>
        <thead><tr><th class="num">#</th><th>Vence</th><th>Tipo</th><th class="num">Monto</th><th>Estado</th><th>Pagada el</th></tr></thead>
        <tbody>${filas.length ? filas : html`<tr><td colspan="6" class="vacio">Ninguna en el período</td></tr>`}</tbody>
    </table>
</section>`;
}

const ESTILOS = `
:root { color-scheme: light dark; --fondo:#f6f7f9; --papel:#fff; --texto:#1f2430; --suave:#667085; --linea:#e4e7ec; --ok:#2e8b6b; --bad:#b4513f; --warn:#a9792f; --info:#4c72ac; }
@media (prefers-color-scheme: dark) { :root { --fondo:#131314; --papel:#1e1f20; --texto:#e3e3e3; --suave:#a8a8a8; --linea:#313333; } }
* { box-sizing: border-box; }
body { margin:0; padding:1.5rem; background:var(--fondo); color:var(--texto); font:15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.reporte { max-width:880px; margin:0 auto; background:var(--papel); border:1px solid var(--linea); border-radius:16px; padding:1.75rem; }
.reporte-header { border-bottom:1px solid var(--linea); padding-bottom:1rem; margin-bottom:1rem; }
h1 { margin:0 0 .25rem; font-size:1.5rem; }
h2 { margin:0 0 .75rem; font-size:1.1rem; }
.periodo { font-weight:600; } .generado, .barra-texto, .reporte-footer { color:var(--suave); font-size:.85rem; }
.seccion { margin:1.5rem 0; break-inside:avoid; }
.tarjetas { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:.75rem; }
.tarjeta { border:1px solid var(--linea); border-radius:12px; padding:.75rem .9rem; }
.tarjeta-titulo { color:var(--suave); font-size:.8rem; } .tarjeta-valor { font-size:1.15rem; font-weight:700; }
.tarjeta.ok .tarjeta-valor { color:var(--ok); } .tarjeta.bad .tarjeta-valor { color:var(--bad); }
.barra { height:10px; background:var(--linea); border-radius:999px; overflow:hidden; margin-top:.9rem; }
.barra-fina { height:8px; margin:0; } .barra-relleno { height:100%; background:var(--ok); border-radius:999px; }
table { width:100%; border-collapse:collapse; font-size:.92rem; }
th, td { padding:.45rem .5rem; border-bottom:1px solid var(--linea); text-align:left; vertical-align:middle; }
th { color:var(--suave); font-weight:600; font-size:.8rem; } .num { text-align:right; white-space:nowrap; }
tfoot td { font-weight:700; border-bottom:none; } .vacio { color:var(--suave); text-align:center; }
.celda-barra { width:25%; }
.tag { display:inline-block; padding:.1rem .5rem; border-radius:999px; font-size:.78rem; font-weight:600; border:1px solid currentColor; }
.tag-ok { color:var(--ok); } .tag-bad { color:var(--bad); } .tag-warn { color:var(--warn); } .tag-info { color:var(--info); }
.reporte-footer { margin-top:1.5rem; text-align:center; }
@media print { body { background:#fff; padding:0; } .reporte { border:none; } }
`;

function documento({ titulo, subtitulo, ahora, cuerpo }) {
    const generado = `${ahora.toLocaleDateString('es-AR')} ${ahora.toLocaleTimeString('es-AR')}`;
    return String(html`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${titulo} — ${subtitulo}</title>
<style>${crudo(ESTILOS)}</style>
</head>
<body>
<div class="reporte">
<header class="reporte-header">
    <h1>${titulo}</h1>
    <div class="periodo">${subtitulo}</div>
    <div class="generado">Generado el ${generado}</div>
</header>
${cuerpo}
<footer class="reporte-footer">Generado por Servicios</footer>
</div>
</body>
</html>`);
}

export const ReporteHTML = {
    /** @param {{ servicios: any[], mes: number, anio: number, categoria?: string|null, secciones?: Record<string, boolean>, hoy?: Date, ahora?: Date }} p */
    mensual({ servicios, mes, anio, categoria = null, secciones = {}, hoy = new Date(), ahora = new Date() }) {
        const d = ReporteDatos.mensual({ servicios, mes, anio, categoria, hoy });
        const usa = id => secciones[id] !== false;
        const cuerpo = html`
${usa('resumen') ? seccionResumenMensual(d) : ''}
${usa('vencen') ? seccionVencen(d) : ''}
${usa('pagadasOtroMes') ? seccionPagadasOtroMes(d) : ''}
${usa('categorias') ? seccionCategorias(d) : ''}
${usa('ingresos') ? seccionIngresos(d) : ''}`;
        const subtitulo = `${d.nombreMes}${d.categoria ? ` · Categoría: ${d.categoria}` : ''}`;
        return {
            documento: documento({ titulo: 'Reporte de facturas', subtitulo, ahora, cuerpo }),
            nombreArchivo: `reporte_${d.nombreMes.replace(/\s+/g, '_')}.html`,
        };
    },

    /** @param {{ servicio: any, desde?: string, hasta?: string, secciones?: Record<string, boolean>, hoy?: Date, ahora?: Date }} p */
    individual({ servicio, desde = '', hasta = '', secciones = {}, hoy = new Date(), ahora = new Date() }) {
        const d = ReporteDatos.individual({ servicio, desde, hasta, hoy });
        const usa = id => secciones[id] !== false;
        const cuerpo = html`
${usa('resumen') ? seccionResumenIndividual(d) : ''}
${usa('detalle') ? seccionDetalleIndividual(d) : ''}`;
        const periodo = desde || hasta ? `${fecha(desde)} → ${fecha(hasta)}` : 'Sin filtro de fechas';
        return {
            documento: documento({ titulo: `Reporte de ${servicio.nombre}`, subtitulo: periodo, ahora, cuerpo }),
            nombreArchivo: `reporte_${servicio.nombre.replace(/\s+/g, '_')}_${desde || 'inicio'}_${hasta || 'hoy'}.html`,
        };
    },
};
