import { Component, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';

export interface StatusOption {
  value: string;
  label: string;
  /** Classe pillola: s-active | s-inactive | s-blocked | pill-neutral */
  cls: string;
}

/**
 * Pillola di stato modificabile inline: mostra lo stato corrente e, se
 * `editable`, al clic apre un menu per cambiarlo (senza aprire la scheda).
 * Non fa la chiamata: emette `changed`; è il genitore a salvare e aggiornare
 * il valore (aggiornamento ottimistico + rollback in caso di errore).
 */
@Component({
  selector: 'app-status-select',
  standalone: true,
  template: `
    <div class="ss" (click)="$event.stopPropagation()">
      <button
        type="button"
        class="pill"
        [class]="currentClass()"
        [class.editable]="editable"
        [disabled]="!editable || saving()"
        (click)="toggle()"
      >
        <span class="dot"></span>{{ currentLabel() }}
        @if (editable) { <span class="caret">▾</span> }
      </button>
      @if (open()) {
        <div class="menu">
          @for (o of options; track o.value) {
            <button type="button" class="opt" [class]="o.cls" (click)="select(o.value)">
              <span class="dot"></span>{{ o.label }}
              @if (o.value === value) { <span class="check">✓</span> }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .ss { position: relative; display: inline-block; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border: none; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; font-family: inherit; cursor: default; }
      .pill.editable { cursor: pointer; padding-right: 8px; }
      .pill.editable:hover { filter: brightness(0.97); }
      .pill:disabled { cursor: default; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .caret { font-size: 9px; opacity: 0.6; margin-left: 1px; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .s-active { background: rgba(36,138,61,0.12); color: var(--green); }
      .s-inactive { background: rgba(255,149,0,0.12); color: #b25000; }
      .s-blocked { background: rgba(215,0,21,0.09); color: var(--red); }
      .menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; min-width: 150px; background: var(--surface); border: 1px solid var(--hairline-strong); border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.14); padding: 5px; display: flex; flex-direction: column; gap: 2px; }
      .opt { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; border: none; background: none; border-radius: 8px; padding: 7px 9px; font-size: 12.5px; font-weight: 550; font-family: inherit; cursor: pointer; }
      .opt:hover { background: var(--fill); }
      .opt .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .opt .check { margin-left: auto; opacity: 0.7; }
    `,
  ],
})
export class StatusSelectComponent {
  @Input() value = '';
  @Input() options: StatusOption[] = [];
  @Input() editable = false;
  @Output() changed = new EventEmitter<string>();

  readonly open = signal(false);
  readonly saving = signal(false);

  currentClass(): string {
    return this.options.find((o) => o.value === this.value)?.cls ?? 'pill-neutral';
  }

  currentLabel(): string {
    return this.options.find((o) => o.value === this.value)?.label ?? this.value;
  }

  toggle(): void {
    if (this.editable && !this.saving()) this.open.set(!this.open());
  }

  select(value: string): void {
    this.open.set(false);
    if (value !== this.value) this.changed.emit(value);
  }

  /** Chiude il menu al clic fuori dal componente. */
  @HostListener('document:click')
  onDocClick(): void {
    if (this.open()) this.open.set(false);
  }
}
