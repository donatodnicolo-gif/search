// ============================================================
// RICONCILIAZIONI PRODOTTO ↔ PARTNER (04/09/2026, chiesto dall'utente)
// ------------------------------------------------------------
// Sezione di Prodotti per Admin e Operation. L'AI (di notte, o a mano su un
// intervallo di date) legge le vendite accettate dai partner e PROPONE se
// fissare un prodotto su un partner a un prezzo. Qui si decide: «Riconcilia»
// tocca il prodotto, «Ignora» lo lascia com'è. Il lancio manuale mostra
// subito le righe che ha scritto.
// ============================================================
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ConfermaComponent } from '../shared/conferma.component';

interface StatPartner {
  partnerId: string;
  insegna: string;
  attivo: boolean;
  vendite: number;
  quotaPercento: number;
  prezzoMin: number;
  prezzoMax: number;
  prezzoModa: number;
  scontoMedio: number;
}

interface Riga {
  id: string;
  productId: string;
  prodotto: string;
  sku: string | null;
  tipoAttuale: string;
  partnerAttualeId: string | null;
  partnerAttuale: string | null;
  prezzoListino: number;
  conVarianti: boolean;
  da: string;
  a: string;
  vendite: number;
  stats: StatPartner[];
  riconciliare: boolean;
  partnerId: string | null;
  partner: string | null;
  prezzo: number | null;
  motivo: string;
  confidenza: string;
  modello: string;
  stato: 'proposta' | 'nessuna' | 'accettata' | 'rifiutata';
  innesco: string;
  decisaIl: string | null;
  decisaDa: string | null;
  creataIl: string;
}

interface EsitoCorsa {
  analizzati: number;
  proposte: number;
  venditeLette: number;
  prodottiOltreIlTetto: number;
  modello: string | null;
  righe: Riga[];
}

interface UltimaCorsa {
  quando: string;
  ok: boolean;
  analizzati?: number;
  proposte?: number;
  venditeLette?: number;
  errore?: string;
}

