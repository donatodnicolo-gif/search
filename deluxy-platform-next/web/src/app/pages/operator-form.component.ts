import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { OPERATION_ROLE_OPTIONS } from '../core/models';

@Component({
  selector: 'app-operator-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <a routerLink="/operators" class="back">← {{ 'operatorForm.backToOperators' | translate }}</a>
        <h1>{{ (editId() ? 'operatorForm.editTitle' : 'operatorForm.title') | translate }}</h1>
        <p class="page-caption">{{ 'operatorForm.caption' | translate }}</p>
      </div>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>{{ 'operatorForm.general.title' | translate }}</h2>
          <span class="block-sub">{{ 'operatorForm.general.requiredNote' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'operatorForm.general.lastName' | translate }}</span>
            <input class="field" name="lastName" [(ngModel)]="model.lastName" required placeholder="Rossi" /></label>
          <label class="fld"><span>{{ 'operatorForm.general.firstName' | translate }}</span>
            <input class="field" name="firstName" [(ngModel)]="model.firstName" required placeholder="Giulia" /></label>
          <label class="fld"><span>{{ 'operatorForm.general.email' | translate }}</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" required placeholder="operatore@deluxy.it" /></label>
          <label class="fld"><span>{{ 'operatorForm.general.phone' | translate }}</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" placeholder="+39 …" /></label>
          <label class="fld span-2"><span>{{ 'operatorForm.general.address' | translate }}</span>
            <input class="field" name="address" [(ngModel)]="model.address" [attr.placeholder]="'operatorForm.general.addressPlaceholder' | translate" /></label>
        </div>
      </section>

      <section class="card block">
        <header class="block-head"><h2>{{ 'operatorForm.setup.title' | translate }}</h2>
          <span class="block-sub">{{ 'operatorForm.setup.subtitle' | translate }}</span></header>
        <div class="setup-group">
          <span class="group-label">{{ 'operatorForm.setup.role' | translate }}</span>
          <label class="fld" style="max-width:360px">
            <select class="field" name="operationRole" [(ngModel)]="model.operationRole">
              @for (r of roleOptions; track r.value) { <option [value]="r.value">{{ 'enums.operationRole.' + r.value | translate }}</option> }
            </select>
          </label>
          <p class="role-hint">{{ roleHint() }}</p>
        </div>
        <div class="setup-group">
          <span class="group-label">{{ 'operatorForm.setup.notifications' | translate }}</span>
          <div class="toggles">
            <label class="toggle"><input type="checkbox" name="notifyWhatsapp" [(ngModel)]="model.notifyWhatsapp" /><span>{{ 'operatorForm.setup.notifyWhatsapp' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="notifyMail" [(ngModel)]="model.notifyMail" /><span>{{ 'operatorForm.setup.notifyMail' | translate }}</span></label>
          </div>
        </div>
      </section>

      <section class="card block">
        <header class="block-head"><h2>{{ 'operatorForm.notes.title' | translate }}</h2></header>
        <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea>
      </section>

      @if (justSaved()) { <div class="ok-card card" [innerHTML]="'operatorForm.savedNotice' | translate"></div> }
      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/operators" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        @if (!editId()) {
          <button type="button" class="btn btn-secondary" [disabled]="saving()" (click)="submit(true)">{{ 'common.duplicate' | translate }}</button>
        }
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'operatorForm.submit') | translate) }}
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
      .role-hint { margin: 8px 0 0; font-size: 13px; color: var(--text-secondary); }
      .toggles { display: flex; flex-wrap: wrap; gap: 14px 18px; }
      .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
      .toggle input { width: 16px; height: 16px; accent-color: var(--gold-strong); }
      .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class OperatorFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly justSaved = signal(false);

  readonly roleOptions = OPERATION_ROLE_OPTIONS;

  model = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    operationRole: 'operation',
    notifyWhatsapp: false,
    notifyMail: true,
    notes: '',
  };

  /** Id operatore in modifica (null = nuovo operatore). */
  readonly editId = signal<string | null>(null);

  constructor() {
    // Modalita' modifica: /operators/:id/edit
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${environment.apiUrl}/operations/${id}`).subscribe({
        next: (o) => this.prefill(o),
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  /** Riempie il form con l'operatore esistente. */
  private prefill(o: Record<string, any>): void {
    const m = this.model as Record<string, any>;
    for (const key of Object.keys(this.model)) {
      const v = o[key];
      if (v === null || v === undefined) continue;
      m[key] = v;
    }
  }

  roleHint(): string {
    const value = this.roleOptions.find((r) => r.value === this.model.operationRole)?.value;
    return value ? this.translate.instant('enums.operationRoleHint.' + value) : '';
  }

  submit(duplicate = false): void {
    this.error.set(null);
    this.justSaved.set(false);
    const m = this.model;
    if (!m.firstName.trim() || !m.lastName.trim() || !m.email.trim()) {
      this.error.set(this.translate.instant('operatorForm.requiredFields'));
      return;
    }
    const payload: Record<string, unknown> = {
      firstName: m.firstName.trim(),
      lastName: m.lastName.trim(),
      email: m.email.trim(),
      operationRole: m.operationRole,
      notifyWhatsapp: m.notifyWhatsapp,
      notifyMail: m.notifyMail,
    };
    for (const key of ['phone', 'address', 'notes'] as const) {
      if (m[key].trim()) payload[key] = m[key].trim();
    }

    this.saving.set(true);
    const id = this.editId();
    // Per gli operatori l'API usa PATCH, non PUT.
    const req = id
      ? this.http.patch(`${environment.apiUrl}/operations/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/operations`, payload);
    req.subscribe({
      next: () => {
        if (id) { this.router.navigate(['/operators', id]); return; }
        if (duplicate) { this.saving.set(false); this.justSaved.set(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else this.router.navigate(['/operators']);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('operatorForm.createError'));
      },
    });
  }
}
