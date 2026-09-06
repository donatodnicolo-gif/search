import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface RigaListino {
  chiave: string;
  nome: string;
  prezzo: number | null;
  nota?: string | null;
  aggiornatoIl?: string | null;
  daConfermare?: boolean;
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
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'listino.title' | translate }}</h1>
        <p class="page-caption">{{ 'listino.caption' | translate }}</p>
      </div>
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
        <table class="tab-listino">
          <thead>
            <tr>
              <th>{{ 'listino.col.fiore' | translate }}</th>
              <th class="num">{{ 'listino.col.prezzo' | translate }}</th>
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
        <p class="muted mini">{{ 'listino.nota' | translate }}</p>
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
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 70ch; }
      .avviso-primo { display: flex; flex-direction: column; gap: 3px; padding: 14px 16px; margin-bottom: 16px; border-radius: var(--radius-m, 10px); background: rgba(184, 150, 62, 0.1); border: 1px solid rgba(184, 150, 62, 0.28); }
      .avviso-primo span { font-size: 13.5px; color: var(--text-secondary); }
      .tab-listino { width: 100%; max-width: 680px; border-collapse: collapse; }
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
