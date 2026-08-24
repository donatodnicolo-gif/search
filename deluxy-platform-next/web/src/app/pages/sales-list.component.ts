import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  source: string;
  product?: { id: string; name: string } | null;
  partner?: { id: string; insegna: string } | null;
  province?: { id: string; code: string; name: string } | null;
}

/**
 * Gli stati di una vendita, coi colori del design system.
 *
 * «Da gestire» e' rosso non perche' sia un errore, ma perche' e' l'unica coda
 * che qualcuno deve guardare: nessun partner l'ha presa.
 */
const STATI: Record<string, { etichetta: string; colore: string }> = {
  da_gestire: { etichetta: 'Da gestire', colore: '#d70015' },
  proposta: { etichetta: 'Proposta', colore: '#B8963E' },
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

    @if (caricando()) {
      <p class="muted">{{ 'common.loading' | translate }}</p>
    } @else if (!visibili().length) {
      <section class="card vuoto">
        <p>{{ 'sales.empty' | translate }}</p>
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
                <td class="mono">{{ s.brand }} <span class="muted">{{ s.externalOrderId ? '·' : '' }}</span></td>
                <td>{{ s.product?.name ?? '—' }}</td>
                <td class="mono">{{ s.province?.code ?? '—' }}</td>
                <td>{{ s.partner?.insegna ?? ('sales.noPartner' | translate) }}</td>
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
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (messaggio(); as m) { <p class="esito" [class.ok]="m.ok">{{ m.testo }}</p> }
  `,
  styles: [
    `
      .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .sync { padding: 14px 16px; margin-bottom: 14px; }
      .sync .titolo { font-weight: 600; margin: 0 0 8px; }
      .sync .ko { color: var(--danger); margin: 0; }
      .conti { display: flex; flex-wrap: wrap; gap: 8px; }
      .conto {
        font-size: 13px; padding: 4px 10px; border-radius: 999px;
        background: var(--surface-2, #f5f5f7); border: 1px solid var(--hairline, #e5e5ea);
      }
      .conto.buono { background: color-mix(in srgb, #248A3D 12%, transparent); border-color: color-mix(in srgb, #248A3D 30%, transparent); }
      .esempi { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--text-secondary); }
      .tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
      .tab {
        border: 1px solid var(--hairline, #e5e5ea); background: #fff; border-radius: 999px;
        padding: 6px 14px; cursor: pointer; font-size: 14px; display: inline-flex; gap: 8px; align-items: center;
      }
      .tab.on { background: #111; color: #fff; border-color: #111; }
      .tab .pill { font-size: 12px; opacity: .7; }
      .badge {
        display: inline-flex; align-items: center; gap: 6px; font-size: 13px;
        padding: 3px 10px; border-radius: 999px;
        background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c);
      }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .azioni { display: flex; gap: 6px; justify-content: flex-end; }
      .btn.mini { padding: 4px 12px; font-size: 13px; }
      .vuoto { padding: 28px; text-align: center; color: var(--text-secondary); }
      .esito { margin-top: 10px; color: var(--danger); }
      .esito.ok { color: #248A3D; }
      .num { text-align: right; }
      .mono { font-variant-numeric: tabular-nums; }
    `,
  ],
})
export class SalesListComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly vendite = signal<Sale[]>([]);
  readonly caricando = signal(true);
  readonly tirando = signal(false);
  readonly inCorso = signal<string | null>(null);
  readonly esitoSync = signal<any>(null);
  readonly messaggio = signal<{ ok: boolean; testo: string } | null>(null);
  readonly filtro = signal<string>('tutte');

  readonly tab = [
    { chiave: 'tutte' }, { chiave: 'da_gestire' }, { chiave: 'proposta' },
    { chiave: 'accettata' }, { chiave: 'annullata' },
  ];

  readonly canManage = computed(() => ['ADMIN', 'OPERATION'].includes(this.auth.user()?.role ?? ''));

  readonly visibili = computed(() => {
    const f = this.filtro();
    return f === 'tutte' ? this.vendite() : this.vendite().filter((s) => s.status === f);
  });

  quante(chiave: string): number {
    return chiave === 'tutte' ? this.vendite().length : this.vendite().filter((s) => s.status === chiave).length;
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

  private carica(): void {
    this.caricando.set(true);
    this.http.get<Sale[]>(`${environment.apiUrl}/sales`).subscribe({
      next: (r) => { this.vendite.set(r ?? []); this.caricando.set(false); },
      error: () => { this.vendite.set([]); this.caricando.set(false); },
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
