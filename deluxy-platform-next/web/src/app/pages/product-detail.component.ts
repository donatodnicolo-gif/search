import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { PRODUCT_PLATFORMS } from '../core/models';

interface ProductDetail {
  id: string;
  name: string;
  sku?: string | null;
  type?: string | null;
  price?: number | null;
  publicPrice?: number | null;
  prepDays?: number | null;
  line?: string | null;
  shortDesc?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  images?: string | null;
  platforms?: string | null;
  platformDescriptions?: string | null;
  approved?: boolean;
  active?: boolean;
  notPhysical?: boolean;
  partner?: { id: string; insegna: string } | null;
  category?: { id: string; name: string } | null;
  variants?: {
    id: string;
    name: string;
    sku?: string | null;
    price?: number | null;
    publicPrice?: number | null;
    stock?: number | null;
  }[];
  fields?: { id: string; name: string; required?: boolean; adminOnly?: boolean }[];
}

/** Dettaglio prodotto (sola lettura). */
@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/products" class="back">← {{ 'products.title' | translate }}</a>
      @if (product(); as p) {
        <div class="title-row">
          <h1>{{ p.name }}</h1>
          @if (p.active === false) {
            <span class="pill">{{ 'common.inactive' | translate }}</span>
          } @else {
            <span class="pill on">{{ 'common.active' | translate }}</span>
          }
          @if (p.approved) {
            <span class="pill on">{{ 'products.approved' | translate }}</span>
          } @else {
            <span class="pill wait">{{ 'products.pending' | translate }}</span>
          }
          <a class="btn btn-secondary edit" [routerLink]="['/products', p.id, 'edit']">{{ 'common.edit' | translate }}</a>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (product(); as p) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'productForm.section.details.title' | translate }}</h2>
            <dl>
              <dt>{{ 'products.col.category' | translate }}</dt><dd>{{ p.category?.name || '—' }}</dd>
              <dt>{{ 'products.col.type' | translate }}</dt>
              <dd>{{ p.type ? (('enums.productType.' + p.type) | translate) : '—' }}</dd>
              <dt>{{ 'products.col.partner' | translate }}</dt><dd>{{ p.partner?.insegna || '—' }}</dd>
              <dt>{{ 'products.col.sku' | translate }}</dt><dd class="mono">{{ p.sku || '—' }}</dd>
              <dt>{{ 'productForm.field.line' | translate }}</dt><dd>{{ p.line || '—' }}</dd>
              <dt>{{ 'productForm.field.price' | translate }}</dt>
              <dd>{{ p.price != null ? p.price + ' €' : '—' }}</dd>
              <dt>{{ 'productForm.field.publicPrice' | translate }}</dt>
              <dd>{{ p.publicPrice != null ? p.publicPrice + ' €' : '—' }}</dd>
              <dt>{{ 'productForm.field.prepDays' | translate }}</dt>
              <dd>{{ p.prepDays != null ? p.prepDays : '—' }}</dd>
              <dt>{{ 'productForm.field.shortDesc' | translate }}</dt><dd>{{ p.shortDesc || '—' }}</dd>
              <dt>{{ 'productForm.field.description' | translate }}</dt>
              <dd class="pre">{{ p.description || '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'productForm.section.shopify.title' | translate }}</h2>
            <dl>
              <dt>{{ 'productForm.toggle.approved' | translate }}</dt>
              <dd>{{ (p.approved ? 'common.yes' : 'common.no') | translate }}</dd>
              <dt>{{ 'common.active' | translate }}</dt>
              <dd>{{ (p.active === false ? 'common.no' : 'common.yes') | translate }}</dd>
              <dt>{{ 'productForm.toggle.notPhysical' | translate }}</dt>
              <dd>{{ (p.notPhysical ? 'common.yes' : 'common.no') | translate }}</dd>
            </dl>

            <h3>{{ 'productForm.section.platforms.title' | translate }}</h3>
            @if (platforms().length) {
              <div class="chips">
                @for (label of platforms(); track label) { <span class="chip">{{ label }}</span> }
              </div>
            } @else { <p class="muted">{{ 'productDetail.noPlatforms' | translate }}</p> }

            <h3>{{ 'productForm.images.title' | translate }}</h3>
            @if (images().length) {
              <ul class="links">
                @for (url of images(); track url) {
                  <li><a [href]="url" target="_blank" rel="noopener noreferrer">{{ url }}</a></li>
                }
              </ul>
            } @else { <p class="muted">{{ 'productDetail.noImages' | translate }}</p> }
          </section>

          <section class="card block span-2">
            <h2>{{ 'productForm.section.variants.title' | translate }}</h2>
            @if (p.variants?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'productForm.variants.name' | translate }}</th>
                  <th>{{ 'productForm.variants.sku' | translate }}</th>
                  <th class="num">{{ 'productForm.variants.price' | translate }}</th>
                  <th class="num">{{ 'productForm.variants.publicPrice' | translate }}</th>
                  <th class="num">{{ 'productForm.variants.stock' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (v of p.variants; track v.id) {
                    <tr>
                      <td>{{ v.name }}</td>
                      <td class="mono muted">{{ v.sku || '—' }}</td>
                      <td class="num">{{ v.price != null ? v.price + ' €' : '—' }}</td>
                      <td class="num">{{ v.publicPrice != null ? v.publicPrice + ' €' : '—' }}</td>
                      <td class="num">{{ v.stock != null ? v.stock : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'productDetail.noVariants' | translate }}</p> }
          </section>

          <section class="card block span-2">
            <h2>{{ 'productForm.section.customFields.title' | translate }}</h2>
            @if (p.fields?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'productDetail.fieldName' | translate }}</th>
                  <th>{{ 'productForm.customFields.required' | translate }}</th>
                  <th>{{ 'productForm.customFields.adminOnly' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (f of p.fields; track f.id) {
                    <tr>
                      <td>{{ f.name }}</td>
                      <td>{{ (f.required ? 'common.yes' : 'common.no') | translate }}</td>
                      <td>{{ (f.adminOnly ? 'common.yes' : 'common.no') | translate }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'productForm.noFields' | translate }}</p> }
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
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; flex-wrap: wrap; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .edit { margin-left: auto; text-decoration: none; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .block h3 { margin: 18px 0 10px; font-size: 13px; font-weight: 600; color: var(--text); }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      dd.pre { white-space: pre-wrap; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      .mono { font-variant-numeric: tabular-nums; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { border: 1px solid var(--hairline-strong); border-radius: 980px; padding: 4px 12px; font-size: 12.5px; }
      .links { margin: 0; padding-left: 18px; font-size: 13px; }
      .links li { margin-bottom: 4px; word-break: break-all; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .pill { border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill.on { background: rgba(36,138,61,0.12); color: var(--green); }
      .pill.wait { background: rgba(255,149,0,0.12); color: #b25000; }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ProductDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly product = signal<ProductDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Etichette delle piattaforme abilitate (l'API salva `platforms` come stringa JSON). */
  readonly platforms = signal<string[]>([]);
  /** Galleria immagini (l'API salva `images` come stringa JSON). */
  readonly images = signal<string[]>([]);

  private parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<ProductDetail>(`${environment.apiUrl}/products/${id}`).subscribe({
      next: (p) => {
        this.product.set(p);
        this.platforms.set(
          this.parseJsonArray(p.platforms).map(
            (value) => PRODUCT_PLATFORMS.find((o) => o.value === value)?.label ?? value,
          ),
        );
        const gallery = this.parseJsonArray(p.images);
        this.images.set(gallery.length ? gallery : p.imageUrl ? [p.imageUrl] : []);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('common.loadError'));
      },
    });
  }
}
