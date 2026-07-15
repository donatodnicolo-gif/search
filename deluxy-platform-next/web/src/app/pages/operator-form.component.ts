import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-operator-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/operators" class="back">← Operatori</a>
        <h1>Nuovo operatore</h1>
        <p class="page-caption">Staff d'ufficio. Il flag Project Manager esclude Consegne e Attività.</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>Informazioni generali</h2>
          <span class="block-sub">I campi con * sono obbligatori.</span></header>
        <div class="grid-2">
          <label class="fld"><span>Cognome *</span>
            <input class="field" name="lastName" [(ngModel)]="model.lastName" required placeholder="Rossi" /></label>
          <label class="fld"><span>Nome *</span>
            <input class="field" name="firstName" [(ngModel)]="model.firstName" required placeholder="Giulia" /></label>
          <label class="fld"><span>Email *</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" required placeholder="operatore@deluxy.it" /></label>
          <label class="fld"><span>Telefono *</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" placeholder="+39 …" /></label>
          <label class="fld span-2"><span>Indirizzo *</span>
            <input class="field" name="address" [(ngModel)]="model.address" placeholder="Via …, CAP Città (PR)" /></label>
        </div>
      </section>

      <section class="card block">
        <header class="block-head"><h2>Setup</h2>
          <span class="block-sub">Ruolo e notifiche.</span></header>
        <div class="setup-group">
          <span class="group-label">Ruolo</span>
          <label class="toggle"><input type="checkbox" name="isProjectManager" [(ngModel)]="model.isProjectManager" /><span>Project Manager <em>(come Operation, senza Consegne e Attività)</em></span></label>
        </div>
        <div class="setup-group">
          <span class="group-label">Notifiche</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="notifyWhatsapp" [(ngModel)]="model.notifyWhatsapp" /><span>Notifiche WhatsApp</span></label>
            <label class="toggle"><input type="checkbox" name="notifyMail" [(ngModel)]="model.notifyMail" /><span>Notifiche mail</span></label>
          </div>
        </div>
      </section>

      <section class="card block">
        <header class="block-head"><h2>Note</h2></header>
        <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea>
      </section>

      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/operators" class="btn btn-secondary">Annulla</a>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? 'Salvataggio…' : 'Crea operatore' }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      .back { font-size: 13px; color: var(--text-secondary); }
      .back:hover { color: var(--text); }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .fld em { color: var(--text-tertiary); font-style: normal; font-weight: 400; }
      .span-2 { grid-column: 1 / -1; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .setup-group { padding: 14px 0; border-bottom: 1px solid var(--hairline); }
      .setup-group:last-child { border-bottom: none; padding-bottom: 0; }
      .setup-group:first-child { padding-top: 0; }
      .group-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 10px; }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class OperatorFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  model = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    isProjectManager: false,
    notifyWhatsapp: false,
    notifyMail: true,
    notes: '',
  };

  submit(): void {
    this.error.set(null);
    const m = this.model;
    if (!m.firstName.trim() || !m.lastName.trim() || !m.email.trim()) {
      this.error.set('Nome, cognome ed email sono obbligatori.');
      return;
    }
    const payload: Record<string, unknown> = {
      firstName: m.firstName.trim(),
      lastName: m.lastName.trim(),
      email: m.email.trim(),
      isProjectManager: m.isProjectManager,
      notifyWhatsapp: m.notifyWhatsapp,
      notifyMail: m.notifyMail,
    };
    for (const key of ['phone', 'address', 'notes'] as const) {
      if (m[key].trim()) payload[key] = m[key].trim();
    }

    this.saving.set(true);
    this.http.post(`${environment.apiUrl}/operations`, payload).subscribe({
      next: () => this.router.navigate(['/operators']),
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nella creazione dell\'operatore');
      },
    });
  }
}
