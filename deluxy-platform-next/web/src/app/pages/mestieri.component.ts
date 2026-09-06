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
      <div class="head-actions">
        <button type="button" class="btn btn-primary" (click)="nuovoAperto.set(!nuovoAperto())">+ {{ 'mestieri.nuovo.bottone' | translate }}</button>
      </div>
    </div>

    @if (nuovoAperto()) {
      <section class="card block nuovo">
        <h2>{{ 'mestieri.nuovo.titolo' | translate }}</h2>
        <div class="riga-nuovo">
          <input class="field" type="text" [(ngModel)]="nuovoNome" name="nuovoNome" [attr.placeholder]="'mestieri.nuovo.nomePh' | translate" (keydown.enter)="crea()" />
          <label class="toggle"><input type="checkbox" [(ngModel)]="nuovoAuto" name="nuovoAuto" /><span>{{ 'mestieri.col.automatico' | translate }}</span></label>
          <button type="button" class="btn btn-primary" [disabled]="!nuovoNome.trim() || salvando()" (click)="crea()">{{ 'common.save' | translate }}</button>
          <button type="button" class="btn btn-secondary" (click)="nuovoAperto.set(false)">{{ 'common.cancel' | translate }}</button>
        </div>
        <p class="muted piccolo">{{ 'mestieri.nuovo.hint' | translate }}</p>
      </section>
    }

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
                <td class="cat-cell"><div class="chips">@for (c of m.categorie; track c) { <span class="chip-cat">{{ c }}</span> } @empty { <span class="muted">—</span> }</div></td>
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
    /* ⭐ 06/09 (segnalazione utente «sistema css»): le categorie erano testo nudo che sfondava le
       colonne; ora sono chip che vanno a capo dentro la loro cella, e i numeri stanno su una riga. */
    table { table-layout: auto; }
    th:first-child, td:first-child { white-space: nowrap; min-width: 180px; }
    .cat-cell { width: 55%; }
    .cat-cell .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip-cat { display: inline-block; padding: 2px 9px; border-radius: 999px; background: var(--fill, rgba(120,120,128,.08)); font-size: 12px; white-space: nowrap; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td .toggle { white-space: nowrap; }
    .nuovo { margin-bottom: 14px; }
    .riga-nuovo { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .riga-nuovo .field { max-width: 320px; }
    .piccolo { font-size: 12.5px; margin: 8px 0 0; }
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
  readonly nuovoAperto = signal(false);
  readonly salvando = signal(false);
  nuovoNome = '';
  nuovoAuto = false;
  crea(): void {
    const nome = this.nuovoNome.trim(); if (!nome) return;
    this.salvando.set(true); this.error.set(null);
    this.http.post<Mestiere>(`${this.api}/mestieri`, { nome, smistamentoAutomatico: this.nuovoAuto }).subscribe({
      next: () => { this.salvando.set(false); this.nuovoNome = ''; this.nuovoAuto = false; this.nuovoAperto.set(false); this.carica(); },
      error: (e) => { this.salvando.set(false); this.error.set(e?.error?.message ?? 'Errore'); },
    });
  }

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
