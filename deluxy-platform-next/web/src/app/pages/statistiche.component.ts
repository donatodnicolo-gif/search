import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  imports: [TranslatePipe],
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
          </p>
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
                <tr>
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
              <thead><tr><th>{{ 'statistiche.top.nome' | translate }}</th><th class="num">{{ 'statistiche.top.consegne' | translate }}</th><th class="num">%</th><th class="num">Δ</th><th class="num">{{ 'statistiche.top.puntuali' | translate }}</th></tr></thead>
              <tbody>
                @for (r of d.top[k].top; track r.id) {
                  <tr>
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
            <thead><tr><th>{{ 'statistiche.stati.stato' | translate }}</th><th class="num">{{ 'statistiche.stati.n' | translate }}</th><th class="num">%</th><th class="num">Δ</th></tr></thead>
            <tbody>
              @for (s of d.perStato; track s.stato) {
                <tr>
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
    .quick-tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .filtri { display: flex; flex-wrap: wrap; gap: 18px 28px; align-items: flex-end; padding: 14px 18px; margin-bottom: 16px; }
    .gruppo { display: flex; flex-direction: column; gap: 6px; }
    .eti { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); font-weight: 600; }
    .date { flex-basis: 100%; margin: 0; font-size: 12.5px; }
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

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const p = q.get('periodo') as Periodo | null;
    const c = q.get('confronto') as Confronto | null;
    if (p && this.PERIODI.includes(p)) this.periodo.set(p);
    if (c && this.CONFRONTI.includes(c)) this.confronto.set(c);
    this.carica();
  }

  scegli(p: Periodo, c: Confronto): void {
    this.periodo.set(p); this.confronto.set(c);
    this.router.navigate([], { relativeTo: this.route, queryParams: { periodo: p, confronto: c }, replaceUrl: true });
    this.carica();
  }

  private carica(): void {
    this.loading.set(true); this.error.set(null);
    this.http.get<any>(`${environment.apiUrl}/statistiche`, { params: { periodo: this.periodo(), confronto: this.confronto() } }).subscribe({
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
