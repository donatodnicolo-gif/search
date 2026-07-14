import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { Valet } from '../core/models';

@Component({
  selector: 'app-valets-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <h1>Valet</h1>
        <p class="page-caption">{{ valets().length }} valet in rete.</p>
      </div>
      <div class="head-actions">
        <input class="field" placeholder="Cerca…" [(ngModel)]="query" />
        <a routerLink="/valets/new" class="btn btn-primary">+ Aggiungi valet</a>
      </div>
    </div>

    @if (loading()) {
      <div class="card state-card">Caricamento valet…</div>
    } @else if (error()) {
      <div class="error-card">{{ error() }}</div>
    } @else if (filtered().length === 0) {
      <div class="card state-card">
        <strong>Nessun valet trovato.</strong>
        <span class="muted">Aggiungine uno con “Aggiungi valet”.</span>
      </div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cognome</th>
              <th>Nome</th>
              <th>Email</th>
              <th>Telefono</th>
              <th>Province</th>
              <th>Mezzo</th>
              <th>Team leader</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            @for (v of filtered(); track v.id) {
              <tr>
                <td class="strong">{{ v.lastName }}</td>
                <td>{{ v.firstName }}</td>
                <td class="muted">{{ v.email }}</td>
                <td>{{ v.phone || '—' }}</td>
                <td>
                  @for (vp of (v.provinces || []); track vp.province.id) {
                    <span class="pill pill-neutral">{{ vp.province.code }}</span>
                  } @empty { <span class="muted">—</span> }
                </td>
                <td>{{ v.vehicle || '—' }}</td>
                <td>
                  @if (v.isTeamLeader) { <span class="pill s-tl">Team leader</span> }
                  @else { <span class="muted">—</span> }
                </td>
                <td>
                  @if (v.active) { <span class="pill s-active"><span class="dot"></span>Attivo</span> }
                  @else { <span class="pill pill-neutral">Disattivo</span> }
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
      tbody tr { transition: background 0.14s var(--ease); }
      tbody tr:hover { background: rgba(120,120,128,0.05); }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 550; }
      .muted { color: var(--text-tertiary); }
      .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; margin-right: 4px; }
      .pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.85; }
      .pill-neutral { background: var(--fill); color: var(--text-secondary); }
      .s-active { background: rgba(36,138,61,0.12); color: var(--green); }
      .s-tl { background: var(--gold-soft); color: var(--gold-strong); }
      .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 24px; }
    `,
  ],
})
export class ValetsListComponent {
  private readonly http = inject(HttpClient);

  readonly valets = signal<Valet[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  query = '';

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.valets();
    return this.valets().filter(
      (v) =>
        v.lastName.toLowerCase().includes(q) ||
        v.firstName.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q),
    );
  });

  constructor() {
    this.http.get<Valet[]>(`${environment.apiUrl}/valets`).subscribe({
      next: (d) => {
        this.valets.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Errore nel caricamento dei valet');
      },
    });
  }
}
