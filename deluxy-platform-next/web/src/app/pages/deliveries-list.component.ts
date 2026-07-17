import { HttpClient, HttpParams } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { DELIVERY_STATUS_LABELS, Delivery, Province, ValetRef } from '../core/models';
import { detectProvince } from '../core/province.util';
import { DeliveryMapComponent } from './delivery-map.component';

/** Icona per tipo di servizio (stroke 24x24, stile shell). */
const SERVICE_ICONS: Record<string, string> = {
  PREZZO_FISSO: '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M4 11h16M12 7v13M8 7l1.5-3h5L16 7"/>',
  A_ORA: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  VENDITA: '<path d="M4 5h2l2.2 10.5a1.5 1.5 0 0 0 1.47 1.2h6.9a1.5 1.5 0 0 0 1.45-1.1L20 8H7"/><circle cx="10.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/>',
  MAGAZZINO: '<path d="M5 9.5 6.2 4h11.6L19 9.5M5 9.5v9A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-9M5 9.5h14M10 20v-5h4v5"/>',
  CORPORATE: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>',
};

@Component({
  selector: 'app-deliveries-list',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, TranslatePipe, DeliveryMapComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'deliveries.title' | translate }}</h1>
        <p class="page-caption">{{ 'deliveries.caption' | translate }}</p>
      </div>
      <div class="filters">
        <select class="field" [(ngModel)]="statusFilter" (ngModelChange)="reload()">
          <option value="">{{ 'deliveries.allStatuses' | translate }}</option>
          @for (key of statusKeys; track key) {
            <option [value]="key">{{ 'status.delivery.' + key | translate }}</option>
          }
        </select>
        <input
          class="field"
          type="date"
          [(ngModel)]="dateFilter"
          (ngModelChange)="reload()"
        />
        <input
          class="field"
          name="q"
          [attr.placeholder]="'common.search' | translate"
          [ngModel]="query"
          (ngModelChange)="onSearch($event)"
        />
        @if (canSeeMap()) {
          <button class="btn btn-secondary" (click)="showMap.set(!showMap())">
            {{ (showMap() ? 'deliveries.map.hide' : 'deliveries.map.show') | translate }}
          </button>
        }
        <button class="btn btn-secondary" (click)="load()">{{ 'common.refresh' | translate }}</button>
        <a routerLink="/deliveries/new" class="btn btn-primary">{{ 'deliveries.add' | translate }}</a>
      </div>
    </div>

    @if (canSeeMap() && showMap()) {
      <app-delivery-map [status]="statusFilter" [date]="dateFilter" />
    }

    @if (loading()) {
      <div class="card state-card">{{ 'deliveries.loading' | translate }}</div>
    } @else if (error()) {
      <div class="state-card error-card">{{ error() }}</div>
    } @else if (deliveries().length === 0) {
      <div class="card state-card">
        <strong>{{ 'deliveries.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'deliveries.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="legend">
        <span class="legend-title">{{ 'deliveries.legend' | translate }}</span>
        @for (g of legend; track g.cls) {
          <span class="legend-item">
            <span class="status-dot" [class]="'status-dot ' + g.cls"></span>
            <span class="legend-text">
              @for (s of g.statuses; track s; let last = $last) {{{ 'status.delivery.' + s | translate }}@if (!last) {<span class="sep"> · </span>}}
            </span>
          </span>
        }
      </div>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th class="st-col sortable" (click)="sortBy('status')">
                {{ 'deliveries.col.status' | translate }}<span class="sort-ind">{{ sortIndicator('status') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('code')">#<span class="sort-ind">{{ sortIndicator('code') }}</span></th>
              <th class="sortable" (click)="sortBy('date')">
                {{ 'deliveries.col.date' | translate }}<span class="sort-ind">{{ sortIndicator('date') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('serviceType.name')">
                {{ 'deliveries.col.service' | translate }}<span class="sort-ind">{{ sortIndicator('serviceType.name') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('partner.insegna')">
                {{ 'deliveries.col.partner' | translate }}<span class="sort-ind">{{ sortIndicator('partner.insegna') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('recipientLastName')">
                {{ 'deliveries.col.recipient' | translate }}<span class="sort-ind">{{ sortIndicator('recipientLastName') }}</span>
              </th>
              <th>{{ 'deliveries.col.address' | translate }}</th>
              <th class="sortable" (click)="sortBy('deliveryTimeFrom')">
                {{ 'deliveries.col.delivery' | translate }}<span class="sort-ind">{{ sortIndicator('deliveryTimeFrom') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('pickupTimeFrom')">
                {{ 'deliveries.col.pickup' | translate }}<span class="sort-ind">{{ sortIndicator('pickupTimeFrom') }}</span>
              </th>
              <th>{{ 'deliveries.col.valet' | translate }}</th>
              <th class="num sortable" (click)="sortBy('price')">
                {{ 'deliveries.col.price' | translate }}<span class="sort-ind">{{ sortIndicator('price') }}</span>
              </th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (d of deliveries(); track d.id) {
              <tr
                class="row-link"
                [attr.tabindex]="canDetails() ? 0 : null"
                (click)="openDetail(d)"
                (keydown.enter)="openDetail(d)"
              >
                <td class="st-col">
                  <span
                    class="status-dot"
                    [class]="'status-dot s-' + d.status"
                    [title]="'status.delivery.' + d.status | translate"
                  ></span>
                </td>
                <td class="mono">{{ d.code }}</td>
                <td>{{ d.date | date: 'dd/MM/yyyy' }}</td>
                <td>
                  <span
                    class="svc-icon"
                    [innerHTML]="serviceIcon(d.serviceType?.pricingModel)"
                    [title]="d.serviceType?.name ?? ''"
                  ></span>
                </td>
                <td class="strong">{{ d.partner?.insegna }}</td>
                <td>{{ d.recipientFirstName }} {{ d.recipientLastName }}</td>
                <td class="muted">{{ d.recipientAddress }}</td>
                <td>
                  @if (d.deliveryTimeFrom) {
                    {{ d.deliveryTimeFrom }}@if (d.deliveryTimeTo) {–{{ d.deliveryTimeTo }}}
                    @if (d.deliveryFlexible) {
                      <span class="pill pill-flex">{{ 'common.flexible' | translate }}</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (d.pickupTimeFrom) {
                    {{ d.pickupTimeFrom }}–{{ d.pickupTimeTo }}
                    @if (d.pickupFlexible) {
                      <span class="pill pill-flex">{{ 'common.flexible' | translate }}</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (d.valet) {
                    {{ d.valet.firstName }} {{ d.valet.lastName }}
                  } @else {
                    <span class="muted">{{ 'common.notAssigned' | translate }}</span>
                  }
                </td>
                <td class="num strong">
                  {{ d.price != null ? (d.price + ' €') : '—' }}
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  @if (canEdit(d)) {
                    <a class="act" [routerLink]="['/deliveries', d.id, 'edit']">{{ 'deliveries.actions.edit' | translate }}</a>
                  }
                  @if (canManage()) {
                    <button type="button" class="act" (click)="openAssign(d)">{{ 'deliveries.actions.assign' | translate }}</button>
                    <button type="button" class="act" (click)="openMonitor(d)">{{ 'deliveries.actions.monitor' | translate }}</button>
                    <button type="button" class="act" (click)="openAdditional(d)">{{ 'deliveries.actions.additionalValet' | translate }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Paginazione server-side -->
      <div class="pager">
        <button type="button" class="act" [disabled]="page() <= 1" (click)="goTo(page() - 1)">‹</button>
        <span class="pager-info">{{ 'list.pageOf' | translate: { page: page(), pages: totalPages() } }}</span>
        <button type="button" class="act" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">›</button>
        <select class="field pager-size" [ngModel]="pageSize" (ngModelChange)="changePageSize($event)" name="pageSize">
          @for (s of pageSizes; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="pager-info">{{ 'list.perPage' | translate }} · {{ total() }}</span>
      </div>
    }

    <!-- Pop-up ASSEGNA: valet con la provincia della consegna abilitata -->
    @if (assignFor(); as d) {
      <div class="overlay" (click)="assignFor.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <h2>{{ 'deliveries.assign.title' | translate }}</h2>
        <p class="modal-sub">
          {{ 'deliveries.assign.forDelivery' | translate: { code: d.code } }}
          @if (assignProvince(); as p) {
            <span class="tag">{{ p.code }}</span>
          } @else {
            <span class="tag warn">{{ 'deliveries.assign.noProvince' | translate }}</span>
          }
        </p>
        @if (actionError()) { <div class="modal-err">{{ actionError() }}</div> }
        @if (assignValets().length === 0) {
          <p class="muted">{{ 'deliveries.assign.noValets' | translate }}</p>
        } @else {
          <ul class="valet-list">
            @for (v of assignValets(); track v.id) {
              <li>
                <span>{{ v.firstName }} {{ v.lastName }}</span>
                <button type="button" class="act" (click)="assign(v.id)">{{ 'deliveries.assign.choose' | translate }}</button>
              </li>
            }
          </ul>
        }
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" (click)="assignFor.set(null)">{{ 'common.cancel' | translate }}</button>
        </div>
      </div>
    }

    <!-- Pop-up ADDITIONAL VALET: plus/minus immediato sulla paga del valet -->
    @if (additionalFor(); as d) {
      <div class="overlay" (click)="additionalFor.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <h2>{{ 'deliveries.additional.title' | translate }}</h2>
        <p class="modal-sub">{{ 'deliveries.additional.hint' | translate: { code: d.code } }}</p>
        @if (actionError()) { <div class="modal-err">{{ actionError() }}</div> }
        <label class="fld">
          <span>{{ 'deliveries.additional.amount' | translate }}</span>
          <input class="field num" type="number" step="0.01" [(ngModel)]="additionalValue" name="additionalValue" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" (click)="additionalFor.set(null)">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn btn-primary" [disabled]="additionalValue == null" (click)="saveAdditional()">{{ 'common.save' | translate }}</button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .page-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: 32px;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      .page-caption {
        margin: 4px 0 0;
        color: var(--text-secondary);
        font-size: 14px;
      }
      .filters {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .table-wrap {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13.5px;
      }
      th,
      td {
        text-align: left;
        padding: 12px 16px;
        border-bottom: 1px solid var(--hairline);
        white-space: nowrap;
      }
      th {
        font-weight: 500;
        color: var(--text-tertiary);
        font-size: 12px;
        position: sticky;
        top: 0;
        background: var(--surface);
      }
      th.num,
      td.num {
        text-align: right;
      }
      tbody tr {
        transition: background 0.14s var(--ease);
      }
      tbody tr:hover {
        background: rgba(120, 120, 128, 0.05);
      }
      tr:last-child td {
        border-bottom: none;
      }
      .mono {
        font-variant-numeric: tabular-nums;
        color: var(--text-secondary);
      }
      /* Colonna stato: solo pallino colorato */
      .st-col {
        width: 34px;
        text-align: center;
        padding-left: 14px;
        padding-right: 6px;
      }
      .status-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--text-tertiary);
        flex-shrink: 0;
      }
      /* Colori allineati alla legenda dell'app reale (app.deluxy.it) */
      .status-dot.s-created { background: var(--red); }                    /* Da gestire: rosso */
      .status-dot.s-assigned { background: #e6b800; }                      /* In gestione: giallo */
      .status-dot.s-in_preparation { background: #ff9500; }                /* In preparazione: arancione */
      .status-dot.s-accepted { background: var(--blue); }                  /* Accettata: blu */
      .status-dot.s-in_delivery { background: var(--purple); }             /* In consegna: viola */
      .status-dot.s-cancellation_requested { background: #5ac8fa; }        /* Richiedi annullamento: azzurro */
      .status-dot.s-delivered,
      .status-dot.s-delivered_time_approved { background: var(--green); }  /* Consegnata: verde */

      /* Legenda colori stato */
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 18px;
        margin-bottom: 14px;
        padding: 10px 14px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-radius: var(--radius-m);
      }
      .legend-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }
      .legend-text {
        font-size: 12.5px;
        color: var(--text-secondary);
      }
      .legend-text .sep { color: var(--text-tertiary); }

      /* Pop-up (Assegna / Additional valet) */
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 80;
        background: rgba(0, 0, 0, 0.32);
        -webkit-backdrop-filter: blur(2px);
        backdrop-filter: blur(2px);
      }
      .modal {
        position: fixed;
        z-index: 90;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(440px, 92vw);
        max-height: 80vh;
        overflow-y: auto;
        padding: 22px 24px;
        box-shadow: var(--shadow-float);
      }
      .modal h2 {
        margin: 0 0 4px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .modal-sub {
        margin: 0 0 14px;
        font-size: 13px;
        color: var(--text-tertiary);
      }
      .modal-err {
        background: rgba(215, 0, 21, 0.06);
        border: 1px solid rgba(215, 0, 21, 0.15);
        color: var(--red);
        border-radius: var(--radius-m);
        padding: 8px 12px;
        font-size: 13px;
        margin-bottom: 12px;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 18px;
      }
      .valet-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .valet-list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        border-radius: var(--radius-m);
        font-size: 13.5px;
      }
      .valet-list li:hover {
        background: var(--fill);
      }
      .tag {
        margin-left: 6px;
        font-size: 11px;
        font-weight: 600;
        background: var(--gold-soft);
        color: var(--gold-strong);
        border-radius: 980px;
        padding: 2px 8px;
      }
      .tag.warn {
        background: rgba(255, 149, 0, 0.12);
        color: #b25000;
      }
      .fld {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .fld > span {
        font-size: 13px;
        font-weight: 550;
        color: var(--text-secondary);
      }

      /* Intestazioni ordinabili */
      th.sortable {
        cursor: pointer;
        user-select: none;
      }
      th.sortable:hover {
        color: var(--text);
      }
      .sort-ind {
        color: var(--gold-strong);
        font-weight: 700;
      }
      /* Paginazione */
      .pager {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
        justify-content: flex-end;
      }
      .pager-info {
        font-size: 12.5px;
        color: var(--text-tertiary);
      }
      .pager-size {
        width: auto;
        padding: 4px 8px;
        font-size: 12.5px;
      }

      /* La riga apre il dettaglio */
      .row-link {
        cursor: pointer;
      }
      .row-link:focus-visible {
        outline: 2px solid var(--gold-strong);
        outline-offset: -2px;
      }

      /* Azioni di riga */
      .actions-cell {
        white-space: nowrap;
      }
      .act {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--hairline-strong);
        background: var(--surface);
        border-radius: 980px;
        padding: 4px 11px;
        margin-right: 6px;
        font-size: 12px;
        font-weight: 550;
        font-family: inherit;
        color: var(--text);
        cursor: pointer;
        text-decoration: none;
        transition: background 0.15s var(--ease);
      }
      .act:hover:not(:disabled) {
        background: var(--fill);
      }
      .act:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .svc-icon {
        display: inline-flex;
        width: 20px;
        height: 20px;
        color: var(--text-secondary);
      }
      .svc-icon :where(svg) {
        width: 100%;
        height: 100%;
      }
      .strong {
        font-weight: 550;
      }
      .muted {
        color: var(--text-tertiary);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 980px;
        padding: 3px 10px;
        font-size: 12px;
        font-weight: 550;
        background: var(--fill);
        color: var(--text-secondary);
      }
      .pill .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.85;
      }
      .pill-flex {
        background: rgba(0, 113, 227, 0.1);
        color: var(--blue);
        margin-left: 6px;
      }
      .pill-flex::before {
        content: none;
      }
      .s-created {
        background: rgba(255, 149, 0, 0.12);
        color: #b25000;
      }
      .s-assigned,
      .s-accepted,
      .s-in_preparation {
        background: rgba(0, 113, 227, 0.1);
        color: var(--blue);
      }
      .s-in_delivery {
        background: rgba(109, 63, 196, 0.11);
        color: var(--purple);
      }
      .s-delivered,
      .s-delivered_time_approved {
        background: rgba(36, 138, 61, 0.12);
        color: var(--green);
      }
      .s-not_delivered,
      .s-cancelled,
      .s-not_accepted {
        background: rgba(215, 0, 21, 0.09);
        color: var(--red);
      }
      .state-card {
        padding: 32px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        color: var(--text-secondary);
      }
      .error-card {
        background: rgba(215, 0, 21, 0.06);
        border: 1px solid rgba(215, 0, 21, 0.15);
        border-radius: var(--radius-l);
        color: var(--red);
      }
    `,
  ],
})
export class DeliveriesListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly iconCache = new Map<string, SafeHtml>();

  /**
   * Permessi bottoni di riga (regola di business):
   * - Admin (e Operation): tutti i bottoni.
   * - Partner: MODIFICA solo finché la consegna è "in rosso" (stato `created`)
   *   e solo se il tipo di servizio non è VENDITA.
   * - Valet: solo DETTAGLI.
   */
  private roleOf(): string | undefined {
    return this.auth.user()?.role;
  }

  /** Dettaglio: si apre cliccando la riga (nessun bottone dedicato). */
  canDetails(): boolean {
    const r = this.roleOf();
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PARTNER' || r === 'VALET';
  }

  openDetail(d: Delivery): void {
    if (!this.canDetails()) return;
    this.router.navigate(['/deliveries', d.id]);
  }

  /** Assegna / Monitorare / Additional valet: solo admin (e operation). */
  canManage(): boolean {
    const r = this.roleOf();
    return r === 'ADMIN' || r === 'OPERATION';
  }

  canEdit(d: Delivery): boolean {
    const r = this.roleOf();
    if (r === 'ADMIN' || r === 'OPERATION') return true;
    if (r === 'PARTNER') {
      return d.status === 'created' && d.serviceType?.pricingModel !== 'VENDITA';
    }
    return false; // Valet: solo dettagli
  }

  // ---- ASSEGNA: pop-up con i valet della provincia della consegna ----
  readonly provinces = signal<Province[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  readonly assignFor = signal<Delivery | null>(null);
  readonly actionError = signal<string | null>(null);

  /** Provincia dedotta dall'indirizzo della consegna aperta in "Assegna". */
  readonly assignProvince = computed(() => {
    const d = this.assignFor();
    return d ? detectProvince(d.recipientAddress, this.provinces()) : null;
  });

  /** Solo i valet che hanno abilitata quella provincia. */
  readonly assignValets = computed(() => {
    const prov = this.assignProvince();
    if (!prov) return this.valets();
    return this.valets().filter((v) =>
      (v.provinces ?? []).some((p) => p.province?.code === prov.code),
    );
  });

  openAssign(d: Delivery): void {
    this.actionError.set(null);
    this.assignFor.set(d);
  }

  assign(valetId: string): void {
    const d = this.assignFor();
    if (!d) return;
    this.http
      .patch(`${environment.apiUrl}/deliveries/${d.id}/assign`, { valetId })
      .subscribe({
        next: () => { this.assignFor.set(null); this.load(); },
        error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
      });
  }

  // ---- ADDITIONAL VALET: plus/minus immediato sulla paga del valet ----
  readonly additionalFor = signal<Delivery | null>(null);
  additionalValue: number | null = null;

  openAdditional(d: Delivery): void {
    this.actionError.set(null);
    this.additionalValue = null;
    this.additionalFor.set(d);
  }

  saveAdditional(): void {
    const d = this.additionalFor();
    if (!d || this.additionalValue == null) return;
    this.http
      .put(`${environment.apiUrl}/deliveries/${d.id}`, {
        valetAdditionalPrice: Number(this.additionalValue),
      })
      .subscribe({
        next: () => { this.additionalFor.set(null); this.load(); },
        error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
      });
  }

  // ---- MONITORARE: apre il link pubblico di monitoraggio ----
  openMonitor(d: Delivery): void {
    this.actionError.set(null);
    this.http
      .get<{ token: string }>(`${environment.apiUrl}/deliveries/${d.id}/tracking-link`)
      .subscribe({
        next: (r) => window.open(`${location.origin}/tracking/${r.token}`, '_blank'),
        error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
      });
  }

  /** Icona del tipo di servizio (fallback: nessun tratto). */
  serviceIcon(pricingModel?: string): SafeHtml {
    const key = pricingModel ?? '-';
    let cached = this.iconCache.get(key);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SERVICE_ICONS[key] ?? ''}</svg>`,
      );
      this.iconCache.set(key, cached);
    }
    return cached;
  }

  readonly deliveries = signal<Delivery[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  statusFilter = '';
  dateFilter = '';
  readonly showMap = signal(false);

  /** La mappa consegne (indirizzi = dati sensibili) è solo per Admin/Operation. */
  canSeeMap(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }
  readonly statusKeys = Object.keys(DELIVERY_STATUS_LABELS);

  /**
   * Legenda: un colore per gruppo di stati.
   * Colori dei primi 6 allineati alla legenda dell'app reale
   * (Da gestire=rosso, In gestione=giallo, In preparazione=arancione,
   *  Accettata=blu, In consegna=viola, Richiedi annullamento=azzurro).
   */
  readonly legend: { cls: string; statuses: string[] }[] = [
    { cls: 's-created', statuses: ['created'] },
    { cls: 's-assigned', statuses: ['assigned'] },
    { cls: 's-in_preparation', statuses: ['in_preparation'] },
    { cls: 's-accepted', statuses: ['accepted'] },
    { cls: 's-in_delivery', statuses: ['in_delivery'] },
    { cls: 's-cancellation_requested', statuses: ['cancellation_requested'] },
    { cls: 's-delivered', statuses: ['delivered', 'delivered_time_approved'] },
    { cls: 's-archived', statuses: ['not_delivered', 'not_accepted', 'cancelled', 'delivered_time_not_approved'] },
  ];

  constructor() {
    this.load();
    // Riferimenti per il pop-up "Assegna" (solo per chi può gestire)
    if (this.canManage()) {
      this.http
        .get<Province[]>(`${environment.apiUrl}/provinces`)
        .subscribe((d) => this.provinces.set(d));
      this.http
        .get<ValetRef[]>(`${environment.apiUrl}/valets`)
        .subscribe((d) => this.valets.set(d));
    }
  }

  // ---- Stato tabella: ricerca globale + ordinamento + paginazione (server-side) ----
  query = '';
  readonly total = signal(0);
  readonly page = signal(1);
  pageSize = 50;
  readonly pageSizes = [10, 25, 50, 100, 200, 500];
  readonly sort = signal<string>('date');
  readonly dir = signal<'asc' | 'desc'>('desc');
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  sortIndicator(field: string): string {
    if (this.sort() !== field) return '';
    return this.dir() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Click sull'intestazione: stesso campo inverte il verso, altrimenti asc. */
  sortBy(field: string): void {
    if (this.sort() === field) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.dir.set('asc');
    }
    this.reload();
  }

  /** Ricerca globale con debounce: una chiamata sola a fine digitazione. */
  onSearch(value: string): void {
    this.query = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 300);
  }

  /** Cambio filtro/ordinamento: si riparte dalla prima pagina. */
  reload(): void {
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size);
    this.reload();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let params = new HttpParams()
      .set('page', String(this.page()))
      .set('pageSize', String(this.pageSize))
      .set('sort', this.sort())
      .set('dir', this.dir());
    if (this.statusFilter) params = params.set('status', this.statusFilter);
    if (this.dateFilter) params = params.set('date', this.dateFilter);
    if (this.query.trim()) params = params.set('q', this.query.trim());
    this.http
      .get<{ items: Delivery[]; total: number }>(`${environment.apiUrl}/deliveries`, { params })
      .subscribe({
        next: (data) => {
          this.deliveries.set(data.items ?? []);
          this.total.set(data.total ?? 0);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.error?.message ?? this.translate.instant('deliveries.loadError'),
          );
        },
      });
  }
}
