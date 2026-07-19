import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface InvoiceLine {
  id: string;
  date: string;
  recipient: string;
  description?: string;
  amount: number;
}
interface Invoice {
  id: string;
  partnerId: string;
  number?: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  deliveriesCount: number;
  status: string;
  archived: boolean;
  partner?: { id: string; insegna: string };
  lines?: InvoiceLine[];
}
interface PartnerLite { id: string; insegna: string }

const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Bozza', color: '#8A8A8E' },
  ISSUED: { label: 'Emessa', color: '#007aff' },
  PAID: { label: 'Pagata', color: '#248A3D' },
};
/** Passo successivo del flusso: stato → { next, azione }. */
const NEXT: Record<string, { next: string; key: string }> = {
  DRAFT: { next: 'ISSUED', key: 'issue' },
  ISSUED: { next: 'PAID', key: 'markPaid' },
};

/** Amministrazione → Fatturazione: genera e gestisce le fatture dei partner. */
@Component({
  selector: 'app-invoices-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'invoices.title' | translate }}</h1>
        <p class="page-caption">{{ 'invoices.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        @if (canManage()) {
          <select class="field" [(ngModel)]="partnerFilter">
            <option value="">{{ 'invoices.allPartners' | translate }}</option>
            @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
          </select>
        }
        <button class="btn btn-ghost" [disabled]="!filtered().length" (click)="exportCsv()">{{ 'invoices.export' | translate }}</button>
        @if (canManage() && view() === 'active') {
          <button class="btn btn-primary" (click)="toggleGen()">{{ (showGen() ? 'common.cancel' : 'invoices.generate') | translate }}</button>
        }
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="view() === 'active'" (click)="setView('active')">{{ 'invoices.tab.active' | translate }}</button>
      <button class="tab" [class.on]="view() === 'archive'" (click)="setView('archive')">{{ 'invoices.tab.archive' | translate }}</button>
    </div>

    @if (showGen() && view() === 'active') {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span>{{ 'invoices.gen.partner' | translate }} *</span>
            <select class="field" [(ngModel)]="genPartner">
              <option value="">{{ 'invoices.gen.pickPartner' | translate }}</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'invoices.gen.from' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="genFrom" /></label>
          <label class="fld"><span>{{ 'invoices.gen.to' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="genTo" /></label>
        </div>
        <p class="hint">{{ 'invoices.gen.hint' | translate }}</p>
        @if (genError()) { <div class="error-card">{{ genError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="generating()" (click)="generate()">
            {{ generating() ? ('common.saving' | translate) : ('invoices.gen.run' | translate) }}
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
              <th>{{ 'invoices.col.partner' | translate }}</th>
              <th>{{ 'invoices.col.number' | translate }}</th>
              <th>{{ 'invoices.col.period' | translate }}</th>
              <th class="num">{{ 'invoices.col.deliveries' | translate }}</th>
              <th class="num">{{ 'invoices.col.total' | translate }}</th>
              <th>{{ 'invoices.col.status' | translate }}</th>
              @if (view() === 'archive') { <th>{{ 'invoices.col.financial' | translate }}</th> }
              <th>{{ 'invoices.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (i of filtered(); track i.id) {
              <tr>
                <td class="strong">{{ i.partner?.insegna }}</td>
                <td>{{ i.number || '—' }}</td>
                <td class="muted">{{ i.periodStart | date: 'dd/MM/yy' }} – {{ i.periodEnd | date: 'dd/MM/yy' }}</td>
                <td class="num">{{ i.deliveriesCount }}</td>
                <td class="num strong">{{ i.totalAmount | number: '1.2-2' }} €</td>
                <td>
                  <span class="badge" [style.--c]="statusColor(i.status)"><span class="dot"></span>{{ statusLabel(i.status) }}</span>
                </td>
                @if (view() === 'archive') {
                  <td>
                    <span class="badge" [style.--c]="isPaid(i) ? '#248A3D' : '#8A8A8E'"><span class="dot"></span>{{ (isPaid(i) ? 'invoices.fin.paid' : 'invoices.fin.unpaid') | translate }}</span>
                  </td>
                }
                <td class="row-actions">
                  <button class="link-btn" (click)="toggleDetail(i)">{{ (expanded() === i.id ? 'invoices.action.hideDetail' : 'invoices.action.detail') | translate }}</button>
                  @if (canManage() && view() === 'active' && next(i.status); as n) {
                    <button class="link-btn" [disabled]="busy() === i.id" (click)="advance(i, n.next)">{{ ('invoices.action.' + n.key) | translate }}</button>
                  }
                  @if (canManage() && view() === 'archive') {
                    @if (next(i.status); as n) {
                      <button class="link-btn" [disabled]="busy() === i.id" (click)="advance(i, n.next)">{{ ('invoices.action.' + n.key) | translate }}</button>
                    }
                    @if (!isPaid(i)) {
                      <button class="link-btn danger" [disabled]="busy() === i.id" (click)="reopen(i)">{{ 'invoices.action.reopen' | translate }}</button>
                    } @else { <span class="muted">✓</span> }
                  }
                </td>
              </tr>
              @if (expanded() === i.id) {
                <tr class="detail-row">
                  <td [attr.colspan]="view() === 'archive' ? 8 : 7">
                    @if (i.lines?.length) {
                      <table class="lines">
                        <thead><tr>
                          <th>{{ 'invoices.line.date' | translate }}</th>
                          <th>{{ 'invoices.line.recipient' | translate }}</th>
                          <th>{{ 'invoices.line.description' | translate }}</th>
                          <th class="num">{{ 'invoices.line.amount' | translate }}</th>
                        </tr></thead>
                        <tbody>
                          @for (l of i.lines; track l.id) {
                            <tr>
                              <td>{{ l.date | date: 'dd/MM/yy' }}</td>
                              <td>{{ l.recipient }}</td>
                              <td class="muted">{{ l.description || '—' }}</td>
                              <td class="num">{{ l.amount | number: '1.2-2' }} €</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @else { <span class="muted">{{ 'invoices.noLines' | translate }}</span> }
                  </td>
                </tr>
              }
            }
            @if (!filtered().length) { <tr><td [attr.colspan]="view() === 'archive' ? 8 : 7" class="muted empty">{{ 'invoices.empty' | translate }}</td></tr> }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .head-actions .btn { text-decoration: none; }
      .tabs { display: inline-flex; gap: 4px; background: var(--fill); border-radius: 980px; padding: 4px; margin-bottom: 18px; }
      .tab { appearance: none; border: none; background: none; border-radius: 980px; padding: 7px 18px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .tab.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
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
      .row-actions { display: flex; gap: 12px; align-items: center; }
      .detail-row > td { background: var(--fill); padding: 10px 24px; }
      table.lines { width: 100%; border-collapse: collapse; font-size: 12.5px; background: var(--surface); border-radius: var(--radius-m); overflow: hidden; }
      table.lines th, table.lines td { padding: 8px 12px; border-bottom: 1px solid var(--hairline); }
      table.lines th { font-size: 11px; }
      table.lines tr:last-child td { border-bottom: none; }
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
export class InvoicesListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  readonly invoices = signal<Invoice[]>([]);
  readonly partners = signal<PartnerLite[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  readonly view = signal<'active' | 'archive'>('active');
  readonly expanded = signal<string | null>(null);

  partnerFilter = '';
  readonly showGen = signal(false);
  readonly generating = signal(false);
  readonly genError = signal<string | null>(null);
  genPartner = '';
  genFrom = '';
  genTo = '';

  readonly filtered = computed(() =>
    this.partnerFilter ? this.invoices().filter((i) => i.partnerId === this.partnerFilter) : this.invoices(),
  );

  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  constructor() {
    this.load();
    if (this.canManage()) {
      this.http.get<PartnerLite[]>(`${environment.apiUrl}/partners`).subscribe((d) =>
        this.partners.set(d.map((p) => ({ id: p.id, insegna: p.insegna }))),
      );
    }
  }

  setView(v: 'active' | 'archive'): void {
    if (this.view() === v) return;
    this.view.set(v);
    this.showGen.set(false);
    this.expanded.set(null);
    this.load();
  }

  toggleDetail(i: Invoice): void {
    this.expanded.set(this.expanded() === i.id ? null : i.id);
  }

  /** Apre il pannello Genera precompilando il partner dal filtro. */
  toggleGen(): void {
    const open = !this.showGen();
    this.showGen.set(open);
    if (open && this.partnerFilter) this.genPartner = this.partnerFilter;
  }

  private load(): void {
    this.loading.set(true);
    const params = this.view() === 'archive' ? { params: { archived: 'true' } } : {};
    this.http.get<Invoice[]>(`${environment.apiUrl}/invoices`, params).subscribe({
      next: (d) => { this.invoices.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }
  next(status: string): { next: string; key: string } | null { return NEXT[status] ?? null; }
  isPaid(i: Invoice): boolean { return i.status === 'PAID'; }

  generate(): void {
    this.genError.set(null);
    if (!this.genPartner || !this.genFrom || !this.genTo) {
      this.genError.set(this.translate.instant('invoices.gen.required'));
      return;
    }
    this.generating.set(true);
    this.http.post(`${environment.apiUrl}/invoices/generate`, {
      partnerId: this.genPartner, periodStart: this.genFrom, periodEnd: this.genTo,
    }).subscribe({
      next: () => {
        this.generating.set(false);
        this.showGen.set(false);
        this.genPartner = ''; this.genFrom = ''; this.genTo = '';
        this.banner.set(this.translate.instant('invoices.gen.done'));
        this.load();
      },
      error: (err) => { this.generating.set(false); this.genError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  advance(i: Invoice, status: string): void {
    this.error.set(null);
    this.busy.set(i.id);
    this.http.patch(`${environment.apiUrl}/invoices/${i.id}/status`, { status }).subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore nel cambio di stato'); },
    });
  }

  reopen(i: Invoice): void {
    this.error.set(null);
    this.busy.set(i.id);
    this.http.post(`${environment.apiUrl}/invoices/${i.id}/reopen`, {}).subscribe({
      next: () => { this.busy.set(null); this.banner.set(this.translate.instant('invoices.reopened')); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  /** Esporta la lista corrente (filtrata) in CSV. */
  exportCsv(): void {
    const t = (k: string) => this.translate.instant(k);
    const head = [
      t('invoices.col.partner'), t('invoices.col.number'), t('invoices.col.period'),
      t('invoices.col.deliveries'), t('invoices.col.total'), t('invoices.col.status'),
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = this.filtered().map((i) => [
      i.partner?.insegna ?? '',
      i.number ?? '',
      `${i.periodStart?.slice(0, 10)} / ${i.periodEnd?.slice(0, 10)}`,
      String(i.deliveriesCount), i.totalAmount.toFixed(2), this.statusLabel(i.status),
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fatture-${this.view()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
