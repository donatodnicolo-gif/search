import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

/** Modello piatto del form (partnerIds selezionabili). */
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
 * Form modale (crea/modifica) di una regola carnet, riusato dalla pagina
 * Regole carnet e dalla scheda partner. Il parent lo monta solo quando serve
 * (con @if) e reagisce a (saved)/(closed).
 *
 * - ruleId = null → nuova regola; ruleId valorizzato → modifica (la carica da API).
 * - lockPartnerId → quando si apre da una scheda partner: quel partner resta
 *   sempre selezionato (checkbox disabilitata) cosi' la regola continua a
 *   valere per lui.
 */
@Component({
  selector: 'app-delivery-rule-form',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="overlay" (click)="close()"></div>
    <div class="modal">
      <header class="modal-head">
        <h2>{{ (ruleId ? 'deliveryRules.editTitle' : 'deliveryRules.newTitle') | translate }}</h2>
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
            @for (p of partners(); track p.id) {
              <option [value]="p.id" [disabled]="p.id === lockPartnerId">{{ p.insegna }}</option>
            }
          </select>
          <small class="muted">
            {{ 'deliveryRules.f.partnersHint' | translate }}
            @if (lockPartnerId) { · {{ 'deliveryRules.f.partnerLocked' | translate }} }
          </small>
        </label>

        @if (formError()) { <div class="error-inline">{{ formError() }}</div> }

        <footer class="modal-foot">
          <button type="button" class="btn btn-secondary" (click)="close()">{{ 'common.cancel' | translate }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
        </footer>
      </form>
    </div>
  `,
  styles: [
    `
      .btn-icon { border: none; background: none; cursor: pointer; font-size: 15px; padding: 4px 7px; border-radius: var(--radius-s); color: var(--text-secondary); }
      .btn-icon:hover { background: var(--fill); color: var(--text); }
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
      @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DeliveryRuleFormComponent implements OnInit {
  /** null = nuova regola; valorizzato = modifica. */
  @Input() ruleId: string | null = null;
  /** Partner che deve restare sempre incluso (apertura da scheda partner). */
  @Input() lockPartnerId: string | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly partners = signal<PartnerLite[]>([]);
  readonly serviceTypes = signal<ServiceTypeLite[]>([]);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  model: RuleForm = emptyForm();

  ngOnInit(): void {
    this.http.get<PartnerLite[]>(`${this.api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ServiceTypeLite[]>(`${this.api}/service-types`).subscribe((d) => this.serviceTypes.set(d));

    if (this.ruleId) {
      this.http.get<any>(`${this.api}/delivery-rules/${this.ruleId}`).subscribe((r) => {
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
          partnerIds: (r.partners ?? []).map((p: any) => p.partner.id),
        };
        this.ensureLocked();
      });
    } else {
      this.model = emptyForm();
      this.ensureLocked();
    }
  }

  /** Il partner "bloccato" deve sempre essere tra i selezionati. */
  private ensureLocked(): void {
    if (this.lockPartnerId && !this.model.partnerIds.includes(this.lockPartnerId)) {
      this.model.partnerIds = [...this.model.partnerIds, this.lockPartnerId];
    }
  }

  close(): void {
    this.closed.emit();
  }

  private payload(): Record<string, unknown> {
    const m = this.model;
    // Garantisce che il partner bloccato non venga tolto dal multi-select.
    const partnerIds =
      this.lockPartnerId && !m.partnerIds.includes(this.lockPartnerId)
        ? [...m.partnerIds, this.lockPartnerId]
        : m.partnerIds;
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
      serviceTypeId: m.serviceTypeId,
      partnerBillingAdjustment: Number(m.partnerBillingAdjustment) || 0,
      valetPayAdjustment: Number(m.valetPayAdjustment) || 0,
      toBill: m.toBill,
      toPay: m.toPay,
      active: m.active,
      partnerIds,
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
    const req = this.ruleId
      ? this.http.put(`${this.api}/delivery-rules/${this.ruleId}`, this.payload())
      : this.http.post(`${this.api}/delivery-rules`, this.payload());
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(e?.error?.message ?? 'Errore nel salvataggio');
      },
    });
  }
}
