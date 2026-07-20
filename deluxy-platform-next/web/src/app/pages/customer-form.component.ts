import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { Partner } from '../core/models';

/** Form cliente: crea (POST) oppure modifica (PUT) in base alla rotta. */
@Component({
  selector: 'app-customer-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="form-head">
      <a routerLink="/customers" class="back">← {{ 'customers.title' | translate }}</a>
      <h1>{{ (editId() ? 'customerForm.editTitle' : 'customerForm.title') | translate }}</h1>
      <p class="page-caption">{{ 'customerForm.caption' | translate }}</p>
    </div>

    <form (ngSubmit)="submit()" class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>{{ 'customerForm.section.general' | translate }}</h2>
          <span class="block-sub">{{ 'customerForm.requiredNote' | translate }}</span></header>
        <div class="grid-2">
          <label class="fld"><span>{{ 'customers.col.lastName' | translate }} *</span>
            <input class="field" name="lastName" [(ngModel)]="model.lastName" required /></label>
          <label class="fld"><span>{{ 'customers.col.firstName' | translate }} *</span>
            <input class="field" name="firstName" [(ngModel)]="model.firstName" required /></label>
          <label class="fld"><span>{{ 'customers.col.email' | translate }}</span>
            <input class="field" type="email" name="email" [(ngModel)]="model.email" /></label>
          <label class="fld"><span>{{ 'customers.col.phone' | translate }}</span>
            <input class="field" name="phone" [(ngModel)]="model.phone" placeholder="+39 …" /></label>
          <!-- Partner di provenienza: solo admin/operation. Per il ruolo
               partner lo imposta l'API col proprio partner. -->
          @if (canChoosePartner()) {
            <label class="fld span-2"><span>{{ 'customerForm.partner' | translate }} <em>{{ 'customerForm.partnerHint' | translate }}</em></span>
              <select class="field" name="partnerId" [(ngModel)]="model.partnerId">
                <option value="">{{ 'customerForm.noPartner' | translate }}</option>
                @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
              </select></label>
          }
          <label class="fld span-2"><span>{{ 'customers.col.address' | translate }}</span>
            <input class="field" name="address" [(ngModel)]="model.address" [attr.placeholder]="'customerForm.addressPlaceholder' | translate" /></label>
          <label class="fld span-2"><span>{{ 'customerForm.notes' | translate }}</span>
            <textarea class="field" rows="3" name="notes" [(ngModel)]="model.notes"></textarea></label>
        </div>
      </section>

      @if (error()) { <div class="error-card card">{{ error() }}</div> }

      <div class="actions">
        <a routerLink="/customers" class="btn btn-secondary">{{ 'common.cancel' | translate }}</a>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">
          {{ saving() ? ('common.saving' | translate) : ((editId() ? 'common.save' : 'customerForm.submit') | translate) }}
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
      .span-2 { grid-column: 1 / -1; }
      textarea.field { resize: vertical; font-family: inherit; width: 100%; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; }
      .actions .btn { text-decoration: none; display: inline-flex; align-items: center; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } }
    `,
  ],
})
export class CustomerFormComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly editId = signal<string | null>(null);
  readonly partners = signal<Partner[]>([]);

  model = { firstName: '', lastName: '', email: '', phone: '', address: '', notes: '', partnerId: '' };

  /**
   * Solo admin/operation scelgono da quale partner proviene il cliente:
   * al ruolo partner l'API forza il proprio.
   */
  canChoosePartner(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  constructor() {
    if (this.canChoosePartner()) {
      this.http
        .get<Partner[]>(`${environment.apiUrl}/partners`)
        .subscribe((d) => this.partners.set(d));
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.http.get<Record<string, any>>(`${environment.apiUrl}/customers/${id}`).subscribe({
        next: (c) => {
          for (const k of Object.keys(this.model)) {
            if (c[k] != null) (this.model as Record<string, any>)[k] = c[k];
          }
        },
        error: (err) =>
          this.error.set(err?.error?.message ?? this.translate.instant('common.loadError')),
      });
    }
  }

  submit(): void {
    this.error.set(null);
    const m = this.model;
    if (!m.firstName.trim() || !m.lastName.trim()) {
      this.error.set(this.translate.instant('customerForm.error.required'));
      return;
    }
    const payload: Record<string, unknown> = {
      firstName: m.firstName.trim(),
      lastName: m.lastName.trim(),
    };
    for (const k of ['email', 'phone', 'address', 'notes'] as const) {
      if (m[k].trim()) payload[k] = m[k].trim();
    }
    // Partner di provenienza: solo se l'utente puo' sceglierlo. In modifica
    // invio anche la stringa vuota (= nessun partner), altrimenti non si
    // potrebbe togliere il partner a un cliente.
    if (this.canChoosePartner()) {
      if (m.partnerId) payload['partnerId'] = m.partnerId;
      else if (this.editId()) payload['partnerId'] = null;
    }

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.http.put(`${environment.apiUrl}/customers/${id}`, payload)
      : this.http.post(`${environment.apiUrl}/customers`, payload);
    req.subscribe({
      next: () => this.router.navigate(id ? ['/customers', id] : ['/customers']),
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? this.translate.instant('common.saveError'));
      },
    });
  }
}
