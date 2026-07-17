import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface GeocodeResult {
  provinceCode: string | null;
  formattedAddress: string | null;
  source: string;
  status?: string;
}

/**
 * Configurazione → Impostazioni (solo admin): chiavi API dei servizi esterni.
 * I valori sono salvati SOLO nel database via API (mai in file o commit).
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  template: `
    <div class="form-head">
      <div>
        <h1>{{ 'settings.title' | translate }}</h1>
        <p class="page-caption">{{ 'settings.caption' | translate }}</p>
      </div>
    </div>

    <div class="form-grid">
      <section class="card block">
        <header class="block-head"><h2>{{ 'settings.apiKeys.title' | translate }}</h2>
          <span class="block-sub">{{ 'settings.apiKeys.sub' | translate }}</span></header>

        <label class="fld"><span>{{ 'settings.apiKeys.googleMaps' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showKey() ? 'text' : 'password'" name="googleMapsApiKey"
                   [(ngModel)]="model.googleMapsApiKey" autocomplete="off"
                   [attr.placeholder]="'settings.apiKeys.googleMapsPlaceholder' | translate" />
            <button type="button" class="btn btn-secondary" (click)="showKey.set(!showKey())">
              {{ (showKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.apiKeys.googleMapsHint' | translate }}</p>

        <div class="actions">
          <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">
            {{ saving() ? ('common.saving' | translate) : ('common.save' | translate) }}
          </button>
        </div>
        @if (saved()) { <div class="ok-card card">{{ 'settings.saved' | translate }}</div> }
        @if (error()) { <div class="error-card card">{{ error() }}</div> }
      </section>

      <!-- Prova della geocodifica con la chiave salvata -->
      <section class="card block">
        <header class="block-head"><h2>{{ 'settings.test.title' | translate }}</h2>
          <span class="block-sub">{{ 'settings.test.sub' | translate }}</span></header>
        <div class="key-row">
          <input class="field" name="testAddress" [(ngModel)]="testAddress"
                 [attr.placeholder]="'settings.test.placeholder' | translate" />
          <button type="button" class="btn btn-secondary" [disabled]="testing() || !testAddress.trim()" (click)="test()">
            {{ testing() ? ('settings.test.testing' | translate) : ('settings.test.button' | translate) }}
          </button>
        </div>
        @if (testResult(); as r) {
          <p class="hint">
            @if (r.provinceCode) {
              ✓ {{ 'settings.test.found' | translate:{ code: r.provinceCode } }} — {{ r.formattedAddress }}
            } @else if (r.source === 'none') {
              {{ 'settings.test.noKey' | translate }}
            } @else {
              ✗ {{ 'settings.test.notFound' | translate }} ({{ r.status }})
            }
          </p>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .form-head { margin-bottom: 24px; }
      h1 { margin: 6px 0 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .form-grid { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .block { padding: 24px 26px; }
      .block-head { margin-bottom: 18px; }
      .block-head h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
      .block-sub { display: block; margin-top: 3px; font-size: 13px; color: var(--text-tertiary); }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .key-row { display: flex; gap: 8px; }
      .key-row .field { flex: 1; }
      .mono { font-family: ui-monospace, monospace; }
      .hint { margin: 12px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
      .actions { display: flex; justify-content: flex-end; margin-top: 16px; }
      .error-card { margin-top: 14px; background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); }
      .ok-card { margin-top: 14px; background: rgba(36,138,61,0.08); border: 1px solid rgba(36,138,61,0.2); color: var(--green); padding: 14px 18px; border-radius: var(--radius-l); }
    `,
  ],
})
export class SettingsComponent {
  private readonly http = inject(HttpClient);

  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);
  readonly showKey = signal(false);
  readonly testing = signal(false);
  readonly testResult = signal<GeocodeResult | null>(null);

  model = { googleMapsApiKey: '' };
  testAddress = '';

  constructor() {
    this.http.get<Record<string, string>>(`${environment.apiUrl}/settings`).subscribe({
      next: (s) => { this.model.googleMapsApiKey = s['googleMapsApiKey'] ?? ''; },
      error: () => this.error.set('Errore nel caricamento delle impostazioni'),
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.http.put<Record<string, string>>(`${environment.apiUrl}/settings`, this.model).subscribe({
      next: () => { this.saving.set(false); this.saved.set(true); },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(' · ') : msg ?? 'Errore nel salvataggio');
      },
    });
  }

  test(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.http
      .get<GeocodeResult>(`${environment.apiUrl}/settings/geocode`, { params: { address: this.testAddress.trim() } })
      .subscribe({
        next: (r) => { this.testing.set(false); this.testResult.set(r); },
        error: () => { this.testing.set(false); this.testResult.set({ provinceCode: null, formattedAddress: null, source: 'google', status: 'ERROR' }); },
      });
  }
}
