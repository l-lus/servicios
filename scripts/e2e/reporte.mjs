// Reporte: abre el modal, genera HTML (con secciones elegidas) y texto, valida errores sin secciones o sin servicio.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dia = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), n));
    const datos = [
        { id: 'luz', nombre: 'Luz <b>x</b>', categoria: 'Casa', facturas: [{ id: 'f1', monto: 15000, fecha: dia(3), pagada: false, fechaPago: null }, { id: 'f2', monto: 9000, fecha: dia(27), pagada: true, fechaPago: dia(1) }] },
        { id: 'gas', nombre: 'Gas', categoria: '', facturas: [{ id: 'f3', monto: 5000, fecha: dia(10), pagada: true, fechaPago: dia(9) }] },
    ];
    await b.eval(`localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('categorias-servicios','["Casa"]'); true`);
    await b.ir(b.url); await b.sleep(1300);
    await b.eval(`window.__blobs=[]; const o=URL.createObjectURL.bind(URL); URL.createObjectURL=(bl)=>{window.__blobs.push(bl); return o(bl)}; HTMLAnchorElement.prototype.click=function(){window.__ultimoNombre=this.download}; true`);
    // el contenido de estadísticas está colapsado por defecto en algunos estados: se expande si hace falta
    await click('#btn-reporte-estadisticas');
    console.log('modal abierto:', await abierto('modal-reporte'), '|', await v(`document.getElementById('reporte-contexto').textContent`));
    console.log('secciones:', await v(`[...document.querySelectorAll('.reporte-seccion')].map(s=>s.dataset.seccion).join()`));
    await click('.reporte-seccion[data-seccion="categorias"]');
    await b.shot('/tmp/reporte1.png');
    await click('#btn-reporte-generar'); await b.sleep(400);
    let html = await v(`window.__blobs.at(-1).text()`);
    console.log('html →', await v(`window.__ultimoNombre`), '| bytes', html.length, '| tiene <script> literal:', /<script>/.test(html), '| categorias omitida:', !/Gasto por categoría/.test(html), '| vencen:', /Facturas que vencen/.test(html), '| modal cerrado:', !(await abierto('modal-reporte')));
    await b.eval(`window.__reporteHtml=${JSON.stringify(html)}; true`);
    await click('#btn-reporte-estadisticas'); await click('.reporte-formato[data-formato="texto"]');
    console.log('secciones ocultas en texto:', await v(`document.getElementById('reporte-secciones').hidden`));
    await click('#btn-reporte-generar'); await b.sleep(400);
    const txt = await v(`window.__blobs.at(-1).text()`);
    console.log('texto →', await v(`window.__ultimoNombre`), '|', txt.split('\n').slice(0,3).join(' / ').trim());
    // desmarcar todo en HTML → error
    await click('#btn-reporte-estadisticas'); await click('.reporte-formato[data-formato="html"]');
    for (const s of await v(`[...document.querySelectorAll('.reporte-seccion')].map(s=>s.dataset.seccion)`).then(()=>['resumen','vencen','pagadasOtroMes','categorias'])) await click(`.reporte-seccion[data-seccion="${s}"]`);
    await click('#btn-reporte-generar');
    console.log('sin secciones → sigue abierto:', await abierto('modal-reporte'), '| aviso:', await v(`document.getElementById('toast').innerText`));
    await click('#btn-reporte-cancelar');
    // individual
    await b.eval(`(()=>{const s=document.getElementById('estadisticas-tipo'); s.value='individual'; s.dispatchEvent(new Event('change',{bubbles:true})); return true})()`); await b.sleep(500);
    await click('#btn-reporte-estadisticas');
    console.log('individual sin servicio → modal abierto:', await abierto('modal-reporte'), '| aviso:', await v(`document.getElementById('toast').innerText`));
    // guardar el HTML para verlo
    return;
};
