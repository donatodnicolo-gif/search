import { HttpClient, HttpParams } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { DELIVERY_STATUS_LABELS, Delivery } from '../core/models';

@Component({
  selector: 'app-deliveries-list',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>Consegne</h1>
        <p class="page-caption">Tutte le consegne della rete, in tempo reale.</p>
      </div>
      <div class="filters">
        <select class="field" [(ngModel)]="statusFilter" (ngModelChange)="load()">
          <option value="">Tutti gli stati</option>
          @for (entry of statusOptions; track entry[0]) {
            <option [value]="entry[0]">{{ entry[1] }}</option>
          }
        </select>
        <input
          class="field"
          type="date"
          [(ngModel)]="dateFilter"
          (ngModelChange)="load()"
        />
        <button class="btn btn-secondary" (click)="load()">Aggiorna</button>
        <a routerLink="/deliveries/new" class="btn btn-primary">+ Aggiungi consegna</a>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">Caricamento consegne…</div>
    } @else if (error()) {
      <div class="state-card error-card">{{ error() }}</div>
    } @else if (deliveries().length === 0) {
      <div class="card state-card">
        <strong>Nessuna consegna trovata.</strong>
        <span class="muted">Modifica i filtri o aggiungi una nuova consegna.</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Data</th>
              <th>Servizio</th>
              <th>Partner</th>
              <th>Destinatario</th>
              <th>Indirizzo</th>
              <th>Ritiro</th>
              <th>Valet</th>
              <th>Stato</th>
              <th class="num">Prezzo</th>
            </tr>
          </thead>
          <tbody>
            @for (d of deliveries(); track d.id) {
              <tr>
                <td class="mono">{{ d.code }}</td>
                <td>{{ d.date | date: 'dd/MM/yyyy' }}</td>
                <td>{{ d.serviceType?.name }}</td>
                <td class="strong">{{ d.partner?.insegna }}</td>
                <td>{{ d.recipientFirstName }} {{ d.recipientLastName }}</td>
                <td class="muted">{{ d.recipientAddress }}</td>
                <td>
                  @if (d.pickupTimeFrom) {
                    {{ d.pickupTimeFrom }}–{{ d.pickupTimeTo }}
                    @if (d.pickupFlexible) {
                      <span class="pill pill-flex">flessibile</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (d.valet) {
                    {{ d.valet.firstName }} {{ d.valet.lastName }}
                  } @else {
                    <span class="muted">Non assegnato</span>
                  }
                </td>
                <td>
                  <span class="pill" [class]="'pill s-' + d.status">
                    <span class="dot"></span>{{ statusLabel(d.status) }}
                  </span>
                </td>
                <td class="num strong">
                  {{ d.price != null ? (d.price + ' €') : '—' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
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

  readonly deliveries = signal<Delivery[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  statusFilter = '';
  dateFilter = '';
  readonly statusOptions = Object.entries(DELIVERY_STATUS_LABELS);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    let params = new HttpParams();
    if (this.statusFilter) params = params.set('status', this.statusFilter);
    if (this.dateFilter) params = params.set('date', this.dateFilter);
    this.http
      .get<Delivery[]>(`${environment.apiUrl}/deliveries`, { params })
      .subscribe({
        next: (data) => {
          this.deliveries.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.error?.message ?? 'Errore nel caricamento delle consegne',
          );
        },
      });
  }

  statusLabel(status: string): string {
    return DELIVERY_STATUS_LABELS[status] ?? status;
  }
}
