// Calendario de vencimientos (diseño y animaciones de Horarios): abrir, círculos por día, detalle, ir a las facturas, deslizamiento entre meses, Hoy, selector de meses y persistencia.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dia = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), n));
    const datos = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [{ id: 'f1', monto: 15000, fecha: dia(3), pagada: false, fechaPago: null }, { id: 'f2', monto: 9000, fecha: dia(20), pagada: false, fechaPago: null }, { id: 'f9', monto: 100, fecha: iso(new Date(hoy.getFullYear(), hoy.getMonth()+1, 5)), pagada: false, fechaPago: null }, { id: 'f8', monto: 100, fecha: iso(new Date(hoy.getFullYear(), hoy.getMonth()-2, 12)), pagada: true, fechaPago: iso(new Date(hoy.getFullYear(), hoy.getMonth()-2, 12)) }] },
        { id: 'gas', nombre: 'Gas', categoria: '', facturas: [{ id: 'f3', monto: 5000, fecha: dia(3), pagada: true, fechaPago: dia(1) }, { id: 'f4', monto: 700, fecha: dia(25), pagada: false, fechaPago: null, moneda: 'usd' }] },
    ];
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('categorias-servicios','["Casa"]'); true`);
    await b.setViewport(1400, 900); await b.ir(b.url); await b.sleep(1500);
    console.log('colapsado al inicio:', await v(`document.getElementById('calendario-content').classList.contains('collapsed')`), '| grilla vacía:', await v(`document.getElementById('calendario-grilla').children.length===0`));
    await click('#calendario-header');
    await b.sleep(200); await b.eval(`document.getElementById('calendario-content').scrollIntoView(); true`); await b.sleep(120); await b.shot('/tmp/cal_entrada1.png'); await b.sleep(900);
    console.log('abierto:', await v(`!document.getElementById('calendario-content').classList.contains('collapsed')`), '| título:', await v(`document.getElementById('calendario-titulo').textContent`), '| días:', await v(`document.querySelectorAll('.calendario-dia:not(.vacio)').length`), '| encabezado:', await v(`[...document.querySelectorAll('.calendario-dia-nombre')].map(d=>d.textContent).join(' ')`));
    console.log('días con facturas:', await v(`[...document.querySelectorAll('.calendario-dia[data-n]')].map(d=>d.querySelector('.calendario-dia-num').textContent+':'+[...d.classList].find(c=>c.startsWith('dia-'))+(d.dataset.n>1?'×'+d.dataset.n:'')).join(' | ')`));
    console.log('hoy:', await v(`document.querySelector('.calendario-dia.hoy .calendario-dia-num')?.textContent`), '(esperado ' + hoy.getDate() + ') | banda semana actual:', await v(`!!document.querySelector('.calendario-semana-actual')`), '| clases de entrada limpiadas:', await v(`document.querySelectorAll('.cal-entrada').length===0`));
    console.log('resumen:', await v(`document.getElementById('calendario-resumen').innerText`));
    await b.shot('/tmp/cal_mes.png');
    await click(`.calendario-dia[data-fecha="${dia(3)}"]`);
    console.log('detalle abierto:', await abierto('modal-calendario-dia'), '|', await v(`document.getElementById('calendario-dia-titulo').textContent`), '|', await v(`[...document.querySelectorAll('.cal-item')].map(i=>i.innerText.replace(/\\s+/g,' ')).join(' ; ')`));
    await click('.cal-item[data-factura="f1"]');
    console.log('abre facturas del servicio:', await abierto('modal-facturas-servicio'), '| detalle cerrado:', !(await abierto('modal-calendario-dia')));
    await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`); await b.sleep(500);
    // deslizamiento entre meses: se captura a mitad de la animación
    await b.eval(`document.getElementById('calendario-siguiente').click(); true`); await b.sleep(150);
    console.log('durante el deslizamiento hay envoltorio:', await v(`!!document.querySelector('#vista-calendario > div[style*="overflow"]')`));
    await b.shot('/tmp/cal_slide.png'); await b.sleep(500);
    console.log('mes siguiente:', await v(`document.getElementById('calendario-titulo').textContent`), '| envoltorio limpiado:', await v(`!document.querySelector('#vista-calendario > div[style*="overflow"]')`), '| resumen:', await v(`document.getElementById('calendario-resumen').innerText`));
    await click('#calendario-hoy');
    console.log('Hoy → ', await v(`document.getElementById('calendario-titulo').textContent`), '| destello:', await v(`!!document.querySelector('.calendario-dia.hoy.campo-flash')`));
    await click(`.calendario-dia[data-fecha="${dia(10)}"]`);
    console.log('día sin facturas no abre nada:', !(await abierto('modal-calendario-dia')));
    // selector de meses
    await click('#calendario-titulo');
    console.log('selector:', await v(`getComputedStyle(document.getElementById('calendario-selector-meses')).display`), '| meses:', await v(`[...document.querySelectorAll('.btn-mes-calendario')].map(b=>b.textContent+(b.classList.contains('activo')?'*':'')).join(', ')`), '| título:', await v(`document.getElementById('calendario-titulo').textContent`));
    await b.shot('/tmp/cal_selector.png');
    await click('.btn-mes-calendario:not(.activo)');
    console.log('elegir otro mes →', await v(`document.getElementById('calendario-titulo').textContent`), '| selector oculto:', await v(`getComputedStyle(document.getElementById('calendario-selector-meses')).display==='none'`));
    console.log('persistencia abierto:', await v(`localStorage.getItem('calendario-abierto')`));
    await b.ir(b.url); await b.sleep(1500);
    console.log('tras recargar abierto:', await v(`!document.getElementById('calendario-content').classList.contains('collapsed')`), '| días:', await v(`document.querySelectorAll('.calendario-dia:not(.vacio)').length`));
};
