import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ClientTable } from '../core/client-table';
import { ServiceType } from '../core/models';

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'services.title' | translate }}</h1>
        <p class="page-caption">{{ services().length }} {{ 'services.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input class="field" name="q" [attr.placeholder]="'common.search' | translate" [ngModel]="table.query()" (ngModelChange)="table.query.set($event)" />
        <select class="field" name="scope" [ngModel]="scopeFilter()" (ngModelChange)="scopeFilter.set($event)">
          <option value="">{{ 'common.all' | translate }}</option>
          <option value="partner">{{ 'enums.serviceScope.partner' | translate }}</option>
          <option value="valet">{{ 'enums.serviceScope.valet' | translate }}</option>
        </select>
        <a routerLink="/services/new" class="btn btn-primary">+ {{ 'services.add' | translate }}</a>
      </div>
    </div>

    @if (loading()) { <div class="card state-card">{{ 'services.loading' | translate }}</div> }
    @else if (error()) { <div class="error-card">{{ error() }}</div> }
    @else if (filtered().length === 0) {
      <div class="card state-card"><strong>{{ 'services.emptyTitle' | translate }}</strong><span class="muted">{{ 'services.emptyHint' | translate }}</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th class="sortable" (click)="table.sortBy('name')">{{ 'services.col.name' | translate }}<span class="sort-ind">{{ table.indicator('name') }}</span></th>
              <th class="sortable" (click)="table.sortBy('pricingModel')">{{ 'services.col.type' | translate }}<span class="sort-ind">{{ table.indicator('pricingModel') }}</span></th>
              <th class="sortable" (click)="table.sortBy('scope')">{{ 'services.col.scope' | translate }}<span class="sort-ind">{{ table.indicator('scope') }}</span></th>
              <th class="sortable" (click)="table.sortBy('notes')">{{ 'services.col.notes' | translate }}<span class="sort-ind">{{ table.indicator('notes') }}</span></th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (s of filtered(); track s.id) {
              <tr class="row-link" tabindex="0" (click)="openDetail(s)" (keydown.enter)="openDetail(s)">
                <td class="strong">{{ s.name }}</td>
                <td><span class="pill pill-neutral">{{ ('enums.servicePricing.' + s.pricingModel) | translate }}</span></td>
                <td><span class="pill pill-gold">{{ ('enums.serviceScope.' + (s.scope || 'partner')) | translate }}</span></td>
                <td class="muted">{{ s.notes || '—' }}</td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  <a class="act" [routerLink]="['/services', s.id, 'edit']">{{ 'common.edit' | translate }}</a>
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
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .pill { display: inline-flex; align-items: center; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .pill-gold { background: var(--gold-soft); color: var(--gold-strong); }
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
export class ServicesListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  /** Il click sulla riga apre sempre il dettaglio. */
  openDetail(s: ServiceType): void {
    this.router.navigate(['/services', s.id]);
  }

  readonly services = signal<ServiceType[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly scopeFilter = signal('');

  /** Ricerca globale + ordinamento per colonna, lato client (lista piccola). */
  readonly table = new ClientTable<ServiceType>(
    ['name', 'code', 'notes', 'pricingModel', 'scope'],
    'name',
  );

  readonly filtered = computed(() => {
    const f = this.scopeFilter();
    const items = f
      ? this.services().filter((s) => s.scope === f || s.scope === 'both')
      : this.services();
    return this.table.view(items);
  });

  constructor() {
    this.http.get<ServiceType[]>(`${environment.apiUrl}/service-types`).subscribe({
      next: (d) => { this.services.set(d); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')); },
    });
  }
}
