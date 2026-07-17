import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

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

const ROLE_OPTIONS = ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER', 'VALET'];

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
      <button class="btn btn-primary" (click)="showCreate.set(!showCreate())">
        {{ (showCreate() ? 'common.cancel' : 'users.new') | translate }}
      </button>
    </div>

    @if (showCreate()) {
      <section class="card create">
        <div class="grid">
          <label class="fld"><span>{{ 'users.form.firstName' | translate }} *</span>
            <input class="field" [(ngModel)]="draft.firstName" /></label>
          <label class="fld"><span>{{ 'users.form.lastName' | translate }} *</span>
            <input class="field" [(ngModel)]="draft.lastName" /></label>
          <label class="fld"><span>{{ 'users.form.email' | translate }} *</span>
            <input class="field" type="email" [(ngModel)]="draft.email" /></label>
          <label class="fld"><span>{{ 'users.form.role' | translate }} *</span>
            <select class="field" [(ngModel)]="draft.role">
              @for (r of roleOptions; track r) { <option [value]="r">{{ 'role.' + r | translate }}</option> }
            </select></label>
        </div>
        <p class="hint">{{ 'users.form.inviteHint' | translate }}</p>
        @if (createError()) { <div class="error-card">{{ createError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="creating()" (click)="create()">
            {{ creating() ? ('common.saving' | translate) : ('users.form.createInvite' | translate) }}
          </button>
        </div>
      </section>
    }

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
          @for (u of users(); track u.id) {
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
          @if (!users().length) { <tr><td colspan="6" class="muted empty">{{ 'users.empty' | translate }}</td></tr> }
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
      .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .create { padding: 20px 22px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .hint { margin: 12px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
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
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class UsersListComponent {
  private readonly http = inject(HttpClient);
  readonly users = signal<ManagedUser[]>([]);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly inviteLink = signal<string | null>(null);
  readonly showCreate = signal(false);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly roleOptions = ROLE_OPTIONS;

  draft = { firstName: '', lastName: '', email: '', role: 'OPERATION' };

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

  create(): void {
    this.createError.set(null);
    if (!this.draft.firstName.trim() || !this.draft.lastName.trim() || !this.draft.email.trim()) {
      this.createError.set('Nome, cognome ed email sono obbligatori.');
      return;
    }
    this.creating.set(true);
    // Senza password: l'utente viene creato "invitato".
    this.http.post<ManagedUser & { inviteToken?: string }>(`${environment.apiUrl}/users`, {
      firstName: this.draft.firstName.trim(),
      lastName: this.draft.lastName.trim(),
      email: this.draft.email.trim(),
      role: this.draft.role,
    }).subscribe({
      next: (u) => {
        this.creating.set(false);
        this.showCreate.set(false);
        this.draft = { firstName: '', lastName: '', email: '', role: 'OPERATION' };
        this.load();
        if (u.inviteToken) {
          const link = `${window.location.origin}/invite/${u.inviteToken}`;
          this.inviteLink.set(link);
          this.copyToClipboard(link);
        }
      },
      error: (err) => {
        this.creating.set(false);
        this.createError.set(err?.error?.message ?? 'Errore nella creazione');
      },
    });
  }

  copyToClipboard(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.banner.set('Link di invito copiato negli appunti'),
      () => { /* clipboard non disponibile: il link resta mostrato */ },
    );
  }
}
