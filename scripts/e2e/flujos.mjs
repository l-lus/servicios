// Guion de la prueba de humo: siembra datos y recorre menús, modales, altas, búsqueda, orden, calculadora y undo/redo.
export default async (b) => {
    const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dia = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), n));
    const datos = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [{ id: 'f1', monto: 15000, fecha: dia(3), pagada: false, fechaPago: null }, { id: 'f2', monto: 9000, fecha: dia(27), pagada: false, fechaPago: null }] },
        { id: 'gas', nombre: 'Gas', categoria: 'Casa', facturas: [{ id: 'f3', monto: 5000, fecha: dia(10), pagada: true, fechaPago: dia(9) }] },
        { id: 'net', nombre: 'Internet', categoria: '', facturas: [] },
    ];
    await b.eval(`localStorage.clear(); localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('categorias-servicios', '["Casa"]'); true`);
    await b.ir(b.url); await b.sleep(1500);
    const txt = async (sel) => (await b.eval(`(document.querySelector(${JSON.stringify(sel)})?.innerText||'').replace(/\\s+/g,' ').trim()`)).value;
    const click = async (sel) => { const r = await b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NOEXISTE'; e.click(); return 'ok'})()`); await b.sleep(450); if (r.value==='NOEXISTE') console.log('  ! no existe', sel); };
    const esc = async () => { await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`); await b.sleep(450); };
    const abiertos = async () => (await b.eval(`[...document.querySelectorAll('.modal.show,.modal.active,.menu-ajustes.active,.menu-ajustes.show,.menu-agregar.active,.menu-agregar.show')].map(e=>e.id).join(',')`)).value;
    const set = async (id, v) => b.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
    const log = async (t) => console.log(t.padEnd(34), '|', (await txt('#servicios-lista')).slice(0, 220), '|', await abiertos());

    await log('inicio');
    console.log('resumen', await txt('#resumen-mes'));
    // menús y modales
    for (const [paso, sel] of [['perfiles','#header-profile-btn'],['gist','#menu-gist'],['categorias','#menu-categorias'],['ayuda','#btn-ayuda-config'],['ordenar','#btn-sort']]) {
        if (sel !== '#header-profile-btn') { await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); if (sel==='#btn-sort') { await esc(); await esc(); } }
        await click(sel); await log('abrir ' + paso); await esc(); await esc(); await esc(); await log('cerrar ' + paso);
    }
    await click('#btn-info-resumen'); await log('info resumen'); await esc();
    await click('#resumen-toggle'); console.log('toggle resumen', await txt('#resumen-mes'));
    // alta de servicio
    await click('#btn-agregar-servicio'); await click('#menu-agregar-servicio'); await log('modal nuevo servicio');
    await set('servicio-nombre', 'Streaming'); 
    await b.eval(`document.getElementById('form-servicio').requestSubmit(); true`); await b.sleep(700);
    await log('tras crear servicio');
    // alta de factura
    await click('#btn-agregar-servicio'); await click('#menu-agregar-factura'); await log('modal nueva factura');
    await b.eval(`(()=>{const s=document.getElementById('factura-servicio'); s.value=[...s.options].find(o=>o.text==='Streaming')?.value||s.value; s.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
    await set('factura-monto', '2500'); await set('factura-fecha', dia(20));
    await b.eval(`document.getElementById('form-factura').requestSubmit(); true`); await b.sleep(700);
    await log('tras crear factura');
    // abrir servicio y marcar pagada desde menú contextual / lista de facturas
    await b.eval(`[...document.querySelectorAll('#servicios-lista [data-servicio-id]')].find(e=>e.innerText.includes('Streaming'))?.click(); true`); await b.sleep(600);
    console.log('abierto:', await abiertos(), '|', (await txt('#modal-facturas-servicio')).slice(0,160));
    await esc(); await esc();
    // búsqueda
    const idBusq = 'search-input';
    if (idBusq) { await set(idBusq, 'gas'); await b.sleep(500); await log('buscar gas'); await set(idBusq, ''); await b.sleep(500); }
    // orden
    await click('#btn-sort'); await b.eval(`(()=>{const s=document.getElementById('select-orden'); if(s){s.value='monto-desc'; s.dispatchEvent(new Event('change',{bubbles:true}));} return true})()`); await b.sleep(300);
    await click('#btn-cerrar-modal-ordenar'); await log('orden monto-desc');
    // calculadora
    await click('#btn-agregar-servicio'); await click('#menu-agregar-calcular'); await click('#menu-calcular-pendientes'); await log('modo calculadora');
    await b.eval(`document.querySelector('#servicios-lista [data-servicio-id], #servicios-lista .servicio-item')?.click(); true`); await b.sleep(500);
    console.log('calc', await txt('#calculadora-flotante'));
    await click('#btn-agregar-servicio'); await log('salir calculadora');
    // undo / redo
    await click('#btn-undo'); await log('undo'); await click('#btn-redo'); await log('redo');
    // estadísticas
    console.log('estadisticas', (await txt('#estadisticas-content')).slice(0, 260));
    await click('#btn-reporte-estadisticas');
    // exportar: validar armado de respaldo sin descargar
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-limpiar'); await log('submenu limpiar'); await esc(); await esc();
    console.log('localStorage keys:', (await b.eval(`Object.keys(localStorage).sort().join(',')`)).value);
    console.log('datos guardados:', (await b.eval(`JSON.parse(localStorage.getItem('gestion_servicios_datos_default')).map(s=>s.nombre+':'+s.facturas.length).join(',')`)).value);
};