@Component({
  selector: 'app-product-reconciliations',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, TranslatePipe, ConfermaComponent],
  providers: [DecimalPipe],
  template: `
    <div class="page-header">
      <div>
        <a class="back" routerLink="/products">{{ 'reconciliations.back' | translate }}</a>
        <h1>{{ 'reconciliations.title' | translate }}</h1>
        <p class="page-caption">{{ 'reconciliations.caption' | translate }}</p>
      </div>
    </div>

    <!-- Lancio manuale su un intervallo personalizzato -->
    <section class="card lancio">
      <label class="fld"><span>{{ 'reconciliations.from' | translate }}</span>
        <input class="field" type="date" name="da" [(ngModel)]="da" [disabled]="analizzando()" />
      </label>
      <label class="fld"><span>{{ 'reconciliations.to' | translate }}</span>
        <input class="field" type="date" name="a" [(ngModel)]="a" [disabled]="analizzando()" />
      </label>
      <button type="button" class="btn btn-primary" [disabled]="analizzando() || !da || !a" (click)="analizza()">
        {{ (analizzando() ? 'reconciliations.running' : 'reconciliations.run') | translate }}
      </button>
      <p class="hint">
        <b>{{ 'reconciliations.lastNight' | translate }}:</b>
        @if (ultima(); as u) {
          {{ u.quando | date: 'dd/MM/yyyy HH:mm' }} —
          @if (u.ok) {
            {{ 'reconciliations.runResult' | translate: { analizzati: u.analizzati, venditeLette: u.venditeLette, proposte: u.proposte } }}
          } @else {
            <span class="ko">{{ 'reconciliations.lastNightError' | translate }}: {{ u.errore }}</span>
          }
        } @else {
          {{ 'reconciliations.lastNightNone' | translate }}
        }
      </p>
      @if (esito(); as e) {
        <p class="esito ok">
          {{ 'reconciliations.runResult' | translate: { analizzati: e.analizzati, venditeLette: e.venditeLette, proposte: e.proposte } }}
          @if (e.prodottiOltreIlTetto > 0) {
            <br />{{ 'reconciliations.runOver' | translate: { n: e.prodottiOltreIlTetto } }}
          }
        </p>
      }
      @if (errore(); as err) {
        <p class="esito ko">{{ err }}</p>
      }
    </section>

    <!-- Filtro sullo stato -->
    <div class="tabs">
      @for (f of filtri; track f) {
        <button type="button" class="tab" [class.on]="filtro() === f" (click)="setFiltro(f)">
          {{ ('reconciliations.filter' + f) | translate }}
        </button>
      }
    </div>

    @if (caricando()) {
      <p class="muted">{{ 'reconciliations.loading' | translate }}</p>
    } @else if (!righe().length) {
      <p class="muted">{{ 'reconciliations.empty' | translate }}</p>
    } @else {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ 'reconciliations.col.product' | translate }}</th>
              <th class="num">{{ 'reconciliations.col.sales' | translate }}</th>
              <th>{{ 'reconciliations.col.partners' | translate }}</th>
              <th>{{ 'reconciliations.col.today' | translate }}</th>
              <th>{{ 'reconciliations.col.proposal' | translate }}</th>
              <th>{{ 'reconciliations.col.reason' | translate }}</th>
              <th>{{ 'reconciliations.col.state' | translate }}</th>
              <th class="azioni">{{ 'reconciliations.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of righe(); track r.id) {
              <tr>
                <td>
                  <a [routerLink]="['/products', r.productId]"><b>{{ r.prodotto }}</b></a>
                  @if (r.sku) { <div class="muted mono">{{ r.sku }}</div> }
                  <div class="muted">{{ r.da | date: 'dd/MM/yy' }} → {{ r.a | date: 'dd/MM/yy' }} · {{ ('reconciliations.trigger_' + r.innesco) | translate }}</div>
                </td>
                <td class="num">{{ r.vendite }}</td>
                <td>
                  @for (s of r.stats; track s.partnerId) {
                    <div class="stat">
                      <b>{{ s.insegna }}</b> {{ s.vendite }} ({{ s.quotaPercento }}%)
                      · @if (s.prezzoMin === s.prezzoMax) { {{ s.prezzoModa | number: '1.2-2' }} € } @else { {{ s.prezzoMin | number: '1.2-2' }}–{{ s.prezzoMax | number: '1.2-2' }} € }
                    </div>
                  }
                </td>
                <td>
                  <div>{{ 'reconciliations.todayLine' | translate: { tipo: r.tipoAttuale, prezzo: fmt(r.prezzoListino) } }}</div>
                  @if (r.partnerAttuale) { <div class="muted">{{ 'reconciliations.todayPartner' | translate: { partner: r.partnerAttuale } }}</div> }
                </td>
                <td>
                  @if (r.riconciliare || r.stato === 'accettata') {
                    <div><b>{{ 'reconciliations.proposalLine' | translate: { partner: r.partner } }}</b></div>
                    <div class="muted">{{ r.prezzo !== null ? ('reconciliations.proposalPrice' | translate: { prezzo: fmt(r.prezzo) }) : ('reconciliations.proposalNoPrice' | translate) }}</div>
                  } @else {
                    <span class="muted">{{ 'reconciliations.noProposal' | translate }}</span>
                  }
                  <div class="conf" [class.alta]="r.confidenza === 'alta'" [class.media]="r.confidenza === 'media'" [class.bassa]="r.confidenza === 'bassa'">
                    {{ 'reconciliations.confidence' | translate: { c: r.confidenza } }}
                  </div>
                </td>
                <td class="motivo">{{ r.motivo }}</td>
                <td>
                  <span class="badge" [class.ok]="r.stato === 'accettata'" [class.warn]="r.stato === 'proposta'" [class.off]="r.stato === 'rifiutata' || r.stato === 'nessuna'">
                    {{ ('reconciliations.state_' + r.stato) | translate }}
                  </span>
                  @if (r.decisaIl) {
                    <div class="muted small">{{ r.decisaIl | date: 'dd/MM/yy HH:mm' }} · {{ r.decisaDa }}</div>
                  }
                </td>
                <td class="azioni">
                  @if (r.stato === 'proposta') {
                    <button type="button" class="btn btn-primary mini" [disabled]="inAzione()" (click)="chiedi(r, 'accetta')">{{ 'reconciliations.accept' | translate }}</button>
                    <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="chiedi(r, 'rifiuta')">{{ 'reconciliations.reject' | translate }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (conferma(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    (confermato)="esegui()" (annullato)="conferma.set(null)" />
    }
  `,
  styles: [
    `
      .back { display: inline-block; margin-bottom: 6px; color: var(--text-secondary); text-decoration: none; font-size: 13px; }
      .back:hover { color: var(--text); }
      .card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; padding: 16px 20px; margin-bottom: 16px; }
      .lancio { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; }
      .lancio .fld { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
      .lancio .hint { flex-basis: 100%; margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
      .esito { flex-basis: 100%; margin: 0; font-size: 13px; }
      .esito.ok { color: var(--success, #1d7a3a); }
      .esito.ko, .ko { color: var(--danger, #b3261e); }
      .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .tab { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text); cursor: pointer; }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .table-wrap { overflow-x: auto; }
      td.num, th.num { text-align: right; }
      td.motivo { max-width: 360px; font-size: 13px; }
      td.azioni { white-space: nowrap; }
      td.azioni .btn + .btn { margin-left: 6px; }
      .stat { font-size: 13px; white-space: nowrap; }
      .muted { color: var(--text-secondary); font-size: 13px; }
      .small { font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .conf { margin-top: 4px; font-size: 12px; color: var(--text-secondary); }
      .conf.alta { color: var(--success, #1d7a3a); }
      .conf.bassa { color: var(--danger, #b3261e); }
      .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; background: var(--fill); }
      .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .badge.ok { color: var(--success, #1d7a3a); background: rgba(29, 122, 58, 0.1); }
      .badge.warn { color: var(--gold, #b8963e); background: rgba(184, 150, 62, 0.12); }
      .badge.off { color: var(--text-secondary); }
      .btn.mini { padding: 4px 12px; font-size: 12px; }
    `,
  ],
})
export class ProductReconciliationsComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly decimal = inject(DecimalPipe);

  readonly filtri = ['Proposte', 'Nessuna', 'Accettate', 'Rifiutate', 'Tutte'] as const;
  readonly filtro = signal<(typeof this.filtri)[number]>('Proposte');
  readonly righe = signal<Riga[]>([]);
  readonly caricando = signal(false);
  readonly analizzando = signal(false);
  readonly inAzione = signal(false);
  readonly esito = signal<EsitoCorsa | null>(null);
  readonly errore = signal<string | null>(null);
  readonly ultima = signal<UltimaCorsa | null>(null);
  readonly conferma = signal<{ titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary'; riga: Riga; azione: 'accetta' | 'rifiuta' } | null>(null);

  /** Intervallo di default: gli ultimi 90 giorni, come la corsa notturna. */
  da = this.iso(new Date(Date.now() - 90 * 86400000));
  a = this.iso(new Date());

  constructor() {
    this.carica();
    this.http.get<UltimaCorsa | null>(`${environment.apiUrl}/riconciliazioni/ultima-corsa`).subscribe({
      next: (u) => this.ultima.set(u),
      error: () => this.ultima.set(null),
    });
  }

  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  fmt(n: number | null): string {
    return n === null ? '' : (this.decimal.transform(n, '1.2-2') ?? String(n));
  }

  private statoDelFiltro(): string {
    const f = this.filtro();
    return f === 'Proposte' ? 'proposta' : f === 'Nessuna' ? 'nessuna' : f === 'Accettate' ? 'accettata' : f === 'Rifiutate' ? 'rifiutata' : 'tutte';
  }

  setFiltro(f: (typeof this.filtri)[number]): void {
    if (this.filtro() === f) return;
    this.filtro.set(f);
    this.carica();
  }

  carica(): void {
    this.caricando.set(true);
    this.http.get<Riga[]>(`${environment.apiUrl}/riconciliazioni`, { params: { stato: this.statoDelFiltro() } }).subscribe({
      next: (r) => {
        this.righe.set(r);
        this.caricando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.caricando.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorRun', { msg: this.msg(e) }));
      },
    });
  }

  /** Lancio manuale: l'esito torna subito, e la tabella mostra le righe scritte. */
  analizza(): void {
    this.analizzando.set(true);
    this.esito.set(null);
    this.errore.set(null);
    this.http.post<EsitoCorsa>(`${environment.apiUrl}/riconciliazioni/analizza`, { da: this.da, a: this.a }).subscribe({
      next: (e) => {
        this.analizzando.set(false);
        this.esito.set(e);
        // Le righe appena scritte, tutte: chi ha lanciato vuole vedere anche i «no».
        this.filtro.set('Tutte');
        this.righe.set(e.righe);
      },
      error: (e: HttpErrorResponse) => {
        this.analizzando.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorRun', { msg: this.msg(e) }));
      },
    });
  }

  chiedi(r: Riga, azione: 'accetta' | 'rifiuta'): void {
    const accetta = azione === 'accetta';
    this.conferma.set({
      riga: r,
      azione,
      titolo: this.translate.instant(accetta ? 'reconciliations.acceptTitle' : 'reconciliations.rejectTitle'),
      messaggio: accetta
        ? this.translate.instant('reconciliations.acceptMsg', {
            prodotto: r.prodotto,
            partner: r.partner,
            prezzo: r.prezzo !== null ? this.translate.instant('reconciliations.acceptPrice', { prezzo: this.fmt(r.prezzo) }) : '',
          })
        : this.translate.instant('reconciliations.rejectMsg'),
      verbo: this.translate.instant(accetta ? 'reconciliations.accept' : 'reconciliations.reject'),
      tono: accetta ? 'primary' : 'danger',
    });
  }

  esegui(): void {
    const c = this.conferma();
    if (!c) return;
    this.conferma.set(null);
    this.inAzione.set(true);
    this.errore.set(null);
    this.http.post<Riga>(`${environment.apiUrl}/riconciliazioni/${c.riga.id}/${c.azione}`, {}).subscribe({
      next: (aggiornata) => {
        this.inAzione.set(false);
        this.righe.update((righe) => righe.map((r) => (r.id === aggiornata.id ? aggiornata : r)));
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  private msg(e: HttpErrorResponse): string {
    const m = (e.error as { message?: string | string[] })?.message;
    return Array.isArray(m) ? m.join(', ') : m || e.message || String(e.status);
  }
}
