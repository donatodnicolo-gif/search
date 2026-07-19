import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { SERVICE_PRICING_OPTIONS } from '../core/models';

@Component({
  selector: 'app-service-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/services" class="back">← {{ 'serviceForm.backToServices' | translate }}</a>
        <h1>{{ (editId() ? 'serviceForm.editTitle' : 'serviceForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'serviceForm.caption' | translate }}</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>{{ 'serviceForm.service.title' | translate }}</h2>
          <span class="block-sub">{{ 'serviceForm.service.requiredNote' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'serviceForm.service.name' | translate }}</span>
            <input class="field" name="name" [(ngModel)]="model.name" required [attr.placeholder]="'serviceForm.service.namePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'serviceForm.service.pricingModel' | translate }}</span>
            <select class="field" name="pricingModel" [(ngModel)]="model.pricingModel" required>
              @for (t of pricingOptions; track t.value) { <option [value]="t.value">{{ 'enums.servicePricingLong.' + t.value | translate }}</option> }
            </select></label>
        </div>

        <div class="setup-group mt">
          <span class="group-label">{{ 'serviceForm.service.scope' | translate }}</span>
          <div class="chips">
            <button type="button" class="chip" [class.on]="model.scope === 'partner'" (click)="model.scope='partner'">{{ 'enums.serviceScope.partner' | translate }}</button>
            <button type="button" class="chip" [class.on]="model.scope === 'valet'" (click)="model.scope='valet'">{{ 'enums.serviceScope.valet' | translate }}</button>
            <button type="button" class="chip" [class.on]="model.scope === 'both'" (click)="model.scope='both'">{{ 'serviceForm.service.scopeBoth' | translate }}</button>
          </div>
        </div>

        @if (model.pricingModel === 'MAGAZZINO') {
          <div class="sub-block">
            <span class="sub-hint">{{ 'serviceForm.service.magazzinoHint' | translate }}</span>
            <div class="grid-3">
              <label class="fld"><span>{{ 'serviceForm.service.basePrice' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="basePrice" [(ngModel)]="model.basePrice" /></label>
              <label class="fld"><span>{{ 'serviceForm.service.perPiecePrice' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="perPiecePrice" [(ngModel)]="model.perPiecePrice" /></label>
              <label class="fld"><span>{{ 'serviceForm.service.deliveryPrice' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="deliveryPrice" [(ngModel)]="model.deliveryPrice" /></label>
            </div>
          </div>
        }
        @if (model.pricingModel === 'A_ORA') {
          <label class="fld mt" style="max-width:200px"><span>{{ 'serviceForm.service.minHours' | translate }}</span>
            <input class="field num" type="number" min="1" name="minHours" [(ngModel)]="model.minHours" /></label>
        }

        <label class="fld span-2 mt"><span>{{ 'serviceForm.service.notes' | translate }}</span>
          <textarea class="field" rows="2" name="notes" [(ngModel)]="model.notes"></textarea></label>
        <label class="toggle mt"><input type="checkbox" name="hideCustomerInfo" [(ngModel)]="model.hideCustomerInfo" /><span>{{ 'serviceForm.service.hideCustomerInfo' | translate }}</span></label>
      </section>

      <!-- Setup prenotazione -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'serviceForm.setup.title' | translate }}</h2>
          <span class="block-sub">{{ 'serviceForm.setup.subtitle' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'serviceForm.setup.noticeDays' | translate }}</span>
            <input class="field num" type="number" min="0" name="noticeDays" [(ngModel)]="model.noticeDays" [attr.placeholder]="'serviceForm.setup.noticeDaysPlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'serviceForm.setup.slotHours' | translate }}</span>
            <select class="field" name="slotHours" [(ngModel)]="model.slotHours">
              <option [ngValue]="null">—</option>
              <option [ngValue]="1">{{ 'serviceForm.setup.slotHours1' | translate }}</option>
              <option [ngValue]="2">{{ 'serviceForm.setup.slotHours2' | translate }}</option>
              <option [ngValue]="4">{{ 'serviceForm.setup.slotHours4' | translate }}</option>
            </select></label>
          <label class="fld"><span>{{ 'serviceForm.setup.minOrderTime' | translate }}</span>
            <select class="field" name="minOrderTime" [(ngModel)]="model.minOrderTime">
              <option value="">—</option>
              @for (h of hours24; track h) { <option [value]="h">{{ h }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'serviceForm.setup.maxOrderTime' | translate }}</span>
            <select class="field" name="maxOrderTime" [(ngModel)]="model.maxOrderTime">
              <option value="">—</option>
              @for (h of hours24; track h) { <option [value]="h">{{ h }}</option> }
            </select></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="allowFlexibleTime" [(ngModel)]="model.allowFlexibleTime" /><span>{{ 'serviceForm.setup.allowFlexibleTime' | translate }}</span></label>
        <p class="hint" [innerHTML]="'serviceForm.setup.hint' | translate"></p>
      </section>

      @if (justSaved()) { <div class="ok-card card" [innerHTML]="'serviceForm.savedNotice' | translate"></div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/services" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'serviceForm.submit') | translate) }}</button>
      </div>
    </form>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .mt { margin-top: 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .setup-group { padding-top: 4px; }
      .group-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { appearance: none; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-family: inherit; color: var(--text); cursor: pointer; transition: all 0.15s var(--ease); }
      .chip:hover { background: var(--fill); }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .sub-block { margin-top: 14px; padding: 16px; background: var(--fill); border-radius: var(--radius-m); }
      .sub-block .field { background: var(--surface); }
      .sub-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 10px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      .hint { margin: 14px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      @media (max-width: 720px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ServiceFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);
  readonly pricingOptions = SERVICE_PRICING_OPTIONS;
  /** 00:00 … 23:00 per le tendine ora min/max inserimento. */
  readonly hours24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  model = {
    name: '',
    pricingModel: 'PREZZO_FISSO',
    scope: 'partner',
    basePrice: null as number | null,
    perPiecePrice: null as number | null,
    deliveryPrice: null as number | null,
    minHours: null as number | null,
    noticeDays: null as number | null,
    slotHours: null as number | null,
    minOrderTime: '',
    maxOrderTime: '',
    allowFlexibleTime: false,
    notes: '',
    hideCustomerInfo: false,
  };

  /** Id servizio in modifica (null = nuovo servizio). */
  readonly editId = signal<string | null>(null);

  constructor() {
    // Modalita' modifica: /services/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${environment.apiUrl}/service-types/${id}`).subscribe({
        next: (s) => this.prefill(s),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con il servizio esistente. */
  private prefill(s: Record<string, any>): void {
    const m = this.model as Record<string, any>;
    for (const key of Object.keys(this.model)) {
      const v = s[key];
      if (v === null || v === undefined) continue;
      m[key] = v;
    }
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.name.trim()) { this.error.set(this.translate.instant('serviceForm.nameRequired')); return; }

    const payload: Record<string, unknown> = {
      name: m.name.trim(),
      pricingModel: m.pricingModel,
      scope: m.scope,
      hideCustomerInfo: m.hideCustomerInfo,
    };
    if (m.notes.trim()) payload['notes'] = m.notes.trim();
    if (m.pricingModel === 'MAGAZZINO') {
      if (m.basePrice != null) payload['basePrice'] = Number(m.basePrice);
      if (m.perPiecePrice != null) payload['perPiecePrice'] = Number(m.perPiecePrice);
      if (m.deliveryPrice != null) payload['deliveryPrice'] = Number(m.deliveryPrice);
    }
    if (m.pricingModel === 'A_ORA' && m.minHours != null) payload['minHours'] = Number(m.minHours);
    // Setup prenotazione
    if (m.noticeDays != null) payload['noticeDays'] = Number(m.noticeDays);
    if (m.slotHours != null) payload['slotHours'] = Number(m.slotHours);
    if (m.minOrderTime.trim()) payload['minOrderTime'] = m.minOrderTime.trim();
    if (m.maxOrderTime.trim()) payload['maxOrderTime'] = m.maxOrderTime.trim();
    payload['allowFlexibleTime'] = m.allowFlexibleTime;

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/service-types/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/service-types`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/services', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/services']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('serviceForm.createError'));
      },
    });
  }
}
