import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * LA CONFERMA NARRATIVA — il canone del Libro §7, in un componente solo.
 *
 * Sostituisce i `window.confirm()` e i `prompt()` sparsi (8 punti censiti il
 * 28/08/2026): il popup del browser non dice le conseguenze, non ha il verbo
 * sul bottone, non si stila e su mobile è minuscolo.
 *
 * Il canone che implementa:
 *  - il NOME dell'oggetto nel titolo («Elimino "Ordini"?» — mai «Sei sicuro?»);
 *  - le CONSEGUENZE nel corpo;
 *  - il bottone rosso COL VERBO, a destra, MAI a fuoco di default
 *    (il fuoco parte su «Annulla»: legge 2);
 *  - ✕ obbligatoria, Esc e click sullo scrim chiudono (§9);
 *  - `role="dialog"` + `aria-modal`.
 *
 * `conMotivo` aggiunge un campo di testo (per i rifiuti che pretendono una
 * ragione — il posto dove prima c'era un `prompt()`).
 */
@Component({
  selector: 'app-conferma',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="cf-scrim" (click)="annulla()" role="presentation">
      <div class="cf-box" role="dialog" aria-modal="true" [attr.aria-label]="titolo"
           (click)="$event.stopPropagation()">
        <button type="button" class="cf-x" (click)="annulla()"
                [attr.aria-label]="'common.cancel' | translate">✕</button>
        <h2>{{ titolo }}</h2>
        @if (messaggio) { <p class="cf-msg">{{ messaggio }}</p> }
        @if (conMotivo) {
          <label class="cf-fld">
            <span class="req">{{ motivoLabel }}</span>
            <textarea class="field" rows="3" [(ngModel)]="motivo" name="cfMotivo" #campoMotivo></textarea>
          </label>
        }
        <div class="cf-azioni">
          <button type="button" class="btn btn-secondary" #annullaBtn (click)="annulla()">
            {{ 'common.cancel' | translate }}
          </button>
          <button type="button" class="btn" [class.pericolo]="tono === 'danger'"
                  [class.btn-primary]="tono !== 'danger'"
                  [disabled]="conMotivo && !motivo.trim()"
                  (click)="conferma()">
            {{ verbo }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .cf-scrim { position: fixed; inset: 0; background: var(--scrim); z-index: 95;
        display: grid; place-items: center; padding: 20px; }
      .cf-box { position: relative; background: var(--surface); border-radius: var(--radius-l);
        box-shadow: var(--shadow-float); padding: 22px 24px; width: min(92vw, 440px);
        max-height: min(92dvh, 640px); overflow-y: auto; }
      h2 { margin: 0 0 8px; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; padding-right: 30px; }
      .cf-msg { margin: 0 0 6px; font-size: 14px; color: var(--text-secondary); line-height: 1.5; }
      .cf-fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
      .cf-fld > span { font-size: 12.5px; font-weight: 500; color: var(--text-secondary); }
      .cf-fld textarea { resize: vertical; font-family: inherit; }
      .cf-azioni { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
      /* Il rosso pieno solo sul passo di conferma, col verbo (§3). */
      .btn.pericolo { background: var(--red); color: #fff; }
      .btn.pericolo:hover { filter: brightness(0.92); }
      .cf-x { position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border: none;
        border-radius: 50%; background: var(--fill-hover); color: var(--text); cursor: pointer; font-size: 13px; }
      .cf-x:hover { background: var(--fill-active); }
      .cf-x:focus-visible, .btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
    `,
  ],
})
export class ConfermaComponent implements AfterViewInit {
  @Input({ required: true }) titolo = '';
  @Input() messaggio = '';
  @Input({ required: true }) verbo = '';
  @Input() tono: 'danger' | 'primary' = 'danger';
  @Input() conMotivo = false;
  @Input() motivoLabel = '';

  @Output() confermato = new EventEmitter<string>();
  @Output() annullato = new EventEmitter<void>();

  motivo = '';

  @ViewChild('annullaBtn') private annullaBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('campoMotivo') private campoMotivo?: ElementRef<HTMLTextAreaElement>;

  /**
   * Il fuoco parte su «Annulla» (la distruttiva MAI a fuoco di default) —
   * ma se c'è il motivo da scrivere, parte dal campo: è il primo gesto utile.
   */
  ngAfterViewInit(): void {
    (this.conMotivo ? this.campoMotivo : this.annullaBtn)?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  suEscape(): void {
    this.annulla();
  }

  conferma(): void {
    if (this.conMotivo && !this.motivo.trim()) return;
    this.confermato.emit(this.motivo.trim());
  }

  annulla(): void {
    this.annullato.emit();
  }
}
