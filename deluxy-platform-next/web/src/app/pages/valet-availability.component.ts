import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
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
 * DISPONIBILITÀ DEL VALET (31/08/2026): il valet imposta i giorni in cui NON
 * è disponibile, o le fasce in cui lo è. Il default è «disponibile»: si
 * segnano le eccezioni. L'API (getAvailability/setAvailability) c'era già;
 * mancava la pagina — prima era un segnaposto «in migrazione».
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

    <div class="card barra-mese">
      <button type="button" class="act" (click)="cambiaMese(-1)" aria-label="mese precedente">‹</button>
      <strong>{{ etichettaMese() }}</strong>
      <button type="button" class="act" (click)="cambiaMese(1)" aria-label="mese successivo">›</button>
    </div>

    @if (caricando()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
    @else {
      <div class="giorni">
        @for (g of giorni(); track g.iso) {
          <div class="giorno card" [class.oggi]="g.iso === oggiIso" [class.non-disp]="statoDi(g.iso) === false">
            <button type="button" class="riga-giorno" (click)="apri(g.iso)">
              <div class="data">
                <span class="dow">{{ g.data | date: 'EEE' }}</span>
                <span class="num">{{ g.data | date: 'd' }}</span>
              </div>
              <div class="stato">
                @if (disp(g.iso); as d) {
                  @if (!d.available) { <span class="pill ko">{{ 'availability.notAvailable' | translate }}</span> }
                  @else if (d.timeFrom && d.timeTo) { <span class="pill ok">{{ d.timeFrom }}–{{ d.timeTo }}</span> }
                  @else { <span class="pill ok">{{ 'availability.available' | translate }}</span> }
                  @if (d.note) { <span class="nota">{{ d.note }}</span> }
                } @else {
                  <span class="pill def">{{ 'availability.defaultAvailable' | translate }}</span>
                }
              </div>
              <span class="chevron">›</span>
            </button>

            @if (aperto() === g.iso) {
              <div class="editor">
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
                  @if (disp(g.iso)) {
                    <button type="button" class="btn btn-secondary" [disabled]="salvando()" (click)="ripristina(g.iso)">
                      {{ 'availability.reset' | translate }}
                    </button>
                  }
                  <button type="button" class="btn btn-secondary" (click)="aperto.set(null)">{{ 'common.cancel' | translate }}</button>
                  <button type="button" class="btn btn-primary" [disabled]="salvando()" (click)="salva(g.iso)">
                    {{ salvando() ? ('common.saving' | translate) : ('common.save' | translate) }}
                  </button>
                </div>
                @if (errore(); as e) { <div class="error-card">{{ e }}</div> }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .barra-mese { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 12px; margin-bottom: 14px; }
      .barra-mese strong { font-size: 16px; min-width: 160px; text-align: center; text-transform: capitalize; }
      .giorni { display: flex; flex-direction: column; gap: 8px; }
      .giorno { overflow: hidden; }
      .giorno.non-disp { border-color: rgba(215, 0, 21, 0.25); }
      .giorno.oggi { border-color: var(--gold); }
      .riga-giorno { display: flex; align-items: center; gap: 14px; width: 100%; background: none; border: none;
                     padding: 12px 16px; cursor: pointer; font: inherit; text-align: left; }
      .data { display: flex; flex-direction: column; align-items: center; min-width: 42px; }
      .data .dow { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; }
      .data .num { font-size: 20px; font-weight: 600; }
      .stato { flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pill { border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 550; }
      .pill.ok { background: var(--green-soft, rgba(36,138,61,0.11)); color: var(--green, #248a3d); }
      .pill.ko { background: var(--red-soft, rgba(215,0,21,0.09)); color: var(--red); }
      .pill.def { background: var(--fill); color: var(--text-secondary); }
      .nota { font-size: 12.5px; color: var(--text-secondary); }
      .chevron { color: var(--text-tertiary); font-size: 20px; }
      .editor { padding: 4px 16px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--hairline); }
      .chips { display: flex; gap: 8px; }
      .chip { border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 999px;
              padding: 10px 16px; font: inherit; cursor: pointer; flex: 1; }
      .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
      .fasce { display: flex; gap: 10px; }
      .fasce label { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-secondary); }
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
  readonly mese = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly caricando = signal(false);
  readonly salvando = signal(false);
  readonly errore = signal<string | null>(null);
  readonly aperto = signal<string | null>(null);
  private readonly righe = signal<Map<string, Disp>>(new Map());

  bozza: { available: boolean; timeFrom: string; timeTo: string; note: string } =
    { available: true, timeFrom: '', timeTo: '', note: '' };

  readonly etichettaMese = computed(() =>
    this.mese().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));

  readonly giorni = computed(() => {
    const m = this.mese();
    const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const out: { iso: string; data: Date }[] = [];
    for (let d = 1; d <= ultimo; d++) {
      const data = new Date(m.getFullYear(), m.getMonth(), d);
      out.push({ iso: this.iso(data), data });
    }
    return out;
  });

  constructor() { this.carica(); }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  disp(iso: string): Disp | undefined { return this.righe().get(iso); }
  /** true/false se dichiarata, undefined se default. */
  statoDi(iso: string): boolean | undefined { return this.righe().get(iso)?.available; }

  cambiaMese(delta: number): void {
    const m = this.mese();
    this.mese.set(new Date(m.getFullYear(), m.getMonth() + delta, 1));
    this.aperto.set(null);
    this.carica();
  }

  private carica(): void {
    if (!this.valetId) return;
    this.caricando.set(true);
    const m = this.mese();
    const from = this.iso(new Date(m.getFullYear(), m.getMonth(), 1));
    const to = this.iso(new Date(m.getFullYear(), m.getMonth() + 1, 0));
    this.http.get<Disp[]>(`${environment.apiUrl}/valets/${this.valetId}/availability`, { params: { from, to } })
      .subscribe({
        next: (r) => { this.righe.set(new Map((r ?? []).map((x) => [x.date, x]))); this.caricando.set(false); },
        error: () => { this.righe.set(new Map()); this.caricando.set(false); },
      });
  }

  apri(iso: string): void {
    this.errore.set(null);
    const d = this.disp(iso);
    this.bozza = {
      available: d ? d.available : true,
      timeFrom: d?.timeFrom ?? '',
      timeTo: d?.timeTo ?? '',
      note: d?.note ?? '',
    };
    this.aperto.set(this.aperto() === iso ? null : iso);
  }

  salva(iso: string): void {
    this.salvando.set(true);
    this.errore.set(null);
    const body: any = { date: iso, available: this.bozza.available, note: this.bozza.note?.trim() || undefined };
    if (this.bozza.available && this.bozza.timeFrom && this.bozza.timeTo) {
      body.timeFrom = this.bozza.timeFrom;
      body.timeTo = this.bozza.timeTo;
    }
    this.http.put(`${environment.apiUrl}/valets/${this.valetId}/availability`, body).subscribe({
      next: () => { this.salvando.set(false); this.aperto.set(null); this.carica(); },
      error: (err) => { this.salvando.set(false); this.errore.set(err?.error?.message ?? this.translate.instant('availability.error')); },
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
