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
          @if (esitoNegozio(); as e) { <div [class]="e.ok ? 'ok-msg' : 'err-msg'">{{ e.testo }}</div> }
          <div class="azioni"><button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salvaPartner()">{{ 'common.save' | translate }}</button></div>
        </div>
      }
    }
  `,
  styles: [`
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

  account: { firstName: string; lastName: string; email: string } = { firstName: '', lastName: '', email: '' };
  pw = { attuale: '', nuova: '', conferma: '' };
  valet: any = null;
  partner: any = null;

  constructor() {
    this.http.get<any>(`${environment.apiUrl}/auth/profilo`).subscribe({
      next: (p) => {
        this.account = { firstName: p?.user?.firstName ?? '', lastName: p?.user?.lastName ?? '', email: p?.user?.email ?? '' };
        this.valet = p?.valet ?? null;
        this.partner = p?.partner ?? null;
        this.caricamento.set(false);
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
    this.posta({ partner: { phone: this.partner.phone, email: this.partner.email, address: this.partner.address } }, this.esitoNegozio);
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
