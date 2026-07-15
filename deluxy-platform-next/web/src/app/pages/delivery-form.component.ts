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
          <span class="block-sub">Prima il servizio: determina il preavviso (data minima) e le fasce orarie di consegna.</span></header>
        <div class="grid-2">
          <label class="fld"><span>Servizio *</span>
            <select class="field" name="serviceTypeId" [(ngModel)]="model.serviceTypeId" (ngModelChange)="onServiceChange()" required>
              <option value="">Seleziona servizio…</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
          <label class="fld"><span>Indirizzo destinatario *</span>
            <input class="field" name="recipientAddress" [(ngModel)]="model.recipientAddress" (ngModelChange)="onAddressChange()" required placeholder="Via …, CAP Città (PR)" />
            @if (addressProvince()) { <span class="slot-hint">Provincia {{ addressProvince()?.code }} → mostrati solo partner/valet abilitati</span> }
            @else if (model.recipientAddress) { <span class="slot-hint warn">Provincia non riconosciuta: partner/valet non filtrati per provincia.</span> }
          </label>
          <label class="fld"><span>Data consegna *</span>
            <input class="field" type="date" name="date" [(ngModel)]="model.date" [min]="deliveryMinDate()" required />
            @if (selectedService()?.noticeDays) { <span class="slot-hint">Preavviso {{ selectedService()?.noticeDays }} g → dal {{ deliveryMinDate() }}</span> }
          </label>
          <label class="fld"><span>Partner *</span>
            <select class="field" name="partnerId" [(ngModel)]="model.partnerId" required>
              <option value="">Seleziona partner…</option>
              @for (p of filteredPartners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select>
            @if (model.serviceTypeId && filteredPartners().length === 0) { <span class="slot-hint warn">Nessun partner con questo servizio nella provincia dell'indirizzo.</span> }
          </label>
        </div>
      </section>

      <!-- 2. Data di consegna e ritiro -->
      <section class="card block">
        <header class="block-head"><h2>Data di consegna e ritiro</h2>
          <span class="block-sub">La consegna usa le fasce del servizio; il ritiro ha fascia automatica di 1 ora salvo flessibile.</span></header>

        <!-- Consegna -->
        @if (!selectedService()) {
          <p class="muted">Seleziona prima un servizio per impostare la fascia di consegna.</p>
        } @else {
          @if (selectedService()?.allowFlexibleTime) {
            <label class="toggle"><input type="checkbox" name="deliveryFlexible" [(ngModel)]="model.deliveryFlexible" /><span>Fascia oraria consegna flessibile</span></label>
          }
          @if (model.deliveryFlexible && selectedService()?.allowFlexibleTime) {
            <div class="grid-2 mt">
              <label class="fld"><span>Consegna dalle</span>
                <input class="field" type="time" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom" /></label>
              <label class="fld"><span>Consegna alle</span>
                <input class="field" type="time" name="deliveryTimeTo" [(ngModel)]="model.deliveryTimeTo" /></label>
            </div>
          } @else {
            <label class="fld mt" style="max-width:320px"><span>Fascia oraria consegna <em>(fasce di {{ slotHours() }} ora/e)</em></span>
              <select class="field" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom">
                <option value="">Seleziona fascia…</option>
                @for (slot of deliverySlots(); track slot.from) { <option [value]="slot.from">{{ slot.from }}–{{ slot.to }}</option> }
              </select>
              @if (deliverySlots().length === 0) { <span class="slot-hint warn">Nessuna fascia disponibile: controlla ora min/max e fascia del servizio.</span> }
            </label>
          }
        }

        <!-- Ritiro -->
        <label class="toggle mt2"><input type="checkbox" name="pickupFlexible" [(ngModel)]="model.pickupFlexible" /><span>Fascia oraria ritiro flessibile</span></label>
        @if (model.pickupFlexible) {
          <div class="grid-2 mt">
            <label class="fld"><span>Ritiro dalle *</span>
              <input class="field" type="time" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom" /></label>
            <label class="fld"><span>Ritiro alle *</span>
              <input class="field" type="time" name="pickupTimeTo" [(ngModel)]="model.pickupTimeTo" /></label>
          </div>
        } @else {
          <label class="fld mt" style="max-width:280px"><span>Ora ritiro * <em>(fascia di 1 ora)</em></span>
            <input class="field" type="time" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom" />
            @if (model.pickupTimeFrom) { <span class="slot-hint">→ {{ model.pickupTimeFrom }}–{{ plusOneHour(model.pickupTimeFrom) }}</span> }
          </label>
        }
      </section>

      <!-- 3. Scelta del salario (assegnazione) -->
      <section class="card block">
        <header class="block-head"><h2>Assegnazione</h2>
          <span class="block-sub">Valet e stato (admin / operation).</span></header>
        <div class="grid-2">
          <label class="fld"><span>Valet</span>
            <select class="field" name="valetId" [(ngModel)]="model.valetId">
              <option value="">Non assegnato</option>
              @for (v of filteredValets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
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
          <div class="prod-item">
            <div class="prod-top">
              <select class="field" [(ngModel)]="row.productId" (ngModelChange)="onProductChange(row)" [name]="'prod' + $index">
                <option value="">Prodotto…</option>
                @for (p of sortedProducts(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.partner ? '' : ' (generico)' }}</option> }
              </select>
              <input class="field num qty" type="number" min="1" placeholder="Qtà" [(ngModel)]="row.quantity" [name]="'qty' + $index" />
              <button type="button" class="icon-btn" (click)="removeProduct($index)" title="Rimuovi">✕</button>
            </div>
            <div class="prod-bottom">
              <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.flexiblePrice" (change)="onFlexToggle(row)" [name]="'pflex' + $index" /><span>Prezzo flessibile</span></label>
              @if (row.flexiblePrice) {
                <span class="price-lbl">Prezzo (€)</span>
                <input class="field num price-in" type="number" step="0.01" [(ngModel)]="row.price" [name]="'pprice' + $index" />
              } @else {
                <span class="price-static">Prezzo: <strong>{{ productPrice(row.productId) != null ? (productPrice(row.productId) + ' €') : '—' }}</strong></span>
              }
            </div>
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
export class DeliveryFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

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

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));
    this.http.get<ValetRef[]>(`${api}/valets`).subscribe((d) => this.valets.set(d as ValetRef[]));
    this.http.get<Product[]>(`${api}/products`).subscribe((d) => this.products.set(d));
    this.http.get<Customer[]>(`${api}/customers`).subscribe((d) => this.customers.set(d));
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
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

  /** Al cambio indirizzo: rileva la provincia e sincronizza le selezioni. */
  onAddressChange(): void {
    this.addressProvince.set(this.detectProvince(this.model.recipientAddress));
    this.syncSelections();
  }

  /** Cerca nell'indirizzo un codice provincia (es. "(MI)"), un nome provincia o una città nota. */
  private detectProvince(address: string): Province | null {
    const a = (address ?? '').trim();
    if (!a) return null;
    const lower = a.toLowerCase();
    for (const p of this.provinces()) {
      const codeRe = new RegExp(`(^|[^A-Za-z])${p.code}([^A-Za-z]|$)`);
      if (codeRe.test(a)) return p;
      if (p.name && lower.includes(p.name.toLowerCase())) return p;
      for (const c of p.cities ?? []) {
        if (c.name && lower.includes(c.name.toLowerCase())) return p;
      }
    }
    return null;
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

  /** "HH:MM" + 1 ora (per le fasce di 1 ora quando non flessibile). */
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
    for (const key of ['paymentAmount', 'price', 'additionalPrice', 'valetSalary', 'valetAdditionalPrice', 'hours'] as const) {
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
