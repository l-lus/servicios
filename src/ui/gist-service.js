import { preguntarMerge } from './resumen-merge.js';
import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { SecurityAndUtils } from '../core/seguridad.js';
import { RespaldoCifrado } from '../services/respaldo-cifrado.js';
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
        if (!EstadoApp.perfiles[this.perfilActivo]) return;
        Object.assign(EstadoApp.perfiles[this.perfilActivo], campos);
        this.app.perfil.guardar();
    }

    esIdValido(id) { return /^[a-f0-9]{20,40}$/i.test(id || ''); }

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

            const filename = `deltaF_${this.perfilActivo}.json`;
            const url = existente ? `https://api.github.com/gists/${perfil.gistId}` : 'https://api.github.com/gists';
            const res = await fetch(url, {
                method: existente ? 'PATCH' : 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // sin el nombre del perfil: la descripción de un Gist es visible para quien tenga el enlace
                    description: 'Servicios — respaldo cifrado',
                    public: false,
                    files: { [filename]: { content: sellado.texto } }
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

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
        try {
            await this._fetchGist(gistId, token, { avisarSinCifrar: false });
            return true;
        } catch (err) {
            const codigo = /** @type {any} */ (err).codigo;
            if (codigo !== 'descifrado' && codigo !== 'sin-frase' && codigo !== 'frase') return true;
            if (silencioso) {
                this.app.ui.mostrarToast('Sincronización automática frenada: la frase no abre el Gist actual. Revisá la frase o subí a mano para reemplazarlo', 'error', 8000);
                return false;
            }
            return ModalManager.confirmar(
                'La frase no abre el contenido actual del Gist (otra frase, o el Gist fue alterado). Si seguís, el Gist se reemplaza con tus datos locales y su contenido actual se pierde. ¿Subir igual?',
                'Reemplazar', '#icon-cloud-sync', { titulo: 'La frase no abre el Gist' });
        }
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
                try {
                    const remoto = await this._fetchGist(perfil.gistId, this.getToken(), { avisarSinCifrar: false });
                    if (remoto) {
                        const medida = ImportarExportar.subidaAutomaticaSegura(this.servicios, this.app.categoria.getCategorias(), remoto.servicios, remoto.categorias);
                        if (!medida.segura) {
                            console.warn(`AutoSync bloqueado: datos locales (${medida.local}b) son menos del 75% del remoto (${medida.remoto}b)`);
                            this.app.ui.mostrarToast('Subida automática bloqueada: lo que hay acá es mucho menos que lo que hay en el Gist. Si es a propósito, subí a mano con el botón Subir', 'error', 8000);
                            return;
                        }
                    }
                } catch (e) {
                    // Una frase que no abre el Gist frena la subida (pisaría lo que los otros dispositivos leen); si no se puede comparar por otro motivo (sin internet, etc.), se deja pasar
                    const codigo = /** @type {any} */ (e).codigo;
                    if (codigo === 'descifrado' || codigo === 'sin-frase' || codigo === 'frase') {
                        this.app.ui.mostrarToast('Sincronización automática frenada: la frase no abre el Gist actual. Revisá la frase o subí a mano para reemplazarlo', 'error', 8000);
                        return;
                    }
                    console.warn('AutoSync guard: no se pudo comparar con remoto, se permite la subida.', e);
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
            const data = await this._fetchGist(perfil.gistId, token);
            if (!data) throw new Error('Formato inválido');

            // Hacemos un merge simulado para contar diferencias
            const diff = ImportarExportar.simularFusion(this.servicios, data.servicios);
            const diffCats = ImportarExportar.categoriasNuevas(this.app.categoria.getCategorias(), data.categorias).length;

            const perdidas = ImportarExportar.perdidasAlReemplazar(this.servicios, data.servicios);
            const hayPerdidas = perdidas.servicios + perdidas.facturas + perdidas.ingresos > 0;
            if (!diff.serviciosAgregados && !diff.facturasAgregadas && !diff.facturasActualizadas && !diff.ingresosAgregados && !diffCats && !hayPerdidas) {
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
            const data = await this._fetchGist(perfil.gistId, this.getToken());
            if (!data) return;

            // Simular merge para ver qué es nuevo
            const diff = ImportarExportar.simularFusion(this.servicios, data.servicios);
            const nuevasCats = ImportarExportar.categoriasNuevas(this.app.categoria.getCategorias(), data.categorias).length;

            if (diff.serviciosAgregados || diff.facturasAgregadas || diff.facturasActualizadas || diff.ingresosAgregados || nuevasCats) {

                // Mostrar chips de resumen
                const detalle = $('gist-novedades-detalle');
                if (detalle) {
                    const chips = [];
                    if (diff.serviciosAgregados) chips.push(html`<div class="gist-novedades-chip"><span>Servicios</span><span class="gist-novedades-chip-count">+${diff.serviciosAgregados}</span></div>`);
                    if (diff.facturasAgregadas) chips.push(html`<div class="gist-novedades-chip"><span>Facturas nuevas</span><span class="gist-novedades-chip-count">+${diff.facturasAgregadas}</span></div>`);
                    if (diff.facturasActualizadas) chips.push(html`<div class="gist-novedades-chip"><span>Actualizadas</span><span class="gist-novedades-chip-count">${diff.facturasActualizadas}</span></div>`);
                    if (diff.ingresosAgregados) chips.push(html`<div class="gist-novedades-chip"><span>Ingresos</span><span class="gist-novedades-chip-count">+${diff.ingresosAgregados}</span></div>`);
                    if (nuevasCats) chips.push(html`<div class="gist-novedades-chip"><span>Categorías</span><span class="gist-novedades-chip-count">+${nuevasCats}</span></div>`);
                    montar(detalle, html`${chips}`);
                }

                this.app._gistDatosPendientes = data;
                setTimeout(() => this.app.ui.abrirModal('modal-gist-novedades'), 600);
            }
        } catch (e) {
            console.error("AutoSync error:", e);
        } finally {
            this._spinStop();
        }
    }

    /** @param {string} gistId @param {string} token @param {{ avisarSinCifrar?: boolean }} [opciones] */
    async _fetchGist(gistId, token, { avisarSinCifrar = true } = {}) {
        /** @type {Record<string, string>} */
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const filename = `deltaF_${this.perfilActivo}.json`;
        const fileObj = json.files[filename];
        if (!fileObj) throw new Error('Archivo no encontrado');

        const maxBytes = SecurityAndUtils.SECURITY_LIMITS.MAX_JSON_SIZE;
        if (fileObj.size > maxBytes) throw new Error('Archivo del Gist demasiado grande');

        let content = fileObj.content;
        if (fileObj.truncated) {
            // raw_url solo se sigue si es del dominio de contenido de Gist
            const raw = new URL(fileObj.raw_url);
            if (raw.protocol !== 'https:' || raw.hostname !== 'gist.githubusercontent.com') throw new Error('URL de contenido inesperada');
            const r2 = await fetch(raw.href);
            if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
            content = await r2.text();
        }
        if (typeof content !== 'string' || content.length > maxBytes) throw new Error('Archivo del Gist demasiado grande');

        const abierto = await RespaldoCifrado.abrir(content, FraseCifrado.actual());
        if ('error' in abierto) {
            const error = new Error(abierto.error);
            /** @type {any} */ (error).codigo = abierto.codigo;
            throw error;
        }
        const parsed = abierto.datos;
        const datos = ImportarExportar.normalizarDatos(parsed.servicios, parsed.categorias);
        if (abierto.cifrado) {
            // AES-GCM ya garantiza que no fue alterado; la sal se guarda para reutilizarla en la próxima subida
            if (abierto.sal) this._sales[gistId] = abierto.sal;
        } else {
            // Un Gist de antes de cifrar: se lee igual (con la verificación de integridad de siempre) y se avisa que se cifra al subir
            await this.app.storage.advertirIntegridad(parsed, 'El archivo del Gist');
            if (avisarSinCifrar) this.app.ui.mostrarToast('Este Gist está sin cifrar. Se cifra la próxima vez que subas', 'warning', 6000);
        }
        return { ...datos, crudo: parsed };
    }

    // Muestra el resumen previo (Combinar / Reemplazar) y aplica lo que se elija. Devuelve false si se cancela.
    async confirmarYAplicar(data) {
        const modo = await preguntarMerge({
            origen: 'Gist',
            locales: this.servicios, categoriasLocales: this.app.categoria.getCategorias(),
            remotos: data.servicios, categoriasRemotas: data.categorias,
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
