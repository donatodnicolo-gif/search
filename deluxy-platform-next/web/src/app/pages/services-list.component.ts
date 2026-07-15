import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { SERVICE_PRICING_LABELS, SERVICE_SCOPE_LABELS, ServiceType } from '../core/models';

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>Servizi</h1>
        <p class="page-caption">{{ services().length }} servizi (partner e valet).</p>
      </div>
      <div class="head-actions">
        <select class="field" [(ngModel)]="scopeFilter">
          <option value="">Tutti</option>
          <option value="partner">Partner</option>
          <option value="valet">Valet</option>
        </select>
        <a routerLink="/services/new" class="btn btn-primary">+ Aggiungi servizio</a>
      </div>
    </div>

    @if (loading()) { <div class="card state-card">Caricamento…</div> }
    @else if (error()) { <div class="error-card">{{ error() }}</div> }
    @else if (filtered().length === 0) {
      <div class="card state-card"><strong>Nessun servizio.</strong><span class="muted">Aggiungine uno.</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>Tipo</th><th>Destinazione</th><th>Note</th></tr></thead>
          <tbody>
            @for (s of filtered(); track s.id) {
              <tr>
                <td class="strong">{{ s.name }}</td>
                <td><span class="pill pill-neutral">{{ typeLabel(s.pricingModel) }}</span></td>
                <td><span class="pill pill-gold">{{ scopeLabel(s.scope) }}</span></td>
                <td class="muted">{{ s.notes || '—' }}</td>
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
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .pill { display: inline-flex; align-items: center; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .pill-gold { background: var(--gold-soft); color: var(--gold-strong); }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class ServicesListComponent {
  private readonly http = inject(HttpClient);

  readonly services = signal<ServiceType[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  scopeFilter = '';

  readonly filtered = computed(() => {
    const f = this.scopeFilter;
    if (!f) return this.services();
    return this.services().filter((s) => s.scope === f || s.scope === 'both');
  });

  constructor() {
    this.http.get<ServiceType[]>(`${environment.apiUrl}/service-types`).subscribe({
      next: (d) => { this.services.set(d); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? 'Errore nel caricamento'); },
    });
  }

  typeLabel(t: string): string { return SERVICE_PRICING_LABELS[t] ?? t; }
  scopeLabel(s?: string): string { return SERVICE_SCOPE_LABELS[s ?? 'partner'] ?? s ?? '—'; }
}
