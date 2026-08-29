import { HttpClient } from '@angular/common/http';
import { Location } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { loadGoogleMaps } from '../core/google-maps';
import { detectProvince } from '../core/province.util';
import { AuthService } from '../core/auth.service';

declare const google: any;
import {
  Customer,
  DELIVERY_PAYMENT_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  Partner,
  Product,
  Province,
  ServiceType,
  ValetRef,
} from '../core/models';

interface ProductRow {
  productId: string;
  /** La variante scelta (es. la taglia M): il prezzo giusto dipende da lei. */
  productVariantId: string | null;
  quantity: number | null;
  flexiblePrice: boolean;
  price: number | null;
}

@Component({
  selector: 'app-delivery-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <!-- La freccia torna alla schermata PRECEDENTE (dettaglio, lista
             filtrata…), non a un indirizzo fisso: chi arriva dal dettaglio
             deve ritrovarlo. -->
        <button type="button" class="back" (click)="indietro()">← {{ 'deliveryForm.backToDeliveries' | translate }}</button>
        <h1>{{ (editId() ? 'deliveryForm.editTitle' : 'deliveryForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'deliveryForm.caption' | translate }}</p>
      </div>
      <!-- Il codice di consegna e' un flag di testa, in alto a destra: come
           nell'app attuale, non sepolto in fondo alla documentazione. -->
      <label class="toggle testa-flag">
        <input type="checkbox" [(ngModel)]="model.deliveryCodeRequired" />
        <span>{{ 'deliveryForm.field.deliveryCodeRequired' | translate }}</span>
      </label>
    </div>

    <!-- ⭐ COMPILA CON L'AI (27/08): si detta o si incolla un testo, o si carica
         la foto di un ordine, e il form si RIEMPIE. Non si salva niente: la
         proposta va rivista e confermata da chi la manda. Solo sulla consegna
         NUOVA — in modifica riscriverebbe sopra a dati gia' controllati. -->
    @if (!editId() && aiPossibile()) {
      <section class="card ai-box" [class.aperto]="aiAperto()">
        @if (!aiAperto()) {
          <button type="button" class="btn btn-secondary" (click)="aiAperto.set(true)">
            ✨ {{ 'deliveryForm.ai.open' | translate }}
          </button>
          <span class="ai-sub">{{ 'deliveryForm.ai.sub' | translate }}</span>
        } @else {
          <div class="ai-testa">
            <strong>✨ {{ 'deliveryForm.ai.title' | translate }}</strong>
            <button type="button" class="link" (click)="aiAperto.set(false)">{{ 'common.close' | translate }}</button>
          </div>
          <textarea
            class="field ai-testo"
            rows="3"
            [(ngModel)]="aiTesto"
            [ngModelOptions]="{ standalone: true }"
            [placeholder]="'deliveryForm.ai.placeholder' | translate"
          ></textarea>
          <div class="ai-azioni">
            <!-- ⚠️ La voce si trascrive NEL BROWSER: l'AI non ascolta l'audio.
                 Dove il riconoscimento non c'e' (Firefox, iOS vecchi) il
                 bottone non compare, invece di comparire e non fare niente. -->
            @if (vocePossibile) {
              <button type="button" class="btn btn-secondary" [class.registra]="inAscolto()" (click)="dettatura()">
                {{ (inAscolto() ? 'deliveryForm.ai.listening' : 'deliveryForm.ai.voice') | translate }}
              </button>
            }
            <label class="btn btn-secondary file">
              {{ 'deliveryForm.ai.image' | translate }}
              <input type="file" accept="image/*" capture="environment" (change)="aiImmagine($event)" hidden />
            </label>
            @if (aiNomeImmagine()) { <span class="ai-file">{{ aiNomeImmagine() }}</span> }
            <button type="button" class="btn btn-primary" [disabled]="aiInCorso()" (click)="aiCompila()">
              {{ (aiInCorso() ? 'deliveryForm.ai.reading' : 'deliveryForm.ai.fill') | translate }}
            </button>
          </div>
          @if (aiErrore()) { <div class="ai-err">{{ aiErrore() }}</div> }
          @if (aiEsito(); as e) {
            <!-- La proposta si DICHIARA: quanto ci crede, che cosa ha capito e
                 che cosa non ha trovato. Un modulo che si riempie da solo senza
                 dire perche' e' un modulo di cui non ci si puo' fidare. -->
            <div class="ai-esito" [class]="'ai-esito c-' + e.confidenza">
              <div><strong>{{ 'deliveryForm.ai.proposal' | translate }}</strong> — {{ 'deliveryForm.ai.confidence.' + e.confidenza | translate }}</div>
              <div class="ai-perche">{{ e.perche }}</div>
              @if (e.campiMancanti?.length) {
                <div class="ai-mancanti">{{ 'deliveryForm.ai.missing' | translate }}: {{ e.campiMancanti.join(', ') }}</div>
              }
            </div>
          }
        }
      </section>
    }

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- 1. Scelta del servizio -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.service.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.service.sub' | translate }}</span></header>
        <!-- Ordine: DATA → INDIRIZZO → PARTNER → SERVIZIO.
             La catena delle dipendenze va in questa direzione: dall'indirizzo si
             deduce la provincia, la provincia restringe i partner abilitati, e il
             partner scelto determina quali servizi ha davvero a listino. -->
        <div class="grid-2">
          <label class="fld"><span class="req">{{ 'deliveryForm.field.date' | translate }}</span>
            <input class="field" type="date" name="date" [(ngModel)]="model.date" [min]="deliveryMinDate()" required />
            @if (selectedService()?.noticeDays) { <span class="slot-hint">{{ 'deliveryForm.hint.notice' | translate:{ days: selectedService()?.noticeDays, date: deliveryMinDate() } }}</span> }
          </label>
          <label class="fld"><span class="req">{{ 'deliveryForm.field.recipientAddress' | translate }}</span>
            <input #addressInput class="field" name="recipientAddress" [(ngModel)]="model.recipientAddress" (ngModelChange)="onAddressChange()" required autocomplete="off" [placeholder]="'deliveryForm.placeholder.address' | translate" />
            @if (addressProvince()) { <span class="slot-hint">{{ 'deliveryForm.hint.provinceDetected' | translate:{ code: addressProvince()?.code } }}</span> }
            <!-- Un indirizzo ESTERO non e' un errore di provincia: la provincia
                 semplicemente non si applica, e si dice con una nota, non con
                 un avviso giallo. -->
            @else if (indirizzoEstero()) { <span class="slot-hint">{{ 'deliveryForm.hint.foreignAddress' | translate }}</span> }
            @else if (model.recipientAddress) { <span class="slot-hint warn">{{ 'deliveryForm.hint.provinceUnknown' | translate }}</span> }
            @if (mapsMancante() && puoConfigurare()) {
              <span class="slot-hint warn">
                {{ 'deliveryForm.hint.noMapsKey' | translate }}
                <a routerLink="/settings">{{ 'deliveryForm.hint.noMapsKeyLink' | translate }}</a>
              </span>
            }
          </label>
          <label class="fld"><span class="req">{{ 'deliveryForm.field.partner' | translate }}</span>
            <select class="field" name="partnerId" [(ngModel)]="model.partnerId" (ngModelChange)="onPartnerChange()" required>
              <option value="">{{ 'deliveryForm.placeholder.selectPartner' | translate }}</option>
              @for (p of partnerOptions(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select>
            @if (addressProvince() && filteredPartners().length === 0) { <span class="slot-hint warn">{{ 'deliveryForm.hint.noPartners' | translate }}</span> }
          </label>
          <label class="fld"><span class="req">{{ 'deliveryForm.field.service' | translate }}</span>
            <select class="field" name="serviceTypeId" [(ngModel)]="model.serviceTypeId" (ngModelChange)="onServiceChange()" required>
              <option value="">{{ 'deliveryForm.placeholder.selectService' | translate }}</option>
              @for (s of serviceOptions(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select>
            @if (!model.partnerId) {
              <span class="slot-hint">{{ 'deliveryForm.hint.selectPartnerFirst' | translate }}</span>
            } @else if (servizioDelPartner().length === 0) {
              <span class="slot-hint warn">{{ 'deliveryForm.hint.noServicesForPartner' | translate }}</span>
            }
          </label>
          <!-- L'ORARIO DI CONSEGNA sta qui, non nel blocco dopo: e' un dato
               essenziale quanto la data. Viene per ultimo perche' le fasce le
               genera il servizio (min/max e passo), quindi prima va scelto quello. -->
          <label class="fld"><span>{{ 'deliveryForm.field.deliverySlot' | translate }} *
            @if (selectedService()) { <em>{{ 'deliveryForm.timing.slotSize' | translate:{ hours: slotHours() } }}</em> }</span>
            @if (!selectedService()) {
              <select class="field" disabled><option>{{ 'deliveryForm.placeholder.selectService' | translate }}</option></select>
              <span class="slot-hint">{{ 'deliveryForm.timing.selectServiceFirst' | translate }}</span>
            } @else if (model.deliveryFlexible && selectedService()?.allowFlexibleTime) {
              <div class="grid-2">
                <input class="field" type="time" step="900" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom" />
                <input class="field" type="time" step="900" name="deliveryTimeTo" [(ngModel)]="model.deliveryTimeTo" />
              </div>
            } @else {
              <select class="field" name="deliveryTimeFrom" [(ngModel)]="model.deliveryTimeFrom">
                <option value="">{{ 'deliveryForm.placeholder.selectSlot' | translate }}</option>
                @for (slot of deliverySlots(); track slot.from) { <option [value]="slot.from">{{ slot.from }}–{{ slot.to }}</option> }
              </select>
              @if (deliverySlots().length === 0) { <span class="slot-hint warn">{{ 'deliveryForm.timing.noSlots' | translate }}</span> }
            }
            @if (selectedService()?.allowFlexibleTime) {
              <label class="toggle mini"><input type="checkbox" name="deliveryFlexible" [(ngModel)]="model.deliveryFlexible" /><span>{{ 'deliveryForm.timing.deliveryFlexible' | translate }}</span></label>
            }
          </label>
        </div>
      </section>

      <!-- 2. Data di consegna e ritiro -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.pickup.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.pickup.sub' | translate }}</span></header>

        <!-- Ritiro -->
        <label class="toggle mt2"><input type="checkbox" name="pickupFlexible" [(ngModel)]="model.pickupFlexible" /><span>{{ 'deliveryForm.timing.pickupFlexible' | translate }}</span></label>
        @if (model.pickupFlexible) {
          <div class="grid-2 mt">
            <label class="fld"><span class="req">{{ 'deliveryForm.field.pickupFrom' | translate }}</span>
              <input class="field" type="time" step="900" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom" /></label>
            <label class="fld"><span class="req">{{ 'deliveryForm.field.pickupTo' | translate }}</span>
              <input class="field" type="time" step="900" name="pickupTimeTo" [(ngModel)]="model.pickupTimeTo" /></label>
          </div>
        } @else {
          <label class="fld mt" style="max-width:280px"><span class="req">{{ 'deliveryForm.field.pickupTime' | translate }} <em>{{ 'deliveryForm.timing.pickupSlotSize' | translate }}</em></span>
            <select class="field" name="pickupTimeFrom" [(ngModel)]="model.pickupTimeFrom">
              <option value="">{{ 'deliveryForm.placeholder.selectTime' | translate }}</option>
              @for (t of pickupTimeOptions; track t) { <option [value]="t">{{ t }}</option> }
            </select>
            @if (model.pickupTimeFrom) { <span class="slot-hint">→ {{ model.pickupTimeFrom }}–{{ plusOneHour(model.pickupTimeFrom) }}</span> }
          </label>
        }
      </section>

      <!-- 3. Scelta del salario (assegnazione) -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.assignment.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.assignment.sub' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.valet' | translate }}</span>
            <select class="field" name="valetId" [(ngModel)]="model.valetId">
              <option value="">{{ 'common.notAssigned' | translate }}</option>
              @for (v of valetOptions(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.status' | translate }}</span>
            <select class="field" name="status" [(ngModel)]="model.status">
              <option value="">{{ 'deliveryForm.option.automatic' | translate }}</option>
              @for (s of statusOptions; track s[0]) { <option [value]="s[0]">{{ 'status.delivery.' + s[0] | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.paymentStatus' | translate }}</span>
            <select class="field" name="paymentStatus" [(ngModel)]="model.paymentStatus">
              @for (s of paymentStatuses; track s[0]) { <option [value]="s[0]">{{ 'enums.deliveryPaymentStatus.' + s[0] | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'deliveryForm.field.valetService' | translate }}</span>
            <select class="field" name="valetServiceId" [(ngModel)]="model.valetServiceId">
              <option value="">— {{ 'deliveryForm.option.automaticLower' | translate }} —</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="deluxyDelivery" [(ngModel)]="model.deluxyDelivery" /><span>{{ 'deliveryForm.toggle.deluxySale' | translate }}</span></label>
      </section>

      <!-- 4. Destinatario e mittente -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.people.title' | translate }}</h2></header>
        <!-- Ricerca cliente, non tendina.
             I clienti in produzione sono 4.092 e la tendina ne mostrava 500:
             gli altri 3.592 non erano raggiungibili in nessun modo da qui. -->
        <label class="fld"><span>{{ 'deliveryForm.field.existingCustomer' | translate }}</span>
          @if (clienteScelto(); as c) {
            <div class="scelto">
              <span><strong>{{ c.lastName }} {{ c.firstName }}</strong>
                @if (c.email) { <span class="muted">· {{ c.email }}</span> }
                @if (c.phone) { <span class="muted">· {{ c.phone }}</span> }
              </span>
              <button type="button" class="btn btn-secondary mini" (click)="scollegaCliente()">
                {{ 'deliveryForm.customer.change' | translate }}
              </button>
            </div>
          } @else {
            <input class="field" name="cercaCliente" [ngModel]="cercaCliente()"
                   (ngModelChange)="cercaClienti($event)" autocomplete="off"
                   [placeholder]="'deliveryForm.customer.search' | translate" />
            @if (cercandoClienti()) { <span class="slot-hint">{{ 'common.loading' | translate }}</span> }
            @else if (cercaCliente().length >= 2 && !risultatiClienti().length) {
              <span class="slot-hint">{{ 'deliveryForm.customer.none' | translate }}</span>
            }
            @if (risultatiClienti().length) {
              <ul class="risultati">
                @for (c of risultatiClienti(); track c.id) {
                  <li><button type="button" (click)="scegliCliente(c)">
                    <strong>{{ c.lastName }} {{ c.firstName }}</strong>
                    @if (c.email) { <span class="muted">· {{ c.email }}</span> }
                    @if (c.phone) { <span class="muted">· {{ c.phone }}</span> }
                  </button></li>
                }
              </ul>
            }
            <span class="slot-hint">{{ 'deliveryForm.customer.hint' | translate }}</span>
          }
        </label>
        @if (!model.customerId) {
          <label class="toggle mt"><input type="checkbox" name="saveCustomer" [(ngModel)]="model.saveCustomer" /><span>{{ 'deliveryForm.toggle.saveCustomer' | translate }}</span></label>
        }
        <div class="grid-2 mt">
          <label class="fld"><span class="req">{{ 'deliveryForm.field.recipientLastName' | translate }}</span>
            <input class="field" name="recipientLastName" [(ngModel)]="model.recipientLastName" required /></label>
          <label class="fld"><span class="req">{{ 'deliveryForm.field.recipientFirstName' | translate }}</span>
            <input class="field" name="recipientFirstName" [(ngModel)]="model.recipientFirstName" required /></label>
          <label class="fld"><span class="req">{{ 'deliveryForm.field.intercom' | translate }}</span>
            <input class="field" name="recipientIntercom" [(ngModel)]="model.recipientIntercom" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.recipientPhone' | translate }}</span>
            <input class="field" name="recipientPhone" [(ngModel)]="model.recipientPhone" placeholder="+39 …" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.recipientEmail' | translate }}</span>
            <input class="field" type="email" name="recipientEmail" [(ngModel)]="model.recipientEmail" /></label>
        </div>
        <div class="divider"></div>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.senderLastName' | translate }}</span>
            <input class="field" name="senderLastName" [(ngModel)]="model.senderLastName" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.senderFirstName' | translate }}</span>
            <input class="field" name="senderFirstName" [(ngModel)]="model.senderFirstName" /></label>
          <label class="fld"><span>{{ 'deliveryForm.field.senderPhone' | translate }}</span>
            <input class="field" name="senderPhone" [(ngModel)]="model.senderPhone" /></label>
        </div>
        <label class="fld mt" style="max-width:280px"><span>{{ 'deliveryForm.field.smsPhone' | translate }}</span>
          <input class="field" name="smsPhoneNo" [(ngModel)]="model.smsPhoneNo" placeholder="+39 …" /></label>
        <div class="toggles mt">
          <span class="group-label">{{ 'deliveryForm.sms.groupLabel' | translate }}</span>
          <label class="toggle"><input type="checkbox" name="smsOnCreated" [(ngModel)]="model.smsOnCreated" /><span>{{ 'deliveryForm.sms.onCreated' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="smsOnDeparted" [(ngModel)]="model.smsOnDeparted" /><span>{{ 'deliveryForm.sms.onDeparted' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="smsOnArrived" [(ngModel)]="model.smsOnArrived" /><span>{{ 'deliveryForm.sms.onArrived' | translate }}</span></label>
        </div>
      </section>

      <!-- 5. Gestione dell'ordine -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.order.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.order.sub' | translate }}</span></header>
        @if (productRows.length === 0) { <p class="muted">{{ 'deliveryForm.order.noProducts' | translate }}</p> }
        @for (row of productRows; track $index) {
          <div class="prod-item">
            <div class="prod-top">
              <select class="field" [(ngModel)]="row.productId" (ngModelChange)="onProductChange(row)" [name]="'prod' + $index">
                <option value="">{{ 'deliveryForm.placeholder.selectProduct' | translate }}</option>
                @for (p of sortedProducts(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.partner ? '' : ' (' + ('deliveryForm.order.generic' | translate) + ')' }}</option> }
              </select>
              <input class="field num qty" type="number" min="1" [placeholder]="'deliveryForm.placeholder.qty' | translate" [(ngModel)]="row.quantity" [name]="'qty' + $index" />
              <button type="button" class="icon-btn" (click)="removeProduct($index)" [title]="'deliveryForm.order.remove' | translate">✕</button>
            </div>
            <!-- La variante non è un dettaglio: la Cappelliera base fa 110, la M
                 ne fa 215 — senza sceglierla la consegna nasce col prezzo sbagliato. -->
            @if (productVariants(row.productId).length) {
              <div class="prod-variant">
                <select class="field" [(ngModel)]="row.productVariantId" (ngModelChange)="onVariantChange(row)" [name]="'pvar' + $index">
                  <option [ngValue]="null">{{ 'deliveryForm.order.noVariant' | translate }}</option>
                  @for (v of productVariants(row.productId); track v.id) {
                    <option [ngValue]="v.id">{{ v.name }}{{ v.price != null ? ' — ' + v.price + ' €' : '' }}</option>
                  }
                </select>
              </div>
            }
            <div class="prod-bottom">
              <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.flexiblePrice" (change)="onFlexToggle(row)" [name]="'pflex' + $index" /><span>{{ 'deliveryForm.order.flexiblePrice' | translate }}</span></label>
              @if (row.flexiblePrice) {
                <span class="price-lbl">{{ 'deliveryForm.order.priceEuro' | translate }}</span>
                <input class="field num price-in" type="number" step="0.01" [(ngModel)]="row.price" [name]="'pprice' + $index" />
              } @else {
                <span class="price-static">{{ 'deliveryForm.order.priceLabel' | translate }} <strong>{{ rowPrice(row) != null ? (rowPrice(row) + ' €') : '—' }}</strong></span>
              }
            </div>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addProduct()">+ {{ 'deliveryForm.order.addProduct' | translate }}</button>

        <div class="toggles mt">
          <label class="toggle"><input type="checkbox" name="paymentOnDelivery" [(ngModel)]="model.paymentOnDelivery" /><span>{{ 'deliveryForm.order.paymentOnDelivery' | translate }}</span></label>
          <label class="toggle"><input type="checkbox" name="tryAndReturn" [(ngModel)]="model.tryAndReturn" /><span>{{ 'deliveryForm.order.tryAndReturn' | translate }}</span></label>
        </div>
        @if (model.paymentOnDelivery) {
          <label class="fld mt" style="max-width:260px"><span>{{ 'deliveryForm.order.cashToCollect' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="paymentAmount" [(ngModel)]="model.paymentAmount" /></label>
        }
      </section>

      <!-- 6. Listino -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.pricing.title' | translate }}</h2>
          <span class="block-sub">{{ 'deliveryForm.section.pricing.sub' | translate }}</span></header>
        <div class="listino">
          <div>
            <span class="group-label">{{ 'deliveryForm.pricing.billableGroup' | translate }}</span>
            <label class="toggle mb"><input type="checkbox" name="billable" [(ngModel)]="model.billable" /><span>{{ 'deliveryForm.pricing.billable' | translate }}</span></label>
            <div class="grid-2">
              <label class="fld"><span>{{ 'deliveryForm.pricing.price' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="price" [(ngModel)]="model.price" [placeholder]="'deliveryForm.placeholder.auto' | translate" /></label>
              <label class="fld"><span>{{ 'deliveryForm.pricing.plusMinus' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="additionalPrice" [(ngModel)]="model.additionalPrice" /></label>
              <!-- ⚠️ Niente «Consegna prezzo» qui (l'utente, 26/08): quello che
                   il cliente paga per la consegna non si indica sulle consegne
                   — entra nei MARGINI, dalla cache dell'ordine Shopify. -->
            </div>
          </div>
          <div>
            <span class="group-label">{{ 'deliveryForm.pricing.payableGroup' | translate }}</span>
            <label class="toggle mb"><input type="checkbox" name="payable" [(ngModel)]="model.payable" /><span>{{ 'deliveryForm.pricing.payable' | translate }}</span></label>
            <div class="grid-2">
              <label class="fld"><span>{{ 'deliveryForm.pricing.valetSalary' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="valetSalary" [(ngModel)]="model.valetSalary" /></label>
              <label class="fld"><span>{{ 'deliveryForm.pricing.plusMinus' | translate }}</span>
                <input class="field num" type="number" step="0.01" name="valetAdditionalPrice" [(ngModel)]="model.valetAdditionalPrice" /></label>
            </div>
          </div>
        </div>
        <!-- ⚠️ Qui NIENTE «prezzo flessibile»: nel Listino dell'app attuale ci
             sono solo prezzi e plus/minus. Il prezzo flessibile e' una cosa
             delle RIGHE PRODOTTO (sezione «Gestione dell'ordine»), dove gia'
             sta; isFlexiblePrice e flexiblePrice della consegna restano in
             banca dati come memoria del legacy, e il modello continua a
             portarli senza toccarli. -->
        @if (isHourly()) {
          <label class="fld mt" style="max-width:200px"><span>{{ 'deliveryForm.pricing.hours' | translate }}</span>
            <input class="field num" type="number" min="1" name="hours" [(ngModel)]="model.hours" /></label>
        }
      </section>

      <!-- 7. Documentazione e note -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'deliveryForm.section.docs.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'deliveryForm.field.ddtNumber' | translate }}</span>
            <input class="field" name="ddtNumber" [(ngModel)]="model.ddtNumber" /></label>
          <!-- Con piu' brand lo stesso numero DDT esiste su negozi diversi:
               senza il brand il numero non identifica la vendita. Solo per le
               VENDITE, e li' e' OBBLIGATORIO quando c'e' un numero DDT. -->
          @if (isVendita()) {
            <label class="fld"><span class="req">{{ 'deliveryForm.field.ddtBrand' | translate }}</span>
              <select class="field" name="ddtBrand" [(ngModel)]="model.ddtBrand" [required]="!!model.ddtNumber.trim()">
                <option value="">{{ 'deliveryForm.ddtBrandScegli' | translate }}</option>
                @for (b of marchiDdt; track b) { <option [value]="b">{{ b }}</option> }
              </select></label>
          }
          <label class="fld"><span>{{ 'deliveryForm.field.ddtFile' | translate }}</span>
            <input class="field" name="ddtFile" [(ngModel)]="model.ddtFile" placeholder="https://…" /></label>
        </div>
        <label class="fld span-2 mt"><span>{{ 'deliveryForm.field.notes' | translate }}</span>
          <textarea class="field" rows="2" name="notes" [(ngModel)]="model.notes"></textarea></label>
        <label class="fld span-2 mt"><span>{{ 'deliveryForm.field.personalization' | translate }}</span>
          <textarea class="field" rows="2" name="personalizeSaleNotes" [(ngModel)]="model.personalizeSaleNotes"></textarea></label>
        <label class="fld span-2 mt"><span>{{ 'deliveryForm.field.internalNotes' | translate }} <em>{{ 'deliveryForm.field.internalNotesRoles' | translate }}</em></span>
          <textarea class="field" rows="2" name="internalNotes" [(ngModel)]="model.internalNotes"></textarea></label>
      </section>

      @if (justSaved()) { <div class="ok-card card">{{ 'deliveryForm.savedNotice.pre' | translate }} <strong>{{ 'deliveryForm.savedNotice.create' | translate }}</strong> {{ 'deliveryForm.savedNotice.or' | translate }} <strong>{{ 'common.duplicate' | translate }}</strong> {{ 'deliveryForm.savedNotice.post' | translate }}</div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions sticky">
        <a routerLink="/deliveries" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'deliveryForm.submit') | translate) }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .testa-flag { margin-top: 6px; white-space: nowrap; }
      /* Bottone, non un link finto (href javascript:void): un link senza destinazione
         non e. un link. Il vestito nativo si toglie qui. */
      .back { appearance: none; background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 16px; }
      .listino { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
      .mt { margin-top: 16px; }
      .mt2 { margin-top: 20px; }
      .slot-hint { margin-top: 6px; font-size: 12.5px; color: var(--gold-strong); font-weight: 550; }
      .scelto {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 9px 12px; border: 1px solid var(--hairline, #e5e5ea);
        border-radius: var(--radius-md, 12px); background: var(--surface-2, #f5f5f7);
      }
      .scelto .muted { color: var(--text-tertiary); font-weight: 400; }
      .risultati {
        list-style: none; margin: 6px 0 0; padding: 0; max-height: 260px; overflow-y: auto;
        border: 1px solid var(--hairline, #e5e5ea); border-radius: var(--radius-md, 12px); background: #fff;
      }
      .risultati li + li { border-top: 1px solid var(--hairline, #e5e5ea); }
      .risultati button {
        display: block; width: 100%; text-align: left; padding: 9px 12px;
        background: none; border: 0; cursor: pointer; font: inherit;
      }
      .risultati button:hover { background: var(--surface-2, #f5f5f7); }
      .risultati .muted { color: var(--text-tertiary); }
      .btn.mini { padding: 4px 12px; font-size: 13px; }
      .slot-hint.warn { color: var(--red); }
      .toggle.mini { margin-top: 6px; font-size: 13px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .fld em { color: var(--text-tertiary); font-style: normal; font-weight: 400; }
      .span-2 { grid-column: 1 / -1; }
      .num { text-align: right; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .divider { height: 1px; background: var(--hairline); margin: 18px 0; }
      .prod-row { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; margin-bottom: 10px; align-items: center; }
      .prod-item { border: 1px solid var(--hairline); border-radius: var(--radius-m); padding: 12px 14px; margin-bottom: 10px; }
      .prod-top { display: grid; grid-template-columns: 1fr 120px auto; gap: 8px; align-items: center; }
      .prod-variant { margin-top: 8px; max-width: 320px; }
      .prod-bottom { display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap; }
      .price-static { font-size: 13.5px; color: var(--text-secondary); }
      .price-lbl { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .price-in { max-width: 130px; }
      .toggle.sm { font-size: 13px; }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s var(--ease); }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: center; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .group-label { display: block; width: 100%; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      /* Compila con l'AI */
      .ai-box { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 18px; padding: 14px 18px; }
      .ai-box.aperto { display: block; }
      .ai-sub { font-size: 13px; color: var(--text-secondary); }
      .ai-testa { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
      .ai-testa strong { font-size: 15px; }
      .ai-testo { width: 100%; resize: vertical; min-height: 74px; }
      .ai-azioni { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
      .ai-azioni .file { position: relative; cursor: pointer; display: inline-flex; align-items: center; }
      .ai-file { font-size: 12.5px; color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .btn.registra { background: rgba(215,0,21,0.1); color: var(--red); border-color: rgba(215,0,21,0.25); }
      .ai-err { margin-top: 10px; font-size: 13.5px; color: var(--red); }
      /* Il colore dice quanto ci crede: chi legge una proposta deve vedere
         subito se fidarsi o rileggere riga per riga. */
      .ai-esito { margin-top: 12px; padding: 11px 14px; border-radius: var(--radius-l); font-size: 13.5px; }
      .ai-esito.c-alta { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); }
      .ai-esito.c-media { background: rgba(184,150,62,0.1); border: 1px solid rgba(184,150,62,0.28); }
      .ai-esito.c-bassa { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.18); }
      .ai-perche { margin-top: 4px; color: var(--text-secondary); }
      .ai-mancanti { margin-top: 6px; font-size: 12.5px; color: var(--text-secondary); }
      @media (max-width: 760px) { .grid-2, .grid-4, .listino { grid-template-columns: 1fr; } }
    `,
  ],
})
export class DeliveryFormComponent implements AfterViewInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  /** Torna da dove si e' arrivati; se la storia e' vuota (link diretto), alla lista. */
  indietro(): void {
    if (history.length > 1) this.location.back();
    else this.router.navigate(['/deliveries']);
  }
  private readonly translate = inject(TranslateService);
  private readonly zone = inject(NgZone);

  /** Vero quando in Impostazioni manca la chiave Google Maps: i suggerimenti
   *  indirizzo non possono funzionare e conviene dirlo invece di far sembrare
   *  che il campo sia rotto. */
  /**
   * ⚠️ `model` e' un oggetto normale, non un signal: un computed() che legge
   * model.partnerId NON si ricalcola mai quando la scelta cambia. E' il motivo
   * per cui i servizi non si restringevano scegliendo il partner. Questi due
   * segnali rispecchiano la selezione, ed e' cio' che i computed osservano.
   */
  readonly partnerSel = signal('');
  readonly servizioSel = signal('');

  readonly mapsMancante = signal(false);

  // ── COMPILA CON L'AI ───────────────────────────────────────────────────────
  /**
   * LA RICHIESTA da cui si arriva (`/deliveries/new?richiesta=<id>`).
   *
   * ⚠️ Serve a due cose: precaricare il TESTO nel pannello dell'AI, e — al
   * salvataggio — COLLEGARE la consegna nata alla richiesta e segnarla
   * accettata. Senza il collegamento, chi l'ha mandata non saprebbe mai che
   * fine ha fatto, e la richiesta resterebbe in lista a sembrare da fare.
   */
  readonly daRichiesta = signal<string | null>(null);

  /** La chiave c'e'? Lo dice il server con un si'/no, mai col valore. */
  readonly aiPossibile = signal(false);
  readonly aiAperto = signal(false);
  readonly aiInCorso = signal(false);
  readonly aiErrore = signal<string | null>(null);
  readonly aiEsito = signal<{ confidenza: string; perche: string; campiMancanti: string[] } | null>(null);
  readonly aiNomeImmagine = signal<string | null>(null);
  readonly inAscolto = signal(false);
  aiTesto = '';
  private aiImmagineBase64: string | null = null;
  private aiTipoImmagine: string | null = null;
  private riconoscitore: any = null;
  /**
   * ⚠️ La dettatura la fa il BROWSER, non l'AI: Claude non ascolta l'audio.
   * Dove il riconoscimento vocale non c'è (Firefox, iOS datati) il bottone non
   * si mostra affatto — un bottone che non fa niente è peggio di un bottone che
   * non c'è.
   */
  readonly vocePossibile =
    typeof window !== 'undefined'
    && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  /** Detta a voce: si trascrive qui e il testo finisce nella casella. */
  dettatura(): void {
    if (!this.vocePossibile) return;
    if (this.inAscolto()) { this.riconoscitore?.stop(); return; }
    const Riconoscimento = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new Riconoscimento();
    r.lang = 'it-IT';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (ev: any) => {
      const detto = Array.from(ev.results).map((x: any) => x[0].transcript).join(' ').trim();
      // Si AGGIUNGE al testo, non lo si sostituisce: chi detta due volte sta
      // completando, non ricominciando.
      this.zone.run(() => { this.aiTesto = this.aiTesto ? `${this.aiTesto} ${detto}` : detto; });
    };
    r.onerror = () => this.zone.run(() => this.inAscolto.set(false));
    r.onend = () => this.zone.run(() => this.inAscolto.set(false));
    this.riconoscitore = r;
    this.inAscolto.set(true);
    r.start();
  }

  /** Foto di un ordine scritto, o screenshot di una chat. */
  aiImmagine(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      this.aiErrore.set(this.translate.instant('deliveryForm.ai.tooBig'));
      return;
    }
    const lettore = new FileReader();
    lettore.onload = () => {
      const risultato = String(lettore.result ?? '');
      // Via il prefisso `data:image/jpeg;base64,`: al server va il solo base64.
      this.aiImmagineBase64 = risultato.slice(risultato.indexOf(',') + 1);
      this.aiTipoImmagine = file.type || 'image/jpeg';
      this.aiNomeImmagine.set(file.name);
      this.aiErrore.set(null);
    };
    lettore.readAsDataURL(file);
  }

  /**
   * Chiede all'AI di leggere e RIEMPIE il form. Non salva niente: la consegna
   * nasce quando la persona preme Salva, come sempre.
   */
  aiCompila(): void {
    if (!this.aiTesto.trim() && !this.aiImmagineBase64) {
      this.aiErrore.set(this.translate.instant('deliveryForm.ai.empty'));
      return;
    }
    this.aiInCorso.set(true);
    this.aiErrore.set(null);
    this.http
      .post<{ proposta: any }>(`${environment.apiUrl}/ai/consegna-da-testo`, {
        testo: this.aiTesto.trim() || undefined,
        immagine: this.aiImmagineBase64 ?? undefined,
        tipoImmagine: this.aiTipoImmagine ?? undefined,
      })
      .subscribe({
        next: (r) => {
          this.aiInCorso.set(false);
          const p = r?.proposta ?? {};
          this.applicaProposta(p);
          this.aiEsito.set({
            confidenza: p.confidenza ?? 'bassa',
            perche: p.perche ?? '',
            campiMancanti: p.campiMancanti ?? [],
          });
        },
        error: (err) => {
          this.aiInCorso.set(false);
          this.aiErrore.set(err?.error?.message ?? this.translate.instant('deliveryForm.ai.failed'));
        },
      });
  }

  /**
   * Riversa la proposta nel form.
   * ⚠️ Solo i campi che l'AI ha DAVVERO riempito: un `null` non azzera quello
   * che c'è già. È la trappola del form parziale — riempire con «niente» è
   * peggio che non riempire.
   */
  private applicaProposta(p: any): void {
    const metti = (campo: keyof typeof this.model, valore: unknown) => {
      if (valore === null || valore === undefined || valore === '') return;
      (this.model as any)[campo] = valore;
    };
    metti('date', p.data);
    metti('deliveryTimeFrom', p.consegnaDalle);
    metti('deliveryTimeTo', p.consegnaAlle);
    metti('pickupTimeFrom', p.ritiroDalle);
    metti('pickupTimeTo', p.ritiroAlle);
    // ⚠️ Il secondo orario si vede solo a fascia APERTA: riempirlo lasciando la
    // fascia chiusa lo scriverebbe in un campo invisibile, e chi salva non
    // saprebbe mai che c'e'.
    if (p.consegnaDalle && p.consegnaAlle) this.model.deliveryFlexible = true;
    if (p.ritiroDalle && p.ritiroAlle) this.model.pickupFlexible = true;
    metti('recipientFirstName', p.destinatarioNome);
    metti('recipientLastName', p.destinatarioCognome);
    metti('recipientAddress', p.destinatarioIndirizzo);
    metti('recipientIntercom', p.destinatarioCitofono);
    metti('recipientPhone', p.destinatarioTelefono);
    metti('senderFirstName', p.mittenteNome);
    metti('senderLastName', p.mittenteCognome);
    // Il form non ha un campo «indirizzo di ritiro» (il ritiro e' del partner):
    // se il messaggio ne parla NON si butta via, finisce nelle note dove chi
    // legge lo vede. Buttarlo sarebbe perdere un dato che qualcuno ha scritto.
    const righeNote: string[] = [];
    if (p.indirizzoRitiro) righeNote.push('Ritiro: ' + p.indirizzoRitiro);
    if (p.prodotto) righeNote.push('Prodotto: ' + p.prodotto + (p.quantita ? ' x' + p.quantita : ''));
    if (p.note) righeNote.push(String(p.note));
    if (righeNote.length) metti('notes', righeNote.join('\n'));
    if (typeof p.contrassegno === 'number' && p.contrassegno > 0) {
      (this.model as any).paymentOnDelivery = true;
      (this.model as any).paymentAmount = p.contrassegno;
    }
    // L'indirizzo appena messo deve far scattare la provincia e i partner
    // abilitati, come se l'avesse scritto una persona.
    if (p.destinatarioIndirizzo) this.onAddressChange();
  }

  /**
   * Segna ACCETTATA la richiesta da cui si è arrivati, collegandole la consegna.
   *
   * ⚠️ Non blocca niente se fallisce: la consegna è già nata, ed è quella che
   * conta. Un errore qui lascerebbe la richiesta aperta — fastidioso — ma
   * fermare o annullare la consegna per una nota sarebbe molto peggio.
   */
  private chiudiRichiesta(nata: { id?: string } | null | undefined): void {
    const rich = this.daRichiesta();
    if (!rich) return;
    this.http
      .patch(`${environment.apiUrl}/richieste/${rich}`, {
        stato: 'accettata',
        ...(nata?.id ? { deliveryId: nata.id } : {}),
      })
      .subscribe({ next: () => undefined, error: () => undefined });
  }

  /** Solo l'admin può inserire la chiave: agli altri l'avviso non servirebbe. */
  puoConfigurare(): boolean {
    return this.auth.user()?.role === 'ADMIN';
  }

  @ViewChild('addressInput') addressInput?: ElementRef<HTMLInputElement>;
  private autocomplete: any = null;

  readonly partners = signal<Partner[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  readonly products = signal<Product[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly provinces = signal<Province[]>([]);
  /** Provincia rilevata dall'indirizzo destinatario (filtra partner/valet). */
  readonly addressProvince = signal<Province | null>(null);
  /** Indirizzo fuori dall'Italia: la provincia non si applica (nota, non avviso). */
  readonly indirizzoEstero = signal(false);

  /** Nomi di paese che segnalano un indirizzo estero (ultima parte dell'indirizzo). */
  private static readonly PAESI_ESTERI = [
    'france', 'francia', 'germany', 'germania', 'deutschland', 'spain', 'spagna', 'espana',
    'switzerland', 'svizzera', 'suisse', 'schweiz', 'austria', 'osterreich', 'belgium', 'belgio',
    'belgique', 'netherlands', 'paesi bassi', 'nederland', 'olanda', 'luxembourg', 'lussemburgo',
    'monaco', 'united kingdom', 'regno unito', 'england', 'portugal', 'portogallo', 'greece',
    'grecia', 'croatia', 'croazia', 'slovenia', 'united states', 'stati uniti', 'usa',
    'emirati arabi', 'united arab emirates', 'uae', 'dubai', 'qatar', 'saudi arabia',
    'arabia saudita', 'china', 'cina', 'japan', 'giappone',
  ];

  private rilevaEstero(indirizzo: string): boolean {
    const testo = (indirizzo ?? '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!testo.trim()) return false;
    // Se l'indirizzo nomina l'Italia non e' estero, qualunque altra cosa dica.
    if (/\bitali[ae]\b/.test(testo)) return false;
    return DeliveryFormComponent.PAESI_ESTERI.some((p) => testo.includes(p));
  }
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly statusOptions = Object.entries(DELIVERY_STATUS_LABELS);
  readonly paymentStatuses = Object.entries(DELIVERY_PAYMENT_STATUS_LABELS);

  productRows: ProductRow[] = [];

  model = {
    date: '',
    recipientAddress: '',
    partnerId: '',
    serviceTypeId: '',
    deliveryTimeFrom: '',
    deliveryTimeTo: '',
    deliveryFlexible: false,
    pickupTimeFrom: '',
    pickupTimeTo: '',
    pickupFlexible: false,
    valetId: '',
    status: '',
    paymentStatus: 'default',
    customerId: '',
    saveCustomer: false,
    recipientLastName: '',
    recipientFirstName: '',
    recipientIntercom: '',
    recipientPhone: '',
    recipientEmail: '',
    senderLastName: '',
    senderFirstName: '',
    senderPhone: '',
    valetServiceId: '',
    deluxyDelivery: false,
    smsPhoneNo: '',
    smsOnCreated: false,
    smsOnDeparted: false,
    smsOnArrived: false,
    paymentOnDelivery: false,
    tryAndReturn: false,
    paymentAmount: null as number | null,
    billable: true,
    payable: true,
    price: null as number | null,
    additionalPrice: null as number | null,
    deliveryPrice: null as number | null,
    valetSalary: null as number | null,
    valetAdditionalPrice: null as number | null,
    isFlexiblePrice: false,
    flexiblePrice: '',
    hours: null as number | null,
    ddtNumber: '',
    ddtBrand: '',
    ddtFile: '',
    notes: '',
    personalizeSaleNotes: '',
    internalNotes: '',
    deliveryCodeRequired: false,
  };

  /** Prodotti del partner selezionato per primi. */
  readonly sortedProducts = computed(() => {
    const pid = this.model.partnerId;
    const list = [...this.products()];
    return list.sort((a, b) => {
      const ap = a.partner?.id === pid ? 0 : 1;
      const bp = b.partner?.id === pid ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });
  });

  /** Servizio selezionato (aggiornato imperativamente da onServiceChange). */
  readonly selectedService = signal<ServiceType | null>(null);
  /** Fasce orarie di consegna generate dal servizio. */
  readonly deliverySlots = signal<{ from: string; to: string }[]>([]);
  /** Data minima consegna = oggi + giorni preavviso del servizio (YYYY-MM-DD). */
  readonly deliveryMinDate = signal<string>('');

  readonly slotHours = computed(() => {
    const h = this.selectedService()?.slotHours;
    return h && h > 0 ? h : 1;
  });
  readonly isHourly = computed(() => this.selectedService()?.pricingModel === 'A_ORA');
  /** Il brand del DDT riguarda solo le VENDITE: il DDT li' e' il riferimento dell'ordine. */
  readonly isVendita = computed(() => this.selectedService()?.pricingModel === 'VENDITA');
  /** I brand fra cui scegliere (tendina, non testo libero). */
  readonly marchiDdt = ['deluxy.it', 'Flowers', 'cakedesign.me', 'Business'];

  /** Al cambio servizio: aggiorna fasce, data minima e resetta stati non più validi. */
  onServiceChange(): void {
    this.servizioSel.set(this.model.serviceTypeId);
    const s = this.serviceTypes().find((x) => x.id === this.model.serviceTypeId) ?? null;
    this.selectedService.set(s);
    // Se il servizio non consente la consegna flessibile, forza la modalità a fasce.
    if (!s?.allowFlexibleTime) this.model.deliveryFlexible = false;
    // Fasce orarie di consegna (dalle min alle max del servizio, passo = fascia).
    const slots = this.buildSlots(s);
    this.deliverySlots.set(slots);
    // La fascia scelta in precedenza potrebbe non esistere più.
    if (!this.model.deliveryFlexible && this.model.deliveryTimeFrom
      && !slots.some((sl) => sl.from === this.model.deliveryTimeFrom)) {
      this.model.deliveryTimeFrom = '';
    }
    // Data minima = oggi + giorni preavviso.
    const min = this.computeMinDate(s?.noticeDays ?? 0);
    this.deliveryMinDate.set(min);
    // ⚠️ Il preavviso è una regola per le consegne NUOVE. In modifica la data
    // salvata è quasi sempre nel passato, quindi questa riga la sostituiva con
    // oggi: aprire una consegna del 2024 e salvarla la spostava al giorno
    // corrente, senza dire niente.
    if (!this.editId() && (!this.model.date || this.model.date < min)) this.model.date = min;
    // ⭐ 27/08 (chiesto dall'utente): cambiando servizio si RICALCOLA anche il
    // listino associato. Prima il prezzo restava quello del servizio di prima,
    // e un numero vecchio accanto a un servizio nuovo non si vede come
    // sbagliato — si vede come un prezzo.
    this.proponiPrezzoDiListino();
    // Il filtro per tipo servizio può escludere il partner scelto.
    this.syncSelections();
  }

  /**
   * IL PREZZO DI LISTINO del partner per il servizio scelto.
   *
   * ⚠️ Si PROPONE, non si impone: un prezzo battuto a mano non si cancella. Si
   * riscrive solo quando il campo è vuoto o contiene ancora la proposta
   * precedente — che, cambiato servizio, sarebbe il prezzo dell'altro servizio
   * lasciato lì a sembrare giusto.
   *
   * ⚠️ Gli extra KM restano fuori: dipendono dalla distanza, che qui non è
   * ancora nota. Il server li aggiunge al salvataggio, con la sua regola.
   */
  private prezzoProposto: number | null = null;
  proponiPrezzoDiListino(): void {
    const p = this.partners().find((x) => x.id === this.model.partnerId);
    const riga = (p?.services ?? []).find(
      (s) => (s.serviceTypeId ?? s.serviceType?.id) === this.model.serviceTypeId,
    );
    if (!riga || riga.price == null) return;
    const s = this.selectedService();
    const prezzo = s?.pricingModel === 'A_ORA'
      ? riga.price * Math.max(this.model.hours ?? 1, 1)
      : riga.price;
    const attuale = this.model.price;
    if (attuale != null && attuale !== this.prezzoProposto) return;
    this.model.price = prezzo;
    this.prezzoProposto = prezzo;
  }

  /** Genera le fasce [from,to] da minOrderTime a maxOrderTime (default 06:00–22:00), passo = slotHours. */
  private buildSlots(s: ServiceType | null): { from: string; to: string }[] {
    if (!s) return [];
    const step = this.slotHoursOf(s) * 60;
    const start = this.timeToMin(s.minOrderTime) ?? 6 * 60;
    const end = this.timeToMin(s.maxOrderTime) ?? 22 * 60;
    const slots: { from: string; to: string }[] = [];
    for (let t = start; t + step <= end; t += step) {
      slots.push({ from: this.minToTime(t), to: this.minToTime(t + step) });
    }
    return slots;
  }
  private slotHoursOf(s: ServiceType | null): number {
    const h = s?.slotHours;
    return h && h > 0 ? h : 1;
  }
  private timeToMin(t?: string | null): number | null {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    if (Number.isNaN(h)) return null;
    return h * 60 + (Number.isNaN(m) ? 0 : m);
  }
  private minToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  private addHours(t: string, hours: number): string {
    return this.minToTime((this.timeToMin(t) ?? 0) + hours * 60);
  }
  private computeMinDate(noticeDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + (noticeDays || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Id consegna in modifica (null = nuova consegna). */
  readonly editId = signal<string | null>(null);

  constructor() {
    const api = environment.apiUrl;

    // ⚠️ In MODIFICA la consegna si chiede PER PRIMA. E' una riga sola e torna
    // subito, quindi il form si riempie mentre i cataloghi stanno ancora
    // arrivando; chiedendola per ultima (com'era) la pagina restava vuota per
    // secondi, perche' davanti c'erano 21.887 prodotti e 4.513 clienti.
    const idModifica = this.route.snapshot.paramMap.get('id');
    if (idModifica) {
      this.editId.set(idModifica);
      this.http.get<Record<string, unknown>>(`${api}/deliveries/${idModifica}`).subscribe({
        next: (d) => this.prefill(d),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }

    // ⭐ 28/08: si arriva dalla sezione RICHIESTE. Si carica il testo nel
    // pannello dell'AI e lo si APRE: chi ha cliccato «crea consegna» da una
    // richiesta non deve andare a cercare dove incollarla.
    //
    // ⚠️ Il testo si mette e basta: NON si chiama l'AI da soli. Ogni lettura
    // costa, e chi apre il modulo potrebbe voler compilare a mano — il bottone
    // ce l'ha lì.
    const idRichiesta = this.route.snapshot.queryParamMap.get('richiesta');
    if (idRichiesta && !idModifica) {
      this.daRichiesta.set(idRichiesta);
      this.http.get<{ testo: string }>(`${api}/richieste/${idRichiesta}`).subscribe({
        next: (r) => {
          if (!r?.testo) return;
          this.aiTesto = r.testo;
          this.aiAperto.set(true);
        },
        error: () => undefined,
      });
    }

    this.http.get<Partner[]>(`${api}/partners`).subscribe((d) => this.partners.set(d));
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => {
      // ⚠️ Non si SOSTITUISCE la lista: il prefill può averci già messo il
      // servizio della consegna (se disattivato non arriva da qui). Sostituendo
      // lo si perderebbe, e la casella tornerebbe vuota dopo essersi riempita.
      const scelto = this.selectedService();
      this.serviceTypes.set(
        scelto && !d.some((s) => s.id === scelto.id) ? [scelto, ...d] : d,
      );
      // ⚠️ Il servizio si risolve cercandolo in QUESTA lista. In modifica la
      // consegna arriva prima (e' una riga sola), quindi al momento del prefill
      // la lista era vuota e `selectedService` restava null: a schermo
      // compariva «Seleziona prima un servizio» pur essendocene uno scelto, e
      // le fasce orarie non venivano generate. Appena la lista arriva si
      // riapplica, conservando gli orari salvati.
      if (this.model.serviceTypeId) {
        const fascia = this.model.deliveryTimeFrom;
        const data = this.model.date;
        this.onServiceChange();
        if (fascia) this.model.deliveryTimeFrom = fascia;
        if (data) this.model.date = data;
      }
    });
    this.http.get<ValetRef[]>(`${api}/valets`).subscribe((d) => this.valets.set(d as ValetRef[]));
    // La lista prodotti e' paginata: qui serve il catalogo per la tendina,
    // quindi chiedo la pagina massima consentita.
    // ⚠️ Si UNISCE, non si sostituisce: in modifica i prodotti della consegna
    // vengono aggiunti a parte (possono stare oltre i primi 500 di 21.887), e
    // una set() del catalogo che arriva dopo li porterebbe via.
    this.http
      .get<{ items: Product[] }>(`${api}/products`, { params: { pageSize: 500 } })
      .subscribe((d) => this.products.set(this.unisciProdotti(d.items ?? [], this.products())));
    // La lista clienti e' paginata: qui serve per la tendina "Cliente esistente",
    // quindi chiedo la pagina massima. ATTENZIONE: in produzione i clienti sono
    // migliaia, quindi la tendina resta parziale -> va sostituita da una ricerca
    // mentre si scrive (vedi HANDOFF, punto aperto).
    this.http
      .get<{ items: Customer[] }>(`${api}/customers`, { params: { pageSize: 500 } })
      .subscribe((d) => this.customers.set(d.items ?? []));
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
  }

  /** Riempie il form con la consegna esistente. */
  private prefill(d: Record<string, any>): void {
    const m = this.model;
    m.date = typeof d['date'] === 'string' ? d['date'].slice(0, 10) : '';

    // ⚠️ Il servizio della consegna arriva GIA' dentro la risposta: si usa
    // quello, invece di cercarlo nella tendina. Cercandolo, un servizio
    // disattivato (come «Non indicato», su cui stanno 17.669 consegne
    // importate) non viene trovato: la casella resta vuota, compare
    // «Seleziona prima un servizio» e le fasce orarie non si generano.
    // Se manca dall'elenco lo si aggiunge, altrimenti la tendina non può
    // mostrare il valore selezionato.
    const svc = d['serviceType'];
    if (svc?.id) {
      if (!this.serviceTypes().some((s) => s.id === svc.id)) {
        this.serviceTypes.set([svc as ServiceType, ...this.serviceTypes()]);
      }
      this.selectedService.set(svc as ServiceType);
    }
    for (const key of [
      'recipientAddress', 'partnerId', 'serviceTypeId', 'deliveryTimeFrom', 'deliveryTimeTo',
      'pickupTimeFrom', 'pickupTimeTo', 'valetId', 'status', 'paymentStatus', 'customerId',
      'recipientLastName', 'recipientFirstName', 'recipientIntercom', 'recipientPhone',
      'recipientEmail', 'senderLastName', 'senderFirstName', 'senderPhone', 'valetServiceId',
      'smsPhoneNo', 'flexiblePrice', 'ddtNumber', 'ddtBrand', 'ddtFile', 'notes', 'personalizeSaleNotes',
      'internalNotes',
    ] as const) {
      if (d[key] != null) (m as Record<string, unknown>)[key] = d[key];
    }
    for (const key of [
      'deliveryFlexible', 'pickupFlexible', 'deluxyDelivery', 'smsOnCreated', 'smsOnDeparted',
      'smsOnArrived', 'paymentOnDelivery', 'tryAndReturn', 'billable', 'payable',
      'isFlexiblePrice', 'deliveryCodeRequired',
    ] as const) {
      if (d[key] != null) (m as Record<string, unknown>)[key] = !!d[key];
    }
    for (const key of ['paymentAmount', 'price', 'additionalPrice', 'deliveryPrice', 'valetSalary', 'valetAdditionalPrice', 'hours'] as const) {
      if (d[key] != null) (m as Record<string, unknown>)[key] = d[key];
    }
    // Prodotti della consegna
    const products = (d['products'] as any[]) ?? [];
    this.productRows = products.map((p) => ({
      productId: p.productId ?? p.product?.id ?? '',
      productVariantId: p.productVariantId ?? null,
      quantity: p.quantity ?? 1,
      price: p.price ?? null,
      flexiblePrice: !!p.flexiblePrice,
    })) as ProductRow[];
    // ⚠️ La tendina ha solo i primi 500 prodotti su 21.887: il prodotto di
    // QUESTA consegna puo' non esserci, e la selezione sembrerebbe vuota pur
    // essendo scritta (62510: «Bouquet» c'era, l'opzione no). Si va a prendere.
    for (const id of new Set(this.productRows.map((r) => r.productId).filter(Boolean))) {
      if (this.products().some((p) => p.id === id)) continue;
      this.http.get<Product>(`${environment.apiUrl}/products/${id}`).subscribe({
        next: (p) => { if (p?.id) this.products.set(this.unisciProdotti(this.products(), [p])); },
        error: () => {},
      });
    }
    // Ricostruisce fasce orarie, data minima e filtri dipendenti
    this.onAddressChange();
    this.onServiceChange();
    // I segnali seguono la selezione anche quando arriva dal prefill.
    this.partnerSel.set(m.partnerId);
    this.servizioSel.set(m.serviceTypeId);
    // onServiceChange puo' azzerare la fascia: la ripristina da quella salvata
    if (d['deliveryTimeFrom']) m.deliveryTimeFrom = d['deliveryTimeFrom'] as string;
    if (d['date']) m.date = (d['date'] as string).slice(0, 10);
  }

  /** Partner filtrati per tipo di servizio scelto e per provincia dell'indirizzo. */
  /**
   * Partner filtrati SOLO per la provincia dedotta dall'indirizzo.
   *
   * ⚠️ Prima si filtrava anche per il servizio scelto, ma l'ordine dei campi è
   * stato invertito: ora il partner viene PRIMA del servizio, quindi filtrarlo
   * per un servizio non ancora scelto non avrebbe senso. È il servizio a
   * dipendere dal partner, non il contrario.
   */
  readonly filteredPartners = computed(() => {
    const prov = this.addressProvince();
    if (!prov) return this.partners();
    return this.partners().filter((p) =>
      (p.provinces ?? []).some((pp) => pp.province?.code === prov.code));
  });

  /** I servizi che il partner scelto ha davvero a listino (PartnerService). */
  readonly servizioDelPartner = computed(() => {
    const p = this.partners().find((x) => x.id === this.partnerSel());
    if (!p) return [];
    const abilitati = new Set((p.services ?? []).map((s) => s.serviceType?.id).filter(Boolean));
    return this.serviceTypes().filter((s) => abilitati.has(s.id));
  });

  /**
   * Servizi da mostrare nella tendina.
   * Senza partner scelto si mostra tutto il catalogo (altrimenti la casella
   * sarebbe vuota e sembrerebbe rotta); con un partner si mostrano i suoi.
   * Il servizio già salvato resta sempre presente, anche se fuori elenco:
   * è la stessa regola applicata al partner in modifica.
   */
  readonly serviceOptions = computed(() => {
    const suoi = this.servizioDelPartner();
    const base = this.partnerSel() && suoi.length ? suoi : this.serviceTypes();
    const scelto = this.servizioSel();
    if (!scelto || base.some((s) => s.id === scelto)) return base;
    const mancante = this.serviceTypes().find((s) => s.id === scelto);
    return mancante ? [mancante, ...base] : base;
  });

  /** Cambiando partner, un servizio non più a listino va tolto. */
  onPartnerChange(): void {
    this.partnerSel.set(this.model.partnerId);
    const suoi = this.servizioDelPartner();
    if (this.model.serviceTypeId && suoi.length
      && !suoi.some((s) => s.id === this.model.serviceTypeId)) {
      this.model.serviceTypeId = '';
      this.onServiceChange();
      return;
    }
    // Stesso servizio ma altro partner = altro listino: si ricalcola anche qui.
    this.proponiPrezzoDiListino();
  }

  /** Valet filtrati per provincia dell'indirizzo. */
  readonly filteredValets = computed(() => {
    const prov = this.addressProvince();
    if (!prov) return this.valets();
    return this.valets().filter((v) => (v.provinces ?? []).some((pp) => pp.province?.code === prov.code));
  });

  // --- ricerca cliente -----------------------------------------------------

  readonly cercaCliente = signal('');
  readonly cercandoClienti = signal(false);
  readonly risultatiClienti = signal<Customer[]>([]);
  readonly clienteScelto = signal<Customer | null>(null);
  private ritardoRicerca?: ReturnType<typeof setTimeout>;

  /**
   * Cerca i clienti sul server mentre si scrive.
   *
   * Si parte da DUE caratteri: con uno solo tornerebbero centinaia di risultati
   * e la lista sarebbe inutile quanto la tendina di prima. E si aspetta un
   * attimo prima di chiedere, se no ogni tasto e' una chiamata.
   */
  cercaClienti(testo: string): void {
    this.cercaCliente.set(testo);
    clearTimeout(this.ritardoRicerca);
    const q = testo.trim();
    if (q.length < 2) { this.risultatiClienti.set([]); this.cercandoClienti.set(false); return; }
    this.cercandoClienti.set(true);
    this.ritardoRicerca = setTimeout(() => {
      this.http
        .get<{ items: Customer[] }>(`${environment.apiUrl}/customers`, { params: { q, pageSize: 20 } })
        .subscribe({
          next: (d) => { this.risultatiClienti.set(d.items ?? []); this.cercandoClienti.set(false); },
          error: () => { this.risultatiClienti.set([]); this.cercandoClienti.set(false); },
        });
    }, 300);
  }

  scegliCliente(c: Customer): void {
    this.clienteScelto.set(c);
    this.model.customerId = c.id;
    this.risultatiClienti.set([]);
    this.cercaCliente.set('');
    this.riempiDaCliente(c);
  }

  /**
   * Scollega il cliente ma NON svuota i campi gia' riempiti: chi ha corretto
   * l'indirizzo dopo averlo scelto non deve ritrovarselo cancellato.
   */
  scollegaCliente(): void {
    this.clienteScelto.set(null);
    this.model.customerId = '';
  }

  applyCustomer(id: string): void {
    const c = this.customers().find((x) => x.id === id);
    if (!c) return;
    this.riempiDaCliente(c);
  }

  private riempiDaCliente(c: Customer): void {
    this.model.recipientFirstName = c.firstName ?? '';
    this.model.recipientLastName = c.lastName ?? '';
    if (c.address) { this.model.recipientAddress = c.address; this.onAddressChange(); }
    if (c.intercom) this.model.recipientIntercom = c.intercom;
    if (c.phone) this.model.recipientPhone = c.phone;
    if (c.email) this.model.recipientEmail = c.email;
  }

  /** Aggancia l'autocomplete indirizzi di Google Places al campo destinatario,
   *  se in Impostazioni è configurata la chiave browser. Degrada silenziosamente
   *  al campo di testo normale (con geocodifica server) se manca la chiave. */
  ngAfterViewInit(): void {
    const input = this.addressInput?.nativeElement;
    this.http
      .get<{ googleMapsBrowserKey: string | null; aiAttiva?: boolean }>(`${environment.apiUrl}/settings/public`)
      .subscribe({
        next: async (cfg) => {
          // Il pannello «compila con l'AI» si mostra solo se la chiave c'e'
          // davvero: un bottone che fallisce sempre e' peggio di un bottone
          // che non c'e'. La chiave non arriva mai qui, solo il si'/no.
          this.aiPossibile.set(Boolean(cfg?.aiAttiva));
          if (!input) return;
          const key = cfg?.googleMapsBrowserKey;
          if (!key) {
            // ⚠️ Prima si tornava indietro in SILENZIO: il campo restava un
            // normale input e l'integrazione sembrava rotta invece che da
            // configurare. Ora lo si dice, così si sa che cosa manca.
            this.mapsMancante.set(true);
            return;
          }
          this.mapsMancante.set(false);
          try {
            await loadGoogleMaps(key);
            this.autocomplete = new google.maps.places.Autocomplete(input, {
              componentRestrictions: { country: 'it' },
              fields: ['formatted_address', 'geometry', 'address_components'],
              types: ['address'],
            });
            this.autocomplete.addListener('place_changed', () => {
              const place = this.autocomplete.getPlace();
              // L'evento Google è fuori dal ciclo Angular: rientro con la zona.
              this.zone.run(() => this.onPlaceSelected(place));
            });
          } catch {
            /* script non caricato: resta il campo normale */
          }
        },
        error: () => this.mapsMancante.set(true),
      });
  }

  /** Indirizzo scelto dal menu Google: compila il campo e ricava la provincia. */
  private onPlaceSelected(place: any): void {
    if (!place) return;
    const address = place.formatted_address || this.addressInput?.nativeElement.value || '';
    this.model.recipientAddress = address;
    const comp = (place.address_components || []).find((c: any) =>
      (c.types || []).includes('administrative_area_level_2'),
    );
    const code = comp?.short_name as string | undefined;
    const prov = code ? (this.provinces().find((p) => p.code === code) ?? null) : null;
    this.addressProvince.set(prov ?? this.detectProvince(address));
    this.syncSelections();
  }

  /** Al cambio indirizzo: rileva subito la provincia dal testo, poi (con debounce)
   *  la conferma via Google Geocoding se in Impostazioni è salvata la chiave API. */
  onAddressChange(): void {
    this.addressProvince.set(this.detectProvince(this.model.recipientAddress));
    this.indirizzoEstero.set(this.rilevaEstero(this.model.recipientAddress));
    this.syncSelections();
    this.scheduleGeocode();
  }

  private geocodeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Geocodifica lato server (chiave dalle Impostazioni): parte 700ms dopo l'ultimo
   *  tasto e vince sul riconoscimento testuale solo se trova una provincia. */
  private scheduleGeocode(): void {
    if (this.geocodeTimer) clearTimeout(this.geocodeTimer);
    const address = this.model.recipientAddress.trim();
    if (address.length < 6) return;
    this.geocodeTimer = setTimeout(() => {
      this.http
        .get<{ provinceCode: string | null }>(`${environment.apiUrl}/settings/geocode`, { params: { address } })
        .subscribe({
          next: (r) => {
            // L'indirizzo può essere cambiato mentre la richiesta era in volo.
            if (this.model.recipientAddress.trim() !== address || !r.provinceCode) return;
            const prov = this.provinces().find((p) => p.code === r.provinceCode) ?? null;
            if (prov) { this.addressProvince.set(prov); this.syncSelections(); }
          },
          error: () => { /* senza chiave o rete: resta il riconoscimento testuale */ },
        });
    }, 700);
  }

  /** Deduce la provincia dall'indirizzo (logica condivisa con la lista consegne). */
  private detectProvince(address: string): Province | null {
    return detectProvince(address, this.provinces());
  }

  /**
   * Azzera partner/valet se non più presenti nelle liste filtrate.
   *
   * ⚠️ Due guardie, entrambe per bug veri:
   *  1. se la lista di partenza e' ANCORA VUOTA, non e' che il partner non
   *     esista: e' che la chiamata non e' tornata. Azzerare qui cancellava la
   *     selezione appena caricata dal prefill;
   *  2. in MODIFICA il valore arriva da una consegna salvata: e' un dato vero,
   *     non una scelta dell'utente. Se il filtro per provincia non lo include
   *     (i partner importati dal legacy non hanno province assegnate) va
   *     comunque tenuto, altrimenti aprire e salvare una consegna le toglie il
   *     partner senza dire niente.
   */
  private syncSelections(): void {
    const inModifica = !!this.editId();
    if (
      this.model.partnerId && this.partners().length && !inModifica
      && !this.filteredPartners().some((p) => p.id === this.model.partnerId)
    ) {
      this.model.partnerId = '';
    }
    if (
      this.model.valetId && this.valets().length && !inModifica
      && !this.filteredValets().some((v) => v.id === this.model.valetId)
    ) {
      this.model.valetId = '';
    }
  }

  /**
   * Partner da mostrare nella tendina: quelli filtrati, piu' — se manca — quello
   * gia' salvato sulla consegna. Senza, in modifica la tendina non contiene il
   * valore selezionato e appare vuota.
   */
  readonly partnerOptions = computed(() => {
    const lista = this.filteredPartners();
    const scelto = this.partnerSel();
    if (!scelto || lista.some((p) => p.id === scelto)) return lista;
    const mancante = this.partners().find((p) => p.id === scelto);
    return mancante ? [mancante, ...lista] : lista;
  });

  /** Stesso ragionamento per il valet. */
  readonly valetOptions = computed(() => {
    const lista = this.filteredValets();
    const scelto = this.model.valetId;
    if (!scelto || lista.some((v) => v.id === scelto)) return lista;
    const mancante = this.valets().find((v) => v.id === scelto);
    return mancante ? [mancante, ...lista] : lista;
  });

  addProduct(): void { this.productRows.push({ productId: '', productVariantId: null, quantity: 1, flexiblePrice: false, price: null }); }

  /** Unione per id: la base vince, gli extra entrano solo se mancano. */
  private unisciProdotti(base: Product[], extra: Product[]): Product[] {
    const visti = new Set(base.map((p) => p.id));
    return [...base, ...extra.filter((p) => !visti.has(p.id))];
  }

  removeProduct(i: number): void { this.productRows.splice(i, 1); }

  /** Prezzo base del prodotto selezionato. */
  productPrice(productId: string): number | null {
    return this.products().find((p) => p.id === productId)?.price ?? null;
  }

  /** Le varianti attive del prodotto selezionato (vuoto = niente tendina). */
  productVariants(productId: string) {
    return (this.products().find((p) => p.id === productId)?.variants ?? [])
      .filter((v) => v.active !== false);
  }

  /**
   * Il prezzo della riga: della VARIANTE se scelta, del prodotto altrimenti.
   * La Cappelliera base fa 110 ma la M ne fa 215: mostrare il base con la M
   * scelta farebbe firmare un prezzo sbagliato.
   */
  rowPrice(row: ProductRow): number | null {
    const v = this.productVariants(row.productId).find((x) => x.id === row.productVariantId);
    return v?.price ?? this.productPrice(row.productId);
  }

  /** Al cambio prodotto la variante si azzera: era di un altro prodotto. */
  onProductChange(row: ProductRow): void {
    row.productVariantId = null;
    if (row.flexiblePrice && row.price == null) row.price = this.rowPrice(row);
  }

  /** Al cambio variante, il prezzo flessibile non ancora toccato segue lei. */
  onVariantChange(row: ProductRow): void {
    if (row.flexiblePrice && row.price == null) row.price = this.rowPrice(row);
  }

  /** Attivando "prezzo flessibile" precompila col prezzo di riga (variante compresa). */
  onFlexToggle(row: ProductRow): void {
    if (row.flexiblePrice && row.price == null) row.price = this.rowPrice(row);
  }

  /** Orari proponibili per il ritiro: mezz'ora in mezz'ora, 00:00–23:30.
   *  In modifica, un orario salvato fuori griglia viene aggiunto alla lista. */
  get pickupTimeOptions(): string[] {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      options.push(`${String(h).padStart(2, '0')}:00`, `${String(h).padStart(2, '0')}:30`);
    }
    const current = this.model.pickupTimeFrom;
    if (current && !options.includes(current)) {
      options.push(current);
      options.sort();
    }
    return options;
  }

  /** "HH:MM" + 1 ora (per la fascia di ritiro di 1 ora quando non flessibile). */
  plusOneHour(t: string): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    // Si dice QUALI campi mancano, non «compila i campi obbligatori».
    //
    // ⚠️ L'orario di consegna era marcato con l'asterisco ma non veniva
    // controllato da nessuno: lasciandolo vuoto il salvataggio partiva e la
    // consegna nasceva senza orario. Chi guardava vedeva «non succede nulla»,
    // perché il messaggio generico non nominava il campo che mancava.
    const mancanti: string[] = [];
    if (!m.date) mancanti.push(this.translate.instant('deliveryForm.field.date'));
    if (!m.recipientAddress.trim()) mancanti.push(this.translate.instant('deliveryForm.field.recipientAddress'));
    if (!m.partnerId) mancanti.push(this.translate.instant('deliveryForm.field.partner'));
    if (!m.serviceTypeId) mancanti.push(this.translate.instant('deliveryForm.field.service'));
    if (!m.deliveryTimeFrom) mancanti.push(this.translate.instant('deliveryForm.field.deliverySlot'));
    if (!m.recipientFirstName.trim()) mancanti.push(this.translate.instant('deliveryForm.field.recipientFirstName'));
    if (!m.recipientLastName.trim()) mancanti.push(this.translate.instant('deliveryForm.field.recipientLastName'));
    // Su una VENDITA il DDT e' il riferimento dell'ordine e con piu' negozi il
    // numero da solo non identifica: senza brand non si salva.
    if (this.isVendita() && m.ddtNumber.trim() && !m.ddtBrand.trim()) {
      mancanti.push(this.translate.instant('deliveryForm.field.ddtBrand'));
    }
    if (mancanti.length) {
      this.error.set(this.translate.instant('deliveryForm.error.missing', { campi: mancanti.join(', ') }));
      // L'errore sta in fondo al form: senza questo, chi ha compilato in cima
      // non lo vede e conclude che il bottone non funziona.
      queueMicrotask(() => document.querySelector('.error-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    const payload: Record<string, unknown> = {
      date: m.date,
      partnerId: m.partnerId,
      serviceTypeId: m.serviceTypeId,
      recipientAddress: m.recipientAddress.trim(),
      recipientFirstName: m.recipientFirstName.trim(),
      recipientLastName: m.recipientLastName.trim(),
      pickupFlexible: m.pickupFlexible,
      deliveryFlexible: m.deliveryFlexible,
      paymentOnDelivery: m.paymentOnDelivery,
      tryAndReturn: m.tryAndReturn,
      deliveryCodeRequired: m.deliveryCodeRequired,
      smsOnCreated: m.smsOnCreated,
      smsOnDeparted: m.smsOnDeparted,
      smsOnArrived: m.smsOnArrived,
      paymentStatus: m.paymentStatus,
      deluxyDelivery: m.deluxyDelivery,
      billable: m.billable,
      payable: m.payable,
      isFlexiblePrice: m.isFlexiblePrice,
    };
    for (const key of [
      'valetId', 'valetServiceId', 'status', 'customerId',
      'recipientIntercom', 'recipientPhone', 'recipientEmail',
      'senderFirstName', 'senderLastName', 'senderPhone', 'smsPhoneNo', 'ddtNumber', 'ddtBrand', 'ddtFile',
      'flexiblePrice', 'notes', 'personalizeSaleNotes', 'internalNotes',
    ] as const) {
      const v = m[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    // Consegna: se flessibile (e consentito dal servizio) dalle–alle libere;
    // altrimenti la fascia scelta ha durata = fascia oraria del servizio.
    const deliveryFlexibleEffective = m.deliveryFlexible && !!this.selectedService()?.allowFlexibleTime;
    payload['deliveryFlexible'] = deliveryFlexibleEffective;
    if (m.deliveryTimeFrom) {
      payload['deliveryTimeFrom'] = m.deliveryTimeFrom;
      payload['deliveryTimeTo'] = deliveryFlexibleEffective ? m.deliveryTimeTo : this.addHours(m.deliveryTimeFrom, this.slotHours());
    }
    if (m.pickupTimeFrom) {
      payload['pickupTimeFrom'] = m.pickupTimeFrom;
      payload['pickupTimeTo'] = m.pickupFlexible ? m.pickupTimeTo : this.plusOneHour(m.pickupTimeFrom);
    }
    for (const key of ['paymentAmount', 'price', 'additionalPrice', 'deliveryPrice', 'valetSalary', 'valetAdditionalPrice', 'hours'] as const) {
      const v = m[key];
      // ⚠️ `hours` ha un minimo di 1 lato API, ma il legacy ha 0 su migliaia di
      // consegne non a ora: mandarlo com'e' faceva fallire OGNI modifica di
      // quelle consegne («hours must not be less than 1»). Si manda solo se ≥ 1.
      if (key === 'hours' && (v == null || Number(v) < 1)) continue;
      if (v != null) payload[key] = Number(v);
    }

    const products = this.productRows
      .filter((r) => r.productId)
      .map((r) => ({
        productId: r.productId,
        productVariantId: r.productVariantId ?? undefined,
        quantity: r.quantity ?? 1,
        flexiblePrice: r.flexiblePrice,
        price: r.flexiblePrice && r.price != null ? Number(r.price) : undefined,
      }));
    // In modifica invio sempre i prodotti, anche a lista vuota: altrimenti
    // rimuoverli tutti non li cancellerebbe (l'API scrive solo le chiavi presenti).
    if (products.length || this.editId()) payload['products'] = products;

    this.saving.set(true);
    // Se richiesto, salva prima il destinatario come nuovo cliente in Clienti, poi crea la consegna.
    if (m.saveCustomer && !m.customerId) {
      const customerPayload: Record<string, unknown> = {
        firstName: m.recipientFirstName.trim(),
        lastName: m.recipientLastName.trim(),
      };
      if (m.recipientEmail.trim()) customerPayload['email'] = m.recipientEmail.trim();
      if (m.recipientPhone.trim()) customerPayload['phone'] = m.recipientPhone.trim();
      if (m.recipientAddress.trim()) customerPayload['address'] = m.recipientAddress.trim();
      if (m.partnerId) customerPayload['partnerId'] = m.partnerId;
      this.http.post<{ id: string }>(`${environment.apiUrl}/customers`, customerPayload).subscribe({
        next: (c) => { payload['customerId'] = c.id; this.postDelivery(payload, duplicate); },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.error.set(this.translate.instant('deliveryForm.error.customerNotSaved') + (Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('deliveryForm.error.genericShort')));
        },
      });
      return;
    }
    this.postDelivery(payload, duplicate);
  }

  /** Crea la consegna col payload dato. */
  private postDelivery(payload: Record<string, unknown>, duplicate: boolean): void {
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/deliveries/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/deliveries`, payload);

    req.subscribe({
      next: (nata: any) => {
        // In modifica si torna al dettaglio; in creazione alla lista (o si resta per duplicare)
        if (id) { this.router.navigate(['/deliveries', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        this.chiudiRichiesta(nata);
        this.router.navigate(['/deliveries']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('deliveryForm.error.createFailed'));
      },
    });
  }
}
