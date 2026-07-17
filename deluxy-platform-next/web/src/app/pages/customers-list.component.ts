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
        <p class="page-caption">{{ customers().length }} {{ 'customers.caption' | translate }}</p>
      </div>
      <div class="filters">
        <input class="field" [(ngModel)]="query" name="query" [attr.placeholder]="'customers.searchPlaceholder' | translate" />
        <a routerLink="/customers/new" class="btn btn-primary">+ {{ 'customers.add' | translate }}</a>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'customers.loading' | translate }}</div>
    } @else if (error()) {
      <div class="state-card error-card">{{ error() }}</div>
    } @else if (filtered().length === 0) {
      <div class="card state-card">
        <strong>{{ 'customers.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'customers.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'customers.col.lastName' | translate }}</th>
              <th>{{ 'customers.col.firstName' | translate }}</th>
              <th>{{ 'customers.col.email' | translate }}</th>
              <th>{{ 'customers.col.phone' | translate }}</th>
              <th>{{ 'customers.col.address' | translate }}</th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (c of filtered(); track c.id) {
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
  query = '';

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.customers();
    return this.customers().filter(
      (c) =>
        c.lastName.toLowerCase().includes(q) ||
        c.firstName.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q),
    );
  });

  openDetail(c: Customer): void {
    this.router.navigate(['/customers', c.id]);
  }

  constructor() {
    this.http.get<Customer[]>(`${environment.apiUrl}/customers`).subscribe({
      next: (d) => { this.customers.set(d); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('common.loadError'));
      },
    });
  }
}
