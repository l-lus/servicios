import { preguntarMerge } from './resumen-merge.js';
import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { RespaldoCifrado } from '../services/respaldo-cifrado.js';
import { esIdDeGist } from '../services/gestor-perfiles.js';
import { ClienteGist, nombreArchivoGist, esGistNoConfiable, evaluarSubidaAutomatica } from '../services/cliente-gist.js';
import { FraseCifrado } from './frase-cifrado.js';
import { CampoFrase } from './campo-frase.js';
import { ModalManager } from './gestor-modales.js';
import { IconosAnimados } from './iconos-animados.js';
import { $, valorDe } from '../core/dom.js';

// ============================================================
// GIST SERVICE — sincronización con GitHub Gist (Adaptado)
// ============================================================
export class GistService {
    constructor(app) {
        this.app = app;
        /** Habla con la API de GitHub; acá solo quedan el modal, los avisos y los datos del perfil. */
        this.cliente = new ClienteGist((...args) => fetch(...args));
        this.DEBOUNCE_MS = 3000;
        this._debounceTimer = undefined;
        this._subiendo = false;
        /** La sal del último sobre visto de cada Gist: al volver a subir se reutiliza y no hay que derivar la clave de nuevo. @type {Record<string, string>} */
        this._sales = {};
        this._avisoFraseMostrado = false;
        this.campoFrase = new CampoFrase(
            { input: 'gist-frase', ojo: 'gist-frase-eye', generar: 'btn-gist-generar-frase', recordar: 'gist-recordar-frase-toggle' },
            (mensaje, tipo, duracion) => this.app.ui.mostrarToast(mensaje, tipo, duracion));
    }

    get servicios() { return EstadoApp.servicios; }
    set servicios(v) { EstadoApp.servicios = v; }
    get perfilActivo() { return EstadoApp.perfilActivo; }

    getToken() { return StorageHelper.getItem(STORAGE_KEYS.GIST_TOKEN) || ''; }
    getPerfil() { return EstadoApp.perfiles[this.perfilActivo] || {}; }

    setPerfil(campos) {
        const perfil = EstadoApp.perfiles[this.perfilActivo];
        if (!perfil) return;
        // `gistCifrado` vale para un Gist en particular: al cambiar de Gist se vuelve a empezar (el nuevo puede ser uno viejo, todavía en claro)
        const cambiaDeGist = 'gistId' in campos && (campos.gistId || '') !== (perfil.gistId || '') && !('gistCifrado' in campos);
        Object.assign(perfil, campos, cambiaDeGist ? { gistCifrado: false } : {});
        this.app.perfil.guardar();
    }

    esIdValido(id) { return esIdDeGist(id); }

    // ── UI ────────────────────────────────────────────────────
    toggleToken() {
        const inp = $('gist-token');
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
    }

    toggleAuto() {
        const toggle = $('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on');
    }

    /** Falta la frase: avisa una sola vez por sesión (la sincronización automática no debe insistir). */
    _avisarFraseFaltante(silencioso) {
        if (silencioso) {
            if (this._avisoFraseMostrado) return;
            this._avisoFraseMostrado = true;
        }
        this.app.ui.mostrarToast('Falta la frase de cifrado (Ajustes → GitHub Gist). La sincronización con el Gist está en pausa', 'error', 6000);
    }

    /** La sincronización automática no pisa ni usa un Gist que no se puede dar por bueno. @param {string} codigo */
    _avisarAutoFrenada(codigo) {
        this.app.ui.mostrarToast(codigo === 'sin-cifrar'
            ? 'Sincronización automática frenada: el Gist estaba cifrado y ahora está en claro (alguien lo cambió). Para reemplazarlo con tus datos, subí a mano'
            : 'Sincronización automática frenada: la frase no abre el Gist actual. Revisá la frase o subí a mano para reemplazarlo', 'error', 8000);
    }

