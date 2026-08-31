import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { ProductRef } from '../core/models';
import { SavedViewsComponent } from '../core/saved-views.component';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, SavedViewsComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'products.title' | translate }}</h1>
        <p class="page-caption">{{ total() }} {{ 'products.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input
          class="field"
          [attr.placeholder]="'products.searchPlaceholder' | translate"
          [ngModel]="query"
          (ngModelChange)="onSearch($event)"
        />
        <a routerLink="/products/new" class="btn btn-primary">+ {{ 'products.add' | translate }}</a>
      </div>
    </div>

    <!-- Viste rapide salvate (per account, condivisibili) -->
    <app-saved-views section="products" [current]="currentView()" (applyView)="applyView($event)" />

    <!-- Tab: lista principale / archivio (stato separato da Attivo) -->
    <div class="tabs">
      <button type="button" class="tab" [class.on]="!archived()" (click)="setArchived(false)">
        {{ 'products.tabActive' | translate }}
      </button>
      <button type="button" class="tab" [class.on]="archived()" (click)="setArchived(true)">
        {{ 'products.tabArchive' | translate }}
      </button>
    </div>

    <!-- Filtri Sì/No come nella lista prodotti dell'app reale (manuale §3.6):
         Attivo, Approvato, Prodotto Unico, Super Prodotto, Super Provincia,
         In Magazzino. Sono a TRE stati: vuoto = tutti, Sì, No. Senza il terzo
         stato «mostrami i non approvati» non sarebbe esprimibile. -->
    <div class="filtri">
      @for (f of filtri; track f.chiave) {
        <label class="filtro"><span>{{ f.etichetta | translate }}</span>
          <select class="field" [ngModel]="valoreFiltro(f.chiave)"
                  (ngModelChange)="cambiaFiltro(f.chiave, $event)">
            <option value="">{{ 'products.filter.all' | translate }}</option>
            <option value="true">{{ 'products.filter.yes' | translate }}</option>
            <option value="false">{{ 'products.filter.no' | translate }}</option>
          </select>
        </label>
      }
      @if (filtriAttivi()) {
        <button type="button" class="btn btn-secondary mini" (click)="azzeraFiltri()">
          {{ 'products.filter.clear' | translate }}
        </button>
      }
    </div>

    @if (loading()) { <div class="card state-card">{{ 'products.loading' | translate }}</div> }
    @else if (error()) { <div class="error-card">{{ error() }}</div> }
    @else if (products().length === 0) {
      <div class="card state-card"><strong>{{ 'products.emptyTitle' | translate }}</strong><span class="muted">{{ 'products.emptyHint' | translate }}</span></div>
    } @else {
      @if (puoAgire() && scelti().size) {
        <!-- La barra compare solo quando c'e' una selezione: un'azione di
             gruppo sempre visibile invita a premerla anche a vuoto. -->
        <div class="barra-azioni">
          <span class="quanti">{{ 'products.bulk.selected' | translate:{ n: scelti().size } }}</span>
          <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="agisci('archivia')">
            {{ 'products.bulk.archive' | translate }}
          </button>
          <button type="button" class="btn btn-secondary mini" [disabled]="inAzione()" (click)="agisci('ripristina')">
            {{ 'products.bulk.restore' | translate }}
          </button>
          <button type="button" class="btn btn-danger mini" [disabled]="inAzione()" (click)="chiediElimina()">
            {{ 'products.bulk.delete' | translate }}
          </button>
          <button type="button" class="btn btn-secondary mini" (click)="azzeraSelezione()">
            {{ 'products.bulk.clear' | translate }}
          </button>
        </div>
        @if (conferma()) {
          <!-- L'eliminazione si conferma: e' l'unica delle tre che non si disfa. -->
          <div class="card conferma">
            <p><strong>{{ 'products.bulk.confirmTitle' | translate:{ n: scelti().size } }}</strong></p>
            <p class="hint">{{ 'products.bulk.confirmBody' | translate }}</p>
            <div class="azioni">
              <button type="button" class="btn btn-danger" [disabled]="inAzione()" (click)="agisci('elimina')">
                {{ (inAzione() ? 'common.saving' : 'products.bulk.confirmYes') | translate }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="conferma.set(false)">{{ 'common.cancel' | translate }}</button>
            </div>
          </div>
        }
        @if (esitoAzione(); as e) { <div class="card esito-azione">{{ e }}</div> }
      }
      <div class="card table-wrap">
        <table>
          <thead><tr>
            @if (puoAgire()) {
              <th class="sel">
                <input type="checkbox" [checked]="tuttiSelezionati()" (change)="selezionaPagina()"
                       [title]="'products.bulk.selectPage' | translate" />
              </th>
            }
            @for (c of columns; track c.field) {
              <th [class.num]="c.num" class="sortable" (click)="sortBy(c.field)">
                {{ c.label | translate }}<span class="sort-ind">{{ sortIndicator(c.field) }}</span>
              </th>
            }
            <th>{{ 'deliveries.col.actions' | translate }}</th>
          </tr></thead>
          <tbody>
            @for (p of products(); track p.id) {
              <tr class="row-link" [class.scelta]="scelti().has(p.id)" tabindex="0" (click)="openDetail(p)" (keydown.enter)="openDetail(p)">
                @if (puoAgire()) {
                  <td class="sel" (click)="$event.stopPropagation()">
                    <input type="checkbox" [checked]="scelti().has(p.id)" (change)="scegli(p.id)" />
                  </td>
                }
                <td class="strong">{{ p.name }}</td>
                <td class="mono muted">{{ p.sku || '—' }}</td>
                <td>{{ p.category?.name || '—' }}</td>
                <td><span class="pill pill-neutral">{{ p.type ? (('enums.productType.' + p.type) | translate) : '—' }}</span></td>
                <td class="muted">{{ p.partner?.insegna || '—' }}</td>
                <td class="num strong">{{ p.price != null ? (p.price + ' €') : '—' }}</td>
                <td>
                  @if (p.active === false) { <span class="pill pill-neutral">{{ 'common.inactive' | translate }}</span> }
                  @else if (p.approved) { <span class="pill s-ok"><span class="dot"></span>{{ 'products.approved' | translate }}</span> }
                  @else { <span class="pill s-wait"><span class="dot"></span>{{ 'products.pending' | translate }}</span> }
                </td>
                <td class="actions-cell" (click)="$event.stopPropagation()">
                  <a class="act" [routerLink]="['/products', p.id, 'edit']">{{ 'common.edit' | translate }}</a>
                  @if (archived()) {
                    <button type="button" class="act" (click)="setArchivedFlag(p, false)">{{ 'products.restore' | translate }}</button>
                  } @else {
                    <button type="button" class="act" (click)="setArchivedFlag(p, true)">{{ 'products.archive' | translate }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Paginazione server-side -->
      <div class="pager">
        <button type="button" class="act" [disabled]="page() <= 1" (click)="goTo(page() - 1)">‹</button>
        <span class="pager-info">
          {{ 'list.pageOf' | translate: { page: page(), pages: totalPages() } }}
        </span>
        <button type="button" class="act" [disabled]="page() >= totalPages()" (click)="goTo(page() + 1)">›</button>
        <select class="field pager-size" [ngModel]="pageSize" (ngModelChange)="changePageSize($event)">
          @for (s of pageSizes; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="pager-info">{{ 'list.perPage' | translate }}</span>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } /* 31/08: a 375px ricerca+bottone sbordavano */
      .head-actions .field { flex: 1 1 180px; min-width: 0; }
      .head-actions .btn { text-decoration: none; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      th.num, td.num { text-align: right; }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .mono { font-variant-numeric: tabular-nums; }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .s-ok { background: rgba(36,138,61,0.12); color: var(--green); }
      .s-wait { background: rgba(255,149,0,0.12); color: #b25000; }
      .row-link { cursor: pointer; }
      .row-link:focus-visible { outline: 2px solid var(--gold-strong); outline-offset: -2px; }
      .actions-cell { white-space: nowrap; }
      .act { display: inline-flex; align-items: center; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 4px 11px; font-size: 12px; font-weight: 550; color: var(--text); text-decoration: none; }
      .act:hover { background: var(--fill); }
      /* Tab lista principale / archivio */
      .tabs { display: flex; gap: 6px; margin-bottom: 14px; }
      .tab { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 6px 16px; font-size: 13px; font-weight: 550; font-family: inherit; color: var(--text); cursor: pointer; }
      .tab:hover { background: var(--fill); }
      .tab.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      /* Selezione multipla */
      th.sel, td.sel { width: 34px; text-align: center; }
      tr.scelta { background: color-mix(in srgb, var(--ink) 4%, transparent); }
      .barra-azioni {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px;
        padding: 8px 12px; border-radius: var(--radius-md, 12px);
        background: var(--surface-2, #f5f5f7); border: 1px solid var(--hairline, #e5e5ea);
      }
      .barra-azioni .quanti { font-size: 13px; font-weight: 550; margin-right: 4px; }
      .btn-danger { background: var(--red, #d70015); color: #fff; border-color: var(--red, #d70015); }
      .conferma { padding: 14px 16px; margin-bottom: 10px; border-color: color-mix(in srgb, #d70015 30%, transparent); }
      .conferma .azioni { display: flex; gap: 8px; margin-top: 8px; }
      .esito-azione { padding: 10px 14px; margin-bottom: 10px; font-size: 13px; }
      /* Filtri Sì/No */
      .filtri { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin-bottom: 14px; }
      .filtro { display: flex; flex-direction: column; gap: 3px; }
      .filtro span { font-size: 11px; color: var(--text-tertiary); padding-left: 2px; }
      .filtro .field { padding: 6px 10px; font-size: 13px; }
      .filtri .btn.mini { padding: 6px 12px; font-size: 13px; }
      /* Intestazioni ordinabili */
      th.sortable { cursor: pointer; user-select: none; }
      th.sortable:hover { color: var(--text); }
      .sort-ind { color: var(--gold-strong); font-weight: 700; }
      /* Paginazione */
      .pager { display: flex; align-items: center; gap: 10px; margin-top: 14px; justify-content: flex-end; }
      .pager-info { font-size: 12.5px; color: var(--text-tertiary); }
      .pager-size { width: auto; padding: 4px 8px; font-size: 12.5px; }
      .act:disabled { opacity: 0.4; cursor: not-allowed; }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class ProductsListComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  /** Il click sulla riga apre sempre il dettaglio. */
  openDetail(p: ProductRef): void {
    this.router.navigate(['/products', p.id]);
  }

  readonly products = signal<ProductRef[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /** Stato tabella: ricerca globale + ordinamento + paginazione (tutto server-side). */
  query = '';
  readonly total = signal(0);
  readonly page = signal(1);
  pageSize = 50;
  readonly pageSizes = [10, 25, 50, 100, 200, 500];
  readonly sort = signal<string>('name');
  readonly dir = signal<'asc' | 'desc'>('asc');
  private searchTimer?: ReturnType<typeof setTimeout>;

  /** Colonne ordinabili: il campo deve essere nella whitelist dell'API. */
  readonly columns = [
    { field: 'name', label: 'products.col.name', num: false },
    { field: 'sku', label: 'products.col.sku', num: false },
    { field: 'category.name', label: 'products.col.category', num: false },
    { field: 'type', label: 'products.col.type', num: false },
    { field: 'partner.insegna', label: 'products.col.partner', num: false },
    { field: 'price', label: 'products.col.price', num: true },
    { field: 'approved', label: 'products.col.status', num: false },
  ];

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  // ---- Archivio: stato separato da "Attivo" (un disattivato resta in lista) ----
  // --- selezione multipla ---------------------------------------------------

  readonly scelti = signal<Set<string>>(new Set());
  readonly inAzione = signal(false);
  readonly conferma = signal(false);
  readonly esitoAzione = signal<string | null>(null);

  /** Chi puo' agire: il partner sui propri, admin e operation su tutti. */
  puoAgire(): boolean {
    return ['ADMIN', 'OPERATION', 'PARTNER'].includes(this.auth.user()?.role ?? '');
  }

  scegli(id: string): void {
    const s = new Set(this.scelti());
    s.has(id) ? s.delete(id) : s.add(id);
    this.scelti.set(s);
    this.esitoAzione.set(null);
    this.conferma.set(false);
  }

  tuttiSelezionati(): boolean {
    const p = this.products();
    return p.length > 0 && p.every((x) => this.scelti().has(x.id));
  }

  /**
   * Seleziona (o deseleziona) i prodotti DI QUESTA PAGINA, non tutti i 22.952.
   *
   * La differenza conta: una casella che dicesse «tutti» su una lista paginata
   * farebbe agire su record che nessuno ha visto. Qui si agisce su cio' che si
   * ha davanti, e per farne di piu' si cambia pagina.
   */
  selezionaPagina(): void {
    const s = new Set(this.scelti());
    const tutti = this.tuttiSelezionati();
    for (const p of this.products()) tutti ? s.delete(p.id) : s.add(p.id);
    this.scelti.set(s);
    this.esitoAzione.set(null);
  }

  azzeraSelezione(): void {
    this.scelti.set(new Set());
    this.esitoAzione.set(null);
    this.conferma.set(false);
  }

  chiediElimina(): void {
    this.esitoAzione.set(null);
    this.conferma.set(true);
  }

  /**
   * Esegue l'azione sui prodotti scelti e RIFERISCE l'esito vero.
   *
   * L'eliminazione non riesce sempre, e non e' un guasto: 6.531 prodotti su
   * 22.952 sono usati in una consegna o in una vendita e il database rifiuta di
   * cancellarli. Quelli vengono archiviati e il messaggio lo dice, invece di
   * far credere che siano spariti.
   */
  agisci(azione: 'archivia' | 'ripristina' | 'elimina'): void {
    const ids = [...this.scelti()];
    if (!ids.length) return;
    this.inAzione.set(true);
    this.esitoAzione.set(null);
    this.http.post<any>(`${environment.apiUrl}/products/azione-multipla`, { ids, azione }).subscribe({
      next: (r) => {
        this.inAzione.set(false);
        this.conferma.set(false);
        this.scelti.set(new Set());
        const pezzi: string[] = [];
        if (azione === 'elimina') {
          pezzi.push(this.translate.instant('products.bulk.doneDelete', { n: r.fatti ?? 0 }));
          if (r.bloccati) pezzi.push(this.translate.instant('products.bulk.blocked', { n: r.bloccati }));
        } else {
          pezzi.push(this.translate.instant('products.bulk.doneMove', { n: r.fatti ?? 0 }));
        }
        if (r.nonTuoi) pezzi.push(this.translate.instant('products.bulk.notYours', { n: r.nonTuoi }));
        this.esitoAzione.set(pezzi.join(' '));
        this.load();
      },
      error: (e) => {
        this.inAzione.set(false);
        this.esitoAzione.set(e?.error?.message ?? this.translate.instant('common.loadError'));
      },
    });
  }

  readonly archived = signal(false);

  /**
   * I filtri Sì/No, nell'ordine in cui li mostra l'app reale (manuale §3.6).
   *
   * Il valore è una STRINGA a tre stati ('' | 'true' | 'false'), non un
   * booleano: «tutti» e «solo i no» devono restare distinguibili, se no
   * chiedere i 19.789 prodotti non approvati sarebbe impossibile.
   */
  readonly filtri = [
    { chiave: 'active', etichetta: 'products.filter.active' },
    { chiave: 'approved', etichetta: 'products.filter.approved' },
    { chiave: 'unique', etichetta: 'products.filter.unique' },
    { chiave: 'superProduct', etichetta: 'products.filter.superProduct' },
    { chiave: 'superProvince', etichetta: 'products.filter.superProvince' },
    { chiave: 'inStock', etichetta: 'products.filter.inStock' },
  ] as const;

  readonly siNo = signal<Record<string, string>>({});

  valoreFiltro(chiave: string): string { return this.siNo()[chiave] ?? ''; }

  cambiaFiltro(chiave: string, valore: string): void {
    const nuovi = { ...this.siNo() };
    if (valore) nuovi[chiave] = valore; else delete nuovi[chiave];
    this.siNo.set(nuovi);
    this.scelti.set(new Set());
    this.page.set(1);
    this.load();
  }

  filtriAttivi(): boolean { return Object.keys(this.siNo()).length > 0; }

  azzeraFiltri(): void {
    this.siNo.set({});
    this.page.set(1);
    this.load();
  }

  setArchived(value: boolean): void {
    if (this.archived() === value) return;
    this.archived.set(value);
    this.scelti.set(new Set());
    this.page.set(1);
    this.load();
  }

  /** Archivia o ripristina un prodotto e ricarica la lista corrente. */
  setArchivedFlag(p: ProductRef, archived: boolean): void {
    this.http
      .patch(`${environment.apiUrl}/products/${p.id}/archive`, { archived })
      .subscribe({
        next: () => this.load(),
        error: (err) => this.error.set(err?.error?.message ?? this.translate.instant('common.saveError')),
      });
  }

  // ---- Viste rapide ----
  /**
   * Stato corrente salvato in una vista.
   * Metodo e non `computed`: `query` e `pageSize` sono campi semplici, non
   * signal, quindi un computed non ricalcolerebbe al loro cambiare.
   */
  currentView(): Record<string, unknown> {
    return {
      q: this.query,
      sort: this.sort(),
      dir: this.dir(),
      pageSize: this.pageSize,
      archived: this.archived(),
    };
  }

  /** Applica una vista salvata: ripristina ricerca, ordinamento, pagina e tab. */
  applyView(config: Record<string, unknown>): void {
    this.query = typeof config['q'] === 'string' ? (config['q'] as string) : '';
    if (typeof config['sort'] === 'string') this.sort.set(config['sort'] as string);
    if (config['dir'] === 'asc' || config['dir'] === 'desc') this.dir.set(config['dir']);
    if (typeof config['pageSize'] === 'number') this.pageSize = config['pageSize'] as number;
    this.archived.set(config['archived'] === true);
    this.page.set(1);
    this.load();
  }

  sortIndicator(field: string): string {
    if (this.sort() !== field) return '';
    return this.dir() === 'asc' ? ' ↑' : ' ↓';
  }

  /** Click sull'intestazione: stesso campo inverte il verso, altrimenti ordina asc. */
  sortBy(field: string): void {
    if (this.sort() === field) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sort.set(field);
      this.dir.set('asc');
    }
    this.page.set(1);
    this.load();
  }

  /** Ricerca globale con debounce: evita una chiamata per ogni tasto. */
  onSearch(value: string): void {
    this.query = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.load();
  }

  changePageSize(size: number): void {
    this.pageSize = Number(size);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const params: Record<string, string> = {
      page: String(this.page()),
      pageSize: String(this.pageSize),
      sort: this.sort(),
      dir: this.dir(),
    };
    if (this.query.trim()) params['q'] = this.query.trim();
    // ⚠️ `archived` non veniva mandato: il tab Archivio cambiava solo
    // l'evidenziazione e la lista restava quella dei non archiviati. Sembrava
    // che la sezione non esistesse, mentre l'API rispondeva correttamente
    // (15.135 attivi / 6.752 archiviati) a chi il parametro glielo passava.
    if (this.archived()) params['archived'] = 'true';
    for (const [chiave, valore] of Object.entries(this.siNo())) {
      if (valore !== '') params[chiave] = valore;
    }
    this.http
      .get<{ items: ProductRef[]; total: number }>(`${environment.apiUrl}/products`, { params })
      .subscribe({
        next: (d) => { this.products.set(d.items ?? []); this.total.set(d.total ?? 0); this.loading.set(false); },
        error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')); },
      });
  }

  constructor() {
    this.load();
  }
}
