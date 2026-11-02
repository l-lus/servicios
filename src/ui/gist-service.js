import { preguntarMerge } from './resumen-merge.js';
import { html, montar } from '../core/html.js';
import { EstadoApp } from '../services/estado-app.js';
import { StorageHelper } from '../core/almacenamiento.js';
import { STORAGE_KEYS } from '../core/constantes.js';
import { ImportarExportar } from '../services/importar-exportar.js';
import { SecurityAndUtils } from '../core/seguridad.js';

// ============================================================
// GIST SERVICE — sincronización con GitHub Gist (Adaptado)
// ============================================================
export class GistService {
    constructor(app) {
        this.app = app;
        this.DEBOUNCE_MS = 3000;
        this._debounceTimer = null;
        this._subiendo = false;
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
        const inp = document.getElementById('gist-token');
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
    }

    toggleAuto() {
        const toggle = document.getElementById('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on');
    }

    abrirModal() {
        const perfil = this.getPerfil();
        document.getElementById('gist-token').value = this.getToken();

        const elId = document.getElementById('gist-id');
        elId.value = perfil.gistId || '';

        const toggle = document.getElementById('gist-autosync-toggle');
        if (toggle) toggle.classList.toggle('on', !!perfil.gistAuto);

        const elSync = document.getElementById('gist-sync-status');
        if (perfil.gistLastSync) {
            const d = new Date(perfil.gistLastSync);
            elSync.textContent = `Última sincronización: ${d.toLocaleDateString('es-AR')} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            elSync.textContent = '';
        }

        // Controlar estado inicial del botón de redirección externa
        const btnIr = document.getElementById('btn-gist-ir');
        if (btnIr) btnIr.disabled = !this.esIdValido(perfil.gistId);

        // Listener en vivo para el input de Gist ID
        elId.oninput = (e) => {
            if (btnIr) btnIr.disabled = !this.esIdValido(e.target.value.trim());
        };

        this.app.ui.abrirModal('modal-gist');
    }

    guardarConfig() {
        const token = document.getElementById('gist-token').value.trim();
        const gistId = document.getElementById('gist-id').value.trim();
        const auto = document.getElementById('gist-autosync-toggle').classList.contains('on');

        if (gistId && !this.esIdValido(gistId)) {
            this.app.mostrarToast('El Gist ID tiene un formato inválido', 'error');
            return;
        }

        if (token) StorageHelper.setItem(STORAGE_KEYS.GIST_TOKEN, token);
        else StorageHelper.removeItem(STORAGE_KEYS.GIST_TOKEN);

        this.setPerfil({ gistId, gistAuto: auto });

        this.app.mostrarToast(auto ? 'Sincronización automática activada' : 'Configuración guardada', 'success');
        this.app.ui.cerrarModal('modal-gist');
        this.actualizarBotones();
    }

    actualizarBotones() {
        // Mantiene la compatibilidad con el fallback de exportar local en tu UI
        const btnRespaldar = document.getElementById('btn-hist-respaldar');
        const btnRestaurar = document.getElementById('btn-hist-restaurar');
        const tieneGist = this.esIdValido(this.getPerfil().gistId);

        if (!btnRespaldar || !btnRestaurar) return;
        if (tieneGist) {
            btnRespaldar.onclick = () => this.subir();
            btnRestaurar.onclick = () => this.bajar();
            btnRespaldar.querySelector('use').setAttribute('href', '#icon-cloud-upload');
            btnRestaurar.querySelector('use').setAttribute('href', '#icon-cloud-download');
        } else {
            btnRespaldar.onclick = () => this.app.respaldo.abrir();
            btnRestaurar.onclick = () => this.app.storage.importarDatos('combinar');
            btnRespaldar.querySelector('use').setAttribute('href', '#icon-download');
            btnRestaurar.querySelector('use').setAttribute('href', '#icon-upload');
        }
    }

    // Abrir el Gist actual en una pestaña nueva
    irAlGist() {
        const id = document.getElementById('gist-id').value.trim();
        if (this.esIdValido(id)) {
            window.open(`https://gist.github.com/${id}`, '_blank');
        }
    }

    // ── Spinner en el botón de ajustes ──────────────────────
    _spinStart() {
        document.getElementById('header-profile-btn')?.classList.add('icon-btn-spinning');
    }
    _spinStop() {
        document.getElementById('header-profile-btn')?.classList.remove('icon-btn-spinning');
    }

