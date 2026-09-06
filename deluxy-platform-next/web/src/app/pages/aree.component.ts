import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { Province } from '../core/models';

/**
 * ⭐ 06/09/2026 (regola utente): le AREE — gruppi di province con un nome. Qui
 * l'ufficio (ADMIN, OPERATION) le crea e le cambia; ai partner si assegnano le
 * aree, non le province una per una. Cambiare le province di un'area aggiorna
 * tutti i partner che la usano. Un'area ha almeno una provincia; non si cancella
 * finché un partner la usa.
 */
interface Area { id: string; nome: string; note: string | null; attiva: boolean; province: { id: string; code: string; name: string }[]; partner: number }

@Component({
  selector: 'app-aree',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'aree.title' | translate }}</h1>
        <p class="page-caption">{{ 'aree.caption' | translate: { n: aree().length } }}</p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn btn-primary" (click)="nuova()">+ {{ 'aree.nuova' | translate }}</button>
      </div>
    </div>

    @if (error(); as e) { <div class="error-card">{{ e }}</div> }

    @if (inModifica(); as a) {
      <section class="card block editor">
        <h2>{{ (a.id ? 'aree.modifica' : 'aree.nuova') | translate }}</h2>
        <div class="riga">
          <label class="campo">{{ 'aree.col.nome' | translate }}
            <input class="field" type="text" [(ngModel)]="a.nome" name="nome" [attr.placeholder]="'aree.nomePh' | translate" /></label>
          <label class="campo">{{ 'aree.col.note' | translate }}
            <input class="field" type="text" [(ngModel)]="a.note" name="note" /></label>
        </div>
        <p class="etichetta">{{ 'aree.province' | translate: { n: scelte.size } }}</p>
        <input class="field cerca-chip" type="search" [(ngModel)]="cercaProvincia" name="cercaProvincia" [attr.placeholder]="'partnerForm.provinces.cerca' | translate" />
        <div class="chips">
          @for (p of provinceVisibili(); track p.id) {
            <button type="button" class="chip" [class.on]="scelte.has(p.id)" (click)="toggla(p.id)" [attr.aria-pressed]="scelte.has(p.id)">{{ p.code }} · {{ p.name }}</button>
          }
        </div>
        @if (formError(); as fe) { <div class="error-card">{{ fe }}</div> }
        <div class="piede">
          <button type="button" class="btn btn-secondary" (click)="inModifica.set(null)">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn btn-primary" [disabled]="salvando() || !a.nome.trim() || scelte.size === 0" (click)="salva()">{{ 'common.save' | translate }}</button>
        </div>
      </section>
    }

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else if (aree().length === 0) { <div class="card state-card">{{ 'aree.vuoto' | translate }}</div> }
    @else {
      <div class="card table-wrap">
        <table>
          <thead><tr>
            <th>{{ 'aree.col.nome' | translate }}</th>
            <th>{{ 'aree.col.province' | translate }}</th>
            <th class="num">{{ 'aree.col.partner' | translate }}</th>
            <th>{{ 'deliveries.col.actions' | translate }}</th>
          </tr></thead>
          <tbody>
            @for (a of aree(); track a.id) {
              <tr [class.muted]="!a.attiva">
                <td class="strong nome">{{ a.nome }}@if (a.note) { <div class="cella-sub muted">{{ a.note }}</div> }</td>
                <td class="prov-cell">
                  <div class="chips-piccole">
                    @for (p of a.province; track p.id) { <span class="chip-prov" [title]="p.name">{{ p.code }}</span> }
                  </div>
                  <div class="cella-sub muted">{{ 'aree.nProvince' | translate: { n: a.province.length } }}</div>
                </td>
                <td class="num">{{ a.partner }}</td>
                <td class="azioni">
                  <button type="button" class="btn btn-secondary mini" (click)="modifica(a)">{{ 'common.edit' | translate }}</button>
                  @if (a.partner === 0) { <button type="button" class="btn btn-secondary mini danger" (click)="elimina(a)">{{ 'common.delete' | translate }}</button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .editor { margin-bottom: 14px; padding: 16px; }
    .editor h2 { margin: 0 0 10px; font-size: 16px; }
    .riga { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px 20px; }
    .campo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 550; }
    .etichetta { margin: 14px 0 6px; font-size: 13px; font-weight: 550; }
    .cerca-chip { max-width: 280px; margin-bottom: 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 260px; overflow-y: auto; }
    .chip { border: 1px solid var(--hairline); background: var(--surface); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
    .chip.on { background: var(--ink, #1d1d1f); color: #fff; border-color: var(--ink, #1d1d1f); }
    .piede { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .nome { white-space: nowrap; }
    .prov-cell { width: 55%; }
    .chips-piccole { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip-prov { display: inline-block; padding: 1px 7px; border-radius: 999px; background: var(--fill, rgba(120,120,128,.08)); font-size: 11.5px; font-variant-numeric: tabular-nums; }
    .cella-sub { font-size: 12px; margin-top: 3px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .azioni { white-space: nowrap; }
    .azioni .btn + .btn { margin-left: 6px; }
    .danger { color: var(--red); }
  `],
})
export class AreeComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;
  readonly aree = signal<Area[]>([]);
  readonly province = signal<Province[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly inModifica = signal<{ id: string | null; nome: string; note: string | null } | null>(null);
  readonly scelte = new Set<string>();
  cercaProvincia = '';

  constructor() {
    this.carica();
    this.http.get<Province[]>(`${this.api}/provinces`).subscribe({ next: (d) => this.province.set(d), error: () => undefined });
  }

  carica(): void {
    this.http.get<Area[]>(`${this.api}/aree`).subscribe({ next: (a) => { this.aree.set(a); this.loading.set(false); }, error: (e) => { this.error.set(e?.error?.message ?? 'Errore'); this.loading.set(false); } });
  }

  provinceVisibili(): Province[] {
    const q = this.cercaProvincia.trim().toLowerCase();
    if (!q) return this.province();
    return this.province().filter((p) => this.scelte.has(p.id) || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }
  toggla(id: string): void { if (this.scelte.has(id)) this.scelte.delete(id); else this.scelte.add(id); }

  nuova(): void { this.scelte.clear(); this.formError.set(null); this.inModifica.set({ id: null, nome: '', note: null }); }
  modifica(a: Area): void { this.scelte.clear(); for (const p of a.province) this.scelte.add(p.id); this.formError.set(null); this.inModifica.set({ id: a.id, nome: a.nome, note: a.note }); }

  salva(): void {
    const a = this.inModifica(); if (!a) return;
    const corpo = { nome: a.nome.trim(), note: a.note?.trim() || null, provinceIds: [...this.scelte] };
    this.salvando.set(true); this.formError.set(null);
    const req = a.id ? this.http.put(`${this.api}/aree/${a.id}`, corpo) : this.http.post(`${this.api}/aree`, corpo);
    req.subscribe({
      next: () => { this.salvando.set(false); this.inModifica.set(null); this.carica(); },
      error: (e) => { this.salvando.set(false); this.formError.set(e?.error?.message ?? 'Errore'); },
    });
  }

  elimina(a: Area): void {
    if (!confirm(this.translate.instant('aree.confermaElimina', { nome: a.nome }))) return;
    this.http.delete(`${this.api}/aree/${a.id}`).subscribe({ next: () => this.carica(), error: (e) => this.error.set(e?.error?.message ?? 'Errore') });
  }
}
