import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface PartnerLite {
  id: string;
  insegna: string;
}
interface ServiceTypeLite {
  id: string;
  name: string;
}
interface RulePartner {
  partner: PartnerLite;
}
interface DeliveryRule {
  id: string;
  name: string;
  dailyRule: boolean;
  dailyCount: number;
  totalRule: boolean;
  totalCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  kmDistance: number | null;
  serviceType: ServiceTypeLite | null;
  partnerBillingAdjustment: number;
  valetPayAdjustment: number;
  toBill: boolean;
  toPay: boolean;
  active: boolean;
  partners: RulePartner[];
}

/** Modello del form (piatto, con partnerIds selezionabili). */
interface RuleForm {
  name: string;
  dailyRule: boolean;
  dailyCount: number;
  totalRule: boolean;
  totalCount: number;
  periodStart: string;
  periodEnd: string;
  timeFrom: string;
  timeTo: string;
  kmDistance: number | null;
  serviceTypeId: string;
  partnerBillingAdjustment: number;
  valetPayAdjustment: number;
  toBill: boolean;
  toPay: boolean;
  active: boolean;
  partnerIds: string[];
}

function emptyForm(): RuleForm {
  return {
    name: '',
    dailyRule: true,
    dailyCount: 1,
    totalRule: false,
    totalCount: 0,
    periodStart: '',
    periodEnd: '',
    timeFrom: '',
    timeTo: '',
    kmDistance: null,
    serviceTypeId: '',
    partnerBillingAdjustment: 0,
    valetPayAdjustment: 0,
    toBill: true,
    toPay: true,
    active: true,
    partnerIds: [],
  };
}

/**
 * Regole carnet (Consegne Regole dell'app reale, /partner/delivery/rules):
 * numero di consegne garantito giornaliero e/o totale, con plus/minus su
 * fatturazione partner e paga valet, estendibile a piu' partner.
 */
