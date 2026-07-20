import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface ServiceDetail {
  id: string;
  name: string;
  pricingModel: string;
  scope?: string;
  notes?: string;
  basePrice?: number | null;
  perPiecePrice?: number | null;
  deliveryPrice?: number | null;
  minHours?: number | null;
  noticeDays?: number | null;
  slotHours?: number | null;
  minOrderTime?: string | null;
  maxOrderTime?: string | null;
  allowFlexibleTime?: boolean;
  hideCustomerInfo?: boolean;
}

/** Dettaglio servizio (sola lettura). */
@Component({
  selector: 'app-service-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/services" class="back">← {{ 'services.title' | translate }}</a>
      @if (service(); as s) {
        <div class="title-row">
          <h1>{{ s.name }}</h1>
          <span class="pill">{{ ('enums.servicePricing.' + s.pricingModel) | translate }}</span>
          <a class="btn btn-secondary edit" [routerLink]="['/services', s.id, 'edit']">{{ 'common.edit' | translate }}</a>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (service(); as s) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'serviceForm.service.title' | translate }}</h2>
            <dl>
              <dt>{{ 'services.col.name' | translate }}</dt><dd>{{ s.name }}</dd>
              <dt>{{ 'services.col.type' | translate }}</dt>
              <dd>{{ ('enums.servicePricing.' + s.pricingModel) | translate }}</dd>
              <dt>{{ 'services.col.scope' | translate }}</dt>
              <dd>{{ ('enums.serviceScope.' + (s.scope || 'partner')) | translate }}</dd>
              <dt>{{ 'serviceForm.service.hideCustomerInfo' | translate }}</dt>
              <dd>{{ (s.hideCustomerInfo ? 'common.yes' : 'common.no') | translate }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'serviceDetail.pricesTitle' | translate }}</h2>
            <dl>
              <dt>{{ 'serviceForm.service.basePrice' | translate }}</dt>
              <dd>{{ s.basePrice != null ? s.basePrice + ' €' : '—' }}</dd>
              <dt>{{ 'serviceForm.service.perPiecePrice' | translate }}</dt>
              <dd>{{ s.perPiecePrice != null ? s.perPiecePrice + ' €' : '—' }}</dd>
              <dt>{{ 'serviceForm.service.deliveryPrice' | translate }}</dt>
              <dd>{{ s.deliveryPrice != null ? s.deliveryPrice + ' €' : '—' }}</dd>
              <dt>{{ 'serviceForm.service.minHours' | translate }}</dt>
              <dd>{{ s.minHours != null ? s.minHours : '—' }}</dd>
            </dl>
          </section>

          <section class="card block span-2">
            <h2>{{ 'serviceForm.setup.title' | translate }}</h2>
            <dl class="cols">
              <dt>{{ 'serviceForm.setup.noticeDays' | translate }}</dt>
              <dd>{{ s.noticeDays != null ? s.noticeDays : '—' }}</dd>
              <dt>{{ 'serviceForm.setup.slotHours' | translate }}</dt>
              <dd>{{ s.slotHours != null ? s.slotHours + ' h' : '—' }}</dd>
              <dt>{{ 'serviceForm.setup.minOrderTime' | translate }}</dt>
              <dd>{{ s.minOrderTime || '—' }}</dd>
              <dt>{{ 'serviceForm.setup.maxOrderTime' | translate }}</dt>
              <dd>{{ s.maxOrderTime || '—' }}</dd>
              <dt>{{ 'serviceForm.setup.allowFlexibleTime' | translate }}</dt>
              <dd>{{ (s.allowFlexibleTime ? 'common.yes' : 'common.no') | translate }}</dd>
            </dl>
          </section>

          @if (s.notes) {
            <section class="card block span-2">
              <h2>{{ 'serviceForm.service.notes' | translate }}</h2>
              <p class="notes">{{ s.notes }}</p>
            </section>
          }
        </div>
      }
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
      dl { display: grid; grid-template-columns: minmax(120px, 46%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dl.cols { grid-template-columns: minmax(120px, 26%) 1fr; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .notes { margin: 0; font-size: 13.5px; white-space: pre-wrap; }
      .pill { border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ServiceDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly service = signal<ServiceDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<ServiceDetail>(`${environment.apiUrl}/service-types/${id}`).subscribe({
      next: (s) => { this.service.set(s); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('serviceDetail.loadError'));
      },
    });
  }
}
