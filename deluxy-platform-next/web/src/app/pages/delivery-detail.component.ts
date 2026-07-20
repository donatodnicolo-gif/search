import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { Province, ValetRef } from '../core/models';
import { detectProvince } from '../core/province.util';

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
  latitude?: number;
  longitude?: number;
  trackingToken?: string;
  receivedBy?: string;
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
        <!-- Azioni in alto (come app.deluxy.it): Stampa · Maps · Share · Delivered link · Assegna -->
        <div class="actions-bar">
          <button type="button" class="act" (click)="print()">{{ 'deliveryDetail.act.print' | translate }}</button>
          <button type="button" class="act" [disabled]="!mapsUrl(d)" (click)="openMaps(d)">{{ 'deliveryDetail.act.maps' | translate }}</button>
          @if (canManage()) {
            <button type="button" class="act" (click)="share(d)">{{ 'deliveryDetail.act.share' | translate }}</button>
            <button type="button" class="act" (click)="deliveredLink(d)">{{ 'deliveryDetail.act.deliveredLink' | translate }}</button>
            <button type="button" class="act primary" (click)="openAssign()">{{ 'deliveryDetail.act.assign' | translate }}</button>
          }
        </div>
      }
    </div>

    @if (banner(); as b) { <div class="toast">{{ b }}</div> }
    @if (actionError()) { <div class="toast err">{{ actionError() }}</div> }

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

    @if (assignOpen()) {
      <div class="overlay" (click)="assignOpen.set(false)"></div>
      <div class="dialog card">
        <h2>{{ 'deliveries.assign.title' | translate }}</h2>
        @if (delivery(); as d) {
          <p class="muted">{{ 'deliveries.assign.forDelivery' | translate: { code: d.code } }}
            @if (assignProvince(); as p) { <span class="tag">{{ p.name }}</span> }
            @else { <span class="tag warn">{{ 'deliveries.assign.noProvince' | translate }}</span> }
          </p>
        }
        @if (assignValets().length === 0) {
          <p class="muted">{{ 'deliveries.assign.noValets' | translate }}</p>
        } @else {
          <ul class="valet-list">
            @for (v of assignValets(); track v.id) {
              <li>
                <span>{{ v.lastName }} {{ v.firstName }}</span>
                <button type="button" class="act primary" [disabled]="busy()" (click)="assign(v.id)">{{ 'deliveries.assign.choose' | translate }}</button>
              </li>
            }
          </ul>
        }
        <div class="dialog-foot">
          <button type="button" class="act" (click)="assignOpen.set(false)">{{ 'common.cancel' | translate }}</button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .actions-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
      .act { appearance: none; font: inherit; font-size: 13px; font-weight: 550; padding: 7px 16px; border-radius: 980px; border: 1px solid var(--hairline); background: var(--surface); color: var(--text); cursor: pointer; }
      .act:hover { background: var(--fill); }
      .act:disabled { opacity: 0.45; cursor: default; }
      .act.primary { background: var(--ink, #1d1d1f); color: #fff; border-color: transparent; }
      .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink, #1d1d1f); color: #fff; padding: 10px 20px; border-radius: 980px; font-size: 13.5px; z-index: 60; box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
      .toast.err { background: var(--red); }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.28); z-index: 50; }
      .dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 51; width: min(440px, 92vw); padding: 24px 26px; }
      .dialog h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
      .tag { margin-left: 6px; font-size: 11px; background: rgba(0,113,227,0.1); color: var(--blue); border-radius: 980px; padding: 2px 8px; }
      .tag.warn { background: rgba(215,0,21,0.08); color: var(--red); }
      .valet-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
      .valet-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--hairline); font-size: 14px; }
      .dialog-foot { display: flex; justify-content: flex-end; margin-top: 16px; }
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
  private readonly translate = inject(TranslateService);

  readonly delivery = signal<DeliveryDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly banner = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly assignOpen = signal(false);
  readonly provinces = signal<Province[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  private id = '';

  /** Provincia dedotta dall'indirizzo del destinatario. */
  readonly assignProvince = computed(() => {
    const d = this.delivery();
    return d ? detectProvince(d.recipientAddress, this.provinces()) : null;
  });
  /** Solo i valet che hanno abilitata quella provincia. */
  readonly assignValets = computed(() => {
    const prov = this.assignProvince();
    if (!prov) return this.valets();
    return this.valets().filter((v) => (v.provinces ?? []).some((p) => p.province?.code === prov.code));
  });

  /** Il partner non vede note interne né i costi. */
  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  /** Storico/log e azioni gestionali: solo admin e operation. */
  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }
  canSeeLogs(): boolean { return this.canManage(); }

  constructor() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
    if (this.canManage()) {
      this.http.get<Province[]>(`${environment.apiUrl}/provinces`).subscribe((p) => this.provinces.set(p));
      this.http.get<ValetRef[]>(`${environment.apiUrl}/valets`).subscribe((v) => this.valets.set(v));
    }
  }

  private load(): void {
    this.http.get<DeliveryDetail>(`${environment.apiUrl}/deliveries/${this.id}`).subscribe({
      next: (d) => { this.delivery.set(d); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Errore nel caricamento della consegna');
      },
    });
  }

  // ---- STAMPA ----
  print(): void { window.print(); }

  // ---- MAPS ----
  mapsUrl(d: DeliveryDetail): string | null {
    if (d.latitude != null && d.longitude != null) {
      return `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`;
    }
    if (d.recipientAddress) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.recipientAddress)}`;
    }
    return null;
  }
  openMaps(d: DeliveryDetail): void {
    const url = this.mapsUrl(d);
    if (url) window.open(url, '_blank');
  }

  // ---- SHARE: link pubblico di monitoraggio ----
  share(d: DeliveryDetail): void {
    this.actionError.set(null);
    this.http.get<{ token: string }>(`${environment.apiUrl}/deliveries/${d.id}/tracking-link`).subscribe({
      next: (r) => this.copy(`${location.origin}/tracking/${r.token}`, this.translate.instant('deliveryDetail.act.shareCopied')),
      error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
    });
  }

  // ---- DELIVERED LINK: link pubblico di conferma consegna ----
  deliveredLink(d: DeliveryDetail): void {
    this.actionError.set(null);
    this.http.get<{ token: string }>(`${environment.apiUrl}/deliveries/${d.id}/tracking-link`).subscribe({
      next: (r) => this.copy(`${location.origin}/consegnata/${r.token}`, this.translate.instant('deliveryDetail.act.deliveredCopied')),
      error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
    });
  }

  // ---- ASSEGNA ----
  openAssign(): void { this.actionError.set(null); this.assignOpen.set(true); }
  assign(valetId: string): void {
    this.busy.set(true);
    this.http.patch(`${environment.apiUrl}/deliveries/${this.id}/assign`, { valetId }).subscribe({
      next: () => { this.busy.set(false); this.assignOpen.set(false); this.load(); },
      error: (err) => { this.busy.set(false); this.actionError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  private copy(text: string, msg: string): void {
    navigator.clipboard?.writeText(text).then(
      () => { this.banner.set(msg); setTimeout(() => this.banner.set(null), 2500); },
      () => { window.prompt(msg, text); },
    );
  }
}
