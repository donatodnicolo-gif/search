import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ValetRef } from '../core/models';

interface Payment {
  id: string;
  valetId: string;
  type: string;
  amount: number;
  description?: string | null;
  status: string;
  valet?: { id: string; firstName: string; lastName: string };
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: 'Richiesto', color: '#B8963E' },
  APPROVED: { label: 'Approvato', color: '#007aff' },
  REJECTED: { label: 'Rifiutato', color: '#d70015' },
  PAID: { label: 'Pagato', color: '#248A3D' },
};

/** Amministrazione → Pagamenti: rimborsi e reclami dei valet. */
@Component({
  selector: 'app-payments-list',
  standalone: true,
  imports: [FormsModule, DecimalPipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'payments.title' | translate }}</h1>
        <p class="page-caption">{{ 'payments.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        @if (canManage()) {
          <select class="field" [(ngModel)]="valetFilter">
            <option value="">{{ 'payments.allValets' | translate }}</option>
            @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
          </select>
        }
        <button class="btn btn-primary" (click)="showNew.set(!showNew())">{{ (showNew() ? 'common.cancel' : 'payments.new') | translate }}</button>
      </div>
    </div>

    @if (showNew()) {
      <section class="card gen">
        <div class="grid">
          @if (canManage()) {
            <label class="fld"><span>{{ 'payments.form.valet' | translate }} *</span>
              <select class="field" [(ngModel)]="draft.valetId">
                <option value="">{{ 'payments.form.pickValet' | translate }}</option>
                @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
              </select></label>
          }
          <label class="fld"><span>{{ 'payments.form.type' | translate }} *</span>
            <select class="field" [(ngModel)]="draft.type">
              <option value="REIMBURSEMENT">{{ 'payments.type.REIMBURSEMENT' | translate }}</option>
              <option value="CLAIM">{{ 'payments.type.CLAIM' | translate }}</option>
            </select></label>
          <label class="fld"><span>{{ 'payments.form.amount' | translate }} *</span>
            <input class="field num" type="number" step="0.01" min="0" [(ngModel)]="draft.amount" placeholder="0.00" /></label>
        </div>
        <label class="fld mt"><span>{{ 'payments.form.description' | translate }}</span>
          <input class="field" [(ngModel)]="draft.description" [attr.placeholder]="'payments.form.descPlaceholder' | translate" /></label>
        @if (newError()) { <div class="error-card">{{ newError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="saving()" (click)="create()">
            {{ saving() ? ('common.saving' | translate) : ('payments.form.submit' | translate) }}
          </button>
        </div>
      </section>
    }

    @if (banner(); as b) { <div class="ok-card card">{{ b }}</div> }
    @if (error()) { <div class="error-card card">{{ error() }}</div> }

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              @if (canManage()) { <th>{{ 'payments.col.valet' | translate }}</th> }
              <th>{{ 'payments.col.type' | translate }}</th>
              <th class="num">{{ 'payments.col.amount' | translate }}</th>
              <th>{{ 'payments.col.description' | translate }}</th>
              <th>{{ 'payments.col.status' | translate }}</th>
              <th>{{ 'payments.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr>
                @if (canManage()) { <td class="strong">{{ p.valet?.lastName }} {{ p.valet?.firstName }}</td> }
                <td>{{ ('payments.type.' + p.type) | translate }}</td>
                <td class="num strong">{{ p.amount | number: '1.2-2' }} €</td>
                <td class="muted desc">{{ p.description || '—' }}</td>
                <td><span class="badge" [style.--c]="statusColor(p.status)"><span class="dot"></span>{{ statusLabel(p.status) }}</span></td>
                <td class="row-actions">
                  @if (canManage() && p.status === 'REQUESTED') {
                    <button class="link-btn" [disabled]="busy() === p.id" (click)="advance(p, 'APPROVED')">{{ 'payments.action.approve' | translate }}</button>
                    <button class="link-btn danger" [disabled]="busy() === p.id" (click)="advance(p, 'REJECTED')">{{ 'payments.action.reject' | translate }}</button>
                  } @else if (canManage() && p.status === 'APPROVED') {
                    <button class="link-btn" [disabled]="busy() === p.id" (click)="advance(p, 'PAID')">{{ 'payments.action.markPaid' | translate }}</button>
                  } @else { <span class="muted">—</span> }
                </td>
              </tr>
            }
            @if (!filtered().length) { <tr><td [attr.colspan]="canManage() ? 6 : 5" class="muted empty">{{ 'payments.empty' | translate }}</td></tr> }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 22px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .head-actions .btn { text-decoration: none; }
      .gen { padding: 20px 22px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld.mt { margin-top: 12px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .num { text-align: right; }
      .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 600; }
      .muted { color: var(--text-tertiary); }
      .desc { white-space: normal; max-width: 320px; }
      .empty { text-align: center; padding: 28px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .row-actions { display: flex; gap: 12px; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .link-btn:disabled { opacity: 0.5; cursor: default; }
      .state-card { padding: 28px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class PaymentsListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  readonly payments = signal<Payment[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  valetFilter = '';
  readonly showNew = signal(false);
  readonly saving = signal(false);
  readonly newError = signal<string | null>(null);
  draft = { valetId: '', type: 'REIMBURSEMENT', amount: null as number | null, description: '' };

  readonly filtered = computed(() =>
    this.valetFilter ? this.payments().filter((p) => p.valetId === this.valetFilter) : this.payments(),
  );

  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  constructor() {
    this.load();
    if (this.canManage()) {
      this.http.get<ValetRef[]>(`${environment.apiUrl}/valets`).subscribe((d) => this.valets.set(d));
    }
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<Payment[]>(`${environment.apiUrl}/payments`).subscribe({
      next: (d) => { this.payments.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }

  create(): void {
    this.newError.set(null);
    if (this.draft.amount == null || this.draft.amount <= 0 || (this.canManage() && !this.draft.valetId)) {
      this.newError.set(this.translate.instant('payments.form.required'));
      return;
    }
    this.saving.set(true);
    const body: Record<string, unknown> = { type: this.draft.type, amount: Number(this.draft.amount) };
    if (this.draft.description.trim()) body['description'] = this.draft.description.trim();
    if (this.canManage()) body['valetId'] = this.draft.valetId;
    this.http.post(`${environment.apiUrl}/payments`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.showNew.set(false);
        this.draft = { valetId: '', type: 'REIMBURSEMENT', amount: null, description: '' };
        this.banner.set(this.translate.instant('payments.form.done'));
        this.load();
      },
      error: (err) => { this.saving.set(false); this.newError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  advance(p: Payment, status: string): void {
    this.error.set(null);
    this.busy.set(p.id);
    this.http.patch(`${environment.apiUrl}/payments/${p.id}/status`, { status }).subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore nel cambio di stato'); },
    });
  }
}
