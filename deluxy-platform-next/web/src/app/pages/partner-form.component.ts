import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

@Component({
  selector: 'app-partner-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/partners" class="back">← Partner</a>
        <h1>Nuovo partner</h1>
        <p class="page-caption">
          Anagrafica, province servite, servizi, fatturazione, sicurezza e integrazioni.
        </p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- Informazioni generali -->
      <section class="card block">
        <header class="block-head">
          <h2>Informazioni generali</h2>
          <span class="block-sub">I campi con * sono obbligatori.</span>
        </header>
        <div class="grid-2">
          <label class="fld"><span>Insegna *</span>
            <input class="field" name="insegna" [(ngModel)]="model.insegna" required placeholder="Es. Fioraio Milano Centro" /></label>
          <label class="fld"><span>Email *</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" required placeholder="ordini@partner.it" /></label>
          <label class="fld"><span>Ragione sociale</span>
            <input class="field" name="businessName" [(ngModel)]="model.businessName" placeholder="Partner S.r.l." /></label>
          <label class="fld"><span>Telefono</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" placeholder="+39 …" /></label>
          <label class="fld"><span>Partita IVA</span>
            <input class="field" name="vatNumber" [(ngModel)]="model.vatNumber" placeholder="IT01234567890" /></label>
          <label class="fld"><span>Codice fiscale</span>
            <input class="field" name="fiscalCode" [(ngModel)]="model.fiscalCode" /></label>
          <label class="fld span-2"><span>Indirizzo</span>
            <input class="field" name="address" [(ngModel)]="model.address" placeholder="Via …, CAP Città (PR)" /></label>
          <label class="fld"><span>Nome referente</span>
            <input class="field" name="contactName" [(ngModel)]="model.contactName" placeholder="Nome" /></label>
          <label class="fld"><span>Cognome referente</span>
            <input class="field" name="contactSurname" [(ngModel)]="model.contactSurname" placeholder="Cognome" /></label>
        </div>
      </section>

      <!-- Province servite -->
      <section class="card block">
        <header class="block-head">
          <h2>Province servite</h2>
          <span class="block-sub">Il partner sarà selezionabile solo nelle consegne di queste province.</span>
        </header>
        @if (provinces().length === 0) { <p class="muted">Nessuna provincia configurata.</p> }
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
          <h2>Servizi abilitati</h2>
          <span class="block-sub">Prezzo per servizio; KM inclusi ed extra valgono per i prezzi fissi.</span>
        </header>
        @if (serviceRows.length === 0) { <p class="muted">Nessun servizio aggiunto.</p> }
        @for (row of serviceRows; track $index) {
          <div class="svc-row">
            <select class="field svc-type" [(ngModel)]="row.serviceTypeId" [name]="'svcType' + $index">
              <option value="">Tipo di servizio…</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select>
            <input class="field num" type="number" step="0.01" placeholder="Prezzo €" [(ngModel)]="row.price" [name]="'svcPrice' + $index" />
            <input class="field num" type="number" placeholder="KM incl." [(ngModel)]="row.includedKm" [name]="'svcKm' + $index" />
            <input class="field num" type="number" step="0.01" placeholder="€/KM extra" [(ngModel)]="row.extraKmPrice" [name]="'svcKmP' + $index" />
            <input class="field num" type="number" step="0.01" placeholder="Extra f.città" [(ngModel)]="row.extraOutOfCityPrice" [name]="'svcOut' + $index" />
            <button type="button" class="icon-btn" (click)="removeService($index)" title="Rimuovi">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addService()">+ Aggiungi servizio</button>
      </section>

      <!-- Categorie -->
      <section class="card block">
        <header class="block-head">
          <h2>Categorie vendute</h2>
          <span class="block-sub">Determinano priorità e sconti per provincia.</span>
        </header>
        @if (categories().length === 0) { <p class="muted">Nessuna categoria configurata.</p> }
        @else {
          <div class="chips">
            @for (c of categories(); track c.id) {
              <button type="button" class="chip" [class.on]="selectedCategories.has(c.id)" (click)="toggle(selectedCategories, c.id)">{{ c.name }}</button>
            }
          </div>
        }
      </section>

      <!-- Pagamenti e contratto -->
      <section class="card block">
        <header class="block-head"><h2>Pagamenti e contratto</h2></header>
        <div class="grid-2">
          <label class="fld"><span>Metodo di pagamento</span>
            <select class="field" name="paymentMethod" [(ngModel)]="model.paymentMethod">
              <option value="">—</option>
              @for (m of paymentMethods; track m[0]) { <option [value]="m[0]">{{ m[1] }}</option> }
            </select></label>
          <label class="fld"><span>Stato del pagamento</span>
            <select class="field" name="paymentStatus" [(ngModel)]="model.paymentStatus">
              @for (s of paymentStatuses; track s[0]) { <option [value]="s[0]">{{ s[1] }}</option> }
            </select></label>
          <label class="fld"><span>Contratto — dal</span>
            <input class="field" type="date" name="contractStart" [(ngModel)]="model.contractStart" /></label>
          <label class="fld"><span>Contratto — al</span>
            <input class="field" type="date" name="contractEnd" [(ngModel)]="model.contractEnd" /></label>
          <label class="fld"><span>Conto bancario (IBAN)</span>
            <input class="field" name="bankAccount" [(ngModel)]="model.bankAccount" placeholder="IT60 X054 …" /></label>
          <label class="fld"><span>Intestatario del conto</span>
            <input class="field" name="bankAccountName" [(ngModel)]="model.bankAccountName" /></label>
          <label class="fld"><span>Codice SDI</span>
            <input class="field" name="sdiCode" [(ngModel)]="model.sdiCode" placeholder="Fatturazione elettronica" /></label>
        </div>
      </section>

      <!-- Fatturazione e notifiche -->
      <section class="card block">
        <header class="block-head"><h2>Fatturazione e notifiche</h2></header>
        <div class="grid-2">
          <label class="fld span-2"><span>Email per le fatture</span>
            <input class="field" type="email" name="invoiceEmail" [(ngModel)]="model.invoiceEmail" placeholder="fatture@partner.it" /></label>
        </div>
        <div class="toggles">
          <label class="toggle"><input type="checkbox" name="invoicingEnabled" [(ngModel)]="model.invoicingEnabled" /><span>Abilita fatturazione</span></label>
          <label class="toggle"><input type="checkbox" name="smsTemplatesEnabled" [(ngModel)]="model.smsTemplatesEnabled" /><span>Possibilità di inviare SMS</span></label>
          <label class="toggle"><input type="checkbox" name="whatsappNotifications" [(ngModel)]="model.whatsappNotifications" /><span>Notifiche WhatsApp</span></label>
          <label class="toggle"><input type="checkbox" name="mailNotifications" [(ngModel)]="model.mailNotifications" /><span>Notifiche mail</span></label>
        </div>
      </section>

      <!-- Vendita e sicurezza -->
      <section class="card block">
        <header class="block-head"><h2>Vendita e sicurezza</h2></header>
        <div class="grid-2">
          <label class="fld"><span>URL del negozio</span>
            <input class="field" name="storeUrl" [(ngModel)]="model.storeUrl" placeholder="https://…" /></label>
          <label class="fld"><span>Immagine (URL)</span>
            <input class="field" name="imageUrl" [(ngModel)]="model.imageUrl" placeholder="https://…" /></label>
        </div>
        <div class="toggles">
          <label class="toggle"><input type="checkbox" name="isMultiPickup" [(ngModel)]="model.isMultiPickup" /><span>Indirizzo di ritiro multiplo</span></label>
          <label class="toggle"><input type="checkbox" name="valetIdentityCheck" [(ngModel)]="model.valetIdentityCheck" /><span>Verifica identità valet</span></label>
          <label class="toggle"><input type="checkbox" name="deliveryCodeRequired" [(ngModel)]="model.deliveryCodeRequired" /><span>Codice di consegna richiesto</span></label>
          <label class="toggle"><input type="checkbox" name="isWarehouse" [(ngModel)]="model.isWarehouse" /><span>Partner magazzino</span></label>
        </div>
      </section>

      <!-- WooCommerce e note -->
      <section class="card block">
        <header class="block-head"><h2>Integrazione WooCommerce e note</h2></header>
        <label class="fld span-2"><span>WooCommerce API key</span>
          <div class="key-row">
            <input class="field" name="woocommerceApiKey" [(ngModel)]="model.woocommerceApiKey" placeholder="Chiave per il plugin deluxy-send-order" />
            <button type="button" class="btn btn-secondary" (click)="generateKey()">Genera</button>
            <button type="button" class="btn btn-secondary" (click)="copyKey()" [disabled]="!model.woocommerceApiKey">Copia</button>
          </div>
        </label>
        <label class="fld span-2" style="margin-top:14px"><span>Note</span>
          <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea></label>
      </section>

      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/partners" class="btn btn-secondary">Annulla</a>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Salvataggio…' : 'Crea partner' }}
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
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
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
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s var(--ease); }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; margin-top: 16px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .key-row { display: flex; gap: 8px; }
      .key-row .field { flex: 1; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .svc-row { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class PartnerFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly provinces = signal<Province[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly selectedProvinces = new Set<string>();
  readonly selectedCategories = new Set<string>();
  readonly paymentMethods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly paymentStatuses = Object.entries(PAYMENT_STATUS_LABELS);

  serviceRows: ServiceRow[] = [];

  model = {
    insegna: '',
    email: '',
    businessName: '',
    phone: '',
    vatNumber: '',
    fiscalCode: '',
    address: '',
    contactName: '',
    contactSurname: '',
    paymentMethod: '',
    paymentStatus: 'active',
    contractStart: '',
    contractEnd: '',
    bankAccount: '',
    bankAccountName: '',
    sdiCode: '',
    invoiceEmail: '',
    invoicingEnabled: false,
    smsTemplatesEnabled: false,
    whatsappNotifications: false,
    mailNotifications: false,
    storeUrl: '',
    imageUrl: '',
    isMultiPickup: false,
    valetIdentityCheck: false,
    deliveryCodeRequired: false,
    isWarehouse: false,
    woocommerceApiKey: '',
    notes: '',
  };

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
    this.http.get<Category[]>(`${api}/categories`).subscribe((d) => this.categories.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));
  }

  toggle(set: Set<string>, id: string): void {
    set.has(id) ? set.delete(id) : set.add(id);
  }

  addService(): void {
    this.serviceRows.push({ serviceTypeId: '', price: null, includedKm: null, extraKmPrice: null, extraOutOfCityPrice: null });
  }

  removeService(i: number): void {
    this.serviceRows.splice(i, 1);
  }

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

  submit(): void {
    this.error.set(null);
    if (!this.model.insegna.trim() || !this.model.email.trim()) {
      this.error.set('Insegna ed email sono obbligatori.');
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
      isWarehouse: m.isWarehouse,
      paymentStatus: m.paymentStatus,
    };
    for (const key of [
      'businessName', 'phone', 'vatNumber', 'fiscalCode', 'address',
      'contactName', 'contactSurname', 'paymentMethod', 'contractStart', 'contractEnd',
      'bankAccount', 'bankAccountName', 'sdiCode', 'invoiceEmail',
      'storeUrl', 'imageUrl', 'woocommerceApiKey', 'notes',
    ] as const) {
      const v = (m as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    if (this.selectedProvinces.size) payload['provinceIds'] = [...this.selectedProvinces];
    if (this.selectedCategories.size) payload['categoryIds'] = [...this.selectedCategories];

    const services = this.serviceRows
      .filter((r) => r.serviceTypeId && r.price != null)
      .map((r) => ({
        serviceTypeId: r.serviceTypeId,
        price: Number(r.price),
        includedKm: r.includedKm != null ? Number(r.includedKm) : undefined,
        extraKmPrice: r.extraKmPrice != null ? Number(r.extraKmPrice) : undefined,
        extraOutOfCityPrice: r.extraOutOfCityPrice != null ? Number(r.extraOutOfCityPrice) : undefined,
      }));
    if (services.length) payload['services'] = services;

    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/partners`, payload).subscribe({
      next: () => this.router.navigate(['/partners']),
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nella creazione del partner');
      },
    });
  }
}
