import { HttpClient, HttpParams } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { DELIVERY_STATUS_LABELS, Delivery } from '../core/models';

@Component({
  selector: 'app-deliveries-list',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="page-header">
      <h1>Consegne</h1>
      <div class="filters">
        <select [(ngModel)]="statusFilter" (ngModelChange)="load()">
          <option value="">Tutti gli stati</option>
          @for (entry of statusOptions; track entry[0]) {
            <option [value]="entry[0]">{{ entry[1] }}</option>
          }
        </select>
        <input
          type="date"
          [(ngModel)]="dateFilter"
          (ngModelChange)="load()"
        />
        <button class="refresh" (click)="load()">Aggiorna</button>
      </div>
    </div>

    @if (loading()) {
      <div class="info">Caricamento consegne...</div>
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else if (deliveries().length === 0) {
      <div class="info">Nessuna consegna trovata.</div>
    } @else {
      <div class="table-wrap">
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
              <th>Prezzo</th>
            </tr>
          </thead>
          <tbody>
            @for (d of deliveries(); track d.id) {
              <tr>
                <td>{{ d.code }}</td>
                <td>{{ d.date | date: 'dd/MM/yyyy' }}</td>
                <td>{{ d.serviceType?.name }}</td>
                <td>{{ d.partner?.insegna }}</td>
                <td>{{ d.recipientFirstName }} {{ d.recipientLastName }}</td>
                <td>{{ d.recipientAddress }}</td>
                <td>
                  @if (d.pickupTimeFrom) {
                    {{ d.pickupTimeFrom }}-{{ d.pickupTimeTo }}
                    @if (d.pickupFlexible) {
                      <span class="flex-badge">flessibile</span>
                    }
                  } @else {
                    -
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
                  <span class="status" [class]="'status s-' + d.status">
                    {{ statusLabel(d.status) }}
                  </span>
                </td>
                <td>{{ d.price != null ? (d.price + ' €') : '-' }}</td>
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
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 20px;
      }
      h1 {
        margin: 0;
        font-size: 24px;
      }
      .filters {
        display: flex;
        gap: 10px;
      }
      select,
      input[type='date'] {
        border: 1px solid var(--deluxy-border);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 13px;
        background: var(--deluxy-white);
      }
      .refresh {
        background: var(--deluxy-dark);
        color: var(--deluxy-gold);
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
      }
      .table-wrap {
        background: var(--deluxy-white);
        border: 1px solid var(--deluxy-border);
        border-radius: 12px;
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th,
      td {
        text-align: left;
        padding: 12px 14px;
        border-bottom: 1px solid var(--deluxy-border);
        white-space: nowrap;
      }
      th {
        background: #fafaf7;
        font-weight: 600;
        color: var(--deluxy-muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      tr:last-child td {
        border-bottom: none;
      }
      .muted {
        color: var(--deluxy-muted);
        font-style: italic;
      }
      .flex-badge {
        background: #eef2ff;
        color: #4338ca;
        border-radius: 10px;
        font-size: 11px;
        padding: 2px 8px;
        margin-left: 4px;
      }
      .status {
        border-radius: 10px;
        padding: 3px 10px;
        font-size: 12px;
        font-weight: 600;
        background: #f3f4f6;
        color: #374151;
      }
      .s-created {
        background: #fef3c7;
        color: #92400e;
      }
      .s-assigned,
      .s-accepted,
      .s-in_preparation {
        background: #dbeafe;
        color: #1e40af;
      }
      .s-in_delivery {
        background: #ede9fe;
        color: #5b21b6;
      }
      .s-delivered,
      .s-delivered_time_approved {
        background: #d1fae5;
        color: #065f46;
      }
      .s-not_delivered,
      .s-cancelled,
      .s-not_accepted {
        background: #fee2e2;
        color: #991b1b;
      }
      .info {
        background: var(--deluxy-white);
        border: 1px solid var(--deluxy-border);
        border-radius: 12px;
        padding: 24px;
        color: var(--deluxy-muted);
      }
      .error {
        background: #fde8e8;
        color: #b91c1c;
        border-radius: 12px;
        padding: 24px;
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
