import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  partner?: { id: string; insegna: string } | null;
  deliveries?: { id: string; code: number; date: string; status: string }[];
}

/** Dettaglio cliente (sola lettura) + sue consegne. */
@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/customers" class="back">← {{ 'customers.title' | translate }}</a>
      @if (customer(); as c) {
        <div class="title-row">
          <h1>{{ c.firstName }} {{ c.lastName }}</h1>
          <a class="btn btn-secondary edit" [routerLink]="['/customers', c.id, 'edit']">{{ 'common.edit' | translate }}</a>
        </div>
      }
    </div>

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card err">{{ error() }}</div>
    } @else {
      @if (customer(); as c) {
        <div class="grid">
          <section class="card block">
            <h2>{{ 'customerForm.section.general' | translate }}</h2>
            <dl>
              <dt>{{ 'customers.col.email' | translate }}</dt><dd>{{ c.email || '—' }}</dd>
              <dt>{{ 'customers.col.phone' | translate }}</dt><dd>{{ c.phone || '—' }}</dd>
              <dt>{{ 'customers.col.address' | translate }}</dt><dd>{{ c.address || '—' }}</dd>
              @if (c.partner) {
                <dt>{{ 'deliveries.col.partner' | translate }}</dt><dd>{{ c.partner.insegna }}</dd>
              }
              <dt>{{ 'customerForm.notes' | translate }}</dt><dd>{{ c.notes || '—' }}</dd>
            </dl>
          </section>

          <section class="card block">
            <h2>{{ 'customerDetail.deliveries' | translate }}</h2>
            @if (c.deliveries?.length) {
              <table class="mini">
                <thead><tr>
                  <th>#</th>
                  <th>{{ 'deliveries.col.date' | translate }}</th>
                  <th>{{ 'deliveries.col.status' | translate }}</th>
                </tr></thead>
                <tbody>
                  @for (d of c.deliveries; track d.id) {
                    <tr class="row-link" (click)="openDelivery(d.id)">
                      <td class="mono">{{ d.code }}</td>
                      <td>{{ d.date | date: 'dd/MM/yyyy' }}</td>
                      <td>{{ 'status.delivery.' + d.status | translate }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="muted">{{ 'customerDetail.noDeliveries' | translate }}</p> }
          </section>
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
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 900px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      dl { display: grid; grid-template-columns: minmax(110px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .mono { font-variant-numeric: tabular-nums; color: var(--text-secondary); }
      .row-link { cursor: pointer; }
      .row-link:hover { background: rgba(120,120,128,0.05); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.err { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CustomerDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly customer = signal<CustomerDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  openDelivery(id: string): void {
    this.router.navigate(['/deliveries', id]);
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.http.get<CustomerDetail>(`${environment.apiUrl}/customers/${id}`).subscribe({
      next: (c) => { this.customer.set(c); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Errore nel caricamento del cliente');
      },
    });
  }
}
