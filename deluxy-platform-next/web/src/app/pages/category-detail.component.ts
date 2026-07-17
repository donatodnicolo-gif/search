import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { Category } from '../core/models';

/** Dettaglio categoria (sola lettura). */
@Component({
  selector: 'app-category-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/categories" class="back">← {{ 'categories.title' | translate }}</a>
      @if (category(); as c) {
        <div class="title-row">
          <h1>{{ c.name }}</h1>
          <a class="btn btn-secondary edit" [routerLink]="['/categories', c.id, 'edit']">{{ 'common.edit' | translate }}</a>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (category(); as c) {
        <div class="grid">
          <section class="card block span-2">
            <h2>{{ 'categoryForm.info.title' | translate }}</h2>
            <dl>
              <dt>{{ 'categories.col.name' | translate }}</dt><dd>{{ c.name }}</dd>
              <dt>{{ 'categories.col.notes' | translate }}</dt><dd>{{ c.notes || '—' }}</dd>
              <dt>{{ 'categoryForm.info.aiPrompt' | translate }}</dt>
              <dd class="pre">{{ c.aiPrompt || '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'categoryForm.fields.title' | translate }}</h2>
            @if (c.fields?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'categoryDetail.fieldName' | translate }}</th>
                  <th>{{ 'categoryDetail.fieldType' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (f of c.fields; track f.id) {
                    <tr>
                      <td>{{ f.name }}</td>
                      <td>{{ fieldTypeKey(f.fieldType) | translate }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'categoryForm.fields.empty' | translate }}</p> }
          </section>

          <section class="card block">
            <h2>{{ 'categoryForm.discounts.title' | translate }}</h2>
            @if (c.discounts?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'categoryDetail.province' | translate }}</th>
                  <th class="num">{{ 'categoryDetail.discount' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (d of c.discounts; track d.id) {
                    <tr>
                      <td>{{ d.province.code }} · {{ d.province.name }}</td>
                      <td class="num">−{{ d.discountPercent }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'categoryForm.discounts.empty' | translate }}</p> }
          </section>
        </div>
      }
    }
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .edit { margin-left: auto; text-decoration: none; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 26%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .pre { white-space: pre-wrap; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CategoryDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly category = signal<Category | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Etichetta i18n del tipo di campo extra. */
  fieldTypeKey(type: string): string {
    if (type === 'required') return 'categoryForm.fields.required';
    if (type === 'admin') return 'categoryForm.fields.adminOnly';
    return 'categoryForm.fields.optional';
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<Category>(`${environment.apiUrl}/categories/${id}`).subscribe({
      next: (c) => { this.category.set(c); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('categoryDetail.loadError'));
      },
    });
  }
}
