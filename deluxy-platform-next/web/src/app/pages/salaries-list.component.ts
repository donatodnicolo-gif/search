import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ValetRef } from '../core/models';

interface Salary {
  id: string;
  valetId: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  cashDeductions: number;
  netAmount: number;
  documentType: string;
  status: string;
  valet?: { id: string; firstName: string; lastName: string; hasVat: boolean };
  receipts?: { id: string; signed: boolean }[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Bozza', color: '#8A8A8E' },
  SENT: { label: 'Inviato', color: '#007aff' },
  RECEIPT_PENDING: { label: 'Ricevuta in attesa', color: '#C04C00' },
  APPROVED: { label: 'Approvato', color: '#B8963E' },
  PAID: { label: 'Pagato', color: '#248A3D' },
};
/** Passo successivo del flusso: stato → { next, azione }. */
const NEXT: Record<string, { next: string; key: string }> = {
  DRAFT: { next: 'SENT', key: 'send' },
  SENT: { next: 'RECEIPT_PENDING', key: 'genReceipt' },
  RECEIPT_PENDING: { next: 'APPROVED', key: 'approve' },
  APPROVED: { next: 'PAID', key: 'markPaid' },
};

/** Amministrazione → Stipendi: genera e gestisce il flusso stipendi dei valet. */
@Component({
  selector: 'app-salaries-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'salaries.title' | translate }}</h1>
        <p class="page-caption">{{ 'salaries.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        @if (canManage()) {
          <select class="field" [(ngModel)]="valetFilter">
            <option value="">{{ 'salaries.allValets' | translate }}</option>
            @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
          </select>
          <button class="btn btn-primary" (click)="showGen.set(!showGen())">{{ (showGen() ? 'common.cancel' : 'salaries.generate') | translate }}</button>
        }
      </div>
    </div>

    @if (showGen()) {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span>{{ 'salaries.gen.valet' | translate }} *</span>
            <select class="field" [(ngModel)]="genValet">
              <option value="">{{ 'salaries.gen.pickValet' | translate }}</option>
              @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'salaries.gen.from' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="genFrom" /></label>
          <label class="fld"><span>{{ 'salaries.gen.to' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="genTo" /></label>
        </div>
        <p class="hint">{{ 'salaries.gen.hint' | translate }}</p>
        @if (genError()) { <div class="error-card">{{ genError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="generating()" (click)="generate()">
            {{ generating() ? ('common.saving' | translate) : ('salaries.gen.run' | translate) }}
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
              <th>{{ 'salaries.col.valet' | translate }}</th>
              <th>{{ 'salaries.col.period' | translate }}</th>
              <th class="num">{{ 'salaries.col.gross' | translate }}</th>
              <th class="num">{{ 'salaries.col.cash' | translate }}</th>
              <th class="num">{{ 'salaries.col.net' | translate }}</th>
              <th>{{ 'salaries.col.document' | translate }}</th>
              <th>{{ 'salaries.col.status' | translate }}</th>
              <th>{{ 'salaries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (s of filtered(); track s.id) {
              <tr>
                <td class="strong">{{ s.valet?.lastName }} {{ s.valet?.firstName }}</td>
                <td class="muted">{{ s.periodStart | date: 'dd/MM/yy' }} – {{ s.periodEnd | date: 'dd/MM/yy' }}</td>
                <td class="num">{{ s.grossAmount | number: '1.2-2' }} €</td>
                <td class="num">{{ s.cashDeductions ? '−' + (s.cashDeductions | number: '1.2-2') + ' €' : '—' }}</td>
                <td class="num strong">{{ s.netAmount | number: '1.2-2' }} €</td>
                <td>{{ ('salaries.doc.' + s.documentType) | translate }}</td>
                <td>
                  <span class="badge" [style.--c]="statusColor(s.status)"><span class="dot"></span>{{ statusLabel(s.status) }}</span>
                </td>
                <td class="row-actions">
                  @if (canManage() && next(s.status); as n) {
                    <button class="link-btn" [disabled]="busy() === s.id" (click)="advance(s, n.next)">{{ ('salaries.action.' + n.key) | translate }}</button>
                  } @else if (s.status === 'PAID') {
                    <span class="muted">✓</span>
                  }
                </td>
              </tr>
            }
            @if (!filtered().length) { <tr><td colspan="8" class="muted empty">{{ 'salaries.empty' | translate }}</td></tr> }
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
      .grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .hint { margin: 12px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 600; }
      .muted { color: var(--text-tertiary); }
      .empty { text-align: center; padding: 28px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .row-actions { display: flex; gap: 12px; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn:disabled { opacity: 0.5; cursor: default; }
      .state-card { padding: 28px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class SalariesListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  readonly salaries = signal<Salary[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  valetFilter = '';
  readonly showGen = signal(false);
  readonly generating = signal(false);
  readonly genError = signal<string | null>(null);
  genValet = '';
  genFrom = '';
  genTo = '';

  readonly filtered = computed(() =>
    this.valetFilter ? this.salaries().filter((s) => s.valetId === this.valetFilter) : this.salaries(),
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
    this.http.get<Salary[]>(`${environment.apiUrl}/salaries`).subscribe({
      next: (d) => { this.salaries.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }
  next(status: string): { next: string; key: string } | null { return NEXT[status] ?? null; }

  generate(): void {
    this.genError.set(null);
    if (!this.genValet || !this.genFrom || !this.genTo) {
      this.genError.set(this.translate.instant('salaries.gen.required'));
      return;
    }
    this.generating.set(true);
    this.http.post(`${environment.apiUrl}/salaries/generate`, {
      valetId: this.genValet, periodStart: this.genFrom, periodEnd: this.genTo,
    }).subscribe({
      next: () => {
        this.generating.set(false);
        this.showGen.set(false);
        this.genValet = ''; this.genFrom = ''; this.genTo = '';
        this.banner.set(this.translate.instant('salaries.gen.done'));
        this.load();
      },
      error: (err) => { this.generating.set(false); this.genError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  advance(s: Salary, status: string): void {
    this.error.set(null);
    this.busy.set(s.id);
    this.http.patch(`${environment.apiUrl}/salaries/${s.id}/status`, { status }).subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore nel cambio di stato'); },
    });
  }
}
