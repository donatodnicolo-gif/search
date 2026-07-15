import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { Province } from '../core/models';

interface FieldRow { name: string; fieldType: string; }
interface DiscountRow { provinceId: string; discountPercent: number | null; }

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/categories" class="back">← Categorie</a>
        <h1>Nuova categoria</h1>
        <p class="page-caption">Campi extra dei prodotti e sconti % per provincia.</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>Informazioni</h2></header>
        <div class="grid-2">
          <label class="fld"><span>Nome categoria *</span>
            <input class="field" name="name" [(ngModel)]="model.name" required placeholder="Es. Fiori" /></label>
        </div>
        <label class="fld span-2 mt"><span>Note</span>
          <input class="field" name="notes" [(ngModel)]="model.notes" /></label>
        <label class="fld span-2 mt"><span>AI Prompt <em>(generazione AI, es. torte)</em></span>
          <textarea class="field" rows="2" name="aiPrompt" [(ngModel)]="model.aiPrompt"></textarea></label>
      </section>

      <section class="card block">
        <header class="block-head"><h2>Campi extra</h2>
          <span class="block-sub">Campi testuali dei prodotti di questa categoria.</span></header>
        @if (fieldRows.length === 0) { <p class="muted">Nessun campo.</p> }
        @for (row of fieldRows; track $index) {
          <div class="row2">
            <input class="field" placeholder="Nome campo" [(ngModel)]="row.name" [name]="'fname' + $index" />
            <select class="field" [(ngModel)]="row.fieldType" [name]="'ftype' + $index">
              <option value="optional">Opzionale</option>
              <option value="required">Obbligatorio</option>
              <option value="admin">Solo admin</option>
            </select>
            <button type="button" class="icon-btn" (click)="fieldRows.splice($index,1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="fieldRows.push({name:'',fieldType:'optional'})">+ Aggiungi campo</button>
      </section>

      <section class="card block">
        <header class="block-head"><h2>Sconti per provincia</h2>
          <span class="block-sub">Generano automaticamente prodotti scontati (arrotondati a 0/5).</span></header>
        @if (discountRows.length === 0) { <p class="muted">Nessuno sconto.</p> }
        @for (row of discountRows; track $index) {
          <div class="row2">
            <select class="field" [(ngModel)]="row.provinceId" [name]="'dprov' + $index">
              <option value="">Provincia…</option>
              @for (p of provinces(); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }
            </select>
            <input class="field num" type="number" step="0.1" placeholder="Sconto %" [(ngModel)]="row.discountPercent" [name]="'dperc' + $index" />
            <button type="button" class="icon-btn" (click)="discountRows.splice($index,1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="discountRows.push({provinceId:'',discountPercent:null})">+ Aggiungi sconto</button>
      </section>

      @if (justSaved()) { <div class="ok-card card">Categoria creata ✓ — i valori restano compilati: premi <strong>Crea</strong> o <strong>Duplica</strong> per crearne un'altra.</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/categories" class="btn btn-secondary">Annulla</a>
        <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">Duplica</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Salvataggio…' : 'Crea categoria' }}</button>
      </div>
    </form>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .mt { margin-top: 14px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .fld em { color: var(--text-tertiary); font-style: normal; font-weight: 400; }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .row2 { display: grid; grid-template-columns: 1fr 180px auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .row2 { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class CategoryFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly provinces = signal<Province[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  model = { name: '', notes: '', aiPrompt: '' };
  fieldRows: FieldRow[] = [];
  discountRows: DiscountRow[] = [];

  constructor() {
    this.http.get<Province[]>(`${environment.apiUrl}/provinces`).subscribe((d) => this.provinces.set(d));
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    if (!this.model.name.trim()) { this.error.set('Il nome categoria è obbligatorio.'); return; }

    const payload: Record<string, unknown> = { name: this.model.name.trim() };
    if (this.model.notes.trim()) payload['notes'] = this.model.notes.trim();
    if (this.model.aiPrompt.trim()) payload['aiPrompt'] = this.model.aiPrompt.trim();

    const fields = this.fieldRows.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), fieldType: f.fieldType }));
    if (fields.length) payload['fields'] = fields;

    const discounts = this.discountRows
      .filter((d) => d.provinceId && d.discountPercent != null)
      .map((d) => ({ provinceId: d.provinceId, discountPercent: Number(d.discountPercent) }));
    if (discounts.length) payload['discounts'] = discounts;

    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/categories`, payload).subscribe({
      next: () => {
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/categories']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nella creazione della categoria');
      },
    });
  }
}
