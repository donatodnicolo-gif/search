import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

/**
 * Cambio password da utente loggato. È la pagina del CAMBIO OBBLIGATORIO al
 * primo accesso (bonifica delle password deboli, 31/08): finché la password è
 * temporanea, il guard rimanda qui e non si può fare altro. Vale anche come
 * cambio volontario.
 */
@Component({
  selector: 'app-cambia-password',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="wrap">
      <div class="card box">
        <div class="brand">Deluxy</div>
        @if (obbligatorio()) {
          <h1>{{ 'changePassword.forcedTitle' | translate }}</h1>
          <p class="muted">{{ 'changePassword.forcedHint' | translate }}</p>
        } @else {
          <h1>{{ 'changePassword.title' | translate }}</h1>
        }

        <label class="fld"><span>{{ 'changePassword.current' | translate }}</span>
          <input class="field" type="password" [(ngModel)]="attuale" autocomplete="current-password" /></label>
        <label class="fld"><span>{{ 'changePassword.new' | translate }}</span>
          <input class="field" type="password" [(ngModel)]="nuova" autocomplete="new-password" /></label>
        <label class="fld"><span>{{ 'changePassword.confirm' | translate }}</span>
          <input class="field" type="password" [(ngModel)]="conferma" autocomplete="new-password" /></label>

        @if (errore(); as e) { <div class="error-card">{{ e }}</div> }

        <button class="btn btn-primary full" [disabled]="salvando()" (click)="salva()">
          {{ salvando() ? ('common.saving' | translate) : ('changePassword.submit' | translate) }}
        </button>
        @if (!obbligatorio()) {
          <button type="button" class="btn btn-secondary full" (click)="indietro()">{{ 'common.cancel' | translate }}</button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--bg, #F5F5F7); }
      .box { width: 100%; max-width: 400px; padding: 32px 28px; display: flex; flex-direction: column; gap: 12px; }
      .brand { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; margin-bottom: 6px; }
      h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
      .muted { color: var(--text-secondary); font-size: 14px; margin: 0; }
      .fld { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .full { width: 100%; justify-content: center; margin-top: 6px; }
    `,
  ],
})
export class CambiaPasswordComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  attuale = '';
  nuova = '';
  conferma = '';
  readonly salvando = signal(false);
  readonly errore = signal<string | null>(null);
  readonly obbligatorio = computed(() => this.auth.user()?.mustChangePassword === true);

  salva(): void {
    this.errore.set(null);
    if (this.nuova.length < 8) { this.errore.set(this.translate.instant('changePassword.tooShort')); return; }
    if (this.nuova !== this.conferma) { this.errore.set(this.translate.instant('changePassword.mismatch')); return; }
    this.salvando.set(true);
    this.http.post(`${environment.apiUrl}/auth/cambia-password`, { attuale: this.attuale, nuova: this.nuova })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          // Il flag è caduto: si aggiorna l'utente in sessione e si entra.
          this.auth.segnaPasswordCambiata();
          this.router.navigate(['/deliveries']);
        },
        error: (err) => {
          this.salvando.set(false);
          this.errore.set(err?.error?.message ?? this.translate.instant('changePassword.error'));
        },
      });
  }

  indietro(): void {
    this.router.navigate(['/deliveries']);
  }
}
