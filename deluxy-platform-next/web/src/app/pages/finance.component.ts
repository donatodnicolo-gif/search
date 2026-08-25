import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface CorrispettivoRow {
  deliveryId: string;
  deliveryCode: number;
  /** L'id della vendita: nell'app reale sta accanto a quello della consegna. */
  saleRef: string | null;
  status: string;
  date: string;
  product: string;
  category: string | null;
  service: string;
  partner: string;
  /** Prezzo pubblico: somma dei prezzi scritti sulle righe di consegna. */
  publicPrice: number;
  deliveryFee: number;
  saleValue: number;
  /** Quello che abbiamo DATO al partner: sta scritto sulla consegna. */
  partnerPrice: number;
  /** Guadagno lordo: pubblico - dato al partner. */
  takings: number;
  /** Guadagno al netto IVA: e' il guadagno vero. */
  takingsNet: number;
  /** La quota che sarebbe spettata a listino, per confronto. */
  feeContract: number;
  feePercent: number;
  /** La fee scritta in anagrafica. */
  feePercentContract: number;
  deliveryCost: number;
  vat: number;
  incassiCommission: number;
  totalMargin: number;
  totalMarginPercent: number;
  /** Perche' la riga non e' attendibile. */
  anomalia: 'partner_oltre_pubblico' | 'venduto_a_zero' | 'valore_partner_mancante' | null;
}

/** Il riepilogo di un ordine: importi che stanno a monte delle sue consegne. */
interface RecapOrdine {
  saleRef: string;
  consegne: number;
  saleValue: number;
  deliveryFee: number;
  deliveryCost: number;
  partnerPrice: number;
  takings: number;
  consegnePagate: number;
}

interface Summary {
  deliveries: number;
  /** Consegne a buon fine del periodo che non sono vendite: restano fuori. */
  excluded: number;
  /** Righe col prezzo sbagliato all'origine. */
  anomalie: number;
  /** Quando la ricerca non trova niente: dove sta quello che si cercava. */
  altrove: { totale: number; annullate: number; fuoriPeriodo: number; nonVendite: number } | null;
  publicPrice: number;
  deliveryFee: number;
  saleValue: number;
  partnerPrice: number;
  takings: number;
  takingsNet: number;
  feeContract: number;
  feePercent: number;
  deliveryCost: number;
  vat: number;
  incassiCommission: number;
  totalMargin: number;
  totalMarginPercent: number;
  /** Gli ordini del periodo, col loro riepilogo. */
  ordini: RecapOrdine[];
  /** Ordini in cui risulta pagata piu' di una consegna. */
  ordiniConPiuPaghe: number;
}

/**
 * Finanza (§3.8 dell'app reale): tab CORRISPETTIVI (una riga per consegna a
 * buon fine con i valori economici e i margini, riga Totale in fondo) e tab
 * MARGINI (i totali del periodo). Riservata agli admin. Le formule sono quelle
 * verificate sull'app reale (vedi finance.module.ts e il manuale).
 *
 * ⚠️ AMBITO: entrambe le tab guardano SOLO i servizi di tipo VENDITA. Le altre
 * consegne (sola consegna, a ora, magazzino, aziendale) non sono vendite: li'
 * il partner e' il cliente e la consegna gli viene fatturata, quindi le stesse
 * formule darebbero numeri senza significato. Quante ne restano fuori e' scritto
 * a schermo — un filtro silenzioso fa sommare una parte credendola il tutto.
 *
 * ⭐⭐ 25/08/2026, due correzioni in un giorno. La prima: su una vendita il
 * «prezzo partner» non e' cio' che paghiamo al fioraio ma la quota che
 * tratteniamo noi. La seconda, dai numeri dell'utente: **il valore dato al
 * partner non si calcola, sta scritto sulla consegna** (`productValue`), e il
 * guadagno e' la differenza col prezzo pubblico **al netto IVA** — #63013:
 * 135 − 80 = 55, e 55/1,22 = 45,08.
 *
 * La tabella mostra affiancati **Dato al partner** (letto), **Guadagno lordo**,
 * **Guadagno netto IVA** e la **quota di contratto** (quello che sarebbe
 * spettato a listino): dove le ultime due si scostano c'e' qualcosa da
 * guardare. Le righe non attendibili sono marcate col motivo, non nascoste.
 * Vedi finance.module.ts.
 */
