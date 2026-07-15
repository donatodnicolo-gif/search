import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { PRODUCT_TYPE_LABELS, ProductRef } from '../core/models';

@Component({
  selector: 'app-products-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>Prodotti</h1>
        <p class="page-caption">{{ products().length }} prodotti a catalogo.</p>
      </div>
      <div class="head-actions">
        <input class="field" placeholder="Cerca…" [(ngModel)]="query" />
        <a routerLink="/products/new" class="btn btn-primary">+ Aggiungi prodotto</a>
      </div>
    </div>

    @if (loading()) { <div class="card state-card">Caricamento…</div> }
    @else if (error()) { <div class="error-card">{{ error() }}</div> }
    @else if (filtered().length === 0) {
      <div class="card state-card"><strong>Nessun prodotto.</strong><span class="muted">Aggiungine uno.</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>SKU</th><th>Categoria</th><th>Tipo</th><th>Partner</th><th class="num">Prezzo</th><th>Stato</th></tr></thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr>
                <td class="strong">{{ p.name }}</td>
                <td class="mono muted">{{ p.sku || '—' }}</td>
                <td>{{ p.category?.name || '—' }}</td>
                <td><span class="pill pill-neutral">{{ typeLabel(p.type) }}</span></td>
                <td class="muted">{{ p.partner?.insegna || '—' }}</td>
                <td class="num strong">{{ p.price != null ? (p.price + ' €') : '—' }}</td>
                <td>
                  @if (p.active === false) { <span class="pill pill-neutral">Disattivo</span> }
                  @else if (p.approved) { <span class="pill s-ok"><span class="dot"></span>Approvato</span> }
                  @else { <span class="pill s-wait"><span class="dot"></span>Da approvare</span> }
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
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class ProductsListComponent {
  private readonly http = inject(HttpClient);

  readonly products = signal<ProductRef[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  query = '';

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.products();
    return this.products().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.category?.name || '').toLowerCase().includes(q),
    );
  });

  constructor() {
    this.http.get<ProductRef[]>(`${environment.apiUrl}/products`).subscribe({
      next: (d) => { this.products.set(d); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? 'Errore nel caricamento'); },
    });
  }

  typeLabel(type?: string): string {
    return type ? PRODUCT_TYPE_LABELS[type] ?? type : '—';
  }
}
