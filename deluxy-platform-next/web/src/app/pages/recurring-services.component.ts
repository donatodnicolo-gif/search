import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, NgZone, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { loadGoogleMaps } from '../core/google-maps';
import { AuthService } from '../core/auth.service';

/** Lo script di Google Maps si carica a runtime: qui basta dichiararlo. */
declare const google: any;

interface Ricorrente {
  id: string;
  nome: string;
  giorni: string;
  timeFrom: string;
  timeTo: string;
  pickupAddress?: string | null;
  recipientAddress: string;
  price?: number | null;
  valetSalary?: number | null;
  hours?: number | null;
  dataInizio: string;
  dataFine?: string | null;
  attivo: boolean;
  note?: string | null;
  ultimaGenerazione?: string | null;
  partner: { id: string; insegna: string };
  serviceType: { id: string; name: string; pricingModel?: string };
  valet?: { id: string; firstName: string; lastName: string } | null;
  frequenza?: string | null;
  ogni?: number | null;
  giorniMese?: string | null;
  /** Le eccezioni per giorno: «sabato e domenica 8-9». */
  varianti?: {
    id: string;
    giorni: string;
    timeFrom: string;
    timeTo: string;
    valetId?: string | null;
    valet?: { id: string; firstName: string; lastName: string } | null;
  }[];
  _count: { deliveries: number };
}
interface Rif { id: string; insegna?: string; name?: string; firstName?: string; lastName?: string; active?: boolean; placeholder?: boolean }
/**
 * Il partner come lo manda `GET /partners`: con dentro i SUOI servizi.
 * ⚠️ Arrivano gia' nella stessa risposta (`PARTNER_INCLUDE` lato API), quindi
 * la tendina dei servizi non ha bisogno di una seconda chiamata.
 */
interface PartnerConServizi extends Rif {
  services?: { serviceTypeId: string; serviceType?: { id: string; name: string } }[];
  /** Il suo indirizzo: e' il ritiro proposto per default. */
  address?: string | null;
}

/**
 * SERVIZI RICORRENTI: il presidio che si ripete — «ogni lunedi' 7-8 per un
 * partner», «sabato e domenica 13-14» — impostato come gli orari di Google
 * (giorni a chips + fascia). Il cron notturno genera la consegna del giorno,
 * e alle consegne generate si applicano le regole carnet del partner.
 */
