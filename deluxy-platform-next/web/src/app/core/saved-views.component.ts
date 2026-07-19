import { HttpClient } from '@angular/common/http';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

export interface SavedView {
  id: string;
  section: string;
  name: string;
  config: Record<string, unknown>;
  shared: boolean;
  own: boolean;
}

/**
 * Viste di visualizzazione rapida di una lista: salvano ricerca, ordinamento,
 * paginazione e filtri, e li richiamano con un clic.
 *
 * Sono legate all'account (non al browser): il backend le espone su
 * /saved-views?section=... e possono essere condivise col team.
 *
 * Uso:
 *   <app-saved-views
 *     section="products"
 *     [current]="currentView()"
 *     (applyView)="applyView($event)" />
 */
@Component({
  selector: 'app-saved-views',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="views">
      <span class="views-title">{{ 'views.title' | translate }}</span>

      @for (v of views(); track v.id) {
        <span class="view-chip" [class.on]="activeId() === v.id">
          <button type="button" class="chip-main" (click)="apply(v)" [title]="v.shared ? ('views.sharedHint' | translate) : ''">
            {{ v.name }}@if (v.shared) { <span class="shared-dot">•</span> }
          </button>
          @if (v.own) {
            <button type="button" class="chip-x" (click)="remove(v)" [title]="'common.delete' | translate">✕</button>
          }
        </span>
      } @empty {
        <span class="views-empty">{{ 'views.empty' | translate }}</span>
      }

      @if (saving()) {
        <span class="save-box">
          <input
            class="field save-input"
            name="viewName"
            [(ngModel)]="newName"
            [attr.placeholder]="'views.namePlaceholder' | translate"
            (keydown.enter)="save()"
            (keydown.escape)="saving.set(false)"
          />
          <label class="share-toggle" [title]="'views.shareHint' | translate">
            <input type="checkbox" name="viewShared" [(ngModel)]="newShared" />
            <span>{{ 'views.share' | translate }}</span>
          </label>
          <button type="button" class="chip-btn primary" [disabled]="!newName.trim()" (click)="save()">
            {{ 'common.save' | translate }}
          </button>
          <button type="button" class="chip-btn" (click)="saving.set(false)">{{ 'common.cancel' | translate }}</button>
        </span>
      } @else {
        <button type="button" class="chip-btn" (click)="startSave()">+ {{ 'views.save' | translate }}</button>
      }

      @if (error()) { <span class="views-err">{{ error() }}</span> }
    </div>
  `,
  styles: [
    `
      .views {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding: 8px 12px;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-radius: var(--radius-m);
      }
      .views-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
      }
      .views-empty { font-size: 12.5px; color: var(--text-tertiary); }
      .views-err { font-size: 12.5px; color: var(--red); }
      .view-chip {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--hairline-strong);
        border-radius: 980px;
        overflow: hidden;
        background: var(--surface);
      }
      .view-chip.on { background: var(--ink); border-color: var(--ink); }
      .view-chip.on .chip-main { color: #fff; }
      .chip-main {
        border: none;
        background: transparent;
        padding: 4px 10px;
        font-size: 12.5px;
        font-weight: 550;
        font-family: inherit;
        color: var(--text);
        cursor: pointer;
      }
      .chip-main:hover { background: var(--fill); }
      .view-chip.on .chip-main:hover { background: transparent; }
      .shared-dot { color: var(--gold-strong); margin-left: 4px; }
      .chip-x {
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        padding: 4px 8px 4px 2px;
        font-size: 11px;
      }
      .chip-x:hover { color: var(--red); }
      .chip-btn {
        border: 1px solid var(--hairline-strong);
        background: var(--surface);
        border-radius: 980px;
        padding: 4px 11px;
        font-size: 12px;
        font-weight: 550;
        font-family: inherit;
        color: var(--text);
        cursor: pointer;
      }
      .chip-btn:hover:not(:disabled) { background: var(--fill); }
      .chip-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .chip-btn.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
      .save-box { display: inline-flex; align-items: center; gap: 8px; }
      .save-input { width: 160px; padding: 4px 10px; font-size: 12.5px; }
      .share-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
      .share-toggle input { width: 14px; height: 14px; accent-color: var(--gold-strong); }
    `,
  ],
})
export class SavedViewsComponent {
  private readonly http = inject(HttpClient);

  /** Sezione della lista (products, deliveries, ...). */
  readonly section = input.required<string>();
  /** Stato corrente della lista, salvato quando si crea una vista. */
  readonly current = input.required<Record<string, unknown>>();
  /** Emesso quando l'utente clicca una vista: la lista deve applicarne il config. */
  readonly applyView = output<Record<string, unknown>>();

  readonly views = signal<SavedView[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  newName = '';
  newShared = false;

  constructor() {
    // input() non e' leggibile nel constructor: il caricamento parte al primo tick
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.http
      .get<SavedView[]>(`${environment.apiUrl}/saved-views`, { params: { section: this.section() } })
      .subscribe({
        next: (v) => this.views.set(v),
        error: () => this.views.set([]),
      });
  }

  apply(v: SavedView): void {
    this.activeId.set(v.id);
    this.applyView.emit(v.config);
  }

  startSave(): void {
    this.error.set(null);
    this.newName = '';
    this.newShared = false;
    this.saving.set(true);
  }

  save(): void {
    const name = this.newName.trim();
    if (!name) return;
    this.http
      .post<SavedView>(`${environment.apiUrl}/saved-views`, {
        section: this.section(),
        name,
        config: this.current(),
        shared: this.newShared,
      })
      .subscribe({
        next: (v) => {
          this.views.update((list) => [...list, v]);
          this.activeId.set(v.id);
          this.saving.set(false);
        },
        error: (err) => this.error.set(err?.error?.message ?? 'Errore'),
      });
  }

  remove(v: SavedView): void {
    this.http.delete(`${environment.apiUrl}/saved-views/${v.id}`).subscribe({
      next: () => {
        this.views.update((list) => list.filter((x) => x.id !== v.id));
        if (this.activeId() === v.id) this.activeId.set(null);
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Errore'),
    });
  }
}
