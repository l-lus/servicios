// Tarjetas: 2 o 3 columnas orgánicas en PC, orden propio en el celular (editable desde cualquier pantalla), arrastre entre columnas, teclado y restablecer.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    const dist = () => v(`(()=>{const col=(s)=>[...document.querySelector(s).children].filter(e=>e.id.startsWith('card-')&&!e.classList.contains('card-oculta')).map(e=>e.id.slice(5)).join(','); return 'col1['+col('.sidebar-left')+'] col2['+col('.main-content')+'] col3['+col('#columna-centro')+']'})()`);
    const abrirTarjetas = async () => { await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-tarjetas'); };
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); true`);
    await b.setViewport(1400, 900); await b.ir(b.url); await b.sleep(1300);
    console.log('PC inicial:', await dist());
    await abrirTarjetas();
    console.log('modal:', await abierto('modal-tarjetas'), '| columnas en la lista:', await v(`[...document.querySelectorAll('[data-columna-lista]')].map(c=>c.dataset.columnaLista+':'+[...c.querySelectorAll('.orden-card-item')].map(i=>i.dataset.card).join('/')).join('  ')`));
    await b.shot('/tmp/orden_pc.png');
    // elegir columna libremente
    await click('.orden-card-item[data-card="resumen"] [data-columna="1"]');
    console.log('resumen → col 2:', await dist());
    await click('.orden-card-item[data-card="servicios"] [data-columna="0"]'); await click('.orden-card-item[data-card="calendario"] [data-columna="1"]');
    console.log('servicios y calendario → otra columna:', await dist());
    await click('.orden-card-item[data-card="atajos"] [data-mover="1"]');
    console.log('atajos baja un lugar:', await dist());
    await click('.orden-card-item[data-card="atajos"] [data-visible]');
    console.log('ocultar atajos:', await dist(), '| guardado:', await v(`localStorage.getItem('orden-tarjetas')`));
    await click('.orden-card-item[data-card="atajos"] [data-visible]');
    // 3 columnas orgánicas: pasar una tarjeta a la columna 3 la abre (y cuando se vacía se cierra)
    await click('.orden-card-item[data-card="estadisticas"] [data-columna="2"]');
    console.log('3 columnas, estadísticas a col 3:', await dist(), '| grilla cols-3:', await v(`document.querySelector('.main-grid').classList.contains('cols-3')`));
    console.log('anchos iguales:', await v(`[...new Set([...document.querySelectorAll('.card[id^=card-]')].filter(c=>!c.classList.contains('card-oculta')).map(c=>Math.round(c.getBoundingClientRect().width)))].join()`));
    await click('.orden-card-item[data-card="estadisticas"] [data-columna="1"]');
    console.log('de vuelta a 2 columnas (col 3 vacía se cierra sola):', await dist());
    // el celular es independiente: se edita desde PC sin tocar lo que se ve
    await click('.tarjetas-modo[data-modo="movil"]');
    console.log('modo celular:', await v(`document.getElementById('orden-cards-contexto').textContent`), '| filas:', await v(`[...document.querySelectorAll('.orden-card-item')].map(i=>i.dataset.card).join()`));
    await click('.orden-card-item[data-card="servicios"] [data-mover="-1"]'); await click('.orden-card-item[data-card="servicios"] [data-mover="-1"]');
    console.log('PC sin cambios tras editar celular:', await dist(), '| celular guardado:', await v(`localStorage.getItem('orden-tarjetas-movil')`));
    await click('#modal-tarjetas-close');
    // teclado en PC
    await b.eval(`document.getElementById('servicios-header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})); true`); await b.sleep(500);
    console.log('Alt+→ en servicios:', await dist());
    await b.eval(`document.getElementById('estadisticas-header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true})); true`); await b.sleep(500);
    console.log('Alt+↓ en estadísticas:', await dist());
    // arrastre entre columnas: soltar estadísticas en la segunda columna
    await b.eval(`(()=>{ const h=document.querySelector('#card-estadisticas .card-header-collapsible'); const r=h.getBoundingClientRect(); h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:5,button:0,clientX:r.left+20,clientY:r.top+10,pointerType:'mouse'})); return true})()`);
    await b.sleep(450);
    await b.eval(`(()=>{ const d=document.querySelector('.main-content').getBoundingClientRect(); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:5,clientX:d.left+d.width/2,clientY:d.top+20,pointerType:'mouse'})); return true})()`);
    await b.sleep(600);
    await b.eval(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:5})); true`); await b.sleep(700);
    console.log('arrastre a la derecha:', await dist());
    await b.ir(b.url); await b.sleep(1300);
    console.log('persiste en PC:', await dist());
    // celular: usa su orden propio (no el de PC)
    await b.setViewport(420, 900); await b.ir(b.url); await b.sleep(1300);
    console.log('celular:', await dist());
    // volver a PC sin recargar
    await b.setViewport(1400, 900); await b.sleep(700);
    console.log('de vuelta a PC:', await dist());
    await abrirTarjetas(); await click('#btn-tarjetas-restablecer');
    console.log('restablecer:', await dist(), '|', await v(`localStorage.getItem('orden-tarjetas')`), await v(`localStorage.getItem('orden-tarjetas-movil')`));
};
