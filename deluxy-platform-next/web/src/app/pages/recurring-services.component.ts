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
            <select class="field" [(ngModel)]="m.partnerId">
              <option value="">—</option>
              @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.insegna }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'recurring.f.service' | translate }} *</span>
            <select class="field" [(ngModel)]="m.serviceTypeId">
              <option value="">—</option>
              @for (s of services(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'recurring.f.valet' | translate }}</span>
            <select class="field" [(ngModel)]="m.valetId">
              <option value="">{{ 'recurring.f.valetAuto' | translate }}</option>
              @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.lastName }} {{ v.firstName }}</option> }
            </select></label>
        </div>

        <!-- I GIORNI, come gli orari di Google: chips lun..dom. -->
        <div class="setup-group">
          <span class="group-label">{{ 'recurring.f.days' | translate }} *</span>
          <div class="chips">
            @for (g of GIORNI; track $index) {
              <button type="button" class="chip" [class.on]="giorniSel[$index]" (click)="giorniSel[$index] = !giorniSel[$index]">{{ g }}</button>
            }
          </div>
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

  readonly lista = signal<Ricorrente[]>([]);
  readonly partners = signal<Rif[]>([]);
  readonly services = signal<Rif[]>([]);
  readonly valets = signal<Rif[]>([]);
  readonly loading = signal(true);
  readonly formOpen = signal(false);
  readonly salvando = signal(false);
  readonly generando = signal(false);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);

  giorniSel = [false, false, false, false, false, false, false];
  m = {
    nome: '', partnerId: '', serviceTypeId: '', valetId: '',
    timeFrom: '', timeTo: '', dataInizio: '', dataFine: '',
    recipientAddress: '', pickupAddress: '',
    price: null as number | null, valetSalary: null as number | null, hours: null as number | null,
    note: '',
  };

  constructor() {
    this.load();
    this.http.get<Rif[]>(`${this.api}/partners`).subscribe((d) => this.partners.set(d ?? []));
    this.http.get<Rif[]>(`${this.api}/service-types`).subscribe((d) => this.services.set(d ?? []));
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
    if (!/[1]/.test(giorni)) mancanti.push(this.translate.instant('recurring.f.days'));
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
    };
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
        this.m = { ...this.m, nome: '', recipientAddress: '', pickupAddress: '', note: '', price: null, valetSalary: null, hours: null };
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
