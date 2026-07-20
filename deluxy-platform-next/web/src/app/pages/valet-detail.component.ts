import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { Partner, Province } from '../core/models';

interface ValetDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  hasVat?: boolean;
  vatNumber?: string;
  fiscalCode?: string;
  birthPlace?: string;
  birthDate?: string;
  iban?: string;
  withholdingPercent?: number;
  salaryFrequency?: string;
  weeklyDepositLimit?: number;
  minimumKmIncluded?: number;
  extraOutOfCityPrice?: number;
  isTeamLeader?: boolean;
  teamLeaderProvinces?: string;
  teamLeaderPartners?: string;
  teamLeaderExcludedPartners?: string;
  vehicle?: string;
  notifyByEmail?: boolean;
  notifyByWhatsapp?: boolean;
  notes?: string;
  active: boolean;
  provinces?: { province: { id: string; code: string; name: string } }[];
  services?: {
    serviceType?: { id: string; name?: string };
    salary?: number;
    salaryPerItem?: number;
    extraKmPrice?: number;
  }[];
}

/** Dettaglio valet (sola lettura). */
@Component({
  selector: 'app-valet-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/valets" class="back">← {{ 'valets.title' | translate }}</a>
      @if (valet(); as v) {
        <div class="title-row">
          <h1>{{ v.firstName }} {{ v.lastName }}</h1>
          <span class="pill" [class.on]="v.active">
            {{ (v.active ? 'common.active' : 'common.inactive') | translate }}
          </span>
          @if (canSeeCalendar()) {
            <a class="btn btn-secondary edit" [routerLink]="['/calendar']" [queryParams]="{ valetId: v.id }">{{ 'nav.calendario' | translate }}</a>
          }
          @if (canEdit()) {
            <a class="btn btn-secondary edit" [routerLink]="['/valets', v.id, 'edit']">{{ 'common.edit' | translate }}</a>
          }
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (valet(); as v) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'valetForm.sections.general' | translate }}</h2>
            <dl>
              <dt>{{ 'valets.col.email' | translate }}</dt><dd>{{ v.email }}</dd>
              <dt>{{ 'valets.col.phone' | translate }}</dt><dd>{{ v.phone || '—' }}</dd>
              <dt>{{ 'valetForm.fields.address' | translate }}</dt><dd>{{ v.address || '—' }}</dd>
              <dt>{{ 'valetForm.fields.birthPlace' | translate }}</dt><dd>{{ v.birthPlace || '—' }}</dd>
              <dt>{{ 'valetForm.fields.birthDate' | translate }}</dt><dd>{{ v.birthDate ? v.birthDate.slice(0, 10) : '—' }}</dd>
              <dt>{{ 'valetDetail.vatNumber' | translate }}</dt><dd>{{ v.vatNumber || '—' }}</dd>
              <dt>{{ 'valetDetail.fiscalCode' | translate }}</dt><dd>{{ v.fiscalCode || '—' }}</dd>
              <dt>{{ 'valetForm.fields.withholdingPercent' | translate }}</dt>
              <dd>{{ v.withholdingPercent != null ? v.withholdingPercent + ' %' : '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'valetForm.sections.salary' | translate }}</h2>
            <dl>
              <dt>{{ 'valetDetail.salaryFrequency' | translate }}</dt>
              <dd>{{ v.salaryFrequency ? ('enums.salaryFrequency.' + v.salaryFrequency | translate) : '—' }}</dd>
              <dt>{{ 'valetForm.fields.weeklyDepositLimit' | translate }}</dt>
              <dd>{{ v.weeklyDepositLimit != null ? v.weeklyDepositLimit + ' €' : '—' }}</dd>
              <dt>{{ 'valetForm.fields.iban' | translate }}</dt><dd>{{ v.iban || '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'valetForm.sections.provinces' | translate }}</h2>
            @if (v.provinces?.length) {
              <div class="chips">
                @for (vp of v.provinces; track vp.province.id) {
                  <span class="chip">{{ vp.province.code }} · {{ vp.province.name }}</span>
                }
              </div>
            } @else { <p class="muted">{{ 'valetForm.provincesEmpty' | translate }}</p> }
          </section>

          <section class="card block">
            <h2>{{ 'valetForm.groups.vehicle' | translate }}</h2>
            <dl>
              <dt>{{ 'valets.col.vehicle' | translate }}</dt>
              <dd>{{ v.vehicle ? ('enums.vehicle.' + v.vehicle | translate) : '—' }}</dd>
              <dt>{{ 'valetForm.fields.notifyByEmail' | translate }}</dt>
              <dd>{{ (v.notifyByEmail ? 'common.yes' : 'common.no') | translate }}</dd>
              <dt>{{ 'valetForm.fields.notifyByWhatsapp' | translate }}</dt>
              <dd>{{ (v.notifyByWhatsapp ? 'common.yes' : 'common.no') | translate }}</dd>
            </dl>
          </section>

          <section class="card block span-2">
            <h2>{{ 'valetForm.sections.services' | translate }}</h2>
            @if (v.services?.length) {
              <table class="mini">
                <thead><tr>
                  <th>{{ 'services.col.name' | translate }}</th>
                  <th class="num">{{ 'valetDetail.col.salary' | translate }}</th>
                  <th class="num">{{ 'valetDetail.col.perItem' | translate }}</th>
                  <th class="num">{{ 'valetDetail.col.extraKm' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (s of v.services; track $index) {
                    <tr>
                      <td>{{ s.serviceType?.name || '—' }}</td>
                      <td class="num">{{ s.salary != null ? s.salary + ' €' : '—' }}</td>
                      <td class="num">{{ s.salaryPerItem != null ? s.salaryPerItem + ' €' : '—' }}</td>
                      <td class="num">{{ s.extraKmPrice != null ? s.extraKmPrice + ' €' : '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'valetForm.servicesEmpty' | translate }}</p> }
            <dl class="mt">
              <dt>{{ 'valetForm.fields.minimumKmIncluded' | translate }}</dt>
              <dd>{{ v.minimumKmIncluded != null ? v.minimumKmIncluded : '—' }}</dd>
              <dt>{{ 'valetForm.fields.extraOutOfCityPrice' | translate }}</dt>
              <dd>{{ v.extraOutOfCityPrice != null ? v.extraOutOfCityPrice + ' €' : '—' }}</dd>
            </dl>
          </section>

          @if (v.isTeamLeader) {
            <section class="card block span-2">
              <h2>{{ 'valetForm.groups.teamLeader' | translate }}</h2>
              <span class="sub-hint">{{ 'valetDetail.teamLeaderProvinces' | translate }}</span>
              @if (tlProvinces().length) {
                <div class="chips mb">
                  @for (p of tlProvinces(); track p.id) { <span class="chip">{{ p.code }} · {{ p.name }}</span> }
                </div>
              } @else { <p class="muted mb">{{ 'valetForm.tlProvincesEmpty' | translate }}</p> }

              <span class="sub-hint">{{ 'valetDetail.teamLeaderPartners' | translate }}</span>
              @if (tlPartners().length) {
                <div class="chips mb">
                  @for (pt of tlPartners(); track pt.id) { <span class="chip">{{ pt.insegna }}</span> }
                </div>
              } @else { <p class="muted mb">{{ 'valetForm.tlPartnersEmpty' | translate }}</p> }

              <span class="sub-hint">{{ 'valetDetail.teamLeaderExcluded' | translate }}</span>
              @if (tlExcluded().length) {
                <div class="chips">
                  @for (pt of tlExcluded(); track pt.id) { <span class="chip excl">{{ pt.insegna }}</span> }
                </div>
              } @else { <p class="muted">{{ 'valetForm.tlExcludedEmpty' | translate }}</p> }
            </section>
          }

          @if (v.notes) {
            <section class="card block span-2">
              <h2>{{ 'valetForm.sections.notes' | translate }}</h2>
              <p class="notes">{{ v.notes }}</p>
            </section>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .edit { margin-left: auto; text-decoration: none; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .mt { margin-top: 16px; }
      .mb { margin-bottom: 14px; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      .notes { margin: 0; font-size: 13.5px; white-space: pre-wrap; }
      .sub-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 8px; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { border: 1px solid var(--hairline-strong); border-radius: 980px; padding: 4px 12px; font-size: 12.5px; }
      .chip.excl { background: rgba(215,0,21,0.09); color: var(--red); border-color: rgba(215,0,21,0.22); }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .pill { border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill.on { background: rgba(36,138,61,0.12); color: var(--green); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class ValetDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  readonly valet = signal<ValetDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Anagrafiche di supporto per risolvere gli id delle liste team leader. */
  private readonly provinces = signal<Province[]>([]);
  private readonly partners = signal<Partner[]>([]);

  /** Modifica valet: admin, operation, project manager (come l'API). */
  canEdit(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  /** Calendario del valet: admin/operation. */
  canSeeCalendar(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  constructor() {
    const api = environment.apiUrl;
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<ValetDetail>(`${api}/valets/${id}`).subscribe({
      next: (v) => {
        this.valet.set(v);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('valets.loadError'));
      },
    });
    // Le liste team leader sono id: servono province e partner per mostrarne i nomi.
    this.http.get<Province[]>(`${api}/provinces`).subscribe({
      next: (d) => this.provinces.set(d),
      error: () => this.provinces.set([]),
    });
    this.http.get<Partner[]>(`${api}/partners`).subscribe({
      next: (d) => this.partners.set(d),
      error: () => this.partners.set([]),
    });
  }

  tlProvinces(): Province[] {
    const ids = this.idsOf(this.valet()?.teamLeaderProvinces);
    return this.provinces().filter((p) => ids.has(p.id));
  }
  tlPartners(): Partner[] {
    const ids = this.idsOf(this.valet()?.teamLeaderPartners);
    return this.partners().filter((p) => ids.has(p.id));
  }
  tlExcluded(): Partner[] {
    const ids = this.idsOf(this.valet()?.teamLeaderExcludedPartners);
    return this.partners().filter((p) => ids.has(p.id));
  }

  /** Le liste team leader arrivano come stringa JSON di id (compat. SQLite). */
  private idsOf(raw: unknown): Set<string> {
    const out = new Set<string>();
    let list: unknown = raw;
    if (typeof raw === 'string') {
      try {
        list = JSON.parse(raw);
      } catch {
        return out;
      }
    }
    if (Array.isArray(list)) for (const id of list) out.add(String(id));
    return out;
  }
}
