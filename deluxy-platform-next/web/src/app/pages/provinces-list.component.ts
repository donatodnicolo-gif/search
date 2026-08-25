import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface City { id: string; name: string; }
interface Province { id: string; code: string; name: string; cities: City[]; }

/**
 * Configurazione → Province e città: le 107 province su cui la piattaforma
 * lavora, ognuna con le sue città. I dati vengono dal database (import legacy);
 * questa pagina li mostra e permette di aggiungere una città a una provincia.
 */
@Component({
  selector: 'app-provinces-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'provinces.title' | translate }}</h1>
        <p class="page-caption">{{ 'provinces.caption' | translate: { n: province().length } }}</p>
      </div>
    </div>

    <div class="filtri card">
      <label class="f cerca">
        <span>{{ 'provinces.search' | translate }}</span>
        <input class="field" type="search" [(ngModel)]="cerca" [placeholder]="'provinces.searchPh' | translate" />
      </label>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card card">{{ error() }}</div>
    } @else if (!visibili().length) {
      <div class="card state-card">{{ 'provinces.empty' | translate }}</div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th class="col-code">{{ 'provinces.col.code' | translate }}</th>
              <th>{{ 'provinces.col.name' | translate }}</th>
              <th class="num">{{ 'provinces.col.cities' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of visibili(); track p.id) {
              <tr class="riga" (click)="toggle(p.id)">
                <td><span class="pill code">{{ p.code }}</span></td>
                <td class="strong">{{ p.name }}</td>
                <td class="num">{{ p.cities.length }}</td>
                <td class="freccia">{{ aperta() === p.id ? '▾' : '▸' }}</td>
              </tr>
              @if (aperta() === p.id) {
                <tr class="dettaglio">
                  <td colspan="4">
                    @if (p.cities.length) {
                      <div class="citta">
                        @for (c of ordina(p.cities); track c.id) { <span class="pill">{{ c.name }}</span> }
                      </div>
                    } @else {
                      <p class="muted">{{ 'provinces.noCities' | translate }}</p>
                    }
                    <!-- Aggiunta città: l'API c'è (POST /provinces/:id/cities) -->
                    <form class="aggiungi" (submit)="aggiungiCitta($event, p)">
                      <input class="field" [(ngModel)]="nuovaCitta" name="nuovaCitta"
                             [placeholder]="'provinces.addCityPh' | translate" />
                      <button class="btn btn-secondary" type="submit" [disabled]="salvando() || !nuovaCitta.trim()">
                        {{ 'provinces.addCity' | translate }}
                      </button>
                    </form>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
    @if (messaggio(); as m) { <p class="esito" [class.ok]="m.ok">{{ m.testo }}</p> }
  `,
  styles: [
    `
      .filtri { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 12px; }
      .filtri .f { display: flex; flex-direction: column; gap: 4px; }
      .filtri .f.cerca { flex: 1 1 260px; max-width: 380px; }
      .filtri .f > span { font-size: 12px; color: var(--text-secondary); }
      .table-wrap { overflow-x: auto; }
      td { vertical-align: middle; }
      .col-code { width: 70px; }
      .strong { font-weight: 550; letter-spacing: -0.01em; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .riga { cursor: pointer; }
      .riga:hover td { background: var(--fill); }
      .freccia { width: 30px; text-align: right; color: var(--text-tertiary); font-size: 12px; }
      .pill {
        display: inline-flex; padding: 3px 11px; border-radius: 980px; background: var(--fill);
        color: var(--text-secondary); font-size: 12.5px; font-weight: 550; white-space: nowrap;
      }
      .pill.code { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
      .dettaglio td { background: var(--surface-sunken, #fafafa); padding: 14px 18px; }
      .citta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
      .aggiungi { display: flex; gap: 8px; align-items: center; }
      .aggiungi .field { max-width: 260px; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0 0 12px; }
      .esito { margin-top: 10px; color: var(--red, #d70015); font-size: 13.5px; }
      .esito.ok { color: var(--green); }
      .state-card { padding: 28px; text-align: center; color: var(--text-secondary); }
      .error-card { padding: 14px 16px; background: rgba(215, 0, 21, 0.06); border: 1px solid rgba(215, 0, 21, 0.15); color: var(--red, #d70015); }
    `,
  ],
})
export class ProvincesListComponent {
  private readonly http = inject(HttpClient);

  readonly province = signal<Province[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly aperta = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly messaggio = signal<{ ok: boolean; testo: string } | null>(null);

  cerca = '';
  nuovaCitta = '';

  /** Metodo e non computed: `cerca` è una proprietà ngModel, non un segnale. */
  visibili(): Province[] {
    const t = this.cerca.trim().toLowerCase();
    if (!t) return this.province();
    return this.province().filter((p) =>
      p.name.toLowerCase().includes(t)
      || p.code.toLowerCase().includes(t)
      || p.cities.some((c) => c.name.toLowerCase().includes(t)),
    );
  }

  ordina(cities: City[]): City[] {
    return [...cities].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  }

  toggle(id: string): void {
    this.aperta.set(this.aperta() === id ? null : id);
    this.nuovaCitta = '';
  }

  constructor() { this.carica(); }

  private carica(): void {
    this.http.get<Province[]>(`${environment.apiUrl}/provinces`).subscribe({
      next: (r) => { this.province.set(r ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'Caricamento non riuscito'); },
    });
  }

  aggiungiCitta(ev: Event, p: Province): void {
    ev.preventDefault();
    const nome = this.nuovaCitta.trim();
    if (!nome) return;
    this.salvando.set(true);
    this.messaggio.set(null);
    this.http.post(`${environment.apiUrl}/provinces/${p.id}/cities`, { name: nome }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.nuovaCitta = '';
        this.messaggio.set({ ok: true, testo: `Città «${nome}» aggiunta a ${p.name}.` });
        this.carica();
      },
      error: (e) => {
        this.salvando.set(false);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Salvataggio non riuscito' });
      },
    });
  }
}
