import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ClientTable } from '../core/client-table';
import { Partner } from '../core/models';
import { StatusOption, StatusSelectComponent } from '../core/status-select.component';

@Component({
  selector: 'app-partners-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, StatusSelectComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'partners.title' | translate }}</h1>
        <p class="page-caption">{{ partners().length }} {{ 'partners.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input
          class="field"
          name="q"
          [attr.placeholder]="'common.search' | translate"
          [ngModel]="table.query()"
          (ngModelChange)="table.query.set($event)"
        />
        @if (canEdit()) {
          <button class="btn btn-secondary" [disabled]="importing()" (click)="importFromAnagrafiche()">
            {{ (importing() ? 'partners.importing' : 'partners.importFromRegistry') | translate }}
          </button>
        }
        <a routerLink="/partners/new" class="btn btn-primary">+ {{ 'partners.add' | translate }}</a>
      </div>
    </div>
    @if (importResult()) { <div class="card state-card ok">{{ importResult() }}</div> }

    <!-- Riepilogo del collegamento col registro + elenco delle differenze -->
    @if (riepilogoRegistro(); as r) {
      <div class="card riepilogo">
        <span class="pill pill-ok">{{ r.collegati }} {{ 'partnerAnagrafica.linked' | translate }}</span>
        <span class="pill pill-warn">{{ r.abbinabili }} {{ 'partners.registry.matchable' | translate }}</span>
        <span class="pill pill-neutral">{{ r.assenti }} {{ 'partnerAnagrafica.notFound' | translate }}</span>
        @if (r.conDifferenze) {
          <button type="button" class="btn btn-secondary" (click)="mostraDifferenze.set(!mostraDifferenze())">
            {{ (mostraDifferenze() ? 'partners.registry.hideDiffs' : 'partners.registry.showDiffs') | translate:{ n: r.conDifferenze } }}
          </button>
        }
      </div>
      @if (mostraDifferenze()) {
        <div class="card table-wrap">
          <table>
            <thead><tr>
              <th>{{ 'partners.col.insegna' | translate }}</th>
              <th>{{ 'partnerAnagrafica.field' | translate }}</th>
              <th>{{ 'partnerAnagrafica.here' | translate }}</th>
              <th>{{ 'partnerAnagrafica.registry' | translate }}</th>
            </tr></thead>
            <tbody>
              @for (d of differenzeRegistro(); track d.partnerId) {
                @for (c of d.campi; track c.campo; let primo = $first) {
                  <tr class="row-link" (click)="apriPartner(d.partnerId)">
                    <td class="strong">@if (primo) { {{ d.partner }} <span class="muted small">· {{ d.criterio }}</span> }</td>
                    <td>{{ c.campo }}</td>
                    <td>{{ c.piattaforma ?? '—' }}</td>
                    <td class="muted">{{ c.registro ?? '—' }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    }

    @if (loading()) {
      <div class="card state-card">{{ 'partners.loading' | translate }}</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (filtered().length === 0) {
      <div class="card state-card">
        <strong>{{ 'partners.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'partners.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th class="sortable" (click)="table.sortBy('insegna')">{{ 'partners.col.insegna' | translate }}<span class="sort-ind">{{ table.indicator('insegna') }}</span></th>
              <th class="sortable" (click)="table.sortBy('email')">{{ 'partners.col.email' | translate }}<span class="sort-ind">{{ table.indicator('email') }}</span></th>
              <th class="sortable" (click)="table.sortBy('phone')">{{ 'partners.col.phone' | translate }}<span class="sort-ind">{{ table.indicator('phone') }}</span></th>
              <th>{{ 'partners.col.provinces' | translate }}</th>
              <th>{{ 'partners.col.categories' | translate }}</th>
              <th class="sortable" (click)="table.sortBy('paymentStatus')">{{ 'partners.col.payment' | translate }}<span class="sort-ind">{{ table.indicator('paymentStatus') }}</span></th>
              <th class="sortable" (click)="table.sortBy('active')">{{ 'partners.col.status' | translate }}<span class="sort-ind">{{ table.indicator('active') }}</span></th>
              <th>{{ 'partners.col.registry' | translate }}</th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr class="row-link" tabindex="0" (click)="openDetail(p)" (keydown.enter)="openDetail(p)">
                <td class="strong">{{ p.insegna }}</td>
                <td class="muted">{{ p.email }}</td>
                <td>{{ p.phone || '—' }}</td>
                <td>
                  @for (pp of primeProvince(p); track pp.province.id) {
                    <span class="pill pill-neutral">{{ pp.province.code }}</span>
                  } @empty { <span class="muted">—</span> }
                  @if (altreProvince(p); as quante) {
                    <span class="pill pill-neutral coda" [title]="restoProvince(p)">
                      {{ 'partners.altre' | translate: { n: quante } }}
                    </span>
                  }
                </td>
                <td class="muted small">
                  {{ (p.categories || []).length ? namesOf(p) : '—' }}<!--
               -->@if (altreCategorie(p); as quante) {
                    <span class="pill pill-neutral coda" [title]="restoCategorie(p)">
                      {{ 'partners.altre' | translate: { n: quante } }}
                    </span>
                  }
                </td>
                <td>
                  <app-status-select
                    [value]="p.paymentStatus || 'active'"
                    [options]="paymentOptions()"
                    [editable]="canEdit()"
                    (changed)="changePayment(p, $event)"
                  />
                </td>
                <td>
                  <app-status-select
                    [value]="p.active ? 'true' : 'false'"
                    [options]="activeOptions()"
                    [editable]="canEdit()"
                    (changed)="changeActive(p, $event)"
                  />
                </td>
                <td>
                  @switch (statoRegistro()[p.id]) {
                    @case ('collegato') { <span class="pill pill-ok">{{ 'partnerAnagrafica.linked' | translate }}</span> }
                    @case ('abbinabile') { <span class="pill pill-warn" [title]="'partners.registry.matchableHint' | translate">{{ 'partners.registry.matchable' | translate }}</span> }
                    @case ('assente') { <span class="muted small">{{ 'partnerAnagrafica.notFound' | translate }}</span> }
                    @default { <span class="muted small">—</span> }
                  }
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  @if (canEdit()) {
                    <a class="act" [routerLink]="['/partners', p.id, 'edit']">{{ 'common.edit' | translate }}</a>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .head-actions { display: flex; gap: 10px; align-items: center; }
      .head-actions .btn { text-decoration: none; }
      .riepilogo { display: flex; align-items: center; gap: 10px; padding: 12px 16px; margin-bottom: 14px; flex-wrap: wrap; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.sortable { cursor: pointer; user-select: none; }
      th.sortable:hover { color: var(--text); }
      .sort-ind { color: var(--gold-strong); font-weight: 700; }
      tbody tr { transition: background 0.14s var(--ease); }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .small { font-size: 12.5px; white-space: normal; max-width: 220px; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; margin-right: 4px; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .pill-ok { background: rgba(36,138,61,.12); color: #1a7f37; }
      .pill-warn { background: rgba(184,150,62,.16); color: #8a6d1f; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      /* La coda «+N»: stessa forma delle altre ma senza sfondo, cosi' non si
         legge come una voce in piu'. Il cursore dice che c'e' un tooltip. */
      .pill.coda { background: transparent; border: 1px solid var(--separator); cursor: help; margin-left: 2px; }
      .s-active { background: rgba(36,138,61,0.12); color: var(--green); }
      .s-inactive { background: rgba(255,149,0,0.12); color: #b25000; }
      .s-blocked { background: rgba(215,0,21,0.09); color: var(--red); }
      .row-link { cursor: pointer; }
      .row-link:focus-visible { outline: 2px solid var(--gold-strong); outline-offset: -2px; }
      .actions-cell { white-space: nowrap; }
      .act { display: inline-flex; align-items: center; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 4px 11px; font-size: 12px; font-weight: 550; color: var(--text); text-decoration: none; }
      .act:hover { background: var(--fill); }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class PartnersListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Il click sulla riga apre sempre il dettaglio. */
  openDetail(p: Partner): void {
    this.router.navigate(['/partners', p.id]);
  }

  /** Modifica partner: admin, operation, project manager (come l'API). */
  canEdit(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION' || r === 'PROJECT_MANAGER';
  }

  /**
   * Stato del collegamento col registro, per tutti i partner in una chiamata
   * sola: chiederlo partner per partner significherebbe 265 richieste verso un
   * servizio esterno. Vuoto se il registro non è configurato o non risponde:
   * in quel caso la colonna mostra "—" invece di dire il falso.
   */
  readonly statoRegistro = signal<Record<string, string>>({});
  readonly riepilogoRegistro = signal<{ collegati: number; abbinabili: number; assenti: number; conDifferenze: number } | null>(null);
  readonly differenzeRegistro = signal<{ partnerId: string; partner: string; criterio: string; campi: { campo: string; piattaforma: string | null; registro: string | null }[] }[]>([]);
  readonly mostraDifferenze = signal(false);

  apriPartner(id: string): void { this.router.navigate(['/partners', id]); }

  readonly partners = signal<Partner[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** Ricerca globale + ordinamento per colonna, lato client (lista piccola). */
  readonly table = new ClientTable<Partner>(
    [
      'insegna',
      'email',
      'phone',
      'businessName',
      'vatNumber',
      'provinces.province.code',
      'provinces.province.name',
      'categories.category.name',
    ],
    'insegna',
  );

  readonly filtered = computed(() => this.table.view(this.partners()));

  readonly importing = signal(false);
  readonly importResult = signal<string | null>(null);

  /** Legge lo stato del registro (best-effort: un errore non rompe la lista). */
  private caricaStatoRegistro(): void {
    this.http.get<any>(`${environment.apiUrl}/partners/anagrafiche/stato`).subscribe({
      next: (r) => {
        if (!r?.registroRaggiungibile) return;
        this.statoRegistro.set(r.perPartner ?? {});
        this.riepilogoRegistro.set({ collegati: r.collegati, abbinabili: r.abbinabili, assenti: r.assenti, conDifferenze: r.conDifferenze ?? 0 });
        this.differenzeRegistro.set(r.differenze ?? []);
      },
      error: () => { /* registro non configurato: la colonna resta vuota */ },
    });
  }

  constructor() {
    this.caricaStatoRegistro();
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<Partner[]>(`${environment.apiUrl}/partners`).subscribe({
      next: (d) => {
        this.partners.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.translate.instant('partners.loadError'));
      },
    });
  }

  /** Importa gli attivi dal registro Anagrafiche, poi ricarica la lista. */
  importFromAnagrafiche(): void {
    this.importing.set(true);
    this.importResult.set(null);
    this.http
      .post<{ totale: number; importati: number; saltati: number; errori: string[] }>(
        `${environment.apiUrl}/partners/import/anagrafiche`,
        {},
      )
      .subscribe({
        next: (r) => {
          this.importing.set(false);
          this.importResult.set(
            this.translate.instant('partners.importDone', {
              importati: r.importati,
              saltati: r.saltati,
              totale: r.totale,
            }),
          );
          this.load();
        },
        error: (err) => {
          this.importing.set(false);
          this.importResult.set(err?.error?.message ?? 'Errore durante l\'import');
        },
      });
  }

  /**
   * Quante voci si mostrano in una cella prima di riassumere il resto in «+N».
   *
   * ⚠️ Il numero non è arbitrario: misurato sui 289 partner veri, le province
   * per partner sono 1 nella mediana ma **12 al 75° percentile** (91 partner
   * ne hanno esattamente 12) e **107 per due di loro**. Senza tetto quelle
   * righe diventano alte il triplo delle altre e la tabella non si scorre più.
   * Sei sta su una riga sola a qualunque larghezza utile.
   */
  private static readonly TETTO_CELLA = 6;

  primeProvince(p: Partner) {
    return (p.provinces || []).slice(0, PartnersListComponent.TETTO_CELLA);
  }

  /** Quante ne restano fuori; 0 diventa falsy e la coda non compare. */
  altreProvince(p: Partner): number {
    return Math.max(0, (p.provinces || []).length - PartnersListComponent.TETTO_CELLA);
  }

  /**
   * L'elenco di quelle nascoste, per il tooltip.
   *
   * ⚠️ Il «+N» non è cliccabile di proposito: la riga intera apre il dettaglio
   * (Libro §8), e un bersaglio che fa un'altra cosa dentro una riga che
   * naviga è il modo per aprire la scheda sbagliata. Chi vuole l'elenco
   * completo lo trova nel dettaglio; qui basta sapere che c'è dell'altro.
   */
  restoProvince(p: Partner): string {
    return (p.provinces || [])
      .slice(PartnersListComponent.TETTO_CELLA)
      .map((x) => x.province.code)
      .join(' · ');
  }

  namesOf(p: Partner): string {
    return (p.categories || [])
      .slice(0, PartnersListComponent.TETTO_CELLA)
      .map((c) => c.category.name)
      .join(', ');
  }

  altreCategorie(p: Partner): number {
    return Math.max(0, (p.categories || []).length - PartnersListComponent.TETTO_CELLA);
  }

  restoCategorie(p: Partner): string {
    return (p.categories || [])
      .slice(PartnersListComponent.TETTO_CELLA)
      .map((c) => c.category.name)
      .join(' · ');
  }

  /** Opzioni stato pagamento (attivo | inattivo | bloccato). */
  paymentOptions(): StatusOption[] {
    return [
      { value: 'active', label: this.translate.instant('enums.paymentStatus.active'), cls: 's-active' },
      { value: 'inactive', label: this.translate.instant('enums.paymentStatus.inactive'), cls: 's-inactive' },
      { value: 'blocked', label: this.translate.instant('enums.paymentStatus.blocked'), cls: 's-blocked' },
    ];
  }

  /** Opzioni stato attivo/disattivo. */
  activeOptions(): StatusOption[] {
    return [
      { value: 'true', label: this.translate.instant('common.active'), cls: 's-active' },
      { value: 'false', label: this.translate.instant('common.inactive'), cls: 'pill-neutral' },
    ];
  }

  changePayment(p: Partner, value: string): void {
    this.patchPartner(p, { paymentStatus: value }, () => (p.paymentStatus = value));
  }

  changeActive(p: Partner, value: string): void {
    const active = value === 'true';
    this.patchPartner(p, { active }, () => (p.active = active));
  }

  /** Salva il cambio di stato inline (aggiornamento ottimistico + rollback). */
  private patchPartner(p: Partner, body: Record<string, unknown>, apply: () => void): void {
    const snapshot = { paymentStatus: p.paymentStatus, active: p.active };
    apply();
    this.partners.set([...this.partners()]); // notifica il signal
    this.http.put(`${environment.apiUrl}/partners/${p.id}`, body).subscribe({
      error: () => {
        p.paymentStatus = snapshot.paymentStatus;
        p.active = snapshot.active;
        this.partners.set([...this.partners()]);
        this.error.set(this.translate.instant('common.saveError'));
      },
    });
  }
}
