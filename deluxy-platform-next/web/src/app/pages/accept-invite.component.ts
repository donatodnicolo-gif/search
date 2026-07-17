import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { LoginResponse } from '../core/models';

/** Pagina pubblica: la persona invitata sceglie la propria password e attiva l'account. */
@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="wrap">
      <div class="card box">
        <div class="brand">Deluxy</div>
        @if (loading()) {
          <p class="muted">{{ 'acceptInvite.loading' | translate }}</p>
        } @else if (invalid()) {
          <h1>{{ 'acceptInvite.invalidTitle' | translate }}</h1>
          <p class="muted">{{ invalid() }}</p>
        } @else {
          <h1>{{ 'acceptInvite.title' | translate }}</h1>
          <p class="muted">{{ 'acceptInvite.welcome' | translate:{ name: fullName() } }} ({{ email() }})</p>
          <label class="fld"><span>{{ 'acceptInvite.password' | translate }}</span>
            <input class="field" type="password" [(ngModel)]="password" autocomplete="new-password" /></label>
          <label class="fld"><span>{{ 'acceptInvite.confirm' | translate }}</span>
            <input class="field" type="password" [(ngModel)]="confirm" autocomplete="new-password" /></label>
          @if (error()) { <div class="error-card">{{ error() }}</div> }
          <button class="btn btn-primary full" [disabled]="saving()" (click)="submit()">
            {{ saving() ? ('common.saving' | translate) : ('acceptInvite.submit' | translate) }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg, #F5F5F7); }
      .box { width: 100%; max-width: 380px; padding: 32px 28px; display: flex; flex-direction: column; gap: 12px; }
      .brand { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; margin-bottom: 6px; }
      h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
      .muted { color: var(--text-secondary); font-size: 14px; margin: 0; }
      .fld { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .full { width: 100%; justify-content: center; margin-top: 8px; }
      .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 12px 14px; border-radius: 12px; font-size: 13px; }
    `,
  ],
})
export class AcceptInviteComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  readonly loading = signal(true);
  readonly invalid = signal<string | null>(null);
  readonly email = signal('');
  readonly fullName = signal('');
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);

  password = '';
  confirm = '';

  constructor() {
    this.http.get<{ email: string; firstName: string; lastName: string }>(
      `${environment.apiUrl}/auth/invite/${this.token}`,
    ).subscribe({
      next: (r) => {
        this.email.set(r.email);
        this.fullName.set(`${r.firstName} ${r.lastName}`.trim());
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.invalid.set(err?.error?.message ?? 'Invito non valido o scaduto');
      },
    });
  }

  submit(): void {
    this.error.set(null);
    if (this.password.length < 8) { this.error.set('La password deve avere almeno 8 caratteri.'); return; }
    if (this.password !== this.confirm) { this.error.set('Le password non coincidono.'); return; }
    this.saving.set(true);
    this.http.post<LoginResponse>(`${environment.apiUrl}/auth/accept-invite`, {
      token: this.token,
      password: this.password,
    }).subscribe({
      next: (res) => { this.auth.setSession(res); this.router.navigate(['/']); },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Errore nell\'attivazione');
      },
    });
  }
}
