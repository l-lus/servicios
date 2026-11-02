// Vuelca el HTML (normalizado) de las vistas principales con datos sembrados. Sirve para comprobar que un cambio de plantillas no altera el DOM:
// correr contra la versión anterior y la nueva, y comparar con diff.
export default async (b) => {
    const hoy = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dia = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), n));
    const datos = [
        { id: 'luz', nombre: 'Luz <b>&"\'', categoria: 'Casa', facturas: [{ id: 'f1', monto: 15000, fecha: dia(3), pagada: false, fechaPago: null }, { id: 'f2', monto: 9000.5, fecha: dia(27), pagada: true, fechaPago: dia(1), conCredito: true, tipo: 'bimestral' }, { id: 'f0', monto: 100, fecha: '2025-03-01', pagada: true, fechaPago: '2025-03-02', moneda: 'usd' }] },
        { id: 'gas', nombre: 'Gas', categoria: 'Casa', facturas: [{ id: 'f3', monto: 5000, fecha: dia(10), pagada: true, fechaPago: dia(9) }, { id: 'f4', monto: -300, fecha: dia(11), pagada: false, fechaPago: null }] },
        { id: 'net', nombre: 'Internet', categoria: 'Hogar', facturas: [] },
        { id: 'sub', nombre: 'Sub', categoria: '', facturas: [{ id: 'f5', monto: 10, fecha: '2026-01-05', pagada: false, fechaPago: null }] },
        { id: 'servicio-ingresos-especial', nombre: 'Ingresos', categoria: '', facturas: [{ id: 'i1', monto: 800000, fecha: dia(1), pagada: true, fechaPago: dia(1), tipo: 'regular' }, { id: 'i2', monto: 50, fecha: dia(2), pagada: true, fechaPago: dia(2), tipo: 'transferencia', moneda: 'usd' }] },
    ];
    const norm = `(s=>s.replace(/\\s+/g,' ').replace(/> </g,'><').trim())`;
    const html = async (sel) => (await b.eval(`${norm}(document.querySelector(${JSON.stringify(sel)})?.innerHTML||'')`)).value;
    const cargar = async (flags) => {
        await b.eval(`localStorage.clear(); localStorage.setItem('gestion_servicios_datos_default', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('categorias-servicios', '["Casa","Hogar"]'); ${Object.entries(flags).map(([k,v])=>`localStorage.setItem('${k}','${v}')`).join(';')}; true`);
        await b.ir(b.url); await b.sleep(1300);
    };
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const esc = async () => { await b.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`); await b.sleep(450); };
    for (const [nombre, flags] of [['plano', {}], ['agrupado', { 'cat-agrupacion': 'on' }], ['estados', { 'vista-estados': 'true' }], ['con ingresos', { 'ingresos-habilitado': 'true', 'cat-agrupacion': 'on' }]]) {
        await cargar(flags);
        console.log('== ' + nombre); console.log(await html('#servicios-lista'));
    }
    await cargar({ 'ingresos-habilitado': 'true' });
    await click('#servicios-lista [data-id="luz"]'); console.log('== facturas luz'); console.log(await html('#lista-facturas-modal'));
    await esc(); await esc();
    await click('#servicios-lista [data-id="servicio-ingresos-especial"]'); console.log('== ingresos'); console.log(await html('#lista-ingresos-modal'));
    await esc(); await esc();
    await click('#btn-ajustes'); await click('#menu-perfiles'); console.log('== perfiles'); console.log(await html('#perfiles-lista')); await esc(); await esc();
    await click('#btn-ajustes'); await click('#menu-categorias'); console.log('== categorias'); console.log(await html('#categorias-lista')); await esc(); await esc();
    console.log('== estadisticas'); console.log(await html('#estadisticas-content'));
    console.log('== resumen'); console.log(await html('#resumen-mes'));
    await click('#btn-info-resumen'); console.log('== info resumen'); console.log(await html('#modal-info-resumen-body')); await esc();
    console.log('== calculador'); console.log(await html('#calculador-resultados'));
    console.log('== selects'); console.log(await html('#factura-servicio'), await html('#servicio-categoria-csd'));
    await click('#btn-agregar-servicio'); await click('#menu-agregar-factura'); console.log('== nueva factura selects'); console.log(await html('#factura-servicio-csd'));
};
