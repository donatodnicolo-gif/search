import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import {
  Customer,
  DELIVERY_PAYMENT_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  Partner,
  Product,
  ServiceType,
  ValetRef,
} from '../core/models';

interface ProductRow {
  productId: string;
  quantity: number | null;
}

@Component({
  selector: 'app-delivery-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/deliveries" class="back">← Consegne</a>
        <h1>Nuova consegna</h1>
        <p class="page-caption">Servizio, ritiro, destinatario, prodotti e listino.</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- 1. Scelta del servizio -->
      <section class="card block">
        <header class="block-head"><h2>Scelta del servizio</h2>
          <span class="block-sub">In base all'indirizzo si scelgono partner e servizio.</span></header>
        <div class="grid-2">
          <label class="fld"><span>Data consegna *</span>
            <input class="field" type="date" name="date" [(ngModel)]="model.date" required /></label>
          <label class="fld"><span>Indirizzo destinatario *</span>
            <input class="field" name="recipientAddress" [(ngModel)]="model.recipientAddress" required placeholder="Via …, CAP Città (PR)" /></label>
          <label class="fld"><span>Partner *</span>
            <select class="field" name="partnerId" [(ngModel)]="model.partnerId" required>
              <option value="">Seleziona partner…</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
          <label class="fld"><span>Servizio *</span>
            <select class="field" name="serviceTypeId" [(ngModel)]="model.serviceTypeId" required>
              <option value="">Seleziona servizio…</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
        </div>
      </section>

      <!-- 2. Data di consegna e ritiro -->
      <section class="card block">
        <header class="block-head"><h2>Data di consegna e ritiro</h2></header>
        <div class="grid-4">
          <label class="fld"><span>Consegna dalle</span>
            <input class="field" type="time" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom" /></label>
          <label class="fld"><span>Consegna alle</span>
            <input class="field" type="time" name="deliveryTimeTo" [(ngModel)]="model.deliveryTimeTo" /></label>
          <label class="fld"><span>Ritiro dalle *</span>
            <input class="field" type="time" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom" /></label>
          <label class="fld"><span>Ritiro alle *</span>
            <input class="field" type="time" name="pickupTimeTo" [(ngModel)]="model.pickupTimeTo" /></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="pickupFlexible" [(ngModel)]="model.pickupFlexible" /><span>Fascia oraria ritiro flessibile</span></label>
      </section>

      <!-- 3. Scelta del salario (assegnazione) -->
      <section class="card block">
        <header class="block-head"><h2>Assegnazione</h2>
          <span class="block-sub">Valet e stato (admin / operation).</span></header>
        <div class="grid-2">
          <label class="fld"><span>Valet</span>
            <select class="field" name="valetId" [(ngModel)]="model.valetId">
              <option value="">Non assegnato</option>
              @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
          <label class="fld"><span>Stato consegna</span>
            <select class="field" name="status" [(ngModel)]="model.status">
              <option value="">Automatico</option>
              @for (s of statusOptions; track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }
            </select></label>
          <label class="fld"><span>Stato del pagamento</span>
            <select class="field" name="paymentStatus" [(ngModel)]="model.paymentStatus">
              @for (s of paymentStatuses; track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }
            </select></label>
          <label class="fld"><span>Valet Servizio</span>
            <select class="field" name="valetServiceId" [(ngModel)]="model.valetServiceId">
              <option value="">— automatico —</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="deluxyDelivery" [(ngModel)]="model.deluxyDelivery" /><span>Vendita Deluxy</span></label>
      </section>

      <!-- 4. Destinatario e mittente -->
      <section class="card block">
        <header class="block-head"><h2>Destinatario e mittente</h2></header>
        <label class="fld"><span>Cliente esistente</span>
          <select class="field" name="customerId" [(ngModel)]="model.customerId" (ngModelChange)="applyCustomer($event)">
            <option value="">— nuovo destinatario —</option>
            @for (c of customers(); track c.id) { <option [value]="c.id">{{ c.lastName }} {{ c.firstName }}</option> }
          </select></label>
        <div class="grid-2 mt">
          <label class="fld"><span>Cognome destinatario *</span>
            <input class="field" name="recipientLastName" [(ngModel)]="model.recipientLastName" required /></label>
          <label class="fld"><span>Nome destinatario *</span>
            <input class="field" name="recipientFirstName" [(ngModel)]="model.recipientFirstName" required /></label>
          <label class="fld"><span>Citofono *</span>
            <input class="field" name="recipientIntercom" [(ngModel)]="model.recipientIntercom" /></label>
          <label class="fld"><span>Telefono destinatario</span>
            <input class="field" name="recipientPhone" [(ngModel)]="model.recipientPhone" placeholder="+39 …" /></label>
          <label class="fld"><span>Email destinatario</span>
            <input class="field" type="email" name="recipientEmail" [(ngModel)]="model.recipientEmail" /></label>
        </div>
        <div class="divider"></div>
        <div class="grid-2">
          <label class="fld"><span>Cognome mittente</span>
            <input class="field" name="senderLastName" [(ngModel)]="model.senderLastName" /></label>
          <label class="fld"><span>Nome mittente</span>
            <input class="field" name="senderFirstName" [(ngModel)]="model.senderFirstName" /></label>
          <label class="fld"><span>Telefono mittente</span>
            <input class="field" name="senderPhone" [(ngModel)]="model.senderPhone" /></label>
        </div>
        <label class="fld mt" style="max-width:280px"><span>SMS telefonici (numero)</span>
          <input class="field" name="smsPhoneNo" [(ngModel)]="model.smsPhoneNo" placeholder="+39 …" /></label>
        <div class="toggles mt">
          <span class="group-label">Invia SMS</span>
          <label class="toggle"><input type="checkbox" name="smsOnCreated" [(ngModel)]="model.smsOnCreated" /><span>Alla creazione</span></label>
          <label class="toggle"><input type="checkbox" name="smsOnDeparted" [(ngModel)]="model.smsOnDeparted" /><span>Alla partenza</span></label>
          <label class="toggle"><input type="checkbox" name="smsOnArrived" [(ngModel)]="model.smsOnArrived" /><span>All'arrivo</span></label>
        </div>
      </section>

      <!-- 5. Gestione dell'ordine -->
      <section class="card block">
        <header class="block-head"><h2>Gestione dell'ordine</h2>
          <span class="block-sub">Prodotti del partner mostrati per primi.</span></header>
        @if (productRows.length === 0) { <p class="muted">Nessun prodotto aggiunto.</p> }
        @for (row of productRows; track $index) {
          <div class="prod-row">
            <select class="field" [(ngModel)]="row.productId" [name]="'prod' + $index">
              <option value="">Prodotto…</option>
              @for (p of sortedProducts(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.partner ? '' : ' (generico)' }}</option> }
            </select>
            <input class="field num qty" type="number" min="1" placeholder="Qtà" [(ngModel)]="row.quantity" [name]="'qty' + $index" />
            <button type="button" class="icon-btn" (click)="removeProduct($index)" title="Rimuovi">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addProduct()">+ Aggiungi prodotto</button>

        <div class="toggles mt">
          <label class="toggle"><input type="checkbox" name="paymentOnDelivery" [(ngModel)]="model.paymentOnDelivery" /><span>Pagamento alla consegna</span></label>
          <label class="toggle"><input type="checkbox" name="tryAndReturn" [(ngModel)]="model.tryAndReturn" /><span>Prova e reso del prodotto</span></label>
        </div>
        @if (model.paymentOnDelivery) {
          <label class="fld mt" style="max-width:260px"><span>Contanti da incassare (€)</span>
            <input class="field num" type="number" step="0.01" name="paymentAmount" [(ngModel)]="model.paymentAmount" /></label>
        }
      </section>

      <!-- 6. Listino -->
      <section class="card block">
        <header class="block-head"><h2>Listino</h2>
          <span class="block-sub">Lasciando vuoto il prezzo, viene calcolato dal servizio del partner.</span></header>
        <div class="listino">
          <div>
            <span class="group-label">Da fatturare (partner)</span>
            <label class="toggle mb"><input type="checkbox" name="billable" [(ngModel)]="model.billable" /><span>Da fatturare</span></label>
            <div class="grid-2">
              <label class="fld"><span>Prezzo (€)</span>
                <input class="field num" type="number" step="0.01" name="price" [(ngModel)]="model.price" placeholder="auto" /></label>
              <label class="fld"><span>Plus / minus (€)</span>
                <input class="field num" type="number" step="0.01" name="additionalPrice" [(ngModel)]="model.additionalPrice" /></label>
            </div>
          </div>
          <div>
            <span class="group-label">Da pagare (valet)</span>
            <label class="toggle mb"><input type="checkbox" name="payable" [(ngModel)]="model.payable" /><span>Da pagare</span></label>
            <div class="grid-2">
              <label class="fld"><span>Valet salario (€)</span>
                <input class="field num" type="number" step="0.01" name="valetSalary" [(ngModel)]="model.valetSalary" /></label>
              <label class="fld"><span>Plus / minus (€)</span>
                <input class="field num" type="number" step="0.01" name="valetAdditionalPrice" [(ngModel)]="model.valetAdditionalPrice" /></label>
            </div>
          </div>
        </div>
        <label class="toggle mt"><input type="checkbox" name="isFlexiblePrice" [(ngModel)]="model.isFlexiblePrice" /><span>Prezzo flessibile</span></label>
        @if (model.isFlexiblePrice) {
          <label class="fld mt"><span>Dettaglio prezzo flessibile</span>
            <input class="field" name="flexiblePrice" [(ngModel)]="model.flexiblePrice" placeholder="Es. da 20 a 50 €" /></label>
        }
        @if (isHourly()) {
          <label class="fld mt" style="max-width:200px"><span>Ore (servizio a ora)</span>
            <input class="field num" type="number" min="1" name="hours" [(ngModel)]="model.hours" /></label>
        }
      </section>

      <!-- 7. Documentazione e note -->
      <section class="card block">
        <header class="block-head"><h2>Documentazione e note</h2></header>
        <div class="grid-2">
          <label class="fld"><span>Numero DDT</span>
            <input class="field" name="ddtNumber" [(ngModel)]="model.ddtNumber" /></label>
          <label class="fld"><span>File DDT (URL)</span>
            <input class="field" name="ddtFile" [(ngModel)]="model.ddtFile" placeholder="https://…" /></label>
        </div>
        <label class="fld span-2 mt"><span>Note</span>
          <textarea class="field" rows="2" name="notes" [(ngModel)]="model.notes"></textarea></label>
        <label class="fld span-2 mt"><span>Personalizzazione</span>
          <textarea class="field" rows="2" name="personalizeSaleNotes" [(ngModel)]="model.personalizeSaleNotes"></textarea></label>
        <label class="fld span-2 mt"><span>Note interne <em>(admin / operation / valet)</em></span>
          <textarea class="field" rows="2" name="internalNotes" [(ngModel)]="model.internalNotes"></textarea></label>
        <label class="toggle mt"><input type="checkbox" name="deliveryCodeRequired" [(ngModel)]="model.deliveryCodeRequired" /><span>Codice di consegna richiesto</span></label>
      </section>

      @if (justSaved()) { <div class="ok-card card">Consegna creata ✓ — i valori restano compilati: premi <strong>Crea</strong> o <strong>Duplica</strong> per crearne un'altra.</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/deliveries" class="btn btn-secondary">Annulla</a>
        <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">Duplica</button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Salvataggio…' : 'Crea consegna' }}
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
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .fld em { color: var(--text-tertiary); font-style: normal; font-weight: 400; }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .divider { height: 1px; background: var(--hairline); margin: 18px 0; }
      .prod-row { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; margin-bottom: 10px; align-items: center; }
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
export class DeliveryFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly partners = signal<Partner[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  readonly products = signal<Product[]>([]);
  readonly customers = signal<Customer[]>([]);
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
    pickupTimeFrom: '',
    pickupTimeTo: '',
    pickupFlexible: false,
    valetId: '',
    status: '',
    paymentStatus: 'default',
    customerId: '',
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

  readonly isHourly = computed(() => {
    const s = this.serviceTypes().find((x) => x.id === this.model.serviceTypeId);
    return s?.pricingModel === 'A_ORA';
  });

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));
    this.http.get<ValetRef[]>(`${api}/valets`).subscribe((d) => this.valets.set(d as ValetRef[]));
    this.http.get<Product[]>(`${api}/products`).subscribe((d) => this.products.set(d));
    this.http.get<Customer[]>(`${api}/customers`).subscribe((d) => this.customers.set(d));
  }

  applyCustomer(id: string): void {
    const c = this.customers().find((x) => x.id === id);
    if (!c) return;
    this.model.recipientFirstName = c.firstName ?? '';
    this.model.recipientLastName = c.lastName ?? '';
    if (c.address) this.model.recipientAddress = c.address;
    if (c.intercom) this.model.recipientIntercom = c.intercom;
    if (c.phone) this.model.recipientPhone = c.phone;
    if (c.email) this.model.recipientEmail = c.email;
  }

  addProduct(): void { this.productRows.push({ productId: '', quantity: 1 }); }
  removeProduct(i: number): void { this.productRows.splice(i, 1); }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.date || !m.partnerId || !m.serviceTypeId || !m.recipientAddress.trim()
      || !m.recipientFirstName.trim() || !m.recipientLastName.trim()) {
      this.error.set('Compila data, partner, servizio, indirizzo e nome/cognome destinatario.');
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
      'valetId', 'valetServiceId', 'status', 'customerId', 'deliveryTimeFrom', 'deliveryTimeTo',
      'pickupTimeFrom', 'pickupTimeTo', 'recipientIntercom', 'recipientPhone', 'recipientEmail',
      'senderFirstName', 'senderLastName', 'senderPhone', 'smsPhoneNo', 'ddtNumber', 'ddtFile',
      'flexiblePrice', 'notes', 'personalizeSaleNotes', 'internalNotes',
    ] as const) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    for (const key of ['paymentAmount', 'price', 'additionalPrice', 'valetSalary', 'valetAdditionalPrice', 'hours'] as const) {
      const v = m[key];
      if (v != null) payload[key] = Number(v);
    }

    const products = this.productRows
      .filter((r) => r.productId)
      .map((r) => ({ productId: r.productId, quantity: r.quantity ?? 1 }));
    if (products.length) payload['products'] = products;

    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/deliveries`, payload).subscribe({
      next: () => {
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        this.router.navigate(['/deliveries']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nella creazione della consegna');
      },
    });
  }
}
