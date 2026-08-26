import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';

interface Sottolinea {
  id: string;
  nome: string;
  icona: string | null;
  pitch: string | null;
}
interface Linea extends Sottolinea {
  sottolinee: Sottolinea[];
}
interface QuoteRequest {
  id: string;
  partnerId: string;
  description: string;
  people?: number | null;
  city?: string | null;
  requestedFor?: string | null;
  photo?: string | null;
  status: string;
  reply?: string | null;
  createdAt: string;
  partner?: { id: string; insegna: string; phone?: string | null };
}

const STATUS_META: Record<string, { key: string; color: string }> = {
  aperta: { key: 'quotes.status.aperta', color: '#B8963E' },
  in_lavorazione: { key: 'quotes.status.in_lavorazione', color: '#0071e3' },
  risposta: { key: 'quotes.status.risposta', color: '#248A3D' },
};

/**
 * Preventivi e richieste dei PARTNER.
 *
 * Il partner vede la VETRINA delle linee commerciali Deluxy (master: Scout),
 * chiede un preventivo con un form dedicato (descrizione, foto, persone,
 * città, data — come le richieste che arrivano su WhatsApp) e può scriverci
 * direttamente su WhatsApp. L'ufficio (admin/operation) vede le richieste,
 * cambia stato e risponde.
 */
