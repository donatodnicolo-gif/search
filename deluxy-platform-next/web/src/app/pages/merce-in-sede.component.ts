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
        <!-- ⭐ 11/09/2026 (segnalazione utente): il ritorno sta IN ALTO, non in mezzo ai filtri. È il
             primo posto dove si cerca un'uscita quando si è scesi di un livello. -->
        @if (detentore()) {
          <a class="indietro" [routerLink]="['/merce-in-sede']" (click)="tornaAiDetentori()">← {{ 'common.back' | translate }}</a>
        }
        <h1>{{ 'merce.titolo' | translate }}</h1>
        <p class="page-caption">{{ 'merce.caption' | translate }}</p>
      </div>
    </div>

    <!--
      ⭐⭐ 11/09/2026 (regola utente): «qui vanno messi solo stock di consegne ancora da fare; la
      selezione delle date va fatta in ottica prospettica; riguardo al passato fai una sezione storico».
      Sono due domande diverse e si guardano in due momenti diversi: che merce mi aspetta, e che cosa è
      già successo. Mescolarle metteva nella stessa tabella la consegna di domani e quella fallita l'anno
      scorso.
    -->
    <div class="quick-tabs sezioni">
      @for (s of SEZIONI; track s) {
        <button type="button" class="quick-tab" [class.active]="sezione() === s" (click)="scegliSezione(s)">
          {{ 'merce.sezione.' + s | translate }}
        </button>
      }
    </div>

    <section class="card filtri">
      <input class="field cerca" [(ngModel)]="q" (ngModelChange)="cercaConFreno()" [placeholder]="'merce.cerca' | translate" />
      <div class="quick-tabs">
        @for (p of periodi(); track p) {
          <button type="button" class="quick-tab" [class.active]="periodo() === p" (click)="scegliPeriodo(p)">
            {{ 'merce.periodo.' + p | translate }}
          </button>
        }
      </div>
      <!-- Le due date compaiono solo su «periodo scelto»: due campi vuoti accanto a quattro scorciatoie
           sono due campi che nessuno usa e che occupano la riga. -->
      @if (periodo() === 'personalizzato') {
        <label class="fld"><span>{{ 'statPartner.dal' | translate }}</span>
          <input class="field" type="date" [(ngModel)]="da" (change)="carica()" /></label>
        <label class="fld"><span>{{ 'statPartner.al' | translate }}</span>
          <input class="field" type="date" [(ngModel)]="a" (change)="carica()" /></label>
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

    <!--
      I CONTATORI stanno fuori dalle colonne, e ognuno per una ragione sua: le arretrate sono lavoro
      da chiudere, le cancellazioni richieste sono merce di cui non si sa più dove fosse, la
      destinazione da stabilire è merce non consegnata che nessuno ha smistato. Si vedono a tutti,
      perché anche un partner deve sapere che ha tre consegne appese.
    -->
    @if (riepilogo(); as r) {
      <div class="pillole">
        @if (eUfficio() && !detentore()) {
          <span class="pillola">{{ 'merce.aMagazzino' | translate }} <strong>{{ r.magazzino }}</strong></span>
        }
        @if (r.cancellazioniRichieste.pezzi) {
          <span class="pillola attenzione">
            {{ 'merce.cancellazioni' | translate }} <strong>{{ r.cancellazioniRichieste.pezzi }}</strong>
            <small>{{ 'merce.suConsegneSemplice' | translate: { n: r.cancellazioniRichieste.consegne } }}</small>
          </span>
        }
        @if (r.arretrate.pezzi) {
          <span class="pillola attenzione">
            {{ 'merce.arretrate' | translate }} <strong>{{ r.arretrate.pezzi }}</strong>
            <small>{{ 'merce.suConsegneSemplice' | translate: { n: r.arretrate.consegne } }}</small>
          </span>
        }
        @if (r.daStabilire.pezzi) {
          <span class="pillola attenzione">
            {{ 'merce.daStabilire' | translate }} <strong>{{ r.daStabilire.pezzi }}</strong>
            <small>{{ 'merce.suConsegne' | translate: { n: r.daStabilire.consegne, g: r.giorni } }}</small>
          </span>
        }
      </div>
    }

    <!-- LIVELLO 1 — chi ha la merce. Solo per l'ufficio: partner e valet atterrano sulla propria. -->
    @if (eUfficio() && !detentore()) {
      <!--
        ⭐ 11/09/2026 (regola utente): «separa con due tab di visualizzazione partner dai valet».
        Qui le schede ci stanno, e non contraddicono la regola per cui le FASI non si separano: partner
        e valet sono due popolazioni diverse, non due fasi della stessa cosa. Nessuno confronta una
        boutique con un fattorino, mentre confrontare «da ritirare» e «in consegna» dello stesso
        prodotto è esattamente la domanda della pagina.
      -->
      <div class="quick-tabs viste">
        @for (v of VISTE; track v) {
          <button type="button" class="quick-tab" [class.active]="vista() === v" (click)="vista.set(v)">
            {{ 'merce.vista.' + v | translate }}
            <small>{{ quanti(v) }}</small>
          </button>
        }
      </div>
      <div class="card table-wrap" appAltezzaViewport>
        <table>
          <thead>
            <tr>
              <th><button type="button" class="th-ordina" (click)="ordinaPer('nome')">{{ 'merce.col.' + (vista() === 'valet' ? 'valet' : 'partner') | translate }}{{ freccia('nome') }}</button></th>
              @if (sezione() === 'daFare') {
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('daRitirare')">{{ 'merce.col.daRitirare' | translate }}{{ freccia('daRitirare') }}</button></th>
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('inConsegna')">{{ 'merce.col.inConsegna' | translate }}{{ freccia('inConsegna') }}</button></th>
                <!-- ⭐ 11/09/2026 (regola utente): la merce di servizio assegnata al partner. -->
                @if (vista() === 'partner') {
                  <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('inDotazione')">{{ 'merce.col.inDotazione' | translate }}{{ freccia('inDotazione') }}</button></th>
                }
              } @else {
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('consegnati')">{{ 'merce.col.consegnati' | translate }}{{ freccia('consegnati') }}</button></th>
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('inSospeso')">{{ 'merce.col.inSospeso' | translate }}{{ freccia('inSospeso') }}</button></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of detentoriVisti(); track r.tipo + r.id) {
              <tr class="cliccabile" tabindex="0" (click)="apriDetentore(r)"
                  (keydown.enter)="apriDetentore(r)" (keydown.space)="$event.preventDefault(); apriDetentore(r)">
                <td class="strong">{{ r.nome }}</td>
                @if (sezione() === 'daFare') {
                  <td class="num">{{ r.daRitirare || '—' }}</td>
                  <td class="num">{{ r.inConsegna || '—' }}</td>
                  @if (vista() === 'partner') { <td class="num dotazione">{{ r.inDotazione || '—' }}</td> }
                } @else {
                  <td class="num muted">{{ r.consegnati || '—' }}</td>
                  <td class="num" [class.attenzione]="r.inSospeso > 0">{{ r.inSospeso || '—' }}</td>
                }
              </tr>
            } @empty {
              <tr><td colspan="3" class="vuoto">
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
              <th><button type="button" class="th-ordina" (click)="ordinaPer('nome')">{{ 'merce.col.prodotto' | translate }}{{ freccia('nome') }}</button></th>
              @if (sezione() === 'daFare') {
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('daRitirare')">{{ 'merce.col.daRitirare' | translate }}{{ freccia('daRitirare') }}</button></th>
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('inConsegna')">{{ 'merce.col.inConsegna' | translate }}{{ freccia('inConsegna') }}</button></th>
              } @else {
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('consegnati')">{{ 'merce.col.consegnati' | translate }}{{ freccia('consegnati') }}</button></th>
                <th class="num"><button type="button" class="th-ordina" (click)="ordinaPer('inSospeso')">{{ 'merce.col.inSospeso' | translate }}{{ freccia('inSospeso') }}</button></th>
              }
              @if (mostraGiacenza()) { <th class="num">{{ 'merce.col.giacenza' | translate }}</th> }
            </tr>
          </thead>
          <tbody>
            @for (r of prodottiVisti(); track r.nome + (r.variante ?? '')) {
              <tr class="cliccabile" tabindex="0" [attr.aria-expanded]="rigaAperta() === r.nome + (r.variante ?? '')"
                  (click)="apriRiga(r)" (keydown.enter)="apriRiga(r)" (keydown.space)="$event.preventDefault(); apriRiga(r)">
                <td>{{ r.nome }}@if (r.variante) { <small class="variante">{{ r.variante }}</small> }</td>
                @if (sezione() === 'daFare') {
                  <td class="num">{{ r.daRitirare || '—' }}</td>
                  <td class="num">{{ r.inConsegna || '—' }}</td>
                } @else {
                  <td class="num muted">{{ r.consegnati || '—' }}</td>
                  <td class="num" [class.attenzione]="r.inSospeso > 0">{{ r.inSospeso || '—' }}</td>
                }
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

    <!--
      ⭐⭐ 11/09/2026 (regola utente): «metti prodotti con flag servizio, che saranno ad esempio i
      biglietti che si possono assegnare per singoli stock ai vari partner: l'assegnazione fa comparire
      questo prodotto in merce».

      Sta in fondo e non in cima di proposito: la pagina serve a sapere che merce ci si aspetta oggi, e
      la dotazione è una giacenza ferma che si guarda una volta ogni tanto. Metterla in testa
      sposterebbe tutti i giorni l'occhio su ciò che non cambia mai.
    -->
    @if (sezione() === 'daFare' && vistaDotazione()) {
      <section class="card dotazione-pannello">
        <header class="testa">
          <h2>{{ 'merce.dotazione.titolo' | translate }}</h2>
          <p class="muted">{{ 'merce.dotazione.spiega' | translate }}</p>
        </header>

        @if (eUfficio()) {
          <form class="riga-assegna" (ngSubmit)="assegna()">
            <label class="fld"><span>{{ 'merce.dotazione.partner' | translate }}</span>
              <select class="field" [(ngModel)]="nuovo.partnerId" name="dotPartner" required>
                <option value="">—</option>
                @for (p of partnerDisponibili(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
              </select>
            </label>
            <label class="fld"><span>{{ 'merce.dotazione.prodotto' | translate }}</span>
              <select class="field" [(ngModel)]="nuovo.productId" name="dotProdotto" required>
                <option value="">—</option>
                @for (p of prodottiServizio(); track p.id) { <option [value]="p.id">{{ p.nome }}</option> }
              </select>
            </label>
            <label class="fld stretta"><span>{{ 'merce.dotazione.quantita' | translate }}</span>
              <input class="field" type="number" min="0" [(ngModel)]="nuovo.quantita" name="dotQta" required />
            </label>
            <label class="fld"><span>{{ 'merce.dotazione.note' | translate }}</span>
              <input class="field" type="text" [(ngModel)]="nuovo.note" name="dotNote" />
            </label>
            <button class="btn btn-primary" type="submit" [disabled]="!nuovo.partnerId || !nuovo.productId || salvando()">
              {{ 'merce.dotazione.assegna' | translate }}
            </button>
          </form>
          @if (!prodottiServizio().length) {
            <p class="avviso">{{ 'merce.dotazione.nessunProdotto' | translate }}</p>
          }
          @if (erroreDotazione()) { <p class="avviso attenzione">{{ erroreDotazione() }}</p> }
        }

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                @if (eUfficio() && !detentore()) { <th>{{ 'merce.dotazione.partner' | translate }}</th> }
                <th>{{ 'merce.dotazione.prodotto' | translate }}</th>
                <th class="num">{{ 'merce.dotazione.quantita' | translate }}</th>
                <th>{{ 'merce.dotazione.note' | translate }}</th>
                @if (eUfficio()) { <th></th> }
              </tr>
            </thead>
            <tbody>
              @for (d of dotazione(); track d.id) {
                <tr>
                  @if (eUfficio() && !detentore()) { <td class="strong">{{ d.partner }}</td> }
                  <td>
                    {{ d.prodotto }}
                    @if (d.nonPiuDiServizio) { <small class="attenzione"> · {{ 'merce.dotazione.nonPiuServizio' | translate }}</small> }
                  </td>
                  <td class="num dotazione">{{ d.quantita }}</td>
                  <td class="muted">{{ d.note }}</td>
                  @if (eUfficio()) {
                    <td class="num"><button type="button" class="link-azione" (click)="togli(d)">{{ 'common.delete' | translate }}</button></td>
                  }
                </tr>
              } @empty {
                <tr><td [attr.colspan]="6" class="vuoto">{{ 'merce.dotazione.nessuna' | translate }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
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
      .quick-tab small { margin-left: 6px; opacity: 0.7; }
      .viste { margin-bottom: 12px; }
      .pillole { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .pillola { background: #fff; border: 1px solid var(--hairline); border-radius: 999px; padding: 7px 14px;
        font-size: 13.5px; color: var(--text-secondary); text-decoration: none; }
      .pillola strong { color: var(--text); margin-left: 4px; }
      .pillola.attenzione { border-color: var(--gold); background: var(--surface-warm, #fffaf0); }
      .pillola small { margin-left: 6px; }
      .di-chi { margin: 0 0 10px; color: var(--text-secondary); }
      .indietro { display: inline-block; margin-bottom: 6px; color: var(--text-secondary); text-decoration: none; font-size: 13.5px; }
      .indietro:hover { color: var(--text); }
      .th-ordina { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
      .th-ordina:hover { color: var(--text); }
      /* Il vestito della tabella lo dà il foglio globale a tutte le liste: qui solo ciò che è di questa. */
      td.num { font-variant-numeric: tabular-nums; }
      td.attenzione { color: var(--orange); font-weight: 600; }
      tr.cliccabile { cursor: pointer; }
      tr.cliccabile:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
      .tipo, .variante { display: block; font-size: 11.5px; color: var(--text-secondary); font-weight: 400; }
      .vuoto { color: var(--text-secondary); text-align: center; padding: 26px; }
      .dotazione-pannello { margin-top: 16px; padding: 14px 16px 6px; }
      .dotazione-pannello .testa h2 { font-size: 15px; margin: 0 0 2px; letter-spacing: -0.01em; }
      .dotazione-pannello .testa p { margin: 0 0 12px; font-size: 12px; }
      .dotazione-pannello .table-wrap { overflow-x: auto; }
      .riga-assegna { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 12px; }
      .riga-assegna .fld { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
      .riga-assegna .fld.stretta { min-width: 90px; }
      .riga-assegna .fld span { font-size: 11px; color: var(--text-secondary); }
      .avviso { font-size: 12px; color: var(--text-secondary); margin: 0 0 10px; }
      td.dotazione, .num.dotazione { font-variant-numeric: tabular-nums; font-weight: 600; }
      .link-azione { background: none; border: 0; color: var(--text-secondary); cursor: pointer; font-size: 12px; text-decoration: underline; }
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

  readonly SEZIONI = ['daFare', 'storico'] as const;
  readonly sezione = signal<'daFare' | 'storico'>('daFare');
  /**
   * ⚠️ I periodi guardano dalla parte giusta: su «da fare» in avanti (oggi, domani, questa settimana),
   * su «storico» indietro. Offrire «ultimo mese» a chi cerca la merce da preparare è un invito a
   * leggere il passato credendo di leggere il futuro.
   */
  readonly PERIODI_DA_FARE = ['oggi', 'domani', 'setteGiorni', 'personalizzato'] as const;
  readonly PERIODI_STORICO = ['ieri', 'ultimaSettimana', 'ultimoMese', 'personalizzato'] as const;
  readonly periodi = computed(() => (this.sezione() === 'storico' ? this.PERIODI_STORICO : this.PERIODI_DA_FARE));
  readonly VISTE = ['partner', 'valet'] as const;

  /**
   * ⭐ 11/09/2026 (segnalazione utente) — L'ORDINAMENTO DALLE INTESTAZIONI.
   *
   * Il Libro UX&UI lo chiede da sempre (§8: «ordinamento dal click sull'intestazione con freccia di
   * direzione, preservando i filtri»), e questa tabella è nata senza. Si ordina in memoria: le righe
   * sono già tutte qui, e una chiamata in più per riordinare trecento righe sarebbe uno spreco.
   *
   * ⚠️ I numeri si ordinano come NUMERI e i nomi come testo: ordinare «12» prima di «9» perché comincia
   * per uno è il classico difetto delle tabelle ordinate a stringhe.
   */
  readonly ordine = signal<{ campo: string; discendente: boolean }>({ campo: 'inSospeso', discendente: true });

  ordinaPer(campo: string): void {
    this.ordine.update((o) => (o.campo === campo ? { campo, discendente: !o.discendente } : { campo, discendente: true }));
  }

  freccia(campo: string): string {
    const o = this.ordine();
    return o.campo === campo ? (o.discendente ? ' ↓' : ' ↑') : '';
  }

  private ordinate<T>(righe: T[]): T[] {
    const { campo, discendente } = this.ordine();
    const verso = discendente ? -1 : 1;
    return [...righe].sort((a, b) => {
      const x = (a as Record<string, unknown>)[campo], y = (b as Record<string, unknown>)[campo];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * verso;
      return String(x ?? '').localeCompare(String(y ?? ''), 'it') * verso;
    });
  }
  readonly vista = signal<'partner' | 'valet'>('partner');
  readonly FASI = ['daRitirare', 'inConsegna', 'inSospeso', 'consegnati'] as const;

  q = '';
  readonly periodo = signal<string>('oggi');
  readonly caricando = signal(false);
  readonly caricandoConsegne = signal(false);
  readonly errore = signal<string | null>(null);
  readonly detentori = signal<Detentore[]>([]);
  readonly riepilogo = signal<Contatori | null>(null);
  readonly prodotti = signal<RigaProdotto[]>([]);
  readonly detentore = signal<Detentore | null>(null);
  readonly rigaAperta = signal<string | null>(null);
  readonly faseAperta = signal<string>('inSospeso');
  readonly consegne = signal<ConsegnaMerce[]>([]);
  readonly erroreConsegne = signal<string | null>(null);
  /** Le due popolazioni arrivano insieme dal server: la scheda le separa senza una chiamata in più. */
  readonly detentoriVisti = computed(() => this.ordinate(this.detentori().filter((r) => r.tipo === this.vista())));
  readonly prodottiVisti = computed(() => this.ordinate(this.prodotti()));
  quanti(v: string): number { return this.detentori().filter((r) => r.tipo === v).length; }
  readonly etichettaPeriodo = computed(() => this.translate.instant('merce.periodo.' + this.periodo()));
  /** La giacenza è governata su 7 prodotti in tutto: una colonna vuota al 99% è spazio tolto ai dati. */
  readonly mostraGiacenza = computed(() => this.prodotti().some((r) => r.giacenza != null));

  da = '';
  a = '';
  /** ⚠️ Senza freno, digitare «rose» sono quattro chiamate e a schermo resta quella che arriva per
   *  ultima, non quella che hai scritto per ultima. Il contatore scarta le risposte vecchie. */
  private attesa: ReturnType<typeof setTimeout> | null = null;
  private giro = 0;

  constructor() {
    this.scegliPeriodo('oggi');
    this.caricaDotazione();
  }

  eUfficio(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  scegliSezione(s: 'daFare' | 'storico'): void {
    this.sezione.set(s);
    this.ordine.set({ campo: s === 'storico' ? 'inSospeso' : 'daRitirare', discendente: true });
    this.scegliPeriodo(s === 'storico' ? 'ultimaSettimana' : 'oggi');
  }

  /**
   * ⚠️ La data si costruisce sull'ora LOCALE, non con toISOString: in UTC, di notte, «oggi» sarebbe ieri.
   */
  private giorno(scarto: number): string {
    const d = new Date();
    d.setDate(d.getDate() + scarto);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  scegliPeriodo(p: string): void {
    this.periodo.set(p);
    const oggi = this.giorno(0);
    switch (p) {
      case 'oggi': this.da = oggi; this.a = oggi; break;
      case 'domani': this.da = this.giorno(1); this.a = this.giorno(1); break;
      case 'setteGiorni': this.da = oggi; this.a = this.giorno(7); break;
      case 'ieri': this.da = this.giorno(-1); this.a = this.giorno(-1); break;
      case 'ultimaSettimana': this.da = this.giorno(-7); this.a = oggi; break;
      case 'ultimoMese': this.da = this.giorno(-30); this.a = oggi; break;
      default: return; // personalizzato: decide chi guarda, coi due campi data
    }
    this.carica();
  }

  /**
   * ⭐⭐ 11/09/2026 (regola utente) — LA DOTAZIONE: la merce di servizio assegnata ai partner.
   *
   * «Prodotti con flag servizio, che saranno ad esempio i biglietti che si possono assegnare per
   * singoli stock ai vari partner: l'assegnazione fa comparire questo prodotto in merce.»
   *
   * ⚠️ È l'unica giacenza VERA della pagina: tutto il resto si ricava dalle consegne aperte, e «da
   * ritirare» è un impegno, non un oggetto. I biglietti in un cassetto ci sono davvero — per questo
   * la dotazione non ha data e non segue il periodo.
   */
  readonly dotazione = signal<RigaDotazione[]>([]);
  readonly prodottiServizio = signal<{ id: string; nome: string }[]>([]);
  readonly partnerDisponibili = signal<{ id: string; insegna: string }[]>([]);
  readonly salvando = signal(false);
  readonly erroreDotazione = signal<string | null>(null);
  nuovo: { partnerId: string; productId: string; quantita: number; note: string } = { partnerId: '', productId: '', quantita: 1, note: '' };

  /** Il pannello si vede se c'è qualcosa da vedere: all'ufficio sempre, al partner solo se ne ha. */
  readonly vistaDotazione = computed(() => this.eUfficio() || this.dotazione().length > 0);

  caricaDotazione(): void {
    let p = new HttpParams();
    const d = this.detentore();
    if (d?.tipo === 'partner') p = p.set('partnerId', d.id);
    this.http.get<{ righe: RigaDotazione[] }>(`${environment.apiUrl}/merce-in-sede/dotazione`, { params: p }).subscribe({
      next: (r) => this.dotazione.set(r?.righe ?? []),
      error: () => this.dotazione.set([]),
    });
    if (!this.eUfficio() || this.prodottiServizio().length) return;
    /**
     * ⚠️ L'elenco prodotti risponde `{ items, total, page, pageSize }` e la pagina si chiede con
     * `pageSize`, non con `limit`. La prima versione leggeva `prodotti` e chiedeva `limit`: la tendina
     * restava vuota e il pannello diceva «nessun prodotto ha il flag servizio» — cioè dava la colpa al
     * dato invece che a sé stesso, che è il modo più efficace di mandare qualcuno a cercare nel posto
     * sbagliato. L'elenco partner invece è un array nudo: si accettano tutte e due le forme.
     */
    this.http.get<{ items?: { id: string; name: string }[] }>(
      `${environment.apiUrl}/products`,
      { params: new HttpParams().set('servizio', 'true').set('pageSize', '200').set('sort', 'name') },
    ).subscribe({
      next: (r) => this.prodottiServizio.set((r?.items ?? []).map((x) => ({ id: x.id, nome: x.name }))),
      error: () => this.prodottiServizio.set([]),
    });
    this.http.get<{ items?: { id: string; insegna: string }[] } | { id: string; insegna: string }[]>(
      `${environment.apiUrl}/partners`, { params: new HttpParams().set('pageSize', '500') },
    ).subscribe({
      next: (r) => {
        const lista = Array.isArray(r) ? r : (r?.items ?? []);
        this.partnerDisponibili.set(lista.map((x) => ({ id: x.id, insegna: x.insegna })));
      },
      error: () => this.partnerDisponibili.set([]),
    });
  }

  assegna(): void {
    if (!this.nuovo.partnerId || !this.nuovo.productId) return;
    this.salvando.set(true);
    this.erroreDotazione.set(null);
    this.http.post(`${environment.apiUrl}/merce-in-sede/dotazione`, {
      partnerId: this.nuovo.partnerId,
      productId: this.nuovo.productId,
      quantita: Number(this.nuovo.quantita) || 0,
      note: this.nuovo.note || null,
    }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.nuovo = { partnerId: '', productId: '', quantita: 1, note: '' };
        this.caricaDotazione();
        // La colonna «in dotazione» del livello 1 viene dal server: si ricarica, o mostrerebbe il vecchio numero.
        this.carica();
      },
      error: (e: { error?: { message?: string } }) => {
        this.salvando.set(false);
        this.erroreDotazione.set(e?.error?.message ?? this.translate.instant('merce.errore'));
      },
    });
  }

  togli(d: RigaDotazione): void {
    if (!confirm(this.translate.instant('merce.dotazione.confermaTogli', { prodotto: d.prodotto, partner: d.partner }))) return;
    this.http.delete(`${environment.apiUrl}/merce-in-sede/dotazione/${d.id}`).subscribe({
      next: () => { this.caricaDotazione(); this.carica(); },
      error: () => this.erroreDotazione.set(this.translate.instant('merce.errore')),
    });
  }

  private parametri(): HttpParams {
    let p = new HttpParams().set('da', this.da).set('a', this.a).set('vista', this.sezione());
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
      this.http.get<Record<string, unknown> & { righe: Detentore[] }>(
        `${environment.apiUrl}/merce-in-sede/detentori`, { params: this.parametri() },
      ).subscribe({
        next: (d) => {
          if (mio !== this.giro) return;
          this.detentori.set(d.righe ?? []);
          this.riepilogo.set(this.contatori(d));
          finito();
        },
        error: errore,
      });
      return;
    }
    this.http.get<Record<string, unknown> & { righe: RigaProdotto[] }>(`${environment.apiUrl}/merce-in-sede`, { params: this.parametri() }).subscribe({
      next: (d) => {
        if (mio !== this.giro) return;
        this.prodotti.set(d.righe ?? []);
        // Anche il livello 2 porta i contatori: partner e valet il livello 1 non lo vedono mai.
        this.riepilogo.set(this.contatori(d));
        finito();
      },
      error: errore,
    });
  }

  private contatori(d: Record<string, unknown>): Contatori {
    const vuoto = { pezzi: 0, consegne: 0 };
    return {
      magazzino: (d['magazzino'] as number) ?? 0,
      giorni: (d['daStabilireGiorni'] as number) ?? 90,
      arretrate: (d['arretrate'] as Contatori['arretrate']) ?? vuoto,
      daStabilire: (d['daStabilire'] as Contatori['daStabilire']) ?? vuoto,
      cancellazioniRichieste: (d['cancellazioniRichieste'] as Contatori['cancellazioniRichieste']) ?? vuoto,
    };
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

interface Contatori {
  magazzino: number;
  giorni: number;
  arretrate: { pezzi: number; consegne: number };
  daStabilire: { pezzi: number; consegne: number };
  cancellazioniRichieste: { pezzi: number; consegne: number };
}

interface Detentore { tipo: 'partner' | 'valet'; id: string; nome: string; daRitirare: number; inConsegna: number; inSospeso: number; consegnati: number; inDotazione: number }
interface RigaProdotto { nome: string; variante: string | null; daRitirare: number; inConsegna: number; inSospeso: number; consegnati: number; giacenza: number | null }
interface RigaDotazione { id: string; partnerId: string; partner: string; productId: string; prodotto: string; sku: string; variante: string | null; quantita: number; note: string; nonPiuDiServizio: boolean }
interface ConsegnaMerce { code: number; data: string; stato: string; quantita: number; partner: string | null; valet: string | null; luogo: string | null; destinazione: string | null }
