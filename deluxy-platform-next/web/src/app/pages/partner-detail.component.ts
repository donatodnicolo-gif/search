import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { DeliveryRuleFormComponent } from './delivery-rule-form.component';

interface PartnerDetail {
  id: string;
  insegna: string;
  email: string;
  businessName?: string;
  vatNumber?: string;
  fiscalCode?: string;
  address?: string;
  phone?: string;
  contactName?: string;
  contactSurname?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  active: boolean;
  isWarehouse?: boolean;
  storeUrl?: string;
  notes?: string;
  bankAccount?: string;
  sdiCode?: string;
  certifiedEmail?: string;
  invoiceEmail?: string;
  provinces?: { province: { id: string; code: string; name: string } }[];
  categories?: { category: { id: string; name: string } }[];
  services?: { serviceType?: { id: string; name?: string }; price?: number }[];
  openingHours?: { dayOfWeek: number; openTime?: string | null; closeTime?: string | null; closed?: boolean }[];
}

interface CarnetRule {
  id: string;
  name: string;
  dailyRule: boolean;
  dailyCount: number;
  totalRule: boolean;
  totalCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  serviceType: { id: string; name: string } | null;
  usage: {
    totalUsed: number | null;
    totalRemaining: number | null;
    dailyUsedToday: number | null;
    dailyRemainingToday: number | null;
  };
}

/** Giorni in ordine lun→dom con la loro chiave i18n (dayOfWeek DB: 0=dom…6=sab). */
const WEEK_DAYS: { dayOfWeek: number; key: string }[] = [
  { dayOfWeek: 1, key: 'mon' },
  { dayOfWeek: 2, key: 'tue' },
  { dayOfWeek: 3, key: 'wed' },
  { dayOfWeek: 4, key: 'thu' },
  { dayOfWeek: 5, key: 'fri' },
  { dayOfWeek: 6, key: 'sat' },
  { dayOfWeek: 0, key: 'sun' },
];

