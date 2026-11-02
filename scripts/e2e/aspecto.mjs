// Aspecto: comprueba que carga la fuente Inter y deja capturas (claro, oscuro y modal) en /tmp para revisar a ojo.
export default async (b) => {
    const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dia = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), n));
    const datos = [
        { id: 'luz', nombre: 'Luz', categoria: 'Casa', facturas: [{ id: 'f1', monto: 15000, fecha: dia(3), pagada: false, fechaPago: null }, { id: 'f2', monto: 9000, fecha: dia(27), pagada: false, fechaPago: null }] },
        { id: 'gas', nombre: 'Gas', categoria: 'Casa', facturas: [{ id: 'f3', monto: 5000, fecha: dia(10), pagada: true, fechaPago: dia(9) }] },
        { id: 'net', nombre: 'Internet', categoria: '', facturas: [] },
    ];
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('gestion_servicios_theme','light'); true`);
    await b.ir(b.url); await b.sleep(1500);
    console.log('fuente:', (await b.eval(`getComputedStyle(document.body).fontFamily`)).value.slice(0,40), '| cargada Inter:', (await b.eval(`document.fonts.check('16px Inter')`)).value);
    await b.shot('/tmp/vis_claro.png');
    await b.eval(`localStorage.setItem('gestion_servicios_theme','dark'); true`); await b.ir(b.url); await b.sleep(1500);
    await b.shot('/tmp/vis_oscuro.png');
    await b.eval(`document.getElementById('btn-sort').click(); true`); await b.sleep(600); await b.shot('/tmp/vis_modal.png');
};
