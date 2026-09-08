import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface ColoreListino {
  chiave: string;
  nome: string;
  prezzo: number | null;
}
interface RigaListino {
  chiave: string;
  nome: string;
  prezzo: number | null;
  nota?: string | null;
  aggiornatoIl?: string | null;
  daConfermare?: boolean;
  /** ⭐ 08/09/2026: i colori, dove il fiore li ha (oggi la rosa). `null` = non si chiedono. */
  colori?: ColoreListino[] | null;
}
interface Listino {
  partner: { id: string; insegna: string };
  eFiorista: boolean;
  compilatoIl: string | null;
  daCompilare: boolean;
  righe: RigaListino[];
}

/**
 * ⭐ 06/09/2026 sera (regola utente) — IL LISTINO DEL FIORAIO: «una pagina Listino da compilare al
 * primo accesso, che chiede di riempire il prezzo dei singoli fiori principali».
 *
 * Un prezzo per fiore, per stelo. Vuoto = «questo fiore non lo faccio»: si dice, non si lascia
 * indovinare. Dove c'è già un prezzo, viene dallo storico delle consegne e va CONFERMATO: finché il
 * fioraio non salva, la pagina lo dice e l'avviso resta sulla sua home.
 */
@Component({
  selector: 'app-listino-fiori',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'listino.title' | translate }}</h1>
        <p class="page-caption">{{ 'listino.caption' | translate }}</p>
      </div>
    </div>

    <!-- ⭐ 07/09/2026 (regola utente): il listino sta dentro Prodotti — stesse linguette,
         così da qui si torna indietro senza passare dal menu. -->
    <div class="tabs">
      <a routerLink="/products" class="tab">{{ 'products.tabActive' | translate }}</a>
      <span class="tab on">{{ 'products.tabListino' | translate }}</span>
    </div>

    @if (caricando()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else {
    @if (errore(); as e) { <div class="error-card">{{ e }}</div> }
    @if (listino(); as l) {
      @if (l.daCompilare) {
        <div class="avviso-primo">
          <strong>{{ 'listino.primoAccesso' | translate }}</strong>
          <span>{{ 'listino.primoAccessoSub' | translate }}</span>
        </div>
      } @else if (l.compilatoIl) {
        <p class="muted mini">{{ 'listino.compilato' | translate: { quando: dataBreve(l.compilatoIl) } }}</p>
      }

      <div class="card table-wrap listino-wrap">
        <table class="tab-listino">
          <thead>
            <tr>
              <th class="c-fiore">{{ 'listino.col.fiore' | translate }}</th>
              <th class="num c-prezzo">{{ 'listino.col.prezzo' | translate }}</th>
              <th class="c-stato">{{ 'listino.col.stato' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of l.righe; track r.chiave || r.nome; let i = $index) {
              <tr [class.ha-colori]="!!r.colori?.length">
                <td class="c-fiore"><b>{{ r.nome }}</b></td>
                <td class="num c-prezzo">
                  @if (r.chiave) {
                    <input class="field num" type="number" min="0" step="0.5" [name]="'p' + i"
                           [(ngModel)]="r.prezzo" [attr.placeholder]="'listino.nonLoFaccio' | translate" />
                  } @else {
                    {{ r.prezzo !== null ? (r.prezzo + ' €') : '—' }}
                  }
                </td>
                <td class="c-stato">
                  @if (r.prezzo === null || r.prezzo === undefined) {
                    <span class="muted">{{ 'listino.nonLoFaccio' | translate }}</span>
                  } @else if (r.daConfermare) {
                    <span class="chip-da-confermare">{{ 'listino.daConfermare' | translate }}</span>
                  }
                  <!-- ⚠️ 08/09/2026 (segnalazione utente: «nascondi queste note») — la nota
                       del prodotto NON si mostra piu'. Era identica su ogni riga
                       («Prezzo per stelo dichiarato dal fioraio nel suo Listino
                       (2026-09-07)»), diceva a chi l'ha scritta una cosa che sa gia', e
                       incolonnata andava a capo su sei righe rubando meta' tabella.
                       Resta scritta sul prodotto, dove serve a chi guarda il catalogo. -->
                </td>
              </tr>
              <!-- ⭐ 08/09/2026 (VERDETTO DELL'ARCHITETTO-UX, da segnalazione dell'utente).
                   I colori stanno SOTTO il fiore che li ha, non in colonne che attraversano
                   i quindici che non li hanno.
                   ⚠️ La misura che ha deciso: 15 righe × 5 celle = **75 trattini su 80**,
                   il 94% della griglia dei colori era rumore — e stava sopra e sotto l'unica
                   riga che contava. La regola che ne è nata (Libro §8 v2.2): *una colonna è
                   un attributo della POPOLAZIONE, non di una riga*; sotto il 50% di righe
                   che la valorizzano, la colonna non si fa.
                   ⚠️ C'era anche un difetto latente: le intestazioni si ricavavano dalla
                   PRIMA riga coi colori, quindi il giorno in cui un altro fiore avesse avuto
                   un set diverso, i suoi colori sarebbero stati invisibili e non salvabili.
                   L'espansione orizzontale che serviva c'è ancora: i cinque colori sono
                   affiancati, ma dentro la riga del fiore a cui appartengono.
                   Il titolo porta il NOME del fiore perché sotto gli 800px questa riga
                   diventa una scheda a sé. -->
              @if (r.colori?.length) {
                <tr class="riga-colori">
                  <td colspan="3">
                    <div class="colori">
                      <span class="colori-tit">{{ 'listino.colori.titolo' | translate: { fiore: r.nome } }}</span>
                      <div class="colori-griglia">
                        @for (c of r.colori!; track c.chiave; let j = $index) {
                          <label class="colore">
                            <span>{{ c.nome }}</span>
                            <input class="field num" type="number" inputmode="decimal" min="0" step="0.5"
                                   [name]="'c' + i + '_' + j" [(ngModel)]="c.prezzo"
                                   [attr.aria-label]="c.nome + ' — ' + r.nome" />
                          </label>
                        }
                      </div>
                      <span class="colori-aiuto">{{ 'listino.notaColori' | translate }}</span>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- ⚠️ Nota, esito e «Salva» stanno FUORI dal contenitore che scorre: dentro,
           col tetto d'altezza del .table-wrap, il bottone scorrerebbe via insieme alle
           righe e chi compila non lo troverebbe piu' (Libro §4: la conferma non cade
           mai oltre la viewport). -->
      <p class="muted mini nota-listino">{{ 'listino.nota' | translate }}</p>
      @if (esito(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
      <div class="azioni">
        <button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salva()">
          {{ 'listino.salva' | translate }}
        </button>
      </div>
    }
    }
  `,
  styles: [
    `
      /* ⭐ 08/09/2026 — IL LISTINO COI COLORI (verdetto dell'architetto-ux, da segnalazione
         dell'utente: cinque colonne di colore valorizzate su UNA riga su sedici).

         LE MISURE DEL DIFETTO CORRETTO QUI:
         · 15 righe x 5 celle = 75 trattini, il 94% della griglia dei colori;
         · otto colonne chiedevano ~760px dentro un max-width di 680px (e un min-width di
           640px sulla stessa classe): non essendoci overflow lo scorrimento non partiva
           nemmeno, e il browser comprimeva l'ULTIMA colonna, l'unica senza minimo — da li'
           lo stato che andava a capo in tutte e sedici le righe;
         · overflow-x stava su .card, quindi su OGNI card del componente, e senza tetto
           d'altezza: senza altezza il contenitore non e' mai il porto di scorrimento e le
           intestazioni sticky se ne vanno con la pagina.

         ⚠️ Il vestito della tabella — intestazioni sticky, hover di riga, divisori, .num a
         destra e la trasformazione in SCHEDE sotto gli 800px — arriva tutto da styles.css
         via .table-wrap: qui NON si ricopia. Gli stili di componente vincono per
         specificita' su styles.css, quindi una copia locale non resta «uguale»: diverge.
         Qui si dichiarano solo le larghezze, e per CLASSE mai con nth-child (la riga con
         colspan sposterebbe i conti). */
      .listino-wrap { max-width: 860px; }
      .tab-listino .c-fiore { width: 42%; }
      .tab-listino .c-prezzo { width: 26%; }
      .tab-listino .c-stato { width: 32%; }

      /* I numeri: stessa larghezza per ogni campo, cifre a passo fisso, e via le frecce di
         incremento — rubavano ~15px sul bordo destro e facevano sembrare i valori spostati
         rispetto all'intestazione. */
      .tab-listino .field.num,
      .colori .field {
        text-align: right;
        font-variant-numeric: tabular-nums;
        appearance: textfield;
        -moz-appearance: textfield;
      }
      .tab-listino td.c-prezzo .field.num { width: 104px; max-width: none; }
      .tab-listino .field.num::-webkit-outer-spin-button,
      .tab-listino .field.num::-webkit-inner-spin-button,
      .colori .field::-webkit-outer-spin-button,
      .colori .field::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

      /* La riga dei colori APPARTIENE a quella sopra: il divisore fra le due sparisce, il
         fondo e' il token surface-sunken (non un grigio a mano) e il contenuto rientra. */
      .tab-listino tr.ha-colori > td { border-bottom-color: transparent; }
      .tab-listino tr.riga-colori > td {
        background: var(--surface-sunken);
        padding: 10px 16px 14px 28px;
        white-space: normal;
      }
      .colori { display: flex; flex-direction: column; gap: 8px; }
      .colori-tit { font-size: 12.5px; font-weight: 500; color: var(--text-secondary); }
      /* I cinque campi affiancati: l'espansione in orizzontale sta QUI, dove i colori
         esistono davvero. auto-fit con tetto a 118px: a schermo largo non si stirano, a
         schermo stretto vanno a capo da soli invece di sfondare la card. */
      .colori-griglia {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 118px));
        gap: 10px 14px;
        justify-content: start;
      }
      /* Label SOPRA il campo, sempre visibile (prima legge del Libro): niente placeholder
         al posto del nome del colore. */
      .colore { display: flex; flex-direction: column; gap: 4px; }
      .colore > span { font-size: 12.5px; font-weight: 500; color: var(--text-secondary); }
      .colori .field { width: 100%; }
      .colori-aiuto { font-size: 12.5px; color: var(--text-tertiary); max-width: 66ch; }

      @media (pointer: coarse) {
        .tab-listino .field, .colori .field { min-height: var(--touch-min); }
      }
      /* Sotto gli 800px la tabella e' gia' schede: la riga dei colori diventa la scheda
         successiva — per questo il suo titolo porta il nome del fiore — e non deve
         portarsi dietro fondo e rientro da tabella. */
      @media (max-width: 800px) {
        .tab-listino tr.riga-colori > td {
          background: transparent !important;
          padding: 8px 0 !important;
        }
        .colori-griglia { grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); }
      }

      .nota-listino { margin: 10px 2px 0; max-width: 80ch; }
      .tabs { display: flex; gap: 6px; margin-bottom: 14px; }
      .tab { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); cursor: default; }
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 70ch; }
      .avviso-primo { display: flex; flex-direction: column; gap: 3px; padding: 14px 16px; margin-bottom: 16px; border-radius: var(--radius-m, 10px); background: rgba(184, 150, 62, 0.1); border: 1px solid rgba(184, 150, 62, 0.28); }
      .avviso-primo span { font-size: 13.5px; color: var(--text-secondary); }
      .chip-da-confermare { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; background: rgba(184, 150, 62, 0.14); color: var(--gold-strong, #B8963E); }
      .azioni { margin-top: 16px; }
      .mini { font-size: 12.5px; }
      .state-card { padding: 40px 28px; text-align: center; }
      .error-card, .err-msg { padding: 12px 14px; border-radius: var(--radius-m, 10px); background: rgba(215, 0, 21, 0.06); border: 1px solid rgba(215, 0, 21, 0.15); color: var(--red, #d70015); }
      .ok-msg { padding: 12px 14px; border-radius: var(--radius-m, 10px); background: rgba(36, 138, 61, 0.08); border: 1px solid rgba(36, 138, 61, 0.2); color: #248A3D; }
    `,
  ],
})
export class ListinoFioriComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly listino = signal<Listino | null>(null);
  readonly caricando = signal(true);
  readonly errore = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly esito = signal<{ ok: boolean; testo: string } | null>(null);

  constructor() {
    this.carica();
  }

  private carica(): void {
    const partnerId = this.auth.user()?.role === 'PARTNER' ? '' : (new URLSearchParams(location.search).get('partnerId') ?? '');
    this.http
      .get<Listino>(`${environment.apiUrl}/listino-fiori${partnerId ? `?partnerId=${partnerId}` : ''}`)
      .subscribe({
        next: (l) => { this.listino.set(l); this.caricando.set(false); },
        error: (e) => { this.caricando.set(false); this.errore.set(e?.error?.message ?? 'Listino non caricato'); },
      });
  }

  dataBreve(d: string | null): string { return (d ?? '').slice(0, 10).split('-').reverse().join('/'); }

  salva(): void {
    const l = this.listino();
    if (!l) return;
    this.salvando.set(true);
    this.esito.set(null);
    const num = (v: unknown) => (v === null || v === undefined || (v as unknown) === '' ? null : Number(v));
    const righe = l.righe
      .filter((r) => !!r.chiave)
      .map((r) => ({
        chiave: r.chiave,
        prezzo: num(r.prezzo),
        // ⚠⚠ 08/09/2026 — SENZA QUESTA RIGA I COLORI NON PARTIVANO. Il server sapeva
        // riceverli e scriverli come varianti, ma il client non glieli mandava: il fioraio
        // compilava i cinque prezzi, premeva Salva, leggeva «Listino salvato», e la
        // risposta — che è una rilettura del database — glieli ricancellava a schermo.
        // Un successo verde su una scrittura mai avvenuta (Libro §7: vietato l'esito ambiguo).
        // Trovato dall'architetto-ux mentre valutava il layout.
        colori: r.colori ? r.colori.map((c) => ({ chiave: c.chiave, prezzo: num(c.prezzo) })) : null,
      }));
    this.http.post<Listino & { scritti: number; spenti: number }>(`${environment.apiUrl}/listino-fiori`, { righe }).subscribe({
      next: (r) => {
        this.salvando.set(false);
        this.listino.set(r);
        this.esito.set({ ok: true, testo: `Listino salvato: ${r.scritti} fiori con prezzo${r.spenti ? `, ${r.spenti} tolti` : ''}.` });
      },
      error: (e) => {
        this.salvando.set(false);
        this.esito.set({ ok: false, testo: e?.error?.message ?? 'Salvataggio non riuscito' });
      },
    });
  }
}
