// Datos guardados inválidos (otra página del mismo origen, una versión vieja, texto dañado): la app carga lo válido, avisa y conserva una copia de rescate.
export default async (b) => {
    const v = async (e) => (await b.eval(e)).value;
    const sembrar = async (pares) => {
        await b.eval(`localStorage.clear(); localStorage.setItem('bienvenida-vista', 'true'); ${Object.entries(pares).map(([k, x]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(x)});`).join(' ')} true`);
        await b.ir(b.url); await b.sleep(2000);
    };
    const lista = () => v(`(document.querySelector('#servicios-lista')?.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 120)`);
    const toast = () => v(`(document.querySelector('.toast')?.innerText||'').replace(/\\s+/g,' ').trim()`);
    const CLAVE = 'gestion_servicios_datos_default', RESCATE = 'gestion_servicios_rescate_default';

    const mezcla = JSON.stringify([
        { id: 'luz', nombre: 'Luz', categoria: '', facturas: [{ id: 'f1', monto: 100, fecha: '2026-11-10', pagada: false, fechaPago: null }, { id: 'f2', monto: 'mucho', fecha: 'ayer', pagada: 'si' }] },
        { id: '<img src=x onerror=alert(1)>', nombre: 'Malo', facturas: [] },
        null,
    ]);
    await sembrar({ [CLAVE]: mezcla });
    console.log('mezcla → lista:', await lista());
    console.log('mezcla → toast:', await toast());
    console.log('mezcla → rescate intacto:', (await v(`localStorage.getItem(${JSON.stringify(RESCATE)})`)) === mezcla);

    await sembrar({ [CLAVE]: '{esto no es JSON' });
    console.log('ilegible → toast:', await toast(), '| rescate:', await v(`localStorage.getItem(${JSON.stringify(RESCATE)})`));

    // perfiles y perfil activo manipulados: se cae al principal y guardar la configuración del Gist no toca Object.prototype
    await sembrar({
        [CLAVE]: JSON.stringify([{ id: 'agua', nombre: 'Agua', categoria: '', facturas: [] }]),
        gestion_servicios_perfil_activo: '__proto__',
        gestion_servicios_perfiles: JSON.stringify({ 'x y': { nombre: 'Raro' }, perfil_1: { nombre: '<img src=x onerror=alert(1)>', gistId: 'no-es-un-id' } }),
    });
    await b.eval(`document.querySelector('#header-profile-btn').click(); true`); await b.sleep(500);
    console.log('perfiles → lista:', await lista(), '| perfiles:', await v(`[...document.querySelectorAll('#perfiles-lista .btn-perfil-nombre')].map(e => e.textContent).join(' / ')`));
    await b.eval(`document.querySelector('#btn-perfiles-ajustes').click(); true`); await b.sleep(500);
    await b.eval(`document.querySelector('#menu-gist').click(); true`); await b.sleep(500);
    await b.eval(`document.querySelector('#gist-autosync-toggle').click(); document.querySelector('#btn-gist-guardar')?.click(); true`); await b.sleep(500);
    console.log('perfiles → Object.prototype limpio:', await v(`!('gistAuto' in {}) && !('gistId' in {})`), '| guardado en:', await v(`Object.keys(JSON.parse(localStorage.getItem('gestion_servicios_perfiles'))).join(',')`));

    // categorías guardadas con basura y una categoría llamada «constructor» (clave heredada en un objeto común): se listan solo las válidas y el grupo se puede colapsar y expandir
    await sembrar({
        [CLAVE]: JSON.stringify([{ id: 'tel', nombre: 'Tel', categoria: 'constructor', facturas: [] }]),
        'categorias-servicios': JSON.stringify(['constructor', 7, null, { a: 1 }, 'Casa', 'casa', '  ']),
        'cat-agrupacion': 'on',
        'cat-colapsadas': JSON.stringify({ Casa: 'si', toString: 1 }),
    });
    const colapsado = () => v(`document.querySelector('.servicios-grupo-cat[data-cat="constructor"] .servicios-grupo-cat-chevron')?.classList.contains('collapsed')`);
    const inicial = await colapsado();
    await b.eval(`document.querySelector('.servicios-grupo-cat[data-cat="constructor"] .servicios-grupo-cat-header')?.click(); true`); await b.sleep(500);
    const trasClic = await colapsado();
    await b.ir(b.url); await b.sleep(2000);
    console.log('categorías → grupo «constructor» colapsado: al inicio', inicial, '| tras tocarlo', trasClic, '| tras recargar', await colapsado(), '| guardado:', await v(`localStorage.getItem('cat-colapsadas')`));
    await b.eval(`document.querySelector('#header-profile-btn').click(); true`); await b.sleep(400);
    await b.eval(`document.querySelector('#btn-perfiles-ajustes').click(); true`); await b.sleep(400);
    await b.eval(`document.querySelector('#menu-categorias').click(); true`); await b.sleep(500);
    console.log('categorías → lista:', await v(`[...document.querySelectorAll('#categorias-lista .categoria-tag')].map(e => e.textContent.trim()).join(' / ')`));

    await sembrar({ [CLAVE]: JSON.stringify([{ id: 'gas', nombre: 'Gas', categoria: '', facturas: [] }]) });
    console.log('sano → lista:', await lista(), '| toast:', JSON.stringify(await toast()), '| rescate:', await v(`localStorage.getItem(${JSON.stringify(RESCATE)})`));
};
