import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { Category, Partner, ProductRef } from '../core/models';

interface FieldRow { name: string; required: boolean; adminOnly: boolean; }
interface ComponentRow { componentProductId: string; quantity: number | null; }

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/products" class="back">← Prodotti</a>
        <h1>Nuovo prodotto</h1>
        <p class="page-caption">Anagrafica, prezzo, tipo e campi personalizzati.</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- Dettagli -->
      <section class="card block">
        <header class="block-head"><h2>Dettagli del prodotto</h2>
          <span class="block-sub">I campi con * sono obbligatori.</span></header>
        <div class="grid-2">
          <label class="fld"><span>Nome *</span>
            <input class="field" name="name" [(ngModel)]="model.name" required placeholder="Es. Bouquet Rose Rosse" /></label>
          <label class="fld"><span>Categoria *</span>
            <select class="field" name="categoryId" [(ngModel)]="model.categoryId" required>
              <option value="">Seleziona categoria…</option>
              @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select></label>
          <label class="fld"><span>Tipo *</span>
            <select class="field" name="type" [(ngModel)]="model.type">
              <option value="UNICO">Unico (di un partner)</option>
              <option value="NON_UNICO">Non unico (es. fiori)</option>
              <option value="SUPERPRODOTTO">Superprodotto (combinazione)</option>
            </select></label>
          <label class="fld"><span>Partner {{ model.type === 'UNICO' ? '*' : '' }}</span>
            <select class="field" name="partnerId" [(ngModel)]="model.partnerId">
              <option value="">— nessuno —</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
          <label class="fld"><span>SKU</span>
            <input class="field" value="Generato automaticamente" disabled /></label>
          <label class="fld"><span>Linea / brand</span>
            <input class="field" name="line" [(ngModel)]="model.line" /></label>
          <label class="fld"><span>Prezzo (€) *</span>
            <input class="field num" type="number" step="0.01" name="price" [(ngModel)]="model.price" required /></label>
          <label class="fld"><span>Prezzo pubblico (€)</span>
            <input class="field num" type="number" step="0.01" name="publicPrice" [(ngModel)]="model.publicPrice" /></label>
          <label class="fld"><span>Giorni di preparazione</span>
            <input class="field num" type="number" min="0" name="prepDays" [(ngModel)]="model.prepDays" /></label>
          <label class="fld"><span>Immagine (URL)</span>
            <input class="field" name="imageUrl" [(ngModel)]="model.imageUrl" placeholder="https://…" /></label>
          <label class="fld span-2"><span>Plus del prodotto <em>(max 80 caratteri)</em></span>
            <input class="field" name="shortDesc" maxlength="80" [(ngModel)]="model.shortDesc" /></label>
          <label class="fld span-2"><span>Descrizione</span>
            <textarea class="field" rows="3" name="description" [(ngModel)]="model.description"></textarea></label>
        </div>
        <div class="toggles mt">
          <label class="toggle"><input type="checkbox" name="visibleToOtherPartners" [(ngModel)]="model.visibleToOtherPartners" /><span>Visibile ad altri partner</span></label>
          <label class="toggle"><input type="checkbox" name="approved" [(ngModel)]="model.approved" /><span>Approvato</span></label>
          <label class="toggle"><input type="checkbox" name="active" [(ngModel)]="model.active" /><span>Attivo</span></label>
        </div>
      </section>

      <!-- Campi personalizzati -->
      <section class="card block">
        <header class="block-head"><h2>Campi personalizzati</h2>
          <span class="block-sub">Es. messaggio sul biglietto, note di confezionamento.</span></header>
        @if (fieldRows.length === 0) { <p class="muted">Nessun campo.</p> }
        @for (row of fieldRows; track $index) {
          <div class="fld-row">
            <input class="field" placeholder="Nome campo" [(ngModel)]="row.name" [name]="'fname' + $index" />
            <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.required" [name]="'freq' + $index" /><span>Obbligatorio</span></label>
            <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.adminOnly" [name]="'fadm' + $index" /><span>Solo admin</span></label>
            <button type="button" class="icon-btn" (click)="fieldRows.splice($index,1)">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="fieldRows.push({name:'',required:false,adminOnly:false})">+ Aggiungi campo</button>
      </section>

      <!-- Componenti superprodotto -->
      @if (model.type === 'SUPERPRODOTTO') {
        <section class="card block">
          <header class="block-head"><h2>Componenti</h2>
            <span class="block-sub">Prodotti che compongono il superprodotto.</span></header>
          @for (row of componentRows; track $index) {
            <div class="comp-row">
              <select class="field" [(ngModel)]="row.componentProductId" [name]="'comp' + $index">
                <option value="">Prodotto…</option>
                @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select>
              <input class="field num qty" type="number" min="1" placeholder="Qtà" [(ngModel)]="row.quantity" [name]="'compq' + $index" />
              <button type="button" class="icon-btn" (click)="componentRows.splice($index,1)">✕</button>
            </div>
          }
          <button type="button" class="btn btn-secondary add" (click)="componentRows.push({componentProductId:'',quantity:1})">+ Aggiungi componente</button>
        </section>
      }

      @if (justSaved()) { <div class="ok-card card">Prodotto creato ✓ — i valori restano compilati: premi <strong>Crea</strong> o <strong>Duplica</strong> per crearne un altro (nuovo SKU).</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/products" class="btn btn-secondary">Annulla</a>
        <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">Duplica</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Salvataggio…' : 'Crea prodotto' }}</button>
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
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .mt { margin-top: 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
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
      .comp-row { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .fld-row { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ProductFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly categories = signal<Category[]>([]);
  readonly partners = signal<Partner[]>([]);
  readonly products = signal<ProductRef[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  fieldRows: FieldRow[] = [];
  componentRows: ComponentRow[] = [];

  model = {
    name: '',
    categoryId: '',
    type: 'NON_UNICO',
    partnerId: '',
    line: '',
    price: null as number | null,
    publicPrice: null as number | null,
    prepDays: null as number | null,
    imageUrl: '',
    shortDesc: '',
    description: '',
    visibleToOtherPartners: false,
    approved: false,
    active: true,
  };

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Category[]>(`${api}/categories`).subscribe((d) => this.categories.set(d));
    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ProductRef[]>(`${api}/products`).subscribe((d) => this.products.set(d));
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.name.trim() || !m.categoryId || m.price == null) {
      this.error.set('Nome, categoria e prezzo sono obbligatori.');
      return;
    }
    if (m.type === 'UNICO' && !m.partnerId) {
      this.error.set('Un prodotto Unico richiede un partner.');
      return;
    }

    const payload: Record<string, unknown> = {
      name: m.name.trim(),
      categoryId: m.categoryId,
      type: m.type,
      price: Number(m.price),
      visibleToOtherPartners: m.visibleToOtherPartners,
      approved: m.approved,
      active: m.active,
    };
    if (m.partnerId) payload['partnerId'] = m.partnerId;
    for (const key of ['line', 'imageUrl', 'shortDesc', 'description'] as const) {
      if (m[key].trim()) payload[key] = m[key].trim();
    }
    if (m.publicPrice != null) payload['publicPrice'] = Number(m.publicPrice);
    if (m.prepDays != null) payload['prepDays'] = Number(m.prepDays);

    const fields = this.fieldRows.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), required: f.required, adminOnly: f.adminOnly }));
    if (fields.length) payload['fields'] = fields;

    if (m.type === 'SUPERPRODOTTO') {
      const components = this.componentRows
        .filter((c) => c.componentProductId)
        .map((c) => ({ componentProductId: c.componentProductId, quantity: c.quantity ?? 1 }));
      if (components.length) payload['components'] = components;
    }

    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/products`, payload).subscribe({
      next: () => {
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/products']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nella creazione del prodotto');
      },
    });
  }
}
