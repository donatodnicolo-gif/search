// ============================================================
// RICONCILIAZIONI PRODOTTO × PROVINCIA → PARTNER A UN PREZZO
// (04/09/2026, regola utente — seconda stesura)
// ------------------------------------------------------------
// Sezione di Prodotti per Admin e Operation. Ogni riga è una coppia
// (prodotto non unico, provincia) vista in una vendita accettata: a quale
// partner è andata e a che prezzo. «Accetta» la rende regola: da lì le
// vendite di quel prodotto in quella provincia vanno in automatico a quel
// partner a quel prezzo. «Rifiuta» = non viene più proposta. «Modifica»
// cambia partner, prezzo e sconto, anche su una regola già attiva.
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
  ultimaVendita: string;
}

interface Riga {
  id: string;
  productId: string;
  prodotto: string;
  sku: string | null;
  tipoProdotto: string;
  prezzoListino: number;
  conVarianti: boolean;
  provinceId: string;
  provincia: string | null;
  provinciaCodice: string | null;
  partnerId: string;
  partner: string | null;
  partnerAttivo: boolean;
  prezzo: number;
  sconto: number;
  prezzoPartner: number;
  vendite: number;
  stats: StatPartner[];
  ultimoOrdine: string | null;
  stato: 'proposta' | 'accettata' | 'rifiutata';
  innesco: string;
  decisaIl: string | null;
  decisaDa: string | null;
  aggiornataIl: string;
}

interface EsitoCorsa {
  venditeLette: number;
  coppie: number;
  proposteNuove: number;
  proposteAggiornate: number;
  giaDecise: number;
  righe: Riga[];
}

