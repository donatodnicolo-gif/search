// ============================================================
// RICONCILIAZIONI PRODOTTO × PROVINCIA → PARTNER A UN PREZZO
// (04/09/2026, regola utente — seconda stesura)
// ------------------------------------------------------------
// Sezione di Prodotti per Admin e Operation. Ogni riga è una coppia
// (prodotto non unico, provincia) vista in una vendita accettata: a quale
// partner è andata e a che prezzo. «Accetta» la rende regola: da lì le
// vendite di quel prodotto in quella provincia vanno in automatico a quel
// partner a quel prezzo. «Rifiuta» = non viene più proposta. «Modifica»
// cambia partner, prezzo e sconto, anche su una regola già attiva.
// ============================================================
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ConfermaComponent } from '../shared/conferma.component';

interface StatPartner {
  partnerId: string;
  insegna: string;
  attivo: boolean;
  vendite: number;
  quotaPercento: number;
  prezzoMin: number;
  prezzoMax: number;
  prezzoModa: number;
  scontoMedio: number;
  ultimaVendita: string;
}

interface Riga {
  id: string;
  productId: string;
  prodotto: string;
  sku: string | null;
  tipoProdotto: string;
  prezzoListino: number;
  conVarianti: boolean;
  /** ⭐ 06/09: la regola vale per QUESTA variante (null = prodotto senza variante). */
  variante?: string | null;
  varianteSku?: string | null;
  provinceId: string;
  provincia: string | null;
  provinciaCodice: string | null;
  partnerId: string;
  partner: string | null;
  partnerAttivo: boolean;
  prezzo: number;
  sconto: number;
  /** ⭐ Il PATTO: quanto incassa il partner per quel prodotto in quella provincia. */
  prezzoPartner: number;
  /** La consegna nata dall'ultima vendita vista: si guarda per capire il caso. */
  consegnaId: string | null;
  consegnaCodice: number | null;
  vendite: number;
  stats: StatPartner[];
  ultimoOrdine: string | null;
  stato: 'proposta' | 'accettata' | 'rifiutata';
  innesco: string;
  decisaIl: string | null;
  decisaDa: string | null;
  aggiornataIl: string;
}

interface EsitoCorsa {
  venditeLette: number;
  coppie: number;
  proposteNuove: number;
  proposteAggiornate: number;
  giaDecise: number;
  righe: Riga[];
}

interface UltimaCorsa {
  quando: string;
  ok: boolean;
  venditeLette?: number;
  proposteNuove?: number;
  proposteAggiornate?: number;
  errore?: string;
}

