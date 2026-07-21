import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface CorrispettivoRow {
  deliveryId: string;
  deliveryCode: number;
  status: string;
  date: string;
  product: string;
  category: string | null;
  partner: string;
  saleValue: number;
  publicPrice: number;
  partnerPrice: number;
  feePercent: number;
  feeValue: number;
  feeWithVat: number;
  deliveryCost: number;
  firstMargin: number;
  firstMarginPercent: number;
}

interface Summary {
  deliveries: number;
  saleValue: number;
  publicPrice: number;
  partnerPrice: number;
  feeValue: number;
  feeWithVat: number;
  deliveryCost: number;
  firstMargin: number;
  firstMarginPercent: number;
}

/**
 * Finanza (§3.8 dell'app reale): tab CORRISPETTIVI (una riga per consegna con
 * i valori economici e il primo margine) e tab MARGINI (i totali). Riservata
 * agli admin. Le formule di fee/margine sono derivate (vedi finance.module.ts):
 * da confermare sullo schermo reale.
 */
@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'finance.title' | translate }}</h1>
        <p class="page-caption">{{ 'finance.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <label class="date-fld"><span>{{ 'finance.from' | translate }}</span><input class="field" type="date" [(ngModel)]="from" (ngModelChange)="reload()" name="from" /></label>
        <label class="date-fld"><span>{{ 'finance.to' | translate }}</span><input class="field" type="date" [(ngModel)]="to" (ngModelChange)="reload()" name="to" /></label>
        @if (tab() === 'corrispettivi') {
          <button class="btn btn-ghost" [disabled]="!rows().length" (click)="exportCsv()">{{ 'finance.export' | translate }}</button>
        }
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="tab() === 'corrispettivi'" (click)="tab.set('corrispettivi')">{{ 'finance.tab.corrispettivi' | translate }}</button>
      <button class="tab" [class.on]="tab() === 'margini'" (click)="tab.set('margini')">{{ 'finance.tab.margini' | translate }}</button>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (tab() === 'margini') {
      @if (summary(); as s) {
        <div class="cards">
          <div class="stat"><span class="k">{{ 'finance.m.deliveries' | translate }}</span><span class="v">{{ s.deliveries }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.m.saleValue' | translate }}</span><span class="v">{{ euro(s.saleValue) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.m.partnerPrice' | translate }}</span><span class="v">{{ euro(s.partnerPrice) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.m.feeValue' | translate }}</span><span class="v">{{ euro(s.feeValue) }}</span></div>
          <div class="stat"><span class="k">{{ 'finance.m.deliveryCost' | translate }}</span><span class="v">{{ euro(s.deliveryCost) }}</span></div>
          <div class="stat hi"><span class="k">{{ 'finance.m.firstMargin' | translate }}</span><span class="v" [class.neg]="s.firstMargin < 0">{{ euro(s.firstMargin) }}</span><span class="pct">{{ s.firstMarginPercent | number: '1.0-1' }}%</span></div>
        </div>
        <p class="assumption">{{ 'finance.assumption' | translate }}</p>
      }
    } @else {
      @if (rows().length === 0) {
        <div class="card state-card">{{ 'finance.empty' | translate }}</div>
      } @else {
        <div class="card table-wrap">
          <table class="fin">
            <thead>
              <tr>
                <th>{{ 'finance.c.status' | translate }}</th>
                <th>{{ 'finance.c.delivery' | translate }}</th>
                <th>{{ 'finance.c.date' | translate }}</th>
                <th>{{ 'finance.c.product' | translate }}</th>
                <th>{{ 'finance.c.category' | translate }}</th>
                <th>{{ 'finance.c.partner' | translate }}</th>
                <th class="num">{{ 'finance.c.saleValue' | translate }}</th>
                <th class="num">{{ 'finance.c.publicPrice' | translate }}</th>
                <th class="num">{{ 'finance.c.partnerPrice' | translate }}</th>
                <th class="num">{{ 'finance.c.feePercent' | translate }}</th>
                <th class="num">{{ 'finance.c.feeValue' | translate }}</th>
                <th class="num">{{ 'finance.c.feeWithVat' | translate }}</th>
                <th class="num">{{ 'finance.c.deliveryCost' | translate }}</th>
                <th class="num">{{ 'finance.c.firstMargin' | translate }}</th>
                <th class="num">{{ 'finance.c.firstMarginPercent' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.deliveryId) {
                <tr>
                  <td><span class="pill">{{ r.status }}</span></td>
                  <td class="mono">#{{ r.deliveryCode }}</td>
                  <td>{{ r.date | date: 'd/M/yy' }}</td>
                  <td>{{ r.product }}</td>
                  <td>{{ r.category ?? '—' }}</td>
                  <td>{{ r.partner }}</td>
                  <td class="num">{{ euro(r.saleValue) }}</td>
                  <td class="num">{{ euro(r.publicPrice) }}</td>
                  <td class="num">{{ euro(r.partnerPrice) }}</td>
                  <td class="num">{{ r.feePercent | number: '1.0-1' }}%</td>
                  <td class="num">{{ euro(r.feeValue) }}</td>
                  <td class="num">{{ euro(r.feeWithVat) }}</td>
                  <td class="num">{{ euro(r.deliveryCost) }}</td>
                  <td class="num" [class.neg]="r.firstMargin < 0">{{ euro(r.firstMargin) }}</td>
                  <td class="num">{{ r.firstMarginPercent | number: '1.0-1' }}%</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="assumption">{{ 'finance.assumption' | translate }}</p>
      }
    }
  `,
  styles: [
    `
      .head-actions { display: flex; align-items: flex-end; gap: 12px; }
      .date-fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary); }
      .tabs { display: flex; gap: 4px; margin: 18px 0; border-bottom: 1px solid var(--hairline); }
      .tab { border: none; background: none; padding: 8px 14px; font-size: 14px; font-weight: 550; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; }
      .tab.on { color: var(--text); border-bottom-color: var(--ink); }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
      .stat { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-m); }
      .stat.hi { border-color: var(--hairline-strong); }
      .stat .k { font-size: 12.5px; color: var(--text-tertiary); }
      .stat .v { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .stat .v.neg { color: var(--red); }
      .stat .pct { font-size: 12px; color: var(--text-secondary); }
      .table-wrap { overflow-x: auto; }
      table.fin { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
      table.fin th, table.fin td { padding: 8px 10px; border-bottom: 1px solid var(--hairline); text-align: left; }
      table.fin th { color: var(--text-tertiary); font-weight: 500; font-size: 11.5px; }
      table.fin .num { text-align: right; font-variant-numeric: tabular-nums; }
      table.fin .mono { font-variant-numeric: tabular-nums; color: var(--text-secondary); }
      table.fin .neg { color: var(--red); }
      .pill { display: inline-block; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--fill); font-size: 11px; font-weight: 600; }
      .assumption { margin-top: 12px; font-size: 12px; color: var(--text-tertiary); font-style: italic; }
      .error-card { padding: 14px 16px; border-radius: var(--radius-m); background: rgba(215,0,21,0.08); color: var(--red); }
      .state-card { padding: 32px; color: var(--text-secondary); }
    `,
  ],
})
export class FinanceComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;

  readonly tab = signal<'corrispettivi' | 'margini'>('corrispettivi');
  readonly rows = signal<CorrispettivoRow[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  from = '';
  to = '';

  constructor() {
    this.reload();
  }

  private params(): HttpParams {
    let p = new HttpParams();
    if (this.from) p = p.set('from', this.from);
    if (this.to) p = p.set('to', this.to);
    return p;
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const p = this.params();
    // Carica sempre entrambe le tab: i numeri sono pochi e cosi' passare da
    // Corrispettivi a Margini e' immediato.
    this.http.get<CorrispettivoRow[]>(`${this.api}/finance/corrispettivi`, { params: p }).subscribe({
      next: (d) => {
        this.rows.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'Errore nel caricamento');
        this.loading.set(false);
      },
    });
    this.http.get<Summary>(`${this.api}/finance/summary`, { params: p }).subscribe({
      next: (s) => this.summary.set(s),
      error: () => {},
    });
  }

  euro(v: number): string {
    return `${v.toFixed(2)} €`;
  }

  exportCsv(): void {
    const t = (k: string) => this.translate.instant(k);
    const head = [
      t('finance.c.status'), t('finance.c.delivery'), t('finance.c.date'), t('finance.c.product'),
      t('finance.c.category'), t('finance.c.partner'), t('finance.c.saleValue'), t('finance.c.publicPrice'),
      t('finance.c.partnerPrice'), t('finance.c.feePercent'), t('finance.c.feeValue'), t('finance.c.feeWithVat'),
      t('finance.c.deliveryCost'), t('finance.c.firstMargin'), t('finance.c.firstMarginPercent'),
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = this.rows().map((r) => [
      r.status, `#${r.deliveryCode}`, r.date.slice(0, 10), r.product, r.category ?? '',
      r.partner, r.saleValue.toFixed(2), r.publicPrice.toFixed(2), r.partnerPrice.toFixed(2),
      r.feePercent.toFixed(1), r.feeValue.toFixed(2), r.feeWithVat.toFixed(2),
      r.deliveryCost.toFixed(2), r.firstMargin.toFixed(2), r.firstMarginPercent.toFixed(1),
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `corrispettivi.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
