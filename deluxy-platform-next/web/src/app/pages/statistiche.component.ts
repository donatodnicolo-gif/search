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
        <select class="field compatto" [ngModel]="serviceTypeId()" (ngModelChange)="serviceTypeId.set($event); applicaFiltri()">
          <option value="">{{ 'statistiche.filtri.tutti' | translate }}</option>
          @for (s of servizi(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
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
                        <tr class="row-link" tabindex="0" (click)="vai(['/deliveries', x.id])" (keydown.enter)="vai(['/deliveries', x.id])">
                          <td class="strong">#{{ x.code }}</td>
                          <td>{{ giorno(x.date) }}</td>
                          <td>{{ x.partner }}</td>
                          <td>{{ x.valet || '—' }}</td>
                          <td>{{ x.servizio }}</td>
                          <td>{{ x.fasciaDa ? x.fasciaDa + '–' : '' }}{{ x.fasciaA }}</td>
                          <td>{{ oraDi(x.deliveredAt) }}</td>
                          <td class="num ko strong">{{ minTxt(x.ritardoMin) }}</td>
                        </tr>
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
              <span class="v">{{ t.valore }}</span>
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
                <tr class="row-link" tabindex="0" (click)="vaiConsegne({ serviceTypeId: r.serviceTypeId })" (keydown.enter)="vaiConsegne({ serviceTypeId: r.serviceTypeId })">
                  <td class="col-id strong">{{ r.nome }} <span class="muted piccolo">· {{ 'enums.servicePricing.' + r.modello | translate }}</span></td>
                  <td class="num">{{ num(r.corrente.totali) }}</td>
                  <td class="num delta" [class.su]="tono(r.corrente.totali, r.confronto.totali, 1) === 'bene'" [class.giu]="tono(r.corrente.totali, r.confronto.totali, 1) === 'male'">{{ deltaTxt(r.corrente.totali, r.confronto.totali) }}</td>
                  <td class="num">{{ num(r.corrente.concluse) }}</td>
                  <td class="num">{{ pctTxt(r.corrente.tassoNonConsegnate) }}</td>
                  <td class="num">{{ pctTxt(r.corrente.tassoAnnullate) }}</td>
                  <td class="num">{{ euroTxt(r.corrente.prezzoMedio) }} <span class="muted piccolo">{{ baseTxt(r.corrente.prezzoN, r.corrente.concluse) }}</span></td>
                  <td class="num">{{ pctTxt(r.corrente.puntualita.pctInOrario) }} <span class="muted piccolo">{{ baseTxt(r.corrente.puntualita.valutabili, r.corrente.concluse) }}</span></td>
                  <td class="num">{{ minTxt(r.corrente.puntualita.ritardoMedioMin) }}</td>
                  <td class="num">{{ minTxt(r.corrente.tempoMedioMin) }}</td>
                  <td class="num">{{ kmTxt(r.corrente.kmMedi) }}</td>
                </tr>
              }
            </tbody>
            <tfoot><tr>
              <td class="col-id strong">{{ 'statistiche.tipologia.totale' | translate }}</td>
              <td class="num strong">{{ num(d.totale.corrente.totali) }}</td>
              <td class="num delta">{{ deltaTxt(d.totale.corrente.totali, d.totale.confronto.totali) }}</td>
              <td class="num strong">{{ num(d.totale.corrente.concluse) }}</td>
              <td class="num">{{ pctTxt(d.totale.corrente.tassoNonConsegnate) }}</td>
              <td class="num">{{ pctTxt(d.totale.corrente.tassoAnnullate) }}</td>
              <td class="num">{{ euroTxt(d.totale.corrente.prezzoMedio) }}</td>
              <td class="num">{{ pctTxt(d.totale.corrente.puntualita.pctInOrario) }}</td>
              <td class="num">{{ minTxt(d.totale.corrente.puntualita.ritardoMedioMin) }}</td>
              <td class="num">{{ minTxt(d.totale.corrente.tempoMedioMin) }}</td>
              <td class="num">{{ kmTxt(d.totale.corrente.kmMedi) }}</td>
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

      <!-- Classifiche + stati -->
      <div class="griglia-3">
        @for (k of ['partner', 'valet', 'province']; track k) {
          <section class="card blocco">
            <h2>{{ 'statistiche.top.' + k | translate }}</h2>
            <table class="compatta">
              <thead><tr>
                <th class="sortable" (click)="ordinaLista(k, 'nome')">{{ 'statistiche.top.nome' | translate }}<span class="sort-ind">{{ segnoLista(k, 'nome') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'corrente')">{{ 'statistiche.top.consegne' | translate }}<span class="sort-ind">{{ segnoLista(k, 'corrente') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'pctDelTotale')">%<span class="sort-ind">{{ segnoLista(k, 'pctDelTotale') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'delta')">Δ<span class="sort-ind">{{ segnoLista(k, 'delta') }}</span></th>
                <th class="num sortable" (click)="ordinaLista(k, 'pctInOrario')">{{ 'statistiche.top.puntuali' | translate }}<span class="sort-ind">{{ segnoLista(k, 'pctInOrario') }}</span></th>
              </tr></thead>
              <tbody>
                @for (r of righeOrdinate(k, d.top[k].top); track r.id) {
                  <tr class="row-link" tabindex="0" (click)="vaiTop(k, r)" (keydown.enter)="vaiTop(k, r)">
                    <td>{{ r.nome }}</td>
                    <td class="num">{{ num(r.corrente) }}</td>
                    <td class="num muted">{{ pctTxt(r.pctDelTotale) }}</td>
                    <td class="num delta">{{ deltaTxt(r.corrente, r.confronto, true) }}</td>
                    <td class="num">{{ r.pctInOrario != null ? pctTxt(r.pctInOrario) : ('statistiche.top.baseBassa' | translate: { n: r.puntN }) }}</td>
                  </tr>
                }
                @if (d.top[k].altri > 0) {
                  <tr class="muted"><td>{{ 'statistiche.top.altri' | translate: { n: d.top[k].altri } }}</td><td class="num">{{ num(d.top[k].altriConsegne) }}</td><td class="num">{{ pctTxt(pct(d.top[k].altriConsegne, d.top[k].totale)) }}</td><td></td><td></td></tr>
                }
              </tbody>
            </table>
          </section>
        }
        <section class="card blocco">
          <h2>{{ 'statistiche.stati.titolo' | translate }}</h2>
          <table class="compatta">
            <thead><tr>
              <th class="sortable" (click)="ordinaLista('stati', 'stato')">{{ 'statistiche.stati.stato' | translate }}<span class="sort-ind">{{ segnoLista('stati', 'stato') }}</span></th>
              <th class="num sortable" (click)="ordinaLista('stati', 'corrente')">{{ 'statistiche.stati.n' | translate }}<span class="sort-ind">{{ segnoLista('stati', 'corrente') }}</span></th>
              <th class="num">%</th>
              <th class="num sortable" (click)="ordinaLista('stati', 'delta')">Δ<span class="sort-ind">{{ segnoLista('stati', 'delta') }}</span></th>
            </tr></thead>
            <tbody>
              @for (s of righeOrdinate('stati', d.perStato); track s.stato) {
                <tr class="row-link" tabindex="0" (click)="vaiConsegne({ status: s.stato })" (keydown.enter)="vaiConsegne({ status: s.stato })">
                  <td><span class="pill" [class]="'pill s-' + s.stato"><span class="dot" [class]="'dot s-' + s.stato"></span>{{ 'status.delivery.' + s.stato | translate }}</span></td>
                  <td class="num">{{ num(s.corrente) }}</td>
                  <td class="num muted">{{ pctTxt(pct(s.corrente, d.totale.corrente.totali)) }}</td>
                  <td class="num delta">{{ deltaTxt(s.corrente, s.confronto, true) }}</td>
                </tr>
              }
            </tbody>
          </table>
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
    .barra { display: flex; height: 30px; border-radius: 8px; overflow: hidden; background: var(--fill, rgba(120,120,128,.08)); margin-bottom: 8px; }
    .seg { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; min-width: 0; }
    .seg.ok { background: var(--green); } .seg.presto { background: var(--amber); } .seg.tardi { background: var(--red); }
    .numeri { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px 18px; margin-top: 12px; }
    .numero { display: flex; flex-direction: column; gap: 2px; }
    .griglia-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    table.compatta { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    table.compatta th, table.compatta td { padding: 6px 8px; border-bottom: 1px solid var(--hairline); text-align: left; }
    table.compatta th.num, table.compatta td.num { text-align: right; font-variant-numeric: tabular-nums; }
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
  readonly provinceId = signal<string>('');
  readonly partnerIds = signal<string[]>([]);
  readonly servizi = signal<{ id: string; name: string }[]>([]);
  readonly province = signal<{ id: string; code: string; name: string }[]>([]);
  readonly partners = signal<{ id: string; insegna: string }[]>([]);
  readonly elencoPartnerAperto = signal(false);
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
    this.http.get<any>(`${environment.apiUrl}/partners`, { params: { pageSize: 500 } }).subscribe({ next: (r) => this.partners.set((Array.isArray(r) ? r : r?.items ?? []).filter((p: any) => p.active !== false).map((p: any) => ({ id: p.id, insegna: p.insegna }))), error: () => {} });
  }

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const p = q.get('periodo') as Periodo | null;
    const c = q.get('confronto') as Confronto | null;
    if (p && this.PERIODI.includes(p)) this.periodo.set(p);
    if (c && this.CONFRONTI.includes(c)) this.confronto.set(c);
    this.serviceTypeId.set(q.get('serviceTypeId') ?? '');
    this.provinceId.set(q.get('provinceId') ?? '');
    this.partnerIds.set((q.get('partnerIds') ?? '').split(',').map((x) => x.trim()).filter(Boolean));
    this.caricaElenchi();
    this.carica();
  }

  scegli(p: Periodo, c: Confronto): void {
    this.periodo.set(p); this.confronto.set(c);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { periodo: p, confronto: c, serviceTypeId: this.serviceTypeId() || null, provinceId: this.provinceId() || null, partnerIds: this.partnerIds().length ? this.partnerIds().join(',') : null },
      replaceUrl: true,
    });
    this.carica();
  }

  private carica(): void {
    this.ritardiAperti.set(false); this.ritardi.set(null);
    this.loading.set(true); this.error.set(null);
    const params: Record<string, string> = { periodo: this.periodo(), confronto: this.confronto() };
    if (this.serviceTypeId()) params['serviceTypeId'] = this.serviceTypeId();
    if (this.provinceId()) params['provinceId'] = this.provinceId();
    if (this.partnerIds().length) params['partnerIds'] = this.partnerIds().join(',');
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
      { chiave: 'ritardoMedio', valore: this.minTxt(T.puntualita.ritardoMedioMin), delta: this.deltaTxt(T.puntualita.ritardoMedioMin, P.puntualita.ritardoMedioMin, false, ' min'), tono: this.tono(T.puntualita.ritardoMedioMin, P.puntualita.ritardoMedioMin, -1), base: this.translate.instant('statistiche.suRitardi', { n: this.num(T.puntualita.ritardo) }) },
      { chiave: 'anticipoMedio', valore: this.minTxt(T.puntualita.anticipoMedioMin), delta: this.deltaTxt(T.puntualita.anticipoMedioMin, P.puntualita.anticipoMedioMin, false, ' min'), tono: 'neutro', base: this.translate.instant('statistiche.suAnticipi', { n: this.num(T.puntualita.anticipo) }) },
      { chiave: 'tempoMedio', valore: this.coperturaOk(T.tempoN, T.concluse) ? this.minTxt(T.tempoMedioMin) : 'n/d', delta: this.deltaTxt(T.tempoMedioMin, P.tempoMedioMin, false, ' min'), tono: 'neutro', base: this.coperturaTxt(T.tempoN, T.concluse) },
      { chiave: 'kmMedi', valore: this.coperturaOk(T.kmN, T.concluse) ? this.kmTxt(T.kmMedi) : 'n/d', delta: this.deltaTxt(T.kmMedi, P.kmMedi, false, ' km'), tono: 'neutro', base: this.coperturaTxt(T.kmN, T.concluse) + (T.pctFuoriCitta != null ? ` · ${this.translate.instant('statistiche.fuoriCitta', { p: this.pctTxt(T.pctFuoriCitta) })}` : '') },
      { chiave: 'leadTime', valore: T.leadTimeGiorni == null ? 'n/d' : `${T.leadTimeGiorni.toLocaleString('it-IT', { maximumFractionDigits: 1 })} ${this.translate.instant('statistiche.gg')}`, delta: this.deltaTxt(T.leadTimeGiorni, P.leadTimeGiorni, false), tono: 'neutro', base: this.coperturaTxt(T.leadN, T.totali) },
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
    if (this.provinceId()) params['provinceId'] = this.provinceId();
    if (this.partnerIds().length) params['partnerIds'] = this.partnerIds().join(',');
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
