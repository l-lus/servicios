// Calendario de vencimientos: abrir, colores por día, detalle, ir a las facturas, navegar meses y persistencia.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dia = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), n));
    const datos = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [{ id: 'f1', monto: 15000, fecha: dia(3), pagada: false, fechaPago: null }, { id: 'f2', monto: 9000, fecha: dia(20), pagada: false, fechaPago: null }, { id: 'f9', monto: 100, fecha: iso(new Date(hoy.getFullYear(), hoy.getMonth()+1, 5)), pagada: false, fechaPago: null }] },
        { id: 'gas', nombre: 'Gas', categoria: '', facturas: [{ id: 'f3', monto: 5000, fecha: dia(3), pagada: true, fechaPago: dia(1) }, { id: 'f4', monto: 700, fecha: dia(25), pagada: false, fechaPago: null, moneda: 'usd' }] },
    ];
    await b.eval(`localStorage.clear(); localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('categorias-servicios','["Casa"]'); true`);
    await b.ir(b.url); await b.sleep(1300);
    console.log('colapsado al inicio:', await v(`document.getElementById('calendario-content').classList.contains('collapsed')`), '| grilla vacía:', await v(`document.getElementById('calendario-grilla').children.length===0`));
    await click('#calendario-header');
    console.log('abierto:', await v(`!document.getElementById('calendario-content').classList.contains('collapsed')`), '| título:', await v(`document.getElementById('calendario-titulo').textContent`), '| días:', await v(`document.querySelectorAll('.cal-dia').length`));
    console.log('clases por día:', await v(`[...document.querySelectorAll('.cal-dia')].filter(d=>/cal-dia--(?!hoy)/.test(d.className)).map(d=>d.querySelector('.cal-dia-numero').textContent+':'+d.className.replace(/cal-dia( cal-dia--hoy)?/,'').trim()).join(' | ')`));
    console.log('hoy marcado:', await v(`document.querySelector('.cal-dia--hoy .cal-dia-numero')?.textContent`), '(esperado ' + hoy.getDate() + ')');
    console.log('resumen:', await v(`document.getElementById('calendario-resumen').innerText`));
    await b.eval(`document.getElementById('calendario-content').scrollIntoView(); true`); await b.sleep(400);
    await b.shot('/tmp/cal1.png');
    await click(`.cal-dia[data-fecha="${dia(3)}"]`);
    console.log('detalle abierto:', await abierto('modal-calendario-dia'), '|', await v(`document.getElementById('calendario-dia-titulo').textContent`), '|', await v(`[...document.querySelectorAll('.cal-item')].map(i=>i.innerText.replace(/\\s+/g,' ')).join(' ; ')`));
    await b.shot('/tmp/cal2.png');
    await click('.cal-item[data-factura="f1"]');
    console.log('abre facturas del servicio:', await abierto('modal-facturas-servicio'), '| detalle cerrado:', !(await abierto('modal-calendario-dia')), '|', await v(`document.getElementById('modal-facturas-titulo').textContent`));
    await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`); await b.sleep(500);
    await click('#calendario-siguiente');
    console.log('mes siguiente:', await v(`document.getElementById('calendario-titulo').textContent`), '| resumen:', await v(`document.getElementById('calendario-resumen').innerText`));
    await click('#calendario-titulo');
    console.log('volver a hoy:', await v(`document.getElementById('calendario-titulo').textContent`));
    await click(`.cal-dia[data-fecha="${dia(10)}"]`);
    console.log('día sin facturas:', await v(`document.getElementById('calendario-dia-lista').innerText`));
    await click('#modal-calendario-dia-close');
    // se actualiza al cambiar datos
    await b.eval(`document.querySelector('#servicios-lista [data-id="luz"]')?.click(); true`); await b.sleep(500);
    console.log('persistencia abierto:', await v(`localStorage.getItem('calendario-abierto')`));
    await b.ir(b.url); await b.sleep(1200);
    console.log('tras recargar abierto:', await v(`!document.getElementById('calendario-content').classList.contains('collapsed')`), '| días:', await v(`document.querySelectorAll('.cal-dia').length`));
};