interface UltimaCorsa {
  quando: string;
  ok: boolean;
  venditeLette?: number;
  proposteNuove?: number;
  proposteAggiornate?: number;
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
            {{ 'reconciliations.runResult' | translate: { vendite: u.venditeLette, nuove: u.proposteNuove, aggiornate: u.proposteAggiornate } }}
          } @else {
            <span class="ko">{{ 'reconciliations.lastNightError' | translate }}: {{ u.errore }}</span>
          }
        } @else {
          {{ 'reconciliations.lastNightNone' | translate }}
        }
      </p>
      @if (esito(); as e) {
        <p class="esito ok">
          {{ 'reconciliations.runResult' | translate: { vendite: e.venditeLette, nuove: e.proposteNuove, aggiornate: e.proposteAggiornate } }}
          @if (e.giaDecise > 0) { · {{ 'reconciliations.runDecided' | translate: { n: e.giaDecise } }} }
          @if (e.venditeLette === 0) { <br />{{ 'reconciliations.runNothing' | translate }} }
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
              <th>{{ 'reconciliations.col.province' | translate }}</th>
              <th>{{ 'reconciliations.col.sales' | translate }}</th>
              <th>{{ 'reconciliations.col.partner' | translate }}</th>
              <th class="num">{{ 'reconciliations.col.price' | translate }}</th>
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
                  <div class="muted">{{ 'reconciliations.listPrice' | translate: { prezzo: fmt(r.prezzoListino) } }}@if (r.ultimoOrdine) { · #{{ r.ultimoOrdine }} }</div>
                </td>
                <td><b>{{ r.provinciaCodice }}</b> <span class="muted">{{ r.provincia }}</span></td>
                <td>
                  @for (s of r.stats; track s.partnerId) {
                    <div class="stat">
                      {{ s.insegna }}: <b>{{ s.vendite }}</b> ({{ s.quotaPercento }}%)
                      · @if (s.prezzoMin === s.prezzoMax) { {{ s.prezzoModa | number: '1.2-2' }} € } @else { {{ s.prezzoMin | number: '1.2-2' }}–{{ s.prezzoMax | number: '1.2-2' }} € }
                    </div>
                  }
                </td>
                @if (modificaId() === r.id) {
                  <td>
                    <select class="field" [(ngModel)]="mod.partnerId" [attr.name]="'partner-' + r.id">
                      @for (p of partnerScelta(); track p.id) {
                        <option [value]="p.id">{{ p.insegna }}</option>
                      }
                    </select>
                  </td>
                  <td class="num mod-prezzo">
                    <label><span>{{ 'reconciliations.editPrice' | translate }}</span>
                      <input class="field num" type="number" min="0" step="0.01" [(ngModel)]="mod.price" [attr.name]="'prezzo-' + r.id" /></label>
                    <label><span>{{ 'reconciliations.editDiscount' | translate }}</span>
                      <input class="field num" type="number" min="0" max="100" step="0.01" [(ngModel)]="mod.discountPercent" [attr.name]="'sconto-' + r.id" /></label>
                    <div class="muted small">{{ 'reconciliations.toPartner' | translate: { prezzo: fmt(nettoMod()) } }}</div>
                  </td>
                } @else {
                  <td>
                    <b>{{ r.partner ?? '—' }}</b>
                    @if (!r.partnerAttivo) { <div class="ko small">{{ 'reconciliations.partnerInactive' | translate }}</div> }
                  </td>
                  <td class="num">
                    <div><b>{{ r.prezzo | number: '1.2-2' }} €</b></div>
                    <div class="muted small">{{ 'reconciliations.toPartner' | translate: { prezzo: fmt(r.prezzoPartner) } }}@if (r.sconto) { · −{{ r.sconto }}% }</div>
                  </td>
                }
                <td>
                  <span class="badge" [class.ok]="r.stato === 'accettata'" [class.warn]="r.stato === 'proposta'" [class.off]="r.stato === 'rifiutata'">
                    {{ ('reconciliations.state_' + r.stato) | translate }}
                  </span>
                  @if (r.decisaIl) {
                    <div class="muted small">{{ r.decisaIl | date: 'dd/MM/yy HH:mm' }} · {{ r.decisaDa }}</div>
                  }
                </td>
                <td class="azioni">
                  @if (modificaId() === r.id) {
                    <button type="button" class="btn btn-primary mini" [disabled]="inAzione()" (click)="salvaModifica(r)">{{ 'common.save' | translate }}</button>
                    <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="modificaId.set(null)">{{ 'common.cancel' | translate }}</button>
                  } @else {
                    @if (r.stato === 'proposta') {
                      <button type="button" class="btn btn-primary mini" [disabled]="inAzione()" (click)="chiedi(r, 'accetta')">{{ 'reconciliations.accept' | translate }}</button>
                      <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="chiedi(r, 'rifiuta')">{{ 'reconciliations.reject' | translate }}</button>
                    }
                    <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="apriModifica(r)">{{ 'reconciliations.edit' | translate }}</button>
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
      td.azioni { white-space: nowrap; }
      td.azioni .btn + .btn { margin-left: 6px; }
      .mod-prezzo label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; text-align: left; }
      .mod-prezzo .field { width: 110px; }
      .stat { font-size: 13px; white-space: nowrap; }
      .muted { color: var(--text-secondary); font-size: 13px; }
      .small { font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
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

  readonly filtri = ['Proposte', 'Accettate', 'Rifiutate', 'Tutte'] as const;
  readonly filtro = signal<(typeof this.filtri)[number]>('Proposte');
  readonly righe = signal<Riga[]>([]);
  readonly caricando = signal(false);
  readonly analizzando = signal(false);
  readonly inAzione = signal(false);
  readonly esito = signal<EsitoCorsa | null>(null);
  readonly errore = signal<string | null>(null);
  readonly ultima = signal<UltimaCorsa | null>(null);
  readonly conferma = signal<{ titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary'; riga: Riga; azione: 'accetta' | 'rifiuta' } | null>(null);

  /** Modifica in riga: partner (fra chi opera nella provincia), prezzo, sconto. */
  readonly modificaId = signal<string | null>(null);
  readonly partnerScelta = signal<{ id: string; insegna: string }[]>([]);
  mod: { partnerId: string; price: number | null; discountPercent: number | null } = { partnerId: '', price: null, discountPercent: null };

  /** Intervallo di default: gli ultimi 90 giorni, come la corsa notturna. */
  da = '';
  a = '';

  constructor() {
    const oggi = new Date();
    this.a = this.iso(oggi);
    this.da = this.iso(new Date(oggi.getTime() - 90 * 86400000));
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

  nettoMod(): number | null {
    if (this.mod.price === null) return null;
    return Math.round(this.mod.price * (1 - (this.mod.discountPercent ?? 0) / 100) * 100) / 100;
  }

  private statoDelFiltro(): string {
    const f = this.filtro();
    return f === 'Proposte' ? 'proposta' : f === 'Accettate' ? 'accettata' : f === 'Rifiutate' ? 'rifiutata' : 'tutte';
  }

  setFiltro(f: (typeof this.filtri)[number]): void {
    if (this.filtro() === f) return;
    this.filtro.set(f);
    this.modificaId.set(null);
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

  /** Lancio manuale: l'esito torna subito, e la tabella mostra le righe toccate. */
  analizza(): void {
    this.analizzando.set(true);
    this.esito.set(null);
    this.errore.set(null);
    this.http.post<EsitoCorsa>(`${environment.apiUrl}/riconciliazioni/analizza`, { da: this.da, a: this.a }).subscribe({
      next: (e) => {
        this.analizzando.set(false);
        this.esito.set(e);
        if (e.righe.length) {
          this.filtro.set('Proposte');
          this.righe.set(e.righe);
        } else {
          this.carica();
        }
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
      messaggio: this.translate.instant(accetta ? 'reconciliations.acceptMsg' : 'reconciliations.rejectMsg', {
        prodotto: r.prodotto,
        provincia: r.provinciaCodice,
        partner: r.partner,
        prezzo: this.fmt(r.prezzo),
      }),
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
        this.sostituisci(aggiornata);
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  apriModifica(r: Riga): void {
    this.mod = { partnerId: r.partnerId, price: r.prezzo, discountPercent: r.sconto };
    this.partnerScelta.set(r.partner ? [{ id: r.partnerId, insegna: r.partner }] : []);
    this.modificaId.set(r.id);
    this.http.get<{ id: string; insegna: string }[]>(`${environment.apiUrl}/riconciliazioni/partner-in-provincia/${r.provinceId}`).subscribe({
      next: (lista) => {
        // Il partner di oggi resta selezionabile anche se non opera più lì: si vede, non sparisce.
        const conAttuale = lista.some((p) => p.id === r.partnerId) || !r.partner ? lista : [{ id: r.partnerId, insegna: r.partner! }, ...lista];
        this.partnerScelta.set(conAttuale);
      },
    });
  }

  salvaModifica(r: Riga): void {
    this.inAzione.set(true);
    this.errore.set(null);
    this.http.put<Riga>(`${environment.apiUrl}/riconciliazioni/${r.id}`, {
      partnerId: this.mod.partnerId,
      price: this.mod.price,
      discountPercent: this.mod.discountPercent ?? 0,
    }).subscribe({
      next: (aggiornata) => {
        this.inAzione.set(false);
        this.modificaId.set(null);
        this.sostituisci(aggiornata);
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  /** La riga aggiornata prende il posto della vecchia; se non rientra più nel filtro, sparisce. */
  private sostituisci(aggiornata: Riga): void {
    const stato = this.statoDelFiltro();
    this.righe.update((righe) =>
      stato === 'tutte' || aggiornata.stato === stato
        ? righe.map((r) => (r.id === aggiornata.id ? aggiornata : r))
        : righe.filter((r) => r.id !== aggiornata.id),
    );
  }

  private msg(e: HttpErrorResponse): string {
    const m = (e.error as { message?: string | string[] })?.message;
    return Array.isArray(m) ? m.join(', ') : m || e.message || String(e.status);
  }
}
