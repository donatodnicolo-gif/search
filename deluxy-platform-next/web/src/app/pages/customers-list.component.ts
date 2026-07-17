import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { Customer } from '../core/models';

/** Lista clienti: il click sulla riga apre il dettaglio. */
@Component({
  selector: 'app-customers-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'customers.title' | translate }}</h1>
        <p class="page-caption">{{ total() }} {{ 'customers.caption' | translate }}</p>
      </div>
      <div class="filters">
        <input
          class="field"
          name="q"
          [attr.placeholder]="'customers.searchPlaceholder' | translate"
          [ngModel]="query"
          (ngModelChange)="onSearch($event)"
        />
        <a routerLink="/customers/new" class="btn btn-primary">+ {{ 'customers.add' | translate }}</a>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'customers.loading' | translate }}</div>
    } @else if (error()) {
      <div class="state-card error-card">{{ error() }}</div>
    } @else if (customers().length === 0) {
      <div class="card state-card">
        <strong>{{ 'customers.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'customers.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              @for (col of columns; track col.field) {
                <th class="sortable" (click)="sortBy(col.field)">
                  {{ col.label | translate }}<span class="sort-ind">{{ sortIndicator(col.field) }}</span>
                </th>
              }
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (c of customers(); track c.id) {
              <tr class="row-link" tabindex="0" (click)="openDetail(c)" (keydown.enter)="openDetail(c)">
                <td class="strong">{{ c.lastName }}</td>
                <td>{{ c.firstName }}</td>
                <td class="muted">{{ c.email || '—' }}</td>
                <td>{{ c.phone || '—' }}</td>
                <td class="muted">{{ c.address || '—' }}</td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  <a class="act" [routerLink]="['/customers', c.id, 'edit']">{{ 'common.edit' | translate }}</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Paginazione server-side: in produzione i clienti sono migliaia -->
      <div class="pager">
        <button type="button" class="act" [disabled]="page() <= 1" (click)="goTo(page() - 1)">‹</button>
        <span class="pager-info">{{ 'list.pageOf' | translate: { page: page(), pages: totalPages() } }}</span>
        <button type="button" class="act" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">›</button>
        <select class="field pager-size" [ngModel]="pageSize" (ngModelChange)="changePageSize($event)" name="pageSize">
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
      .filters { display: flex; gap: 10px; align-items: center; }
      .filters .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      tbody tr { transition: background 0.14s var(--ease); }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      th.sortable { cursor: pointer; user-select: none; }
      th.sortable:hover { color: var(--text); }
      .sort-ind { color: var(--gold-strong); font-weight: 700; }
      .pager { display: flex; align-items: center; gap: 10px; margin-top: 14px; justify-content: flex-end; }
      .pager-info { font-size: 12.5px; color: var(--text-tertiary); }
      .pager-size { width: auto; padding: 4px 8px; font-size: 12.5px; }
      .act:disabled { opacity: 0.4; cursor: not-allowed; }
      .row-link { cursor: pointer; }
      .row-link:focus-visible { outline: 2px solid var(--gold-strong); outline-offset: -2px; }
      .actions-cell { white-space: nowrap; }
      .act { display: inline-flex; align-items: center; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 4px 11px; font-size: 12px; font-weight: 550; color: var(--text); text-decoration: none; }
      .act:hover { background: var(--fill); }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class CustomersListComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Stato tabella: tutto server-side (in produzione i clienti sono migliaia). */
  query = '';
  readonly total = signal(0);
  readonly page = signal(1);
  pageSize = 50;
  readonly pageSizes = [10, 25, 50, 100, 200, 500];
  readonly sort = signal<string>('lastName');
  readonly dir = signal<'asc' | 'desc'>('asc');
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly columns = [
    { field: 'lastName', label: 'customers.col.lastName' },
    { field: 'firstName', label: 'customers.col.firstName' },
    { field: 'email', label: 'customers.col.email' },
    { field: 'phone', label: 'customers.col.phone' },
    { field: 'address', label: 'customers.col.address' },
  ];

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  sortIndicator(field: string): string {
    if (this.sort() !== field) return '';
    return this.dir() === 'asc' ? ' ↑' : ' ↓';
  }

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

  /** Ricerca globale con debounce. */
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

  openDetail(c: Customer): void {
    this.router.navigate(['/customers', c.id]);
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
      .get<{ items: Customer[]; total: number }>(`${environment.apiUrl}/customers`, { params })
      .subscribe({
        next: (d) => { this.customers.set(d.items ?? []); this.total.set(d.total ?? 0); this.loading.set(false); },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError'));
        },
      });
  }

  constructor() {
    this.load();
  }
}
