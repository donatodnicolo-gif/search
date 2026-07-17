import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface DeliveryLog { id: string; type: string; message: string; createdAt: string; }
interface DeliveryProductRow {
  id: string;
  quantity: number;
  price?: number;
  flexiblePrice: boolean;
  product?: { id: string; name: string; price?: number };
}

/** Dettaglio consegna (sola lettura), sezioni come l'app reale. */
interface DeliveryDetail {
  id: string;
  code: number;
  date: string;
  status: string;
  paymentStatus: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  deliveryFlexible?: boolean;
  pickupTimeFrom?: string;
  pickupTimeTo?: string;
  pickupFlexible?: boolean;
  pickupAddress?: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientAddress: string;
  recipientIntercom?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  senderFirstName?: string;
  senderLastName?: string;
  senderPhone?: string;
  paymentOnDelivery: boolean;
  paymentAmount?: number;
  tryAndReturn?: boolean;
  deliveryCodeRequired?: boolean;
  notes?: string;
  internalNotes?: string;
  ddtNumber?: string;
  ddtFile?: string;
  personalizeSaleNotes?: string;
  deluxyDelivery?: boolean;
  price?: number;
  additionalPrice?: number;
  valetSalary?: number;
  valetAdditionalPrice?: number;
  distanceKm?: number;
  partner?: { id: string; insegna: string };
  valet?: { id: string; firstName: string; lastName: string } | null;
  serviceType?: { id: string; name: string; pricingModel: string };
  products?: DeliveryProductRow[];
  logs?: DeliveryLog[];
}

