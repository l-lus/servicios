// Abre cada modal con una pantalla bajita y comprueba que encabezado y pie siguen visibles mientras el cuerpo se desplaza.
export default async (b) => {
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); localStorage.setItem('gestion_servicios_datos_default', JSON.stringify([{id:'a',nombre:'Luz',categoria:'',facturas:Array.from({length:30},(_,i)=>({id:'f'+i,monto:100+i,fecha:'2026-'+String(1+i%12).padStart(2,'0')+'-10',pagada:false,fechaPago:null}))}])); true`);
    await b.setViewport(420, 440); await b.ir(b.url); await b.sleep(1300);
    const r = await b.eval(`(async()=>{
      const salida=[];
      for (const m of [...document.querySelectorAll('.modal')]) {
        m.classList.add('show','active'); document.body.classList.add('modal-open');
        await new Promise(r=>setTimeout(r,60));
        const c=m.querySelector(':scope > .modal-content, :scope > form.modal-content');
        const hijos=[...c.children];
        const esH=e=>/modal-header|modal-panel-header|modal-facturas-header/.test(e.className);
        const esF=e=>/form-actions|modal-footer|modal-facturas-footer|modal-panel-footer/.test(e.className);
        const h=hijos.find(esH), f=[...hijos].reverse().find(esF);
        const cr=c.getBoundingClientRect();
        const scroller=hijos.find(e=>!esH(e)&&!esF(e)&&getComputedStyle(e).overflowY==='auto');
        const enPantalla=cr.top>=-1&&cr.bottom<=window.innerHeight+1;
        const hv=!h||(h.getBoundingClientRect().top>=cr.top-1&&h.getBoundingClientRect().bottom<=cr.bottom+1);
        const fv=!f||(f.getBoundingClientRect().bottom<=cr.bottom+1&&f.getBoundingClientRect().top>=cr.top-1);
        const desborda=scroller?scroller.scrollHeight>scroller.clientHeight+1:null;
        const problemas=[]; if(!enPantalla)problemas.push('el modal se sale de la pantalla'); if(!hv)problemas.push('encabezado fuera'); if(!fv)problemas.push('pie fuera'); if(!scroller&&hijos.length>2)problemas.push('sin zona de desplazamiento');
        salida.push((problemas.length?'✖ ':'✔ ')+m.id+' | encabezado:'+(h?'sí':'no')+' pie:'+(f?'sí':'no')+' zona:'+(scroller?(scroller.className.split(' ')[0]+(desborda?' (se desplaza)':' (cabe)')):'—')+(problemas.length?' → '+problemas.join(', '):''));
        m.classList.remove('show','active');
      }
      document.body.classList.remove('modal-open');
      return salida.join('\\n');
    })()`);
    console.log(r.value);
};
