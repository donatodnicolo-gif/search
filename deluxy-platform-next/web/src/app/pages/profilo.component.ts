import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { IndirizzoGoogleDirective } from '../core/indirizzo-google.directive';

/**
 * LA SCHEDA PROFILO (utente, 02/09): dal proprio nome in basso a sinistra.
 * Si vedono e si correggono i PROPRI dati — account, password, anagrafica
 * collegata (valet) o contatti del negozio (partner). MAI prezzi, tariffe o
 * stipendi: non compaiono nemmeno, e il server li rifiuta comunque.
 */
@Component({
  selector: 'app-profilo',
  standalone: true,
  imports: [FormsModule, TranslatePipe, IndirizzoGoogleDirective],
  template: `
    <h1>{{ 'profilo.title' | translate }}</h1>
    <p class="muted intro">{{ 'profilo.caption' | translate }}</p>

    @if (caricamento()) { <div class="card">{{ 'common.loading' | translate }}</div> }
    @else {
      <!-- ACCOUNT -->
      <div class="card sez">
        <h2>{{ 'profilo.account' | translate }}</h2>
        <div class="grid-2">
          <label class="fld"><span>{{ 'profilo.nome' | translate }}</span>
            <input class="field" name="firstName" [(ngModel)]="account.firstName" /></label>
          <label class="fld"><span>{{ 'profilo.cognome' | translate }}</span>
            <input class="field" name="lastName" [(ngModel)]="account.lastName" /></label>
        </div>
        <label class="fld"><span>{{ 'profilo.email' | translate }}</span>
          <input class="field" type="email" name="email" [(ngModel)]="account.email" autocomplete="email" /></label>
        @if (esitoAccount(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
        <div class="azioni"><button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salvaAccount()">{{ 'common.save' | translate }}</button></div>
      </div>

      <!-- PASSWORD -->
      <div class="card sez">
        <h2>{{ 'profilo.password' | translate }}</h2>
        <p class="muted">{{ 'profilo.passwordHint' | translate }}</p>
        <div class="grid-2">
          <label class="fld"><span>{{ 'profilo.passwordAttuale' | translate }}</span>
            <input class="field" type="password" name="pwAttuale" [(ngModel)]="pw.attuale" autocomplete="current-password" /></label>
          <span></span>
          <label class="fld"><span>{{ 'profilo.passwordNuova' | translate }}</span>
            <input class="field" type="password" name="pwNuova" [(ngModel)]="pw.nuova" autocomplete="new-password" /></label>
          <label class="fld"><span>{{ 'profilo.passwordConferma' | translate }}</span>
            <input class="field" type="password" name="pwConferma" [(ngModel)]="pw.conferma" autocomplete="new-password" /></label>
        </div>
        @if (esitoPassword(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
        <div class="azioni"><button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="cambiaPassword()">{{ 'profilo.cambiaPassword' | translate }}</button></div>
      </div>

      <!-- ANAGRAFICA VALET -->
      @if (valet) {
        <div class="card sez">
          <h2>{{ 'profilo.anagrafica' | translate }}</h2>
          <p class="muted">{{ 'profilo.anagraficaHint' | translate }}</p>
          <!-- ⭐ 06/09/2026 (regola utente): IL CODICE DEL VALET, personale. È quello
               che il partner inserisce al ritiro quando la consegna chiede la
               verifica dell'identità: non va detto ad altri. -->
          @if (valet.legacyId != null) {
            <div class="card" style="padding:14px 18px;margin:0 0 16px;border-left:3px solid var(--gold)">
              <div class="muted" style="font-size:12.5px">{{ 'profilo.codiceValet' | translate }}</div>
              <div style="font-size:26px;font-weight:600;letter-spacing:.06em;font-variant-numeric:tabular-nums">{{ valet.legacyId }}</div>
              <p class="muted" style="margin:6px 0 0;font-size:13px">{{ 'profilo.codiceValetHint' | translate }}</p>
            </div>
          }
          <div class="grid-2">
            <label class="fld"><span>{{ 'profilo.telefono' | translate }}</span>
              <input class="field" name="vPhone" [(ngModel)]="valet.phone" /></label>
            <label class="fld"><span>{{ 'profilo.veicolo' | translate }}</span>
              <input class="field" name="vVehicle" [(ngModel)]="valet.vehicle" /></label>
          </div>
          <label class="fld"><span>{{ 'profilo.indirizzo' | translate }}</span>
            <input class="field" name="vAddress" [(ngModel)]="valet.address" appIndirizzoGoogle autocomplete="off" /></label>
          <div class="grid-2">
            <label class="fld"><span>{{ 'profilo.codiceFiscale' | translate }}</span>
              <input class="field" name="vCf" [(ngModel)]="valet.fiscalCode" /></label>
            <label class="fld"><span>{{ 'profilo.iban' | translate }}</span>
              <input class="field" name="vIban" [(ngModel)]="valet.iban" /></label>
          </div>
          <div class="grid-2">
            <label class="toggle"><input type="checkbox" name="vMail" [(ngModel)]="valet.notifyByEmail" /><span>{{ 'profilo.notificheEmail' | translate }}</span></label>
            <label class="toggle"><input type="checkbox" name="vWa" [(ngModel)]="valet.notifyByWhatsapp" /><span>{{ 'profilo.notificheWhatsapp' | translate }}</span></label>
          </div>
          @if (esitoAnagrafica(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
          <div class="azioni"><button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salvaValet()">{{ 'common.save' | translate }}</button></div>
        </div>
      }

      <!-- CONTATTI DEL NEGOZIO (partner) -->
      @if (partner) {
        <div class="card sez">
          <h2>{{ 'profilo.negozio' | translate }}</h2>
          <p class="muted">{{ 'profilo.negozioHint' | translate }}</p>
          <label class="fld"><span>{{ 'profilo.insegna' | translate }}</span>
            <input class="field" name="pInsegna" [ngModel]="partner.insegna" disabled /></label>
          <div class="grid-2">
            <label class="fld"><span>{{ 'profilo.telefono' | translate }}</span>
              <input class="field" name="pPhone" [(ngModel)]="partner.phone" /></label>
            <label class="fld"><span>{{ 'profilo.emailNegozio' | translate }}</span>
              <input class="field" type="email" name="pEmail" [(ngModel)]="partner.email" /></label>
          </div>
          <label class="fld"><span>{{ 'profilo.indirizzo' | translate }}</span>
            <input class="field" name="pAddress" [(ngModel)]="partner.address" appIndirizzoGoogle autocomplete="off" /></label>
          <!-- 02/09 (regola utente): il partner imposta da qui anche gli
               ALTRI indirizzi di ritiro. Ogni riga segue la regola Google
               (blur -> primo risultato). -->
          <div class="fld">
            <span>{{ 'profilo.ritiri' | translate }}</span>
            <p class="muted mini">{{ 'profilo.ritiriHint' | translate }}</p>
            @for (r of partner.pickupAddresses; track $index) {
              <div class="ritiro-riga">
                <input class="field" [name]="'pPickup' + $index" [(ngModel)]="partner.pickupAddresses[$index]"
                       appIndirizzoGoogle autocomplete="off" />
                <button type="button" class="icon-btn" (click)="rimuoviRitiro($index)"
                        [title]="'partnerForm.general.remove' | translate">✕</button>
              </div>
            }
            <button type="button" class="btn btn-secondary mini aggiungi" (click)="aggiungiRitiro()">
              + {{ 'profilo.aggiungiRitiro' | translate }}
            </button>
          </div>
          <!-- ⭐ 06/09/2026 (regola utente): con un servizio di VENDITA il partner regola da qui
               «Consegna da Partner», il minimo d'ordine e il raggio massimo. -->
          @if (partner.haVendita) {
            <div class="vendite">
              <h3>{{ 'profilo.vendite.titolo' | translate }}</h3>
              <label class="toggle"><input type="checkbox" name="pAuto" [(ngModel)]="partner.autoDeliveredByPartner" /><span>{{ 'partnerForm.setup.autoDeliveredByPartner' | translate }}</span></label>
              <p class="muted mini">{{ 'partnerForm.setup.autoDeliveredByPartnerHint' | translate }}</p>
              <div class="grid-2">
                <label class="fld"><span>{{ 'partnerForm.mestieri.minimo' | translate }}</span>
                  <input class="field" type="number" min="0" step="1" name="pMinimo" [(ngModel)]="partner.minimoOrdineVendita" [attr.placeholder]="'partnerForm.mestieri.nessunLimite' | translate" />
                  <span class="muted mini">{{ 'partnerForm.mestieri.minimoHint' | translate }}</span></label>
                @if (partner.autoDeliveredByPartner) {
                <label class="fld"><span>{{ 'partnerForm.mestieri.raggio' | translate }}</span>
                  <input class="field" type="number" min="0" step="1" name="pRaggio" [(ngModel)]="partner.raggioMaxConsegnaKm" [attr.placeholder]="'partnerForm.mestieri.nessunLimite' | translate" />
                  <span class="muted mini">{{ 'partnerForm.mestieri.raggioHint' | translate }}</span></label>
                }
              </div>
              <!-- ⭐ 06/09 sera (segnalazione utente): dal profilo si sceglie anche DOVE si consegna da soli. -->
              @if (partner.autoDeliveredByPartner) {
              <div class="area-consegna">
                <h4>{{ 'partnerForm.consegna.title' | translate }}</h4>
                <p class="muted mini">{{ 'partnerForm.consegna.sub' | translate }}</p>
                <div class="consegna-riga-add">
                  <select class="field" (change)="aggiungiConsegna($any($event.target).value); $any($event.target).value=''">
                    <option value="">{{ 'partnerForm.consegna.aggiungi' | translate }}</option>
                    @for (p of provinceNonInConsegna(); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }
                  </select>
                  @if ((partner.provinceVendita?.length ?? 0) > 0 && consegna.length === 0) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="consegnaDalleVendite()">{{ 'partnerForm.consegna.copiaVendite' | translate }}</button>
                  }
                  @if (consegna.length > 1) {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="copiaATutte()">{{ 'partnerForm.consegna.copiaTutte' | translate }}</button>
                  }
                </div>
                @if (consegna.length === 0) { <p class="muted mini">{{ 'partnerForm.consegna.vuoto' | translate }}</p> }
                @else {
                <table class="tab-consegna">
                  <thead><tr><th>{{ 'partnerForm.consegna.colProvincia' | translate }}</th><th>{{ 'partnerForm.consegna.colMinimo' | translate }}</th><th>{{ 'partnerForm.consegna.colRaggio' | translate }}</th><th></th></tr></thead>
                  <tbody>
                    @for (r of consegna; track r.provinceId; let i = $index) {
                      <tr>
                        <td><b>{{ codiceProvincia(r.provinceId) }}</b> <span class="muted">{{ nomeProvincia(r.provinceId) }}</span></td>
                        <td><input class="field num" type="number" min="0" step="1" [name]="'cmin' + i" [(ngModel)]="r.minimoOrdine" [attr.placeholder]="'partnerForm.consegna.predefinito' | translate" /></td>
                        <td><input class="field num" type="number" min="0" step="1" [name]="'ckm' + i" [(ngModel)]="r.raggioKm" [attr.placeholder]="'partnerForm.consegna.predefinito' | translate" /></td>
                        <td><button type="button" class="x" (click)="rimuoviConsegna(r.provinceId)" [attr.title]="'common.remove' | translate">✕</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
                }
              </div>
              }
            </div>
          }
          @if (esitoNegozio(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
          <div class="azioni"><button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salvaPartner()">{{ 'common.save' | translate }}</button></div>
        </div>

        <!-- ============================================================
             COORDINATE BANCARIE (⭐ 08/09/2026, regola utente)
             ------------------------------------------------------------
             ⚠️ Stanno in un riquadro LORO, staccato da «Contatti del negozio» e col
             suo bottone: cambiare l'IBAN non e' salvare un recapito, e mescolarlo agli
             altri campi lo farebbe passare per un dettaglio. Qui il salvataggio non
             scrive: chiede un codice, e il conto cambia solo quando quel codice arriva.
             ============================================================ -->
        <div class="card sez banca">
          <h2>{{ 'profilo.banca.titolo' | translate }}</h2>
          <p class="muted">{{ 'profilo.banca.intro' | translate }}</p>

          @if (banca(); as b) {
            <div class="banca-ora">
              <span class="banca-lbl">{{ 'profilo.banca.attuale' | translate }}</span>
              <b class="mono">{{ b.ibanAttuale || ('profilo.banca.nessuno' | translate) }}</b>
              @if (b.intestatarioAttuale) { <span class="muted"> · {{ b.intestatarioAttuale }}</span> }
            </div>

            @if (b.inAttesa && b.richiesta) {
              <!-- SECONDO PASSO: il codice e' partito, si aspetta che torni. -->
              <div class="banca-attesa">
                <p>{{ 'profilo.banca.codiceInviato' | translate: { mail: b.mailDiVerifica } }}</p>
                <div class="banca-proposta">
                  <span class="banca-lbl">{{ 'profilo.banca.richiesto' | translate }}</span>
                  <b class="mono">{{ b.richiesta.iban }}</b>
                  <span class="muted"> · {{ b.richiesta.intestatario }}</span>
                </div>
                <div class="banca-codice">
                  <label class="fld"><span>{{ 'profilo.banca.codice' | translate }}</span>
                    <input class="field codice mono" name="codiceBanca" inputmode="numeric" maxlength="6"
                           autocomplete="one-time-code" [(ngModel)]="codiceBanca"
                           [attr.placeholder]="'profilo.banca.seiCifre' | translate" /></label>
                  <button type="button" class="btn btn-primary" [disabled]="salvando() || codiceBanca.trim().length < 6"
                          (click)="confermaBanca()">{{ 'profilo.banca.conferma' | translate }}</button>
                  <button type="button" class="btn btn-secondary" [disabled]="salvando()"
                          (click)="annullaBanca()">{{ 'common.cancel' | translate }}</button>
                </div>
                <p class="muted mini">{{ 'profilo.banca.tentativi' | translate: { n: b.richiesta.tentativiRimasti } }}</p>
              </div>
            } @else {
              <!-- PRIMO PASSO: si propongono i valori nuovi. -->
              <div class="grid-2">
                <label class="fld"><span>{{ 'profilo.banca.iban' | translate }}</span>
                  <input class="field mono" name="ibanNuovo" [(ngModel)]="ibanNuovo" autocomplete="off"
                         [attr.placeholder]="'profilo.banca.ibanEsempio' | translate" /></label>
                <label class="fld"><span>{{ 'profilo.banca.intestatario' | translate }}</span>
                  <input class="field" name="intestatarioNuovo" [(ngModel)]="intestatarioNuovo" autocomplete="off" /></label>
              </div>
              <p class="muted mini">{{ 'profilo.banca.doveArriva' | translate: { mail: b.mailDiVerifica || '—' } }}</p>
              <div class="azioni">
                <button type="button" class="btn btn-primary"
                        [disabled]="salvando() || !ibanNuovo.trim() || !intestatarioNuovo.trim()"
                        (click)="richiediBanca()">{{ 'profilo.banca.chiedi' | translate }}</button>
              </div>
            }
          }
          @if (esitoBanca(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
        </div>

        <!-- CONDIZIONI DI PAGAMENTO — SOLA LETTURA (⭐ 08/09/2026, regola utente:
             «le condizioni di pagamento sono visibili ma non modificabili dal partner,
             solo admin e operation le possono modificare»). Sono un accordo fra due,
             e un accordo non lo riscrive una parte sola: si vedono per sapere quando
             arriva il bonifico, non per cambiarlo. -->
        @if (partner.condizioni) {
          <div class="card sez">
            <h2>{{ 'profilo.condizioni.titolo' | translate }}</h2>
            <p class="muted">{{ 'profilo.condizioni.intro' | translate }}</p>
            <dl class="cond-lettura">
              <dt>{{ 'profilo.condizioni.pagamento' | translate }}</dt>
              <dd>{{ partner.condizioni.pagamentoVendorGiorni != null
                    ? ('profilo.condizioni.giorniFineMese' | translate: { n: partner.condizioni.pagamentoVendorGiorni })
                    : ('profilo.condizioni.aVista' | translate) }}</dd>
              <dt>{{ 'profilo.condizioni.incasso' | translate }}</dt>
              <dd>{{ partner.condizioni.incassoServiziGiorni != null
                    ? (partner.condizioni.incassoServiziFineMese
                        ? ('profilo.condizioni.giorniFineMese' | translate: { n: partner.condizioni.incassoServiziGiorni })
                        : ('profilo.condizioni.giorniFattura' | translate: { n: partner.condizioni.incassoServiziGiorni }))
                    : ('profilo.condizioni.aVistaFattura' | translate) }}</dd>
              @if (partner.condizioni.compensazioneIncassi) {
                <dt>{{ 'profilo.condizioni.compensazione' | translate }}</dt>
                <dd>{{ 'profilo.condizioni.compensazioneSi' | translate }}</dd>
              }
            </dl>
            <p class="muted mini">{{ 'profilo.condizioni.chiLeCambia' | translate }}</p>
          </div>
        }
      }
    }
  `,
  styles: [
    `.area-consegna { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hairline); }
     .area-consegna h4 { margin: 0 0 4px; font-size: 13.5px; font-weight: 600; }
     .consegna-riga-add { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 8px 0; }
     .consegna-riga-add .field { max-width: 320px; }
     .btn-sm { padding: 6px 12px; font-size: 12.5px; }
     .tab-consegna { width: 100%; max-width: 640px; border-collapse: collapse; }
     .tab-consegna th { text-align: left; font-size: 12px; color: var(--text-secondary); font-weight: 550; padding: 4px 8px 6px; }
     .tab-consegna td { padding: 4px 8px; vertical-align: middle; }
     .tab-consegna .num { max-width: 140px; }
     .tab-consegna .x { appearance: none; border: 0; background: none; cursor: pointer; color: var(--text-tertiary); font-size: 14px; }
     .vendite { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--hairline); }
     .vendite h3 { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
     .vendite .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; }`,`
    .intro { margin: 4px 0 18px; }
    .sez { max-width: 720px; margin-bottom: 16px; padding: 20px 22px; }
    .sez h2 { margin: 0 0 6px; font-size: 18px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 800px) { .grid-2 { grid-template-columns: 1fr; } }
    .fld { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
    .fld > span { font-size: 12.5px; color: var(--text-secondary, #6e6e73); }
    .azioni { margin-top: 14px; display: flex; justify-content: flex-end; }
    .ok-msg { color: var(--green, #248a3d); font-size: 13px; margin-top: 8px; }
    .err-msg { color: var(--red, #d70015); font-size: 13px; margin-top: 8px; }
    .toggle { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .mini { font-size: 12.5px; margin: 0; }
    .ritiro-riga { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
    .ritiro-riga .field { flex: 1; min-width: 0; }
    .icon-btn { width: 34px; height: 34px; border: none; border-radius: 8px; background: var(--fill-hover, #ececef); color: var(--text-secondary, #6e6e73); cursor: pointer; font-size: 13px; flex-shrink: 0; }
    .icon-btn:hover { background: rgba(215,0,21,0.09); color: var(--red, #d70015); }
    .aggiungi { margin-top: 10px; align-self: flex-start; }
    /* ⭐ 08/09/2026 — coordinate bancarie: un riquadro suo, e i numeri in tabellare
       perche' un IBAN si legge a gruppi e si confronta cifra per cifra. */
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
    .banca-ora, .banca-proposta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: 10px 0; }
    .banca-lbl { font-size: 12.5px; color: var(--text-secondary); }
    .banca-attesa { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--hairline); border-radius: 12px; background: var(--fill, #f5f5f7); }
    .banca-attesa p { margin: 0 0 8px; font-size: 13.5px; }
    .banca-codice { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
    .banca-codice .codice { max-width: 160px; font-size: 20px; letter-spacing: 6px; text-align: center; }
    .cond-lettura { display: grid; grid-template-columns: auto 1fr; gap: 6px 18px; margin: 10px 0; font-size: 13.5px; }
    .cond-lettura dt { color: var(--text-secondary); }
    .cond-lettura dd { margin: 0; font-weight: 550; }
  `],
})
export class ProfiloComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  readonly caricamento = signal(true);
  readonly salvando = signal(false);
  readonly esitoAccount = signal<{ ok: boolean; testo: string } | null>(null);
  readonly esitoPassword = signal<{ ok: boolean; testo: string } | null>(null);
  readonly esitoAnagrafica = signal<{ ok: boolean; testo: string } | null>(null);
  readonly esitoNegozio = signal<{ ok: boolean; testo: string } | null>(null);

  // --- Coordinate bancarie in due passi (⭐ 08/09/2026, regola utente) ---
  readonly esitoBanca = signal<{ ok: boolean; testo: string } | null>(null);
  readonly banca = signal<{
    ibanAttuale: string | null; intestatarioAttuale: string | null; mailDiVerifica: string | null;
    inAttesa: boolean;
    richiesta: { iban: string; intestatario: string; scadeIl: string; tentativiRimasti: number } | null;
  } | null>(null);
  ibanNuovo = '';
  intestatarioNuovo = '';
  codiceBanca = '';

  account: { firstName: string; lastName: string; email: string } = { firstName: '', lastName: '', email: '' };
  pw = { attuale: '', nuova: '', conferma: '' };
  valet: any = null;
  partner: any = null;
  /** ⭐ 06/09 sera: l'area di consegna del partner (province + minimo/raggio per provincia). */
  consegna: { provinceId: string; minimoOrdine: number | null; raggioKm: number | null }[] = [];
  private tutteLeProvince(): { id: string; code: string; name: string }[] { return (this.partner?.tutteLeProvince ?? []) as { id: string; code: string; name: string }[]; }
  provinceNonInConsegna() { const gia = new Set(this.consegna.map((r) => r.provinceId)); return this.tutteLeProvince().filter((p) => !gia.has(p.id)); }
  codiceProvincia(id: string): string { return this.tutteLeProvince().find((p) => p.id === id)?.code ?? '?'; }
  nomeProvincia(id: string): string { return this.tutteLeProvince().find((p) => p.id === id)?.name ?? ''; }
  aggiungiConsegna(id: string): void { if (id && !this.consegna.some((r) => r.provinceId === id)) this.consegna = [...this.consegna, { provinceId: id, minimoOrdine: null, raggioKm: null }]; }
  rimuoviConsegna(id: string): void { this.consegna = this.consegna.filter((r) => r.provinceId !== id); }
  copiaATutte(): void { const [prima] = this.consegna; if (!prima) return; this.consegna = this.consegna.map((r) => ({ ...r, minimoOrdine: prima.minimoOrdine, raggioKm: prima.raggioKm })); }
  consegnaDalleVendite(): void { this.consegna = ((this.partner?.provinceVendita ?? []) as { id: string }[]).map((p) => ({ provinceId: p.id, minimoOrdine: null, raggioKm: null })); }

  constructor() {
    this.http.get<any>(`${environment.apiUrl}/auth/profilo`).subscribe({
      next: (p) => {
        this.account = { firstName: p?.user?.firstName ?? '', lastName: p?.user?.lastName ?? '', email: p?.user?.email ?? '' };
        this.valet = p?.valet ?? null;
        this.partner = p?.partner ?? null;
        if (this.partner && !Array.isArray(this.partner.pickupAddresses)) this.partner.pickupAddresses = [];
        this.consegna = ((this.partner?.consegnaProvince ?? []) as { provinceId: string; minimoOrdine?: number | null; raggioKm?: number | null }[]).map((r) => ({ provinceId: r.provinceId, minimoOrdine: r.minimoOrdine ?? null, raggioKm: r.raggioKm ?? null }));
        this.caricamento.set(false);
        if (this.partner?.id) this.caricaBanca();
      },
      error: () => this.caricamento.set(false),
    });
  }

  private posta(body: Record<string, unknown>, esito: typeof this.esitoAccount): void {
    this.salvando.set(true);
    esito.set(null);
    this.http.post(`${environment.apiUrl}/auth/profilo`, body).subscribe({
      next: () => {
        this.salvando.set(false);
        esito.set({ ok: true, testo: this.translate.instant('profilo.salvato') });
      },
      error: (err) => {
        this.salvando.set(false);
        esito.set({ ok: false, testo: err?.error?.message ?? 'Errore nel salvataggio' });
      },
    });
  }

  salvaAccount(): void {
    this.posta({ firstName: this.account.firstName, lastName: this.account.lastName, email: this.account.email }, this.esitoAccount);
  }
  salvaValet(): void {
    if (!this.valet) return;
    const v = this.valet;
    this.posta({ valet: { phone: v.phone, address: v.address, city: v.city, fiscalCode: v.fiscalCode,
      vehicle: v.vehicle, iban: v.iban, notifyByEmail: v.notifyByEmail, notifyByWhatsapp: v.notifyByWhatsapp } }, this.esitoAnagrafica);
  }
  salvaPartner(): void {
    if (!this.partner) return;
    this.posta({ partner: {
      phone: this.partner.phone, email: this.partner.email, address: this.partner.address,
      // Le righe vuote non sono indirizzi: si mandano solo quelle piene
      // (anche ZERO righe è un valore: li ha tolti tutti).
      pickupAddresses: (this.partner.pickupAddresses ?? [])
        .map((r: string) => (r ?? '').trim())
        .filter((r: string) => !!r),
      ...(this.partner.haVendita ? {
        autoDeliveredByPartner: !!this.partner.autoDeliveredByPartner,
        minimoOrdineVendita: this.partner.minimoOrdineVendita === '' || this.partner.minimoOrdineVendita == null ? null : Number(this.partner.minimoOrdineVendita),
        raggioMaxConsegnaKm: this.partner.raggioMaxConsegnaKm === '' || this.partner.raggioMaxConsegnaKm == null ? null : Number(this.partner.raggioMaxConsegnaKm),
        consegnaProvince: this.partner.autoDeliveredByPartner ? this.consegna.map((r) => ({ provinceId: r.provinceId, minimoOrdine: r.minimoOrdine === null || (r.minimoOrdine as unknown) === '' ? null : Number(r.minimoOrdine), raggioKm: r.raggioKm === null || (r.raggioKm as unknown) === '' ? null : Number(r.raggioKm) })) : [],
      } : {}),
    } }, this.esitoNegozio);
  }

  // ============================================================
  // COORDINATE BANCARIE IN DUE PASSI (⭐ 08/09/2026, regola utente)
  // ------------------------------------------------------------
  // ⚠️ Il primo bottone NON salva: chiede. I campi veri cambiano solo dopo che e'
  // tornato il codice arrivato per email — cosi' chi non ha accesso alla casella del
  // partner non puo' dirottare i bonifici nemmeno entrando in una sessione aperta.
  // ============================================================
  private caricaBanca(): void {
    const id = this.partner?.id;
    if (!id) return;
    this.http.get<any>(`${environment.apiUrl}/partners/${id}/banca`).subscribe({
      next: (b) => {
        this.banca.set(b);
        // I campi si precompilano con quello che c'e' gia': quasi sempre si corregge
        // l'intestatario o si cambia banca restando la stessa societa'.
        if (!b?.inAttesa) {
          this.ibanNuovo = '';
          this.intestatarioNuovo = b?.intestatarioAttuale ?? '';
        }
      },
      error: () => this.banca.set(null),
    });
  }

  richiediBanca(): void {
    const id = this.partner?.id;
    if (!id) return;
    this.salvando.set(true);
    this.esitoBanca.set(null);
    this.http.post<any>(`${environment.apiUrl}/partners/${id}/banca/richiedi`, {
      bankAccount: this.ibanNuovo.trim(),
      bankAccountName: this.intestatarioNuovo.trim(),
    }).subscribe({
      next: (r) => {
        this.salvando.set(false);
        this.codiceBanca = '';
        this.esitoBanca.set({ ok: true, testo: this.translate.instant('profilo.banca.esitoInviato', { mail: r?.mailDiVerifica ?? '' }) });
        this.caricaBanca();
      },
      error: (err) => {
        this.salvando.set(false);
        this.esitoBanca.set({ ok: false, testo: err?.error?.message ?? 'Errore' });
      },
    });
  }

  confermaBanca(): void {
    const id = this.partner?.id;
    if (!id) return;
    this.salvando.set(true);
    this.esitoBanca.set(null);
    this.http.post<any>(`${environment.apiUrl}/partners/${id}/banca/conferma`, { codice: this.codiceBanca.trim() }).subscribe({
      next: (r) => {
        this.salvando.set(false);
        this.codiceBanca = '';
        this.esitoBanca.set({ ok: true, testo: this.translate.instant('profilo.banca.esitoCambiato', { iban: r?.iban ?? '' }) });
        this.caricaBanca();
      },
      error: (err) => {
        this.salvando.set(false);
        this.esitoBanca.set({ ok: false, testo: err?.error?.message ?? 'Errore' });
        // Il tetto dei tentativi va riletto: quando finisce, la richiesta non c'e' piu'.
        this.caricaBanca();
      },
    });
  }

  annullaBanca(): void {
    const id = this.partner?.id;
    if (!id) return;
    this.salvando.set(true);
    this.http.delete(`${environment.apiUrl}/partners/${id}/banca/richiedi`).subscribe({
      next: () => { this.salvando.set(false); this.codiceBanca = ''; this.esitoBanca.set(null); this.caricaBanca(); },
      error: () => { this.salvando.set(false); this.caricaBanca(); },
    });
  }

  aggiungiRitiro(): void {
    this.partner.pickupAddresses = [...(this.partner.pickupAddresses ?? []), ''];
  }
  rimuoviRitiro(i: number): void {
    this.partner.pickupAddresses = this.partner.pickupAddresses.filter((_: string, x: number) => x !== i);
  }

  cambiaPassword(): void {
    this.esitoPassword.set(null);
    if (!this.pw.nuova || this.pw.nuova !== this.pw.conferma) {
      this.esitoPassword.set({ ok: false, testo: this.translate.instant('profilo.passwordNonCoincidono') });
      return;
    }
    this.salvando.set(true);
    this.http.post(`${environment.apiUrl}/auth/cambia-password`, { attuale: this.pw.attuale, nuova: this.pw.nuova }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.pw = { attuale: '', nuova: '', conferma: '' };
        this.esitoPassword.set({ ok: true, testo: this.translate.instant('profilo.passwordCambiata') });
      },
      error: (err) => {
        this.salvando.set(false);
        this.esitoPassword.set({ ok: false, testo: err?.error?.message ?? 'Errore nel cambio password' });
      },
    });
  }
}
