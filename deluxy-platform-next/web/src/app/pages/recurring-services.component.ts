import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

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
        <button class="btn btn-ghost" [disabled]="generando()" (click)="generaOggi()">{{ (generando() ? 'common.saving' : 'recurring.generateToday') | translate }}</button>
        <button class="btn btn-primary" (click)="formOpen.set(!formOpen())">{{ (formOpen() ? 'common.cancel' : 'recurring.new') | translate }}</button>
      </div>
    </div>

    @if (banner()) { <div class="card ok-card">{{ banner() }}</div> }
    @if (error()) { <div class="error-card">{{ error() }}</div> }

    @if (formOpen()) {
      <section class="card gen">
        <div class="grid">
          <label class="fld"><span>{{ 'recurring.f.nome' | translate }} *</span>
            <input class="field" [(ngModel)]="m.nome" [placeholder]="'recurring.f.nomePh' | translate" /></label>
          <label class="fld"><span>{{ 'recurring.f.partner' | translate }} *</span>
            <select class="field" [(ngModel)]="m.partnerId" (ngModelChange)="cambiaPartner()">
              <option value="">—</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
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
          <label class="fld"><span>{{ 'recurring.f.valet' | translate }}</span>
            <select class="field" [(ngModel)]="m.valetId">
              <option value="">{{ 'recurring.f.valetAuto' | translate }}</option>
              @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
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
            <input class="field" type="time" [(ngModel)]="m.timeFrom" /></label>
          <label class="fld"><span>{{ 'recurring.f.to' | translate }} *</span>
            <input class="field" type="time" [(ngModel)]="m.timeTo" /></label>
          <label class="fld"><span>{{ 'recurring.f.start' | translate }} *</span>
            <input class="field" type="date" [(ngModel)]="m.dataInizio" /></label>
          <label class="fld"><span>{{ 'recurring.f.end' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="m.dataFine" /></label>
        </div>
        <div class="grid">
          <label class="fld wide"><span>{{ 'recurring.f.address' | translate }} *</span>
            <input class="field" [(ngModel)]="m.recipientAddress" /></label>
          <label class="fld wide"><span>{{ 'recurring.f.pickup' | translate }}</span>
            <input class="field" [(ngModel)]="m.pickupAddress" /></label>
        </div>
        <div class="grid">
          <label class="fld"><span>{{ 'recurring.f.price' | translate }}</span>
            <input class="field num" type="number" [(ngModel)]="m.price" /></label>
          <label class="fld"><span>{{ 'recurring.f.salary' | translate }}</span>
            <input class="field num" type="number" [(ngModel)]="m.valetSalary" /></label>
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
                </td>
                <td>{{ r.valet ? (r.valet.lastName + ' ' + r.valet.firstName) : '—' }}</td>
                <td class="num">{{ r._count.deliveries | number }}</td>
                <td>
                  <span class="badge" [class.badge-on]="r.attivo" [class.badge-off]="!r.attivo">
                    <span class="dot"></span>{{ (r.attivo ? 'common.active' : 'common.inactive') | translate }}
                  </span>
                </td>
                <td class="nowrap">
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
      .link-btn.danger { color: var(--danger, #d70015); }
      .ok-card { padding: 12px 16px; margin-bottom: 12px; color: var(--success); }
      .state-card { display: flex; flex-direction: column; gap: 6px; padding: 28px; }
    `,
  ],
})
export class RecurringServicesComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;

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
    this.http.get<Rif[]>(`${this.api}/valets`).subscribe((d) =>
      this.valets.set((d ?? []).filter((v) => v.active !== false && !v.placeholder)));
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
    this.http.post(`${this.api}/recurring-services`, payload).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formOpen.set(false);
        this.banner.set(this.translate.instant('recurring.saved'));
        this.giorniSel = [false, false, false, false, false, false, false];
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
    this.http.post<{ create: number; giaEsistenti: number; ricorrentiDelGiorno: number }>(`${this.api}/recurring-services/genera`, {}).subscribe({
      next: (d) => {
        this.generando.set(false);
        this.banner.set(this.translate.instant('recurring.generated', { n: d.create, gia: d.giaEsistenti, tot: d.ricorrentiDelGiorno }));
        this.load();
      },
      error: (e) => {
        this.generando.set(false);
        this.error.set(e?.error?.message ?? 'Errore nella generazione');
      },
    });
  }
}
