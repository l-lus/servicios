// Estadísticas anuales: tipo "Anual", gasto por mes y categoría, cambio de año y persistencia del tipo.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const f = (id, fecha, extra = {}) => ({ id, fecha, monto: 100, pagada: false, fechaPago: null, ...extra });
    const datos = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [f('a','2026-01-10',{monto:12000,pagada:true}), f('b','2026-02-10',{monto:15000,pagada:true}), f('c','2026-03-10',{monto:22000}), f('p','2025-06-01',{monto:9000})] },
        { id: 'net', nombre: 'Internet', categoria: 'Hogar', facturas: [f('d','2026-03-05',{monto:8000}), f('e','2026-07-01',{monto:20,moneda:'usd'})] },
        { id: 'servicio-ingresos-especial', nombre: 'Ingresos', categoria: '', facturas: [f('i','2026-05-01',{monto:500000})] },
    ];
    await b.eval(`localStorage.clear(); localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('categorias-servicios','["Casa","Hogar"]'); localStorage.setItem('ingresos-habilitado','true'); true`);
    await b.ir(b.url); await b.sleep(1300);
    await b.eval(`(()=>{const s=document.getElementById('estadisticas-tipo'); s.value='anual'; s.dispatchEvent(new Event('change',{bubbles:true})); return true})()`); await b.sleep(700);
    console.log('visible anual:', await v(`document.getElementById('estadisticas-anual-container').classList.contains('visible')`), '| mensual oculto:', await v(`document.getElementById('estadisticas-mensual-container').classList.contains('hidden')`), '| botón reporte oculto:', await v(`document.getElementById('btn-reporte-estadisticas').classList.contains('hidden')`));
    console.log('años:', await v(`[...document.querySelectorAll('#select-anio-estadisticas option')].map(o=>o.value).join()`));
    console.log('lista:', await v(`[...document.querySelectorAll('#estadisticas-anual-lista .calculador-resultado-item')].map(i=>i.innerText.replace(/\\s+/g,' ')).join(' | ')`));
    console.log('barras mes:', await v(`[...document.querySelectorAll('.anual-grafico:not(.anual-categorias) .anual-barra')].map(b=>b.style.getPropertyValue('--barra-w')).join(' ')`));
    console.log('categorías:', await v(`[...document.querySelectorAll('.anual-categorias .anual-fila')].map(i=>i.innerText.replace(/\\s+/g,' ')).join(' | ')`));
    await b.eval(`document.getElementById('estadisticas-content').scrollIntoView(); true`); await b.sleep(400);
    await b.shot('/tmp/anual1.png');
    await b.eval(`(()=>{const s=document.getElementById('select-anio-estadisticas'); s.value='2025'; const w=document.getElementById('select-anio-estadisticas-csd'); w._customSelect.select('2025'); return true})()`); await b.sleep(600);
    console.log('año 2025:', await v(`document.getElementById('estadisticas-anual-lista').innerText.replace(/\\s+/g,' ').slice(0,120)`));
    await b.ir(b.url); await b.sleep(1300);
    console.log('tras recargar tipo:', await v(`localStorage.getItem('estadisticas-tipo')`), '| anual visible:', await v(`document.getElementById('estadisticas-anual-container').classList.contains('visible')`));
};