@Component({
  selector: 'app-product-reconciliations',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, TranslatePipe, ConfermaComponent],
  providers: [DecimalPipe],
  template: `
    <div class="page-header">
      <div>
        <a class="back" routerLink="/products">{{ 'reconciliations.back' | translate }}</a>
        <h1>{{ 'reconciliations.title' | translate }}</h1>
        <p class="page-caption">{{ 'reconciliations.caption' | translate }}</p>
      </div>
      <!-- ⭐ 07/09/2026 (regola utente): una regola si può scrivere anche a mano,
           partendo da una vendita ferma e da un prodotto già venduto in passato. -->
      <button type="button" class="btn btn-primary" (click)="apriNuova()">
        + {{ 'reconciliations.nuova.apri' | translate }}
      </button>
    </div>

    <!-- Lancio manuale su un intervallo personalizzato -->
    <section class="card lancio">
      <label class="fld"><span>{{ 'reconciliations.from' | translate }}</span>
        <input class="field" type="date" name="da" [(ngModel)]="da" [disabled]="analizzando()" />
      </label>
      <label class="fld"><span>{{ 'reconciliations.to' | translate }}</span>
        <input class="field" type="date" name="a" [(ngModel)]="a" [disabled]="analizzando()" />
      </label>
      <button type="button" class="btn btn-primary" [disabled]="analizzando() || !da || !a" (click)="analizza()">
        {{ (analizzando() ? 'reconciliations.running' : 'reconciliations.run') | translate }}
      </button>
      <p class="hint">
        <b>{{ 'reconciliations.lastNight' | translate }}:</b>
        @if (ultima(); as u) {
          {{ u.quando | date: 'dd/MM/yyyy HH:mm' }} —
          @if (u.ok) {
            {{ 'reconciliations.runResult' | translate: { vendite: u.venditeLette, nuove: u.proposteNuove, aggiornate: u.proposteAggiornate } }}
          } @else {
            <span class="ko">{{ 'reconciliations.lastNightError' | translate }}: {{ u.errore }}</span>
          }
        } @else {
          {{ 'reconciliations.lastNightNone' | translate }}
        }
      </p>
      @if (esito(); as e) {
        <p class="esito ok">
          {{ 'reconciliations.runResult' | translate: { vendite: e.venditeLette, nuove: e.proposteNuove, aggiornate: e.proposteAggiornate } }}
          @if (e.giaDecise > 0) { · {{ 'reconciliations.runDecided' | translate: { n: e.giaDecise } }} }
          @if (e.venditeLette === 0) { <br />{{ 'reconciliations.runNothing' | translate }} }
        </p>
      }
      @if (errore(); as err) {
        <p class="esito ko">{{ err }}</p>
      }
      <!-- ⭐ 04/09 (regola utente): partner esclusi — le loro vendite non
           generano proposte e non si possono scegliere nella modifica. -->
      <div class="esclusi">
        <b>{{ 'reconciliations.excluded.title' | translate }}:</b>
        @if (esclusi().length) {
          @for (p of esclusi(); track p.id) {
            <span class="chip">{{ p.insegna }}
              <button type="button" class="x" [disabled]="inAzione()" (click)="togliEscluso(p.id)"
                      [attr.aria-label]="'reconciliations.excluded.remove' | translate">×</button>
            </span>
          }
        } @else {
          <span class="muted">{{ 'reconciliations.excluded.none' | translate }}</span>
        }
        <select class="field mini" name="nuovoEscluso" [(ngModel)]="nuovoEscluso" [disabled]="inAzione()">
          <option value="">{{ 'reconciliations.excluded.add' | translate }}</option>
          @for (p of partnerAttivi(); track p.id) {
            <option [value]="p.id">{{ p.insegna }}</option>
          }
        </select>
        <button type="button" class="btn btn-secondary mini" [disabled]="inAzione() || !nuovoEscluso" (click)="aggiungiEscluso()">
          {{ 'reconciliations.excluded.addBtn' | translate }}
        </button>
        @if (regoleColpite() > 0) {
          <span class="ko small">{{ 'reconciliations.excluded.rules' | translate: { n: regoleColpite() } }}</span>
        }
      </div>
    </section>

    <!-- Filtro sullo stato -->
    <div class="tabs">
      @for (f of filtri; track f) {
        <button type="button" class="tab" [class.on]="filtro() === f" (click)="setFiltro(f)">
          {{ ('reconciliations.filter' + f) | translate }}
        </button>
      }
    </div>

    @if (caricando()) {
      <p class="muted">{{ 'reconciliations.loading' | translate }}</p>
    } @else if (!righe().length) {
      <p class="muted">{{ 'reconciliations.empty' | translate }}</p>
    } @else {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <!-- ⭐ 05/09/2026 (regola utente): la tabella si ordina. Il
                   click sull'intestazione ordina, il secondo click inverte.
                   L'ordinamento è QUI in pagina, sulle righe già caricate: le
                   proposte aperte sono poche decine e non c'è impaginazione,
                   quindi non serve rifare il giro al server. -->
              <th class="sortable" (click)="ordinaPer('prodotto')">{{ 'reconciliations.col.product' | translate }}<span class="sort-ind">{{ segno('prodotto') }}</span></th>
              <th class="sortable" (click)="ordinaPer('provincia')">{{ 'reconciliations.col.province' | translate }}<span class="sort-ind">{{ segno('provincia') }}</span></th>
              <th class="sortable" (click)="ordinaPer('consegna')">{{ 'reconciliations.col.delivery' | translate }}<span class="sort-ind">{{ segno('consegna') }}</span></th>
              <th class="sortable" (click)="ordinaPer('vendite')">{{ 'reconciliations.col.sales' | translate }}<span class="sort-ind">{{ segno('vendite') }}</span></th>
              <th class="sortable" (click)="ordinaPer('partner')">{{ 'reconciliations.col.partner' | translate }}<span class="sort-ind">{{ segno('partner') }}</span></th>
              <th class="num sortable" (click)="ordinaPer('prezzoPartner')">{{ 'reconciliations.col.price' | translate }}<span class="sort-ind">{{ segno('prezzoPartner') }}</span></th>
              <th class="num sortable" (click)="ordinaPer('prezzo')">{{ 'reconciliations.col.publicPrice' | translate }}<span class="sort-ind">{{ segno('prezzo') }}</span></th>
              <th class="sortable" (click)="ordinaPer('stato')">{{ 'reconciliations.col.state' | translate }}<span class="sort-ind">{{ segno('stato') }}</span></th>
              <th class="azioni">{{ 'reconciliations.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of righeOrdinate(); track r.id) {
              <tr>
                <td>
                  <a [routerLink]="['/products', r.productId]"><b>{{ r.prodotto }}</b></a>
                  @if (r.variante) { <div class="variante">{{ r.variante }}</div> }
                  @if (r.varianteSku || r.sku) { <div class="muted mono">{{ r.varianteSku || r.sku }}</div> }
                  <div class="muted">{{ 'reconciliations.listPrice' | translate: { prezzo: fmt(r.prezzoListino) } }}@if (r.ultimoOrdine) { · #{{ r.ultimoOrdine }} }</div>
                </td>
                <td><b>{{ r.provinciaCodice }}</b> <span class="muted">{{ r.provincia }}</span></td>
                <td>
                  @if (r.consegnaId) {
                    <a [routerLink]="['/deliveries', r.consegnaId]">#{{ r.consegnaCodice }}</a>
                  } @else { <span class="muted">—</span> }
                  @if (r.ultimoOrdine) { <div class="muted small">ord. #{{ r.ultimoOrdine }}</div> }
                </td>
                <td>
                  @for (s of r.stats; track s.partnerId) {
                    <div class="stat">
                      {{ s.insegna }}: <b>{{ s.vendite }}</b> ({{ s.quotaPercento }}%)
                      · @if (s.prezzoMin === s.prezzoMax) { {{ s.prezzoModa | number: '1.2-2' }} € } @else { {{ s.prezzoMin | number: '1.2-2' }}–{{ s.prezzoMax | number: '1.2-2' }} € }
                    </div>
                  }
                </td>
                @if (modificaId() === r.id) {
                  <td>
                    <select class="field" [(ngModel)]="mod.partnerId" [attr.name]="'partner-' + r.id">
                      @for (p of partnerScelta(); track p.id) {
                        <option [value]="p.id">{{ p.insegna }}</option>
                      }
                    </select>
                  </td>
                  <td class="num mod-prezzo">
                    <label><span>{{ 'reconciliations.editPartnerPrice' | translate }}</span>
                      <input class="field num" type="number" min="0" step="0.01" [(ngModel)]="mod.partnerPrice" [attr.name]="'netto-' + r.id" /></label>
                  </td>
                  <td class="num muted">{{ r.prezzo | number: '1.2-2' }} €</td>
                } @else {
                  <td>
                    <b>{{ r.partner ?? '—' }}</b>
                    @if (!r.partnerAttivo) { <div class="ko small">{{ 'reconciliations.partnerInactive' | translate }}</div> }
                  </td>
                  <td class="num"><b>{{ r.prezzoPartner | number: '1.2-2' }} €</b></td>
                  <td class="num">
                    {{ r.prezzo | number: '1.2-2' }} €
                    @if (r.sconto) { <div class="muted small">−{{ r.sconto }}%</div> }
                  </td>
                }
                <td>
                  <span class="badge" [class.ok]="r.stato === 'accettata'" [class.warn]="r.stato === 'proposta'" [class.off]="r.stato === 'rifiutata'">
                    {{ ('reconciliations.state_' + r.stato) | translate }}
                  </span>
                  @if (r.decisaIl) {
                    <div class="muted small">{{ r.decisaIl | date: 'dd/MM/yy HH:mm' }} · {{ r.decisaDa }}</div>
                  }
                </td>
                <td class="azioni">
                  @if (modificaId() === r.id) {
                    <button type="button" class="btn btn-primary mini" [disabled]="inAzione()" (click)="salvaModifica(r)">{{ 'common.save' | translate }}</button>
                    <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="modificaId.set(null)">{{ 'common.cancel' | translate }}</button>
                  } @else {
                    @if (r.stato === 'proposta') {
                      <button type="button" class="btn btn-primary mini" [disabled]="inAzione()" (click)="chiedi(r, 'accetta')">{{ 'reconciliations.accept' | translate }}</button>
                      <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="chiedi(r, 'rifiuta')">{{ 'reconciliations.reject' | translate }}</button>
                    }
                    <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="apriModifica(r)">{{ 'reconciliations.edit' | translate }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (conferma(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    (confermato)="esegui()" (annullato)="conferma.set(null)" />
    }

    <!-- ============================================================
         NUOVA RICONCILIAZIONE A MANO (07/09/2026, regola utente)
         La vendita dà prodotto e provincia della regola; il prodotto di
         riferimento, già venduto in passato, dà il partner e il prezzo.
         Si conferma solo dopo aver visto i due prezzi e il margine.
         ============================================================ -->
    @if (nuova()) {
      <div class="overlay" (click)="chiudiNuova()"></div>
      <div class="dialog card nuova-riconc" role="dialog" aria-modal="true">
        <header class="d-head">
          <h2>{{ 'reconciliations.nuova.titolo' | translate }}</h2>
          <button type="button" class="icon-btn" (click)="chiudiNuova()" aria-label="Chiudi">✕</button>
        </header>

        <!-- PASSO 1 — la vendita, oppure nessuna -->
        <section class="passo">
          <h3><span class="n">1</span> {{ (senzaVendita() ? 'reconciliations.nuova.passo1senza' : 'reconciliations.nuova.passo1') | translate }}</h3>

          <!-- ⭐ 08/09/2026 (regola utente: «consentimi di cercare ordini in vendita anche
               già inseriti oppure di non inserire nessuna vendita e cercare direttamente per
               prodotto, partner e provincia»).
               Due strade, e si sceglie qui: un accordo nasce guardando un ordine — anche uno
               già chiuso, che è il caso più frequente — oppure prima che l'ordine esista. -->
          <div class="strade">
            <button type="button" class="pill" [class.on]="!senzaVendita()" (click)="modoVendita(false)">{{ 'reconciliations.nuova.daOrdine' | translate }}</button>
            <button type="button" class="pill" [class.on]="senzaVendita()" (click)="modoVendita(true)">{{ 'reconciliations.nuova.senzaOrdine' | translate }}</button>
          </div>

          @if (senzaVendita()) {
            <!-- SENZA ORDINE: prodotto e provincia si scelgono a mano -->
            @if (prodottoRegola(); as pr) {
              <div class="scelto">
                <div>
                  <b>{{ pr.name }}</b>
                  <div class="cella-sub muted">{{ pr.sku }}</div>
                </div>
                <button type="button" class="btn btn-secondary mini" (click)="cambiaProdottoRegola()">{{ 'reconciliations.nuova.cambia' | translate }}</button>
              </div>
              @if (pr.variants?.length) {
                <label class="fld"><span>{{ 'reconciliations.nuova.variante' | translate }}</span>
                  <select class="field" [ngModel]="varianteRegola()" (ngModelChange)="scegliVarianteRegola($event)" name="vr">
                    <option [ngValue]="null">{{ 'reconciliations.nuova.tutteVarianti' | translate }}</option>
                    @for (x of pr.variants; track x.id) {
                      <option [ngValue]="x.id">{{ x.name }}@if (x.publicPrice ?? x.price) { &nbsp;— {{ (x.publicPrice ?? x.price) | number: '1.2-2' }} € }</option>
                    }
                  </select>
                </label>
              }
              <label class="fld"><span>{{ 'reconciliations.nuova.provincia' | translate }}</span>
                <select class="field" [ngModel]="provinciaRegola()" (ngModelChange)="scegliProvinciaRegola($event)" name="pvr">
                  <option [ngValue]="null">{{ 'reconciliations.nuova.scegliProvincia' | translate }}</option>
                  @for (p of province(); track p.id) { <option [ngValue]="p.id">{{ p.name }} ({{ p.code }})</option> }
                </select>
              </label>
            } @else {
              <input class="field" [ngModel]="qProdottoRegola()" (ngModelChange)="cercaProdottoRegola($event)" name="qpr"
                     [placeholder]="'reconciliations.nuova.cercaProdotto' | translate" autocomplete="off" />
              <div class="elenco">
                @for (p of prodottiRegola(); track p.id) {
                  <button type="button" class="voce" (click)="scegliProdottoRegola(p)">
                    <b>{{ p.name }}</b> <span class="muted">· {{ p.sku }}</span>
                    @if (p.variants?.length) { <span class="muted"> · {{ p.variants.length }} {{ 'reconciliations.nuova.varianti' | translate }}</span> }
                  </button>
                } @empty {
                  <p class="muted vuoto">{{ 'reconciliations.nuova.nessunProdotto' | translate }}</p>
                }
              </div>
            }
          } @else {
          <!-- ⚠️ L'alias «as» vale solo su @if: su @else if Angular non lo riconosce
               («Property 'v' does not exist»). Si annida, e si legge uguale. -->
          @if (venditaScelta(); as v) {
            <div class="scelto">
              <div>
                <b>#{{ v.externalOrderNumber }}</b> · {{ v.product?.name }}
                @if (v.variantName) { <span class="muted">({{ v.variantName }})</span> }
                <div class="cella-sub muted">
                  {{ v.province?.code }} · {{ v.amount | number: '1.2-2' }} €
                  @if (v.regolaEsistente) {
                    <!-- ⭐ 08/09/2026 (segnalazione utente: «non mi fa riconciliare, dice esiste
                         già una regola»). Non era un divieto: il modulo la sostituisce. Il rosso
                         faceva credere il contrario, e una scritta che sembra un blocco vale
                         come un blocco. Ora si dice che cosa succede confermando. -->
                    · <span [class.ko]="v.regolaEsistente.stato === 'accettata'" class="muted">{{ ('reconciliations.nuova.gia_' + v.regolaEsistente.stato) | translate }}</span>
                  }
                </div>
              </div>
              <button type="button" class="btn btn-secondary mini" (click)="cambiaVendita()">{{ 'reconciliations.nuova.cambia' | translate }}</button>
            </div>
          } @else {
            <input class="field" [ngModel]="qVendita()" (ngModelChange)="cercaVendite($event)" name="qv"
                   [placeholder]="'reconciliations.nuova.cercaVendita' | translate" autocomplete="off" />
            <!-- Di suo l'elenco mostra chi aspetta una decisione. Ma la vendita su cui si
                 vuole scrivere il patto è spesso già ACCETTATA — «quella volta gliel'abbiamo
                 pagata così» — e quelle erano invisibili. -->
            <label class="tutte">
              <input type="checkbox" [ngModel]="tutteLeVendite()" (ngModelChange)="cambiaAmpiezza($event)" name="tutte" />
              <span>{{ 'reconciliations.nuova.ancheChiuse' | translate }}</span>
            </label>
            <div class="elenco">
              @for (v of vendite(); track v.id) {
                <button type="button" class="voce" (click)="scegliVendita(v)">
                  <b>#{{ v.externalOrderNumber }}</b> · {{ v.product?.name }}
                  @if (v.variantName) { <span class="muted">({{ v.variantName }})</span> }
                  <span class="muted"> — {{ v.province?.code }} · {{ v.amount | number: '1.2-2' }} €</span>
                  <!-- Con le chiuse in mezzo, stato e partner sono metà dell'informazione. -->
                  <span class="cella-sub muted">
                    {{ ('sales.status.' + v.status) | translate }}@if (v.partner) { · {{ v.partner.insegna }} }
                  </span>
                </button>
              } @empty {
                <p class="muted vuoto">{{ 'reconciliations.nuova.nessunaVendita' | translate }}</p>
              }
            </div>
          }
          }
        </section>

        <!-- PASSI 2-3 — prodotto e provincia: dalla vendita, o scelti a mano -->
        @if (senzaVendita()) {
          @if (prodottoRegola() && provinciaRegola()) {
            <section class="passo dedotti">
              <h3><span class="n">2</span> {{ 'reconciliations.nuova.passo2' | translate }}</h3>
              <dl>
                <div><dt>{{ 'reconciliations.nuova.prodotto' | translate }}</dt>
                  <dd>{{ prodottoRegola()?.name }}@if (nomeVarianteRegola(); as nv) { <span class="muted"> · {{ nv }}</span> }</dd></div>
                <div><dt>{{ 'reconciliations.nuova.provincia' | translate }}</dt>
                  <dd>{{ nomeProvinciaRegola() }}</dd></div>
              </dl>
              <p class="hint">{{ 'reconciliations.nuova.senzaHint' | translate }}</p>
            </section>
          }
        } @else {
        @if (venditaScelta(); as v) {
          <section class="passo dedotti">
            <h3><span class="n">2</span> {{ 'reconciliations.nuova.passo2' | translate }}</h3>
            <dl>
              <div><dt>{{ 'reconciliations.nuova.prodotto' | translate }}</dt>
                <dd>{{ v.product?.name }}@if (v.variantName) { <span class="muted"> · {{ v.variantName }}</span> }</dd></div>
              <div><dt>{{ 'reconciliations.nuova.provincia' | translate }}</dt>
                <dd>{{ v.province?.name }} ({{ v.province?.code }})</dd></div>
            </dl>
            <p class="hint">{{ 'reconciliations.nuova.dedottiHint' | translate }}</p>
          </section>
        }
        }

        <!-- PASSO 3 — il prezzo: chi lo fa e a quanto.
             ⭐ 08/09/2026: questo passo era chiuso dentro il ramo «con la vendita», e
             scrivendo un accordo senza ordine non compariva. Il prezzo però si sceglie
             allo stesso modo nelle due strade: qui è uno solo, per tutt'e due. -->
        @if (prontoPerIlPrezzo()) {
          <section class="passo">
            <h3><span class="n">3</span> {{ 'reconciliations.nuova.passo3' | translate }}</h3>
            @if (riferimento(); as rif) {
              <div class="scelto">
                <div>
                  <b>{{ rif.prodotto.name }}</b>
                  @if (rif.variante) { <span class="muted">· {{ rif.variante.name }}</span> }
                  <div class="cella-sub muted">{{ rif.prodotto.sku }}</div>
                </div>
                <button type="button" class="btn btn-secondary mini" (click)="cambiaRiferimento()">{{ 'reconciliations.nuova.cambia' | translate }}</button>
              </div>
              @if (rif.varianti.length) {
                <label class="fld"><span>{{ 'reconciliations.nuova.variante' | translate }}</span>
                  <select class="field" [ngModel]="varianteScelta()" (ngModelChange)="scegliVariante($event)" name="var">
                    <option [ngValue]="null">{{ 'reconciliations.nuova.senzaVariante' | translate }}</option>
                    @for (x of rif.varianti; track x.id) {
                      <option [ngValue]="x.id">{{ x.name }}@if (x.price) { — {{ x.price | number: '1.2-2' }} € }</option>
                    }
                  </select>
                </label>
              }
              <!-- PASSO 5 — chi lo fa, e a quanto -->
              <h4>{{ 'reconciliations.nuova.chiLoFa' | translate }}</h4>
              @if (rif.righe.length) {
                <div class="elenco">
                  @for (r of rif.righe; track r.partnerId) {
                    <!-- ⭐ 08/09/2026 (segnalazione utente: «non posso chiudere questa
                         riconciliazione»). Questa riga NON è informativa: è la scelta del
                         partner e del prezzo, e senza cliccarla il pulsante resta spento.
                         Sembrava solo un elenco, e su telefono non c'è nemmeno il passaggio
                         del mouse a suggerire il contrario: ora c'è un cerchio da spuntare
                         e la parola «Scegli». -->
                    <button type="button" class="voce scelta" [class.attiva]="partnerScelto() === r.partnerId" (click)="scegliPartner(r)">
                      <span class="segno" aria-hidden="true">{{ partnerScelto() === r.partnerId ? '◉' : '○' }}</span>
                      <span class="chi">
                        <b>{{ r.insegna }}</b>@if (!r.attivo) { <span class="ko"> · {{ 'reconciliations.nuova.spento' | translate }}</span> }
                        <span class="cella-sub muted">
                          {{ r.da }}@if (r.volte > 1) { · {{ 'reconciliations.nuova.volte' | translate: { n: r.volte } }} }
                          @if (r.quando) { · {{ r.quando | date: 'dd/MM/yy' }} }
                        </span>
                      </span>
                      <span class="prezzo">{{ r.prezzoPartner | number: '1.2-2' }} €
                        <span class="azione">{{ (partnerScelto() === r.partnerId ? 'reconciliations.nuova.scelto' : 'reconciliations.nuova.scegli') | translate }}</span>
                      </span>
                    </button>
                  }
                </div>
              } @else {
                <p class="muted vuoto">{{ 'reconciliations.nuova.nessunPrezzo' | translate }}</p>
              }
              <!-- ⭐ 08/09/2026 (regola utente: «applica riconciliazione anche da singolo
                   prodotto a cui poi impostare la quantità»). Quando il riferimento è un
                   prezzo UNITARIO — il listino a stelo del fioraio — il patto vale per i
                   pezzi: 8 € × 7 rose = 56 €. La quantità la dice chi scrive il patto,
                   perché dal nome della variante non si deduce: «7» è un numero, ma
                   «Medio-Grande» no. -->
              @if (partnerScelto()) {
                <label class="fld pezzi"><span>{{ 'reconciliations.nuova.pezzi' | translate }}</span>
                  <input class="field num" type="number" min="1" max="500" step="1" name="pezziPatto"
                         [ngModel]="pezzi()" (ngModelChange)="cambiaPezzi($event)" />
                </label>
                @if (pezzi() > 1) {
                  <p class="hint conto">{{ 'reconciliations.nuova.contoPezzi' | translate: { unitario: (prezzoScelto() ?? 0) | number: '1.2-2', pezzi: pezzi(), totale: ((prezzoScelto() ?? 0) * pezzi()) | number: '1.2-2' } }}</p>
                }
              }
            } @else {
              <!-- ⭐ 08/09/2026 (regola utente: «vorrei vedere anche la rosa rossa di Maryflor»).
                   Cercando «rosa rossa» escono i prodotti di tutti; col partner scelto si guarda
                   il SUO catalogo, che è quello che serve quando si ha già in mente chi lo farà. -->
              <!-- Il partner si CERCA: 129 partner attivi non stanno in una tendina. -->
              @if (partnerScelto2(); as ps) {
                <div class="scelto filtro-partner">
                  <div><span class="muted">{{ 'reconciliations.nuova.solo' | translate }}</span> <b>{{ ps.insegna }}</b></div>
                  <button type="button" class="btn btn-secondary mini" (click)="filtraPerPartner(null)">
                    {{ 'reconciliations.nuova.tuttiIPartner' | translate }}
                  </button>
                </div>
              } @else {
                <input class="field" [ngModel]="qPartner()" (ngModelChange)="cercaPartner($event)" name="pf"
                       [placeholder]="'reconciliations.nuova.cercaPartner' | translate" autocomplete="off" />
                @if (partnerTrovati().length) {
                  <div class="elenco basso">
                    @for (p of partnerTrovati(); track p.id) {
                      <button type="button" class="voce" (click)="filtraPerPartner(p.id)">{{ p.insegna }}</button>
                    }
                  </div>
                }
              }
              <input class="field mt" [ngModel]="qProdotto()" (ngModelChange)="cercaProdotti($event)" name="qp"
                     [placeholder]="(partnerFiltro() ? 'reconciliations.nuova.cercaNelPartner' : 'reconciliations.nuova.cercaProdotto') | translate" autocomplete="off" />
              <div class="elenco">
                @for (p of prodotti(); track p.id) {
                  <button type="button" class="voce" (click)="scegliRiferimento(p)">
                    {{ p.name }}<span class="muted"> · {{ p.sku }}</span>
                    @if (p.partner) { <span class="muted"> — {{ p.partner.insegna }}</span> }
                  </button>
                } @empty {
                  <p class="muted vuoto">{{ 'reconciliations.nuova.scriviPerCercare' | translate }}</p>
                }
              </div>
            }
          </section>
        }


        <!-- PASSO 6 — il confronto e il margine -->
        @if (anteprima(); as a) {
          <section class="passo confronto">
            <h3><span class="n">4</span> {{ 'reconciliations.nuova.passo4' | translate }}</h3>
            <table class="prezzi">
              <tr><td>{{ 'reconciliations.nuova.alCliente' | translate }}</td><td class="num">{{ a.prezzi.alCliente | number: '1.2-2' }} €</td></tr>
              <tr><td>{{ 'reconciliations.nuova.alPartner' | translate: { partner: a.partner.insegna } }}</td>
                  <td class="num">− {{ a.prezzi.alPartner | number: '1.2-2' }} €</td></tr>
              <tr class="tot" [class.ko]="a.prezzi.margine <= 0">
                <td><b>{{ 'reconciliations.nuova.margine' | translate }}</b></td>
                <td class="num"><b>{{ a.prezzi.margine | number: '1.2-2' }} €</b>
                  <span class="muted"> ({{ a.prezzi.percentuale | number: '1.0-1' }}%)</span></td>
              </tr>
            </table>
            <p class="hint">
              {{ 'reconciliations.nuova.confrontoRegola' | translate: {
                   sconto: a.prezzi.scontoTerritorio, conRegola: (a.prezzi.conLaPercentuale | number: '1.2-2') } }}
              @if (a.prezzi.differenzaSullaRegola !== 0) {
                <b [class.ko]="a.prezzi.differenzaSullaRegola < 0">
                  ({{ a.prezzi.differenzaSullaRegola > 0 ? '+' : '' }}{{ a.prezzi.differenzaSullaRegola | number: '1.2-2' }} €)
                </b>
              }
            </p>
            @for (av of a.avvisi; track av) { <p class="avviso">⚠️ {{ av }}</p> }
          </section>
        }

        <footer class="d-foot">
          @if (erroreNuova()) { <p class="ko">{{ erroreNuova() }}</p> }
          @else if (!anteprima()) {
            <!-- Un pulsante spento senza spiegazione e' un vicolo cieco: si dice cosa manca. -->
            <p class="muted manca">{{ (prontoPerIlPrezzo() ? (riferimento() ? 'reconciliations.nuova.mancaPartner' : 'reconciliations.nuova.mancaProdotto') : (senzaVendita() ? 'reconciliations.nuova.mancaProdottoProvincia' : 'reconciliations.nuova.mancaVendita')) | translate }}</p>
          }
          <button type="button" class="btn btn-secondary" (click)="chiudiNuova()">{{ 'common.cancel' | translate }}</button>
          <button type="button" class="btn btn-primary" [disabled]="!anteprima() || salvando()" (click)="salvaNuova()">
            {{ (salvando() ? 'common.saving' : 'reconciliations.nuova.conferma') | translate }}
          </button>
        </footer>
      </div>
    }
  `,
  styles: [
    `.variante { font-size: 12.5px; color: var(--ink-2, #3a3a3c); }`,
    `
      /* Nuova riconciliazione: una finestra a passi. Il numero del passo e' un
         cerchio, cosi' si legge dove si e' arrivati senza contare le sezioni. */
      .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 50; }
      .nuova-riconc {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 51;
        width: min(620px, 94vw); max-height: min(92dvh, calc(100dvh - 40px)); overflow-y: auto;
        padding: 0 24px 20px;
      }
      .nuova-riconc .d-head {
        position: sticky; top: 0; z-index: 1; background: var(--surface);
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 0 12px; border-bottom: 1px solid var(--hairline);
      }
      .nuova-riconc .d-head h2 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
      .nuova-riconc .passo { padding: 16px 0; border-bottom: 1px solid var(--hairline); }
      .nuova-riconc .passo:last-of-type { border-bottom: none; }
      .nuova-riconc .passo h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 14px; }
      .nuova-riconc .passo h3 .n {
        display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; border-radius: 50%; background: var(--text); color: var(--surface);
        font-size: 11.5px; font-weight: 700; flex: 0 0 auto;
      }
      .nuova-riconc h4 { margin: 14px 0 8px; font-size: 13px; color: var(--text-secondary); }
      .nuova-riconc .field.mt { margin-top: 8px; }
      .nuova-riconc .filtro-partner { padding: 8px 10px; background: var(--fill); border-radius: 10px; }
      .nuova-riconc .elenco.basso { max-height: 150px; }
      .nuova-riconc .elenco { max-height: 220px; overflow-y: auto; overscroll-behavior: contain; margin-top: 8px; border: 1px solid var(--hairline); border-radius: 10px; }
      .nuova-riconc .voce {
        display: block; width: 100%; text-align: left; border: none; background: none;
        padding: 9px 12px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--text);
        border-bottom: 1px solid var(--hairline);
      }
      .nuova-riconc .voce:last-child { border-bottom: none; }
      .nuova-riconc .voce:hover { background: var(--fill); }
      .nuova-riconc .voce.attiva { background: var(--fill); box-shadow: inset 3px 0 0 var(--text); }
      .nuova-riconc .voce .prezzo { float: right; font-weight: 650; font-variant-numeric: tabular-nums; }
      /* Le due strade: pillole, non una tendina. Sono due, e si vedono tutt'e due. */
      .nuova-riconc .strade { display: flex; gap: 8px; margin: 0 0 10px; }
      .nuova-riconc .strade .pill {
        flex: 1 1 0; padding: 7px 12px; border-radius: 999px; font-size: 13px; cursor: pointer;
        border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
      }
      .nuova-riconc .strade .pill.on { background: var(--text); color: #fff; border-color: var(--text); font-weight: 600; }
      .nuova-riconc .tutte { display: flex; align-items: center; gap: 7px; margin: 8px 0 2px; font-size: 12.5px; color: var(--text-secondary); cursor: pointer; }
      .nuova-riconc .tutte input { width: 15px; height: 15px; }
      /* La riga della SCELTA: cerchio, chi, prezzo. Niente float, cosi' su telefono il
         prezzo non finisce sopra il nome. */
      .nuova-riconc .voce.scelta { display: flex; align-items: center; gap: 10px; }
      .nuova-riconc .voce.scelta .segno { font-size: 15px; line-height: 1; color: var(--text-secondary); flex: 0 0 auto; }
      .nuova-riconc .voce.scelta.attiva .segno { color: var(--text); }
      .nuova-riconc .voce.scelta .chi { flex: 1 1 auto; min-width: 0; }
      .nuova-riconc .voce.scelta .chi .cella-sub { display: block; }
      .nuova-riconc .voce.scelta .prezzo { float: none; flex: 0 0 auto; text-align: right; }
      .nuova-riconc .voce.scelta .azione {
        display: block; font-size: 11px; font-weight: 400; color: var(--text-secondary);
      }
      .nuova-riconc .voce.scelta.attiva .azione { color: var(--text); font-weight: 600; }
      .nuova-riconc .d-foot .manca { margin: 0 auto 0 0; font-size: 12.5px; }
      .nuova-riconc .scelto { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .nuova-riconc .dedotti dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
      .nuova-riconc .dedotti dt { font-size: 12px; color: var(--text-secondary); }
      .nuova-riconc .dedotti dd { margin: 2px 0 0; font-size: 14px; }
      .nuova-riconc .vuoto { padding: 12px; margin: 0; font-size: 13px; }
      .nuova-riconc table.prezzi { width: 100%; border-collapse: collapse; font-size: 14px; }
      .nuova-riconc table.prezzi td { padding: 6px 0; }
      .nuova-riconc table.prezzi td.num { text-align: right; font-variant-numeric: tabular-nums; }
      .nuova-riconc table.prezzi tr.tot td { border-top: 1px solid var(--hairline); padding-top: 10px; }
      .nuova-riconc table.prezzi tr.tot.ko td { color: var(--danger, #b3261e); }
      .nuova-riconc .avviso { margin: 8px 0 0; font-size: 13px; color: var(--danger, #b3261e); }
      .nuova-riconc .hint { margin: 8px 0 0; font-size: 12.5px; color: var(--text-secondary); }
      .nuova-riconc .d-foot {
        position: sticky; bottom: 0; background: var(--surface); padding: 14px 0 0;
        border-top: 1px solid var(--hairline); display: flex; gap: 10px; justify-content: flex-end; align-items: center;
      }
      .nuova-riconc .d-foot .ko { margin: 0 auto 0 0; font-size: 13px; }
      @media (max-width: 620px) {
        .nuova-riconc .dedotti dl { grid-template-columns: 1fr; }
        /* Il widget della chat sta in basso a destra e copriva «Crea la regola»: i
           pulsanti si impilano a tutta larghezza e sotto resta lo spazio per il widget. */
        .nuova-riconc .d-foot { flex-direction: column-reverse; align-items: stretch; gap: 8px; padding-bottom: 76px; }
        .nuova-riconc .d-foot .btn { width: 100%; }
        .nuova-riconc .d-foot .manca, .nuova-riconc .d-foot .ko { margin: 0 0 4px; text-align: center; }
      }
    `,
    `
      th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
      th.sortable:hover { color: var(--text-primary); }
      .sort-ind { font-size: 11px; opacity: .75; }
      .back { display: inline-block; margin-bottom: 6px; color: var(--text-secondary); text-decoration: none; font-size: 13px; }
      .back:hover { color: var(--text); }
      .card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 16px; padding: 16px 20px; margin-bottom: 16px; }
      .lancio { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: flex-end; }
      .lancio .fld { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
      .lancio .hint { flex-basis: 100%; margin: 4px 0 0; font-size: 13px; color: var(--text-secondary); }
      .esclusi { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; padding-top: 10px; border-top: 1px solid var(--hairline); }
      .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--fill); border-radius: 980px; padding: 3px 6px 3px 12px; }
      .chip .x { border: 0; background: none; font-size: 15px; line-height: 1; cursor: pointer; color: var(--text-secondary); padding: 0 4px; }
      .chip .x:hover { color: var(--danger, #b3261e); }
      .field.mini { padding: 4px 10px; font-size: 12px; max-width: 240px; }
      .esito { flex-basis: 100%; margin: 0; font-size: 13px; }
      .esito.ok { color: var(--success, #1d7a3a); }
      .esito.ko, .ko { color: var(--danger, #b3261e); }
      .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .tab { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text); cursor: pointer; }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .table-wrap { overflow-x: auto; }
      td.num, th.num { text-align: right; }
      td.azioni { white-space: nowrap; }
      td.azioni .btn + .btn { margin-left: 6px; }
      .mod-prezzo label { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; text-align: left; }
      .mod-prezzo .field { width: 110px; }
      .stat { font-size: 13px; white-space: nowrap; }
      .muted { color: var(--text-secondary); font-size: 13px; }
      .small { font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; background: var(--fill); }
      .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .badge.ok { color: var(--success, #1d7a3a); background: rgba(29, 122, 58, 0.1); }
      .badge.warn { color: var(--gold, #b8963e); background: rgba(184, 150, 62, 0.12); }
      .badge.off { color: var(--text-secondary); }
      .btn.mini { padding: 4px 12px; font-size: 12px; }
    `,
  ],
})
export class ProductReconciliationsComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly decimal = inject(DecimalPipe);

  readonly filtri = ['Proposte', 'Accettate', 'Rifiutate', 'Tutte'] as const;
  readonly filtro = signal<(typeof this.filtri)[number]>('Proposte');
  readonly righe = signal<Riga[]>([]);

  // ============================================================
  // ORDINAMENTO DELLA TABELLA (05/09/2026, chiesto dall'utente)
  // ------------------------------------------------------------
  // ⚠️ Ordinare NON è filtrare: nessuna riga sparisce, e le righe senza il
  // valore su cui si ordina (una proposta senza consegna, un partner vuoto)
  // finiscono IN FONDO in tutti e due i versi — se andassero in cima
  // scendendo, l'inversione sembrerebbe nasconderle.
  // ============================================================
  readonly ordine = signal<string>('');
  readonly verso = signal<'asc' | 'desc'>('asc');

  // ============================================================
  // NUOVA RICONCILIAZIONE A MANO (07/09/2026, regola utente)
  // ------------------------------------------------------------
  // Quattro passi: la vendita ferma da smistare → prodotto e provincia presi
  // da lei → un prodotto già venduto in passato (con la sua variante), che
  // porta il partner e il PREZZO VERO → il confronto col margine, e solo
  // allora si conferma.
  //
  // ⚠️ Il prezzo non si inventa mai: viene da una vendita accettata, dal
  // listino di un prodotto unico o da un prezzo concordato sui DDT — e la
  // riga dice sempre da quale delle tre.
  // ============================================================
  readonly nuova = signal(false);
  /**
   * ⭐ 08/09/2026 (regola utente: «consentimi di cercare ordini in vendita anche già
   * inseriti oppure di non inserire nessuna vendita e cercare direttamente per prodotto,
   * partner e provincia»).
   *
   * `tutteLeVendite` → la ricerca comprende anche le vendite chiuse (accettate): è su
   * quelle che si scrive un patto la maggior parte delle volte, e prima erano invisibili.
   * `senzaVendita` → nessun ordine di partenza: prodotto, variante e provincia si
   * scelgono a mano. È il caso dell'accordo preso PRIMA che l'ordine arrivi — che è
   * poi il mestiere di un accordo.
   */
  readonly tutteLeVendite = signal(false);
  readonly senzaVendita = signal(false);
  readonly qProdottoRegola = signal('');
  readonly prodottiRegola = signal<any[]>([]);
  readonly prodottoRegola = signal<any | null>(null);
  readonly varianteRegola = signal<string | null>(null);
  readonly provinciaRegola = signal<string | null>(null);
  readonly province = signal<{ id: string; code: string; name: string }[]>([]);
  private timerProdottoRegola?: ReturnType<typeof setTimeout>;

  /** Il passo del prezzo si apre quando si sa SU COSA vale il patto, comunque ci si sia arrivati. */
  readonly prontoPerIlPrezzo = computed(() =>
    this.senzaVendita() ? !!this.prodottoRegola() && !!this.provinciaRegola() : !!this.venditaScelta(),
  );
  readonly nomeVarianteRegola = computed(() => {
    const id = this.varianteRegola();
    return id ? (this.prodottoRegola()?.variants ?? []).find((x: any) => x.id === id)?.name ?? null : null;
  });
  readonly nomeProvinciaRegola = computed(() => {
    const p = this.province().find((x) => x.id === this.provinciaRegola());
    return p ? `${p.name} (${p.code})` : '';
  });

  readonly qVendita = signal('');
  readonly vendite = signal<any[]>([]);
  readonly venditaScelta = signal<any | null>(null);
  readonly qProdotto = signal('');
  readonly prodotti = signal<any[]>([]);
  readonly riferimento = signal<any | null>(null);
  readonly varianteScelta = signal<string | null>(null);
  readonly partnerScelto = signal<string | null>(null);
  readonly prezzoScelto = signal<number | null>(null);
  /** ⭐ 08/09/2026: i pezzi del patto, quando il prezzo di riferimento è unitario. */
  readonly pezzi = signal(1);
  readonly anteprima = signal<any | null>(null);
  readonly salvando = signal(false);
  readonly erroreNuova = signal<string | null>(null);
  private timerVendite?: ReturnType<typeof setTimeout>;
  private timerProdotti?: ReturnType<typeof setTimeout>;

  apriNuova(): void {
    this.nuova.set(true);
    this.azzeraNuova();
    this.senzaVendita.set(false);
    this.tutteLeVendite.set(false);
    this.cercaVendite('');
    if (!this.province().length) {
      this.http.get<{ id: string; code: string; name: string }[]>(`${environment.apiUrl}/riconciliazioni/province`)
        .subscribe({ next: (d) => this.province.set(d ?? []), error: () => this.province.set([]) });
    }
  }

  /** Si cambia strada: quello scelto sull'altra non deve restare appeso. */
  modoVendita(senza: boolean): void {
    if (this.senzaVendita() === senza) return;
    this.senzaVendita.set(senza);
    this.azzeraNuova();
    if (!senza) this.cercaVendite('');
  }

  cambiaAmpiezza(tutte: boolean): void {
    this.tutteLeVendite.set(tutte);
    this.cercaVendite(this.qVendita());
  }

  cercaProdottoRegola(q: string): void {
    this.qProdottoRegola.set(q);
    clearTimeout(this.timerProdottoRegola);
    if (q.trim().length < 2) { this.prodottiRegola.set([]); return; }
    this.timerProdottoRegola = setTimeout(() => {
      this.http.get<any[]>(`${environment.apiUrl}/riconciliazioni/cerca-prodotti`, { params: { q } })
        .subscribe({ next: (d) => this.prodottiRegola.set(d ?? []), error: () => this.prodottiRegola.set([]) });
    }, 250);
  }

  scegliProdottoRegola(p: any): void {
    this.prodottoRegola.set(p);
    this.prodottiRegola.set([]);
    this.varianteRegola.set(null);
    this.anteprima.set(null);
  }

  scegliVarianteRegola(id: string | null): void {
    this.varianteRegola.set(id);
    this.anteprima.set(null);
    this.partnerScelto.set(null); this.prezzoScelto.set(null);
  }

  scegliProvinciaRegola(id: string | null): void {
    this.provinciaRegola.set(id);
    this.anteprima.set(null);
    this.partnerScelto.set(null); this.prezzoScelto.set(null);
  }

  cambiaProdottoRegola(): void {
    this.prodottoRegola.set(null); this.varianteRegola.set(null);
    this.riferimento.set(null); this.partnerScelto.set(null);
    this.prezzoScelto.set(null); this.anteprima.set(null);
  }

  chiudiNuova(): void {
    this.nuova.set(false);
    this.azzeraNuova();
  }

  private azzeraNuova(): void {
    this.qVendita.set(''); this.vendite.set([]); this.venditaScelta.set(null);
    this.qProdottoRegola.set(''); this.prodottiRegola.set([]); this.prodottoRegola.set(null);
    this.varianteRegola.set(null); this.provinciaRegola.set(null);
    this.qProdotto.set(''); this.prodotti.set([]); this.riferimento.set(null);
    this.partnerFiltro.set(null); this.qPartner.set(''); this.partnerTrovati.set([]);
    this.varianteScelta.set(null); this.partnerScelto.set(null); this.prezzoScelto.set(null);
    this.anteprima.set(null); this.erroreNuova.set(null); this.salvando.set(false);
    this.pezzi.set(1);
  }

  cercaVendite(q: string): void {
    this.qVendita.set(q);
    clearTimeout(this.timerVendite);
    this.timerVendite = setTimeout(() => {
      this.http.get<any[]>(`${environment.apiUrl}/riconciliazioni/vendite-da-riconciliare`, {
        params: { ...(q ? { q } : {}), ...(this.tutteLeVendite() ? { tutte: '1' } : {}) },
      })
        .subscribe({ next: (d) => this.vendite.set(d ?? []), error: () => this.vendite.set([]) });
    }, 250);
  }

  scegliVendita(v: any): void {
    this.venditaScelta.set(v);
    this.vendite.set([]);
    this.anteprima.set(null);
  }

  cambiaVendita(): void {
    this.venditaScelta.set(null);
    this.anteprima.set(null);
    this.cercaVendite(this.qVendita());
  }

  /** Il partner di cui guardare il catalogo (null = tutti). */
  readonly partnerFiltro = signal<string | null>(null);
  readonly qPartner = signal('');
  readonly partnerTrovati = signal<{ id: string; insegna: string }[]>([]);

  /** Il partner scelto, per mostrarne il nome invece del campo di ricerca. */
  readonly partnerScelto2 = computed(() => {
    const id = this.partnerFiltro();
    return id ? this.partnerAttivi().find((x) => x.id === id) ?? null : null;
  });

  /**
   * La ricerca del partner: si filtra l'elenco gia' in memoria (129 partner attivi,
   * caricati all'apertura della pagina). Nessuna chiamata al server, risposta immediata,
   * e si vede quello che si sta scrivendo.
   */
  cercaPartner(q: string): void {
    this.qPartner.set(q);
    const testo = q.trim().toLowerCase();
    if (testo.length < 2) { this.partnerTrovati.set([]); return; }
    this.partnerTrovati.set(
      this.partnerAttivi()
        .filter((x) => (x.insegna ?? '').toLowerCase().includes(testo))
        .slice(0, 12),
    );
  }

  filtraPerPartner(partnerId: string | null): void {
    this.partnerFiltro.set(partnerId);
    this.partnerTrovati.set([]);
    if (!partnerId) this.qPartner.set('');
    // Col partner scelto la ricerca riparte anche senza riscrivere: se il campo e' vuoto
    // si mostra comunque il suo catalogo, che e' il motivo per cui uno sceglie un partner.
    this.cercaProdotti(this.qProdotto());
  }

  cercaProdotti(q: string): void {
    this.qProdotto.set(q);
    clearTimeout(this.timerProdotti);
    const partnerId = this.partnerFiltro();
    // Senza testo e senza partner non si cerca nulla: mezzo catalogo non aiuta nessuno.
    if (!q.trim() && !partnerId) { this.prodotti.set([]); return; }
    this.timerProdotti = setTimeout(() => {
      this.http.get<{ items: any[] }>(`${environment.apiUrl}/products`, {
        params: { ...(q.trim() ? { q } : {}), ...(partnerId ? { partnerId } : {}), active: true, pageSize: 30 } as any,
      }).subscribe({ next: (d) => this.prodotti.set(d.items ?? []), error: () => this.prodotti.set([]) });
    }, 250);
  }

  scegliRiferimento(p: any): void {
    this.prodotti.set([]);
    this.caricaRiferimento(p.id, null);
  }

  scegliVariante(variantId: string | null): void {
    this.varianteScelta.set(variantId);
    const rif = this.riferimento();
    if (rif) this.caricaRiferimento(rif.prodotto.id, variantId);
  }

  private caricaRiferimento(productId: string, variantId: string | null): void {
    this.partnerScelto.set(null); this.prezzoScelto.set(null); this.anteprima.set(null);
    this.http.get<any>(`${environment.apiUrl}/riconciliazioni/riferimento/${productId}`,
      { params: variantId ? { variantId } : {} })
      .subscribe({
        next: (d) => { this.riferimento.set(d); this.varianteScelta.set(variantId); },
        error: () => this.erroreNuova.set(this.translate.instant('reconciliations.nuova.erroreRiferimento')),
      });
  }

  cambiaRiferimento(): void {
    this.riferimento.set(null); this.varianteScelta.set(null);
    this.partnerScelto.set(null); this.prezzoScelto.set(null); this.anteprima.set(null);
  }

  /**
   * SU COSA vale il patto: dalla vendita, o dal prodotto scelto a mano.
   * Un punto solo, così l'anteprima e il salvataggio non possono divergere.
   */
  private suCosa(): Record<string, string | null> | null {
    if (this.senzaVendita()) {
      const p = this.prodottoRegola(); const prov = this.provinciaRegola();
      return p && prov ? { productId: p.id, productVariantId: this.varianteRegola(), provinceId: prov } : null;
    }
    const v = this.venditaScelta();
    return v ? { saleId: v.id } : null;
  }

  scegliPartner(r: { partnerId: string; prezzoPartner: number }): void {
    this.partnerScelto.set(r.partnerId);
    this.prezzoScelto.set(r.prezzoPartner);
    const su = this.suCosa();
    if (!su) return;
    this.erroreNuova.set(null);
    this.http.post<any>(`${environment.apiUrl}/riconciliazioni/anteprima`,
      { ...su, partnerId: r.partnerId, prezzoPartner: r.prezzoPartner, pezzi: this.pezzi() })
      .subscribe({
        next: (d) => this.anteprima.set(d),
        error: (e) => { this.anteprima.set(null); this.erroreNuova.set(e?.error?.message ?? this.translate.instant('reconciliations.nuova.erroreAnteprima')); },
      });
  }

  /** Cambiati i pezzi, il conto si rifà: il margine dipende da quanti sono. */
  cambiaPezzi(n: number): void {
    this.pezzi.set(Math.max(1, Math.round(Number(n) || 1)));
    const id = this.partnerScelto();
    const prezzo = this.prezzoScelto();
    if (id && prezzo != null) this.scegliPartner({ partnerId: id, prezzoPartner: prezzo });
  }

  salvaNuova(): void {
    const su = this.suCosa();
    const partnerId = this.partnerScelto();
    const prezzo = this.prezzoScelto();
    const rif = this.riferimento();
    if (!su || !partnerId || prezzo == null) return;
    this.salvando.set(true);
    this.erroreNuova.set(null);
    this.http.post(`${environment.apiUrl}/riconciliazioni/manuale`, {
      ...su, partnerId, prezzoPartner: prezzo, pezzi: this.pezzi(),
      riferimentoProductId: rif?.prodotto?.id, riferimentoVariantId: this.varianteScelta() ?? undefined,
    }).subscribe({
      next: () => { this.chiudiNuova(); this.carica(); },
      error: (e) => { this.salvando.set(false); this.erroreNuova.set(e?.error?.message ?? this.translate.instant('reconciliations.nuova.erroreSalva')); },
    });
  }

  ordinaPer(campo: string): void {
    if (this.ordine() === campo) { this.verso.set(this.verso() === 'asc' ? 'desc' : 'asc'); return; }
    this.ordine.set(campo);
    this.verso.set('asc');
  }

  segno(campo: string): string {
    if (this.ordine() !== campo) return '';
    return this.verso() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Il valore su cui si confronta. `null` = «non ce l'ha»: va in fondo. */
  private valore(r: Riga, campo: string): string | number | null {
    switch (campo) {
      case 'prodotto': return (r.prodotto ?? '').toLowerCase();
      case 'provincia': return (r.provinciaCodice ?? '').toLowerCase() || null;
      case 'consegna': return r.consegnaCodice ?? null;
      case 'vendite': return r.vendite ?? 0;
      case 'partner': return (r.partner ?? '').toLowerCase() || null;
      case 'prezzoPartner': return r.prezzoPartner ?? null;
      case 'prezzo': return r.prezzo ?? null;
      case 'stato': return r.stato ?? null;
      default: return null;
    }
  }

  readonly righeOrdinate = computed<Riga[]>(() => {
    const campo = this.ordine();
    const righe = this.righe();
    if (!campo) return righe;
    const giu = this.verso() === 'desc' ? -1 : 1;
    // Copia: `sort` lavora sul posto e muterebbe il segnale.
    return [...righe].sort((a, b) => {
      const va = this.valore(a, campo);
      const vb = this.valore(b, campo);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;   // i vuoti sempre in fondo,
      if (vb === null) return -1;  // in tutti e due i versi
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * giu;
      // I testi si confrontano come li legge una persona (à dopo a, 10 dopo 9).
      return String(va).localeCompare(String(vb), 'it', { numeric: true }) * giu;
    });
  });
  readonly caricando = signal(false);
  readonly analizzando = signal(false);
  readonly inAzione = signal(false);
  readonly esito = signal<EsitoCorsa | null>(null);
  readonly errore = signal<string | null>(null);
  readonly ultima = signal<UltimaCorsa | null>(null);
  readonly conferma = signal<{ titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary'; riga: Riga; azione: 'accetta' | 'rifiuta' } | null>(null);

  /** Modifica in riga: partner (fra chi opera nella provincia), prezzo, sconto. */
  readonly esclusi = signal<{ id: string; insegna: string }[]>([]);
  readonly partnerAttivi = signal<{ id: string; insegna: string }[]>([]);
  readonly regoleColpite = signal(0);
  nuovoEscluso = '';

  readonly modificaId = signal<string | null>(null);
  readonly partnerScelta = signal<{ id: string; insegna: string }[]>([]);
  mod: { partnerId: string; partnerPrice: number | null } = { partnerId: '', partnerPrice: null };

  /** Intervallo di default: gli ultimi 90 giorni, come la corsa notturna. */
  da = '';
  a = '';

  constructor() {
    const oggi = new Date();
    this.a = this.iso(oggi);
    this.da = this.iso(new Date(oggi.getTime() - 90 * 86400000));
    this.carica();
    this.caricaEsclusi();
    this.http.get<UltimaCorsa | null>(`${environment.apiUrl}/riconciliazioni/ultima-corsa`).subscribe({
      next: (u) => this.ultima.set(u),
      error: () => this.ultima.set(null),
    });
  }

  caricaEsclusi(): void {
    this.http.get<{ partner: { id: string; insegna: string }[] }>(`${environment.apiUrl}/riconciliazioni/esclusi`)
      .subscribe({ next: (e) => this.esclusi.set(e.partner) });
    this.http.get<{ id: string; insegna: string }[]>(`${environment.apiUrl}/riconciliazioni/partner-attivi`)
      .subscribe({ next: (l) => this.partnerAttivi.set(l) });
  }

  aggiungiEscluso(): void {
    if (!this.nuovoEscluso) return;
    this.scriviEsclusi([...this.esclusi().map((p) => p.id), this.nuovoEscluso]);
  }

  togliEscluso(id: string): void {
    this.scriviEsclusi(this.esclusi().map((p) => p.id).filter((x) => x !== id));
  }

  private scriviEsclusi(partnerIds: string[]): void {
    this.inAzione.set(true);
    this.errore.set(null);
    this.http.put<{ partner: { id: string; insegna: string }[]; regoleAttive: number }>(
      `${environment.apiUrl}/riconciliazioni/esclusi`, { partnerIds },
    ).subscribe({
      next: (e) => {
        this.inAzione.set(false);
        this.nuovoEscluso = '';
        this.esclusi.set(e.partner);
        this.regoleColpite.set(e.regoleAttive);
        this.caricaEsclusi();
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** ⚠️ Anche `undefined`: un numero che non c'è si scrive «—», mai «undefined». */
  fmt(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : (this.decimal.transform(n, '1.2-2') ?? String(n));
  }

  private statoDelFiltro(): string {
    const f = this.filtro();
    return f === 'Proposte' ? 'proposta' : f === 'Accettate' ? 'accettata' : f === 'Rifiutate' ? 'rifiutata' : 'tutte';
  }

  setFiltro(f: (typeof this.filtri)[number]): void {
    if (this.filtro() === f) return;
    this.filtro.set(f);
    this.modificaId.set(null);
    this.carica();
  }

  carica(): void {
    this.caricando.set(true);
    this.http.get<Riga[]>(`${environment.apiUrl}/riconciliazioni`, { params: { stato: this.statoDelFiltro() } }).subscribe({
      next: (r) => {
        this.righe.set(r);
        this.caricando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.caricando.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorRun', { msg: this.msg(e) }));
      },
    });
  }

  /** Lancio manuale: l'esito torna subito, e la tabella mostra le righe toccate. */
  analizza(): void {
    this.analizzando.set(true);
    this.esito.set(null);
    this.errore.set(null);
    this.http.post<EsitoCorsa>(`${environment.apiUrl}/riconciliazioni/analizza`, { da: this.da, a: this.a }).subscribe({
      next: (e) => {
        this.analizzando.set(false);
        this.esito.set(e);
        if (e.righe.length) {
          this.filtro.set('Proposte');
          this.righe.set(e.righe);
        } else {
          this.carica();
        }
      },
      error: (e: HttpErrorResponse) => {
        this.analizzando.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorRun', { msg: this.msg(e) }));
      },
    });
  }

  chiedi(r: Riga, azione: 'accetta' | 'rifiuta'): void {
    const accetta = azione === 'accetta';
    this.conferma.set({
      riga: r,
      azione,
      titolo: this.translate.instant(accetta ? 'reconciliations.acceptTitle' : 'reconciliations.rejectTitle'),
      messaggio: this.translate.instant(accetta ? 'reconciliations.acceptMsg' : 'reconciliations.rejectMsg', {
        prodotto: r.prodotto,
        provincia: r.provinciaCodice,
        partner: r.partner,
        prezzo: this.fmt(r.prezzo),
      }),
      verbo: this.translate.instant(accetta ? 'reconciliations.accept' : 'reconciliations.reject'),
      tono: accetta ? 'primary' : 'danger',
    });
  }

  esegui(): void {
    const c = this.conferma();
    if (!c) return;
    this.conferma.set(null);
    this.inAzione.set(true);
    this.errore.set(null);
    this.http.post<Riga>(`${environment.apiUrl}/riconciliazioni/${c.riga.id}/${c.azione}`, {}).subscribe({
      next: (aggiornata) => {
        this.inAzione.set(false);
        this.sostituisci(aggiornata);
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  apriModifica(r: Riga): void {
    this.mod = { partnerId: r.partnerId, partnerPrice: r.prezzoPartner };
    this.partnerScelta.set(r.partner ? [{ id: r.partnerId, insegna: r.partner }] : []);
    this.modificaId.set(r.id);
    this.http.get<{ id: string; insegna: string }[]>(`${environment.apiUrl}/riconciliazioni/partner-in-provincia/${r.provinceId}`).subscribe({
      next: (lista) => {
        // Il partner di oggi resta selezionabile anche se non opera più lì: si vede, non sparisce.
        const conAttuale = lista.some((p) => p.id === r.partnerId) || !r.partner ? lista : [{ id: r.partnerId, insegna: r.partner! }, ...lista];
        this.partnerScelta.set(conAttuale);
      },
    });
  }

  salvaModifica(r: Riga): void {
    this.inAzione.set(true);
    this.errore.set(null);
    this.http.put<Riga>(`${environment.apiUrl}/riconciliazioni/${r.id}`, {
      partnerId: this.mod.partnerId,
      partnerPrice: this.mod.partnerPrice,
    }).subscribe({
      next: (aggiornata) => {
        this.inAzione.set(false);
        this.modificaId.set(null);
        this.sostituisci(aggiornata);
      },
      error: (e: HttpErrorResponse) => {
        this.inAzione.set(false);
        this.errore.set(this.translate.instant('reconciliations.errorDecide', { msg: this.msg(e) }));
      },
    });
  }

  /** La riga aggiornata prende il posto della vecchia; se non rientra più nel filtro, sparisce. */
  private sostituisci(aggiornata: Riga): void {
    const stato = this.statoDelFiltro();
    this.righe.update((righe) =>
      stato === 'tutte' || aggiornata.stato === stato
        ? righe.map((r) => (r.id === aggiornata.id ? aggiornata : r))
        : righe.filter((r) => r.id !== aggiornata.id),
    );
  }

  private msg(e: HttpErrorResponse): string {
    const m = (e.error as { message?: string | string[] })?.message;
    return Array.isArray(m) ? m.join(', ') : m || e.message || String(e.status);
  }
}
