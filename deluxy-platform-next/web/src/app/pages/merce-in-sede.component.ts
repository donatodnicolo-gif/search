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
      <input class="field cerca" [(ngModel)]="q" (ngModelChange)="carica()" [placeholder]="'merce.cerca' | translate" />
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

    @if (errore()) { <div class="avviso errore">{{ errore() }}</div> }

    <!-- LIVELLO 1 — chi ha la merce. Solo per l'ufficio: partner e valet atterrano sulla propria. -->
    @if (eUfficio() && !detentore()) {
      @if (riepilogo(); as r) {
        <div class="pillole">
          <span class="pillola">{{ 'merce.aMagazzino' | translate }} <strong>{{ r.magazzino }}</strong></span>
          @if (r.daStabilire.pezzi) {
            <a class="pillola attenzione" [routerLink]="['/deliveries']" [queryParams]="{ status: 'not_delivered', view: 'attive' }">
              {{ 'merce.daStabilire' | translate }} <strong>{{ r.daStabilire.pezzi }}</strong>
              <small>{{ 'merce.suConsegne' | translate: { n: r.daStabilire.consegne } }}</small>
            </a>
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
              <tr class="cliccabile" (click)="apriDetentore(r)">
                <td class="strong">{{ r.nome }}<small class="tipo">{{ 'merce.tipo.' + r.tipo | translate }}</small></td>
                <td class="num">{{ r.daRitirare || '—' }}</td>
                <td class="num">{{ r.inConsegna || '—' }}</td>
                <td class="num" [class.attenzione]="r.inSospeso > 0">{{ r.inSospeso || '—' }}</td>
                <td class="num muted">{{ r.consegnati || '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="vuoto">{{ (caricando() ? 'common.loading' : 'merce.nessuno') | translate }}</td></tr>
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
              <th class="num">{{ 'merce.col.giacenza' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of prodotti(); track r.nome + (r.variante ?? '')) {
              <tr class="cliccabile" (click)="apriRiga(r)">
                <td>{{ r.nome }}@if (r.variante) { <small class="variante">{{ r.variante }}</small> }</td>
                <td class="num">{{ r.daRitirare || '—' }}</td>
                <td class="num">{{ r.inConsegna || '—' }}</td>
                <td class="num" [class.attenzione]="r.inSospeso > 0">{{ r.inSospeso || '—' }}</td>
                <td class="num muted">{{ r.consegnati || '—' }}</td>
                <!-- La giacenza c'è solo dove è davvero governata: un flag senza numero non è una giacenza. -->
                <td class="num muted">{{ r.giacenza != null ? (r.giacenza | number) : '—' }}</td>
              </tr>
              @if (rigaAperta() === r.nome + (r.variante ?? '')) {
                <tr class="dettaglio">
                  <td colspan="6">
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
                    } @else {
                      <p class="muted">{{ (caricandoConsegne() ? 'common.loading' : 'merce.nessunaConsegna') | translate }}</p>
                    }
                  </td>
                </tr>
              }
            } @empty {
              <tr><td colspan="6" class="vuoto">{{ (caricando() ? 'common.loading' : 'merce.nessunProdotto') | translate }}</td></tr>
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
      .quick-tab.active { background: #111; color: #fff; border-color: #111; }
      .pillole { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .pillola { background: #fff; border: 1px solid var(--hairline); border-radius: 999px; padding: 7px 14px;
        font-size: 13.5px; color: var(--text-secondary); text-decoration: none; }
      .pillola strong { color: var(--text); margin-left: 4px; }
      .pillola.attenzione { border-color: #e6c07a; background: #fffaf0; }
      .pillola small { margin-left: 6px; }
      .di-chi { margin: 0 0 10px; color: var(--text-secondary); }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 11px 14px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; position: sticky; top: 0; background: var(--surface); }
      th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
      td.attenzione { color: #b06a00; font-weight: 600; }
      tr.cliccabile { cursor: pointer; }
      tr.cliccabile:hover { background: var(--hover); }
      .tipo, .variante { display: block; font-size: 11.5px; color: var(--text-secondary); font-weight: 400; }
      .vuoto { color: var(--text-secondary); text-align: center; padding: 26px; }
      .dettaglio td { background: #fbfbfd; white-space: normal; }
      .fasi { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
      .consegne { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .consegne li { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; font-size: 13px; }
      .pill { border-radius: 999px; padding: 2px 9px; font-size: 11.5px; background: var(--hairline); }
      .pill.attesa { background: #fff3df; color: #8a5a00; }
      /* ⚠️ Su telefono la riga NON si smonta in schede etichettate: sei righe per prodotto vorrebbero
         dire quattro prodotti per schermata. Nome sopra, numeri in fila sotto. */
      @media (max-width: 800px) {
        thead { display: none; }
        tbody tr.cliccabile { display: block; padding: 10px 0; border-bottom: 1px solid var(--hairline); }
        tbody tr.cliccabile td { display: inline-block; border: 0; padding: 2px 10px 2px 0; white-space: nowrap; }
        tbody tr.cliccabile td:first-child { display: block; font-weight: 600; padding-bottom: 4px; }
        tbody tr.cliccabile td.num::before { content: attr(data-eti) ' '; font-size: 11px; color: var(--text-tertiary); }
      }
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
  readonly riepilogo = signal<{ magazzino: number; daStabilire: { pezzi: number; consegne: number } } | null>(null);
  readonly prodotti = signal<RigaProdotto[]>([]);
  readonly detentore = signal<Detentore | null>(null);
  readonly rigaAperta = signal<string | null>(null);
  readonly faseAperta = signal<string>('inSospeso');
  readonly consegne = signal<ConsegnaMerce[]>([]);
  readonly etichettaPeriodo = computed(() => this.translate.instant('merce.periodo.' + this.periodo()));

  private da = '';
  private a = '';

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

  carica(): void {
    this.caricando.set(true);
    this.errore.set(null);
    this.rigaAperta.set(null);
    const finito = () => this.caricando.set(false);
    const errore = () => { finito(); this.errore.set(this.translate.instant('merce.errore')); };
    if (this.eUfficio() && !this.detentore()) {
      this.http.get<{ righe: Detentore[]; magazzino: number; daStabilire: { pezzi: number; consegne: number } }>(
        `${environment.apiUrl}/merce-in-sede/detentori`, { params: this.parametri() },
      ).subscribe({
        next: (d) => { this.detentori.set(d.righe ?? []); this.riepilogo.set({ magazzino: d.magazzino, daStabilire: d.daStabilire }); finito(); },
        error: errore,
      });
      return;
    }
    this.http.get<{ righe: RigaProdotto[] }>(`${environment.apiUrl}/merce-in-sede`, { params: this.parametri() }).subscribe({
      next: (d) => { this.prodotti.set(d.righe ?? []); finito(); },
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
    this.caricaConsegne(r, r.inSospeso > 0 ? 'inSospeso' : r.daRitirare > 0 ? 'daRitirare' : 'consegnati');
  }

  caricaConsegne(r: RigaProdotto, fase: string): void {
    this.faseAperta.set(fase);
    this.caricandoConsegne.set(true);
    this.consegne.set([]);
    const params = this.parametri().set('prodotto', r.nome).set('fase', fase);
    this.http.get<ConsegnaMerce[]>(`${environment.apiUrl}/merce-in-sede/consegne`, { params }).subscribe({
      next: (d) => { this.consegne.set(d ?? []); this.caricandoConsegne.set(false); },
      error: () => this.caricandoConsegne.set(false),
    });
  }
}

interface Detentore { tipo: 'partner' | 'valet'; id: string; nome: string; daRitirare: number; inConsegna: number; inSospeso: number; consegnati: number }
interface RigaProdotto { nome: string; variante: string | null; daRitirare: number; inConsegna: number; inSospeso: number; consegnati: number; giacenza: number | null }
interface ConsegnaMerce { code: number; data: string; stato: string; quantita: number; partner: string | null; valet: string | null; luogo: string | null; destinazione: string | null }