@Component({
  selector: 'app-recurring-services',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DatePipe, DecimalPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'recurring.title' | translate }}</h1>
        <p class="page-caption">{{ 'recurring.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <!-- «Genera oggi» fa nascere consegne vere: resta dell'ufficio. Al
             partner ci pensa comunque la corsa notturna. -->
        @if (!isPartner()) {
          <button class="btn btn-ghost" [disabled]="generando()" (click)="generaOggi()">{{ (generando() ? 'common.saving' : 'recurring.generateToday') | translate }}</button>
        }
        <button class="btn btn-primary" (click)="formOpen() ? annullaForm() : apriNuovo()">{{ (formOpen() ? 'common.cancel' : 'recurring.new') | translate }}</button>
      </div>
    </div>

    @if (banner()) { <div class="card ok-card">{{ banner() }}</div> }
    @if (error()) { <div class="error-card">{{ error() }}</div> }

    @if (formOpen()) {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span>{{ 'recurring.f.nome' | translate }} *</span>
            <input class="field" [(ngModel)]="m.nome" [placeholder]="'recurring.f.nomePh' | translate" /></label>
          @if (!isPartner()) {
            <label class="fld"><span>{{ 'recurring.f.partner' | translate }} *</span>
              <select class="field" [(ngModel)]="m.partnerId" (ngModelChange)="cambiaPartner()">
                <option value="">—</option>
                @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
              </select></label>
          }
          <label class="fld"><span>{{ 'recurring.f.service' | translate }} *</span>
            <select class="field" [(ngModel)]="m.serviceTypeId" [disabled]="!m.partnerId">
              <option value="">—</option>
              @for (s of serviziDelPartner(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select>
            @if (m.partnerId && !serviziDelPartner().length) {
              <span class="hint warn">{{ 'recurring.f.noServices' | translate }}</span>
            } @else if (!m.partnerId) {
              <span class="hint">{{ 'recurring.f.pickPartnerFirst' | translate }}</span>
            }</label>
          @if (!isPartner()) {
            <label class="fld"><span>{{ 'recurring.f.valet' | translate }}</span>
              <select class="field" [(ngModel)]="m.valetId">
                <option value="">{{ 'recurring.f.valetAuto' | translate }}</option>
                @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
              </select></label>
          }
        </div>

        <!-- COME SI RIPETE: settimane, giorni o mesi. La riga cambia faccia a
             seconda della scelta, cosi' non si compilano campi che non
             contano — un mensile non ha giorni della settimana. -->
        <div class="setup-group">
          <span class="group-label">{{ 'recurring.f.repeat' | translate }} *</span>
          <div class="ripetizione">
            <span class="ogni-testo">{{ 'recurring.f.every' | translate }}</span>
            <input class="field num ogni-num" type="number" min="1" max="52" [(ngModel)]="m.ogni" />
            <select class="field freq" [(ngModel)]="m.frequenza">
              @for (f of FREQUENZE; track f) {
                <option [value]="f">{{ 'recurring.freq.' + f + (m.ogni > 1 ? '.plurale' : '.singolare') | translate }}</option>
              }
            </select>
          </div>

          @if (m.frequenza === 'SETTIMANALE') {
            <div class="chips">
              @for (g of GIORNI; track $index) {
                <button type="button" class="chip" [class.on]="giorniSel[$index]" (click)="giorniSel[$index] = !giorniSel[$index]">{{ g }}</button>
              }
            </div>
          } @else if (m.frequenza === 'MENSILE') {
            <label class="fld mese">
              <span>{{ 'recurring.f.monthDays' | translate }} *</span>
              <input class="field" [(ngModel)]="m.giorniMese" placeholder="1, 15" />
              <span class="hint">{{ 'recurring.f.monthDaysHint' | translate }}</span>
            </label>
          } @else {
            <span class="hint">{{ 'recurring.f.dailyHint' | translate }}</span>
          }

          <!-- Detto a parole: chi imposta deve leggere quello che ha appena
               scelto, non ricostruirlo dai campi. -->
          <p class="riassunto">{{ riassunto() }}</p>
        </div>

        <div class="grid">
          <label class="fld"><span>{{ 'recurring.f.from' | translate }} *</span>
            <input class="field" type="time" step="900" [(ngModel)]="m.timeFrom" /></label>
          <label class="fld"><span>{{ 'recurring.f.to' | translate }} *</span>
            <input class="field" type="time" step="900" [(ngModel)]="m.timeTo" /></label>

          <label class="fld"><span>{{ 'recurring.f.start' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="m.dataInizio" /></label>
          <label class="fld"><span>{{ 'recurring.f.end' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="m.dataFine" /></label>
        </div>

        <!-- ⭐ ECCEZIONI PER GIORNO (27/08, chiesto dall'utente): «da lunedi' a
             venerdi' 7-8, sabato e domenica 8-9». Qui si dichiara SOLO cio' che
             cambia: i giorni senza eccezione usano la fascia normale, cosi'
             l'eccezione si legge per differenza invece di ripetere sette volte
             il caso comune. -->
        <div class="setup-group">
          <span class="group-label">{{ 'recurring.exc.title' | translate }}</span>
          @if (!varianti.length) {
            <span class="hint">{{ 'recurring.exc.hint' | translate }}</span>
          }
          @for (v of varianti; track $index) {
            <div class="eccezione">
              <div class="chips">
                @for (g of GIORNI; track $index) {
                  <button type="button" class="chip mini-chip"
                          [class.on]="v.giorni[$index]"
                          [disabled]="!giornoPossibile($index)"
                          [title]="giornoPossibile($index) ? '' : ('recurring.exc.dayOff' | translate)"
                          (click)="v.giorni[$index] = !v.giorni[$index]">{{ g }}</button>
                }
              </div>
              <label class="fld ecc-ora"><span>{{ 'recurring.f.from' | translate }}</span>
                <input class="field" type="time" step="900" [(ngModel)]="v.timeFrom" /></label>
              <label class="fld ecc-ora"><span>{{ 'recurring.f.to' | translate }}</span>
                <input class="field" type="time" step="900" [(ngModel)]="v.timeTo" /></label>
              @if (!isPartner()) {
                <label class="fld ecc-valet"><span>{{ 'recurring.f.valet' | translate }}</span>
                  <select class="field" [(ngModel)]="v.valetId">
                    <option value="">{{ 'recurring.exc.sameValet' | translate }}</option>
                    @for (x of valets(); track x.id) { <option [value]="x.id">{{ x.lastName }} {{ x.firstName }}</option> }
                  </select></label>
              }
              <button type="button" class="link-btn danger ecc-tog" (click)="togliEccezione($index)">{{ 'common.delete' | translate }}</button>
            </div>
          }
          <button type="button" class="btn btn-secondary add-ecc" (click)="aggiungiEccezione()">+ {{ 'recurring.exc.add' | translate }}</button>
          @if (varianti.length) { <p class="riassunto">{{ riassuntoEccezioni() }}</p> }
        </div>
        <div class="grid">
          <!-- Indirizzi agganciati a GOOGLE MAPS, come nel form consegna: si
               sceglie dal menu e resta l'indirizzo normalizzato da Google, non
               quello che si e' battuto a mano. Un ricorrente sbagliato sbaglia
               ogni giorno, non una volta. Senza la chiave in Impostazioni
               restano campi di testo normali, e lo si dice. -->
          <label class="fld wide"><span>{{ 'recurring.f.address' | translate }} *</span>
            <input #addrDest class="field" [(ngModel)]="m.recipientAddress" autocomplete="off" /></label>
          <label class="fld wide"><span>{{ 'recurring.f.pickup' | translate }}</span>
            <input #addrRitiro class="field" [(ngModel)]="m.pickupAddress" autocomplete="off" /></label>
          @if (mapsMancante()) {
            <span class="hint warn wide">{{ 'recurring.f.mapsMissing' | translate }}</span>
          }
        </div>
        <div class="grid">
          <!-- Prezzo e paga sono conti NOSTRI: al partner non si chiedono e non
               si mostrano. Vuoti significa «vale il listino», che per lui e'
               sempre il caso. -->
          @if (!isPartner()) {
            <label class="fld"><span>{{ 'recurring.f.price' | translate }}</span>
              <input class="field num" type="number" [(ngModel)]="m.price" /></label>
            <label class="fld"><span>{{ 'recurring.f.salary' | translate }}</span>
              <input class="field num" type="number" [(ngModel)]="m.valetSalary" /></label>
          }
          <label class="fld"><span>{{ 'recurring.f.hours' | translate }}</span>
            <input class="field num" type="number" min="1" [(ngModel)]="m.hours" /></label>
          <label class="fld"><span>{{ 'recurring.f.note' | translate }}</span>
            <input class="field" [(ngModel)]="m.note" /></label>
        </div>
        <p class="hint">{{ 'recurring.f.rulesHint' | translate }}</p>
        <div class="azioni">
          <button class="btn btn-primary" [disabled]="salvando()" (click)="salva()">{{ (salvando() ? 'common.saving' : 'common.save') | translate }}</button>
        </div>
      </section>
    }

    @if (loading()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (!lista().length) {
      <div class="card state-card"><strong>{{ 'recurring.emptyTitle' | translate }}</strong><span class="muted">{{ 'recurring.emptyHint' | translate }}</span></div>
    } @else {
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'recurring.c.nome' | translate }}</th>
              <th>{{ 'recurring.c.partner' | translate }}</th>
              <th>{{ 'recurring.c.service' | translate }}</th>
              <th>{{ 'recurring.c.when' | translate }}</th>
              <th>{{ 'recurring.c.valet' | translate }}</th>
              <th class="num">{{ 'recurring.c.generated' | translate }}</th>
              <th>{{ 'recurring.c.status' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of lista(); track r.id) {
              <tr>
                <td class="strong">{{ r.nome }}<br><span class="muted mini">{{ r.recipientAddress }}</span></td>
                <td>{{ r.partner.insegna }}</td>
                <td>{{ r.serviceType.name }}</td>
                <td>
                  <span class="giorni">
                    @for (g of GIORNI; track $index) {
                      <span class="g" [class.on]="r.giorni[$index] === '1'">{{ g }}</span>
                    }
                  </span>
                  <br><span class="muted mini">{{ r.timeFrom }}–{{ r.timeTo }}
                    · {{ r.dataInizio | date: 'd/M/yy' }}@if (r.dataFine) { – {{ r.dataFine | date: 'd/M/yy' }} }</span>
                  <!-- Le eccezioni si vedono nell'elenco: un servizio che di
                       sabato va a un altro orario deve dirlo qui, o chi guarda
                       legge una fascia sola e la crede l'unica. -->
                  @for (v of r.varianti ?? []; track v.id) {
                    <br><span class="ecc-riga">{{ etichettaGiorni(v.giorni) }} {{ v.timeFrom }}–{{ v.timeTo }}@if (v.valet) { · {{ v.valet.lastName }} }</span>
                  }
                </td>
                <td>{{ r.valet ? (r.valet.lastName + ' ' + r.valet.firstName) : '—' }}</td>
                <td class="num">{{ r._count.deliveries | number }}</td>
                <td>
                  <span class="badge" [class.badge-on]="r.attivo" [class.badge-off]="!r.attivo">
                    <span class="dot"></span>{{ (r.attivo ? 'common.active' : 'common.inactive') | translate }}
                  </span>
                </td>
                <td class="nowrap">
                  <button class="link-btn" (click)="modifica(r)">{{ 'common.edit' | translate }}</button>
                  <button class="link-btn" (click)="toggle(r)">{{ (r.attivo ? 'recurring.pause' : 'recurring.resume') | translate }}</button>
                  <button class="link-btn danger" (click)="elimina(r)">{{ 'common.delete' | translate }}</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .table-wrap { overflow-x: auto; }
      td { vertical-align: middle; }
      .strong { font-weight: 550; letter-spacing: -0.01em; }
      .mini { font-size: 11.5px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .nowrap { white-space: nowrap; }
      .gen { padding: 18px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
      .fld { display: flex; flex-direction: column; gap: 4px; }
      .fld.wide { grid-column: span 2; }
      .fld > span { font-size: 12px; color: var(--text-secondary); }
      .setup-group { display: flex; flex-direction: column; gap: 6px; }
      .group-label { font-size: 12px; color: var(--text-secondary); }
      .chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .chip { border: 1px solid var(--hairline); background: var(--surface, #fff); border-radius: 980px; padding: 7px 14px; font-size: 13px; font-weight: 550; cursor: pointer; color: var(--text-secondary); font-family: inherit; }
      .chip.on { background: #1d1d1f; border-color: #1d1d1f; color: #fff; }
      /* Un giorno che il servizio non fa: spento e non premibile, cosi' si
         vede che c'e' ma non si puo' scegliere. */
      .chip:disabled { opacity: .38; cursor: not-allowed; }
      /* Eccezioni per giorno */
      .eccezione { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; padding: 12px; border: 1px solid var(--hairline); border-radius: var(--radius-l); background: var(--surface-sunken, #fafafa); }
      .mini-chip { padding: 5px 10px; font-size: 12px; }
      .ecc-ora { max-width: 130px; }
      .ecc-valet { min-width: 190px; }
      .ecc-tog { margin-left: auto; align-self: center; }
      .add-ecc { align-self: flex-start; }
      .ecc-riga { font-size: 11.5px; color: var(--gold-strong, #b8963e); font-weight: 550; }
      .hint { font-size: 12px; color: var(--text-tertiary); margin: 0; }
      .hint.warn { color: var(--orange); }
      /* «Ogni [2] [settimane]»: si legge come una frase, non come tre campi. */
      .ripetizione { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .ogni-testo { font-size: 13.5px; color: var(--text-secondary); }
      .ogni-num { width: 76px; }
      .freq { width: auto; min-width: 130px; }
      .mese { max-width: 320px; }
      .riassunto { margin: 2px 0 0; font-size: 13px; color: var(--text); font-weight: 550; }
      .azioni { display: flex; justify-content: flex-end; }
      .giorni { display: inline-flex; gap: 2px; }
      .giorni .g { font-size: 10.5px; font-weight: 600; color: var(--text-tertiary); opacity: 0.4; }
      .giorni .g.on { color: var(--text); opacity: 1; }
      .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; }
      .badge .dot { width: 7px; height: 7px; border-radius: 50%; }
      .badge-on { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
      .badge-on .dot { background: var(--success); }
      .badge-off { background: var(--fill); color: var(--text-tertiary); }
      .badge-off .dot { background: var(--text-tertiary); }
      /* ⚠️ La classe .link-btn non era definita da nessuna parte, ne' qui ne'
         nel foglio globale: i tre bottoni della riga uscivano col VESTITO
         NATIVO del browser — riquadri grigi squadrati in mezzo a
         un'interfaccia a pillole. Qui prendono la stessa forma delle azioni di
         riga della lista consegne (.act), che e' lo standard di questa app.
         ⚠️⚠️ Niente apici inversi nei commenti: chiudono il template literal
         di styles[] e la build cita «position 0». E' gia' successo tre volte. */
      .link-btn {
        appearance: none;
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--hairline-strong);
        background: var(--surface);
        border-radius: 980px;
        padding: 4px 11px;
        margin-right: 6px;
        font-size: 12px;
        font-weight: 550;
        font-family: inherit;
        color: var(--text);
        cursor: pointer;
        text-decoration: none;
        transition: background 0.15s var(--ease);
      }
      .link-btn:hover:not(:disabled) { background: var(--fill); }
      .link-btn:disabled { opacity: .4; cursor: not-allowed; }
      .link-btn.danger { color: var(--danger, #d70015); border-color: rgba(215, 0, 21, 0.28); }
      .link-btn.danger:hover:not(:disabled) { background: rgba(215, 0, 21, 0.07); }
      .ok-card { padding: 12px 16px; margin-bottom: 12px; color: var(--success); }
      .state-card { display: flex; flex-direction: column; gap: 6px; padding: 28px; }
    `,
  ],
})
export class RecurringServicesComponent implements AfterViewInit {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly zone = inject(NgZone);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  /**
   * Il PARTNER si imposta i propri presìdi, ma non sceglie CHI li fa ne' QUANTO
   * costano: vale il listino che ha gia'. Quei campi non gli si mostrano — e
   * l'API li sovrascrive comunque, perche' un form nascosto non e' una difesa.
   */
  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  /**
   * ⚠️ I due campi vivono dentro un `@if`: al primo `ngAfterViewInit` NON
   * esistono ancora, e prima si agganciava solo li'. Risultato: il commento
   * diceva «si aggancia all'apertura del form» ma nessuno richiamava
   * l'aggancio, e i suggerimenti non uscivano mai — mentre sul form consegna,
   * dove il campo c'e' sempre, funzionavano. Il difetto non era nella chiave.
   *
   * Con il SETTER l'aggancio scatta esattamente quando il campo compare, senza
   * timer da indovinare. La corsa con il caricamento di Google e' coperta dai
   * due versi: se la chiave arriva dopo, `ngAfterViewInit` richiama; se il
   * campo arriva dopo, richiama il setter.
   */
  private rifDest?: ElementRef<HTMLInputElement>;
  private rifRitiro?: ElementRef<HTMLInputElement>;
  @ViewChild('addrDest') set impostaDest(rif: ElementRef<HTMLInputElement> | undefined) {
    this.rifDest = rif;
    if (rif) this.agganciaIndirizzi();
  }
  @ViewChild('addrRitiro') set impostaRitiro(rif: ElementRef<HTMLInputElement> | undefined) {
    this.rifRitiro = rif;
    if (rif) this.agganciaIndirizzi();
  }
  get addrDest(): ElementRef<HTMLInputElement> | undefined { return this.rifDest; }
  get addrRitiro(): ElementRef<HTMLInputElement> | undefined { return this.rifRitiro; }
  /** La chiave browser di Google non c'e': i campi restano di testo, e si dice. */
  readonly mapsMancante = signal(false);

  /**
   * Aggancia l'autocomplete di Google Places ai due indirizzi, come fa il form
   * consegna. Un servizio ricorrente con l'indirizzo scritto male sbaglia OGNI
   * GIORNO, non una volta: qui vale ancora piu' che altrove che l'indirizzo sia
   * quello normalizzato da Google e non quello battuto a mano.
   *
   * ⚠️ Il form vive dentro un `@if`, quindi i campi NON esistono al primo
   * `ngAfterViewInit`: si aggancia quando compaiono (apertura del form), e una
   * volta sola per campo.
   */
  ngAfterViewInit(): void {
    this.http.get<{ googleMapsBrowserKey: string | null }>(`${this.api}/settings/public`)
      .subscribe({
        next: async (cfg) => {
          const key = cfg?.googleMapsBrowserKey;
          if (!key) { this.mapsMancante.set(true); return; }
          this.mapsMancante.set(false);
          try {
            await loadGoogleMaps(key);
            this.chiaveMaps = key;
            this.agganciaIndirizzi();
          } catch { /* script non caricato: restano campi normali */ }
        },
        error: () => this.mapsMancante.set(true),
      });
  }

  private chiaveMaps: string | null = null;
  private agganciati = new WeakSet<HTMLInputElement>();

  /** Aggancia i campi che ci sono adesso. Si richiama all'apertura del form. */
  agganciaIndirizzi(): void {
    if (!this.chiaveMaps) return;
    for (const rif of [this.addrDest, this.addrRitiro]) {
      const input = rif?.nativeElement;
      if (!input || this.agganciati.has(input)) continue;
      this.agganciati.add(input);
      const auto = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'it' },
        fields: ['formatted_address'],
        types: ['address'],
      });
      auto.addListener('place_changed', () => {
        const indirizzo = auto.getPlace()?.formatted_address;
        if (!indirizzo) return;
        // L'evento di Google e' fuori dal ciclo Angular: si rientra con la zona.
        this.zone.run(() => {
          if (input === this.addrDest?.nativeElement) this.m.recipientAddress = indirizzo;
          else this.m.pickupAddress = indirizzo;
        });
      });
    }
  }

  readonly GIORNI = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  /** Per il riassunto a parole: le iniziali non si leggono in una frase. */
  readonly NOMI_GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

  /** Come si ripete: le tre voci della tendina «Ogni». */
  readonly FREQUENZE = ['SETTIMANALE', 'GIORNALIERO', 'MENSILE'] as const;

  readonly lista = signal<Ricorrente[]>([]);
  readonly partners = signal<PartnerConServizi[]>([]);
  readonly valets = signal<Rif[]>([]);
  readonly loading = signal(true);
  readonly formOpen = signal(false);
  readonly salvando = signal(false);
  readonly generando = signal(false);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);

  giorniSel = [false, false, false, false, false, false, false];

  // ── ECCEZIONI PER GIORNO ───────────────────────────────────────────────────
  /** Le eccezioni in lavorazione. I giorni stanno a bandierine, non a stringa. */
  varianti: { giorni: boolean[]; timeFrom: string; timeTo: string; valetId: string }[] = [];
  /** Quando si modifica: l'id del ricorrente aperto. Vuoto = se ne crea uno nuovo. */
  readonly inModifica = signal<string | null>(null);

  /**
   * Un'eccezione ha senso solo su un giorno che il servizio fa davvero: su un
   * SETTIMANALE gli altri giorni si spengono. Una regola che non può scattare
   * non si lascia impostare — sembrerebbe fatta e non farebbe niente.
   */
  giornoPossibile(i: number): boolean {
    return this.m.frequenza !== 'SETTIMANALE' || this.giorniSel[i];
  }

  aggiungiEccezione(): void {
    this.varianti = [
      ...this.varianti,
      { giorni: [false, false, false, false, false, false, false], timeFrom: '', timeTo: '', valetId: '' },
    ];
  }

  togliEccezione(i: number): void {
    this.varianti = this.varianti.filter((_, k) => k !== i);
  }

  /** «sabato, domenica» da "0000011": nell'elenco la maschera non si legge. */
  etichettaGiorni(maschera: string): string {
    return this.NOMI_GIORNI.filter((_, i) => maschera[i] === '1').join(', ');
  }

  /** Le eccezioni dette a parole, per rileggere quello che si è appena scelto. */
  riassuntoEccezioni(): string {
    const righe = this.varianti
      .filter((v) => v.giorni.some(Boolean) && v.timeFrom && v.timeTo)
      .map((v) => `${this.NOMI_GIORNI.filter((_, i) => v.giorni[i]).join(', ')} ${v.timeFrom}–${v.timeTo}`);
    if (!righe.length) return '';
    return this.translate.instant('recurring.exc.summary', {
      normale: `${this.m.timeFrom || '—'}–${this.m.timeTo || '—'}`,
      eccezioni: righe.join(' · '),
    });
  }

  /**
   * I servizi del PARTNER SCELTO, non tutto il catalogo.
   *
   * Prima la tendina mostrava tutti i tipi di servizio dell'azienda: si poteva
   * scegliere per un partner un servizio che quel partner non ha a listino —
   * e la consegna generata sarebbe nata senza prezzo. Finche' non si sceglie un
   * partner la tendina resta vuota, e lo dice.
   */
  serviziDelPartner(): Rif[] {
    const p = this.partners().find((x) => x.id === this.m.partnerId);
    if (!p) return [];
    return (p.services ?? [])
      .map((s) => ({ id: s.serviceType?.id ?? s.serviceTypeId, name: s.serviceType?.name ?? '' }))
      .filter((s) => s.id && s.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * La ricorrenza detta a parole, sotto i campi: «Ogni 2 settimane il lunedi'
   * e il venerdi'». Chi imposta deve poter rileggere quello che ha scelto
   * senza ricostruirlo dai controlli.
   */
  riassunto(): string {
    const n = Math.max(1, Number(this.m.ogni) || 1);
    const t = (k: string, p?: Record<string, unknown>) => this.translate.instant(k, p);
    const unita = t(`recurring.freq.${this.m.frequenza}.${n > 1 ? 'plurale' : 'singolare'}`);
    const testa = n > 1 ? `${t('recurring.f.every')} ${n} ${unita}` : `${t('recurring.f.every')} ${unita}`;
    if (this.m.frequenza === 'SETTIMANALE') {
      const scelti = this.NOMI_GIORNI.filter((_, i) => this.giorniSel[i]);
      if (!scelti.length) return `${testa} — ${t('recurring.f.days')}?`;
      return `${testa}: ${scelti.join(', ')}`;
    }
    if (this.m.frequenza === 'MENSILE') {
      const gg = (this.m.giorniMese ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      if (!gg.length) return `${testa} — ${t('recurring.f.monthDays')}?`;
      return `${testa}: ${t('recurring.f.dayOfMonth')} ${gg.join(', ')}`;
    }
    return testa;
  }

  /** Cambiando partner, un servizio che lui non ha non puo' restare scelto. */
  cambiaPartner(): void {
    if (!this.serviziDelPartner().some((s) => s.id === this.m.serviceTypeId)) {
      this.m.serviceTypeId = '';
    }
    this.proponiRitiro();
  }

  /**
   * L'INDIRIZZO DI RITIRO È QUELLO DEL PARTNER, proposto da solo.
   *
   * ⚠️ Si propone, non si impone: se qualcuno ha scritto un indirizzo suo non
   * glielo si cancella. Si riscrive solo quando il campo è vuoto o contiene
   * ancora l'indirizzo del partner PRECEDENTE — che, cambiato partner, sarebbe
   * il ritiro sbagliato lasciato lì a sembrare giusto.
   */
  private ritiroProposto = '';
  private proponiRitiro(): void {
    const suo = (this.partners().find((p) => p.id === this.m.partnerId)?.address ?? '').trim();
    const attuale = this.m.pickupAddress.trim();
    if (attuale && attuale !== this.ritiroProposto) return;
    this.m.pickupAddress = suo;
    this.ritiroProposto = suo;
  }

  /**
   * MODIFICA di un ricorrente esistente: si riapre il form con dentro i suoi
   * valori. Prima si poteva solo sospendere o eliminare — cambiare un orario
   * voleva dire rifare tutto da capo e perdere le consegne già collegate.
   */
  modifica(r: Ricorrente): void {
    this.error.set(null);
    this.banner.set(null);
    this.inModifica.set(r.id);
    this.giorniSel = Array.from({ length: 7 }, (_, i) => r.giorni[i] === '1');
    this.varianti = (r.varianti ?? []).map((v) => ({
      giorni: Array.from({ length: 7 }, (_, i) => v.giorni[i] === '1'),
      timeFrom: v.timeFrom,
      timeTo: v.timeTo,
      valetId: v.valetId ?? '',
    }));
    const iso = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : '');
    this.m = {
      nome: r.nome,
      partnerId: r.partner.id,
      serviceTypeId: r.serviceType.id,
      valetId: r.valet?.id ?? '',
      frequenza: (r.frequenza ?? 'SETTIMANALE') as (typeof this.FREQUENZE)[number],
      ogni: r.ogni ?? 1,
      giorniMese: r.giorniMese ?? '',
      timeFrom: r.timeFrom,
      timeTo: r.timeTo,
      dataInizio: iso(r.dataInizio),
      dataFine: iso(r.dataFine),
      recipientAddress: r.recipientAddress,
      pickupAddress: r.pickupAddress ?? '',
      price: r.price ?? null,
      valetSalary: r.valetSalary ?? null,
      hours: r.hours ?? null,
      note: r.note ?? '',
    };
    // ⚠️ Aprendo in modifica il ritiro è quello SALVATO: non si ripropone
    // quello del partner, o si sovrascriverebbe una scelta già fatta.
    this.ritiroProposto = '';
    this.formOpen.set(true);
    // I campi indirizzo nascono adesso: l'aggancio a Google scatta dal setter
    // del ViewChild, non serve richiamarlo qui.
  }

  /** Si esce dalla modifica: il form torna a essere quello del nuovo. */
  annullaForm(): void {
    this.formOpen.set(false);
    this.inModifica.set(null);
    this.varianti = [];
  }

  /**
   * Form vuoto per un nuovo ricorrente.
   * ⚠️ Si RIPULISCE davvero: aprendo «Nuovo» dopo una modifica, senza questo,
   * si riscriverebbe sopra il ricorrente di prima credendo di crearne uno.
   */
  apriNuovo(): void {
    this.error.set(null);
    this.banner.set(null);
    this.inModifica.set(null);
    this.varianti = [];
    this.giorniSel = [false, false, false, false, false, false, false];
    this.ritiroProposto = '';
    const oggi = new Date();
    this.m = {
      nome: '', partnerId: this.isPartner() ? (this.auth.user()?.partnerId ?? '') : '',
      serviceTypeId: '', valetId: '',
      frequenza: 'SETTIMANALE', ogni: 1, giorniMese: '',
      timeFrom: '', timeTo: '',
      dataInizio: `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`,
      dataFine: '',
      recipientAddress: '', pickupAddress: '',
      price: null, valetSalary: null, hours: null, note: '',
    };
    this.proponiRitiro();
    this.formOpen.set(true);
  }

  m = {
    nome: '', partnerId: '', serviceTypeId: '', valetId: '',
    frequenza: 'SETTIMANALE' as (typeof this.FREQUENZE)[number],
    ogni: 1,
    giorniMese: '',
    timeFrom: '', timeTo: '', dataInizio: '', dataFine: '',
    recipientAddress: '', pickupAddress: '',
    price: null as number | null, valetSalary: null as number | null, hours: null as number | null,
    note: '',
  };

  constructor() {
    this.load();
    // ⚠️ Solo i partner ATTIVI: un servizio ricorrente su un partner spento
    // genererebbe consegne per qualcuno con cui non lavoriamo piu'.
    this.http.get<PartnerConServizi[]>(`${this.api}/partners`).subscribe((d) =>
      this.partners.set((d ?? []).filter((p) => p.active !== false)));
    // Il partner non sceglie se stesso da una tendina: e' gia' lui. Serve pero'
    // avere il suo id nel modello, o la tendina dei servizi resta vuota.
    if (this.isPartner()) this.m.partnerId = this.auth.user()?.partnerId ?? '';
    // I valet li assegna l'ufficio: al partner la lista non serve.
    if (!this.isPartner()) {
      this.http.get<Rif[]>(`${this.api}/valets`).subscribe((d) =>
        this.valets.set((d ?? []).filter((v) => v.active !== false && !v.placeholder)));
    }
    const oggi = new Date();
    this.m.dataInizio = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
  }

  private load(): void {
    this.http.get<Ricorrente[]>(`${this.api}/recurring-services`).subscribe({
      next: (d) => { this.lista.set(d ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  salva(): void {
    this.error.set(null);
    this.banner.set(null);
    const giorni = this.giorniSel.map((x) => (x ? '1' : '0')).join('');
    const mancanti: string[] = [];
    if (!this.m.nome.trim()) mancanti.push(this.translate.instant('recurring.f.nome'));
    if (!this.m.partnerId) mancanti.push(this.translate.instant('recurring.f.partner'));
    if (!this.m.serviceTypeId) mancanti.push(this.translate.instant('recurring.f.service'));
    // ⚠️ Si chiede solo quello che quella ricorrenza usa davvero: i giorni
    // della settimana a una settimanale, i giorni del mese a una mensile.
    // Alla giornaliera non serve nessuno dei due.
    if (this.m.frequenza === 'SETTIMANALE' && !/[1]/.test(giorni)) {
      mancanti.push(this.translate.instant('recurring.f.days'));
    }
    if (this.m.frequenza === 'MENSILE'
        && !(this.m.giorniMese ?? '').split(',').map((x) => Number(x.trim())).some((n) => n >= 1 && n <= 31)) {
      mancanti.push(this.translate.instant('recurring.f.monthDays'));
    }
    if (!this.m.timeFrom || !this.m.timeTo) mancanti.push(this.translate.instant('recurring.f.from'));
    if (!this.m.recipientAddress.trim()) mancanti.push(this.translate.instant('recurring.f.address'));
    if (!this.m.dataInizio) mancanti.push(this.translate.instant('recurring.f.start'));
    if (mancanti.length) {
      this.error.set(this.translate.instant('recurring.missing', { campi: mancanti.join(', ') }));
      return;
    }
    this.salvando.set(true);
    const payload: Record<string, unknown> = {
      nome: this.m.nome.trim(), partnerId: this.m.partnerId, serviceTypeId: this.m.serviceTypeId,
      giorni, timeFrom: this.m.timeFrom, timeTo: this.m.timeTo,
      recipientAddress: this.m.recipientAddress.trim(),
      dataInizio: this.m.dataInizio,
      frequenza: this.m.frequenza,
      ogni: Math.max(1, Number(this.m.ogni) || 1),
    };
    if (this.m.frequenza === 'MENSILE') payload['giorniMese'] = (this.m.giorniMese ?? '').trim();
    if (this.m.valetId) payload['valetId'] = this.m.valetId;
    if (this.m.dataFine) payload['dataFine'] = this.m.dataFine;
    if (this.m.pickupAddress.trim()) payload['pickupAddress'] = this.m.pickupAddress.trim();
    if (this.m.price != null) payload['price'] = Number(this.m.price);
    if (this.m.valetSalary != null) payload['valetSalary'] = Number(this.m.valetSalary);
    if (this.m.hours != null) payload['hours'] = Number(this.m.hours);
    if (this.m.note.trim()) payload['note'] = this.m.note.trim();
    // ⚠️ Le eccezioni si mandano SEMPRE, anche vuote: `[]` vuol dire «non ce ne
    // sono più» e il server le toglie, mentre non mandarle vorrebbe dire «non
    // le ho toccate» e resterebbero quelle vecchie. In modifica è la differenza
    // fra togliere un'eccezione e non riuscire a toglierla.
    payload['varianti'] = this.varianti
      .filter((v) => v.giorni.some(Boolean))
      .map((v) => ({
        giorni: v.giorni.map((x) => (x ? '1' : '0')).join(''),
        timeFrom: v.timeFrom,
        timeTo: v.timeTo,
        ...(v.valetId ? { valetId: v.valetId } : {}),
      }));
    // In modifica i campi che il form non mostra (prezzo e paga per un partner)
    // non si mandano: il server li rifiuterebbe comunque, ma qui non si finge
    // nemmeno di mandarli.
    const id = this.inModifica();
    const chiamata = id
      ? this.http.patch(`${this.api}/recurring-services/${id}`, payload)
      : this.http.post(`${this.api}/recurring-services`, payload);
    chiamata.subscribe({
      next: (r: any) => {
        this.salvando.set(false);
        this.formOpen.set(false);
        this.inModifica.set(null);
        // Si dice che cosa è successo DAVVERO: quante consegne sono nate e
        // quante future sono state rimesse in riga. «Salvato» da solo non
        // distingue un presidio che parte da uno che non parte.
        const nate = r?.generate?.create ?? 0;
        const riall = (r?.riallineate?.toccate ?? 0) + (r?.riallineate?.tolte ?? 0);
        this.banner.set(
          id
            ? this.translate.instant('recurring.updated', { n: nate, r: riall })
            : this.translate.instant('recurring.savedWithN', { n: nate }),
        );
        this.giorniSel = [false, false, false, false, false, false, false];
        this.varianti = [];
        this.ritiroProposto = '';
        this.m = { ...this.m, nome: "", recipientAddress: "", pickupAddress: "", note: "", price: null, valetSalary: null, hours: null, giorniMese: "" };
        this.load();
      },
      error: (e) => {
        this.salvando.set(false);
        this.error.set(e?.error?.message ?? this.translate.instant('common.saveError'));
      },
    });
  }

  toggle(r: Ricorrente): void {
    this.http.patch(`${this.api}/recurring-services/${r.id}`, { attivo: !r.attivo }).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(e?.error?.message ?? 'Errore'),
    });
  }

  elimina(r: Ricorrente): void {
    if (!confirm(this.translate.instant('recurring.deleteConfirm', { nome: r.nome }))) return;
    this.http.delete(`${this.api}/recurring-services/${r.id}`).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(e?.error?.message ?? 'Errore'),
    });
  }

  generaOggi(): void {
    this.error.set(null);
    this.generando.set(true);
    this.http.post<{ create: number; giaEsistenti: number; dal: string; al: string }>(`${this.api}/recurring-services/genera`, {}).subscribe({
      next: (d) => {
        this.generando.set(false);
        // Si dice anche FINO A QUANDO si e' generato: «create 12» senza la
        // finestra non fa capire se il calendario e' coperto o no.
        this.banner.set(this.translate.instant('recurring.generated', {
          n: d.create, gia: d.giaEsistenti, dal: d.dal, al: d.al,
        }));
        this.load();
      },
      error: (e) => {
        this.generando.set(false);
        this.error.set(e?.error?.message ?? 'Errore nella generazione');
      },
    });
  }
}
