// Respaldo por rango y resumen previo al merge: exporta un rango, restaura combinando y reemplazando (archivo simulado), cancela con Escape.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const set = async (id, val) => b.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)}); e.value=${JSON.stringify(val)}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    const f = (id, fecha, extra = {}) => ({ id, fecha, monto: 100, pagada: false, fechaPago: null, ...extra });
    const locales = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [f('a', '2026-10-05'), f('b', '2026-11-05')] },
        { id: 'gas', nombre: 'Gas', categoria: '', facturas: [f('c', '2026-11-12')] },
        { id: 'solo-local', nombre: 'Solo local', categoria: '', facturas: [f('d', '2026-09-01')] },
    ];
    await b.eval(`localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(locales))}); localStorage.setItem('categorias-servicios','["Casa"]'); true`);
    await b.ir(b.url); await b.sleep(1300);

    // ---- respaldo por rango
    await b.eval(`window.__blobs=[]; const o=URL.createObjectURL.bind(URL); URL.createObjectURL=(bl)=>{window.__blobs.push(bl); return o(bl)}; HTMLAnchorElement.prototype.click=function(){}; true`);
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-exportar');
    console.log('modal respaldo abierto:', await abierto('modal-respaldo'), '|', await v(`document.getElementById('respaldo-contenido').textContent`));
    await click('.respaldo-tipo[data-tipo="mes"]'); await set('respaldo-mes', '2026-11');
    console.log('mes 2026-11:', await v(`document.getElementById('respaldo-contenido').textContent`), '| campos mes visibles:', await v(`!document.getElementById('respaldo-campos-mes').hidden`));
    await set('respaldo-mes', '2020-01');
    console.log('mes sin datos:', await v(`document.getElementById('respaldo-contenido').textContent`), '| exportar deshabilitado:', await v(`document.getElementById('btn-respaldo-exportar').disabled`));
    await click('.respaldo-tipo[data-tipo="rango"]'); await set('respaldo-desde', '2026-11-10'); await set('respaldo-hasta', '2026-11-01');
    console.log('rango invertido:', await v(`document.getElementById('respaldo-contenido').textContent`));
    await set('respaldo-hasta', '2026-11-30');
    console.log('rango 10–30 nov:', await v(`document.getElementById('respaldo-contenido').textContent`));
    await click('#btn-respaldo-exportar'); await b.sleep(500);
    const txt = await v(`window.__blobs.at(-1).text()`);
    const j = JSON.parse(txt);
    console.log('exportado:', JSON.stringify({ rango: j.rango, servicios: j.servicios.map(s => s.id + ':' + s.facturas.map(x => x.id)), cats: j.categorias, hash: !!j.hash }), '| modal cerrado:', !(await abierto('modal-respaldo')));

    // ---- restaurar con resumen previo
    await b.eval(`window.__inputs=[]; HTMLInputElement.prototype.click=function(){ if(this.type==='file') window.__inputs.push(this); }; true`);
    const remoto = { version: 2, rango: { desde: '2026-11-10', hasta: '2026-11-30' }, ...(await (async () => { return {}; })()) };
    const remotoServicios = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [f('a', '2026-10-05', { monto: 999 }), f('n', '2026-12-01')] },
        { id: 'agua', nombre: 'Agua', categoria: 'Nueva', facturas: [f('w', '2026-11-20')] },
    ];
    const archivo = { version: 2, rango: remoto.rango, servicios: remotoServicios, categorias: ['Casa', 'Nueva'] };
    const subir = async () => {
        await b.eval(`(()=>{ const inp=window.__inputs.at(-1); const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(archivo))}], 'respaldo.json', {type:'application/json'})); inp.files=dt.files; inp.dispatchEvent(new Event('change')); return true })()`);
        await b.sleep(900);
    };
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-importar'); await subir();
    console.log('resumen abierto:', await abierto('modal-resumen-merge'));
    console.log('origen:', await v(`document.getElementById('merge-origen').textContent`));
    console.log('aviso parcial:', await v(`document.getElementById('merge-aviso-parcial').hidden`), await v(`document.getElementById('merge-aviso-parcial').textContent`));
    console.log('combinar:', await v(`document.getElementById('merge-texto-combinar').textContent`), '→', await v(`document.getElementById('merge-queda-combinar').textContent`));
    console.log('reemplazar:', await v(`document.getElementById('merge-texto-reemplazar').textContent`), '→', await v(`document.getElementById('merge-queda-reemplazar').textContent`));
    console.log('seleccionada:', await v(`document.querySelector('.merge-opcion[aria-pressed=true]').dataset.modo`), '| botón:', await v(`document.getElementById('btn-resumen-merge-aplicar').textContent`), '| alerta oculta:', await v(`document.getElementById('merge-alerta').hidden`));
    await click('.merge-opcion[data-modo="reemplazar"]');
    console.log('al elegir reemplazar → botón:', await v(`document.getElementById('btn-resumen-merge-aplicar').textContent`), '| alerta:', await v(`document.getElementById('merge-alerta').textContent`));
    await b.shot('/tmp/merge1.png');
    await click('#btn-resumen-merge-cancelar');
    console.log('cancelar → datos intactos:', await v(`JSON.parse(localStorage.getItem('gestion_servicios_datos_default')).map(s=>s.id).join()`), '| modal cerrado:', !(await abierto('modal-resumen-merge')));
    // combinar
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-importar'); await subir();
    await click('#btn-resumen-merge-aplicar'); await b.sleep(400);
    console.log('tras combinar:', await v(`JSON.parse(localStorage.getItem('gestion_servicios_datos_default')).map(s=>s.id+':'+s.facturas.map(x=>x.id+'/'+x.monto)).join(' ')`));
    // reemplazar
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-importar'); await subir();
    console.log('modo inicial:', await v(`document.querySelector('.merge-opcion[aria-pressed=true]').dataset.modo`));
    await click('.merge-opcion[data-modo="reemplazar"]');
    await click('#btn-resumen-merge-aplicar'); await b.sleep(400);
    console.log('tras reemplazar:', await v(`JSON.parse(localStorage.getItem('gestion_servicios_datos_default')).map(s=>s.id).join()`), '| cats:', await v(`localStorage.getItem('categorias-servicios')`));
    // Escape cancela
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-importar'); await subir();
    await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`); await b.sleep(500);
    console.log('Escape cierra:', !(await abierto('modal-resumen-merge')));
};