    abrirModal() {
        const perfil = this.getPerfil();
        $('gist-token').value = this.getToken();

        const elId = $('gist-id');
        elId.value = perfil.gistId || '';

        const toggle = $('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on', !!perfil.gistAuto);

        this.campoFrase.cargar();

        const elSync = $('gist-sync-status');
        if (perfil.gistLastSync) {
            const d = new Date(perfil.gistLastSync);
            elSync.textContent = `Última sincronización: ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            elSync.textContent = '';
        }

        // Controlar estado inicial del botón de redirección externa
        const btnIr = $('btn-gist-ir');
        if (btnIr) btnIr.disabled = !this.esIdValido(perfil.gistId);

        // Listener en vivo para el input de Gist ID
        elId.oninput = (e) => {
            if (btnIr) btnIr.disabled = !this.esIdValido(valorDe(e).trim());
        };

        this.app.ui.abrirModal('modal-gist');
    }

    guardarConfig() {
        const token = $('gist-token').value.trim();
        const gistId = $('gist-id').value.trim();
        const auto = $('gist-autosync-toggle').classList.contains('on');

        if (gistId && !this.esIdValido(gistId)) {
            this.app.mostrarToast('El Gist ID tiene un formato inválido', 'error');
            return;
        }
        if (!this.campoFrase.confirmar()) return;

        if (token) StorageHelper.setItem(STORAGE_KEYS.GIST_TOKEN, token);
        else StorageHelper.removeItem(STORAGE_KEYS.GIST_TOKEN);

        this.setPerfil({ gistId, gistAuto: auto });

        this.app.mostrarToast(auto ? 'Sincronización automática activada' : 'Configuración guardada', 'success');
        this.app.ui.cerrarModal('modal-gist');
        this.actualizarBotones();
    }

    actualizarBotones() {
        // Mantiene la compatibilidad con el fallback de exportar local en tu UI
        const btnRespaldar = $('btn-hist-respaldar');
        const btnRestaurar = $('btn-hist-restaurar');
        const tieneGist = this.esIdValido(this.getPerfil().gistId);

        if (!btnRespaldar || !btnRestaurar) return;
        const base = tieneGist ? 'nube' : 'bandeja';
        IconosAnimados.ponerIconoFlecha(btnRespaldar, base, 'subir');
        IconosAnimados.ponerIconoFlecha(btnRestaurar, base, 'bajar');
        if (tieneGist) {
            btnRespaldar.onclick = () => { IconosAnimados.animarFlecha(btnRespaldar, 'subir'); this.subir(); };
            btnRestaurar.onclick = () => { IconosAnimados.animarFlecha(btnRestaurar, 'bajar'); this.bajar(); };
        } else {
            btnRespaldar.onclick = () => { IconosAnimados.animarFlecha(btnRespaldar, 'subir'); this.app.respaldo.abrir(); };
            btnRestaurar.onclick = () => { IconosAnimados.animarFlecha(btnRestaurar, 'bajar'); this.app.storage.importarDatos('combinar'); };
        }
    }

    // Abrir el Gist actual en una pestaña nueva
    irAlGist() {
        const id = $('gist-id').value.trim();
        if (this.esIdValido(id)) {
            window.open(`https://gist.github.com/${id}`, '_blank');
        }
    }

    // ── Spinner en el botón de ajustes ──────────────────────
    _spinStart() {
        $('header-profile-btn')?.classList.add('icon-btn-spinning');
    }
    _spinStop() {
        $('header-profile-btn')?.classList.remove('icon-btn-spinning');
    }

    _setBusy(busy) {
        this._subiendo = busy;
        const btnSubir = $('btn-gist-subir');
        const btnBajar = $('btn-gist-bajar');
        if (btnSubir) btnSubir.disabled = busy;
        if (btnBajar) btnBajar.disabled = busy;
        if (busy) this._spinStart(); else this._spinStop();
    }

