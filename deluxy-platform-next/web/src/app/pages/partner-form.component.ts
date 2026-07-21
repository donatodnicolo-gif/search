import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import {
  Category,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  Province,
  ServiceType,
} from '../core/models';

interface ServiceRow {
  serviceTypeId: string;
  price: number | null;
  includedKm: number | null;
  extraKmPrice: number | null;
  extraOutOfCityPrice: number | null;
}

interface OpeningHourRow {
  dayOfWeek: number; // 0=domenica … 6=sabato (convenzione DB)
  key: string; // chiave i18n del giorno
  closed: boolean;
  openTime: string;
  closeTime: string;
}

/** Giorni in ordine di visualizzazione (lunedì→domenica), con il dayOfWeek del DB. */
const WEEK_DAYS: { dayOfWeek: number; key: string }[] = [
  { dayOfWeek: 1, key: 'mon' },
  { dayOfWeek: 2, key: 'tue' },
  { dayOfWeek: 3, key: 'wed' },
  { dayOfWeek: 4, key: 'thu' },
  { dayOfWeek: 5, key: 'fri' },
  { dayOfWeek: 6, key: 'sat' },
  { dayOfWeek: 0, key: 'sun' },
];

@Component({
  selector: 'app-partner-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/partners" class="back">← {{ 'partnerForm.backToPartners' | translate }}</a>
        <h1>{{ (editId() ? 'partnerForm.editTitle' : 'partnerForm.title') | translate }}</h1>
        <p class="page-caption">
          {{ 'partnerForm.caption' | translate }}
        </p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- Informazioni generali -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.general.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.general.requiredNote' | translate }}</span>
        </header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'partnerForm.general.insegna' | translate }}</span>
            <input class="field" name="insegna" [(ngModel)]="model.insegna" required [attr.placeholder]="'partnerForm.general.insegnaPlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.email' | translate }}</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" required [attr.placeholder]="'partnerForm.general.emailPlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.businessName' | translate }}</span>
            <input class="field" name="businessName" [(ngModel)]="model.businessName" [attr.placeholder]="'partnerForm.general.businessNamePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.phone' | translate }}</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" placeholder="+39 …" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.vatNumber' | translate }}</span>
            <input class="field" name="vatNumber" [(ngModel)]="model.vatNumber" placeholder="IT01234567890" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.fiscalCode' | translate }}</span>
            <input class="field" name="fiscalCode" [(ngModel)]="model.fiscalCode" /></label>
          <label class="fld span-2"><span>{{ 'partnerForm.general.address' | translate }}</span>
            <input class="field" name="address" [(ngModel)]="model.address" [attr.placeholder]="'partnerForm.general.addressPlaceholder' | translate" /></label>
        </div>

        <!-- Ritiro multiplo, sotto l'indirizzo principale -->
        <label class="toggle mt"><input type="checkbox" name="isMultiPickup" [(ngModel)]="model.isMultiPickup" /><span>{{ 'partnerForm.general.multiPickup' | translate }}</span></label>
        @if (model.isMultiPickup) {
          <div class="pickup-list">
            <span class="pickup-hint">{{ 'partnerForm.general.pickupHint' | translate }}</span>
            @for (addr of pickupAddresses; track $index) {
              <div class="pickup-row">
                <input class="field" [(ngModel)]="pickupAddresses[$index]" [name]="'pickup' + $index" [attr.placeholder]="'partnerForm.general.addressPlaceholder' | translate" />
                <button type="button" class="icon-btn" (click)="removePickup($index)" [title]="'partnerForm.general.remove' | translate">✕</button>
              </div>
            }
            <button type="button" class="btn btn-secondary add" (click)="addPickup()">+ {{ 'partnerForm.general.addPickup' | translate }}</button>
          </div>
        }

        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'partnerForm.general.contactName' | translate }}</span>
            <input class="field" name="contactName" [(ngModel)]="model.contactName" [attr.placeholder]="'partnerForm.general.contactNamePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.contactSurname' | translate }}</span>
            <input class="field" name="contactSurname" [(ngModel)]="model.contactSurname" [attr.placeholder]="'partnerForm.general.contactSurnamePlaceholder' | translate" /></label>
        </div>
      </section>

      <!-- Province servite -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.provinces.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.provinces.subtitle' | translate }}</span>
        </header>
        @if (provinces().length === 0) { <p class="muted">{{ 'partnerForm.provinces.empty' | translate }}</p> }
        @else {
          <div class="chips">
            @for (p of provinces(); track p.id) {
              <button type="button" class="chip" [class.on]="selectedProvinces.has(p.id)" (click)="toggle(selectedProvinces, p.id)">{{ p.code }} · {{ p.name }}</button>
            }
          </div>
        }
      </section>

      <!-- Servizi abilitati -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.services.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.services.subtitle' | translate }}</span>
        </header>
        @if (serviceRows.length === 0) { <p class="muted">{{ 'partnerForm.services.empty' | translate }}</p> }
        @for (row of serviceRows; track $index) {
          <div class="svc-row">
            <select class="field svc-type" [(ngModel)]="row.serviceTypeId" [name]="'svcType' + $index">
              <option value="">{{ 'partnerForm.services.typePlaceholder' | translate }}</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select>
            <input class="field num" type="number" step="0.01" [attr.placeholder]="'partnerForm.services.pricePlaceholder' | translate" [(ngModel)]="row.price" [name]="'svcPrice' + $index" />
            <input class="field num" type="number" [attr.placeholder]="'partnerForm.services.kmIncludedPlaceholder' | translate" [(ngModel)]="row.includedKm" [name]="'svcKm' + $index" />
            <input class="field num" type="number" step="0.01" [attr.placeholder]="'partnerForm.services.extraKmPlaceholder' | translate" [(ngModel)]="row.extraKmPrice" [name]="'svcKmP' + $index" />
            <input class="field num" type="number" step="0.01" [attr.placeholder]="'partnerForm.services.extraOutOfCityPlaceholder' | translate" [(ngModel)]="row.extraOutOfCityPrice" [name]="'svcOut' + $index" />
            <button type="button" class="icon-btn" (click)="removeService($index)" [title]="'partnerForm.general.remove' | translate">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addService()">+ {{ 'partnerForm.services.add' | translate }}</button>
        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'partnerForm.services.kmIncludedPartner' | translate }}</span>
            <input class="field num" type="number" name="kmIncluded" [(ngModel)]="model.kmIncluded" /></label>
          <label class="fld"><span>{{ 'partnerForm.services.extraOutOfCityPartner' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="extraOutOfCityPrice" [(ngModel)]="model.extraOutOfCityPrice" /></label>
          <label class="fld"><span>{{ 'partnerForm.services.commissionPercent' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="commissionPercent" [(ngModel)]="model.commissionPercent" /></label>
        </div>
      </section>

      <!-- Categorie -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.categories.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.categories.subtitle' | translate }}</span>
        </header>
        @if (categories().length === 0) { <p class="muted">{{ 'partnerForm.categories.empty' | translate }}</p> }
        @else {
          <div class="chips">
            @for (c of categories(); track c.id) {
              <button type="button" class="chip" [class.on]="selectedCategories.has(c.id)" (click)="toggle(selectedCategories, c.id)">{{ c.name }}</button>
            }
          </div>
        }
      </section>

      <!-- Orari di apertura settimanali -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.openingHours.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.openingHours.subtitle' | translate }}</span>
        </header>
        <div class="oh-rows">
          @for (row of openingHoursRows; track row.dayOfWeek) {
            <div class="oh-row">
              <span class="oh-day">{{ 'partnerForm.openingHours.days.' + row.key | translate }}</span>
              <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.closed" [name]="'ohClosed' + row.dayOfWeek" /><span>{{ 'partnerForm.openingHours.closed' | translate }}</span></label>
              @if (!row.closed) {
                <input class="field time" type="time" [(ngModel)]="row.openTime" [name]="'ohOpen' + row.dayOfWeek" />
                <span class="oh-sep">–</span>
                <input class="field time" type="time" [(ngModel)]="row.closeTime" [name]="'ohClose' + row.dayOfWeek" />
              } @else {
                <span class="oh-closed-note">{{ 'partnerForm.openingHours.closedNote' | translate }}</span>
              }
            </div>
          }
        </div>
        <button type="button" class="btn btn-secondary oh-copy" (click)="copyFirstDayToAll()">{{ 'partnerForm.openingHours.copyAll' | translate }}</button>
      </section>

      <!-- Pagamenti e fatturazione -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'partnerForm.payments.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'partnerForm.payments.paymentMethod' | translate }}</span>
            <select class="field" name="paymentMethod" [(ngModel)]="model.paymentMethod">
              <option value="">—</option>
              @for (m of paymentMethods; track m[0]) { <option [value]="m[0]">{{ ('enums.paymentMethod.' + m[0]) | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'partnerForm.payments.paymentStatus' | translate }}</span>
            <select class="field" name="paymentStatus" [(ngModel)]="model.paymentStatus">
              @for (s of paymentStatuses; track s[0]) { <option [value]="s[0]">{{ ('enums.paymentStatus.' + s[0]) | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'partnerForm.payments.contractStart' | translate }}</span>
            <input class="field" type="date" name="contractStart" [(ngModel)]="model.contractStart" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.contractEnd' | translate }}</span>
            <input class="field" type="date" name="contractEnd" [(ngModel)]="model.contractEnd" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.bankAccount' | translate }}</span>
            <input class="field" name="bankAccount" [(ngModel)]="model.bankAccount" placeholder="IT60 X054 …" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.bankAccountName' | translate }}</span>
            <input class="field" name="bankAccountName" [(ngModel)]="model.bankAccountName" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.sdiCode' | translate }}</span>
            <input class="field" name="sdiCode" [(ngModel)]="model.sdiCode" [attr.placeholder]="'partnerForm.payments.sdiCodePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.certifiedEmail' | translate }}</span>
            <input class="field" type="email" name="certifiedEmail" [(ngModel)]="model.certifiedEmail" placeholder="pec@partner.it" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.invoiceEmail' | translate }}</span>
            <input class="field" type="email" name="invoiceEmail" [(ngModel)]="model.invoiceEmail" placeholder="fatture@partner.it" /></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="invoicingEnabled" [(ngModel)]="model.invoicingEnabled" /><span>{{ 'partnerForm.payments.invoicingEnabled' | translate }}</span></label>
      </section>

      <!-- Setup -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.setup.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.setup.subtitle' | translate }}</span>
        </header>
        <div class="setup-group">
          <span class="group-label">{{ 'partnerForm.setup.warehouseGroup' | translate }}</span>
          <label class="toggle"><input type="checkbox" name="isWarehouse" [(ngModel)]="model.isWarehouse" /><span>{{ 'partnerForm.setup.isWarehouse' | translate }}</span></label>
        </div>
        <div class="setup-group">
          <span class="group-label">{{ 'partnerForm.setup.securityGroup' | translate }}</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="valetIdentityCheck" [(ngModel)]="model.valetIdentityCheck" /><span>{{ 'partnerForm.setup.valetIdentityCheck' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="deliveryCodeRequired" [(ngModel)]="model.deliveryCodeRequired" /><span>{{ 'partnerForm.setup.deliveryCodeRequired' | translate }}</span></label>
          </div>
          @if (model.deliveryCodeRequired) {
            <label class="fld mt" style="max-width:340px"><span>{{ 'partnerForm.setup.deliveryCodeType' | translate }}</span>
              <select class="field" name="deliveryCodeCheckType" [(ngModel)]="model.deliveryCodeCheckType">
                <option value="UNIQUE_PER_DELIVERY">{{ 'partnerForm.setup.codeUniquePerDelivery' | translate }}</option>
                <option value="UNIQUE_PER_CUSTOMER">{{ 'partnerForm.setup.codeUniquePerCustomer' | translate }}</option>
              </select></label>
          }
        </div>
        <div class="setup-group">
          <span class="group-label">{{ 'partnerForm.setup.notificationsGroup' | translate }}</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="smsTemplatesEnabled" [(ngModel)]="model.smsTemplatesEnabled" /><span>{{ 'partnerForm.setup.smsEnabled' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="whatsappNotifications" [(ngModel)]="model.whatsappNotifications" /><span>{{ 'partnerForm.setup.whatsappNotifications' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="mailNotifications" [(ngModel)]="model.mailNotifications" /><span>{{ 'partnerForm.setup.mailNotifications' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="activityReminder" [(ngModel)]="model.activityReminder" /><span>{{ 'partnerForm.setup.activityReminder' | translate }}</span></label>
          </div>
        </div>
      </section>

      <!-- Vendita e integrazioni -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'partnerForm.sales.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'partnerForm.sales.storeUrl' | translate }}</span>
            <input class="field" name="storeUrl" [(ngModel)]="model.storeUrl" placeholder="https://…" /></label>
          <label class="fld"><span>{{ 'partnerForm.sales.imageUrl' | translate }}</span>
            <input class="field" name="imageUrl" [(ngModel)]="model.imageUrl" placeholder="https://…" /></label>
        </div>
        <label class="fld span-2 mt"><span>{{ 'partnerForm.sales.woocommerceApiKey' | translate }}</span>
          <div class="key-row">
            <input class="field" name="woocommerceApiKey" [(ngModel)]="model.woocommerceApiKey" [attr.placeholder]="'partnerForm.sales.woocommerceApiKeyPlaceholder' | translate" />
            <button type="button" class="btn btn-secondary" (click)="generateKey()">{{ 'partnerForm.sales.generate' | translate }}</button>
            <button type="button" class="btn btn-secondary" (click)="copyKey()" [disabled]="!model.woocommerceApiKey">{{ 'partnerForm.sales.copy' | translate }}</button>
          </div>
        </label>
        <label class="fld span-2 mt"><span>{{ 'partnerForm.sales.notes' | translate }}</span>
          <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea></label>
      </section>

      @if (justSaved()) { <div class="ok-card card" [innerHTML]="'partnerForm.actions.savedNote' | translate"></div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/partners" class="btn btn-secondary">{{ 'partnerForm.actions.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'partnerForm.actions.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('partnerForm.actions.saving' | translate) : ((editId() ? 'common.save' : 'partnerForm.actions.create') | translate) }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 860px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .oh-rows { display: flex; flex-direction: column; gap: 8px; }
      .oh-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .oh-day { width: 92px; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); }
      .oh-row .toggle.sm { font-size: 13px; }
      .field.time { width: 120px; }
      .oh-sep { color: var(--text-tertiary); }
      .oh-closed-note { font-size: 13px; color: var(--text-tertiary); font-style: italic; }
      .oh-copy { margin-top: 14px; }
      @media (max-width: 640px) { .oh-day { width: 100%; } .field.time { flex: 1; width: auto; } }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .mt { margin-top: 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .span-2 { grid-column: 1 / -1; }
      textarea.field { resize: vertical; font-family: inherit; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { appearance: none; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 14px; font-size: 13px; font-family: inherit; color: var(--text); cursor: pointer; transition: all 0.15s var(--ease); }
      .chip:hover { background: var(--fill); }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .svc-row { display: grid; grid-template-columns: 1.6fr repeat(4, 1fr) auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .svc-row .num { text-align: right; }
      .pickup-list { margin-top: 12px; padding: 14px; background: var(--fill); border-radius: var(--radius-m); }
      .pickup-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 10px; }
      .pickup-row { display: flex; gap: 8px; margin-bottom: 8px; }
      .pickup-row .field { flex: 1; background: var(--surface); }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill-hover); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s var(--ease); flex-shrink: 0; }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .setup-group { padding: 12px 0; border-bottom: 1px solid var(--hairline); }
      .setup-group:last-child { border-bottom: none; padding-bottom: 0; }
      .setup-group:first-child { padding-top: 0; }
      .group-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .key-row { display: flex; gap: 8px; }
      .key-row .field { flex: 1; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .svc-row { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class PartnerFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly provinces = signal<Province[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly selectedProvinces = new Set<string>();
  readonly selectedCategories = new Set<string>();
  readonly paymentMethods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly paymentStatuses = Object.entries(PAYMENT_STATUS_LABELS);

  serviceRows: ServiceRow[] = [];
  pickupAddresses: string[] = [];
  /** Orari di apertura: una riga per giorno (lun→dom). */
  openingHoursRows: OpeningHourRow[] = WEEK_DAYS.map((d) => ({
    dayOfWeek: d.dayOfWeek,
    key: d.key,
    closed: false,
    openTime: '',
    closeTime: '',
  }));

  model = {
    insegna: '',
    email: '',
    businessName: '',
    phone: '',
    vatNumber: '',
    fiscalCode: '',
    address: '',
    isMultiPickup: false,
    contactName: '',
    contactSurname: '',
    paymentMethod: '',
    paymentStatus: 'active',
    contractStart: '',
    contractEnd: '',
    bankAccount: '',
    bankAccountName: '',
    sdiCode: '',
    certifiedEmail: '',
    invoiceEmail: '',
    invoicingEnabled: false,
    kmIncluded: null as number | null,
    extraOutOfCityPrice: null as number | null,
    commissionPercent: null as number | null,
    isWarehouse: false,
    valetIdentityCheck: false,
    deliveryCodeRequired: false,
    deliveryCodeCheckType: 'UNIQUE_PER_DELIVERY',
    smsTemplatesEnabled: false,
    whatsappNotifications: false,
    mailNotifications: false,
    activityReminder: false,
    storeUrl: '',
    imageUrl: '',
    woocommerceApiKey: '',
    notes: '',
  };

  /** Id partner in modifica (null = nuovo partner). */
  readonly editId = signal<string | null>(null);

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
    this.http.get<Category[]>(`${api}/categories`).subscribe((d) => this.categories.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));

    // Modalita' modifica: /partners/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${api}/partners/${id}`).subscribe({
        next: (p) => this.prefill(p),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con il partner esistente. */
  private prefill(p: Record<string, any>): void {
    const m = this.model as Record<string, any>;
    for (const key of Object.keys(this.model)) {
      const v = p[key];
      if (v === null || v === undefined) continue;
      // Le date arrivano ISO: il campo input[type=date] vuole YYYY-MM-DD
      if ((key === 'contractStart' || key === 'contractEnd') && typeof v === 'string') {
        m[key] = v.slice(0, 10);
      } else {
        m[key] = v;
      }
    }
    // Province / categorie / servizi collegati
    this.selectedProvinces.clear();
    for (const pp of (p['provinces'] as any[]) ?? []) {
      if (pp?.province?.id) this.selectedProvinces.add(pp.province.id);
    }
    this.selectedCategories.clear();
    for (const c of (p['categories'] as any[]) ?? []) {
      if (c?.category?.id) this.selectedCategories.add(c.category.id);
    }
    this.serviceRows = ((p['services'] as any[]) ?? []).map((s) => ({
      serviceTypeId: s.serviceType?.id ?? s.serviceTypeId ?? '',
      price: s.price ?? null,
      includedKm: s.includedKm ?? null,
      extraKmPrice: s.extraKmPrice ?? null,
      extraOutOfCityPrice: s.extraOutOfCityPrice ?? null,
    }));
    // Orari di apertura settimanali
    const oh = (p['openingHours'] as any[]) ?? [];
    if (oh.length) {
      for (const row of this.openingHoursRows) {
        const found = oh.find((x) => x.dayOfWeek === row.dayOfWeek);
        row.closed = found ? !!found.closed : false;
        row.openTime = found?.openTime ?? '';
        row.closeTime = found?.closeTime ?? '';
      }
    }
    // pickupAddresses e' salvato come stringa JSON lato API
    const pa = p['pickupAddresses'];
    if (typeof pa === 'string') {
      try {
        const parsed = JSON.parse(pa);
        this.pickupAddresses = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        this.pickupAddresses = [];
      }
    } else if (Array.isArray(pa)) {
      this.pickupAddresses = pa.map(String);
    }
  }

  toggle(set: Set<string>, id: string): void {
    set.has(id) ? set.delete(id) : set.add(id);
  }

  addService(): void {
    this.serviceRows.push({ serviceTypeId: '', price: null, includedKm: null, extraKmPrice: null, extraOutOfCityPrice: null });
  }
  removeService(i: number): void { this.serviceRows.splice(i, 1); }

  /** Copia l'orario del primo giorno (lunedì) su tutti gli altri. */
  copyFirstDayToAll(): void {
    const first = this.openingHoursRows[0];
    for (const row of this.openingHoursRows) {
      row.closed = first.closed;
      row.openTime = first.openTime;
      row.closeTime = first.closeTime;
    }
  }

  addPickup(): void { this.pickupAddresses.push(''); }
  removePickup(i: number): void { this.pickupAddresses.splice(i, 1); }

  generateKey(): void {
    const uuid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    this.model.woocommerceApiKey = `dxy_${uuid.replace(/-/g, '')}`;
  }

  copyKey(): void {
    if (this.model.woocommerceApiKey && navigator.clipboard) {
      navigator.clipboard.writeText(this.model.woocommerceApiKey);
    }
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    if (!this.model.insegna.trim() || !this.model.email.trim()) {
      this.error.set(this.translate.instant('partnerForm.errors.requiredFields'));
      return;
    }

    const m = this.model;
    const payload: Record<string, unknown> = {
      insegna: m.insegna.trim(),
      email: m.email.trim(),
      invoicingEnabled: m.invoicingEnabled,
      smsTemplatesEnabled: m.smsTemplatesEnabled,
      whatsappNotifications: m.whatsappNotifications,
      mailNotifications: m.mailNotifications,
      isMultiPickup: m.isMultiPickup,
      valetIdentityCheck: m.valetIdentityCheck,
      deliveryCodeRequired: m.deliveryCodeRequired,
      deliveryCodeCheckType: m.deliveryCodeCheckType,
      isWarehouse: m.isWarehouse,
      activityReminder: m.activityReminder,
      paymentStatus: m.paymentStatus,
    };
    for (const key of [
      'businessName', 'phone', 'vatNumber', 'fiscalCode', 'address',
      'contactName', 'contactSurname', 'paymentMethod', 'contractStart', 'contractEnd',
      'bankAccount', 'bankAccountName', 'sdiCode', 'certifiedEmail', 'invoiceEmail',
      'storeUrl', 'imageUrl', 'woocommerceApiKey', 'notes',
    ] as const) {
      const v = (m as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    if (m.kmIncluded != null) payload['kmIncluded'] = Number(m.kmIncluded);
    if (m.extraOutOfCityPrice != null) payload['extraOutOfCityPrice'] = Number(m.extraOutOfCityPrice);
    if (m.commissionPercent != null) payload['commissionPercent'] = Number(m.commissionPercent);
    // In modifica le collezioni vanno inviate SEMPRE, anche vuote: altrimenti
    // svuotarle non le cancellerebbe (l'API aggiorna solo le chiavi presenti).
    const isEdit = !!this.editId();
    if (this.selectedProvinces.size || isEdit) payload['provinceIds'] = [...this.selectedProvinces];
    if (this.selectedCategories.size || isEdit) payload['categoryIds'] = [...this.selectedCategories];

    const addrs = m.isMultiPickup
      ? this.pickupAddresses.map((a) => a.trim()).filter(Boolean)
      : [];
    if (addrs.length || isEdit) payload['pickupAddresses'] = addrs;

    const services = this.serviceRows
      .filter((r) => r.serviceTypeId && r.price != null)
      .map((r) => ({
        serviceTypeId: r.serviceTypeId,
        price: Number(r.price),
        includedKm: r.includedKm != null ? Number(r.includedKm) : undefined,
        extraKmPrice: r.extraKmPrice != null ? Number(r.extraKmPrice) : undefined,
        extraOutOfCityPrice: r.extraOutOfCityPrice != null ? Number(r.extraOutOfCityPrice) : undefined,
      }));
    if (services.length || isEdit) payload['services'] = services;

    // Orari: giorni chiusi o con almeno un orario. In modifica invio sempre
    // (anche vuoto) così eliminare tutti gli orari li cancella davvero.
    const openingHours = this.openingHoursRows
      .filter((r) => r.closed || r.openTime || r.closeTime)
      .map((r) => ({
        dayOfWeek: r.dayOfWeek,
        closed: r.closed,
        openTime: r.closed ? undefined : (r.openTime || undefined),
        closeTime: r.closed ? undefined : (r.closeTime || undefined),
      }));
    if (openingHours.length || isEdit) payload['openingHours'] = openingHours;

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/partners/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/partners`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/partners', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/partners']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('partnerForm.errors.createFailed'));
      },
    });
  }
}
