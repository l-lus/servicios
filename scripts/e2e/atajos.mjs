// Atajos: por defecto, acciones, selector con máximo, persistencia y lista vacía.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); localStorage.setItem('gestion_servicios_datos_default', JSON.stringify([{id:'a',nombre:'Luz',categoria:'',facturas:[{id:'f',monto:100,fecha:'2026-11-20',pagada:false,fechaPago:null}]}])); true`);
    await b.ir(b.url); await b.sleep(1300);
    console.log('por defecto:', await v(`[...document.querySelectorAll('#atajos-botones button')].map(x=>x.dataset.atajo).join()`));
    console.log('deshacer desactivado:', await v(`document.getElementById('atajo-deshacer').disabled`));
    await click('#atajo-calendario'); console.log('calendario abierto:', await v(`!document.getElementById('calendario-content').classList.contains('collapsed')`));
    await click('#atajo-nueva-factura'); console.log('nueva factura (modal):', await abierto('modal-agregar-factura'));
    await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`); await b.sleep(500);
    await click('#atajo-calculadora'); console.log('calculadora activa:', await v(`document.getElementById('calculadora-flotante').classList.contains('visible')`), '| título:', await v(`document.getElementById('atajo-calculadora').title`));
    await click('#atajo-calculadora'); console.log('calculadora salió:', !(await v(`document.getElementById('calculadora-flotante').classList.contains('visible')`)));
    await click('#atajo-ayuda'); console.log('ayuda:', await abierto('modal-ayuda')); await click('#modal-ayuda-close');
    // selector
    await click('#btn-atajos-editar'); console.log('selector:', await abierto('modal-atajos'), '|', await v(`document.getElementById('atajos-contador').textContent`), '| opciones:', await v(`document.querySelectorAll('#lista-atajos-opciones button').length`));
    await click('#lista-atajos-opciones [data-atajo="tema"]'); await click('#lista-atajos-opciones [data-atajo="ayuda"]');
    console.log('tras alternar:', await v(`document.getElementById('atajos-contador').textContent`), '| guardado:', await v(`localStorage.getItem('atajos')`));
    // llenar hasta el máximo
    for (const id of ['nuevo-servicio','buscar','ordenar','respaldar','restaurar','reporte']) await click(`#lista-atajos-opciones [data-atajo="${id}"]`);
    console.log('lleno:', await v(`document.getElementById('atajos-contador').textContent`), '| sin elegir deshabilitadas:', await v(`[...document.querySelectorAll('#lista-atajos-opciones button:not(.btn-activo)')].every(x=>x.disabled)`));
    await b.shot('/tmp/atajos1.png');
    await click('#modal-atajos-close');
    console.log('tarjeta:', await v(`[...document.querySelectorAll('#atajos-botones button')].length`), 'botones');
    await b.ir(b.url); await b.sleep(1200);
    console.log('persisten:', await v(`document.querySelectorAll('#atajos-botones button').length`));
    await b.eval(`localStorage.setItem('atajos','[]'); true`); await b.ir(b.url); await b.sleep(1200);
    console.log('lista vacía:', await v(`document.getElementById('atajos-botones').innerText`));
};
