import { crudo, montar } from '../core/html.js';
import { SecurityAndUtils } from '../core/seguridad.js';

// ============================================================
// CUSTOM SELECT — dropdown con scroll, sincroniza select oculto
// ============================================================
export class CustomSelect {
    constructor(wrapper, nativeSelect, onChange) {
        this.wrapper = wrapper;
        this.native = nativeSelect;
        this.onChange = onChange;
        this.trigger = wrapper.querySelector('.custom-select-trigger');
        this.labelEl = wrapper.querySelector('.csd-label');
        this.dropdown = wrapper.querySelector('.custom-select-dropdown');
        this._boundClose = this._onOutsideClick.bind(this);
        this._boundEsc = this._onEsc.bind(this);
        this._boundScroll = this._onScroll.bind(this);
        this._boundResize = this._onResize.bind(this);
        // ¿Está dentro de un contenedor con overflow recortado (modal, sidebar…)?
        this._useFixed = !!wrapper.closest('.modal, .modal-content, .menu-ajustes');
        this.trigger.addEventListener('pointerdown', e => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });
        this.refresh();
    }

    refresh() {
        const options = Array.from(this.native.options);
        montar(this.dropdown, crudo(options.map(opt =>
            // opt.value y opt.text vienen decodificados: hay que volver a escaparlos
            `<div class="custom-select-option${opt.selected ? ' selected' : ''}" data-value="${SecurityAndUtils.escapeHtml(opt.value)}">${SecurityAndUtils.escapeHtml(opt.text)}</div>`
        ).join('')));
        this.dropdown.querySelectorAll('.custom-select-option').forEach(el => {
            el.addEventListener('pointerdown', e => {
                e.stopPropagation();
                const startY = e.clientY;
                let moved = false;
                const onMove = mv => { if (Math.abs(mv.clientY - startY) > 6) moved = true; };
                const onUp = up => {
                    el.removeEventListener('pointermove', onMove);
                    el.removeEventListener('pointerup', onUp);
                    el.removeEventListener('pointercancel', onUp);
                    if (!moved) { up.stopPropagation(); this.select(el.dataset.value); }
                };
                el.addEventListener('pointermove', onMove);
                el.addEventListener('pointerup', onUp);
                el.addEventListener('pointercancel', onUp);
            });
        });
        const sel = this.native.options[this.native.selectedIndex];
        this.labelEl.textContent = sel ? sel.text : '';
    }

    select(value) {
        this.native.value = value;
        this.close();
        this._absorbNextEvents();
        this.refresh();
        if (this.onChange) this.onChange();
    }

    _absorbNextEvents() {
        const absorb = e => { e.stopPropagation(); e.preventDefault(); };
        const opts = { capture: true, once: true, passive: false };
        document.addEventListener('click', absorb, opts);
        setTimeout(() => { document.removeEventListener('click', absorb, opts); }, 300);
    }

    toggle() {
        this.wrapper.classList.contains('open') ? this.close() : this.open();
    }

    // Posiciona el dropdown en coordenadas fijas (viewport) cuando el wrapper
    // está dentro de un contenedor con overflow recortado.
    _positionFixed() {
        const rect = this.trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const above = spaceBelow < 260 && spaceAbove > spaceBelow;
        const dd = this.dropdown;
        dd.style.position = 'fixed';
        dd.style.left     = rect.left + 'px';
        dd.style.width    = rect.width + 'px';
        dd.style.right    = 'auto';
        dd.style.zIndex   = '9999';
        if (above) {
            dd.style.top    = 'auto';
            dd.style.bottom = (window.innerHeight - rect.top) + 'px';
            dd.classList.add('dropdown-above');
            dd.classList.remove('dropdown-below');
        } else {
            dd.style.top    = rect.bottom + 'px';
            dd.style.bottom = 'auto';
            dd.classList.add('dropdown-below');
            dd.classList.remove('dropdown-above');
        }
    }

    _clearFixed() {
        const dd = this.dropdown;
        dd.style.position = '';
        dd.style.left     = '';
        dd.style.width    = '';
        dd.style.right    = '';
        dd.style.top      = '';
        dd.style.bottom   = '';
        dd.style.zIndex   = '';
    }

    open() {
        if (this._useFixed) {
            // Mover el dropdown al body para escapar del overflow del modal
            document.body.appendChild(this.dropdown);
            this.dropdown._csdInstance = this; // referencia para cleanup externo
            this._positionFixed();
            this.dropdown.classList.add('csd-fixed');
            // Forzar reflow antes de añadir la clase de animación
            void this.dropdown.offsetWidth;
            this.dropdown.classList.add('csd-open');
        } else {
            const rect = this.wrapper.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            if (spaceBelow < 260 && spaceAbove > spaceBelow) {
                this.dropdown.classList.add('dropdown-above');
                this.dropdown.classList.remove('dropdown-below');
            } else {
                this.dropdown.classList.add('dropdown-below');
                this.dropdown.classList.remove('dropdown-above');
            }
        }
        this.wrapper.classList.add('open');
        document.addEventListener('pointerdown', this._boundClose, true);
        document.addEventListener('keydown', this._boundEsc, true);
        window.addEventListener('scroll', this._boundScroll, { capture: true, passive: true });
        if (this._useFixed) {
            window.addEventListener('resize', this._boundResize, { passive: true });
        }
    }

    close() {
        if (this._useFixed && this.dropdown.parentElement === document.body) {
            this.dropdown.classList.remove('csd-open');
            // Devolver el dropdown a su lugar original en el wrapper tras la transición
            const delay = 150;
            setTimeout(() => {
                if (this.dropdown.parentElement === document.body) {
                    this._clearFixed();
                    this.dropdown.classList.remove('csd-fixed');
                    this.wrapper.appendChild(this.dropdown);
                }
            }, delay);
        }
        this.wrapper.classList.remove('open');
        document.removeEventListener('pointerdown', this._boundClose, true);
        document.removeEventListener('keydown', this._boundEsc, true);
        window.removeEventListener('scroll', this._boundScroll, { capture: true, passive: true });
        window.removeEventListener('resize', this._boundResize);
    }

    _onScroll(e) {
        if (this._useFixed) {
            // En modo fixed: reposicionar si el scroll es dentro del modal,
            // cerrar si es externo
            if (this.dropdown.contains(e.target)) return;
            if (this.wrapper.closest('.modal-content, .menu-ajustes')?.contains(e.target)) {
                this._positionFixed();
            } else {
                this.close();
            }
        } else {
            if (this.wrapper.contains(e.target)) return;
            this.close();
        }
    }

    _onResize() {
        if (this._useFixed) this._positionFixed();
    }

    _onEsc(e) {
        if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }

    _onOutsideClick(e) {
        // En modo fixed, el dropdown está en body — hay que chequear ambos
        if (!this.wrapper.contains(e.target) && !this.dropdown.contains(e.target)) {
            e.preventDefault();
            this.close();
        }
    }
}