    _setBusy(busy) {
        this._subiendo = busy;
        const btnSubir = document.getElementById('btn-gist-subir');
        const btnBajar = document.getElementById('btn-gist-bajar');
        if (btnSubir) btnSubir.disabled = busy;
        if (btnBajar) btnBajar.disabled = busy;
        if (busy) this._spinStart(); else this._spinStop();
    }

    // ── Subida ────────────────────────────────────────────────
    async _ejecutarSubida(silencioso = false) {
        const token = this.getToken();
        const perfil = this.getPerfil();
        if (!token) { if (!silencioso) this.app.mostrarToast('Falta el token', 'error'); return; }

        this._setBusy(true);
        if (!silencioso) this.app.mostrarToast('Subiendo...', 'info');

        const payload = JSON.stringify(await this.app.storage._construirExportacion(), null, 2);
        const filename = `deltaF_${this.perfilActivo}.json`;

        const url = this.esIdValido(perfil.gistId) ? `https://api.github.com/gists/${perfil.gistId}` : 'https://api.github.com/gists';
        const method = this.esIdValido(perfil.gistId) ? 'PATCH' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: `DeltaF backup — ${perfil.nombre || this.perfilActivo}`,
                    public: false,
                    files: { [filename]: { content: payload } }
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            this.setPerfil({ gistId: data.id, gistLastSync: new Date().toISOString() });

            const elId = document.getElementById('gist-id');
            if (elId) elId.value = data.id;

            if (!silencioso) this.app.mostrarToast('Subida exitosa ✓', 'success');
        } catch (err) {
            console.error(err);
            if (!silencioso) this.app.mostrarToast(`Error al subir: ${err.message}`, 'error');
        } finally {
            this._setBusy(false);
        }
    }

    subir() { this._ejecutarSubida(false); }

    subirAuto() {
        const perfil = this.getPerfil();
        if (!perfil.gistAuto || !this.getToken()) return;
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(async () => {
            if (this._subiendo) return;

            // Guard: si hay un gist existente, comparar tamaño antes de subir
            if (this.esIdValido(perfil.gistId)) {
                try {
                    const remoto = await this._fetchGist(perfil.gistId, this.getToken());
                    if (remoto) {
                        const categorias = this.app.categoria.getCategorias();
                        const payloadLocal = JSON.stringify({ servicios: this.servicios, categorias });
                        const payloadRemoto = JSON.stringify(remoto);
                        const umbral = 0.75;
                        if (payloadLocal.length < payloadRemoto.length * umbral) {
                            console.warn(`AutoSync bloqueado: datos locales (${payloadLocal.length}b) son menos del 75% del remoto (${payloadRemoto.length}b)`);
                            this.app.mostrarToast('⚠️ AutoSync bloqueado: los datos locales son significativamente menores que el backup. Subí manualmente si es intencional.', 'error');
                            return;
                        }
                    }
                } catch (e) {
                    // Si no se puede comparar, dejar pasar (sin internet, etc.)
                    console.warn('AutoSync guard: no se pudo comparar con remoto, se permite la subida.', e);
                }
            }

            this._ejecutarSubida(true);
        }, this.DEBOUNCE_MS);
    }

    // ── Descarga y Novedades ──────────────────────────────────
    async bajar() {
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

        this._spinStart();
        try {
            const data = await this._fetchGist(perfil.gistId, this.getToken());
            if (!data) return;

            // Simular merge para ver qué es nuevo
            const diff = ImportarExportar.simularFusion(this.servicios, data.servicios);
            const nuevasCats = ImportarExportar.categoriasNuevas(this.app.categoria.getCategorias(), data.categorias).length;

            if (diff.serviciosAgregados || diff.facturasAgregadas || diff.facturasActualizadas || diff.ingresosAgregados || nuevasCats) {

                // Mostrar chips de resumen
                const detalle = document.getElementById('gist-novedades-detalle');
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

    async _fetchGist(gistId, token) {
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

        const parsed = JSON.parse(content, SecurityAndUtils.reviverJSONSeguro);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Formato inválido');
        const datos = ImportarExportar.normalizarDatos(parsed.servicios, parsed.categorias);
        await this.app.storage.advertirIntegridad(parsed, 'El archivo del Gist');
        return datos;
    }

    // Muestra el resumen previo (Combinar / Reemplazar) y aplica lo que se elija. Devuelve false si se cancela.
    async confirmarYAplicar(data) {
        const modo = await preguntarMerge({
            origen: 'Gist',
            locales: this.servicios, categoriasLocales: this.app.categoria.getCategorias(),
            remotos: data.servicios, categoriasRemotas: data.categorias,
        });
        if (!modo) return false;
        this.app.storage._aplicarImportacion(modo, data);
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
