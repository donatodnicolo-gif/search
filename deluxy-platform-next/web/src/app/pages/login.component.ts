import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-page">
      <form class="login-card" (ngSubmit)="submit()">
        <div class="logo">
          <span class="logo-d">D</span>
        </div>
        <h1>Deluxy Platform</h1>
        <p class="subtitle">Consegne in guanti bianchi</p>

        <label for="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          [(ngModel)]="email"
          required
          autocomplete="username"
          placeholder="nome@deluxy.it"
        />

        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          [(ngModel)]="password"
          required
          autocomplete="current-password"
          placeholder="********"
        />

        @if (error()) {
          <div class="error">{{ error() }}</div>
        }

        <button type="submit" [disabled]="loading()">
          {{ loading() ? 'Accesso in corso...' : 'Accedi' }}
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--deluxy-dark);
      }
      .login-card {
        background: var(--deluxy-white);
        border-radius: 14px;
        padding: 40px 36px;
        width: 100%;
        max-width: 380px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      }
      .logo {
        display: flex;
        justify-content: center;
        margin-bottom: 10px;
      }
      .logo-d {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        border-radius: 12px;
        background: var(--deluxy-dark);
        color: var(--deluxy-gold);
        font-family: Georgia, serif;
        font-size: 30px;
        font-weight: bold;
      }
      h1 {
        text-align: center;
        margin: 6px 0 2px;
        font-size: 22px;
      }
      .subtitle {
        text-align: center;
        color: var(--deluxy-muted);
        margin: 0 0 24px;
        font-size: 13px;
      }
      label {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
      }
      input {
        border: 1px solid var(--deluxy-border);
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
        margin-bottom: 16px;
        outline: none;
      }
      input:focus {
        border-color: var(--deluxy-gold);
      }
      button {
        background: var(--deluxy-dark);
        color: var(--deluxy-gold);
        border: none;
        border-radius: 8px;
        padding: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        margin-top: 6px;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .error {
        background: #fde8e8;
        color: #b91c1c;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 13px;
        margin-bottom: 10px;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.router.navigate(['/deliveries']),
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message ?? 'Credenziali non valide o server non raggiungibile',
        );
      },
    });
  }
}
