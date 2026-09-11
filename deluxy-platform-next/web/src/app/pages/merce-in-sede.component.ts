import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { AltezzaViewportDirective } from '../core/altezza-viewport.directive';

/**
 * ⭐ 11/09/2026 — MERCE IN SEDE (richiesta utente, disegno del custode UX&UI).
 *
 * PERCHÉ NON SONO TRE TABELLE. La richiesta diceva «tre tabelle: da ritirare, in consegna, consegnati».
 * Il custode l'ha bocciata con una ragione che regge: la domanda vera è «di quelle dodici rose, quante
 * sono ancora in negozio e quante sono in giro?», e con tre tabelle quella risposta costa due salti e due
 * numeri da tenere a mente. Qui una riga per prodotto, i numeri affiancati, il confronto è gratis.
 *
 * LA COLONNA IN PIÙ. «In sospeso» non era stata chiesta ed è la più importante: è la merce delle consegne
 * non consegnate, quella che il valet deve smistare. Senza una colonna sua resterebbe invisibile.
 *
 * ⚠️ «Consegnati» è un FLUSSO, non una giacenza: cresce per sempre, quindi ha un periodo e il periodo è
 * scritto nell'intestazione. Le altre tre colonne sono la fotografia di adesso e il periodo non le tocca.
 * ⚠️ «Da ritirare» è un IMPEGNO, non una presenza: un bouquet non esiste finché il fioraio non lo fa.
 * Sta scritto sotto il titolo, perché nessuno la usi come inventario.
 */
