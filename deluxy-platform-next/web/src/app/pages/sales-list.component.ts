import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { avviaAutoAggiornamento } from '../core/auto-aggiornamento';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { DeliveryFormComponent } from './delivery-form.component';
import { ConfermaComponent } from '../shared/conferma.component';

interface Sale {
  id: string;
  status: string;
  brand: string;
  amount: number | null;
  /** Al PARTNER arriva solo questo: importo × (1 − sconto%). */
  prezzoPartner?: number | null;
  createdAt: string;
  deliveryDate?: string | null;
  externalOrderId?: string | null;
  /** Il numero d'ordine Shopify (es. 2824), riempito anche sul pregresso. */
  externalOrderNumber?: string | null;
  source: string;
  product?: { id: string; name: string } | null;
  variantName?: string | null;
  partner?: { id: string; insegna: string } | null;
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
  ordine?: { stato: string | null; terminale: boolean | null; smistamento: string | null; evasione: string | null;
    fulfillmentStatus: string | null; consegnataIl: string | null; annullato: unknown } | null;
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

/** Operatività → Vendite: gli ordini smistati ai partner. */
@Component({
  selector: 'app-sales-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe, DeliveryFormComponent, ConfermaComponent],
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

      <div class="table-wrap card">
        <table class="table">
          <!-- ⭐ 03/09 (regola utente): colonne ordinabili al click; il default
               è la DATA DI CONSEGNA più urgente in cima. -->
          <thead>
            <tr>
              <th class="ordinabile" (click)="ordina('status')">{{ 'sales.col.status' | translate }}{{ freccia('status') }}</th>
              <th class="ordinabile" (click)="ordina('ordine')">{{ 'sales.col.order' | translate }}{{ freccia('ordine') }}</th>
              <!-- ⭐ 04/09 (regola utente): lo stato dell'ordine in Orders, dal vivo. -->
              <th class="ordinabile" (click)="ordina('orders')">{{ 'sales.col.orders' | translate }}{{ freccia('orders') }}</th>
              <th class="ordinabile" (click)="ordina('prodotto')">{{ 'sales.col.product' | translate }}{{ freccia('prodotto') }}</th>
              <th class="ordinabile" (click)="ordina('provincia')">{{ 'sales.col.province' | translate }}{{ freccia('provincia') }}</th>
              <th class="ordinabile" (click)="ordina('partner')">{{ 'sales.col.partner' | translate }}{{ freccia('partner') }}</th>
              <th class="ordinabile" (click)="ordina('deliveryDate')">{{ 'sales.col.delivery' | translate }}{{ freccia('deliveryDate') }}</th>
              <th class="ordinabile num" (click)="ordina('amount')">{{ (isPartner() ? 'sales.col.partnerPrice' : 'sales.col.amount') | translate }}{{ freccia('amount') }}</th>
              <!-- ⭐ 04/09 (regola utente): nello STORICO si vede QUANDO ci è andata. -->
              @if (filtro() === 'storico') {
                <th class="ordinabile" (click)="ordina('historyAt')">{{ 'sales.col.historyAt' | translate }}{{ freccia('historyAt') }}</th>
              }
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (s of visibili(); track s.id) {
              <!-- ⭐ 04/09 (regola utente): la riga apre il POP-UP di dettaglio
                   (come nel Customer Service); i bottoni fermano il click. -->
              <tr class="riga-link" (click)="apriDettaglio(s)">
                <td>
                  <span class="badge" [style.--c]="colore(s.status)">
                    <i class="dot"></i>{{ etichetta(s.status) }}
                  </span>
                </td>
                <td class="mono">
                  @if (s.externalOrderNumber) { <strong>#{{ s.externalOrderNumber }}</strong> · }{{ s.brand }}
                </td>
                <td class="orders-stato">
                  @if (s.ordine) {
                    <span class="badge" [style.--c]="coloreOrders(s.ordine)"><i class="dot"></i>{{ etichettaOrders(s.ordine) }}</span>
                    @if (sottoOrders(s.ordine); as sub) { <span class="motivo">{{ sub }}</span> }
                  } @else { <span class="muted">—</span> }
                </td>
                <td>{{ s.product?.name ?? '—' }}@if (s.variantName) { <span class="muted">({{ s.variantName }})</span> }</td>
                <td class="mono">{{ s.province?.code ?? '—' }}</td>
                <td>{{ s.partner?.insegna ?? ('sales.noPartner' | translate) }}
                  @if (s.assignmentReason) {
                    <span class="motivo">{{ s.assignmentReason }}</span>
                  }
                </td>
                <td>{{ s.deliveryDate ? (s.deliveryDate | date: 'dd/MM/yyyy') : '—' }}</td>
                <td class="num">{{ (s.prezzoPartner ?? s.amount) | number: '1.2-2' }} €</td>
                @if (filtro() === 'storico') {
                  <td class="mono">{{ s.historyAt ? (s.historyAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                }
                <td class="azioni" (click)="$event.stopPropagation()">
                  @if (s.status === 'proposta' && puoRispondere(s)) {
                    <button class="btn btn-primary mini" [disabled]="inCorso() === s.id" (click)="accetta(s)">
                      {{ 'sales.accept' | translate }}
                    </button>
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="rifiuta(s)">
                      {{ 'sales.refuse' | translate }}
                    </button>
                  }
                  <!-- ⭐ 04/09 (regola utente): l'UFFICIO rifiuta anche una vendita
                       da gestire — chiude in storico come non accettata. -->
                  @if (canManage() && s.status === 'da_gestire') {
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="rifiuta(s)">
                      {{ 'sales.refuse' | translate }}
                    </button>
                  }
                  <!-- L'ufficio prende in mano: ferma il giro automatico e
                       apre il form consegna coi dati della vendita (31/08). -->
                  @if (canManage() && (s.status === 'proposta' || s.status === 'da_gestire')) {
                    <button class="btn btn-secondary mini" [disabled]="inCorso() === s.id" (click)="inserisci(s)">
                      {{ 'sales.inserisci' | translate }}
                    </button>
                  }
                  <!-- ⭐ 03/09 (regola utente): la vendita si MODIFICA da qui —
                       i dati (importo, destinatario, data, provincia), non lo
                       stato, che ha le sue azioni. -->
                  @if (canManage()) {
                    <button class="btn btn-secondary mini" (click)="apriModifica(s)">
                      {{ (modificaId() === s.id ? 'common.cancel' : 'sales.edit') | translate }}
                    </button>
                  }
                </td>
              </tr>
              @if (modificaId() === s.id) {
                <tr class="mod-row" (click)="$event.stopPropagation()">
                  <td [attr.colspan]="filtro() === 'storico' ? 10 : 9">
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
                      <label class="largo"><span>{{ 'sales.mod.indirizzo' | translate }}</span>
                        <input class="field" [(ngModel)]="mod.recipientAddress" /></label>
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
            <button type="button" class="ins-x" (click)="chiudiDettaglio()" [attr.aria-label]="'common.close' | translate">×</button>
          </div>
        </header>

        <section class="card pan-card">
          <h3>{{ 'sales.detail.title' | translate }}</h3>
          <dl class="coppie">
            <dt>{{ 'sales.detail.product' | translate }}</dt>
            <dd>{{ v.product?.name ?? v.productName ?? '—' }}@if (v.variantName) { <span class="muted"> ({{ v.variantName }})</span> }</dd>
            <dt>{{ (isPartner() ? 'sales.col.partnerPrice' : 'sales.detail.amount') | translate }}</dt>
            @if (isPartner()) {
              <dd>{{ v.prezzoPartner | number: '1.2-2' }} €</dd>
            } @else {
              <dd>{{ v.amount | number: '1.2-2' }} €@if (v.discountPercent) { <span class="muted"> · {{ 'sales.detail.discount' | translate }} {{ v.discountPercent }}%</span> }</dd>
            }
            <dt>{{ 'sales.detail.partner' | translate }}</dt>
            <dd>{{ v.partner?.insegna ?? ('sales.noPartner' | translate) }}@if (v.assignmentReason) { <div class="cella-sub">{{ v.assignmentReason }}</div> }</dd>
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
            <dt>{{ 'sales.detail.delivery' | translate }}</dt>
            <dd>{{ v.deliveryDate ? (v.deliveryDate | date: 'EEEE d MMMM yyyy') : ('sales.detail.notSet' | translate) }}@if (v.serviceType?.name) { <span class="muted"> · {{ v.serviceType?.name }}</span> }</dd>
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
      .table-wrap { overflow-x: auto; }
      th.ordinabile { cursor: pointer; user-select: none; }
      th.ordinabile:hover { color: var(--text); }
      .mod-row td { background: var(--fill); padding: 14px 16px; }
      .mod-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px 14px; }
      .mod-grid label { display: flex; flex-direction: column; gap: 4px; }
      .mod-grid label > span { font-size: 12px; font-weight: 550; color: var(--text-secondary); }
      .mod-grid .largo { grid-column: 1 / -1; }
      .mod-azioni { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
      .mod-errore { margin-top: 8px; color: var(--red); font-size: 13px; }
      .table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .table th, .table td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      .table th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; position: sticky; top: 0; background: var(--surface); }
      .table th.num, .table td.num { text-align: right; }
      .table tbody tr { transition: background 0.14s ease; }
      .table tbody tr:hover { background: rgba(120, 120, 128, 0.05); }
      .table tr:last-child td { border-bottom: none; }
      .table td { vertical-align: middle; }
      .table td:nth-child(3) { white-space: normal; min-width: 220px; }
      .azioni { display: flex; gap: 10px /* audit 31/08: 6px fra Accetta e Rifiuta, esiti opposti */; justify-content: flex-end; white-space: nowrap; }
      .btn.mini { padding: 4px 12px; font-size: 12.5px; }
      .vuoto { padding: 40px 28px; text-align: center; color: var(--text-secondary); font-size: 14px; }
      .esito { margin-top: 10px; color: var(--danger, #d70015); font-size: 13.5px; }
      .esito.ok { color: var(--green); }
      .motivo { display: block; font-size: 11px; color: var(--text-tertiary); margin-top: 2px; max-width: 260px; }
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
      .velo { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 90; backdrop-filter: blur(2px); }
      .pannello { position: fixed; z-index: 91; top: 4vh; left: 50%; transform: translateX(-50%);
        width: min(760px, 94vw); max-height: 92vh; overflow-y: auto;
        background: var(--bg, #f5f5f7); border: 1px solid var(--hairline); border-radius: 20px;
        padding: 0 18px 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.28); }
      .pan-testa { position: sticky; top: 0; z-index: 2; background: var(--bg, #f5f5f7);
        display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        padding: 16px 0 12px; border-bottom: 1px solid var(--hairline); margin-bottom: 14px; }
      .pan-titolo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .pan-titolo h2 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -0.02em; }
      .pan-azioni { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pan-card { padding: 16px 18px; margin-bottom: 12px; }
      .pan-card h3 { margin: 0 0 10px; font-size: 15px; font-weight: 650; }
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
      (s.product?.name ?? '').toLowerCase().includes(q) ||
      (s.partner?.insegna ?? '').toLowerCase().includes(q) ||
      (s.province?.code ?? '').toLowerCase().includes(q) ||
      s.brand.toLowerCase().includes(q));
    const { campo, verso } = this.ordinamento();
    const chiave = (s: Sale): string | number | null => {
      switch (campo) {
        case 'ordine': return s.externalOrderNumber ? Number(s.externalOrderNumber) || s.externalOrderNumber : null;
        case 'orders': return s.ordine ? this.etichettaOrders(s.ordine) : null;
        case 'historyAt': return s.historyAt ? new Date(s.historyAt).getTime() : null;
        case 'prodotto': return s.product?.name ?? null;
        case 'provincia': return s.province?.code ?? null;
        case 'partner': return s.partner?.insegna ?? null;
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

  /** Un partner risponde solo alle vendite proposte a lui; admin e operation a tutte. */
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

  apriModifica(s: Sale): void {
    if (this.modificaId() === s.id) { this.modificaId.set(null); return; }
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
  readonly dettaglio = signal<Sale | null>(null);
  readonly dettaglioCaricando = signal(false);
  readonly confermaPendente = signal<{
    titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary'; azione: () => void;
  } | null>(null);

  eseguiConferma(): void {
    const c = this.confermaPendente();
    this.confermaPendente.set(null);
    c?.azione();
  }

  /** Apre subito coi dati della riga, poi carica il dettaglio completo (registro compreso). */
  apriDettaglio(s: Sale): void {
    this.dettaglio.set(s);
    this.ricaricaDettaglio(s.id);
  }
  private ricaricaDettaglio(id: string): void {
    this.dettaglioCaricando.set(true);
    this.http.get<Sale>(`${environment.apiUrl}/sales/${id}`).subscribe({
      next: (v) => { if (this.dettaglio()?.id === id) this.dettaglio.set(v); this.dettaglioCaricando.set(false); },
      error: (e) => { this.dettaglioCaricando.set(false); this.messaggio.set({ ok: false, testo: e?.error?.message ?? 'Dettaglio non disponibile' }); },
    });
  }
  chiudiDettaglio(): void { this.dettaglio.set(null); }
  @HostListener('document:keydown.escape')
  suEscape(): void { if (this.confermaPendente()) this.confermaPendente.set(null); else if (this.dettaglio()) this.chiudiDettaglio(); }

  /** Lo stato in Orders, leggibile: consegnato > annullato > evaso Shopify > classificazione > smistamento. */
  etichettaOrders(o: NonNullable<Sale['ordine']>): string {
    const t = (k: string) => this.translate.instant('sales.orders.' + k);
    if (o.consegnataIl) return t('consegnato');
    if (o.annullato) return t('annullato');
    if (o.fulfillmentStatus === 'FULFILLED') return t('evaso');
    if (o.stato) { const k = 'sales.orders.stato.' + o.stato; const v = this.translate.instant(k); return v === k ? o.stato.replace(/_/g, ' ') : v; }
    return t('aperto');
  }
  sottoOrders(o: NonNullable<Sale['ordine']>): string | null {
    const parti: string[] = [];
    if (o.evasione) parti.push(this.translate.instant('sales.orders.evasione') + ' ' + o.evasione.replace(/_/g, ' '));
    if (o.smistamento) parti.push(this.translate.instant('sales.orders.smistamento') + ' ' + o.smistamento.replace(/_/g, ' '));
    return parti.length ? parti.join(' · ') : null;
  }
  coloreOrders(o: NonNullable<Sale['ordine']>): string {
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
