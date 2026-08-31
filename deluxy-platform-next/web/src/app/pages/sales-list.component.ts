import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface Sale {
  id: string;
  status: string;
  brand: string;
  amount: number;
  createdAt: string;
  deliveryDate?: string | null;
  externalOrderId?: string | null;
  /** Il numero d'ordine Shopify (es. 2824), riempito anche sul pregresso. */
  externalOrderNumber?: string | null;
  source: string;
  product?: { id: string; name: string } | null;
  variantName?: string | null;
  partner?: { id: string; insegna: string } | null;
  province?: { id: string; code: string; name: string } | null;
  assignmentReason?: string | null;
}

/**
 * Gli stati di una vendita, coi colori del design system.
 *
 * «Da gestire» e' rosso non perche' sia un errore, ma perche' e' l'unica coda
 * che qualcuno deve guardare: nessun partner l'ha presa.
 */
const STATI: Record<string, { etichetta: string; colore: string }> = {
  da_gestire: { etichetta: 'Da gestire', colore: '#d70015' },
  proposta: { etichetta: 'Proposta', colore: 'var(--orange, #c93400)' /* §5: l'oro non e' MAI uno stato (verdetto custode 31/08); attende un'azione del partner -> arancio */ },
  accettata: { etichetta: 'Accettata', colore: '#248A3D' },
  non_accettata: { etichetta: 'Non accettata', colore: '#6e6e73' },
  annullata: { etichetta: 'Annullata', colore: '#8e8e93' },
};

