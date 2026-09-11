import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

/**
 * ⭐ 11/09/2026 — LE STATISTICHE DEL PARTNER (richiesta utente).
 *
 * Otto riquadri: servizi richiesti, fasce orarie, giorni, andamento vendite, prodotti più venduti,
 * indirizzi, luoghi (gli hotel) e clienti più serviti. Più i filtri di periodo.
 *
 * DUE SCELTE DI DISEGNO, ENTRAMBE PER NON MENTIRE A CHI GUARDA.
 *
 * 1. **Ogni classifica porta la sua barra.** Un elenco di numeri non si legge: «Four Seasons 460,
 *    Park Hyatt 305» dice poco finché non si vede che il primo è una volta e mezza il secondo. La barra
 *    è in proporzione al PRIMO della classifica, non al totale: è un confronto fra pari, non una fetta
 *    di torta — le classifiche sono tagliate alle prime venti voci e le percentuali sul totale
 *    sarebbero false.
 * 2. **Un riquadro senza dati lo dice.** «Nessuna consegna in questo periodo» è un'informazione;
 *    un riquadro vuoto sembra un guasto. E i riquadri che non riguardano questo partner non compaiono
 *    affatto: chi fa solo vendite non ha fasce orarie, e non deve chiedersi perché sono vuote.
 */