    // ── Subida ────────────────────────────────────────────────
    /** @param {boolean} [silencioso] subida automática (sin avisos de éxito) @param {{ remotoVerificado?: boolean }} [opciones] con `remotoVerificado` la guarda de la subida automática ya abrió el Gist con la frase: no se vuelve a bajar */
    async _ejecutarSubida(silencioso = false, { remotoVerificado = false } = {}) {
        const token = this.getToken();
        const perfil = this.getPerfil();
        if (!token) { if (!silencioso) this.app.mostrarToast('Falta el token', 'error'); return; }

        this._setBusy(true);
        if (!silencioso) this.app.mostrarToast('Subiendo...', 'info');

        const existente = this.esIdValido(perfil.gistId);
        try {
            // El Gist solo se sube cifrado: sin una frase válida no se sube nada
            const frase = FraseCifrado.actual();
            if (!FraseCifrado.disponible()) { this._avisarFraseFaltante(silencioso); return; }
            // Subir con una frase que no abre el Gist actual lo dejaría ilegible para los otros dispositivos: se pide confirmación (a mano) o se frena (automática)
            if (existente && !remotoVerificado && !(await this._fraseAbreElRemoto(perfil.gistId, token, silencioso))) return;

            const respaldo = await this.app.storage._construirExportacion();
            const sellado = await RespaldoCifrado.sellar(respaldo, frase, { sal: this._sales[perfil.gistId] ?? null });
            if ('error' in sellado) throw new Error(sellado.error);

            const escrito = await this.cliente.escribir({ gistId: existente ? perfil.gistId : null, token, archivo: nombreArchivoGist(this.perfilActivo), texto: sellado.texto });
            if ('error' in escrito) throw new Error(escrito.error);
            const data = escrito;

            this._sales[data.id] = sellado.sal;
            // Un Gist que ya existía puede tener versiones anteriores en claro: GitHub las conserva en el historial del Gist
            const avisarHistorial = existente && !perfil.gistCifrado;
            this.setPerfil({ gistId: data.id, gistLastSync: new Date().toISOString(), gistCifrado: true });

            const elId = $('gist-id');
            if (elId) elId.value = data.id;

            if (!silencioso) this.app.mostrarToast('Subida exitosa ✓', 'success');
            if (avisarHistorial) {
                this.app.ui.mostrarToast('Este Gist ya existía: sus versiones anteriores siguen en claro en el historial de GitHub. Para borrarlas, creá un Gist nuevo (dejá el ID vacío) y eliminá el viejo', 'warning', 12000);
            }
        } catch (err) {
            console.error(err);
            if (!silencioso) this.app.mostrarToast(`Error al subir: ${err.message}`, 'error');
        } finally {
            this._setBusy(false);
        }
    }

    _sincronizarCredencialesDesdeModal() {
        const modal = $('modal-gist');
        if (!modal || (!modal.classList.contains('show') && !modal.classList.contains('active'))) return;
        const tokenInput = $('gist-token');
        const gistIdInput = $('gist-id');
        const autoToggle = $('gist-autosync-toggle');

        const token = tokenInput ? tokenInput.value.trim() : '';
        const gistId = gistIdInput ? gistIdInput.value.trim() : '';
        const auto = autoToggle ? autoToggle.classList.contains('on') : false;

        if (token) StorageHelper.setItem(STORAGE_KEYS.GIST_TOKEN, token);
        else if (tokenInput) StorageHelper.removeItem(STORAGE_KEYS.GIST_TOKEN);

        this.campoFrase.confirmar({ avisar: false });
        this.setPerfil({ gistId, gistAuto: auto });
        this.actualizarBotones();
    }

    /**
     * ¿La frase actual abre el contenido del Gist? true si abre, si el Gist está vacío, en claro o no se pudo consultar (sin red: no se bloquea nada);
     * false si no abre: a mano se pregunta si reemplazarlo igual; en la subida automática se frena y se avisa.
     */
    async _fraseAbreElRemoto(gistId, token, silencioso) {
        const lectura = await this._leerRemoto(gistId, token, { avisarSinCifrar: false });
        if (!esGistNoConfiable(lectura)) return true;
        const codigo = /** @type {any} */ (lectura).codigo;
        if (silencioso) {
            this._avisarAutoFrenada(codigo);
            return false;
        }
        return codigo === 'sin-cifrar'
            ? ModalManager.confirmar(
                'El Gist estaba cifrado y ahora su contenido está en claro: alguien lo cambió. Si seguís, se reemplaza con tus datos locales, cifrados. ¿Subir igual?',
                'Reemplazar', '#icon-cloud-sync', { titulo: 'El Gist fue alterado' })
            : ModalManager.confirmar(
                'La frase no abre el contenido actual del Gist (otra frase, o el Gist fue alterado). Si seguís, el Gist se reemplaza con tus datos locales y su contenido actual se pierde. ¿Subir igual?',
                'Reemplazar', '#icon-cloud-sync', { titulo: 'La frase no abre el Gist' });
    }

