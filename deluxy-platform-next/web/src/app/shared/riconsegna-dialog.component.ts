import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface ConsegnaTrovata {
  id: string;
  code: number;
  date?: string | null;
  status: string;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  recipientAddress?: string | null;
  parentDelivery?: { id: string; code: number } | null;
}

/**
 * ⭐ 07/09/2026 (regola utente) — LA RICONSEGNA: agganciare o creare.
 *
 * «Per le consegne, nel caso di riconsegna, consenti di agganciare a un'altra consegna
 * senza ricrearne una nuova cercando id o indirizzo, oppure chiedi se vuole crearla nuova.»
 *
 * Prima il bottone portava dritto al modulo di una consegna nuova, e quando la riconsegna
 * era già stata inserita (dal partner, dal Customer Service, o a mano) si finiva con due
 * consegne per lo stesso lavoro: due fatture e due paghe. Adesso la domanda si fa prima.
 *
 * La ricerca è quella dell'elenco (`GET /deliveries?q=`), che guarda numero, destinatario,
 * indirizzo e DDT: si cerca «12892» come «via Solferino» e si trova la stessa cosa.
 */
@Component({
  selector: 'app-riconsegna-dialog',
  standalone: true,
  imports: [DatePipe, FormsModule, TranslatePipe],
  template: `
    <div class="velo" (click)="chiudi.emit()"></div>
    <div class="finestra" role="dialog" aria-modal="true" [attr.aria-label]="'riconsegna.titolo' | translate">
      <header>
        <div>
          <h2>{{ 'riconsegna.titolo' | translate }}</h2>
          <p class="sub">{{ 'riconsegna.sotto' | translate: { numero: code } }}</p>
        </div>
        <button type="button" class="chiudi" [attr.aria-label]="'common.close' | translate" (click)="chiudi.emit()">✕</button>
      </header>

      <div class="scelte">
        <button type="button" class="scelta" [class.on]="modo() === 'aggancia'" (click)="modo.set('aggancia')">
          <b>{{ 'riconsegna.agganciaTitolo' | translate }}</b>
          <span>{{ 'riconsegna.agganciaSotto' | translate }}</span>
        </button>
        <button type="button" class="scelta" (click)="creaNuova()">
          <b>{{ 'riconsegna.nuovaTitolo' | translate }}</b>
          <span>{{ 'riconsegna.nuovaSotto' | translate }}</span>
        </button>
      </div>

      @if (modo() === 'aggancia') {
        <div class="cerca">
          <input class="field" type="search" [(ngModel)]="q" name="q" (keyup.enter)="cerca()"
                 [attr.placeholder]="'riconsegna.cercaPh' | translate" [attr.aria-label]="'riconsegna.cercaPh' | translate" />
          <button type="button" class="btn btn-secondary" (click)="cerca()" [disabled]="caricando()">
            {{ 'common.search' | translate }}
          </button>
        </div>
        @if (errore(); as e) { <p class="errore">{{ e }}</p> }
        @if (caricando()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
        @else if (risultati().length) {
          <ul class="risultati">
            @for (r of risultati(); track r.id) {
              <li>
                <div class="chi">
                  <b>#{{ r.code }}</b>
                  <span class="muted">{{ r.date ? (r.date | date: 'dd/MM/yyyy') : '—' }}</span>
                  <span>{{ r.recipientFirstName }} {{ r.recipientLastName }}</span>
                  <span class="muted">{{ r.recipientAddress }}</span>
                  @if (r.parentDelivery) {
                    <span class="gia">{{ 'riconsegna.giaLegata' | translate: { numero: r.parentDelivery.code } }}</span>
                  }
                </div>
                <button type="button" class="btn btn-primary small"
                        [disabled]="inCorso() === r.id || !!r.parentDelivery || r.id === deliveryId"
                        (click)="aggancia(r)">
                  {{ 'riconsegna.aggancia' | translate }}
                </button>
              </li>
            }
          </ul>
        } @else if (cercato()) {
          <p class="muted">{{ 'riconsegna.nessuna' | translate }}</p>
        }
      }
    </div>
  `,
  styles: [
    `
      .velo { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 95; }
      .finestra {
        position: fixed; z-index: 96; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: min(680px, calc(100vw - 32px)); max-height: min(80vh, 640px); overflow: auto;
        background: var(--surface); border-radius: var(--radius-l, 16px); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
        padding: 20px 22px 22px;
      }
      header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
      .sub { margin: 3px 0 0; font-size: 13px; color: var(--text-secondary); }
      .chiudi { border: 0; background: none; font-size: 16px; line-height: 1; cursor: pointer; color: var(--text-secondary); padding: 4px; }
      .scelte { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
      @media (max-width: 560px) { .scelte { grid-template-columns: 1fr; } }
      .scelta {
        text-align: left; font: inherit; cursor: pointer; padding: 12px 14px; border-radius: 12px;
        border: 1px solid var(--hairline); background: var(--surface); display: grid; gap: 3px;
      }
      .scelta:hover { background: var(--fill); }
      .scelta.on { border-color: var(--text); box-shadow: inset 0 0 0 1px var(--text); }
      .scelta b { font-size: 14px; font-weight: 600; }
      .scelta span { font-size: 12.5px; color: var(--text-secondary); }
      .cerca { display: flex; gap: 8px; margin-bottom: 12px; }
      .cerca .field { flex: 1; }
      .risultati { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .risultati li {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 8px 10px; border: 1px solid var(--hairline); border-radius: 10px;
      }
      .chi { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; font-size: 13.5px; min-width: 0; }
      .muted { color: var(--text-secondary); font-size: 12.5px; }
      .gia { font-size: 11.5px; font-weight: 600; padding: 1px 8px; border-radius: 980px; background: var(--fill); color: var(--text-secondary); }
      .errore { color: var(--red, #d70015); font-size: 13px; margin: 0 0 8px; }
      .btn.small { padding: 5px 12px; font-size: 12.5px; }
    `,
  ],
})
export class RiconsegnaDialogComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** La consegna NON CONSEGNATA da cui parte la riconsegna. */
  @Input({ required: true }) deliveryId!: string;
  @Input() code: number | string = '';
  @Output() chiudi = new EventEmitter<void>();
  /** Emesso dopo un aggancio riuscito: chi ospita la finestra ricarica. */
  @Output() agganciata = new EventEmitter<{ id: string; code: number }>();

  readonly modo = signal<'scegli' | 'aggancia'>('scegli');
  readonly risultati = signal<ConsegnaTrovata[]>([]);
  readonly caricando = signal(false);
  readonly cercato = signal(false);
  readonly errore = signal<string | null>(null);
  readonly inCorso = signal<string | null>(null);
  q = '';

  creaNuova(): void {
    this.chiudi.emit();
    void this.router.navigate(['/deliveries/new'], { queryParams: { riconsegna: this.deliveryId } });
  }

  cerca(): void {
    const q = this.q.trim();
    if (!q) return;
    this.caricando.set(true);
    this.errore.set(null);
    // `view=tutte`: la riconsegna può essere già stata consegnata, e cercarla solo fra le
    // attive vorrebbe dire non trovare proprio il caso più comune.
    this.http
      .get<{ items: ConsegnaTrovata[] }>(`${environment.apiUrl}/deliveries`, {
        params: { q, view: 'tutte', pageSize: 10 } as any,
      })
      .subscribe({
        next: (d) => {
          this.risultati.set((d.items ?? []).filter((x) => x.id !== this.deliveryId));
          this.caricando.set(false);
          this.cercato.set(true);
        },
        error: (e) => {
          this.caricando.set(false);
          this.cercato.set(true);
          this.errore.set(e?.error?.message ?? 'Ricerca non riuscita');
        },
      });
  }

  aggancia(r: ConsegnaTrovata): void {
    this.inCorso.set(r.id);
    this.http.post(`${environment.apiUrl}/deliveries/${this.deliveryId}/riconsegna/${r.id}`, {}).subscribe({
      next: () => {
        this.inCorso.set(null);
        this.agganciata.emit({ id: r.id, code: r.code });
        this.chiudi.emit();
      },
      error: (e) => {
        this.inCorso.set(null);
        this.errore.set(e?.error?.message ?? 'Aggancio non riuscito');
      },
    });
  }
}
