// Arrastre de tarjetas con 3 columnas: las tarjetas no parpadean (sin animación de entrada tras cargar) y el arrastrado queda a 0.65 de opacidad.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista','true'); localStorage.setItem('columnas-pc','3'); localStorage.setItem('orden-tarjetas', JSON.stringify({izq:['resumen','atajos'],cen:['estadisticas','calendario'],der:['servicios']})); true`);
    await b.setViewport(1900, 900); await b.ir(b.url); await b.sleep(2200);
    const estado = () => v(`JSON.stringify([...document.querySelectorAll('.card[id^=card-]')].map(c=>c.id.slice(5)+':'+getComputedStyle(c).animationName+'/'+getComputedStyle(c).opacity))`);
    console.log('antes:', await estado());
    await b.eval(`(()=>{ const h=document.querySelector('#card-estadisticas .card-header-collapsible'); const r=h.getBoundingClientRect(); h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:3,button:0,clientX:r.left+20,clientY:r.top+10,pointerType:'mouse'})); return true})()`);
    await b.sleep(450);
    console.log('en arrastre:', await estado());
    await b.shot('/tmp/drag1.png');
    for (const [x, y, t] of [['left', 60, 'izq'], ['right', 60, 'der'], ['center', 400, 'cen']]) {
        await b.eval(`(()=>{ const c=document.querySelector(${JSON.stringify(t==='izq'?'.sidebar-left':t==='der'?'.main-content':'#columna-centro')}).getBoundingClientRect(); window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:3,clientX:c.left+c.width/2,clientY:${y},pointerType:'mouse'})); return true})()`);
        await b.sleep(120); await b.shot('/tmp/drag_' + t + '_a.png'); await b.sleep(500);
        console.log('mid', t, await v(`[...document.querySelectorAll('.card[id^=card-]')].map(c=>c.id.slice(5)+'@'+c.parentElement.id+c.parentElement.className.split(' ')[0]).join(' ')`), '| animaciones:', await v(`[...document.querySelectorAll('.card[id^=card-]')].every(c=>getComputedStyle(c).animationName==='none')`));
    }
    await b.eval(`window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:3})); true`); await b.sleep(700);
    console.log('final:', await estado());
};
