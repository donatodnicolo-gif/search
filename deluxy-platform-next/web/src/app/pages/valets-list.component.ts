import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ClientTable } from '../core/client-table';
import { Valet } from '../core/models';
import { StatusOption, StatusSelectComponent } from '../core/status-select.component';

@Component({
  selector: 'app-valets-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, StatusSelectComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'valets.title' | translate }}</h1>
        <p class="page-caption">{{ valets().length }} {{ 'valets.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input
          class="field"
          name="q"
          [attr.placeholder]="'common.search' | translate"
          [ngModel]="table.query()"
          (ngModelChange)="table.query.set($event)"
        />
        <a routerLink="/valets/new" class="btn btn-primary">+ {{ 'valets.add' | translate }}</a>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'valets.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (filtered().length === 0) {
      <div class="card state-card">
        <strong>{{ 'valets.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'valets.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th class="sortable" (click)="table.sortBy('lastName')">{{ 'valets.col.lastName' | translate }}<span class="sort-ind">{{ table.indicator('lastName') }}</span></th>
              <th class="sortable" (click)="table.sortBy('firstName')">{{ 'valets.col.firstName' | translate }}<span class="sort-ind">{{ table.indicator('firstName') }}</span></th>
              <th class="sortable" (click)="table.sortBy('email')">{{ 'valets.col.email' | translate }}<span class="sort-ind">{{ table.indicator('email') }}</span></th>
              <th class="sortable" (click)="table.sortBy('phone')">{{ 'valets.col.phone' | translate }}<span class="sort-ind">{{ table.indicator('phone') }}</span></th>
              <th>{{ 'valets.col.provinces' | translate }}</th>
              <th class="sortable" (click)="table.sortBy('vehicle')">{{ 'valets.col.vehicle' | translate }}<span class="sort-ind">{{ table.indicator('vehicle') }}</span></th>
              <th class="sortable" (click)="table.sortBy('isTeamLeader')">{{ 'valets.col.teamLeader' | translate }}<span class="sort-ind">{{ table.indicator('isTeamLeader') }}</span></th>
              <th class="sortable" (click)="table.sortBy('active')">{{ 'valets.col.status' | translate }}<span class="sort-ind">{{ table.indicator('active') }}</span></th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (v of filtered(); track v.id) {
              <tr class="row-link" tabindex="0" (click)="openDetail(v)" (keydown.enter)="openDetail(v)">
                <td class="strong">{{ v.lastName }}</td>
                <td>{{ v.firstName }}</td>
                <td class="muted">{{ v.email }}</td>
                <td>{{ v.phone || '—' }}</td>
                <td>
                  @for (vp of (v.provinces || []); track vp.province.id) {
                    <span class="pill pill-neutral">{{ vp.province.code }}</span>
                  } @empty { <span class="muted">—</span> }
                </td>
                <td>{{ v.vehicle ? (('enums.vehicle.' + v.vehicle) | translate) : '—' }}</td>
                <td>
                  @if (v.isTeamLeader) { <span class="pill s-tl">{{ 'valets.col.teamLeader' | translate }}</span> }
                  @else { <span class="muted">—</span> }
                </td>
                <td>
                  <app-status-select
                    [value]="v.active ? 'true' : 'false'"
                    [options]="activeOptions()"
                    [editable]="canEdit()"
                    (changed)="changeActive(v, $event)"
                  />
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  @if (canEdit()) {
                    <a class="act" [routerLink]="['/valets', v.id, 'edit']">{{ 'common.edit' | translate }}</a>
                  }
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
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; margin-right: 4px; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .s-active { background: rgba(36,138,61,0.12); color: var(--green); }
      .s-tl { background: var(--gold-soft); color: var(--gold-strong); }
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
export class ValetsListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Il click sulla riga apre sempre il dettaglio. */
  openDetail(v: Valet): void {
    this.router.navigate(['/valets', v.id]);
  }

  /** Modifica valet: admin, operation, project manager (come l'API). */
  canEdit(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  readonly valets = signal<Valet[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Ricerca globale + ordinamento per colonna, lato client (lista piccola). */
  readonly table = new ClientTable<Valet>(
    [
      'lastName',
      'firstName',
      'email',
      'phone',
      'vehicle',
      'provinces.province.code',
      'provinces.province.name',
    ],
    'lastName',
  );

  readonly filtered = computed(() => this.table.view(this.valets()));

  constructor() {
    this.http.get<Valet[]>(`${environment.apiUrl}/valets`).subscribe({
      next: (d) => {
        this.valets.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('valets.loadError'));
      },
    });
  }

  activeOptions(): StatusOption[] {
    return [
      { value: 'true', label: this.translate.instant('common.active'), cls: 's-active' },
      { value: 'false', label: this.translate.instant('common.inactive'), cls: 'pill-neutral' },
    ];
  }

  /** Cambio stato attivo/disattivo inline (ottimistico + rollback). */
  changeActive(v: Valet, value: string): void {
    const previous = v.active;
    v.active = value === 'true';
    this.valets.set([...this.valets()]);
    this.http.put(`${environment.apiUrl}/valets/${v.id}`, { active: v.active }).subscribe({
      error: () => {
        v.active = previous;
        this.valets.set([...this.valets()]);
        this.error.set(this.translate.instant('common.saveError'));
      },
    });
  }
}
