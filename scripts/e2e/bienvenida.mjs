// Bienvenida: aparece sin datos, aplica ingresos/vista/tema, agregar primer servicio y no vuelve a salir.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    await b.eval(`localStorage.clear(); true`); await b.ir(b.url); await b.sleep(2500);
    console.log('bienvenida (sin datos):', await abierto('modal-bienvenida'), '| temas:', await v(`document.querySelectorAll('#bienvenida-temas .tema-opcion').length`));
    await b.shot('/tmp/bien1.png');
    await click('#bienvenida-ingresos'); await click('.bienvenida-vista[data-vista="categorias"]'); await click('#bienvenida-temas .tema-opcion[data-tema="green"]');
    console.log('ingresos:', await v(`localStorage.getItem('ingresos-habilitado')`), '| vista:', await v(`localStorage.getItem('cat-agrupacion')`), '| tema:', await v(`document.documentElement.getAttribute('data-theme')`), '| ingresos on:', await v(`document.getElementById('bienvenida-ingresos').classList.contains('on')`));
    await click('#btn-bienvenida-agregar');
    console.log('visto:', await v(`localStorage.getItem('bienvenida-vista')`), '| bienvenida cerrada:', !(await abierto('modal-bienvenida')), '| modal nuevo servicio:', await abierto('modal-agregar-servicio'));
    await b.ir(b.url); await b.sleep(2500);
    console.log('no vuelve a aparecer:', !(await abierto('modal-bienvenida')));
    await b.eval(`localStorage.removeItem('bienvenida-vista'); localStorage.setItem('gestion_servicios_datos_default', JSON.stringify([{id:'a',nombre:'A',categoria:'',facturas:[]}])); true`); await b.ir(b.url); await b.sleep(2500);
    console.log('con datos no aparece:', !(await abierto('modal-bienvenida')), '| marcada vista:', await v(`localStorage.getItem('bienvenida-vista')`));
};
