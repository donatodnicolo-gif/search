import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ClientTable } from '../core/client-table';
import { Operation } from '../core/models';
import { StatusOption, StatusSelectComponent } from '../core/status-select.component';

@Component({
  selector: 'app-operators-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, StatusSelectComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'operators.title' | translate }}</h1>
        <p class="page-caption">{{ operators().length }} {{ 'operators.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input class="field" name="q" [attr.placeholder]="'common.search' | translate" [ngModel]="table.query()" (ngModelChange)="table.query.set($event)" />
        <a routerLink="/operators/new" class="btn btn-primary">+ {{ 'operators.add' | translate }}</a>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'operators.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (filtered().length === 0) {
      <div class="card state-card">
        <strong>{{ 'operators.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'operators.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th class="sortable" (click)="table.sortBy('lastName')">{{ 'operators.col.lastName' | translate }}<span class="sort-ind">{{ table.indicator('lastName') }}</span></th>
              <th class="sortable" (click)="table.sortBy('firstName')">{{ 'operators.col.firstName' | translate }}<span class="sort-ind">{{ table.indicator('firstName') }}</span></th>
              <th class="sortable" (click)="table.sortBy('email')">{{ 'operators.col.email' | translate }}<span class="sort-ind">{{ table.indicator('email') }}</span></th>
              <th class="sortable" (click)="table.sortBy('phone')">{{ 'operators.col.phone' | translate }}<span class="sort-ind">{{ table.indicator('phone') }}</span></th>
              <th class="sortable" (click)="table.sortBy('operationRole')">{{ 'operators.col.role' | translate }}<span class="sort-ind">{{ table.indicator('operationRole') }}</span></th>
              <th class="sortable" (click)="table.sortBy('active')">{{ 'operators.col.status' | translate }}<span class="sort-ind">{{ table.indicator('active') }}</span></th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (o of filtered(); track o.id) {
              <tr class="row-link" tabindex="0" (click)="openDetail(o)" (keydown.enter)="openDetail(o)">
                <td class="strong">{{ o.lastName }}</td>
                <td>{{ o.firstName }}</td>
                <td class="muted">{{ o.email }}</td>
                <td>{{ o.phone || '—' }}</td>
                <td>
                  <span class="pill" [class.pill-pm]="o.operationRole !== 'operation'" [class.pill-neutral]="o.operationRole === 'operation'">
                    {{ ('enums.operationRole.' + o.operationRole) | translate }}
                  </span>
                </td>
                <td>
                  <app-status-select
                    [value]="o.active ? 'true' : 'false'"
                    [options]="activeOptions()"
                    [editable]="true"
                    (changed)="changeActive(o, $event)"
                  />
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  <a class="act" [routerLink]="['/operators', o.id, 'edit']">{{ 'common.edit' | translate }}</a>
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
      .head-actions { display: flex; gap: 10px; align-items: center; }
      .head-actions .btn { text-decoration: none; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.sortable { cursor: pointer; user-select: none; }
      th.sortable:hover { color: var(--text); }
      .sort-ind { color: var(--gold-strong); font-weight: 700; }
      tbody tr { transition: background 0.14s var(--ease); }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .pill-pm { background: var(--gold-soft); color: var(--gold-strong); }
      .s-active { background: rgba(36,138,61,0.12); color: var(--green); }
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
export class OperatorsListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  /** Il click sulla riga apre sempre il dettaglio. */
  openDetail(o: Operation): void {
    this.router.navigate(['/operators', o.id]);
  }

  readonly operators = signal<Operation[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Ricerca globale + ordinamento per colonna, lato client (lista piccola). */
  readonly table = new ClientTable<Operation>(
    ['lastName', 'firstName', 'email', 'phone', 'operationRole'],
    'lastName',
  );

  readonly filtered = computed(() => this.table.view(this.operators()));

  constructor() {
    this.http.get<Operation[]>(`${environment.apiUrl}/operations`).subscribe({
      next: (d) => { this.operators.set(d); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')); },
    });
  }

  activeOptions(): StatusOption[] {
    return [
      { value: 'true', label: this.translate.instant('common.active'), cls: 's-active' },
      { value: 'false', label: this.translate.instant('common.inactive'), cls: 'pill-neutral' },
    ];
  }

  /** Cambio stato attivo/disattivo inline (ottimistico + rollback). Operatori usano PATCH. */
  changeActive(o: Operation, value: string): void {
    const previous = o.active;
    o.active = value === 'true';
    this.operators.set([...this.operators()]);
    this.http.patch(`${environment.apiUrl}/operations/${o.id}`, { active: o.active }).subscribe({
      error: () => {
        o.active = previous;
        this.operators.set([...this.operators()]);
        this.error.set(this.translate.instant('common.saveError'));
      },
    });
  }
}
