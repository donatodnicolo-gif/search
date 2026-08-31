import { ConfermaComponent } from '../shared/conferma.component';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ValetRef } from '../core/models';

/** Una riga di «Da pagare»: un valet e il lavoro che aspetta uno stipendio. */
interface Pending {
  valetId: string;
  valet: { id: string; firstName: string; lastName: string; hasVat: boolean };
  deliveriesCount: number;
  /** Consegne senza paga e senza listino: non entrano nello stipendio. */
  unpaidCount: number;
  /** Escluse da una regola carnet: non sono un buco, sono una decisione. */
  ruleExcludedCount: number;
  fromListino: number;
  grossAmount: number;
  cashDeductions: number;
  netAmount: number;
  from: string;
  to: string;
}
interface PendingDelivery {
  id: string; code: number; date: string; status: string;
  address?: string | null; service: string; cash: number;
  /** Plus/minus dentro la paga: quello della consegna + regola carnet + scaglione ritiri. */
  plusMinus?: number;
  /** null = non pagabile: nessuna paga, nessun listino, o regola «non pagare». */
  amount: number | null;
  origine: 'consegna' | 'listino' | null;
  esclusaDaRegola: boolean;
  regola?: string | null;
  /** Flag «non pagabile» sulla consegna: si mostra marcata, non si conta. */
  nonPagabile?: boolean;
  /** A ora in attesa di approvazione: si mostra, la paga arriva dopo il via libera. */
  daApprovare?: boolean;
  /** Nel giro di un'altra consegna (stesso valet+giorno+DDT): paga sulla principale. */
  nelGiro?: boolean;
  giroDdt?: string | null;
  /** Sulla principale: quanti ritiri conta il giro (scaglioni della regola valet). */
  ritiriGiro?: number | null;
}

interface Salary {

