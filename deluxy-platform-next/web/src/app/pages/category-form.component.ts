import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { Province } from '../core/models';

interface FieldRow { name: string; fieldType: string; }
interface DiscountRow { provinceId: string; discountPercent: number | null; }

@Component({
  selector: 'app-category-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/categories" class="back">← {{ 'categoryForm.backToCategories' | translate }}</a>
        <h1>{{ (editId() ? 'categoryForm.editTitle' : 'categoryForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'categoryForm.caption' | translate }}</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>{{ 'categoryForm.info.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'categoryForm.info.name' | translate }}</span>
            <input class="field" name="name" [(ngModel)]="model.name" required [attr.placeholder]="'categoryForm.info.namePlaceholder' | translate" /></label>
        </div>
        <label class="fld span-2 mt"><span>{{ 'categoryForm.info.notes' | translate }}</span>
          <input class="field" name="notes" [(ngModel)]="model.notes" /></label>
        <label class="fld span-2 mt"><span>{{ 'categoryForm.info.aiPrompt' | translate }} <em>{{ 'categoryForm.info.aiPromptHint' | translate }}</em></span>
          <textarea class="field" rows="2" name="aiPrompt" [(ngModel)]="model.aiPrompt"></textarea></label>
      </section>

      <section class="card block">
        <header class="block-head"><h2>{{ 'categoryForm.fields.title' | translate }}</h2>
          <span class="block-sub">{{ 'categoryForm.fields.subtitle' | translate }}</span></header>
        @if (fieldRows.length === 0) { <p class="muted">{{ 'categoryForm.fields.empty' | translate }}</p> }
        @for (row of fieldRows; track $index) {
          <div class="row2">
            <input class="field" [attr.placeholder]="'categoryForm.fields.namePlaceholder' | translate" [(ngModel)]="row.name" [name]="'fname' + $index" />
            <select class="field" [(ngModel)]="row.fieldType" [name]="'ftype' + $index">
              <option value="optional">{{ 'categoryForm.fields.optional' | translate }}</option>
              <option value="required">{{ 'categoryForm.fields.required' | translate }}</option>
              <option value="admin">{{ 'categoryForm.fields.adminOnly' | translate }}</option>
            </select>
            <button type="button" class="icon-btn" (click)="fieldRows.splice($index,1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="fieldRows.push({name:'',fieldType:'optional'})">+ {{ 'categoryForm.fields.add' | translate }}</button>
      </section>

      <section class="card block">
        <header class="block-head"><h2>{{ 'categoryForm.discounts.title' | translate }}</h2>
          <span class="block-sub">{{ 'categoryForm.discounts.subtitle' | translate }}</span></header>
        @if (discountRows.length === 0) { <p class="muted">{{ 'categoryForm.discounts.empty' | translate }}</p> }
        @for (row of discountRows; track $index) {
          <div class="row2">
            <select class="field" [(ngModel)]="row.provinceId" [name]="'dprov' + $index">
              <option value="">{{ 'categoryForm.discounts.provincePlaceholder' | translate }}</option>
              @for (p of provinces(); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }
            </select>
            <input class="field num" type="number" step="0.1" [attr.placeholder]="'categoryForm.discounts.percentPlaceholder' | translate" [(ngModel)]="row.discountPercent" [name]="'dperc' + $index" />
            <button type="button" class="icon-btn" (click)="discountRows.splice($index,1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="discountRows.push({provinceId:'',discountPercent:null})">+ {{ 'categoryForm.discounts.add' | translate }}</button>
      </section>

      @if (justSaved()) { <div class="ok-card card" [innerHTML]="'categoryForm.savedNotice' | translate"></div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/categories" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'categoryForm.submit') | translate) }}</button>
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
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly provinces = signal<Province[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  model = { name: '', notes: '', aiPrompt: '' };
  fieldRows: FieldRow[] = [];
  discountRows: DiscountRow[] = [];

  /** Id categoria in modifica (null = nuova categoria). */
  readonly editId = signal<string | null>(null);

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));

    // Modalita' modifica: /categories/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${api}/categories/${id}`).subscribe({
        next: (c) => this.prefill(c),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con la categoria esistente. */
  private prefill(c: Record<string, any>): void {
    this.model = {
      name: c['name'] ?? '',
      notes: c['notes'] ?? '',
      aiPrompt: c['aiPrompt'] ?? '',
    };
    this.fieldRows = ((c['fields'] as any[]) ?? []).map((f) => ({
      name: f?.name ?? '',
      fieldType: f?.fieldType ?? 'optional',
    }));
    this.discountRows = ((c['discounts'] as any[]) ?? []).map((d) => ({
      provinceId: d?.province?.id ?? d?.provinceId ?? '',
      discountPercent: d?.discountPercent ?? null,
    }));
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    if (!this.model.name.trim()) { this.error.set(this.translate.instant('categoryForm.nameRequired')); return; }

    const payload: Record<string, unknown> = { name: this.model.name.trim() };
    if (this.model.notes.trim()) payload['notes'] = this.model.notes.trim();
    if (this.model.aiPrompt.trim()) payload['aiPrompt'] = this.model.aiPrompt.trim();

    const fields = this.fieldRows.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), fieldType: f.fieldType }));
    // In modifica invio sempre le collezioni, anche vuote, altrimenti
    // svuotarle non le cancellerebbe (l'API scrive solo le chiavi presenti).
    const isEdit = !!this.editId();
    if (fields.length || isEdit) payload['fields'] = fields;

    const discounts = this.discountRows
      .filter((d) => d.provinceId && d.discountPercent != null)
      .map((d) => ({ provinceId: d.provinceId, discountPercent: Number(d.discountPercent) }));
    if (discounts.length || isEdit) payload['discounts'] = discounts;

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/categories/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/categories`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/categories', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/categories']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('categoryForm.createError'));
      },
    });
  }
}
