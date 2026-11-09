// Tarjetas: sección inline en Ajustes, 2 o 3 columnas orgánicas en PC, orden propio en el celular, arrastre entre columnas y teclado.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const dist = () => v(`(()=>{const col=(s)=>[...document.querySelector(s).children].filter(e=>e.id.startsWith('card-')&&!e.classList.contains('card-oculta')).map(e=>e.id.slice(5)).join(','); return 'col1['+col('.sidebar-left')+'] col2['+col('.main-content')+'] col3['+col('#columna-centro')+']'})()`);
    const abrirAjustes = async () => { await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); };
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); true`);
    await b.setViewport(1400, 900); await b.ir(b.url); await b.sleep(1300);
    console.log('PC inicial:', await dist());
    await abrirAjustes();
    console.log('etiqueta en Ajustes:', await v(`document.getElementById('label-orden-cards').textContent`), '| items:', await v(`[...document.querySelectorAll('#lista-orden-cards .drag-handle')].map(i=>i.dataset.card+':'+i.classList.contains('btn-activo')).join(' ')`));
    await b.shot('/tmp/orden_pc.png');
    await click('#btn-toggle-card-calendario');
    console.log('ocultar calendario:', await dist(), '| activo:', await v(`document.getElementById('btn-toggle-card-calendario').classList.contains('btn-activo')`));
    await click('#btn-toggle-card-calendario');
    console.log('mostrar calendario:', await dist());
    await click('#btn-cerrar-config'); await click('#btn-cerrar-modal-perfiles');
    // pulsación larga y soltar sobre el cuerpo de #card-resumen abre VistaPrevia
    await b.eval(`(()=>{ const el=document.getElementById('resumen-toggle')||document.getElementById('card-resumen'); const r=el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:9,button:0,clientX:r.left+20,clientY:r.top+10,pointerType:'mouse'})); return true})()`);
    await b.sleep(450);
    await b.eval(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:9})); true`); await b.sleep(500);
    console.log('pulsación larga en resumen abre vista previa:', await v(`document.getElementById('vista-previa-panel').classList.contains('show')`));
    await click('#vista-previa-listo');
    // teclado en PC (Alt + flechas)
    await b.eval(`document.getElementById('calendario-header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})); true`); await b.sleep(500);
    console.log('Alt+→ en calendario (pasa a col 2):', await dist());
    await b.eval(`document.getElementById('calendario-header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})); true`); await b.sleep(500);
    console.log('Alt+→ en calendario (abre 3.ª columna):', await dist(), '| grilla cols-3:', await v(`document.querySelector('.main-grid').classList.contains('cols-3')`));
    await b.eval(`document.getElementById('calendario-header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true})); true`); await b.sleep(500);
    console.log('Alt+← en calendario (3.ª columna vacía se cierra sola):', await dist(), '| grilla cols-3:', await v(`document.querySelector('.main-grid').classList.contains('cols-3')`));
    // arrastre entre columnas: soltar estadísticas en la segunda columna
    await b.eval(`(()=>{ const h=document.querySelector('#card-estadisticas .card-header-collapsible'); const r=h.getBoundingClientRect(); h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:5,button:0,clientX:r.left+20,clientY:r.top+10,pointerType:'mouse'})); return true})()`);
    await b.sleep(450);
    await b.eval(`(()=>{ const d=document.querySelector('.main-content').getBoundingClientRect(); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:5,clientX:d.left+d.width/2,clientY:d.top+20,pointerType:'mouse'})); return true})()`);
    await b.sleep(600);
    await b.eval(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:5})); true`); await b.sleep(700);
    console.log('arrastre a la derecha:', await dist());
    await b.ir(b.url); await b.sleep(1300);
    console.log('persiste en PC:', await dist());
    // celular: usa su orden propio
    await b.setViewport(420, 900); await b.ir(b.url); await b.sleep(1300);
    console.log('celular:', await dist(), '| etiqueta:', await v(`document.getElementById('label-orden-cards').textContent`));
};
