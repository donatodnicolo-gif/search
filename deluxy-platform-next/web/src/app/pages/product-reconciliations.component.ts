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
import { Component, computed, inject, signal } from '@angular/core';
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
  /** ⭐ Il PATTO: quanto incassa il partner per quel prodotto in quella provincia. */
  prezzoPartner: number;
  /** La consegna nata dall'ultima vendita vista: si guarda per capire il caso. */
  consegnaId: string | null;
  consegnaCodice: number | null;
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
      <!-- ⭐ 04/09 (regola utente): partner esclusi — le loro vendite non
           generano proposte e non si possono scegliere nella modifica. -->
      <div class="esclusi">
        <b>{{ 'reconciliations.excluded.title' | translate }}:</b>
        @if (esclusi().length) {
          @for (p of esclusi(); track p.id) {
            <span class="chip">{{ p.insegna }}
              <button type="button" class="x" [disabled]="inAzione()" (click)="togliEscluso(p.id)"
                      [attr.aria-label]="'reconciliations.excluded.remove' | translate">×</button>
            </span>
          }
        } @else {
          <span class="muted">{{ 'reconciliations.excluded.none' | translate }}</span>
        }
        <select class="field mini" name="nuovoEscluso" [(ngModel)]="nuovoEscluso" [disabled]="inAzione()">
          <option value="">{{ 'reconciliations.excluded.add' | translate }}</option>
          @for (p of partnerAttivi(); track p.id) {
            <option [value]="p.id">{{ p.insegna }}</option>
          }
        </select>
        <button type="button" class="btn btn-secondary mini" [disabled]="inAzione() || !nuovoEscluso" (click)="aggiungiEscluso()">
          {{ 'reconciliations.excluded.addBtn' | translate }}
        </button>
        @if (regoleColpite() > 0) {
          <span class="ko small">{{ 'reconciliations.excluded.rules' | translate: { n: regoleColpite() } }}</span>
        }
      </div>
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
              <!-- ⭐ 05/09/2026 (regola utente): la tabella si ordina. Il
                   click sull'intestazione ordina, il secondo click inverte.
                   L'ordinamento è QUI in pagina, sulle righe già caricate: le
                   proposte aperte sono poche decine e non c'è impaginazione,
                   quindi non serve rifare il giro al server. -->
              <th class="sortable" (click)="ordinaPer('prodotto')">{{ 'reconciliations.col.product' | translate }}<span class="sort-ind">{{ segno('prodotto') }}</span></th>
              <th class="sortable" (click)="ordinaPer('provincia')">{{ 'reconciliations.col.province' | translate }}<span class="sort-ind">{{ segno('provincia') }}</span></th>
              <th class="sortable" (click)="ordinaPer('consegna')">{{ 'reconciliations.col.delivery' | translate }}<span class="sort-ind">{{ segno('consegna') }}</span></th>
              <th class="sortable" (click)="ordinaPer('vendite')">{{ 'reconciliations.col.sales' | translate }}<span class="sort-ind">{{ segno('vendite') }}</span></th>
              <th class="sortable" (click)="ordinaPer('partner')">{{ 'reconciliations.col.partner' | translate }}<span class="sort-ind">{{ segno('partner') }}</span></th>
              <th class="num sortable" (click)="ordinaPer('prezzoPartner')">{{ 'reconciliations.col.price' | translate }}<span class="sort-ind">{{ segno('prezzoPartner') }}</span></th>
              <th class="num sortable" (click)="ordinaPer('prezzo')">{{ 'reconciliations.col.publicPrice' | translate }}<span class="sort-ind">{{ segno('prezzo') }}</span></th>
              <th class="sortable" (click)="ordinaPer('stato')">{{ 'reconciliations.col.state' | translate }}<span class="sort-ind">{{ segno('stato') }}</span></th>
              <th class="azioni">{{ 'reconciliations.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of righeOrdinate(); track r.id) {
              <tr>
                <td>
                  <a [routerLink]="['/products', r.productId]"><b>{{ r.prodotto }}</b></a>
                  @if (r.sku) { <div class="muted mono">{{ r.sku }}</div> }
                  <div class="muted">{{ 'reconciliations.listPrice' | translate: { prezzo: fmt(r.prezzoListino) } }}@if (r.ultimoOrdine) { · #{{ r.ultimoOrdine }} }</div>
                </td>
                <td><b>{{ r.provinciaCodice }}</b> <span class="muted">{{ r.provincia }}</span></td>
                <td>
                  @if (r.consegnaId) {
                    <a [routerLink]="['/deliveries', r.consegnaId]">#{{ r.consegnaCodice }}</a>
                  } @else { <span class="muted">—</span> }
                  @if (r.ultimoOrdine) { <div class="muted small">ord. #{{ r.ultimoOrdine }}</div> }
                </td>
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
                    <label><span>{{ 'reconciliations.editPartnerPrice' | translate }}</span>
                      <input class="field num" type="number" min="0" step="0.01" [(ngModel)]="mod.partnerPrice" [attr.name]="'netto-' + r.id" /></label>
                  </td>
                  <td class="num muted">{{ r.prezzo | number: '1.2-2' }} €</td>
                } @else {
                  <td>
                    <b>{{ r.partner ?? '—' }}</b>
                    @if (!r.partnerAttivo) { <div class="ko small">{{ 'reconciliations.partnerInactive' | translate }}</div> }
                  </td>
                  <td class="num"><b>{{ r.prezzoPartner | number: '1.2-2' }} €</b></td>
                  <td class="num">
                    {{ r.prezzo | number: '1.2-2' }} €
                    @if (r.sconto) { <div class="muted small">−{{ r.sconto }}%</div> }
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
      th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
      th.sortable:hover { color: var(--text-primary); }
      .sort-ind { font-size: 11px; opacity: .75; }
      .back { display: inline-block; margin-bottom: 6px; color: var(--text-secondary); text-decoration: none; font-size: 13px; }
      .back:hover { color: var(--text); }
      .card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; padding: 16px 20px; margin-bottom: 16px; }
      .lancio { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; }
      .lancio .fld { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
      .lancio .hint { flex-basis: 100%; margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
      .esclusi { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; padding-top: 10px; border-top: 1px solid var(--hairline); }
      .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--fill); border-radius: 980px; padding: 3px 6px 3px 12px; }
      .chip .x { border: 0; background: none; font-size: 15px; line-height: 1; cursor: pointer; color: var(--text-secondary); padding: 0 4px; }
      .chip .x:hover { color: var(--danger, #b3261e); }
      .field.mini { padding: 4px 10px; font-size: 12px; max-width: 240px; }
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

  // ============================================================
  // ORDINAMENTO DELLA TABELLA (05/09/2026, chiesto dall'utente)
  // ------------------------------------------------------------
  // ⚠️ Ordinare NON è filtrare: nessuna riga sparisce, e le righe senza il
  // valore su cui si ordina (una proposta senza consegna, un partner vuoto)
  // finiscono IN FONDO in tutti e due i versi — se andassero in cima
  // scendendo, l'inversione sembrerebbe nasconderle.
  // ============================================================
  readonly ordine = signal<string>('');
  readonly verso = signal<'asc' | 'desc'>('asc');

  ordinaPer(campo: string): void {
    if (this.ordine() === campo) { this.verso.set(this.verso() === 'asc' ? 'desc' : 'asc'); return; }
    this.ordine.set(campo);
    this.verso.set('asc');
  }

  segno(campo: string): string {
    if (this.ordine() !== campo) return '';
    return this.verso() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Il valore su cui si confronta. `null` = «non ce l'ha»: va in fondo. */
  private valore(r: Riga, campo: string): string | number | null {
    switch (campo) {
      case 'prodotto': return (r.prodotto ?? '').toLowerCase();
      case 'provincia': return (r.provinciaCodice ?? '').toLowerCase() || null;
      case 'consegna': return r.consegnaCodice ?? null;
      case 'vendite': return r.vendite ?? 0;
      case 'partner': return (r.partner ?? '').toLowerCase() || null;
      case 'prezzoPartner': return r.prezzoPartner ?? null;
      case 'prezzo': return r.prezzo ?? null;
      case 'stato': return r.stato ?? null;
      default: return null;
    }
  }

  readonly righeOrdinate = computed<Riga[]>(() => {
    const campo = this.ordine();
    const righe = this.righe();
    if (!campo) return righe;
    const giu = this.verso() === 'desc' ? -1 : 1;
    // Copia: `sort` lavora sul posto e muterebbe il segnale.
    return [...righe].sort((a, b) => {
      const va = this.valore(a, campo);
      const vb = this.valore(b, campo);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;   // i vuoti sempre in fondo,
      if (vb === null) return -1;  // in tutti e due i versi
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * giu;
      // I testi si confrontano come li legge una persona (à dopo a, 10 dopo 9).
      return String(va).localeCompare(String(vb), 'it', { numeric: true }) * giu;
    });
  });
  readonly caricando = signal(false);
  readonly analizzando = signal(false);
  readonly inAzione = signal(false);
  readonly esito = signal<EsitoCorsa | null>(null);
  readonly errore = signal<string | null>(null);
  readonly ultima = signal<UltimaCorsa | null>(null);
  readonly conferma = signal<{ titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary'; riga: Riga; azione: 'accetta' | 'rifiuta' } | null>(null);

  /** Modifica in riga: partner (fra chi opera nella provincia), prezzo, sconto. */
  readonly esclusi = signal<{ id: string; insegna: string }[]>([]);
  readonly partnerAttivi = signal<{ id: string; insegna: string }[]>([]);
  readonly regoleColpite = signal(0);
  nuovoEscluso = '';

  readonly modificaId = signal<string | null>(null);
  readonly partnerScelta = signal<{ id: string; insegna: string }[]>([]);
  mod: { partnerId: string; partnerPrice: number | null } = { partnerId: '', partnerPrice: null };

  /** Intervallo di default: gli ultimi 90 giorni, come la corsa notturna. */
  da = '';
  a = '';

  constructor() {
    const oggi = new Date();
    this.a = this.iso(oggi);
    this.da = this.iso(new Date(oggi.getTime() - 90 * 86400000));
    this.carica();
    this.caricaEsclusi();
    this.http.get<UltimaCorsa | null>(`${environment.apiUrl}/riconciliazioni/ultima-corsa`).subscribe({
      next: (u) => this.ultima.set(u),
      error: () => this.ultima.set(null),
    });
  }

  caricaEsclusi(): void {
    this.http.get<{ partner: { id: string; insegna: string }[] }>(`${environment.apiUrl}/riconciliazioni/esclusi`)
      .subscribe({ next: (e) => this.esclusi.set(e.partner) });
    this.http.get<{ id: string; insegna: string }[]>(`${environment.apiUrl}/riconciliazioni/partner-attivi`)
      .subscribe({ next: (l) => this.partnerAttivi.set(l) });
  }

  aggiungiEscluso(): void {
    if (!this.nuovoEscluso) return;
    this.scriviEsclusi([...this.esclusi().map((p) => p.id), this.nuovoEscluso]);
  }

  togliEscluso(id: string): void {
    this.scriviEsclusi(this.esclusi().map((p) => p.id).filter((x) => x !== id));
  }

  private scriviEsclusi(partnerIds: string[]): void {
    this.inAzione.set(true);
    this.errore.set(null);
    this.http.put<{ partner: { id: string; insegna: string }[]; regoleAttive: number }>(
      `${environment.apiUrl}/riconciliazioni/esclusi`, { partnerIds },
    ).subscribe({
      next: (e) => {
        this.inAzione.set(false);
        this.nuovoEscluso = '';
        this.esclusi.set(e.partner);
        this.regoleColpite.set(e.regoleAttive);
        this.caricaEsclusi();
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** ⚠️ Anche `undefined`: un numero che non c'è si scrive «—», mai «undefined». */
  fmt(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : (this.decimal.transform(n, '1.2-2') ?? String(n));
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
    this.mod = { partnerId: r.partnerId, partnerPrice: r.prezzoPartner };
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
      partnerPrice: this.mod.partnerPrice,
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
