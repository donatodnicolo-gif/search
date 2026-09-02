import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface Disp {
  date: string;
  available: boolean;
  timeFrom?: string | null;
  timeTo?: string | null;
  note?: string | null;
}

/**
 * DISPONIBILITÀ DEL VALET — VISTA A SETTIMANA (02/09/2026, regola utente:
 * «la pagina è illeggibile, deve consentire di caricare le disponibilità per
 * settimana, stile Google»). Sette colonne Lun→Dom come un calendario: si
 * clicca il giorno, si imposta lo stato (disponibile/fascia/non disponibile)
 * e con «Applica a tutta la settimana» lo stesso stato copre i 7 giorni in un
 * colpo. Il default resta «disponibile»: si dichiarano le eccezioni.
 * La lista mensile precedente impilava 31 card ed era illeggibile.
 */
@Component({
  selector: 'app-valet-availability',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'availability.title' | translate }}</h1>
        <p class="page-caption">{{ 'availability.caption' | translate }}</p>
      </div>
    </div>

    <div class="card barra-sett">
      <button type="button" class="act" (click)="cambiaSettimana(-1)" aria-label="settimana precedente">‹</button>
      <strong>{{ etichettaSettimana() }}</strong>
      <button type="button" class="act" (click)="cambiaSettimana(1)" aria-label="settimana successiva">›</button>
      <button type="button" class="btn btn-secondary mini oggi-btn" (click)="vaiAOggi()">{{ 'deliveries.quick.today' | translate }}</button>
    </div>

    @if (caricando()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
    @else {
      <div class="settimana">
        @for (g of giorni(); track g.iso) {
          <button type="button" class="col-giorno card"
                  [class.oggi]="g.iso === oggiIso"
                  [class.passato]="g.iso < oggiIso"
                  [class.scelto]="aperto() === g.iso"
                  [class.non-disp]="statoDi(g.iso) === false"
                  (click)="apri(g.iso)">
            <span class="dow">{{ g.data | date: 'EEE' }}</span>
            <span class="num">{{ g.data | date: 'd' }}</span>
            <span class="mese-mini">{{ g.data | date: 'MMM' }}</span>
            @if (disp(g.iso); as d) {
              @if (!d.available) { <span class="pill ko">{{ 'availability.notAvailable' | translate }}</span> }
              @else if (d.timeFrom && d.timeTo) { <span class="pill ok">{{ d.timeFrom }}–{{ d.timeTo }}</span> }
              @else { <span class="pill ok">{{ 'availability.available' | translate }}</span> }
              @if (d.note) { <span class="nota">{{ d.note }}</span> }
            } @else {
              <span class="pill def">{{ 'availability.defaultAvailable' | translate }}</span>
            }
          </button>
        }
      </div>

      @if (aperto(); as giorno) {
        <div class="card editor">
          <h2>{{ dataAperta() | date: 'EEEE d MMMM' }}</h2>
          <div class="chips">
            <button type="button" class="chip" [class.on]="bozza.available" (click)="bozza.available = true">
              {{ 'availability.available' | translate }}
            </button>
            <button type="button" class="chip" [class.on]="!bozza.available" (click)="bozza.available = false">
              {{ 'availability.notAvailable' | translate }}
            </button>
          </div>
          @if (bozza.available) {
            <div class="fasce">
              <label>{{ 'availability.from' | translate }}
                <input class="field" type="time" step="900" [(ngModel)]="bozza.timeFrom" /></label>
              <label>{{ 'availability.to' | translate }}
                <input class="field" type="time" step="900" [(ngModel)]="bozza.timeTo" /></label>
            </div>
            <p class="hint">{{ 'availability.slotHint' | translate }}</p>
          }
          <input class="field" [(ngModel)]="bozza.note" [placeholder]="'availability.notePh' | translate" />
          <div class="azioni">
            @if (disp(giorno)) {
              <button type="button" class="btn btn-secondary" [disabled]="salvando()" (click)="ripristina(giorno)">
                {{ 'availability.reset' | translate }}
              </button>
            }
            <button type="button" class="btn btn-secondary" (click)="aperto.set(null)">{{ 'common.cancel' | translate }}</button>
            <!-- ⭐ Il caricamento «per settimana»: lo stesso stato su Lun→Dom. -->
            <button type="button" class="btn btn-secondary" [disabled]="salvando()" (click)="applicaSettimana()">
              {{ 'availability.applyWeek' | translate }}
            </button>
            <button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salva(giorno)">
              {{ salvando() ? ('common.saving' | translate) : ('common.save' | translate) }}
            </button>
          </div>
          @if (errore(); as e) { <div class="error-card">{{ e }}</div> }
        </div>
      }
    }
  `,
  styles: [
    `
      .barra-sett { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 12px; margin-bottom: 14px; }
      .barra-sett strong { font-size: 16px; min-width: 220px; text-align: center; text-transform: capitalize; }
      .oggi-btn { margin-left: 8px; }
      /* Sette colonne come un calendario; sul telefono si impilano. */
      .settimana { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
      @media (max-width: 760px) { .settimana { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      .col-giorno { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px 16px;
                    border: 1px solid var(--hairline); cursor: pointer; font: inherit; background: var(--surface);
                    transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease); }
      .col-giorno:hover { border-color: var(--hairline-strong); }
      .col-giorno.oggi { border-color: var(--gold); }
      .col-giorno.scelto { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
      .col-giorno.passato { opacity: 0.55; }
      .col-giorno.non-disp { background: rgba(215, 0, 21, 0.04); }
      .dow { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
      .num { font-size: 22px; font-weight: 650; line-height: 1; }
      .mese-mini { font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; }
      .pill { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 550; margin-top: 4px;
              max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pill.ok { background: var(--green-soft, rgba(36,138,61,0.11)); color: var(--green, #248a3d); }
      .pill.ko { background: var(--red-soft, rgba(215,0,21,0.09)); color: var(--red); }
      .pill.def { background: var(--fill); color: var(--text-secondary); }
      .nota { font-size: 11.5px; color: var(--text-secondary); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .editor { margin-top: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
      .editor h2 { margin: 0 0 4px; font-size: 17px; text-transform: capitalize; }
      .chips { display: flex; gap: 8px; }
      .chip { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 999px;
              padding: 10px 16px; font: inherit; cursor: pointer; flex: 1; max-width: 220px; }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .fasce { display: flex; gap: 10px; }
      .fasce label { flex: 1; max-width: 220px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
      .hint { font-size: 12px; color: var(--text-tertiary); margin: 0; }
      .azioni { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
    `,
  ],
})
export class ValetAvailabilityComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  private readonly valetId = this.auth.user()?.valetId ?? '';
  readonly oggiIso = new Date().toISOString().slice(0, 10);
  /** Il lunedì della settimana mostrata. */
  readonly lunedi = signal(this.lunediDi(new Date()));
  readonly caricando = signal(false);
  readonly salvando = signal(false);
  readonly errore = signal<string | null>(null);
  readonly aperto = signal<string | null>(null);
  private readonly righe = signal<Map<string, Disp>>(new Map());

  bozza: { available: boolean; timeFrom: string; timeTo: string; note: string } =
    { available: true, timeFrom: '', timeTo: '', note: '' };

  private lunediDi(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // getDay(): 0 = domenica — la settimana comincia il LUNEDÌ.
    const scarto = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - scarto);
    return x;
  }

  readonly giorni = computed(() => {
    const out: { iso: string; data: Date }[] = [];
    for (let i = 0; i < 7; i++) {
      const data = new Date(this.lunedi());
      data.setDate(data.getDate() + i);
      out.push({ iso: this.iso(data), data });
    }
    return out;
  });

  readonly etichettaSettimana = computed(() => {
    const gg = this.giorni();
    const da = gg[0].data, a = gg[6].data;
    const daT = da.toLocaleDateString('it-IT', { day: 'numeric', month: da.getMonth() === a.getMonth() ? undefined : 'short' });
    const aT = a.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    return `${daT} – ${aT}`;
  });

  readonly dataAperta = computed(() => {
    const iso = this.aperto();
    return iso ? new Date(iso + 'T00:00:00') : null;
  });

  constructor() { this.carica(); }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  disp(iso: string): Disp | undefined { return this.righe().get(iso); }
  statoDi(iso: string): boolean | undefined { return this.righe().get(iso)?.available; }

  cambiaSettimana(delta: number): void {
    const l = new Date(this.lunedi());
    l.setDate(l.getDate() + delta * 7);
    this.lunedi.set(l);
    this.aperto.set(null);
    this.carica();
  }
  vaiAOggi(): void {
    this.lunedi.set(this.lunediDi(new Date()));
    this.aperto.set(null);
    this.carica();
  }

  private carica(): void {
    if (!this.valetId) return;
    this.caricando.set(true);
    const gg = this.giorni();
    this.http.get<Disp[]>(`${environment.apiUrl}/valets/${this.valetId}/availability`,
      { params: { from: gg[0].iso, to: gg[6].iso } })
      .subscribe({
        next: (r) => { this.righe.set(new Map((r ?? []).map((x) => [x.date, x]))); this.caricando.set(false); },
        error: () => { this.righe.set(new Map()); this.caricando.set(false); },
      });
  }

  apri(iso: string): void {
    this.errore.set(null);
    if (this.aperto() === iso) { this.aperto.set(null); return; }
    const d = this.disp(iso);
    this.bozza = {
      available: d ? d.available : true,
      timeFrom: d?.timeFrom ?? '',
      timeTo: d?.timeTo ?? '',
      note: d?.note ?? '',
    };
    this.aperto.set(iso);
  }

  private corpo(iso: string): Record<string, unknown> {
    const body: Record<string, unknown> = { date: iso, available: this.bozza.available, note: this.bozza.note?.trim() || undefined };
    if (this.bozza.available && this.bozza.timeFrom && this.bozza.timeTo) {
      body['timeFrom'] = this.bozza.timeFrom;
      body['timeTo'] = this.bozza.timeTo;
    }
    return body;
  }

  salva(iso: string): void {
    this.salvando.set(true);
    this.errore.set(null);
    this.http.put(`${environment.apiUrl}/valets/${this.valetId}/availability`, this.corpo(iso)).subscribe({
      next: () => { this.salvando.set(false); this.aperto.set(null); this.carica(); },
      error: (err) => { this.salvando.set(false); this.errore.set(err?.error?.message ?? this.translate.instant('availability.error')); },
    });
  }

  /** Lo stesso stato su TUTTA la settimana mostrata (Lun→Dom): 7 scritture. */
  applicaSettimana(): void {
    this.salvando.set(true);
    this.errore.set(null);
    forkJoin(this.giorni().map((g) =>
      this.http.put(`${environment.apiUrl}/valets/${this.valetId}/availability`, this.corpo(g.iso)),
    )).subscribe({
      next: () => { this.salvando.set(false); this.aperto.set(null); this.carica(); },
      error: (err) => { this.salvando.set(false); this.errore.set(err?.error?.message ?? this.translate.instant('availability.error')); this.carica(); },
    });
  }

  /** Torna al default (disponibile): cancella la riga della data. */
  ripristina(iso: string): void {
    this.salvando.set(true);
    this.http.delete(`${environment.apiUrl}/valets/${this.valetId}/availability/${iso}`).subscribe({
      next: () => { this.salvando.set(false); this.aperto.set(null); this.carica(); },
      error: (err) => { this.salvando.set(false); this.errore.set(err?.error?.message ?? this.translate.instant('availability.error')); },
    });
  }
}
