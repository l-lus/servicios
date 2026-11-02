// Temas: abre el selector, cambia de tema, comprueba variables CSS, persistencia y valor corrupto.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const click = async (sel) => { await b.eval(`document.querySelector(${JSON.stringify(sel)})?.click(); true`); await b.sleep(450); };
    console.log('tema inicial:', await v(`document.documentElement.className+' | '+(document.documentElement.getAttribute('data-theme')||'-')`), '| fondo', await v(`getComputedStyle(document.body).getPropertyValue('--bg-body').trim()`));
    await click('#header-profile-btn'); await click('#btn-perfiles-ajustes'); await click('#menu-tema');
    console.log('muestras:', await v(`document.querySelectorAll('#temas-lista .tema-opcion').length`), '| seleccionada:', await v(`document.querySelector('.tema-opcion[aria-pressed=true]')?.dataset.tema`));
    for (const t of ['medianoche', 'pink', 'light', 'crema']) {
        await click(`.tema-opcion[data-tema="${t}"]`);
        console.log(t, '→ attr', await v(`document.documentElement.getAttribute('data-theme')||'-'`), 'dark-mode', await v(`document.documentElement.classList.contains('dark-mode')`), 'fondo', await v(`getComputedStyle(document.body).getPropertyValue('--bg-body').trim()`), 'meta', await v(`document.querySelector('meta[name=theme-color]').content`), 'guardado', await v(`localStorage.getItem('gestion_servicios_theme')`));
    }
    await b.shot('/tmp/temas1.png');
    await click('.tema-opcion[data-tema="lilac"]'); await click('#modal-temas-close');
    await b.ir(b.url); await b.sleep(1200);
    console.log('tras recargar:', await v(`document.documentElement.getAttribute('data-theme')||'-'`), '| indicador:', await v(`document.getElementById('tema-indicator').textContent`));
    await b.shot('/tmp/temas2.png');
    await b.eval(`localStorage.setItem('gestion_servicios_theme','basura'); true`); await b.ir(b.url); await b.sleep(1000);
    console.log('valor corrupto →', await v(`document.documentElement.classList.contains('dark-mode')`), await v(`document.getElementById('tema-indicator').textContent`));
};
