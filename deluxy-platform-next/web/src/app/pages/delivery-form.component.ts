import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { loadGoogleMaps } from '../core/google-maps';
import { detectProvince } from '../core/province.util';

declare const google: any;
import {
  Customer,
  DELIVERY_PAYMENT_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  Partner,
  Product,
  Province,
  ServiceType,
  ValetRef,
} from '../core/models';

interface ProductRow {
  productId: string;
  quantity: number | null;
  flexiblePrice: boolean;
  price: number | null;
}

@Component({
  selector: 'app-delivery-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/deliveries" class="back">← {{ 'deliveryForm.backToDeliveries' | translate }}</a>
        <h1>{{ (editId() ? 'deliveryForm.editTitle' : 'deliveryForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'deliveryForm.caption' | translate }}</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- 1. Scelta del servizio -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.service.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.service.sub' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.service' | translate }} *</span>
            <select class="field" name="serviceTypeId" [(ngModel)]="model.serviceTypeId" (ngModelChange)="onServiceChange()" required>
              <option value="">{{ 'deliveryForm.placeholder.selectService' | translate }}</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.recipientAddress' | translate }} *</span>
            <input #addressInput class="field" name="recipientAddress" [(ngModel)]="model.recipientAddress" (ngModelChange)="onAddressChange()" required autocomplete="off" [placeholder]="'deliveryForm.placeholder.address' | translate" />
            @if (addressProvince()) { <span class="slot-hint">{{ 'deliveryForm.hint.provinceDetected' | translate:{ code: addressProvince()?.code } }}</span> }
            @else if (model.recipientAddress) { <span class="slot-hint warn">{{ 'deliveryForm.hint.provinceUnknown' | translate }}</span> }
          </label>
          <label class="fld"><span>{{ 'deliveryForm.field.date' | translate }} *</span>
            <input class="field" type="date" name="date" [(ngModel)]="model.date" [min]="deliveryMinDate()" required />
            @if (selectedService()?.noticeDays) { <span class="slot-hint">{{ 'deliveryForm.hint.notice' | translate:{ days: selectedService()?.noticeDays, date: deliveryMinDate() } }}</span> }
          </label>
          <label class="fld"><span>{{ 'deliveryForm.field.partner' | translate }} *</span>
            <select class="field" name="partnerId" [(ngModel)]="model.partnerId" required>
              <option value="">{{ 'deliveryForm.placeholder.selectPartner' | translate }}</option>
              @for (p of filteredPartners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select>
            @if (model.serviceTypeId && filteredPartners().length === 0) { <span class="slot-hint warn">{{ 'deliveryForm.hint.noPartners' | translate }}</span> }
          </label>
        </div>
      </section>

      <!-- 2. Data di consegna e ritiro -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.timing.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.timing.sub' | translate }}</span></header>

        <!-- Consegna -->
        @if (!selectedService()) {
          <p class="muted">{{ 'deliveryForm.timing.selectServiceFirst' | translate }}</p>
        } @else {
          @if (selectedService()?.allowFlexibleTime) {
            <label class="toggle"><input type="checkbox" name="deliveryFlexible" [(ngModel)]="model.deliveryFlexible" /><span>{{ 'deliveryForm.timing.deliveryFlexible' | translate }}</span></label>
          }
          @if (model.deliveryFlexible && selectedService()?.allowFlexibleTime) {
            <div class="grid-2 mt">
              <label class="fld"><span>{{ 'deliveryForm.field.deliveryFrom' | translate }}</span>
                <input class="field" type="time" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom" /></label>
              <label class="fld"><span>{{ 'deliveryForm.field.deliveryTo' | translate }}</span>
                <input class="field" type="time" name="deliveryTimeTo" [(ngModel)]="model.deliveryTimeTo" /></label>
            </div>
          } @else {
            <label class="fld mt" style="max-width:320px"><span>{{ 'deliveryForm.field.deliverySlot' | translate }} <em>{{ 'deliveryForm.timing.slotSize' | translate:{ hours: slotHours() } }}</em></span>
              <select class="field" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom">
                <option value="">{{ 'deliveryForm.placeholder.selectSlot' | translate }}</option>
                @for (slot of deliverySlots(); track slot.from) { <option [value]="slot.from">{{ slot.from }}–{{ slot.to }}</option> }
              </select>
              @if (deliverySlots().length === 0) { <span class="slot-hint warn">{{ 'deliveryForm.timing.noSlots' | translate }}</span> }
            </label>
          }
        }

        <!-- Ritiro -->
        <label class="toggle mt2"><input type="checkbox" name="pickupFlexible" [(ngModel)]="model.pickupFlexible" /><span>{{ 'deliveryForm.timing.pickupFlexible' | translate }}</span></label>
        @if (model.pickupFlexible) {
          <div class="grid-2 mt">
            <label class="fld"><span>{{ 'deliveryForm.field.pickupFrom' | translate }} *</span>
              <input class="field" type="time" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom" /></label>
            <label class="fld"><span>{{ 'deliveryForm.field.pickupTo' | translate }} *</span>
              <input class="field" type="time" name="pickupTimeTo" [(ngModel)]="model.pickupTimeTo" /></label>
          </div>
        } @else {
          <label class="fld mt" style="max-width:280px"><span>{{ 'deliveryForm.field.pickupTime' | translate }} * <em>{{ 'deliveryForm.timing.pickupSlotSize' | translate }}</em></span>
            <select class="field" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom">
              <option value="">{{ 'deliveryForm.placeholder.selectTime' | translate }}</option>
              @for (t of pickupTimeOptions; track t) { <option [value]="t">{{ t }}</option> }
            </select>
            @if (model.pickupTimeFrom) { <span class="slot-hint">→ {{ model.pickupTimeFrom }}–{{ plusOneHour(model.pickupTimeFrom) }}</span> }
          </label>
        }
      </section>

      <!-- 3. Scelta del salario (assegnazione) -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.assignment.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.assignment.sub' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.valet' | translate }}</span>
            <select class="field" name="valetId" [(ngModel)]="model.valetId">
              <option value="">{{ 'common.notAssigned' | translate }}</option>
              @for (v of filteredValets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.status' | translate }}</span>
            <select class="field" name="status" [(ngModel)]="model.status">
              <option value="">{{ 'deliveryForm.option.automatic' | translate }}</option>
              @for (s of statusOptions; track s[0]) { <option [value]="s[0]">{{ 'status.delivery.' + s[0] | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.paymentStatus' | translate }}</span>
            <select class="field" name="paymentStatus" [(ngModel)]="model.paymentStatus">
              @for (s of paymentStatuses; track s[0]) { <option [value]="s[0]">{{ 'enums.deliveryPaymentStatus.' + s[0] | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.valetService' | translate }}</span>
            <select class="field" name="valetServiceId" [(ngModel)]="model.valetServiceId">
              <option value="">— {{ 'deliveryForm.option.automaticLower' | translate }} —</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="deluxyDelivery" [(ngModel)]="model.deluxyDelivery" /><span>{{ 'deliveryForm.toggle.deluxySale' | translate }}</span></label>
      </section>

      <!-- 4. Destinatario e mittente -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.people.title' | translate }}</h2></header>
        <label class="fld"><span>{{ 'deliveryForm.field.existingCustomer' | translate }}</span>
          <select class="field" name="customerId" [(ngModel)]="model.customerId" (ngModelChange)="applyCustomer($event)">
            <option value="">— {{ 'deliveryForm.option.newRecipient' | translate }} —</option>
            @for (c of customers(); track c.id) { <option [value]="c.id">{{ c.lastName }} {{ c.firstName }}</option> }
          </select></label>
        @if (!model.customerId) {
          <label class="toggle mt"><input type="checkbox" name="saveCustomer" [(ngModel)]="model.saveCustomer" /><span>{{ 'deliveryForm.toggle.saveCustomer' | translate }}</span></label>
        }
        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'deliveryForm.field.recipientLastName' | translate }} *</span>
            <input class="field" name="recipientLastName" [(ngModel)]="model.recipientLastName" required /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.recipientFirstName' | translate }} *</span>
            <input class="field" name="recipientFirstName" [(ngModel)]="model.recipientFirstName" required /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.intercom' | translate }} *</span>
            <input class="field" name="recipientIntercom" [(ngModel)]="model.recipientIntercom" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.recipientPhone' | translate }}</span>
            <input class="field" name="recipientPhone" [(ngModel)]="model.recipientPhone" placeholder="+39 …" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.recipientEmail' | translate }}</span>
            <input class="field" type="email" name="recipientEmail" [(ngModel)]="model.recipientEmail" /></label>
        </div>
        <div class="divider"></div>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.senderLastName' | translate }}</span>
            <input class="field" name="senderLastName" [(ngModel)]="model.senderLastName" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.senderFirstName' | translate }}</span>
            <input class="field" name="senderFirstName" [(ngModel)]="model.senderFirstName" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.senderPhone' | translate }}</span>
            <input class="field" name="senderPhone" [(ngModel)]="model.senderPhone" /></label>
        </div>
        <label class="fld mt" style="max-width:280px"><span>{{ 'deliveryForm.field.smsPhone' | translate }}</span>
          <input class="field" name="smsPhoneNo" [(ngModel)]="model.smsPhoneNo" placeholder="+39 …" /></label>
        <div class="toggles mt">
          <span class="group-label">{{ 'deliveryForm.sms.groupLabel' | translate }}</span>
          <label class="toggle"><input type="checkbox" name="smsOnCreated" [(ngModel)]="model.smsOnCreated" /><span>{{ 'deliveryForm.sms.onCreated' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="smsOnDeparted" [(ngModel)]="model.smsOnDeparted" /><span>{{ 'deliveryForm.sms.onDeparted' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="smsOnArrived" [(ngModel)]="model.smsOnArrived" /><span>{{ 'deliveryForm.sms.onArrived' | translate }}</span></label>
        </div>
      </section>

      <!-- 5. Gestione dell'ordine -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.order.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.order.sub' | translate }}</span></header>
        @if (productRows.length === 0) { <p class="muted">{{ 'deliveryForm.order.noProducts' | translate }}</p> }
        @for (row of productRows; track $index) {
          <div class="prod-item">
            <div class="prod-top">
              <select class="field" [(ngModel)]="row.productId" (ngModelChange)="onProductChange(row)" [name]="'prod' + $index">
                <option value="">{{ 'deliveryForm.placeholder.selectProduct' | translate }}</option>
                @for (p of sortedProducts(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.partner ? '' : ' (' + ('deliveryForm.order.generic' | translate) + ')' }}</option> }
              </select>
              <input class="field num qty" type="number" min="1" [placeholder]="'deliveryForm.placeholder.qty' | translate" [(ngModel)]="row.quantity" [name]="'qty' + $index" />
              <button type="button" class="icon-btn" (click)="removeProduct($index)" [title]="'deliveryForm.order.remove' | translate">✕</button>
            </div>
            <div class="prod-bottom">
              <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.flexiblePrice" (change)="onFlexToggle(row)" [name]="'pflex' + $index" /><span>{{ 'deliveryForm.order.flexiblePrice' | translate }}</span></label>
              @if (row.flexiblePrice) {
                <span class="price-lbl">{{ 'deliveryForm.order.priceEuro' | translate }}</span>
                <input class="field num price-in" type="number" step="0.01" [(ngModel)]="row.price" [name]="'pprice' + $index" />
              } @else {
                <span class="price-static">{{ 'deliveryForm.order.priceLabel' | translate }} <strong>{{ productPrice(row.productId) != null ? (productPrice(row.productId) + ' €') : '—' }}</strong></span>
              }
            </div>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addProduct()">+ {{ 'deliveryForm.order.addProduct' | translate }}</button>

        <div class="toggles mt">
          <label class="toggle"><input type="checkbox" name="paymentOnDelivery" [(ngModel)]="model.paymentOnDelivery" /><span>{{ 'deliveryForm.order.paymentOnDelivery' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="tryAndReturn" [(ngModel)]="model.tryAndReturn" /><span>{{ 'deliveryForm.order.tryAndReturn' | translate }}</span></label>
        </div>
        @if (model.paymentOnDelivery) {
          <label class="fld mt" style="max-width:260px"><span>{{ 'deliveryForm.order.cashToCollect' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="paymentAmount" [(ngModel)]="model.paymentAmount" /></label>
        }
      </section>

      <!-- 6. Listino -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.pricing.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.pricing.sub' | translate }}</span></header>
        <div class="listino">
          <div>
            <span class="group-label">{{ 'deliveryForm.pricing.billableGroup' | translate }}</span>
            <label class="toggle mb"><input type="checkbox" name="billable" [(ngModel)]="model.billable" /><span>{{ 'deliveryForm.pricing.billable' | translate }}</span></label>
            <div class="grid-2">
              <label class="fld"><span>{{ 'deliveryForm.pricing.price' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="price" [(ngModel)]="model.price" [placeholder]="'deliveryForm.placeholder.auto' | translate" /></label>
              <label class="fld"><span>{{ 'deliveryForm.pricing.plusMinus' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="additionalPrice" [(ngModel)]="model.additionalPrice" /></label>
              <label class="fld"><span>{{ 'deliveryForm.pricing.deliveryPrice' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="deliveryPrice" [(ngModel)]="model.deliveryPrice" /></label>
            </div>
          </div>
          <div>
            <span class="group-label">{{ 'deliveryForm.pricing.payableGroup' | translate }}</span>
            <label class="toggle mb"><input type="checkbox" name="payable" [(ngModel)]="model.payable" /><span>{{ 'deliveryForm.pricing.payable' | translate }}</span></label>
            <div class="grid-2">
              <label class="fld"><span>{{ 'deliveryForm.pricing.valetSalary' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="valetSalary" [(ngModel)]="model.valetSalary" /></label>
              <label class="fld"><span>{{ 'deliveryForm.pricing.plusMinus' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="valetAdditionalPrice" [(ngModel)]="model.valetAdditionalPrice" /></label>
            </div>
          </div>
        </div>
        <label class="toggle mt"><input type="checkbox" name="isFlexiblePrice" [(ngModel)]="model.isFlexiblePrice" /><span>{{ 'deliveryForm.pricing.flexiblePrice' | translate }}</span></label>
        @if (model.isFlexiblePrice) {
          <label class="fld mt"><span>{{ 'deliveryForm.pricing.flexiblePriceDetail' | translate }}</span>
            <input class="field" name="flexiblePrice" [(ngModel)]="model.flexiblePrice" [placeholder]="'deliveryForm.pricing.flexiblePricePlaceholder' | translate" /></label>
        }
        @if (isHourly()) {
          <label class="fld mt" style="max-width:200px"><span>{{ 'deliveryForm.pricing.hours' | translate }}</span>
            <input class="field num" type="number" min="1" name="hours" [(ngModel)]="model.hours" /></label>
        }
      </section>

      <!-- 7. Documentazione e note -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.docs.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.ddtNumber' | translate }}</span>
            <input class="field" name="ddtNumber" [(ngModel)]="model.ddtNumber" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.ddtFile' | translate }}</span>
            <input class="field" name="ddtFile" [(ngModel)]="model.ddtFile" placeholder="https://…" /></label>
        </div>
        <label class="fld span-2 mt"><span>{{ 'deliveryForm.field.notes' | translate }}</span>
          <textarea class="field" rows="2" name="notes" [(ngModel)]="model.notes"></textarea></label>
        <label class="fld span-2 mt"><span>{{ 'deliveryForm.field.personalization' | translate }}</span>
          <textarea class="field" rows="2" name="personalizeSaleNotes" [(ngModel)]="model.personalizeSaleNotes"></textarea></label>
        <label class="fld span-2 mt"><span>{{ 'deliveryForm.field.internalNotes' | translate }} <em>{{ 'deliveryForm.field.internalNotesRoles' | translate }}</em></span>
          <textarea class="field" rows="2" name="internalNotes" [(ngModel)]="model.internalNotes"></textarea></label>
        <label class="toggle mt"><input type="checkbox" name="deliveryCodeRequired" [(ngModel)]="model.deliveryCodeRequired" /><span>{{ 'deliveryForm.field.deliveryCodeRequired' | translate }}</span></label>
      </section>

      @if (justSaved()) { <div class="ok-card card">{{ 'deliveryForm.savedNotice.pre' | translate }} <strong>{{ 'deliveryForm.savedNotice.create' | translate }}</strong> {{ 'deliveryForm.savedNotice.or' | translate }} <strong>{{ 'common.duplicate' | translate }}</strong> {{ 'deliveryForm.savedNotice.post' | translate }}</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/deliveries" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'deliveryForm.submit') | translate) }}
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
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 16px; }
      .listino { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
      .mt { margin-top: 16px; }
      .mt2 { margin-top: 20px; }
      .slot-hint { margin-top: 6px; font-size: 12.5px; color: var(--gold-strong); font-weight: 550; }
      .slot-hint.warn { color: var(--red); }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .fld em { color: var(--text-tertiary); font-style: normal; font-weight: 400; }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .divider { height: 1px; background: var(--hairline); margin: 18px 0; }
      .prod-row { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .prod-item { border: 1px solid var(--hairline); border-radius: var(--radius-m); padding: 12px 14px; margin-bottom: 10px; }
      .prod-top { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; align-items: center; }
      .prod-bottom { display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
      .price-static { font-size: 13.5px; color: var(--text-secondary); }
      .price-lbl { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .price-in { max-width: 130px; }
      .toggle.sm { font-size: 13px; }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s var(--ease); }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: center; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .group-label { display: block; width: 100%; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 760px) { .grid-2, .grid-4, .listino { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DeliveryFormComponent implements AfterViewInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly zone = inject(NgZone);

  @ViewChild('addressInput') addressInput?: ElementRef<HTMLInputElement>;
  private autocomplete: any = null;

  readonly partners = signal<Partner[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  readonly products = signal<Product[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly provinces = signal<Province[]>([]);
  /** Provincia rilevata dall'indirizzo destinatario (filtra partner/valet). */
  readonly addressProvince = signal<Province | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly statusOptions = Object.entries(DELIVERY_STATUS_LABELS);
  readonly paymentStatuses = Object.entries(DELIVERY_PAYMENT_STATUS_LABELS);

  productRows: ProductRow[] = [];

  model = {
    date: '',
    recipientAddress: '',
    partnerId: '',
    serviceTypeId: '',
    deliveryTimeFrom: '',
    deliveryTimeTo: '',
    deliveryFlexible: false,
    pickupTimeFrom: '',
    pickupTimeTo: '',
    pickupFlexible: false,
    valetId: '',
    status: '',
    paymentStatus: 'default',
    customerId: '',
    saveCustomer: false,
    recipientLastName: '',
    recipientFirstName: '',
    recipientIntercom: '',
    recipientPhone: '',
    recipientEmail: '',
    senderLastName: '',
    senderFirstName: '',
    senderPhone: '',
    valetServiceId: '',
    deluxyDelivery: false,
    smsPhoneNo: '',
    smsOnCreated: false,
    smsOnDeparted: false,
    smsOnArrived: false,
    paymentOnDelivery: false,
    tryAndReturn: false,
    paymentAmount: null as number | null,
    billable: true,
    payable: true,
    price: null as number | null,
    additionalPrice: null as number | null,
    deliveryPrice: null as number | null,
    valetSalary: null as number | null,
    valetAdditionalPrice: null as number | null,
    isFlexiblePrice: false,
    flexiblePrice: '',
    hours: null as number | null,
    ddtNumber: '',
    ddtFile: '',
    notes: '',
    personalizeSaleNotes: '',
    internalNotes: '',
    deliveryCodeRequired: false,
  };

  /** Prodotti del partner selezionato per primi. */
  readonly sortedProducts = computed(() => {
    const pid = this.model.partnerId;
    const list = [...this.products()];
    return list.sort((a, b) => {
      const ap = a.partner?.id === pid ? 0 : 1;
      const bp = b.partner?.id === pid ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });
  });

  /** Servizio selezionato (aggiornato imperativamente da onServiceChange). */
  readonly selectedService = signal<ServiceType | null>(null);
  /** Fasce orarie di consegna generate dal servizio. */
  readonly deliverySlots = signal<{ from: string; to: string }[]>([]);
  /** Data minima consegna = oggi + giorni preavviso del servizio (YYYY-MM-DD). */
  readonly deliveryMinDate = signal<string>('');

  readonly slotHours = computed(() => {
    const h = this.selectedService()?.slotHours;
    return h && h > 0 ? h : 1;
  });
  readonly isHourly = computed(() => this.selectedService()?.pricingModel === 'A_ORA');

  /** Al cambio servizio: aggiorna fasce, data minima e resetta stati non più validi. */
  onServiceChange(): void {
    const s = this.serviceTypes().find((x) => x.id === this.model.serviceTypeId) ?? null;
    this.selectedService.set(s);
    // Se il servizio non consente la consegna flessibile, forza la modalità a fasce.
    if (!s?.allowFlexibleTime) this.model.deliveryFlexible = false;
    // Fasce orarie di consegna (dalle min alle max del servizio, passo = fascia).
    const slots = this.buildSlots(s);
    this.deliverySlots.set(slots);
    // La fascia scelta in precedenza potrebbe non esistere più.
    if (!this.model.deliveryFlexible && this.model.deliveryTimeFrom
      && !slots.some((sl) => sl.from === this.model.deliveryTimeFrom)) {
      this.model.deliveryTimeFrom = '';
    }
    // Data minima = oggi + giorni preavviso.
    const min = this.computeMinDate(s?.noticeDays ?? 0);
    this.deliveryMinDate.set(min);
    if (!this.model.date || this.model.date < min) this.model.date = min;
    // Il filtro per tipo servizio può escludere il partner scelto.
    this.syncSelections();
  }

  /** Genera le fasce [from,to] da minOrderTime a maxOrderTime (default 06:00–22:00), passo = slotHours. */
  private buildSlots(s: ServiceType | null): { from: string; to: string }[] {
    if (!s) return [];
    const step = this.slotHoursOf(s) * 60;
    const start = this.timeToMin(s.minOrderTime) ?? 6 * 60;
    const end = this.timeToMin(s.maxOrderTime) ?? 22 * 60;
    const slots: { from: string; to: string }[] = [];
    for (let t = start; t + step <= end; t += step) {
      slots.push({ from: this.minToTime(t), to: this.minToTime(t + step) });
    }
    return slots;
  }
  private slotHoursOf(s: ServiceType | null): number {
    const h = s?.slotHours;
    return h && h > 0 ? h : 1;
  }
  private timeToMin(t?: string | null): number | null {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    return h * 60 + (Number.isNaN(m) ? 0 : m);
  }
  private minToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  private addHours(t: string, hours: number): string {
    return this.minToTime((this.timeToMin(t) ?? 0) + hours * 60);
  }
  private computeMinDate(noticeDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + (noticeDays || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Id consegna in modifica (null = nuova consegna). */
  readonly editId = signal<string | null>(null);

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));
    this.http.get<ValetRef[]>(`${api}/valets`).subscribe((d) => this.valets.set(d as ValetRef[]));
    // La lista prodotti e' paginata: qui serve il catalogo per la tendina,
    // quindi chiedo la pagina massima consentita.
    this.http
      .get<{ items: Product[] }>(`${api}/products`, { params: { pageSize: 500 } })
      .subscribe((d) => this.products.set(d.items ?? []));
    // La lista clienti e' paginata: qui serve per la tendina "Cliente esistente",
    // quindi chiedo la pagina massima. ATTENZIONE: in produzione i clienti sono
    // migliaia, quindi la tendina resta parziale -> va sostituita da una ricerca
    // mentre si scrive (vedi HANDOFF, punto aperto).
    this.http
      .get<{ items: Customer[] }>(`${api}/customers`, { params: { pageSize: 500 } })
      .subscribe((d) => this.customers.set(d.items ?? []));
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));

    // Modalita' modifica: /deliveries/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, unknown>>(`${api}/deliveries/${id}`).subscribe({
        next: (d) => this.prefill(d),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con la consegna esistente. */
  private prefill(d: Record<string, any>): void {
    const m = this.model;
    m.date = typeof d['date'] === 'string' ? d['date'].slice(0, 10) : '';
    for (const key of [
      'recipientAddress', 'partnerId', 'serviceTypeId', 'deliveryTimeFrom', 'deliveryTimeTo',
      'pickupTimeFrom', 'pickupTimeTo', 'valetId', 'status', 'paymentStatus', 'customerId',
      'recipientLastName', 'recipientFirstName', 'recipientIntercom', 'recipientPhone',
      'recipientEmail', 'senderLastName', 'senderFirstName', 'senderPhone', 'valetServiceId',
      'smsPhoneNo', 'flexiblePrice', 'ddtNumber', 'ddtFile', 'notes', 'personalizeSaleNotes',
      'internalNotes',
    ] as const) {
      if (d[key] != null) (m as Record<string, unknown>)[key] = d[key];
    }
    for (const key of [
      'deliveryFlexible', 'pickupFlexible', 'deluxyDelivery', 'smsOnCreated', 'smsOnDeparted',
      'smsOnArrived', 'paymentOnDelivery', 'tryAndReturn', 'billable', 'payable',
      'isFlexiblePrice', 'deliveryCodeRequired',
    ] as const) {
      if (d[key] != null) (m as Record<string, unknown>)[key] = !!d[key];
    }
    for (const key of ['paymentAmount', 'price', 'additionalPrice', 'deliveryPrice', 'valetSalary', 'valetAdditionalPrice', 'hours'] as const) {
      if (d[key] != null) (m as Record<string, unknown>)[key] = d[key];
    }
    // Prodotti della consegna
    const products = (d['products'] as any[]) ?? [];
    this.productRows = products.map((p) => ({
      productId: p.productId ?? p.product?.id ?? '',
      quantity: p.quantity ?? 1,
      price: p.price ?? null,
      flexiblePrice: !!p.flexiblePrice,
    })) as ProductRow[];
    // Ricostruisce fasce orarie, data minima e filtri dipendenti
    this.onAddressChange();
    this.onServiceChange();
    // onServiceChange puo' azzerare la fascia: la ripristina da quella salvata
    if (d['deliveryTimeFrom']) m.deliveryTimeFrom = d['deliveryTimeFrom'] as string;
    if (d['date']) m.date = (d['date'] as string).slice(0, 10);
  }

  /** Partner filtrati per tipo di servizio scelto e per provincia dell'indirizzo. */
  readonly filteredPartners = computed(() => {
    const svcId = this.selectedService()?.id;
    const prov = this.addressProvince();
    return this.partners().filter((p) => {
      const svcOk = !svcId || (p.services ?? []).some((s) => s.serviceType?.id === svcId);
      const provOk = !prov || (p.provinces ?? []).some((pp) => pp.province?.code === prov.code);
      return svcOk && provOk;
    });
  });

  /** Valet filtrati per provincia dell'indirizzo. */
  readonly filteredValets = computed(() => {
    const prov = this.addressProvince();
    if (!prov) return this.valets();
    return this.valets().filter((v) => (v.provinces ?? []).some((pp) => pp.province?.code === prov.code));
  });

  applyCustomer(id: string): void {
    const c = this.customers().find((x) => x.id === id);
    if (!c) return;
    this.model.recipientFirstName = c.firstName ?? '';
    this.model.recipientLastName = c.lastName ?? '';
    if (c.address) { this.model.recipientAddress = c.address; this.onAddressChange(); }
    if (c.intercom) this.model.recipientIntercom = c.intercom;
    if (c.phone) this.model.recipientPhone = c.phone;
    if (c.email) this.model.recipientEmail = c.email;
  }

  /** Aggancia l'autocomplete indirizzi di Google Places al campo destinatario,
   *  se in Impostazioni è configurata la chiave browser. Degrada silenziosamente
   *  al campo di testo normale (con geocodifica server) se manca la chiave. */
  ngAfterViewInit(): void {
    const input = this.addressInput?.nativeElement;
    if (!input) return;
    this.http
      .get<{ googleMapsBrowserKey: string | null }>(`${environment.apiUrl}/settings/public`)
      .subscribe({
        next: async (cfg) => {
          const key = cfg?.googleMapsBrowserKey;
          if (!key) return; // nessuna chiave: resta il campo normale
          try {
            await loadGoogleMaps(key);
            this.autocomplete = new google.maps.places.Autocomplete(input, {
              componentRestrictions: { country: 'it' },
              fields: ['formatted_address', 'geometry', 'address_components'],
              types: ['address'],
            });
            this.autocomplete.addListener('place_changed', () => {
              const place = this.autocomplete.getPlace();
              // L'evento Google è fuori dal ciclo Angular: rientro con la zona.
              this.zone.run(() => this.onPlaceSelected(place));
            });
          } catch {
            /* script non caricato: resta il campo normale */
          }
        },
        error: () => { /* nessuna chiave/rete: campo normale */ },
      });
  }

  /** Indirizzo scelto dal menu Google: compila il campo e ricava la provincia. */
  private onPlaceSelected(place: any): void {
    if (!place) return;
    const address = place.formatted_address || this.addressInput?.nativeElement.value || '';
    this.model.recipientAddress = address;
    const comp = (place.address_components || []).find((c: any) =>
      (c.types || []).includes('administrative_area_level_2'),
    );
    const code = comp?.short_name as string | undefined;
    const prov = code ? (this.provinces().find((p) => p.code === code) ?? null) : null;
    this.addressProvince.set(prov ?? this.detectProvince(address));
    this.syncSelections();
  }

  /** Al cambio indirizzo: rileva subito la provincia dal testo, poi (con debounce)
   *  la conferma via Google Geocoding se in Impostazioni è salvata la chiave API. */
  onAddressChange(): void {
    this.addressProvince.set(this.detectProvince(this.model.recipientAddress));
    this.syncSelections();
    this.scheduleGeocode();
  }

  private geocodeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Geocodifica lato server (chiave dalle Impostazioni): parte 700ms dopo l'ultimo
   *  tasto e vince sul riconoscimento testuale solo se trova una provincia. */
  private scheduleGeocode(): void {
    if (this.geocodeTimer) clearTimeout(this.geocodeTimer);
    const address = this.model.recipientAddress.trim();
    if (address.length < 6) return;
    this.geocodeTimer = setTimeout(() => {
      this.http
        .get<{ provinceCode: string | null }>(`${environment.apiUrl}/settings/geocode`, { params: { address } })
        .subscribe({
          next: (r) => {
            // L'indirizzo può essere cambiato mentre la richiesta era in volo.
            if (this.model.recipientAddress.trim() !== address || !r.provinceCode) return;
            const prov = this.provinces().find((p) => p.code === r.provinceCode) ?? null;
            if (prov) { this.addressProvince.set(prov); this.syncSelections(); }
          },
          error: () => { /* senza chiave o rete: resta il riconoscimento testuale */ },
        });
    }, 700);
  }

  /** Deduce la provincia dall'indirizzo (logica condivisa con la lista consegne). */
  private detectProvince(address: string): Province | null {
    return detectProvince(address, this.provinces());
  }

  /** Azzera partner/valet se non più presenti nelle liste filtrate. */
  private syncSelections(): void {
    if (this.model.partnerId && !this.filteredPartners().some((p) => p.id === this.model.partnerId)) {
      this.model.partnerId = '';
    }
    if (this.model.valetId && !this.filteredValets().some((v) => v.id === this.model.valetId)) {
      this.model.valetId = '';
    }
  }

  addProduct(): void { this.productRows.push({ productId: '', quantity: 1, flexiblePrice: false, price: null }); }
  removeProduct(i: number): void { this.productRows.splice(i, 1); }

  /** Prezzo base del prodotto selezionato. */
  productPrice(productId: string): number | null {
    return this.products().find((p) => p.id === productId)?.price ?? null;
  }

  /** Al cambio prodotto, se il prezzo è flessibile precompila con il prezzo base. */
  onProductChange(row: ProductRow): void {
    if (row.flexiblePrice && row.price == null) row.price = this.productPrice(row.productId);
  }

  /** Attivando "prezzo flessibile" precompila con il prezzo base del prodotto. */
  onFlexToggle(row: ProductRow): void {
    if (row.flexiblePrice && row.price == null) row.price = this.productPrice(row.productId);
  }

  /** Orari proponibili per il ritiro: mezz'ora in mezz'ora, 00:00–23:30.
   *  In modifica, un orario salvato fuori griglia viene aggiunto alla lista. */
  get pickupTimeOptions(): string[] {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      options.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
    }
    const current = this.model.pickupTimeFrom;
    if (current && !options.includes(current)) {
      options.push(current);
      options.sort();
    }
    return options;
  }

  /** "HH:MM" + 1 ora (per la fascia di ritiro di 1 ora quando non flessibile). */
  plusOneHour(t: string): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.date || !m.partnerId || !m.serviceTypeId || !m.recipientAddress.trim()
      || !m.recipientFirstName.trim() || !m.recipientLastName.trim()) {
      this.error.set(this.translate.instant('deliveryForm.error.requiredFields'));
      return;
    }

    const payload: Record<string, unknown> = {
      date: m.date,
      partnerId: m.partnerId,
      serviceTypeId: m.serviceTypeId,
      recipientAddress: m.recipientAddress.trim(),
      recipientFirstName: m.recipientFirstName.trim(),
      recipientLastName: m.recipientLastName.trim(),
      pickupFlexible: m.pickupFlexible,
      deliveryFlexible: m.deliveryFlexible,
      paymentOnDelivery: m.paymentOnDelivery,
      tryAndReturn: m.tryAndReturn,
      deliveryCodeRequired: m.deliveryCodeRequired,
      smsOnCreated: m.smsOnCreated,
      smsOnDeparted: m.smsOnDeparted,
      smsOnArrived: m.smsOnArrived,
      paymentStatus: m.paymentStatus,
      deluxyDelivery: m.deluxyDelivery,
      billable: m.billable,
      payable: m.payable,
      isFlexiblePrice: m.isFlexiblePrice,
    };
    for (const key of [
      'valetId', 'valetServiceId', 'status', 'customerId',
      'recipientIntercom', 'recipientPhone', 'recipientEmail',
      'senderFirstName', 'senderLastName', 'senderPhone', 'smsPhoneNo', 'ddtNumber', 'ddtFile',
      'flexiblePrice', 'notes', 'personalizeSaleNotes', 'internalNotes',
    ] as const) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    // Consegna: se flessibile (e consentito dal servizio) dalle–alle libere;
    // altrimenti la fascia scelta ha durata = fascia oraria del servizio.
    const deliveryFlexibleEffective = m.deliveryFlexible && !!this.selectedService()?.allowFlexibleTime;
    payload['deliveryFlexible'] = deliveryFlexibleEffective;
    if (m.deliveryTimeFrom) {
      payload['deliveryTimeFrom'] = m.deliveryTimeFrom;
      payload['deliveryTimeTo'] = deliveryFlexibleEffective ? m.deliveryTimeTo : this.addHours(m.deliveryTimeFrom, this.slotHours());
    }
    if (m.pickupTimeFrom) {
      payload['pickupTimeFrom'] = m.pickupTimeFrom;
      payload['pickupTimeTo'] = m.pickupFlexible ? m.pickupTimeTo : this.plusOneHour(m.pickupTimeFrom);
    }
    for (const key of ['paymentAmount', 'price', 'additionalPrice', 'deliveryPrice', 'valetSalary', 'valetAdditionalPrice', 'hours'] as const) {
      const v = m[key];
      if (v != null) payload[key] = Number(v);
    }

    const products = this.productRows
      .filter((r) => r.productId)
      .map((r) => ({
        productId: r.productId,
        quantity: r.quantity ?? 1,
        flexiblePrice: r.flexiblePrice,
        price: r.flexiblePrice && r.price != null ? Number(r.price) : undefined,
      }));
    // In modifica invio sempre i prodotti, anche a lista vuota: altrimenti
    // rimuoverli tutti non li cancellerebbe (l'API scrive solo le chiavi presenti).
    if (products.length || this.editId()) payload['products'] = products;

    this.saving.set(true);
    // Se richiesto, salva prima il destinatario come nuovo cliente in Clienti, poi crea la consegna.
    if (m.saveCustomer && !m.customerId) {
      const customerPayload: Record<string, unknown> = {
        firstName: m.recipientFirstName.trim(),
        lastName: m.recipientLastName.trim(),
      };
      if (m.recipientEmail.trim()) customerPayload['email'] = m.recipientEmail.trim();
      if (m.recipientPhone.trim()) customerPayload['phone'] = m.recipientPhone.trim();
      if (m.recipientAddress.trim()) customerPayload['address'] = m.recipientAddress.trim();
      if (m.partnerId) customerPayload['partnerId'] = m.partnerId;
      this.http.post<{ id: string }>(`${environment.apiUrl}/customers`, customerPayload).subscribe({
        next: (c) => { payload['customerId'] = c.id; this.postDelivery(payload, duplicate); },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.error.set(this.translate.instant('deliveryForm.error.customerNotSaved') + (Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('deliveryForm.error.genericShort')));
        },
      });
      return;
    }
    this.postDelivery(payload, duplicate);
  }

  /** Crea la consegna col payload dato. */
  private postDelivery(payload: Record<string, unknown>, duplicate: boolean): void {
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/deliveries/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/deliveries`, payload);

    req.subscribe({
      next: () => {
        // In modifica si torna al dettaglio; in creazione alla lista (o si resta per duplicare)
        if (id) { this.router.navigate(['/deliveries', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        this.router.navigate(['/deliveries']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('deliveryForm.error.createFailed'));
      },
    });
  }
}
