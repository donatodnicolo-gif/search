import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, HostListener, NgZone, computed, inject, signal } from '@angular/core';
import { avviaAutoAggiornamento } from '../core/auto-aggiornamento';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { loadGoogleMaps } from '../core/google-maps';
import { DeliveryFormComponent } from './delivery-form.component';
import { ConfermaComponent } from '../shared/conferma.component';

/** ⭐ 04/09 (regola utente): «chi abbiamo usato, e a quanto» per prodotto × provincia. */
interface RigaStorico {
  partnerId: string;
  insegna: string;
  attivo: boolean;
  operaInProvincia: boolean;
  escluso: boolean;
  vendite: number;
  prezzoMin: number;
  prezzoMax: number;
  prezzoModa: number;
  scontoModa: number;
  nettoModa: number;
  ultimaData: string;
  ultimoOrdine: string | null;
  ultimoProdotto?: string | null;
  ultimaVariante?: string | null;
  ultimaConsegna?: string | null;
  ultimaProvincia: string | null;
  vecchia: boolean;
}

/** ⭐ 04/09 (regola utente): consegne di tipo vendita allo stesso indirizzo. */
interface ProdottoVendita {
  id?: string;
  name?: string;
  /** ⭐ 07/09/2026: unico | quantita | mix | preventivo — decide se serve il preventivo. */
  tipologiaVendita?: string | null;
  /** La specifica che arriva da Merchandising: «20-25 fiori», «18-20 cm». */
  note?: string | null;
  sku?: string | null;
  line?: string | null;
  imageUrl?: string | null;
  /** JSON: array di URL (galleria Shopify). */
  images?: string | null;
  /** Il PARTNER CHE LO FA. Vuoto per il ruolo partner: è un altro partner. */
  partner?: { id: string; insegna: string } | null;
}

interface ConsegnaVicina {
  id: string;
  code: number;
  date: string | null;
  status: string;
  indirizzo: string | null;
  ddt: string | null;
  prezzo: number | null;
  partner: string | null;
  servizio: string | null;
  /** Da che cosa è stata trovata: il DDT (forte) o l'indirizzo (indiziario). */
  motivo?: 'ddt' | 'indirizzo';
}

interface Storico {
  base: 'coppia' | 'nome-simile' | 'categoria' | 'nessuna';
  prodotto: string | null;
  provincia: string | null;
  considerate: number;
  regola: { partnerId: string; insegna: string | null; price: number; discountPercent: number; status: string } | null;
  righe: RigaStorico[];
}

interface Sale {
  /** ⭐ 07/09/2026: i PEZZI («50 rose rosse» è una vendita di 50). */
  quantity?: number | null;
  id: string;
  status: string;
  /** ⭐ 07/09/2026: prodotto a preventivo senza prezzo concordato — prima si raccoglie quello. */
  preventivoMancante?: boolean;
  brand: string;
  amount: number | null;
  /** Al PARTNER arriva solo questo: importo × (1 − sconto%). */
  prezzoPartner?: number | null;
  createdAt: string;
  deliveryDate?: string | null;
  externalOrderId?: string | null;
  /** Il numero d'ordine Shopify (es. 2824), riempito anche sul pregresso. */
  externalOrderNumber?: string | null;
  /** Link all'ordine su Shopify: lo costruisce il server, e all'ufficio soltanto. */
  shopifyUrl?: string | null;
  source: string;
  product?: ProdottoVendita | null;
  variantName?: string | null;
  partner?: { id: string; insegna: string } | null;
  /**
   * La FASE dopo la proposta: il messaggio al partner. Due canali indipendenti
   * (campanello in app e mail): ognuno puo' fallire per conto suo, e «proposta»
   * da sola non dice se il partner l'ha saputo.
   */
  /**
   * ⭐ 08/09/2026: lo stato di LAVORAZIONE secondo il Customer Service, che ne è il
   * proprietario — letto da lui, non dedotto qui. Presente solo sulle vendite ancora
   * aperte: il suo endpoint risponde per un ordine alla volta, e sull'elenco intero
   * sarebbero 567 chiamate.
   */
  customerService?: {
    gestione: string;
    fornitore?: string | null;
    statoPagamento?: string | null;
    daArchivio?: boolean;
  } | null;
  trasmissione?: {
    esito: 'attesa' | 'inviata' | 'parziale' | 'fallita';
    app?: { ok: boolean; testo: string; quando: string } | null;
    mail?: { ok: boolean; testo: string; quando: string } | null;
  } | null;
  province?: { id: string; code: string; name: string } | null;
  assignmentReason?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  recipientAddress?: string | null;
  recipientPhone?: string | null;
  /** Dal dettaglio (GET /sales/:id, 04/09): consegna collegata, servizio, registro. */
  productName?: string | null;
  discountPercent?: number;
  deliveryId?: string | null;
  delivery?: { id: string; code: number; status: string; date?: string } | null;
  serviceType?: { id: string; name: string } | null;
  logs?: SaleLog[];
  /** ⭐ 04/09 (regola utente): quando la vendita è passata in storico. */
  historyAt?: string | null;
  /** ⭐ 04/09: lo stato dell'ordine in ORDERS, letto dal vivo (null = Orders non raggiungibile o ordine non trovato). */
  ordine?: { salute?: string | null; stato?: string | null; terminale?: boolean | null; smistamento?: string | null; evasione?: string | null;
    fulfillmentStatus?: string | null; consegnataIl?: string | null; annullato?: unknown } | null;
}
/** Una riga del registro della vendita (04/09): chi ha fatto cosa, quando. */
interface SaleLog {
  id: string; type: string; message: string; createdAt: string;
  userEmail?: string | null; userRole?: string | null;
}

/**
 * Gli stati di una vendita, coi colori del design system.
 *
 * «Da gestire» e' rosso non perche' sia un errore, ma perche' e' l'unica coda
 * che qualcuno deve guardare: nessun partner l'ha presa.
 */
const STATI: Record<string, { etichetta: string; colore: string }> = {
  da_gestire: { etichetta: 'Da gestire', colore: '#d70015' },
  proposta: { etichetta: 'Proposta', colore: 'var(--orange, #c93400)' /* §5: l'oro non e' MAI uno stato (verdetto custode 31/08); attende un'azione del partner -> arancio */ },
  accettata: { etichetta: 'Accettata', colore: '#248A3D' },
  non_accettata: { etichetta: 'Non accettata', colore: '#6e6e73' },
  annullata: { etichetta: 'Annullata', colore: '#8e8e93' },
};

/**
 * Il Google Plus Code in testa a un indirizzo (es. «F6P2+7H5, Piazza Duca…»):
 * è un codice di posizione, non un indirizzo leggibile, e si toglie.
 * ⚠️ Sta qui fuori perché un letterale di espressione regolare dentro un
 * template Angular non si può scrivere.
 */
const PLUS_CODE = /^\s*[0-9A-Z]{4,8}\+[0-9A-Z]{2,4}\b[,\s]*/;

