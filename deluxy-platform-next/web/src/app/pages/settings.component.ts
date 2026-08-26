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
                   [(ngModel)]="model.googleMapsApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore
                   [attr.placeholder]="'settings.apiKeys.googleMapsPlaceholder' | translate" />
            <button type="button" class="btn btn-secondary" (click)="showKey.set(!showKey())">
              {{ (showKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.apiKeys.googleMapsHint' | translate }}</p>

        <label class="fld" style="margin-top:16px"><span>{{ 'settings.apiKeys.googleMapsBrowser' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showBrowserKey() ? 'text' : 'password'" name="googleMapsBrowserKey"
                   [(ngModel)]="model.googleMapsBrowserKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore
                   [attr.placeholder]="'settings.apiKeys.googleMapsPlaceholder' | translate" />
            <button type="button" class="btn btn-secondary" (click)="showBrowserKey.set(!showBrowserKey())">
              {{ (showBrowserKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.apiKeys.googleMapsBrowserHint' | translate }}</p>

        <!-- Registro Anagrafiche: indirizzo + chiave.
             Stanno qui e non nelle variabili di Vercel così si cambiano da
             schermo, senza rifare un deploy. -->
        <h3 class="sotto-titolo">{{ 'settings.anagrafiche.title' | translate }}</h3>
        <label class="fld"><span>{{ 'settings.anagrafiche.url' | translate }}</span>
          <input class="field mono" name="anagraficheUrl" [(ngModel)]="model.anagraficheUrl"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="https://deluxy-anagrafiche.vercel.app" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.anagrafiche.key' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showAnagraficheKey() ? 'text' : 'password'" name="anagraficheApiKey"
                   [(ngModel)]="model.anagraficheApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="dlxk_…" />
            <button type="button" class="btn btn-secondary" (click)="showAnagraficheKey.set(!showAnagraficheKey())">
              {{ (showAnagraficheKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.anagrafiche.hint' | translate }}</p>
        <div class="key-row" style="margin-top:10px">
          <button type="button" class="btn btn-secondary" [disabled]="provando()" (click)="provaAnagrafiche()">
            {{ (provando() ? 'common.loading' : 'settings.anagrafiche.test') | translate }}
          </button>
          @if (esitoAnagrafiche(); as e) {
            <span class="esito" [class.ok]="e.esito === 'ok'" [class.ko]="e.esito !== 'ok'">{{ e.messaggio }}</span>
          }
        </div>

        <!-- AI Mail: da qui esce il recap al partner. Il canale SMTP appartiene
             a quell'app (Standard §5.3): la piattaforma non ha e non deve avere
             credenziali di posta proprie, tiene solo come raggiungerla. -->
        <h3 class="sotto-titolo">{{ 'settings.mail.title' | translate }}</h3>
        <label class="fld"><span>{{ 'settings.mail.url' | translate }}</span>
          <input class="field mono" name="mailUrl" [(ngModel)]="model.mailUrl"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="https://deluxy-mail.vercel.app" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.mail.user' | translate }}</span>
          <input class="field mono" name="mailUtente" [(ngModel)]="model.mailUtente"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="amministrazione@deluxy.it" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.mail.key' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showMailKey() ? 'text' : 'password'" name="mailApiKey"
                   [(ngModel)]="model.mailApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore />
            <button type="button" class="btn btn-secondary" (click)="showMailKey.set(!showMailKey())">
              {{ (showMailKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.mail.hint' | translate }}</p>

        <!-- Deluxy Orders: da qui arrivano gli ordini Shopify da smistare.
             Chiave di SOLA LETTURA: la piattaforma legge, non scrive mai. -->
        <h3 class="sotto-titolo">{{ 'settings.orders.title' | translate }}</h3>
        <label class="fld"><span>{{ 'settings.orders.url' | translate }}</span>
          <input class="field mono" name="ordersUrl" [(ngModel)]="model.ordersUrl"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="https://deluxy-orders.vercel.app" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.orders.key' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showOrdersKey() ? 'text' : 'password'" name="ordersApiKey"
                   [(ngModel)]="model.ordersApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="dlxk_…" />
            <button type="button" class="btn btn-secondary" (click)="showOrdersKey.set(!showOrdersKey())">
              {{ (showOrdersKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.orders.hint' | translate }}</p>
        <div class="key-row" style="margin-top:10px">
          <button type="button" class="btn btn-secondary" [disabled]="provandoOrders()" (click)="provaOrders()">
            {{ (provandoOrders() ? 'common.loading' : 'settings.orders.test') | translate }}
          </button>
          @if (esitoOrders(); as e) {
            <span class="esito" [class.ok]="e.esito === 'ok'" [class.ko]="e.esito !== 'ok'">{{ e.messaggio }}</span>
          }
        </div>

        <!-- Chiave AI (Anthropic): abilita il caricamento delle consegne via
             AI. Segreta, usata SOLO lato server. -->
        <h3 class="sotto-titolo">{{ 'settings.ai.title' | translate }}</h3>
        <label class="fld"><span>{{ 'settings.ai.key' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showAiKey() ? 'text' : 'password'" name="aiApiKey"
                   [(ngModel)]="model.aiApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="sk-ant-…" />
            <button type="button" class="btn btn-secondary" (click)="showAiKey.set(!showAiKey())">
              {{ (showAiKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.ai.hint' | translate }}</p>

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
      .sotto-titolo { margin: 28px 0 12px; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
      .esito { font-size: 13px; }
      .esito.ok { color: #1a7f37; }
      .esito.ko { color: var(--red, #d70015); }
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
  readonly showBrowserKey = signal(false);
  readonly testing = signal(false);
  readonly testResult = signal<GeocodeResult | null>(null);

  model = {
    googleMapsApiKey: '', googleMapsBrowserKey: '',
    anagraficheUrl: '', anagraficheApiKey: '',
    ordersUrl: '', ordersApiKey: '',
    mailUrl: '', mailApiKey: '', mailUtente: '',
    aiApiKey: '',
  };

  readonly showAnagraficheKey = signal(false);
  readonly provando = signal(false);
  readonly esitoAnagrafiche = signal<{ esito: string; messaggio: string } | null>(null);
  readonly showOrdersKey = signal(false);
  readonly showMailKey = signal(false);
  readonly showAiKey = signal(false);
  readonly provandoOrders = signal(false);
  readonly esitoOrders = signal<{ esito: string; messaggio: string } | null>(null);

  /** Prova la connessione al registro e dice PERCHE' non funziona, se non funziona. */
  provaAnagrafiche(): void {
    this.provando.set(true);
    this.esitoAnagrafiche.set(null);
    // Si salva prima: la prova gira sul server e legge i valori dal database,
    // quindi provare senza salvare misurerebbe quelli vecchi.
    // ⚠️ Si salvano SOLO i due campi di Anagrafiche, non tutto il modello.
    // Mandando l'intero modello, un valore messo dal gestore password del
    // browser nei campi Google finiva nel database: e' successo davvero, 39
    // caratteri scritti in entrambe le chiavi Maps che erano vuote.
    const soloAnagrafiche = {
      anagraficheUrl: this.model.anagraficheUrl,
      anagraficheApiKey: this.model.anagraficheApiKey,
    };
    this.http.put(`${environment.apiUrl}/settings`, soloAnagrafiche).subscribe({
      next: () => this.http
        .get<{ esito: string; messaggio: string }>(`${environment.apiUrl}/settings/anagrafiche/prova`)
        .subscribe({
          next: (r) => { this.provando.set(false); this.esitoAnagrafiche.set(r); },
          error: (e) => { this.provando.set(false); this.esitoAnagrafiche.set({ esito: 'ko', messaggio: e?.error?.message ?? 'Prova non riuscita' }); },
        }),
      error: (e) => { this.provando.set(false); this.esitoAnagrafiche.set({ esito: 'ko', messaggio: e?.error?.message ?? 'Salvataggio non riuscito' }); },
    });
  }
  /**
   * Come provaAnagrafiche, e per gli stessi due motivi.
   *
   * Si salva PRIMA di provare, perche' la prova gira sul server e legge dal
   * database: provare senza salvare misurerebbe i valori vecchi.
   *
   * E si salvano SOLO i due campi di Orders. Mandando tutto il modello, un
   * valore infilato dal gestore password del browser in un altro campo
   * finirebbe nel database: e' gia' successo il 23/08, 39 caratteri scritti
   * nelle due chiavi Maps che erano vuote.
   */
  provaOrders(): void {
    this.provandoOrders.set(true);
    this.esitoOrders.set(null);
    const soloOrders = { ordersUrl: this.model.ordersUrl, ordersApiKey: this.model.ordersApiKey };
    this.http.put(`${environment.apiUrl}/settings`, soloOrders).subscribe({
      next: () => this.http
        .get<{ esito: string; messaggio: string }>(`${environment.apiUrl}/settings/orders/prova`)
        .subscribe({
          next: (r) => { this.provandoOrders.set(false); this.esitoOrders.set(r); },
          error: (e) => { this.provandoOrders.set(false); this.esitoOrders.set({ esito: 'ko', messaggio: e?.error?.message ?? 'Prova non riuscita' }); },
        }),
      error: (e) => { this.provandoOrders.set(false); this.esitoOrders.set({ esito: 'ko', messaggio: e?.error?.message ?? 'Salvataggio non riuscito' }); },
    });
  }

  testAddress = '';

  constructor() {
    this.http.get<Record<string, string>>(`${environment.apiUrl}/settings`).subscribe({
      next: (s) => {
        this.model.googleMapsApiKey = s['googleMapsApiKey'] ?? '';
        this.model.googleMapsBrowserKey = s['googleMapsBrowserKey'] ?? '';
        this.model.ordersUrl = s['ordersUrl'] ?? '';
        this.model.ordersApiKey = s['ordersApiKey'] ?? '';
        this.model.mailUrl = s['mailUrl'] ?? '';
        this.model.mailApiKey = s['mailApiKey'] ?? '';
        this.model.mailUtente = s['mailUtente'] ?? '';
        this.model.anagraficheUrl = s['anagraficheUrl'] ?? '';
        this.model.anagraficheApiKey = s['anagraficheApiKey'] ?? '';
      },
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
