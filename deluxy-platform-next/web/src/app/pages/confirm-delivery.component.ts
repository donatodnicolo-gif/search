import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface PublicTracking {
  code: number;
  status: string;
  date: string;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  recipientFirstName: string;
  partner?: string | null;
  valetFirstName?: string | null;
}

/**
 * Pagina pubblica di CONFERMA CONSEGNA (link "DELIVERED LINK").
 * Nessun login: chi ha il link (il valet) conferma la consegna indicando
 * chi ha ritirato. Sta fuori dallo shell dell'app.
 */
@Component({
  selector: 'app-confirm-delivery',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe],
  template: `
    <div class="wrap">
      <div class="brand">
        <span class="brand-mark">D</span>
        <span class="brand-name">Deluxy</span>
      </div>

      @if (loading()) {
        <div class="card pad">{{ 'common.loading' | translate }}</div>
      } @else if (error()) {
        <div class="card pad err">{{ 'tracking.notFound' | translate }}</div>
      } @else if (data()) {
        @if (data(); as d) {
        <div class="card pad">
          <h1>{{ 'confirmDelivery.title' | translate: { code: d.code } }}</h1>
          <span class="pill" [class]="'pill s-' + d.status">
            <span class="dot" [class]="'dot s-' + d.status"></span>{{ 'status.delivery.' + d.status | translate }}
          </span>

          <dl>
            <dt>{{ 'deliveries.col.date' | translate }}</dt><dd>{{ d.date | date: 'dd/MM/yyyy' }}</dd>
            <dt>{{ 'deliveries.col.delivery' | translate }}</dt>
            <dd>{{ d.deliveryTimeFrom ? (d.deliveryTimeFrom + (d.deliveryTimeTo ? '–' + d.deliveryTimeTo : '')) : '—' }}</dd>
            <dt>{{ 'deliveries.col.recipient' | translate }}</dt><dd>{{ d.recipientFirstName }}</dd>
            @if (d.partner) { <dt>{{ 'deliveries.col.partner' | translate }}</dt><dd>{{ d.partner }}</dd> }
          </dl>

          @if (done() || d.status === 'delivered' || d.status === 'delivered_time_approved') {
            <div class="ok">{{ 'confirmDelivery.done' | translate }}</div>
          } @else {
            <div class="form">
              <label>{{ 'confirmDelivery.receivedBy' | translate }}</label>
              <input class="field" [(ngModel)]="receivedBy" [placeholder]="'confirmDelivery.receivedByPlaceholder' | translate" />
              @if (formError()) { <div class="err small">{{ formError() }}</div> }
              <button class="btn btn-primary" [disabled]="saving()" (click)="confirm()">
                {{ saving() ? ('common.saving' | translate) : ('confirmDelivery.confirm' | translate) }}
              </button>
            </div>
          }
        </div>
        }
      }

      <p class="foot">{{ 'app.tagline' | translate }}</p>
    </div>
  `,
  styles: [
    `
      .wrap { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
      .brand { display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 24px; }
      .brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(145deg, #1d1f26, #3a3d47); color: var(--gold); font-family: Georgia, serif; font-size: 19px; font-weight: 700; }
      .brand-name { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
      .pad { padding: 26px 28px; }
      .err { color: var(--red); }
      .err.small { font-size: 13px; margin: 4px 0 0; }
      h1 { margin: 0 0 10px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
      dl { display: grid; grid-template-columns: minmax(110px, 40%) 1fr; gap: 8px 14px; margin: 18px 0 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
      .dot.s-created { background: var(--red); }
      .dot.s-assigned { background: #e6b800; }
      .dot.s-in_preparation { background: #ff9500; }
      .dot.s-accepted { background: var(--blue); }
      .dot.s-in_delivery { background: var(--purple); }
      .dot.s-delivered, .dot.s-delivered_time_approved { background: var(--green); }
      .form { margin-top: 22px; display: flex; flex-direction: column; gap: 8px; }
      .form label { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .form .btn { margin-top: 8px; align-self: flex-start; }
      .ok { margin-top: 22px; padding: 14px 16px; border-radius: var(--radius-l); background: rgba(36,138,61,0.1); border: 1px solid rgba(36,138,61,0.25); color: var(--green); font-weight: 550; }
      .foot { text-align: center; margin-top: 22px; font-size: 12.5px; color: var(--text-tertiary); }
    `,
  ],
})
export class ConfirmDeliveryComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly data = signal<PublicTracking | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);
  readonly done = signal(false);
  readonly formError = signal<string | null>(null);
  receivedBy = '';
  private token = '';

  constructor() {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.http.get<PublicTracking>(`${environment.apiUrl}/deliveries/tracking/${this.token}`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }

  confirm(): void {
    if (!this.receivedBy.trim()) { this.formError.set('Indica chi ha ritirato.'); return; }
    this.formError.set(null);
    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/deliveries/delivered/${this.token}`, { receivedBy: this.receivedBy.trim() }).subscribe({
      next: () => { this.saving.set(false); this.done.set(true); },
      error: (err) => { this.saving.set(false); this.formError.set(err?.error?.message ?? 'Errore'); },
    });
  }
}
