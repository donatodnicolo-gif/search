import { HttpClient } from '@angular/common/http';
import { DatePipe, Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { Province, ValetRef } from '../core/models';
import { detectProvince } from '../core/province.util';

interface DeliveryLog {
  id: string; type: string; message: string; createdAt: string;
  userName?: string | null;
  /** Evento riconosciuto dall'orario (partita, consegnata, letta…), se univoco. */
  evento?: string | null;
}
interface DeliveryProductRow {
  id: string;
  quantity: number;
  price?: number;
  flexiblePrice: boolean;
  variantName?: string | null;
  product?: { id: string; name: string; price?: number };
  productVariant?: { id: string; name: string; price?: number; publicPrice?: number } | null;
}

/** Dettaglio consegna (sola lettura), sezioni come l'app reale. */
interface DeliveryDetail {
  id: string;
  code: number;
  date: string;
  status: string;
  paymentStatus: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  deliveryFlexible?: boolean;
  pickupTimeFrom?: string;
  pickupTimeTo?: string;
  pickupFlexible?: boolean;
  pickupAddress?: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientAddress: string;
  recipientIntercom?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  senderFirstName?: string;
  senderLastName?: string;
  senderPhone?: string;
  paymentOnDelivery: boolean;
  paymentAmount?: number;
  tryAndReturn?: boolean;
  deliveryCodeRequired?: boolean;
  notes?: string;
  internalNotes?: string;
  ddtNumber?: string;
  ddtBrand?: string;
  ddtFile?: string;
  receipt?: string;
  receiverSign?: string;
  personalizeSaleNotes?: string;
  deluxyDelivery?: boolean;
  price?: number;
  additionalPrice?: number;
  productValue?: number;
  deliveryPrice?: number;
  valetSalary?: number;
  valetAdditionalPrice?: number;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  trackingToken?: string;
  receivedBy?: string;
  partner?: { id: string; insegna: string };
  valet?: { id: string; firstName: string; lastName: string } | null;
  serviceType?: { id: string; name: string; pricingModel: string };
  products?: DeliveryProductRow[];
  logs?: DeliveryLog[];
}

@Component({
  selector: 'app-delivery-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe],
  template: `
    <div class="form-head">
      <!-- Torna da dove si e' arrivati (lista filtrata, Finanza…): un
           indirizzo fisso butterebbe via il punto di partenza. -->
      <button type="button" class="back" (click)="indietro()">← {{ 'deliveries.title' | translate }}</button>
      @if (delivery(); as d) {
        <div class="title-row">
          <h1>{{ 'deliveryDetail.title' | translate: { code: d.code } }}</h1>
          <span class="pill" [class]="'pill s-' + d.status">
            <span class="dot" [class]="'dot s-' + d.status"></span>{{ 'status.delivery.' + d.status | translate }}
          </span>
        </div>
        <!-- Azioni in alto (come app.deluxy.it): Stampa · Maps · Share · Delivered link · Assegna -->
        <div class="actions-bar">
          <button type="button" class="act" (click)="print()">{{ 'deliveryDetail.act.print' | translate }}</button>
          <button type="button" class="act" [disabled]="!mapsUrl(d)" (click)="openMaps(d)">{{ 'deliveryDetail.act.maps' | translate }}</button>
          @if (canEdit()) {
            <a class="act" [routerLink]="['/deliveries', d.id, 'edit']">{{ 'deliveryDetail.act.edit' | translate }}</a>
          }
          @if (canManage()) {
            <button type="button" class="act" (click)="share(d)">{{ 'deliveryDetail.act.share' | translate }}</button>
            <button type="button" class="act" (click)="deliveredLink(d)">{{ 'deliveryDetail.act.deliveredLink' | translate }}</button>
            <button type="button" class="act primary" (click)="openAssign()">{{ 'deliveryDetail.act.assign' | translate }}</button>
          }
        </div>
      }
    </div>

    @if (banner(); as b) { <div class="toast">{{ b }}</div> }
    @if (actionError()) { <div class="toast err">{{ actionError() }}</div> }

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (error()) {
      <div class="card state-card error">{{ error() }}</div>
    } @else {
      @if (delivery(); as d) {
      <div class="grid">
        <!-- Dati di consegna e ritiro -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.timing' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveries.col.date' | translate }}</dt><dd>{{ d.date | date: 'dd/MM/yyyy' }}</dd>
            <dt>{{ 'deliveries.col.delivery' | translate }}</dt>
            <dd>{{ d.deliveryTimeFrom ? (d.deliveryTimeFrom + (d.deliveryTimeTo ? '–' + d.deliveryTimeTo : '')) : '—' }}
              @if (d.deliveryFlexible) { <span class="tag">{{ 'common.flexible' | translate }}</span> }</dd>
            <dt>{{ 'deliveries.col.pickup' | translate }}</dt>
            <dd>{{ d.pickupTimeFrom ? (d.pickupTimeFrom + (d.pickupTimeTo ? '–' + d.pickupTimeTo : '')) : '—' }}
              @if (d.pickupFlexible) { <span class="tag">{{ 'common.flexible' | translate }}</span> }</dd>
            <dt>{{ 'deliveryDetail.pickupAddress' | translate }}</dt><dd>{{ d.pickupAddress || '—' }}</dd>
            <dt>{{ 'deliveries.col.valet' | translate }}</dt>
            <dd>{{ d.valet ? (d.valet.firstName + ' ' + d.valet.lastName) : ('common.notAssigned' | translate) }}</dd>
          </dl>
        </section>

        <!-- Scelta del servizio -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.service' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveries.col.partner' | translate }}</dt><dd>{{ d.partner?.insegna || '—' }}</dd>
            <dt>{{ 'deliveries.col.service' | translate }}</dt><dd>{{ d.serviceType?.name || '—' }}</dd>
            <dt>{{ 'deliveryDetail.pricingModel' | translate }}</dt>
            <dd>{{ d.serviceType ? ('enums.servicePricing.' + d.serviceType.pricingModel | translate) : '—' }}</dd>
            @if (d.distanceKm != null) {
              <dt>{{ 'deliveryDetail.distance' | translate }}</dt><dd>{{ d.distanceKm }} km</dd>
            }
            <!-- Costi: nascosti al partner -->
            @if (!isPartner()) {
              <dt>{{ 'deliveryDetail.price' | translate }}</dt><dd>{{ d.price != null ? d.price + ' €' : '—' }}</dd>
              <dt>{{ 'deliveryDetail.additionalPrice' | translate }}</dt><dd>{{ d.additionalPrice != null ? d.additionalPrice + ' €' : '—' }}</dd>
              <!-- Valore prodotti: quello scritto SULLA CONSEGNA (accordo col
                   partner), che non è il prezzo di catalogo né quello pubblico
                   Shopify. Senza questa riga il 215 di una vendita sembrava
                   uscito dal nulla accanto a un catalogo che dice 110.
                   ⚠️ Niente «Prezzo consegna» qui (l'utente, 26/08): quello che
                   il cliente paga per la consegna vive nei MARGINI, non qui. -->
              <dt>{{ 'deliveryDetail.productValue' | translate }}</dt><dd>{{ d.productValue != null ? d.productValue + ' €' : '—' }}</dd>
              <dt>{{ 'deliveryDetail.valetSalary' | translate }}</dt><dd>{{ d.valetSalary != null ? d.valetSalary + ' €' : '—' }}</dd>
              <dt>{{ 'deliveryDetail.valetAdditionalPrice' | translate }}</dt><dd>{{ d.valetAdditionalPrice != null ? d.valetAdditionalPrice + ' €' : '—' }}</dd>
            }
          </dl>
        </section>

        <!-- Destinatario e mittente -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.people' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveries.col.recipient' | translate }}</dt><dd>{{ d.recipientFirstName }} {{ d.recipientLastName }}</dd>
            <dt>{{ 'deliveries.col.address' | translate }}</dt><dd>{{ d.recipientAddress }}</dd>
            <dt>{{ 'deliveryDetail.intercom' | translate }}</dt><dd>{{ d.recipientIntercom || '—' }}</dd>
            <!-- ⚠️ Telefono e mail CLICCABILI: e' il gesto piu' frequente del
                 turno di un valet, che col telefono in mano deve chiamare chi
                 riceve. Prima erano testo nudo — si selezionava il numero a
                 mano e si usciva dall'app. L'indirizzo era gia' coperto dal
                 bottone Maps qui sopra; il telefono no. -->
            <dt>{{ 'deliveryDetail.phone' | translate }}</dt>
            <dd>@if (d.recipientPhone) { <a [href]="'tel:' + d.recipientPhone">{{ d.recipientPhone }}</a> } @else { — }</dd>
            <dt>{{ 'deliveryDetail.email' | translate }}</dt>
            <dd>@if (d.recipientEmail) { <a [href]="'mailto:' + d.recipientEmail">{{ d.recipientEmail }}</a> } @else { — }</dd>
            <dt>{{ 'deliveryDetail.sender' | translate }}</dt>
            <dd>{{ (d.senderFirstName || d.senderLastName) ? (d.senderFirstName + ' ' + d.senderLastName) : '—' }}
              @if (d.senderPhone) { · <a [href]="'tel:' + d.senderPhone">{{ d.senderPhone }}</a> }</dd>
          </dl>
        </section>

        <!-- Gestione dell'ordine -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.order' | translate }}</h2>
          @if (d.products?.length) {
            <table class="mini">
              <thead><tr>
                <th>{{ 'deliveryDetail.product' | translate }}</th>
                <th class="num">{{ 'deliveryDetail.qty' | translate }}</th>
                @if (!isPartner()) { <th class="num">{{ 'deliveryDetail.price' | translate }}</th> }
              </tr></thead>
              <tbody>
                @for (p of d.products; track p.id) {
                  <tr>
                    <td>{{ p.product?.name }}
                      <!-- La variante non è un dettaglio: la Cappelliera base fa
                           110, la M ne fa 215 — senza la variante il prezzo
                           giusto sembra sbagliato. -->
                      @if (p.variantName || p.productVariant?.name) {
                        <span class="variante">{{ p.variantName || p.productVariant?.name }}</span>
                      }
                    </td>
                    <td class="num">{{ p.quantity }}</td>
                    @if (!isPartner()) {
                      <td class="num">{{ prezzoRiga(p) != null ? (prezzoRiga(p) + ' €') : '—' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          } @else { <p class="muted">{{ 'deliveryDetail.noProducts' | translate }}</p> }
          <dl class="mt">
            <dt>{{ 'deliveryDetail.paymentOnDelivery' | translate }}</dt>
            <dd>{{ (d.paymentOnDelivery ? 'common.yes' : 'common.no') | translate }}
              {{ d.paymentOnDelivery && d.paymentAmount != null ? '· ' + d.paymentAmount + ' €' : '' }}</dd>
            <dt>{{ 'deliveryDetail.tryAndReturn' | translate }}</dt><dd>{{ (d.tryAndReturn ? 'common.yes' : 'common.no') | translate }}</dd>
            <dt>{{ 'deliveryDetail.paymentStatus' | translate }}</dt><dd>{{ 'enums.deliveryPaymentStatus.' + d.paymentStatus | translate }}</dd>
          </dl>
        </section>

        <!-- Documentazione e note -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.docs' | translate }}</h2>
          <dl>
            <dt>{{ 'deliveryDetail.ddtNumber' | translate }}</dt>
            <dd>{{ d.ddtNumber || '—' }} @if (d.ddtBrand) { <span class="pill">{{ d.ddtBrand }}</span> }</dd>
            <dt>{{ 'deliveryDetail.ddtFile' | translate }}</dt>
            <dd>
              @if (!d.ddtFile) { — }
              @else if (eUrl(d.ddtFile)) {
                <a [href]="d.ddtFile" target="_blank" rel="noopener">{{ d.ddtFile }}</a>
              } @else {
                <!-- ⚠️ Nelle consegne importate ddtFile è solo un NOME DI FILE
                     (es. "peonieegirasoli_720x-B789.jpg"): il documento sta sul
                     sistema originario e non è raggiungibile da qui. Mostrarlo
                     come collegamento darebbe un link rotto. -->
                <span class="mono">{{ d.ddtFile }}</span>
                <span class="allegato-nota">{{ 'deliveryDetail.fileOnLegacy' | translate }}</span>
              }
            </dd>
            <dt>{{ 'deliveryDetail.notes' | translate }}</dt><dd>{{ d.notes || '—' }}</dd>
            <dt>{{ 'deliveryDetail.personalization' | translate }}</dt><dd>{{ d.personalizeSaleNotes || '—' }}</dd>
            <!-- Note interne: mai visibili al partner -->
            @if (!isPartner()) {
              <dt>{{ 'deliveryDetail.internalNotes' | translate }}</dt><dd>{{ d.internalNotes || '—' }}</dd>
            }
          </dl>
        </section>

        <!-- Allegati: la foto/ricevuta della consegna e il documento DDT -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.attachments' | translate }}</h2>
          @if (!d.receipt && !d.receiverSign && !d.ddtFile) {
            <p class="muted">{{ 'deliveryDetail.noAttachments' | translate }}</p>
          } @else {
            <div class="allegati">
              @if (d.receipt) {
                <figure class="allegato">
                  <a [href]="d.receipt" target="_blank" rel="noopener">
                    <img [src]="d.receipt" [alt]="'deliveryDetail.receipt' | translate" />
                  </a>
                  <figcaption>{{ 'deliveryDetail.receipt' | translate }}</figcaption>
                </figure>
              }
              @if (d.receiverSign) {
                <figure class="allegato">
                  @if (eUrl(d.receiverSign)) {
                    <a [href]="d.receiverSign" target="_blank" rel="noopener">
                      <img [src]="d.receiverSign" [alt]="'deliveryDetail.sign' | translate" />
                    </a>
                  } @else {
                    <span class="mono">{{ d.receiverSign }}</span>
                  }
                  <figcaption>{{ 'deliveryDetail.sign' | translate }}</figcaption>
                </figure>
              }
              @if (d.ddtFile) {
                <figure class="allegato doc">
                  @if (eUrl(d.ddtFile)) {
                    <a [href]="d.ddtFile" target="_blank" rel="noopener">📄 {{ d.ddtFile }}</a>
                  } @else {
                    <span class="mono">📄 {{ d.ddtFile }}</span>
                    <span class="allegato-nota">{{ 'deliveryDetail.fileOnLegacy' | translate }}</span>
                  }
                  <figcaption>{{ 'deliveryDetail.ddtFile' | translate }}</figcaption>
                </figure>
              }
            </div>
          }
        </section>

        <!-- Storico consegna: solo admin/operation -->
        @if (canSeeLogs()) {
          <section class="card block span-2">
            <h2>{{ 'deliveryDetail.section.history' | translate }}</h2>
            @if (d.logs?.length) {
              <ul class="logs">
                @for (l of d.logs; track l.id) {
                  <li>
                    <span class="log-date">{{ l.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
                    <span class="log-msg">
                      <!-- Le righe importate dicono solo «legacy#15957»: il vecchio
                           sistema registrava chi e quando, non che cosa. Quando
                           l'orario combacia con un evento della consegna (partita,
                           consegnata, letta…) si scrive QUELLO; se non combacia
                           con niente resta «aggiornata» — un'etichetta dedotta
                           male è peggio di una generica. -->
                      @if (l.type === 'legacy_update') {
                        {{ (l.evento ? ('deliveryDetail.logEvent.' + l.evento) : 'deliveryDetail.logUpdated') | translate }}
                        <span class="log-ref">{{ l.message }}</span>
                      } @else {
                        {{ l.message }}
                      }
                      @if (l.userName) { <span class="log-user">— {{ l.userName }}</span> }
                    </span>
                  </li>
                }
              </ul>
            } @else { <p class="muted">{{ 'deliveryDetail.noLogs' | translate }}</p> }
          </section>
        }
      </div>
      }
    }

    @if (assignOpen()) {
      <div class="overlay" (click)="assignOpen.set(false)"></div>
      <div class="dialog card">
        <h2>{{ 'deliveries.assign.title' | translate }}</h2>
        @if (delivery(); as d) {
          <p class="muted">{{ 'deliveries.assign.forDelivery' | translate: { code: d.code } }}
            @if (assignProvince(); as p) { <span class="tag">{{ p.name }}</span> }
            @else { <span class="tag warn">{{ 'deliveries.assign.noProvince' | translate }}</span> }
          </p>
        }
        @if (assignValets().length === 0) {
          <p class="muted">{{ 'deliveries.assign.noValets' | translate }}</p>
        } @else {
          <ul class="valet-list">
            @for (v of assignValets(); track v.id) {
              <li>
                <span>{{ v.lastName }} {{ v.firstName }}</span>
                <button type="button" class="act primary" [disabled]="busy()" (click)="assign(v.id)">{{ 'deliveries.assign.choose' | translate }}</button>
              </li>
            }
          </ul>
        }
        <div class="dialog-foot">
          <button type="button" class="act" (click)="assignOpen.set(false)">{{ 'common.cancel' | translate }}</button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .allegati { display: flex; flex-wrap: wrap; gap: 16px; }
      .allegato { margin: 0; max-width: 220px; }
      .allegato img {
        width: 100%;
        border-radius: var(--radius-m, 10px);
        border: 1px solid var(--hairline, rgba(0,0,0,.1));
        display: block;
        background: var(--surface-sunken, #f2f2f4);
      }
      .allegato figcaption { font-size: 12px; color: var(--text-tertiary); margin-top: 6px; }
      .allegato.doc { max-width: none; }
      .allegato-nota { display: block; font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
      .form-head { margin-bottom: 24px; }
      /* Era un un link finto (href javascript:void): nell.albero di accessibilita. un
         link senza destinazione. Ora e. un bottone, e questa regola gli toglie
         il vestito nativo per lasciarlo identico a prima. */
      .back { appearance: none; background: none; border: none; padding: 0; font: inherit; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .actions-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
      .act { appearance: none; font: inherit; font-size: 13px; font-weight: 550; padding: 7px 16px; border-radius: 980px; border: 1px solid var(--hairline); background: var(--surface); color: var(--text); cursor: pointer; }
      .act:hover { background: var(--fill); }
      .act:disabled { opacity: 0.45; cursor: default; }
      .act.primary { background: var(--ink, #1d1d1f); color: #fff; border-color: transparent; }
      .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink, #1d1d1f); color: #fff; padding: 10px 20px; border-radius: 980px; font-size: 13.5px; z-index: 60; box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
      .toast.err { background: var(--red); }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.28); z-index: 50; }
      .dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 51; width: min(440px, 92vw); padding: 24px 26px; }
      .dialog h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
      .tag { margin-left: 6px; font-size: 11px; background: rgba(0,113,227,0.1); color: var(--blue); border-radius: 980px; padding: 2px 8px; }
      .tag.warn { background: rgba(215,0,21,0.08); color: var(--red); }
      .valet-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
      .valet-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--hairline); font-size: 14px; }
      .dialog-foot { display: flex; justify-content: flex-end; margin-top: 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; color: var(--text); }
      .mt { margin-top: 14px; }
      .muted { color: var(--text-tertiary); font-size: 13.5px; margin: 0; }
      .tag { margin-left: 6px; font-size: 11px; background: rgba(0,113,227,0.1); color: var(--blue); border-radius: 980px; padding: 2px 8px; }
      table.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
      table.mini th, table.mini td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--hairline); }
      table.mini th { color: var(--text-tertiary); font-weight: 500; font-size: 12px; }
      .num { text-align: right; }
      .logs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .logs li { display: flex; gap: 12px; font-size: 13px; }
      .log-date { color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .log-user { color: var(--text-secondary); }
      .log-ref { color: var(--text-tertiary); font-size: 11.5px; font-variant-numeric: tabular-nums; }
      .variante { margin-left: 6px; font-size: 11px; background: var(--fill); color: var(--text-secondary); border-radius: 980px; padding: 2px 8px; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
      /* ⚠️ DIFETTO 4/5: colori dal gemello CSS di core/stati-consegna.ts
         (fonte unica). Tokenizzati dove esiste il token. */
      .dot.s-created { background: var(--red); }
      .dot.s-assigned { background: var(--amber); }
      .dot.s-in_preparation { background: #ff9500; }
      .dot.s-accepted { background: var(--blue); }
      .dot.s-in_delivery { background: var(--purple); }
      .dot.s-cancellation_requested { background: #5ac8fa; }
      .dot.s-delivered, .dot.s-approved { background: var(--green); }
      .dot.s-not_delivered, .dot.s-not_accepted { background: var(--red); }
      .dot.s-cancelled, .dot.s-invalidated, .dot.s-archived { background: var(--grey); }
      .state-card { padding: 32px; color: var(--text-secondary); }
      .state-card.error { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DeliveryDetailComponent {
  /**
   * Un allegato è apribile solo se è un indirizzo web.
   * Nelle consegne importate `receipt` è un URL completo su app.deluxy.it e
   * funziona, mentre `ddtFile` è soltanto il NOME del file sul sistema
   * originario (125 consegne): mostrarlo come collegamento darebbe un link rotto.
   */
  eUrl(v: string | undefined | null): boolean {
    return !!v && /^https?:\/\//i.test(v);
  }

  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  /** Torna da dove si e' arrivati; se la storia e' vuota (link diretto), alla lista. */
  /**
   * Torna alla lista COM'ERA: stesso giorno, stessi filtri, stessa pagina.
   *
   * ⚠️ Prima era `location.back()` con un ripiego su `/deliveries`. Due
   * problemi: aprendo la consegna in una scheda nuova (che è come si arriva qui
   * dalle azioni di riga) `history.length` è comunque > 1 per via della
   * cronologia del browser, e il «indietro» portava fuori dall'app; e il
   * ripiego riportava la lista a OGGI, buttando via il giorno che si stava
   * guardando — che è proprio quello che l'utente ha segnalato.
   *
   * Adesso si va sulla lista con i filtri che la lista stessa ha salvato
   * quando li ha usati. Senza niente di salvato (scheda nuova, sessione
   * appena aperta) si va sulla lista normale, com'era.
   */
  indietro(): void {
    let salvata: string | null = null;
    try { salvata = sessionStorage.getItem('consegne:ultima-vista'); } catch { /* privata: pazienza */ }
    if (!salvata) { this.router.navigate(['/deliveries']); return; }
    const p = new URLSearchParams(salvata);
    const tieni = ['date', 'dateTo', 'status', 'view', 'q', 'page'];
    const queryParams: Record<string, string> = {};
    for (const k of tieni) { const v = p.get(k); if (v) queryParams[k] = v; }
    this.router.navigate(['/deliveries'], { queryParams });
  }

  readonly delivery = signal<DeliveryDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly banner = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly assignOpen = signal(false);
  readonly provinces = signal<Province[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  private id = '';

  /** Provincia dedotta dall'indirizzo del destinatario. */
  readonly assignProvince = computed(() => {
    const d = this.delivery();
    return d ? detectProvince(d.recipientAddress, this.provinces()) : null;
  });
  /**
   * Solo i valet ATTIVI (niente sospesi, niente segnaposto dell'import) che
   * hanno abilitata la provincia della consegna. Senza provincia riconosciuta
   * restano gli attivi, e il pannello lo dichiara col tag «provincia non
   * riconosciuta».
   */
  readonly assignValets = computed(() => {
    const attivi = this.valets().filter((v) => v.active !== false && v.placeholder !== true);
    const prov = this.assignProvince();
    if (!prov) return attivi;
    return attivi.filter((v) => (v.provinces ?? []).some((p) => p.province?.code === prov.code));
  });

  /**
   * Il prezzo della riga: quello scritto sulla riga, poi quello della VARIANTE
   * scelta, e solo in ultimo il prodotto base — la Cappelliera base fa 110 ma
   * la M venduta qui ne fa 215.
   */
  prezzoRiga(p: DeliveryProductRow): number | null {
    return p.price ?? p.productVariant?.price ?? p.product?.price ?? null;
  }

  /** Il partner non vede note interne né i costi. */
  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  /** Storico/log e azioni gestionali: solo admin e operation. */
  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }
  /** Modifica: la rotta ammette anche il partner (l'API applica le sue regole). */
  canEdit(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PARTNER';
  }
  canSeeLogs(): boolean { return this.canManage(); }

  constructor() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
    if (this.canManage()) {
      this.http.get<Province[]>(`${environment.apiUrl}/provinces`).subscribe((p) => this.provinces.set(p));
      this.http.get<ValetRef[]>(`${environment.apiUrl}/valets`).subscribe((v) => this.valets.set(v));
    }
  }

  private load(): void {
    this.http.get<DeliveryDetail>(`${environment.apiUrl}/deliveries/${this.id}`).subscribe({
      next: (d) => { this.delivery.set(d); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Errore nel caricamento della consegna');
      },
    });
  }

  // ---- STAMPA ----
  print(): void { window.print(); }

  // ---- MAPS ----
  mapsUrl(d: DeliveryDetail): string | null {
    if (d.latitude != null && d.longitude != null) {
      return `https://www.google.com/maps/search/?api=1&query=${d.latitude},${d.longitude}`;
    }
    if (d.recipientAddress) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.recipientAddress)}`;
    }
    return null;
  }
  openMaps(d: DeliveryDetail): void {
    const url = this.mapsUrl(d);
    if (url) window.open(url, '_blank');
  }

  // ---- SHARE: link pubblico di monitoraggio ----
  share(d: DeliveryDetail): void {
    this.actionError.set(null);
    this.http.get<{ token: string }>(`${environment.apiUrl}/deliveries/${d.id}/tracking-link`).subscribe({
      next: (r) => this.copy(`${location.origin}/tracking/${r.token}`, this.translate.instant('deliveryDetail.act.shareCopied')),
      error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
    });
  }

  // ---- DELIVERED LINK: link pubblico di conferma consegna ----
  deliveredLink(d: DeliveryDetail): void {
    this.actionError.set(null);
    this.http.get<{ token: string }>(`${environment.apiUrl}/deliveries/${d.id}/tracking-link`).subscribe({
      next: (r) => this.copy(`${location.origin}/consegnata/${r.token}`, this.translate.instant('deliveryDetail.act.deliveredCopied')),
      error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
    });
  }

  // ---- ASSEGNA ----
  openAssign(): void { this.actionError.set(null); this.assignOpen.set(true); }
  assign(valetId: string): void {
    this.busy.set(true);
    this.http.patch(`${environment.apiUrl}/deliveries/${this.id}/assign`, { valetId }).subscribe({
      next: () => { this.busy.set(false); this.assignOpen.set(false); this.load(); },
      error: (err) => { this.busy.set(false); this.actionError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  private copy(text: string, msg: string): void {
    navigator.clipboard?.writeText(text).then(
      () => { this.banner.set(msg); setTimeout(() => this.banner.set(null), 2500); },
      () => { window.prompt(msg, text); },
    );
  }
}