/** Operatività → Vendite: gli ordini smistati ai partner. */
@Component({
  selector: 'app-sales-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'sales.title' | translate }}</h1>
        <p class="page-caption">{{ 'sales.caption' | translate }}</p>
      </div>
      @if (canManage()) {
        <div class="head-actions">
          <button class="btn btn-secondary" [disabled]="tirando()" (click)="tira(false)">
            {{ (tirando() ? 'common.loading' : 'sales.sync.simulate') | translate }}
          </button>
          <button class="btn btn-primary" [disabled]="tirando()" (click)="tira(true)">
            {{ 'sales.sync.apply' | translate }}
          </button>
        </div>
      }
    </div>

    <!-- Esito del tiraggio da Orders: si mostra il conto, non un «fatto».
         Un ordine su quattro non e' smistabile e il motivo va detto. -->
    @if (esitoSync(); as e) {
      <section class="card sync">
        @if (!e.ok) {
          <p class="ko">{{ e.messaggio }}</p>
        } @else {
          <p class="titolo">
            {{ (e.applicato ? 'sales.sync.done' : 'sales.sync.preview') | translate:{ n: e.lettiDaOrders } }}
          </p>
          <div class="conti">
            @for (r of righeConteggio(e.conteggio); track r.chiave) {
              <span class="conto" [class.buono]="r.chiave === 'creata'">
                <strong>{{ r.n }}</strong> {{ ('sales.sync.esito.' + r.chiave) | translate }}
              </span>
            }
          </div>
          @if (e.esempiDiCosaNonEntra?.length) {
            <p class="hint">{{ 'sales.sync.examples' | translate }}</p>
            <ul class="esempi">
              @for (x of e.esempiDiCosaNonEntra; track x.ordine) {
                <li>{{ x.ordine }} — {{ ('sales.sync.esito.' + x.esito) | translate }}
                  @if (x.dettaglio) { <span class="mono">· {{ x.dettaglio }}</span> }
                </li>
              }
            </ul>
          }
        }
      </section>
    }

    <div class="tabs">
      @for (t of tab; track t.chiave) {
        <button class="tab" [class.on]="filtro() === t.chiave" (click)="filtro.set(t.chiave)">
          {{ ('sales.tab.' + t.chiave) | translate }}
          <span class="pill">{{ quante(t.chiave) }}</span>
        </button>
      }
    </div>

    @if (erroreCarico(); as e) {
      <div class="error-card" role="alert">{{ e }}
        <button type="button" class="btn btn-secondary btn-riprova" (click)="ricarica()">{{ 'common.retry' | translate }}</button>
      </div>
    } @else if (caricando()) {
      <p class="muted">{{ 'common.loading' | translate }}</p>
    } @else {

    <!-- §8-bis del Libro: ogni elenco ha una ricerca. ⚠️ Sta FUORI dal ramo
         del vuoto (verdetto custode 31/08): prima, digitando una query senza
         risultati, vinceva il ramo «vuoto» e l'input SPARIVA dalla pagina —
         impossibile correggere o azzerare quello che si era scritto. -->
    <div class="cerca-riga">
      <input class="field" type="search" [(ngModel)]="cerca" name="cerca"
             [attr.placeholder]="'comune.cercaPh' | translate" [attr.aria-label]="'comune.cercaPh' | translate" />
      @if (cerca.trim()) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: visibili().length, m: vendite().length } }}</span>
      }
    </div>

    @if (!visibili().length) {
      <section class="card vuoto">
        @if (cerca.trim() || filtro() !== 'tutte') {
          <!-- Vuoto DA FILTRO (§6.2): si dice il perché e si offre la via. -->
          <p>{{ 'comune.contoRighe' | translate: { n: 0, m: vendite().length } }}</p>
          <button type="button" class="btn btn-secondary" (click)="cerca = ''; filtro.set('tutte')">
            {{ 'filters.clear' | translate }}
          </button>
        } @else {
          <p>{{ 'sales.empty' | translate }}</p>
        }
      </section>
    } @else {

      <div class="table-wrap card">
        <table class="table">
          <thead>
            <tr>
              <th>{{ 'sales.col.status' | translate }}</th>
              <th>{{ 'sales.col.order' | translate }}</th>
              <th>{{ 'sales.col.product' | translate }}</th>
              <th>{{ 'sales.col.province' | translate }}</th>
              <th>{{ 'sales.col.partner' | translate }}</th>
              <th>{{ 'sales.col.delivery' | translate }}</th>
              <th class="num">{{ 'sales.col.amount' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (s of visibili(); track s.id) {
              <tr>
                <td>
                  <span class="badge" [style.--c]="colore(s.status)">
                    <i class="dot"></i>{{ etichetta(s.status) }}
                  </span>
                </td>
                <td class="mono">
                  @if (s.externalOrderNumber) { <strong>#{{ s.externalOrderNumber }}</strong> · }{{ s.brand }}
                </td>
                <td>{{ s.product?.name ?? '—' }}@if (s.variantName) { <span class="muted">({{ s.variantName }})</span> }</td>
                <td class="mono">{{ s.province?.code ?? '—' }}</td>
                <td>{{ s.partner?.insegna ?? ('sales.noPartner' | translate) }}
                  @if (s.assignmentReason) {
                    <span class="motivo">{{ s.assignmentReason }}</span>
                  }
                </td>
                <td>{{ s.deliveryDate ? (s.deliveryDate | date: 'dd/MM/yyyy') : '—' }}</td>
                <td class="num">{{ s.amount | number: '1.2-2' }} €</td>
                <td class="azioni">
                  @if (s.status === 'proposta' && puoRispondere(s)) {
                    <button class="btn btn-primary mini" [disabled]="inCorso() === s.id" (click)="accetta(s)">
                      {{ 'sales.accept' | translate }}
                    </button>
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="rifiuta(s)">
                      {{ 'sales.refuse' | translate }}
                    </button>
                  }
                  <!-- L'ufficio prende in mano: ferma il giro automatico e
                       apre il form consegna coi dati della vendita (31/08). -->
                  @if (canManage() && (s.status === 'proposta' || s.status === 'da_gestire')) {
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="inserisci(s)">
                      {{ 'sales.inserisci' | translate }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    }
    @if (messaggio(); as m) { <p class="esito" [class.ok]="m.ok">{{ m.testo }}</p> }
  `,
  styles: [
    `
      .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .sync { padding: 16px 18px; margin-bottom: 16px; }
      .sync .titolo { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; margin: 0 0 10px; }
      .sync .ko { color: var(--danger, #d70015); margin: 0; font-size: 13.5px; }
      .sync .hint { margin: 10px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      .conti { display: flex; flex-wrap: wrap; gap: 8px; }
      .conto {
        font-size: 13px; padding: 4px 12px; border-radius: 980px; color: var(--text-secondary);
        background: var(--fill); border: 1px solid transparent;
      }
      .conto strong { color: var(--text); font-variant-numeric: tabular-nums; }
      .conto.buono {
        background: color-mix(in srgb, var(--green) 10%, transparent);
        border-color: color-mix(in srgb, var(--green) 25%, transparent);
        color: var(--green);
      }
      .conto.buono strong { color: var(--green); }
      .esempi { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--text-secondary); }
      .tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
      .tab {
        appearance: none; font: inherit; font-size: 13.5px; font-weight: 550;
        border: 1px solid var(--hairline); background: var(--surface); color: var(--text);
        border-radius: 980px; padding: 7px 15px; cursor: pointer;
        display: inline-flex; gap: 8px; align-items: center;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .tab .pill {
        font-size: 11.5px; font-variant-numeric: tabular-nums; line-height: 1;
        padding: 3px 7px; border-radius: 980px; background: var(--fill);
      }
      .tab.on .pill { background: rgba(255, 255, 255, 0.18); }
      .badge {
        display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 550;
        padding: 3px 11px; border-radius: 980px; white-space: nowrap;
        background: color-mix(in srgb, var(--c) 11%, transparent); color: var(--c);
      }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: none; }
      /* La tabella non aveva NESSUNO stile (nessuna regola globale la copre):
         stesso vestito della lista consegne. */
      .table-wrap { overflow-x: auto; }
      .table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .table th, .table td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      .table th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; position: sticky; top: 0; background: var(--surface); }
      .table th.num, .table td.num { text-align: right; }
      .table tbody tr { transition: background 0.14s ease; }
      .table tbody tr:hover { background: rgba(120, 120, 128, 0.05); }
      .table tr:last-child td { border-bottom: none; }
      .table td { vertical-align: middle; }
      .table td:nth-child(3) { white-space: normal; min-width: 220px; }
      .azioni { display: flex; gap: 10px /* audit 31/08: 6px fra Accetta e Rifiuta, esiti opposti */; justify-content: flex-end; white-space: nowrap; }
      .btn.mini { padding: 4px 12px; font-size: 12.5px; }
      .vuoto { padding: 40px 28px; text-align: center; color: var(--text-secondary); font-size: 14px; }
      .esito { margin-top: 10px; color: var(--danger, #d70015); font-size: 13.5px; }
      .esito.ok { color: var(--green); }
      .motivo { display: block; font-size: 11px; color: var(--text-tertiary); margin-top: 2px; max-width: 260px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .mono { font-variant-numeric: tabular-nums; }
      .muted { color: var(--text-tertiary); }
      .cerca-riga { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .cerca-riga .field { max-width: 340px; }
      .conto-righe { font-size: 12.5px; color: var(--text-secondary); }
      .btn-riprova { margin-left: 12px; }
    `,
  ],
})
export class SalesListComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly vendite = signal<Sale[]>([]);
  readonly caricando = signal(true);
  readonly erroreCarico = signal<string | null>(null);
  readonly tirando = signal(false);
  readonly inCorso = signal<string | null>(null);
  readonly esitoSync = signal<any>(null);
  readonly messaggio = signal<{ ok: boolean; testo: string } | null>(null);
  readonly filtro = signal<string>('tutte');

  /** «Storico» raccoglie TUTTO il gestito (chiesto dall'utente il 31/08):
   *  accettate (con la consegna), non accettate e annullate/già evase. */
  static readonly STORICO = ['accettata', 'non_accettata', 'annullata'];
  readonly tab = [
    { chiave: 'tutte' }, { chiave: 'da_gestire' }, { chiave: 'proposta' },
    { chiave: 'storico' },
  ];
  private inStorico(s: Sale): boolean {
    return SalesListComponent.STORICO.includes(s.status);
  }

  readonly canManage = computed(() => ['ADMIN', 'OPERATION'].includes(this.auth.user()?.role ?? ''));

  /** §8-bis: la ricerca, per ordine, prodotto, partner o provincia. */
  readonly cercaTesto = signal('');
  get cerca(): string { return this.cercaTesto(); }
  set cerca(v: string) { this.cercaTesto.set(v); }

  readonly visibili = computed(() => {
    const f = this.filtro();
    const base = f === 'tutte' ? this.vendite()
      : f === 'storico' ? this.vendite().filter((s) => this.inStorico(s))
      : this.vendite().filter((s) => s.status === f);
    const q = this.cercaTesto().trim().toLowerCase();
    if (!q) return base;
    return base.filter((s) =>
      (s.externalOrderId ?? '').toLowerCase().includes(q) ||
      (s.externalOrderNumber ?? '').toLowerCase().includes(q) ||
      (s.product?.name ?? '').toLowerCase().includes(q) ||
      (s.partner?.insegna ?? '').toLowerCase().includes(q) ||
      (s.province?.code ?? '').toLowerCase().includes(q) ||
      s.brand.toLowerCase().includes(q));
  });

  quante(chiave: string): number {
    return chiave === 'tutte' ? this.vendite().length
      : chiave === 'storico' ? this.vendite().filter((s) => this.inStorico(s)).length
      : this.vendite().filter((s) => s.status === chiave).length;
  }

  etichetta(stato: string) { return STATI[stato]?.etichetta ?? stato; }
  colore(stato: string) { return STATI[stato]?.colore ?? '#6e6e73'; }

  /** Un partner risponde solo alle vendite proposte a lui; admin e operation a tutte. */
  puoRispondere(s: Sale): boolean {
    const u = this.auth.user();
    if (!u) return false;
    if (u.role === 'PARTNER') return s.partner?.id === (u as any).partnerId;
    return this.canManage();
  }

  righeConteggio(c: Record<string, number>) {
    return Object.entries(c ?? {}).filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]).map(([chiave, n]) => ({ chiave, n }));
  }

  constructor() { this.carica(); }

  ricarica(): void { this.carica(); }

  private carica(): void {
    this.caricando.set(true);
    this.erroreCarico.set(null);
    this.http.get<Sale[]>(`${environment.apiUrl}/sales`).subscribe({
      next: (r) => { this.vendite.set(r ?? []); this.caricando.set(false); },
      // ⚠️ Legge 9 del Libro: un fallimento NON e' mai una lista vuota.
      // Prima qui c'era vendite.set([]) — il guasto sembrava «zero vendite».
      error: (e) => {
        this.caricando.set(false);
        this.erroreCarico.set(e?.error?.message ?? 'Caricamento non riuscito: riprova.');
      },
    });
  }

  /**
   * Tira gli ordini da Deluxy Orders.
   *
   * `applica = false` non scrive niente e mostra solo il conto: e' il modo
   * giusto di guardare prima, perche' un ordine su quattro non e' smistabile
   * (senza provincia o senza SKU) e finirebbe in coda «da gestire».
   */
  tira(applica: boolean): void {
    this.tirando.set(true);
    this.esitoSync.set(null);
    this.http.post<any>(`${environment.apiUrl}/orders-sync/esegui`, { limite: 200, applica }).subscribe({
      next: (r) => { this.tirando.set(false); this.esitoSync.set(r); if (applica) this.carica(); },
      error: (e) => {
        this.tirando.set(false);
        this.esitoSync.set({ ok: false, messaggio: e?.error?.message ?? 'Tiraggio non riuscito' });
      },
    });
  }

  accetta(s: Sale): void { this.rispondi(s, 'accetta'); }
  rifiuta(s: Sale): void { this.rispondi(s, 'rifiuta'); }

  private readonly router = inject(Router);

  /**
   * L'ufficio prende in mano (31/08): ferma il giro automatico della vendita
   * e apre il form consegna coi suoi dati. La vendita si chiude (accettata,
   * con la consegna agganciata) solo quando il form salva.
   */
  inserisci(s: Sale): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post(`${environment.apiUrl}/sales/${s.id}/inserisci`, {}).subscribe({
      next: () => {
        this.inCorso.set(null);
        this.router.navigate(['/deliveries/new'], { queryParams: { vendita: s.id } });
      },
      error: (err) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: err?.error?.message ?? 'Errore nella presa in mano' });
      },
    });
  }

  private rispondi(s: Sale, azione: 'accetta' | 'rifiuta'): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post<any>(`${environment.apiUrl}/sales/${s.id}/${azione}`, {}).subscribe({
      next: (r) => {
        this.inCorso.set(null);
        // L'avviso arriva quando la vendita e' accettata ma la consegna NON e'
        // nata (mancano destinatario, indirizzo, data o servizio). Va mostrato:
        // dare per creata una consegna che non c'e' e' peggio di un errore.
        this.messaggio.set(r?.avviso
          ? { ok: false, testo: r.avviso }
          : { ok: true, testo: azione === 'accetta' ? 'Vendita accettata.' : 'Vendita rifiutata e ripassata.' });
        this.carica();
      },
      error: (e) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Operazione non riuscita' });
      },
    });
  }
}