@Component({
  selector: 'app-delivery-rules',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'deliveryRules.title' | translate }}</h1>
        <p class="page-caption">{{ rules().length }} {{ 'deliveryRules.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-primary" (click)="openNew()">+ {{ 'deliveryRules.add' | translate }}</button>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (rules().length === 0) {
      <div class="card state-card">
        <strong>{{ 'deliveryRules.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'deliveryRules.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'deliveryRules.col.name' | translate }}</th>
              <th>{{ 'deliveryRules.col.rule' | translate }}</th>
              <th>{{ 'deliveryRules.col.period' | translate }}</th>
              <th>{{ 'deliveryRules.col.service' | translate }}</th>
              <th>{{ 'deliveryRules.col.adjust' | translate }}</th>
              <th>{{ 'deliveryRules.col.partners' | translate }}</th>
              <th>{{ 'deliveryRules.col.status' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rules(); track r.id) {
              <tr>
                <td class="strong">{{ r.name }}</td>
                <td>
                  @if (r.dailyRule) { <span class="pill">{{ 'deliveryRules.daily' | translate }}: {{ r.dailyCount }}</span> }
                  @if (r.totalRule) { <span class="pill">{{ 'deliveryRules.total' | translate }}: {{ r.totalCount }}</span> }
                </td>
                <td>
                  @if (r.periodStart || r.periodEnd) {
                    {{ r.periodStart ? (r.periodStart | date: 'd/M/yy') : '…' }} – {{ r.periodEnd ? (r.periodEnd | date: 'd/M/yy') : '…' }}
                  } @else { <span class="muted">—</span> }
                </td>
                <td>{{ r.serviceType?.name ?? '—' }}</td>
                <td class="nowrap">
                  <span class="muted">P</span> {{ money(r.partnerBillingAdjustment) }} · <span class="muted">V</span> {{ money(r.valetPayAdjustment) }}
                </td>
                <td>{{ r.partners.length || '—' }}</td>
                <td>
                  <span class="badge" [class.badge-on]="r.active" [class.badge-off]="!r.active">
                    <span class="dot"></span>{{ (r.active ? 'common.active' : 'common.inactive') | translate }}
                  </span>
                </td>
                <td class="nowrap">
                  <button class="btn-icon" (click)="openEdit(r)" [title]="'common.edit' | translate">✎</button>
                  <button class="btn-icon danger" (click)="remove(r)" [title]="'common.delete' | translate">🗑</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (formOpen()) {
      <div class="overlay" (click)="close()"></div>
      <div class="modal">
        <header class="modal-head">
          <h2>{{ (editId() ? 'deliveryRules.editTitle' : 'deliveryRules.newTitle') | translate }}</h2>
          <button class="btn-icon" (click)="close()">✕</button>
        </header>
        <form class="modal-body" (ngSubmit)="save()">
          <label class="fld">
            <span>{{ 'deliveryRules.f.name' | translate }} *</span>
            <input class="field" name="name" [(ngModel)]="model.name" required />
          </label>

          <div class="rule-block">
            <label class="toggle"><input type="checkbox" name="dailyRule" [(ngModel)]="model.dailyRule" /><span>{{ 'deliveryRules.f.dailyRule' | translate }}</span></label>
            @if (model.dailyRule) {
              <label class="fld inline"><span>{{ 'deliveryRules.f.dailyCount' | translate }}</span><input class="field sm" type="number" min="1" name="dailyCount" [(ngModel)]="model.dailyCount" /></label>
            }
          </div>
          <div class="rule-block">
            <label class="toggle"><input type="checkbox" name="totalRule" [(ngModel)]="model.totalRule" /><span>{{ 'deliveryRules.f.totalRule' | translate }}</span></label>
            @if (model.totalRule) {
              <label class="fld inline"><span>{{ 'deliveryRules.f.totalCount' | translate }}</span><input class="field sm" type="number" min="1" name="totalCount" [(ngModel)]="model.totalCount" /></label>
            }
          </div>

          <div class="row2">
            <label class="fld"><span>{{ 'deliveryRules.f.periodStart' | translate }}</span><input class="field" type="date" name="periodStart" [(ngModel)]="model.periodStart" /></label>
            <label class="fld"><span>{{ 'deliveryRules.f.periodEnd' | translate }}</span><input class="field" type="date" name="periodEnd" [(ngModel)]="model.periodEnd" /></label>
          </div>
          <div class="row2">
            <label class="fld"><span>{{ 'deliveryRules.f.timeFrom' | translate }}</span><input class="field" type="time" name="timeFrom" [(ngModel)]="model.timeFrom" /></label>
            <label class="fld"><span>{{ 'deliveryRules.f.timeTo' | translate }}</span><input class="field" type="time" name="timeTo" [(ngModel)]="model.timeTo" /></label>
          </div>
          <div class="row2">
            <label class="fld"><span>{{ 'deliveryRules.f.kmDistance' | translate }}</span><input class="field" type="number" min="0" step="0.1" name="kmDistance" [(ngModel)]="model.kmDistance" /></label>
            <label class="fld">
              <span>{{ 'deliveryRules.f.serviceType' | translate }}</span>
              <select class="field" name="serviceTypeId" [(ngModel)]="model.serviceTypeId">
                <option value="">{{ 'common.none' | translate }}</option>
                @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
            </label>
          </div>
          <div class="row2">
            <label class="fld"><span>{{ 'deliveryRules.f.partnerAdjust' | translate }}</span><input class="field" type="number" step="0.01" name="pAdj" [(ngModel)]="model.partnerBillingAdjustment" /></label>
            <label class="fld"><span>{{ 'deliveryRules.f.valetAdjust' | translate }}</span><input class="field" type="number" step="0.01" name="vAdj" [(ngModel)]="model.valetPayAdjustment" /></label>
          </div>

          <div class="toggles-row">
            <label class="toggle"><input type="checkbox" name="toBill" [(ngModel)]="model.toBill" /><span>{{ 'deliveryRules.f.toBill' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="toPay" [(ngModel)]="model.toPay" /><span>{{ 'deliveryRules.f.toPay' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="active" [(ngModel)]="model.active" /><span>{{ 'common.active' | translate }}</span></label>
          </div>

          <label class="fld">
            <span>{{ 'deliveryRules.f.partners' | translate }}</span>
            <select class="field multi" name="partnerIds" multiple [(ngModel)]="model.partnerIds">
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select>
            <small class="muted">{{ 'deliveryRules.f.partnersHint' | translate }}</small>
          </label>

          @if (formError()) { <div class="error-inline">{{ formError() }}</div> }

          <footer class="modal-foot">
            <button type="button" class="btn btn-secondary" (click)="close()">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
          </footer>
        </form>
      </div>
    }
  `,
  styles: [
    `
      .pill { display: inline-block; padding: 2px 9px; margin-right: 4px; border-radius: var(--radius-pill); background: var(--fill); font-size: 12px; font-weight: 600; }
      .nowrap { white-space: nowrap; }
      .badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: var(--radius-pill); font-size: 12px; font-weight: 600; }
      .badge .dot { width: 7px; height: 7px; border-radius: 50%; }
      .badge-on { background: rgba(36, 138, 61, 0.12); color: var(--green); } .badge-on .dot { background: var(--green); }
      .badge-off { background: var(--fill); color: var(--text-secondary); } .badge-off .dot { background: var(--text-tertiary); }
      .btn-icon { border: none; background: none; cursor: pointer; font-size: 15px; padding: 4px 7px; border-radius: var(--radius-s); color: var(--text-secondary); }
      .btn-icon:hover { background: var(--fill); color: var(--text); }
      .btn-icon.danger:hover { color: var(--red); }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.28); z-index: 40; }
      .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 620px; max-width: 94vw; max-height: 90vh; overflow-y: auto; background: var(--surface); border-radius: var(--radius-l); box-shadow: var(--shadow-float); z-index: 41; }
      .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; border-bottom: 1px solid var(--hairline); }
      .modal-head h2 { font-size: 18px; }
      .modal-body { display: flex; flex-direction: column; gap: 14px; padding: 20px 22px; }
      .fld { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
      .fld.inline { flex-direction: row; align-items: center; gap: 10px; }
      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .field.sm { width: 90px; } .field.multi { min-height: 96px; }
      .rule-block { display: flex; align-items: center; gap: 16px; padding: 10px 12px; border: 1px solid var(--hairline); border-radius: var(--radius-m); }
      .toggles-row { display: flex; gap: 20px; flex-wrap: wrap; }
      .modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding-top: 8px; }
      .error-inline { color: var(--red); font-size: 13px; }
      .error-card { padding: 14px 16px; border-radius: var(--radius-m); background: rgba(215,0,21,0.08); color: var(--red); }
      @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DeliveryRulesComponent {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly rules = signal<DeliveryRule[]>([]);
  readonly partners = signal<PartnerLite[]>([]);
  readonly serviceTypes = signal<ServiceTypeLite[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formOpen = signal(false);
  readonly editId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  model: RuleForm = emptyForm();

  constructor() {
    this.load();
    this.http.get<PartnerLite[]>(`${this.api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ServiceTypeLite[]>(`${this.api}/service-types`).subscribe((d) => this.serviceTypes.set(d));
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<DeliveryRule[]>(`${this.api}/delivery-rules`).subscribe({
      next: (d) => {
        this.rules.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Errore nel caricamento delle regole');
        this.loading.set(false);
      },
    });
  }

  money(v: number): string {
    const s = v > 0 ? '+' : '';
    return `${s}${v.toFixed(2)}€`;
  }

  openNew(): void {
    this.model = emptyForm();
    this.editId.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  openEdit(r: DeliveryRule): void {
    this.model = {
      name: r.name,
      dailyRule: r.dailyRule,
      dailyCount: r.dailyCount,
      totalRule: r.totalRule,
      totalCount: r.totalCount,
      periodStart: r.periodStart ? r.periodStart.slice(0, 10) : '',
      periodEnd: r.periodEnd ? r.periodEnd.slice(0, 10) : '',
      timeFrom: r.timeFrom ?? '',
      timeTo: r.timeTo ?? '',
      kmDistance: r.kmDistance,
      serviceTypeId: r.serviceType?.id ?? '',
      partnerBillingAdjustment: r.partnerBillingAdjustment,
      valetPayAdjustment: r.valetPayAdjustment,
      toBill: r.toBill,
      toPay: r.toPay,
      active: r.active,
      partnerIds: r.partners.map((p) => p.partner.id),
    };
    this.editId.set(r.id);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  close(): void {
    this.formOpen.set(false);
  }

  private payload(): Record<string, unknown> {
    const m = this.model;
    return {
      name: m.name.trim(),
      dailyRule: m.dailyRule,
      dailyCount: Number(m.dailyCount) || 0,
      totalRule: m.totalRule,
      totalCount: Number(m.totalCount) || 0,
      periodStart: m.periodStart || undefined,
      periodEnd: m.periodEnd || undefined,
      timeFrom: m.timeFrom || undefined,
      timeTo: m.timeTo || undefined,
      kmDistance: m.kmDistance === null || m.kmDistance === undefined ? undefined : Number(m.kmDistance),
      serviceTypeId: m.serviceTypeId, // '' = scollega in update
      partnerBillingAdjustment: Number(m.partnerBillingAdjustment) || 0,
      valetPayAdjustment: Number(m.valetPayAdjustment) || 0,
      toBill: m.toBill,
      toPay: m.toPay,
      active: m.active,
      partnerIds: m.partnerIds,
    };
  }

  save(): void {
    if (!this.model.name.trim()) {
      this.formError.set('Il nome è obbligatorio');
      return;
    }
    if (!this.model.dailyRule && !this.model.totalRule) {
      this.formError.set('Attiva almeno una regola tra giornaliera e totale');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const id = this.editId();
    const req = id
      ? this.http.put(`${this.api}/delivery-rules/${id}`, this.payload())
      : this.http.post(`${this.api}/delivery-rules`, this.payload());
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(e?.error?.message ?? 'Errore nel salvataggio');
      },
    });
  }

  remove(r: DeliveryRule): void {
    if (!confirm(`Eliminare la regola "${r.name}"?`)) return;
    this.http.delete(`${this.api}/delivery-rules/${r.id}`).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Errore nella cancellazione'),
    });
  }
}
