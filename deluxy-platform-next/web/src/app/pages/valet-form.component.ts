import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import {
  Partner,
  Province,
  SALARY_FREQUENCY_LABELS,
  ServiceType,
  VEHICLE_OPTIONS,
} from '../core/models';

interface ValetServiceRow {
  serviceTypeId: string;
  salary: number | null;
  salaryPerItem: number | null;
  extraKmPrice: number | null;
}

@Component({
  selector: 'app-valet-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/valets" class="back">← {{ 'valetForm.backToValets' | translate }}</a>
        <h1>{{ (editId() ? 'valetForm.editTitle' : 'valetForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'valetForm.caption' | translate }}</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- Informazioni generali -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'valetForm.sections.general' | translate }}</h2>
          <span class="block-sub">{{ 'valetForm.requiredHint' | translate }}</span>
        </header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'valetForm.fields.lastName' | translate }}</span>
            <input class="field" name="lastName" [(ngModel)]="model.lastName" required [attr.placeholder]="'valetForm.placeholders.lastName' | translate" /></label>
          <label class="fld"><span>{{ 'valetForm.fields.firstName' | translate }}</span>
            <input class="field" name="firstName" [(ngModel)]="model.firstName" required [attr.placeholder]="'valetForm.placeholders.firstName' | translate" /></label>
          <label class="fld"><span>{{ 'valetForm.fields.email' | translate }}</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" required [attr.placeholder]="'valetForm.placeholders.email' | translate" /></label>
          <label class="fld"><span>{{ 'valetForm.fields.phone' | translate }}</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" [attr.placeholder]="'valetForm.placeholders.phone' | translate" /></label>
          <label class="fld span-2"><span>{{ 'valetForm.fields.address' | translate }}</span>
            <input class="field" name="address" [(ngModel)]="model.address" [attr.placeholder]="'valetForm.placeholders.address' | translate" /></label>
        </div>

        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'valetForm.fields.birthPlace' | translate }}</span>
            <input class="field" name="birthPlace" [(ngModel)]="model.birthPlace" [attr.placeholder]="'valetForm.placeholders.birthPlace' | translate" /></label>
          <label class="fld"><span>{{ 'valetForm.fields.birthDate' | translate }}</span>
            <input class="field" type="date" name="birthDate" [(ngModel)]="model.birthDate" /></label>
        </div>

        <label class="toggle mt"><input type="checkbox" name="hasVat" [(ngModel)]="model.hasVat" /><span>{{ 'valetForm.fields.hasVat' | translate }}</span></label>
        @if (model.hasVat) {
          <div class="grid-2 sub-block">
            <label class="fld"><span>{{ 'valetForm.fields.vatNumber' | translate }}</span>
              <input class="field" name="vatNumber" [(ngModel)]="model.vatNumber" placeholder="IT01234567890" /></label>
          </div>
        } @else {
          <div class="grid-2 sub-block">
            <label class="fld"><span>{{ 'valetForm.fields.fiscalCode' | translate }}</span>
              <input class="field" name="fiscalCode" [(ngModel)]="model.fiscalCode" /></label>
            <label class="fld"><span>{{ 'valetForm.fields.withholdingPercent' | translate }}</span>
              <input class="field num" type="number" step="0.01" name="withholdingPercent" [(ngModel)]="model.withholdingPercent" /></label>
          </div>
        }
      </section>

      <!-- Stipendio -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'valetForm.sections.salary' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'valetForm.fields.salaryFrequency' | translate }}</span>
            <select class="field" name="salaryFrequency" [(ngModel)]="model.salaryFrequency">
              @for (f of salaryFrequencies; track f[0]) { <option [value]="f[0]">{{ ('enums.salaryFrequency.' + f[0]) | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'valetForm.fields.weeklyDepositLimit' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="weeklyDepositLimit" [(ngModel)]="model.weeklyDepositLimit" placeholder="€" /></label>
          <label class="fld span-2"><span>{{ 'valetForm.fields.iban' | translate }}</span>
            <input class="field" name="iban" [(ngModel)]="model.iban" placeholder="IT60 X054 …" /></label>
        </div>
      </section>

      <!-- Province di competenza -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'valetForm.sections.provinces' | translate }}</h2>
          <span class="block-sub">{{ 'valetForm.provincesHint' | translate }}</span>
        </header>
        <select class="field add-select" (change)="addTo(selectedProvinces, $any($event.target).value); $any($event.target).value=''">
          <option value="">{{ 'valetForm.addProvince' | translate }}</option>
          @for (p of availableProvinces(selectedProvinces); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }
        </select>
        <div class="chips picked">
          @for (p of provincesIn(selectedProvinces); track p.id) {
            <span class="chip on chip-rm">{{ p.code }} · {{ p.name }}<button type="button" class="x" (click)="removeFrom(selectedProvinces, p.id)" [attr.title]="'valetForm.remove' | translate">✕</button></span>
          }
          @if (selectedProvinces.size === 0) { <span class="muted">{{ 'valetForm.provincesEmpty' | translate }}</span> }
        </div>
      </section>

      <!-- Servizi -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'valetForm.sections.services' | translate }}</h2>
          <span class="block-sub">{{ 'valetForm.servicesHint' | translate }}</span>
        </header>
        @if (serviceRows.length === 0) { <p class="muted">{{ 'valetForm.servicesEmpty' | translate }}</p> }
        @for (row of serviceRows; track $index) {
          <div class="svc-row">
            <select class="field svc-type" [(ngModel)]="row.serviceTypeId" [name]="'svcType' + $index">
              <option value="">{{ 'valetForm.serviceTypePlaceholder' | translate }}</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select>
            <input class="field num" type="number" step="0.01" [attr.placeholder]="'valetForm.placeholders.salary' | translate" [(ngModel)]="row.salary" [name]="'svcSal' + $index" />
            <input class="field num" type="number" step="0.01" [attr.placeholder]="'valetForm.placeholders.perItem' | translate" [(ngModel)]="row.salaryPerItem" [name]="'svcItem' + $index" />
            <input class="field num" type="number" step="0.01" [attr.placeholder]="'valetForm.placeholders.extraKm' | translate" [(ngModel)]="row.extraKmPrice" [name]="'svcKm' + $index" />
            <button type="button" class="icon-btn" (click)="removeService($index)" [attr.title]="'valetForm.remove' | translate">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addService()">{{ 'valetForm.addService' | translate }}</button>
        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'valetForm.fields.minimumKmIncluded' | translate }}</span>
            <input class="field num" type="number" name="minimumKmIncluded" [(ngModel)]="model.minimumKmIncluded" /></label>
          <label class="fld"><span>{{ 'valetForm.fields.extraOutOfCityPrice' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="extraOutOfCityPrice" [(ngModel)]="model.extraOutOfCityPrice" /></label>
        </div>
      </section>

      <!-- Setup -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'valetForm.sections.setup' | translate }}</h2>
          <span class="block-sub">{{ 'valetForm.setupHint' | translate }}</span>
        </header>

        <div class="setup-group">
          <span class="group-label">{{ 'valetForm.groups.teamLeader' | translate }}</span>
          <label class="toggle"><input type="checkbox" name="isTeamLeader" [(ngModel)]="model.isTeamLeader" /><span>{{ 'valetForm.fields.isTeamLeader' | translate }}</span></label>
          @if (model.isTeamLeader) {
            <div class="sub-block">
              <span class="sub-hint">{{ 'valetForm.tlProvincesHint' | translate }}</span>
              <select class="field add-select" (change)="addTo(tlProvinces, $any($event.target).value); $any($event.target).value=''">
                <option value="">{{ 'valetForm.addProvince' | translate }}</option>
                @for (p of availableProvinces(tlProvinces); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }
              </select>
              <div class="chips picked mb">
                @for (p of provincesIn(tlProvinces); track p.id) {
                  <span class="chip on sm chip-rm">{{ p.code }}<button type="button" class="x" (click)="removeFrom(tlProvinces, p.id)">✕</button></span>
                }
                @if (tlProvinces.size === 0) { <span class="muted">{{ 'valetForm.tlProvincesEmpty' | translate }}</span> }
              </div>

              <span class="sub-hint">{{ 'valetForm.tlPartnersHint' | translate }}</span>
              <select class="field add-select" (change)="addTo(tlPartners, $any($event.target).value); $any($event.target).value=''">
                <option value="">{{ 'valetForm.addPartner' | translate }}</option>
                @for (pt of availablePartners(tlPartners, tlExcludedPartners); track pt.id) { <option [value]="pt.id">{{ pt.insegna }}</option> }
              </select>
              <div class="chips picked mb">
                @for (pt of partnersIn(tlPartners); track pt.id) {
                  <span class="chip on sm chip-rm">{{ pt.insegna }}<button type="button" class="x" (click)="removeFrom(tlPartners, pt.id)">✕</button></span>
                }
                @if (tlPartners.size === 0) { <span class="muted">{{ 'valetForm.tlPartnersEmpty' | translate }}</span> }
              </div>

              <span class="sub-hint">{{ 'valetForm.tlExcludedHint' | translate }}</span>
              <select class="field add-select" (change)="addTo(tlExcludedPartners, $any($event.target).value); $any($event.target).value=''">
                <option value="">{{ 'valetForm.excludePartner' | translate }}</option>
                @for (pt of availablePartners(tlExcludedPartners, tlPartners); track pt.id) { <option [value]="pt.id">{{ pt.insegna }}</option> }
              </select>
              <div class="chips picked">
                @for (pt of partnersIn(tlExcludedPartners); track pt.id) {
                  <span class="chip excl sm chip-rm">{{ pt.insegna }}<button type="button" class="x" (click)="removeFrom(tlExcludedPartners, pt.id)">✕</button></span>
                }
                @if (tlExcludedPartners.size === 0) { <span class="muted">{{ 'valetForm.tlExcludedEmpty' | translate }}</span> }
              </div>
            </div>
          }
        </div>

        <div class="setup-group">
          <span class="group-label">{{ 'valetForm.groups.vehicle' | translate }}</span>
          <div class="chips">
            @for (v of vehicles; track v) {
              <button type="button" class="chip" [class.on]="model.vehicle === v" (click)="model.vehicle = v">{{ ('enums.vehicle.' + v) | translate }}</button>
            }
          </div>
        </div>

        <div class="setup-group">
          <span class="group-label">{{ 'valetForm.groups.notifications' | translate }}</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="notifyByWhatsapp" [(ngModel)]="model.notifyByWhatsapp" /><span>{{ 'valetForm.fields.notifyByWhatsapp' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="notifyByEmail" [(ngModel)]="model.notifyByEmail" /><span>{{ 'valetForm.fields.notifyByEmail' | translate }}</span></label>
          </div>
        </div>
      </section>

      <!-- Note -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'valetForm.sections.notes' | translate }}</h2></header>
        <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea>
      </section>

      @if (justSaved()) { <div class="ok-card card" [innerHTML]="'valetForm.savedOk' | translate"></div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/valets" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'valetForm.createButton') | translate) }}
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
      .mt { margin-top: 16px; }
      .mb { margin-bottom: 14px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .sub-block { margin-top: 14px; padding: 16px; background: var(--fill); border-radius: var(--radius-m); }
      .sub-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { appearance: none; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 14px; font-size: 13px; font-family: inherit; color: var(--text); cursor: pointer; transition: all 0.15s var(--ease); }
      .chip.sm { padding: 4px 11px; font-size: 12.5px; }
      .chip:hover { background: var(--fill-hover); }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .add-select { max-width: 340px; margin-bottom: 10px; }
      .chips.picked { min-height: 8px; }
      .chip-rm { display: inline-flex; align-items: center; gap: 7px; }
      .chip .x { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 11px; line-height: 1; padding: 0; opacity: 0.65; }
      .chip .x:hover { opacity: 1; }
      .chip.excl { background: rgba(215,0,21,0.09); color: var(--red); border-color: rgba(215,0,21,0.22); }
      .svc-row { display: grid; grid-template-columns: 1.8fr repeat(3, 1fr) auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s var(--ease); }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .setup-group { padding: 14px 0; border-bottom: 1px solid var(--hairline); }
      .setup-group:last-child { border-bottom: none; padding-bottom: 0; }
      .setup-group:first-child { padding-top: 0; }
      .group-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .svc-row { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class ValetFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly provinces = signal<Province[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly partners = signal<Partner[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly selectedProvinces = new Set<string>();
  readonly tlProvinces = new Set<string>();
  readonly tlPartners = new Set<string>();
  readonly tlExcludedPartners = new Set<string>();
  readonly salaryFrequencies = Object.entries(SALARY_FREQUENCY_LABELS);
  readonly vehicles = VEHICLE_OPTIONS;

  serviceRows: ValetServiceRow[] = [];

  model = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    hasVat: false,
    vatNumber: '',
    fiscalCode: '',
    birthPlace: '',
    birthDate: '',
    iban: '',
    withholdingPercent: null as number | null,
    salaryFrequency: 'monthly',
    weeklyDepositLimit: null as number | null,
    minimumKmIncluded: null as number | null,
    extraOutOfCityPrice: null as number | null,
    isTeamLeader: false,
    vehicle: '',
    notifyByEmail: true,
    notifyByWhatsapp: false,
    notes: '',
  };

  /** Id valet in modifica (null = nuovo valet). */
  readonly editId = signal<string | null>(null);

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));
    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));

    // Modalita' modifica: /valets/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${api}/valets/${id}`).subscribe({
        next: (v) => this.prefill(v),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con il valet esistente. */
  private prefill(v: Record<string, any>): void {
    const m = this.model as Record<string, any>;
    for (const key of Object.keys(this.model)) {
      const val = v[key];
      if (val === null || val === undefined) continue;
      // birthDate arriva ISO: l'input[type=date] vuole YYYY-MM-DD
      if (key === 'birthDate' && typeof val === 'string') m[key] = val.slice(0, 10);
      else m[key] = val;
    }
    // Province di competenza (relazione ValetProvince)
    this.selectedProvinces.clear();
    for (const vp of (v['provinces'] as any[]) ?? []) {
      if (vp?.province?.id) this.selectedProvinces.add(vp.province.id);
    }
    // Le liste team leader sono salvate come stringa JSON di id lato API
    this.fillIdSet(this.tlProvinces, v['teamLeaderProvinces']);
    this.fillIdSet(this.tlPartners, v['teamLeaderPartners']);
    this.fillIdSet(this.tlExcludedPartners, v['teamLeaderExcludedPartners']);
    // Servizi/salari
    this.serviceRows = ((v['services'] as any[]) ?? []).map((s) => ({
      serviceTypeId: s.serviceType?.id ?? s.serviceTypeId ?? '',
      salary: s.salary ?? null,
      salaryPerItem: s.salaryPerItem ?? null,
      extraKmPrice: s.extraKmPrice ?? null,
    }));
  }

  /** Riempie un set di id da una stringa JSON (o da un array gia' deserializzato). */
  private fillIdSet(set: Set<string>, raw: unknown): void {
    set.clear();
    let list: unknown = raw;
    if (typeof raw === 'string') {
      try {
        list = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (Array.isArray(list)) for (const id of list) set.add(String(id));
  }

  addTo(set: Set<string>, id: string): void { if (id) set.add(id); }
  removeFrom(set: Set<string>, id: string): void { set.delete(id); }

  /** Province non ancora nel set (per la tendina "aggiungi"). */
  availableProvinces(set: Set<string>): Province[] {
    return this.provinces().filter((p) => !set.has(p.id));
  }
  provincesIn(set: Set<string>): Province[] {
    return this.provinces().filter((p) => set.has(p.id));
  }
  /** Partner non nel set e nemmeno nell'altro set (un partner non può essere insieme incluso ed escluso). */
  availablePartners(set: Set<string>, other: Set<string>): Partner[] {
    return this.partners().filter((p) => !set.has(p.id) && !other.has(p.id));
  }
  partnersIn(set: Set<string>): Partner[] {
    return this.partners().filter((p) => set.has(p.id));
  }

  addService(): void {
    this.serviceRows.push({ serviceTypeId: '', salary: null, salaryPerItem: null, extraKmPrice: null });
  }
  removeService(i: number): void { this.serviceRows.splice(i, 1); }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.firstName.trim() || !m.lastName.trim() || !m.email.trim()) {
      this.error.set(this.translate.instant('valetForm.errors.nameRequired'));
      return;
    }
    if (m.hasVat && !m.vatNumber.trim()) {
      this.error.set(this.translate.instant('valetForm.errors.vatRequired'));
      return;
    }
    if (!m.hasVat && !m.fiscalCode.trim()) {
      this.error.set(this.translate.instant('valetForm.errors.fiscalCodeRequired'));
      return;
    }

    const payload: Record<string, unknown> = {
      firstName: m.firstName.trim(),
      lastName: m.lastName.trim(),
      email: m.email.trim(),
      hasVat: m.hasVat,
      isTeamLeader: m.isTeamLeader,
      notifyByEmail: m.notifyByEmail,
      notifyByWhatsapp: m.notifyByWhatsapp,
      salaryFrequency: m.salaryFrequency,
    };
    // Con P.IVA: P.IVA (no CF, no ritenuta). Senza P.IVA: CF + % ritenuta.
    const fiscalKeys = m.hasVat ? (['vatNumber'] as const) : (['fiscalCode'] as const);
    for (const key of ['phone', 'address', 'birthPlace', 'birthDate', 'iban', 'vehicle', 'notes', ...fiscalKeys] as const) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    const numKeys = m.hasVat
      ? (['weeklyDepositLimit', 'minimumKmIncluded', 'extraOutOfCityPrice'] as const)
      : (['withholdingPercent', 'weeklyDepositLimit', 'minimumKmIncluded', 'extraOutOfCityPrice'] as const);
    for (const key of numKeys) {
      const v = m[key];
      if (v != null && v !== ('' as unknown)) payload[key] = Number(v);
    }
    // In modifica invio sempre le collezioni, anche vuote, altrimenti
    // svuotarle non le cancellerebbe (l'API scrive solo le chiavi presenti).
    const isEdit = !!this.editId();
    if (this.selectedProvinces.size || isEdit) payload['provinceIds'] = [...this.selectedProvinces];
    // Se il valet non è più team leader, le liste vanno azzerate.
    const tlProv = m.isTeamLeader ? [...this.tlProvinces] : [];
    const tlPart = m.isTeamLeader ? [...this.tlPartners] : [];
    const tlExcl = m.isTeamLeader ? [...this.tlExcludedPartners] : [];
    if (tlProv.length || isEdit) payload['teamLeaderProvinceIds'] = tlProv;
    if (tlPart.length || isEdit) payload['teamLeaderPartnerIds'] = tlPart;
    if (tlExcl.length || isEdit) payload['teamLeaderExcludedPartnerIds'] = tlExcl;

    const services = this.serviceRows
      .filter((r) => r.serviceTypeId && r.salary != null)
      .map((r) => ({
        serviceTypeId: r.serviceTypeId,
        salary: Number(r.salary),
        salaryPerItem: r.salaryPerItem != null ? Number(r.salaryPerItem) : undefined,
        extraKmPrice: r.extraKmPrice != null ? Number(r.extraKmPrice) : undefined,
      }));
    if (services.length || isEdit) payload['services'] = services;

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/valets/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/valets`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/valets', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        this.router.navigate(['/valets']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        const fallback = id ? 'valetForm.errors.updateError' : 'valetForm.errors.createError';
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant(fallback));
      },
    });
  }
}