@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'finance.title' | translate }}</h1>
        <p class="page-caption">{{ 'finance.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <label class="date-fld"><span>{{ 'finance.from' | translate }}</span><input class="field" type="date" [(ngModel)]="from" (ngModelChange)="reload()" name="from" /></label>
        <label class="date-fld"><span>{{ 'finance.to' | translate }}</span><input class="field" type="date" [(ngModel)]="to" (ngModelChange)="reload()" name="to" /></label>
        <label class="date-fld cerca"><span>{{ 'finance.search' | translate }}</span>
          <input class="field" type="search" name="cerca" [(ngModel)]="cerca" (ngModelChange)="cercaCambiata()"
                 [placeholder]="'finance.searchPh' | translate" />
        </label>
        <label class="date-fld"><span>{{ 'finance.partner' | translate }}</span>
          <select class="field" name="partnerId" [(ngModel)]="partnerId" (ngModelChange)="reload()">
            <option value="">{{ 'finance.allPartners' | translate }}</option>
            @for (x of partners(); track x.id) { <option [value]="x.id">{{ x.insegna }}</option> }
          </select>
        </label>
        <div class="quick">
          <button type="button" class="quick-tab" (click)="periodo(0)">{{ 'finance.thisMonth' | translate }}</button>
          <button type="button" class="quick-tab" (click)="periodo(-1)">{{ 'finance.lastMonth' | translate }}</button>
          <button type="button" class="quick-tab" (click)="periodo(-12)">{{ 'finance.year' | translate }}</button>
        </div>
        @if (tab() === 'corrispettivi') {
          <button class="btn btn-ghost" [disabled]="!rows().length" (click)="exportCsv()">{{ 'finance.export' | translate }}</button>
        }
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="tab() === 'corrispettivi'" (click)="tab.set('corrispettivi')">{{ 'finance.tab.corrispettivi' | translate }}</button>
      <button class="tab" [class.on]="tab() === 'margini'" (click)="tab.set('margini')">{{ 'finance.tab.margini' | translate }}</button>
    </div>

    <!-- L'ambito va DETTO, per la stessa ragione del tetto qui sotto: la pagina
         non mostra tutte le consegne del periodo, mostra le vendite. -->
    @if (!loading() && summary(); as s) {
      <p class="avviso ambito">
        {{ 'finance.onlySales' | translate }}
        @if (s.excluded > 0) { {{ 'finance.excluded' | translate:{ n: s.excluded } }} }
      </p>
    }
    <!-- Un ordine si paga una volta: se ne risultano due, la regola non e' stata
         applicata e il costo a schermo e' quello vero, non quello dovuto. -->
    @if (!loading() && summary(); as s) {
      @if (s.ordiniConPiuPaghe > 0) {
        <p class="avviso">{{ 'finance.piuPaghe' | translate:{ n: s.ordiniConPiuPaghe } }}</p>
      }
    }
    <!-- Le righe sbagliate si contano in cima: nasconderle farebbe quadrare un
         totale che non quadra nella realta'. -->
    @if (!loading() && summary(); as s) {
      @if (s.anomalie > 0) {
        <p class="avviso">{{ 'finance.anomalie' | translate:{ n: s.anomalie } }}</p>
      }
    }
    <!-- Il tetto va DETTO. Una tabella tagliata in silenzio fa sommare a occhio
         una parte credendola il tutto, e i numeri restano tutti plausibili. -->
    @if (!loading() && rows().length >= 2000) {
      <p class="avviso">{{ 'finance.capped' | translate:{ n: rows().length } }}</p>
    }
    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (tab() === 'margini') {
      @if (summary(); as s) {
        <div class="cards">
          <div class="stat"><span class="k">{{ 'finance.m.deliveries' | translate }}</span><span class="v">{{ s.deliveries }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.saleValue' | translate }}</span><span class="v">{{ euro(s.saleValue) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.partnerPrice' | translate }}</span><span class="v">{{ euro(s.partnerPrice) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.takings' | translate }}</span><span class="v">{{ euro(s.takings) }}</span><span class="pct">{{ s.feePercent | number: '1.0-2' }}%</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.takingsNet' | translate }}</span><span class="v">{{ euro(s.takingsNet) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.feeContract' | translate }}</span><span class="v">{{ euro(s.feeContract) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.deliveryCost' | translate }}</span><span class="v">{{ euro(s.deliveryCost) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.vat' | translate }}</span><span class="v">{{ euro(s.vat) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.c.incassiCommission' | translate }}</span><span class="v">{{ euro(s.incassiCommission) }}</span></div>
          <div class="stat hi"><span class="k">{{ 'finance.c.totalMargin' | translate }}</span><span class="v" [class.neg]="s.totalMargin < 0">{{ euro(s.totalMargin) }}</span><span class="pct">{{ s.totalMarginPercent | number: '1.0-2' }}%</span></div>
        </div>
      }
    } @else {
      @if (rows().length === 0) {
        <div class="card state-card">
          {{ 'finance.empty' | translate }}
          <!-- «Non c'e'» e «non e' ancora arrivata qui» sono cose diverse, e
               chi cerca un numero d'ordine merita di sapere quale delle due. -->
          @if (summary()?.altrove; as a) {
            <p class="altrove">
              {{ 'finance.altrove.intro' | translate:{ n: a.totale } }}
              <span class="motivi">
                @if (a.annullate) { <span>{{ 'finance.altrove.annullate' | translate:{ n: a.annullate } }}</span> }
                @if (a.fuoriPeriodo) { <span>{{ 'finance.altrove.fuoriPeriodo' | translate:{ n: a.fuoriPeriodo } }}</span> }
                @if (a.nonVendite) { <span>{{ 'finance.altrove.nonVendite' | translate:{ n: a.nonVendite } }}</span> }
              </span>
            </p>
          }
        </div>
      } @else {
        <!-- Gli importi dell'ordine stanno SOPRA le sue consegne: il valore
             pagato dal cliente, le spese di consegna e il costo del giro sono
             dell'ordine, e ripeterli su ogni riga li conterebbe due volte. -->
        @if (summary()?.ordini; as ordini) {
          @if (ordini.length && ordini.length <= 40) {
            <div class="card ordini">
              <h2>{{ 'finance.ordini.titolo' | translate:{ n: ordini.length } }}</h2>
              <table class="fin recap">
                <thead>
                  <tr>
                    <th>{{ 'finance.c.sale' | translate }}</th>
                    <th class="num">{{ 'finance.ordini.consegne' | translate }}</th>
                    <th class="num">{{ 'finance.c.publicPrice' | translate }}</th>
                    <th class="num">{{ 'finance.c.deliveryFee' | translate }}</th>
                    <th class="num">{{ 'finance.c.saleValue' | translate }}</th>
                    <th class="num">{{ 'finance.c.partnerPrice' | translate }}</th>
                    <th class="num">{{ 'finance.c.takings' | translate }}</th>
                    <th class="num">{{ 'finance.c.deliveryCost' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (o of ordini; track o.saleRef) {
                    <tr [class.riga-anomala]="o.consegnePagate > 1">
                      <td class="mono">{{ o.saleRef }}</td>
                      <td class="num">{{ o.consegne }}</td>
                      <td class="num">{{ euro(o.saleValue) }}</td>
                      <td class="num">{{ euro(o.deliveryFee) }}</td>
                      <td class="num">{{ euro(o.saleValue + o.deliveryFee) }}</td>
                      <td class="num">{{ euro(o.partnerPrice) }}</td>
                      <td class="num">{{ euro(o.takings) }}</td>
                      <td class="num">
                        {{ euro(o.deliveryCost) }}
                        @if (o.consegnePagate > 1) {
                          <span class="tag-anomalia">{{ 'finance.ordini.piuPagate' | translate:{ n: o.consegnePagate } }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        <div class="card table-wrap">
          <table class="fin">
            <thead>
              <tr>
                <th>{{ 'finance.c.status' | translate }}</th>
                <th>{{ 'finance.c.sale' | translate }}</th>
                <th>{{ 'finance.c.delivery' | translate }}</th>
                <th>{{ 'finance.c.date' | translate }}</th>
                <th>{{ 'finance.c.product' | translate }}</th>
                <th>{{ 'finance.c.category' | translate }}</th>
                <th>{{ 'finance.c.service' | translate }}</th>
                <th>{{ 'finance.c.partner' | translate }}</th>
                <th class="num">{{ 'finance.c.publicPrice' | translate }}</th>
                <th class="num">{{ 'finance.c.deliveryFee' | translate }}</th>
                <th class="num">{{ 'finance.c.saleValue' | translate }}</th>
                <th class="num">{{ 'finance.c.partnerPrice' | translate }}</th>
                <th class="num">{{ 'finance.c.takings' | translate }}</th>
                <th class="num">{{ 'finance.c.takingsNet' | translate }}</th>
                <th class="num">{{ 'finance.c.feePercent' | translate }}</th>
                <th class="num">{{ 'finance.c.feePercentContract' | translate }}</th>
                <th class="num">{{ 'finance.c.feeContract' | translate }}</th>
                <th class="num">{{ 'finance.c.deliveryCost' | translate }}</th>
                <th class="num">{{ 'finance.c.vat' | translate }}</th>
                <th class="num">{{ 'finance.c.incassiCommission' | translate }}</th>
                <th class="num">{{ 'finance.c.totalMargin' | translate }}</th>
                <th class="num">{{ 'finance.c.totalMarginPercent' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.deliveryId) {
                <tr [class.riga-anomala]="r.anomalia">
                  <td><span class="pill">{{ r.status }}</span></td>
                  <td class="mono">{{ r.saleRef ?? '—' }}</td>
                  <td class="mono">#{{ r.deliveryCode }}
                    @if (r.anomalia) {
                      <span class="tag-anomalia">{{ 'finance.anomalia.' + r.anomalia | translate }}</span>
                    }
                  </td>
                  <td>{{ r.date | date: 'd/M/yy' }}</td>
                  <td>{{ r.product }}</td>
                  <td>{{ r.category ?? '—' }}</td>
                  <td>{{ r.service }}</td>
                  <td>{{ r.partner }}</td>
                  <td class="num">{{ euro(r.publicPrice) }}</td>
                  <td class="num">{{ euro(r.deliveryFee) }}</td>
                  <td class="num">{{ euro(r.saleValue) }}</td>
                  <!-- Letto dalla consegna, non dedotto: dove manca si dichiara. -->
                  <td class="num">
                    @if (r.anomalia === 'valore_partner_mancante') { — } @else { {{ euro(r.partnerPrice) }} }
                  </td>
                  <td class="num">{{ euro(r.takings) }}</td>
                  <td class="num" [class.neg]="r.takingsNet < 0">{{ euro(r.takingsNet) }}</td>
                  <!-- La percentuale vera e quella di contratto affiancate: se non
                       combaciano si vede senza doverlo cercare. -->
                  <td class="num" [class.diverge]="scostaDalContratto(r)">{{ r.feePercent | number: '1.0-1' }}%</td>
                  <td class="num contratto">{{ r.feePercentContract | number: '1.0-1' }}%</td>
                  <td class="num contratto">{{ euro(r.feeContract) }}</td>
                  <td class="num">{{ euro(r.deliveryCost) }}</td>
                  <td class="num">{{ euro(r.vat) }}</td>
                  <td class="num">{{ euro(r.incassiCommission) }}</td>
                  <td class="num" [class.neg]="r.totalMargin < 0">{{ euro(r.totalMargin) }}</td>
                  <td class="num">{{ r.totalMarginPercent | number: '1.0-2' }}%</td>
                </tr>
              }
            </tbody>
            @if (summary(); as s) {
              <tfoot>
                <tr class="totals">
                  <td colspan="8">{{ 'finance.total' | translate }}</td>
                  <td class="num">{{ euro(s.publicPrice) }}</td>
                  <td class="num">{{ euro(s.deliveryFee) }}</td>
                  <td class="num">{{ euro(s.saleValue) }}</td>
                  <td class="num">{{ euro(s.partnerPrice) }}</td>
                  <td class="num">{{ euro(s.takings) }}</td>
                  <td class="num">{{ euro(s.takingsNet) }}</td>
                  <td class="num">{{ s.feePercent | number: '1.0-1' }}%</td>
                  <td class="num"></td>
                  <td class="num">{{ euro(s.feeContract) }}</td>
                  <td class="num">{{ euro(s.deliveryCost) }}</td>
                  <td class="num">{{ euro(s.vat) }}</td>
                  <td class="num">{{ euro(s.incassiCommission) }}</td>
                  <td class="num">{{ euro(s.totalMargin) }}</td>
                  <td class="num">{{ s.totalMarginPercent | number: '1.0-2' }}%</td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
        <p class="assumption">{{ 'finance.assumption' | translate }}</p>
      }
    }
  `,
  styles: [
    `
      .head-actions { display: flex; align-items: flex-end; gap: 12px; }
      .date-fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); }
      .tabs { display: flex; gap: 4px; margin: 18px 0; border-bottom: 1px solid var(--hairline); }
      .tab { border: none; background: none; padding: 8px 14px; font-size: 14px; font-weight: 550; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; }
      .tab.on { color: var(--text); border-bottom-color: var(--ink); }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
      .stat { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-m); }
      .stat.hi { border-color: var(--hairline-strong); }
      .stat .k { font-size: 12.5px; color: var(--text-tertiary); }
      .stat .v { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .stat .v.neg { color: var(--red); }
      .stat .pct { font-size: 12px; color: var(--text-secondary); }
      .table-wrap { overflow-x: auto; }
      .date-fld.cerca { flex: 1 1 200px; min-width: 180px; }
      .quick { display: inline-flex; background: var(--fill, #f5f5f7); border-radius: 980px; padding: 2px; align-self: flex-end; }
      .quick-tab { border: 0; background: none; border-radius: 980px; padding: 6px 12px; font-size: 12.5px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .quick-tab:hover { background: #fff; color: var(--text); }
      .avviso { margin: 0 0 12px; font-size: 13px; font-weight: 550; color: var(--gold-strong, #B8963E); }
      /* L'ambito e' una precisazione, non un allarme: sta in grigio, il tetto in oro. */
      .avviso.ambito { color: var(--text-secondary); font-weight: 500; }
      /* Una riga sbagliata resta leggibile: si segnala, non si cancella. */
      .riga-anomala { background: rgba(215, 0, 21, 0.05); }
      .tag-anomalia { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px;
        background: rgba(215, 0, 21, 0.12); color: var(--red); font-size: 11px; font-weight: 600; }
      .contratto { color: var(--text-secondary); }
      .diverge { color: var(--gold-strong, #B8963E); font-weight: 600; }
      table.fin { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
      table.fin th, table.fin td { padding: 7px 9px; border-bottom: 1px solid var(--hairline); text-align: left; }
      table.fin th { color: var(--text-tertiary); font-weight: 500; font-size: 11px; }
      table.fin .num { text-align: right; font-variant-numeric: tabular-nums; }
      table.fin .mono { font-variant-numeric: tabular-nums; color: var(--text-secondary); }
      table.fin .neg { color: var(--red); }
      table.fin tfoot .totals td { border-top: 2px solid var(--hairline-strong); font-weight: 650; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--fill); font-size: 11px; font-weight: 600; }
      .assumption { margin-top: 12px; font-size: 12px; color: var(--text-tertiary); font-style: italic; }
      .error-card { padding: 14px 16px; border-radius: var(--radius-m); background: rgba(215,0,21,0.08); color: var(--red); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .ordini { padding: 16px 18px; margin-bottom: 14px; overflow-x: auto; }
      .ordini h2 { margin: 0 0 10px; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
      .ordini .recap { width: 100%; }
      .altrove { margin: 12px 0 0; font-size: 13px; color: var(--text-primary); }
      .altrove .motivi { display: block; margin-top: 6px; }
      .altrove .motivi span { display: block; color: var(--text-secondary); }
    `,
  ],
})
export class FinanceComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;

  readonly tab = signal<'corrispettivi' | 'margini'>('corrispettivi');
  readonly rows = signal<CorrispettivoRow[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  from = '';
  to = '';
  cerca = '';
  partnerId = '';
  readonly partners = signal<{ id: string; insegna: string }[]>([]);
  /** La ricerca aspetta una pausa: una chiamata per pausa, non per tasto. */
  private attesa?: ReturnType<typeof setTimeout>;

  constructor() {
    this.reload();
    this.http.get<{ id: string; insegna: string }[]>(`${this.api}/partners`).subscribe({
      next: (d) => this.partners.set((d ?? []).map((x) => ({ id: x.id, insegna: x.insegna }))),
      error: () => {},
    });
  }

  cercaCambiata(): void {
    clearTimeout(this.attesa);
    this.attesa = setTimeout(() => this.reload(), 350);
  }

  /**
   * Periodo rapido. `0` = mese in corso, `-1` = mese scorso, `-12` = ultimo anno.
   *
   * ⚠️ I confini si calcolano in ora locale: costruendoli in UTC, il primo del
   * mese alle 00:00 italiane a Greenwich e' ancora l'ultimo del mese prima, e
   * il periodo comincerebbe un giorno troppo presto.
   */
  periodo(scarto: number): void {
    const oggi = new Date();
    const g = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (scarto === -12) {
      const da = new Date(oggi); da.setFullYear(da.getFullYear() - 1);
      this.from = g(da); this.to = g(oggi);
    } else {
      const primo = new Date(oggi.getFullYear(), oggi.getMonth() + scarto, 1);
      const ultimo = new Date(oggi.getFullYear(), oggi.getMonth() + scarto + 1, 0);
      this.from = g(primo);
      this.to = g(scarto === 0 ? oggi : ultimo);
    }
    this.reload();
  }

  private params(): HttpParams {
    let p = new HttpParams();
    if (this.from) p = p.set('from', this.from);
    if (this.to) p = p.set('to', this.to);
    if (this.partnerId) p = p.set('partnerId', this.partnerId);
    if (this.cerca.trim()) p = p.set('cerca', this.cerca.trim());
    return p;
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const p = this.params();
    this.http.get<CorrispettivoRow[]>(`${this.api}/finance/corrispettivi`, { params: p }).subscribe({
      next: (d) => {
        this.rows.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'Errore nel caricamento');
        this.loading.set(false);
      },
    });
    this.http.get<Summary>(`${this.api}/finance/summary`, { params: p }).subscribe({
      next: (s) => this.summary.set(s),
      error: () => {},
    });
  }

  euro(v: number): string {
    return `${v.toFixed(2)} €`;
  }

  /**
   * La fee incassata si discosta da quella di contratto?
   *
   * Mezzo punto di tolleranza: gli arrotondamenti al centesimo su importi
   * piccoli muovono la percentuale di qualche decimo, e segnalare quello
   * vorrebbe dire segnalare tutto — che è come non segnalare niente.
   */
  scostaDalContratto(r: CorrispettivoRow): boolean {
    return r.feePercentContract > 0 && Math.abs(r.feePercent - r.feePercentContract) > 0.5;
  }

  exportCsv(): void {
    const t = (k: string) => this.translate.instant(k);
    const head = [
      t('finance.c.status'), t('finance.c.sale'), t('finance.c.delivery'), t('finance.c.date'), t('finance.c.product'),
      t('finance.c.category'), t('finance.c.service'), t('finance.c.partner'), t('finance.c.publicPrice'), t('finance.c.deliveryFee'),
      t('finance.c.saleValue'), t('finance.c.partnerPrice'), t('finance.c.takings'), t('finance.c.takingsNet'),
      t('finance.c.feePercent'), t('finance.c.feePercentContract'), t('finance.c.feeContract'), t('finance.c.deliveryCost'),
      t('finance.c.vat'), t('finance.c.incassiCommission'), t('finance.c.totalMargin'),
      t('finance.c.totalMarginPercent'), t('finance.c.anomalia'),
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = this.rows().map((r) => [
      r.status, r.saleRef ?? '', `#${r.deliveryCode}`, r.date.slice(0, 10), r.product, r.category ?? '', r.service, r.partner,
      r.publicPrice.toFixed(2), r.deliveryFee.toFixed(2), r.saleValue.toFixed(2),
      r.anomalia === 'valore_partner_mancante' ? '' : r.partnerPrice.toFixed(2),
      r.takings.toFixed(2), r.takingsNet.toFixed(2),
      r.feePercent.toFixed(1), r.feePercentContract.toFixed(1), r.feeContract.toFixed(2),
      r.deliveryCost.toFixed(2), r.vat.toFixed(2), r.incassiCommission.toFixed(2),
      r.totalMargin.toFixed(2), r.totalMarginPercent.toFixed(2),
      r.anomalia ? t('finance.anomalia.' + r.anomalia) : '',
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corrispettivi.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
