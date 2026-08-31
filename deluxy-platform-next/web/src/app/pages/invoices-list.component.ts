import { ConfermaComponent } from '../shared/conferma.component';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface InvoiceLine {
  id: string;
  date: string;
  recipient: string;
  description?: string;
  amount: number;
}
interface Invoice {
  id: string;
  partnerId: string;
  number?: string;
  periodStart: string;
  periodEnd: string;
  netAmount: number;
  vatRate: number;
  totalAmount: number;
  legacyTotalAmount?: number | null;
  deliveriesCount: number;
  status: string;
  archived: boolean;
  partner?: { id: string; insegna: string };
  lines?: InvoiceLine[];
}
interface PartnerLite { id: string; insegna: string }

/** Una riga di «Da fatturare»: un partner e il lavoro che aspetta fattura. */
interface Pending {
  /** partnerId|YYYY-MM: una riga e' un partner in un mese, cioe' una fattura. */
  chiave: string;
  mese: string;
  /** Il mese non e' ancora finito: si fattura quando chiude. */
  inCorso: boolean;
  /** Valore di quello che si e' venduto per conto del partner. */
  venduto: number;
  /** Quello che di quel venduto va girato a lui. */
  dovutoAlPartner: number;
  partnerId: string;
  partner: { id: string; insegna: string };
  deliveriesCount: number;
  /** Consegne senza prezzo e senza listino: non entrano in fattura. */
  unpricedCount: number;
  /** Escluse da una regola carnet: non sono un buco, sono una decisione. */
  ruleExcludedCount: number;
  /** Quante prendono il prezzo dal listino invece che da se'. */
  fromListino: number;
  modelli: Record<string, number>;
  netAmount: number;
  vatRate: number;
  totalAmount: number;
  from: string;
  to: string;
}
interface PendingDelivery {
  id: string; code: number; date: string; status: string;
  /** null = non prezzabile: nessun prezzo sulla consegna, nessun listino. */
  amount: number | null;
  /** Valore lordo dei prodotti venduti; netto che spetta al partner (solo vendite). */
  venduto?: number | null;
  dovutoAlPartner?: number | null;
  origine: 'consegna' | 'listino' | null;
  esclusaDaRegola: boolean;
  regola?: string | null;
  service: string; pricingModel: string;
  recipientFirstName?: string | null; recipientLastName?: string | null; recipientAddress?: string | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Bozza', color: '#8A8A8E' },
  ISSUED: { label: 'Emessa', color: '#007aff' },
  PAID: { label: 'Pagata', color: '#248A3D' },
};
/** Passo successivo del flusso: stato → { next, azione }. */
const NEXT: Record<string, { next: string; key: string }> = {
  DRAFT: { next: 'ISSUED', key: 'issue' },
  ISSUED: { next: 'PAID', key: 'markPaid' },
};

