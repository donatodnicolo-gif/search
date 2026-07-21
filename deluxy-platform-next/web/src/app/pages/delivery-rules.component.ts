import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { DeliveryRuleFormComponent } from './delivery-rule-form.component';

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

/**
 * Regole carnet (Consegne Regole dell'app reale, /partner/delivery/rules):
 * numero di consegne garantito giornaliero e/o totale, con plus/minus su
 * fatturazione partner e paga valet, estendibile a piu' partner.
 */
@Component({
  selector: 'app-delivery-rules',
  standalone: true,
  imports: [TranslatePipe, DatePipe, DeliveryRuleFormComponent],
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
      <app-delivery-rule-form
        [ruleId]="editId()"
        (saved)="onSaved()"
        (closed)="close()"
      />
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
      .error-card { padding: 14px 16px; border-radius: var(--radius-m); background: rgba(215,0,21,0.08); color: var(--red); }
    `,
  ],
})
export class DeliveryRulesComponent {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  readonly rules = signal<DeliveryRule[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly formOpen = signal(false);
  readonly editId = signal<string | null>(null);

  constructor() {
    this.load();
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
    this.editId.set(null);
    this.formOpen.set(true);
  }

  openEdit(r: DeliveryRule): void {
    this.editId.set(r.id);
    this.formOpen.set(true);
  }

  close(): void {
    this.formOpen.set(false);
  }

  /** Il form modale ha salvato: chiude e ricarica la lista. */
  onSaved(): void {
    this.formOpen.set(false);
    this.load();
  }

  remove(r: DeliveryRule): void {
    if (!confirm(`Eliminare la regola "${r.name}"?`)) return;
    this.http.delete(`${this.api}/delivery-rules/${r.id}`).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Errore nella cancellazione'),
    });
  }
}
