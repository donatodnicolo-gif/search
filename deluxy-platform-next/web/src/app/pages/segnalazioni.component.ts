import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface Segn {
  id: string;
  tipo: string;
  importo?: number | null;
  ricevutaUrl?: string | null;
  deliveryId?: string | null;
  partnerId?: string | null;
  valetId?: string | null;
  partnerNome?: string | null;
  valetNome?: string | null;
  oggetto?: string | null;
  testo: string;
  stato: string;
  risposta?: string | null;
  apertaDaRuolo?: string | null;
  createdAt: string;
}
interface Rif { id: string; nome: string }

/**
 * SEGNALAZIONI (31/08): l'ufficio apre segnalazioni su un partner o un valet;
 * qui confluiscono anche i reclami di partner e valet. Partner/valet vedono
 * solo le proprie (e possono aprirne una); l'ufficio le gestisce tutte.
 */
@Component({
  selector: 'app-segnalazioni',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'segnalazioni.title' | translate }}</h1>
        <p class="page-caption">{{ (isUfficio() ? 'segnalazioni.captionOffice' : 'segnalazioni.captionMine') | translate }}</p>
      </div>
      <button class="btn btn-primary" (click)="apriNuova()">+ {{ 'segnalazioni.new' | translate }}</button>
    </div>

    @if (nuovaAperta()) {
      <section class="card form">
        <h2>{{ 'segnalazioni.new' | translate }}</h2>
        <div class="grid">
          @if (isUfficio()) {
            <label class="fld"><span>{{ 'segnalazioni.onPartner' | translate }}</span>
              <select class="field" [(ngModel)]="bozza.partnerId" (ngModelChange)="bozza.valetId = ''">
                <option value="">—</option>
                @for (p of partners(); track p.id) { <option [value]="p.id">{{ p.nome }}</option> }
              </select></label>
            <label class="fld"><span>{{ 'segnalazioni.onValet' | translate }}</span>
              <select class="field" [(ngModel)]="bozza.valetId" (ngModelChange)="bozza.partnerId = ''">
                <option value="">—</option>
                @for (v of valets(); track v.id) { <option [value]="v.id">{{ v.nome }}</option> }
              </select></label>
          }
          <label class="fld span-2"><span>{{ 'segnalazioni.subject' | translate }}</span>
            <input class="field" [(ngModel)]="bozza.oggetto" /></label>
          <label class="fld span-2"><span class="req">{{ 'segnalazioni.text' | translate }}</span>
            <textarea class="field" rows="3" [(ngModel)]="bozza.testo"></textarea></label>
        </div>
        @if (errore(); as e) { <div class="error-card">{{ e }}</div> }
        <div class="azioni">
          <button class="btn btn-secondary" (click)="nuovaAperta.set(false)">{{ 'common.cancel' | translate }}</button>
          <button class="btn btn-primary" [disabled]="salvando()" (click)="salva()">
            {{ salvando() ? ('common.saving' | translate) : ('segnalazioni.send' | translate) }}
          </button>
        </div>
      </section>
    }

    <label class="cerca">
      <input class="field" type="search" [ngModel]="ricerca()" (ngModelChange)="ricerca.set($event)"
             [placeholder]="'segnalazioni.searchPh' | translate" />
    </label>

    <div class="tabs">
      @for (s of ['', 'aperta', 'in_lavorazione', 'chiusa']; track s) {
        <button class="tab" [class.on]="filtro() === s" (click)="filtro.set(s); carica()">
          {{ (s ? 'segnalazioni.stato.' + s : 'segnalazioni.all') | translate }}
        </button>
      }
    </div>
    <div class="tabs tipi">
      @for (t of ['', 'reclamo', 'rimborso', 'segnalazione']; track t) {
        <button class="tab" [class.on]="filtroTipo() === t" (click)="filtroTipo.set(t); carica()">
          {{ (t ? 'segnalazioni.tipo.' + t : 'segnalazioni.tuttiTipi') | translate }}
        </button>
      }
    </div>

    @if (caricando()) { <p class="muted">{{ 'common.loading' | translate }}</p> }
    @else if (!listaFiltrata().length) { <div class="card state-card">{{ 'segnalazioni.empty' | translate }}</div> }
    @else {
      <div class="lista">
        @for (s of listaFiltrata(); track s.id) {
          <div class="card seg" [class.chiusa]="s.stato === 'chiusa'">
            <div class="testa">
              <span class="pill" [class]="'st-' + s.stato">{{ 'segnalazioni.stato.' + s.stato | translate }}</span>
              <span class="badge-tipo">{{ 'segnalazioni.tipo.' + s.tipo | translate }}</span>
              @if (s.tipo === 'rimborso' && s.importo != null) {
                <span class="badge-importo">€ {{ s.importo | number: '1.2-2' }}</span>
              }
              @if (s.partnerNome) { <span class="chi">{{ 'segnalazioni.onPartner' | translate }}: <strong>{{ s.partnerNome }}</strong></span> }
              @if (s.valetNome) { <span class="chi">{{ 'segnalazioni.onValet' | translate }}: <strong>{{ s.valetNome }}</strong></span> }
              <span class="data">{{ s.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
            </div>
            @if (s.oggetto) { <p class="oggetto">{{ s.oggetto }}</p> }
            @if (s.deliveryId) {
              <a class="apri-consegna" [href]="'/deliveries/' + s.deliveryId" target="_blank" rel="noopener">
                ↗ {{ 'segnalazioni.apriConsegna' | translate }}
              </a>
            }
            <p class="testo">{{ s.testo }}</p>
            @if (s.ricevutaUrl) {
              <a class="ricevuta" [href]="s.ricevutaUrl" target="_blank" rel="noopener">📎 {{ 'segnalazioni.ricevuta' | translate }}</a>
            }
            @if (s.risposta) { <p class="risposta"><strong>{{ 'segnalazioni.answer' | translate }}:</strong> {{ s.risposta }}</p> }
            @if (isUfficio()) {
              <div class="gestione">
                <input class="field" [(ngModel)]="risposte[s.id]" [placeholder]="'segnalazioni.answerPh' | translate" />
                <div class="btns">
                  @if (s.stato !== 'in_lavorazione') { <button class="btn btn-secondary mini" (click)="aggiorna(s, 'in_lavorazione')">{{ 'segnalazioni.take' | translate }}</button> }
                  @if (s.stato !== 'chiusa') { <button class="btn btn-primary mini" (click)="aggiorna(s, 'chiusa')">{{ 'segnalazioni.close' | translate }}</button> }
                  @else { <button class="btn btn-secondary mini" (click)="aggiorna(s, 'aperta')">{{ 'segnalazioni.reopen' | translate }}</button> }
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .form { padding: 18px 20px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld.span-2 { grid-column: 1 / -1; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      .azioni { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
      .cerca { display: block; margin-bottom: 12px; }
      .cerca .field { width: 100%; max-width: 420px; }
      .tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
      .tabs.tipi { margin-top: -6px; }
      .tabs.tipi .tab { font-size: 13px; }
      .tab { border: 0; background: transparent; border-radius: 999px; padding: 6px 14px; cursor: pointer; font: inherit; color: var(--text-secondary); }
      .tab.on { background: var(--ink); color: #fff; }
      .lista { display: flex; flex-direction: column; gap: 10px; }
      .seg { padding: 14px 16px; }
      .seg.chiusa { opacity: 0.72; }
      .testa { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
      .pill { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
      .pill.st-aperta { background: var(--red-soft, rgba(215,0,21,0.09)); color: var(--red); }
      .pill.st-in_lavorazione { background: var(--orange-soft, rgba(201,52,0,0.1)); color: var(--orange, #c93400); }
      .pill.st-chiusa { background: var(--green-soft, rgba(36,138,61,0.11)); color: var(--green, #248a3d); }
      .badge-tipo { background: var(--fill); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
      .badge-importo { background: color-mix(in srgb, var(--gold) 18%, white); color: var(--gold-ink, #7a5f18); border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .data { margin-left: auto; color: var(--text-tertiary); }
      .oggetto { font-weight: 600; margin: 8px 0 2px; }
      .testo { margin: 4px 0; white-space: pre-line; }
      .ricevuta { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 13px;
        font-weight: 550; color: var(--blue, #0a84ff); text-decoration: none; }
      .ricevuta:hover { text-decoration: underline; }
      .apri-consegna { display: inline-block; margin: 2px 0 4px; font-size: 13px; font-weight: 550;
        color: var(--blue, #0a84ff); text-decoration: none; }
      .apri-consegna:hover { text-decoration: underline; }
      .risposta { margin: 6px 0 0; padding: 8px 10px; background: var(--fill); border-radius: 10px; font-size: 13.5px; }
      .gestione { display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
      .gestione .field { flex: 1 1 200px; }
      .btns { display: flex; gap: 6px; }
      .mini { padding: 6px 12px; font-size: 13px; }
    `,
  ],
})
export class SegnalazioniComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  readonly caricando = signal(false);
  readonly salvando = signal(false);
  readonly errore = signal<string | null>(null);
  readonly nuovaAperta = signal(false);
  readonly filtro = signal('');
  readonly filtroTipo = signal('');
  readonly lista = signal<Segn[]>([]);
  /** Ricerca testo (Libro UX&UI §8-bis: ogni elenco ha la ricerca). */
  readonly ricerca = signal('');
  readonly listaFiltrata = computed(() => {
    const q = this.ricerca().toLowerCase().trim();
    if (!q) return this.lista();
    return this.lista().filter((s) =>
      [s.oggetto, s.testo, s.partnerNome, s.valetNome, s.risposta]
        .some((v) => (v ?? '').toLowerCase().includes(q)));
  });
  readonly partners = signal<Rif[]>([]);
  readonly valets = signal<Rif[]>([]);
  risposte: Record<string, string> = {};
  bozza = { partnerId: '', valetId: '', oggetto: '', testo: '' };

  isUfficio(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }

  constructor() {
    this.carica();
    if (this.isUfficio()) {
      this.http.get<any[]>(`${environment.apiUrl}/partners`).subscribe((d) =>
        this.partners.set((d ?? []).map((p) => ({ id: p.id, nome: p.insegna }))));
      this.http.get<any[]>(`${environment.apiUrl}/valets`).subscribe((d) =>
        this.valets.set((d ?? []).filter((v) => v.active !== false && v.placeholder !== true)
          .map((v) => ({ id: v.id, nome: `${v.lastName} ${v.firstName}` }))));
    }
  }

  carica(): void {
    this.caricando.set(true);
    const params: any = {};
    if (this.filtro()) params.stato = this.filtro();
    if (this.filtroTipo()) params.tipo = this.filtroTipo();
    this.http.get<Segn[]>(`${environment.apiUrl}/segnalazioni`, { params }).subscribe({
      next: (d) => { this.lista.set(d ?? []); this.caricando.set(false); },
      error: () => { this.lista.set([]); this.caricando.set(false); },
    });
  }

  apriNuova(): void {
    this.bozza = { partnerId: '', valetId: '', oggetto: '', testo: '' };
    this.errore.set(null);
    this.nuovaAperta.set(true);
  }

  salva(): void {
    if (!this.bozza.testo.trim()) { this.errore.set(this.translate.instant('segnalazioni.textRequired')); return; }
    this.salvando.set(true);
    this.errore.set(null);
    const body: any = { oggetto: this.bozza.oggetto?.trim() || undefined, testo: this.bozza.testo.trim() };
    if (this.isUfficio()) {
      if (this.bozza.partnerId) body.partnerId = this.bozza.partnerId;
      if (this.bozza.valetId) body.valetId = this.bozza.valetId;
    }
    this.http.post(`${environment.apiUrl}/segnalazioni`, body).subscribe({
      next: () => { this.salvando.set(false); this.nuovaAperta.set(false); this.carica(); },
      error: (err) => { this.salvando.set(false); this.errore.set(err?.error?.message ?? this.translate.instant('segnalazioni.error')); },
    });
  }

  aggiorna(s: Segn, stato: string): void {
    const body: any = { stato };
    const r = this.risposte[s.id];
    if (r !== undefined && r.trim()) body.risposta = r.trim();
    this.http.patch(`${environment.apiUrl}/segnalazioni/${s.id}`, body).subscribe({
      next: () => this.carica(),
      error: () => undefined,
    });
  }
}
