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
  archived: boolean;
  valet?: { id: string; firstName: string; lastName: string; hasVat: boolean };
  receipts?: { id: string; signed: boolean }[];
  claims?: { id: string; amount: number; status: string }[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Bozza', color: '#8A8A8E' },
  SENT: { label: 'Inviato · da firmare', color: '#007aff' },
  RECEIPT_PENDING: { label: 'Ricevuta firmata · da approvare', color: '#C04C00' },
  APPROVED: { label: 'Approvato', color: '#B8963E' },
  PAID: { label: 'Pagato', color: '#248A3D' },
};
/** Passo successivo del flusso lato admin: stato → { next, azione }.
 *  Da SENT si passa a RECEIPT_PENDING quando il VALET firma la ricevuta (pagina Ricevute),
 *  quindi qui non c'è un'azione admin su SENT. */
const NEXT: Record<string, { next: string; key: string }> = {
  DRAFT: { next: 'SENT', key: 'send' },
  RECEIPT_PENDING: { next: 'APPROVED', key: 'approve' },
  APPROVED: { next: 'PAID', key: 'markPaid' },
};

/** Amministrazione → Stipendi: genera, gestisce il flusso, archivia; il valet vede i propri e apre reclami. */
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
        }
        <button class="btn btn-ghost" [disabled]="!filtered().length" (click)="exportCsv()">{{ 'salaries.export' | translate }}</button>
        @if (canManage() && view() === 'active') {
          <button class="btn btn-primary" (click)="toggleGen()">{{ (showGen() ? 'common.cancel' : 'salaries.generate') | translate }}</button>
        }
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="view() === 'active'" (click)="setView('active')">{{ 'salaries.tab.active' | translate }}</button>
      <button class="tab" [class.on]="view() === 'archive'" (click)="setView('archive')">{{ 'salaries.tab.archive' | translate }}</button>
    </div>

    @if (showGen() && view() === 'active') {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span>{{ 'salaries.gen.valet' | translate }} *</span>
            <select class="field" [(ngModel)]="genValet" (ngModelChange)="onGenValetChange()">
              <option value="">{{ 'salaries.gen.pickValet' | translate }}</option>
              @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'salaries.gen.from' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="genFrom" /></label>
          <label class="fld"><span>{{ 'salaries.gen.to' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="genTo" /></label>
        </div>
        @if (freqHint()) { <p class="hint">{{ freqHint() }}</p> }
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
              @if (view() === 'archive') { <th>{{ 'salaries.col.financial' | translate }}</th> }
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
                  @if (s.claims?.length) { <span class="claim-tag">{{ 'salaries.claimOpen' | translate }}</span> }
                </td>
                @if (view() === 'archive') {
                  <td>
                    <span class="badge" [style.--c]="isPaid(s) ? '#248A3D' : '#8A8A8E'"><span class="dot"></span>{{ (isPaid(s) ? 'salaries.fin.paid' : 'salaries.fin.unpaid') | translate }}</span>
                  </td>
                }
                <td class="row-actions">
                  @if (canManage() && view() === 'active' && next(s.status); as n) {
                    <button class="link-btn" [disabled]="busy() === s.id" (click)="advance(s, n.next)">{{ ('salaries.action.' + n.key) | translate }}</button>
                  }
                  @if (canManage() && view() === 'archive') {
                    @if (s.status === 'SENT') { <span class="muted">{{ 'salaries.awaitSignature' | translate }}</span> }
                    @if (next(s.status); as n) {
                      <button class="link-btn" [disabled]="busy() === s.id" (click)="advance(s, n.next)">{{ ('salaries.action.' + n.key) | translate }}</button>
                    }
                    @if (!isPaid(s)) {
                      <button class="link-btn danger" [disabled]="busy() === s.id" (click)="reopen(s)">{{ 'salaries.action.reopen' | translate }}</button>
                    } @else { <span class="muted">✓</span> }
                  }
                  <button class="link-btn" (click)="openReclamo(s)">{{ 'salaries.action.reclamo' | translate }}</button>
                </td>
              </tr>
              @if (reclamoFor() === s.id) {
                <tr class="reclamo-row">
                  <td [attr.colspan]="view() === 'archive' ? 9 : 8">
                    <div class="reclamo">
                      <span class="reclamo-title">{{ 'salaries.reclamo.title' | translate }}</span>
                      <input class="field small" type="number" min="0" step="0.01" [(ngModel)]="reclamoAmount" [placeholder]="'salaries.reclamo.amount' | translate" />
                      <input class="field" [(ngModel)]="reclamoDesc" [placeholder]="'salaries.reclamo.desc' | translate" />
                      <button class="btn btn-primary" [disabled]="busy() === s.id" (click)="submitReclamo(s)">{{ 'salaries.reclamo.send' | translate }}</button>
                      <button class="btn btn-ghost" (click)="reclamoFor.set(null)">{{ 'common.cancel' | translate }}</button>
                    </div>
                  </td>
                </tr>
              }
            }
            @if (!filtered().length) { <tr><td [attr.colspan]="view() === 'archive' ? 9 : 8" class="muted empty">{{ 'salaries.empty' | translate }}</td></tr> }
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
      .claim-tag { margin-left: 8px; font-size: 11px; font-weight: 600; color: #C04C00; }
      .row-actions { display: flex; gap: 12px; align-items: center; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .link-btn:disabled { opacity: 0.5; cursor: default; }
      .reclamo-row td { background: var(--fill); }
      .reclamo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .reclamo-title { font-weight: 600; font-size: 13px; }
      .field.small { max-width: 120px; }
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
  readonly view = signal<'active' | 'archive'>('active');

  valetFilter = '';
  readonly showGen = signal(false);
  readonly generating = signal(false);
  readonly genError = signal<string | null>(null);
  readonly freqHint = signal<string | null>(null);
  genValet = '';
  genFrom = '';
  genTo = '';

  // Reclamo (il valet apre un reclamo su una riga di stipendio)
  readonly reclamoFor = signal<string | null>(null);
  reclamoAmount: number | null = null;
  reclamoDesc = '';

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

  setView(v: 'active' | 'archive'): void {
    if (this.view() === v) return;
    this.view.set(v);
    this.showGen.set(false);
    this.reclamoFor.set(null);
    this.load();
  }

  /** Apre il pannello Genera precompilando il valet dal filtro (niente doppia scelta) + periodo dalla frequenza. */
  toggleGen(): void {
    const open = !this.showGen();
    this.showGen.set(open);
    if (open && this.valetFilter) { this.genValet = this.valetFilter; this.onGenValetChange(); }
  }

  /** Al cambio del valet, propone il periodo in base alla frequenza stipendio (mensile/settimanale). */
  onGenValetChange(): void {
    const v = this.valets().find((x) => x.id === this.genValet);
    if (!v) { this.freqHint.set(null); return; }
    const weekly = (v.salaryFrequency ?? 'monthly') === 'weekly';
    const now = new Date();
    let from: Date, to: Date;
    if (weekly) {
      // Settimana corrente: lunedì → domenica.
      const day = (now.getDay() + 6) % 7; // 0 = lunedì
      from = new Date(now); from.setDate(now.getDate() - day);
      to = new Date(from); to.setDate(from.getDate() + 6);
    } else {
      // Mese corrente: primo → ultimo giorno.
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    this.genFrom = this.iso(from);
    this.genTo = this.iso(to);
    this.freqHint.set(
      this.translate.instant(weekly ? 'salaries.gen.freqWeekly' : 'salaries.gen.freqMonthly'),
    );
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private load(): void {
    this.loading.set(true);
    const params = this.view() === 'archive' ? { params: { archived: 'true' } } : {};
    this.http.get<Salary[]>(`${environment.apiUrl}/salaries`, params).subscribe({
      next: (d) => { this.salaries.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }
  next(status: string): { next: string; key: string } | null { return NEXT[status] ?? null; }
  isPaid(s: Salary): boolean { return s.status === 'PAID'; }

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
        this.genValet = ''; this.genFrom = ''; this.genTo = ''; this.freqHint.set(null);
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

  reopen(s: Salary): void {
    this.error.set(null);
    this.busy.set(s.id);
    this.http.post(`${environment.apiUrl}/salaries/${s.id}/reopen`, {}).subscribe({
      next: () => { this.busy.set(null); this.banner.set(this.translate.instant('salaries.reopened')); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  openReclamo(s: Salary): void {
    this.reclamoFor.set(this.reclamoFor() === s.id ? null : s.id);
    this.reclamoAmount = null;
    this.reclamoDesc = '';
  }

  submitReclamo(s: Salary): void {
    if (!this.reclamoAmount || this.reclamoAmount <= 0) {
      this.error.set(this.translate.instant('salaries.reclamo.required'));
      return;
    }
    this.error.set(null);
    this.busy.set(s.id);
    this.http.post(`${environment.apiUrl}/payments`, {
      type: 'CLAIM',
      salaryId: s.id,
      valetId: s.valetId,
      amount: this.reclamoAmount,
      description: this.reclamoDesc || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(null);
        this.reclamoFor.set(null);
        this.banner.set(this.translate.instant('salaries.reclamo.done'));
        this.load();
      },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  /** Esporta la lista corrente (filtrata) in CSV. */
  exportCsv(): void {
    const t = (k: string) => this.translate.instant(k);
    const head = [
      t('salaries.col.valet'), t('salaries.col.period'), t('salaries.col.gross'),
      t('salaries.col.cash'), t('salaries.col.net'), t('salaries.col.document'), t('salaries.col.status'),
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = this.filtered().map((s) => [
      `${s.valet?.lastName ?? ''} ${s.valet?.firstName ?? ''}`.trim(),
      `${s.periodStart?.slice(0, 10)} / ${s.periodEnd?.slice(0, 10)}`,
      s.grossAmount.toFixed(2), s.cashDeductions.toFixed(2), s.netAmount.toFixed(2),
      t('salaries.doc.' + s.documentType), this.statusLabel(s.status),
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stipendi-${this.view()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
