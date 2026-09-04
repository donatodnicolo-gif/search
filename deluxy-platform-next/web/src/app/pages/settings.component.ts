import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

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

        <!-- NOTIFICHE VIA EMAIL — casella del Hub (POST /api/posta). È il canale
             da cui partono le notifiche al partner (nuovo servizio) e al valet
             (assegnazione). Le credenziali SMTP stanno solo nella cassaforte del
             Hub (Standard §7): qui basta l'indirizzo del Hub e un token con lo
             scope «posta». -->
        <h3 class="sotto-titolo">{{ 'settings.hubMail.title' | translate }}</h3>
        <label class="fld"><span>{{ 'settings.hubMail.url' | translate }}</span>
          <input class="field mono" name="hubUrl" [(ngModel)]="model.hubUrl"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="https://deluxy-hub.vercel.app" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.hubMail.token' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showHubToken() ? 'text' : 'password'" name="hubPostaToken"
                   [(ngModel)]="model.hubPostaToken" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="dlxk_…" />
            <button type="button" class="btn btn-secondary" (click)="showHubToken.set(!showHubToken())">
              {{ (showHubToken() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.hubMail.hint' | translate }}</p>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.hubMail.provaEmail' | translate }}</span>
          <input class="field mono" name="provaEmail" [(ngModel)]="provaEmail" type="email"
                 autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="tu@deluxy.it" />
        </label>
        <div class="key-row" style="margin-top:10px">
          <button type="button" class="btn btn-secondary" [disabled]="provandoPosta()" (click)="provaPosta()">
            {{ (provandoPosta() ? 'common.loading' : 'settings.hubMail.test') | translate }}
          </button>
          @if (esitoPosta(); as e) {
            <span class="esito" [class.ok]="e.ok" [class.ko]="!e.ok">{{ e.messaggio }}</span>
          }
        </div>

        <!-- FINANCE (deluxy-partner): «Genera fattura» consegna la bozza qui.
             Chiave con scope «scrittura» emessa da FINANCE. -->
        <h3 class="sotto-titolo">FINANCE (fatture)</h3>
        <label class="fld"><span>Indirizzo FINANCE</span>
          <input class="field mono" name="financeUrl" [(ngModel)]="model.financeUrl"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="https://deluxy-partner.vercel.app" />
        </label>
        <label class="fld" style="margin-top:16px"><span>Chiave FINANCE (scope scrittura)</span>
          <div class="key-row">
            <input class="field mono" [type]="showFinanceKey() ? 'text' : 'password'" name="financeApiKey"
                   [(ngModel)]="model.financeApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="dlxk_…" />
            <button type="button" class="btn btn-secondary" (click)="showFinanceKey.set(!showFinanceKey())">
              {{ (showFinanceKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">«Genera fattura» consegna la bozza (pro-forma) a FINANCE: compare in deluxy-partner/fatture, pronta da emettere su FattureInCloud.</p>

        <!-- GOOGLE DRIVE — ricevute (OAuth utente come il marketing, MAI
             service account: Standard §5, deciso dall'utente il 01/09). -->
        <h3 class="sotto-titolo">Google Drive (ricevute) @if (model.driveRefreshToken) { <span class="drive-ok">· collegato ✓</span> }</h3>
        <label class="fld"><span>Client ID Google</span>
          <input class="field mono" name="driveClientId" [(ngModel)]="model.driveClientId"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="…apps.googleusercontent.com" />
        </label>
        <label class="fld" style="margin-top:16px"><span>Client secret Google</span>
          <div class="key-row">
            <input class="field mono" [type]="showDriveSecret() ? 'text' : 'password'" name="driveClientSecret"
                   [(ngModel)]="model.driveClientSecret" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="GOCSPX-…" />
            <button type="button" class="btn btn-secondary" (click)="showDriveSecret.set(!showDriveSecret())">
              {{ (showDriveSecret() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <label class="fld" style="margin-top:16px"><span>Cartella Drive (ID o link)</span>
          <input class="field mono" name="driveFolderId" [(ngModel)]="model.driveFolderId"
                 autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="1AbC… oppure link drive.google.com/drive/folders/…" />
        </label>
        <div class="key-row" style="margin-top:10px">
          <button type="button" class="btn btn-secondary" [disabled]="collegandoDrive()" (click)="collegaDrive()">
            {{ collegandoDrive() ? ('common.loading' | translate) : 'Collega Drive (consenso Google)' }}
          </button>
          @if (esitoDrive(); as e) { <span class="esito" [class.ok]="e.ok" [class.ko]="!e.ok">{{ e.messaggio }}</span> }
        </div>
        <p class="hint">Salva prima client ID e secret, poi «Collega Drive»: si apre il consenso Google e da lì le ricevute firmate finiscono nella cartella. Mai service account (niente Workspace).</p>

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
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.orders.shopifyAdmin' | translate }}</span>
          <input class="field mono" name="shopifyAdminUrl" [(ngModel)]="model.shopifyAdminUrl"
                 autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="https://admin.shopify.com/store/deluxygifts" />
        </label>
        <p class="hint">{{ 'settings.orders.hint' | translate }} {{ 'settings.orders.shopifyAdminHint' | translate }}</p>
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
        <label class="fld"><span>{{ 'settings.ai.provider' | translate }}</span>
          <select class="field" name="aiProvider" [(ngModel)]="model.aiProvider">
            <option value="anthropic">{{ 'settings.ai.providerAnthropic' | translate }}</option>
            <option value="openai">{{ 'settings.ai.providerOpenai' | translate }}</option>
          </select>
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.ai.key' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showAiKey() ? 'text' : 'password'" name="aiApiKey"
                   [(ngModel)]="model.aiApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="sk-ant-…" />
            <button type="button" class="btn btn-secondary" (click)="showAiKey.set(!showAiKey())">
              {{ (showAiKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.ai.openaiKey' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showOpenaiKey() ? 'text' : 'password'" name="openaiApiKey"
                   [(ngModel)]="model.openaiApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="sk-…" />
            <button type="button" class="btn btn-secondary" (click)="showOpenaiKey.set(!showOpenaiKey())">
              {{ (showOpenaiKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.ai.hint' | translate }}</p>

        <!-- Canale partner: WhatsApp di Deluxy + linee commerciali (master Scout) -->
        <h3 class="sotto-titolo">{{ 'settings.partnerChannel.title' | translate }}</h3>
        <label class="fld"><span>{{ 'settings.partnerChannel.whatsapp' | translate }}</span>
          <input class="field mono" name="whatsappNumero" [(ngModel)]="model.whatsappNumero"
                 autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="393331234567" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.partnerChannel.lineeUrl' | translate }}</span>
          <input class="field mono" name="lineeUrl" [(ngModel)]="model.lineeUrl"
                 autocomplete="new-password" data-lpignore="true" data-1p-ignore
                 placeholder="https://…supabase.co/functions/v1/linee" />
        </label>
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.partnerChannel.lineeKey' | translate }}</span>
          <div class="key-row">
            <input class="field mono" [type]="showLineeKey() ? 'text' : 'password'" name="lineeApiKey"
                   [(ngModel)]="model.lineeApiKey" autocomplete="new-password" data-lpignore="true" data-1p-ignore />
            <button type="button" class="btn btn-secondary" (click)="showLineeKey.set(!showLineeKey())">
              {{ (showLineeKey() ? 'settings.apiKeys.hide' : 'settings.apiKeys.show') | translate }}
            </button>
          </div>
        </label>
        <p class="hint">{{ 'settings.partnerChannel.hint' | translate }}</p>
        <!-- ⭐ 04/09 (regola utente): la home «Servizi» all'accesso si accende
             per email, partner per partner. -->
        <label class="fld" style="margin-top:16px"><span>{{ 'settings.partnerChannel.homeEmails' | translate }}</span>
          <input class="field mono" name="homePartnerEmails" [(ngModel)]="model.homePartnerEmails"
                 autocomplete="off" data-lpignore="true" data-1p-ignore
                 placeholder="chanel_consegne@deluxy.it, altro@partner.it" />
        </label>
        <p class="hint">{{ 'settings.partnerChannel.homeEmailsHint' | translate }}</p>

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
      .drive-ok { font-size: 12px; font-weight: 600; color: var(--green, #248a3d); }
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
  private readonly auth = inject(AuthService);

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
    ordersUrl: '', ordersApiKey: '', shopifyAdminUrl: '',
    mailUrl: '', mailApiKey: '', mailUtente: '',
    aiApiKey: '', aiProvider: 'anthropic', openaiApiKey: '',
    whatsappNumero: '', lineeUrl: '', lineeApiKey: '', homePartnerEmails: '',
    hubUrl: '', hubPostaToken: '',
    financeUrl: '', financeApiKey: '',
    driveClientId: '', driveClientSecret: '', driveRefreshToken: '', driveFolderId: '',
  };

  /** Indirizzo su cui mandare la mail di prova (di default l'admin stesso). */
  provaEmail = this.auth.user()?.email ?? '';

  readonly showLineeKey = signal(false);

  readonly showAnagraficheKey = signal(false);
  readonly provando = signal(false);
  readonly esitoAnagrafiche = signal<{ esito: string; messaggio: string } | null>(null);
  readonly showOrdersKey = signal(false);
  readonly showMailKey = signal(false);
  readonly showAiKey = signal(false);
  readonly showOpenaiKey = signal(false);
  readonly provandoOrders = signal(false);
  readonly esitoOrders = signal<{ esito: string; messaggio: string } | null>(null);
  readonly showHubToken = signal(false);
  readonly showFinanceKey = signal(false);
  readonly showDriveSecret = signal(false);
  readonly collegandoDrive = signal(false);
  readonly esitoDrive = signal<{ ok: boolean; messaggio: string } | null>(null);

  /** Salva i campi Drive e apre il consenso Google in una scheda nuova. */
  collegaDrive(): void {
    this.esitoDrive.set(null);
    this.collegandoDrive.set(true);
    const soloDrive = {
      driveClientId: this.model.driveClientId,
      driveClientSecret: this.model.driveClientSecret,
      driveFolderId: this.model.driveFolderId,
    };
    this.http.put(`${environment.apiUrl}/settings`, soloDrive).subscribe({
      next: () => {
        this.http.get<{ ok: boolean; url?: string; motivo?: string }>(`${environment.apiUrl}/settings/drive/authorize`).subscribe({
          next: (r) => {
            this.collegandoDrive.set(false);
            if (r.ok && r.url) { window.open(r.url, '_blank'); this.esitoDrive.set({ ok: true, messaggio: 'Consenso aperto in una scheda nuova: completa li, poi ricarica questa pagina.' }); }
            else this.esitoDrive.set({ ok: false, messaggio: r.motivo ?? 'Non riuscito' });
          },
          error: () => { this.collegandoDrive.set(false); this.esitoDrive.set({ ok: false, messaggio: 'Errore nel preparare il consenso' }); },
        });
      },
      error: () => { this.collegandoDrive.set(false); this.esitoDrive.set({ ok: false, messaggio: 'Errore nel salvataggio dei campi Drive' }); },
    });
  }
  readonly provandoPosta = signal(false);
  readonly esitoPosta = signal<{ ok: boolean; messaggio: string } | null>(null);

  /**
   * Prova end-to-end della posta: salva PRIMA i due campi del Hub (la prova gira
   * sul server e legge dal database), poi manda una mail di prova all'indirizzo
   * indicato. Come le altre prove, si salvano SOLO i campi in gioco.
   */
  provaPosta(): void {
    this.provandoPosta.set(true);
    this.esitoPosta.set(null);
    const soloHub = { hubUrl: this.model.hubUrl, hubPostaToken: this.model.hubPostaToken };
    this.http.put(`${environment.apiUrl}/settings`, soloHub).subscribe({
      next: () => this.http
        .post<{ ok: boolean; messaggio: string }>(`${environment.apiUrl}/settings/posta/prova`, { a: this.provaEmail })
        .subscribe({
          next: (r) => { this.provandoPosta.set(false); this.esitoPosta.set(r); },
          error: (e) => { this.provandoPosta.set(false); this.esitoPosta.set({ ok: false, messaggio: e?.error?.message ?? 'Prova non riuscita' }); },
        }),
      error: (e) => { this.provandoPosta.set(false); this.esitoPosta.set({ ok: false, messaggio: e?.error?.message ?? 'Salvataggio non riuscito' }); },
    });
  }

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
        this.model.shopifyAdminUrl = s['shopifyAdminUrl'] ?? '';
        this.model.mailUrl = s['mailUrl'] ?? '';
        this.model.mailApiKey = s['mailApiKey'] ?? '';
        this.model.mailUtente = s['mailUtente'] ?? '';
        this.model.anagraficheUrl = s['anagraficheUrl'] ?? '';
        this.model.anagraficheApiKey = s['anagraficheApiKey'] ?? '';
        // ⚠️ Ogni chiave del model VA caricata: il save manda tutto il model,
        // e un campo mai caricato riparte da "" e cancella il valore salvato
        // (aiApiKey lo faceva davvero: il campo c'era, il caricamento no).
        this.model.aiApiKey = s['aiApiKey'] ?? '';
        this.model.aiProvider = s['aiProvider'] || 'anthropic';
        this.model.openaiApiKey = s['openaiApiKey'] ?? '';
        this.model.whatsappNumero = s['whatsappNumero'] ?? '';
        this.model.lineeUrl = s['lineeUrl'] ?? '';
        this.model.lineeApiKey = s['lineeApiKey'] ?? '';
        // ⚠️ Hub e FINANCE: erano nel model e nel form ma NON qui — il save manda
        // tutto il model, quindi ogni salvataggio li azzerava (è il motivo per
        // cui hubUrl/hubPostaToken risultavano vuoti). Ora si caricano anche loro.
        this.model.hubUrl = s['hubUrl'] ?? '';
        this.model.hubPostaToken = s['hubPostaToken'] ?? '';
        this.model.financeUrl = s['financeUrl'] ?? '';
        this.model.financeApiKey = s['financeApiKey'] ?? '';
        this.model.driveClientId = s['driveClientId'] ?? '';
        this.model.driveClientSecret = s['driveClientSecret'] ?? '';
        this.model.driveRefreshToken = s['driveRefreshToken'] ?? '';
        this.model.driveFolderId = s['driveFolderId'] ?? '';
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
