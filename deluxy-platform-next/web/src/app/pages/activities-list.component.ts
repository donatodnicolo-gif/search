import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface Activity {
  id: string;
  type: string;
  status: string;
  scheduledAt?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  address?: string | null;
  delivery?: { id: string; code: number; status: string; recipientAddress?: string | null } | null;
  valet?: { id: string; firstName: string; lastName: string } | null;
}

const STATI: Record<string, { etichetta: string; colore: string }> = {
  pending: { etichetta: 'Da fare', colore: '#B8963E' },
  done: { etichetta: 'Fatta', colore: '#248A3D' },
  skipped: { etichetta: 'Saltata', colore: '#6e6e73' },
};

/**
 * Operatività → Attività: i ritiri e le consegne della giornata.
 *
 * ⚠️ Parte da OGGI e non da «tutte»: in tabella ce ne sono 57.253, di cui 9
 * oggi. Aprire la pagina su tutte significherebbe aspettare una risposta
 * enorme per guardare un elenco che nessuno può leggere.
 */
@Component({
  selector: 'app-activities-list',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'activities.title' | translate }}</h1>
        <p class="page-caption">{{ 'activities.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <div class="quick">
          <button type="button" class="quick-tab" [class.active]="giorno === oggi()" (click)="vaiA(oggi())">
            {{ 'deliveries.quick.today' | translate }}
          </button>
          <button type="button" class="quick-tab" [class.active]="giorno === domani()" (click)="vaiA(domani())">
            {{ 'deliveries.quick.tomorrow' | translate }}
          </button>
          <button type="button" class="quick-tab" [class.active]="!giorno" (click)="vaiA('')">
            {{ 'deliveries.quick.all' | translate }}
          </button>
        </div>
        <input class="field" type="date" [(ngModel)]="giorno" (ngModelChange)="carica()" />
        <button class="btn btn-secondary" (click)="carica()">{{ 'common.refresh' | translate }}</button>
      </div>
    </div>

    <!-- Quando si guarda «tutte» si vede una fetta, e va detto: 57.253 righe
         non stanno in una pagina e fingere di mostrarle tutte è peggio che
         ammettere il taglio. -->
    @if (totale() > mostrate()) {
      <p class="avviso">{{ 'activities.capped' | translate:{ mostrate: mostrate(), totale: totale() } }}</p>
    }

    @if (caricando()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (!attivita().length) {
      <div class="card state-card">
        <strong>{{ 'activities.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'activities.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'activities.col.type' | translate }}</th>
              <th>{{ 'activities.col.time' | translate }}</th>
              <th>{{ 'activities.col.address' | translate }}</th>
              <th>{{ 'activities.col.delivery' | translate }}</th>
              <th>{{ 'activities.col.valet' | translate }}</th>
              <th>{{ 'activities.col.status' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (a of attivita(); track a.id) {
              <tr>
                <td>
                  <span class="tipo" [class.ritiro]="a.type === 'PICKUP'">
                    {{ ('activities.type.' + a.type) | translate }}
                  </span>
                </td>
                <td class="mono">
                  {{ a.scheduledAt ? (a.scheduledAt | date: 'dd/MM') : '—' }}
                  @if (a.timeFrom) { <span class="ora">{{ a.timeFrom }}@if (a.timeTo) {–{{ a.timeTo }}}</span> }
                </td>
                <td>{{ a.address || a.delivery?.recipientAddress || '—' }}</td>
                <td>
                  @if (a.delivery) {
                    <a [routerLink]="['/deliveries', a.delivery.id]" class="mono">#{{ a.delivery.code }}</a>
                  } @else { — }
                </td>
                <td>{{ a.valet ? (a.valet.lastName + ' ' + a.valet.firstName) : '—' }}</td>
                <td>
                  <span class="badge" [style.--c]="colore(a.status)">
                    <i class="dot"></i>{{ etichetta(a.status) }}
                  </span>
                </td>
                <td class="azioni">
                  @if (puoAgire() && a.status !== 'done') {
                    <button type="button" class="act" [disabled]="inCorso() === a.id" (click)="segna(a, 'done')">
                      {{ 'activities.markDone' | translate }}
                    </button>
                  }
                  @if (puoAgire() && a.status === 'done') {
                    <button type="button" class="act" [disabled]="inCorso() === a.id" (click)="segna(a, 'pending')">
                      {{ 'activities.markPending' | translate }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (errore(); as e) { <div class="error-card">{{ e }}</div> }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .quick { display: inline-flex; background: var(--fill, #f5f5f7); border-radius: 980px; padding: 2px; }
      .quick-tab { border: 0; background: none; border-radius: 980px; padding: 6px 14px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .quick-tab.active { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .avviso { margin: 0 0 12px; font-size: 13px; color: var(--gold-strong, #B8963E); font-weight: 550; }
      .tipo { font-size: 12.5px; font-weight: 600; letter-spacing: .02em; }
      .tipo.ritiro { color: var(--text-secondary); }
      .ora { margin-left: 6px; color: var(--text-secondary); }
      .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c); }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .azioni { text-align: right; }
      .act { background: none; border: 0; color: var(--text); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
      .state-card { padding: 28px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
      .mono { font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class ActivitiesListComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly attivita = signal<Activity[]>([]);
  readonly totale = signal(0);
  readonly mostrate = signal(0);
  readonly caricando = signal(true);
  readonly errore = signal<string | null>(null);
  readonly inCorso = signal<string | null>(null);

  /** Si parte da oggi: «tutte» sono 57.253 e nessuno le legge. */
  giorno = this.oggi();

  readonly puoAgire = computed(() =>
    ['ADMIN', 'OPERATION', 'VALET'].includes(this.auth.user()?.role ?? ''),
  );

  etichetta(s: string) { return STATI[s]?.etichetta ?? s; }
  colore(s: string) { return STATI[s]?.colore ?? '#6e6e73'; }

  /**
   * Oggi e domani in ora locale, non UTC.
   *
   * `toISOString()` restituisce il giorno di Greenwich: alle 00:30 italiane là
   * è ancora ieri, e la pagina si aprirebbe sul giorno sbagliato.
   */
  private giornoRelativo(scarto: number): string {
    const d = new Date();
    d.setDate(d.getDate() + scarto);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const gg = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${gg}`;
  }
  oggi(): string { return this.giornoRelativo(0); }
  domani(): string { return this.giornoRelativo(1); }

  vaiA(giorno: string): void {
    this.giorno = giorno;
    this.carica();
  }

  constructor() { this.carica(); }

  carica(): void {
    this.caricando.set(true);
    this.errore.set(null);
    const params: Record<string, string> = {};
    if (this.giorno) params['date'] = this.giorno;
    this.http
      .get<{ items: Activity[]; totale: number; mostrate: number }>(
        `${environment.apiUrl}/activities`, { params },
      )
      .subscribe({
        next: (r) => {
          this.attivita.set(r.items ?? []);
          this.totale.set(r.totale ?? 0);
          this.mostrate.set(r.mostrate ?? 0);
          this.caricando.set(false);
        },
        error: (e) => {
          this.caricando.set(false);
          this.errore.set(e?.error?.message ?? 'Caricamento non riuscito');
        },
      });
  }

  segna(a: Activity, status: string): void {
    this.inCorso.set(a.id);
    this.http.patch(`${environment.apiUrl}/activities/${a.id}/status`, { id: a.id, status }).subscribe({
      next: () => { this.inCorso.set(null); this.carica(); },
      error: (e) => {
        this.inCorso.set(null);
        this.errore.set(e?.error?.message ?? 'Operazione non riuscita');
      },
    });
  }
}