@Component({
  selector: 'app-delivery-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/deliveries" class="back">← {{ 'deliveries.title' | translate }}</a>
      @if (delivery(); as d) {
        <div class="title-row">
          <h1>{{ 'deliveryDetail.title' | translate: { code: d.code } }}</h1>
          <span class="pill" [class]="'pill s-' + d.status">
            <span class="dot" [class]="'dot s-' + d.status"></span>{{ 'status.delivery.' + d.status | translate }}
          </span>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card error">{{ error() }}</div>
    } @else {
      @if (delivery(); as d) {
      <div class="grid">
        <!-- Dati di consegna e ritiro -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.timing' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveries.col.date' | translate }}</dt><dd>{{ d.date | date: 'dd/MM/yyyy' }}</dd>
            <dt>{{ 'deliveries.col.delivery' | translate }}</dt>
            <dd>{{ d.deliveryTimeFrom ? (d.deliveryTimeFrom + (d.deliveryTimeTo ? '–' + d.deliveryTimeTo : '')) : '—' }}
              @if (d.deliveryFlexible) { <span class="tag">{{ 'common.flexible' | translate }}</span> }</dd>
            <dt>{{ 'deliveries.col.pickup' | translate }}</dt>
            <dd>{{ d.pickupTimeFrom ? (d.pickupTimeFrom + (d.pickupTimeTo ? '–' + d.pickupTimeTo : '')) : '—' }}
              @if (d.pickupFlexible) { <span class="tag">{{ 'common.flexible' | translate }}</span> }</dd>
            <dt>{{ 'deliveryDetail.pickupAddress' | translate }}</dt><dd>{{ d.pickupAddress || '—' }}</dd>
            <dt>{{ 'deliveries.col.valet' | translate }}</dt>
            <dd>{{ d.valet ? (d.valet.firstName + ' ' + d.valet.lastName) : ('common.notAssigned' | translate) }}</dd>
          </dl>
        </section>

        <!-- Scelta del servizio -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.service' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveries.col.partner' | translate }}</dt><dd>{{ d.partner?.insegna || '—' }}</dd>
            <dt>{{ 'deliveries.col.service' | translate }}</dt><dd>{{ d.serviceType?.name || '—' }}</dd>
            <dt>{{ 'deliveryDetail.pricingModel' | translate }}</dt>
            <dd>{{ d.serviceType ? ('enums.servicePricing.' + d.serviceType.pricingModel | translate) : '—' }}</dd>
            @if (d.distanceKm != null) {
              <dt>{{ 'deliveryDetail.distance' | translate }}</dt><dd>{{ d.distanceKm }} km</dd>
            }
            <!-- Costi: nascosti al partner -->
            @if (!isPartner()) {
              <dt>{{ 'deliveryDetail.price' | translate }}</dt><dd>{{ d.price != null ? d.price + ' €' : '—' }}</dd>
              <dt>{{ 'deliveryDetail.additionalPrice' | translate }}</dt><dd>{{ d.additionalPrice != null ? d.additionalPrice + ' €' : '—' }}</dd>
              <dt>{{ 'deliveryDetail.valetSalary' | translate }}</dt><dd>{{ d.valetSalary != null ? d.valetSalary + ' €' : '—' }}</dd>
            }
          </dl>
        </section>

        <!-- Destinatario e mittente -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.people' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveries.col.recipient' | translate }}</dt><dd>{{ d.recipientFirstName }} {{ d.recipientLastName }}</dd>
            <dt>{{ 'deliveries.col.address' | translate }}</dt><dd>{{ d.recipientAddress }}</dd>
            <dt>{{ 'deliveryDetail.intercom' | translate }}</dt><dd>{{ d.recipientIntercom || '—' }}</dd>
            <dt>{{ 'deliveryDetail.phone' | translate }}</dt><dd>{{ d.recipientPhone || '—' }}</dd>
            <dt>{{ 'deliveryDetail.email' | translate }}</dt><dd>{{ d.recipientEmail || '—' }}</dd>
            <dt>{{ 'deliveryDetail.sender' | translate }}</dt>
            <dd>{{ (d.senderFirstName || d.senderLastName) ? (d.senderFirstName + ' ' + d.senderLastName) : '—' }}
              {{ d.senderPhone ? '· ' + d.senderPhone : '' }}</dd>
          </dl>
        </section>

        <!-- Gestione dell'ordine -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.order' | translate }}</h2>
          @if (d.products?.length) {
            <table class="mini">
              <thead><tr>
                <th>{{ 'deliveryDetail.product' | translate }}</th>
                <th class="num">{{ 'deliveryDetail.qty' | translate }}</th>
                @if (!isPartner()) { <th class="num">{{ 'deliveryDetail.price' | translate }}</th> }
              </tr></thead>
              <tbody>
                @for (p of d.products; track p.id) {
                  <tr>
                    <td>{{ p.product?.name }}</td>
                    <td class="num">{{ p.quantity }}</td>
                    @if (!isPartner()) {
                      <td class="num">{{ (p.price ?? p.product?.price) != null ? ((p.price ?? p.product?.price) + ' €') : '—' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          } @else { <p class="muted">{{ 'deliveryDetail.noProducts' | translate }}</p> }
          <dl class="mt">
            <dt>{{ 'deliveryDetail.paymentOnDelivery' | translate }}</dt>
            <dd>{{ (d.paymentOnDelivery ? 'common.yes' : 'common.no') | translate }}
              {{ d.paymentOnDelivery && d.paymentAmount != null ? '· ' + d.paymentAmount + ' €' : '' }}</dd>
            <dt>{{ 'deliveryDetail.tryAndReturn' | translate }}</dt><dd>{{ (d.tryAndReturn ? 'common.yes' : 'common.no') | translate }}</dd>
            <dt>{{ 'deliveryDetail.paymentStatus' | translate }}</dt><dd>{{ 'enums.deliveryPaymentStatus.' + d.paymentStatus | translate }}</dd>
          </dl>
        </section>

        <!-- Documentazione e note -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.docs' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveryDetail.ddtNumber' | translate }}</dt><dd>{{ d.ddtNumber || '—' }}</dd>
            <dt>{{ 'deliveryDetail.ddtFile' | translate }}</dt>
            <dd>@if (d.ddtFile) { <a [href]="d.ddtFile" target="_blank" rel="noopener">{{ d.ddtFile }}</a> } @else { — }</dd>
            <dt>{{ 'deliveryDetail.notes' | translate }}</dt><dd>{{ d.notes || '—' }}</dd>
            <dt>{{ 'deliveryDetail.personalization' | translate }}</dt><dd>{{ d.personalizeSaleNotes || '—' }}</dd>
            <!-- Note interne: mai visibili al partner -->
            @if (!isPartner()) {
              <dt>{{ 'deliveryDetail.internalNotes' | translate }}</dt><dd>{{ d.internalNotes || '—' }}</dd>
            }
          </dl>
        </section>

        <!-- Storico consegna: solo admin/operation -->
        @if (canSeeLogs()) {
          <section class="card block span-2">
            <h2>{{ 'deliveryDetail.section.history' | translate }}</h2>
            @if (d.logs?.length) {
              <ul class="logs">
                @for (l of d.logs; track l.id) {
                  <li>
                    <span class="log-date">{{ l.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                    <span class="log-msg">{{ l.message }}</span>
                  </li>
                }
              </ul>
            } @else { <p class="muted">{{ 'deliveryDetail.noLogs' | translate }}</p> }
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
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; color: var(--text); }
      .mt { margin-top: 14px; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      .tag { margin-left: 6px; font-size: 11px; background: rgba(0,113,227,0.1); color: var(--blue); border-radius: 980px; padding: 2px 8px; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .logs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .logs li { display: flex; gap: 12px; font-size: 13px; }
      .log-date { color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
      .dot.s-created { background: var(--red); }
      .dot.s-assigned { background: #e6b800; }
      .dot.s-in_preparation { background: #ff9500; }
      .dot.s-accepted { background: var(--blue); }
      .dot.s-in_delivery { background: var(--purple); }
      .dot.s-cancellation_requested { background: #5ac8fa; }
      .dot.s-delivered, .dot.s-delivered_time_approved { background: var(--green); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.error { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DeliveryDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly delivery = signal<DeliveryDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Il partner non vede note interne né i costi. */
  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  /** Storico/log: solo admin e operation. */
  canSeeLogs(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<DeliveryDetail>(`${environment.apiUrl}/deliveries/${id}`).subscribe({
      next: (d) => { this.delivery.set(d); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Errore nel caricamento della consegna');
      },
    });
  }
}