@Component({
  selector: 'app-quotes',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'quotes.title' | translate }}</h1>
        <p class="page-caption">
          {{ (isPartner() ? 'quotes.captionPartner' : 'quotes.captionAdmin') | translate }}
        </p>
      </div>
      <div class="head-actions">
        @if (isPartner() && whatsapp()) {
          <a class="btn btn-wa" [href]="whatsappHref()" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.1 8.1 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3 0-.2 0-.3-.1-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c.6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3Z"/></svg>
            {{ 'quotes.whatsapp' | translate }}
          </a>
        }
        @if (isPartner()) {
          <button class="btn btn-primary" (click)="apriForm()">
            {{ 'quotes.new' | translate }}
          </button>
        }
      </div>
    </div>

    @if (banner(); as b) { <div class="ok-card card">{{ b }}</div> }
    @if (error()) { <div class="error-card card">{{ error() }}</div> }

    <!-- ============ VETRINA (partner): le linee commerciali di Scout ============ -->
    @if (isPartner()) {
      @if (linee().length) {
        <h2 class="sez">{{ 'quotes.lineeTitle' | translate }}</h2>
        <p class="sez-sub">{{ 'quotes.lineeSub' | translate }}</p>
        <div class="linee">
          @for (l of linee(); track l.id) {
            <div class="card linea">
              <div class="linea-head">
                @if (l.icona) { <span class="linea-icona">{{ l.icona }}</span> }
                <span class="linea-nome">{{ l.nome }}</span>
              </div>
              @if (l.pitch) { <p class="linea-pitch">{{ l.pitch }}</p> }
              @if (l.sottolinee.length) {
                <div class="chips">
                  @for (s of l.sottolinee; track s.id) {
                    <span class="chip" [title]="s.pitch ?? ''">{{ s.icona }} {{ s.nome }}</span>
                  }
                </div>
              }
              <div class="linea-azioni">
                <button class="btn btn-secondary" (click)="richiediLinea(l)">
                  {{ 'quotes.askQuote' | translate }}
                </button>
              </div>
            </div>
          }
        </div>
      } @else if (lineeErrore()) {
        <!-- La vetrina manca e la pagina lo DICE: un catalogo vuoto e muto
             sembrerebbe «nessun servizio». -->
        <div class="card state-card">{{ lineeErrore() }}</div>
      }
    }

    <!-- ============ FORM (partner) ============ -->
    @if (isPartner() && showForm()) {
      <section class="card gen" id="form-preventivo">
        <h2 class="gen-title">{{ 'quotes.form.title' | translate }}</h2>
        <div class="grid">
          <label class="fld"><span>{{ 'quotes.form.linea' | translate }}</span>
            <select class="field" [(ngModel)]="draft.linea">
              <option value="">{{ 'quotes.form.lineaNone' | translate }}</option>
              @for (l of linee(); track l.id) { <option [value]="l.nome">{{ l.nome }}</option> }
            </select></label>
          <label class="fld"><span>{{ 'quotes.form.people' | translate }}</span>
            <input class="field" type="number" min="1" [(ngModel)]="draft.people" placeholder="30" /></label>
          <label class="fld"><span>{{ 'quotes.form.city' | translate }}</span>
            <input class="field" [(ngModel)]="draft.city" placeholder="Cernobbio" /></label>
          <label class="fld"><span>{{ 'quotes.form.date' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="draft.requestedFor" /></label>
        </div>
        <label class="fld mt"><span>{{ 'quotes.form.description' | translate }} *</span>
          <textarea class="field" rows="3" [(ngModel)]="draft.description"
            [attr.placeholder]="'quotes.form.descPlaceholder' | translate"></textarea></label>
        <div class="foto-riga mt">
          <label class="btn btn-secondary foto-btn">
            {{ (draft.photo ? 'quotes.form.photoChange' : 'quotes.form.photo') | translate }}
            <input type="file" accept="image/*" (change)="onFoto($event)" hidden />
          </label>
          @if (draft.photo) {
            <img class="foto-mini" [src]="draft.photo" alt="" />
            <button class="link-btn danger" (click)="draft.photo = ''">{{ 'quotes.form.photoRemove' | translate }}</button>
          }
        </div>
        @if (newError()) { <div class="error-card">{{ newError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="saving()" (click)="create()">
            {{ saving() ? ('common.saving' | translate) : ('quotes.form.submit' | translate) }}
          </button>
        </div>
      </section>
    }

    <!-- ============ ELENCO ============ -->
    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else if (isPartner()) {
      @if (requests().length) {
        <h2 class="sez">{{ 'quotes.mineTitle' | translate }}</h2>
        <div class="richieste">
          @for (r of requests(); track r.id) {
            <div class="card richiesta">
              <div class="r-top">
                <span class="badge" [style.--c]="statusColor(r.status)"><span class="dot"></span>{{ statusKey(r.status) | translate }}</span>
                <span class="muted">{{ r.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>
              </div>
              <div class="r-body">
                @if (r.photo) { <img class="foto-mini" [src]="r.photo" alt="" (click)="fotoAperta.set(r.photo!)" /> }
                <div class="r-testo">
                  <div class="r-desc">{{ r.description }}</div>
                  <div class="r-meta muted">
                    @if (r.people) { <span>{{ 'quotes.form.people' | translate }}: {{ r.people }}</span> }
                    @if (r.city) { <span>{{ r.city }}</span> }
                    @if (r.requestedFor) { <span>{{ r.requestedFor | date: 'dd/MM/yyyy' }}</span> }
                  </div>
                  @if (r.reply) {
                    <div class="r-reply"><strong>{{ 'quotes.replyLabel' | translate }}:</strong> {{ r.reply }}</div>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="card state-card">{{ 'quotes.emptyMine' | translate }}</div>
      }
    } @else {
      <!-- Ufficio: tutte le richieste (su mobile la tabella diventa schede) -->
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'quotes.col.date' | translate }}</th>
              <th>{{ 'quotes.col.partner' | translate }}</th>
              <th>{{ 'quotes.col.request' | translate }}</th>
              <th>{{ 'quotes.col.city' | translate }}</th>
              <th>{{ 'quotes.col.forDate' | translate }}</th>
              <th>{{ 'quotes.col.photo' | translate }}</th>
              <th>{{ 'quotes.col.status' | translate }}</th>
              <th>{{ 'quotes.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (r of requests(); track r.id) {
              <tr>
                <td>{{ r.createdAt | date: 'dd/MM/yy HH:mm' }}</td>
                <td class="strong">{{ r.partner?.insegna }}</td>
                <td class="desc">{{ r.description }}@if (r.people) { <span class="muted"> · {{ r.people }} p.</span> }</td>
                <td>{{ r.city || '—' }}</td>
                <td>{{ r.requestedFor ? (r.requestedFor | date: 'dd/MM/yy') : '—' }}</td>
                <td>
                  @if (r.photo) { <img class="foto-cell" [src]="r.photo" alt="" (click)="fotoAperta.set(r.photo!)" /> }
                  @else { <span class="muted">—</span> }
                </td>
                <td><span class="badge" [style.--c]="statusColor(r.status)"><span class="dot"></span>{{ statusKey(r.status) | translate }}</span></td>
                <td class="row-actions">
                  <button class="link-btn" (click)="apriRisposta(r)">{{ 'quotes.action.reply' | translate }}</button>
                  @if (r.partner?.phone) {
                    <a class="link-btn" [href]="waPartner(r)" target="_blank" rel="noopener">WhatsApp</a>
                  }
                </td>
              </tr>
            }
            @if (!requests().length) { <tr><td colspan="8" class="muted empty">{{ 'quotes.empty' | translate }}</td></tr> }
          </tbody>
        </table>
      </div>
    }

    <!-- Foto a tutto schermo -->
    @if (fotoAperta(); as f) {
      <div class="overlay" (click)="fotoAperta.set(null)"></div>
      <div class="modal card foto-modal" (click)="fotoAperta.set(null)">
        <img [src]="f" alt="" />
      </div>
    }

    <!-- Risposta dell'ufficio -->
    @if (rispostaPer(); as r) {
      <div class="overlay" (click)="rispostaPer.set(null)"></div>
      <div class="modal card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" (click)="rispostaPer.set(null)">×</button>
        <h2>{{ r.partner?.insegna }}</h2>
        <p class="modal-sub">{{ r.description }}</p>
        <div class="r-meta muted" style="margin-bottom: 12px;">
          @if (r.people) { <span>{{ r.people }} persone</span> }
          @if (r.city) { <span>{{ r.city }}</span> }
          @if (r.requestedFor) { <span>{{ r.requestedFor | date: 'dd/MM/yyyy' }}</span> }
        </div>
        @if (r.photo) { <img class="foto-mini" [src]="r.photo" alt="" (click)="fotoAperta.set(r.photo!)" /> }
        <label class="fld mt"><span>{{ 'quotes.col.status' | translate }}</span>
          <select class="field" [(ngModel)]="rispostaDraft.status">
            <option value="aperta">{{ 'quotes.status.aperta' | translate }}</option>
            <option value="in_lavorazione">{{ 'quotes.status.in_lavorazione' | translate }}</option>
            <option value="risposta">{{ 'quotes.status.risposta' | translate }}</option>
          </select></label>
        <label class="fld mt"><span>{{ 'quotes.replyLabel' | translate }}</span>
          <textarea class="field" rows="4" [(ngModel)]="rispostaDraft.reply"
            [attr.placeholder]="'quotes.replyPlaceholder' | translate"></textarea></label>
        @if (replyError()) { <div class="error-card">{{ replyError() }}</div> }
        <div class="actions">
          <button class="btn btn-primary" [disabled]="saving()" (click)="salvaRisposta()">
            {{ saving() ? ('common.saving' | translate) : ('common.save' | translate) }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 22px; }
      h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
      .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 640px; }
      .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .btn-wa { background: #25d366; color: #fff; display: inline-flex; align-items: center; gap: 8px; }
      .btn-wa:hover { background: #1fb857; }
      .btn-wa svg { width: 18px; height: 18px; }
      .sez { font-size: 20px; margin: 18px 0 2px; }
      .sez-sub { margin: 0 0 12px; color: var(--text-secondary); font-size: 13.5px; }
      .linee { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin-bottom: 22px; }
      .linea { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
      .linea-head { display: flex; align-items: center; gap: 8px; }
      .linea-icona { font-size: 22px; }
      .linea-nome { font-weight: 600; font-size: 15px; }
      .linea-pitch { margin: 0; color: var(--text-secondary); font-size: 13px; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip { background: var(--fill); border-radius: 980px; padding: 3px 10px; font-size: 12px; }
      .linea-azioni { margin-top: auto; padding-top: 6px; }
      .gen { padding: 20px 22px; margin-bottom: 18px; }
      .gen-title { margin: 0 0 14px; font-size: 18px; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 16px; }
      .fld { display: flex; flex-direction: column; gap: 6px; }
      .fld.mt, .mt { margin-top: 12px; }
      .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
      textarea.field { resize: vertical; }
      .foto-riga { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .foto-btn { cursor: pointer; }
      .foto-mini { width: 76px; height: 76px; object-fit: cover; border-radius: 10px; border: 1px solid var(--hairline); cursor: pointer; }
      .foto-cell { width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid var(--hairline); cursor: pointer; display: block; }
      .actions { display: flex; justify-content: flex-end; margin-top: 14px; }
      .richieste { display: flex; flex-direction: column; gap: 10px; }
      .richiesta { padding: 14px 16px; }
      .r-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
      .r-body { display: flex; gap: 12px; align-items: flex-start; }
      .r-desc { font-size: 14px; }
      .r-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12.5px; margin-top: 4px; }
      .r-reply { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: rgba(36, 138, 61, 0.08); font-size: 13.5px; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--hairline); white-space: nowrap; }
      th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
      tr:last-child td { border-bottom: none; }
      .strong { font-weight: 600; }
      .muted { color: var(--text-tertiary); }
      .desc { white-space: normal; max-width: 340px; }
      .empty { text-align: center; padding: 28px; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 980px; font-size: 12px; font-weight: 550; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
      .row-actions { display: flex; gap: 12px; }
      .link-btn { background: none; border: none; padding: 0; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .link-btn.danger { color: var(--red); }
      .state-card { padding: 28px; color: var(--text-secondary); }
      .error-card { background: rgba(215, 0, 21, 0.06); border: 1px solid rgba(215, 0, 21, 0.15); color: var(--red); padding: 12px 16px; border-radius: var(--radius-l); margin: 12px 0; }
      .ok-card { background: rgba(36, 138, 61, 0.08); border: 1px solid rgba(36, 138, 61, 0.2); color: var(--green); padding: 12px 16px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); z-index: 90; }
      .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 100; width: min(560px, calc(100vw - 32px)); max-height: 85vh; overflow-y: auto; padding: 22px 24px; }
      .modal h2 { margin: 0 0 4px; font-size: 19px; }
      .modal-sub { margin: 0 0 10px; color: var(--text-secondary); font-size: 13.5px; }
      .modal-close { position: absolute; top: 10px; right: 14px; border: none; background: none; font-size: 22px; color: var(--text-tertiary); cursor: pointer; }
      .foto-modal { padding: 8px; width: auto; max-width: min(92vw, 720px); cursor: zoom-out; }
      .foto-modal img { display: block; max-width: 100%; max-height: 78vh; border-radius: 10px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 480px) { .grid { grid-template-columns: 1fr; } }
    `,
  ],
})
export class QuotesComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  readonly requests = signal<QuoteRequest[]>([]);
  readonly linee = signal<Linea[]>([]);
  readonly lineeErrore = signal<string | null>(null);
  readonly whatsapp = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly saving = signal(false);
  readonly newError = signal<string | null>(null);
  readonly replyError = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly fotoAperta = signal<string | null>(null);
  readonly rispostaPer = signal<QuoteRequest | null>(null);

  draft = { linea: '', description: '', people: null as number | null, city: '', requestedFor: '', photo: '' };
  rispostaDraft = { status: 'aperta', reply: '' };

  isPartner(): boolean {
    return this.auth.user()?.role === 'PARTNER';
  }

  constructor() {
    this.load();
    // La vetrina serve al partner; whatsapp anche all'ufficio (link rapido).
    this.http.get<{ googleMapsBrowserKey: string | null; whatsappNumero: string | null }>(
      `${environment.apiUrl}/settings/public`,
    ).subscribe((s) => this.whatsapp.set(s.whatsappNumero || null));
    if (this.isPartner()) {
      this.http.get<{ linee: Linea[]; configurato: boolean; errore?: string }>(
        `${environment.apiUrl}/quotes/linee`,
      ).subscribe({
        next: (d) => {
          this.linee.set(d.linee);
          if (!d.linee.length) this.lineeErrore.set(d.errore ?? null);
        },
        error: () => this.lineeErrore.set(this.translate.instant('common.loadError')),
      });
    }
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<QuoteRequest[]>(`${environment.apiUrl}/quotes`).subscribe({
      next: (d) => { this.requests.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.translate.instant('common.loadError')); },
    });
  }

  statusKey(s: string): string { return STATUS_META[s]?.key ?? s; }
  statusColor(s: string): string { return STATUS_META[s]?.color ?? '#8A8A8E'; }

  whatsappHref(): string {
    const u = this.auth.user();
    const testo = this.translate.instant('quotes.waGreeting', {
      nome: `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim(),
    });
    return `https://wa.me/${this.whatsapp()}?text=${encodeURIComponent(testo)}`;
  }

  /** WhatsApp verso il PARTNER della richiesta (numeri italiani senza prefisso: si antepone 39). */
  waPartner(r: QuoteRequest): string {
    const raw = (r.partner?.phone ?? '').replace(/[^\d+]/g, '');
    const num = raw.startsWith('+') ? raw.slice(1) : raw.startsWith('00') ? raw.slice(2) : raw.length === 10 ? `39${raw}` : raw;
    return `https://wa.me/${num}`;
  }

  apriForm(): void {
    this.showForm.set(true);
    setTimeout(() => document.getElementById('form-preventivo')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  richiediLinea(l: Linea): void {
    this.draft.linea = l.nome;
    this.apriForm();
  }

  /** La foto si comprime NEL BROWSER (max 1280 px, JPEG): in banca va un data URL piccolo. */
  onFoto(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1280;
      const scala = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scala);
      canvas.height = Math.round(img.height * scala);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      this.draft.photo = canvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.newError.set(this.translate.instant('quotes.form.photoError'));
    };
    img.src = url;
  }

  create(): void {
    this.newError.set(null);
    const desc = this.draft.description.trim();
    if (!desc) {
      this.newError.set(this.translate.instant('quotes.form.required'));
      return;
    }
    this.saving.set(true);
    const body: Record<string, unknown> = {
      description: this.draft.linea ? `[${this.draft.linea}] ${desc}` : desc,
    };
    if (this.draft.people) body['people'] = Number(this.draft.people);
    if (this.draft.city.trim()) body['city'] = this.draft.city.trim();
    if (this.draft.requestedFor) body['requestedFor'] = this.draft.requestedFor;
    if (this.draft.photo) body['photo'] = this.draft.photo;
    this.http.post(`${environment.apiUrl}/quotes`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.draft = { linea: '', description: '', people: null, city: '', requestedFor: '', photo: '' };
        this.banner.set(this.translate.instant('quotes.form.done'));
        this.load();
      },
      error: (err) => { this.saving.set(false); this.newError.set(err?.error?.message ?? 'Errore'); },
    });
  }

  apriRisposta(r: QuoteRequest): void {
    this.replyError.set(null);
    this.rispostaDraft = { status: r.status, reply: r.reply ?? '' };
    this.rispostaPer.set(r);
  }

  salvaRisposta(): void {
    const r = this.rispostaPer();
    if (!r) return;
    this.saving.set(true);
    this.http.patch(`${environment.apiUrl}/quotes/${r.id}`, {
      status: this.rispostaDraft.status,
      reply: this.rispostaDraft.reply,
    }).subscribe({
      next: () => { this.saving.set(false); this.rispostaPer.set(null); this.load(); },
      error: (err) => { this.saving.set(false); this.replyError.set(err?.error?.message ?? 'Errore'); },
    });
  }
}
