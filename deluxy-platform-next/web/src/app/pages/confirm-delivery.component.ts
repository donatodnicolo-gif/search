import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { DELIVERY_CLOSED_STATUSES } from '../core/models';

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

          @if (doneNon()) {
            <div class="err box">{{ 'confirmDelivery.doneNon' | translate }}</div>
          } @else if (done() || d.status === 'delivered' || d.status === 'approved') {
            <div class="ok">{{ 'confirmDelivery.done' | translate }}</div>
          } @else if (chiusa(d.status)) {
            <!-- Consegna annullata, non consegnata o invalidata: il link non la riapre.
                 Senza questo ramo la pagina offriva un bottone che il server rifiuta. -->
            <div class="err">{{ 'confirmDelivery.closed' | translate }}</div>
          } @else {
            <!-- ⭐ 06/09/2026 (regola utente): due esiti, ognuno con un pop-up di conferma. -->
            <div class="form azioni">
              <button class="btn btn-primary" (click)="apri('consegnata')">{{ 'confirmDelivery.confirm' | translate }}</button>
              <button class="btn btn-secondary" (click)="apri('non')">{{ 'confirmDelivery.notDelivered' | translate }}</button>
              @if (formError()) { <div class="err small">{{ formError() }}</div> }
            </div>
            @if (scelta(); as s) {
              <div class="velo" (click)="scelta.set(null)"></div>
              <div class="dialogo" role="dialog" aria-modal="true">
                <h2>{{ (s === 'consegnata' ? 'confirmDelivery.popup.titoloSi' : 'confirmDelivery.popup.titoloNo') | translate: { code: d.code } }}</h2>
                @if (s === 'consegnata') {
                  <label>{{ 'confirmDelivery.receivedBy' | translate }}</label>
                  <input class="field" [(ngModel)]="receivedBy" [placeholder]="'confirmDelivery.receivedByPlaceholder' | translate" />
                } @else {
                  <label>{{ 'confirmDelivery.popup.motivo' | translate }}</label>
                  <input class="field" [(ngModel)]="motivo" [placeholder]="'confirmDelivery.popup.motivoPh' | translate" />
                }
                @if (formError()) { <div class="err small">{{ formError() }}</div> }
                <div class="dialogo-piede">
                  <button class="btn btn-secondary" (click)="scelta.set(null)">{{ 'common.cancel' | translate }}</button>
                  <button class="btn" [class.btn-primary]="s === 'consegnata'" [class.btn-danger]="s === 'non'" [disabled]="saving()" (click)="s === 'consegnata' ? confirm() : nonConsegnata()">
                    {{ saving() ? ('common.saving' | translate) : ((s === 'consegnata' ? 'confirmDelivery.popup.confermaSi' : 'confirmDelivery.popup.confermaNo') | translate) }}
                  </button>
                </div>
              </div>
            }
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
      /* ⚠️ DIFETTO 4/5: gemello CSS di core/stati-consegna.ts (fonte unica). */
      .dot.s-created { background: var(--red); }
      .dot.s-assigned { background: var(--amber); }
      .dot.s-in_preparation { background: #ff9500; }
      .dot.s-accepted { background: var(--blue); }
      .dot.s-in_delivery { background: var(--purple); }
      .dot.s-delivered, .dot.s-approved { background: var(--green); }
      /* ⭐ 07/09/2026: non consegnata = nero, non rosso (stessa legenda dell'elenco). */
      .dot.s-not_delivered { background: var(--text, #1d1d1f); }
      .dot.s-not_accepted { background: var(--red); }
      .dot.s-cancelled, .dot.s-invalidated, .dot.s-archived { background: var(--grey); }
      .form { margin-top: 22px; display: flex; flex-direction: column; gap: 8px; }
      .form.azioni { flex-direction: row; flex-wrap: wrap; }
      .btn-danger { background: var(--red); color: #fff; }
      .err.box { margin-top: 22px; padding: 14px 16px; border-radius: var(--radius-l); background: rgba(215,0,21,0.08); border: 1px solid rgba(215,0,21,0.25); font-weight: 550; }
      .velo { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 90; }
      .dialogo { position: fixed; z-index: 91; left: 50%; top: 20vh; transform: translateX(-50%); width: min(92vw, 420px); background: var(--surface, #fff); border-radius: 16px; padding: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.25); display: flex; flex-direction: column; gap: 8px; }
      .dialogo h2 { margin: 0 0 6px; font-size: 18px; }
      .dialogo label { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .dialogo-piede { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
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
  readonly doneNon = signal(false);
  readonly scelta = signal<'consegnata' | 'non' | null>(null);
  readonly formError = signal<string | null>(null);
  receivedBy = '';
  motivo = '';
  apri(s: 'consegnata' | 'non'): void { this.formError.set(null); this.scelta.set(s); }
  nonConsegnata(): void {
    this.formError.set(null);
    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/deliveries/not-delivered/${this.token}`, { motivo: this.motivo.trim() }).subscribe({
      next: () => { this.saving.set(false); this.scelta.set(null); this.doneNon.set(true); },
      error: (err) => { this.saving.set(false); this.formError.set(err?.error?.message ?? 'Errore'); },
    });
  }
  private token = '';

  /**
   * La consegna è in uno stato CHIUSO diverso da «consegnata»: annullata, non
   * consegnata, non accettata, invalidata. Il link pubblico non deve poterla
   * riaprire — e la pagina non deve nemmeno offrire il bottone, o si finisce a
   * premere un tasto che il server rifiuta senza dire perché.
   */
  chiusa(status: string): boolean {
    return DELIVERY_CLOSED_STATUSES.includes(status);
  }

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
      next: () => { this.saving.set(false); this.scelta.set(null); this.done.set(true); },
      error: (err) => { this.saving.set(false); this.formError.set(err?.error?.message ?? 'Errore'); },
    });
  }
}
