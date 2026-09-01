import { HttpClient } from '@angular/common/http';
import { DatePipe, Location } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  product?: { id: string; name: string; price?: number; imageUrl?: string | null };
  productVariant?: { id: string; name: string; price?: number; publicPrice?: number } | null;
}

/** Dettaglio consegna (sola lettura), sezioni come l'app reale. */
interface DeliveryDetail {
  id: string;
  code: number;
  date: string;
  status: string;
  paymentStatus: string;
  /** Consegne da Fornitore: la fa il partner, non un valet. */
  deliveredByPartner?: boolean;
  /** Provincia salvata (geocodificata): per l'assegnazione, non ridotta dalla stringa. */
  province?: { id: string; code: string; name: string } | null;
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
  /** Il conto di una vendita: lo calcola il SERVER, coi suoi centesimi. */
  economiaVendita?: {
    incasso: number;
    commissione: number;
    ivaCommissione: number;
    commissioneConIva: number;
    dovutoLordo: number;
    dovutoNetto: number;
  } | null;
  deliveryPrice?: number;
  valetSalary?: number;
  /** Costo valet calcolato dal listino quando valetSalary non è congelato (admin/op). */
  valetSalaryDalListino?: number | null;
  valetAdditionalPrice?: number;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  trackingToken?: string;
  receivedBy?: string;
  partner?: { id: string; insegna: string };
  valet?: { id: string; firstName: string; lastName: string } | null;
  serviceType?: { id: string; name: string; pricingModel: string; scope?: string };
  products?: DeliveryProductRow[];
  logs?: DeliveryLog[];
}

