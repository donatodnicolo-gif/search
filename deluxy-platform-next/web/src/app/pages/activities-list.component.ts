import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { avviaAutoAggiornamento } from '../core/auto-aggiornamento';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface Activity {
  id: string;
  type: string;
  status: string;
  scheduledAt?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
  address?: string | null;
  delivery?: { id: string; code: number; status: string; recipientAddress?: string | null } | null;
  valet?: { id: string; firstName: string; lastName: string } | null;
}

const STATI: Record<string, { etichetta: string; colore: string }> = {
  // ⚠️ DIFETTO 6 (Libro UX cap.5): l'oro NON e' uno stato. «Da fare» attende
  // un'azione → --orange (#c93400).
  pending: { etichetta: 'Da fare', colore: '#c93400' },
  done: { etichetta: 'Fatta', colore: '#248A3D' },
  skipped: { etichetta: 'Saltata', colore: '#6e6e73' },
};

/**
 * Operatività → Attività: i ritiri e le consegne della giornata.
 *
 * ⚠️ Parte da OGGI e non da «tutte»: in tabella ce ne sono 57.253, di cui 9
 * oggi. Aprire la pagina su tutte significherebbe aspettare una risposta
 * enorme per guardare un elenco che nessuno può leggere.
 */
@Component({
  selector: 'app-activities-list',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'activities.title' | translate }}</h1>
        <p class="page-caption">{{ 'activities.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <div class="quick">
          <button type="button" class="quick-tab" [class.active]="giorno === oggi()" (click)="vaiA(oggi())">
            {{ 'deliveries.quick.today' | translate }}
          </button>
          <button type="button" class="quick-tab" [class.active]="giorno === domani()" (click)="vaiA(domani())">
            {{ 'deliveries.quick.tomorrow' | translate }}
          </button>
          <button type="button" class="quick-tab" [class.active]="!giorno" (click)="vaiA('')">
            {{ 'deliveries.quick.all' | translate }}
          </button>
        </div>
        <input class="field" type="date" [(ngModel)]="giorno" (ngModelChange)="carica()" />
        <button class="btn btn-secondary" (click)="carica()">{{ 'common.refresh' | translate }}</button>
      </div>
    </div>

    <!-- ⭐ 06/09/2026 (regola utente): due sezioni — DA FARE e STORICO (le concluse: fatte e
         saltate). I numeri sulle linguette contano sullo stesso giorno e perimetro. -->
    <div class="sezioni" role="tablist">
      <button type="button" class="sezione" role="tab" [class.active]="sezione() === 'aperte'" [attr.aria-selected]="sezione() === 'aperte'" (click)="vaiASezione('aperte')">
        {{ 'activities.sezione.aperte' | translate }} <span class="n">{{ conteggi().aperte }}</span>
      </button>
      <button type="button" class="sezione" role="tab" [class.active]="sezione() === 'storico'" [attr.aria-selected]="sezione() === 'storico'" (click)="vaiASezione('storico')">
        {{ 'activities.sezione.storico' | translate }} <span class="n">{{ conteggi().storico }}</span>
      </button>
    </div>
    @if (sezione() === 'storico') { <p class="sezione-nota">{{ 'activities.sezione.storicoNota' | translate }}</p> }

    <!-- ⭐ 06/09/2026 sera (regola utente): «metti filtri in alto per città o permetti di
         selezionare un valet; a un valet consenti di vedere solo io oppure tutti». Città e
         valet filtrano quello che è già in pagina; «solo io» invece cambia il perimetro e va
         chiesto al server (il team leader vede la squadra). -->
    <div class="filtri">
      <select class="field sel" [(ngModel)]="citta" name="citta">
        <option value="">{{ 'activities.filtri.tutteCitta' | translate }}</option>
        @for (c of cittaDisponibili(); track c) { <option [value]="c">{{ c }}</option> }
      </select>
      <select class="field sel" [(ngModel)]="valetScelto" name="valetScelto">
        <option value="">{{ 'activities.filtri.tuttiValet' | translate }}</option>
        @for (v of valetDisponibili(); track v.id) { <option [value]="v.id">{{ v.nome }}</option> }
      </select>
      @if (eValet()) {
        <div class="quick">
          <button type="button" class="quick-tab" [class.active]="!soloIo" (click)="cambiaSoloIo(false)">{{ 'activities.filtri.tutti' | translate }}</button>
          <button type="button" class="quick-tab" [class.active]="soloIo" (click)="cambiaSoloIo(true)">{{ 'activities.filtri.soloIo' | translate }}</button>
        </div>
      }
      <label class="spunta">
        <input type="checkbox" [(ngModel)]="conPartner" name="conPartner" (ngModelChange)="carica()" />
        <span>{{ 'activities.filtri.conPartner' | translate }}</span>
      </label>
    </div>
    @if (!conPartner) { <p class="sezione-nota">{{ 'activities.filtri.notaPartner' | translate }}</p> }

    <!-- Quando si guarda «tutte» si vede una fetta, e va detto: 57.253 righe
         non stanno in una pagina e fingere di mostrarle tutte è peggio che
         ammettere il taglio. -->
    @if (totale() > mostrate()) {
      <p class="avviso">{{ 'activities.capped' | translate:{ mostrate: mostrate(), totale: totale() } }}</p>
    }

    @if (caricando()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (!attivita().length) {
      <div class="card state-card">
        <strong>{{ (sezione() === 'storico' ? 'activities.sezione.storicoVuoto' : 'activities.emptyTitle') | translate }}</strong>
        <span class="muted">{{ 'activities.emptyHint' | translate }}</span>
      </div>
    } @else {

    <!-- §8-bis del Libro: ogni elenco ha una ricerca. Filtro client: la
         lista è già tutta qui. -->
    <div class="cerca-riga">
      <input class="field" type="search" [(ngModel)]="cerca" name="cerca"
             [attr.placeholder]="'comune.cercaPh' | translate" [attr.aria-label]="'comune.cercaPh' | translate" />
      @if (cerca.trim()) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: attivitaVisibili().length, m: attivita().length } }}</span>
      }
      @if (!cerca.trim() && (citta || valetScelto)) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: attivitaVisibili().length, m: attivita().length } }}</span>
      }
    </div>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'activities.col.type' | translate }}</th>
              <th>{{ 'activities.col.time' | translate }}</th>
              <th>{{ 'activities.col.address' | translate }}</th>
              <th>{{ 'activities.col.delivery' | translate }}</th>
              <th>{{ 'activities.col.valet' | translate }}</th>
              <th>{{ 'activities.col.status' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (a of attivitaVisibili(); track a.id) {
              <tr>
                <td>
                  <span class="tipo" [class.ritiro]="a.type === 'PICKUP'">
                    {{ ('activities.type.' + a.type) | translate }}
                  </span>
                </td>
                <td class="mono">
                  {{ a.scheduledAt ? (a.scheduledAt | date: 'dd/MM') : '—' }}
                  @if (a.timeFrom) { <span class="ora">{{ a.timeFrom }}@if (a.timeTo) {–{{ a.timeTo }}}</span> }
                </td>
                <td>{{ a.address || a.delivery?.recipientAddress || '—' }}</td>
                <td>
                  @if (a.delivery) {
                    <a [routerLink]="['/deliveries', a.delivery.id]" class="mono">#{{ a.delivery.code }}</a>
                  } @else { — }
                </td>
                <td>{{ a.valet ? (a.valet.lastName + ' ' + a.valet.firstName) : '—' }}</td>
                <td>
                  <span class="badge" [style.--c]="colore(a.status)">
                    <i class="dot"></i>{{ etichetta(a.status) }}
                  </span>
                </td>
                <td class="azioni">
                  @if (puoAgire() && a.status !== 'done') {
                    <button type="button" class="act" [disabled]="inCorso() === a.id" (click)="segna(a, 'done')">
                      {{ 'activities.markDone' | translate }}
                    </button>
                  }
                  @if (puoAgire() && a.status === 'done') {
                    <button type="button" class="act" [disabled]="inCorso() === a.id" (click)="segna(a, 'pending')">
                      {{ 'activities.markPending' | translate }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
    @if (errore(); as e) { <div class="error-card">{{ e }}</div> }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .quick { display: inline-flex; background: var(--fill, #f5f5f7); border-radius: 980px; padding: 2px; }
      .quick-tab { border: 0; background: none; border-radius: 980px; padding: 6px 14px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text-secondary); cursor: pointer; }
      .quick-tab.active { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .sezioni { display: inline-flex; gap: 4px; margin-bottom: 14px; padding: 3px; border-radius: 980px; background: var(--fill, #f5f5f7); }
      .sezione { border: 0; background: none; border-radius: 980px; padding: 7px 16px; font: inherit; font-size: 13.5px; font-weight: 550; color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
      .sezione.active { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
      .sezione .n { font-size: 11.5px; font-weight: 600; padding: 1px 7px; border-radius: 980px; background: rgba(0,0,0,.06); font-variant-numeric: tabular-nums; }
      .sezione.active .n { background: rgba(0,0,0,.08); }
      .sezione-nota { margin: -6px 0 12px; font-size: 13px; color: var(--text-secondary); }
      .filtri { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
      .filtri .sel { max-width: 220px; }
      .filtri .spunta { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
      .avviso { margin: 0 0 12px; font-size: 13px; color: var(--gold-strong, #B8963E); font-weight: 550; }
      .table-wrap { overflow-x: auto; }
      td { vertical-align: middle; }
      /* Ritiro e consegna si distinguono a colpo d'occhio: pillola, non solo testo. */
      .tipo {
        display: inline-flex; align-items: center; padding: 3px 11px; border-radius: 980px;
        font-size: 12px; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap;
        background: rgba(0, 113, 227, 0.1); color: var(--blue, #0071e3);
      }
      .tipo.ritiro { background: var(--fill); color: var(--text-secondary); }
      .ora { margin-left: 6px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
      .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 550; padding: 3px 11px; border-radius: 980px; white-space: nowrap; background: color-mix(in srgb, var(--c) 11%, transparent); color: var(--c); }
      .badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: none; }
      .azioni { text-align: right; white-space: nowrap; }
      .act {
        appearance: none; font: inherit; font-size: 12.5px; font-weight: 550; cursor: pointer;
        padding: 5px 14px; border-radius: 980px; border: 1px solid var(--hairline); background: var(--surface); color: var(--text);
        transition: background 0.15s ease;
      }
      .act:hover { background: var(--fill); }
      .act:disabled { opacity: 0.45; cursor: default; }
      .state-card { padding: 40px 28px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
      .state-card .muted { color: var(--text-tertiary); font-size: 13.5px; }
      .mono { font-variant-numeric: tabular-nums; }
      .error-card { padding: 14px 16px; border-radius: var(--radius-m, 10px); background: rgba(215, 0, 21, 0.06); border: 1px solid rgba(215, 0, 21, 0.15); color: var(--red, #d70015); }
      .cerca-riga { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .cerca-riga .field { max-width: 340px; }
      .conto-righe { font-size: 12.5px; color: var(--text-secondary); }
    `,
  ],
})
export class ActivitiesListComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly attivita = signal<Activity[]>([]);

  /** §8-bis: la ricerca. Si riconosce un'attività per consegna, valet, indirizzo. */
  cerca = '';
  /** ⭐ 06/09 sera: i due filtri in alto. Vivono sul client: la lista è già tutta qui. */
  citta = '';
  valetScelto = '';
  /** «Solo io» e «Consegne da partner» cambiano il perimetro: quelli li decide il server. */
  soloIo = false;
  conPartner = false;
  cambiaSoloIo(v: boolean): void { this.soloIo = v; this.carica(); }

  /**
   * La città dentro l'indirizzo, nei formati che il campo contiene davvero
   * («Via X 1, 20121 Milano MI, Italia»). Specchio client di `cittaDaIndirizzo`
   * del server: qui serve solo a raggruppare, non a calcolare un fuori-città.
   */
  private cittaDi(a: Activity): string | null {
    const ind = a.address || a.delivery?.recipientAddress || '';
    const parti = ind.split(',').map((x) => x.trim()).filter(Boolean);
    while (parti.length && /^(italia|italy)$/i.test(parti[parti.length - 1])) parti.pop();
    if (!parti.length) return null;
    // ⚠️ La sigla di provincia da sola non è una città: «…, 20100 MI» dava «MI» in tendina.
    // Se la coda si riduce alla sigla si guarda il pezzo prima («…, Milano, MI»).
    const pulisci = (x: string) => x.replace(/^\d{5}\s*/, '').replace(/\s+[A-Z]{2}$/, '').trim();
    let coda = pulisci(parti[parti.length - 1]);
    if ((!coda || /^[A-Z]{2}$/.test(coda) || /\d/.test(coda)) && parti.length >= 2) coda = pulisci(parti[parti.length - 2]);
    return coda && !/\d/.test(coda) && !/^[A-Z]{2}$/.test(coda) && coda.length <= 40 ? coda : null;
  }

  /** Le città e i valet presenti in quello che si sta guardando: niente tendine con opzioni vuote. */
  cittaDisponibili(): string[] {
    const s = new Set<string>();
    for (const a of this.attivita()) { const c = this.cittaDi(a); if (c) s.add(c); }
    return [...s].sort((x, y) => x.localeCompare(y, 'it'));
  }
  valetDisponibili(): { id: string; nome: string }[] {
    const m = new Map<string, string>();
    for (const a of this.attivita()) if (a.valet) m.set(a.valet.id, `${a.valet.lastName} ${a.valet.firstName}`.trim());
    return [...m].map(([id, nome]) => ({ id, nome })).sort((x, y) => x.nome.localeCompare(y.nome, 'it'));
  }

  attivitaVisibili(): Activity[] {
    const q = this.cerca.trim().toLowerCase();
    let items = this.attivita();
    if (this.citta) items = items.filter((a) => this.cittaDi(a) === this.citta);
    if (this.valetScelto) items = items.filter((a) => a.valet?.id === this.valetScelto);
    if (!q) return items;
    return items.filter((a) =>
      String(a.delivery?.code ?? '').includes(q) ||
      (a.address ?? '').toLowerCase().includes(q) ||
      (a.delivery?.recipientAddress ?? '').toLowerCase().includes(q) ||
      `${a.valet?.firstName ?? ''} ${a.valet?.lastName ?? ''}`.toLowerCase().includes(q));
  }

  readonly totale = signal(0);
  readonly mostrate = signal(0);
  /** ⭐ 06/09: la sezione — le cose da fare o lo storico delle concluse. */
  readonly sezione = signal<'aperte' | 'storico'>('aperte');
  readonly conteggi = signal<{ aperte: number; storico: number }>({ aperte: 0, storico: 0 });
  vaiASezione(s: 'aperte' | 'storico'): void { this.sezione.set(s); this.carica(); }
  readonly caricando = signal(true);
  readonly errore = signal<string | null>(null);
  readonly inCorso = signal<string | null>(null);

  /** Si parte da oggi: «tutte» sono 57.253 e nessuno le legge. */
  giorno = this.oggi();

  readonly eValet = computed(() => this.auth.user()?.role === 'VALET');

  readonly puoAgire = computed(() =>
    ['ADMIN', 'OPERATION', 'VALET'].includes(this.auth.user()?.role ?? ''),
  );

  etichetta(s: string) { return STATI[s]?.etichetta ?? s; }
  colore(s: string) { return STATI[s]?.colore ?? '#6e6e73'; }

  /**
   * Oggi e domani in ora locale, non UTC.
   *
   * `toISOString()` restituisce il giorno di Greenwich: alle 00:30 italiane là
   * è ancora ieri, e la pagina si aprirebbe sul giorno sbagliato.
   */
  private giornoRelativo(scarto: number): string {
    const d = new Date();
    d.setDate(d.getDate() + scarto);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const gg = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${gg}`;
  }
  oggi(): string { return this.giornoRelativo(0); }
  domani(): string { return this.giornoRelativo(1); }

  vaiA(giorno: string): void {
    this.giorno = giorno;
    this.carica();
  }

  constructor() {
    this.carica();
    // ⭐ 04/09 (regola utente): le attività seguono le consegne da sole
    // (30″, silenzioso, fermo mentre si segna una riga).
    avviaAutoAggiornamento({
      ricarica: () => this.carica(true),
      sospeso: () => !!this.inCorso() || this.caricando(),
    });
  }

  carica(silenzioso = false): void {
    if (!silenzioso) {
      this.caricando.set(true);
      this.errore.set(null);
    }
    const params: Record<string, string> = { stato: this.sezione() };
    if (this.giorno) params['date'] = this.giorno;
    if (this.soloIo) params['mie'] = '1';
    if (this.conPartner) params['conPartner'] = '1';
    this.http
      .get<{ items: Activity[]; totale: number; mostrate: number; conteggi?: { aperte: number; storico: number } }>(
        `${environment.apiUrl}/activities`, { params },
      )
      .subscribe({
        next: (r) => {
          this.attivita.set(r.items ?? []);
          this.totale.set(r.totale ?? 0);
          this.mostrate.set(r.mostrate ?? 0);
          this.conteggi.set(r.conteggi ?? { aperte: 0, storico: 0 });
          this.caricando.set(false);
        },
        error: (e) => {
          if (silenzioso) return;
          this.caricando.set(false);
          this.errore.set(e?.error?.message ?? 'Caricamento non riuscito');
        },
      });
  }

  segna(a: Activity, status: string): void {
    this.inCorso.set(a.id);
    this.http.patch(`${environment.apiUrl}/activities/${a.id}/status`, { id: a.id, status }).subscribe({
      next: () => { this.inCorso.set(null); this.carica(); },
      error: (e) => {
        this.inCorso.set(null);
        this.errore.set(e?.error?.message ?? 'Operazione non riuscita');
      },
    });
  }
}