/** Amministrazione → Fatturazione: genera e gestisce le fatture dei partner. */
@Component({
  selector: 'app-invoices-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe, ConfermaComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'invoices.title' | translate }}</h1>
        <p class="page-caption">{{ 'invoices.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" [disabled]="!filtered().length" (click)="exportCsv()">{{ 'invoices.export' | translate }}</button>
        @if (canManage() && view() === 'active') {
          <button class="btn btn-primary" (click)="toggleGen()">{{ (showGen() ? 'common.cancel' : 'invoices.generate') | translate }}</button>
        }
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="view() === 'pending'" (click)="setView('pending')">
        {{ 'invoices.tab.pending' | translate }}
        @if (pendingTotals(); as t) { <span class="pill">{{ t.deliveriesCount | number }}</span> }
      </button>
      <button class="tab" [class.on]="view() === 'active'" (click)="setView('active')">{{ 'invoices.tab.active' | translate }}</button>
      <button class="tab" [class.on]="view() === 'archive'" (click)="setView('archive')">{{ 'invoices.tab.archive' | translate }}</button>
    </div>

    <!-- I filtri vanno al server: filtrare nel browser dopo aver scaricato
         tutto regge finche' le fatture sono 559, non oltre. -->
    <div class="filtri card">
      <label class="f cerca">
        <span>{{ 'invoices.filter.search' | translate }}</span>
        <input class="field" type="search" [(ngModel)]="cerca" (ngModelChange)="filtroCambiato()"
               [placeholder]="(view() === 'pending' ? 'invoices.filter.searchPendingPh' : 'invoices.filter.searchPh') | translate" />
      </label>
      @if (canManage()) {
        <label class="f">
          <span>{{ 'invoices.gen.partner' | translate }}</span>
          <select class="field" [(ngModel)]="partnerFilter" (ngModelChange)="filtroCambiato()">
            <option value="">{{ 'invoices.allPartners' | translate }}</option>
            @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
          </select>
        </label>
      }
      <div class="f">
        <span>{{ 'invoices.filter.quick' | translate }}</span>
        <div class="quick-tabs">
          <button type="button" class="quick-tab" (click)="periodoRapido(0)">{{ 'invoices.filter.thisMonth' | translate }}</button>
          <button type="button" class="quick-tab" (click)="periodoRapido(-1)">{{ 'invoices.filter.lastMonth' | translate }}</button>
          <!-- Il Trimestre completa le 4 scorciatoie canoniche (Libro v1.9 §8-bis). -->
          <button type="button" class="quick-tab" (click)="periodoRapido(-3)">{{ 'invoices.filter.quarter' | translate }}</button>
          <button type="button" class="quick-tab" (click)="periodoRapido(-12)">{{ 'invoices.filter.thisYear' | translate }}</button>
        </div>
      </div>
      <label class="f">
        <span>{{ 'invoices.filter.from' | translate }}</span>
        <input class="field" type="date" [(ngModel)]="dal" (ngModelChange)="filtroCambiato()" />
      </label>
      <label class="f">
        <span>{{ 'invoices.filter.to' | translate }}</span>
        <input class="field" type="date" [(ngModel)]="al" (ngModelChange)="filtroCambiato()" />
      </label>
      @if (view() !== 'pending') {
        <label class="f">
          <span>{{ 'invoices.col.status' | translate }}</span>
          <select class="field" [(ngModel)]="stato" (ngModelChange)="filtroCambiato()">
            <option value="">{{ 'invoices.filter.allStatuses' | translate }}</option>
            <option value="DRAFT">{{ 'invoices.status.DRAFT' | translate }}</option>
            <option value="ISSUED">{{ 'invoices.status.ISSUED' | translate }}</option>
            <option value="PAID">{{ 'invoices.status.PAID' | translate }}</option>
          </select>
        </label>
      } @else {
        <label class="f interruttore">
          <input type="checkbox" [(ngModel)]="soloPrezzabili" (ngModelChange)="filtroCambiato()" />
          <span>{{ 'invoices.filter.onlyPriced' | translate }}</span>
        </label>
      }
      <!-- ⭐ 27/08 (chiesto dall'utente): il recap di una tipologia per volta
           — «prima quello delle consegne standard, poi quello delle vendite». -->
      @if (serviceTypes().length) {
        <div class="f servizi">
          <span>{{ 'invoices.filter.services' | translate }}</span>
          <div class="chips-servizi">
            @for (s of serviceTypes(); track s.id) {
              <button type="button" class="chip-serv" [class.on]="serviziScelti().has(s.id)"
                      (click)="scegliServizio(s.id)">{{ s.name }}</button>
            }
          </div>
        </div>
      }
      @if (filtriAttivi()) {
        <button type="button" class="link-btn azzera" (click)="azzeraFiltri()">{{ 'invoices.filter.clear' | translate }}</button>
      }
    </div>

    @if (showGen() && view() === 'active') {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span class="req">{{ 'invoices.gen.partner' | translate }}</span>
            <select class="field" [(ngModel)]="genPartner">
              <option value="">{{ 'invoices.gen.pickPartner' | translate }}</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
          <label class="fld"><span class="req">{{ 'invoices.gen.from' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="genFrom" /></label>
          <label class="fld"><span class="req">{{ 'invoices.gen.to' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="genTo" /></label>
        </div>
        <p class="hint">{{ 'invoices.gen.hint' | translate }}</p>
        @if (genError()) { <div class="error-card">{{ genError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="generating()" (click)="generate()">
            {{ generating() ? ('common.saving' | translate) : ('invoices.gen.run' | translate) }}
          </button>
        </div>
      </section>
    }

    @if (banner(); as b) { <div class="ok-card card">{{ b }}</div> }
    @if (error()) { <div class="error-card card">{{ error() }}</div> }

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }

    <!-- «Da fatturare»: il lavoro che aspetta una fattura, non le fatture.
         Prima la pagina rispondeva solo «Nessuna fattura» e la consegna di
         stamattina non compariva da nessuna parte finche' qualcuno non
         indovinava partner e periodo. -->
    @else if (view() === 'pending') {
      @if (pendingTotaliVista(); as t) {
        <div class="card riepilogo">
          <div><span class="etichetta">{{ 'invoices.pending.partners' | translate }}</span><strong>{{ t.partners | number }}</strong></div>
          <div><span class="etichetta">{{ 'invoices.pending.deliveries' | translate }}</span><strong>{{ t.deliveriesCount | number }}</strong></div>
          <div><span class="etichetta">{{ 'invoices.col.net' | translate }}</span><strong>{{ t.netAmount | number: '1.2-2' }} €</strong></div>
          @if (t.venduto) {
            <div><span class="etichetta">{{ 'invoices.pending.sold' | translate }}</span><strong>{{ t.venduto | number: '1.2-2' }} €</strong></div>
            <div><span class="etichetta">{{ 'invoices.pending.dueToPartner' | translate }}</span><strong class="dovuto">{{ t.dovutoAlPartner | number: '1.2-2' }} €</strong></div>
          }
          <div><span class="etichetta">{{ 'invoices.col.total' | translate }}</span><strong class="oro">{{ t.totalAmount | number: '1.2-2' }} €</strong></div>
          @if (t.unpricedCount) {
            <div><span class="etichetta">{{ 'invoices.pending.unpriced' | translate }}</span><strong class="rosso">{{ t.unpricedCount | number }}</strong></div>
          }
          @if (t.ruleExcludedCount) {
            <div><span class="etichetta">{{ 'invoices.pending.byRule' | translate }}</span><strong>{{ t.ruleExcludedCount | number }}</strong></div>
          }
        </div>
        @if (t.unpricedCount) {
          <p class="avviso">{{ 'invoices.pending.unpricedHint' | translate:{ n: t.unpricedCount } }}</p>
        }
        <!-- Il taglio si dichiara: «non conteggiate» senza dirlo sarebbe
             indistinguibile da «non esistono». -->
        @if (t.arretrato) {
          <p class="avviso">{{ 'invoices.pending.backlog' | translate:{ n: t.arretrato, d: (t.soglia | date: 'dd/MM/yyyy') } }}</p>
        }
      }
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'invoices.pending.month' | translate }}</th>
              <th>{{ 'invoices.col.partner' | translate }}</th>
              <th class="num">{{ 'invoices.col.deliveries' | translate }}</th>
              <th class="num">{{ 'invoices.pending.unpriced' | translate }}</th>
              <th class="num">{{ 'invoices.pending.sold' | translate }}</th>
              <th class="num">{{ 'invoices.pending.dueToPartner' | translate }}</th>
              <th class="num">{{ 'invoices.col.net' | translate }}</th>
              <th class="num">{{ 'invoices.col.total' | translate }}</th>
              <th>{{ 'invoices.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pendingFiltered(); track r.chiave) {
              <tr>
                <td class="mese">
                  {{ mese(r.mese) }}
                  @if (r.inCorso) { <span class="incorso" [title]="'invoices.pending.openMonthHint' | translate">{{ 'invoices.pending.openMonth' | translate }}</span> }
                </td>
                <td class="strong">{{ r.partner.insegna }}</td>
                <td class="num">
                  {{ r.deliveriesCount | number }}
                  @if (r.fromListino) { <span class="ric" [title]="'invoices.pending.fromListinoHint' | translate">{{ 'invoices.pending.fromListino' | translate:{ n: r.fromListino } }}</span> }
                </td>
                <td class="num">
                  @if (r.unpricedCount) { <span class="rosso">{{ r.unpricedCount | number }}</span> } @else { <span class="muted">—</span> }
                </td>
                <td class="num muted">{{ r.venduto ? ((r.venduto | number: '1.2-2') + ' €') : '—' }}</td>
                <td class="num">{{ r.dovutoAlPartner ? ('−' + (r.dovutoAlPartner | number: '1.2-2') + ' €') : '—' }}</td>
                <td class="num muted">{{ r.netAmount | number: '1.2-2' }} €</td>
                <td class="num strong">{{ r.totalAmount | number: '1.2-2' }} €</td>
                <td class="row-actions">
                  <button class="link-btn" (click)="togglePendingDetail(r)">
                    {{ (pendingOpen() === r.chiave ? 'invoices.action.hideDetail' : 'invoices.action.detail') | translate }}
                  </button>
                  @if (canManage()) {
                    <button class="link-btn" [disabled]="recapInCorso() === r.chiave" (click)="scaricaRecap(r)">
                      {{ 'invoices.pending.recap' | translate }}
                    </button>
                    <button class="link-btn" [disabled]="recapInCorso() === r.chiave" (click)="inviaRecap(r)">
                      {{ (recapInCorso() === r.chiave ? 'common.saving' : 'invoices.pending.sendRecap') | translate }}
                    </button>
                    <button class="link-btn" (click)="fatturaTutto(r)">{{ 'invoices.pending.invoiceAll' | translate }}</button>
                  }
                </td>
              </tr>
              @if (pendingOpen() === r.chiave) {
                <tr class="detail-row">
                  <td colspan="9">
                    @if (pendingDetailLoading()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
                    @else {
                      <table class="sub">
                        <thead><tr>
                          <th>{{ 'invoices.line.date' | translate }}</th>
                          <th>{{ 'invoices.line.recipient' | translate }}</th>
                          <th>{{ 'invoices.pending.service' | translate }}</th>
                          <th class="num">{{ 'invoices.pending.sold' | translate }}</th>
                          <th class="num">{{ 'invoices.line.net' | translate }}</th>
                          <th class="num">{{ 'invoices.line.amount' | translate }}</th>
                        </tr></thead>
                        <tbody>
                          @for (d of pendingDetail(); track d.id) {
                            <tr>
                              <td>
                                <a class="cod-link" [href]="'/deliveries/' + d.id" target="_blank" rel="noopener" [title]="'invoices.line.openDelivery' | translate">#{{ d.code }}</a>
                                <span class="muted"> · {{ d.date | date: 'dd/MM/yy' }}</span>
                              </td>
                              <td>{{ (d.recipientLastName || '') + ' ' + (d.recipientFirstName || '') }}</td>
                              <td class="muted">{{ d.service }}</td>
                              <!-- Venduto (lordo del prodotto) e Netto spettante al
                                   partner (solo vendite): visibili a tutti. -->
                              <td class="num muted">{{ d.venduto ? ((d.venduto | number: '1.2-2') + ' €') : '—' }}</td>
                              <td class="num">
                                @if (nettoRiga(d); as netto) { <strong class="dovuto">{{ netto | number: '1.2-2' }} €</strong> }
                                @else { <span class="muted">—</span> }
                              </td>
                              <td class="num">
                                @if (d.esclusaDaRegola) {
                                  <span class="regola" [title]="d.regola || ''">{{ 'invoices.pending.byRuleRow' | translate }}</span>
                                } @else if (d.amount === null) {
                                  <span class="rosso" [title]="'invoices.pending.unpricedRow' | translate">{{ 'invoices.pending.noPrice' | translate }}</span>
                                } @else {
                                  {{ d.amount | number: '1.2-2' }} €
                                  @if (d.origine === 'listino') { <span class="ric" [title]="'invoices.pending.fromListinoHint' | translate">{{ 'invoices.pending.listino' | translate }}</span> }
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      @if (pendingTroncato()) { <p class="hint">{{ 'invoices.pending.capped' | translate }}</p> }
                    }
                  </td>
                </tr>
              }
            }
            @if (!pendingFiltered().length) {
              <tr><td colspan="9" class="muted empty">{{ 'invoices.pending.empty' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
    @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'invoices.col.partner' | translate }}</th>
              <th>{{ 'invoices.col.number' | translate }}</th>
              <th>{{ 'invoices.col.period' | translate }}</th>
              <th class="num">{{ 'invoices.col.deliveries' | translate }}</th>
              <th class="num">{{ 'invoices.col.net' | translate }}</th>
              <th class="num">{{ 'invoices.col.vat' | translate }}</th>
              <th class="num">{{ 'invoices.col.total' | translate }}</th>
              <th>{{ 'invoices.col.status' | translate }}</th>
              @if (view() === 'archive') { <th>{{ 'invoices.col.financial' | translate }}</th> }
              <th>{{ 'invoices.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (i of filtered(); track i.id) {
              <tr>
                <td class="strong">{{ i.partner?.insegna }}</td>
                <td>{{ i.number || '—' }}</td>
                <td class="muted">{{ i.periodStart | date: 'dd/MM/yy' }} – {{ i.periodEnd | date: 'dd/MM/yy' }}</td>
                <td class="num">{{ i.deliveriesCount }}</td>
                <td class="num muted">{{ i.netAmount | number: '1.2-2' }} €</td>
                <td class="num muted">{{ iva(i) | number: '1.2-2' }} €</td>
                <td class="num strong">
                  {{ i.totalAmount | number: '1.2-2' }} €
                  <!-- Il legacy lasciava vuoto l'importo su 292 fatture su 559:
                       il totale lì è ricostruito dall'imponibile, e va detto
                       invece di farlo passare per un dato del documento. -->
                  @if (ricostruito(i)) {
                    <span class="ric" [title]="'invoices.rebuiltHint' | translate">{{ 'invoices.rebuilt' | translate }}</span>
                  }
                </td>
                <td>
                  <span class="badge" [style.--c]="statusColor(i.status)"><span class="dot"></span>{{ statusLabel(i.status) }}</span>
                </td>
                @if (view() === 'archive') {
                  <td>
                    <span class="badge" [style.--c]="isPaid(i) ? '#248A3D' : '#8A8A8E'"><span class="dot"></span>{{ (isPaid(i) ? 'invoices.fin.paid' : 'invoices.fin.unpaid') | translate }}</span>
                  </td>
                }
                <td class="row-actions">
                  <button class="link-btn" (click)="toggleDetail(i)">{{ (expanded() === i.id ? 'invoices.action.hideDetail' : 'invoices.action.detail') | translate }}</button>
                  @if (canManage() && view() === 'active' && next(i.status); as n) {
                    <button class="link-btn" [disabled]="busy() === i.id" (click)="advance(i, n.next)">{{ ('invoices.action.' + n.key) | translate }}</button>
                  }
                  @if (canManage() && view() === 'archive') {
                    @if (next(i.status); as n) {
                      <button class="link-btn" [disabled]="busy() === i.id" (click)="advance(i, n.next)">{{ ('invoices.action.' + n.key) | translate }}</button>
                    }
                    @if (!isPaid(i)) {
                      <button class="link-btn danger" [disabled]="busy() === i.id" (click)="reopen(i)">{{ 'invoices.action.reopen' | translate }}</button>
                    } @else { <span class="muted">✓</span> }
                  }
                </td>
              </tr>
              @if (expanded() === i.id) {
                <tr class="detail-row">
                  <td [attr.colspan]="view() === 'archive' ? 8 : 7">
                    @if (righeInCorso()) { <span class="muted">{{ 'common.loading' | translate }}</span> }
                    @else if (righe().length) {
                      <table class="lines">
                        <thead><tr>
                          <th>{{ 'invoices.line.date' | translate }}</th>
                          <th>{{ 'invoices.line.recipient' | translate }}</th>
                          <th>{{ 'invoices.line.description' | translate }}</th>
                          <th class="num">{{ 'invoices.line.amount' | translate }}</th>
                        </tr></thead>
                        <tbody>
                          @for (l of righe(); track l.id) {
                            <tr>
                              <td>{{ l.date | date: 'dd/MM/yy' }}</td>
                              <td>{{ l.recipient }}</td>
                              <td class="muted">{{ l.description || '—' }}</td>
                              <td class="num">{{ l.amount | number: '1.2-2' }} €</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    } @else { <span class="muted">{{ 'invoices.noLines' | translate }}</span> }
                  </td>
                </tr>
              }
            }
            @if (!filtered().length) { <tr><td [attr.colspan]="view() === 'archive' ? 8 : 7" class="muted empty">{{ 'invoices.empty' | translate }}</td></tr> }
          </tbody>
        </table>
      </div>
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    [conMotivo]="c.conMotivo ?? false" [motivoLabel]="c.motivoLabel ?? ''"
                    (confermato)="eseguiConferma($event)" (annullato)="confermaPendente.set(null)" />
    }
  `,
  styles: [
    `
      .quick-tabs { display: inline-flex; background: var(--fill, #f5f5f7); border-radius: 980px; padding: 2px; }
      .quick-tab { border: 0; background: none; border-radius: 980px; padding: 6px 14px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .quick-tab:hover { color: var(--text); }
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .head-actions .btn { text-decoration: none; }
      .tabs { display: inline-flex; gap: 4px; background: var(--fill); border-radius: 980px; padding: 4px; margin-bottom: 18px; }
      .tab { appearance: none; border: none; background: none; border-radius: 980px; padding: 7px 18px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .tab.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      .gen { padding: 20px 22px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .hint { margin: 12px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 600; }
      .muted { color: var(--text-tertiary); }
      .empty { text-align: center; padding: 28px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .row-actions { display: flex; gap: 12px; align-items: center; }
      .detail-row > td { background: var(--fill); padding: 10px 24px; }
      table.lines { width: 100%; border-collapse: collapse; font-size: 12.5px; background: var(--surface); border-radius: var(--radius-m); overflow: hidden; }
      table.lines th, table.lines td { padding: 8px 12px; border-bottom: 1px solid var(--hairline); }
      table.lines th { font-size: 11px; }
      table.lines tr:last-child td { border-bottom: none; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .link-btn:disabled { opacity: 0.5; cursor: default; }
      .riepilogo { display: flex; gap: 32px; flex-wrap: wrap; padding: 16px 20px; margin-bottom: 12px; }
      .riepilogo > div { display: flex; flex-direction: column; gap: 2px; }
      .riepilogo .etichetta { font-size: 12px; color: var(--text-secondary); }
      .riepilogo strong { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .filtri { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 12px; }
      .filtri .f { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
      .filtri .f.cerca { flex: 1 1 220px; }
      .filtri .f > span { font-size: 12px; color: var(--text-secondary); }
      .filtri .interruttore { flex-direction: row; align-items: center; gap: 7px; min-width: 0; padding-bottom: 8px; }
      .filtri .interruttore > span { font-size: 13px; color: var(--text); }
      .filtri .azzera { padding-bottom: 8px; }
      .filtri .f.servizi { min-width: 240px; flex: 1 1 320px; }
      .chips-servizi { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip-serv { appearance: none; font: inherit; font-size: 12px; font-weight: 550; padding: 5px 11px; border-radius: 980px; border: 1px solid var(--hairline-strong); background: var(--surface); color: var(--text-secondary); cursor: pointer; transition: all .15s var(--ease); }
      .chip-serv:hover { background: var(--fill); }
      .chip-serv.on { background: var(--ink, #1d1d1f); border-color: transparent; color: #fff; }
      .rosso { color: #C0392B; font-weight: 600; }
      .dovuto { color: #007aff; }
      .cod-link { font-weight: 600; color: var(--blue, #0a84ff); text-decoration: none; font-variant-numeric: tabular-nums; }
      .cod-link:hover { text-decoration: underline; }
      .mese { font-weight: 550; text-transform: capitalize; white-space: nowrap; }
      .incorso { margin-left: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--text-secondary); background: var(--fill, #f5f5f7); border-radius: 999px; padding: 2px 7px; cursor: help; }
      .regola { font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--text-secondary); background: var(--fill, #f5f5f7); border-radius: 999px; padding: 2px 8px; cursor: help; }
      .avviso { margin: -4px 0 12px; font-size: 13px; color: var(--text-secondary); }
      .riepilogo .oro { color: var(--gold-strong, #B8963E); }
      .tab .pill { margin-left: 6px; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); font-variant-numeric: tabular-nums; }
      .ric { margin-left: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--gold-strong, #B8963E); background: color-mix(in srgb, #B8963E 12%, transparent); border-radius: 999px; padding: 2px 6px; cursor: help; }
      .state-card { padding: 28px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class InvoicesListComponent {

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
  private readonly auth = inject(AuthService);

  readonly invoices = signal<Invoice[]>([]);
  readonly partners = signal<PartnerLite[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  /** Si apre su «Da fatturare»: e' la domanda che si fa arrivando qui. */
  readonly view = signal<'pending' | 'active' | 'archive'>('pending');
  readonly pending = signal<Pending[]>([]);
  readonly pendingTotals = signal<{ righe: number; partners: number; mesi: number; deliveriesCount: number; unpricedCount: number; ruleExcludedCount: number; fromListino: number; venduto: number; dovutoAlPartner: number; netAmount: number; totalAmount: number; arretrato: number; soglia: string; dateImpossibili: number } | null>(null);
  readonly pendingOpen = signal<string | null>(null);
  readonly pendingDetail = signal<PendingDelivery[]>([]);
  readonly pendingDetailLoading = signal(false);
  readonly pendingTroncato = signal(false);
  readonly expanded = signal<string | null>(null);

  partnerFilter = '';
  cerca = '';
  dal = '';
  al = '';
  stato = '';
  soloPrezzabili = false;
  /** Il debounce della ricerca: una chiamata per pausa, non per tasto. */
  private attesa?: ReturnType<typeof setTimeout>;
  readonly showGen = signal(false);
  readonly generating = signal(false);
  readonly genError = signal<string | null>(null);
  genPartner = '';
  genFrom = '';
  genTo = '';

  // Il filtro vero lo fa il server (vedi load()): qui resta solo cio' che il
  // server non sa, cioe' «nascondi le righe fatte di sole consegne senza prezzo».
  readonly filtered = computed(() => this.invoices());
  // Nel «Da fatturare» la ricerca resta qui: sono 189 righe, gia' scaricate, e
  // una chiamata al server per ogni lettera sarebbe uno spreco.
  readonly cercaPending = signal('');
  readonly pendingFiltered = computed(() => {
    const t = this.cercaPending().trim().toLowerCase();
    return this.pending().filter((r) =>
      (!this.soloPrezzabili || r.deliveriesCount > r.unpricedCount) &&
      (!t || r.partner.insegna.toLowerCase().includes(t)),
    );
  });

  /**
   * Il riepilogo grande del «Da fatturare» si ricalcola dalle VOCI EFFETTIVAMENTE
   * MOSTRATE (31/08): prima usava i totali del server, che ignorano la ricerca
   * e il «solo prezzabili» fatti lato client — così, filtrando, le card si
   * riducevano ma «Partner 64 · Consegne 1.017» restava fermo e sembrava che il
   * filtro non funzionasse. I conteggi seguono le card; gli avvisi globali
   * (arretrato, soglia) restano quelli del server.
   */
  readonly pendingTotaliVista = computed(() => {
    const voci = this.pendingFiltered();
    const s = this.pendingTotals();
    const somma = (f: (r: Pending) => number) => voci.reduce((a, r) => a + (f(r) || 0), 0);
    return {
      partners: new Set(voci.map((r) => r.partnerId)).size,
      deliveriesCount: somma((r) => r.deliveriesCount),
      netAmount: somma((r) => r.netAmount),
      venduto: somma((r) => r.venduto),
      dovutoAlPartner: somma((r) => r.dovutoAlPartner),
      totalAmount: somma((r) => r.totalAmount),
      unpricedCount: somma((r) => r.unpricedCount),
      ruleExcludedCount: somma((r) => r.ruleExcludedCount),
      arretrato: s?.arretrato ?? 0,
      soglia: s?.soglia ?? '',
    };
  });

  /** Il catalogo dei tipi di servizio, per il filtro per tipologia. */
  readonly serviceTypes = signal<{ id: string; name: string; pricingModel?: string }[]>([]);
  /** I tipi scelti. Vuoto = tutti, che è diverso da «nessuno». */
  readonly serviziScelti = signal<Set<string>>(new Set());

  scegliServizio(id: string): void {
    const x = new Set(this.serviziScelti());
    if (x.has(id)) x.delete(id); else x.add(id);
    this.serviziScelti.set(x);
  }

  private queryServizi(): string {
    return [...this.serviziScelti()].join(',');
  }

  filtriAttivi(): boolean {
    return !!(this.cerca || this.partnerFilter || this.dal || this.al || this.stato || this.soloPrezzabili || this.serviziScelti().size);
  }

  /**
   * Un filtro e' cambiato: si ricarica, ma non a ogni tasto.
   *
   * La ricerca aspetta una pausa di 300 ms; gli altri filtri no, perche' li si
   * cambia una volta sola e aspettare sembrerebbe un ritardo.
   */
  filtroCambiato(): void {
    this.cercaPending.set(this.cerca);
    clearTimeout(this.attesa);
    this.attesa = setTimeout(() => this.load(), 300);
  }

  azzeraFiltri(): void {
    this.cerca = ''; this.partnerFilter = ''; this.dal = ''; this.al = '';
    this.stato = ''; this.soloPrezzabili = false;
    this.serviziScelti.set(new Set());
    this.cercaPending.set('');
    this.load();
  }

  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }
  isPartner(): boolean { return this.auth.user()?.role === 'PARTNER'; }

  /**
   * L'importo mostrato in riga. Per il PARTNER, sulle VENDITE, è il valore
   * LORDO del prodotto (quello che incassa dal cliente); sugli altri servizi
   * resta l'importo che gli sarà fatturato. Per l'ufficio, invariato.
   */
  importoRiga(d: PendingDelivery): number | null {
    if (this.isPartner() && d.pricingModel === 'VENDITA' && d.venduto != null) return d.venduto;
    return d.amount;
  }
  /** Netto che spetta al partner: solo sulle vendite (quanto incassa netto). */
  nettoRiga(d: PendingDelivery): number | null {
    if (d.pricingModel !== 'VENDITA') return null;
    return d.dovutoAlPartner && d.dovutoAlPartner > 0 ? d.dovutoAlPartner : null;
  }

  /** Il periodo a un click: `0` = mese in corso (fino a oggi), `-1` = scorso, `-12` = anno in corso. */
  periodoRapido(scarto: number): void {
    const oggi = new Date();
    const g = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (scarto === -12) {
      this.dal = `${oggi.getFullYear()}-01-01`;
      this.al = g(oggi);
    } else if (scarto === -3) {
      // Trimestre (Libro v1.9 §8-bis): il mese in corso + i due prima.
      this.dal = g(new Date(oggi.getFullYear(), oggi.getMonth() - 2, 1));
      this.al = g(oggi);
    } else {
      const primo = new Date(oggi.getFullYear(), oggi.getMonth() + scarto, 1);
      const ultimo = new Date(oggi.getFullYear(), oggi.getMonth() + scarto + 1, 0);
      this.dal = g(primo);
      this.al = g(scarto === 0 ? oggi : ultimo);
    }
    this.filtroCambiato();
  }

  constructor() {
    // Di default si parte dal MESE IN CORSO (deciso dall'utente 27/08).
    this.periodoRapido(0);
    // Il conto sulla linguetta deve esserci anche partendo da un'altra scheda.
    if (this.view() !== 'pending') this.caricaTotaliPending();
    if (this.canManage()) {
      this.http.get<{ id: string; name: string; pricingModel?: string }[]>(`${environment.apiUrl}/service-types`)
        .subscribe({ next: (d) => this.serviceTypes.set(d ?? []), error: () => this.serviceTypes.set([]) });
      this.http.get<PartnerLite[]>(`${environment.apiUrl}/partners`).subscribe((d) =>
        this.partners.set(d.map((p) => ({ id: p.id, insegna: p.insegna }))),
      );
    }
  }

  setView(v: 'pending' | 'active' | 'archive'): void {
    if (this.view() === v) return;
    this.view.set(v);
    this.showGen.set(false);
    this.expanded.set(null);
    this.pendingOpen.set(null);
    this.load();
  }

  /** Apre/chiude le consegne da fatturare di un partner. */
  togglePendingDetail(r: Pending): void {
    if (this.pendingOpen() === r.chiave) { this.pendingOpen.set(null); return; }
    this.pendingOpen.set(r.chiave);
    this.pendingDetail.set([]);
    this.pendingDetailLoading.set(true);
    this.http.get<{ deliveries: PendingDelivery[]; troncato: boolean }>(
      `${environment.apiUrl}/invoices/pending/${r.partnerId}`,
      { params: { dal: this.primoDelMese(r.mese), al: this.ultimoDelMese(r.mese) } },
    ).subscribe({
      next: (d) => {
        this.pendingDetail.set(d.deliveries ?? []);
        this.pendingTroncato.set(!!d.troncato);
        this.pendingDetailLoading.set(false);
      },
      error: () => this.pendingDetailLoading.set(false),
    });
  }

  /**
   * Fattura tutto l'arretrato di un partner: apre il pannello Genera con
   * partner e periodo gia' compilati sul suo intervallo reale.
   *
   * Non genera da solo: il periodo e' una scelta contabile, e premere un tasto
   * che emette un documento senza mostrarlo prima sarebbe un gesto pesante.
   */
  /** Il primo e l'ultimo giorno del mese: la fattura copre il mese, non l'intervallo delle consegne. */
  primoDelMese(m: string): string { return m + '-01'; }
  ultimoDelMese(m: string): string {
    const [a, me] = m.split('-').map(Number);
    return `${m}-${String(new Date(a, me, 0).getDate()).padStart(2, '0')}`;
  }
  /** «2026-08» → «agosto 2026». */
  mese(m: string): string {
    const [a, me] = m.split('-').map(Number);
    return new Date(a, me - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  }

  readonly recapInCorso = signal<string | null>(null);

  /**
   * Scarica il recap del mese.
   *
   * Passa dall'HttpClient e non da un link aperto a mano: l'API vuole il
   * token, e una scheda nuova non se lo porta dietro — uscirebbe un 401
   * travestito da pagina vuota.
   */
  scaricaRecap(r: Pending): void {
    this.error.set(null);
    this.recapInCorso.set(r.chiave);
    this.http.get(`${environment.apiUrl}/invoices/recap/${r.partnerId}`, {
      params: { mese: r.mese, formato: 'html', ...(this.queryServizi() ? { servizi: this.queryServizi() } : {}) }, responseType: 'text',
    }).subscribe({
      next: (html) => {
        this.recapInCorso.set(null);
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `recap-${r.partner.insegna.replace(/[^w-]+/g, '-')}-${r.mese}.html`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.recapInCorso.set(null);
        this.error.set(e?.error?.message ?? 'Recap non riuscito');
      },
    });
  }

  /**
   * Manda il recap al partner.
   *
   * Chiede conferma ogni volta, col destinatario scritto: e' una mail che esce
   * davvero verso qualcuno, e un click di troppo non si disfa.
   */
  inviaRecap(r: Pending): void {
    const quando = this.mese(r.mese);
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.inviaRecap', { a: r.partner.insegna }),
      messaggio: this.translate.instant('invoices.pending.sendConfirm', { partner: r.partner.insegna, mese: quando }),
      verbo: this.translate.instant('conferme.invia'),
      tono: 'primary',
      azione: () => this.inviaRecapDavvero(r),
    });
  }

  private inviaRecapDavvero(r: Pending): void {
    this.error.set(null);
    this.recapInCorso.set(r.chiave);
    this.http.post<{ a: string; righe: number }>(
      `${environment.apiUrl}/invoices/recap/${r.partnerId}/invia`,
      { mese: r.mese, ...(this.serviziScelti().size ? { servizi: [...this.serviziScelti()] } : {}) },
    ).subscribe({
      next: (esito) => {
        this.recapInCorso.set(null);
        this.banner.set(this.translate.instant('invoices.pending.sent', { a: esito.a, n: esito.righe }));
      },
      error: (e) => {
        this.recapInCorso.set(null);
        this.error.set(e?.error?.message ?? 'Invio non riuscito');
      },
    });
  }

  fatturaTutto(r: Pending): void {
    this.genPartner = r.partnerId;
    this.genFrom = this.primoDelMese(r.mese);
    this.genTo = this.ultimoDelMese(r.mese);
    this.view.set('active');
    this.showGen.set(true);
    this.load();
  }

  /** Il conto sulla linguetta e' il totale, senza filtri: e' un'insegna, non un risultato. */
  private caricaTotaliPending(): void {
    this.http.get<{ totali: any }>(`${environment.apiUrl}/invoices/pending`)
      .subscribe({ next: (d) => this.pendingTotals.set(d.totali ?? null), error: () => {} });
  }

  /** Le righe della fattura aperta: si chiedono al momento, non prima. */
  readonly righe = signal<InvoiceLine[]>([]);
  readonly righeInCorso = signal(false);

  /**
   * Apre il dettaglio e VA A PRENDERE le righe.
   *
   * Prima l'elenco le portava tutte con se': lo Storico rispondeva 3,2 MB —
   * 559 fatture con dentro le loro 9.811 righe — e il browser si piantava a
   * montarle. Aperto un dettaglio per volta, sono una ventina di righe.
   */
  toggleDetail(i: Invoice): void {
    if (this.expanded() === i.id) { this.expanded.set(null); return; }
    this.expanded.set(i.id);
    this.righe.set([]);
    this.righeInCorso.set(true);
    this.http.get<InvoiceLine[]>(`${environment.apiUrl}/invoices/${i.id}/lines`).subscribe({
      next: (r) => { this.righe.set(r ?? []); this.righeInCorso.set(false); },
      error: () => this.righeInCorso.set(false),
    });
  }

  /** Apre il pannello Genera precompilando il partner dal filtro. */
  toggleGen(): void {
    const open = !this.showGen();
    this.showGen.set(open);
    if (open && this.partnerFilter) this.genPartner = this.partnerFilter;
  }

  private load(): void {
    this.loading.set(true);
    const filtri: Record<string, string> = {};
    if (this.partnerFilter) filtri['partnerId'] = this.partnerFilter;
    if (this.dal) filtri['dal'] = this.dal;
    if (this.al) filtri['al'] = this.al;
    if (this.view() === 'pending') {
      this.http.get<{ voci: Pending[]; totali: any }>(
        `${environment.apiUrl}/invoices/pending`, { params: filtri },
      ).subscribe({
        next: (d) => {
          this.pending.set(d.voci ?? []);
          this.pendingTotals.set(d.totali ?? null);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Caricamento non riuscito');
        },
      });
      return;
    }
    if (this.view() === 'archive') filtri['archived'] = 'true';
    if (this.stato) filtri['stato'] = this.stato;
    if (this.cerca.trim()) filtri['cerca'] = this.cerca.trim();
    this.http.get<Invoice[]>(`${environment.apiUrl}/invoices`, { params: filtri }).subscribe({
      next: (d) => { this.invoices.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }
  next(status: string): { next: string; key: string } | null { return NEXT[status] ?? null; }
  isPaid(i: Invoice): boolean { return i.status === 'PAID'; }

  /** IVA in euro: il totale meno l'imponibile, non ricalcolata sull'aliquota. */
  iva(i: Invoice): number { return Math.round(((i.totalAmount ?? 0) - (i.netAmount ?? 0)) * 100) / 100; }

  /**
   * Vero quando il totale non viene dal documento ma dall'imponibile.
   *
   * Il legacy teneva l'importo con IVA in un solo campo, e su 292 fatture su
   * 559 quel campo era vuoto: a schermo uscivano 0 €. Il totale lì è
   * l'imponibile x 1,22 — la stessa regola che combacia al centesimo sulle
   * altre — e chi guarda ha diritto di sapere che è ricostruito.
   */
  ricostruito(i: Invoice): boolean { return !i.legacyTotalAmount && (i.totalAmount ?? 0) > 0; }

  generate(): void {
    this.genError.set(null);
    if (!this.genPartner || !this.genFrom || !this.genTo) {
      this.genError.set(this.translate.instant('invoices.gen.required'));
      return;
    }
    this.generating.set(true);
    this.http.post(`${environment.apiUrl}/invoices/generate`, {
      partnerId: this.genPartner, periodStart: this.genFrom, periodEnd: this.genTo,
    }).subscribe({
      next: () => {
        this.generating.set(false);
        this.showGen.set(false);
        this.genPartner = ''; this.genFrom = ''; this.genTo = '';
        this.banner.set(this.translate.instant('invoices.gen.done'));
        this.load();
      },
      error: (err) => { this.generating.set(false); this.genError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  advance(i: Invoice, status: string): void {
    this.error.set(null);
    this.busy.set(i.id);
    this.http.patch(`${environment.apiUrl}/invoices/${i.id}/status`, { status }).subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore nel cambio di stato'); },
    });
  }

  reopen(i: Invoice): void {
    this.error.set(null);
    this.busy.set(i.id);
    this.http.post(`${environment.apiUrl}/invoices/${i.id}/reopen`, {}).subscribe({
      next: () => { this.busy.set(null); this.banner.set(this.translate.instant('invoices.reopened')); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  /** Esporta la lista corrente (filtrata) in CSV. */
  exportCsv(): void {
    const t = (k: string) => this.translate.instant(k);
    const head = [
      t('invoices.col.partner'), t('invoices.col.number'), t('invoices.col.period'),
      t('invoices.col.deliveries'), t('invoices.col.net'), t('invoices.col.vat'),
      t('invoices.col.total'), t('invoices.col.status'),
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = this.filtered().map((i) => [
      i.partner?.insegna ?? '',
      i.number ?? '',
      `${i.periodStart?.slice(0, 10)} / ${i.periodEnd?.slice(0, 10)}`,
      String(i.deliveriesCount), i.netAmount.toFixed(2), this.iva(i).toFixed(2),
      i.totalAmount.toFixed(2), this.statusLabel(i.status),
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fatture-${this.view()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