@Component({
  selector: 'app-delivery-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TranslatePipe, FormsModule],
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
            <!-- Duplica: crea una NUOVA consegna coi dati di questa (ufficio e partner). -->
            <a class="act" [routerLink]="['/deliveries/new']" [queryParams]="{ duplica: d.id }">{{ 'common.duplicate' | translate }}</a>
          }
          <!-- Il link di tracciamento si condivide col CLIENTE: lo vede anche
               il partner (proprietario della consegna), non solo l'ufficio. -->
          @if (canShare()) {
            <button type="button" class="act" (click)="share(d)">{{ 'deliveryDetail.act.share' | translate }}</button>
          }
          @if (canManage()) {
            <button type="button" class="act" (click)="deliveredLink(d)">{{ 'deliveryDetail.act.deliveredLink' | translate }}</button>
          }
          <!-- Assegna: ufficio E team leader (nel suo perimetro). -->
          @if (canAssign()) {
            <button type="button" class="act primary" (click)="openAssign()">{{ 'deliveryDetail.act.assign' | translate }}</button>
          }
        </div>
        <!-- Legge 8 (§7): gli errori NON passano da un toast — banner
             persistente presso il contesto (verdetto custode 31/08). Il
             toast resta solo per i successi. -->
        @if (actionError()) { <div class="error-card action-err">{{ actionError() }}</div> }

        <!-- Le azioni del VALET (31/08): ritira e chiude. Solo in avanti —
             l'API rifiuta ogni altro passaggio. «Consegnata» apre il pop-up
             a-chi/firma/DDT; «Non consegnata» chiede il motivo: da questi
             stati dipendono paga e fattura, e non si torna indietro da soli. -->
        @if (puoLavorare(d)) {
          <div class="valet-azioni">
            <!-- Consegnata/Non consegnata SOLO dopo che è «in consegna»
                 (31/08): prima si mette in consegna, poi si chiude. -->
            @if (d.status !== 'in_delivery') {
              <button type="button" class="act primary" [disabled]="statoInCorso()" (click)="cambiaStato('in_delivery')">
                {{ 'deliveryDetail.valet.inDelivery' | translate }}
              </button>
            } @else {
              <button type="button" class="act ok" [disabled]="statoInCorso()" (click)="apriChiusura('delivered')">
                {{ 'deliveryDetail.valet.delivered' | translate }}
              </button>
              <button type="button" class="act ko" [disabled]="statoInCorso()" (click)="apriChiusura('not_delivered')">
                {{ 'deliveryDetail.valet.notDelivered' | translate }}
              </button>
            }
            @if (azioneErrore(); as e) { <span class="azione-errore">{{ e }}</span> }
          </div>
        }

        <!-- Su ogni consegna EFFETTUATA (consegnata o non consegnata) il valet
             ha due strade verso le Segnalazioni: chiedere un RIMBORSO o aprire
             un RECLAMO. (31/08, richiesta utente). -->
        @if (isValet() && consegnaEffettuata(d)) {
          <div class="valet-azioni">
            <button type="button" class="act" (click)="apriSegnalazione('rimborso')">
              {{ 'deliveryDetail.segnal.rimborso' | translate }}
            </button>
            <button type="button" class="act" (click)="apriSegnalazione('reclamo')">
              {{ 'deliveryDetail.segnal.reclamo' | translate }}
            </button>
          </div>
        }
      }
    </div>

    @if (banner(); as b) { <div class="toast">{{ b }}</div> }

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
            <!-- Costi nostri: nascosti al partner. Il conto della VENDITA
                 invece e' suo, e sta nel riquadro qui sotto. -->
            @if (!isPartner()) {
              <!-- ⚠️ In una VENDITA il campo «price» NON e' il prezzo: e' la QUOTA CHE
                   TRATTIENE DELUXY sul venduto. Chiamarlo «Prezzo» accanto al
                   valore dei prodotti fa leggere 8,93 come l'incasso del
                   partner, quando il partner ne incassa 35,70. Con l'etichetta
                   sbagliata ci sono cascato io per primo. -->
              <dt>{{ (venditaAlPartner(d) ? 'deliveryDetail.quotaDeluxy' : 'deliveryDetail.price') | translate }}</dt>
              <dd>{{ d.price != null ? d.price + ' €' : '—' }}</dd>
              <dt>{{ 'deliveryDetail.additionalPrice' | translate }}</dt><dd>{{ d.additionalPrice != null ? d.additionalPrice + ' €' : '—' }}</dd>
              <!-- Valore prodotti: quello scritto SULLA CONSEGNA (accordo col
                   partner), che non è il prezzo di catalogo né quello pubblico
                   Shopify. Senza questa riga il 215 di una vendita sembrava
                   uscito dal nulla accanto a un catalogo che dice 110.
                   ⚠️ Niente «Prezzo consegna» qui (l'utente, 26/08): quello che
                   il cliente paga per la consegna vive nei MARGINI, non qui. -->
              <dt>{{ 'deliveryDetail.productValue' | translate }}</dt><dd>{{ d.productValue != null ? d.productValue + ' €' : '—' }}</dd>

              <dt>{{ 'deliveryDetail.valetSalary' | translate }}</dt>
              <!-- ⚠️ Lo ZERO scritto non è la paga (01/09, #62899): per gli
                   Stipendi vince solo un numero > 0 — con 0 si calcola dal
                   listino, e qui si mostra QUELLA, non lo zero che mente. -->
              <dd>@if ((d.valetSalary ?? 0) > 0) { {{ d.valetSalary }} € }
                  @else if (d.valetSalaryDalListino != null) { {{ d.valetSalaryDalListino }} € <span class="muted">({{ 'deliveryDetail.fromListino' | translate }})</span> }
                  @else { — }</dd>
              <dt>{{ 'deliveryDetail.valetAdditionalPrice' | translate }}</dt><dd>{{ d.valetAdditionalPrice != null ? d.valetAdditionalPrice + ' €' : '—' }}</dd>
            }
          </dl>
        </section>

        <!-- IL CONTO DELLA VENDITA — deciso dall'utente il 28/08/2026:
             «per i servizi vendita il partner deve vedere il proprio incasso,
             nostra commissione e totale a lui dovuto».

             ⚠️ Sta FUORI dal riquadro dei costi, che ai partner e' nascosto:
             quei soldi sono i suoi, e nasconderglieli lo obbligava a chiedere
             a noi quanto prende. Al VALET non arriva: il server non manda
             nemmeno il campo (economiaVendita e' fra i SOLDI_DEL_PARTNER).

             ⚠️ I numeri li fa il SERVER. L'aliquota IVA vive in un posto solo
             (api/src/common/iva.ts) e la legge anche la Fatturazione: farla
             qui vorrebbe dire scriverla in due punti. -->
        @if (d.economiaVendita; as v) {
          <section class="card block conto-vendita">
            <h2>{{ 'deliveryDetail.saleAccount.title' | translate }}</h2>
            <dl>
              <dt>{{ 'deliveryDetail.saleAccount.income' | translate }}</dt>
              <dd>{{ v.incasso.toFixed(2) }} €
                <!-- Scomposizione prezzo × quantità: rende visibile come nasce
                     l'incasso (e salta all'occhio un «24 × 144» sbagliato). -->
                @if (d.products?.length) {
                  <span class="scomposto righe-prezzo">
                    @for (p of d.products; track p.id) {
                      <span class="riga-prezzo">{{ p.product?.name }}{{ (p.variantName || p.productVariant?.name) ? ' (' + (p.variantName || p.productVariant?.name) + ')' : '' }}: {{ (prezzoRiga(p) ?? 0).toFixed(2) }} € × {{ p.quantity }} = {{ ((prezzoRiga(p) ?? 0) * (p.quantity ?? 1)).toFixed(2) }} €</span>
                    }
                  </span>
                }
              </dd>

              <dt>{{ 'deliveryDetail.saleAccount.commission' | translate }}</dt>
              <dd>
                −{{ v.commissioneConIva.toFixed(2) }} €
                <span class="scomposto">
                  {{ v.commissione.toFixed(2) }} € + {{ 'deliveryDetail.saleAccount.vat' | translate }} {{ v.ivaCommissione.toFixed(2) }} €
                </span>
              </dd>

              <dt class="forte">{{ 'deliveryDetail.saleAccount.due' | translate }}</dt>
              <dd class="forte">{{ v.dovutoNetto.toFixed(2) }} €</dd>
            </dl>
            <!-- ⚠️ La Fatturazione mostra il DOVUTO LORDO (valore − quota), che
                 e' un altro numero: sopra c'e' ancora l'IVA della nostra
                 commissione. Se non si dicesse, le due schermate sembrerebbero
                 in disaccordo sullo stesso importo. -->
            <p class="nota-conto">
              {{ 'deliveryDetail.saleAccount.note' | translate: { lordo: v.dovutoLordo.toFixed(2) } }}
            </p>
          </section>
        }

        <!-- Destinatario e mittente -->
        <section class="card block">
          <h2>{{ 'deliveryDetail.section.people' | translate }}</h2>
          <!-- Al valet l'INDIRIZZO resta sempre visibile (serve al giro); i
               DATI ANAGRAFICI (nome, tel, email, citofono) si scoprono solo da
               «in consegna» (31/08, precisazione utente). -->
          <dl>
            <dt>{{ 'deliveries.col.address' | translate }}</dt><dd>{{ d.recipientAddress }}</dd>
          </dl>
          @if (isValet() && !destinatarioVisibile(d)) {
            <p class="muted">🔒 {{ 'deliveries.recipientHidden' | translate }}</p>
          } @else {
          <dl>
            <dt>{{ 'deliveries.col.recipient' | translate }}</dt>
            <dd>{{ d.recipientFirstName }} {{ d.recipientLastName }}@if (d.recipientIntercom) { <span class="muted"> · {{ 'deliveryDetail.intercom' | translate }}: {{ d.recipientIntercom }}</span> }</dd>
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
          }
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
                    <td>
                      @if (p.product?.imageUrl) {
                        <!-- Il nome apre la FOTO. L'icona dice che c'e'
                             qualcosa da vedere: un link invisibile non
                             lo clicca nessuno. -->
                        <button type="button" class="nome-foto" (click)="apriFoto(p)"
                                [title]="'deliveryDetail.foto.apri' | translate">
                          {{ p.product?.name }}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
                            <rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/>
                            <circle cx="9" cy="10.3" r="1.6"/>
                            <path d="M6 17.5l4.2-4.2 3 3 2.6-2.6 2.7 2.7"/>
                          </svg>
                        </button>
                      } @else {
                        {{ p.product?.name }}
                      }
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
              @else if (d.ddtFile.startsWith('data:')) {
                <!-- Foto caricata: il grezzo base64 non si mostra; sta negli Allegati. -->
                <a [href]="d.ddtFile" [download]="nomeAllegato('ricevuta')">⤓ {{ 'deliveryDetail.download' | translate }}</a>
              } @else if (eUrl(d.ddtFile)) {
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
                  <a [href]="d.receipt" [download]="nomeAllegato('ricevuta')"
                     [attr.target]="d.receipt.startsWith('data:') ? null : '_blank'" rel="noopener">
                    <img [src]="d.receipt" [alt]="'deliveryDetail.receipt' | translate" />
                  </a>
                  <a class="scarica-btn" [href]="d.receipt" [download]="nomeAllegato('ricevuta')">
                    ⤓ {{ 'deliveryDetail.download' | translate }}
                  </a>
                  <figcaption>{{ 'deliveryDetail.receipt' | translate }}</figcaption>
                </figure>
              }
              @if (d.receiverSign) {
                <figure class="allegato">
                  @if (scaricabile(d.receiverSign)) {
                    <a [href]="d.receiverSign" [download]="nomeAllegato('firma')"
                       [attr.target]="d.receiverSign.startsWith('data:') ? null : '_blank'" rel="noopener">
                      <img [src]="d.receiverSign" [alt]="'deliveryDetail.sign' | translate" />
                    </a>
                  } @else {
                    <span class="mono">{{ d.receiverSign }}</span>
                  }
                  <figcaption>{{ 'deliveryDetail.sign' | translate }}</figcaption>
                </figure>
              }
              @if (d.ddtFile) {
                <figure class="allegato">
                  @if (scaricabile(d.ddtFile)) {
                    <!-- La foto/ricevuta caricata dal valet: si vede e si SCARICA
                         (partner, admin, operation). I data URL si scaricano da soli. -->
                    <a [href]="d.ddtFile" [download]="nomeAllegato('ricevuta')"
                       [attr.target]="d.ddtFile.startsWith('data:') ? null : '_blank'" rel="noopener">
                      <img [src]="d.ddtFile" [alt]="'deliveryDetail.receipt' | translate" />
                    </a>
                    <a class="scarica-btn" [href]="d.ddtFile" [download]="nomeAllegato('ricevuta')">
                      ⤓ {{ 'deliveryDetail.download' | translate }}
                    </a>
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
          <section class="card block span-2 registro">
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
      <div class="dialog card" role="dialog" aria-modal="true">
        <!-- Testata sticky con la ✕ obbligatoria (Libro v1.7 §9): prima la
             finestra si chiudeva solo dal fondo o cliccando fuori. -->
        <header class="dialog-head">
          <h2>{{ 'deliveries.assign.title' | translate }}</h2>
          <button type="button" class="modal-close" (click)="assignOpen.set(false)" [attr.aria-label]="'common.close' | translate">×</button>
        </header>
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

    <!-- Chiusura del valet: CONSEGNATA (a chi + firma + DDT). Come nella
         vecchia app: receiverType/receiverSign/ddtFile sono gli stessi campi
         del legacy (5.994 «custode» reali). -->
    @if (chiusura() === 'delivered') {
      <div class="overlay" (click)="chiudiChiusura()"></div>
      <div class="dialog card" role="dialog" aria-modal="true">
        <header class="dialog-head">
          <h2>{{ 'deliveryDetail.valet.deliveredTitle' | translate: { code: delivery()?.code } }}</h2>
          <button type="button" class="modal-close" (click)="chiudiChiusura()" [attr.aria-label]="'common.close' | translate">×</button>
        </header>
        <div class="chiusura-corpo">
          <label class="campo-eti">{{ 'deliveryDetail.valet.aChi' | translate }}</label>
          <div class="chips">
            @for (t of TIPI_RICEVENTE; track t) {
              <button type="button" class="chip" [class.on]="receiverTipo === t" (click)="receiverTipo = t">
                {{ 'deliveryDetail.valet.tipo.' + t | translate }}
              </button>
            }
          </div>
          <input class="field" name="nomeRicevente" [(ngModel)]="nomeRicevente"
                 [placeholder]="'deliveryDetail.valet.nomePh' | translate" />

          <label class="campo-eti">{{ 'deliveryDetail.valet.firma' | translate }}</label>
          <canvas class="firma-canvas" #firmaCanvas width="640" height="220"
                  (pointerdown)="firmaGiu($event)" (pointermove)="firmaMuovi($event)"
                  (pointerup)="firmaSu($event)" (pointercancel)="firmaSu($event)"></canvas>
          <div class="firma-riga">
            <span class="muted piccolo">{{ 'deliveryDetail.valet.firmaHint' | translate }}</span>
            @if (firmaFatta()) {
              <button type="button" class="act mini" (click)="firmaPulisci()">{{ 'deliveryDetail.valet.firmaClear' | translate }}</button>
            }
          </div>

          <label class="campo-eti">{{ 'deliveryDetail.valet.ddt' | translate }}</label>
          @if (ddtFoto(); as foto) {
            <div class="ddt-anteprima">
              <img [src]="foto" alt="DDT" />
              <button type="button" class="act mini" (click)="ddtFoto.set(null)">{{ 'deliveryDetail.valet.ddtRemove' | translate }}</button>
            </div>
          } @else {
            <label class="act ddt-carica">
              {{ 'deliveryDetail.valet.ddtAdd' | translate }}
              <input type="file" accept="image/*" capture="environment" (change)="onDdt($event)" hidden />
            </label>
          }

          @if (azioneErrore(); as e) { <div class="error-card">{{ e }}</div> }
        </div>
        <div class="dialog-foot">
          <button type="button" class="act" [disabled]="statoInCorso()" (click)="chiudiChiusura()">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="act ok" [disabled]="statoInCorso()" (click)="confermaConsegnata()">
            {{ 'deliveryDetail.valet.confirmDelivered' | translate }}
          </button>
        </div>
      </div>
    }

    <!-- Chiusura del valet: NON CONSEGNATA (il motivo si registra, non solo lo stato). -->
    @if (chiusura() === 'not_delivered') {
      <div class="overlay" (click)="chiudiChiusura()"></div>
      <div class="dialog card" role="dialog" aria-modal="true">
        <header class="dialog-head">
          <h2>{{ 'deliveryDetail.valet.notDeliveredTitle' | translate: { code: delivery()?.code } }}</h2>
          <button type="button" class="modal-close" (click)="chiudiChiusura()" [attr.aria-label]="'common.close' | translate">×</button>
        </header>
        <div class="chiusura-corpo">
          <label class="campo-eti">{{ 'deliveryDetail.valet.motivo' | translate }}</label>
          <div class="chips colonna">
            @for (m of MOTIVI; track m) {
              <button type="button" class="chip" [class.on]="motivo === m" (click)="motivo = m">
                {{ 'deliveryDetail.valet.motivi.' + m | translate }}
              </button>
            }
          </div>
          <textarea class="field" rows="2" name="motivoDettaglio" [(ngModel)]="motivoDettaglio"
                    [placeholder]="'deliveryDetail.valet.dettaglioPh' | translate"></textarea>
          @if (azioneErrore(); as e) { <div class="error-card">{{ e }}</div> }
        </div>
        <div class="dialog-foot">
          <button type="button" class="act" [disabled]="statoInCorso()" (click)="chiudiChiusura()">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="act ko" [disabled]="statoInCorso()" (click)="confermaNonConsegnata()">
            {{ 'deliveryDetail.valet.confirmNotDelivered' | translate }}
          </button>
        </div>
      </div>
    }
    <!-- RIMBORSO / RECLAMO del valet su una consegna effettuata. -->
    @if (segnalTipo(); as tipo) {
      <div class="overlay" (click)="chiudiSegnalazione()"></div>
      <div class="dialog card" role="dialog" aria-modal="true">
        <header class="dialog-head">
          <h2>{{ 'deliveryDetail.segnal.' + tipo + 'Title' | translate: { code: delivery()?.code } }}</h2>
          <button type="button" class="modal-close" (click)="chiudiSegnalazione()" [attr.aria-label]="'common.close' | translate">×</button>
        </header>
        <div class="chiusura-corpo">
          @if (tipo === 'rimborso') {
            <label class="campo-eti">{{ 'deliveryDetail.segnal.importo' | translate }}</label>
            <input class="field" name="segImporto" inputmode="decimal" [(ngModel)]="segImporto"
                   [placeholder]="'deliveryDetail.segnal.importoPh' | translate" />
          }
          <label class="campo-eti">{{ 'deliveryDetail.segnal.motivo' | translate }}</label>
          <textarea class="field" rows="3" name="segMotivo" [(ngModel)]="segMotivo"
                    [placeholder]="'deliveryDetail.segnal.motivoPh' | translate"></textarea>
          @if (segErrore(); as e) { <div class="error-card">{{ e }}</div> }
        </div>
        <div class="dialog-foot">
          <button type="button" class="act" [disabled]="segInCorso()" (click)="chiudiSegnalazione()">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="act primary" [disabled]="segInCorso()" (click)="inviaSegnalazione(tipo)">
            {{ 'deliveryDetail.segnal.invia' | translate }}
          </button>
        </div>
      </div>
    }

    <!-- La foto del prodotto (§9: scrim unico, ✕ obbligatoria, Esc). -->
    @if (fotoAperta(); as f) {
      <div class="foto-scrim" (click)="chiudiFoto()" role="dialog" aria-modal="true" [attr.aria-label]="f.nome">
        <figure class="foto-box" (click)="$event.stopPropagation()">
          <button type="button" class="foto-x" (click)="chiudiFoto()" [attr.aria-label]="'common.close' | translate">✕</button>
          <img [src]="f.url" [alt]="f.nome" />
          <figcaption>{{ f.nome }}</figcaption>
        </figure>
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
      .scarica-btn { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 13px;
        font-weight: 550; color: var(--blue, #0a84ff); text-decoration: none; }
      .scarica-btn:hover { text-decoration: underline; }
      .form-head { margin-bottom: 24px; }
      /* Era un un link finto (href javascript:void): nell.albero di accessibilita. un
         link senza destinazione. Ora e. un bottone, e questa regola gli toglie
         il vestito nativo per lasciarlo identico a prima. */
      .back { appearance: none; background: none; border: none; padding: 0; font: inherit; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      .title-row { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .actions-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
      /* Azioni del valet: bersagli larghi, e' un flusso da telefono. */
      .valet-azioni { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
      .valet-azioni .act { padding: 12px 18px; font-size: 15px; }
      .act.ok { background: var(--green, #1f7a3d); color: #fff; border-color: transparent; }
      .act.ko { background: rgba(215, 0, 21, 0.08); color: var(--red); border-color: rgba(215, 0, 21, 0.25); }
      .azione-errore { color: var(--red); font-size: 13px; flex-basis: 100%; }
      .chiusura-corpo { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
      .campo-eti { font-size: 13px; font-weight: 550; color: var(--text-secondary); margin-top: 6px; }
      .chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .chips.colonna { flex-direction: column; align-items: stretch; }
      .chip { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px;
              padding: 10px 14px; font: inherit; font-size: 14px; cursor: pointer; text-align: left; }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .firma-canvas { width: 100%; height: 150px; border: 1px dashed var(--hairline-strong);
                      border-radius: 12px; background: var(--surface); touch-action: none; display: block; }
      .firma-riga { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .piccolo { font-size: 12px; }
      .act.mini { padding: 6px 12px; font-size: 13px; }
      .ddt-anteprima { display: flex; align-items: center; gap: 10px; }
      .ddt-anteprima img { width: 84px; height: 84px; object-fit: cover; border-radius: 10px; border: 1px solid var(--hairline); }
      .ddt-carica { display: inline-flex; cursor: pointer; }
      textarea.field { resize: vertical; font-family: inherit; }
      .act { appearance: none; font: inherit; font-size: 13px; font-weight: 550; padding: 7px 16px; border-radius: 980px; border: 1px solid var(--hairline); background: var(--surface); color: var(--text); cursor: pointer; }
      .act:hover { background: var(--fill); }
      .act:disabled { opacity: 0.45; cursor: default; }
      .act.primary { background: var(--ink, #1d1d1f); color: #fff; border-color: transparent; }
      .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--ink, #1d1d1f); color: #fff; padding: 10px 20px; border-radius: 980px; font-size: 13.5px; z-index: 60; box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
      .action-err { margin-top: 10px; }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.28); z-index: 50; }
      /* ⚠️ LA MODALE STA DENTRO LA VIEWPORT (Libro v1.7 §9): il pannello ha
         un tetto e scorre LUI (prima era senza max-height: con l'elenco valet
         lungo l'Annulla finiva sotto lo schermo). Testata con la ✕ e piede
         azioni sticky. Collaudo: a 375×812 e a 1366×768 il bottone di
         conferma si raggiunge senza scrollare la pagina. */
      .dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 51; width: min(440px, 92vw); max-height: min(92dvh, calc(100dvh - 40px)); overflow-y: auto; padding: 0 26px; }
      .dialog-head { position: sticky; top: 0; z-index: 2; background: var(--surface); display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 20px 0 10px; margin: 0 0 6px; border-bottom: 1px solid var(--hairline); }
      .dialog h2 { margin: 0; font-size: 18px; font-weight: 600; }
      .modal-close { border: 0; background: transparent; font-size: 22px; line-height: 1; color: var(--text-tertiary); cursor: pointer; padding: 2px 8px; border-radius: 999px; }
      .modal-close:hover { background: var(--fill); color: var(--text); }
      .tag { margin-left: 6px; font-size: 11px; background: rgba(0,113,227,0.1); color: var(--blue); border-radius: 980px; padding: 2px 8px; }
      .tag.warn { background: rgba(215,0,21,0.08); color: var(--red); }
      /* Lo scroll sta nel contenitore, mai nei figli (Libro §9): via il
         max-height interno alla lista. */
      .valet-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .valet-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--hairline); font-size: 14px; }
      .dialog-foot { display: flex; justify-content: flex-end; position: sticky; bottom: 0; z-index: 2; background: var(--surface); margin-top: 16px; padding: 12px 0 18px; border-top: 1px solid var(--hairline); }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 980px; }
      .block { padding: 22px 24px; }
      .block h2 { margin: 0 0 14px; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
      .span-2 { grid-column: 1 / -1; }
      dl { display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 8px 14px; margin: 0; font-size: 13.5px; }
      dt { color: var(--text-tertiary); }
      dd { margin: 0; color: var(--text); }
      /* L'unico numero del blocco che descrive denaro che ESCE da noi: si
         stacca, se no si legge come un costo in piu' del partner. */
      dd.incasso { color: var(--blue); font-weight: 600; }
      /* Il nome-prodotto che apre la foto: si dichiara (colore link +
         icona), ma resta testo — niente sottolineatura, che promette
         navigazione altrove (Libro §3). */
      .nome-foto { display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
        padding: 0; font: inherit; color: var(--blue); cursor: pointer; text-align: left; }
      .nome-foto svg { width: 17px; height: 17px; flex: 0 0 auto; opacity: 0.75; }
      .nome-foto:hover { text-decoration: underline; text-underline-offset: 3px; }
      .nome-foto:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; border-radius: 4px; }
      .foto-scrim { position: fixed; inset: 0; background: var(--scrim); z-index: 90;
        display: grid; place-items: center; padding: 24px; }
      .foto-box { position: relative; margin: 0; background: var(--surface); border-radius: var(--radius-l);
        box-shadow: var(--shadow-float); padding: 14px; max-width: min(92vw, 560px); }
      .foto-box img { display: block; max-width: 100%; max-height: min(70dvh, 560px); border-radius: var(--radius-m); margin: 0 auto; }
      .foto-box figcaption { margin-top: 10px; font-size: 13.5px; text-align: center; color: var(--text-secondary); }
      .foto-x { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: none;
        border-radius: 50%; background: var(--fill-hover); color: var(--text); cursor: pointer; font-size: 14px; }
      .foto-x:hover { background: var(--fill-active); }
      .foto-x:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
      /* Il conto della vendita: la riga che conta si stacca, le altre no. */
      .conto-vendita dt.forte, .conto-vendita dd.forte { font-weight: 650; color: var(--text); }
      .conto-vendita dd.forte { font-size: 15.5px; }
      .conto-vendita .scomposto { display: block; color: var(--text-tertiary); font-size: 12px; }
      .righe-prezzo { margin-top: 3px; }
      .righe-prezzo .riga-prezzo { display: block; font-variant-numeric: tabular-nums; }
      .nota-conto { margin: 12px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
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
      @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
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
  /** Mostrabile/scaricabile: un link http(s) o una foto caricata (data URL). */
  scaricabile(v: string | undefined | null): boolean {
    return !!v && /^(https?:|data:)/i.test(v);
  }
  /** Nome del file allo scaricamento (la consegna dà il numero). */
  nomeAllegato(base: string): string {
    return `${base}-consegna-${this.delivery()?.code ?? ''}.jpg`;
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

  /** Provincia della consegna: quella SALVATA (geocodificata) vince sulla
   *  deduzione dalla stringa — «Piazza Duca d'Aosta» a Milano non è Aosta. */
  readonly assignProvince = computed(() => {
    const d = this.delivery();
    if (!d) return null;
    if (d.province?.code) return this.provinces().find((p) => p.code === d.province!.code) ?? ({ code: d.province.code, name: d.province.name } as Province);
    return detectProvince(d.recipientAddress, this.provinces());
  });
  /**
   * Solo i valet ATTIVI (niente sospesi, niente segnaposto dell'import) che
   * hanno abilitata la provincia della consegna. Senza provincia riconosciuta
   * restano gli attivi, e il pannello lo dichiara col tag «provincia non
   * riconosciuta».
   */
  readonly assignValets = computed(() => {
    let attivi = this.valets().filter((v) => v.active !== false && v.placeholder !== true);
    // Solo chi ha il SERVIZIO della consegna a listino (regola 31/08/2026):
    // l'API rifiuta comunque, ma offrire nomi che verranno rifiutati e' peggio.
    const svc = this.delivery()?.serviceType?.id;
    // Solo per i servizi di mestiere: su uno scope 'partner' il listino
    // valet non esiste per costruzione (caso Salazar, 31/08).
    if (svc && this.delivery()?.serviceType?.scope !== 'partner') {
      attivi = attivi.filter((v) =>
        (v.services ?? []).some((s) => (s.serviceTypeId ?? s.serviceType?.id) === svc));
    }
    const prov = this.assignProvince();
    if (prov) attivi = attivi.filter((v) => (v.provinces ?? []).some((p) => p.province?.code === prov.code));
    // Ordine alfabetico per COGNOME (regola dell'utente 31/08).
    return [...attivi].sort((a, b) =>
      (a.lastName ?? '').localeCompare(b.lastName ?? '', 'it', { sensitivity: 'base' })
      || (a.firstName ?? '').localeCompare(b.firstName ?? '', 'it', { sensitivity: 'base' }));
  });

  /**
   * Il prezzo della riga: quello scritto sulla riga, poi quello della VARIANTE
   * scelta, e solo in ultimo il prodotto base — la Cappelliera base fa 110 ma
   * la M venduta qui ne fa 215.
   */
  /** La foto aperta: nome + url. Null = chiusa. */
  readonly fotoAperta = signal<{ nome: string; url: string } | null>(null);

  apriFoto(p: DeliveryProductRow): void {
    const url = p.product?.imageUrl;
    if (!url) return;
    this.fotoAperta.set({ nome: p.product?.name ?? '', url });
  }

  chiudiFoto(): void {
    this.fotoAperta.set(null);
  }

  /** Esc chiude la foto anche senza focus dentro la finestra. */
  @HostListener('document:keydown.escape')
  suEscape(): void {
    if (this.fotoAperta()) this.chiudiFoto();
  }

  /** Una vendita: il caso in cui `price` e' la NOSTRA quota, non il prezzo. */
  venditaAlPartner(d: { serviceType?: { pricingModel?: string } | null }): boolean {
    return d.serviceType?.pricingModel === 'VENDITA';
  }

  prezzoRiga(p: DeliveryProductRow): number | null {
    return p.price ?? p.productVariant?.price ?? p.product?.price ?? null;
  }

  /** Il partner non vede note interne né i costi. */
  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  // ==========================================================================
  // AZIONI DEL VALET (31/08/2026): ritira e chiude, come nella vecchia app.
  // ==========================================================================
  readonly TIPI_RICEVENTE = ['recipient', 'concierge', 'other'] as const;
  readonly MOTIVI = ['assente', 'indirizzo', 'rifiutata', 'chiuso', 'altro'] as const;
  readonly chiusura = signal<null | 'delivered' | 'not_delivered'>(null);
  readonly statoInCorso = signal(false);
  readonly azioneErrore = signal<string | null>(null);
  readonly ddtFoto = signal<string | null>(null);

  // Rimborso / reclamo del valet su una consegna effettuata → Segnalazioni.
  readonly segnalTipo = signal<null | 'rimborso' | 'reclamo'>(null);
  readonly segInCorso = signal(false);
  readonly segErrore = signal<string | null>(null);
  segImporto = '';
  segMotivo = '';
  readonly firmaFatta = signal(false);
  receiverTipo = 'recipient';
  nomeRicevente = '';
  motivo = '';
  motivoDettaglio = '';
  private firmaCtx: CanvasRenderingContext2D | null = null;
  private firmaTracciando = false;

  isValet(): boolean {
    return this.auth.user()?.role === 'VALET';
  }
  /** Il valet scopre il destinatario solo da «in consegna» in poi (31/08). */
  destinatarioVisibile(d: { status: string }): boolean {
    return ['in_delivery', 'delivered', 'not_delivered'].includes(d.status);
  }
  /** La consegna e' ancora in lavorazione: solo li' il valet puo' agire. */
  lavorabile(d: { status: string }): boolean {
    return ['assigned', 'accepted', 'in_preparation', 'in_delivery'].includes(d.status);
  }
  /** Consegna EFFETTUATA (consegnata o non): il valet può chiedere rimborso o reclamare. */
  consegnaEffettuata(d: { status: string }): boolean {
    return ['delivered', 'not_delivered', 'approved', 'invalidated'].includes(d.status);
  }
  /**
   * CONSEGNE DA FORNITORE (31/08): è il partner stesso a consegnare la SUA
   * consegna. Solo allora il partner vede il destinatario e ha i bottoni di
   * lavorazione, come un valet.
   */
  consegnaDaFornitore(d: { deliveredByPartner?: boolean; partner?: { id: string } }): boolean {
    return (
      this.isPartner() &&
      d?.deliveredByPartner === true &&
      d?.partner?.id === this.auth.user()?.partnerId
    );
  }
  /** Chi può muovere lo stato: il valet, o il partner che consegna da fornitore. */
  puoLavorare(d: { status: string; deliveredByPartner?: boolean; partner?: { id: string } }): boolean {
    if (this.isValet()) return this.lavorabile(d);
    if (this.consegnaDaFornitore(d)) {
      // Da fornitore la consegna può essere ancora «created» (senza valet).
      return ['created', 'assigned', 'accepted', 'in_preparation', 'in_delivery'].includes(d.status);
    }
    return false;
  }

  apriChiusura(tipo: 'delivered' | 'not_delivered'): void {
    this.azioneErrore.set(null);
    this.receiverTipo = 'recipient';
    this.nomeRicevente = '';
    this.motivo = '';
    this.motivoDettaglio = '';
    this.ddtFoto.set(null);
    this.firmaFatta.set(false);
    this.firmaCtx = null;
    this.chiusura.set(tipo);
  }
  chiudiChiusura(): void {
    if (!this.statoInCorso()) this.chiusura.set(null);
  }

  // --- firma su canvas (pointer events: dito, pennino e mouse) --------------
  private firmaPunto(ev: PointerEvent): { x: number; y: number; ctx: CanvasRenderingContext2D } | null {
    const canvas = ev.target as HTMLCanvasElement;
    if (!this.firmaCtx) {
      this.firmaCtx = canvas.getContext('2d');
      if (this.firmaCtx) {
        this.firmaCtx.lineWidth = 2.5;
        this.firmaCtx.lineCap = 'round';
        this.firmaCtx.strokeStyle = '#1d1f26';
      }
    }
    if (!this.firmaCtx) return null;
    // Le coordinate CSS vanno riportate ai pixel interni del canvas.
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * canvas.width,
      y: ((ev.clientY - r.top) / r.height) * canvas.height,
      ctx: this.firmaCtx,
    };
  }
  firmaGiu(ev: PointerEvent): void {
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    const p = this.firmaPunto(ev);
    if (!p) return;
    this.firmaTracciando = true;
    p.ctx.beginPath();
    p.ctx.moveTo(p.x, p.y);
  }
  firmaMuovi(ev: PointerEvent): void {
    if (!this.firmaTracciando) return;
    ev.preventDefault();
    const p = this.firmaPunto(ev);
    if (!p) return;
    p.ctx.lineTo(p.x, p.y);
    p.ctx.stroke();
    this.firmaFatta.set(true);
  }
  firmaSu(ev: PointerEvent): void {
    this.firmaTracciando = false;
  }
  firmaPulisci(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('.firma-canvas');
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.firmaFatta.set(false);
  }

  /** Il DDT si comprime NEL BROWSER (stesso giro delle foto dei preventivi). */
  onDdt(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1280;
      const scala = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      this.ddtFoto.set(canvas.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  confermaConsegnata(): void {
    const corpo: Record<string, string> = { status: 'delivered', receiverType: this.receiverTipo };
    const nome = this.nomeRicevente.trim();
    if (nome) corpo['receivedBy'] = nome;
    if (this.firmaFatta()) {
      const canvas = document.querySelector<HTMLCanvasElement>('.firma-canvas');
      if (canvas) corpo['receiverSign'] = canvas.toDataURL('image/png');
    }
    const ddt = this.ddtFoto();
    if (ddt) corpo['ddtFile'] = ddt;
    this.cambiaStato('delivered', corpo);
  }

  confermaNonConsegnata(): void {
    const eti: Record<string, string> = {
      assente: 'Destinatario assente', indirizzo: 'Indirizzo errato o introvabile',
      rifiutata: 'Il destinatario ha rifiutato', chiuso: 'Chiuso o non raggiungibile', altro: 'Altro',
    };
    const dett = this.motivoDettaglio.trim();
    if (!this.motivo && !dett) {
      this.azioneErrore.set(this.translate.instant('deliveryDetail.valet.motivoObbligatorio'));
      return;
    }
    const motivo = [this.motivo ? eti[this.motivo] : '', dett].filter(Boolean).join(' — ');
    this.cambiaStato('not_delivered', { status: 'not_delivered', notDeliveredReason: motivo });
  }

  cambiaStato(stato: string, corpo?: Record<string, string>): void {
    this.statoInCorso.set(true);
    this.azioneErrore.set(null);
    this.http.patch(`${environment.apiUrl}/deliveries/${this.id}/status`, corpo ?? { status: stato }).subscribe({
      next: () => {
        this.statoInCorso.set(false);
        this.chiusura.set(null);
        this.load();
      },
      error: (err) => {
        this.statoInCorso.set(false);
        this.azioneErrore.set(err?.error?.message ?? 'Errore nel cambio di stato');
      },
    });
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
  /** Chi può condividere il link di tracciamento col cliente: ufficio + partner. */
  canShare(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PARTNER';
  }
  /** Chi può assegnare: l'ufficio, e il team leader (nel suo perimetro, l'API verifica). */
  canAssign(): boolean {
    const u = this.auth.user();
    return this.canManage() || (u?.role === 'VALET' && u?.isTeamLeader === true);
  }

  constructor() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
    // I valet servono a chi può assegnare: ufficio E team leader.
    if (this.canAssign()) {
      this.http.get<ValetRef[]>(`${environment.apiUrl}/valets`).subscribe((v) => this.valets.set(v));
    }
    if (this.canManage()) {
      this.http.get<Province[]>(`${environment.apiUrl}/provinces`).subscribe((p) => this.provinces.set(p));
    }
  }

  private load(): void {
    this.http.get<DeliveryDetail>(`${environment.apiUrl}/deliveries/${this.id}`).subscribe({
      next: (d) => {
        this.delivery.set(d);
        this.loading.set(false);
        // Arrivando dai bottoni della LISTA (?chiudi=delivered|not_delivered)
        // il pop-up si apre da solo: il valet non deve cercare due volte.
        const chiudi = this.route.snapshot.queryParamMap.get('chiudi');
        if ((chiudi === 'delivered' || chiudi === 'not_delivered')
          && this.puoLavorare(d) && !this.chiusura()) {
          this.apriChiusura(chiudi);
        }
      },
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

  // ---- RIMBORSO / RECLAMO del valet → Segnalazioni ----
  apriSegnalazione(tipo: 'rimborso' | 'reclamo'): void {
    this.segImporto = '';
    this.segMotivo = '';
    this.segErrore.set(null);
    this.segnalTipo.set(tipo);
  }
  chiudiSegnalazione(): void { this.segnalTipo.set(null); }
  inviaSegnalazione(tipo: 'rimborso' | 'reclamo'): void {
    const motivo = this.segMotivo.trim();
    if (!motivo) { this.segErrore.set(this.translate.instant('deliveryDetail.segnal.manca')); return; }
    let importo: number | undefined;
    if (tipo === 'rimborso') {
      importo = parseFloat(this.segImporto.replace(',', '.'));
      if (!isFinite(importo) || importo <= 0) {
        this.segErrore.set(this.translate.instant('deliveryDetail.segnal.importoManca'));
        return;
      }
    }
    const d = this.delivery();
    const oggetto = this.translate.instant('deliveryDetail.segnal.' + tipo + 'Title', { code: d?.code });
    this.segInCorso.set(true);
    this.http.post(`${environment.apiUrl}/segnalazioni`, {
      tipo, deliveryId: this.id, oggetto, testo: motivo, importo,
    }).subscribe({
      next: () => {
        this.segInCorso.set(false);
        this.segnalTipo.set(null);
        this.banner.set(this.translate.instant('deliveryDetail.segnal.inviata'));
      },
      error: (err) => {
        this.segInCorso.set(false);
        this.segErrore.set(err?.error?.message ?? 'Errore');
      },
    });
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
      // DEROGA al divieto dei popup (§7): qui prompt() non chiede niente,
      // MOSTRA il testo gia' selezionato quando la clipboard e' negata
      // (http, permessi). L'alternativa sarebbe non far copiare affatto.
      () => { window.prompt(msg, text); },
    );
  }
}
