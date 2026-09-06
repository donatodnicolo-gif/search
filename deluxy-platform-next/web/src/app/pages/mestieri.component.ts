import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/**
 * ⭐ 06/09/2026 (decisione utente): i MESTIERI — 8 voci nostre fra il catalogo (65
 * categorie, che non si toccano) e i partner. Qui l'ufficio vede i mestieri coi
 * conti, accende/spegne lo smistamento automatico dei non unici per mestiere, e
 * colloca ogni categoria nel suo mestiere. Le categorie «da assegnare» stanno in
 * testa: finché una categoria non ha un mestiere, i suoi ordini non si smistano
 * da soli.
 */
interface Mestiere { id: string; chiave: string; nome: string; ordine: number; smistamentoAutomatico: boolean; attivo: boolean; categorie: string[]; prodotti: number; partner: number; liste: number }
interface CategoriaRiga { id: string; name: string; archived: boolean; mestiereId: string | null; prodotti: number }

@Component({
  selector: 'app-mestieri',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'mestieri.title' | translate }}</h1>
        <p class="page-caption">{{ 'mestieri.caption' | translate: { n: mestieri().length, c: categorie().length } }}</p>
      </div>
    </div>

    @if (error(); as e) { <div class="error-card">{{ e }}</div> }
    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else {
      <div class="card table-wrap">
        <table>
          <thead><tr>
            <th>{{ 'mestieri.col.nome' | translate }}</th>
            <th>{{ 'mestieri.col.categorie' | translate }}</th>
            <th class="num">{{ 'mestieri.col.prodotti' | translate }}</th>
            <th class="num">{{ 'mestieri.col.partner' | translate }}</th>
            <th class="num">{{ 'mestieri.col.liste' | translate }}</th>
            <th>{{ 'mestieri.col.automatico' | translate }}</th>
          </tr></thead>
          <tbody>
            @for (m of mestieri(); track m.id) {
              <tr [class.muted]="!m.attivo">
                <td class="strong">{{ m.nome }}</td>
                <td class="cat-cell">@for (c of m.categorie; track c) { <span class="pill pill-neutral">{{ c }}</span> } @empty { <span class="muted">—</span> }</td>
                <td class="num">{{ m.prodotti }}</td>
                <td class="num">{{ m.partner }}</td>
                <td class="num">{{ m.liste }}</td>
                <td>
                  <label class="toggle"><input type="checkbox" [checked]="m.smistamentoAutomatico" (change)="toggleAuto(m, $event)" /><span>{{ (m.smistamentoAutomatico ? 'mestieri.auto.si' : 'mestieri.auto.no') | translate }}</span></label>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <section class="card block">
        <header class="block-head">
          <h2>{{ 'mestieri.categorie.title' | translate }}</h2>
          <span class="block-sub">{{ 'mestieri.categorie.sub' | translate: { n: daAssegnare().length } }}</span>
        </header>
        <input class="field cerca" type="search" [(ngModel)]="cerca" name="cerca" [attr.placeholder]="'common.search' | translate" />
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ 'mestieri.categorie.col.nome' | translate }}</th><th class="num">{{ 'mestieri.col.prodotti' | translate }}</th><th>{{ 'mestieri.categorie.col.mestiere' | translate }}</th></tr></thead>
            <tbody>
              @for (c of categorieVisibili(); track c.id) {
                <tr [class.da-assegnare]="!c.mestiereId">
                  <td class="strong">{{ c.name }}@if (c.archived) { <span class="muted"> · {{ 'mestieri.categorie.archiviata' | translate }}</span> }</td>
                  <td class="num">{{ c.prodotti }}</td>
                  <td>
                    <select class="field" [ngModel]="c.mestiereId ?? ''" (ngModelChange)="assegna(c, $event)" [name]="'m-' + c.id">
                      <option value="">{{ 'mestieri.categorie.daAssegnare' | translate }}</option>
                      @for (m of mestieri(); track m.id) { <option [value]="m.id">{{ m.nome }}</option> }
                    </select>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: [`
    .cat-cell { max-width: 520px; }
    .cat-cell .pill { margin: 2px 4px 2px 0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .block { margin-top: 16px; padding: 16px; }
    .block-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
    .block-sub { color: var(--text-secondary); font-size: 13px; }
    .cerca { max-width: 320px; margin-bottom: 10px; }
    tr.da-assegnare td { background: var(--surface-sunken, #f5f5f7); }
    tr.da-assegnare td:first-child { box-shadow: inset 4px 0 0 var(--ink, #1d1d1f); }
    select.field { min-width: 220px; }
  `],
})
export class MestieriComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;
  readonly mestieri = signal<Mestiere[]>([]);
  readonly categorie = signal<CategoriaRiga[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  cerca = '';
  readonly daAssegnare = computed(() => this.categorie().filter((c) => !c.mestiereId));

  constructor() { this.carica(); }

  carica(): void {
    this.http.get<Mestiere[]>(`${this.api}/mestieri`).subscribe({ next: (m) => { this.mestieri.set(m); this.loading.set(false); }, error: (e) => { this.error.set(e?.error?.message ?? 'Errore'); this.loading.set(false); } });
    this.http.get<CategoriaRiga[]>(`${this.api}/mestieri/categorie`).subscribe({ next: (c) => this.categorie.set(c), error: () => undefined });
  }

  categorieVisibili(): CategoriaRiga[] {
    const q = this.cerca.trim().toLowerCase();
    return q ? this.categorie().filter((c) => c.name.toLowerCase().includes(q)) : this.categorie();
  }

  toggleAuto(m: Mestiere, ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    this.http.put(`${this.api}/mestieri/${m.id}`, { smistamentoAutomatico: on }).subscribe({
      next: () => this.mestieri.update((l) => l.map((x) => (x.id === m.id ? { ...x, smistamentoAutomatico: on } : x))),
      error: (e) => { this.error.set(e?.error?.message ?? 'Errore'); (ev.target as HTMLInputElement).checked = !on; },
    });
  }

  assegna(c: CategoriaRiga, mestiereId: string): void {
    this.http.put(`${this.api}/mestieri/categorie/${c.id}`, { mestiereId: mestiereId || null }).subscribe({
      next: () => { this.categorie.update((l) => l.map((x) => (x.id === c.id ? { ...x, mestiereId: mestiereId || null } : x))); this.http.get<Mestiere[]>(`${this.api}/mestieri`).subscribe((m) => this.mestieri.set(m)); },
      error: (e) => this.error.set(e?.error?.message ?? 'Errore'),
    });
  }
}
