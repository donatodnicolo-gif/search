import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ClientTable } from '../core/client-table';

interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isSupport: boolean;
  status: 'invited' | 'active' | 'suspended' | 'archived';
  partner?: { id: string; insegna: string } | null;
  valet?: { id: string; firstName: string; lastName: string } | null;
  operation?: { id: string; firstName: string; lastName: string } | null;
  activatedAt?: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  invited: { label: 'Invitato', color: '#B8963E' },
  active: { label: 'Attivo', color: '#248A3D' },
  suspended: { label: 'Sospeso', color: '#C04C00' },
  archived: { label: 'Archiviato', color: '#8A8A8E' },
};

/** Configurazione → Utenti (solo admin): governa l'accesso, non l'operatività. */
@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="head">
      <div>
        <h1>{{ 'users.title' | translate }}</h1>
        <p class="page-caption">{{ 'users.caption' | translate }}</p>
      </div>
      <input
        class="field search"
        name="q"
        [attr.placeholder]="'common.search' | translate"
        [ngModel]="table.query()"
        (ngModelChange)="table.query.set($event)"
      />
    </div>

    @if (banner(); as b) { <div class="ok-card card">{{ b }}</div> }
    @if (error()) { <div class="error-card card">{{ error() }}</div> }

    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ 'users.col.status' | translate }}</th>
            <th>{{ 'users.col.name' | translate }}</th>
            <th>{{ 'users.col.email' | translate }}</th>
            <th>{{ 'users.col.role' | translate }}</th>
            <th>{{ 'users.col.linked' | translate }}</th>
            <th>{{ 'users.col.actions' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          @for (u of filtered(); track u.id) {
            <tr>
              <td>
                <span class="badge" [style.--c]="statusColor(u.status)">
                  <span class="dot"></span>{{ statusLabel(u.status) }}
                </span>
              </td>
              <td>{{ u.lastName }} {{ u.firstName }}</td>
              <td class="muted">{{ u.email }}</td>
              <td>{{ 'role.' + u.role | translate }}@if (u.isSupport) {<span class="support"> · support</span>}</td>
              <td class="muted">{{ linkedLabel(u) }}</td>
              <td class="row-actions">
                @if (u.status === 'invited') {
                  <button class="link-btn" (click)="copyInvite(u)">{{ 'users.action.copyInvite' | translate }}</button>
                  <button class="link-btn danger" (click)="setStatus(u, 'archived')">{{ 'users.action.archive' | translate }}</button>
                } @else if (u.status === 'active') {
                  <button class="link-btn" (click)="setStatus(u, 'suspended')">{{ 'users.action.suspend' | translate }}</button>
                  <button class="link-btn danger" (click)="setStatus(u, 'archived')">{{ 'users.action.archive' | translate }}</button>
                } @else if (u.status === 'suspended') {
                  <button class="link-btn" (click)="setStatus(u, 'active')">{{ 'users.action.reactivate' | translate }}</button>
                  <button class="link-btn danger" (click)="setStatus(u, 'archived')">{{ 'users.action.archive' | translate }}</button>
                } @else {
                  <button class="link-btn" (click)="copyInvite(u)">{{ 'users.action.reinvite' | translate }}</button>
                }
              </td>
            </tr>
          }
          @if (!filtered().length) { <tr><td colspan="6" class="muted empty">{{ 'users.empty' | translate }}</td></tr> }
        </tbody>
      </table>
    </div>

    @if (inviteLink()) {
      <div class="card invite-box">
        <strong>{{ 'users.inviteReady' | translate }}</strong>
        <p class="hint">{{ 'users.inviteShare' | translate }}</p>
        <code class="link">{{ inviteLink() }}</code>
        <button class="btn btn-secondary" (click)="copyToClipboard(inviteLink()!)">{{ 'users.action.copy' | translate }}</button>
      </div>
    }
  `,
  styles: [
    `
      .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .search { min-width: 240px; }
      .table-wrap { padding: 6px 2px; overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); padding: 12px 14px; border-bottom: 1px solid var(--hairline); }
      td { padding: 12px 14px; border-bottom: 1px solid var(--hairline); }
      tr:last-child td { border-bottom: none; }
      .muted { color: var(--text-secondary); }
      .empty { text-align: center; padding: 28px; }
      .support { color: var(--gold-strong); font-size: 12px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12.5px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
      .row-actions { display: flex; gap: 12px; white-space: nowrap; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .invite-box { margin-top: 16px; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
      .invite-box .link { display: block; width: 100%; overflow-x: auto; padding: 10px 12px; background: var(--fill); border-radius: 10px; font-family: ui-monospace, monospace; font-size: 12.5px; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
    `,
  ],
})
export class UsersListComponent {
  private readonly http = inject(HttpClient);
  readonly users = signal<ManagedUser[]>([]);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly inviteLink = signal<string | null>(null);

  /** Ricerca globale lato client (lista piccola). */
  readonly table = new ClientTable<ManagedUser>(
    [
      'email',
      'firstName',
      'lastName',
      'role',
      'status',
      'partner.insegna',
      'valet.firstName',
      'valet.lastName',
      'operation.firstName',
      'operation.lastName',
    ],
    'createdAt',
  );
  readonly filtered = computed(() => this.table.view(this.users()));

  constructor() { this.load(); }

  private load(): void {
    this.http.get<ManagedUser[]>(`${environment.apiUrl}/users`).subscribe({
      next: (u) => this.users.set(u),
      error: () => this.error.set('Errore nel caricamento degli utenti'),
    });
  }

  statusLabel(s: string): string { return STATUS_META[s]?.label ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }

  linkedLabel(u: ManagedUser): string {
    if (u.partner) return `Partner · ${u.partner.insegna}`;
    if (u.valet) return `Valet · ${u.valet.lastName} ${u.valet.firstName}`;
    if (u.operation) return `Operatore · ${u.operation.lastName} ${u.operation.firstName}`;
    return '—';
  }

  setStatus(u: ManagedUser, status: string): void {
    this.error.set(null);
    this.http.patch<ManagedUser>(`${environment.apiUrl}/users/${u.id}/status`, { status }).subscribe({
      next: () => { this.banner.set(`${u.email}: ${this.statusLabel(status)}`); this.load(); },
      error: (err) => this.error.set(err?.error?.message ?? 'Errore nel cambio di stato'),
    });
  }

  copyInvite(u: ManagedUser): void {
    this.error.set(null);
    this.http.post<{ inviteToken: string }>(`${environment.apiUrl}/users/${u.id}/resend-invite`, {}).subscribe({
      next: (r) => {
        const link = `${window.location.origin}/invite/${r.inviteToken}`;
        this.inviteLink.set(link);
        this.copyToClipboard(link);
        this.load();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Errore nella generazione dell\'invito'),
    });
  }

  copyToClipboard(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.banner.set('Link di invito copiato negli appunti'),
      () => { /* clipboard non disponibile: il link resta mostrato */ },
    );
  }
}