/** Operatività → Vendite: gli ordini smistati ai partner. */
@Component({
  selector: 'app-sales-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe, DeliveryFormComponent, ConfermaComponent, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'sales.title' | translate }}</h1>
        <p class="page-caption">{{ 'sales.caption' | translate }}</p>
      </div>
      @if (canManage()) {
        <div class="head-actions">
          <button class="btn btn-secondary" [disabled]="tirando()" (click)="tira(false)">
            {{ (tirando() ? 'common.loading' : 'sales.sync.simulate') | translate }}
          </button>
          <button class="btn btn-primary" [disabled]="tirando()" (click)="tira(true)">
            {{ 'sales.sync.apply' | translate }}
          </button>
        </div>
      }
    </div>

    <!-- Esito del tiraggio da Orders: si mostra il conto, non un «fatto».
         Un ordine su quattro non e' smistabile e il motivo va detto. -->
    @if (esitoSync(); as e) {
      <section class="card sync">
        @if (!e.ok) {
          <p class="ko">{{ e.messaggio }}</p>
        } @else {
          <p class="titolo">
            {{ (e.applicato ? 'sales.sync.done' : 'sales.sync.preview') | translate:{ n: e.lettiDaOrders } }}
          </p>
          <div class="conti">
            @for (r of righeConteggio(e.conteggio); track r.chiave) {
              <span class="conto" [class.buono]="r.chiave === 'creata'">
                <strong>{{ r.n }}</strong> {{ ('sales.sync.esito.' + r.chiave) | translate }}
              </span>
            }
          </div>
          @if (e.esempiDiCosaNonEntra?.length) {
            <p class="hint">{{ 'sales.sync.examples' | translate }}</p>
            <ul class="esempi">
              @for (x of e.esempiDiCosaNonEntra; track x.ordine) {
                <li>{{ x.ordine }} — {{ ('sales.sync.esito.' + x.esito) | translate }}
                  @if (x.dettaglio) { <span class="mono">· {{ x.dettaglio }}</span> }
                </li>
              }
            </ul>
          }
        }
      </section>
    }

    <div class="tabs">
      @for (t of tab; track t.chiave) {
        <button class="tab" [class.on]="filtro() === t.chiave" (click)="filtro.set(t.chiave)">
          {{ ('sales.tab.' + t.chiave) | translate }}
          <span class="pill">{{ quante(t.chiave) }}</span>
        </button>
      }
    </div>

    @if (erroreCarico(); as e) {
      <div class="error-card" role="alert">{{ e }}
        <button type="button" class="btn btn-secondary btn-riprova" (click)="ricarica()">{{ 'common.retry' | translate }}</button>
      </div>
    } @else if (caricando()) {
      <p class="muted">{{ 'common.loading' | translate }}</p>
    } @else {

    <!-- §8-bis del Libro: ogni elenco ha una ricerca. ⚠️ Sta FUORI dal ramo
         del vuoto (verdetto custode 31/08): prima, digitando una query senza
         risultati, vinceva il ramo «vuoto» e l'input SPARIVA dalla pagina —
         impossibile correggere o azzerare quello che si era scritto. -->
    <div class="cerca-riga">
      <input class="field" type="search" [(ngModel)]="cerca" name="cerca"
             [attr.placeholder]="'comune.cercaPh' | translate" [attr.aria-label]="'comune.cercaPh' | translate" />
      @if (cerca.trim()) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: visibili().length, m: vendite().length } }}</span>
      }
    </div>

    @if (!visibili().length) {
      <section class="card vuoto">
        @if (cerca.trim() || filtro() !== 'tutte') {
          <!-- Vuoto DA FILTRO (§6.2): si dice il perché e si offre la via. -->
          <p>{{ 'comune.contoRighe' | translate: { n: 0, m: vendite().length } }}</p>
          <button type="button" class="btn btn-secondary" (click)="cerca = ''; filtro.set('da_gestire')">
            {{ 'filters.clear' | translate }}
          </button>
        } @else {
          <p>{{ 'sales.empty' | translate }}</p>
        }
      </section>
    } @else {

      <!-- ⭐ 05/09/2026 — COLONNE CONGELATE (Libro §8 v2.0, verdetto del
           custode UX su segnalazione dell'utente: «scorrendo a destra la
           tabella diventa così», con numero d'ordine e data spariti).
           L'identità resta a sinistra, le azioni a destra: chi deve solo
           accettare o rifiutare non scorre più. -->
      <div class="table-wrap card col-fisse">
        <table class="table">
          <!-- ⭐ 03/09 (regola utente): colonne ordinabili al click; il default
               è la DATA DI CONSEGNA più urgente in cima. -->
          <thead>
            <tr>
              <!-- ⭐ 04/09/2026 (regola utente): LA DATA DI CONSEGNA È LA PRIMA COLONNA.
                   È la domanda con cui si guarda questo elenco — «che cosa parte
                   quando» — e l'ordinamento di default è già suo. -->
              <!-- ⚠️ Il blocco congelato parte dal BORDO: la colonna
                   congelata dev'essere la PRIMA. Qui la prima è la data di
                   consegna per una regola dell'utente del 04/09, quindi
                   l'identità (numero d'ordine) viaggia dentro questa stessa
                   cella come sotto-testo — invece di congelarne due, che il
                   custode vieta. -->
              <th class="ordinabile col-id" (click)="ordina('deliveryDate')">{{ 'sales.col.delivery' | translate }}{{ freccia('deliveryDate') }}</th>
              <th class="ordinabile" (click)="ordina('status')">{{ 'sales.col.status' | translate }}{{ freccia('status') }}</th>
              <th class="ordinabile" (click)="ordina('ordine')">{{ 'sales.col.order' | translate }}{{ freccia('ordine') }}</th>
              <!-- ⭐ 04/09 (regola utente): lo stato dell'ordine in Orders, dal vivo. -->
              <th class="ordinabile" (click)="ordina('orders')">{{ 'sales.col.orders' | translate }}{{ freccia('orders') }}</th>
              <!-- ⭐ 08/09/2026 (regola utente): a che punto è l'ordine per il CUSTOMER
                   SERVICE. È una cosa diversa dallo stato in Orders (che dice a che punto
                   è per l'azienda) e dal nostro (che dice a che punto è lo smistamento):
                   questo dice cosa stanno facendo LORO, e in particolare se l'ordine è
                   già passato «In App», cioè a noi. -->
              @if (!isPartner()) {
                <th class="ordinabile" (click)="ordina('cs')">{{ 'sales.col.cs' | translate }}{{ freccia('cs') }}</th>
              }
              <th class="ordinabile" (click)="ordina('prodotto')">{{ 'sales.col.product' | translate }}{{ freccia('prodotto') }}</th>
              <th class="ordinabile" (click)="ordina('provincia')">{{ 'sales.col.province' | translate }}{{ freccia('provincia') }}</th>
              <th class="ordinabile" (click)="ordina('partner')">{{ 'sales.col.partner' | translate }}{{ freccia('partner') }}</th>
              <!-- ⭐ 08/09/2026 (regola utente: «fammi capire chiaramente se è stata trasmessa
                   al partner con l'aggiunta di una colonna per questa fase»).
                   Proporre e trasmettere sono due fasi diverse: lo smistamento sceglie il
                   partner in un attimo, il messaggio parte dopo e può non arrivare mai
                   (partner senza utenti, senza indirizzo, con le notifiche spente). Al
                   partner questa colonna non serve: è la nostra spedizione, non la sua. -->
              @if (!isPartner()) {
                <th class="ordinabile" (click)="ordina('trasmessa')">{{ 'sales.col.sent' | translate }}{{ freccia('trasmessa') }}</th>
              }
              <th class="ordinabile num" (click)="ordina('amount')">{{ (isPartner() ? 'sales.col.partnerPrice' : 'sales.col.publicPrice') | translate }}{{ freccia('amount') }}</th>
              <!-- ⭐ 04/09 (regola utente): all'ufficio servono tutt'e due i numeri. -->
              @if (!isPartner()) {
                <th class="num">{{ 'sales.col.partnerPrice' | translate }}</th>
              }
              <!-- ⭐ 04/09 (regola utente): nello STORICO si vede QUANDO ci è andata. -->
              @if (filtro() === 'storico') {
                <th class="ordinabile" (click)="ordina('historyAt')">{{ 'sales.col.historyAt' | translate }}{{ freccia('historyAt') }}</th>
              }
              <th class="azioni"></th>
            </tr>
          </thead>
          <tbody>
            @for (s of visibili(); track s.id) {
              <!-- ⭐ 04/09 (regola utente): la riga apre il POP-UP di dettaglio
                   (come nel Customer Service); i bottoni fermano il click. -->
              <tr class="riga-link" (click)="apriDettaglio(s)">
                <td class="col-id">{{ s.deliveryDate ? (s.deliveryDate | date: 'dd/MM/yyyy') : '—' }}
                  @if (s.externalOrderNumber) {
                    <div class="cella-sub mono">#{{ s.externalOrderNumber }}</div>
                  }
                </td>
                <td>
                  <span class="badge" [style.--c]="colore(s.status)">
                    <i class="dot"></i>{{ etichetta(s.status) }}
                  </span>
                </td>
                <td class="mono">
                  @if (s.externalOrderNumber) { <strong>#{{ s.externalOrderNumber }}</strong> · }{{ s.brand }}
                  <!-- ⭐ 08/09/2026 (regola utente: «anche qui mostra prodotto e quantità»).
                       La colonna Prodotto sta a destra, oltre lo scorrimento: su schermi
                       stretti la riga diceva numero e negozio, e COSA fosse la vendita non
                       si sapeva senza scorrere. Qui sotto, in piccolo, il prodotto e i pezzi. -->
                  <div class="cella-sub prod-riassunto">
                    {{ s.product?.name ?? s.productName ?? '—' }}@if (s.variantName) { <span class="muted"> · {{ s.variantName }}</span> }@if (s.quantity && s.quantity > 1) { <b> ×{{ s.quantity }}</b> }
                  </div>
                </td>
                <td class="orders-stato">
                  @if (s.ordine) {
                    <span class="badge" [style.--c]="coloreOrders(s.ordine)"><i class="dot"></i>{{ etichettaOrders(s.ordine) }}</span>
                    @if (sottoOrders(s.ordine); as sub) { <span class="motivo">{{ sub }}</span> }
                  } @else { <span class="muted">—</span> }
                </td>
                <td class="prodotto">@if (fotoProdotto(s).length) { <button type="button" class="nome-prodotto" (click)="apriFoto(s); $event.stopPropagation()" [title]="'sales.detail.photos' | translate">{{ s.product?.name }}</button> } @else { {{ s.product?.name ?? s.productName ?? '—' }} }@if (!s.product && s.productName) { <span class="muted"> · {{ 'sales.fuoriCatalogo' | translate }}</span> }@if (s.variantName) { <span class="muted">({{ s.variantName }})</span> }@if (s.quantity && s.quantity > 1) { <b class="pezzi">×{{ s.quantity }}</b> }
                  <!-- ⭐ 08/09/2026 (regola utente: «mostra anche i prodotti»). Un ordine
                       composto ha una vendita per riga, e in tabella le righe sono lontane
                       fra loro: qui si dice COSA ALTRO c'è nello stesso ordine, così chi
                       guarda una vendita sa se sta vedendo tutto o metà. -->
                  @if (altriProdotti(s); as altri) {
                    <div class="altri-prodotti" [title]="'sales.altriProdotti' | translate">
                      + {{ altri }}
                    </div>
                  }
                </td>
                <td class="mono">{{ s.province?.code ?? '—' }}</td>
                <td>{{ s.partner?.insegna ?? ('sales.noPartner' | translate) }}
                  @if (s.assignmentReason) {
                    <span class="motivo">{{ s.assignmentReason }}</span>
                  }
                </td>
                @if (!isPartner()) {
                  <td class="cs-stato">
                    @if (s.customerService; as cs) {
                      <span class="badge" [style.--c]="coloreCs(cs.gestione)">
                        <i class="dot"></i>{{ etichettaCs(cs.gestione) }}
                      </span>
                      @if (cs.fornitore) { <span class="cella-sub muted">{{ cs.fornitore }}</span> }
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                }
                @if (!isPartner()) {
                  <td class="trasmessa">
                    @if (s.trasmissione; as t) {
                      <span class="badge" [style.--c]="coloreInvio(t.esito)" [title]="dettaglioInvio(t)">
                        <i class="dot"></i>{{ ('sales.sent.' + t.esito) | translate }}
                      </span>
                      <!-- I due canali sono indipendenti: si dice quale ha funzionato,
                           altrimenti «parziale» non si sa cosa voglia dire. -->
                      <span class="canali">
                        <span [class.ko]="t.app && !t.app.ok" [class.ok]="t.app?.ok">{{ 'sales.sent.app' | translate }}</span>
                        <span [class.ko]="t.mail && !t.mail.ok" [class.ok]="t.mail?.ok">{{ 'sales.sent.mail' | translate }}</span>
                      </span>
                    } @else { <span class="muted">—</span> }
                  </td>
                }
                <td class="num">{{ (s.prezzoPartner ?? s.amount) | number: '1.2-2' }} €</td>
                @if (!isPartner()) {
                  <td class="num">{{ nettoPartner(s) | number: '1.2-2' }} €
                    @if (s.discountPercent) { <span class="muted"> −{{ s.discountPercent }}%</span> }
                  </td>
                }
                @if (filtro() === 'storico') {
                  <td class="mono">{{ s.historyAt ? (s.historyAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                }
                <td class="azioni" (click)="$event.stopPropagation()">
                  <!-- ⚠️ Il flex sta su questo div, NON sul <td>: una cella di
                       tabella con display:flex esce dal layout tabellare e
                       «position: sticky; right: 0» smette di funzionare. -->
                  <div class="azioni-riga">
                  <!-- ⭐ 04/09 (regola utente): ordine NON CONFORME in Orders =
                       non si manda avanti. Resta solo «Rifiuta». -->
                  @if (nonConforme(s)) {
                    <span class="badge ko-badge" [title]="'sales.notConform.hint' | translate">{{ 'sales.notConform.tag' | translate: { salute: saluteLeggibile(s) } }}</span>
                    @if ((s.status === 'proposta' && puoRispondere(s)) || (canManage() && s.status === 'da_gestire')) {
                      <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="rifiuta(s)">
                        {{ 'sales.refuse' | translate }}
                      </button>
                    }
                  } @else {
                  <!-- ⭐ 07/09/2026 (regola utente): finché manca il preventivo non si accetta,
                       non si rifiuta e non si inserisce. Si raccoglie il prezzo, e basta. -->
                  @if (s.status === 'proposta' && puoRispondere(s) && !serveIlPreventivo(s)) {
                    <button class="btn btn-primary mini" [disabled]="inCorso() === s.id" (click)="accetta(s)">
                      {{ 'sales.accept' | translate }}
                    </button>
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="rifiuta(s)">
                      {{ 'sales.refuse' | translate }}
                    </button>
                  }
                  <!-- ⭐ 04/09 (regola utente): l'UFFICIO rifiuta anche una vendita
                       da gestire — chiude in storico come non accettata. -->
                  @if (canManage() && s.status === 'da_gestire' && !serveIlPreventivo(s)) {
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="rifiuta(s)">
                      {{ 'sales.refuse' | translate }}
                    </button>
                  }
                  <!-- L'ufficio prende in mano: ferma il giro automatico e
                       apre il form consegna coi dati della vendita (31/08). -->
                  <!-- ⭐ 07/09/2026 (regola utente): un prodotto A PREVENTIVO si inserisce solo
                       dopo aver salvato il prezzo del partner — e salvarlo crea la regola per
                       le prossime volte. Il bottone sta accanto a «Inserisci», non altrove. -->
                  @if (canManage() && aPreventivo(s) && (s.status === 'proposta' || s.status === 'da_gestire')) {
                    <button class="btn mini" [class.btn-primary]="serveIlPreventivo(s)" [class.btn-secondary]="!serveIlPreventivo(s)"
                            [disabled]="inCorso() === s.id" (click)="apriPreventivo(s)"
                            [title]="serveIlPreventivo(s) ? ('sales.detail.preventivoServe' | translate) : ''">
                      {{ (serveIlPreventivo(s) ? 'sales.detail.chiediPreventivo' : 'sales.detail.salvaPreventivo') | translate }}
                    </button>
                  }
                  @if (canManage() && !serveIlPreventivo(s) && (s.status === 'proposta' || s.status === 'da_gestire')) {
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="inserisci(s)">
                      {{ 'sales.inserisci' | translate }}
                    </button>
                  }
                  }
                  <!-- ⭐ 03/09 (regola utente): la vendita si MODIFICA da qui —
                       i dati (importo, destinatario, data, provincia), non lo
                       stato, che ha le sue azioni. -->
                  <!-- ⭐ 06/09/2026 (regola utente): da ogni vendita si richiama l'app
                       Ricerca fornitori con l'ordine già caricato (brand + numero). -->
                  @if (canManage() && linkRicercaFornitore(s); as u) {
                    <a class="btn btn-secondary mini" [href]="u" target="_blank" rel="noopener" (click)="$event.stopPropagation()">{{ 'sales.cercaFornitore' | translate }}</a>
                  }
                  @if (canManage()) {
                    <button class="btn btn-secondary mini" (click)="apriModifica(s)">
                      {{ (modificaId() === s.id ? 'common.cancel' : 'sales.edit') | translate }}
                    </button>
                  }
                  </div>
                </td>
              </tr>
              @if (modificaId() === s.id) {
                <tr class="mod-row" (click)="$event.stopPropagation()">
                  <td [attr.colspan]="(filtro() === 'storico' ? 10 : 9) + (isPartner() ? 0 : 1)">
                    <div class="mod-grid">
                      <label><span>{{ 'sales.col.amount' | translate }}</span>
                        <input class="field num" type="number" min="0" step="0.01" [(ngModel)]="mod.amount" /></label>
                      <label><span>{{ 'sales.col.delivery' | translate }}</span>
                        <input class="field" type="date" [(ngModel)]="mod.deliveryDate" /></label>
                      <label><span>{{ 'sales.mod.provincia' | translate }}</span>
                        <select class="field" [(ngModel)]="mod.provinceId">
                          @for (p of province(); track p.id) { <option [value]="p.id">{{ p.code }}</option> }
                        </select></label>
                      <label><span>{{ 'sales.mod.nome' | translate }}</span>
                        <input class="field" [(ngModel)]="mod.recipientFirstName" /></label>
                      <label><span>{{ 'sales.mod.cognome' | translate }}</span>
                        <input class="field" [(ngModel)]="mod.recipientLastName" /></label>
                      <label><span>{{ 'sales.mod.telefono' | translate }}</span>
                        <input class="field" [(ngModel)]="mod.recipientPhone" /></label>
                      <!-- ⭐ 05/09/2026 (regola utente): «modifica indirizzo in
                           modifica vendita deve essere sincronizzato con Google
                           Maps». Stesse regole del modulo consegna: si sceglie
                           dai suggerimenti, e quello che si scrive a mano viene
                           normalizzato uscendo dal campo. L'indirizzo della
                           vendita decide la provincia, e la provincia decide a
                           chi va l'ordine: un indirizzo che Google non
                           riconosce è un ordine smistato male. -->
                      <label class="largo"><span>{{ 'sales.mod.indirizzo' | translate }}</span>
                        <input class="field mod-indirizzo" [(ngModel)]="mod.recipientAddress"
                               (blur)="normalizzaIndirizzo()" autocomplete="off" /></label>
                      @if (mapsMancante()) {
                        <div class="mod-errore largo">{{ 'sales.mod.mapsMancante' | translate }}</div>
                      }
                      @if (provinciaDaGoogle(); as pc) {
                        <div class="mod-nota largo">{{ 'sales.mod.provinciaDaGoogle' | translate: { provincia: pc } }}</div>
                      }
                    </div>
                    @if (modErrore(); as e) { <div class="mod-errore">{{ e }}</div> }
                    <div class="mod-azioni">
                      <button class="btn btn-secondary mini" (click)="modificaId.set(null)">{{ 'common.cancel' | translate }}</button>
                      <button class="btn btn-primary mini" [disabled]="modInCorso()" (click)="salvaModifica(s)">
                        {{ modInCorso() ? ('common.saving' | translate) : ('common.save' | translate) }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
    }
    @if (messaggio(); as m) { <p class="esito" [class.ok]="m.ok">{{ m.testo }}</p> }

    <!-- POP-UP «Inserisci da vendita»: il form consegna, precompilato, dentro
         un modale invece di cambiare pagina (31/08). -->
    @if (inserisciVendita(); as vid) {
      <div class="ins-overlay" (click)="chiudiInserimento(false)"></div>
      <div class="ins-modal" role="dialog" aria-modal="true">
        <header class="ins-head">
          <h2>{{ 'sales.inserisci' | translate }}</h2>
          <button type="button" class="ins-x" (click)="chiudiInserimento(false)" [attr.aria-label]="'common.close' | translate">×</button>
        </header>
        <div class="ins-body">
          <app-delivery-form [venditaModale]="vid" (chiuso)="chiudiInserimento($event)" />
        </div>
      </div>
    }

    <!-- ⭐ 05/09/2026 (regola utente): le FOTO del prodotto, a schermo. -->
    @if (foto().length) {
      <div class="foto-velo" (click)="chiudiFoto()"></div>
      <div class="foto-box" role="dialog" aria-modal="true">
        <button type="button" class="foto-x" (click)="chiudiFoto()"
                [attr.aria-label]="'common.close' | translate">×</button>
        <div class="foto-scorri">
          @for (u of foto(); track u) {
            <img [src]="u" [alt]="'sales.detail.photos' | translate" loading="lazy" />
          }
        </div>
      </div>
    }

    <!-- ⭐ 04/09 (regola utente): POP-UP DI DETTAGLIO della vendita, identico
         nella struttura a quello del Customer Service (velo + pannello, testata
         con numero e stato, coppie dt/dd, in fondo il REGISTRO con chi ha fatto
         cosa). Si apre cliccando la riga; Esc o il velo lo chiudono. -->
    @if (dettaglio(); as v) {
      <div class="velo" (click)="chiudiDettaglio()"></div>
      <div class="pannello" role="dialog" aria-modal="true" [attr.aria-label]="'sales.detail.title' | translate">
        <header class="pan-testa">
          <div class="pan-titolo">
            <h2>{{ v.externalOrderNumber ? '#' + v.externalOrderNumber : ('sales.detail.title' | translate) }}
              <span class="muted">· {{ v.brand }}</span></h2>
            <span class="badge" [style.--c]="colore(v.status)"><i class="dot"></i>{{ etichetta(v.status) }}</span>
          </div>
          <div class="pan-azioni">
            @if (canManage() && linkRicercaFornitore(v); as u) {
              <a class="btn btn-secondary mini" [href]="u" target="_blank" rel="noopener">{{ 'sales.cercaFornitore' | translate }}</a>
            }
            @if (nonConforme(v)) {
              @if ((v.status === 'proposta' && puoRispondere(v)) || (canManage() && v.status === 'da_gestire')) {
                <button class="btn btn-secondary mini" [disabled]="inCorso() === v.id" (click)="rifiuta(v)">{{ 'sales.refuse' | translate }}</button>
              }
            } @else {
            @if (v.status === 'proposta' && puoRispondere(v)) {
              <button class="btn btn-primary mini" [disabled]="inCorso() === v.id" (click)="accetta(v)">{{ 'sales.accept' | translate }}</button>
              <button class="btn btn-secondary mini" [disabled]="inCorso() === v.id" (click)="rifiuta(v)">{{ 'sales.refuse' | translate }}</button>
            }
            @if (canManage() && v.status === 'da_gestire') {
              <button class="btn btn-secondary mini" [disabled]="inCorso() === v.id" (click)="rifiuta(v)">{{ 'sales.refuse' | translate }}</button>
            }
            @if (canManage() && (v.status === 'proposta' || v.status === 'da_gestire')) {
              <button class="btn btn-secondary mini" [disabled]="inCorso() === v.id" (click)="chiudiDettaglio(); inserisci(v)">{{ 'sales.inserisci' | translate }}</button>
            }
            @if (v.shopifyUrl) {
              <a class="btn btn-secondary mini" [href]="v.shopifyUrl" target="_blank" rel="noopener">{{ 'sales.detail.shopify' | translate }}</a>
            }
            }
            <!-- ⭐ 05/09/2026 (regola utente): «nel pop-up dei dettagli della
                 vendita manca il tasto modifica». Sta FUORI dal ramo «non
                 conforme»: i dati si correggono soprattutto quando qualcosa
                 non torna. Chiude il pop-up e apre il riquadro di modifica
                 sulla riga — è lì che i campi si scrivono. -->
            @if (canManage()) {
              <button class="btn btn-secondary mini" (click)="modificaDalDettaglio(v)">{{ 'sales.edit' | translate }}</button>
            }
          </div>
          <!-- ⭐ 06/09/2026 sera (segnalazione utente, Libro UX §9 e §9-ter): la ✕ è OBBLIGATORIA e sta
               NELL'ANGOLO in alto a destra della testata, staccata dalle azioni: in fila con le pillole
               grigie non si riconosceva come «chiudi». La testata è sticky: resta visibile scorrendo. -->
          <button type="button" class="pan-x" (click)="chiudiDettaglio()" [attr.aria-label]="'common.close' | translate" [attr.title]="'common.close' | translate">×</button>
        </header>

        @if (nonConforme(v)) {
          <div class="allarme">
            <b>{{ 'sales.notConform.title' | translate: { salute: saluteLeggibile(v) } }}</b>
            <div>{{ 'sales.notConform.msg' | translate }}</div>
          </div>
        }
        <section class="card pan-card">
          <h3>{{ 'sales.detail.title' | translate }}</h3>
          <dl class="coppie">
            <!-- ⭐ 06/09/2026 sera (segnalazione utente: «non riporta i prodotti di questa vendita
                 correttamente, sono indicate solo le rose»). La VENDITA porta un prodotto solo — il
                 primo SKU riconosciuto — ma l'ordine ne ha spesso di più: qui si mostrano TUTTE le
                 righe dell'ordine, lette da Orders, col segno su quella che ha generato la vendita. -->
            @if (ordine()?.prodotti?.length) {
              <dt>{{ 'sales.detail.righeOrdine' | translate: { n: ordine()!.prodotti!.length } }}</dt>
              <dd>
                <!-- ⭐ 07/09/2026 (regola utente «devo poter vedere foto e produttore di tutti
                     i prodotti nell'ordine»): ogni riga con la sua foto, chi lo fa, la nota di
                     specifica (quanti fiori) e dove è finita — la sua vendita e la sua consegna. -->
                <ul class="righe-ordine ricche">
                  @for (r of ordine()!.prodotti!; track $index) {
                    <li>
                      @if (r.immagine) {
                        <img class="mini" [src]="r.immagine" [alt]="r.nome || ''" loading="lazy" />
                      } @else { <span class="mini vuota" aria-hidden="true"></span> }
                      <span class="testo">
                        <b><span class="q">{{ r.quantita }}×</span> {{ r.nome || '—' }}</b>
                        @if (r.productId && r.productId === v.product?.id) { <span class="qui">{{ 'sales.detail.rigaDellaVendita' | translate }}</span> }
                        <span class="sotto">
                          @if (r.produttore) { <span>{{ 'sales.detail.loFa' | translate: { chi: r.produttore } }}</span> }
                          @if (r.prezzo != null) { <span class="muted"> · {{ r.prezzo | number: '1.2-2' }} €</span> }
                          @if (r.sku) { <span class="muted"> · {{ r.sku }}</span> }
                        </span>
                        @if (r.nota) { <span class="nota">{{ r.nota }}</span> }
                        <span class="sotto">
                          @if (r.consegnaId) { <a [routerLink]="['/deliveries', r.consegnaId]">{{ 'sales.detail.inConsegna' | translate }}</a> }
                          @else if (r.venditaId) { <span class="manca">{{ 'sales.detail.venditaSenzaConsegna' | translate }}</span> }
                          @else if (r.productId) { <span class="manca">{{ 'sales.detail.nessunaVendita' | translate }}</span> }
                        </span>
                      </span>
                    </li>
                  }
                </ul>
                @if (ordine()?.incompleto) {
                  <p class="alert-composto">{{ 'sales.detail.ordineIncompleto' | translate }}</p>
                }
              </dd>
            }
            <dt>{{ 'sales.detail.product' | translate }}</dt>
            <dd>
              <!-- ⭐ 05/09/2026 (regola utente): il nome del prodotto si clicca
                   e si vedono le foto. Se foto non ce ne sono resta testo: un
                   comando che non fa niente è peggio di nessun comando. -->
              @if (fotoProdotto(v).length) {
                <button type="button" class="nome-prodotto" (click)="apriFoto(v)"
                        [title]="'sales.detail.photos' | translate">
                  {{ v.product?.name ?? v.productName ?? '—' }}
                  <span class="conta-foto">🖼 {{ fotoProdotto(v).length }}</span>
                </button>
              } @else {
                {{ v.product?.name ?? v.productName ?? '—' }}
              }
              @if (v.variantName) { <span class="muted"> ({{ v.variantName }})</span> }
              @if (v.product?.sku) { <span class="muted"> · SKU {{ v.product?.sku }}</span> }
              <!-- Il PRODUTTORE: il partner che fa il prodotto. Non è per forza
                   quello a cui la vendita è stata proposta. -->
              @if (v.product?.partner?.insegna; as chi) {
                <div class="muted">{{ 'sales.detail.maker' | translate: { chi: chi } }}</div>
              } @else if (v.product?.line) {
                <div class="muted">{{ 'sales.detail.line' | translate: { linea: v.product?.line } }}</div>
              }
              <!-- ⭐ 07/09/2026 (regola utente): la NOTA DI SPECIFICA anche qui, sul prodotto
                   della vendita: è quello che il fioraio deve mettere dentro. -->
              @if (v.product?.note; as nota) { <div class="nota-specifica">{{ nota }}</div> }
            </dd>
            <dt>{{ (isPartner() ? 'sales.col.partnerPrice' : 'sales.detail.amount') | translate }}</dt>
            @if (isPartner()) {
              <dd>{{ v.prezzoPartner | number: '1.2-2' }} €</dd>
            } @else {
              <dd>{{ v.amount | number: '1.2-2' }} €@if (v.discountPercent) { <span class="muted"> · {{ 'sales.detail.discount' | translate }} {{ v.discountPercent }}%</span> }</dd>
            }
            <!-- ⭐ 04/09 (regola utente): anche all'ufficio il prezzo del partner. -->
            @if (!isPartner()) {
              <dt>{{ 'sales.col.partnerPrice' | translate }}</dt>
              <dd>{{ nettoPartner(v) | number: '1.2-2' }} €<span class="muted"> · {{ 'sales.detail.partnerPriceHint' | translate }}</span></dd>
            }
            <dt>{{ 'sales.detail.partner' | translate }}</dt>
            <dd>{{ v.partner?.insegna ?? ('sales.noPartner' | translate) }}@if (v.assignmentReason) { <div class="cella-sub">{{ v.assignmentReason }}</div> }
              <!-- ⭐ 04/09 (regola utente): chi abbiamo usato in passato, e a quanto. -->
              @if (canManage()) {
                <div><button type="button" class="btn btn-secondary mini" style="margin-top:6px"
                             (click)="storicoAperto() ? chiudiStorico() : apriStorico(v)">
                  {{ (storicoAperto() ? 'sales.history.close' : 'sales.history.open') | translate }}
                </button></div>
              }
            </dd>
            <!-- ⭐ 04/09 (regola utente): al partner niente destinatario né indirizzo. -->
            @if (!isPartner()) {
              <dt>{{ 'sales.detail.recipient' | translate }}</dt>
              <dd>{{ ((v.recipientFirstName || '') + ' ' + (v.recipientLastName || '')).trim() || '—' }}@if (v.recipientPhone) { <div class="cella-sub">{{ v.recipientPhone }}</div> }</dd>
              <dt>{{ 'sales.detail.address' | translate }}</dt>
              <dd>{{ v.recipientAddress || '—' }}@if (v.province?.code) { <span class="muted"> · {{ v.province?.code }}</span> }</dd>
            } @else if (v.province?.code) {
              <dt>{{ 'sales.detail.address' | translate }}</dt>
              <dd>{{ v.province?.code }}</dd>
            }
            <!-- ⭐ 04/09 (regola utente): la stessa consegna può essere già stata
                 fatta a mano. Si cercano quelle allo STESSO indirizzo. -->
            @if (canManage() && !v.delivery) {
              <dt></dt>
              <dd>
                <button type="button" class="btn btn-secondary mini" [disabled]="vicineCaricando()"
                        (click)="vicineAperto() ? chiudiVicine() : cercaVicine(v)">
                  {{ (vicineAperto() ? 'sales.reconcile.close' : 'sales.reconcile.open') | translate }}
                </button>
                @if (vicineAperto()) {
                  @if (vicineCaricando()) { <div class="muted">{{ 'common.loading' | translate }}</div> }
                  @else if (!vicine().length) { <div class="muted">{{ 'sales.reconcile.none' | translate }}</div> }
                  @else {
                    <ul class="vicine">
                      @for (c of vicine(); track c.id) {
                        <li>
                          <span>
                            <a [href]="'/deliveries/' + c.id" target="_blank" rel="noopener"><b>#{{ c.code }}</b></a>
                            <span class="muted"> · {{ c.date ? (c.date | date: 'dd/MM/yy') : '—' }}@if (c.partner) { · {{ c.partner }} }@if (c.servizio) { · {{ c.servizio }} }@if (c.ddt) { · DDT {{ c.ddt }} }</span>
                            <!-- ⭐ 08/09/2026 (regola utente): anche lo STATO. Tre consegne
                                 tutte uguali in elenco, e una già consegnata non è come una
                                 ancora da fare: chi sceglie deve vederlo senza aprire. -->
                            @if (c.status) { <span class="stato-consegna">{{ ('deliveries.status.' + c.status) | translate }}</span> }
                            <!-- Una riga proposta deve dire PERCHÉ è lì: il DDT
                                 uguale è una prova, l'indirizzo è un indizio. -->
                            <span class="perche">{{ ('sales.reconcile.by.' + (c.motivo ?? 'indirizzo')) | translate }}</span>
                          </span>
                          <button type="button" class="btn btn-primary mini" [disabled]="inCorso() === v.id"
                                  (click)="riconciliaCon(v, c)">{{ 'sales.reconcile.same' | translate }}</button>
                        </li>
                      }
                    </ul>
                  }
                }
              </dd>
            }
            <dt>{{ 'sales.detail.delivery' | translate }}</dt>
            <!-- ⭐ 06/09/2026 sera (segnalazione utente: «manca l'orario di consegna richiesto»):
                 la fascia chiesta dal cliente sta sull'ordine (attributo Shopify), non sulla vendita. -->
            <dd>{{ v.deliveryDate ? (v.deliveryDate | date: 'EEEE d MMMM yyyy') : ('sales.detail.notSet' | translate) }}@if (fasciaOrdine(); as f) { <b class="fascia">· {{ f }}</b> }@if (v.serviceType?.name) { <span class="muted"> · {{ v.serviceType?.name }}</span> }</dd>
            <dt>{{ 'sales.detail.linkedDelivery' | translate }}</dt>
            <dd>@if (v.delivery) { <a [href]="'/deliveries/' + v.delivery.id" target="_blank" rel="noopener">#{{ v.delivery.code }}</a> <span class="muted">· {{ 'status.delivery.' + v.delivery.status | translate }}</span> } @else { <span class="muted">{{ 'sales.detail.none' | translate }}</span> }</dd>
            <dt>{{ 'sales.col.orders' | translate }}</dt>
            <dd>@if (v.ordine) { {{ etichettaOrders(v.ordine) }}@if (sottoOrders(v.ordine); as sub) { <div class="cella-sub">{{ sub }}</div> } } @else { <span class="muted">—</span> }</dd>
            @if (v.historyAt) {
              <dt>{{ 'sales.col.historyAt' | translate }}</dt>
              <dd>{{ v.historyAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
            }
            <dt>{{ 'sales.detail.origin' | translate }}</dt>
            <dd>{{ v.source }}@if (v.externalOrderNumber) { <span class="muted"> · {{ 'sales.detail.order' | translate }} #{{ v.externalOrderNumber }}</span> } <span class="muted">· {{ v.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span></dd>
          </dl>
        </section>

        <!-- ⭐ 04/09 (regola utente): STORICO «chi abbiamo usato e a quanto» per
             prodotto × provincia. Solo ufficio: sono nomi e prezzi altrui. -->
        @if (storicoAperto()) {
          <section class="card pan-card">
            <h3>{{ 'sales.history.title' | translate }}</h3>
            @if (storicoCaricando()) {
              <p class="muted">{{ 'common.loading' | translate }}</p>
            }
            <!-- ⚠️ «as» vale solo sul primo @if: niente @else if qui (NG5002). -->
            @if (storico(); as st) {
              @if (st.regola && st.regola.status === 'accettata') {
                <p class="regola-attiva">{{ 'sales.history.rule' | translate: { partner: st.regola.insegna, prezzo: (st.regola.price | number: '1.2-2') } }}</p>
              }
              <p class="muted">{{ ('sales.history.base_' + st.base) | translate: { prodotto: st.prodotto, provincia: st.provincia } }}</p>
              @if (st.righe.length) {
                <table class="table storico">
                  <thead>
                    <tr>
                      <th>{{ 'sales.history.col.partner' | translate }}</th>
                      <th class="num">{{ 'sales.history.col.times' | translate }}</th>
                      <th class="num">{{ 'sales.history.col.price' | translate }}</th>
                      <th>{{ 'sales.history.col.last' | translate }}</th>
                      <th class="azioni"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of st.righe; track r.partnerId) {
                      <tr [class.spenta]="!r.attivo">
                        <td>
                          <b>{{ r.insegna }}</b>
                          <div class="cella-sub">
                            @if (!r.attivo) { <span class="ko">{{ 'sales.history.inactive' | translate }}</span> }
                            @else if (!r.operaInProvincia) { <span class="ko">{{ 'sales.history.notHere' | translate }}</span> }
                            @if (r.escluso) { <span class="muted"> · {{ 'sales.history.excluded' | translate }}</span> }
                          </div>
                        </td>
                        <td class="num">{{ r.vendite }}</td>
                        <td class="num">
                          <b>{{ r.prezzoModa | number: '1.2-2' }} €</b>
                          @if (r.prezzoMin !== r.prezzoMax) { <div class="cella-sub">{{ r.prezzoMin | number: '1.2-2' }}–{{ r.prezzoMax | number: '1.2-2' }} €</div> }
                          <div class="cella-sub">{{ 'sales.history.net' | translate: { prezzo: (r.nettoModa | number: '1.2-2') } }}</div>
                        </td>
                        <td>
                          {{ r.ultimaData | date: 'dd/MM/yy' }}@if (r.ultimoOrdine) { <span class="muted"> · #{{ r.ultimoOrdine }}</span> }
                          <!-- ⭐ 06/09 (regola utente): anche COSA è stato comprato (prodotto e variante) e la data di consegna. -->
                          @if (r.ultimoProdotto || r.ultimaVariante) { <div class="cella-sub">{{ r.ultimoProdotto }}@if (r.ultimaVariante) { <span class="muted"> ({{ r.ultimaVariante }})</span> }</div> }
                          @if (r.ultimaConsegna) { <div class="cella-sub muted">{{ 'sales.history.consegnata' | translate }} {{ r.ultimaConsegna | date: 'dd/MM/yy' }}</div> }
                          @if (r.vecchia) { <div class="cella-sub muted">{{ 'sales.history.old' | translate }}</div> }
                        </td>
                        <td class="azioni">
                          @if (r.attivo && (v.status === 'proposta' || v.status === 'da_gestire') && r.partnerId !== v.partner?.id) {
                            <button type="button" class="btn btn-primary mini" [disabled]="inCorso() === v.id"
                                    (click)="proponiA(v, r)">{{ 'sales.history.propose' | translate }}</button>
                          }
                          @if (r.attivo && !r.escluso && r.operaInProvincia && st.base === 'coppia') {
                            <button type="button" class="btn btn-secondary mini" [disabled]="inCorso() === v.id"
                                    (click)="creaRiconciliazione(v, r)">{{ 'sales.history.createRule' | translate }}</button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted">{{ 'sales.history.none' | translate }}</p>
              }
            }
          </section>
        }

        <section class="card pan-card">
          <h3>{{ 'sales.detail.registro' | translate }}</h3>
          @if (dettaglioCaricando()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
          @else if (!v.logs?.length) { <p class="muted">{{ 'sales.detail.noLogs' | translate }}</p> }
          @else {
            <ol class="registro">
              @for (l of v.logs; track l.id) {
                <li>
                  <span class="quando">{{ l.createdAt | date: 'dd/MM/yy HH:mm' }}</span>
                  <span class="chi">{{ chiLog(l) }}</span>
                  <span class="cosa">{{ l.message }}</span>
                </li>
              }
            </ol>
          }
        </section>
      </div>
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    (confermato)="eseguiConferma()" (annullato)="confermaPendente.set(null)" />
    }
  
    <!-- ⭐ 07/09/2026: il preventivo del partner. Salvarlo fa tre cose: dà il prezzo alla
         vendita, la propone a quel partner e scrive la regola per gli ordini successivi. -->
    @if (preventivoDi(); as pv) {
      <div class="ins-overlay" (click)="preventivoDi.set(null)"></div>
      <div class="ins-modal prev-modal" role="dialog" aria-modal="true">
        <header class="ins-head">
          <h2>{{ 'sales.detail.preventivoTitolo' | translate }}</h2>
          <button type="button" class="chiudi" (click)="preventivoDi.set(null)" aria-label="Chiudi">✕</button>
        </header>
        <div class="prev-corpo">
          <p class="muted">{{ 'sales.detail.preventivoSotto' | translate }}</p>
          <p><b>{{ pv.product?.name || pv.productName }}</b> @if (pv.partner) { <span class="muted">· {{ pv.partner.insegna }}</span> }</p>
          <!-- ⭐ 10/09/2026 (regola utente): A CHI è stato chiesto — a scelta fra i partner attivi
               nella provincia della vendita — e il prezzo che fa lui. -->
          <label class="fld">
            <span>{{ 'sales.detail.preventivoPartner' | translate }}</span>
            <select class="field" [(ngModel)]="partnerPreventivo" name="partnerPreventivo">
              <option value="">—</option>
              @for (p of partnerPerPreventivo(pv); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select>
            @if (pv.province?.code && !partnerPerPreventivo(pv).length) { <span class="muted">{{ 'sales.detail.preventivoNessunPartner' | translate: { provincia: pv.province?.name } }}</span> }
          </label>
          <label class="fld">
            <span>{{ 'sales.detail.preventivoPrezzo' | translate }}</span>
            <input class="field" type="number" step="0.01" min="0" [(ngModel)]="prezzoPreventivo" name="prezzoPreventivo" />
          </label>
          @if (messaggio(); as m) { <p [class.avviso-errore]="!m.ok">{{ m.testo }}</p> }
          <div class="prev-azioni">
            <button type="button" class="btn btn-secondary" (click)="preventivoDi.set(null)">{{ 'common.cancel' | translate }}</button>
            <button type="button" class="btn btn-primary" [disabled]="inCorso() === pv.id" (click)="salvaPreventivo(pv)">{{ 'sales.detail.salvaPreventivo' | translate }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      /* Pop-up inserimento consegna */
      .ins-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90;
        backdrop-filter: blur(2px); }
      .ins-modal { position: fixed; z-index: 91; top: 3vh; left: 50%; transform: translateX(-50%);
        width: min(920px, 94vw); max-height: 94vh; display: flex; flex-direction: column;
        background: var(--surface, #fff); border-radius: 20px; overflow: hidden;
        box-shadow: 0 24px 60px rgba(0,0,0,0.28); }
      .ins-head { display: flex; align-items: center; justify-content: space-between;
        padding: 14px 20px; border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.08)); flex: 0 0 auto; }
      .ins-head h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
      .ins-x { border: none; background: var(--fill, #f0f0f2); width: 30px; height: 30px; border-radius: 50%;
        font-size: 18px; line-height: 1; cursor: pointer; color: var(--text-secondary, #555); }
      .ins-body { overflow-y: auto; padding: 4px 6px 12px; flex: 1 1 auto; }
      .sync { padding: 16px 18px; margin-bottom: 16px; }
      .sync .titolo { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; margin: 0 0 10px; }
      .sync .ko { color: var(--danger, #d70015); margin: 0; font-size: 13.5px; }
      .sync .hint { margin: 10px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      .conti { display: flex; flex-wrap: wrap; gap: 8px; }
      .conto {
        font-size: 13px; padding: 4px 12px; border-radius: 980px; color: var(--text-secondary);
        background: var(--fill); border: 1px solid transparent;
      }
      .conto strong { color: var(--text); font-variant-numeric: tabular-nums; }
      .conto.buono {
        background: color-mix(in srgb, var(--green) 10%, transparent);
        border-color: color-mix(in srgb, var(--green) 25%, transparent);
        color: var(--green);
      }
      .conto.buono strong { color: var(--green); }
      .esempi { margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: var(--text-secondary); }
      .tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
      .tab {
        appearance: none; font: inherit; font-size: 13.5px; font-weight: 550;
        border: 1px solid var(--hairline); background: var(--surface); color: var(--text);
        border-radius: 980px; padding: 7px 15px; cursor: pointer;
        display: inline-flex; gap: 8px; align-items: center;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .tab .pill {
        font-size: 11.5px; font-variant-numeric: tabular-nums; line-height: 1;
        padding: 3px 7px; border-radius: 980px; background: var(--fill);
      }
      .tab.on .pill { background: rgba(255, 255, 255, 0.18); }
      .badge {
        display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 550;
        padding: 3px 11px; border-radius: 980px; white-space: nowrap;
        background: color-mix(in srgb, var(--c) 11%, transparent); color: var(--c);
      }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: none; }
      /* La tabella non aveva NESSUNO stile (nessuna regola globale la copre):
         stesso vestito della lista consegne. */
      th.ordinabile { cursor: pointer; user-select: none; }
      th.ordinabile:hover { color: var(--text); }
      .mod-row td { background: var(--fill); padding: 14px 16px; }
      .mod-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px 14px; }
      .mod-grid label { display: flex; flex-direction: column; gap: 4px; }
      .mod-grid label > span { font-size: 12px; font-weight: 550; color: var(--text-secondary); }
      .mod-grid .largo { grid-column: 1 / -1; }
      .mod-azioni { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
      .mod-errore { margin-top: 8px; color: var(--red); font-size: 13px; }
      .mod-nota { margin-top: 6px; color: var(--text-secondary); font-size: 12px; }
      .table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .table th, .table td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      .table th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; position: sticky; top: 0; background: var(--surface); }
      .table th.num, .table td.num { text-align: right; }
      .table tbody tr { transition: background 0.14s ease; }
      .table tbody tr:hover { background: rgba(120, 120, 128, 0.05); }
      .table tr:last-child td { border-bottom: none; }
      .table td { vertical-align: middle; }
      /* ⚠️ Era «td:nth-child(3)», che dava il respiro alla colonna SBAGLIATA
         (Stato in Orders, non Prodotto) e prendeva in pieno anche la riga di
         modifica, che ha un solo td con colspan. Le colonne si scelgono per
         classe: i numeri si spostano da soli quando una colonna è condizionale. */
      .table td.prodotto { white-space: normal; min-width: 220px; }
      .azioni-riga { display: flex; gap: 10px /* audit 31/08: 6px fra Accetta e Rifiuta, esiti opposti */; justify-content: flex-end; white-space: nowrap; }
      .btn.mini { padding: 4px 12px; font-size: 12.5px; }
      .vuoto { padding: 40px 28px; text-align: center; color: var(--text-secondary); font-size: 14px; }
      .esito { margin-top: 10px; color: var(--danger, #d70015); font-size: 13.5px; }
      .esito.ok { color: var(--green); }
      .motivo { display: block; font-size: 11px; color: var(--text-tertiary); margin-top: 2px; max-width: 260px; }
      /* La colonna della trasmissione: il badge dice l'esito, sotto i due canali.
         Niente a capo sul badge, o «Non arrivata» spezza la riga in due. */
      .trasmessa { white-space: nowrap; }
      .trasmessa .canali { display: block; margin-top: 3px; font-size: 10.5px; color: var(--text-tertiary); }
      .trasmessa .canali span { margin-right: 6px; }
      .trasmessa .canali span.ok { color: var(--text-secondary); }
      .trasmessa .canali span.ko { color: #FF3B30; text-decoration: line-through; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .mono { font-variant-numeric: tabular-nums; }
      .muted { color: var(--text-tertiary); }
      .cerca-riga { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .cerca-riga .field { max-width: 340px; }
      .conto-righe { font-size: 12.5px; color: var(--text-secondary); }
      .btn-riprova { margin-left: 12px; }
      /* ⭐ 04/09: pop-up di dettaglio — velo + pannello, come nel Customer
         Service. Il pannello sta dentro la viewport e scorre lui (Libro §9). */
      .riga-link { cursor: pointer; }
      .nota-specifica { display: inline-block; margin-top: 4px; font-size: 12px; padding: 1px 8px; border-radius: 980px; background: var(--fill); color: var(--text-secondary); }
      .prev-modal { max-width: 460px; }
      .prev-corpo { padding: 16px 18px 18px; display: grid; gap: 10px; }
      .prev-corpo .fld { display: grid; gap: 4px; font-size: 13px; }
      .prev-azioni { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
      .righe-ordine.ricche { list-style: none; padding-left: 0; display: grid; gap: 8px; }
      .righe-ordine.ricche li { display: flex; gap: 10px; align-items: flex-start; }
      .righe-ordine .mini { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid var(--hairline); flex: none; background: var(--fill); }
      .righe-ordine .mini.vuota { display: inline-block; }
      .righe-ordine .testo { display: grid; gap: 1px; min-width: 0; }
      .righe-ordine .sotto { font-size: 12.5px; color: var(--text-secondary); }
      .righe-ordine .nota { font-size: 12.5px; color: var(--text); background: var(--fill); border-radius: 6px; padding: 1px 7px; justify-self: start; }
      .righe-ordine .qui { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; margin-left: 6px; color: var(--gold-strong, #B8963E); }
      .righe-ordine .manca { color: var(--orange, #c93400); font-weight: 550; }
      .alert-composto { margin: 8px 0 0; padding: 8px 12px; border-radius: 10px; background: rgba(201, 52, 0, .08); color: var(--orange, #c93400); font-size: 13px; font-weight: 550; }
      .righe-ordine { margin: 0; padding-left: 18px; }
      .righe-ordine li { margin: 1px 0; }
      .righe-ordine .q { font-variant-numeric: tabular-nums; color: var(--text-secondary); }
      .fascia { margin-left: 4px; }
      .velo { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90; backdrop-filter: blur(2px); }
      .pannello { position: fixed; z-index: 91; top: 4vh; left: 50%; transform: translateX(-50%);
        width: min(760px, 94vw); max-height: 92vh; overflow-y: auto;
        background: var(--bg, #f5f5f7); border: 1px solid var(--hairline); border-radius: 20px;
        padding: 0 18px 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.28); }
      .pan-testa { position: sticky; top: 0; z-index: 2; background: var(--bg, #f5f5f7);
        display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        padding: 16px 44px 12px 0; border-bottom: 1px solid var(--hairline); margin-bottom: 14px; }
      .pan-x { position: absolute; top: 12px; right: 0; border: 1px solid var(--hairline); background: var(--surface, #fff); width: 32px; height: 32px; border-radius: 50%;
        font-size: 19px; line-height: 1; cursor: pointer; color: var(--text-secondary, #555); display: grid; place-items: center; }
      .pan-x:hover { background: var(--fill, #f0f0f2); color: var(--text); }
      .pan-titolo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .pan-titolo h2 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
      .pan-azioni { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pan-card { padding: 16px 18px; margin-bottom: 12px; }
      .pan-card h3 { margin: 0 0 10px; font-size: 15px; font-weight: 650; }
      .allarme { background: rgba(215, 0, 21, 0.08); border: 1px solid rgba(215, 0, 21, 0.28); color: var(--danger, #b3261e); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
      .allarme div { color: var(--text); margin-top: 2px; }
      .ko-badge { background: rgba(215, 0, 21, 0.1); color: var(--danger, #b3261e); margin-right: 6px; }
      .regola-attiva { margin: 0 0 8px; font-size: 13px; font-weight: 550; }
      .nome-prodotto { background: none; border: 0; padding: 0; font: inherit; color: var(--text-primary);
        cursor: zoom-in; text-decoration: underline; text-underline-offset: 2px; }
      .conta-foto { margin-left: 6px; font-size: 11px; color: var(--text-secondary); text-decoration: none; }
      /* ⭐ 06/09 (segnalazione utente): le foto stanno SOPRA il pop-up di dettaglio (z 95/96 > 90/91): prima si aprivano dietro e sembrava che il click non facesse niente. */
      .foto-velo { position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 95; }
      .foto-box { position: fixed; inset: 5vh 5vw; z-index: 96; background: var(--surface, #fff);
        border-radius: 14px; padding: 14px; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
      .foto-x { position: absolute; top: 8px; right: 10px; background: none; border: 0; font-size: 24px; cursor: pointer; }
      .foto-scorri { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; align-items: flex-start; }
      .foto-scorri img { max-width: 100%; max-height: 70vh; border-radius: 10px; }
      ul.vicine { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      ul.vicine li { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
      .perche { display: block; font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
      /* I pezzi e gli altri prodotti dello stesso ordine: sotto il nome, piu' piccoli,
         perche' sono contesto e non devono rubare la scena al prodotto della riga. */
      td.prodotto .pezzi { margin-left: 6px; font-variant-numeric: tabular-nums; }
      /* Il prodotto sotto il numero d'ordine: e' un promemoria, non la colonna vera,
         quindi resta su una riga e si taglia invece di allargare la colonna. */
      .prod-riassunto {
        font-family: inherit; max-width: 220px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      td.prodotto .altri-prodotti {
        margin-top: 2px; font-size: 11.5px; color: var(--text-secondary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;
      }
      /* Lo stato della consegna proposta: una pastiglia, per distinguere a colpo
         d'occhio una gia' consegnata da una ancora da fare. */
      .stato-consegna {
        display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 10px;
        background: var(--fill); font-size: 11.5px; color: var(--text-secondary); white-space: nowrap;
      }
      table.storico { width: 100%; font-size: 13px; }
      table.storico td, table.storico th { padding: 6px 8px; }
      table.storico tr.spenta { opacity: 0.6; }
      table.storico .azioni { white-space: nowrap; text-align: right; }
      table.storico .azioni .btn + .btn { margin-left: 6px; }
      .coppie { display: grid; grid-template-columns: 170px 1fr; gap: 8px 14px; margin: 0; font-size: 14px; }
      .coppie dt { color: var(--text-tertiary); font-size: 12.5px; }
      .coppie dd { margin: 0; }
      .cella-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
      .registro { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .registro li { display: grid; grid-template-columns: 110px 160px 1fr; gap: 10px; font-size: 13.5px;
        padding-bottom: 8px; border-bottom: 1px solid var(--hairline); }
      .registro li:last-child { border-bottom: none; }
      .registro .quando { color: var(--text-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .registro .chi { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @media (max-width: 640px) {
        .coppie { grid-template-columns: 1fr; gap: 2px 0; }
        .coppie dt { margin-top: 8px; }
        .registro li { grid-template-columns: 1fr; gap: 2px; }
      }
    `,
  ],
})
export class SalesListComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  readonly vendite = signal<Sale[]>([]);
  readonly caricando = signal(true);
  readonly erroreCarico = signal<string | null>(null);
  readonly tirando = signal(false);
  readonly inCorso = signal<string | null>(null);
  readonly esitoSync = signal<any>(null);
  readonly messaggio = signal<{ ok: boolean; testo: string } | null>(null);
  /** ⭐ 04/09 (regola utente): lo storico «chi abbiamo usato», dentro il pop-up. */
  readonly storico = signal<Storico | null>(null);
  readonly storicoAperto = signal(false);
  readonly storicoCaricando = signal(false);
  /**
   * ⭐ 08/09/2026 — GLI ALTRI PRODOTTI DELLO STESSO ORDINE.
   *
   * Dal 07/09 ogni riga d'ordine fa la sua vendita: un ordine con la torta e il bouquet
   * sono due righe in tabella, che l'ordinamento può allontanare. Guardandone una non si
   * capiva se fosse tutto l'ordine o metà — ed è proprio il caso che porta a consegnare
   * mezzo ordine. Le vendite sorelle sono già in pagina: si leggono da lì, senza chiedere
   * niente al server.
   */
  altriProdotti(s: Sale): string | null {
    const ordine = s.externalOrderNumber;
    if (!ordine) return null;
    const nomi = this.vendite()
      .filter((x) => x.id !== s.id && x.externalOrderNumber === ordine && x.status !== 'annullata')
      .map((x) => x.product?.name ?? x.productName ?? null)
      .filter((x): x is string => !!x);
    if (!nomi.length) return null;
    // Senza doppioni: due righe uguali dello stesso prodotto si dicono una volta sola.
    return [...new Set(nomi)].join(' · ');
  }

  /** ⭐ 04/09: le consegne allo stesso indirizzo, per riconciliare la vendita. */
  readonly vicine = signal<ConsegnaVicina[]>([]);
  readonly vicineAperto = signal(false);
  readonly vicineCaricando = signal(false);
  // Default «Da gestire» (deciso dall'utente 31/08): all'apertura si vede il
  // lavoro aperto, non tutto lo storico.
  readonly filtro = signal<string>('da_gestire');

  /** «Da gestire» raccoglie gli APERTI: da smistare + proposti a un partner
   *  in attesa di risposta (chiesto dall'utente 31/08 — «da gestire deve
   *  includere anche Proposte»). «Storico» raccoglie TUTTO il gestito. */
  static readonly APERTI = ['da_gestire', 'proposta'];
  static readonly STORICO = ['accettata', 'non_accettata', 'annullata'];
  readonly tab = [
    { chiave: 'da_gestire' }, { chiave: 'storico' }, { chiave: 'tutte' },
  ];
  private inAperti(s: Sale): boolean {
    return SalesListComponent.APERTI.includes(s.status);
  }
  private inStorico(s: Sale): boolean {
    return SalesListComponent.STORICO.includes(s.status);
  }

  readonly canManage = computed(() => ['ADMIN', 'OPERATION'].includes(this.auth.user()?.role ?? ''));

  /** §8-bis: la ricerca, per ordine, prodotto, partner o provincia. */
  readonly cercaTesto = signal('');
  get cerca(): string { return this.cercaTesto(); }
  set cerca(v: string) { this.cercaTesto.set(v); }

  // ⭐ 03/09 (regola utente): default = data di consegna più URGENTE in cima;
  // click sull'intestazione per cambiare colonna o verso.
  readonly ordinamento = signal<{ campo: string; verso: 1 | -1 }>({ campo: 'deliveryDate', verso: 1 });

  ordina(campo: string): void {
    const o = this.ordinamento();
    if (o.campo === campo) this.ordinamento.set({ campo, verso: (o.verso * -1) as 1 | -1 });
    else this.ordinamento.set({ campo, verso: campo === 'amount' ? -1 : 1 });
  }
  freccia(campo: string): string {
    const o = this.ordinamento();
    return o.campo === campo ? (o.verso === 1 ? ' ↑' : ' ↓') : '';
  }

  readonly visibili = computed(() => {
    const f = this.filtro();
    const base = f === 'tutte' ? this.vendite()
      : f === 'da_gestire' ? this.vendite().filter((s) => this.inAperti(s))
      : f === 'storico' ? this.vendite().filter((s) => this.inStorico(s))
      : this.vendite().filter((s) => s.status === f);
    const q = this.cercaTesto().trim().toLowerCase();
    const filtrate = !q ? base : base.filter((s) =>
      (s.externalOrderId ?? '').toLowerCase().includes(q) ||
      (s.externalOrderNumber ?? '').toLowerCase().includes(q) ||
      (s.product?.name ?? s.productName ?? '').toLowerCase().includes(q) ||
      (s.partner?.insegna ?? '').toLowerCase().includes(q) ||
      (s.province?.code ?? '').toLowerCase().includes(q) ||
      s.brand.toLowerCase().includes(q));
    const { campo, verso } = this.ordinamento();
    const chiave = (s: Sale): string | number | null => {
      switch (campo) {
        case 'ordine': return s.externalOrderNumber ? Number(s.externalOrderNumber) || s.externalOrderNumber : null;
        case 'orders': return s.ordine ? this.etichettaOrders(s.ordine) : null;
        case 'historyAt': return s.historyAt ? new Date(s.historyAt).getTime() : null;
        case 'prodotto': return s.product?.name ?? s.productName ?? null;
        case 'provincia': return s.province?.code ?? null;
        case 'partner': return s.partner?.insegna ?? null;
        // Si ordina per gravità: prima quello che non è arrivato.
        // L'ordine dei passi del Customer Service, non l'alfabeto.
        case 'cs': return s.customerService
          ? ['da_gestire','ricerca_fornitore','in_pagamento','attesa_consegna','in_app','non_consegnata','comunicazione','gestito']
              .indexOf(s.customerService.gestione) + 1 || 98
          : 99;
        case 'trasmessa': return s.trasmissione ? ({ fallita: 0, parziale: 1, attesa: 2, inviata: 3 } as Record<string, number>)[s.trasmissione.esito] ?? 9 : 9;
        case 'deliveryDate': return s.deliveryDate ?? null;
        case 'amount': return s.prezzoPartner ?? s.amount ?? null;
        default: return (s as any)[campo] ?? null;
      }
    };
    return [...filtrate].sort((a, b) => {
      const x = chiave(a);
      const y = chiave(b);
      // Chi non ha il valore va in fondo con qualsiasi verso: una vendita
      // senza data di consegna non è «la più urgente».
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const esito = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'it');
      return esito * verso;
    });
  });

  quante(chiave: string): number {
    return chiave === 'tutte' ? this.vendite().length
      : chiave === 'da_gestire' ? this.vendite().filter((s) => this.inAperti(s)).length
      : chiave === 'storico' ? this.vendite().filter((s) => this.inStorico(s)).length
      : this.vendite().filter((s) => s.status === chiave).length;
  }

  etichetta(stato: string) { return STATI[stato]?.etichetta ?? stato; }
  colore(stato: string) { return STATI[stato]?.colore ?? '#6e6e73'; }

  /**
   * ⭐ 08/09/2026 (regola utente: «fammi capire chiaramente se è stata trasmessa al
   * partner»). Quattro esiti, quattro colori: in attesa (grigio), inviata (verde),
   * parziale (ambra: un canale sì e uno no), fallita (rosso).
   */
  /**
   * ⭐ 08/09/2026 — il vocabolario del Customer Service (`src/lib/gestione.ts` di
   * deluxy-messaging), etichette e colori compresi.
   *
   * ⚠️ Qui c'è una COPIA di nomi e colori, e va saputo: il dato (quale stato ha
   * l'ordine) si legge da loro, ma il modo di scriverlo a schermo no, perché il loro
   * endpoint manda la chiave e basta. Se di là nasce uno stato nuovo, qui non si
   * inventa niente: si mostra **la chiave così com'è**, che è brutto ma vero — molto
   * meglio di un'etichetta sbagliata o di una casella vuota che sembra «niente».
   * Se un giorno l'endpoint manderà anche il nome, questa mappa si butta.
   */
  private static readonly GESTIONI_CS: Record<string, { nome: string; colore: string }> = {
    da_gestire: { nome: 'Da iniziare', colore: '#6e6e73' },
    ricerca_fornitore: { nome: 'Ricerca fornitore', colore: '#8944ab' },
    in_pagamento: { nome: 'In pagamento', colore: '#c93400' },
    attesa_consegna: { nome: 'Attesa consegna', colore: '#b8963e' },
    in_app: { nome: 'In App', colore: '#5856d6' },
    non_consegnata: { nome: 'Non consegnata', colore: '#b3261e' },
    comunicazione: { nome: 'Comunicazione con cliente', colore: '#0071e3' },
    gestito: { nome: 'Gestito', colore: '#248a3d' },
  };

  etichettaCs(chiave: string): string {
    return SalesListComponent.GESTIONI_CS[chiave]?.nome ?? chiave;
  }

  coloreCs(chiave: string): string {
    return SalesListComponent.GESTIONI_CS[chiave]?.colore ?? '#6e6e73';
  }

  coloreInvio(esito: string) {
    return { attesa: '#8e8e93', inviata: '#34C759', parziale: '#FF9F0A', fallita: '#FF3B30' }[esito] ?? '#8e8e93';
  }

  /** Il perché per esteso, sul passaggio del mouse: «parziale» da solo non basta. */
  dettaglioInvio(t: { app?: { testo: string; quando: string } | null; mail?: { testo: string; quando: string } | null }) {
    const righe = [t.app?.testo, t.mail?.testo].filter(Boolean) as string[];
    return righe.length ? righe.join('\n') : 'Nessun tentativo registrato: la proposta è appena nata, oppure risale a prima che questa traccia esistesse.';
  }

  /** Un partner risponde solo alle vendite proposte a lui; admin e operation a tutte. */
  /** Quanto incassa il partner: importo meno la quota Deluxy (lo sconto della vendita). */
  nettoPartner(v: Sale): number {
    return Math.round((v.amount ?? 0) * (1 - (v.discountPercent ?? 0) / 100) * 100) / 100;
  }

  /** ⭐ 04/09 (regola utente): l'ordine in Orders non è «conforme». */
  nonConforme(s: Sale): boolean {
    const salute = s.ordine?.salute;
    return !!salute && salute !== 'conforme';
  }

  /** «non_pagato» → «non pagato», tradotto se c'è la voce. */
  saluteLeggibile(s: Sale): string {
    const salute = s.ordine?.salute ?? '';
    const chiave = 'sales.orders.salute.' + salute;
    const tradotta = this.translate.instant(chiave);
    return tradotta === chiave ? salute.replace(/_/g, ' ') : tradotta;
  }

  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  puoRispondere(s: Sale): boolean {
    const u = this.auth.user();
    if (!u) return false;
    if (u.role === 'PARTNER') return s.partner?.id === (u as any).partnerId;
    // ⭐ 04/09 (regola utente): l'ufficio accetta/rifiuta SOLO se la vendita è
    // davvero andata a un partner. Senza partner non c'è niente da accettare:
    // si «Inserisce» dall'ufficio.
    return this.canManage() && !!s.partner?.id;
  }

  righeConteggio(c: Record<string, number>) {
    return Object.entries(c ?? {}).filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]).map(([chiave, n]) => ({ chiave, n }));
  }

  // ---- MODIFICA VENDITA (⭐ 03/09, regola utente) ---------------------------
  readonly modificaId = signal<string | null>(null);
  readonly modInCorso = signal(false);
  readonly modErrore = signal<string | null>(null);
  readonly province = signal<{ id: string; code: string }[]>([]);
  mod: { amount: number | null; deliveryDate: string; provinceId: string;
    recipientFirstName: string; recipientLastName: string; recipientAddress: string; recipientPhone: string } = {
    amount: null, deliveryDate: '', provinceId: '', recipientFirstName: '', recipientLastName: '', recipientAddress: '', recipientPhone: '',
  };

  /**
   * Modifica CHIESTA DAL POP-UP (05/09/2026, regola utente). Il pop-up si
   * chiude e il riquadro di modifica si apre sulla riga della vendita: quella
   * riga può stare fuori schermo, e un comando che non si vede è un comando
   * che non c'è — perciò la si porta sotto gli occhi.
   */
  modificaDalDettaglio(s: Sale): void {
    this.chiudiDettaglio();
    if (this.modificaId() !== s.id) this.apriModifica(s);
    setTimeout(() => document.querySelector('.mod-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  /**
   * L'INDIRIZZO DELLA VENDITA PASSA DA GOOGLE (05/09/2026, regola utente).
   *
   * Il riquadro di modifica nasce e muore col click, quindi l'autocomplete non
   * si può agganciare una volta per tutte all'avvio: si aggancia ogni volta
   * che il riquadro compare, sul campo che c'è in quel momento.
   */
  private readonly zone = inject(NgZone);
  readonly mapsMancante = signal(false);
  readonly provinciaDaGoogle = signal<string | null>(null);
  private autocomplete: any = null;
  private ultimaSceltaGoogle = 0;
  private chiaveMaps: string | null | undefined;

  private async agganciaGoogle(): Promise<void> {
    const input = document.querySelector('.mod-indirizzo') as HTMLInputElement | null;
    if (!input) return;
    if (this.chiaveMaps === undefined) {
      this.chiaveMaps = await new Promise<string | null>((ok) => {
        this.http.get<{ googleMapsBrowserKey: string | null }>(`${environment.apiUrl}/settings/public`)
          .subscribe({ next: (c) => ok(c?.googleMapsBrowserKey ?? null), error: () => ok(null) });
      });
    }
    if (!this.chiaveMaps) {
      // ⚠️ Non in silenzio: senza chiave il campo resta un testo normale, e
      // sembrerebbe rotto invece che da configurare.
      this.mapsMancante.set(true);
      return;
    }
    this.mapsMancante.set(false);
    try {
      await loadGoogleMaps(this.chiaveMaps);
      const g = (window as any).google;
      this.autocomplete = new g.maps.places.Autocomplete(input, {
        // Anche indirizzi esteri e luoghi con un nome: le stesse regole del
        // modulo consegna, così i due campi non si comportano in modo diverso.
        fields: ['formatted_address', 'geometry', 'address_components', 'name'],
      });
      this.autocomplete.addListener('place_changed', () => {
        const place = this.autocomplete.getPlace();
        this.zone.run(() => this.prendiDaGoogle(place));
      });
    } catch {
      /* script non caricato: resta il campo di testo, e ci pensa il server */
    }
  }

  /** L'indirizzo scelto, e la provincia che ne discende. */
  private prendiDaGoogle(place: any): void {
    if (!place) return;
    this.ultimaSceltaGoogle = Date.now();
    const grezzo = String(place.formatted_address || '');
    // Via il Google Plus Code davanti: è una posizione in codice, non un
    // indirizzo leggibile.
    this.mod.recipientAddress = grezzo.replace(PLUS_CODE, '').trim();
    const comp = (place.address_components || []).find((c: any) => (c.types || []).includes('administrative_area_level_2'));
    const code = comp?.short_name as string | undefined;
    const prov = code ? this.province().find((p) => p.code === code) : undefined;
    if (prov) {
      // La provincia SEGUE l'indirizzo: è lei che decide a chi va l'ordine.
      this.mod.provinceId = prov.id;
      this.provinciaDaGoogle.set(prov.code);
    } else {
      // ⚠️ Se Google dà una provincia che non abbiamo a catalogo NON si
      // indovina: resta quella scelta a mano.
      this.provinciaDaGoogle.set(null);
    }
  }

  /**
   * Uscendo dal campo, il testo scritto a mano si normalizza col PRIMO
   * risultato di Google. Non subito dopo un suggerimento: il click sul menu
   * di Google fa blur prima di `place_changed`.
   */
  normalizzaIndirizzo(): void {
    setTimeout(() => {
      if (Date.now() - this.ultimaSceltaGoogle < 800) return;
      const valore = (this.mod.recipientAddress ?? '').trim();
      if (!valore) return;
      const g = (window as any).google;
      if (!g?.maps?.Geocoder) return;
      new g.maps.Geocoder().geocode({ address: valore, region: 'it' }, (results: any, status: string) => {
        this.zone.run(() => {
          if (status !== 'OK' || !results?.length) return;
          this.prendiDaGoogle(results[0]);
        });
      });
    }, 250);
  }

  apriModifica(s: Sale): void {
    if (this.modificaId() === s.id) { this.modificaId.set(null); return; }
    this.provinciaDaGoogle.set(null);
    this.mod = {
      amount: s.amount,
      deliveryDate: (s.deliveryDate ?? '').slice(0, 10),
      provinceId: s.province?.id ?? '',
      recipientFirstName: s.recipientFirstName ?? '',
      recipientLastName: s.recipientLastName ?? '',
      recipientAddress: s.recipientAddress ?? '',
      recipientPhone: s.recipientPhone ?? '',
    };
    this.modErrore.set(null);
    this.modificaId.set(s.id);
    if (!this.province().length) {
      this.http.get<{ id: string; code: string }[]>(`${environment.apiUrl}/provinces`).subscribe({
        next: (d) => this.province.set((d ?? []).map((p) => ({ id: p.id, code: p.code }))),
        error: () => undefined,
      });
    }
    // Il campo esiste solo da ora: si aggancia quando il riquadro è in pagina.
    setTimeout(() => void this.agganciaGoogle(), 0);
  }

  salvaModifica(s: Sale): void {
    this.modErrore.set(null);
    this.modInCorso.set(true);
    const body: Record<string, unknown> = {
      amount: this.mod.amount,
      deliveryDate: this.mod.deliveryDate || null,
      recipientFirstName: this.mod.recipientFirstName,
      recipientLastName: this.mod.recipientLastName,
      recipientAddress: this.mod.recipientAddress,
      recipientPhone: this.mod.recipientPhone,
    };
    if (this.mod.provinceId && this.mod.provinceId !== s.province?.id) body['provinceId'] = this.mod.provinceId;
    this.http.patch(`${environment.apiUrl}/sales/${s.id}`, body).subscribe({
      next: () => { this.modInCorso.set(false); this.modificaId.set(null); this.carica(); },
      error: (err) => { this.modInCorso.set(false); this.modErrore.set(err?.error?.message ?? 'Errore'); },
    });
  }

  constructor() {
    this.carica();
    // ⭐ 04/09 (regola utente): le vendite arrivano DA SOLE (il cron smista
    // ogni 15′, il partner risponde): giro silenzioso ogni 30″, fermo mentre
    // si modifica, si inserisce o si tira.
    avviaAutoAggiornamento({
      ricarica: () => this.carica(true),
      sospeso: () => !!(this.modificaId() || this.modInCorso() || this.inserisciVendita() || this.dettaglio() || this.confermaPendente()
        || this.tirando() || this.inCorso() || this.caricando()),
    });
  }

  ricarica(): void { this.carica(); }

  private carica(silenzioso = false): void {
    if (!silenzioso) {
      this.caricando.set(true);
      this.erroreCarico.set(null);
    }
    this.http.get<Sale[]>(`${environment.apiUrl}/sales`).subscribe({
      next: (r) => { this.vendite.set(r ?? []); this.caricando.set(false); },
      // ⚠️ Legge 9 del Libro: un fallimento NON e' mai una lista vuota.
      // Prima qui c'era vendite.set([]) — il guasto sembrava «zero vendite».
      error: (e) => {
        if (silenzioso) return;
        this.caricando.set(false);
        this.erroreCarico.set(e?.error?.message ?? 'Caricamento non riuscito: riprova.');
      },
    });
  }

  /**
   * Tira gli ordini da Deluxy Orders.
   *
   * `applica = false` non scrive niente e mostra solo il conto: e' il modo
   * giusto di guardare prima, perche' un ordine su quattro non e' smistabile
   * (senza provincia o senza SKU) e finirebbe in coda «da gestire».
   */
  tira(applica: boolean): void {
    this.tirando.set(true);
    this.esitoSync.set(null);
    this.http.post<any>(`${environment.apiUrl}/orders-sync/esegui`, { limite: 200, applica }).subscribe({
      next: (r) => { this.tirando.set(false); this.esitoSync.set(r); if (applica) this.carica(); },
      error: (e) => {
        this.tirando.set(false);
        this.esitoSync.set({ ok: false, messaggio: e?.error?.message ?? 'Tiraggio non riuscito' });
      },
    });
  }

  accetta(s: Sale): void { this.rispondi(s, 'accetta'); }
  /** ⭐ 04/09 (regola utente): il rifiuto CHIEDE conferma e dice l'esito —
   *  per il partner la vendita torna all'ufficio, per l'ufficio va in storico. */
  rifiuta(s: Sale): void {
    const partner = this.auth.user()?.role === 'PARTNER';
    this.confermaPendente.set({
      titolo: this.translate.instant(partner ? 'sales.refusePartnerTitle' : 'sales.refuseOfficeTitle', { n: s.externalOrderNumber ?? '' }),
      messaggio: this.translate.instant(partner ? 'sales.refusePartnerMsg' : 'sales.refuseOfficeMsg'),
      verbo: this.translate.instant('sales.refuse'),
      tono: 'danger',
      azione: () => this.rispondi(s, 'rifiuta'),
    });
  }

  // ---- POP-UP DI DETTAGLIO (⭐ 04/09, regola utente) --------------------
  /**
   * ⭐ 06/09/2026 (regola utente): il link all'app Ricerca fornitori (search-deluxy)
   * con l'ordine già caricato. L'app legge `?brand=&ordine=&categoria=` (deep link,
   * index.html → applyDeepLink): brand fra deluxy.it / deluxyflowers.com /
   * cakedesign.me («Flowers» delle vendite = deluxyflowers.com), categoria
   * «pasticceria» per torte e dolci, «fioraio» per i fiori. Senza numero d'ordine
   * non c'è niente da caricare: nessun bottone.
   */
  linkRicercaFornitore(s: Sale): string | null {
    const numero = String(s.externalOrderNumber ?? '').replace(/^#/, '').trim();
    if (!numero) return null;
    const q = new URLSearchParams({ ordine: numero });
    const b = String(s.brand ?? '').toLowerCase();
    const brand = b === 'flowers' || b.includes('deluxyflowers') ? 'deluxyflowers.com' : b.includes('cakedesign') ? 'cakedesign.me' : b.includes('deluxy') ? 'deluxy.it' : '';
    if (brand) q.set('brand', brand);
    const cat = String((s.product as { category?: { name?: string | null } | null } | null | undefined)?.category?.name ?? '').toLowerCase();
    if (/tort|dolc|cake|cdm|pasticc/.test(cat) || brand === 'cakedesign.me') q.set('categoria', 'pasticceria');
    else if (/fior|flor|rosa|rose|piant|cest|cappellier|ghirland|terrarium/.test(cat) || brand === 'deluxyflowers.com') q.set('categoria', 'fioraio');
    return `${SalesListComponent.RICERCA_FORNITORI}/?${q.toString()}`;
  }
  /** L'app Ricerca fornitori (stesso indirizzo del catalogo del Hub). */
  private static readonly RICERCA_FORNITORI = 'https://search-deluxy.vercel.app';

  readonly dettaglio = signal<Sale | null>(null);
  readonly dettaglioCaricando = signal(false);
  /** ⭐ 06/09 sera: l'ORDINE dietro la vendita (righe e fascia oraria), letto da Orders quando si apre il pop-up. */
  readonly ordine = signal<{
    disponibile?: boolean; consegnaDalle?: string; consegnaAlle?: string;
    prodotti?: {
      productId: string | null; nome: string | null; quantita: number; sku: string | null;
      prezzo?: number | null; immagine?: string | null; produttore?: string | null; nota?: string | null;
      venditaId?: string | null; consegnaId?: string | null;
    }[];
    /** ⭐ 07/09: le vendite nate dallo stesso ordine e se l'ordine è ancora a metà. */
    vendite?: { id: string; prodotto: string | null; stato: string; consegnaId: string | null; partner: string | null }[];
    incompleto?: boolean;
  } | null>(null);
  fasciaOrdine(): string | null {
    const o = this.ordine();
    if (!o?.consegnaDalle && !o?.consegnaAlle) return null;
    return o.consegnaDalle && o.consegnaAlle ? `${o.consegnaDalle}–${o.consegnaAlle}` : (o.consegnaDalle ?? o.consegnaAlle ?? null);
  }
  readonly confermaPendente = signal<{
    titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary'; azione: () => void;
  } | null>(null);

  eseguiConferma(): void {
    const c = this.confermaPendente();
    this.confermaPendente.set(null);
    c?.azione();
  }

  /** Apre subito coi dati della riga, poi carica il dettaglio completo (registro compreso). */
  /**
   * LE FOTO DEL PRODOTTO (05/09/2026, regola utente).
   *
   * Le immagini arrivano in due forme: `imageUrl` (la principale) e `images`
   * (JSON con la galleria di Shopify). Si uniscono senza doppioni, e il JSON
   * si legge QUI e non nel modello: se è scritto male non deve rompere la
   * pagina, deve solo dare zero foto.
   */
  readonly foto = signal<string[]>([]);

  fotoProdotto(v: Sale): string[] {
    const p = (v as unknown as { product?: ProdottoVendita }).product;
    if (!p) return [];
    const lista: string[] = [];
    if (p.imageUrl) lista.push(p.imageUrl);
    if (p.images) {
      try {
        const altre = JSON.parse(p.images);
        if (Array.isArray(altre)) {
          for (const u of altre) if (typeof u === 'string' && u) lista.push(u);
        }
      } catch { /* galleria scritta male: si mostra quello che c'è */ }
    }
    return [...new Set(lista)];
  }

  apriFoto(v: Sale): void { this.foto.set(this.fotoProdotto(v)); }
  chiudiFoto(): void { this.foto.set([]); }

  apriDettaglio(s: Sale): void {
    this.dettaglio.set(s);
    this.ricaricaDettaglio(s.id);
  }
  private ricaricaDettaglio(id: string): void {
    this.dettaglioCaricando.set(true);
    // L'ordine dietro la vendita: righe e fascia oraria. Silenzioso: è un di più, non deve rompere il pop-up.
    this.ordine.set(null);
    if (this.canManage()) {
      this.http.get<{ disponibile?: boolean }>(`${environment.apiUrl}/sales/${id}/ordine`).subscribe({
        next: (o) => { if (this.dettaglio()?.id === id) this.ordine.set(o?.disponibile === false ? null : o); },
        error: () => undefined,
      });
    }
    this.http.get<Sale>(`${environment.apiUrl}/sales/${id}`).subscribe({
      next: (v) => { if (this.dettaglio()?.id === id) this.dettaglio.set(v); this.dettaglioCaricando.set(false); },
      error: (e) => { this.dettaglioCaricando.set(false); this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Dettaglio non disponibile' }); },
    });
  }
  chiudiDettaglio(): void { this.chiudiStorico(); this.chiudiVicine(); this.ordine.set(null); this.dettaglio.set(null); }
  @HostListener('document:keydown.escape')
  suEscape(): void {
    // L'ordine conta: si chiude quello che sta SOPRA, non tutto insieme.
    if (this.foto().length) this.chiudiFoto();
    else if (this.confermaPendente()) this.confermaPendente.set(null);
    else if (this.dettaglio()) this.chiudiDettaglio();
  }

  /** Lo stato in Orders, leggibile: consegnato > annullato > evaso Shopify > classificazione > smistamento. */
  /**
   * ⭐ 04/09/2026 (regola utente): la colonna «Stato in Orders» dice prima di
   * tutto la SALUTE dell'ordine — conforme, a rischio, non pagato, cancellato,
   * nullo — perché è quella che decide se la vendita si può lavorare. Il punto
   * della pipeline (evaso, consegnato, annullato) scende sotto, nel
   * sottotitolo: sono due tassonomie diverse sullo stesso ordine e tenerle
   * mescolate faceva sembrare «Aperto» un ordine non pagato.
   */
  etichettaOrders(o: NonNullable<Sale['ordine']>): string {
    if (o.salute) {
      const k = 'sales.orders.salute.' + o.salute;
      const v = this.translate.instant(k);
      return v === k ? o.salute.replace(/_/g, ' ') : v;
    }
    const t = (k: string) => this.translate.instant('sales.orders.' + k);
    if (o.consegnataIl) return t('consegnato');
    if (o.annullato) return t('annullato');
    if (o.fulfillmentStatus === 'FULFILLED') return t('evaso');
    if (o.stato) { const k = 'sales.orders.stato.' + o.stato; const v = this.translate.instant(k); return v === k ? o.stato.replace(/_/g, ' ') : v; }
    return t('aperto');
  }
  sottoOrders(o: NonNullable<Sale['ordine']>): string | null {
    const parti: string[] = [];
    // Con la salute in testa, il punto della pipeline vive qui sotto.
    if (o.salute) {
      if (o.consegnataIl) parti.push(this.translate.instant('sales.orders.consegnato'));
      else if (o.annullato) parti.push(this.translate.instant('sales.orders.annullato'));
      else if (o.fulfillmentStatus === 'FULFILLED') parti.push(this.translate.instant('sales.orders.evaso'));
      else if (o.stato) {
        const k = 'sales.orders.stato.' + o.stato;
        const v = this.translate.instant(k);
        parti.push(v === k ? o.stato.replace(/_/g, ' ') : v);
      }
    }
    if (o.evasione) parti.push(this.translate.instant('sales.orders.evasione') + ' ' + o.evasione.replace(/_/g, ' '));
    if (o.smistamento) parti.push(this.translate.instant('sales.orders.smistamento') + ' ' + o.smistamento.replace(/_/g, ' '));
    return parti.length ? parti.join(' · ') : null;
  }
  coloreOrders(o: NonNullable<Sale['ordine']>): string {
    // Il colore segue la SALUTE: conforme verde, a rischio oro, non pagato
    // rosso, cancellato e nullo grigi. È il semaforo del «si può lavorare?».
    if (o.salute) {
      if (o.salute === 'conforme') return '#248A3D';
      if (o.salute === 'a_rischio') return 'var(--orange, #c93400)';
      if (o.salute === 'non_pagato') return '#d70015';
      return '#8e8e93';
    }
    if (o.consegnataIl || o.fulfillmentStatus === 'FULFILLED') return '#248A3D';
    if (o.annullato) return '#8e8e93';
    if (o.terminale) return '#6e6e73';
    return 'var(--blue, #0071e3)';
  }

  /** Chi ha fatto la cosa: l'email dell'operatore, «Ufficio Deluxy» per il partner, «sistema» se automatico. */
  chiLog(l: SaleLog): string {
    if (l.userEmail) return l.userEmail;
    return this.translate.instant('sales.detail.system');
  }

  private readonly router = inject(Router);

  /**
   * L'ufficio prende in mano (31/08): ferma il giro automatico della vendita
   * e apre il form consegna coi suoi dati. La vendita si chiude (accettata,
   * con la consegna agganciata) solo quando il form salva.
   */
  /** La vendita per cui è aperto il pop-up di inserimento consegna. */
  /** ⭐ 07/09: la vendita per cui si sta salvando il preventivo. */
  readonly preventivoDi = signal<Sale | null>(null);
  prezzoPreventivo: number | null = null;

  /** Il prodotto della vendita va a preventivo? */
  aPreventivo(s: Sale): boolean { return s.product?.tipologiaVendita === 'preventivo'; }

  /**
   * ⭐ 07/09/2026 (regola utente): finché il preventivo non c'è, su questa vendita si può
   * fare UNA cosa sola — raccoglierlo. Accetta, Rifiuta e Inserisci spariscono: un bottone
   * che porta a un errore è peggio di un bottone assente.
   */
  serveIlPreventivo(s: Sale): boolean { return this.aPreventivo(s) && s.preventivoMancante === true; }

  partnerPreventivo = '';
  readonly partnerPerPreventivoTutti = signal<{ id: string; insegna: string; active?: boolean; deleted?: boolean; esclusoDalleProposte?: boolean; provinces?: { province?: { code?: string } }[] }[]>([]);
  /** I partner fra cui scegliere: attivi, non esclusi dalle proposte, che lavorano nella provincia della vendita. */
  partnerPerPreventivo(s: Sale) {
    const code = s.province?.code;
    return this.partnerPerPreventivoTutti()
      .filter((p) => p.active !== false && !p.deleted && !p.esclusoDalleProposte)
      .filter((p) => !code || (p.provinces ?? []).some((x) => x.province?.code === code))
      .sort((a, b) => (a.insegna ?? '').localeCompare(b.insegna ?? '', 'it', { sensitivity: 'base' }));
  }
  apriPreventivo(s: Sale): void {
    this.partnerPreventivo = s.partner?.id ?? '';
    if (!this.partnerPerPreventivoTutti().length) {
      this.http.get<any>(`${environment.apiUrl}/partners`).subscribe({ next: (r) => this.partnerPerPreventivoTutti.set(Array.isArray(r) ? r : (r?.items ?? [])), error: () => undefined });
    }
    this.prezzoPreventivo = s.prezzoPartner ?? null;
    this.messaggio.set(null);
    this.preventivoDi.set(s);
  }

  salvaPreventivo(s: Sale): void {
    const prezzo = Number(this.prezzoPreventivo);
    if (!Number.isFinite(prezzo) || prezzo <= 0) {
      this.messaggio.set({ ok: false, testo: 'Il preventivo è un prezzo maggiore di zero.' });
      return;
    }
    if (!this.partnerPreventivo) {
      this.messaggio.set({ ok: false, testo: 'Scegli il partner a cui è stato chiesto il preventivo.' });
      return;
    }
    this.inCorso.set(s.id);
    this.http.post(`${environment.apiUrl}/sales/${s.id}/preventivo`, { prezzo, partnerId: this.partnerPreventivo }).subscribe({
      next: (r: any) => {
        this.inCorso.set(null);
        this.preventivoDi.set(null);
        this.messaggio.set({ ok: true, testo: `Preventivo salvato: ${r?.partner ?? 'il partner'} a ${prezzo} €. Da adesso questo prodotto in questa provincia va a lui in automatico.` });
        this.carica();
      },
      error: (err) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: err?.error?.message ?? 'Preventivo non salvato' });
      },
    });
  }

  readonly inserisciVendita = signal<string | null>(null);

  inserisci(s: Sale): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post(`${environment.apiUrl}/sales/${s.id}/inserisci`, {}).subscribe({
      next: () => {
        this.inCorso.set(null);
        // Pop-up (31/08) invece di cambiare pagina: il form si apre col vendita.
        this.inserisciVendita.set(s.id);
      },
      error: (err) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: err?.error?.message ?? 'Errore nella presa in mano' });
      },
    });
  }

  /** Chiude il pop-up; se ha salvato, la vendita è in storico: si ricarica. */
  chiudiInserimento(salvata: boolean): void {
    this.inserisciVendita.set(null);
    if (salvata) {
      this.messaggio.set({ ok: true, testo: this.translate.instant('sales.inseritaOk') });
      this.carica();
    }
  }

  apriStorico(s: Sale): void {
    this.storicoAperto.set(true);
    this.storicoCaricando.set(true);
    this.storico.set(null);
    this.http.get<Storico>(`${environment.apiUrl}/sales/${s.id}/storico-partner`).subscribe({
      next: (st) => { this.storico.set(st); this.storicoCaricando.set(false); },
      error: (e) => {
        this.storicoCaricando.set(false);
        this.storicoAperto.set(false);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Storico non disponibile' });
      },
    });
  }

  cercaVicine(s: Sale): void {
    this.vicineAperto.set(true);
    this.vicineCaricando.set(true);
    this.vicine.set([]);
    this.http.get<{ consegne: ConsegnaVicina[] }>(`${environment.apiUrl}/sales/${s.id}/consegne-indirizzo`).subscribe({
      next: (r) => { this.vicine.set(r.consegne ?? []); this.vicineCaricando.set(false); },
      error: (e) => {
        this.vicineCaricando.set(false);
        this.vicineAperto.set(false);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Ricerca non riuscita' });
      },
    });
  }

  chiudiVicine(): void {
    this.vicineAperto.set(false);
    this.vicine.set([]);
  }

  /** «È questa»: la vendita va in storico e il suo riferimento entra nel DDT. */
  riconciliaCon(s: Sale, c: ConsegnaVicina): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post(`${environment.apiUrl}/sales/${s.id}/riconcilia-consegna`, { deliveryId: c.id }).subscribe({
      next: () => {
        this.inCorso.set(null);
        this.chiudiVicine();
        this.messaggio.set({ ok: true, testo: this.translate.instant('sales.reconcile.done', { code: c.code }) });
        this.carica();
        this.ricaricaDettaglio(s.id);
      },
      error: (e) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Riconciliazione non riuscita' });
      },
    });
  }

  chiudiStorico(): void {
    this.storicoAperto.set(false);
    this.storico.set(null);
  }

  /** L'ufficio propone la vendita al partner scelto sullo storico. */
  proponiA(s: Sale, r: RigaStorico): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post<Sale>(`${environment.apiUrl}/sales/${s.id}/proponi`, { partnerId: r.partnerId }).subscribe({
      next: () => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: true, testo: this.translate.instant('sales.history.proposedOk', { partner: r.insegna }) });
        this.carica();
        this.ricaricaDettaglio(s.id);
      },
      error: (e) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Proposta non riuscita' });
      },
    });
  }

  /** Porta la coppia prodotto/provincia in Riconciliazioni, come proposta. */
  creaRiconciliazione(s: Sale, r: RigaStorico): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post(`${environment.apiUrl}/riconciliazioni/da-vendita`, { saleId: s.id, partnerId: r.partnerId }).subscribe({
      next: () => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: true, testo: this.translate.instant('sales.history.ruleCreated', { partner: r.insegna }) });
      },
      error: (e) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Riconciliazione non creata' });
      },
    });
  }

  private rispondi(s: Sale, azione: 'accetta' | 'rifiuta'): void {
    this.inCorso.set(s.id);
    this.messaggio.set(null);
    this.http.post<any>(`${environment.apiUrl}/sales/${s.id}/${azione}`, {}).subscribe({
      next: (r) => {
        this.inCorso.set(null);
        // L'avviso arriva quando la vendita e' accettata ma la consegna NON e'
        // nata (mancano destinatario, indirizzo, data o servizio). Va mostrato:
        // dare per creata una consegna che non c'e' e' peggio di un errore.
        const partner = this.auth.user()?.role === 'PARTNER';
        this.messaggio.set(r?.avviso
          ? { ok: false, testo: r.avviso }
          : { ok: true, testo: this.translate.instant(azione === 'accetta' ? 'sales.acceptedOk' : (partner ? 'sales.refusedPartner' : 'sales.refusedOffice')) });
        this.carica();
        // Il pop-up, se aperto, si aggiorna: stato nuovo e riga nuova nel registro.
        if (this.dettaglio()?.id === s.id) this.ricaricaDettaglio(s.id);
      },
      error: (e) => {
        this.inCorso.set(null);
        this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Operazione non riuscita' });
      },
    });
  }
}
