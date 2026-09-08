import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { IndirizzoGoogleDirective } from '../core/indirizzo-google.directive';
import {
  Area,
  Category,
  Mestiere,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  Province,
  ServiceType,
} from '../core/models';

interface ServiceRow {
  serviceTypeId: string;
  price: number | null;
  includedKm: number | null;
  extraKmPrice: number | null;
  extraOutOfCityPrice: number | null;
}

interface OpeningHourRow {
  dayOfWeek: number; // 0=domenica … 6=sabato (convenzione DB)
  key: string; // chiave i18n del giorno
  closed: boolean;
  openTime: string;
  closeTime: string;
}

/** Giorni in ordine di visualizzazione (lunedì→domenica), con il dayOfWeek del DB. */
const WEEK_DAYS: { dayOfWeek: number; key: string }[] = [
  { dayOfWeek: 1, key: 'mon' },
  { dayOfWeek: 2, key: 'tue' },
  { dayOfWeek: 3, key: 'wed' },
  { dayOfWeek: 4, key: 'thu' },
  { dayOfWeek: 5, key: 'fri' },
  { dayOfWeek: 6, key: 'sat' },
  { dayOfWeek: 0, key: 'sun' },
];

@Component({
  selector: 'app-partner-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, IndirizzoGoogleDirective],
  template: `
    <div class="form-head">
      <div>
        <button type="button" class="back" (click)="indietro()">← {{ 'partnerForm.backToPartners' | translate }}</button>
        <h1>{{ (editId() ? 'partnerForm.editTitle' : 'partnerForm.title') | translate }}</h1>
        <p class="page-caption">
          {{ 'partnerForm.caption' | translate }}
        </p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <!-- Informazioni generali -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.general.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.general.requiredNote' | translate }}</span>
        </header>
        <div class="grid-2">
          <label class="fld"><span class="req">{{ 'partnerForm.general.insegna' | translate }}</span>
            <input class="field" name="insegna" [(ngModel)]="model.insegna" required [attr.placeholder]="'partnerForm.general.insegnaPlaceholder' | translate" /></label>
          <label class="fld"><span class="req">{{ 'partnerForm.general.email' | translate }}</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" required [attr.placeholder]="'partnerForm.general.emailPlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.businessName' | translate }}</span>
            <input class="field" name="businessName" [(ngModel)]="model.businessName" [attr.placeholder]="'partnerForm.general.businessNamePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.phone' | translate }}</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" placeholder="+39 …" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.vatNumber' | translate }}</span>
            <input class="field" name="vatNumber" [(ngModel)]="model.vatNumber" placeholder="IT01234567890" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.fiscalCode' | translate }}</span>
            <input class="field" name="fiscalCode" [(ngModel)]="model.fiscalCode" /></label>
          <label class="fld span-2"><span>{{ 'partnerForm.general.address' | translate }}</span>
            <input class="field" name="address" [(ngModel)]="model.address" appIndirizzoGoogle autocomplete="off" [attr.placeholder]="'partnerForm.general.addressPlaceholder' | translate" /></label>
        </div>

        <!-- Ritiro multiplo, sotto l'indirizzo principale -->
        <label class="toggle mt"><input type="checkbox" name="isMultiPickup" [(ngModel)]="model.isMultiPickup" /><span>{{ 'partnerForm.general.multiPickup' | translate }}</span></label>
        @if (model.isMultiPickup) {
          <div class="pickup-list">
            <span class="pickup-hint">{{ 'partnerForm.general.pickupHint' | translate }}</span>
            @for (addr of pickupAddresses; track $index) {
              <div class="pickup-row">
                <!-- 02/09 (regola utente): ANCHE gli indirizzi aggiuntivi
                     seguono Google Maps — vale per ogni input-indirizzo. -->
                <input class="field" [(ngModel)]="pickupAddresses[$index]" [name]="'pickup' + $index" appIndirizzoGoogle autocomplete="off" [attr.placeholder]="'partnerForm.general.addressPlaceholder' | translate" />
                <button type="button" class="icon-btn" (click)="removePickup($index)" [title]="'partnerForm.general.remove' | translate">✕</button>
              </div>
            }
            <button type="button" class="btn btn-secondary add" (click)="addPickup()">+ {{ 'partnerForm.general.addPickup' | translate }}</button>
          </div>
        }

        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'partnerForm.general.contactName' | translate }}</span>
            <input class="field" name="contactName" [(ngModel)]="model.contactName" [attr.placeholder]="'partnerForm.general.contactNamePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.general.contactSurname' | translate }}</span>
            <input class="field" name="contactSurname" [(ngModel)]="model.contactSurname" [attr.placeholder]="'partnerForm.general.contactSurnamePlaceholder' | translate" /></label>
        </div>
      </section>

      <!-- ⭐ 06/09/2026 (regola utente): AREE al posto delle 107 province. Le province
           effettive (quelle che lo smistamento legge) sono l'unione delle aree scelte e si
           mostrano sotto in sola lettura. Le aree si creano in Configurazione → Aree. -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.aree.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.aree.subtitle' | translate }}</span>
        </header>
        @if (aree().length === 0) { <p class="muted">{{ 'partnerForm.aree.empty' | translate }}</p> }
        @else {
          <div class="chips">
            @for (a of aree(); track a.id) {
              <button type="button" class="chip" [class.on]="selectedAree.has(a.id)" (click)="toggle(selectedAree, a.id)" [attr.aria-pressed]="selectedAree.has(a.id)" [title]="a.province.length + ' province'">{{ a.nome }} <span class="chip-n">{{ a.province.length }}</span></button>
            }
          </div>
          <p class="conto-scelte">{{ 'partnerForm.aree.effettive' | translate: { n: provinceEffettive().length } }} <span class="muted">{{ provinceEffettive().join(', ') || '—' }}</span></p>
        }
      </section>

      <!-- Province servite (dettaglio, sola lettura quando ci sono le aree) -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ (selectedAree.size > 0 ? 'partnerForm.provinces.titoloInPiu' : 'partnerForm.provinces.title') | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.provinces.subtitle' | translate }}</span>
        </header>
        @if (provinces().length === 0) { <p class="muted">{{ 'partnerForm.provinces.empty' | translate }}</p> }
        @else {
          <!-- 107 province sono un muro di chip: si filtra scrivendo. Le
               GIA' SCELTE restano visibili anche fuori filtro, se no
               spuntarne una la fa "sparire" e sembra un errore. -->
          <input class="field cerca-chip" type="search" [(ngModel)]="cercaProvincia" name="cercaProvincia"
                 [attr.placeholder]="'partnerForm.provinces.cerca' | translate"
                 [attr.aria-label]="'partnerForm.provinces.cerca' | translate" />
          <div class="chips">
            @for (p of provinceVisibili(); track p.id) {
              <button type="button" class="chip" [class.on]="selectedProvinces.has(p.id)" (click)="toggle(selectedProvinces, p.id)"
                      [attr.aria-pressed]="selectedProvinces.has(p.id)">{{ p.code }} · {{ p.name }}</button>
            }
          </div>
          @if (selectedProvinces.size > 0) {
            <p class="conto-scelte">{{ 'partnerForm.provinces.scelte' | translate: { n: selectedProvinces.size } }}</p>
          }
        }
      </section>

      <!-- Servizi abilitati -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.services.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.services.subtitle' | translate }}</span>
        </header>
        @if (serviceRows.length === 0) { <p class="muted">{{ 'partnerForm.services.empty' | translate }}</p> }
        @if (serviceRows.length > 0) {
          <!-- Legge 1 del Libro: il placeholder non e' una label. Le colonne
               hanno un'intestazione che resta visibile anche a campo pieno:
               quattro numeri affiancati senza nome erano indistinguibili. -->
          <!-- ⚠️ 02/09 (regola utente): km inclusi ed € fuori città NON stanno
               più qui — si impostano SOTTO, a livello partner (KM inclusi,
               Extra fuori città, Commissione Fee). Due colonne in meno, zero
               doppioni: il canone li legge comunque dal livello partner. -->
          <div class="svc-row svc-head" aria-hidden="true">
            <span>{{ 'partnerForm.services.typePlaceholder' | translate }}</span>
            <span>{{ 'partnerForm.services.colPrice' | translate }}</span>
            <span>{{ 'partnerForm.services.colExtraKm' | translate }}</span>
            <span></span>
          </div>
        }
        @for (row of serviceRows; track $index) {
          <div class="svc-row">
            <select class="field svc-type" [(ngModel)]="row.serviceTypeId" [name]="'svcType' + $index">
              <option value="">{{ 'partnerForm.services.typePlaceholder' | translate }}</option>
              @for (s of serviceTypes(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select>
            <input class="field num" type="number" step="0.01" inputmode="decimal" [attr.aria-label]="'partnerForm.services.colPrice' | translate" [(ngModel)]="row.price" [name]="'svcPrice' + $index" />
            <input class="field num" type="number" step="0.01" inputmode="decimal" [attr.aria-label]="'partnerForm.services.colExtraKm' | translate" [(ngModel)]="row.extraKmPrice" [name]="'svcKmP' + $index" />
            <button type="button" class="icon-btn" (click)="removeService($index)" [title]="'partnerForm.general.remove' | translate">✕</button>
          </div>
        }
        <button type="button" class="btn btn-secondary add" (click)="addService()">+ {{ 'partnerForm.services.add' | translate }}</button>
        <div class="grid-2 mt">
          <label class="fld"><span>{{ 'partnerForm.services.kmIncludedPartner' | translate }}</span>
            <input class="field num" type="number" name="kmIncluded" [(ngModel)]="model.kmIncluded" /></label>
          <label class="fld"><span>{{ 'partnerForm.services.extraOutOfCityPartner' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="extraOutOfCityPrice" [(ngModel)]="model.extraOutOfCityPrice" /></label>
          <label class="fld"><span>{{ 'partnerForm.services.commissionPercent' | translate }}</span>
            <input class="field num" type="number" step="0.01" name="commissionPercent" [(ngModel)]="model.commissionPercent" /></label>
        </div>
      </section>

      <!-- ⭐ 08/09/2026 (regola utente) — CONDIZIONI DI PAGAMENTO.
           Col partner corrono due rapporti opposti e hanno tempi diversi: sui servizi
           di VENDITA il prodotto lo fa lui e paghiamo noi; su tutto il resto le consegne
           le facciamo noi e incassiamo da lui. Un solo campo «giorni» non poteva dire
           tutt'e due le cose — in FINANCE ce n'era uno solo, e infatti non si sapeva
           mai a quale dei due versi si riferisse. -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.condizioni.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.condizioni.subtitle' | translate }}</span>
        </header>

        <div class="cond">
          <!-- NOI PAGHIAMO LUI -->
          <div class="cond-box">
            <div class="cond-head">
              <span class="verso paga">{{ 'partnerForm.condizioni.versoPaghiamo' | translate }}</span>
              <b>{{ 'partnerForm.condizioni.vendorTitolo' | translate }}</b>
            </div>
            <p class="cond-quali">{{ 'partnerForm.condizioni.vendorQuali' | translate }}</p>
            <label class="fld"><span>{{ 'partnerForm.condizioni.giorniPagamento' | translate }}</span>
              <input class="field num" type="number" step="1" min="0" max="365" name="pagamentoVendorGiorni"
                     [(ngModel)]="model.pagamentoVendorGiorni"
                     [placeholder]="'partnerForm.condizioni.aVista' | translate" /></label>
            <!-- ⚠️ La decorrenza NON è la data della consegna: è la fine del mese.
                 30 gg su una consegna del 3 settembre vuol dire il 30 ottobre, non il 3.
                 Ventisette giorni di differenza: si scrive, non si lascia dedurre. -->
            <p class="cond-nota">{{ 'partnerForm.condizioni.vendorDecorrenza' | translate }}</p>
            <!-- ⭐ 08/09/2026 (regola dell'utente): TRE STATI, non una spunta.
                 Una casella sa dire solo sì e no, e «no» finiva per voler dire
                 anche «nessuno l'ha mai scelto»: su 295 partner 283 stavano sul
                 valore di partenza, non su una decisione. «Da valorizzare» ora
                 esiste ed è il default — ma per chi ha servizi di VENDITA non è
                 una risposta accettabile, e il salvataggio si ferma. -->
            <label class="fld"><span>{{ 'partnerForm.condizioni.compensazione' | translate }}</span>
              <select class="field" name="compensazioneIncassi" [(ngModel)]="model.compensazioneIncassi">
                <option [ngValue]="null">{{ 'partnerForm.condizioni.compensazioneVuoto' | translate }}</option>
                <option [ngValue]="true">{{ 'partnerForm.condizioni.compensazioneScegliSi' | translate }}</option>
                <option [ngValue]="false">{{ 'partnerForm.condizioni.compensazioneScegliNo' | translate }}</option>
              </select></label>
            <p class="cond-nota">{{ 'partnerForm.condizioni.compensazioneNota' | translate }}</p>
            @if (model.compensazioneIncassi == null && haServiziVendita()) {
              <p class="cond-nota cond-obbligo">{{ 'partnerForm.condizioni.compensazioneObbligo' | translate }}</p>
            }
          </div>

          <!-- LUI PAGA NOI -->
          <div class="cond-box">
            <div class="cond-head">
              <span class="verso incassa">{{ 'partnerForm.condizioni.versoIncassiamo' | translate }}</span>
              <b>{{ 'partnerForm.condizioni.fatturaTitolo' | translate }}</b>
            </div>
            <p class="cond-quali">{{ 'partnerForm.condizioni.fatturaQuali' | translate }}</p>
            <label class="fld"><span>{{ 'partnerForm.condizioni.giorniIncasso' | translate }}</span>
              <input class="field num" type="number" step="1" min="0" max="365" name="incassoServiziGiorni"
                     [(ngModel)]="model.incassoServiziGiorni"
                     [placeholder]="'partnerForm.condizioni.aVistaFattura' | translate" /></label>
            <!-- Qui la decorrenza cambia da partner a partner: la si dichiara. -->
            <label class="check">
              <input type="checkbox" name="incassoServiziFineMese" [(ngModel)]="model.incassoServiziFineMese" />
              <span>
                <b>{{ 'partnerForm.condizioni.fineMese' | translate }}</b>
                <span class="cond-nota">{{ (model.incassoServiziFineMese ? 'partnerForm.condizioni.fineMeseSi' : 'partnerForm.condizioni.fineMeseNo') | translate }}</span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <!-- ⭐ 06/09/2026 (decisione utente): i MESTIERI del partner — 8 chip al posto di 65 caselle.
           Le categorie sotto restano il dettaglio del catalogo; lo smistamento guarda prima qui. -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.mestieri.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.mestieri.subtitle' | translate }}</span>
        </header>
        @if (mestieri().length === 0) { <p class="muted">{{ 'partnerForm.mestieri.empty' | translate }}</p> }
        @else {
          <div class="chips">
            @for (m of mestieri(); track m.id) {
              <button type="button" class="chip" [class.on]="selectedMestieri.has(m.id)" (click)="toggle(selectedMestieri, m.id)" [attr.aria-pressed]="selectedMestieri.has(m.id)">{{ m.nome }}</button>
            }
          </div>
        }
        <!-- ⭐ 06/09 (regola utente): «Consegna da Partner» sta qui, col raggio che compare solo a flag acceso. -->
        <div class="consegna-partner">
          <label class="toggle"><input type="checkbox" name="autoDeliveredByPartner" [(ngModel)]="model.autoDeliveredByPartner" /><span>{{ 'partnerForm.setup.autoDeliveredByPartner' | translate }}</span></label>
          <p class="hint">{{ 'partnerForm.setup.autoDeliveredByPartnerHint' | translate }}</p>
          <!-- ⭐ 06/09 sera (regola utente): i partner «nostri» di ripiego non entrano nelle proposte. -->
          <label class="toggle"><input type="checkbox" name="esclusoDalleProposte" [(ngModel)]="model.esclusoDalleProposte" /><span>{{ 'partnerForm.setup.esclusoDalleProposte' | translate }}</span></label>
          <p class="hint">{{ 'partnerForm.setup.esclusoDalleProposteHint' | translate }}</p>
        </div>
        <div class="mestieri-campi">
          <label class="campo">{{ 'partnerForm.mestieri.minimo' | translate }}
            <input class="field num" type="number" min="0" step="1" name="minimoOrdineVendita" [(ngModel)]="model.minimoOrdineVendita" [attr.placeholder]="'partnerForm.mestieri.nessunLimite' | translate" />
            <span class="hint">{{ 'partnerForm.mestieri.minimoHint' | translate }}</span></label>
          @if (model.autoDeliveredByPartner) {
          <label class="campo">{{ 'partnerForm.mestieri.raggio' | translate }}
            <input class="field num" type="number" min="0" step="1" name="raggioMaxConsegnaKm" [(ngModel)]="model.raggioMaxConsegnaKm" [attr.placeholder]="'partnerForm.mestieri.nessunLimite' | translate" />
            <span class="hint">{{ 'partnerForm.mestieri.raggioHint' | translate }}</span></label>
          }
        </div>
        <!-- ⭐ 06/09 sera (nuova architettura vendite): AREA DI CONSEGNA — dove consegna da solo, con minimo
             e raggio PER PROVINCIA; i campi sopra sono i predefiniti. Solo con «Consegna da Partner». -->
        @if (model.autoDeliveredByPartner) {
        <div class="area-consegna">
          <h3>{{ 'partnerForm.consegna.title' | translate }}</h3>
          <p class="hint">{{ 'partnerForm.consegna.sub' | translate }}</p>
          <div class="consegna-riga-add">
            <select class="field" (change)="aggiungiConsegna($any($event.target).value); $any($event.target).value=''">
              <option value="">{{ 'partnerForm.consegna.aggiungi' | translate }}</option>
              @for (p of provinceNonInConsegna(); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }
            </select>
            @if (provinceEffettive().length && consegna.length === 0) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="consegnaDalleVendite()">{{ 'partnerForm.consegna.copiaVendite' | translate }}</button>
            }
            @if (consegna.length > 1) {
              <button type="button" class="btn btn-secondary btn-sm" (click)="copiaATutte()">{{ 'partnerForm.consegna.copiaTutte' | translate }}</button>
            }
          </div>
          @if (consegna.length === 0) { <p class="muted mini">{{ 'partnerForm.consegna.vuoto' | translate }}</p> }
          @else {
          <table class="tab-consegna">
            <thead><tr><th>{{ 'partnerForm.consegna.colProvincia' | translate }}</th><th>{{ 'partnerForm.consegna.colMinimo' | translate }}</th><th>{{ 'partnerForm.consegna.colRaggio' | translate }}</th><th></th></tr></thead>
            <tbody>
              @for (r of consegna; track r.provinceId; let i = $index) {
                <tr>
                  <td><b>{{ codiceProvincia(r.provinceId) }}</b> <span class="muted">{{ nomeProvincia(r.provinceId) }}</span></td>
                  <td><input class="field num" type="number" min="0" step="1" [name]="'cmin' + i" [(ngModel)]="r.minimoOrdine" [attr.placeholder]="'partnerForm.consegna.predefinito' | translate" /></td>
                  <td><input class="field num" type="number" min="0" step="1" [name]="'ckm' + i" [(ngModel)]="r.raggioKm" [attr.placeholder]="'partnerForm.consegna.predefinito' | translate" /></td>
                  <td><button type="button" class="x" (click)="rimuoviConsegna(r.provinceId)" [attr.title]="'common.remove' | translate">✕</button></td>
                </tr>
              }
            </tbody>
          </table>
          }
        </div>
        }
      </section>

      <!-- ⭐ 06/09 (decisione utente): la sezione «Categorie vendute» non serve più — contano i MESTIERI.
           I dati restano (PartnerCategory), la scheda non li mostra né li riscrive. -->
      <section class="card block" hidden>
        <header class="block-head">
          <h2>{{ 'partnerForm.categories.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.categories.subtitle' | translate }}</span>
        </header>
        @if (categories().length === 0) { <p class="muted">{{ 'partnerForm.categories.empty' | translate }}</p> }
        @else {
          <input class="field cerca-chip" type="search" [(ngModel)]="cercaCategoria" name="cercaCategoria"
                 [attr.placeholder]="'partnerForm.categories.cerca' | translate"
                 [attr.aria-label]="'partnerForm.categories.cerca' | translate" />
          <div class="chips">
            @for (c of categorieVisibili(); track c.id) {
              <button type="button" class="chip" [class.on]="selectedCategories.has(c.id)" (click)="toggle(selectedCategories, c.id)"
                      [attr.aria-pressed]="selectedCategories.has(c.id)">{{ c.name }}</button>
            }
          </div>
          @if (selectedCategories.size > 0) {
            <p class="conto-scelte">{{ 'partnerForm.categories.scelte' | translate: { n: selectedCategories.size } }}</p>
          }
        }
      </section>

      <!-- Orari di apertura settimanali -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.openingHours.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.openingHours.subtitle' | translate }}</span>
        </header>
        <div class="oh-rows">
          @for (row of openingHoursRows; track row.dayOfWeek) {
            <div class="oh-row">
              <span class="oh-day">{{ 'partnerForm.openingHours.days.' + row.key | translate }}</span>
              <label class="toggle sm"><input type="checkbox" [(ngModel)]="row.closed" [name]="'ohClosed' + row.dayOfWeek" /><span>{{ 'partnerForm.openingHours.closed' | translate }}</span></label>
              @if (!row.closed) {
                <input class="field time" type="time" step="900" [(ngModel)]="row.openTime" [name]="'ohOpen' + row.dayOfWeek" />
                <span class="oh-sep">–</span>
                <input class="field time" type="time" step="900" [(ngModel)]="row.closeTime" [name]="'ohClose' + row.dayOfWeek" />
              } @else {
                <span class="oh-closed-note">{{ 'partnerForm.openingHours.closedNote' | translate }}</span>
              }
              <!-- ⭐ 01/09 (chiesto dall'utente): l'orario di QUESTO giorno si
                   applica a tutti gli altri — non solo quello del lunedì. -->
              <button type="button" class="link-btn oh-tutti" (click)="copiaGiornoSuTutti(row)" title="Applica questo orario a tutti i giorni">→ tutti</button>
            </div>
          }
        </div>
        <button type="button" class="btn btn-secondary oh-copy" (click)="copyFirstDayToAll()">{{ 'partnerForm.openingHours.copyAll' | translate }}</button>
      </section>

      <!-- Pagamenti e fatturazione -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'partnerForm.payments.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'partnerForm.payments.paymentMethod' | translate }}</span>
            <select class="field" name="paymentMethod" [(ngModel)]="model.paymentMethod">
              <option value="">—</option>
              @for (m of paymentMethods; track m[0]) { <option [value]="m[0]">{{ ('enums.paymentMethod.' + m[0]) | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'partnerForm.payments.paymentStatus' | translate }}</span>
            <select class="field" name="paymentStatus" [(ngModel)]="model.paymentStatus">
              @for (s of paymentStatuses; track s[0]) { <option [value]="s[0]">{{ ('enums.paymentStatus.' + s[0]) | translate }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'partnerForm.payments.contractStart' | translate }}</span>
            <input class="field" type="date" name="contractStart" [(ngModel)]="model.contractStart" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.contractEnd' | translate }}</span>
            <input class="field" type="date" name="contractEnd" [(ngModel)]="model.contractEnd" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.bankAccount' | translate }}</span>
            <input class="field" name="bankAccount" [(ngModel)]="model.bankAccount" placeholder="IT60 X054 …" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.bankAccountName' | translate }}</span>
            <input class="field" name="bankAccountName" [(ngModel)]="model.bankAccountName" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.sdiCode' | translate }}</span>
            <input class="field" name="sdiCode" [(ngModel)]="model.sdiCode" [attr.placeholder]="'partnerForm.payments.sdiCodePlaceholder' | translate" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.certifiedEmail' | translate }}</span>
            <input class="field" type="email" name="certifiedEmail" [(ngModel)]="model.certifiedEmail" placeholder="pec@partner.it" /></label>
          <label class="fld"><span>{{ 'partnerForm.payments.invoiceEmail' | translate }}</span>
            <input class="field" type="email" name="invoiceEmail" [(ngModel)]="model.invoiceEmail" placeholder="fatture@partner.it" /></label>
        </div>
        <label class="toggle mt"><input type="checkbox" name="invoicingEnabled" [(ngModel)]="model.invoicingEnabled" /><span>{{ 'partnerForm.payments.invoicingEnabled' | translate }}</span></label>
      </section>

      <!-- Setup -->
      <section class="card block">
        <header class="block-head">
          <h2>{{ 'partnerForm.setup.title' | translate }}</h2>
          <span class="block-sub">{{ 'partnerForm.setup.subtitle' | translate }}</span>
        </header>
        <div class="setup-group">
          <span class="group-label">{{ 'partnerForm.setup.warehouseGroup' | translate }}</span>
          <label class="toggle"><input type="checkbox" name="isWarehouse" [(ngModel)]="model.isWarehouse" /><span>{{ 'partnerForm.setup.isWarehouse' | translate }}</span></label>
        </div>
        <div class="setup-group">
          <span class="group-label">{{ 'partnerForm.setup.securityGroup' | translate }}</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="valetIdentityCheck" [(ngModel)]="model.valetIdentityCheck" /><span>{{ 'partnerForm.setup.valetIdentityCheck' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="deliveryCodeRequired" [(ngModel)]="model.deliveryCodeRequired" /><span>{{ 'partnerForm.setup.deliveryCodeRequired' | translate }}</span></label>
          </div>
          @if (model.deliveryCodeRequired) {
            <label class="fld mt" style="max-width:340px"><span>{{ 'partnerForm.setup.deliveryCodeType' | translate }}</span>
              <select class="field" name="deliveryCodeCheckType" [(ngModel)]="model.deliveryCodeCheckType">
                <option value="UNIQUE_PER_DELIVERY">{{ 'partnerForm.setup.codeUniquePerDelivery' | translate }}</option>
                <option value="UNIQUE_PER_CUSTOMER">{{ 'partnerForm.setup.codeUniquePerCustomer' | translate }}</option>
              </select></label>
          }
        </div>
        <div class="setup-group">
          <span class="group-label">{{ 'partnerForm.setup.notificationsGroup' | translate }}</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="smsTemplatesEnabled" [(ngModel)]="model.smsTemplatesEnabled" /><span>{{ 'partnerForm.setup.smsEnabled' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="whatsappNotifications" [(ngModel)]="model.whatsappNotifications" /><span>{{ 'partnerForm.setup.whatsappNotifications' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="mailNotifications" [(ngModel)]="model.mailNotifications" /><span>{{ 'partnerForm.setup.mailNotifications' | translate }}</span></label>

            <label class="toggle"><input type="checkbox" name="activityReminder" [(ngModel)]="model.activityReminder" /><span>{{ 'partnerForm.setup.activityReminder' | translate }}</span></label>
          </div>
        </div>
      </section>

      <!-- Vendita e integrazioni -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'partnerForm.sales.title' | translate }}</h2></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'partnerForm.sales.storeUrl' | translate }}</span>
            <input class="field" name="storeUrl" [(ngModel)]="model.storeUrl" placeholder="https://…" /></label>
          <label class="fld"><span>{{ 'partnerForm.sales.imageUrl' | translate }}</span>
            <input class="field" name="imageUrl" [(ngModel)]="model.imageUrl" placeholder="https://…" /></label>
        </div>
        <label class="fld span-2 mt"><span>{{ 'partnerForm.sales.woocommerceApiKey' | translate }}</span>
          <div class="key-row">
            <input class="field" name="woocommerceApiKey" [(ngModel)]="model.woocommerceApiKey" [attr.placeholder]="'partnerForm.sales.woocommerceApiKeyPlaceholder' | translate" />
            <button type="button" class="btn btn-secondary" (click)="generateKey()">{{ 'partnerForm.sales.generate' | translate }}</button>
            <button type="button" class="btn btn-secondary" (click)="copyKey()" [disabled]="!model.woocommerceApiKey">{{ 'partnerForm.sales.copy' | translate }}</button>
          </div>
        </label>
        <label class="fld span-2 mt"><span>{{ 'partnerForm.sales.notes' | translate }}</span>
          <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea></label>
      </section>

      @if (justSaved()) { <div class="ok-card card" role="status" [innerHTML]="'partnerForm.actions.savedNote' | translate"></div> }
      @if (error()) { <div class="error-card card" role="alert">{{ error() }}</div> }

      <!-- §4 del Libro: sette sezioni spingono la CTA oltre la viewport,
           quindi la barra e' STICKY. -->
      <div class="actions sticky">
        <a routerLink="/partners" class="btn btn-secondary">{{ 'partnerForm.actions.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'partnerForm.actions.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('partnerForm.actions.saving' | translate) : ((editId() ? 'common.save' : 'partnerForm.actions.create') | translate) }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `.area-consegna { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--hairline); }
     .area-consegna h3 { margin: 0 0 4px; font-size: 14.5px; font-weight: 600; }
     .consegna-riga-add { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
     .consegna-riga-add .field { max-width: 320px; }
     .btn-sm { padding: 6px 12px; font-size: 12.5px; }
     .tab-consegna { width: 100%; max-width: 640px; border-collapse: collapse; }
     .tab-consegna th { text-align: left; font-size: 12px; color: var(--text-secondary); font-weight: 550; padding: 4px 8px 6px; }
     .tab-consegna td { padding: 4px 8px; vertical-align: middle; }
     .tab-consegna .num { max-width: 140px; }
     .tab-consegna .x { appearance: none; border: 0; background: none; cursor: pointer; color: var(--text-tertiary); font-size: 14px; }
     .mini { font-size: 12.5px; margin: 6px 0 0; }`,
    `.consegna-partner { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--hairline); }
     .consegna-partner .hint { margin: 4px 0 0; font-size: 12.5px; color: var(--text-secondary); }
     .chip-n { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px; background: rgba(120,120,128,.15); font-size: 11px; }
     .chip.on .chip-n { background: rgba(255,255,255,.22); }
     .mestieri-campi { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px 24px; margin-top: 16px; }
     .mestieri-campi .campo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 550; }
     .mestieri-campi .field { max-width: 240px; }
     .mestieri-campi .hint { font-weight: 400; font-size: 12.5px; color: var(--text-secondary); line-height: 1.35; }`,
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
      .back:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; border-radius: 4px; }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 860px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .oh-rows { display: flex; flex-direction: column; gap: 8px; }
      .oh-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .oh-day { width: 92px; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); }
      .oh-row .toggle.sm { font-size: 13px; }
      .field.time { width: 120px; }
      .oh-sep { color: var(--text-tertiary); }
      .oh-closed-note { font-size: 13px; color: var(--text-tertiary); font-style: italic; }
      .oh-copy { margin-top: 14px; }
      .oh-tutti { margin-left: auto; background: none; border: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--text-secondary); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .oh-tutti:hover { color: var(--ink, #1d1d1f); }
      @media (max-width: 640px) { .oh-day { width: 100%; } .field.time { flex: 1; width: auto; } }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      /* Condizioni di pagamento: due riquadri affiancati, uno per verso del denaro.
         Affiancarli e' il punto: sono opposti, e visti insieme non ci si sbaglia. */
      .cond { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .cond-box { border: 1px solid var(--hairline); border-radius: 12px; padding: 14px 14px 12px; background: var(--surface); }
      .cond-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .cond-head b { font-size: 14.5px; }
      .verso { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
      .verso.paga { background: rgba(255,159,10,.14); color: #A56100; }
      .verso.incassa { background: rgba(52,199,89,.14); color: #248A3D; }
      .cond-quali { margin: 0 0 12px; font-size: 12px; color: var(--text-secondary); line-height: 1.45; }
      .cond-nota { display: block; margin: 6px 0 0; font-size: 11.5px; color: var(--text-secondary); line-height: 1.45; }
      .cond .check { display: flex; align-items: flex-start; gap: 9px; margin-top: 12px; cursor: pointer; }
      .cond .check input { margin-top: 2px; width: 16px; height: 16px; flex: 0 0 auto; }
      .cond .check b { display: block; font-size: 13.5px; font-weight: 600; }
      .cond .fld .field.num { max-width: 120px; }
      @media (max-width: 720px) { .cond { grid-template-columns: 1fr; } }
      .mt { margin-top: 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .span-2 { grid-column: 1 / -1; }
      textarea.field { resize: vertical; font-family: inherit; }
      .muted { color: var(--text-tertiary); font-size: 14px; margin: 0; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip { appearance: none; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 14px; font-size: 13px; font-family: inherit; color: var(--text); cursor: pointer; transition: all 0.15s var(--ease); }
      .chip:hover { background: var(--fill); }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .svc-row { display: grid; grid-template-columns: minmax(0, 1.6fr) repeat(2, minmax(0, 1fr)) 34px; gap: 8px; margin-bottom: 10px; align-items: center; }
      /* ⚠️ 02/09: min-width:0 stringe la TRACCIA ma un <input> senza width
         resta alla sua larghezza intrinseca (~200px) e sfonda comunque la
         card, disallineando le intestazioni. Serve anche width:100% sui campi
         perché riempiano la traccia, e minmax(0,1fr) blinda le colonne. */
      .svc-row > * { min-width: 0; }
      .svc-row .field { width: 100%; }
      .svc-head { margin-bottom: 2px; }
      .svc-head span { font-size: 11.5px; font-weight: 550; color: var(--text-tertiary); }
      .cerca-chip { max-width: 320px; margin-bottom: 12px; }
      .conto-scelte { margin: 10px 0 0; font-size: 12.5px; color: var(--text-secondary); }
      .svc-row .num { text-align: right; }
      .pickup-list { margin-top: 12px; padding: 14px; background: var(--fill); border-radius: var(--radius-m); }
      .pickup-hint { display: block; font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 10px; }
      .pickup-row { display: flex; gap: 8px; margin-bottom: 8px; }
      .pickup-row .field { flex: 1; background: var(--surface); }
      .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill-hover); color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.15s var(--ease); flex-shrink: 0; }
      .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red); }
      .add { margin-top: 4px; align-self: flex-start; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .setup-group { padding: 12px 0; border-bottom: 1px solid var(--hairline); }
      .setup-group:last-child { border-bottom: none; padding-bottom: 0; }
      .setup-group:first-child { padding-top: 0; }
      .group-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .key-row { display: flex; gap: 8px; }
      .key-row .field { flex: 1; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .svc-row { grid-template-columns: 1fr 1fr; } }
    `,
  ],
})
export class PartnerFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly location = inject(Location);

  readonly provinces = signal<Province[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly mestieri = signal<Mestiere[]>([]);
  readonly selectedMestieri = new Set<string>();
  /** ⭐ 06/09 sera: l'area di consegna — province dove consegna da solo, con minimo e raggio per provincia. */
  consegna: { provinceId: string; minimoOrdine: number | null; raggioKm: number | null }[] = [];
  provinceNonInConsegna(): Province[] { const gia = new Set(this.consegna.map((r) => r.provinceId)); return this.provinces().filter((p) => !gia.has(p.id)); }
  codiceProvincia(id: string): string { return this.provinces().find((p) => p.id === id)?.code ?? '?'; }
  nomeProvincia(id: string): string { return this.provinces().find((p) => p.id === id)?.name ?? ''; }
  aggiungiConsegna(id: string): void { if (id && !this.consegna.some((r) => r.provinceId === id)) this.consegna = [...this.consegna, { provinceId: id, minimoOrdine: null, raggioKm: null }]; }
  rimuoviConsegna(id: string): void { this.consegna = this.consegna.filter((r) => r.provinceId !== id); }
  /** Copia i valori della prima riga su tutte le altre. */
  copiaATutte(): void { const [prima] = this.consegna; if (!prima) return; this.consegna = this.consegna.map((r) => ({ ...r, minimoOrdine: prima.minimoOrdine, raggioKm: prima.raggioKm })); }
  /** Parte dalle province dove VENDE (area commerciale): comodo quando consegna ovunque vende. */
  consegnaDalleVendite(): void { const codici = new Set(this.provinceEffettive()); this.consegna = this.provinces().filter((p) => codici.has(p.code)).map((p) => ({ provinceId: p.id, minimoOrdine: null, raggioKm: null })); }
  readonly aree = signal<Area[]>([]);
  readonly selectedAree = new Set<string>();
  /** Le sigle delle province coperte dalle aree scelte (unione), per dirlo a chi compila. */
  provinceEffettive(): string[] {
    const s = new Set<string>();
    for (const a of this.aree()) if (this.selectedAree.has(a.id)) for (const p of a.province) s.add(p.code);
    for (const p of this.provinces()) if (this.selectedProvinces.has(p.id)) s.add(p.code); // ⭐ 06/09: province in più, scelte a mano
    return [...s].sort();
  }
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly selectedProvinces = new Set<string>();
  readonly selectedCategories = new Set<string>();

  /** Il filtro delle chip: 107 province e 65 categorie sono un muro. */
  cercaProvincia = '';
  cercaCategoria = '';

  /**
   * Libro v1.5: si torna con la HISTORY quando si arriva da dentro l'app
   * (che conserva filtri, pagina e scroll dell'elenco); il link nudo solo
   * arrivando da fuori. Il vecchio «← Torna ai partner» cablato buttava i
   * filtri di chi aveva filtrato.
   */
  indietro(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/partners']);
  }

  /**
   * Le chip visibili col filtro attivo. ⚠️ Le GIA' SCELTE restano sempre:
   * se il filtro le nascondesse, spuntarne una la farebbe sparire dallo
   * schermo e sembrerebbe un errore, non una scelta.
   */
  provinceVisibili(): Province[] {
    const q = this.cercaProvincia.trim().toLowerCase();
    if (!q) return this.provinces();
    return this.provinces().filter(
      (p) => this.selectedProvinces.has(p.id) || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }

  categorieVisibili(): Category[] {
    const q = this.cercaCategoria.trim().toLowerCase();
    if (!q) return this.categories();
    return this.categories().filter((c) => this.selectedCategories.has(c.id) || c.name.toLowerCase().includes(q));
  }
  readonly paymentMethods = Object.entries(PAYMENT_METHOD_LABELS);
  readonly paymentStatuses = Object.entries(PAYMENT_STATUS_LABELS);

  serviceRows: ServiceRow[] = [];
  pickupAddresses: string[] = [];
  /** Orari di apertura: una riga per giorno (lun→dom). */
  openingHoursRows: OpeningHourRow[] = WEEK_DAYS.map((d) => ({
    dayOfWeek: d.dayOfWeek,
    key: d.key,
    closed: false,
    openTime: '',
    closeTime: '',
  }));

  model = {
    insegna: '',
    email: '',
    businessName: '',
    phone: '',
    vatNumber: '',
    fiscalCode: '',
    address: '',
    isMultiPickup: false,
    contactName: '',
    contactSurname: '',
    paymentMethod: '',
    paymentStatus: 'active',
    contractStart: '',
    contractEnd: '',
    bankAccount: '',
    bankAccountName: '',
    sdiCode: '',
    certifiedEmail: '',
    invoiceEmail: '',
    invoicingEnabled: false,
    kmIncluded: null as number | null,
    extraOutOfCityPrice: null as number | null,
    commissionPercent: null as number | null,
    // Condizioni di pagamento (08/09): due versi separati, tempi diversi.
    pagamentoVendorGiorni: null as number | null,
    // null = ancora da valorizzare (08/09): il partner nuovo nasce senza una
    // decisione presa per lui, e se ha servizi di vendita il salvataggio la chiede.
    compensazioneIncassi: null as boolean | null,
    incassoServiziGiorni: null as number | null,
    incassoServiziFineMese: false,
    isWarehouse: false,
    valetIdentityCheck: false,
    deliveryCodeRequired: false,
    deliveryCodeCheckType: 'UNIQUE_PER_DELIVERY',
    smsTemplatesEnabled: false,
    whatsappNotifications: false,
    mailNotifications: false,
    autoDeliveredByPartner: false,
    esclusoDalleProposte: false,
    minimoOrdineVendita: null as number | null,
    raggioMaxConsegnaKm: null as number | null,
    activityReminder: false,
    storeUrl: '',
    imageUrl: '',
    woocommerceApiKey: '',
    notes: '',
  };

  /** Id partner in modifica (null = nuovo partner). */
  readonly editId = signal<string | null>(null);

  constructor() {
    const api = environment.apiUrl;
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
    this.http.get<Category[]>(`${api}/categories`).subscribe((d) => this.categories.set(d));
    this.http.get<Mestiere[]>(`${api}/mestieri`).subscribe({ next: (d) => this.mestieri.set(d.filter((m) => m.attivo)), error: () => undefined });
    this.http.get<Area[]>(`${api}/aree`).subscribe({ next: (d) => this.aree.set(d.filter((a) => a.attiva)), error: () => undefined });
    this.http.get<ServiceType[]>(`${api}/service-types`).subscribe((d) => this.serviceTypes.set(d));

    // Modalita' modifica: /partners/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${api}/partners/${id}`).subscribe({
        next: (p) => this.prefill(p),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con il partner esistente. */
  private prefill(p: Record<string, any>): void {
    const m = this.model as Record<string, any>;
    for (const key of Object.keys(this.model)) {
      const v = p[key];
      if (v === null || v === undefined) continue;
      // Le date arrivano ISO: il campo input[type=date] vuole YYYY-MM-DD
      if ((key === 'contractStart' || key === 'contractEnd') && typeof v === 'string') {
        m[key] = v.slice(0, 10);
      } else {
        m[key] = v;
      }
    }
    // Province / categorie / servizi collegati
    this.selectedProvinces.clear();
    // ⭐ 06/09: con le aree, nelle chip restano solo le province scelte a mano (manuale); senza aree, tutte.
    const haAree = (((p as any).aree ?? []) as unknown[]).length > 0;
    for (const pp of (p['provinces'] as any[]) ?? []) {
      if (pp?.province?.id && (!haAree || pp.manuale)) this.selectedProvinces.add(pp.province.id);
    }
    this.selectedAree.clear();
    for (const a of ((p as any).aree ?? []) as { area?: { id: string } }[]) if (a?.area?.id) this.selectedAree.add(a.area.id);
    this.consegna = (((p as any).consegnaProvince ?? []) as { provinceId?: string; province?: { id: string }; minimoOrdine?: number | null; raggioKm?: number | null }[])
      .map((r) => ({ provinceId: r.provinceId ?? r.province?.id ?? '', minimoOrdine: r.minimoOrdine ?? null, raggioKm: r.raggioKm ?? null }))
      .filter((r) => !!r.provinceId);
    this.selectedMestieri.clear();
    for (const m of ((p as any).mestieri ?? []) as { mestiere?: { id: string } }[]) if (m?.mestiere?.id) this.selectedMestieri.add(m.mestiere.id);
    this.selectedCategories.clear();
    for (const c of (p['categories'] as any[]) ?? []) {
      if (c?.category?.id) this.selectedCategories.add(c.category.id);
    }
    this.serviceRows = ((p['services'] as any[]) ?? []).map((s) => ({
      serviceTypeId: s.serviceType?.id ?? s.serviceTypeId ?? '',
      price: s.price ?? null,
      includedKm: s.includedKm ?? null,
      extraKmPrice: s.extraKmPrice ?? null,
      extraOutOfCityPrice: s.extraOutOfCityPrice ?? null,
    }));
    // Orari di apertura settimanali
    const oh = (p['openingHours'] as any[]) ?? [];
    if (oh.length) {
      for (const row of this.openingHoursRows) {
        const found = oh.find((x) => x.dayOfWeek === row.dayOfWeek);
        row.closed = found ? !!found.closed : false;
        row.openTime = found?.openTime ?? '';
        row.closeTime = found?.closeTime ?? '';
      }
    }
    // pickupAddresses e' salvato come stringa JSON lato API
    const pa = p['pickupAddresses'];
    if (typeof pa === 'string') {
      try {
        const parsed = JSON.parse(pa);
        this.pickupAddresses = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        this.pickupAddresses = [];
      }
    } else if (Array.isArray(pa)) {
      this.pickupAddresses = pa.map(String);
    }
  }

  toggle(set: Set<string>, id: string): void {
    set.has(id) ? set.delete(id) : set.add(id);
  }

  addService(): void {
    this.serviceRows.push({ serviceTypeId: '', price: null, includedKm: null, extraKmPrice: null, extraOutOfCityPrice: null });
  }
  removeService(i: number): void { this.serviceRows.splice(i, 1); }

  /**
   * Il partner ha almeno un servizio di VENDITA fra quelli scelti ADESSO nel
   * modulo (non quelli in archivio): serve a dire, mentre si compila, che
   * «Compensa commissioni e vendite» sta per diventare obbligatorio. La stessa
   * regola la ricontrolla il server prima di scrivere — questa è la cortesia di
   * dirlo prima, non la difesa (08/09/2026).
   */
  haServiziVendita(): boolean {
    const vendita = new Set(this.serviceTypes().filter((t) => t.pricingModel === 'VENDITA').map((t) => t.id));
    return this.serviceRows.some((r) => r.serviceTypeId && vendita.has(r.serviceTypeId));
  }

  /** Copia l'orario del primo giorno (lunedì) su tutti gli altri. */
  copyFirstDayToAll(): void {
    this.copiaGiornoSuTutti(this.openingHoursRows[0]);
  }

  /** ⭐ 01/09 (chiesto dall'utente): l'orario di UN giorno qualsiasi si applica
   *  a tutti gli altri — il «→ tutti» sulla riga. */
  copiaGiornoSuTutti(sorgente: OpeningHourRow): void {
    for (const row of this.openingHoursRows) {
      row.closed = sorgente.closed;
      row.openTime = sorgente.openTime;
      row.closeTime = sorgente.closeTime;
    }
  }

  addPickup(): void { this.pickupAddresses.push(''); }
  removePickup(i: number): void { this.pickupAddresses.splice(i, 1); }

  generateKey(): void {
    const uuid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    this.model.woocommerceApiKey = `dxy_${uuid.replace(/-/g, '')}`;
  }

  copyKey(): void {
    if (this.model.woocommerceApiKey && navigator.clipboard) {
      navigator.clipboard.writeText(this.model.woocommerceApiKey);
    }
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    if (!this.model.insegna.trim() || !this.model.email.trim()) {
      this.error.set(this.translate.instant('partnerForm.errors.requiredFields'));
      return;
    }

    const m = this.model;
    const payload: Record<string, unknown> = {
      insegna: m.insegna.trim(),
      email: m.email.trim(),
      invoicingEnabled: m.invoicingEnabled,
      smsTemplatesEnabled: m.smsTemplatesEnabled,
      whatsappNotifications: m.whatsappNotifications,
      mailNotifications: m.mailNotifications,
      autoDeliveredByPartner: m.autoDeliveredByPartner,
      esclusoDalleProposte: !!m.esclusoDalleProposte,
      minimoOrdineVendita: m.minimoOrdineVendita === null || m.minimoOrdineVendita === undefined || (m.minimoOrdineVendita as unknown) === '' ? null : Number(m.minimoOrdineVendita),
      raggioMaxConsegnaKm: m.raggioMaxConsegnaKm === null || m.raggioMaxConsegnaKm === undefined || (m.raggioMaxConsegnaKm as unknown) === '' ? null : Number(m.raggioMaxConsegnaKm),
      isMultiPickup: m.isMultiPickup,
      valetIdentityCheck: m.valetIdentityCheck,
      deliveryCodeRequired: m.deliveryCodeRequired,
      deliveryCodeCheckType: m.deliveryCodeCheckType,
      isWarehouse: m.isWarehouse,
      activityReminder: m.activityReminder,
      paymentStatus: m.paymentStatus,
    };
    for (const key of [
      'businessName', 'phone', 'vatNumber', 'fiscalCode', 'address',
      'contactName', 'contactSurname', 'paymentMethod', 'contractStart', 'contractEnd',
      'bankAccount', 'bankAccountName', 'sdiCode', 'certifiedEmail', 'invoiceEmail',
      'storeUrl', 'imageUrl', 'woocommerceApiKey', 'notes',
    ] as const) {
      const v = (m as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) payload[key] = v.trim();
    }
    if (m.kmIncluded != null) payload['kmIncluded'] = Number(m.kmIncluded);
    if (m.extraOutOfCityPrice != null) payload['extraOutOfCityPrice'] = Number(m.extraOutOfCityPrice);
    if (m.commissionPercent != null) payload['commissionPercent'] = Number(m.commissionPercent);
    // ⚠️ Campo vuoto = «non concordato» (a vista), che è diverso da zero: si manda
    // null, non 0. Con `0` la scheda direbbe «0 giorni» come se fosse un accordo preso.
    payload['pagamentoVendorGiorni'] = m.pagamentoVendorGiorni === null || String(m.pagamentoVendorGiorni) === ''
      ? null : Number(m.pagamentoVendorGiorni);
    payload['incassoServiziGiorni'] = m.incassoServiziGiorni === null || String(m.incassoServiziGiorni) === ''
      ? null : Number(m.incassoServiziGiorni);
    // ⚠️ Stessa ragione della riga sopra, e vale doppio qui: `!!` trasformava
    // «ancora da valorizzare» in un «no» — cioè inventava una decisione a ogni
    // salvataggio, anche a chi apriva la scheda per cambiare un telefono.
    // I tre stati si mandano per quello che sono.
    payload['compensazioneIncassi'] =
      m.compensazioneIncassi === null || m.compensazioneIncassi === undefined || String(m.compensazioneIncassi) === ''
        ? null
        : !!m.compensazioneIncassi;
    payload['incassoServiziFineMese'] = !!m.incassoServiziFineMese;
    // In modifica le collezioni vanno inviate SEMPRE, anche vuote: altrimenti
    // svuotarle non le cancellerebbe (l'API aggiorna solo le chiavi presenti).
    const isEdit = !!this.editId();
    if (this.selectedProvinces.size || isEdit) payload['provinceIds'] = [...this.selectedProvinces];
    if (this.selectedMestieri.size || isEdit) payload['mestiereIds'] = [...this.selectedMestieri];
    // Con le aree scelte, le province le decide il server (unione): non si mandano le singole.
    // ⭐ 06/09 (regola utente): aree E province a mano viaggiano insieme; le province effettive sono l'unione.
    if (this.selectedAree.size) payload['areaIds'] = [...this.selectedAree];
    else if (isEdit) payload['areaIds'] = [];
    if (isEdit) payload['provinceIds'] = [...this.selectedProvinces];
    // ⭐ 06/09 sera: l'area di consegna viaggia solo con «Consegna da Partner»; spento = nessuna.
    if (m.autoDeliveredByPartner) payload['consegnaProvince'] = this.consegna.map((r) => ({ provinceId: r.provinceId, minimoOrdine: r.minimoOrdine === null || (r.minimoOrdine as unknown) === '' ? null : Number(r.minimoOrdine), raggioKm: r.raggioKm === null || (r.raggioKm as unknown) === '' ? null : Number(r.raggioKm) }));
    else if (isEdit) payload['consegnaProvince'] = [];

    const addrs = m.isMultiPickup
      ? this.pickupAddresses.map((a) => a.trim()).filter(Boolean)
      : [];
    if (addrs.length || isEdit) payload['pickupAddresses'] = addrs;

    const services = this.serviceRows
      .filter((r) => r.serviceTypeId && r.price != null)
      .map((r) => ({
        serviceTypeId: r.serviceTypeId,
        price: Number(r.price),
        // ⚠️ 02/09: km inclusi ed € fuori città NON viaggiano più per
        // servizio — valgono quelli a livello partner (i campi qui sotto).
        // Le righe si ricreano al salvataggio: eventuali valori vecchi per
        // servizio si spengono da soli (misurato: erano 2 su 531).
        extraKmPrice: r.extraKmPrice != null ? Number(r.extraKmPrice) : undefined,
      }));
    if (services.length || isEdit) payload['services'] = services;

    // Orari: giorni chiusi o con almeno un orario. In modifica invio sempre
    // (anche vuoto) così eliminare tutti gli orari li cancella davvero.
    const openingHours = this.openingHoursRows
      .filter((r) => r.closed || r.openTime || r.closeTime)
      .map((r) => ({
        dayOfWeek: r.dayOfWeek,
        closed: r.closed,
        openTime: r.closed ? undefined : (r.openTime || undefined),
        closeTime: r.closed ? undefined : (r.closeTime || undefined),
      }));
    if (openingHours.length || isEdit) payload['openingHours'] = openingHours;

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/partners/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/partners`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/partners', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/partners']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('partnerForm.errors.createFailed'));
      },
    });
  }
}
