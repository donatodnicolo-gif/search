import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/**
 * ⭐ 06/09/2026 — STATISTICHE (richiesta utente; disegno della giuria: KPI del
 * controller di gestione, pagina dell'architetto UX, calcolo dell'architetto
 * performance — vedi api/src/statistiche).
 *
 * Regole della pagina (verdetto UX):
 *  - due segmented in testa (periodo · confronto), stato nell'URL, sotto le
 *    DATE EFFETTIVE dei due intervalli (parziale contro parziale a pari giorni);
 *  - tessere KPI: valore → Δ (freccia + assoluto + %) → base «su N · vs M»;
 *    verde/rosso SOLO dove il verso buono è dichiarato (mappa VERSO), altrimenti
 *    neutro; precedente 0 o n/d → «—»;
 *  - le medie escludono le righe senza dato e ne dicono il numero; sotto il
 *    50 % di copertura si mostra «n/d» col motivo;
 *  - un solo grafico: la barra impilata della puntualità (tre quote a somma 100);
 *  - tabella per tipologia ordinabile, riga «Totale»; tre classifiche top 10
 *    con «altri: N»; tabella per stato con la mappa colori della piattaforma.
 */
type Periodo = 'oggi' | 'settimana' | 'mese' | 'mese-scorso' | 'trimestre' | 'anno';
type Confronto = 'precedente' | 'anno-prima';

/** Il verso «buono» di ogni KPI: su = bene (1), giù = bene (−1), neutro (0). */
const VERSO: Record<string, 1 | -1 | 0> = {
  consegne: 1, prezzoMedio: 0, feeMedia: 1, margineMedio: 1, puntualita: 1, guasti: -1,
  ritardoMedio: -1, tempoMedio: 0, kmMedi: 0, anticipoMedio: 0, nonConsegnate: -1, annullate: -1,
};