@Component({
  selector: 'app-merce-in-sede',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, NgTemplateOutlet, RouterLink, TranslatePipe, AltezzaViewportDirective],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'merce.titolo' | translate }}</h1>
        <p class="page-caption">{{ 'merce.caption' | translate }}</p>
      </div>
    </div>

    <section class="card filtri">
      <input class="field cerca" [(ngModel)]="q" (ngModelChange)="cercaConFreno()" [placeholder]="'merce.cerca' | translate" />
      <div class="quick-tabs">
        @for (p of PERIODI; track p) {
          <button type="button" class="quick-tab" [class.active]="periodo() === p" (click)="scegliPeriodo(p)">
            {{ 'merce.periodo.' + p | translate }}
          </button>
        }
      </div>
      @if (eUfficio() && detentore()) {
        <button type="button" class="btn btn-secondary" (click)="tornaAiDetentori()">{{ 'merce.tuttiIDetentori' | translate }}</button>
      }
    </section>

    @if (errore()) {
      <!-- ⚠️ La classe canonica è .error-card: un guasto è una card rossa con l'azione di ripresa,
           non testo nero nudo. -->
      <div class="error-card">
        {{ errore() }}
        <button type="button" class="btn btn-secondary" (click)="carica()">{{ 'common.retry' | translate }}</button>
      </div>
    }

    <!-- LIVELLO 1 — chi ha la merce. Solo per l'ufficio: partner e valet atterrano sulla propria. -->
    @if (eUfficio() && !detentore()) {
      @if (riepilogo(); as r) {
        <div class="pillole">
          <span class="pillola">{{ 'merce.aMagazzino' | translate }} <strong>{{ r.magazzino }}</strong></span>
          @if (r.arretrate.pezzi) {
            <!-- Le consegne mai chiuse con una data già passata: non sono merce da ritirare, sono
                 lavoro rimasto indietro. Contarle nella colonna avrebbe raccontato una boutique piena
                 di roba che non ha. -->
            <span class="pillola attenzione">
              {{ 'merce.arretrate' | translate }} <strong>{{ r.arretrate.pezzi }}</strong>
              <small>{{ 'merce.suConsegneSemplice' | translate: { n: r.arretrate.consegne } }}</small>
            </span>
          }
          @if (r.daStabilire.pezzi) {
            <!-- ⚠️ NON è un link: l'elenco consegne non sa filtrare per destinazione, e portare là
                 significherebbe promettere 872 consegne e mostrarne 1.750, archivio compreso. E il
                 numero dichiara la sua copertura, perché un contatore che comprende il 2019 non
                 scenderebbe mai. -->
            <span class="pillola attenzione">
              {{ 'merce.daStabilire' | translate }} <strong>{{ r.daStabilire.pezzi }}</strong>
              <small>{{ 'merce.suConsegne' | translate: { n: r.daStabilire.consegne, g: r.giorni } }}</small>
            </span>
          }
        </div>
      }
      <div class="card table-wrap" appAltezzaViewport>
        <table>
          <thead>
            <tr>
              <th>{{ 'merce.col.detentore' | translate }}</th>
              <th class="num">{{ 'merce.col.daRitirare' | translate }}</th>
              <th class="num">{{ 'merce.col.inConsegna' | translate }}</th>
              <th class="num">{{ 'merce.col.inSospeso' | translate }}</th>
              <th class="num">{{ 'merce.col.consegnati' | translate }} · {{ etichettaPeriodo() }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of detentori(); track r.tipo + r.id) {
              <tr class="cliccabile" tabindex="0" (click)="apriDetentore(r)"
                  (keydown.enter)="apriDetentore(r)" (keydown.space)="$event.preventDefault(); apriDetentore(r)">
                <td class="strong">{{ r.nome }}<small class="tipo">{{ 'merce.tipo.' + r.tipo | translate }}</small></td>
                <td class="num">{{ r.daRitirare || '—' }}</td>
                <td class="num">{{ r.inConsegna || '—' }}</td>
                <td class="num" [class.attenzione]="r.inSospeso > 0">{{ r.inSospeso || '—' }}</td>
                <td class="num muted">{{ r.consegnati || '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="vuoto">
                @if (caricando()) { {{ 'common.loading' | translate }} }
                @else if (q.trim()) { {{ 'merce.nessunoConRicerca' | translate: { q: q } }} }
                @else { {{ 'merce.nessuno' | translate }} }
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <!-- LIVELLO 2 — una riga per prodotto. -->
      @if (detentore(); as d) {
        <p class="di-chi">{{ 'merce.merceDi' | translate }} <strong>{{ d.nome }}</strong></p>
      }
      <div class="card table-wrap" appAltezzaViewport>
        <table>
          <thead>
            <tr>
              <th>{{ 'merce.col.prodotto' | translate }}</th>
              <th class="num">{{ 'merce.col.daRitirare' | translate }}</th>
              <th class="num">{{ 'merce.col.inConsegna' | translate }}</th>
              <th class="num">{{ 'merce.col.inSospeso' | translate }}</th>
              <th class="num">{{ 'merce.col.consegnati' | translate }} · {{ etichettaPeriodo() }}</th>
              @if (mostraGiacenza()) { <th class="num">{{ 'merce.col.giacenza' | translate }}</th> }
            </tr>
          </thead>
          <tbody>
            @for (r of prodotti(); track r.nome + (r.variante ?? '')) {
              <tr class="cliccabile" tabindex="0" [attr.aria-expanded]="rigaAperta() === r.nome + (r.variante ?? '')"
                  (click)="apriRiga(r)" (keydown.enter)="apriRiga(r)" (keydown.space)="$event.preventDefault(); apriRiga(r)">
                <td>{{ r.nome }}@if (r.variante) { <small class="variante">{{ r.variante }}</small> }</td>
                <td class="num">{{ r.daRitirare || '—' }}</td>
                <td class="num">{{ r.inConsegna || '—' }}</td>
                <td class="num" [class.attenzione]="r.inSospeso > 0">{{ r.inSospeso || '—' }}</td>
                <td class="num muted">{{ r.consegnati || '—' }}</td>
                <!-- La giacenza c'è solo dove è davvero governata: un flag senza numero non è una giacenza. -->
                @if (mostraGiacenza()) { <td class="num muted">{{ r.giacenza != null ? (r.giacenza | number) : '—' }}</td> }
              </tr>
              @if (rigaAperta() === r.nome + (r.variante ?? '')) {
                <tr class="dettaglio">
                  <td [attr.colspan]="mostraGiacenza() ? 6 : 5">
                    <!-- ⚠️ Nessun numero senza l'elenco che lo genera: un totale che nessuno può
                         verificare è un totale di cui nessuno si fida. -->
                    <div class="fasi">
                      @for (f of FASI; track f) {
                        <button type="button" class="quick-tab" [class.active]="faseAperta() === f" (click)="$event.stopPropagation(); caricaConsegne(r, f)">
                          {{ 'merce.col.' + f | translate }}
                        </button>
                      }
                    </div>
                    @if (consegne().length) {
                      <ul class="consegne">
                        @for (c of consegne(); track c.code) {
                          <li>
                            <a [routerLink]="['/deliveries']" [queryParams]="{ q: c.code }">#{{ c.code }}</a>
                            <span>{{ c.data | date: 'dd/MM/yy' }}</span>
                            <span class="strong">×{{ c.quantita }}</span>
                            <span class="muted">{{ c.partner ?? '—' }}</span>
                            <span class="muted">{{ c.valet ?? '—' }}</span>
                            @if (c.luogo) { <span class="muted">📍 {{ c.luogo }}</span> }
                            @if (c.destinazione && c.destinazione !== 'none') {
                              <span class="pill">{{ 'merce.destinazione.' + c.destinazione | translate }}</span>
                            } @else if (faseAperta() === 'inSospeso') {
                              <span class="pill attesa">{{ 'merce.destinazione.daStabilire' | translate }}</span>
                            }
                          </li>
                        }
                      </ul>
                    } @else if (erroreConsegne()) {
                      <!-- ⚠️ Un fallimento non è MAI una lista vuota: se la chiamata cade lo si dice. -->
                      <div class="error-card">{{ erroreConsegne() }}</div>
                    } @else {
                      <p class="muted">{{ (caricandoConsegne() ? 'common.loading' : 'merce.nessunaConsegna') | translate }}</p>
                    }
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="6" class="vuoto">
                @if (caricando()) { {{ 'common.loading' | translate }} }
                @else if (q.trim()) { {{ 'merce.nessunoConRicerca' | translate: { q: q } }} }
                @else { {{ 'merce.nessunProdotto' | translate }} }
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .page-header { margin-bottom: 16px; }
      h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); }
      .filtri { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
      .cerca { min-width: 240px; }
      .field { border: 1px solid var(--hairline-strong); border-radius: 10px; padding: 8px 12px; font-size: 14px; }
      .quick-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
      .quick-tab { border: 1px solid var(--hairline-strong); background: #fff; border-radius: 999px;
        padding: 6px 13px; cursor: pointer; font-size: 13.5px; }
      .quick-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
      .pillole { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .pillola { background: #fff; border: 1px solid var(--hairline); border-radius: 999px; padding: 7px 14px;
        font-size: 13.5px; color: var(--text-secondary); text-decoration: none; }
      .pillola strong { color: var(--text); margin-left: 4px; }
      .pillola.attenzione { border-color: var(--gold); background: var(--surface-warm, #fffaf0); }
      .pillola small { margin-left: 6px; }
      .di-chi { margin: 0 0 10px; color: var(--text-secondary); }
      /* Il vestito della tabella lo dà il foglio globale a tutte le liste: qui solo ciò che è di questa. */
      td.num { font-variant-numeric: tabular-nums; }
      td.attenzione { color: var(--orange); font-weight: 600; }
      tr.cliccabile { cursor: pointer; }
      tr.cliccabile:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
      .tipo, .variante { display: block; font-size: 11.5px; color: var(--text-secondary); font-weight: 400; }
      .vuoto { color: var(--text-secondary); text-align: center; padding: 26px; }
      .dettaglio td { background: var(--surface-2, #fbfbfd); white-space: normal; }
      .fasi { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
      .consegne { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .consegne li { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; font-size: 13px; }
      .pill { border-radius: 999px; padding: 2px 9px; font-size: 11.5px; background: var(--hairline); }
      .pill.attesa { background: var(--surface-warm, #fff3df); color: var(--orange); }
      /* ⚠️ 11/09/2026 — NIENTE MEDIA QUERY QUI (rilievo del custode UX&UI). Il foglio globale smonta
         tutte le tabelle in schede etichettate con !important, leggendo i nomi dalle intestazioni:
         una media query di componente non può vincere, e infatti vinceva solo su una riga — quella che
         scriveva l'etichetta da un attributo che nessuno scrive. Su telefono restavano quattro numeri
         senza nome, proprio a valet e partner, cioè agli unici che quella pagina la aprono dal telefono.
         Se un giorno servirà davvero una forma compatta, nascerà come classe nel foglio globale. */
    `,
  ],
})
export class MerceInSedeComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  readonly auth = inject(AuthService);

  readonly PERIODI = ['oggi', 'settimana', 'mese', 'sempre'] as const;
  readonly FASI = ['daRitirare', 'inConsegna', 'inSospeso', 'consegnati'] as const;

  q = '';
  readonly periodo = signal<string>('oggi');
  readonly caricando = signal(false);
  readonly caricandoConsegne = signal(false);
  readonly errore = signal<string | null>(null);
  readonly detentori = signal<Detentore[]>([]);
  readonly riepilogo = signal<{ magazzino: number; daStabilire: { pezzi: number; consegne: number }; giorni: number; arretrate: { pezzi: number; consegne: number } } | null>(null);
  readonly prodotti = signal<RigaProdotto[]>([]);
  readonly detentore = signal<Detentore | null>(null);
  readonly rigaAperta = signal<string | null>(null);
  readonly faseAperta = signal<string>('inSospeso');
  readonly consegne = signal<ConsegnaMerce[]>([]);
  readonly erroreConsegne = signal<string | null>(null);
  readonly etichettaPeriodo = computed(() => this.translate.instant('merce.periodo.' + this.periodo()));
  /** La giacenza è governata su 7 prodotti in tutto: una colonna vuota al 99% è spazio tolto ai dati. */
  readonly mostraGiacenza = computed(() => this.prodotti().some((r) => r.giacenza != null));

  private da = '';
  private a = '';
  /** ⚠️ Senza freno, digitare «rose» sono quattro chiamate e a schermo resta quella che arriva per
   *  ultima, non quella che hai scritto per ultima. Il contatore scarta le risposte vecchie. */
  private attesa: ReturnType<typeof setTimeout> | null = null;
  private giro = 0;

  constructor() {
    this.scegliPeriodo('oggi');
  }

  eUfficio(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  scegliPeriodo(p: string): void {
    this.periodo.set(p);
    const oggi = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (p === 'sempre') { this.da = '2019-01-01'; this.a = iso(oggi); }
    else {
      const inizio = new Date(oggi);
      if (p === 'settimana') inizio.setDate(inizio.getDate() - 7);
      if (p === 'mese') inizio.setMonth(inizio.getMonth() - 1);
      this.da = iso(inizio);
      this.a = iso(oggi);
    }
    this.carica();
  }

  private parametri(): HttpParams {
    let p = new HttpParams().set('da', this.da).set('a', this.a);
    if (this.q.trim()) p = p.set('q', this.q.trim());
    const d = this.detentore();
    if (d) p = p.set(d.tipo === 'partner' ? 'partnerId' : 'valetId', d.id);
    return p;
  }

  /** La ricerca aspetta che tu finisca di scrivere. Gli altri filtri no: sono un gesto solo. */
  cercaConFreno(): void {
    if (this.attesa) clearTimeout(this.attesa);
    this.attesa = setTimeout(() => this.carica(), 300);
  }

  carica(): void {
    const mio = ++this.giro;
    this.caricando.set(true);
    this.errore.set(null);
    this.rigaAperta.set(null);
    const finito = () => this.caricando.set(false);
    const errore = () => { finito(); this.errore.set(this.translate.instant('merce.errore')); };
    if (this.eUfficio() && !this.detentore()) {
      this.http.get<{ righe: Detentore[]; magazzino: number; daStabilire: { pezzi: number; consegne: number }; daStabilireGiorni?: number; arretrate?: { pezzi: number; consegne: number } }>(
        `${environment.apiUrl}/merce-in-sede/detentori`, { params: this.parametri() },
      ).subscribe({
        next: (d) => {
          if (mio !== this.giro) return;
          this.detentori.set(d.righe ?? []);
          this.riepilogo.set({ magazzino: d.magazzino, daStabilire: d.daStabilire, giorni: d.daStabilireGiorni ?? 90, arretrate: d.arretrate ?? { pezzi: 0, consegne: 0 } });
          finito();
        },
        error: errore,
      });
      return;
    }
    this.http.get<{ righe: RigaProdotto[] }>(`${environment.apiUrl}/merce-in-sede`, { params: this.parametri() }).subscribe({
      next: (d) => { if (mio !== this.giro) return; this.prodotti.set(d.righe ?? []); finito(); },
      error: errore,
    });
  }

  apriDetentore(d: Detentore): void { this.detentore.set(d); this.carica(); }
  tornaAiDetentori(): void { this.detentore.set(null); this.prodotti.set([]); this.carica(); }

  apriRiga(r: RigaProdotto): void {
    const chiave = r.nome + (r.variante ?? '');
    if (this.rigaAperta() === chiave) { this.rigaAperta.set(null); return; }
    this.rigaAperta.set(chiave);
    // Si apre sulla fase che ha qualcosa da dire: se c'è merce in sospeso, quella.
    // Si apre sulla fase che ha davvero qualcosa da dire, «in consegna» compresa: aprire su una fase
    // vuota mostra «nessuna consegna» sotto un numero ben visibile, e sembra un guasto.
    const prima = (['inSospeso', 'daRitirare', 'inConsegna', 'consegnati'] as const)
      .find((f) => (r as unknown as Record<string, number>)[f] > 0) ?? 'consegnati';
    this.caricaConsegne(r, prima);
  }

  caricaConsegne(r: RigaProdotto, fase: string): void {
    this.faseAperta.set(fase);
    this.caricandoConsegne.set(true);
    this.erroreConsegne.set(null);
    this.consegne.set([]);
    let params = this.parametri().set('prodotto', r.nome).set('fase', fase);
    if (r.variante) params = params.set('variante', r.variante);
    this.http.get<ConsegnaMerce[]>(`${environment.apiUrl}/merce-in-sede/consegne`, { params }).subscribe({
      next: (d) => { this.consegne.set(d ?? []); this.caricandoConsegne.set(false); },
      error: () => { this.caricandoConsegne.set(false); this.erroreConsegne.set(this.translate.instant('merce.errore')); },
    });
  }
}

interface Detentore { tipo: 'partner' | 'valet'; id: string; nome: string; daRitirare: number; inConsegna: number; inSospeso: number; consegnati: number }
interface RigaProdotto { nome: string; variante: string | null; daRitirare: number; inConsegna: number; inSospeso: number; consegnati: number; giacenza: number | null }
interface ConsegnaMerce { code: number; data: string; stato: string; quantita: number; partner: string | null; valet: string | null; luogo: string | null; destinazione: string | null }