  id: string;
  valetId: string;
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  cashDeductions: number;
  netAmount: number;
  documentType: string;
  status: string;
  archived: boolean;
  // Richiesta di pagamento inoltrata a Deluxy Transactions (specchio
  // dell'esito notificato: PAID lo scrive il webhook, non un bottone).
  richiestaRif?: string | null;
  richiestaStato?: string | null;
  richiestaEsito?: string | null;
  valet?: { id: string; firstName: string; lastName: string; hasVat: boolean };
  receipts?: { id: string; signed: boolean }[];
  claims?: { id: string; amount: number; status: string }[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Bozza', color: '#8A8A8E' },
  SENT: { label: 'Inviato · da firmare', color: '#007aff' },
  RECEIPT_PENDING: { label: 'Ricevuta firmata · da approvare', color: '#C04C00' },
  APPROVED: { label: 'Approvato', color: 'var(--blue, #0071e3)' /* §5: l'oro non e' MAI uno stato; APPROVED e' in lavorazione verso PAID -> blu */ },
  PAID: { label: 'Pagato', color: '#248A3D' },
};
/** Passo successivo del flusso lato admin: stato → { next, azione }.
 *  Da SENT si passa a RECEIPT_PENDING quando il VALET firma la ricevuta (pagina Ricevute),
 *  quindi qui non c'è un'azione admin su SENT. */
const NEXT: Record<string, { next: string; key: string }> = {
  DRAFT: { next: 'SENT', key: 'send' },
  RECEIPT_PENDING: { next: 'APPROVED', key: 'approve' },
  APPROVED: { next: 'PAID', key: 'markPaid' },
};

/** Amministrazione → Stipendi: genera, gestisce il flusso, archivia; il valet vede i propri e apre reclami. */
@Component({
  selector: 'app-salaries-list',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe, ConfermaComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'salaries.title' | translate }}</h1>
        <p class="page-caption">{{ 'salaries.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-ghost" [disabled]="!filtered().length" (click)="exportCsv()">{{ 'salaries.export' | translate }}</button>
        @if (canManage() && view() === 'active') {
          <button class="btn btn-primary" (click)="toggleGen()">{{ (showGen() ? 'common.cancel' : 'salaries.generate') | translate }}</button>
        }
      </div>
    </div>

    <div class="tabs">
      <button class="tab" [class.on]="view() === 'pending'" (click)="setView('pending')">
        {{ 'salaries.tab.pending' | translate }}
        @if (pendingTotals(); as t) { <span class="pill">{{ t.deliveriesCount | number }}</span> }
      </button>
      <button class="tab" [class.on]="view() === 'active'" (click)="setView('active')">{{ 'salaries.tab.active' | translate }}</button>
      <button class="tab" [class.on]="view() === 'archive'" (click)="setView('archive')">{{ 'salaries.tab.archive' | translate }}</button>
    </div>

    <!-- I filtri vanno al server: filtrare nel browser dopo aver scaricato
         tutto regge finche' gli stipendi sono pochi, non oltre. -->
    <div class="filtri card">
      <!-- I periodi che si usano davvero, a un click: il mese e il mese scorso. -->
      <div class="f">
        <span>{{ 'salaries.filter.period' | translate }}</span>
        <div class="quick">
          <button type="button" class="quick-tab" (click)="periodoRapido(0)">{{ 'salaries.filter.thisMonth' | translate }}</button>
          <button type="button" class="quick-tab" (click)="periodoRapido(-1)">{{ 'salaries.filter.lastMonth' | translate }}</button>
          <!-- Le 4 scorciatoie canoniche complete (Libro v1.9 §8-bis): mancavano Trimestre e Anno. -->
          <button type="button" class="quick-tab" (click)="periodoRapido(-3)">{{ 'salaries.filter.quarter' | translate }}</button>
          <button type="button" class="quick-tab" (click)="periodoRapido(-12)">{{ 'salaries.filter.thisYear' | translate }}</button>
        </div>
      </div>
      <!-- La ricerca per nome del valet NON ha senso per il valet stesso:
           vede solo i propri (31/08). Resta per admin/operation. -->
      @if (canManage()) {
        <label class="f cerca">
          <span>{{ 'salaries.filter.search' | translate }}</span>
          <input class="field" type="search" [(ngModel)]="cerca" (ngModelChange)="filtroCambiato()"
                 [placeholder]="'salaries.filter.searchPh' | translate" />
        </label>
      }
      @if (canManage()) {
        <label class="f">
          <span>{{ 'salaries.col.valet' | translate }}</span>
          <select class="field" [(ngModel)]="valetFilter" (ngModelChange)="filtroCambiato()">
            <option value="">{{ 'salaries.allValets' | translate }}</option>
            @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
          </select>
        </label>
      }
      <label class="f">
        <span>{{ 'salaries.filter.from' | translate }}</span>
        <input class="field" type="date" [(ngModel)]="dal" (ngModelChange)="filtroCambiato()" />
      </label>
      <label class="f">
        <span>{{ 'salaries.filter.to' | translate }}</span>
        <input class="field" type="date" [(ngModel)]="al" (ngModelChange)="filtroCambiato()" />
      </label>
      @if (view() !== 'pending') {
        <label class="f">
          <span>{{ 'salaries.col.status' | translate }}</span>
          <select class="field" [(ngModel)]="stato" (ngModelChange)="filtroCambiato()">
            <option value="">{{ 'salaries.filter.allStatuses' | translate }}</option>
            @for (k of statiPossibili; track k) { <option [value]="k">{{ statusLabel(k) }}</option> }
          </select>
        </label>
      } @else {
        <label class="f interruttore">
          <input type="checkbox" [(ngModel)]="soloPagabili" (ngModelChange)="filtroCambiato()" />
          <span>{{ 'salaries.filter.onlyPayable' | translate }}</span>
        </label>
      }
      <!-- ⭐ 27/08 (chiesto dall'utente): si sceglie DI QUALI servizi fare il
           conto — «prima le consegne standard, poi le vendite». Le caselle
           invece di una tendina multipla: una tendina a selezione multipla si
           usa male col mouse e malissimo col dito. -->
      @if (serviceTypes().length) {
        <div class="f servizi">
          <span>{{ 'salaries.filter.services' | translate }}</span>
          <div class="chips-servizi">
            @for (s of serviceTypes(); track s.id) {
              <button type="button" class="chip-serv" [class.on]="serviziScelti().has(s.id)"
                      (click)="scegliServizio(s.id)">{{ s.name }}</button>
            }
          </div>
        </div>
      }
      @if (filtriAttivi()) {
        <button type="button" class="link-btn azzera" (click)="azzeraFiltri()">{{ 'salaries.filter.clear' | translate }}</button>
      }
    </div>


    @if (showGen() && view() === 'active') {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span class="req">{{ 'salaries.gen.valet' | translate }}</span>
            <select class="field" [(ngModel)]="genValet" (ngModelChange)="onGenValetChange()">
              <option value="">{{ 'salaries.gen.pickValet' | translate }}</option>
              @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
          <label class="fld"><span class="req">{{ 'salaries.gen.from' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="genFrom" /></label>
          <label class="fld"><span class="req">{{ 'salaries.gen.to' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="genTo" /></label>
        </div>
        @if (freqHint()) { <p class="hint">{{ freqHint() }}</p> }
        <p class="hint">{{ 'salaries.gen.hint' | translate }}</p>
        @if (genError()) { <div class="error-card">{{ genError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="generating()" (click)="generate()">
            {{ generating() ? ('common.saving' | translate) : ('salaries.gen.run' | translate) }}
          </button>
        </div>
      </section>
    }

    @if (banner(); as b) { <div class="ok-card card">{{ b }}</div> }
    @if (error()) { <div class="error-card card">{{ error() }}</div> }

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }

    <!-- «Da pagare»: il lavoro che aspetta uno stipendio, non gli stipendi. -->
    @else if (view() === 'pending') {
      @if (pendingTotals(); as t) {
        <div class="card riepilogo">
          <div><span class="etichetta">{{ 'salaries.pending.valets' | translate }}</span><strong>{{ t.valets | number }}</strong></div>
          <div><span class="etichetta">{{ 'salaries.pending.deliveries' | translate }}</span><strong>{{ t.deliveriesCount | number }}</strong></div>
          <div><span class="etichetta">{{ 'salaries.col.gross' | translate }}</span><strong>{{ t.grossAmount | number: '1.2-2' }} €</strong></div>
          <div><span class="etichetta">{{ 'salaries.col.cash' | translate }}</span><strong>−{{ t.cashDeductions | number: '1.2-2' }} €</strong></div>
          <div><span class="etichetta">{{ 'salaries.col.net' | translate }}</span><strong class="oro">{{ t.netAmount | number: '1.2-2' }} €</strong></div>
          @if (t.unpaidCount) {
            <div><span class="etichetta">{{ 'salaries.pending.unpaid' | translate }}</span><strong class="rosso">{{ t.unpaidCount | number }}</strong></div>
          }
          @if (t.ruleExcludedCount) {
            <div><span class="etichetta">{{ 'salaries.pending.byRule' | translate }}</span><strong>{{ t.ruleExcludedCount | number }}</strong></div>
          }
        </div>
        @if (t.unpaidCount) {
          <p class="avviso">{{ 'salaries.pending.unpaidHint' | translate:{ n: t.unpaidCount } }}</p>
        }
        @if (t.arretrato) {
          <p class="avviso">{{ 'salaries.pending.backlog' | translate:{ n: t.arretrato, d: (t.soglia | date: 'dd/MM/yyyy') } }}</p>
        }
      }
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'salaries.col.valet' | translate }}</th>
              <th>{{ 'salaries.col.period' | translate }}</th>
              <th class="num">{{ 'salaries.pending.deliveries' | translate }}</th>
              <th class="num">{{ 'salaries.pending.unpaid' | translate }}</th>
              <th class="num">{{ 'salaries.col.gross' | translate }}</th>
              <th class="num">{{ 'salaries.col.net' | translate }}</th>
              <th>{{ 'salaries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of pendingFiltered(); track r.valetId) {
              <tr>
                <td class="strong">{{ r.valet.lastName }} {{ r.valet.firstName }}</td>
                <td class="muted">{{ r.from | date: 'dd/MM/yy' }} – {{ r.to | date: 'dd/MM/yy' }}</td>
                <td class="num">
                  {{ r.deliveriesCount | number }}
                  @if (r.fromListino) { <span class="ric" [title]="'salaries.pending.fromListinoHint' | translate">{{ 'salaries.pending.fromListino' | translate:{ n: r.fromListino } }}</span> }
                </td>
                <td class="num">
                  @if (r.unpaidCount) { <span class="rosso">{{ r.unpaidCount | number }}</span> } @else { <span class="muted">—</span> }
                </td>
                <td class="num muted">{{ r.grossAmount | number: '1.2-2' }} €</td>
                <td class="num strong">{{ r.netAmount | number: '1.2-2' }} €</td>
                <td class="row-actions">
                  <button class="link-btn" (click)="togglePendingDetail(r)">
                    {{ (pendingOpen() === r.valetId ? 'salaries.action.hideDetail' : 'salaries.action.detail') | translate }}
                  </button>
                  <!-- Il recap come nell'app attuale: si scarica (e si stampa),
                       o parte via AI Mail al valet. -->
                  <button class="link-btn" [disabled]="recapInCorso() === r.valetId" (click)="scaricaRecap(r)">
                    {{ 'salaries.pending.recap' | translate }}
                  </button>
                  <!-- Solo senza P.IVA: la ricevuta di prestazione occasionale
                       in stile legacy, da stampare e firmare. -->
                  @if (!r.valet.hasVat) {
                    <button class="link-btn" [disabled]="recapInCorso() === r.valetId" (click)="scaricaRicevuta(r)">
                      {{ 'salaries.pending.ricevuta' | translate }}
                    </button>
                  }
                  @if (canManage()) {
                    <button class="link-btn" [disabled]="recapInCorso() === r.valetId" (click)="inviaRecap(r)">
                      {{ (recapInCorso() === r.valetId ? 'common.saving' : 'salaries.pending.sendRecap') | translate }}
                    </button>
                    <button class="link-btn" (click)="pagaTutto(r)">{{ 'salaries.pending.payAll' | translate }}</button>
                  }
                </td>
              </tr>
              @if (pendingOpen() === r.valetId) {
                <tr class="detail-row">
                  <td colspan="7">
                    @if (pendingDetailLoading()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
                    @else {
                      <table class="sub">
                        <thead><tr>
                          <th>{{ 'salaries.line.delivery' | translate }}</th>
                          <th>{{ 'salaries.line.date' | translate }}</th>
                          <th>{{ 'salaries.pending.service' | translate }}</th>
                          <th>{{ 'salaries.pending.address' | translate }}</th>
                          <th class="num">{{ 'salaries.col.cash' | translate }}</th>
                          <th class="num">{{ 'salaries.line.plusMinus' | translate }}</th>
                          <th class="num">{{ 'salaries.line.amount' | translate }}</th>
                        </tr></thead>
                        <tbody>
                          @for (d of pendingDetail(); track d.id) {
                            <tr>
                              <td class="mono">
                                <a class="link-btn" [href]="'/deliveries/' + d.id" target="_blank" rel="noopener"
                                   [title]="'salaries.line.openDelivery' | translate">#{{ d.code }}</a>
                              </td>
                              <td>{{ d.date | date: 'dd/MM/yy' }}</td>
                              <td class="muted">{{ d.service }}</td>
                              <td class="muted">{{ d.address || '—' }}</td>
                              <td class="num">{{ d.cash ? ('−' + (d.cash | number: '1.2-2') + ' €') : '—' }}</td>
                              <td class="num" [class.rosso]="(d.plusMinus ?? 0) < 0">
                                @if (d.plusMinus) { {{ (d.plusMinus > 0 ? '+' : '') + (d.plusMinus | number: '1.2-2') }} € } @else { — }
                              </td>
                              <td class="num">
                                @if (d.nelGiro) {
                                  <span class="regola" [title]="'salaries.pending.nelGiroHint' | translate">{{ 'salaries.pending.nelGiro' | translate:{ ddt: d.giroDdt } }}</span>
                                } @else if (d.daApprovare) {
                                  <span class="regola" [title]="'salaries.pending.toApproveHint' | translate">{{ 'salaries.pending.toApprove' | translate }}</span>
                                } @else if (d.nonPagabile) {
                                  <span class="muted" [title]="'salaries.pending.notPayableHint' | translate">{{ 'salaries.pending.notPayable' | translate }}</span>
                                } @else if (d.esclusaDaRegola) {
                                  <span class="regola" [title]="d.regola || ''">{{ 'salaries.pending.byRuleRow' | translate }}</span>
                                } @else if (d.amount === null) {
                                  <span class="rosso" [title]="'salaries.pending.unpaidRow' | translate">{{ 'salaries.pending.noPay' | translate }}</span>
                                } @else {
                                  {{ d.amount | number: '1.2-2' }} €
                                  @if (d.origine === 'listino') { <span class="ric" [title]="'salaries.pending.fromListinoHint' | translate">{{ 'salaries.pending.listino' | translate }}</span> }
                                  @if (d.ritiriGiro) { <span class="ric" [title]="'salaries.pending.giroPrincipaleHint' | translate">{{ 'salaries.pending.giroPrincipale' | translate:{ n: d.ritiriGiro } }}</span> }
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      @if (pendingTroncato()) { <p class="hint">{{ 'salaries.pending.capped' | translate }}</p> }
                    }
                  </td>
                </tr>
              }
            }
            @if (!pendingFiltered().length) {
              <tr><td colspan="7" class="muted empty">{{ 'salaries.pending.empty' | translate }}</td></tr>
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
              <th>{{ 'salaries.col.valet' | translate }}</th>

              <th>{{ 'salaries.col.period' | translate }}</th>
              <th class="num">{{ 'salaries.col.gross' | translate }}</th>
              <th class="num">{{ 'salaries.col.cash' | translate }}</th>
              <th class="num">{{ 'salaries.col.net' | translate }}</th>
              <th>{{ 'salaries.col.document' | translate }}</th>
              <th>{{ 'salaries.col.status' | translate }}</th>
              @if (view() === 'archive') { <th>{{ 'salaries.col.financial' | translate }}</th> }
              <th>{{ 'salaries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (s of filtered(); track s.id) {
              <tr>
                <td class="strong">{{ s.valet?.lastName }} {{ s.valet?.firstName }}</td>
                <td class="muted">{{ s.periodStart | date: 'dd/MM/yy' }} – {{ s.periodEnd | date: 'dd/MM/yy' }}</td>
                <td class="num">{{ s.grossAmount | number: '1.2-2' }} €</td>
                <td class="num">{{ s.cashDeductions ? '−' + (s.cashDeductions | number: '1.2-2') + ' €' : '—' }}</td>
                <td class="num strong">{{ s.netAmount | number: '1.2-2' }} €</td>
                <td>{{ ('salaries.doc.' + s.documentType) | translate }}</td>
                <td>
                  <span class="badge" [style.--c]="statusColor(s.status)"><span class="dot"></span>{{ statusLabel(s.status) }}</span>
                  @if (s.claims?.length) { <span class="claim-tag">{{ 'salaries.claimOpen' | translate }}</span> }
                </td>
                @if (view() === 'archive') {
                  <td>
                    <span class="badge" [style.--c]="isPaid(s) ? '#248A3D' : '#8A8A8E'"><span class="dot"></span>{{ (isPaid(s) ? 'salaries.fin.paid' : 'salaries.fin.unpaid') | translate }}</span>
                  </td>
                }
                <td class="row-actions">
                  @if (canRequestPay(s)) {
                    <button class="link-btn" [disabled]="busy() === s.id" (click)="requestPay(s)">{{ 'salaries.requestPay' | translate }}</button>
                  }
                  @if (s.richiestaRif && !isPaid(s)) {
                    <span class="muted" [title]="s.richiestaEsito || ''">{{ s.richiestaRif }} · {{ s.richiestaStato || '…' }}</span>
                  }
                  @if (canManage() && view() === 'active' && next(s.status); as n) {
                    <button class="link-btn" [disabled]="busy() === s.id" (click)="advance(s, n.next)">{{ ('salaries.action.' + n.key) | translate }}</button>
                  }
                  @if (canManage() && view() === 'archive') {
                    @if (s.status === 'SENT') { <span class="muted">{{ 'salaries.awaitSignature' | translate }}</span> }
                    @if (next(s.status); as n) {
                      <button class="link-btn" [disabled]="busy() === s.id" (click)="advance(s, n.next)">{{ ('salaries.action.' + n.key) | translate }}</button>
                    }
                    @if (!isPaid(s)) {
                      <button class="link-btn danger" [disabled]="busy() === s.id" (click)="reopen(s)">{{ 'salaries.action.reopen' | translate }}</button>
                    } @else { <span class="muted">✓</span> }
                  }
                  <button class="link-btn" (click)="openReclamo(s)">{{ 'salaries.action.reclamo' | translate }}</button>
                </td>
              </tr>
              @if (reclamoFor() === s.id) {
                <tr class="reclamo-row">
                  <td [attr.colspan]="view() === 'archive' ? 9 : 8">
                    <div class="reclamo">
                      <span class="reclamo-title">{{ 'salaries.reclamo.title' | translate }}</span>
                      <input class="field small" type="number" min="0" step="0.01" [(ngModel)]="reclamoAmount" [placeholder]="'salaries.reclamo.amount' | translate" />
                      <input class="field" [(ngModel)]="reclamoDesc" [placeholder]="'salaries.reclamo.desc' | translate" />
                      <button class="btn btn-primary" [disabled]="busy() === s.id" (click)="submitReclamo(s)">{{ 'salaries.reclamo.send' | translate }}</button>
                      <button class="btn btn-ghost" (click)="reclamoFor.set(null)">{{ 'common.cancel' | translate }}</button>
                    </div>
                  </td>
                </tr>
              }
            }
            @if (!filtered().length) { <tr><td [attr.colspan]="view() === 'archive' ? 9 : 8" class="muted empty">{{ 'salaries.empty' | translate }}</td></tr> }
          </tbody>
        </table>
      </div>

      <!-- STORICO PAGAMENTI dal sistema precedente (31/08): le ricevute
           importate dal legacy sono stipendi già pagati. Si mostrano nella
           scheda Archivio così lo storico non è vuoto. -->
      @if (view() === 'archive' && storico().length) {
        <h2 class="sez-storico">{{ 'salaries.legacyTitle' | translate }}</h2>
        <div class="card table-wrap">
          <table class="table">
            <thead>
              <tr>
                @if (canManage()) { <th>{{ 'salaries.col.valet' | translate }}</th> }
                <th>{{ 'salaries.col.date' | translate }}</th>
                <th class="num">{{ 'salaries.col.amount' | translate }}</th>
                <th>{{ 'salaries.col.status' | translate }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of storico(); track r.id) {
                <tr>
                  @if (canManage()) { <td>{{ r.valet?.lastName }} {{ r.valet?.firstName }}</td> }
                  <td>{{ r.createdAt | date: 'dd/MM/yyyy' }}</td>
                  <td class="num">{{ r.amount != null ? (r.amount | number: '1.2-2') + ' €' : '—' }}</td>
                  <td>{{ r.status || '—' }}</td>
                  <td>@if (r.fileUrl) { <a class="act" [href]="r.fileUrl" target="_blank" rel="noopener">{{ 'salaries.legacyDoc' | translate }}</a> }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    [conMotivo]="c.conMotivo ?? false" [motivoLabel]="c.motivoLabel ?? ''"
                    (confermato)="eseguiConferma($event)" (annullato)="confermaPendente.set(null)" />
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .filtri { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; padding: 14px 18px; margin-bottom: 12px; }
      .filtri .f { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
      .quick { display: inline-flex; background: var(--fill, #f5f5f7); border-radius: 980px; padding: 2px; }
      .quick-tab { border: 0; background: none; border-radius: 980px; padding: 6px 14px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .quick-tab:hover { color: var(--text); }
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
      .riepilogo { display: flex; gap: 32px; flex-wrap: wrap; padding: 16px 20px; margin-bottom: 12px; }
      .riepilogo > div { display: flex; flex-direction: column; gap: 2px; }
      .riepilogo .etichetta { font-size: 12px; color: var(--text-secondary); }
      .riepilogo strong { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
      .riepilogo .oro { color: var(--gold-strong, #B8963E); }
      .rosso { color: #C0392B; font-weight: 600; }
      .regola { font-size: 11px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--text-secondary); background: var(--fill, #f5f5f7); border-radius: 999px; padding: 2px 8px; cursor: help; }
      .avviso { margin: -4px 0 12px; font-size: 13px; color: var(--text-secondary); }
      .ric { margin-left: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: var(--gold-strong, #B8963E); background: color-mix(in srgb, #B8963E 12%, transparent); border-radius: 999px; padding: 2px 6px; cursor: help; }
      .tab .pill { margin-left: 6px; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: color-mix(in srgb, currentColor 14%, transparent); font-variant-numeric: tabular-nums; }
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
      .claim-tag { margin-left: 8px; font-size: 11px; font-weight: 600; color: #C04C00; }
      .row-actions { display: flex; gap: 12px; align-items: center; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .link-btn:disabled { opacity: 0.5; cursor: default; }
      .reclamo-row td { background: var(--fill); }
      .reclamo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .reclamo-title { font-weight: 600; font-size: 13px; }
      .field.small { max-width: 120px; }
      .state-card { padding: 28px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class SalariesListComponent {

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

  readonly salaries = signal<Salary[]>([]);
  /** Storico pagamenti dal sistema precedente (ricevute legacy). */
  readonly storico = signal<{ id: string; amount?: number | null; status?: string | null;
    fileUrl?: string | null; createdAt: string;
    valet?: { firstName: string; lastName: string } | null }[]>([]);
  readonly valets = signal<ValetRef[]>([]);
  /** Il catalogo dei tipi di servizio, per il filtro per tipologia. */
  readonly serviceTypes = signal<{ id: string; name: string; pricingModel?: string }[]>([]);
  /** I tipi scelti. Vuoto = tutti, che è diverso da «nessuno». */
  readonly serviziScelti = signal<Set<string>>(new Set());

  scegliServizio(id: string): void {
    const s = new Set(this.serviziScelti());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.serviziScelti.set(s);
    this.filtroCambiato();
  }

  /** La query dei servizi, o niente se non se n'è scelto nessuno. */
  private queryServizi(): string {
    return [...this.serviziScelti()].join(',');
  }
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  /** Si apre su «Da pagare»: e' la domanda che si fa arrivando qui. */
  readonly view = signal<'pending' | 'active' | 'archive'>('pending');
  readonly pending = signal<Pending[]>([]);
  readonly pendingTotals = signal<{ valets: number; deliveriesCount: number; unpaidCount: number; ruleExcludedCount: number; fromListino: number; grossAmount: number; cashDeductions: number; netAmount: number; arretrato: number; soglia: string } | null>(null);
  readonly pendingOpen = signal<string | null>(null);
  readonly pendingDetail = signal<PendingDelivery[]>([]);
  readonly pendingDetailLoading = signal(false);
  readonly pendingTroncato = signal(false);
  readonly cercaPending = signal('');

  cerca = '';
  dal = '';
  al = '';
  stato = '';
  soloPagabili = false;
  readonly statiPossibili = ['DRAFT', 'SENT', 'RECEIPT_PENDING', 'APPROVED', 'PAID'];
  private attesa?: ReturnType<typeof setTimeout>;

  readonly pendingFiltered = computed(() => {
    const t = this.cercaPending().trim().toLowerCase();
    return this.pending().filter((r) =>
      (!this.soloPagabili || r.deliveriesCount > r.unpaidCount) &&
      (!t || `${r.valet.lastName} ${r.valet.firstName}`.toLowerCase().includes(t)),
    )
      // Dal lordo più alto: l'API restituisce i valet in ordine di incontro e
      // chi ha poche consegne finiva in fondo «a caso» — sembrava mancare.
      .sort((a, b) => b.netAmount - a.netAmount || `${a.valet.lastName}`.localeCompare(`${b.valet.lastName}`, 'it'));
  });


  valetFilter = '';
  readonly showGen = signal(false);
  readonly generating = signal(false);
  readonly genError = signal<string | null>(null);
  readonly freqHint = signal<string | null>(null);
  genValet = '';
  genFrom = '';
  genTo = '';

  // Reclamo (il valet apre un reclamo su una riga di stipendio)
  readonly reclamoFor = signal<string | null>(null);
  reclamoAmount: number | null = null;
  reclamoDesc = '';

  // Il filtro vero lo fa il server (vedi load()).
  readonly filtered = computed(() => this.salaries());

  canManage(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  /** «Richiedi pagamento» a Deluxy Transactions: solo ADMIN (come l'API),
   *  solo su APPROVED, e non se una richiesta è già in piedi — una richiesta
   *  rifiutata o annullata là si può rifare. */
  canRequestPay(s: Salary): boolean {
    if (this.auth.user()?.role !== 'ADMIN') return false;
    if (s.status !== 'APPROVED') return false;
    if (!s.richiestaRif) return true;
    return s.richiestaStato === 'annullata' || s.richiestaStato === 'rifiutata';
  }

  requestPay(s: Salary): void {
    this.error.set(null);
    this.busy.set(s.id);
    this.http.post(`${environment.apiUrl}/salaries/${s.id}/richiedi-pagamento`, {}).subscribe({
      next: () => { this.busy.set(null); this.banner.set(this.translate.instant('salaries.requestSent')); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore nell\'invio della richiesta'); },
    });
  }

  constructor() {
    // Di default si parte dal MESE CORRENTE (deciso dall'utente 27/08):
    // senza periodo la pagina mostrava tutto l'arretrato di sempre.
    this.periodoRapido(0);
    if (this.view() !== 'pending') this.caricaTotaliPending();
    if (this.canManage()) {
      // Nel filtro solo i valet ATTIVI (deciso dall'utente 27/08): gli inattivi
      // affollano la tendina senza avere lavoro da pagare.
      this.http.get<ValetRef[]>(`${environment.apiUrl}/valets`).subscribe((d) =>
        this.valets.set((d ?? []).filter((v) => v.active !== false)));
      // Il catalogo dei tipi di servizio, per il filtro per tipologia.
      this.http.get<{ id: string; name: string; pricingModel?: string }[]>(`${environment.apiUrl}/service-types`)
        .subscribe({ next: (d) => this.serviceTypes.set(d ?? []), error: () => this.serviceTypes.set([]) });
    }
  }

  setView(v: 'pending' | 'active' | 'archive'): void {
    if (this.view() === v) return;
    this.view.set(v);
    this.showGen.set(false);
    this.reclamoFor.set(null);
    this.load();
    if (v === 'archive' && !this.storico().length) this.caricaStorico();
  }

  /** Le ricevute del vecchio sistema (storico pagamenti). L'API /receipts
   *  filtra già per valet: il valet vede le sue, l'ufficio tutte. */
  private caricaStorico(): void {
    this.http.get<any[]>(`${environment.apiUrl}/receipts`).subscribe({
      next: (r) => this.storico.set((r ?? []).filter((x) => x.amount != null || x.fileUrl)),
      error: () => this.storico.set([]),
    });
  }

  /** Apre il pannello Genera precompilando il valet dal filtro (niente doppia scelta) + periodo dalla frequenza. */
  toggleGen(): void {
    const open = !this.showGen();
    this.showGen.set(open);
    if (open && this.valetFilter) { this.genValet = this.valetFilter; this.onGenValetChange(); }
  }

  /** Al cambio del valet, propone il periodo in base alla frequenza stipendio (mensile/settimanale). */
  onGenValetChange(): void {
    const v = this.valets().find((x) => x.id === this.genValet);
    if (!v) { this.freqHint.set(null); return; }
    const weekly = (v.salaryFrequency ?? 'monthly') === 'weekly';
    const now = new Date();
    let from: Date, to: Date;
    if (weekly) {
      // Settimana corrente: lunedì → domenica.
      const day = (now.getDay() + 6) % 7; // 0 = lunedì
      from = new Date(now); from.setDate(now.getDate() - day);
      to = new Date(from); to.setDate(from.getDate() + 6);
    } else {
      // Mese corrente: primo → ultimo giorno.
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    this.genFrom = this.iso(from);
    this.genTo = this.iso(to);
    this.freqHint.set(
      this.translate.instant(weekly ? 'salaries.gen.freqWeekly' : 'salaries.gen.freqMonthly'),
    );
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private load(): void {
    this.loading.set(true);
    const filtri: Record<string, string> = {};
    if (this.valetFilter) filtri['valetId'] = this.valetFilter;
    if (this.dal) filtri['dal'] = this.dal;
    if (this.al) filtri['al'] = this.al;
    if (this.queryServizi()) filtri['servizi'] = this.queryServizi();

    if (this.view() === 'pending') {
      this.http.get<{ voci: Pending[]; totali: any }>(
        `${environment.apiUrl}/salaries/pending`, { params: filtri },
      ).subscribe({
        next: (d) => {
          this.pending.set(d.voci ?? []);
          this.pendingTotals.set(d.totali ?? null);
          this.loading.set(false);
        },
        error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
      });
      return;
    }
    if (this.view() === 'archive') filtri['archived'] = 'true';
    if (this.stato) filtri['stato'] = this.stato;
    if (this.cerca.trim()) filtri['cerca'] = this.cerca.trim();
    this.http.get<Salary[]>(`${environment.apiUrl}/salaries`, { params: filtri }).subscribe({
      next: (d) => { this.salaries.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  /** Il conto sulla linguetta e' il totale, senza filtri: e' un'insegna. */
  private caricaTotaliPending(): void {
    this.http.get<{ totali: any }>(`${environment.apiUrl}/salaries/pending`)
      .subscribe({ next: (d) => this.pendingTotals.set(d.totali ?? null), error: () => {} });
  }

  filtriAttivi(): boolean {
    return !!(this.cerca || this.valetFilter || this.dal || this.al || this.stato || this.soloPagabili || this.serviziScelti().size);
  }

  /** Un filtro e' cambiato: si ricarica dopo una pausa, non a ogni tasto. */
  /** Il mese a un click: `0` = in corso (fino a oggi), `-1` = scorso, in ora
   *  locale. `-3` = trimestre (il mese in corso + i due prima) e `-12` = anno
   *  in corso: le 4 scorciatoie canoniche del Libro v1.9 §8-bis. Filtrano
   *  sulle DATE DELLE CONSEGNE pagate (dal/al), come i due campi liberi. */
  periodoRapido(scarto: number): void {
    const oggi = new Date();
    const g = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (scarto === -12) {
      this.dal = `${oggi.getFullYear()}-01-01`;
      this.al = g(oggi);
    } else if (scarto === -3) {
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

  readonly recapInCorso = signal<string | null>(null);

  /**
   * Scarica il recap paghe del periodo in tabella (r.from → r.to).
   * Passa dall'HttpClient: l'API vuole il token, e una scheda aperta a mano
   * non se lo porta dietro — uscirebbe un 401 travestito da pagina vuota.
   */
  /** La ricevuta legacy (senza P.IVA): si scarica, si stampa, si firma. */
  scaricaRicevuta(r: Pending): void {
    this.error.set(null);
    this.recapInCorso.set(r.valetId);
    this.http.get(`${environment.apiUrl}/salaries/ricevuta/${r.valetId}`, {
      params: { dal: r.from.slice(0, 10), al: r.to.slice(0, 10), ...(this.queryServizi() ? { servizi: this.queryServizi() } : {}) }, responseType: 'text',
    }).subscribe({
      next: (html) => {
        this.recapInCorso.set(null);
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `ricevuta-${r.valet.lastName}-${r.from.slice(0, 10)}.html`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.recapInCorso.set(null);
        this.error.set(e?.error?.message ?? 'Ricevuta non riuscita');
      },
    });
  }

  scaricaRecap(r: Pending): void {
    this.error.set(null);
    this.recapInCorso.set(r.valetId);
    this.http.get(`${environment.apiUrl}/salaries/recap/${r.valetId}`, {
      params: { dal: r.from.slice(0, 10), al: r.to.slice(0, 10), formato: 'html', ...(this.queryServizi() ? { servizi: this.queryServizi() } : {}) }, responseType: 'text',
    }).subscribe({
      next: (html) => {
        this.recapInCorso.set(null);
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `recap-paghe-${r.valet.lastName}-${r.from.slice(0, 10)}.html`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.recapInCorso.set(null);
        this.error.set(e?.error?.message ?? 'Recap non riuscito');
      },
    });
  }

  /** Manda il recap al valet: conferma ogni volta, col nome scritto. */
  inviaRecap(r: Pending): void {
    const nome = `${r.valet.lastName} ${r.valet.firstName}`;
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.inviaRecap', { a: nome }),
      messaggio: this.translate.instant('salaries.pending.sendConfirm', { valet: nome }),
      verbo: this.translate.instant('conferme.invia'),
      tono: 'primary',
      azione: () => this.inviaRecapDavvero(r),
    });
  }

  private inviaRecapDavvero(r: Pending): void {
    this.error.set(null);
    this.recapInCorso.set(r.valetId);
    this.http.post<{ a: string; righe: number }>(
      `${environment.apiUrl}/salaries/recap/${r.valetId}/invia`,
      { dal: r.from.slice(0, 10), al: r.to.slice(0, 10), ...(this.serviziScelti().size ? { servizi: [...this.serviziScelti()] } : {}) },
    ).subscribe({
      next: (esito) => {
        this.recapInCorso.set(null);
        this.banner.set(this.translate.instant('salaries.pending.sent', { a: esito.a, n: esito.righe }));
      },
      error: (e) => {
        this.recapInCorso.set(null);
        this.error.set(e?.error?.message ?? 'Invio non riuscito');
      },
    });
  }

  filtroCambiato(): void {
    this.cercaPending.set(this.cerca);
    clearTimeout(this.attesa);
    this.attesa = setTimeout(() => this.load(), 300);
  }

  azzeraFiltri(): void {
    this.cerca = ''; this.valetFilter = ''; this.dal = ''; this.al = '';
    this.stato = ''; this.soloPagabili = false;
    this.serviziScelti.set(new Set());
    this.cercaPending.set('');
    this.load();
  }

  /** Apre/chiude le consegne da pagare di un valet. */
  togglePendingDetail(r: Pending): void {
    if (this.pendingOpen() === r.valetId) { this.pendingOpen.set(null); return; }
    this.pendingOpen.set(r.valetId);
    this.pendingDetail.set([]);
    this.pendingDetailLoading.set(true);
    // Il dettaglio rispetta il periodo filtrato: senza dal/al mostrerebbe
    // TUTTO l'arretrato anche con «questo mese» selezionato.
    const filtri: Record<string, string> = {};
    if (this.dal) filtri['dal'] = this.dal;
    if (this.al) filtri['al'] = this.al;
    // ⚠️ Anche il dettaglio: se mostrasse consegne che il riepilogo non conta,
    // i due totali non tornerebbero e il primo a non capire sarebbe chi paga.
    if (this.queryServizi()) filtri['servizi'] = this.queryServizi();
    this.http.get<{ deliveries: PendingDelivery[]; troncato: boolean }>(
      `${environment.apiUrl}/salaries/pending/${r.valetId}`, { params: filtri },
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
   * Paga tutto l'arretrato di un valet: apre il pannello Genera con valet e
   * periodo gia' compilati. Non genera da solo — emettere un documento senza
   * mostrarlo prima e' un gesto pesante.
   */
  pagaTutto(r: Pending): void {
    this.genValet = r.valetId;
    this.genFrom = String(r.from).slice(0, 10);
    this.genTo = String(r.to).slice(0, 10);
    this.view.set('active');
    this.showGen.set(true);
    this.load();
  }


  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }
  next(status: string): { next: string; key: string } | null { return NEXT[status] ?? null; }
  isPaid(s: Salary): boolean { return s.status === 'PAID'; }

  generate(): void {
    this.genError.set(null);
    if (!this.genValet || !this.genFrom || !this.genTo) {
      this.genError.set(this.translate.instant('salaries.gen.required'));
      return;
    }
    this.generating.set(true);
    this.http.post(`${environment.apiUrl}/salaries/generate`, {
      valetId: this.genValet, periodStart: this.genFrom, periodEnd: this.genTo,
    }).subscribe({
      next: () => {
        this.generating.set(false);
        this.showGen.set(false);
        this.genValet = ''; this.genFrom = ''; this.genTo = ''; this.freqHint.set(null);
        this.banner.set(this.translate.instant('salaries.gen.done'));
        this.load();
      },
      error: (err) => { this.generating.set(false); this.genError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  advance(s: Salary, status: string): void {
    this.error.set(null);
    this.busy.set(s.id);
    this.http.patch(`${environment.apiUrl}/salaries/${s.id}/status`, { status }).subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore nel cambio di stato'); },
    });
  }

  reopen(s: Salary): void {
    this.error.set(null);
    this.busy.set(s.id);
    this.http.post(`${environment.apiUrl}/salaries/${s.id}/reopen`, {}).subscribe({
      next: () => { this.busy.set(null); this.banner.set(this.translate.instant('salaries.reopened')); this.load(); },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  openReclamo(s: Salary): void {
    this.reclamoFor.set(this.reclamoFor() === s.id ? null : s.id);
    this.reclamoAmount = null;
    this.reclamoDesc = '';
  }

  submitReclamo(s: Salary): void {
    if (!this.reclamoAmount || this.reclamoAmount <= 0) {
      this.error.set(this.translate.instant('salaries.reclamo.required'));
      return;
    }
    this.error.set(null);
    this.busy.set(s.id);
    this.http.post(`${environment.apiUrl}/payments`, {
      type: 'CLAIM',
      salaryId: s.id,
      valetId: s.valetId,
      amount: this.reclamoAmount,
      description: this.reclamoDesc || undefined,
    }).subscribe({
      next: () => {
        this.busy.set(null);
        this.reclamoFor.set(null);
        this.banner.set(this.translate.instant('salaries.reclamo.done'));
        this.load();
      },
      error: (err) => { this.busy.set(null); this.error.set(err?.error?.message ?? 'Errore'); },
    });
  }

  /** Esporta la lista corrente (filtrata) in CSV. */
  exportCsv(): void {
    const t = (k: string) => this.translate.instant(k);
    const head = [
      t('salaries.col.valet'), t('salaries.col.period'), t('salaries.col.gross'),
      t('salaries.col.cash'), t('salaries.col.net'), t('salaries.col.document'), t('salaries.col.status'),
    ];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = this.filtered().map((s) => [
      `${s.valet?.lastName ?? ''} ${s.valet?.firstName ?? ''}`.trim(),
      `${s.periodStart?.slice(0, 10)} / ${s.periodEnd?.slice(0, 10)}`,
      s.grossAmount.toFixed(2), s.cashDeductions.toFixed(2), s.netAmount.toFixed(2),
      t('salaries.doc.' + s.documentType), this.statusLabel(s.status),
    ]);
    const csv = [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stipendi-${this.view()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
