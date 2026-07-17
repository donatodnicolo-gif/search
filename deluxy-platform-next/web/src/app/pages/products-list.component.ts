import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ProductRef } from '../core/models';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'products.title' | translate }}</h1>
        <p class="page-caption">{{ total() }} {{ 'products.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input
          class="field"
          [attr.placeholder]="'products.searchPlaceholder' | translate"
          [ngModel]="query"
          (ngModelChange)="onSearch($event)"
        />
        <a routerLink="/products/new" class="btn btn-primary">+ {{ 'products.add' | translate }}</a>
      </div>
    </div>

    @if (loading()) { <div class="card state-card">{{ 'products.loading' | translate }}</div> }
    @else if (error()) { <div class="error-card">{{ error() }}</div> }
    @else if (products().length === 0) {
      <div class="card state-card"><strong>{{ 'products.emptyTitle' | translate }}</strong><span class="muted">{{ 'products.emptyHint' | translate }}</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead><tr>
            @for (c of columns; track c.field) {
              <th [class.num]="c.num" class="sortable" (click)="sortBy(c.field)">
                {{ c.label | translate }}<span class="sort-ind">{{ sortIndicator(c.field) }}</span>
              </th>
            }
            <th>{{ 'deliveries.col.actions' | translate }}</th>
          </tr></thead>
          <tbody>
            @for (p of products(); track p.id) {
              <tr class="row-link" tabindex="0" (click)="openDetail(p)" (keydown.enter)="openDetail(p)">
                <td class="strong">{{ p.name }}</td>
                <td class="mono muted">{{ p.sku || '—' }}</td>
                <td>{{ p.category?.name || '—' }}</td>
                <td><span class="pill pill-neutral">{{ p.type ? (('enums.productType.' + p.type) | translate) : '—' }}</span></td>
                <td class="muted">{{ p.partner?.insegna || '—' }}</td>
                <td class="num strong">{{ p.price != null ? (p.price + ' €') : '—' }}</td>
                <td>
                  @if (p.active === false) { <span class="pill pill-neutral">{{ 'common.inactive' | translate }}</span> }
                  @else if (p.approved) { <span class="pill s-ok"><span class="dot"></span>{{ 'products.approved' | translate }}</span> }
                  @else { <span class="pill s-wait"><span class="dot"></span>{{ 'products.pending' | translate }}</span> }
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  <a class="act" [routerLink]="['/products', p.id, 'edit']">{{ 'common.edit' | translate }}</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Paginazione server-side -->
      <div class="pager">
        <button type="button" class="act" [disabled]="page() <= 1" (click)="goTo(page() - 1)">‹</button>
        <span class="pager-info">
          {{ 'list.pageOf' | translate: { page: page(), pages: totalPages() } }}
        </span>
        <button type="button" class="act" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">›</button>
        <select class="field pager-size" [ngModel]="pageSize" (ngModelChange)="changePageSize($event)">
          @for (s of pageSizes; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="pager-info">{{ 'list.perPage' | translate }}</span>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .head-actions { display: flex; gap: 10px; align-items: center; }
      .head-actions .btn { text-decoration: none; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.num, td.num { text-align: right; }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .mono { font-variant-numeric: tabular-nums; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .s-ok { background: rgba(36,138,61,0.12); color: var(--green); }
      .s-wait { background: rgba(255,149,0,0.12); color: #b25000; }
      .row-link { cursor: pointer; }
      .row-link:focus-visible { outline: 2px solid var(--gold-strong); outline-offset: -2px; }
      .actions-cell { white-space: nowrap; }
      .act { display: inline-flex; align-items: center; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 4px 11px; font-size: 12px; font-weight: 550; color: var(--text); text-decoration: none; }
      .act:hover { background: var(--fill); }
      /* Intestazioni ordinabili */
      th.sortable { cursor: pointer; user-select: none; }
      th.sortable:hover { color: var(--text); }
      .sort-ind { color: var(--gold-strong); font-weight: 700; }
      /* Paginazione */
      .pager { display: flex; align-items: center; gap: 10px; margin-top: 14px; justify-content: flex-end; }
      .pager-info { font-size: 12.5px; color: var(--text-tertiary); }
      .pager-size { width: auto; padding: 4px 8px; font-size: 12.5px; }
      .act:disabled { opacity: 0.4; cursor: not-allowed; }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class ProductsListComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  /** Il click sulla riga apre sempre il dettaglio. */
  openDetail(p: ProductRef): void {
    this.router.navigate(['/products', p.id]);
  }

  readonly products = signal<ProductRef[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Stato tabella: ricerca globale + ordinamento + paginazione (tutto server-side). */
  query = '';
  readonly total = signal(0);
  readonly page = signal(1);
  pageSize = 50;
  readonly pageSizes = [10, 25, 50, 100, 200, 500];
  readonly sort = signal<string>('name');
  readonly dir = signal<'asc' | 'desc'>('asc');
  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Colonne ordinabili: il campo deve essere nella whitelist dell'API. */
  readonly columns = [
    { field: 'name', label: 'products.col.name', num: false },
    { field: 'sku', label: 'products.col.sku', num: false },
    { field: 'category.name', label: 'products.col.category', num: false },
    { field: 'type', label: 'products.col.type', num: false },
    { field: 'partner.insegna', label: 'products.col.partner', num: false },
    { field: 'price', label: 'products.col.price', num: true },
    { field: 'approved', label: 'products.col.status', num: false },
  ];

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  sortIndicator(field: string): string {
    if (this.sort() !== field) return '';
    return this.dir() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Click sull'intestazione: stesso campo inverte il verso, altrimenti ordina asc. */
  sortBy(field: string): void {
    if (this.sort() === field) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.dir.set('asc');
    }
    this.page.set(1);
    this.load();
  }

  /** Ricerca globale con debounce: evita una chiamata per ogni tasto. */
  onSearch(value: string): void {
    this.query = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const params: Record<string, string> = {
      page: String(this.page()),
      pageSize: String(this.pageSize),
      sort: this.sort(),
      dir: this.dir(),
    };
    if (this.query.trim()) params['q'] = this.query.trim();
    this.http
      .get<{ items: ProductRef[]; total: number }>(`${environment.apiUrl}/products`, { params })
      .subscribe({
        next: (d) => { this.products.set(d.items ?? []); this.total.set(d.total ?? 0); this.loading.set(false); },
        error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')); },
      });
  }

  constructor() {
    this.load();
  }
}
