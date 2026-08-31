import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';
import { LanguageSwitcherComponent } from '../layout/language-switcher.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, TranslatePipe, LanguageSwitcherComponent],
  template: `
    <div class="login-page">
      <app-language-switcher />
      <form class="login-card" (ngSubmit)="submit()">
        <div class="logo">
          <span class="logo-d">D</span>
        </div>
        <h1>Deluxy</h1>
        <p class="subtitle">{{ 'login.subtitle' | translate }}</p>

        <div class="fields">
          <input
            id="email"
            name="email"
            type="email"
            autofocus
            [(ngModel)]="email"
            required
            autocomplete="username"
            [placeholder]="'login.email' | translate"
            aria-label="Email"
          />
          <input
            id="password"
            name="password"
            type="password"
            [(ngModel)]="password"
            required
            autocomplete="current-password"
            [placeholder]="'login.password' | translate"
            aria-label="Password"
          />
        </div>

        @if (error()) {
          <div class="error">{{ error() }}</div>
        }

        <button type="submit" [disabled]="loading()">
          {{ (loading() ? 'login.submitting' : 'login.submit') | translate }}
        </button>

        <!-- Recupero password: il pannello sostituisce i campi, non un'altra
             pagina — chi ha dimenticato la password è già nel posto giusto. -->
        @if (!recupero()) {
          <button type="button" class="link-recupero" (click)="recupero.set(true)">
            {{ 'login.forgot' | translate }}
          </button>
        } @else {
          <div class="recupero-box">
            @if (!recuperoInviato()) {
              <p class="recupero-testo">{{ 'login.forgotHint' | translate }}</p>
              <input
                name="emailRecupero"
                type="email"
                [(ngModel)]="emailRecupero"
                autocomplete="username"
                [placeholder]="'login.email' | translate"
                aria-label="Email"
              />
              @if (recuperoErrore(); as e) { <div class="error">{{ e }}</div> }
              <div class="recupero-azioni">
                <button type="button" class="secondario" (click)="recupero.set(false)">
                  {{ 'common.cancel' | translate }}
                </button>
                <button type="button" [disabled]="recuperoInCorso()" (click)="chiediRecupero()">
                  {{ (recuperoInCorso() ? 'login.submitting' : 'login.forgotSend') | translate }}
                </button>
              </div>
            } @else {
              <!-- Messaggio identico esista o no l'account: non si rivela nulla. -->
              <p class="recupero-testo ok">{{ 'login.forgotDone' | translate }}</p>
            }
          </div>
        }

        <p class="footnote">{{ 'app.tagline' | translate }}</p>
      </form>
    </div>
  `,
  styles: [
    `
      .link-recupero {
        margin-top: 14px;
        border: none;
        background: none;
        font: inherit;
        font-size: 13px;
        color: var(--text-secondary);
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .link-recupero:hover { color: var(--text); }
      .recupero-box {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid var(--hairline);
        display: flex;
        flex-direction: column;
        gap: 10px;
        text-align: left;
      }
      .recupero-testo { margin: 0; font-size: 13px; color: var(--text-secondary); }
      .recupero-testo.ok { color: var(--green); }
      .recupero-azioni { display: flex; gap: 8px; justify-content: flex-end; }
      .recupero-azioni .secondario { background: var(--fill); color: var(--text); }
      .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          radial-gradient(1100px 600px at 20% -10%, rgba(184, 150, 62, 0.14), transparent 60%),
          radial-gradient(900px 600px at 110% 110%, rgba(17, 19, 24, 0.1), transparent 55%),
          var(--bg);
      }
      .login-card {
        background: var(--surface-translucent);
        -webkit-backdrop-filter: blur(30px) saturate(180%);
        backdrop-filter: blur(30px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 24px;
        padding: 44px 40px 32px;
        width: 100%;
        max-width: 400px;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-float);
      }
      .logo {
        display: flex;
        justify-content: center;
        margin-bottom: 14px;
      }
      .logo-d {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 60px;
        height: 60px;
        border-radius: 15px;
        background: linear-gradient(145deg, #1d1f26, #3a3d47);
        color: var(--gold);
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 34px;
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 6px 18px rgba(0, 0, 0, 0.28);
      }
      h1 {
        text-align: center;
        margin: 4px 0 6px;
        font-size: 28px;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      .subtitle {
        text-align: center;
        color: var(--text-secondary);
        margin: 0 0 28px;
        font-size: 14px;
      }
      .fields {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--hairline-strong);
        border-radius: 12px;
        overflow: hidden;
        background: var(--surface);
        transition: box-shadow 0.18s var(--ease), border-color 0.18s var(--ease);
      }
      .fields:focus-within {
        border-color: var(--gold);
        box-shadow: 0 0 0 4px var(--gold-soft);
      }
      input {
        border: none;
        background: transparent;
        padding: 13px 14px;
        font-size: 15px;
        font-family: inherit;
        color: var(--text);
        outline: none;
      }
      input::placeholder {
        color: var(--text-tertiary);
      }
      input + input {
        border-top: 1px solid var(--hairline);
      }
      button {
        appearance: none;
        background: var(--ink);
        color: #fff;
        border: none;
        border-radius: 980px;
        padding: 13px;
        font-size: 15px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        margin-top: 20px;
        transition: transform 0.15s var(--ease), background 0.18s var(--ease),
          opacity 0.18s var(--ease);
      }
      button:hover:not(:disabled) {
        background: #2a2d35;
      }
      button:active:not(:disabled) {
        transform: scale(0.98);
      }
      button:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .error {
        background: rgba(215, 0, 21, 0.08);
        color: var(--red);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
        margin-top: 14px;
      }
      .footnote {
        text-align: center;
        color: var(--text-tertiary);
        font-size: 12px;
        margin: 22px 0 0;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Recupero password: pannello aperto, invio in corso, richiesta mandata. */
  emailRecupero = '';
  readonly recupero = signal(false);
  readonly recuperoInCorso = signal(false);
  readonly recuperoInviato = signal(false);
  readonly recuperoErrore = signal<string | null>(null);

  chiediRecupero(): void {
    const email = this.emailRecupero.trim();
    if (!email) return;
    this.recuperoInCorso.set(true);
    this.auth.passwordDimenticata(email).subscribe({
      // La risposta è identica esista o no l'account: qui si mostra SEMPRE
      // lo stesso messaggio, anche su errore di rete — nessun canale laterale.
      next: () => { this.recuperoInCorso.set(false); this.recuperoInviato.set(true); },
      error: () => { this.recuperoInCorso.set(false); this.recuperoInviato.set(true); },
    });
  }

  submit(): void {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.email, this.password).subscribe({
      // 31/08: la vetrina /home e' NASCOSTA per ora (deciso dall'utente) —
      // tutti atterrano sulle consegne. La rotta /home resta raggiungibile
      // a mano per il PARTNER, solo non e' piu' la prima schermata.
      // Se la password è da cambiare (bonifica), si va PRIMA a cambiarla.
      next: () => this.router.navigate([
        this.auth.user()?.mustChangePassword ? '/cambia-password' : '/deliveries',
      ]),
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message ?? this.translate.instant('login.genericError'),
        );
      },
    });
  }
}
