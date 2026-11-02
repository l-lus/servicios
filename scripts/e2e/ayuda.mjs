// Prueba de la ayuda: abre el modal, busca (sin acentos), recorre coincidencias con Enter y limpia con Escape.
export default async (b) => {
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const v = async (e) => (await b.eval(e)).value;
    await click('#btn-ajustes'); await click('#menu-ayuda');
    console.log('abierto:', await v(`document.getElementById('modal-ayuda').classList.contains('show')||document.getElementById('modal-ayuda').classList.contains('active')`));
    console.log('secciones visibles:', await v(`[...document.querySelectorAll('.ayuda-seccion')].filter(s=>!s.hidden).length`));
    await b.eval(`(()=>{const i=document.getElementById('ayuda-buscar'); i.value='VARIACIÓN'; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`); await b.sleep(500);
    console.log('tras buscar VARIACIÓN → visibles:', await v(`[...document.querySelectorAll('.ayuda-seccion')].filter(s=>!s.hidden).map(s=>s.id).join()`), '| marcas:', await v(`document.querySelectorAll('mark.ayuda-resaltado').length`), '|', await v(`document.getElementById('ayuda-resultados').textContent`));
    await b.eval(`document.getElementById('ayuda-buscar').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); true`); await b.sleep(300);
    console.log('tras Enter:', await v(`document.getElementById('ayuda-resultados').textContent`));
    await b.shot('/tmp/ayuda1.png');
    await b.eval(`document.getElementById('ayuda-buscar').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); true`); await b.sleep(300);
    console.log('tras Escape: input=', JSON.stringify(await v(`document.getElementById('ayuda-buscar').value`)), 'visibles:', await v(`[...document.querySelectorAll('.ayuda-seccion')].filter(s=>!s.hidden).length`), 'modal abierto:', await v(`document.getElementById('modal-ayuda').classList.contains('show')||document.getElementById('modal-ayuda').classList.contains('active')`));
    await b.eval(`(()=>{const i=document.getElementById('ayuda-buscar'); i.value='zzzz'; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`); await b.sleep(400);
    console.log('sin resultados visible:', await v(`!document.getElementById('ayuda-sin-resultados').hidden`));
    await click('#modal-ayuda-close');
    console.log('cerrado:', !(await v(`document.getElementById('modal-ayuda').classList.contains('show')||document.getElementById('modal-ayuda').classList.contains('active')`)));
    // búsqueda sin acentos en la lista
    await b.eval(`localStorage.setItem('gestion_servicios_datos_default', JSON.stringify([{id:'t',nombre:'Teléfono',categoria:'',facturas:[]},{id:'g',nombre:'Gas',categoria:'',facturas:[]}])); true`);
    await b.ir(b.url); await b.sleep(1200);
    await b.eval(`(()=>{const i=document.getElementById('search-input'); i.value='TELEFONO'; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`); await b.sleep(700);
    console.log('lista con "TELEFONO":', await v(`document.getElementById('servicios-lista').innerText.replace(/\\s+/g,' ')`));
};
