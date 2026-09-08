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

      <div class="card">
        <div class="tab-wrap">
        <table class="tab-listino">
          <thead>
            <tr>
              <th>{{ 'listino.col.fiore' | translate }}</th>
              <th class="num">{{ 'listino.col.prezzo' | translate }}</th>
              <!-- ⭐ 08/09/2026 (regola utente): la tabella si ESPANDE IN ORIZZONTALE coi
                   colori. Le colonne compaiono solo se almeno un fiore li chiede, così chi
                   non vende rose non si trova cinque colonne vuote. -->
              @for (c of coloriChiesti(); track c.chiave) {
                <th class="num col-colore">{{ c.nome }}</th>
              }
              <th>{{ 'listino.col.stato' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of l.righe; track r.chiave || r.nome; let i = $index) {
              <tr>
                <td><b>{{ r.nome }}</b></td>
                <td class="num">
                  @if (r.chiave) {
                    <input class="field num" type="number" min="0" step="0.5" [name]="'p' + i"
                           [(ngModel)]="r.prezzo" [attr.placeholder]="'listino.nonLoFaccio' | translate" />
                  } @else {
                    {{ r.prezzo !== null ? (r.prezzo + ' €') : '—' }}
                  }
                </td>
                <!-- Una casella per colore. Vuota = «questo colore non lo faccio», come per
                     il fiore intero. Sui fiori senza colore la cella resta muta. -->
                @for (c of coloriChiesti(); track c.chiave; let j = $index) {
                  <td class="num col-colore">
                    @if (coloreDi(r, c.chiave); as col) {
                      <input class="field num" type="number" min="0" step="0.5" [name]="'c' + i + '_' + j"
                             [(ngModel)]="col.prezzo" placeholder="—" />
                    } @else {
                      <!-- ⚠️ Vuota, non un trattino: quindici righe su sedici non hanno colori,
                           e cinque colonne di trattini sono rumore che nasconde l'unica riga
                           che invece li ha. Il vuoto qui vuol dire «non si applica», e si
                           legge da solo. -->
                    }
                  </td>
                }
                <td>
                  @if (r.prezzo === null || r.prezzo === undefined) {
                    <span class="muted">{{ 'listino.nonLoFaccio' | translate }}</span>
                  } @else if (r.daConfermare) {
                    <span class="chip-da-confermare">{{ 'listino.daConfermare' | translate }}</span>
                  } @else {
                    <span class="muted mini">{{ r.nota || '' }}</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        </div>
        <p class="muted mini">{{ 'listino.nota' | translate }}</p>
        @if (coloriChiesti().length) {
          <p class="muted mini">{{ 'listino.notaColori' | translate }}</p>
        }
        @if (esito(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
        <div class="azioni">
          <button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salva()">
            {{ 'listino.salva' | translate }}
          </button>
        </div>
      </div>
    }
    }
  `,
  styles: [
    `
      /* ⭐ 08/09/2026 — LA TABELLA ALLARGATA COI COLORI (segnalazione utente: «sistema css»).
         ⚠️ Il difetto era un conflitto: la tabella aveva gia' un tetto di 680px (era
         una tabella a tre colonne) e io le avevo messo un min-width di 640px con cinque
         colonne in più. Le colonne si comprimevano, e l'ultima — lo stato — andava a capo
         su due righe in OGNI riga. E overflow-x era finito su .card, cioè su tutte le
         schede della pagina, non sulla tabella. */
      .tab-wrap { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
      .tab-listino { min-width: 760px; }
      .col-colore { width: 88px; }
      /* La prima colonna resta ANCORATA mentre si scorre: senza il nome del fiore davanti,
         una riga di numeri a metà scorrimento non si sa di chi sia (Libro §tabelle larghe). */
      .tab-listino th:first-child, .tab-listino td:first-child {
        position: sticky; left: 0; z-index: 1; background: var(--surface);
      }
      /* Lo stato non va a capo: «non lo faccio» su due righe raddoppia l'altezza di ogni
         riga e fa sembrare la tabella piena di errori. */
      .tab-listino td:last-child, .tab-listino th:last-child { white-space: nowrap; }
      /* Le caselle dei colori sono strette: il prezzo di un fiore sta in tre cifre. */
      .tab-listino .col-colore .field.num { max-width: 72px; padding-left: 6px; padding-right: 6px; }
      .tabs { display: flex; gap: 6px; margin-bottom: 14px; }
      .tab { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text); cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); cursor: default; }
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 70ch; }
      .avviso-primo { display: flex; flex-direction: column; gap: 3px; padding: 14px 16px; margin-bottom: 16px; border-radius: var(--radius-m, 10px); background: rgba(184, 150, 62, 0.1); border: 1px solid rgba(184, 150, 62, 0.28); }
      .avviso-primo span { font-size: 13.5px; color: var(--text-secondary); }
      /* ⚠️ Niente max-width fisso: con le colonne dei colori la tabella è più larga di
         680px, e il tetto la comprimeva invece di farla scorrere. La larghezza la decide
         il contenuto, lo scorrimento lo fa il contenitore .tab-wrap. */
      .tab-listino { width: 100%; border-collapse: collapse; }
      .tab-listino th { text-align: left; font-size: 12px; color: var(--text-secondary); font-weight: 550; padding: 4px 10px 8px; }
      .tab-listino th.num, .tab-listino td.num { text-align: right; }
      .tab-listino td { padding: 5px 10px; border-top: 1px solid var(--hairline); vertical-align: middle; }
      .tab-listino .field.num { max-width: 120px; text-align: right; }
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

  /**
   * ⭐ 08/09/2026 — I colori da mostrare come colonne: quelli che il SERVER chiede, presi
   * dalla prima riga che li ha. Se nessuna riga li chiede, nessuna colonna.
   *
   * ⚠️ L'elenco viene dal server (è lui che poi valida i nomi): ricopiarlo qui
   * significherebbe due elenchi che divergono al primo colore aggiunto.
   */
  coloriChiesti(): ColoreListino[] {
    const r = (this.listino()?.righe ?? []).find((x) => x.colori && x.colori.length);
    return r?.colori ?? [];
  }

  /** Il colore di QUESTA riga, o null se il fiore non ha colori (tulipano, girasole...). */
  coloreDi(r: RigaListino, chiave: string): ColoreListino | null {
    return (r.colori ?? []).find((c) => c.chiave === chiave) ?? null;
  }

  dataBreve(d: string | null): string { return (d ?? '').slice(0, 10).split('-').reverse().join('/'); }

  salva(): void {
    const l = this.listino();
    if (!l) return;
    this.salvando.set(true);
    this.esito.set(null);
    const righe = l.righe
      .filter((r) => !!r.chiave)
      .map((r) => ({ chiave: r.chiave, prezzo: r.prezzo === null || (r.prezzo as unknown) === '' ? null : Number(r.prezzo) }));
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