/** Dettaglio partner (sola lettura). */
@Component({
  selector: 'app-partner-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe, DeliveryRuleFormComponent],
  template: `
    <div class="form-head">
      <a routerLink="/partners" class="back">← {{ 'partners.title' | translate }}</a>
      @if (partner(); as p) {
        <div class="title-row">
          <h1>{{ p.insegna }}</h1>
          <span class="pill" [class.on]="p.active">
            {{ (p.active ? 'common.active' : 'common.inactive') | translate }}
          </span>
          @if (canSeeCalendar()) {
            <a class="btn btn-secondary edit" [routerLink]="['/calendar']" [queryParams]="{ partnerId: p.id }">{{ 'nav.calendario' | translate }}</a>
          }
          @if (canEdit()) {
            <a class="btn btn-secondary edit" [routerLink]="['/partners', p.id, 'edit']">{{ 'common.edit' | translate }}</a>
          }
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (partner(); as p) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'partnerForm.general.title' | translate }}</h2>
            <dl>
              <dt>{{ 'partners.col.email' | translate }}</dt><dd>{{ p.email }}</dd>
              <dt>{{ 'partnerForm.general.businessName' | translate }}</dt><dd>{{ p.businessName || '—' }}</dd>
              <dt>{{ 'partners.col.phone' | translate }}</dt><dd>{{ p.phone || '—' }}</dd>
              <dt>{{ 'partnerForm.general.vatNumber' | translate }}</dt><dd>{{ p.vatNumber || '—' }}</dd>
              <dt>{{ 'partnerForm.general.fiscalCode' | translate }}</dt><dd>{{ p.fiscalCode || '—' }}</dd>
              <dt>{{ 'partnerForm.general.address' | translate }}</dt><dd>{{ p.address || '—' }}</dd>
              <dt>{{ 'partnerForm.general.contactName' | translate }}</dt>
              <dd>{{ (p.contactName || p.contactSurname) ? (p.contactName + ' ' + (p.contactSurname || '')) : '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.payments.title' | translate }}</h2>
            <dl>
              <dt>{{ 'partnerForm.payments.paymentMethod' | translate }}</dt>
              <dd>{{ p.paymentMethod ? ('enums.paymentMethod.' + p.paymentMethod | translate) : '—' }}</dd>
              <dt>{{ 'partnerForm.payments.paymentStatus' | translate }}</dt>
              <dd>{{ p.paymentStatus ? ('enums.paymentStatus.' + p.paymentStatus | translate) : '—' }}</dd>
              <dt>{{ 'partnerForm.payments.bankAccount' | translate }}</dt><dd>{{ p.bankAccount || '—' }}</dd>
              <dt>{{ 'partnerForm.payments.sdiCode' | translate }}</dt><dd>{{ p.sdiCode || '—' }}</dd>
              <dt>{{ 'partnerForm.payments.certifiedEmail' | translate }}</dt><dd>{{ p.certifiedEmail || '—' }}</dd>
              <dt>{{ 'partnerForm.payments.invoiceEmail' | translate }}</dt><dd>{{ p.invoiceEmail || '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.provinces.title' | translate }}</h2>
            @if (p.provinces?.length) {
              <div class="chips">
                @for (pp of p.provinces; track pp.province.id) {
                  <span class="chip">{{ pp.province.code }} · {{ pp.province.name }}</span>
                }
              </div>
            } @else { <p class="muted">{{ 'partnerForm.provinces.empty' | translate }}</p> }
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.categories.title' | translate }}</h2>
            @if (p.categories?.length) {
              <div class="chips">
                @for (c of p.categories; track c.category.id) { <span class="chip">{{ c.category.name }}</span> }
              </div>
            } @else { <p class="muted">{{ 'partnerForm.categories.empty' | translate }}</p> }
          </section>

          <section class="card block">
            <h2>{{ 'partnerForm.openingHours.title' | translate }}</h2>
            @if (weekHours(p).length) {
              <div class="hours">
                @for (h of weekHours(p); track h.key) {
                  <div class="hours-row">
                    <span class="hours-day">{{ 'partnerForm.openingHours.days.' + h.key | translate }}</span>
                    @if (h.closed) { <span class="hours-closed">{{ 'partnerForm.openingHours.closed' | translate }}</span> }
                    @else { <span class="hours-time">{{ h.openTime }}<span class="sep">–</span>{{ h.closeTime }}</span> }
                  </div>
                }
              </div>
            } @else { <p class="muted">{{ 'partnerForm.openingHours.emptyDetail' | translate }}</p> }
          </section>

          <section class="card block span-2">
            <h2>{{ 'partnerForm.services.title' | translate }}</h2>
            @if (p.services?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'services.col.name' | translate }}</th>
                  <th class="num">{{ 'deliveryDetail.price' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (s of p.services; track $index) {
                    <tr>
                      <td>{{ s.serviceType?.name || '—' }}</td>
                      <td class="num">{{ s.price != null ? s.price + ' €' : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'partnerForm.services.empty' | translate }}</p> }
          </section>

          <section class="card block span-2">
            <div class="sec-head">
              <h2>{{ 'deliveryRules.title' | translate }}</h2>
              @if (canEditRules()) {
                <button class="btn btn-secondary sm" (click)="addRule(p.id)">+ {{ 'deliveryRules.add' | translate }}</button>
              }
            </div>
            @if (carnetRules().length) {
              <div class="carnet-grid">
                @for (r of carnetRules(); track r.id) {
                  <div class="carnet">
                    <div class="carnet-head">
                      <span class="carnet-name">{{ r.name }}</span>
                      @if (r.serviceType) { <span class="chip">{{ r.serviceType.name }}</span> }
                      @if (canEditRules()) {
                        <button class="btn-icon" (click)="editRule(r.id, p.id)" [title]="'common.edit' | translate">✎</button>
                      }
                    </div>
                    <div class="carnet-body">
                      @if (r.totalRule) {
                        <div class="gauge">
                          <div class="gauge-top">
                            <span class="muted">{{ 'partnerDetail.carnet.remaining' | translate }}</span>
                            <span class="big" [class.zero]="r.usage.totalRemaining === 0">{{ r.usage.totalRemaining }}</span>
                            <span class="muted">/ {{ r.totalCount }}</span>
                          </div>
                          <div class="bar"><span class="bar-fill" [style.width.%]="pct(r.usage.totalRemaining, r.totalCount)"></span></div>
                          <span class="sub muted">{{ 'partnerDetail.carnet.used' | translate }}: {{ r.usage.totalUsed }}{{ periodLabel(r) }}</span>
                        </div>
                      }
                      @if (r.dailyRule) {
                        <div class="daily">
                          <span class="muted">{{ 'partnerDetail.carnet.today' | translate }}</span>
                          <span class="big sm" [class.zero]="r.usage.dailyRemainingToday === 0">{{ r.usage.dailyRemainingToday }}</span>
                          <span class="muted">/ {{ r.dailyCount }} {{ 'partnerDetail.carnet.perDay' | translate }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="muted">{{ 'partnerDetail.carnet.none' | translate }}</p>
            }
          </section>

          @if (p.notes) {
            <section class="card block span-2">
              <h2>{{ 'partnerForm.sales.notes' | translate }}</h2>
              <p class="notes">{{ p.notes }}</p>
            </section>
          }
        </div>
      }
    }

    @if (ruleFormOpen()) {
      <app-delivery-rule-form
        [ruleId]="editRuleId()"
        [lockPartnerId]="lockPartnerId()"
        (saved)="onRuleSaved()"
        (closed)="ruleFormOpen.set(false)"
      />
    }
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .edit { margin-left: auto; text-decoration: none; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      .notes { margin: 0; font-size: 13.5px; white-space: pre-wrap; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .hours { display: flex; flex-direction: column; gap: 6px; }
      .hours-row { display: flex; align-items: baseline; gap: 12px; font-size: 14px; }
      .hours-day { width: 92px; color: var(--text-secondary); font-weight: 550; }
      .hours-time { font-variant-numeric: tabular-nums; }
      .hours-time .sep { margin: 0 4px; color: var(--text-tertiary); }
      .hours-closed { color: var(--text-tertiary); font-style: italic; }
      .chip { border: 1px solid var(--hairline-strong); border-radius: 980px; padding: 4px 12px; font-size: 12.5px; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .pill { border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill.on { background: rgba(36,138,61,0.12); color: var(--green); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      .carnet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
      .carnet { border: 1px solid var(--hairline); border-radius: var(--radius-m); padding: 14px 16px; }
      .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .sec-head h2 { margin: 0; }
      .btn.sm { padding: 5px 12px; font-size: 13px; }
      .btn-icon { border: none; background: none; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: var(--radius-s); color: var(--text-secondary); margin-left: auto; }
      .btn-icon:hover { background: var(--fill); color: var(--text); }
      .carnet-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .carnet-name { font-weight: 600; font-size: 14px; }
      .carnet-body { display: flex; flex-direction: column; gap: 12px; }
      .gauge-top { display: flex; align-items: baseline; gap: 6px; }
      .big { font-size: 26px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .big.sm { font-size: 20px; }
      .big.zero { color: var(--red); }
      .bar { height: 6px; border-radius: 980px; background: var(--fill); overflow: hidden; margin: 6px 0 4px; }
      .bar-fill { display: block; height: 100%; background: var(--green); border-radius: 980px; }
      .sub { font-size: 12px; }
      .daily { display: flex; align-items: baseline; gap: 6px; }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class PartnerDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly partner = signal<PartnerDetail | null>(null);
  readonly carnetRules = signal<CarnetRule[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  // Modale regola carnet (crea/modifica) da questa scheda.
  readonly ruleFormOpen = signal(false);
  readonly editRuleId = signal<string | null>(null);
  readonly lockPartnerId = signal<string | null>(null);

  /** Solo chi puo' gestire le regole (l'API le limita ad ADMIN/OPERATION/PM). */
  canEditRules(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  addRule(partnerId: string): void {
    this.editRuleId.set(null);
    this.lockPartnerId.set(partnerId);
    this.ruleFormOpen.set(true);
  }

  editRule(ruleId: string, partnerId: string): void {
    this.editRuleId.set(ruleId);
    this.lockPartnerId.set(partnerId);
    this.ruleFormOpen.set(true);
  }

  onRuleSaved(): void {
    this.ruleFormOpen.set(false);
    const id = this.partner()?.id;
    if (id) this.loadCarnet(id);
  }

  private loadCarnet(id: string): void {
    this.http.get<CarnetRule[]>(`${environment.apiUrl}/delivery-rules/partner/${id}`).subscribe({
      next: (rules) => this.carnetRules.set(rules),
      error: () => {},
    });
  }

  /** Percentuale della barra = quota rimasta sul totale. */
  pct(remaining: number | null, total: number): number {
    if (!total || remaining === null) return 0;
    return Math.round((remaining / total) * 100);
  }

  /** " nel periodo dd/mm–dd/mm" se la regola ha un periodo, altrimenti "". */
  periodLabel(r: CarnetRule): string {
    if (!r.periodStart && !r.periodEnd) return '';
    const f = (d: string | null) => (d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '…');
    return ` (${f(r.periodStart)}–${f(r.periodEnd)})`;
  }

  /** Modifica partner: admin, operation, project manager e il partner stesso. */
  canEdit(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER' || r === 'PARTNER';
  }

  /** Calendario del partner: admin/operation (vedono le consegne di ogni partner). */
  canSeeCalendar(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  /** Orari settimanali ordinati lun→dom, solo i giorni impostati (chiusi o con orario). */
  weekHours(p: PartnerDetail): { key: string; closed: boolean; openTime: string; closeTime: string }[] {
    const byDay = new Map((p.openingHours ?? []).map((h) => [h.dayOfWeek, h]));
    return WEEK_DAYS.flatMap((d) => {
      const h = byDay.get(d.dayOfWeek);
      if (!h || (!h.closed && !h.openTime && !h.closeTime)) return [];
      return [{ key: d.key, closed: !!h.closed, openTime: h.openTime ?? '', closeTime: h.closeTime ?? '' }];
    });
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<PartnerDetail>(`${environment.apiUrl}/partners/${id}`).subscribe({
      next: (p) => { this.partner.set(p); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Errore nel caricamento del partner');
      },
    });
    // Regole carnet del partner con le consegne rimaste (best-effort: se
    // fallisce, la scheda partner si carica lo stesso senza la sezione).
    if (id) this.loadCarnet(id);
  }
}