    subir() {
        this._sincronizarCredencialesDesdeModal();
        IconosAnimados.animarFlecha($('btn-gist-subir'), 'subir');
        this._ejecutarSubida(false);
    }

    subirAuto() {
        const perfil = this.getPerfil();
        if (!perfil.gistAuto || !this.getToken()) return;
        if (!FraseCifrado.disponible()) { this._avisarFraseFaltante(true); return; }
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(async () => {
            if (this._subiendo) return;

            // Guard: si hay un gist existente, comparar tamaño antes de subir
            if (this.esIdValido(perfil.gistId)) {
                const lectura = await this._leerRemoto(perfil.gistId, this.getToken(), { avisarSinCifrar: false });
                // Si no se puede comparar por otro motivo (sin internet, etc.), se deja pasar
                if ('error' in lectura && !esGistNoConfiable(lectura)) console.warn('AutoSync guard: no se pudo comparar con remoto, se permite la subida.', lectura.error);
                const veredicto = evaluarSubidaAutomatica(lectura, this.servicios, this.app.categoria.getCategorias());
                if (veredicto.accion === 'no-confiable') { this._avisarAutoFrenada(veredicto.codigo); return; }
                if (veredicto.accion === 'menos-datos') {
                    console.warn(`AutoSync bloqueado: datos locales (${veredicto.medida.local}b) son menos del 75% del remoto (${veredicto.medida.remoto}b)`);
                    this.app.ui.mostrarToast('Subida automática bloqueada: lo que hay acá es mucho menos que lo que hay en el Gist. Si es a propósito, subí a mano con el botón Subir', 'error', 8000);
                    return;
                }
            }

            this._ejecutarSubida(true, { remotoVerificado: true });
        }, this.DEBOUNCE_MS);
    }

    // ── Descarga y Novedades ──────────────────────────────────
    async bajar() {
        this._sincronizarCredencialesDesdeModal();
        IconosAnimados.animarFlecha($('btn-gist-bajar'), 'bajar');
        const token = this.getToken();
        const perfil = this.getPerfil();
        if (!this.esIdValido(perfil.gistId)) { this.app.mostrarToast('Gist ID inválido', 'error'); return; }

        this._setBusy(true);
        this.app.mostrarToast('Bajando...', 'info');

        try {
            const data = await this._leerRemoto(perfil.gistId, token);
            if ('error' in data) throw new Error(data.error);

            // Un merge simulado para contar diferencias
            const { hayNovedades, perdidas } = this.app.storage.compararConRemoto(data);
            const hayPerdidas = perdidas.servicios + perdidas.facturas + perdidas.ingresos > 0;
            if (!hayNovedades && !hayPerdidas) {
                this.setPerfil({ gistLastSync: new Date().toISOString() });
                this.app.mostrarToast('Sin cambios', 'info');
                return;
            }

            await this.confirmarYAplicar(data);

        } catch (err) {
            this.app.mostrarToast(`Error al bajar: ${err.message}`, 'error');
        } finally {
            this._setBusy(false);
        }
    }

    async autoSyncInit() {
        const perfil = this.getPerfil();
        if (!perfil.gistAuto || !this.getToken() || !this.esIdValido(perfil.gistId)) return;
        if (!FraseCifrado.disponible()) { this._avisarFraseFaltante(true); return; }

        this._spinStart();
        try {
            const data = await this._leerRemoto(perfil.gistId, this.getToken());
            if ('error' in data) {
                console.error('AutoSync error:', data.error);
                if (data.codigo === 'sin-cifrar') this._avisarAutoFrenada('sin-cifrar');
                return;
            }

            // Simular merge para ver qué es nuevo
            const analisis = this.app.storage.compararConRemoto(data);
            if (analisis.hayNovedades) this._mostrarNovedades(data, analisis, 600);
        } finally {
            this._spinStop();
        }
    }

