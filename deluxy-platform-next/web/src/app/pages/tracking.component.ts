import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/** Vista pubblica: solo i dati minimi esposti dall'API di tracking. */
interface PublicTracking {
  code: number;
  status: string;
  date: string;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  recipientFirstName: string;
  partner?: string | null;
  valetFirstName?: string | null;
  logs: { type: string; message: string; createdAt: string }[];
}

/**
 * Pagina pubblica di monitoraggio della consegna (bottone MONITORARE).
 * Nessun login: sta fuori dallo shell dell'app.
 */
@Component({
  selector: 'app-tracking',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
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
      } @else {
        @if (data(); as d) {
        <div class="card pad">
          <h1>{{ 'tracking.title' | translate: { code: d.code } }}</h1>
          <span class="pill" [class]="'pill s-' + d.status">
            <span class="dot" [class]="'dot s-' + d.status"></span>{{ 'status.delivery.' + d.status | translate }}
          </span>

          <dl>
            <dt>{{ 'deliveries.col.date' | translate }}</dt><dd>{{ d.date | date: 'dd/MM/yyyy' }}</dd>
            <dt>{{ 'deliveries.col.delivery' | translate }}</dt>
            <dd>{{ d.deliveryTimeFrom ? (d.deliveryTimeFrom + (d.deliveryTimeTo ? '–' + d.deliveryTimeTo : '')) : '—' }}</dd>
            <dt>{{ 'deliveries.col.recipient' | translate }}</dt><dd>{{ d.recipientFirstName }}</dd>
            @if (d.partner) { <dt>{{ 'deliveries.col.partner' | translate }}</dt><dd>{{ d.partner }}</dd> }
            @if (d.valetFirstName) { <dt>{{ 'deliveries.col.valet' | translate }}</dt><dd>{{ d.valetFirstName }}</dd> }
          </dl>

          @if (d.logs.length) {
            <h2>{{ 'tracking.history' | translate }}</h2>
            <ul class="logs">
              @for (l of d.logs; track l.createdAt) {
                <li>
                  <span class="log-date">{{ l.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                  <span>{{ l.message }}</span>
                </li>
              }
            </ul>
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
      .brand-mark {
        display: inline-flex; align-items: center; justify-content: center;
        width: 34px; height: 34px; border-radius: 9px;
        background: linear-gradient(145deg, #1d1f26, #3a3d47);
        color: var(--gold); font-family: Georgia, serif; font-size: 19px; font-weight: 700;
      }
      .brand-name { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
      .pad { padding: 26px 28px; }
      .err { color: var(--red); }
      h1 { margin: 0 0 10px; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
      h2 { margin: 22px 0 10px; font-size: 15px; font-weight: 600; }
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
      .logs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .logs li { display: flex; gap: 12px; font-size: 13px; }
      .log-date { color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .foot { text-align: center; margin-top: 22px; font-size: 12.5px; color: var(--text-tertiary); }
    `,
  ],
})
export class TrackingComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly data = signal<PublicTracking | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  constructor() {
    const token = this.route.snapshot.paramMap.get('token');
    this.http
      .get<PublicTracking>(`${environment.apiUrl}/deliveries/tracking/${token}`)
      .subscribe({
        next: (d) => { this.data.set(d); this.loading.set(false); },
        error: () => { this.error.set(true); this.loading.set(false); },
      });
  }
}
