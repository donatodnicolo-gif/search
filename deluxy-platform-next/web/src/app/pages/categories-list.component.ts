import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { Category } from '../core/models';

@Component({
  selector: 'app-categories-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>Categorie</h1>
        <p class="page-caption">{{ categories().length }} categorie di prodotto.</p>
      </div>
      <div class="head-actions">
        <input class="field" placeholder="Cerca…" [(ngModel)]="query" />
        <a routerLink="/categories/new" class="btn btn-primary">+ Aggiungi categoria</a>
      </div>
    </div>

    @if (loading()) { <div class="card state-card">Caricamento…</div> }
    @else if (error()) { <div class="error-card">{{ error() }}</div> }
    @else if (filtered().length === 0) {
      <div class="card state-card"><strong>Nessuna categoria.</strong><span class="muted">Aggiungine una.</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Note</th><th>Campi extra</th><th>Sconti provincia</th></tr></thead>
          <tbody>
            @for (c of filtered(); track c.id) {
              <tr>
                <td class="strong">{{ c.name }}</td>
                <td class="muted">{{ c.notes || '—' }}</td>
                <td>
                  @for (f of (c.fields || []); track f.id) { <span class="pill pill-neutral">{{ f.name }}</span> }
                  @empty { <span class="muted">—</span> }
                </td>
                <td>
                  @for (d of (c.discounts || []); track d.id) { <span class="pill pill-gold">{{ d.province.code }} −{{ d.discountPercent }}%</span> }
                  @empty { <span class="muted">—</span> }
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
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); vertical-align: top; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; white-space: nowrap; }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .pill { display: inline-flex; align-items: center; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; margin: 0 4px 4px 0; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .pill-gold { background: var(--gold-soft); color: var(--gold-strong); }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class CategoriesListComponent {
  private readonly http = inject(HttpClient);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  query = '';

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.categories();
    return this.categories().filter((c) => c.name.toLowerCase().includes(q));
  });

  constructor() {
    this.http.get<Category[]>(`${environment.apiUrl}/categories`).subscribe({
      next: (d) => { this.categories.set(d); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? 'Errore nel caricamento'); },
    });
  }
}
