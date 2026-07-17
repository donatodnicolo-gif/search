import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { Category, Partner, PRODUCT_PLATFORMS } from '../core/models';

interface FieldRow { name: string; required: boolean; adminOnly: boolean; }
interface VariantRow {
  name: string;
  imageUrl: string;
  price: number | null;
  publicPrice: number | null;
  prepDays: number | null;
  controlStock: boolean;
  stock: number | null;
}
interface ImageRow { url: string; }

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/products" class="back">← {{ 'productForm.backToProducts' | translate }}</a>
        <h1>{{ (editId() ? 'productForm.editTitle' : 'productForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'productForm.caption' | translate }}</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- Dettagli -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'productForm.section.details.title' | translate }}</h2>
          <span class="block-sub">{{ 'productForm.section.details.requiredNote' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'productForm.field.name' | translate }} *</span>
            <input class="field" name="name" [(ngModel)]="model.name" required [attr.placeholder]="'productForm.placeholder.name' | translate" /></label>
          <label class="fld"><span>{{ 'productForm.field.category' | translate }} *</span>
            <select class="field" name="categoryId" [(ngModel)]="model.categoryId" required>
              <option value="">{{ 'productForm.placeholder.selectCategory' | translate }}</option>
              @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'productForm.field.partner' | translate }} {{ model.isUnique ? '*' : '' }}</span>
            <select class="field" name="partnerId" [(ngModel)]="model.partnerId">
              <option value="">{{ 'productForm.option.noPartner' | translate }}</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
          <label class="fld"><span>SKU</span>
            <input class="field" [value]="'productForm.skuAuto' | translate" disabled /></label>
          <label class="fld"><span>{{ 'productForm.field.line' | translate }} <em>{{ 'productForm.field.lineHint' | translate }}</em></span>
            <input class="field" name="line" [(ngModel)]="model.line" /></label>
          <label class="fld"><span>{{ 'productForm.field.prepDays' | translate }}</span>
            <input class="field num" type="number" min="0" name="prepDays" [(ngModel)]="model.prepDays" /></label>
          <label class="fld"><span>{{ 'productForm.field.price' | translate }} *</span>
            <input class="field num" type="number" step="0.01" name="price" [(ngModel)]="model.price" required /></label>
          <label class="fld"><span>{{ 'productForm.field.publicPrice' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="publicPrice" [(ngModel)]="model.publicPrice" /></label>
          <label class="fld span-2"><span>{{ 'productForm.field.imageUrl' | translate }}</span>
            <input class="field" name="imageUrl" [(ngModel)]="model.imageUrl" placeholder="https://…" /></label>
          <label class="fld span-2"><span>{{ 'productForm.field.shortDesc' | translate }} * <em>{{ 'productForm.field.shortDescHint' | translate }}</em></span>
            <input class="field" name="shortDesc" maxlength="80" required [(ngModel)]="model.shortDesc" /></label>
          <label class="fld span-2"><span>{{ 'productForm.field.description' | translate }}</span>
            <textarea class="field" rows="3" name="description" [(ngModel)]="model.description"></textarea></label>
        </div>
        <div class="toggles mt">
          <label class="toggle"><input type="checkbox" name="isUnique" [(ngModel)]="model.isUnique" /><span>{{ 'productForm.toggle.isUnique' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="notEditable" [(ngModel)]="model.notEditable" /><span>{{ 'productForm.toggle.notEditable' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="controlStock" [(ngModel)]="model.controlStock" /><span>{{ 'productForm.toggle.controlStock' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="useAlternateName" [(ngModel)]="model.useAlternateName" /><span>{{ 'productForm.toggle.useAlternateName' | translate }}</span></label>
        </div>
        @if (model.controlStock) {
          <label class="fld mt" style="max-width:200px"><span>{{ 'productForm.field.stock' | translate }}</span>
            <input class="field num" type="number" min="0" name="stock" [(ngModel)]="model.stock" /></label>
        }
        @if (model.useAlternateName) {
          <label class="fld mt"><span>{{ 'productForm.field.alternateName' | translate }} <em>{{ 'productForm.field.alternateNameHint' | translate }}</em></span>
            <input class="field" name="alternateName" [(ngModel)]="model.alternateName" /></label>
        }
      </section>

      <!-- Shopify -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'productForm.section.shopify.title' | translate }}</h2>
          <span class="block-sub">{{ 'productForm.section.shopify.sub' | translate }}</span></header>
        <div class="toggles">
          <label class="toggle"><input type="checkbox" name="approved" [(ngModel)]="model.approved" /><span>{{ 'productForm.toggle.approved' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="active" [(ngModel)]="model.active" /><span>{{ 'common.active' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="notPhysical" [(ngModel)]="model.notPhysical" /><span>{{ 'productForm.toggle.notPhysical' | translate }}</span></label>
        </div>

        <div class="sub-head mt2">{{ 'productForm.section.platforms.title' | translate }}</div>
        <span class="sub-hint">{{ 'productForm.section.platforms.sub' | translate }}</span>
        <div class="chips mt">
          @for (p of platformOptions; track p.value) {
            <button type="button" class="chip" [class.on]="selectedPlatforms.has(p.value)" (click)="toggle(selectedPlatforms, p.value)">{{ p.label }}</button>
          }
        </div>
        @if (selectedPlatforms.size) {
          <div class="sub-block">
            <span class="sub-hint">{{ 'productForm.platforms.descHint' | translate }}</span>
            @for (p of platformOptions; track p.value) {
              @if (selectedPlatforms.has(p.value)) {
                <label class="fld mt"><span>{{ 'productForm.platforms.descFor' | translate: { platform: p.label } }}</span>
                  <textarea class="field" rows="2" [name]="'pdesc_' + p.value" [(ngModel)]="platformDesc[p.value]"></textarea></label>
              }
            }
          </div>
        }

        <div class="sub-head mt2">{{ 'productForm.images.title' | translate }}</div>
        <span class="sub-hint">{{ 'productForm.images.sub' | translate }}</span>
        <div class="mt">
          @for (row of imageRows; track $index) {
            <div class="img-row">
              <input class="field" [attr.placeholder]="'productForm.images.placeholder' | translate" [(ngModel)]="row.url" [name]="'img' + $index" />
              <button type="button" class="icon-btn" (click)="imageRows.splice($index,1)">✕</button>
            </div>
          }
          <button type="button" class="btn btn-secondary add" (click)="imageRows.push({url:''})">{{ 'productForm.images.add' | translate }}</button>
        </div>
      </section>

      <!-- Partner aggiuntivi (gated dietro Visible to other partners) -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'productForm.section.additionalPartners.title' | translate }}</h2>
          <span class="block-sub">{{ 'productForm.section.additionalPartners.sub' | translate }}</span></header>
        <label class="toggle"><input type="checkbox" name="visibleToOtherPartners" [(ngModel)]="model.visibleToOtherPartners" /><span>{{ 'productForm.toggle.visibleToOtherPartners' | translate }}</span></label>
        @if (model.visibleToOtherPartners) {
          @if (partners().length === 0) { <p class="muted mt">{{ 'productForm.noPartners' | translate }}</p> }
          @else {
            <div class="chips mt">
              @for (p of partners(); track p.id) {
                <button type="button" class="chip" [class.on]="selectedPartners.has(p.id)" (click)="toggle(selectedPartners, p.id)">{{ p.insegna }}</button>
              }
            </div>
          }
        }
      </section>

      <!-- Super prodotto (solo flag) -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'productForm.section.superProduct.title' | translate }}</h2>
          <span class="block-sub">{{ 'productForm.section.superProduct.sub' | translate }}</span></header>
        <div class="toggles">
          <label class="toggle"><input type="checkbox" name="isSuperProduct" [(ngModel)]="model.isSuperProduct" /><span>{{ 'productForm.toggle.isSuperProduct' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="isSuperProvince" [(ngModel)]="model.isSuperProvince" /><span>{{ 'productForm.toggle.isSuperProvince' | translate }}</span></label>
        </div>
      </section>

      <!-- Varianti -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'productForm.section.variants.title' | translate }}</h2>
          <span class="block-sub">{{ 'productForm.section.variants.sub' | translate }}</span></header>
        <label class="toggle"><input type="checkbox" name="hasVariants" [(ngModel)]="model.hasVariants" /><span>{{ 'productForm.variants.hasVariants' | translate }}</span></label>
        @if (model.hasVariants) {
          <div class="sub-block">
            <label class="fld"><span>{{ 'productForm.variants.optionTitle' | translate }} * <em>{{ 'productForm.variants.optionTitleHint' | translate }}</em></span>
              <input class="field" name="optionTitle" [(ngModel)]="model.optionTitle" [attr.placeholder]="'productForm.variants.optionTitlePlaceholder' | translate" /></label>
            <span class="sub-hint mt">{{ 'productForm.variants.listHint' | translate }}</span>
            @for (row of variantRows; track $index) {
              <div class="variant-card">
                <div class="var-grid">
                  <label class="fld sm"><span>{{ 'productForm.variants.name' | translate }} *</span>
                    <input class="field" [(ngModel)]="row.name" [name]="'vname' + $index" [attr.placeholder]="'productForm.variants.namePlaceholder' | translate" /></label>
                  <label class="fld sm"><span>{{ 'productForm.variants.prepDays' | translate }}</span>
                    <input class="field num" type="number" min="0" [(ngModel)]="row.prepDays" [name]="'vprep' + $index" /></label>
                  <label class="fld sm"><span>{{ 'productForm.variants.price' | translate }}</span>
                    <input class="field num" type="number" step="0.01" [(ngModel)]="row.price" [name]="'vprice' + $index" /></label>
                  <label class="fld sm"><span>{{ 'productForm.variants.publicPrice' | translate }}</span>
                    <input class="field num" type="number" step="0.01" [(ngModel)]="row.publicPrice" [name]="'vpub' + $index" /></label>
                </div>
                <label class="fld sm mt"><span>{{ 'productForm.variants.image' | translate }}</span>
                  <input class="field" [attr.placeholder]="'productForm.images.placeholder' | translate" [(ngModel)]="row.imageUrl" [name]="'vimg' + $index" /></label>
                <div class="var-foot">
                  <span class="sku-auto">{{ 'productForm.variants.skuAuto' | translate }}</span>
                  <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.controlStock" [name]="'vctrl' + $index" /><span>{{ 'productForm.variants.controlStock' | translate }}</span></label>
                  @if (row.controlStock) {
                    <input class="field num stock" type="number" min="0" [attr.placeholder]="'productForm.variants.stock' | translate" [(ngModel)]="row.stock" [name]="'vstock' + $index" />
                  }
                  <button type="button" class="icon-btn" (click)="variantRows.splice($index,1)">✕</button>
                </div>
              </div>
            }
            <button type="button" class="btn btn-secondary add" (click)="addVariant()">{{ 'productForm.variants.add' | translate }}</button>
          </div>
        }
      </section>

      <!-- Campi personalizzati -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'productForm.section.customFields.title' | translate }}</h2>
          <span class="block-sub">{{ 'productForm.section.customFields.sub' | translate }}</span></header>
        @if (fieldRows.length === 0) { <p class="muted">{{ 'productForm.noFields' | translate }}</p> }
        @for (row of fieldRows; track $index) {
          <div class="fld-row">
            <input class="field" [attr.placeholder]="'productForm.customFields.namePlaceholder' | translate" [(ngModel)]="row.name" [name]="'fname' + $index" />
            <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.required" [name]="'freq' + $index" /><span>{{ 'productForm.customFields.required' | translate }}</span></label>
            <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.adminOnly" [name]="'fadm' + $index" /><span>{{ 'productForm.customFields.adminOnly' | translate }}</span></label>
            <button type="button" class="icon-btn" (click)="fieldRows.splice($index,1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="fieldRows.push({name:'',required:false,adminOnly:false})">{{ 'productForm.customFields.add' | translate }}</button>
      </section>

      @if (justSaved()) { <div class="ok-card card">{{ 'productForm.saved.before' | translate }}<strong>{{ 'productForm.saved.create' | translate }}</strong>{{ 'productForm.saved.or' | translate }}<strong>{{ 'common.duplicate' | translate }}</strong>{{ 'productForm.saved.after' | translate }}</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/products" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'productForm.submit') | translate) }}
        </button>
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
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 860px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .sub-head { font-size: 13px; font-weight: 600; color: var(--text); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .mt { margin-top: 16px; }
      .mt2 { margin-top: 22px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .fld.sm > span { font-size: 12px; }
      .fld em { color: var(--text-tertiary); font-style: normal; font-weight: 400; }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle.sm { font-size: 13px; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .fld-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 12px; margin-bottom: 10px; align-items: center; }
      .img-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .variant-card { border: 1px solid var(--hairline); border-radius: var(--radius-m); padding: 14px; margin-bottom: 10px; background: var(--surface); }
      .var-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      .var-foot { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
      .var-foot .stock { max-width: 120px; }
      .sku-auto { font-size: 11.5px; color: var(--text-tertiary); background: var(--fill); border-radius: 980px; padding: 3px 10px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { appearance: none; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 14px; font-size: 13px; font-family: inherit; color: var(--text); cursor: pointer; transition: all 0.15s var(--ease); }
      .chip:hover { background: var(--fill); }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .sub-block { margin-top: 14px; padding: 16px; background: var(--fill); border-radius: var(--radius-m); }
      .sub-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 10px; }
      .sub-block .field { background: var(--surface); }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .fld-row { grid-template-columns: 1fr; } .var-grid { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class ProductFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly categories = signal<Category[]>([]);
  readonly partners = signal<Partner[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  fieldRows: FieldRow[] = [];
  variantRows: VariantRow[] = [];
  imageRows: ImageRow[] = [{ url: '' }];
  platformDesc: Record<string, string> = {};
  readonly platformOptions = PRODUCT_PLATFORMS;
  readonly selectedPlatforms = new Set<string>();
  readonly selectedPartners = new Set<string>();

  model = {
    name: '',
    categoryId: '',
    isUnique: false,
    isSuperProduct: false,
    partnerId: '',
    line: '',
    price: null as number | null,
    publicPrice: null as number | null,
    prepDays: null as number | null,
    imageUrl: '',
    shortDesc: '',
    description: '',
    alternateName: '',
    useAlternateName: false,
    visibleToOtherPartners: false,
    notEditable: false,
    controlStock: false,
    stock: null as number | null,
    notPhysical: false,
    isSuperProvince: false,
    approved: false,
    active: true,
    hasVariants: false,
    optionTitle: '',
  };

  /** Id prodotto in modifica (null = nuovo prodotto). */
  readonly editId = signal<string | null>(null);

  toggle(set: Set<string>, id: string): void { set.has(id) ? set.delete(id) : set.add(id); }

  addVariant(): void {
    this.variantRows.push({ name: '', imageUrl: '', price: null, publicPrice: null, prepDays: null, controlStock: false, stock: null });
  }

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Category[]>(`${api}/categories`).subscribe((d) => this.categories.set(d));
    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));

    // Modalita' modifica: /products/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${api}/products/${id}`).subscribe({
        next: (p) => this.prefill(p),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /**
   * L'API salva `platforms`, `images` e `platformDescriptions` come stringa JSON:
   * il parsing e' difensivo perche' il campo puo' essere nullo o malformato.
   */
  private parseJson<T>(value: unknown, fallback: T): T {
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) return value as T;
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : (parsed as T);
    } catch {
      return fallback;
    }
  }

  /** Riempie il form con il prodotto esistente. */
  private prefill(p: Record<string, any>): void {
    const m = this.model as Record<string, any>;
    for (const key of Object.keys(this.model)) {
      const v = p[key];
      if (v === null || v === undefined) continue;
      m[key] = v;
    }
    // partnerId/categoryId possono essere null lato API: la select vuole ''
    m['partnerId'] = p['partnerId'] ?? '';
    m['categoryId'] = p['categoryId'] ?? '';
    // I flag del form derivano dal `type` dell'API
    m['isSuperProduct'] = p['type'] === 'SUPERPRODOTTO';
    m['isUnique'] = p['type'] === 'UNICO';

    // Piattaforme (JSON array)
    this.selectedPlatforms.clear();
    for (const value of this.parseJson<unknown[]>(p['platforms'], [])) {
      if (value) this.selectedPlatforms.add(String(value));
    }

    // Descrizioni per piattaforma (JSON object)
    this.platformDesc = {};
    const pdesc = this.parseJson<Record<string, unknown>>(p['platformDescriptions'], {});
    for (const [key, value] of Object.entries(pdesc)) {
      if (value != null) this.platformDesc[key] = String(value);
    }

    // Immagini (JSON array): almeno una riga vuota per l'input
    const images = this.parseJson<unknown[]>(p['images'], []).filter(Boolean).map((u) => ({ url: String(u) }));
    this.imageRows = images.length ? images : [{ url: '' }];

    // Partner aggiuntivi: relazione partnerLinks
    this.selectedPartners.clear();
    for (const link of (p['partnerLinks'] as any[]) ?? []) {
      if (link?.partnerId) this.selectedPartners.add(link.partnerId);
    }

    this.variantRows = ((p['variants'] as any[]) ?? []).map((v) => ({
      name: v.name ?? '',
      imageUrl: v.imageUrl ?? '',
      price: v.price ?? null,
      publicPrice: v.publicPrice ?? null,
      prepDays: v.prepDays ?? null,
      controlStock: !!v.controlStock,
      stock: v.stock ?? null,
    }));

    this.fieldRows = ((p['fields'] as any[]) ?? []).map((f) => ({
      name: f.name ?? '',
      required: !!f.required,
      adminOnly: !!f.adminOnly,
    }));
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.name.trim() || !m.categoryId || m.price == null || !m.shortDesc.trim()) {
      this.error.set(this.translate.instant('productForm.error.requiredFields'));
      return;
    }
    if (m.isUnique && !m.partnerId) {
      this.error.set(this.translate.instant('productForm.error.partnerRequired'));
      return;
    }

    // Tipo derivato dai flag (super prodotto ha priorità, poi unico, altrimenti non-unico)
    const type = m.isSuperProduct ? 'SUPERPRODOTTO' : m.isUnique ? 'UNICO' : 'NON_UNICO';

    const images = this.imageRows.map((r) => r.url.trim()).filter(Boolean);

    const payload: Record<string, unknown> = {
      name: m.name.trim(),
      categoryId: m.categoryId,
      type,
      price: Number(m.price),
      shortDesc: m.shortDesc.trim(),
      visibleToOtherPartners: m.visibleToOtherPartners,
      useAlternateName: m.useAlternateName,
      notEditable: m.notEditable,
      controlStock: m.controlStock,
      notPhysical: m.notPhysical,
      isSuperProvince: m.isSuperProvince,
      approved: m.approved,
      active: m.active,
      hasVariants: m.hasVariants,
    };
    if (m.partnerId) payload['partnerId'] = m.partnerId;
    for (const key of ['line', 'description', 'imageUrl', 'optionTitle'] as const) {
      if (m[key].trim()) payload[key] = m[key].trim();
    }
    // Nome alternativo solo se il flag è attivo
    if (m.useAlternateName && m.alternateName.trim()) payload['alternateName'] = m.alternateName.trim();
    if (m.publicPrice != null) payload['publicPrice'] = Number(m.publicPrice);
    if (m.prepDays != null) payload['prepDays'] = Number(m.prepDays);
    if (m.controlStock && m.stock != null) payload['stock'] = Number(m.stock);
    // In modifica le collezioni vanno inviate SEMPRE, anche vuote: altrimenti
    // svuotarle non le cancellerebbe (l'API aggiorna solo le chiavi presenti).
    const isEdit = !!this.editId();
    if (images.length || isEdit) payload['images'] = images;
    if (this.selectedPlatforms.size || isEdit) payload['platforms'] = [...this.selectedPlatforms];

    // Descrizioni per piattaforma (solo piattaforme selezionate con testo)
    const pdesc: Record<string, string> = {};
    for (const value of this.selectedPlatforms) {
      const t = (this.platformDesc[value] ?? '').trim();
      if (t) pdesc[value] = t;
    }
    if (Object.keys(pdesc).length || isEdit) payload['platformDescriptions'] = pdesc;

    const partnerIds = m.visibleToOtherPartners ? [...this.selectedPartners] : [];
    if (partnerIds.length || isEdit) payload['additionalPartnerIds'] = partnerIds;

    // Lo SKU della variante è generato dall'API (progressivo: <SKU prodotto>-NN)
    const variants = m.hasVariants
      ? this.variantRows
          .filter((v) => v.name.trim())
          .map((v) => ({
            name: v.name.trim(),
            imageUrl: v.imageUrl.trim() || undefined,
            price: v.price != null ? Number(v.price) : undefined,
            publicPrice: v.publicPrice != null ? Number(v.publicPrice) : undefined,
            prepDays: v.prepDays != null ? Number(v.prepDays) : undefined,
            controlStock: v.controlStock,
            stock: v.controlStock && v.stock != null ? Number(v.stock) : undefined,
          }))
      : [];
    if (variants.length || isEdit) payload['variants'] = variants;

    const fields = this.fieldRows.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), required: f.required, adminOnly: f.adminOnly }));
    if (fields.length || isEdit) payload['fields'] = fields;

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/products/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/products`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/products', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/products']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('productForm.error.createFailed'));
      },
    });
  }
}