    /**
     * Aviso de novedades del Gist (nada se aplica hasta que la persona lo confirme): chips con lo que cambiaría, incluido lo que se borró en otro dispositivo.
     * @param {any} data lo leído del Gist @param {{ diff: any, categoriasNuevas: number }} analisis @param {number} [demoraMs]
     */
    _mostrarNovedades(data, { diff, categoriasNuevas }, demoraMs = 0) {
        const detalle = $('gist-novedades-detalle');
        if (detalle) {
            const chip = (/** @type {string} */ nombre, /** @type {string} */ cuenta) => html`<div class="gist-novedades-chip"><span>${nombre}</span><span class="gist-novedades-chip-count">${cuenta}</span></div>`;
            const chips = [];
            if (diff.serviciosAgregados) chips.push(chip('Servicios', `+${diff.serviciosAgregados}`));
            if (diff.facturasAgregadas) chips.push(chip('Facturas nuevas', `+${diff.facturasAgregadas}`));
            if (diff.facturasActualizadas) chips.push(chip('Actualizadas', `${diff.facturasActualizadas}`));
            if (diff.ingresosAgregados) chips.push(chip('Ingresos', `+${diff.ingresosAgregados}`));
            if (categoriasNuevas) chips.push(chip('Categorías', `+${categoriasNuevas}`));
            if (diff.facturasEliminadas) chips.push(chip('Facturas eliminadas', `−${diff.facturasEliminadas}`));
            if (diff.ingresosEliminados) chips.push(chip('Ingresos eliminados', `−${diff.ingresosEliminados}`));
            if (diff.serviciosEliminados) chips.push(chip('Servicios eliminados', `−${diff.serviciosEliminados}`));
            montar(detalle, html`${chips}`);
        }
        this.app._gistDatosPendientes = data;
        setTimeout(() => this.app.ui.abrirModal('modal-gist-novedades'), demoraMs);
    }

    /**
     * Lee el Gist con el cliente y aplica en el perfil lo que se aprendió: la sal para la próxima subida y que el Gist ya se vio cifrado.
     * @param {string} gistId @param {string} token @param {{ avisarSinCifrar?: boolean }} [opciones]
     */
    async _leerRemoto(gistId, token, { avisarSinCifrar = true } = {}) {
        // Un Gist que ya se vio cifrado no se acepta en claro (ver RespaldoCifrado.abrir)
        const lectura = await this.cliente.leer(gistId, token, {
            archivo: nombreArchivoGist(this.perfilActivo),
            frase: FraseCifrado.actual(),
            exigirCifrado: this.getPerfil().gistCifrado === true,
        });
        if ('error' in lectura) return lectura;
        if (lectura.cifrado) {
            // AES-GCM ya garantiza que no fue alterado; la sal se guarda para reutilizarla en la próxima subida
            if (lectura.sal) this._sales[gistId] = lectura.sal;
            // desde ahora este Gist no se acepta en claro (también en un dispositivo que solo baja)
            if (!this.getPerfil().gistCifrado) this.setPerfil({ gistCifrado: true });
        } else {
            // Un Gist de antes de cifrar: se lee igual (con la verificación de integridad de siempre) y se avisa que se cifra al subir
            await this.app.storage.advertirIntegridad(lectura.crudo, 'El archivo del Gist');
            if (avisarSinCifrar) this.app.ui.mostrarToast('Este Gist está sin cifrar. Se cifra la próxima vez que subas', 'warning', 6000);
        }
        return lectura;
    }

    // Muestra el resumen previo (Combinar / Reemplazar) y aplica lo que se elija. Devuelve false si se cancela.
    async confirmarYAplicar(data) {
        const modo = await preguntarMerge({
            origen: 'Gist',
            locales: this.servicios, categoriasLocales: this.app.categoria.getCategorias(),
            remotos: data.servicios, categoriasRemotas: data.categorias,
            borrados: this.app.storage.compararConRemoto(data).borrados,
        });
        if (!modo) return false;
        this.app.storage._aplicarImportacion(modo, data, data.crudo);
        this.setPerfil({ gistLastSync: new Date().toISOString() });
        this.app._gistDatosPendientes = null;
        return true;
    }

    // Botón del aviso de novedades: pasa al resumen previo con los datos ya descargados
    async aplicarNovedades() {
        const data = this.app._gistDatosPendientes;
        if (!data) return;
        this.app.ui.cerrarModal('modal-gist-novedades');
        await this.confirmarYAplicar(data);
    }

    mergeCategorias(catsNuevas) {
        const { lista, agregadas } = ImportarExportar.fusionarCategorias(this.app.categoria.getCategorias(), catsNuevas);
        if (agregadas > 0) this.app.categoria.saveCategorias(lista);
        return agregadas;
    }
}
