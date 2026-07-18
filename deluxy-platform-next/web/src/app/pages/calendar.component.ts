import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { DELIVERY_STATUS_LABELS } from '../core/models';

interface CalDay { date: string; total: number; byStatus: Record<string, number> }
interface DeliveryLite {
  id: string;
  code: number;
  status: string;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  recipientFirstName: string;
  recipientLastName: string;
  recipientAddress: string;
  partner?: { insegna: string };
}

interface Cell { ymd: string; day: number; inMonth: boolean; isToday: boolean; count: number }

const STATUS_COLOR: Record<string, string> = {
  created: '#d70015', assigned: '#e6b800', in_preparation: '#ff9500', accepted: '#007aff',
  in_delivery: '#af52de', cancellation_requested: '#5ac8fa', delivered: '#248a3d',
  delivered_time_approved: '#248a3d',
};

/** Calendario mensile delle consegne: ogni giorno con ordini è marcato; il
 *  click apre l'elenco del giorno. Filtrato per ruolo (il partner vede i suoi). */
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'calendar.title' | translate }}</h1>
        <p class="page-caption">{{ 'calendar.caption' | translate }}</p>
      </div>
      <div class="nav">
        <button class="btn btn-secondary" (click)="prevMonth()" aria-label="←">‹</button>
        <span class="month">{{ monthLabel() }}</span>
        <button class="btn btn-secondary" (click)="nextMonth()" aria-label="→">›</button>
        <button class="btn btn-secondary" (click)="goToday()">{{ 'calendar.today' | translate }}</button>
      </div>
    </div>

    <div class="layout">
      <div class="card cal">
        <div class="weekdays">
          @for (w of weekdays; track w) { <div class="wd">{{ 'calendar.wd.' + w | translate }}</div> }
        </div>
        <div class="grid">
          @for (c of cells(); track c.ymd) {
            <button type="button" class="cell" [class.out]="!c.inMonth" [class.today]="c.isToday"
                    [class.has]="c.count > 0" [class.sel]="c.ymd === selected()" (click)="selectDay(c)">
              <span class="dnum">{{ c.day }}</span>
              @if (c.count > 0) { <span class="badge">{{ c.count }}</span> }
            </button>
          }
        </div>
      </div>

      <div class="card day-panel">
        @if (!selected()) {
          <p class="muted">{{ 'calendar.pickDay' | translate }}</p>
        } @else {
          <header class="dp-head">
            <strong>{{ selectedLabel() }}</strong>
            <span class="muted">{{ dayItems().length }} {{ (dayItems().length === 1 ? 'calendar.order' : 'calendar.orders') | translate }}</span>
          </header>
          @if (loadingDay()) { <p class="muted">{{ 'calendar.loading' | translate }}</p> }
          @else if (!dayItems().length) { <p class="muted">{{ 'calendar.noOrders' | translate }}</p> }
          @else {
            <ul class="dlist">
              @for (d of dayItems(); track d.id) {
                <li>
                  <a [routerLink]="['/deliveries', d.id]">
                    <span class="dot" [style.background]="color(d.status)"></span>
                    <span class="dl-main">
                      <span class="dl-top">#{{ d.code }} · {{ statusLabel(d.status) }}</span>
                      <span class="dl-sub">{{ d.recipientLastName }} {{ d.recipientFirstName }} — {{ d.recipientAddress }}</span>
                    </span>
                    <span class="dl-time">{{ d.deliveryTimeFrom ? (d.deliveryTimeFrom + (d.deliveryTimeTo ? '–' + d.deliveryTimeTo : '')) : '' }}</span>
                  </a>
                </li>
              }
            </ul>
          }
        }
      </div>
    </div>
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .nav { display: flex; align-items: center; gap: 8px; }
      .nav .btn { padding: 6px 12px; }
      .month { min-width: 150px; text-align: center; font-weight: 600; font-size: 15px; text-transform: capitalize; }
      .layout { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
      .cal { padding: 16px; }
      .weekdays, .grid { display: grid; grid-template-columns: repeat(7, 1fr); }
      .weekdays { margin-bottom: 8px; }
      .wd { text-align: center; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
      .grid { gap: 6px; }
      .cell { position: relative; aspect-ratio: 1 / 1; border: 1px solid var(--hairline); background: var(--surface); border-radius: 12px; cursor: pointer; font-family: inherit; display: flex; align-items: flex-start; justify-content: flex-start; padding: 8px; transition: background 0.12s var(--ease); }
      .cell:hover { background: var(--fill); }
      .cell.out { opacity: 0.4; }
      .cell.has { border-color: var(--gold); }
      .cell.today { border-color: var(--ink); border-width: 1.5px; }
      .cell.sel { background: var(--gold-soft); border-color: var(--gold-strong); }
      .dnum { font-size: 13px; font-weight: 550; }
      .badge { position: absolute; bottom: 6px; right: 6px; min-width: 20px; height: 20px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; background: var(--ink); color: #fff; border-radius: 980px; font-size: 11.5px; font-weight: 600; }
      .day-panel { padding: 18px 20px; min-height: 200px; }
      .muted { color: var(--text-secondary); font-size: 14px; }
      .dp-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
      .dp-head strong { font-size: 16px; text-transform: capitalize; }
      .dlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .dlist a { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid var(--hairline); border-radius: 12px; text-decoration: none; color: var(--text); }
      .dlist a:hover { background: var(--fill); }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .dl-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .dl-top { font-size: 13px; font-weight: 600; }
      .dl-sub { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dl-time { font-size: 12.5px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
      @media (max-width: 820px) { .layout { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CalendarComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  readonly weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  /** Anno/mese visualizzati (mese 0-based). */
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth());
  /** Conteggi per giorno (YYYY-MM-DD → totale). */
  private readonly counts = signal<Record<string, number>>({});
  readonly selected = signal<string | null>(null);
  readonly dayItems = signal<DeliveryLite[]>([]);
  readonly loadingDay = signal(false);

  private readonly todayYmd = this.ymd(new Date());

  constructor() { this.loadMonth(); }

  monthLabel(): string {
    const lang = this.translate.currentLang() || 'it';
    return new Date(Date.UTC(this.year(), this.month(), 1)).toLocaleDateString(lang, {
      month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  selectedLabel(): string {
    const s = this.selected();
    if (!s) return '';
    const lang = this.translate.currentLang() || 'it';
    return new Date(s + 'T00:00:00Z').toLocaleDateString(lang, {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    });
  }

  /** 42 celle (6 settimane) a partire dal lunedì della settimana del giorno 1. */
  readonly cells = computed<Cell[]>(() => {
    const first = new Date(Date.UTC(this.year(), this.month(), 1));
    const offset = (first.getUTCDay() + 6) % 7; // lunedì = 0
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() - offset);
    const counts = this.counts();
    const cells: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const ymd = this.ymd(d);
      cells.push({
        ymd,
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === this.month(),
        isToday: ymd === this.todayYmd,
        count: counts[ymd] ?? 0,
      });
    }
    return cells;
  });

  prevMonth(): void { this.shift(-1); }
  nextMonth(): void { this.shift(1); }
  goToday(): void {
    const now = new Date();
    this.year.set(now.getFullYear());
    this.month.set(now.getMonth());
    this.loadMonth();
  }

  private shift(delta: number): void {
    let m = this.month() + delta;
    let y = this.year();
    if (m < 0) { m = 11; y--; }
    else if (m > 11) { m = 0; y++; }
    this.month.set(m);
    this.year.set(y);
    this.loadMonth();
  }

  private loadMonth(): void {
    const cells = this.cells();
    const from = cells[0].ymd;
    const to = cells[cells.length - 1].ymd;
    const params = new HttpParams().set('from', from).set('to', to);
    this.http.get<{ days: CalDay[] }>(`${environment.apiUrl}/deliveries/calendar`, { params }).subscribe({
      next: (res) => {
        const map: Record<string, number> = {};
        for (const d of res.days ?? []) map[d.date] = d.total;
        this.counts.set(map);
      },
      error: () => this.counts.set({}),
    });
  }

  selectDay(c: Cell): void {
    if (c.count === 0) { this.selected.set(c.ymd); this.dayItems.set([]); return; }
    this.selected.set(c.ymd);
    this.loadingDay.set(true);
    const params = new HttpParams().set('date', c.ymd).set('pageSize', '100');
    this.http.get<{ items: DeliveryLite[] }>(`${environment.apiUrl}/deliveries`, { params }).subscribe({
      next: (res) => { this.dayItems.set(res.items ?? []); this.loadingDay.set(false); },
      error: () => { this.dayItems.set([]); this.loadingDay.set(false); },
    });
  }

  statusLabel(s: string): string { return DELIVERY_STATUS_LABELS[s] ?? s; }
  color(s: string): string { return STATUS_COLOR[s] ?? '#8a8a8e'; }

  private ymd(d: Date): string { return d.toISOString().slice(0, 10); }
}