@Component({
  selector: 'app-statistiche-partner',
  standalone: true,
  imports: [NgTemplateOutlet, DecimalPipe, FormsModule, TranslatePipe],
  template: `
    <header class="page-head">
      <div>
        <h1>{{ 'statPartner.titolo' | translate }}</h1>
        <p class="page-sub">{{ 'statPartner.sottotitolo' | translate }}</p>
      </div>
    </header>

    <section class="card filtri">
      <div class="periodi">
        @for (p of PERIODI; track p.chiave) {
          <button type="button" class="quick-tab" [class.attivo]="periodo() === p.chiave" (click)="scegliPeriodo(p.chiave)">
            {{ 'statPartner.periodo.' + p.chiave | translate }}
          </button>
        }
      </div>
      <div class="date">
        <label class="fld"><span>{{ 'statPartner.dal' | translate }}</span>
          <input class="field" type="date" [(ngModel)]="da" (change)="periodo.set('scelto'); carica()" /></label>
        <label class="fld"><span>{{ 'statPartner.al' | translate }}</span>
          <input class="field" type="date" [(ngModel)]="a" (change)="periodo.set('scelto'); carica()" /></label>
        <label class="fld"><span>{{ 'statPartner.tipologia' | translate }}</span>
          <select class="field" [(ngModel)]="pricingModel" (change)="carica()">
            <option value="">{{ 'statPartner.tutte' | translate }}</option>
            @for (m of MODELLI; track m) {
              <option [value]="m">{{ 'deliveries.svc.' + m | translate }}</option>
            }
          </select></label>
        <button type="button" class="btn btn-secondary" (click)="carica()">{{ 'common.refresh' | translate }}</button>
      </div>
    </section>

    @if (errore()) { <div class="avviso errore">{{ errore() }}</div> }

    @if (caricando()) {
      <div class="card vuoto">{{ 'common.loading' | translate }}</div>
    }
    <!-- ⚠️ L'alias «as d» vive solo su @if, non su @else if: qui la condizione porta con sé il dato. -->
    @if (!caricando() && dati(); as d) {
      <p class="totale">{{ 'statPartner.totale' | translate: { n: d.totale } }}</p>

      <div class="griglia">
        <!-- 1. SERVIZI — sempre: è la fotografia di cosa chiede questo partner. -->
        <section class="card riquadro">
          <h2>{{ 'statPartner.servizi' | translate }}</h2>
          <ng-container *ngTemplateOutlet="classifica; context: { righe: righeServizi(), unita: '' }"></ng-container>
        </section>

        @if (d.mostra.consegna || d.mostra.ora) {
          <section class="card riquadro">
            <h2>{{ 'statPartner.fasce' | translate }}</h2>
            <ng-container *ngTemplateOutlet="classifica; context: { righe: righeFasce(), unita: '' }"></ng-container>
          </section>

          <section class="card riquadro">
            <h2>{{ 'statPartner.giorni' | translate }}</h2>
            <ng-container *ngTemplateOutlet="classifica; context: { righe: righeGiorni(), unita: '' }"></ng-container>
          </section>
        }

        @if (d.mostra.vendita) {
          <section class="card riquadro largo">
            <h2>{{ 'statPartner.vendite' | translate }}</h2>
            @if (d.vendite.length) {
              <div class="andamento">
                @for (m of d.vendite; track m.mese) {
                  <div class="mese" [title]="m.mese + ': ' + m.quantita + ' · ' + (m.valore | number: '1.0-0') + ' €'">
                    <div class="colonna" [style.height.%]="altezzaMese(m.quantita)"></div>
                    <span class="etichetta">{{ m.mese.slice(5) }}/{{ m.mese.slice(2, 4) }}</span>
                    <span class="valore">{{ m.quantita }}</span>
                  </div>
                }
              </div>
            } @else { <p class="vuoto-testo">{{ 'statPartner.nessunDato' | translate }}</p> }
          </section>

          <section class="card riquadro">
            <h2>{{ 'statPartner.prodotti' | translate }}</h2>
            <ng-container *ngTemplateOutlet="classifica; context: { righe: righeProdotti(), unita: 'pz' }"></ng-container>
          </section>
        }

        @if (d.mostra.consegna) {
          <section class="card riquadro">
            <h2>{{ 'statPartner.luoghi' | translate }}</h2>
            <p class="hint">{{ 'statPartner.luoghiNota' | translate }}</p>
            <ng-container *ngTemplateOutlet="classifica; context: { righe: righeLuoghi(), unita: '' }"></ng-container>
          </section>

          <section class="card riquadro">
            <h2>{{ 'statPartner.indirizzi' | translate }}</h2>
            <ng-container *ngTemplateOutlet="classifica; context: { righe: righeIndirizzi(), unita: '' }"></ng-container>
          </section>

          <section class="card riquadro">
            <h2>{{ 'statPartner.clienti' | translate }}</h2>
            <ng-container *ngTemplateOutlet="classifica; context: { righe: righeClienti(), unita: '' }"></ng-container>
          </section>
        }
      </div>
    }

    <!-- Una classifica sola, riusata otto volte: stessa forma, stessa lettura. -->
    <ng-template #classifica let-righe="righe" let-unita="unita">
      @if (righe.length) {
        <ul class="classifica">
          @for (r of righe; track r.nome) {
            <li>
              <span class="nome" [title]="r.nome">{{ r.nome }}</span>
              <span class="barra"><i [style.width.%]="r.quota"></i></span>
              <span class="n">{{ r.quantita }}@if (unita) { <small> {{ unita }}</small> }</span>
            </li>
          }
        </ul>
      } @else {
        <p class="vuoto-testo">{{ 'statPartner.nessunDato' | translate }}</p>
      }
    </ng-template>
  `,
  styles: [
    `
      .page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
      .page-sub { margin: 4px 0 0; color: var(--text-secondary); }
      .card { background: #fff; border: 1px solid var(--hairline); border-radius: 16px; padding: 16px; }
      .filtri { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
      .periodi, .date { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
      .quick-tab { border: 1px solid var(--hairline-strong); background: #fff; border-radius: 999px;
        padding: 7px 14px; cursor: pointer; font-size: 14px; }
      .quick-tab.attivo { background: #111; color: #fff; border-color: #111; }
      .fld { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-secondary); }
      .field { border: 1px solid var(--hairline-strong); border-radius: 10px; padding: 8px 10px; font-size: 14px; min-width: 150px; }
      .totale { margin: 0 0 12px; color: var(--text-secondary); }
      .griglia { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
      .riquadro h2 { margin: 0 0 10px; font-size: 16px; letter-spacing: -0.01em; }
      .riquadro .hint { margin: -6px 0 10px; font-size: 12.5px; color: var(--text-secondary); }
      .largo { grid-column: 1 / -1; }
      .classifica { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
      .classifica li { display: grid; grid-template-columns: minmax(0, 1fr) 90px 62px; align-items: center; gap: 10px; font-size: 14px; }
      .classifica .nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .classifica .barra { background: var(--hairline); border-radius: 999px; height: 7px; overflow: hidden; }
      .classifica .barra i { display: block; height: 100%; background: #b8963e; border-radius: 999px; }
      .classifica .n { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
      .vuoto, .vuoto-testo { color: var(--text-secondary); }
      .andamento { display: flex; gap: 8px; align-items: flex-end; overflow-x: auto; min-height: 150px; padding-top: 8px; }
      .mese { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 42px; height: 140px; justify-content: flex-end; }
      .mese .colonna { width: 22px; background: #111; border-radius: 6px 6px 0 0; min-height: 3px; }
      .mese .etichetta { font-size: 11px; color: var(--text-secondary); }
      .mese .valore { font-size: 12px; font-variant-numeric: tabular-nums; }
      .avviso.errore { background: #fff3f3; border: 1px solid #f3c9c9; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
      @media (max-width: 680px) {
        .classifica li { grid-template-columns: minmax(0, 1fr) 56px 52px; }
      }
    `,
  ],
})
export class StatistichePartnerComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  readonly auth = inject(AuthService);

  readonly PERIODI = [
    { chiave: 'mese' }, { chiave: 'trimestre' }, { chiave: 'anno' }, { chiave: 'sempre' },
  ] as const;
  readonly MODELLI = ['PREZZO_FISSO', 'A_ORA', 'VENDITA', 'CORPORATE', 'MAGAZZINO'];

  readonly periodo = signal<string>('anno');
  da = '';
  a = '';
  pricingModel = '';
  readonly caricando = signal(false);
  readonly errore = signal<string | null>(null);
  readonly dati = signal<Statistiche | null>(null);

  constructor() {
    this.scegliPeriodo('anno');
  }

  scegliPeriodo(chiave: string): void {
    this.periodo.set(chiave);
    const oggi = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (chiave === 'sempre') { this.da = ''; this.a = ''; }
    else {
      const inizio = new Date(oggi);
      if (chiave === 'mese') inizio.setMonth(inizio.getMonth() - 1);
      if (chiave === 'trimestre') inizio.setMonth(inizio.getMonth() - 3);
      if (chiave === 'anno') inizio.setFullYear(inizio.getFullYear() - 1);
      this.da = iso(inizio);
      this.a = iso(oggi);
    }
    this.carica();
  }

  carica(): void {
    this.caricando.set(true);
    this.errore.set(null);
    let params = new HttpParams();
    if (this.da) params = params.set('da', this.da);
    if (this.a) params = params.set('a', this.a);
    if (this.pricingModel) params = params.set('pricingModel', this.pricingModel);
    this.http.get<Statistiche>(`${environment.apiUrl}/statistiche-partner`, { params }).subscribe({
      next: (d) => { this.dati.set(d); this.caricando.set(false); },
      error: (e) => {
        this.caricando.set(false);
        this.errore.set(e?.error?.message ?? this.translate.instant('statPartner.errore'));
      },
    });
  }

  /** La barra è in proporzione al PRIMO della classifica: un confronto fra pari, non una fetta di torta. */
  private conQuota(righe: { nome: string; quantita: number }[]) {
    const massimo = righe.reduce((m, r) => Math.max(m, r.quantita), 0) || 1;
    return righe.map((r) => ({ ...r, quota: Math.max(2, Math.round((r.quantita / massimo) * 100)) }));
  }

  readonly righeServizi = computed(() => this.conQuota((this.dati()?.servizi ?? []).map((r) => ({ nome: r.nome, quantita: r.quantita }))));
  readonly righeFasce = computed(() => this.conQuota((this.dati()?.fasce ?? []).map((r) => ({ nome: r.fascia, quantita: r.quantita }))));
  readonly righeGiorni = computed(() => this.conQuota((this.dati()?.giorni ?? []).map((r) => ({ nome: r.giorno, quantita: r.quantita }))));
  readonly righeProdotti = computed(() => this.conQuota((this.dati()?.prodotti ?? []).map((r) => ({ nome: r.nome, quantita: r.pezzi }))));
  readonly righeLuoghi = computed(() => this.conQuota((this.dati()?.luoghi ?? []).map((r) => ({ nome: r.luogo, quantita: r.quantita }))));
  readonly righeIndirizzi = computed(() => this.conQuota((this.dati()?.indirizzi ?? []).map((r) => ({ nome: r.indirizzo, quantita: r.quantita }))));
  readonly righeClienti = computed(() => this.conQuota((this.dati()?.clienti ?? []).map((r) => ({ nome: r.nome, quantita: r.quantita }))));

  altezzaMese(n: number): number {
    const massimo = (this.dati()?.vendite ?? []).reduce((m, r) => Math.max(m, r.quantita), 0) || 1;
    return Math.max(3, Math.round((n / massimo) * 100));
  }
}

interface Statistiche {
  partner: { id: string; insegna: string };
  periodo: { da: string | null; a: string | null };
  mostra: { consegna: boolean; ora: boolean; vendita: boolean };
  totale: number;
  servizi: { nome: string; pricingModel: string | null; quantita: number }[];
  fasce: { fascia: string; quantita: number }[];
  giorni: { giorno: string; quantita: number }[];
  vendite: { mese: string; quantita: number; valore: number }[];
  prodotti: { nome: string; pezzi: number; consegne: number }[];
  indirizzi: { indirizzo: string; quantita: number }[];
  luoghi: { luogo: string; quantita: number }[];
  clienti: { nome: string; quantita: number }[];
}
