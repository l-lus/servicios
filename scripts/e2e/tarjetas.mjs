// Tarjetas: orden y visibilidad desde Ajustes, Alt+flechas, arrastre con pulsación larga, orden aparte para móvil y restablecer.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(500); };
    const abierto = (id) => v(`(()=>{const m=document.getElementById('${id}'); return m.classList.contains('show')||m.classList.contains('active')})()`);
    const dist = () => v(`(()=>{const col=(s)=>[...document.querySelector(s).children].filter(e=>e.id.startsWith('card-')&&e.style.display!=='none').map(e=>e.id.slice(5)).join(','); return 'izq['+col('.sidebar-left')+'] der['+col('.main-content')+']'})()`);
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); true`);
    await b.setViewport(1000, 900); await b.ir(b.url); await b.sleep(1300);
    console.log('PC inicial:', await dist());
    await click('#btn-ajustes'); await click('#menu-tarjetas');
    console.log('modal:', await abierto('modal-tarjetas'), '|', await v(`document.getElementById('orden-cards-contexto').textContent`), '| filas:', await v(`document.querySelectorAll('.orden-card-item').length`));
    await click('.orden-card-item[data-card="servicios"] [data-mover="-1"]');
    console.log('subir servicios:', await dist());
    await click('.orden-card-item[data-card="calendario"] [data-visible]');
    console.log('ocultar calendario:', await dist(), '| guardado:', await v(`localStorage.getItem('tarjeta-visible-calendario')`));
    await b.shot('/tmp/orden1.png');
    await click('#modal-tarjetas-close');
    // teclado: Alt + flecha en el encabezado de estadísticas
    await b.eval(`document.getElementById('estadisticas-header').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true})); true`); await b.sleep(500);
    console.log('Alt+↑ en estadísticas:', await dist());
    // arrastre sintético con pulsación larga: soltar servicios sobre el resumen
    await b.eval(`(()=>{ const h=document.querySelector('#card-servicios .card-header-collapsible'); const r=h.getBoundingClientRect(); window.__r=r; h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,button:0,clientX:r.left+20,clientY:r.top+10,pointerType:'mouse'})); return true})()`);
    await b.sleep(450);
    console.log('arrastrando:', await v(`document.body.classList.contains('tarjeta-arrastrando-activa')`));
    await b.eval(`(()=>{ const r=document.querySelector('#card-resumen').getBoundingClientRect(); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:7,clientX:r.left+20,clientY:r.top+10,pointerType:'mouse'})); return true})()`);
    await b.sleep(500);
    await b.eval(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7})); true`); await b.sleep(700);
    console.log('tras arrastrar:', await dist(), '| guardado:', await v(`localStorage.getItem('orden-tarjetas')`));
    await b.ir(b.url); await b.sleep(1300);
    console.log('persiste:', await dist());
    // móvil: todo apilado en una columna, con su propio orden (parte del de PC)
    await b.setViewport(420, 900); await b.ir(b.url); await b.sleep(1300);
    console.log('móvil:', await dist());
    await click('#btn-ajustes'); await click('#menu-tarjetas'); console.log('contexto:', await v(`document.getElementById('orden-cards-contexto').textContent`));
    await click('#btn-tarjetas-restablecer');
    console.log('restablecer:', await dist(), '|', await v(`localStorage.getItem('orden-tarjetas')`));
    await b.setViewport(1000, 900); await b.sleep(600);
    console.log('de vuelta a PC:', await dist());
};
