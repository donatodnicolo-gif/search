import { ConfermaComponent } from '../shared/conferma.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { avviaAutoAggiornamento } from '../core/auto-aggiornamento';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { DELIVERY_CLOSED_STATUSES, DELIVERY_STATUS_LABELS, Delivery, Province, ValetRef } from '../core/models';
import { detectProvince } from '../core/province.util';
import { DeliveryMapComponent } from './delivery-map.component';

/** Icona per tipo di servizio (stroke 24x24, stile shell). */
const SERVICE_ICONS: Record<string, string> = {
  PREZZO_FISSO: '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M4 11h16M12 7v13M8 7l1.5-3h5L16 7"/>',
  A_ORA: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  VENDITA: '<path d="M4 5h2l2.2 10.5a1.5 1.5 0 0 0 1.47 1.2h6.9a1.5 1.5 0 0 0 1.45-1.1L20 8H7"/><circle cx="10.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/>',
  MAGAZZINO: '<path d="M5 9.5 6.2 4h11.6L19 9.5M5 9.5v9A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-9M5 9.5h14M10 20v-5h4v5"/>',
  CORPORATE: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>',
};

/** Un ordine smistato in attesa della risposta del partner (vendita «proposta»). */
interface PropostaVendita {
  id: string;
  status: string;
  externalOrderNumber?: string | null;
  productName?: string | null;
  variantName?: string | null;
  product?: { name?: string | null } | null;
  province?: { name?: string | null } | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  recipientAddress?: string | null;
  deliveryDate?: string | null;
}