@Component({
  selector: 'app-statistiche',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  template: `
    <div class="page-head">
      <div>
        <h1>{{ 'statistiche.title' | translate }}</h1>
        <p class="sub">{{ 'statistiche.sub' | translate }}</p>
      </div>
    </div>

    <div class="card filtri">
      <div class="gruppo">
        <span class="eti">{{ 'statistiche.periodo' | translate }}</span>
        <div class="quick-tabs" role="tablist">
          @for (p of PERIODI; track p) {
            <button type="button" class="quick-tab" [class.active]="periodo() === p" (click)="scegli(p, confronto())">{{ 'statistiche.p.' + p | translate }}</button>
          }
        </div>
      </div>
      <div class="gruppo">
        <span class="eti">{{ 'statistiche.confronto' | translate }}</span>
        <div class="quick-tabs" role="tablist">
          @for (c of CONFRONTI; track c) {
            <button type="button" class="quick-tab" [class.active]="confronto() === c" (click)="scegli(periodo(), c)">{{ 'statistiche.c.' + c | translate }}</button>
          }
        </div>
      </div>
      <!-- ⭐ 06/09/2026 (regola utente): filtri per tipologia di servizio,
           provincia (città) e uno o più partner scelti da un elenco. Stanno
           nell'URL come periodo e confronto, e valgono su TUTTA la pagina. -->
      <div class="gruppo">
        <span class="eti">{{ 'statistiche.filtri.servizio' | translate }}</span>
        <!-- ⭐ 06/09/2026 (regola utente): la MACROTIPOLOGIA, non il singolo servizio. -->
        <select class="field compatto" [ngModel]="pricingModel()" (ngModelChange)="pricingModel.set($event); applicaFiltri()">
          <option value="">{{ 'statistiche.filtri.tutte' | translate }}</option>
          @for (m of MODELLI; track m) { <option [value]="m">{{ 'enums.servicePricing.' + m | translate }}</option> }
        </select>
      </div>
      <div class="gruppo">
        <span class="eti">{{ 'statistiche.filtri.provincia' | translate }}</span>
        <select class="field compatto" [ngModel]="provinceId()" (ngModelChange)="provinceId.set($event); applicaFiltri()">
          <option value="">{{ 'statistiche.filtri.tutte' | translate }}</option>
          @for (p of province(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.code }})</option> }
        </select>
      </div>
      <div class="gruppo partner-filtro">
        <span class="eti">{{ 'statistiche.filtri.partner' | translate }}</span>
        <div class="partner-scelta">
          <button type="button" class="field compatto apri" (click)="elencoPartnerAperto.set(!elencoPartnerAperto())">
            @if (partnerIds().length) { {{ 'statistiche.filtri.partnerScelti' | translate: { n: partnerIds().length } }} } @else { {{ 'statistiche.filtri.tutti' | translate }} }
            <span class="freccia">▾</span>
          </button>
          @if (elencoPartnerAperto()) {
            <div class="overlay-trasparente" (click)="elencoPartnerAperto.set(false)"></div>
            <div class="elenco-partner card">
              <input class="field compatto" type="search" [placeholder]="'statistiche.filtri.cercaPartner' | translate" [ngModel]="cercaPartner()" (ngModelChange)="cercaPartner.set($event)" />
              <div class="righe">
                @for (p of partnerFiltrati(); track p.id) {
                  <label class="riga-partner">
                    <input type="checkbox" [checked]="partnerIds().includes(p.id)" (change)="togliOMettiPartner(p.id)" />
                    <span>{{ p.insegna }}</span>
                  </label>
                } @empty { <p class="muted piccolo">{{ 'statistiche.filtri.nessunPartner' | translate }}</p> }
              </div>
              <div class="azioni-elenco">
                <button type="button" class="act" (click)="partnerIds.set([]); applicaFiltri()">{{ 'statistiche.filtri.azzera' | translate }}</button>
                <button type="button" class="act primary" (click)="elencoPartnerAperto.set(false)">{{ 'common.close' | translate }}</button>
              </div>
            </div>
          }
        </div>
        @if (partnerIds().length) {
          <div class="chips">
            @for (id of partnerIds(); track id) {
              <span class="chip-filtro" (click)="togliOMettiPartner(id)">{{ nomePartner(id) }} <span class="x">×</span></span>
            }
          </div>
        }
      </div>
      <!-- ⭐ 06/09/2026 (regola utente): anche uno o più VALET attivi. -->
      <div class="gruppo partner-filtro">
        <span class="eti">{{ 'statistiche.filtri.valet' | translate }}</span>
        <div class="partner-scelta">
          <button type="button" class="field compatto apri" (click)="elencoValetAperto.set(!elencoValetAperto())">
            @if (valetIds().length) { {{ 'statistiche.filtri.valetScelti' | translate: { n: valetIds().length } }} } @else { {{ 'statistiche.filtri.tutti' | translate }} }
            <span class="freccia">▾</span>
          </button>
          @if (elencoValetAperto()) {
            <div class="overlay-trasparente" (click)="elencoValetAperto.set(false)"></div>
            <div class="elenco-partner card">
              <input class="field compatto" type="search" [placeholder]="'statistiche.filtri.cercaValet' | translate" [ngModel]="cercaValet()" (ngModelChange)="cercaValet.set($event)" />
              <div class="righe">
                @for (v of valetFiltrati(); track v.id) {
                  <label class="riga-partner">
                    <input type="checkbox" [checked]="valetIds().includes(v.id)" (change)="togliOMettiValet(v.id)" />
                    <span>{{ v.nome }}</span>
                  </label>
                } @empty { <p class="muted piccolo">{{ 'statistiche.filtri.nessunValet' | translate }}</p> }
              </div>
              <div class="azioni-elenco">
                <button type="button" class="act" (click)="valetIds.set([]); applicaFiltri()">{{ 'statistiche.filtri.azzera' | translate }}</button>
                <button type="button" class="act primary" (click)="elencoValetAperto.set(false)">{{ 'common.close' | translate }}</button>
              </div>
            </div>
          }
        </div>
        @if (valetIds().length) {
          <div class="chips">
            @for (id of valetIds(); track id) {
              <span class="chip-filtro" (click)="togliOMettiValet(id)">{{ nomeValet(id) }} <span class="x">×</span></span>
            }
          </div>
        }
      </div>
      @if (dati(); as d) {
        <p class="date muted">
          {{ intervallo(d.periodo.da, d.periodo.a) }} ({{ d.periodo.giorni }} {{ 'statistiche.giorni' | translate }})
          · {{ 'statistiche.vs' | translate }} {{ intervallo(d.confronto.da, d.confronto.a) }}
          @if (!d.periodo.pieno) { · {{ 'statistiche.pariGiorni' | translate }} }
          · {{ 'statistiche.aggiornato' | translate }} {{ ora(d.generatoAlle) }}
        </p>
      }
    </div>

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else if (error()) { <div class="card state-card error">{{ error() }}</div> }
    @else {
      @if (dati(); as d) {
      <!-- Tessere KPI -->
      <div class="tessere">
        @for (t of tessere(); track t.chiave) {
          <div class="stat kpi">
            <span class="k">{{ 'statistiche.kpi.' + t.chiave | translate }}</span>
            <span class="v">{{ t.valore }}</span>
            <span class="delta" [class.su]="t.tono === 'bene'" [class.giu]="t.tono === 'male'">{{ t.delta }}</span>
            <span class="base">{{ t.base }}</span>
          </div>
        }
      </div>

      <!-- Puntualità e tempi -->
      <section class="card blocco">
        <h2>{{ 'statistiche.puntualita.titolo' | translate }}</h2>
        @if (d.totale.corrente.puntualita.valutabili > 0) {
          <div class="barra" role="img" [attr.aria-label]="'statistiche.puntualita.barra' | translate">
            <div class="seg ok" [style.width.%]="d.totale.corrente.puntualita.pctInOrario ?? 0">{{ pctTxt(d.totale.corrente.puntualita.pctInOrario) }} {{ 'statistiche.puntualita.inOrario' | translate }}</div>
            <div class="seg presto" [style.width.%]="d.totale.corrente.puntualita.pctAnticipo ?? 0">{{ pctTxt(d.totale.corrente.puntualita.pctAnticipo) }} {{ 'statistiche.puntualita.anticipo' | translate }}</div>
            <div class="seg tardi" [style.width.%]="d.totale.corrente.puntualita.pctRitardo ?? 0">{{ pctTxt(d.totale.corrente.puntualita.pctRitardo) }} {{ 'statistiche.puntualita.ritardo' | translate }}</div>
          </div>
          <!-- ⭐ 06/09/2026 (regola utente: «anche le tempistiche devono entrare nel
               confronto»): la stessa barra per il periodo di confronto, più sottile. -->
          @if (d.totale.confronto.puntualita.valutabili > 0) {
            <div class="barra sottile" [attr.title]="intervallo(d.confronto.da, d.confronto.a)">
              <div class="seg ok" [style.width.%]="d.totale.confronto.puntualita.pctInOrario ?? 0">{{ pctTxt(d.totale.confronto.puntualita.pctInOrario) }}</div>
              <div class="seg presto" [style.width.%]="d.totale.confronto.puntualita.pctAnticipo ?? 0">{{ pctTxt(d.totale.confronto.puntualita.pctAnticipo) }}</div>
              <div class="seg tardi" [style.width.%]="d.totale.confronto.puntualita.pctRitardo ?? 0">{{ pctTxt(d.totale.confronto.puntualita.pctRitardo) }}</div>
            </div>
            <p class="muted piccolo confronto-riga">
              {{ 'statistiche.puntualita.confronto' | translate: { periodo: intervallo(d.confronto.da, d.confronto.a), n: num(d.totale.confronto.puntualita.valutabili) } }}
              · <span class="delta" [class.su]="tono(d.totale.corrente.puntualita.pctInOrario, d.totale.confronto.puntualita.pctInOrario, 1) === 'bene'" [class.giu]="tono(d.totale.corrente.puntualita.pctInOrario, d.totale.confronto.puntualita.pctInOrario, 1) === 'male'">{{ 'statistiche.puntualita.inOrario' | translate }} {{ deltaPp(d.totale.corrente.puntualita.pctInOrario, d.totale.confronto.puntualita.pctInOrario) }}</span>
              · <span class="delta" [class.su]="tono(d.totale.corrente.puntualita.pctRitardo, d.totale.confronto.puntualita.pctRitardo, -1) === 'bene'" [class.giu]="tono(d.totale.corrente.puntualita.pctRitardo, d.totale.confronto.puntualita.pctRitardo, -1) === 'male'">{{ 'statistiche.puntualita.ritardo' | translate }} {{ deltaPp(d.totale.corrente.puntualita.pctRitardo, d.totale.confronto.puntualita.pctRitardo) }}</span>
            </p>
          }
          <p class="muted piccolo">
            {{ 'statistiche.puntualita.base' | translate: { n: num(d.totale.corrente.puntualita.valutabili), m: num(d.totale.corrente.concluse), senza: num(d.totale.corrente.puntualita.nonValutabili), tol: d.regole.tolleranzaRitardoMin, ant: d.regole.tolleranzaAnticipoMin } }}
            @if (d.totale.corrente.puntualita.ritardo > 0) {
              · <button type="button" class="link-btn" (click)="apriRitardi()">{{ 'statistiche.ritardi.apri' | translate: { n: num(d.totale.corrente.puntualita.ritardo) } }}</button>
            }
          </p>
          <!-- ⭐ 06/09/2026 (regola utente): le consegne in ritardo si APRONO. Tabella
               ordinabile, riga cliccabile → dettaglio consegna (Libro UX §8). -->
          @if (ritardiAperti()) {
            <div class="ritardi">
              @if (ritardiCaricamento()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
              @else { @if (ritardi(); as r) {
                <p class="muted piccolo">{{ 'statistiche.ritardi.intro' | translate: { n: num(r.totale), mostrate: num(r.mostrate) } }}</p>
                <div class="table-wrap">
                  <table>
                    <thead><tr>
                      @for (c of COL_RITARDI; track c.chiave) {
                        <th [class.num]="c.num" class="sortable" (click)="ordinaLista('ritardi', c.chiave)">{{ 'statistiche.ritardi.col.' + c.chiave | translate }}<span class="sort-ind">{{ segnoLista('ritardi', c.chiave) }}</span></th>
                      }
                    </tr></thead>
                    <tbody>
                      @for (x of righeOrdinate('ritardi', r.righe); track x.id) {
                        <tr class="row-link" [class.aperta]="espansa() === 'r:' + x.id" tabindex="0" (click)="espandi('r:' + x.id)" (keydown.enter)="espandi('r:' + x.id)">
                          <td class="strong">#{{ x.code }}</td>
                          <td>{{ giorno(x.date) }}</td>
                          <td>{{ x.partner }}</td>
                          <td>{{ x.valet || '—' }}</td>
                          <td>{{ x.servizio }}</td>
                          <td>{{ x.fasciaDa ? x.fasciaDa + '–' : '' }}{{ x.fasciaA }}</td>
                          <td>{{ oraDi(x.deliveredAt) }}</td>
                          <td class="num ko strong">{{ minTxt(x.ritardoMin) }}</td>
                        </tr>
                        @if (espansa() === 'r:' + x.id) {
                          <tr class="tendina"><td colspan="8">
                            <div class="tendina-corpo">
                              <dl>
                                <dt>{{ 'statistiche.tendina.indirizzo' | translate }}</dt><dd>{{ x.indirizzo || '—' }}</dd>
                                <dt>{{ 'statistiche.tendina.ritiro' | translate }}</dt><dd>{{ x.ritiro || '—' }}</dd>
                                <dt>{{ 'statistiche.tendina.partito' | translate }}</dt><dd>{{ oraDi(x.startedAt) }}</dd>
                                <dt>{{ 'statistiche.tendina.consegnato' | translate }}</dt><dd>{{ oraDi(x.deliveredAt) }} · {{ 'statistiche.tendina.oltre' | translate: { v: minTxt(x.ritardoMin) } }}</dd>
                                <dt>{{ 'statistiche.tendina.km' | translate }}</dt><dd>{{ kmTxt(x.km) }}</dd>
                                <dt>{{ 'statistiche.tendina.stato' | translate }}</dt><dd><span class="pill" [class]="'pill s-' + x.status"><span class="dot" [class]="'dot s-' + x.status"></span>{{ 'status.delivery.' + x.status | translate }}</span>{{ x.ddt ? ' · DDT ' + x.ddt : '' }}</dd>
                              </dl>
                              <div class="tendina-azioni">
                                <button type="button" class="act primary" (click)="vai(['/deliveries', x.id]); $event.stopPropagation()">{{ 'statistiche.tendina.apriConsegna' | translate: { code: x.code } }}</button>
                                @if (x.partnerId) { <button type="button" class="act" (click)="vai(['/partners', x.partnerId]); $event.stopPropagation()">{{ 'statistiche.tendina.apriPartner' | translate }}</button> }
                                @if (x.valetId) { <button type="button" class="act" (click)="vai(['/valets', x.valetId]); $event.stopPropagation()">{{ 'statistiche.tendina.apriValet' | translate }}</button> }
                              </div>
                            </div>
                          </td></tr>
                        }
                      }
                    </tbody>
                  </table>
                </div>
              } }
            </div>
          }
        } @else {
          <p class="muted">{{ 'statistiche.puntualita.nd' | translate }}</p>
        }
        <div class="numeri">
          @for (t of tempi(); track t.chiave) {
            <div class="numero">
              <span class="k">{{ 'statistiche.kpi.' + t.chiave | translate }}</span>
              <span class="v">{{ t.valore }} <span class="prima muted">{{ t.prima ? ('statistiche.prima' | translate: { v: t.prima }) : '' }}</span></span>
              <span class="delta" [class.su]="t.tono === 'bene'" [class.giu]="t.tono === 'male'">{{ t.delta }}</span>
              <span class="base">{{ t.base }}</span>
            </div>
          }
        </div>
      </section>

      <!-- Per tipologia di servizio -->
      <section class="card blocco">
        <h2>{{ 'statistiche.tipologia.titolo' | translate }}</h2>
        <div class="table-wrap col-fisse">
          <table>
            <thead><tr>
              @for (c of COLONNE; track c.chiave) {
                <th [class.num]="c.chiave !== 'nome'" [class.col-id]="c.chiave === 'nome'" class="sortable" (click)="ordina(c.chiave)">
                  {{ 'statistiche.tipologia.col.' + c.chiave | translate }}<span class="sort-ind">{{ segno(c.chiave) }}</span>
                </th>
              }
            </tr></thead>
            <tbody>
              @for (r of righeTipologia(); track r.serviceTypeId) {
                <tr class="row-link" [class.aperta]="espansa() === 't:' + r.modello" tabindex="0" (click)="espandi('t:' + r.modello)" (keydown.enter)="espandi('t:' + r.modello)">
                  <td class="col-id strong">{{ 'enums.servicePricing.' + r.modello | translate }}</td>
                  <td class="num">{{ num(r.corrente.totali) }}</td>
                  <td class="num delta" [class.su]="tono(r.corrente.totali, r.confronto.totali, 1) === 'bene'" [class.giu]="tono(r.corrente.totali, r.confronto.totali, 1) === 'male'">{{ deltaTxt(r.corrente.totali, r.confronto.totali) }}</td>
                  <td class="num">{{ num(r.corrente.concluse) }}</td>
                  <td class="num">{{ pctTxt(r.corrente.tassoNonConsegnate) }}</td>
                  <td class="num">{{ pctTxt(r.corrente.tassoAnnullate) }}</td>
                  <td class="num">{{ euroTxt(r.corrente.prezzoMedio) }} <span class="muted piccolo">{{ baseTxt(r.corrente.prezzoN, r.corrente.concluse) }}</span>
                    <div class="delta piccolo">{{ deltaTxt(r.corrente.prezzoMedio, r.confronto.prezzoMedio, false, ' €') }}</div></td>
                  <td class="num">{{ pctTxt(r.corrente.puntualita.pctInOrario) }} <span class="muted piccolo">{{ baseTxt(r.corrente.puntualita.valutabili, r.corrente.concluse) }}</span>
                    <div class="delta piccolo" [class.su]="tono(r.corrente.puntualita.pctInOrario, r.confronto.puntualita.pctInOrario, 1) === 'bene'" [class.giu]="tono(r.corrente.puntualita.pctInOrario, r.confronto.puntualita.pctInOrario, 1) === 'male'">{{ deltaPp(r.corrente.puntualita.pctInOrario, r.confronto.puntualita.pctInOrario) }}</div></td>
                  <td class="num">{{ minTxt(r.corrente.puntualita.ritardoMedioMin) }}
                    <div class="delta piccolo" [class.su]="tono(r.corrente.puntualita.ritardoMedioMin, r.confronto.puntualita.ritardoMedioMin, -1) === 'bene'" [class.giu]="tono(r.corrente.puntualita.ritardoMedioMin, r.confronto.puntualita.ritardoMedioMin, -1) === 'male'">{{ deltaTxt(r.corrente.puntualita.ritardoMedioMin, r.confronto.puntualita.ritardoMedioMin, false, ' min') }}</div></td>
                  <td class="num">{{ minTxt(r.corrente.tempoMedioMin) }}
                    <div class="delta piccolo">{{ deltaTxt(r.corrente.tempoMedioMin, r.confronto.tempoMedioMin, false, ' min') }}</div></td>
                  <td class="num">{{ kmTxt(r.corrente.kmMedi) }}
                    <div class="delta piccolo">{{ deltaTxt(r.corrente.kmMedi, r.confronto.kmMedi, false, ' km') }}</div></td>
                </tr>
                @if (espansa() === 't:' + r.modello) {
                  <tr class="tendina"><td colspan="11">
                    <div class="tendina-corpo">
                      <table class="compatta confronto-tab">
                        <thead><tr><th></th><th class="num">{{ intervallo(d.periodo.da, d.periodo.a) }}</th><th class="num">{{ intervallo(d.confronto.da, d.confronto.a) }}</th><th class="num">Δ</th></tr></thead>
                        <tbody>
                          @for (v of vociTipologia(r); track v.k) {
                            <tr><td>{{ 'statistiche.kpi.' + v.k | translate }}</td><td class="num strong">{{ v.cur }}</td><td class="num muted">{{ v.prev }}</td><td class="num delta" [class.su]="v.tono === 'bene'" [class.giu]="v.tono === 'male'">{{ v.delta }}</td></tr>
                          }
                        </tbody>
                      </table>
                      <div class="tendina-azioni">
                        <button type="button" class="act primary" (click)="vaiConsegne({ pricingModel: r.modello }); $event.stopPropagation()">{{ 'statistiche.tendina.apriConsegne' | translate }}</button>
                      </div>
                    </div>
                  </td></tr>
                }
              }
            </tbody>
            <tfoot><tr>
              <td class="col-id strong">{{ 'statistiche.tipologia.totale' | translate }}</td>
              <td class="num strong">{{ num(d.totale.corrente.totali) }}</td>
              <td class="num delta">{{ deltaTxt(d.totale.corrente.totali, d.totale.confronto.totali) }}</td>
              <td class="num strong">{{ num(d.totale.corrente.concluse) }}</td>
              <td class="num">{{ pctTxt(d.totale.corrente.tassoNonConsegnate) }}</td>
              <td class="num">{{ pctTxt(d.totale.corrente.tassoAnnullate) }}</td>
              <td class="num">{{ euroTxt(d.totale.corrente.prezzoMedio) }}<div class="delta piccolo">{{ deltaTxt(d.totale.corrente.prezzoMedio, d.totale.confronto.prezzoMedio, false, ' €') }}</div></td>
              <td class="num">{{ pctTxt(d.totale.corrente.puntualita.pctInOrario) }}<div class="delta piccolo">{{ deltaPp(d.totale.corrente.puntualita.pctInOrario, d.totale.confronto.puntualita.pctInOrario) }}</div></td>
              <td class="num">{{ minTxt(d.totale.corrente.puntualita.ritardoMedioMin) }}<div class="delta piccolo">{{ deltaTxt(d.totale.corrente.puntualita.ritardoMedioMin, d.totale.confronto.puntualita.ritardoMedioMin, false, ' min') }}</div></td>
              <td class="num">{{ minTxt(d.totale.corrente.tempoMedioMin) }}<div class="delta piccolo">{{ deltaTxt(d.totale.corrente.tempoMedioMin, d.totale.confronto.tempoMedioMin, false, ' min') }}</div></td>
              <td class="num">{{ kmTxt(d.totale.corrente.kmMedi) }}<div class="delta piccolo">{{ deltaTxt(d.totale.corrente.kmMedi, d.totale.confronto.kmMedi, false, ' km') }}</div></td>
            </tr></tfoot>
          </table>
        </div>
        <p class="muted piccolo">{{ 'statistiche.tipologia.nota' | translate }}</p>
      </section>

      <!-- Economia (Finanza) -->
      <section class="card blocco">
        <h2>{{ 'statistiche.economia.titolo' | translate }}</h2>
        @if (d.economia.disponibile) {
          <div class="numeri">
            @for (t of economia(); track t.chiave) {
              <div class="numero">
                <span class="k">{{ 'statistiche.kpi.' + t.chiave | translate }}</span>
                <span class="v">{{ t.valore }}</span>
                <span class="delta" [class.su]="t.tono === 'bene'" [class.giu]="t.tono === 'male'">{{ t.delta }}</span>
                <span class="base">{{ t.base }}</span>
              </div>
            }
          </div>
          <p class="muted piccolo">{{ 'statistiche.economia.nota' | translate: { righe: num(d.economia.corrente.righe), stimate: num(d.economia.corrente.stimate), anomalie: num(d.economia.corrente.anomalie) } }}</p>
        } @else {
          <p class="muted">{{ 'statistiche.economia.nd' | translate }} <span class="piccolo">({{ d.economia.motivo }})</span></p>
        }
      </section>

      <!-- ⭐ 08/09/2026 (regola utente: «in statistiche mostrami anche quanti prodotti vanno
           in automatico e quanti sono inseriti manualmente»).
           È la misura di quanto lavora l'automatismo: ogni patto di riconciliazione scritto
           sposta righe da «a mano» ad «automatica», e qui si vede se sta succedendo. -->
      @if (d.smistamento; as sm) {
        <section class="card blocco">
          <h2>{{ 'statistiche.smistamento.titolo' | translate }}</h2>
          <div class="numeri">
            <div class="numero">
              <span class="k">{{ 'statistiche.smistamento.auto' | translate }}</span>
              <span class="v">{{ num(sm.corrente.auto) }}</span>
              <span class="delta" [class.su]="sm.corrente.percentualeAuto > sm.confronto.percentualeAuto"
                    [class.giu]="sm.corrente.percentualeAuto < sm.confronto.percentualeAuto">
                {{ sm.corrente.percentualeAuto }}% · {{ 'statistiche.smistamento.prima' | translate }} {{ sm.confronto.percentualeAuto }}%
              </span>
              <span class="base">{{ 'statistiche.smistamento.suSmistate' | translate: { n: num(sm.corrente.auto + sm.corrente.mano) } }}</span>
            </div>
            <div class="numero">
              <span class="k">{{ 'statistiche.smistamento.mano' | translate }}</span>
              <span class="v">{{ num(sm.corrente.mano) }}</span>
              <span class="delta">{{ num(sm.confronto.mano) }} {{ 'statistiche.smistamento.prima' | translate }}</span>
              <span class="base">{{ 'statistiche.smistamento.manoBase' | translate }}</span>
            </div>
            <div class="numero">
              <span class="k">{{ 'statistiche.smistamento.fuori' | translate }}</span>
              <span class="v">{{ num(sm.corrente.fuori) }}</span>
              <span class="delta">{{ num(sm.confronto.fuori) }} {{ 'statistiche.smistamento.prima' | translate }}</span>
              <span class="base">{{ 'statistiche.smistamento.fuoriBase' | translate }}</span>
            </div>
          </div>
          <!-- Il numero da solo non dice cosa fare: il motivo sì. Le prime voci di
               «a mano» sono la lista di quello che si può automatizzare. -->
          @if (sm.corrente.motivi.length) {
            <table class="compatta motivi-smist">
              <thead><tr>
                <th>{{ 'statistiche.smistamento.motivo' | translate }}</th>
                <th>{{ 'statistiche.smistamento.famiglia' | translate }}</th>
                <th class="num">{{ 'statistiche.smistamento.quante' | translate }}</th>
                <!-- ⭐ 09/09/2026 (regola utente: «dammi per questo anche la %»).
                     Il conteggio da solo non dice il peso: 5 su 16 è un terzo del
                     lavoro a mano, 5 su 500 è rumore. La base è la stessa della
                     percentuale in testata — le consegne PASSATE dallo smistamento
                     (auto + mano) — così i due numeri non raccontano storie diverse.
                     I «fuori smistamento» non entrano, di là come di qua. -->
                <th class="num">{{ 'statistiche.smistamento.peso' | translate }}</th>
              </tr></thead>
              <tbody>
                @for (m of sm.corrente.motivi; track m.motivo) {
                  <tr>
                    <td>{{ m.motivo }}</td>
                    <td><span class="fam" [class.f-auto]="m.famiglia === 'auto'" [class.f-mano]="m.famiglia === 'mano'">{{ ('statistiche.smistamento.f_' + m.famiglia) | translate }}</span></td>
                    <td class="num">{{ num(m.n) }}</td>
                    <td class="num muted">{{ pesoMotivo(m.n, sm.corrente.auto + sm.corrente.mano) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
          <p class="muted piccolo">{{ 'statistiche.smistamento.nota' | translate }}</p>
        </section>
      }

      <!-- Classifiche + stati -->
      <div class="griglia-3">
        @for (k of ['partner', 'valet', 'province']; track k) {
          <section class="card blocco">
            <h2>{{ 'statistiche.top.' + k | translate }}</h2>
            <div class="scorri"><table class="compatta classifica">
              <thead><tr>
                <th class="sortable" (click)="ordinaLista(k, 'nome')">{{ 'statistiche.top.nome' | translate }}<span class="sort-ind">{{ segnoLista(k, 'nome') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'corrente')">{{ 'statistiche.top.consegne' | translate }}<span class="sort-ind">{{ segnoLista(k, 'corrente') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'pctDelTotale')">%<span class="sort-ind">{{ segnoLista(k, 'pctDelTotale') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'delta')">Δ<span class="sort-ind">{{ segnoLista(k, 'delta') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'pctInOrario')">{{ 'statistiche.top.puntuali' | translate }}<span class="sort-ind">{{ segnoLista(k, 'pctInOrario') }}</span></th>
              </tr></thead>
              <tbody>
                @for (r of righeOrdinate(k, d.top[k].top); track r.id) {
                  <tr class="row-link" [class.aperta]="espansa() === k + ':' + r.id" tabindex="0" (click)="espandi(k + ':' + r.id)" (keydown.enter)="espandi(k + ':' + r.id)">
                    <td>{{ r.nome }}</td>
                    <td class="num">{{ num(r.corrente) }}</td>
                    <td class="num muted">{{ pctTxt(r.pctDelTotale) }}</td>
                    <td class="num delta">{{ deltaTxt(r.corrente, r.confronto, true) }}</td>
                    <td class="num">{{ r.pctInOrario != null ? pctTxt(r.pctInOrario) : ('statistiche.top.baseBassa' | translate: { n: r.puntN }) }}</td>
                  </tr>
                  @if (espansa() === k + ':' + r.id) {
                    <tr class="tendina"><td colspan="5">
                      <div class="tendina-corpo">
                        <dl>
                          <dt>{{ 'statistiche.top.consegne' | translate }}</dt><dd>{{ num(r.corrente) }} · {{ 'statistiche.prima' | translate: { v: num(r.confronto) } }} · {{ num(r.concluse) }} {{ 'statistiche.tendina.concluse' | translate }}</dd>
                          <dt>{{ 'statistiche.top.puntuali' | translate }}</dt><dd>{{ r.pctInOrario != null ? pctTxt(r.pctInOrario) : 'n/d' }} · {{ 'statistiche.tendina.suValutabili' | translate: { n: num(r.puntN), r: num(r.ritardo) } }}</dd>
                        </dl>
                        <div class="tendina-azioni">
                          @if (k === 'partner') { <button type="button" class="act primary" (click)="vai(['/partners', r.id]); $event.stopPropagation()">{{ 'statistiche.tendina.apriPartner' | translate }}</button> <button type="button" class="act" (click)="vaiConsegne({ partnerId: r.id }); $event.stopPropagation()">{{ 'statistiche.tendina.apriConsegne' | translate }}</button> }
                          @else if (k === 'valet') { <button type="button" class="act primary" (click)="vai(['/valets', r.id]); $event.stopPropagation()">{{ 'statistiche.tendina.apriValet' | translate }}</button> }
                          @else { <button type="button" class="act primary" (click)="vaiTop(k, r); $event.stopPropagation()">{{ 'statistiche.tendina.apriConsegne' | translate }}</button> }
                        </div>
                      </div>
                    </td></tr>
                  }
                }
                @if (d.top[k].altri > 0) {
                  <tr class="muted"><td>{{ 'statistiche.top.altri' | translate: { n: d.top[k].altri } }}</td><td class="num">{{ num(d.top[k].altriConsegne) }}</td><td class="num">{{ pctTxt(pct(d.top[k].altriConsegne, d.top[k].totale)) }}</td><td></td><td></td></tr>
                }
              </tbody>
            </table></div>
          </section>
        }
        <section class="card blocco">
          <h2>{{ 'statistiche.stati.titolo' | translate }}</h2>
          <div class="scorri"><table class="compatta classifica">
            <thead><tr>
              <th class="sortable" (click)="ordinaLista('stati', 'stato')">{{ 'statistiche.stati.stato' | translate }}<span class="sort-ind">{{ segnoLista('stati', 'stato') }}</span></th>
              <th class="num sortable" (click)="ordinaLista('stati', 'corrente')">{{ 'statistiche.stati.n' | translate }}<span class="sort-ind">{{ segnoLista('stati', 'corrente') }}</span></th>
              <th class="num">%</th>
              <th class="num sortable" (click)="ordinaLista('stati', 'delta')">Δ<span class="sort-ind">{{ segnoLista('stati', 'delta') }}</span></th>
            </tr></thead>
            <tbody>
              @for (s of righeOrdinate('stati', d.perStato); track s.stato) {
                <tr class="row-link" [class.aperta]="espansa() === 's:' + s.stato" tabindex="0" (click)="espandi('s:' + s.stato)" (keydown.enter)="espandi('s:' + s.stato)">
                  <td><span class="pill" [class]="'pill s-' + s.stato"><span class="dot" [class]="'dot s-' + s.stato"></span>{{ 'status.delivery.' + s.stato | translate }}</span></td>
                  <td class="num">{{ num(s.corrente) }}</td>
                  <td class="num muted">{{ pctTxt(pct(s.corrente, d.totale.corrente.totali)) }}</td>
                  <td class="num delta">{{ deltaTxt(s.corrente, s.confronto, true) }}</td>
                </tr>
                @if (espansa() === 's:' + s.stato) {
                  <tr class="tendina"><td colspan="4">
                    <div class="tendina-corpo">
                      <p class="muted piccolo">{{ num(s.corrente) }} · {{ 'statistiche.prima' | translate: { v: num(s.confronto) } }}</p>
                      <div class="tendina-azioni"><button type="button" class="act primary" (click)="vaiConsegne({ status: s.stato }); $event.stopPropagation()">{{ 'statistiche.tendina.apriConsegne' | translate }}</button></div>
                    </div>
                  </td></tr>
                }
              }
            </tbody>
          </table></div>
        </section>
      </div>
      }
    }
  `,
  styles: [`
    .sub { color: var(--text-secondary); margin: 4px 0 0; }
    /* Segmented come in Consegne (stessa classe, stesso aspetto): sfondo incassato, pillola nera per la voce attiva. */
    .quick-tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-sunken, #ececef); max-width: 100%; overflow-x: auto; }
    .quick-tab { border: 0; background: transparent; border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13px; font-weight: 550; color: var(--text-secondary); cursor: pointer; white-space: nowrap; flex: 0 0 auto; }
    .quick-tab:hover { color: var(--text-primary); }
    .quick-tab.active { background: var(--surface, #fff); color: var(--text-primary); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12); font-weight: 600; }
    .quick-tab:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
    .filtri { display: flex; flex-wrap: wrap; gap: 18px 28px; align-items: flex-end; padding: 14px 18px; margin-bottom: 16px; }
    .gruppo { display: flex; flex-direction: column; gap: 6px; }
    .eti { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); font-weight: 600; }
    .date { flex-basis: 100%; margin: 0; font-size: 12.5px; }
    .field.compatto { padding: 6px 10px; font-size: 13px; min-width: 190px; }
    .partner-scelta { position: relative; }
    .apri { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; text-align: left; background: var(--surface); }
    .freccia { color: var(--text-tertiary); }
    .overlay-trasparente { position: fixed; inset: 0; z-index: 20; }
    .elenco-partner { position: absolute; z-index: 21; top: calc(100% + 6px); left: 0; width: 320px; max-width: 90vw; padding: 10px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
    .elenco-partner .righe { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
    .riga-partner { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 8px; font-size: 13.5px; cursor: pointer; }
    .riga-partner:hover { background: var(--fill, rgba(120,120,128,.08)); }
    .azioni-elenco { display: flex; justify-content: space-between; gap: 8px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .chip-filtro { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--separator, var(--hairline)); background: var(--fill, rgba(120,120,128,.08)); border-radius: 980px; padding: 3px 9px; font-size: 12.5px; cursor: pointer; }
    .chip-filtro .x { color: var(--text-secondary); }
    .tessere { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; margin-bottom: 16px; }
    .stat.kpi { display: flex; flex-direction: column; gap: 3px; padding: 16px 18px; background: var(--surface); border: 1px solid var(--hairline); border-radius: 14px; }
    .stat .k, .numero .k { font-size: 12.5px; color: var(--text-tertiary); }
    .stat .v, .numero .v { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .delta { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
    .delta.su { color: var(--green); } .delta.giu { color: var(--red); }
    .base { font-size: 12px; color: var(--text-tertiary); }
    .blocco { padding: 16px 18px; margin-bottom: 16px; }
    .blocco h2 { font-size: 16px; margin: 0 0 12px; letter-spacing: -0.01em; }
    .barra.sottile { height: 16px; margin-top: 2px; opacity: .75; } .barra.sottile .seg { font-size: 11px; }
    .confronto-riga { margin: 4px 0 8px; }
    .prima { font-size: 12.5px; font-weight: 400; letter-spacing: 0; }
    td .delta.piccolo { font-size: 11.5px; line-height: 1.2; }
    tr.aperta td { background: var(--fill, rgba(120,120,128,.06)); }
    tr.tendina > td { background: var(--surface-sunken, #f5f5f7); padding: 12px 16px; border-bottom: 1px solid var(--hairline); }
    .tendina-corpo { display: flex; flex-wrap: wrap; gap: 14px 28px; align-items: flex-start; }
    .tendina-corpo dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; font-size: 13px; }
    .tendina-corpo dt { color: var(--text-tertiary); } .tendina-corpo dd { margin: 0; }
    .tendina-azioni { display: flex; gap: 8px; align-items: center; margin-left: auto; }
    .confronto-tab { max-width: 560px; }
    .barra { display: flex; height: 30px; border-radius: 8px; overflow: hidden; background: var(--fill, rgba(120,120,128,.08)); margin-bottom: 8px; }
    .seg { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; min-width: 0; }
    .seg.ok { background: var(--green); } .seg.presto { background: var(--amber); } .seg.tardi { background: var(--red); }
    .numeri { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px 18px; margin-top: 12px; }
    .numero { display: flex; flex-direction: column; gap: 2px; }
    /* ⭐ 06/09 (segnalazione utente, screenshot): con quattro tessere da 280px le cinque colonne
       non ci stavano — la Δ andava a capo e «In orario» finiva tagliata dal bordo. Ora la
       tessera nasce larga per le sue colonne (2×2 su un desktop normale), i numeri non vanno
       mai a capo, e sotto i 480px la tabella scorre dentro la tessera (Libro UX: le tabelle
       larghe scorrono nel loro contenitore, la pagina no). */
    .griglia-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr)); gap: 14px; }
    .griglia-3 .card { min-width: 0; }
    .scorri { overflow-x: auto; max-width: 100%; }
    table.classifica th.num, table.classifica td.num, table.classifica td.delta { white-space: nowrap; }
    table.classifica th:first-child, table.classifica td:first-child { min-width: 120px; }
    table.classifica th.num, table.classifica td.num { padding-left: 6px; padding-right: 6px; width: 1%; }
    table.compatta { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    table.compatta th, table.compatta td { padding: 6px 8px; border-bottom: 1px solid var(--hairline); text-align: left; }
    table.compatta th.num, table.compatta td.num { text-align: right; font-variant-numeric: tabular-nums; }
    /* Lo smistamento: la famiglia si legge a colpo d'occhio, il motivo per esteso puo' andare a capo. */
    table.motivi-smist { margin-top: 12px; }
    table.motivi-smist td:first-child { max-width: 420px; }
    .fam { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px;
           border: 1px solid var(--hairline); color: var(--text-secondary); white-space: nowrap; }
    .fam.f-auto { border-color: rgba(52,199,89,.45); color: #248A3D; }
    .fam.f-mano { border-color: rgba(255,159,10,.5); color: #A56100; }
    tfoot td { border-top: 1px solid var(--hairline-strong, var(--hairline)); background: var(--surface); }
    .muted { color: var(--text-secondary); } .piccolo { font-size: 12.5px; } .strong { font-weight: 600; }
    .ko { color: var(--red); }
    .link-btn { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--blue); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
    .ritardi { margin-top: 12px; border-top: 1px solid var(--hairline); padding-top: 10px; }
    .row-link { cursor: pointer; }
    .row-link:hover td { background: var(--fill, rgba(120,120,128,.06)); }
    .row-link:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
    th.sortable { cursor: pointer; user-select: none; } .sort-ind { margin-left: 4px; color: var(--text-tertiary); }
    @media (max-width: 800px) { .tessere { grid-template-columns: repeat(2, 1fr); } .griglia-3 { grid-template-columns: 1fr; } }
  `],
})
export class StatisticheComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /**
   * Il peso di un motivo sul totale passato dallo smistamento. Se la base è
   * zero non si scrive «0%» — che sarebbe una misura — ma un trattino: non
   * c'è nulla su cui calcolare.
   */
  pesoMotivo(n: number, base: number): string {
    if (!base) return '—';
    return (Math.round((n / base) * 1000) / 10).toLocaleString('it-IT') + '%';
  }

  private readonly translate = inject(TranslateService);

  readonly PERIODI: Periodo[] = ['oggi', 'settimana', 'mese', 'mese-scorso', 'trimestre', 'anno'];
  readonly CONFRONTI: Confronto[] = ['precedente', 'anno-prima'];
  readonly COLONNE = [
    { chiave: 'nome' }, { chiave: 'consegne' }, { chiave: 'delta' }, { chiave: 'concluse' }, { chiave: 'nonConsegnate' }, { chiave: 'annullate' },
    { chiave: 'prezzoMedio' }, { chiave: 'puntualita' }, { chiave: 'ritardoMedio' }, { chiave: 'tempoMedio' }, { chiave: 'kmMedi' },
  ];

  readonly periodo = signal<Periodo>('mese');
  readonly confronto = signal<Confronto>('precedente');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly dati = signal<any | null>(null);
  readonly ordinamento = signal<{ chiave: string; verso: 1 | -1 }>({ chiave: 'consegne', verso: -1 });
  // ⭐ 06/09/2026: filtri (tipologia, provincia, partner) — nell'URL come il periodo.
  readonly serviceTypeId = signal<string>('');
  readonly MODELLI = ['VENDITA', 'PREZZO_FISSO', 'A_ORA', 'MAGAZZINO', 'CORPORATE'];
  readonly pricingModel = signal<string>('');
  /** ⭐ 06/09/2026 (regola utente): il dettaglio si apre in una TENDINA sotto la riga, senza cambiare pagina. */
  readonly espansa = signal<string | null>(null);
  espandi(chiave: string): void { this.espansa.set(this.espansa() === chiave ? null : chiave); }
  /** Le voci corrente/confronto di una macrotipologia, per la tendina. */
  vociTipologia(r: any): { k: string; cur: string; prev: string; delta: string; tono: string }[] {
    const c = r.corrente, p = r.confronto;
    return [
      { k: 'consegne', cur: this.num(c.totali), prev: this.num(p.totali), delta: this.deltaTxt(c.totali, p.totali, true), tono: this.tono(c.totali, p.totali, 1) },
      { k: 'concluse', cur: this.num(c.concluse), prev: this.num(p.concluse), delta: this.deltaTxt(c.concluse, p.concluse, true), tono: this.tono(c.concluse, p.concluse, 1) },
      { k: 'prezzoMedio', cur: this.euroTxt(c.prezzoMedio), prev: this.euroTxt(p.prezzoMedio), delta: this.deltaTxt(c.prezzoMedio, p.prezzoMedio, false, ' €'), tono: 'neutro' },
      { k: 'puntualita', cur: this.pctTxt(c.puntualita.pctInOrario), prev: this.pctTxt(p.puntualita.pctInOrario), delta: this.deltaPp(c.puntualita.pctInOrario, p.puntualita.pctInOrario), tono: this.tono(c.puntualita.pctInOrario, p.puntualita.pctInOrario, 1) },
      { k: 'ritardoMedio', cur: this.minTxt(c.puntualita.ritardoMedioMin), prev: this.minTxt(p.puntualita.ritardoMedioMin), delta: this.deltaTxt(c.puntualita.ritardoMedioMin, p.puntualita.ritardoMedioMin, false, ' min'), tono: this.tono(c.puntualita.ritardoMedioMin, p.puntualita.ritardoMedioMin, -1) },
      { k: 'anticipoMedio', cur: this.minTxt(c.puntualita.anticipoMedioMin), prev: this.minTxt(p.puntualita.anticipoMedioMin), delta: this.deltaTxt(c.puntualita.anticipoMedioMin, p.puntualita.anticipoMedioMin, false, ' min'), tono: 'neutro' },
      { k: 'tempoMedio', cur: this.minTxt(c.tempoMedioMin), prev: this.minTxt(p.tempoMedioMin), delta: this.deltaTxt(c.tempoMedioMin, p.tempoMedioMin, false, ' min'), tono: 'neutro' },
      { k: 'kmMedi', cur: this.kmTxt(c.kmMedi), prev: this.kmTxt(p.kmMedi), delta: this.deltaTxt(c.kmMedi, p.kmMedi, false, ' km'), tono: 'neutro' },
      { k: 'guasti', cur: this.pctTxt(c.tassoNonConsegnate), prev: this.pctTxt(p.tassoNonConsegnate), delta: this.deltaPp(c.tassoNonConsegnate, p.tassoNonConsegnate), tono: this.tono(c.tassoNonConsegnate, p.tassoNonConsegnate, -1) },
      { k: 'annullate', cur: this.pctTxt(c.tassoAnnullate), prev: this.pctTxt(p.tassoAnnullate), delta: this.deltaPp(c.tassoAnnullate, p.tassoAnnullate), tono: this.tono(c.tassoAnnullate, p.tassoAnnullate, -1) },
    ];
  }
  readonly provinceId = signal<string>('');
  readonly partnerIds = signal<string[]>([]);
  readonly servizi = signal<{ id: string; name: string }[]>([]);
  readonly province = signal<{ id: string; code: string; name: string }[]>([]);
  readonly partners = signal<{ id: string; insegna: string }[]>([]);
  readonly elencoPartnerAperto = signal(false);
  readonly valetIds = signal<string[]>([]);
  readonly valets = signal<{ id: string; nome: string }[]>([]);
  readonly elencoValetAperto = signal(false);
  readonly cercaValet = signal('');
  readonly valetFiltrati = computed(() => {
    const q = this.cercaValet().trim().toLowerCase();
    const scelti = new Set(this.valetIds());
    return this.valets()
      .filter((v) => !q || v.nome.toLowerCase().includes(q))
      .sort((a, b) => Number(scelti.has(b.id)) - Number(scelti.has(a.id)) || a.nome.localeCompare(b.nome, 'it'))
      .slice(0, 200);
  });
  nomeValet(id: string): string { return this.valets().find((v) => v.id === id)?.nome ?? this.dati()?.filtri?.valets?.map((v: any) => ({ id: v.id, nome: `${v.firstName} ${v.lastName}` })).find((v: any) => v.id === id)?.nome ?? id; }
  togliOMettiValet(id: string): void {
    const s = new Set(this.valetIds());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.valetIds.set([...s]);
    this.applicaFiltri();
  }
  readonly cercaPartner = signal('');
  readonly partnerFiltrati = computed(() => {
    const q = this.cercaPartner().trim().toLowerCase();
    const scelti = new Set(this.partnerIds());
    return this.partners()
      .filter((p) => !q || p.insegna.toLowerCase().includes(q))
      .sort((a, b) => Number(scelti.has(b.id)) - Number(scelti.has(a.id)) || a.insegna.localeCompare(b.insegna, 'it'))
      .slice(0, 200);
  });
  nomePartner(id: string): string { return this.partners().find((p) => p.id === id)?.insegna ?? this.dati()?.filtri?.partners?.find((p: any) => p.id === id)?.insegna ?? id; }
  togliOMettiPartner(id: string): void {
    const s = new Set(this.partnerIds());
    if (s.has(id)) s.delete(id); else s.add(id);
    this.partnerIds.set([...s]);
    this.applicaFiltri();
  }
  applicaFiltri(): void { this.scegli(this.periodo(), this.confronto()); }
  private caricaElenchi(): void {
    this.http.get<any[]>(`${environment.apiUrl}/service-types`).subscribe({ next: (r) => this.servizi.set((Array.isArray(r) ? r : (r as any).items ?? []).map((s: any) => ({ id: s.id, name: s.name })).sort((a: any, b: any) => a.name.localeCompare(b.name, 'it'))), error: () => {} });
    this.http.get<any[]>(`${environment.apiUrl}/provinces`).subscribe({ next: (r) => this.province.set((Array.isArray(r) ? r : (r as any).items ?? []).map((p: any) => ({ id: p.id, code: p.code, name: p.name })).sort((a: any, b: any) => a.name.localeCompare(b.name, 'it'))), error: () => {} });
    this.http.get<any>(`${environment.apiUrl}/valets`).subscribe({ next: (r) => this.valets.set((Array.isArray(r) ? r : r?.items ?? []).filter((v: any) => v.active !== false && !v.placeholder).map((v: any) => ({ id: v.id, nome: `${v.lastName ?? ''} ${v.firstName ?? ''}`.trim() }))), error: () => {} });
    this.http.get<any>(`${environment.apiUrl}/partners`, { params: { pageSize: 500 } }).subscribe({ next: (r) => this.partners.set((Array.isArray(r) ? r : r?.items ?? []).filter((p: any) => p.active !== false).map((p: any) => ({ id: p.id, insegna: p.insegna }))), error: () => {} });
  }

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const p = q.get('periodo') as Periodo | null;
    const c = q.get('confronto') as Confronto | null;
    if (p && this.PERIODI.includes(p)) this.periodo.set(p);
    if (c && this.CONFRONTI.includes(c)) this.confronto.set(c);
    this.serviceTypeId.set(q.get('serviceTypeId') ?? '');
    this.pricingModel.set(this.MODELLI.includes(q.get('pricingModel') ?? '') ? (q.get('pricingModel') as string) : '');
    this.provinceId.set(q.get('provinceId') ?? '');
    this.partnerIds.set((q.get('partnerIds') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
    this.valetIds.set((q.get('valetIds') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
    this.caricaElenchi();
    this.carica();
  }

  scegli(p: Periodo, c: Confronto): void {
    this.periodo.set(p); this.confronto.set(c);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { periodo: p, confronto: c, pricingModel: this.pricingModel() || null, serviceTypeId: this.serviceTypeId() || null, provinceId: this.provinceId() || null, partnerIds: this.partnerIds().length ? this.partnerIds().join(',') : null, valetIds: this.valetIds().length ? this.valetIds().join(',') : null },
      replaceUrl: true,
    });
    this.carica();
  }

  private carica(): void {
    this.ritardiAperti.set(false); this.ritardi.set(null);
    this.loading.set(true); this.error.set(null);
    const params: Record<string, string> = { periodo: this.periodo(), confronto: this.confronto() };
    if (this.serviceTypeId()) params['serviceTypeId'] = this.serviceTypeId();
    if (this.pricingModel()) params['pricingModel'] = this.pricingModel();
    if (this.provinceId()) params['provinceId'] = this.provinceId();
    if (this.partnerIds().length) params['partnerIds'] = this.partnerIds().join(',');
    if (this.valetIds().length) params['valetIds'] = this.valetIds().join(',');
    this.espansa.set(null);
    this.http.get<any>(`${environment.apiUrl}/statistiche`, { params }).subscribe({
      next: (d) => { this.dati.set(d); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? this.translate.instant('common.loadError')); },
    });
  }

  // ---- formati (it-IT) ----
  num(n: number | null | undefined): string { return n == null ? '—' : n.toLocaleString('it-IT'); }
  pct(parte: number, tot: number): number | null { return tot > 0 ? Math.round((parte / tot) * 1000) / 10 : null; }
  pctTxt(p: number | null | undefined): string { return p == null ? 'n/d' : p.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
  euroTxt(v: number | null | undefined): string { return v == null ? 'n/d' : v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  kmTxt(v: number | null | undefined): string { return v == null ? 'n/d' : v.toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' km'; }
  minTxt(v: number | null | undefined): string {
    if (v == null) return 'n/d';
    const m = Math.round(v);
    return m > 90 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  }
  intervallo(da: string, a: string): string {
    const f = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    return da === a ? f(da) : `${f(da)} – ${f(a)}`;
  }
  ora(iso: string): string { return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
  baseTxt(n: number, m: number): string { return n < m ? this.translate.instant('statistiche.base', { n: this.num(n), m: this.num(m) }) : ''; }

  /** Il Δ scritto: freccia + assoluto (+ % se ha senso). Precedente 0/n/d → «—». */
  deltaTxt(cur: number | null | undefined, prev: number | null | undefined, interi = false, unita = ''): string {
    if (cur == null || prev == null || prev === 0) return '—';
    const d = cur - prev;
    const freccia = d > 0 ? '▲' : d < 0 ? '▼' : '▬';
    const ass = interi ? Math.abs(d).toLocaleString('it-IT') : Math.abs(d).toLocaleString('it-IT', { maximumFractionDigits: 2 });
    const perc = Math.abs((d / prev) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 });
    return `${freccia} ${d < 0 ? '−' : '+'}${ass}${unita} · ${d < 0 ? '−' : '+'}${perc}%`;
  }
  /** Punti percentuali per i tassi. */
  deltaPp(cur: number | null | undefined, prev: number | null | undefined): string {
    if (cur == null || prev == null) return '—';
    const d = Math.round((cur - prev) * 10) / 10;
    return `${d > 0 ? '▲ +' : d < 0 ? '▼ −' : '▬ '}${Math.abs(d).toLocaleString('it-IT')} p.p.`;
  }
  tono(cur: number | null | undefined, prev: number | null | undefined, verso: 1 | -1 | 0): 'bene' | 'male' | 'neutro' {
    if (cur == null || prev == null || verso === 0 || cur === prev) return 'neutro';
    return (cur > prev) === (verso === 1) ? 'bene' : 'male';
  }

  readonly tessere = computed(() => {
    const d = this.dati(); if (!d) return [];
    const T = d.totale.corrente, P = d.totale.confronto;
    const eco = d.economia;
    const su = (n: number, m: number) => this.translate.instant('statistiche.su', { n: this.num(n), m: this.num(m) });
    const guastiCur = this.pct(T.nonConsegnate + T.annullate, T.totali), guastiPrev = this.pct(P.nonConsegnate + P.annullate, P.totali);
    return [
      { chiave: 'consegne', valore: this.num(T.totali), delta: this.deltaTxt(T.totali, P.totali, true), tono: this.tono(T.totali, P.totali, VERSO['consegne']), base: this.translate.instant('statistiche.baseConsegne', { concluse: this.num(T.concluse), vs: this.num(P.totali) }) },
      { chiave: 'prezzoMedio', valore: this.euroTxt(T.prezzoMedio), delta: this.deltaTxt(T.prezzoMedio, P.prezzoMedio, false, ' €'), tono: 'neutro', base: this.coperturaTxt(T.prezzoN, T.concluse) },
      { chiave: 'feeMedia', valore: eco.disponibile ? this.euroTxt(eco.corrente.feeMedia) + (eco.corrente.feePct != null ? ` · ${this.pctTxt(eco.corrente.feePct)}` : '') : 'n/d', delta: eco.disponibile ? this.deltaTxt(eco.corrente.feeMedia, eco.confronto.feeMedia, false, ' €') : '—', tono: eco.disponibile ? this.tono(eco.corrente.feeMedia, eco.confronto.feeMedia, 1) : 'neutro', base: eco.disponibile ? su(eco.corrente.righe, T.concluse) : this.translate.instant('statistiche.economia.ndBreve') },
      { chiave: 'margineMedio', valore: eco.disponibile ? this.euroTxt(eco.corrente.margineMedio) + (eco.corrente.marginePct != null ? ` · ${this.pctTxt(eco.corrente.marginePct)}` : '') : 'n/d', delta: eco.disponibile ? this.deltaTxt(eco.corrente.margineMedio, eco.confronto.margineMedio, false, ' €') : '—', tono: eco.disponibile ? this.tono(eco.corrente.margineMedio, eco.confronto.margineMedio, 1) : 'neutro', base: eco.disponibile ? su(eco.corrente.righe, T.concluse) : this.translate.instant('statistiche.economia.ndBreve') },
      { chiave: 'puntualita', valore: this.coperturaOk(T.puntualita.valutabili, T.concluse) ? this.pctTxt(T.puntualita.pctInOrario) : 'n/d', delta: this.deltaPp(T.puntualita.pctInOrario, P.puntualita.pctInOrario), tono: this.tono(T.puntualita.pctInOrario, P.puntualita.pctInOrario, 1), base: this.coperturaTxt(T.puntualita.valutabili, T.concluse) },
      { chiave: 'guasti', valore: this.pctTxt(guastiCur), delta: this.deltaPp(guastiCur, guastiPrev), tono: this.tono(guastiCur, guastiPrev, -1), base: this.translate.instant('statistiche.baseGuasti', { nc: this.num(T.nonConsegnate), an: this.num(T.annullate) }) },
    ];
  });

  readonly tempi = computed(() => {
    const d = this.dati(); if (!d) return [];
    const T = d.totale.corrente, P = d.totale.confronto;
    return [
      { chiave: 'ritardoMedio', prima: this.minTxt(P.puntualita.ritardoMedioMin), valore: this.minTxt(T.puntualita.ritardoMedioMin), delta: this.deltaTxt(T.puntualita.ritardoMedioMin, P.puntualita.ritardoMedioMin, false, ' min'), tono: this.tono(T.puntualita.ritardoMedioMin, P.puntualita.ritardoMedioMin, -1), base: this.translate.instant('statistiche.suRitardi', { n: this.num(T.puntualita.ritardo) }) },
      { chiave: 'anticipoMedio', prima: this.minTxt(P.puntualita.anticipoMedioMin), valore: this.minTxt(T.puntualita.anticipoMedioMin), delta: this.deltaTxt(T.puntualita.anticipoMedioMin, P.puntualita.anticipoMedioMin, false, ' min'), tono: 'neutro', base: this.translate.instant('statistiche.suAnticipi', { n: this.num(T.puntualita.anticipo) }) },
      { chiave: 'tempoMedio', prima: this.minTxt(P.tempoMedioMin), valore: this.coperturaOk(T.tempoN, T.concluse) ? this.minTxt(T.tempoMedioMin) : 'n/d', delta: this.deltaTxt(T.tempoMedioMin, P.tempoMedioMin, false, ' min'), tono: 'neutro', base: this.coperturaTxt(T.tempoN, T.concluse) },
      { chiave: 'kmMedi', prima: this.kmTxt(P.kmMedi), valore: this.coperturaOk(T.kmN, T.concluse) ? this.kmTxt(T.kmMedi) : 'n/d', delta: this.deltaTxt(T.kmMedi, P.kmMedi, false, ' km'), tono: 'neutro', base: this.coperturaTxt(T.kmN, T.concluse) + (T.pctFuoriCitta != null ? ` · ${this.translate.instant('statistiche.fuoriCitta', { p: this.pctTxt(T.pctFuoriCitta) })}` : '') },
      { chiave: 'leadTime', prima: P.leadTimeGiorni == null ? 'n/d' : `${P.leadTimeGiorni.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${this.translate.instant('statistiche.gg')}`, valore: T.leadTimeGiorni == null ? 'n/d' : `${T.leadTimeGiorni.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${this.translate.instant('statistiche.gg')}`, delta: this.deltaTxt(T.leadTimeGiorni, P.leadTimeGiorni, false), tono: 'neutro', base: this.coperturaTxt(T.leadN, T.totali) },
    ];
  });

  readonly economia = computed(() => {
    const d = this.dati(); if (!d?.economia?.disponibile) return [];
    const c = d.economia.corrente, p = d.economia.confronto;
    return [
      { chiave: 'venduto', valore: this.euroTxt(c.venduto), delta: this.deltaTxt(c.venduto, p.venduto, false, ' €'), tono: this.tono(c.venduto, p.venduto, 1), base: this.translate.instant('statistiche.suRighe', { n: this.num(c.righe) }) },
      { chiave: 'pagatoPartner', valore: this.euroTxt(c.pagato), delta: this.deltaTxt(c.pagato, p.pagato, false, ' €'), tono: 'neutro', base: '' },
      { chiave: 'feeTotale', valore: this.euroTxt(c.fee), delta: this.deltaTxt(c.fee, p.fee, false, ' €'), tono: this.tono(c.fee, p.fee, 1), base: this.pctTxt(c.feePct) + ' ' + this.translate.instant('statistiche.delVenduto') },
      { chiave: 'costoValet', valore: this.euroTxt(c.valet), delta: this.deltaTxt(c.valet, p.valet, false, ' €'), tono: 'neutro', base: '' },
      { chiave: 'margineTotale', valore: this.euroTxt(c.margine), delta: this.deltaTxt(c.margine, p.margine, false, ' €'), tono: this.tono(c.margine, p.margine, 1), base: this.pctTxt(c.marginePct) + ' ' + this.translate.instant('statistiche.delVenduto') },
    ];
  });

  // ---- ⭐ 06/09/2026: ordinamento di TUTTE le tabelle e apertura del dettaglio (Libro UX §8) ----
  readonly COL_RITARDI = [
    { chiave: 'code', num: false }, { chiave: 'date', num: false }, { chiave: 'partner', num: false }, { chiave: 'valet', num: false },
    { chiave: 'servizio', num: false }, { chiave: 'fascia', num: false }, { chiave: 'consegnata', num: false }, { chiave: 'ritardoMin', num: true },
  ];
  readonly ordinamenti = signal<Record<string, { chiave: string; verso: 1 | -1 }>>({ ritardi: { chiave: 'ritardoMin', verso: -1 } });
  ordinaLista(nome: string, chiave: string): void {
    const o = this.ordinamenti()[nome];
    const testo = ['nome', 'stato', 'partner', 'valet', 'servizio', 'code', 'date', 'fascia', 'consegnata'].includes(chiave);
    this.ordinamenti.set({ ...this.ordinamenti(), [nome]: o?.chiave === chiave ? { chiave, verso: o.verso === 1 ? -1 : 1 } : { chiave, verso: testo ? 1 : -1 } });
  }
  segnoLista(nome: string, chiave: string): string { const o = this.ordinamenti()[nome]; return o?.chiave === chiave ? (o.verso === 1 ? '↑' : '↓') : ''; }
  righeOrdinate(nome: string, righe: any[]): any[] {
    const o = this.ordinamenti()[nome];
    if (!o || !righe) return righe ?? [];
    const val = (r: any): any => {
      switch (o.chiave) {
        case 'delta': return r.confronto ? (r.corrente - r.confronto) / r.confronto : null;
        case 'fascia': return r.fasciaA ?? null;
        case 'consegnata': return r.deliveredAt ?? null;
        case 'stato': return this.translate.instant('status.delivery.' + r.stato);
        default: return r[o.chiave] ?? null;
      }
    };
    return [...righe].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(String(y), 'it') : Number(x) - Number(y)) * o.verso;
    });
  }
  vai(cmd: any[]): void { this.router.navigate(cmd); }
  /** L'elenco consegne coi filtri della statistica: stesse date, stesso servizio/partner, vista «tutte». */
  vaiConsegne(extra: Record<string, string>): void {
    const d = this.dati(); if (!d) return;
    const q: Record<string, string> = { view: 'tutte', date: d.periodo.da, dateTo: d.periodo.a, ...extra };
    if (this.serviceTypeId() && !extra['serviceTypeId']) q['serviceTypeId'] = this.serviceTypeId();
    if (this.pricingModel() && !extra['pricingModel']) q['pricingModel'] = this.pricingModel();
    if (this.partnerIds().length === 1 && !extra['partnerId']) q['partnerId'] = this.partnerIds()[0];
    this.router.navigate(['/deliveries'], { queryParams: q });
  }
  vaiTop(k: string, r: any): void {
    if (k === 'partner') this.router.navigate(['/partners', r.id]);
    else if (k === 'valet') this.router.navigate(['/valets', r.id]);
    else this.vaiConsegne({ q: String(r.nome).replace(/\s*\([A-Z]{2}\)$/, '') }); // province: l'elenco non ha un filtro provincia, si cerca per nome
  }
  giorno(iso: string): string { return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }); }
  oraDi(iso: string | null): string { return iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '—'; }
  readonly ritardiAperti = signal(false);
  readonly ritardiCaricamento = signal(false);
  readonly ritardi = signal<any | null>(null);
  apriRitardi(): void {
    if (this.ritardiAperti()) { this.ritardiAperti.set(false); return; }
    this.ritardiAperti.set(true); this.ritardiCaricamento.set(true);
    const params: Record<string, string> = { periodo: this.periodo(), confronto: this.confronto() };
    if (this.serviceTypeId()) params['serviceTypeId'] = this.serviceTypeId();
    if (this.pricingModel()) params['pricingModel'] = this.pricingModel();
    if (this.provinceId()) params['provinceId'] = this.provinceId();
    if (this.partnerIds().length) params['partnerIds'] = this.partnerIds().join(',');
    if (this.valetIds().length) params['valetIds'] = this.valetIds().join(',');
    this.http.get<any>(`${environment.apiUrl}/statistiche/ritardi`, { params }).subscribe({
      next: (r) => { this.ritardi.set(r); this.ritardiCaricamento.set(false); },
      error: () => { this.ritardi.set(null); this.ritardiCaricamento.set(false); },
    });
  }

  /** Sotto il 50 % di copertura il numero non si mostra (verdetto UX). */
  coperturaOk(n: number, m: number): boolean { return m > 0 && n / m >= 0.5; }
  coperturaTxt(n: number, m: number): string {
    if (m <= 0) return this.translate.instant('statistiche.nessuna');
    return n >= m
      ? this.translate.instant('statistiche.suTutte', { m: this.num(m) })
      : this.translate.instant('statistiche.copertura', { n: this.num(n), m: this.num(m), senza: this.num(m - n) });
  }

  // ---- tabella per tipologia ----
  ordina(chiave: string): void {
    const o = this.ordinamento();
    this.ordinamento.set(o.chiave === chiave ? { chiave, verso: o.verso === 1 ? -1 : 1 } : { chiave, verso: chiave === 'nome' ? 1 : -1 });
  }
  segno(chiave: string): string { const o = this.ordinamento(); return o.chiave === chiave ? (o.verso === 1 ? '↑' : '↓') : ''; }
  readonly righeTipologia = computed(() => {
    const d = this.dati(); if (!d) return [];
    const { chiave, verso } = this.ordinamento();
    const val = (r: any): number | string | null => {
      switch (chiave) {
        case 'nome': return r.nome;
        case 'consegne': return r.corrente.totali;
        case 'delta': return r.confronto.totali ? (r.corrente.totali - r.confronto.totali) / r.confronto.totali : null;
        case 'concluse': return r.corrente.concluse;
        case 'nonConsegnate': return r.corrente.tassoNonConsegnate;
        case 'annullate': return r.corrente.tassoAnnullate;
        case 'prezzoMedio': return r.corrente.prezzoMedio;
        case 'puntualita': return r.corrente.puntualita.pctInOrario;
        case 'ritardoMedio': return r.corrente.puntualita.ritardoMedioMin;
        case 'tempoMedio': return r.corrente.tempoMedioMin;
        case 'kmMedi': return r.corrente.kmMedi;
        default: return null;
      }
    };
    return [...d.perTipologia].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; // n/d in fondo
      return (typeof x === 'string' ? x.localeCompare(String(y), 'it') : (x as number) - (y as number)) * verso;
    });
  });
}
