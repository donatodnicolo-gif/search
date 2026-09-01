import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

type Fascia = { dalle: string | null; alle: string | null };
type Origine = 'giorno' | 'eccezione' | 'settimanale' | 'non-indicata';
interface Riga {
  id: string;
  nome: string;
  aperto: boolean;
  fasce: Fascia[];
  origine: Origine;
  /** Città dell'anagrafica; null quando non dichiarata. */
  citta?: string | null;
}
interface Gruppo {
  righe: Riga[];
  totali: number;
  disponibili: number;
  chiusi: number;
  nonIndicati: number;
  perQuestoGiorno: number;
}
interface Giornata { data: string; partner: Gruppo; valet: Gruppo }

/**
 * Operatività → Disponibilità: chi lavora oggi, partner e valet insieme.
 *
 * Prima questo dato c'era ma non si vedeva: le fasce dei partner sono 113.191
 * righe in tabella e non avevano una schermata; quelle dei valet si vedevano
 * solo dalla pagina del singolo valet, una persona per volta.
 */
@Component({
  selector: 'app-availability-board',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'availability.title' | translate }}</h1>
        <p class="page-caption">{{ 'availability.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <div class="quick">
          <button type="button" class="quick-tab" [class.active]="giorno === oggi()" (click)="vaiA(oggi())">
            {{ 'deliveries.quick.today' | translate }}
          </button>
          <button type="button" class="quick-tab" [class.active]="giorno === domani()" (click)="vaiA(domani())">
            {{ 'deliveries.quick.tomorrow' | translate }}
          </button>
        </div>
        <input class="field" type="date" [(ngModel)]="giorno" (ngModelChange)="carica()" />
      </div>
    </div>

    <div class="filtri card">
      <label class="f cerca">
        <span>{{ 'availability.search' | translate }}</span>
        <input class="field" type="search" [(ngModel)]="cerca" [placeholder]="'availability.searchPh' | translate" />
      </label>
      <div class="f">
        <span>{{ 'availability.city' | translate }}</span>
        <!-- Le città più presenti sono TAB da cliccare; la tendina resta per
             le altre. Ripremendo il tab si torna a «tutte». -->
        <div class="citta-tabs">
          <div class="quick">
            @for (c of cittaVeloci(); track c.nome) {
              <button type="button" class="quick-tab" [class.active]="citta.toLowerCase() === c.nome.toLowerCase()"
                      (click)="scegliCitta(c.nome)">{{ c.nome }}</button>
            }
          </div>
          <select class="field citta-sel" [(ngModel)]="citta">
            <option value="">{{ 'availability.allCities' | translate }}</option>
            @for (c of cittaDisponibili(); track c) { <option [value]="c">{{ c }}</option> }
          </select>
        </div>
      </div>
      <label class="f interruttore">
        <input type="checkbox" [(ngModel)]="soloDisponibili" />
        <span>{{ 'availability.onlyOpen' | translate }}</span>
      </label>
      <!-- Chi non dichiara la città sparisce dal filtro: va DETTO, o il conteggio
           filtrato sembra un buco di disponibilità invece che un buco anagrafico. -->
      @if (citta) {
        <span class="nota-citta">{{ 'availability.cityHint' | translate }}</span>
      }
    </div>

    @if (caricando()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else {
      <!-- La forma «as» vuole il ramo primario di un @if: qui il caricamento
           e gia' deciso sopra, e questo secondo @if serve solo a dare un nome ai dati. -->
      @if (dati(); as d) {
      <div class="colonne">
        @for (g of [{ chi: 'partner', g: d.partner }, { chi: 'valet', g: d.valet }]; track g.chi) {
          <section class="card colonna">
            <header class="testa">
              <h2>{{ ('availability.' + g.chi) | translate }}</h2>
              <div class="conta">
                <span class="verde">{{ g.g.disponibili | number }}</span>
                <span class="muted">/ {{ g.g.totali | number }}</span>
              </div>
            </header>
            <p class="sotto">
              {{ 'availability.declared' | translate:{ n: g.g.perQuestoGiorno } }}
              @if (g.g.nonIndicati) {
                · <span class="grigio">{{ 'availability.unknown' | translate:{ n: g.g.nonIndicati } }}</span>
              }
            </p>
            <ul class="elenco">
              @for (r of filtra(g.g.righe); track r.id) {
                <li [class.chiuso]="!r.aperto">
                  <span class="pallino" [class.on]="r.aperto" [class.ignoto]="r.origine === 'non-indicata'"></span>
                  <span class="nome">{{ r.nome }}
                    @if (r.citta) { <span class="citta">{{ r.citta }}</span> }
                  </span>
                  <span class="fasce">
                    @if (r.origine === 'non-indicata') {
                      <em class="grigio">{{ 'availability.noSource' | translate }}</em>
                    } @else if (!r.aperto) {
                      <em>{{ 'availability.closed' | translate }}</em>
                    } @else {
                      @for (f of r.fasce; track $index) {
                        <span class="fascia">{{ f.dalle || '—' }}@if (f.alle) {–{{ f.alle }}}</span>
                      }
                    }
                  </span>
                  <!-- Da dove viene la risposta: «quel giorno ha detto 10-12» non
                       è la stessa cosa di «di solito il martedì apre alle 9», e
                       una tabella che li mescola fa prendere il secondo per il
                       primo. -->
                  <span class="origine" [class.debole]="r.origine === 'settimanale'"
                        [title]="('availability.origin.' + r.origine + 'Hint') | translate">
                    {{ ('availability.origin.' + r.origine) | translate }}
                  </span>
                </li>
              }
              @if (!filtra(g.g.righe).length) {
                <li class="vuoto muted">{{ 'availability.none' | translate }}</li>
              }
            </ul>
          </section>
        }
      </div>
      }
    }
    @if (errore(); as e) { <div class="error-card card">{{ e }}</div> }
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
      .filtri { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 12px; }
      .filtri .f { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
      .filtri .f.cerca { flex: 1 1 240px; }
      .filtri .f > span { font-size: 12px; color: var(--text-secondary); }
      .filtri .interruttore { flex-direction: row; align-items: center; gap: 7px; min-width: 0; padding-bottom: 8px; }
      .filtri .interruttore > span { font-size: 13px; color: var(--text); }
      .colonne { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start; }
      .colonna { padding: 18px 20px; }
      .testa { display: flex; align-items: baseline; justify-content: space-between; }
      h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
      .conta { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .verde { color: #248A3D; }
      .sotto { margin: 2px 0 12px; font-size: 12.5px; color: var(--text-secondary); }
      .grigio { color: var(--text-secondary); }
      .elenco { list-style: none; margin: 0; padding: 0; max-height: 60vh; overflow: auto; }
      .elenco li { display: grid; grid-template-columns: 10px 1fr auto auto; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--hairline, #f2f2f4); font-size: 13.5px; }
      .elenco li.chiuso .nome { color: var(--text-secondary); }
      .pallino { width: 8px; height: 8px; border-radius: 50%; background: #C0392B; }
      .pallino.on { background: #248A3D; }
      .pallino.ignoto { background: #C7C7CC; }
      .nome { font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .citta { font-weight: 400; font-size: 12px; color: var(--text-tertiary); margin-left: 6px; }
      .citta-tabs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .citta-sel { max-width: 170px; }
      .nota-citta { font-size: 12px; color: var(--text-tertiary); padding-bottom: 10px; }
      .fasce { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; font-variant-numeric: tabular-nums; }
      .fascia { background: var(--fill, #f5f5f7); border-radius: 6px; padding: 1px 7px; }
      .origine { font-size: 10.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--gold-strong, #B8963E); cursor: help; white-space: nowrap; }
      .origine.debole { color: var(--text-secondary); font-weight: 500; }
      /* ⚠️ .elenco li (0,1,1) batteva .vuoto (0,1,0): il display:block perdeva
         e il testo finiva nella colonna del PALLINO da 10px — una parola per
         riga (trappola della specificità, visto da telefono 01/09). */
      .elenco li.vuoto { display: block; padding: 16px 0; border: 0; }
      /* Da telefono la riga a 4 colonne strizzava il nome: si impila —
         pallino+nome+origine sulla prima riga, fasce sotto (01/09). */
      @media (max-width: 640px) {
        .elenco li {
          grid-template-columns: 10px minmax(0, 1fr) auto;
          grid-template-areas: 'dot nome origine' 'dot fasce fasce';
          row-gap: 3px;
        }
        .elenco li .pallino { grid-area: dot; }
        .elenco li .nome { grid-area: nome; }
        .elenco li .fasce { grid-area: fasce; justify-content: flex-start; }
        .elenco li .origine { grid-area: origine; font-size: 9.5px; }
      }
      .state-card { padding: 28px; text-align: center; }
    `,
  ],
})
export class AvailabilityBoardComponent {
  private readonly http = inject(HttpClient);

  readonly dati = signal<Giornata | null>(null);
  readonly caricando = signal(true);
  readonly errore = signal<string | null>(null);

  giorno = this.oggi();
  cerca = '';
  /** Acceso di DEFAULT (l'utente, 26/08): la domanda tipica è «chi c'è oggi?». */
  soloDisponibili = true;
  citta = '';

  /** Le città più presenti, come tab veloci: un click, non una tendina. */
  readonly cittaVeloci = computed(() => {
    const conta = new Map<string, { nome: string; n: number }>();
    const d = this.dati();
    if (!d) return [] as { nome: string; n: number }[];
    for (const r of [...d.partner.righe, ...d.valet.righe]) {
      const c = (r.citta ?? '').trim();
      if (!c) continue;
      const k = c.toLowerCase();
      const v = conta.get(k) ?? { nome: c, n: 0 };
      v.n++;
      conta.set(k, v);
    }
    return [...conta.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  });

  scegliCitta(nome: string): void {
    this.citta = this.citta.toLowerCase() === nome.toLowerCase() ? '' : nome;
  }

  /**
   * Le città fra cui scegliere: quelle dichiarate nelle anagrafiche caricate,
   * partner e valet insieme, senza doppioni di maiuscole («Roma» e «ROMA»
   * sono la stessa scelta — vince la grafia vista per prima).
   */
  readonly cittaDisponibili = computed(() => {
    const d = this.dati();
    if (!d) return [] as string[];
    const viste = new Map<string, string>();
    for (const r of [...d.partner.righe, ...d.valet.righe]) {
      const c = (r.citta ?? '').trim();
      if (c && !viste.has(c.toLowerCase())) viste.set(c.toLowerCase(), c);
    }
    return [...viste.values()].sort((a, b) => a.localeCompare(b, 'it'));
  });

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

  vaiA(g: string): void { this.giorno = g; this.carica(); }

  filtra(righe: Riga[]): Riga[] {
    const t = this.cerca.trim().toLowerCase();
    const c = this.citta.trim().toLowerCase();
    return righe.filter((r) =>
      (!this.soloDisponibili || r.aperto)
      && (!t || r.nome.toLowerCase().includes(t))
      && (!c || (r.citta ?? '').trim().toLowerCase() === c),
    );
  }

  constructor() { this.carica(); }

  carica(): void {
    this.caricando.set(true);
    this.errore.set(null);
    this.http.get<Giornata>(`${environment.apiUrl}/availability/day`, { params: { date: this.giorno } })
      .subscribe({
        next: (d) => { this.dati.set(d); this.caricando.set(false); },
        error: (e) => {
          this.caricando.set(false);
          this.errore.set(e?.error?.message ?? 'Caricamento non riuscito');
        },
      });
  }
}