@Component({
  selector: 'app-deliveries-list',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, TranslatePipe, DeliveryMapComponent, ConfermaComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'deliveries.title' | translate }}</h1>
        <p class="page-caption">{{ 'deliveries.caption' | translate }}</p>
      </div>
      <div class="filters">
        <!-- Attive / Storico. Nell'archivio importato l'89% delle consegne è
             chiusa (55.060 su 61.836): tenerle insieme rende la lista di lavoro
             illeggibile. -->
        <div class="quick-tabs vista">
          <button
            type="button"
            class="quick-tab"
            [class.active]="vista === 'attive'"
            (click)="cambiaVista('attive')"
          >{{ 'deliveries.view.active' | translate }}</button>
          <button
            type="button"
            class="quick-tab"
            [class.active]="vista === 'storico'"
            (click)="cambiaVista('storico')"
          >{{ 'deliveries.view.history' | translate }}</button>
          <!-- ⚠️ «Tutte» c'è perché arrivando dalla scheda di un partner né
               «attive» né «storico» rispondono alla domanda («tutto quello che
               ha chiesto»). Senza una linguetta accesa la pagina sembrerebbe
               rotta: una vista deve sempre dirsi. -->
          <button
            type="button"
            class="quick-tab"
            [class.active]="vista === 'tutte'"
            (click)="cambiaVista('tutte')"
          >{{ 'deliveries.view.allStates' | translate }}</button>
        </div>
        <!-- La ricerca sta in PRIMA riga anche su mobile (Libro §8 punto 1). -->
        <input
          class="field cerca"
          name="q"
          [attr.placeholder]="'common.search' | translate"
          [ngModel]="query"
          (ngModelChange)="onSearch($event)"
        />
        <!-- «Filtri (N)» (Libro §8 v1.2, verdetto del custode 31/08): sotto
             gli 800px l'eccedenza vive in un pannello richiudibile col
             conteggio; dal desktop il pannello è display:contents e tutto
             resta visibile come prima. -->
        <button type="button" class="quick-tab filtri-toggle" [class.active]="filtriAperti()"
                [attr.aria-expanded]="filtriAperti()" (click)="filtriAperti.set(!filtriAperti())">
          {{ 'filters.title' | translate }}@if (filtriAttivi() > 0) { ({{ filtriAttivi() }}) }
        </button>
        @if (filtriAttivi() > 0) {
          <button type="button" class="quick-tab filtri-azzera" (click)="azzeraFiltri()">
            {{ 'filters.clear' | translate }}
          </button>
        }
        <div class="pannello-filtri" [class.aperto]="filtriAperti()">
        @if (partnerFiltro()) {
          <!-- ⚠️ Un elenco ridotto deve dire da COSA (Libro §5): senza questo
               chip la pagina sembrerebbe avere pochissime consegne. -->
          <button type="button" class="chip-filtro" (click)="togliFiltroPartner()"
                  [title]="'deliveries.partnerFilter.remove' | translate">
            {{ 'deliveries.partnerFilter.label' | translate:{ nome: partnerNome() ?? '…' } }}
            <span class="x" aria-hidden="true">×</span>
          </button>
        }
        <select class="field" [(ngModel)]="statusFilter" (ngModelChange)="reload()">
          <option value="">{{ 'deliveries.allStatuses' | translate }}</option>
          @for (key of statusKeys; track key) {
            <option [value]="key">{{ 'status.delivery.' + key | translate }}</option>
          }
        </select>
        <!-- Scelte rapide: con 61.836 consegne in archivio, aprire la pagina
             senza filtro significa impaginare tutto lo storico. -->
        <div class="quick-tabs">
          <button
            type="button"
            class="quick-tab"
            [class.active]="dateFilter === oggi()"
            (click)="vaiA(oggi())"
          >{{ 'deliveries.quick.today' | translate }}</button>
          <button
            type="button"
            class="quick-tab"
            [class.active]="dateFilter === domani()"
            (click)="vaiA(domani())"
          >{{ 'deliveries.quick.tomorrow' | translate }}</button>
          <button
            type="button"
            class="quick-tab"
            [class.active]="!dateFilter"
            (click)="vaiA('')"
          >{{ 'deliveries.quick.all' | translate }}</button>
        </div>
        <!-- TEAM LEADER (02/09, regola utente): un filtro veloce «Solo io» /
             «Tutte» — di mestiere vede tutto il perimetro, ma per lavorare
             gli serve anche il SUO giro a colpo d'occhio. -->
        @if (isTeamLeaderRuolo()) {
          <div class="quick-tabs">
            <button type="button" class="quick-tab" [class.active]="filtroTL() === 'tutte'" (click)="setFiltroTL('tutte')">
              {{ 'deliveries.tl.tutte' | translate }}
            </button>
            <button type="button" class="quick-tab" [class.active]="filtroTL() === 'mie'" (click)="setFiltroTL('mie')">
              {{ 'deliveries.tl.soloIo' | translate }}
            </button>
          </div>
        }
        <!-- Le 4 scorciatoie canoniche di periodo (Libro v1.9 §8-bis), accanto
             a Oggi/Domani/Tutte: riempiono il Dal–Al qui sotto, che resta la
             via avanzata per le date libere. «Tutte» è l'azzeramento. -->
        <div class="quick-tabs">
          @for (p of PERIODI; track p) {
            <button
              type="button"
              class="quick-tab"
              [class.active]="periodoAttivo(p)"
              (click)="vaiAPeriodo(p)"
            >{{ 'deliveries.quick.' + p | translate }}</button>
          }
        </div>
        <div class="intervallo">
          <label class="dal"><span>{{ 'deliveries.filter.from' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="dateFilter" (ngModelChange)="reload()" />
          </label>
          <label class="al"><span>{{ 'deliveries.filter.to' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="dateTo" [min]="dateFilter" (ngModelChange)="reload()" />
          </label>
          @if (dateTo) {
            <button type="button" class="btn btn-secondary mini" (click)="azzeraIntervallo()">
              {{ 'deliveries.filter.clearRange' | translate }}
            </button>
          }
        </div>
        </div><!-- /pannello-filtri -->
        @if (canSeeMap()) {
          <button class="btn btn-secondary" (click)="showMap.set(!showMap())">
            {{ (showMap() ? 'deliveries.map.hide' : 'deliveries.map.show') | translate }}
          </button>
        }
        <button class="btn btn-secondary" (click)="load()">{{ 'common.refresh' | translate }}</button>
        <!-- 02/09 (regola utente): un VALET non aggiunge consegne — l'API e
             la rotta già lo escludevano, ora sparisce anche il bottone. -->
        @if (!isValetRuolo()) {
          <a routerLink="/deliveries/new" class="btn btn-primary">{{ 'deliveries.add' | translate }}</a>
        }
      </div>
    </div>

    <!-- ORDINI AUTOMATICI PROPOSTI AL PARTNER (31/08, deciso dall'utente):
         l'ordine smistato si accetta o si rifiuta QUI, dentro Consegne.
         Accettando nasce la consegna; rifiutando passa al prossimo. -->
    @if (proposte().length > 0) {
      <div class="proposte card">
        <div class="proposte-testa">
          <strong>{{ 'deliveries.proposte.title' | translate }}</strong>
          <span class="tag">{{ proposte().length }}</span>
        </div>
        <p class="muted proposte-hint">{{ 'deliveries.proposte.hint' | translate }}</p>
        @for (p of proposte(); track p.id) {
          <div class="proposta">
            <div class="proposta-info">
              <strong>@if (p.externalOrderNumber) { #{{ p.externalOrderNumber }} · }{{ p.productName || p.product?.name }}</strong>
              @if (p.variantName) { <span class="muted"> · {{ p.variantName }}</span> }
              <span class="muted riga2">
                @if (p.recipientFirstName || p.recipientLastName) { {{ p.recipientFirstName }} {{ p.recipientLastName }} — }
                {{ p.recipientAddress || p.province?.name }}
                @if (p.deliveryDate) { · {{ p.deliveryDate | date: 'dd/MM/yyyy' }} }
              </span>
            </div>
            <div class="proposta-azioni">
              <button type="button" class="btn btn-primary" [disabled]="propostaInCorso()" (click)="accettaProposta(p)">
                {{ 'deliveries.proposte.accetta' | translate }}
              </button>
              <button type="button" class="btn btn-secondary rifiuto" [disabled]="propostaInCorso()" (click)="rifiutaProposta(p)">
                {{ 'deliveries.proposte.rifiuta' | translate }}
              </button>
            </div>
          </div>
        }
        @if (propostaAvviso(); as a) { <div class="warn-card">{{ a }}</div> }
      </div>
    }

    <!-- Errore di un'azione di riga (es. cambio stato del valet rifiutato):
         senza un posto suo finirebbe solo dentro i pop-up, cioè nel nulla. -->
    @if (actionError() && !assignFor() && !additionalFor()) {
      <div class="warn-card">{{ actionError() }}</div>
    }

    @if (canSeeMap() && showMap()) {
      <app-delivery-map [status]="statusFilter" [date]="dateFilter" />
    }

    @if (loading()) {
      <div class="card state-card">{{ 'deliveries.loading' | translate }}</div>
    } @else if (error()) {
      <div class="state-card error-card">{{ error() }}</div>
    } @else if (deliveries().length === 0) {
      <div class="card state-card">
        <span class="empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8.5 5 4.5h14l2 4M3 8.5V19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8.5M3 8.5h6a3 3 0 0 0 6 0h6" />
          </svg>
        </span>
        <strong class="empty-title">{{ 'deliveries.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'deliveries.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="legend">
        <span class="legend-title">{{ 'deliveries.legend' | translate }}</span>
        @for (g of legend; track g.cls) {
          <span class="legend-item">
            <span class="status-dot" [class]="'status-dot ' + g.cls"></span>
            <span class="legend-text">
              @for (s of g.statuses; track s; let last = $last) {{{ 'status.delivery.' + s | translate }}@if (!last) {<span class="sep"> · </span>}}
            </span>
          </span>
        }
      </div>
      <!-- ⭐ PIÙ CONSEGNE INSIEME (27/08, chiesto dall'utente). La barra compare
           solo quando c'è qualcosa di scelto: un comando sempre a schermo che
           quasi sempre non serve ruba spazio alla tabella. -->
      @if (canManage() && quanteScelte() > 0) {
        <div class="card barra-massa">
          <strong class="quante">{{ 'deliveries.bulk.selected' | translate: { n: quanteScelte() } }}</strong>
          <button type="button" class="act" (click)="apriAzioneDiMassa('stato')">{{ 'deliveries.actions.status' | translate }}</button>
          <button type="button" class="act" (click)="apriAzioneDiMassa('assegna')">{{ 'deliveries.actions.assign' | translate }}</button>
          <button type="button" class="act" (click)="apriAzioneDiMassa('plus')">{{ 'deliveries.actions.additionalValet' | translate }}</button>
          @if (isAdmin()) {
            <button type="button" class="act pericolo" [disabled]="inCorsoDiMassa()" (click)="eliminaDiMassa()">{{ 'common.delete' | translate }}</button>
          }
          <button type="button" class="act chiaro" (click)="scegliTutte(false)">{{ 'deliveries.bulk.clear' | translate }}</button>
        </div>
      }
      @if (esitoDiMassa()) { <div class="card ok-card">{{ esitoDiMassa() }}</div> }

      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              @if (canManage()) {
                <!-- Sceglie tutte quelle DELLA PAGINA: selezionare righe che non
                     si vedono vorrebbe dire agire alla cieca. -->
                <th class="sel-col">
                  <input type="checkbox" [checked]="tutteScelte()"
                         [indeterminate]="quanteScelte() > 0 && !tutteScelte()"
                         (change)="scegliTutte($any($event.target).checked)"
                         [attr.aria-label]="'deliveries.bulk.selectAll' | translate" />
                </th>
              }
              <th class="st-col sortable" (click)="sortBy('status')">
                {{ 'deliveries.col.status' | translate }}<span class="sort-ind">{{ sortIndicator('status') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('code')">#<span class="sort-ind">{{ sortIndicator('code') }}</span></th>
              <th class="sortable" (click)="sortBy('date')">
                {{ 'deliveries.col.date' | translate }}<span class="sort-ind">{{ sortIndicator('date') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('serviceType.name')">
                {{ 'deliveries.col.service' | translate }}<span class="sort-ind">{{ sortIndicator('serviceType.name') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('partner.insegna')">
                {{ 'deliveries.col.partner' | translate }}<span class="sort-ind">{{ sortIndicator('partner.insegna') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('recipientLastName')">
                {{ 'deliveries.col.recipient' | translate }}<span class="sort-ind">{{ sortIndicator('recipientLastName') }}</span>
              </th>
              <th>{{ 'deliveries.col.address' | translate }}</th>
              <!-- Indirizzo di RITIRO, visibile a TUTTI (31/08): è il punto di
                   partenza, non un dato del cliente. -->
              <th>{{ 'deliveries.col.pickupAddress' | translate }}</th>
              <th class="sortable" (click)="sortBy('deliveryTimeFrom')">
                {{ 'deliveries.col.delivery' | translate }}<span class="sort-ind">{{ sortIndicator('deliveryTimeFrom') }}</span>
              </th>
              <th class="sortable" (click)="sortBy('pickupTimeFrom')">
                {{ 'deliveries.col.pickup' | translate }}<span class="sort-ind">{{ sortIndicator('pickupTimeFrom') }}</span>
              </th>
              <th>{{ 'deliveries.col.valet' | translate }}</th>
              <th class="num sortable" (click)="sortBy('price')">
                {{ (isValetRuolo() ? 'deliveries.col.paga' : 'deliveries.col.price') | translate }}<span class="sort-ind">{{ sortIndicator('price') }}</span>
              </th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (d of deliveries(); track d.id) {
              <tr
                class="row-link"
                [attr.tabindex]="canDetails() ? 0 : null"
                (click)="openDetail(d)"
                (keydown.enter)="openDetail(d)"
                [class.scelta]="selezionata(d.id)"
              >
                @if (canManage()) {
                  <td class="sel-col" (click)="$event.stopPropagation()">
                    <input type="checkbox" [checked]="selezionata(d.id)"
                           (change)="scegli(d.id, $any($event.target).checked)"
                           [attr.aria-label]="'deliveries.bulk.selectOne' | translate" />
                  </td>
                }
                <td class="st-col">
                  <!-- Clic sul pallino = cambio stato rapido, senza entrare in
                       modifica. Si ferma la propagazione perché la riga apre il
                       dettaglio. -->
                  <button
                    type="button"
                    class="status-dot-btn"
                    [class.cliccabile]="canManage()"
                    (click)="canManage() ? apriStato(d, $event) : null"
                    [attr.title]="
                      (canManage() ? 'deliveries.status.change' : 'status.delivery.' + d.status) | translate
                    "
                  >
                    <span class="status-dot" [class]="'status-dot s-' + d.status"></span>
                    <!-- ⚠️ IL NOME DELLO STATO, ma solo sotto gli 800px. Su un
                         telefono non c'e' hover, quindi il title qui sopra non
                         appare mai e la scheda mostrava una riga «Stato» con un
                         puntino di 10px e nient'altro. Il design system chiede
                         «pillola con dot E TESTO». Su desktop resta nascosto:
                         li' c'e' la legenda, e la tabella e' gia' troppo larga. -->
                    <span class="st-testo">{{ 'status.delivery.' + d.status | translate }}</span>
                  </button>
                </td>
                <td class="mono">{{ d.code }}
                  @if (d.deliveryRuleId) {
                    <span class="regola-badge" [title]="(d.deliveryRule?.name || '') + ' — ' + ('deliveries.ruleApplied' | translate)">📋</span>
                  }
                </td>
                <td>
                  {{ d.date | date: 'dd/MM/yyyy' }}
                  @if (dataSospetta(d.date)) {
                    <span class="data-sospetta" [title]="'deliveries.suspectDate' | translate">⚠</span>
                  }
                </td>
                <td>
                  <span
                    class="svc-icon"
                    [innerHTML]="serviceIcon(d.serviceType?.pricingModel)"
                    [title]="d.serviceType?.name ?? ''"
                  ></span>
                </td>
                <td class="strong">{{ d.partner?.insegna }}</td>
                <!-- Al valet il NOME del destinatario si scopre solo da «in
                     consegna» (31/08); l'indirizzo resta sempre visibile (gli
                     serve per il giro). Nome + Citofono in un'unica cella. -->
                @if (isValetRuolo() && !destinatarioVisibile(d)) {
                  <td class="muted">🔒 {{ 'deliveries.recipientHidden' | translate }}</td>
                } @else {
                  <td>{{ d.recipientFirstName }} {{ d.recipientLastName }}@if (d.recipientIntercom) { <span class="muted"> · {{ d.recipientIntercom }}</span> }</td>
                }
                <td class="muted">{{ d.recipientAddress }}</td>
                <td class="muted">{{ d.pickupAddress || '—' }}</td>
                <td>
                  @if (d.deliveryTimeFrom) {
                    {{ d.deliveryTimeFrom }}@if (d.deliveryTimeTo) {–{{ d.deliveryTimeTo }}}
                    @if (d.deliveryFlexible) {
                      <span class="pill pill-flex">{{ 'common.flexible' | translate }}</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (d.pickupTimeFrom) {
                    {{ d.pickupTimeFrom }}–{{ d.pickupTimeTo }}
                    @if (d.pickupFlexible) {
                      <span class="pill pill-flex">{{ 'common.flexible' | translate }}</span>
                    }
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
                <td>
                  @if (d.valet) {
                    {{ d.valet.firstName }} {{ d.valet.lastName }}
                  } @else {
                    <span class="muted">{{ 'common.notAssigned' | translate }}</span>
                  }
                </td>
                <td class="num strong">
                  <!-- Al VALET la colonna è la SUA PAGA (02/09, regola utente):
                       scritta o dal listino, e SOLO sulle sue consegne — sulle
                       altre (perimetro del team leader) resta il trattino. -->
                  @if (isValetRuolo()) {
                    {{ pagaRiga(d) != null ? (pagaRiga(d) + ' €') : '—' }}
                  } @else {
                    {{ d.price != null ? (d.price + ' €') : '—' }}
                  }
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  @if (canEdit(d)) {
                    <a class="act" [routerLink]="['/deliveries', d.id, 'edit']" target="_blank" rel="noopener">{{ 'deliveries.actions.edit' | translate }}</a>
                  }
                  <!-- Assegna: anche al team leader (nel suo perimetro) — ma
                       NON sullo Storico (02/09, regola utente): una consegna
                       chiusa è storia, il valet non si cambia più da qui. -->
                  @if (canAssign() && !canManage() && !consegnaChiusa(d)) {
                    <button type="button" class="act" (click)="openAssign(d)">{{ 'deliveries.actions.assign' | translate }}</button>
                  }
                  @if (canManage()) {
                    <button type="button" class="act" (click)="openAssign(d)">{{ 'deliveries.actions.assign' | translate }}</button>
                    <button type="button" class="act" (click)="openMonitor(d)">{{ 'deliveries.actions.monitor' | translate }}</button>
                    <button type="button" class="act" (click)="openAdditional(d)">{{ 'deliveries.actions.additionalValet' | translate }}</button>
                  }
                  <!-- I bottoni del VALET anche IN LISTA (31/08): il ritiro
                       parte da qui; la chiusura apre il dettaglio col pop-up
                       giusto già aperto (firma/DDT o motivo). -->
                  @if (puoLavorare(d)) {
                    <!-- Consegnata/Non consegnata solo dopo «in consegna» (31/08). -->
                    @if (d.status !== 'in_delivery') {
                      <button type="button" class="act primary" [disabled]="valetStatoInCorso() === d.id" (click)="valetInConsegna(d)">
                        {{ 'deliveryDetail.valet.inDelivery' | translate }}
                      </button>
                    } @else {
                      <button type="button" class="act ok" (click)="valetChiudi(d, 'delivered')">
                        {{ 'deliveryDetail.valet.delivered' | translate }}
                      </button>
                      <button type="button" class="act ko" (click)="valetChiudi(d, 'not_delivered')">
                        {{ 'deliveryDetail.valet.notDelivered' | translate }}
                      </button>
                    }
                  }
                  <!-- VENDITA (02/09, regola utente): il partner risponde QUI.
                       Accetta = il giro non cambia (si spegne solo il bottone);
                       Rifiuta = Storico come «Non accettata» e l'ordine torna
                       all'ufficio in «Da gestire». -->
                  @if (puoRispondereVendita(d)) {
                    <button type="button" class="act ok" [disabled]="venditaRispostaInCorso() === d.id" (click)="accettaVendita(d)">
                      {{ 'deliveries.vendita.accetta' | translate }}
                    </button>
                    <button type="button" class="act ko" [disabled]="venditaRispostaInCorso() === d.id" (click)="rifiutaVendita(d)">
                      {{ 'deliveries.vendita.rifiuta' | translate }}
                    </button>
                  }
                  <!-- ANNULLA del partner (02/09, regola utente, #100854):
                       ROSSA (da gestire) = annullata subito, in Storico;
                       GIALLA (in gestione) = «cancellazione richiesta»,
                       decide l'ufficio. Vendite escluse: hanno Rifiuta. -->
                  @if (puoAnnullare(d)) {
                    <button type="button" class="act ko" [disabled]="annullaInCorso() === d.id" (click)="chiediAnnulla(d)">
                      {{ 'deliveries.annulla.bottone' | translate }}
                    </button>
                  }
                  <!-- Su ogni consegna EFFETTUATA il valet può chiedere un
                       rimborso o aprire un reclamo (31/08) — vanno in Segnalazioni. -->
                  @if (isValetRuolo() && consegnaEffettuata(d)) {
                    <button type="button" class="act" (click)="apriSegnalazione('rimborso', d)">
                      {{ 'deliveryDetail.segnal.rimborso' | translate }}
                    </button>
                    <button type="button" class="act" (click)="apriSegnalazione('reclamo', d)">
                      {{ 'deliveryDetail.segnal.reclamo' | translate }}
                    </button>
                  }
                  <!-- «Già inviato» (02/09, regola utente): anche in TABELLA
                       si vede se reclamo/rimborso è già partito. -->
                  @for (s of richiesteDi(d); track $index) {
                    <span class="seg-badge" [title]="('segnalazioni.stato.' + s.stato) | translate">
                      ✓ {{ 'segnalazioni.tipo.' + s.tipo | translate }}
                    </span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Paginazione server-side -->
      <div class="pager">
        <button type="button" class="act" [disabled]="page() <= 1" (click)="goTo(page() - 1)">‹</button>
        <span class="pager-info">{{ 'list.pageOf' | translate: { page: page(), pages: totalPages() } }}</span>
        <button type="button" class="act" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">›</button>
        <select class="field pager-size" [ngModel]="pageSize" (ngModelChange)="changePageSize($event)" name="pageSize">
          @for (s of pageSizes; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="pager-info">{{ 'list.perPage' | translate }} · {{ total() }}</span>
      </div>
    }

    <!-- Pop-up ASSEGNA: valet con la provincia della consegna abilitata -->
    @if (assignFor(); as d) {
      <div class="overlay" (click)="assignFor.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" (click)="assignFor.set(null)" [attr.aria-label]="'common.close' | translate">×</button>
        <h2>{{ 'deliveries.assign.title' | translate }}</h2>
        <p class="modal-sub">
          {{ 'deliveries.assign.forDelivery' | translate: { code: d.code } }}
          @if (assignProvince(); as p) {
            <span class="tag">{{ p.code }}</span>
          } @else {
            <span class="tag warn">{{ 'deliveries.assign.noProvince' | translate }}</span>
          }
        </p>
        @if (actionError()) { <div class="modal-err">{{ actionError() }}</div> }
        @if (assignValets().length === 0) {
          <p class="muted">{{ 'deliveries.assign.noValets' | translate }}</p>
        } @else {
          <ul class="valet-list">
            @for (v of assignValets(); track v.id) {
              <li>
                <span>{{ v.lastName }} {{ v.firstName }}</span>
                <button type="button" class="act" [disabled]="salvandoAssegna()" (click)="assign(v.id)">
                  {{ (salvandoAssegna() ? 'common.saving' : 'deliveries.assign.choose') | translate }}
                </button>
              </li>
            }
          </ul>
        }
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" (click)="assignFor.set(null)">{{ 'common.cancel' | translate }}</button>
        </div>
      </div>
    }

    <!-- Pop-up CAMBIO STATO: dal pallino della lista, senza aprire la modifica -->
    @if (statoFor(); as d) {
      <div class="overlay" (click)="statoFor.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" (click)="statoFor.set(null)" [attr.aria-label]="'common.close' | translate">×</button>
        <h2>{{ 'deliveries.status.title' | translate }}</h2>
        <p class="modal-sub">
          {{ 'deliveries.assign.forDelivery' | translate: { code: d.code } }}
          · <span class="tag">{{ 'status.delivery.' + d.status | translate }}</span>
        </p>
        @if (actionError()) { <div class="modal-err">{{ actionError() }}</div> }
        <ul class="valet-list">
          @for (s of statusKeys; track s) {
            <li>
              <span>
                <span class="status-dot" [class]="'status-dot s-' + s"></span>
                {{ 'status.delivery.' + s | translate }}
              </span>
              @if (s === d.status) {
                <span class="muted">{{ 'deliveries.status.current' | translate }}</span>
              } @else {
                <button type="button" class="act" [disabled]="salvandoStato()" (click)="cambiaStato(s)">
                  {{ 'deliveries.status.set' | translate }}
                </button>
              }
            </li>
          }
        </ul>
      </div>
    }

    <!-- Pop-up ADDITIONAL VALET: plus/minus immediato sulla paga del valet -->
    @if (additionalFor(); as d) {
      <div class="overlay" (click)="additionalFor.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" (click)="additionalFor.set(null)" [attr.aria-label]="'common.close' | translate">×</button>
        <h2>{{ 'deliveries.additional.title' | translate }}</h2>
        <p class="modal-sub">{{ 'deliveries.additional.hint' | translate: { code: d.code } }}</p>
        @if (actionError()) { <div class="modal-err">{{ actionError() }}</div> }
        <label class="fld">
          <span>{{ 'deliveries.additional.amount' | translate }}</span>
          <input class="field num" type="number" step="0.01" [(ngModel)]="additionalValue" name="additionalValue" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" (click)="additionalFor.set(null)">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn btn-primary" [disabled]="additionalValue == null" (click)="saveAdditional()">{{ 'common.save' | translate }}</button>
        </div>
      </div>
    }

    <!-- ⭐ AZIONI SU PIÙ CONSEGNE INSIEME -->
    @if (azioneDiMassa(); as quale) {
      <div class="overlay" (click)="azioneDiMassa.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" (click)="azioneDiMassa.set(null)" [attr.aria-label]="'common.close' | translate">×</button>
        <h2>{{ 'deliveries.bulk.title' | translate: { n: quanteScelte() } }}</h2>
        @if (actionError()) { <div class="modal-err">{{ actionError() }}</div> }

        @if (quale === 'stato') {
          <p class="modal-sub">{{ 'deliveries.bulk.statusHint' | translate }}</p>
          <ul class="valet-list">
            @for (s of statusKeys; track s) {
              <li>
                <span><span class="status-dot" [class]="'status-dot s-' + s"></span>{{ 'status.delivery.' + s | translate }}</span>
                <button type="button" class="act" [disabled]="inCorsoDiMassa()" (click)="statoDiMassa(s)">
                  {{ 'deliveries.status.set' | translate }}
                </button>
              </li>
            }
          </ul>
        } @else if (quale === 'assegna') {
          @if (!assignValetsDiMassa().length) {
            <!-- ⚠️ Nessun valet copre TUTTE le consegne scelte: lo si dice,
                 invece di offrire una lista che andrebbe bene solo per alcune. -->
            <p class="modal-sub warn">{{ 'deliveries.bulk.noCommonValet' | translate }}</p>
          } @else {
            <p class="modal-sub">{{ 'deliveries.bulk.assignHint' | translate: { n: assignValetsDiMassa().length } }}</p>
            <ul class="valet-list">
              @for (v of assignValetsDiMassa(); track v.id) {
                <li>
                  <span>{{ v.lastName }} {{ v.firstName }}</span>
                  <button type="button" class="act" [disabled]="inCorsoDiMassa()" (click)="assegnaDiMassa(v.id)">
                    {{ (inCorsoDiMassa() ? 'common.saving' : 'deliveries.assign.choose') | translate }}
                  </button>
                </li>
              }
            </ul>
          }
        } @else {
          <p class="modal-sub">{{ 'deliveries.bulk.plusHint' | translate }}</p>
          <label class="fld">
            <span>{{ 'deliveries.additional.amount' | translate }}</span>
            <input class="field num" type="number" step="0.01" [(ngModel)]="plusDiMassaValore" name="plusDiMassaValore" />
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="azioneDiMassa.set(null)">{{ 'common.cancel' | translate }}</button>
            <button type="button" class="btn btn-primary" [disabled]="plusDiMassaValore == null || inCorsoDiMassa()" (click)="salvaPlusDiMassa()">{{ 'common.save' | translate }}</button>
          </div>
        }
      </div>
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    [conMotivo]="c.conMotivo ?? false" [motivoLabel]="c.motivoLabel ?? ''"
                    (confermato)="eseguiConferma($event)" (annullato)="confermaPendente.set(null)" />
    }

    <!-- RIMBORSO / RECLAMO del valet su una consegna effettuata → Segnalazioni. -->
    @if (segnalPer(); as sp) {
      <div class="overlay" (click)="chiudiSegnalazione()"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" (click)="chiudiSegnalazione()" [attr.aria-label]="'common.close' | translate">×</button>
        <h2>{{ 'deliveryDetail.segnal.' + sp.tipo + 'Title' | translate: { code: sp.d.code } }}</h2>
        @if (sp.tipo === 'rimborso') {
          <label class="fld"><span>{{ 'deliveryDetail.segnal.importo' | translate }}</span>
            <input class="field" inputmode="decimal" name="segImporto" [(ngModel)]="segImporto"
                   [placeholder]="'deliveryDetail.segnal.importoPh' | translate" />
          </label>
        }
        <label class="fld" style="margin-top:12px"><span>{{ 'deliveryDetail.segnal.motivo' | translate }}</span>
          <textarea class="field" rows="3" name="segMotivo" [(ngModel)]="segMotivo"
                    [placeholder]="'deliveryDetail.segnal.motivoPh' | translate"></textarea>
        </label>
        @if (segErrore()) { <div class="modal-err">{{ segErrore() }}</div> }
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" [disabled]="segInCorso()" (click)="chiudiSegnalazione()">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn btn-primary" [disabled]="segInCorso()" (click)="inviaSegnalazione(sp)">{{ 'deliveryDetail.segnal.invia' | translate }}</button>
        </div>
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
        flex-wrap: wrap;
      }
      /* Scelte rapide della data: segmenti a pillola, stile design system. */
      .quick-tabs {
        display: inline-flex;
        background: var(--surface-sunken, #ececef);
        border-radius: 999px;
        padding: 2px;
        gap: 2px;
      }
      /* Chip del filtro partner: si legge come un filtro attivo, e la × dice
         che si toglie. */
      .chip-filtro { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--separator);
        background: var(--fill); color: var(--text); border-radius: 980px; padding: 5px 10px;
        font-size: 12.5px; font-weight: 550; cursor: pointer; }
      .chip-filtro .x { font-size: 15px; line-height: 1; color: var(--text-secondary); }
      .chip-filtro:hover .x { color: var(--red, #d70015); }
      .quick-tabs.vista { background: var(--surface-sunken, #e4e4e8); }
      .intervallo { display: flex; align-items: flex-end; gap: 8px; }
      .intervallo label { display: flex; flex-direction: column; gap: 3px; }
      .intervallo label span { font-size: 11px; color: var(--text-tertiary); padding-left: 2px; }
      .intervallo .btn.mini { padding: 6px 12px; font-size: 13px; }
      .quick-tab {
        border: 0;
        background: transparent;
        border-radius: 999px;
        padding: 6px 14px;
        font: inherit;
        font-size: 13px;
        color: var(--text-secondary);
        cursor: pointer;
        white-space: nowrap;
      }
      .quick-tab:hover { color: var(--text-primary); }
      .quick-tab.active {
        background: var(--surface, #fff);
        color: var(--text-primary);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
        font-weight: 600;
      }
      /* Avviso su una data fuori dalla vita dell'azienda (errori del legacy). */
      .data-sospetta {
        margin-left: 6px;
        color: var(--gold); /* era #b8863e: cifre invertite, l.oro e. #b8963e */
        cursor: help;
      }
      /* ============================================================
         «FILTRI (N)» — Libro §8 (verdetto del custode 31/08/2026).
         Dal desktop il pannello NON esiste come scatola (display:contents):
         tutto sta nel flex come sempre, e il bottone-toggle è nascosto.
         Sotto gli 800px (la soglia UNICA della piattaforma, quella delle
         tabelle-a-schede) il pannello si chiude dietro il conteggio.
         Misura del Libro §8.1: a 375×812 la prima scheda dell'elenco deve
         comparire nella prima schermata — prima i filtri costavano ~450px.
         ============================================================ */
      .pannello-filtri { display: contents; }
      .filtri-toggle, .filtri-azzera { display: none; }
      @media (max-width: 800px) {
        .page-header { align-items: stretch; }
        .filters { width: 100%; }
        .filters > * { min-width: 0; }
        .filters .cerca { flex: 1 1 160px; }
        .filtri-toggle, .filtri-azzera {
          display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid var(--hairline-strong); background: var(--surface);
        }
        .filtri-toggle.active { background: var(--ink); color: #fff; border-color: var(--ink); }
        .pannello-filtri {
          display: none;
          width: 100%;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
          border: 1px solid var(--hairline);
          border-radius: 12px;
          background: var(--surface);
        }
        .pannello-filtri.aperto { display: flex; }
        /* Le scorciatoie stanno su UNA riga che scorre (Libro v1.3). */
        .pannello-filtri .quick-tabs { display: flex; flex-wrap: nowrap; overflow-x: auto;
          -webkit-overflow-scrolling: touch; }
        .pannello-filtri .quick-tabs > * { flex: 0 0 auto; }
        /* Dal/Al: era QUI la sovrapposizione con «Cerca» — i due input data
           non scendono sotto la larghezza intrinseca e sbordavano sul vicino.
           Nel pannello vanno a capo e prendono tutta la riga. */
        .pannello-filtri .intervallo { flex-wrap: wrap; }
        .pannello-filtri .intervallo label { flex: 1 1 100%; }
        .pannello-filtri .intervallo input { width: 100%; min-width: 0; }
        .filters .btn { justify-content: center; text-align: center; }
        /* La LEGENDA sotto gli 800 non si monta (proposta §8-ter registrata):
           ogni scheda porta già il NOME dello stato accanto al pallino. */
        .legend { display: none; }
        /* La barra di massa non deve infilarsi SOTTO la topbar sticky (56px). */
        .barra-massa { top: 56px; }
        /* Audit 31/08: in scheda «Consegnata» e «Non consegnata» andavano a
           capo a 4px l'una dall'altra — due esiti OPPOSTI sotto lo stesso
           pollice. Respiro di 10px. */
        /* In scheda mobile le celle ereditano justify-content:space-between
           (styles.css), che sparpagliava i bottoni azione ai lati opposti
           (31/08, custode). Li si tiene VICINI a sinistra, gap coerente. */
        .actions-cell { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
          justify-content: flex-start !important; }
      }
      /* ⚠️ 800px, non 640: e' la soglia a cui le tabelle diventano SCHEDE
         (styles.css) ed e' li' che l'intestazione di colonna sparisce. Sotto,
         il pallino da solo non dice piu' niente, quindi esce il nome. */
      @media (max-width: 800px) {
        .st-testo {
          display: inline;
          margin-left: 8px;
          font-size: 13.5px;
          color: var(--text);
          vertical-align: middle;
        }
        .status-dot-btn { line-height: normal; }
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
      /* Colonna stato: solo pallino colorato */
      .st-col {
        width: 34px;
        text-align: center;
        padding-left: 14px;
        padding-right: 6px;
      }
      .regola-badge { margin-left: 5px; font-size: 12px; cursor: help; vertical-align: middle; }
      .status-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--text-tertiary);
        flex-shrink: 0;
      }
      /* Colori allineati alla legenda dell'app reale (app.deluxy.it).
         ⚠️ DIFETTO 4/5: la FONTE UNICA di questi colori e' core/stati-consegna.ts
         (consumata da calendario e mappa). Questo blocco CSS ne e' il gemello
         per i pallini della lista: chi cambia un colore la' lo cambia anche qui,
         altrimenti la lista e la mappa tornano a divergere. */
      .status-dot.s-created { background: var(--red); }                    /* Da gestire: rosso */
      .status-dot.s-assigned { background: var(--amber); }                 /* In gestione: giallo (--amber) */
      .status-dot.s-in_preparation { background: #ff9500; }                /* In preparazione: arancione legacy (nessun token) */
      .status-dot.s-accepted { background: var(--blue); }                  /* Accettata: blu */
      .status-dot.s-in_delivery { background: var(--purple); }             /* In consegna: viola */
      .status-dot.s-cancellation_requested { background: #5ac8fa; }        /* Richiedi annullamento: azzurro legacy (nessun token) */
      .status-dot.s-delivered,
      .status-dot.s-approved { background: var(--green); }                  /* Consegnata e approvata: verde */
      .status-dot.s-delivered_time_to_approve { background: #ff9500; }      /* Ore da approvare: arancio */
      /* ⚠️⚠️ QUESTE TRE MANCAVANO, ed erano proprio le righe che l.operatore
         deve vedere per prime. Senza una regola a DUE classi vinceva la regola
         PILLOLA .s-not_delivered/.s-cancelled/.s-not_accepted piu' in basso in
         questo stesso foglio (stessa specificita', ma dopo): il pallino usciva
         rgba(215,0,21,.09), cioe' un cerchio rosso al NOVE per cento su una
         card bianca. Praticamente invisibile. E la legenda, che per quel gruppo
         usa una classe mai definita, lo disegnava GRIGIO: pallino e legenda
         dicevano due cose diverse, ed erano sbagliate tutt.e due. */
      .status-dot.s-not_delivered,
      .status-dot.s-not_accepted { background: var(--red); }                /* Fallite: rosso pieno */
      .status-dot.s-cancelled,
      .status-dot.s-invalidated,
      .status-dot.s-archived { background: var(--grey); }                   /* Annullate: grigio (--grey) */

      /* Legenda colori stato */
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 18px;
        margin-bottom: 14px;
        padding: 10px 14px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-radius: var(--radius-m);
      }
      .legend-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
      }
      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }
      .legend-text {
        font-size: 12.5px;
        color: var(--text-secondary);
      }
      .legend-text .sep { color: var(--text-tertiary); }

      /* Pop-up (Assegna / Additional valet) */
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 80;
        background: rgba(0, 0, 0, 0.32);
        -webkit-backdrop-filter: blur(2px);
        backdrop-filter: blur(2px);
      }
      /* ⚠️ LA MODALE STA DENTRO LA VIEWPORT (Libro v1.7 §9): il pannello ha
         un tetto e scorre LUI; titolo (con la ✕) e piede azioni sono sticky.
         Collaudo: a 375×812 e a 1366×768 il bottone di conferma si raggiunge
         senza scrollare la pagina. */
      .modal {
        position: fixed;
        z-index: 90;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(440px, 92vw);
        max-height: min(92dvh, calc(100dvh - 40px));
        overflow-y: auto;
        padding: 0 24px;
        box-shadow: var(--shadow-float);
      }
      /* Le finestre senza piede (es. cambio stato) chiudono con l'ultimo
         figlio: il respiro in basso lo mette lui. */
      .modal > :last-child:not(.modal-actions) {
        margin-bottom: 20px;
      }
      /* X di chiusura: le finestre si chiudevano solo dal fondo o cliccando
         fuori, e con l'elenco valet lungo il bottone Annulla restava sotto. */
      .status-dot-btn {
        border: 0;
        background: transparent;
        /* 7px di padding con margine negativo: l'area di tocco passa da 18 a
           24px — il minimo di WCAG 2.5.8 — senza spostare di un pixel il
           pallino ne' allargare la colonna. */
        padding: 7px;
        margin: -7px;
        border-radius: 999px;
        line-height: 0;
        cursor: default;
      }
      /* Il nome dello stato vive solo nella scheda mobile (vedi il template). */
      .st-testo { display: none; }
      .status-dot-btn.cliccabile { cursor: pointer; }
      .status-dot-btn.cliccabile:hover { background: var(--surface-sunken, #ececef); }
      .modal-close {
        position: sticky;
        float: right;
        top: 12px;
        margin: 0 -8px 0 0;
        z-index: 3;
        border: 0;
        background: var(--surface);
        font-size: 26px;
        line-height: 1;
        color: var(--text-tertiary);
        cursor: pointer;
        padding: 2px 8px;
        border-radius: 999px;
      }
      .modal-close:hover { background: var(--surface-sunken, #ececef); color: var(--text-primary); }
      /* Titolo sticky: in un elenco lungo la testata resta in vista insieme
         alla ✕ (Libro v1.7 §9). */
      .modal h2 {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--surface);
        margin: 0 0 4px;
        padding: 20px 30px 6px 0;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .modal-sub {
        margin: 0 0 14px;
        font-size: 13px;
        color: var(--text-tertiary);
      }
      .modal-wait {
        background: rgba(184, 150, 62, 0.1);
        border: 1px solid rgba(184, 150, 62, 0.25);
        border-radius: var(--radius-m);
        padding: 8px 12px;
        font-size: 13px;
        margin-bottom: 12px;
      }
      .modal-err {
        background: rgba(215, 0, 21, 0.06);
        border: 1px solid rgba(215, 0, 21, 0.15);
        color: var(--red);
        border-radius: var(--radius-m);
        padding: 8px 12px;
        font-size: 13px;
        margin-bottom: 12px;
      }
      /* Piede sticky in fondo al pannello scorrevole: Annulla/Salva restano
         sempre in vista anche a corpo scorrato (Libro v1.7 §9). */
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        position: sticky;
        bottom: 0;
        z-index: 2;
        background: var(--surface);
        margin-top: 18px;
        padding: 12px 0 18px;
        border-top: 1px solid var(--hairline);
      }
      .valet-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .valet-list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        border-radius: var(--radius-m);
        font-size: 13.5px;
      }
      .valet-list li:hover {
        background: var(--fill);
      }
      .tag {
        margin-left: 6px;
        font-size: 11px;
        font-weight: 600;
        background: var(--gold-soft);
        color: var(--gold-strong);
        border-radius: 980px;
        padding: 2px 8px;
      }
      /* Ordini proposti al partner: un blocco che si vede, sopra la lista. */
      .proposte { margin-bottom: 14px; padding: 14px 16px; border: 1px solid var(--gold-soft); }
      .proposte-testa { display: flex; align-items: center; gap: 6px; font-size: 15px; }
      .proposte-hint { margin: 4px 0 10px; font-size: 13px; }
      .proposta { display: flex; align-items: center; justify-content: space-between; gap: 12px;
                  padding: 10px 0; border-top: 1px solid var(--hairline); flex-wrap: wrap; }
      .proposta-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .proposta-info .riga2 { font-size: 13px; }
      .proposta-azioni { display: flex; gap: 8px; }
      .proposta-azioni .rifiuto { color: var(--red); }
      .warn-card { margin-top: 10px; background: rgba(255, 149, 0, 0.08); color: #8a5a00;
                   border-radius: 10px; padding: 10px 12px; font-size: 13px; }
      .tag.warn {
        background: rgba(255, 149, 0, 0.12);
        color: #b25000;
      }
      .fld {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .fld > span {
        font-size: 13px;
        font-weight: 550;
        color: var(--text-secondary);
      }

      /* Intestazioni ordinabili */
      th.sortable {
        cursor: pointer;
        user-select: none;
      }
      th.sortable:hover {
        color: var(--text);
      }
      .sort-ind {
        color: var(--gold-strong);
        font-weight: 700;
      }
      /* Paginazione */
      .pager {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
        justify-content: flex-end;
      }
      .pager-info {
        font-size: 12.5px;
        color: var(--text-tertiary);
      }
      .pager-size {
        width: auto;
        padding: 4px 8px;
        font-size: 12.5px;
      }

      /* La riga apre il dettaglio */
      .row-link {
        cursor: pointer;
      }
      .row-link:focus-visible {
        outline: 2px solid var(--gold-strong);
        outline-offset: -2px;
      }

      /* Selezione multipla */
      .sel-col { width: 34px; text-align: center; }
      .sel-col input { width: 16px; height: 16px; accent-color: var(--ink, #1d1d1f); cursor: pointer; }
      tr.scelta > td { background: color-mix(in srgb, var(--ink, #1d1d1f) 5%, transparent); }
      .barra-massa {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 10px 14px; margin-bottom: 12px;
        position: sticky; top: 0; z-index: 5;
      }
      .barra-massa .quante { font-size: 13.5px; margin-right: 6px; }
      .act.pericolo { color: var(--red); border-color: rgba(215, 0, 21, 0.28); }
      .act.pericolo:hover:not(:disabled) { background: rgba(215, 0, 21, 0.07); }
      .act.chiaro { margin-left: auto; color: var(--text-secondary); }
      .modal-sub.warn { color: var(--orange); }

      /* Azioni di riga */
      .actions-cell {
        white-space: nowrap;
      }
      .act {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--hairline-strong);
        background: var(--surface);
        border-radius: 980px;
        padding: 4px 11px;
        margin-right: 6px;
        font-size: 12px;
        font-weight: 550;
        font-family: inherit;
        color: var(--text);
        cursor: pointer;
        text-decoration: none;
        transition: background 0.15s var(--ease);
      }
      .act:hover:not(:disabled) {
        background: var(--fill);
      }
      /* I bottoni del valet in riga: il verde chiude bene, il rosso chiude male. */
      .act.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
      .act.ok { background: var(--green, #1f7a3d); color: #fff; border-color: transparent; }
      .act.ko { background: rgba(215, 0, 21, 0.08); color: var(--red); border-color: rgba(215, 0, 21, 0.25); }
      .seg-badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px;
        background: rgba(36, 138, 61, 0.1); color: var(--green, #248a3d); font-size: 11.5px; font-weight: 550; white-space: nowrap; }
      .act:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .svc-icon {
        display: inline-flex;
        width: 20px;
        height: 20px;
        color: var(--text-secondary);
      }
      .svc-icon :where(svg) {
        width: 100%;
        height: 100%;
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
      .s-approved {
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

  /**
   * La conferma narrativa in attesa (Libro §7): al posto dei confirm() del
   * browser. L'azione parte solo al click sul verbo.
   */
  readonly confermaPendente = signal<{
    titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary';
    conMotivo?: boolean; motivoLabel?: string; azione: (motivo: string) => void;
  } | null>(null);

  eseguiConferma(motivo: string): void {
    const c = this.confermaPendente();
    this.confermaPendente.set(null);
    c?.azione(motivo);
  }
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly iconCache = new Map<string, SafeHtml>();

  /**
   * Permessi bottoni di riga (regola di business):
   * - Admin (e Operation): tutti i bottoni.
   * - Partner: MODIFICA solo finché la consegna è "in rosso" (stato `created`)
   *   e solo se il tipo di servizio non è VENDITA.
   * - Valet: solo DETTAGLI.
   */
  private roleOf(): string | undefined {
    return this.auth.user()?.role;
  }

  /** Dettaglio: si apre cliccando la riga (nessun bottone dedicato). */
  canDetails(): boolean {
    const r = this.roleOf();
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PARTNER' || r === 'VALET';
  }

  openDetail(d: Delivery): void {
    if (!this.canDetails()) return;
    this.router.navigate(['/deliveries', d.id]);
  }

  /** Assegna / Monitorare / Additional valet: solo admin (e operation). */
  canManage(): boolean {
    const r = this.roleOf();
    return r === 'ADMIN' || r === 'OPERATION';
  }

  /** Assegnare: l'ufficio, o un valet TEAM LEADER (nel suo perimetro, che
   *  l'API verifica). 31/08. */
  canAssign(): boolean {
    return this.canManage() || (this.roleOf() === 'VALET' && this.auth.user()?.isTeamLeader === true);
  }

  /** Eliminare è dell'admin: è l'unica azione di massa che non si disfa. */
  isAdmin(): boolean {
    return this.roleOf() === 'ADMIN';
  }

  canEdit(d: Delivery): boolean {
    const r = this.roleOf();
    if (r === 'ADMIN' || r === 'OPERATION') return true;
    if (r === 'PARTNER') {
      return d.status === 'created' && d.serviceType?.pricingModel !== 'VENDITA';
    }
    return false; // Valet: solo dettagli
  }

  // ---- ASSEGNA: pop-up con i valet della provincia della consegna ----
  readonly provinces = signal<Province[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  /** Esc chiude la finestra aperta: e' la scorciatoia che tutti provano. */
  @HostListener('document:keydown.escape')
  chiudiFinestre(): void {
    this.assignFor.set(null);
    this.additionalFor.set(null);
    this.statoFor.set(null);
  }

  // ---- Cambio stato rapido dal pallino della lista ----
  readonly statoFor = signal<Delivery | null>(null);
  readonly salvandoStato = signal(false);

  /** Apre il pop-up di cambio stato senza far scattare l'apertura del dettaglio. */
  apriStato(d: Delivery, ev: Event): void {
    ev.stopPropagation();
    this.actionError.set(null);
    this.statoFor.set(d);
  }

  cambiaStato(status: string): void {
    const d = this.statoFor();
    if (!d) return;
    this.salvandoStato.set(true);
    this.actionError.set(null);
    this.http
      .patch(`${environment.apiUrl}/deliveries/${d.id}/status`, { status })
      .subscribe({
        next: () => {
          this.salvandoStato.set(false);
          this.statoFor.set(null);
          // Si ricarica: cambiando stato la consegna può uscire dalla vista
          // corrente (da "In lavorazione" allo Storico), e lasciarla a schermo
          // farebbe credere che il salvataggio non sia andato.
          this.load();
        },
        error: (err) => {
          this.salvandoStato.set(false);
          this.actionError.set(err?.error?.message ?? this.translate.instant('common.saveError'));
        },
      });
  }

  /** ⚠️ Misurato: la PATCH di assegnazione impiega ~5s e la ricarica altri ~2,5.
   *  Senza un segnale il bottone sembra non fare NIENTE per otto secondi, ed e'
   *  esattamente cosi' che e' stato segnalato («assegna non fa poi nulla»). */
  readonly salvandoAssegna = signal(false);

  readonly assignFor = signal<Delivery | null>(null);
  readonly actionError = signal<string | null>(null);

  /** Provincia dedotta dall'indirizzo della consegna aperta in "Assegna". */
  readonly assignProvince = computed(() => {
    const d = this.assignFor();
    if (!d) return null;
    // La provincia salvata vince sulla deduzione dalla stringa (bug «d'Aosta»).
    if (d.province?.code) return this.provinces().find((p) => p.code === d.province!.code) ?? { code: d.province.code, name: d.province.name } as Province;
    return detectProvince(d.recipientAddress, this.provinces());
  });

  /**
   * Chi può ricevere una consegna: valet **attivi**, non segnaposto, e con la
   * provincia di quella consegna **abilitata**.
   *
   * ⚠️ Il filtro sugli ATTIVI mancava qui — c'era solo nel dettaglio. Su 287
   * valet in archivio ne sono attivi 62: il pop-up di questa pagina ne offriva
   * anche 225 spenti, fra cui gente con cui non lavoriamo più. Assegnare a un
   * valet spento non dà errore: dà una consegna che nessuno andrà a fare.
   *
   * ⚠️ Senza provincia riconosciuta restano gli attivi: meglio una lista larga
   * che una lista vuota su un indirizzo scritto in modo insolito.
   */
  private valetAssegnabili(recipientAddress: string | null | undefined, serviceTypeId?: string | null, scope?: string | null, provinceCode?: string | null) {
    let attivi = this.valets().filter((v) => v.active !== false && v.placeholder !== true);
    // Solo chi ha il SERVIZIO della consegna nel listino (regola 31/08/2026) —
    // ma SOLO per i servizi di mestiere (scope valet/both): su un servizio del
    // lato partner (es. «Vendita Deluxy») nessun valet ha listino per
    // costruzione, e il filtro svuotava la lista (caso Salazar #100093).
    if (serviceTypeId && scope !== 'partner') {
      attivi = attivi.filter((v) =>
        (v.services ?? []).some((s) => (s.serviceTypeId ?? s.serviceType?.id) === serviceTypeId));
    }
    // La provincia SALVATA (geocodificata dal server) vince sulla deduzione dalla
    // stringa: «Piazza Duca d'Aosta» a Milano non è la provincia di Aosta.
    const code = provinceCode ?? (recipientAddress ? detectProvince(recipientAddress, this.provinces())?.code : null) ?? null;
    if (code) attivi = attivi.filter((v) => (v.provinces ?? []).some((p) => p.province?.code === code));
    // Ordine ALFABETICO PER COGNOME (regola dell'utente 31/08): la lista
    // mostrava Nome Cognome ma ordinava per cognome — sembrava a caso.
    return [...attivi].sort((a, b) =>
      (a.lastName ?? '').localeCompare(b.lastName ?? '', 'it', { sensitivity: 'base' })
      || (a.firstName ?? '').localeCompare(b.firstName ?? '', 'it', { sensitivity: 'base' }));
  }

  readonly assignValets = computed(() =>
    this.valetAssegnabili(this.assignFor()?.recipientAddress, this.assignFor()?.serviceType?.id, this.assignFor()?.serviceType?.scope, this.assignFor()?.province?.code));

  /**
   * Per l'assegnazione DI MASSA: i valet buoni per TUTTE le consegne scelte.
   *
   * ⚠️ Si intersecano le province, non si prende quella della prima: scegliere
   * venti consegne fra Milano e Roma e vedersi offrire i valet di Milano
   * vorrebbe dire assegnare a chi non copre metà di quelle consegne. Se
   * l'intersezione è vuota lo dice il pannello, invece di offrire una lista
   * sbagliata.
   */
  readonly assignValetsDiMassa = computed(() => {
    const scelte = this.deliveries().filter((d) => this.selezione().has(d.id));
    if (!scelte.length) return [];
    let insieme: ValetRef[] | null = null;
    for (const d of scelte) {
      // Provincia E servizio di OGNI consegna scelta: chi resta va bene per tutte.
      const buoni = this.valetAssegnabili(d.recipientAddress, d.serviceType?.id, d.serviceType?.scope, d.province?.code);
      const ids = new Set(buoni.map((v) => v.id));
      insieme = insieme === null ? buoni : insieme.filter((v) => ids.has(v.id));
      if (!insieme.length) return [];
    }
    return insieme ?? [];
  });

  openAssign(d: Delivery): void {
    this.actionError.set(null);
    this.caricaRiferimenti();
    this.assignFor.set(d);
  }

  assign(valetId: string): void {
    const d = this.assignFor();
    if (!d) return;
    this.http
      .patch(`${environment.apiUrl}/deliveries/${d.id}/assign`, { valetId })
      .subscribe({
        next: () => { this.assignFor.set(null); this.load(); },
        error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
      });
  }

  // ---- ADDITIONAL VALET: plus/minus immediato sulla paga del valet ----
  readonly additionalFor = signal<Delivery | null>(null);
  additionalValue: number | null = null;

  openAdditional(d: Delivery): void {
    this.actionError.set(null);
    this.additionalValue = null;
    this.additionalFor.set(d);
  }

  saveAdditional(): void {
    const d = this.additionalFor();
    if (!d || this.additionalValue == null) return;
    this.http
      .put(`${environment.apiUrl}/deliveries/${d.id}`, {
        valetAdditionalPrice: Number(this.additionalValue),
      })
      .subscribe({
        next: () => { this.additionalFor.set(null); this.load(); },
        error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
      });
  }

  // ---- MONITORARE: apre il link pubblico di monitoraggio ----
  openMonitor(d: Delivery): void {
    this.actionError.set(null);
    this.http
      .get<{ token: string }>(`${environment.apiUrl}/deliveries/${d.id}/tracking-link`)
      .subscribe({
        next: (r) => window.open(`${location.origin}/tracking/${r.token}`, '_blank'),
        error: (err) => this.actionError.set(err?.error?.message ?? 'Errore'),
      });
  }

  /** Icona del tipo di servizio (fallback: nessun tratto). */
  serviceIcon(pricingModel?: string): SafeHtml {
    const key = pricingModel ?? '-';
    let cached = this.iconCache.get(key);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SERVICE_ICONS[key] ?? ''}</svg>`,
      );
      this.iconCache.set(key, cached);
    }
    return cached;
  }

  readonly deliveries = signal<Delivery[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  statusFilter = '';
  dateFilter = '';
  /** Secondo estremo dell'intervallo. Vuoto = un giorno solo, come prima. */
  dateTo = '';
  readonly showMap = signal(false);

  /** La mappa consegne (indirizzi = dati sensibili) è solo per Admin/Operation. */
  canSeeMap(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }
  readonly statusKeys = Object.keys(DELIVERY_STATUS_LABELS);

  /**
   * Legenda: un colore per gruppo di stati.
   * Colori dei primi 6 allineati alla legenda dell'app reale
   * (Da gestire=rosso, In gestione=giallo, In preparazione=arancione,
   *  Accettata=blu, In consegna=viola, Richiedi annullamento=azzurro).
   */
  readonly legend: { cls: string; statuses: string[] }[] = [
    { cls: 's-created', statuses: ['created'] },
    { cls: 's-assigned', statuses: ['assigned'] },
    { cls: 's-in_preparation', statuses: ['in_preparation'] },
    { cls: 's-accepted', statuses: ['accepted'] },
    { cls: 's-in_delivery', statuses: ['in_delivery'] },
    { cls: 's-cancellation_requested', statuses: ['cancellation_requested'] },
    { cls: 's-delivered', statuses: ['delivered', 'approved'] },
    // ⚠️ Prima erano un gruppo solo sotto `s-archived`, una classe che non
    // esiste in nessun foglio: la pastiglia usciva grigia mentre i pallini in
    // tabella erano rossi slavati. Adesso sono due gruppi, ognuno del colore
    // che ha davvero — e un fallimento non si confonde con un annullamento.
    { cls: 's-not_delivered', statuses: ['not_delivered', 'not_accepted'] },
    { cls: 's-cancelled', statuses: ['cancelled', 'invalidated'] },
  ];

  /**
   * "Oggi" e "domani" in formato YYYY-MM-DD, calcolati NEL BROWSER.
   * ⚠️ Non si ricavano dal server: il runtime su Vercel e' UTC, e la mezzanotte
   * italiana la' sono le 22:00 del giorno prima — due ore di consegne di ogni
   * mattina finirebbero nel giorno sbagliato senza dare errore.
   */
  private giorno(scarto = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + scarto);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  oggi(): string { return this.giorno(0); }
  domani(): string { return this.giorno(1); }

  /** Scelta rapida: stringa vuota = tutte le date. */
  vaiA(data: string): void {
    this.dateFilter = data;
    // Oggi/Domani/Tutte sono giorni singoli: l'intervallo si chiude, se no
    // resterebbe appeso un «al» che mostra un periodo che nessuno ha chiesto.
    this.dateTo = '';
    this.reload();
  }

  azzeraIntervallo(): void {
    this.dateTo = '';
    this.reload();
  }

  /**
   * Le 4 scorciatoie canoniche di periodo (Libro v1.9 §8-bis). Filtrano sulla
   * DATA DELLA CONSEGNA (la stessa di Oggi/Domani e del Dal–Al): riempiono i
   * due campi dell'intervallo, che il backend già capisce — così lo stato
   * resta nell'URL con gli stessi parametri di sempre, e le date libere
   * restano l'opzione avanzata.
   *
   * Mesi di CALENDARIO, non finestre mobili: le consegne si programmano in
   * avanti, e «mese in corso» deve mostrare anche quelle di domani.
   */
  readonly PERIODI = ['month', 'lastMonth', 'quarter', 'year'] as const;

  private rangePeriodo(p: 'month' | 'lastMonth' | 'quarter' | 'year'): { da: string; a: string } {
    const ora = new Date();
    const ymd = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    // `new Date(y, m+1, 0)` è l'ultimo giorno del mese m: il «giorno zero»
    // del mese dopo. `dateTo` è incluso per tutta la giornata.
    const ultimo = (y: number, m: number) => new Date(y, m + 1, 0);
    if (p === 'month') return { da: ymd(new Date(ora.getFullYear(), ora.getMonth(), 1)), a: ymd(ultimo(ora.getFullYear(), ora.getMonth())) };
    if (p === 'lastMonth') return { da: ymd(new Date(ora.getFullYear(), ora.getMonth() - 1, 1)), a: ymd(ultimo(ora.getFullYear(), ora.getMonth() - 1)) };
    if (p === 'quarter') return { da: ymd(new Date(ora.getFullYear(), ora.getMonth() - 2, 1)), a: ymd(ultimo(ora.getFullYear(), ora.getMonth())) };
    return { da: ymd(new Date(ora.getFullYear(), 0, 1)), a: ymd(new Date(ora.getFullYear(), 11, 31)) };
  }

  /** Attiva quando i due campi dicono ESATTAMENTE quel periodo: niente stato
   *  in più da tenere allineato coi campi data. */
  periodoAttivo(p: 'month' | 'lastMonth' | 'quarter' | 'year'): boolean {
    const r = this.rangePeriodo(p);
    return this.dateFilter === r.da && this.dateTo === r.a;
  }

  vaiAPeriodo(p: 'month' | 'lastMonth' | 'quarter' | 'year'): void {
    const r = this.rangePeriodo(p);
    this.dateFilter = r.da;
    this.dateTo = r.a;
    this.reload();
  }

  /**
   * Vista corrente: consegne ancora in lavorazione oppure storico (consegnate,
   * non consegnate, annullate…). L'elenco degli stati chiusi sta nel backend,
   * in `DELIVERY_CLOSED_STATUSES`: qui si manda solo il nome della vista, così
   * le due parti non possono discordare.
   */
  vista: 'attive' | 'storico' | 'tutte' = 'attive';

  /**
   * Filtro PARTNER, che arriva solo dall'indirizzo (`?partnerId=`).
   *
   * ⚠️ Non c'è un menu a tendina apposta: si entra qui dalla scheda di un
   * partner, con «Vedi tutte». Serviva perché senza questo filtro quel bottone
   * avrebbe portato alle consegne di OGGI di TUTTI — un link che promette una
   * cosa e ne mostra un'altra.
   *
   * ⚠️ Il nome del partner si tiene per SCRIVERLO in pagina: una lista ridotta
   * senza dire perché è la cosa che fa dubitare dei numeri (Libro §5).
   */
  readonly partnerFiltro = signal<string | null>(null);
  readonly partnerNome = signal<string | null>(null);

  cambiaVista(v: 'attive' | 'storico' | 'tutte'): void {
    if (this.vista === v) return;
    this.vista = v;
    // Le due viste storiche partono da OGGI: cambiando tab si resta sullo
    // stesso giorno, e per guardare indietro ci sono il tab "Tutte" (dei
    // giorni) e il calendario.
    // ⚠️ Con «tutti gli stati» — e sempre col filtro partner addosso — il
    // giorno NON si rimette: si e' li' per guardare una storia, e «oggi»
    // svuoterebbe la pagina nell'istante in cui la si apre.
    this.dateFilter = v === 'tutte' || this.partnerFiltro() ? '' : this.oggi();
    this.statusFilter = '';
    this.reload();
  }

  /**
   * Una data e' "impossibile" se cade fuori dalla vita dell'azienda.
   * Nell'archivio importato ce ne sono 98 (anni 202, 206, 2001, 2004, 2012,
   * 2028, 2029, 2926): sono errori di battitura sull'anno GIA' PRESENTI nel
   * database originario, non introdotti dall'import. Si segnalano invece di
   * correggerle a indovinare.
   */
  dataSospetta(iso: string | null | undefined): boolean {
    if (!iso) return false;
    const anno = new Date(iso).getFullYear();
    return anno < 2019 || anno > new Date().getFullYear() + 1;
  }

  constructor() {
    // Filtro data preimpostato dalla query (es. "Vai al giorno" dal calendario).
    // Altrimenti si parte da OGGI: senza filtro la lista impagina tutto lo
    // storico e la pagina impiega secondi ad aprirsi.
    // ⭐ Si riprende la vista da dove si era lasciata: tornando da una consegna
    // (o col tasto indietro) i filtri arrivano nell'indirizzo, e la lista si
    // riapre sul giorno che si stava guardando invece che su oggi.
    const p = this.route.snapshot.queryParamMap;
    const qPartner = p.get('partnerId');
    if (qPartner) {
      this.partnerFiltro.set(qPartner);
      this.chiediNomePartner(qPartner);
    }
    const qDate = p.get('date');
    // ⚠️ Col filtro partner il giorno NON si mette di default: si arriva qui
    // per vedere la sua storia, e con «oggi» addosso la pagina direbbe quasi
    // sempre «nessuna consegna» a un partner che ne ha migliaia.
    // ⚠️ 02/09 (regola utente): per l'utente PARTNER il default è TUTTE le
    // sue consegne, senza il giorno addosso — stessa ragione.
    this.dateFilter = qDate ?? (qPartner || this.isPartnerRuolo() ? '' : this.oggi());
    this.dateTo = p.get('dateTo') ?? '';
    this.statusFilter = p.get('status') ?? '';
    const v = p.get('view');
    if (v === 'attive' || v === 'storico' || v === 'tutte') this.vista = v;
    // Arrivando dalla scheda di un partner senza vista dichiarata si guarda
    // TUTTO quello che ha chiesto: «attive» ne mostrerebbe una fetta.
    else if (qPartner || this.isPartnerRuolo()) this.vista = 'tutte';
    this.query = p.get('q') ?? '';
    // ⚠️ 02/09 (regola utente): il partner apre su TUTTE le consegne, e
    // l'ordine è per DATA di consegna crescente — l'orario da solo (default
    // deliveryTimeFrom) mischierebbe i giorni fra loro.
    if (this.isPartnerRuolo()) this.sort.set('date');
    const pag = Number(p.get('page'));
    if (Number.isInteger(pag) && pag > 1) this.page.set(pag);
    this.load();
    // Gli ordini smistati in attesa di risposta: solo per il PARTNER, che
    // li accetta o rifiuta da qui (deciso dall'utente il 31/08).
    if (this.roleOf() === 'PARTNER') this.caricaProposte();
    // Badge «già inviato» su reclami/rimborsi (02/09): un giro solo, le proprie.
    this.caricaSegnalazioniProprie();
    // ⭐ 04/09 (regola utente): la lista si riallinea DA SOLA ogni 30″ —
    // consegne nuove, stati cambiati, assegnazioni — senza ricaricare la
    // pagina. Silenziosa (niente rotellina, selezione e filtri restano) e
    // ferma finché un pop-up o un'azione sono in corso. Al partner porta
    // anche le proposte nuove.
    avviaAutoAggiornamento({
      ricarica: () => {
        this.load(true);
        if (this.roleOf() === 'PARTNER') this.caricaProposte();
      },
      sospeso: () => !!(this.statoFor() || this.assignFor() || this.additionalFor() || this.segnalPer()
        || this.confermaPendente() || this.azioneDiMassa() || this.inCorsoDiMassa() || this.salvandoStato()
        || this.salvandoAssegna() || this.propostaInCorso() || this.venditaRispostaInCorso()
        || this.annullaInCorso() || this.valetStatoInCorso() || this.showMap() || this.loading()),
    });
    // ⚠️ Province e valet servono SOLO dentro il pop-up "Assegna", ma venivano
    // chiesti all'apertura della pagina: misurato, /valets pesa 445 KB e
    // ritarda la lista di oltre due secondi per una finestra che quasi sempre
    // non si apre. Ora si caricano al primo bisogno (vedi openAssign).
  }

  // ==========================================================================
  // ORDINI AUTOMATICI PROPOSTI (vendite in stato «proposta») — solo PARTNER.
  // ==========================================================================
  readonly proposte = signal<PropostaVendita[]>([]);
  readonly propostaInCorso = signal(false);
  readonly propostaAvviso = signal<string | null>(null);

  private caricaProposte(): void {
    this.http.get<PropostaVendita[]>(`${environment.apiUrl}/sales`).subscribe({
      next: (v) => this.proposte.set((v ?? []).filter((s) => s.status === 'proposta')),
      error: () => undefined, // la lista consegne resta usabile anche senza proposte
    });
  }

  // ==========================================================================
  // I BOTTONI DEL VALET IN LISTA (31/08): ritiro diretto, chiusura via dettaglio.
  // ==========================================================================
  readonly valetStatoInCorso = signal<string | null>(null);

  isValetRuolo(): boolean {
    return this.roleOf() === 'VALET';
  }
  /** Il valet scopre il destinatario solo da «in consegna» in poi (31/08). */
  destinatarioVisibile(d: Delivery): boolean {
    return ['in_delivery', 'delivered', 'not_delivered'].includes(d.status);
  }
  valetPuoLavorare(d: Delivery): boolean {
    return ['assigned', 'accepted', 'in_preparation', 'in_delivery'].includes(d.status);
  }
  /** Consegna EFFETTUATA: il valet può chiedere rimborso o reclamare. */
  consegnaEffettuata(d: Delivery): boolean {
    return ['delivered', 'not_delivered', 'approved', 'invalidated'].includes(d.status);
  }

  // Rimborso / reclamo del valet → Segnalazioni.
  readonly segnalPer = signal<{ tipo: 'rimborso' | 'reclamo'; d: Delivery } | null>(null);
  readonly segInCorso = signal(false);
  readonly segErrore = signal<string | null>(null);
  segImporto = '';
  segMotivo = '';
  /**
   * 02/09 (regola utente): anche in TABELLA si vede se su una consegna è già
   * partito un reclamo o una richiesta di rimborso. Si caricano una volta le
   * PROPRIE segnalazioni (l'API le limita per ruolo) e si mappa per consegna.
   */
  private readonly segnalazioniPerConsegna = signal<Map<string, { tipo: string; stato: string }[]>>(new Map());
  richiesteDi(d: Delivery): { tipo: string; stato: string }[] {
    return this.segnalazioniPerConsegna().get(d.id) ?? [];
  }
  caricaSegnalazioniProprie(): void {
    const r = this.roleOf();
    if (r !== 'VALET' && r !== 'PARTNER') return;
    this.http.get<{ deliveryId?: string | null; tipo: string; stato: string }[]>(`${environment.apiUrl}/segnalazioni`)
      .subscribe({
        next: (righe) => {
          const m = new Map<string, { tipo: string; stato: string }[]>();
          for (const s of righe ?? []) {
            if (!s.deliveryId) continue;
            const arr = m.get(s.deliveryId) ?? [];
            arr.push({ tipo: s.tipo, stato: s.stato });
            m.set(s.deliveryId, arr);
          }
          this.segnalazioniPerConsegna.set(m);
        },
        error: () => this.segnalazioniPerConsegna.set(new Map()),
      });
  }

  apriSegnalazione(tipo: 'rimborso' | 'reclamo', d: Delivery): void {
    this.segImporto = '';
    this.segMotivo = '';
    this.segErrore.set(null);
    this.segnalPer.set({ tipo, d });
  }
  chiudiSegnalazione(): void { this.segnalPer.set(null); }
  inviaSegnalazione(sp: { tipo: 'rimborso' | 'reclamo'; d: Delivery }): void {
    const motivo = this.segMotivo.trim();
    if (!motivo) { this.segErrore.set(this.translate.instant('deliveryDetail.segnal.manca')); return; }
    let importo: number | undefined;
    if (sp.tipo === 'rimborso') {
      importo = parseFloat(this.segImporto.replace(',', '.'));
      if (!isFinite(importo) || importo <= 0) {
        this.segErrore.set(this.translate.instant('deliveryDetail.segnal.importoManca'));
        return;
      }
    }
    const oggetto = this.translate.instant('deliveryDetail.segnal.' + sp.tipo + 'Title', { code: sp.d.code });
    this.segInCorso.set(true);
    this.http.post(`${environment.apiUrl}/segnalazioni`, {
      tipo: sp.tipo, deliveryId: sp.d.id, oggetto, testo: motivo, importo,
    }).subscribe({
      next: () => {
        this.segInCorso.set(false);
        this.segnalPer.set(null);
        this.esitoDiMassa.set(this.translate.instant('deliveryDetail.segnal.inviata'));
        // Il badge «già inviato» deve comparire subito sulla riga.
        this.caricaSegnalazioniProprie();
      },
      error: (err) => {
        this.segInCorso.set(false);
        this.segErrore.set(err?.error?.message ?? 'Errore');
      },
    });
  }
  /**
   * CONSEGNE DA FORNITORE (31/08): il partner consegna la SUA consegna. Allora
   * ha gli stessi bottoni del valet, direttamente in lista.
   */
  consegnaDaFornitore(d: Delivery): boolean {
    return (
      this.roleOf() === 'PARTNER' &&
      (d as any).deliveredByPartner === true &&
      d.partner?.id === this.auth.user()?.partnerId
    );
  }
  /** Chi muove lo stato dalla lista: il valet, o il partner che consegna da fornitore. */
  puoLavorare(d: Delivery): boolean {
    if (this.isValetRuolo()) return this.valetPuoLavorare(d);
    if (this.consegnaDaFornitore(d)) {
      return ['created', 'assigned', 'accepted', 'in_preparation', 'in_delivery'].includes(d.status);
    }
    return false;
  }
  /**
   * VENDITA (02/09, regola utente): il PARTNER risponde dalla lista finché la
   * consegna non è in lavorazione. Accetta non cambia il giro; Rifiuta chiude
   * la consegna come «Non accettata» (Storico) e l'ordine torna all'ufficio.
   */
  /** L'utente loggato è un partner? (default «tutte», 02/09) */
  isPartnerRuolo(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }
  /** Team leader (VALET col grado): ha il filtro veloce «Solo io» / «Tutte». */
  isTeamLeaderRuolo(): boolean {
    const u = this.auth.user();
    return u?.role === 'VALET' && u?.isTeamLeader === true;
  }
  // 03/09 (regola utente, che ribalta quella del giorno prima): il team
  // leader APRE su «Tutte» — è il capo del perimetro, il primo sguardo è
  // sul territorio; «Solo io» resta a un clic.
  readonly filtroTL = signal<'tutte' | 'mie'>('tutte');
  setFiltroTL(v: 'tutte' | 'mie'): void {
    if (this.filtroTL() === v) return;
    this.filtroTL.set(v);
    this.page.set(1);
    this.load();
  }
  puoRispondereVendita(d: Delivery): boolean {
    const u = this.auth.user();
    return u?.role === 'PARTNER'
      && d.partner?.id === u.partnerId
      && d.serviceType?.pricingModel === 'VENDITA'
      && !d.acceptSale
      && ['created', 'assigned'].includes(d.status);
  }
  readonly venditaRispostaInCorso = signal<string | null>(null);
  accettaVendita(d: Delivery): void {
    this.venditaRispostaInCorso.set(d.id);
    this.http.post(`${environment.apiUrl}/deliveries/${d.id}/accetta-vendita`, {}).subscribe({
      next: () => { this.venditaRispostaInCorso.set(null); this.load(); },
      error: (err) => {
        this.venditaRispostaInCorso.set(null);
        this.actionError.set(err?.error?.message ?? 'Errore nell\'accettazione');
      },
    });
  }
  rifiutaVendita(d: Delivery): void {
    // Conferma narrativa (Libro §7): nome, conseguenze, motivo facoltativo.
    this.confermaPendente.set({
      titolo: this.translate.instant('deliveries.vendita.rifiutaTitolo'),
      messaggio: `#${d.code} — ${this.translate.instant('deliveries.vendita.rifiutaMessaggio')}`,
      verbo: this.translate.instant('deliveries.vendita.rifiuta'),
      tono: 'danger',
      conMotivo: true,
      motivoLabel: this.translate.instant('deliveries.vendita.motivo'),
      azione: (motivo: string) => {
        this.venditaRispostaInCorso.set(d.id);
        this.http.post(`${environment.apiUrl}/deliveries/${d.id}/rifiuta-vendita`, { motivo }).subscribe({
          next: () => { this.venditaRispostaInCorso.set(null); this.load(); },
          error: (err) => {
            this.venditaRispostaInCorso.set(null);
            this.actionError.set(err?.error?.message ?? 'Errore nel rifiuto');
          },
        });
      },
    });
  }
  /** Chiusa = Storico: consegnata, non consegnata, annullata, approvata… */
  consegnaChiusa(d: Delivery): boolean {
    return DELIVERY_CLOSED_STATUSES.includes(d.status);
  }

  /**
   * La paga da mostrare al VALET sulla riga: scritta (+ plus/minus) se c'è,
   * altrimenti quella dal listino calcolata dal server. SOLO sulle sue
   * consegne: sulle altre il server non manda niente e qui esce null.
   */
  pagaRiga(d: Delivery): number | null {
    if (d.valet?.id !== this.auth.user()?.valetId) return null;
    if ((d.valetSalary ?? 0) > 0) {
      return Math.round(((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0)) * 100) / 100;
    }
    return d.valetSalaryDalListino ?? null;
  }

  /**
   * ANNULLA del partner (02/09, regola utente): solo sulle SUE consegne non
   * di vendita, finché sono rosse (created) o gialle (assigned). Rossa =
   * annullata subito; gialla = richiesta di cancellazione, decide l'ufficio.
   */
  puoAnnullare(d: Delivery): boolean {
    const u = this.auth.user();
    return u?.role === 'PARTNER'
      && d.partner?.id === u.partnerId
      && d.serviceType?.pricingModel !== 'VENDITA'
      && ['created', 'assigned'].includes(d.status);
  }
  readonly annullaInCorso = signal<string | null>(null);
  chiediAnnulla(d: Delivery): void {
    const gialla = d.status === 'assigned';
    this.confermaPendente.set({
      titolo: this.translate.instant('deliveries.annulla.titolo'),
      messaggio: `#${d.code} — ${this.translate.instant(gialla ? 'deliveries.annulla.msgGialla' : 'deliveries.annulla.msgRossa')}`,
      verbo: this.translate.instant('deliveries.annulla.bottone'),
      tono: 'danger',
      conMotivo: false,
      azione: () => {
        this.annullaInCorso.set(d.id);
        this.http.post(`${environment.apiUrl}/deliveries/${d.id}/annulla`, {}).subscribe({
          next: () => { this.annullaInCorso.set(null); this.load(); },
          error: (err) => {
            this.annullaInCorso.set(null);
            this.actionError.set(err?.error?.message ?? 'Errore nell\'annullamento');
          },
        });
      },
    });
  }

  valetInConsegna(d: Delivery): void {
    this.valetStatoInCorso.set(d.id);
    this.http.patch(`${environment.apiUrl}/deliveries/${d.id}/status`, { status: 'in_delivery' }).subscribe({
      next: () => { this.valetStatoInCorso.set(null); this.load(); },
      error: (err) => {
        this.valetStatoInCorso.set(null);
        this.actionError.set(err?.error?.message ?? 'Errore nel cambio di stato');
      },
    });
  }
  /** La chiusura chiede firma/DDT o motivo: si apre il dettaglio col pop-up pronto. */
  valetChiudi(d: Delivery, esito: 'delivered' | 'not_delivered'): void {
    this.router.navigate(['/deliveries', d.id], { queryParams: { chiudi: esito } });
  }

  accettaProposta(p: PropostaVendita): void {
    this.propostaInCorso.set(true);
    this.propostaAvviso.set(null);
    this.http.post<{ consegna?: { id: string } | null; avviso?: string | null }>(
      `${environment.apiUrl}/sales/${p.id}/accetta`, {},
    ).subscribe({
      next: (r) => {
        this.propostaInCorso.set(false);
        this.proposte.set(this.proposte().filter((x) => x.id !== p.id));
        if (r?.avviso) this.propostaAvviso.set(r.avviso);
        this.load(); // la consegna appena nata deve comparire nella lista
      },
      error: (err) => {
        this.propostaInCorso.set(false);
        this.propostaAvviso.set(err?.error?.message ?? 'Errore nell\'accettazione');
      },
    });
  }

  rifiutaProposta(p: PropostaVendita): void {
    this.propostaInCorso.set(true);
    this.propostaAvviso.set(null);
    this.http.post(`${environment.apiUrl}/sales/${p.id}/rifiuta`, {}).subscribe({
      next: () => {
        this.propostaInCorso.set(false);
        this.proposte.set(this.proposte().filter((x) => x.id !== p.id));
      },
      error: (err) => {
        this.propostaInCorso.set(false);
        this.propostaAvviso.set(err?.error?.message ?? 'Errore nel rifiuto');
      },
    });
  }

  /**
   * Carica province e valet una volta sola, quando servono davvero.
   * Il flag evita che riaprendo il pop-up si riscarichino ogni volta.
   */
  private riferimentiChiesti = false;
  private caricaRiferimenti(): void {
    // Anche il team leader deve poter assegnare: i valet servono a lui come
    // all'ufficio (l'API poi verifica il suo perimetro).
    if (this.riferimentiChiesti || !this.canAssign()) return;
    this.riferimentiChiesti = true;
    const api = environment.apiUrl;
    this.http.get<Province[]>(`${api}/provinces`).subscribe((d) => this.provinces.set(d));
    this.http.get<ValetRef[]>(`${api}/valets`).subscribe((d) => this.valets.set(d));
  }

  // ============================================================
  // LA VISTA SI RICORDA (27/08/2026, chiesto dall'utente)
  // ------------------------------------------------------------
  // «Il tasto indietro riporta alla pagina come era prima impostata (quindi al
  // giorno che stavo guardando).» Prima il ritorno era un link fisso a
  // /deliveries e la lista ripartiva da OGGI: chi lavorava su un altro giorno
  // doveva rimpostare i filtri a ogni consegna aperta.
  //
  // Si salva in due posti perche' servono a due cose diverse: l'INDIRIZZO fa
  // funzionare il tasto indietro del browser e i link condivisi;
  // sessionStorage lo legge il «← Consegne» del dettaglio, che e' un link
  // normale e non sa da dove si arriva.
  // ============================================================
  static readonly CHIAVE_VISTA = 'consegne:ultima-vista';

  private ricordaVista(params: HttpParams): void {
    const stringa = params.toString();
    try { sessionStorage.setItem(DeliveriesListComponent.CHIAVE_VISTA, stringa); } catch { /* privata: pazienza */ }
    // ⚠️ `replaceUrl`: si SOSTITUISCE la voce di cronologia invece di
    // aggiungerne una. Senza, ogni cambio di filtro lascerebbe una tappa e il
    // tasto indietro tornerebbe indietro di un filtro per volta invece che
    // alla pagina di prima.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        date: this.dateFilter || null,
        dateTo: this.dateTo || null,
        status: this.statusFilter || null,
        view: this.vista,
        q: this.query.trim() || null,
        page: this.page() > 1 ? this.page() : null,
        partnerId: this.partnerFiltro(),
      },
      replaceUrl: true,
    });
  }

  // ============================================================
  // PIÙ CONSEGNE INSIEME (27/08/2026, chiesto dall'utente)
  // ------------------------------------------------------------
  // ⚠️ Solo admin e operation: sono le stesse azioni dei bottoni di riga, e
  // farle su venti righe non le rende meno delicate.
  // ============================================================
  readonly selezione = signal<Set<string>>(new Set());
  readonly azioneDiMassa = signal<'stato' | 'assegna' | 'plus' | null>(null);
  readonly inCorsoDiMassa = signal(false);
  readonly esitoDiMassa = signal<string | null>(null);
  plusDiMassaValore: number | null = null;

  selezionata(id: string): boolean {
    return this.selezione().has(id);
  }

  scegli(id: string, acceso: boolean): void {
    const s = new Set(this.selezione());
    if (acceso) s.add(id); else s.delete(id);
    this.selezione.set(s);
  }

  /** Tutte quelle DELLA PAGINA: non si selezionano righe che non si vedono. */
  tutteScelte(): boolean {
    const righe = this.deliveries();
    return righe.length > 0 && righe.every((d) => this.selezione().has(d.id));
  }

  scegliTutte(acceso: boolean): void {
    this.selezione.set(acceso ? new Set(this.deliveries().map((d) => d.id)) : new Set());
  }

  quanteScelte(): number {
    return this.selezione().size;
  }

  private async eseguiDiMassa(percorso: string, corpo: Record<string, unknown>): Promise<void> {
    const ids = [...this.selezione()];
    if (!ids.length) return;
    this.inCorsoDiMassa.set(true);
    this.esitoDiMassa.set(null);
    this.actionError.set(null);
    this.http
      .patch<{ chieste: number; riuscite: number; fallite: number; esiti: { id: string; ok: boolean; errore?: string }[] }>(
        `${environment.apiUrl}/deliveries/massa/${percorso}`,
        { ids, ...corpo },
      )
      .subscribe({
        next: (r) => {
          this.inCorsoDiMassa.set(false);
          this.azioneDiMassa.set(null);
          // ⚠️ Si dice quante sono andate male E PERCHE'. «Fatto» su venti
          // consegne con tre fallite sarebbe una bugia comoda: chi legge
          // crederebbe di averle cambiate tutte.
          const primoErrore = r.esiti.find((x) => !x.ok)?.errore;
          this.esitoDiMassa.set(
            r.fallite === 0
              ? this.translate.instant('deliveries.bulk.done', { n: r.riuscite })
              : this.translate.instant('deliveries.bulk.partial', {
                  n: r.riuscite, k: r.fallite, perche: primoErrore ?? '',
                }),
          );
          this.load();
        },
        error: (err) => {
          this.inCorsoDiMassa.set(false);
          this.actionError.set(err?.error?.message ?? 'Errore');
        },
      });
  }

  statoDiMassa(stato: string): void {
    void this.eseguiDiMassa('stato', { status: stato });
  }

  assegnaDiMassa(valetId: string): void {
    void this.eseguiDiMassa('assegna', { valetId });
  }

  salvaPlusDiMassa(): void {
    if (this.plusDiMassaValore == null) return;
    void this.eseguiDiMassa('plus-valet', { importo: Number(this.plusDiMassaValore) });
  }

  eliminaDiMassa(): void {
    if (!this.quanteScelte()) return;
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.eliminaConsegne', { n: this.quanteScelte() }),
      messaggio: this.translate.instant('deliveries.bulk.confirmDelete', { n: this.quanteScelte() }),
      verbo: this.translate.instant('conferme.elimina'),
      tono: 'danger',
      azione: () => void this.eseguiDiMassa('elimina', {}),
    });
  }

  /** Il pop-up «assegna» di massa ha bisogno dell'elenco valet come quello singolo. */
  apriAzioneDiMassa(quale: 'stato' | 'assegna' | 'plus'): void {
    if (quale === 'assegna') this.caricaRiferimenti();
    this.plusDiMassaValore = null;
    this.esitoDiMassa.set(null);
    this.azioneDiMassa.set(quale);
  }

  // ---- Stato tabella: ricerca globale + ordinamento + paginazione (server-side) ----
  query = '';
  readonly total = signal(0);
  readonly page = signal(1);
  pageSize = 50;
  readonly pageSizes = [10, 25, 50, 100, 200, 500];
  // La lista si legge nell'ordine in cui le consegne vanno fatte: prima quella
  // piu' vicina. Chi ha bisogno di un altro ordine clicca l'intestazione.
  readonly sort = signal<string>('deliveryTimeFrom');
  readonly dir = signal<'asc' | 'desc'>('asc');
  private searchTimer?: ReturnType<typeof setTimeout>;

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  sortIndicator(field: string): string {
    if (this.sort() !== field) return '';
    return this.dir() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Click sull'intestazione: stesso campo inverte il verso, altrimenti asc. */
  sortBy(field: string): void {
    if (this.sort() === field) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.dir.set('asc');
    }
    this.reload();
  }

  /** Ricerca globale con debounce: una chiamata sola a fine digitazione. */
  onSearch(value: string): void {
    this.query = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.reload(), 300);
  }

  /** Cambio filtro/ordinamento: si riparte dalla prima pagina. */
  reload(): void {
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size);
    this.reload();
  }

  /** Il nome, per scriverlo nel chip: l'id da solo non dice niente a nessuno. */
  private chiediNomePartner(id: string): void {
    this.http.get<{ insegna: string }>(`${environment.apiUrl}/partners/${id}`).subscribe({
      next: (p) => this.partnerNome.set(p?.insegna ?? null),
      error: () => this.partnerNome.set(null),
    });
  }

  togliFiltroPartner(): void {
    this.partnerFiltro.set(null);
    this.partnerNome.set(null);
    this.page.set(1);
    this.load();
  }

  // --- «Filtri (N)» (Libro §8, verdetto del custode 31/08) ------------------
  /** Il pannello mobile dei filtri: chiuso di default. Dal desktop è invisibile
   *  come meccanismo (display:contents) e tutto resta in vista. */
  readonly filtriAperti = signal(false);

  /**
   * Quanti filtri sono ATTIVI dentro il pannello: stato + periodo/date (una
   * cosa sola, §8-bis) + partner. La ricerca non conta: sta in prima riga.
   * «Oggi» è il default della pagina, non un filtro.
   */
  filtriAttivi(): number {
    let n = 0;
    if (this.statusFilter) n++;
    if (this.dateTo || (this.dateFilter && this.dateFilter !== this.oggi())) n++;
    if (this.partnerFiltro()) n++;
    return n;
  }

  /** Riporta la pagina al suo stato di default (il vuoto-da-filtro ne ha bisogno). */
  azzeraFiltri(): void {
    this.statusFilter = '';
    this.dateTo = '';
    this.dateFilter = this.oggi();
    this.page.set(1);
    if (this.partnerFiltro()) { this.togliFiltroPartner(); return; }
    this.reload();
  }

  /** `silenzioso` (04/09): è il giro dell'auto-aggiornamento — niente
   *  rotellina, la selezione resta, un errore di rete non sporca la pagina. */
  load(silenzioso = false): void {
    if (!silenzioso) {
      this.loading.set(true);
      this.error.set(null);
    }
    let params = new HttpParams()
      .set('page', String(this.page()))
      .set('pageSize', String(this.pageSize))
      .set('sort', this.sort())
      .set('dir', this.dir())
      .set('view', this.vista);
    if (this.statusFilter) params = params.set('status', this.statusFilter);
    // Un giorno solo resta `date`, com'era. Con due estremi si passa a
    // dateFrom/dateTo, che il backend già capisce: `dateTo` include tutta la
    // giornata finale, se no l'ultimo giorno scelto resterebbe fuori.
    if (this.dateFilter && this.dateTo) {
      params = params.set('dateFrom', this.dateFilter).set('dateTo', this.dateTo);
    } else if (this.dateFilter) {
      params = params.set('date', this.dateFilter);
    } else if (this.dateTo) {
      params = params.set('dateTo', this.dateTo);
    }
    if (this.query.trim()) params = params.set('q', this.query.trim());
    const partner = this.partnerFiltro();
    if (partner) params = params.set('partnerId', partner);
    // Team leader su «Solo io»: si passa il PROPRIO valetId (il server lo
    // accetta da un VALET solo se è il suo).
    if (this.isTeamLeaderRuolo() && this.filtroTL() === 'mie' && this.auth.user()?.valetId) {
      params = params.set('valetId', this.auth.user()!.valetId!);
    }
    // ⭐ La vista si RICORDA (27/08, chiesto dall'utente): tornando indietro da
    // una consegna si deve rivedere il giorno che si stava guardando, non
    // ripartire da oggi. Si scrive nell'indirizzo — così vale anche per il
    // tasto indietro del browser e per un link condiviso — e in sessionStorage,
    // che è quello che legge il «← Consegne» del dettaglio.
    this.ricordaVista(params);
    this.http
      .get<{ items: Delivery[]; total: number }>(`${environment.apiUrl}/deliveries`, { params })
      .subscribe({
        next: (data) => {
          this.deliveries.set(data.items ?? []);
          this.total.set(data.total ?? 0);
          this.loading.set(false);
          // ⚠️ Cambiando pagina o filtro la selezione si azzera: tenere
          // selezionate righe che non si vedono più vorrebbe dire agire alla
          // cieca su consegne che nessuno sta guardando.
          // Nel giro silenzioso invece si tiene: si POTANO solo gli id che
          // non sono più in pagina (stessa ragione, senza far perdere il lavoro).
          if (!silenzioso) {
            this.selezione.set(new Set());
          } else if (this.selezione().size) {
            const inPagina = new Set((data.items ?? []).map((d) => d.id));
            this.selezione.set(new Set([...this.selezione()].filter((id) => inPagina.has(id))));
          }
        },
        error: (err) => {
          if (silenzioso) return; // il prossimo giro riprova; la pagina non si sporca
          this.loading.set(false);
          this.error.set(
            err?.error?.message ?? this.translate.instant('deliveries.loadError'),
          );
        },
      });
  }
}
