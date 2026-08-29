import { ConfermaComponent } from '../shared/conferma.component';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

interface Richiesta {
  id: string;
  testo: string;
  origine: string;
  riferimento?: string | null;
  contatto?: string | null;
  stato: 'nuova' | 'in_lavorazione' | 'accettata' | 'rifiutata';
  deliveryId?: string | null;
  note?: string | null;
  decisaDa?: string | null;
  decisaIl?: string | null;
  createdAt: string;
  delivery?: { id: string; code: number; status: string; date: string } | null;
}

/**
 * RICHIESTE — le domande di consegna che arrivano dalle altre app, a parole.
 *
 * ⚠️ Una richiesta NON è una consegna: è una domanda. Chi manda (il Customer
 * Service da una chat, Scout da una visita, un fornitore al telefono) scrive
 * quello che sa, senza compilare un modulo di venti campi che non ha sotto
 * mano. Qui una persona legge e decide.
 *
 * Per ADMIN e OPERATION — e il Customer Service **è** un OPERATION
 * (`operationRole = 'customer_service'`), quindi è già dentro.
 */
@Component({
  selector: 'app-richieste',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe, ConfermaComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'richieste.title' | translate }}</h1>
        <p class="page-caption">{{ 'richieste.caption' | translate }}</p>
      </div>
      <button class="btn btn-primary" (click)="formAperto() ? formAperto.set(false) : apri()">
        {{ (formAperto() ? 'common.cancel' : 'richieste.new') | translate }}
      </button>
    </div>

    @if (errore()) { <div class="error-card">{{ errore() }}</div> }
    @if (banner()) { <div class="card ok-card">{{ banner() }}</div> }

    <!-- A mano: quando la richiesta arriva al telefono e non da un'app. -->
    @if (formAperto()) {
      <section class="card modulo">
        <label class="fld">
          <span class="req">{{ 'richieste.f.testo' | translate }}</span>
          <textarea class="field" rows="3" [(ngModel)]="m.testo"
                    [placeholder]="'richieste.f.testoPh' | translate"></textarea>
        </label>
        <div class="grid">
          <label class="fld"><span>{{ 'richieste.f.riferimento' | translate }}</span>
            <input class="field" [(ngModel)]="m.riferimento" [placeholder]="'richieste.f.riferimentoPh' | translate" /></label>
          <label class="fld"><span>{{ 'richieste.f.contatto' | translate }}</span>
            <input class="field" [(ngModel)]="m.contatto" [placeholder]="'richieste.f.contattoPh' | translate" /></label>
        </div>
        <div class="azioni">
          <button class="btn btn-primary" [disabled]="salvando() || m.testo.trim().length < 10" (click)="registra()">
            {{ (salvando() ? 'common.saving' : 'richieste.registra') | translate }}
          </button>
        </div>
      </section>
    }

    <div class="filtri card">
      @for (s of FILTRI; track s) {
        <button type="button" class="quick-tab" [class.active]="filtro() === s" (click)="cambiaFiltro(s)">
          {{ 'richieste.stato.' + s | translate }}
          @if (s === 'nuova' && daLeggere() > 0) { <span class="pallino">{{ daLeggere() }}</span> }
        </button>
      }
    </div>


    <!-- §8-bis del Libro: ogni elenco ha una ricerca. Filtro client: la
         lista è già tutta qui. -->
    <div class="cerca-riga">
      <input class="field" type="search" [(ngModel)]="cerca" name="cerca"
             [attr.placeholder]="'comune.cercaPh' | translate" [attr.aria-label]="'comune.cercaPh' | translate" />
      @if (cerca.trim()) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: richiesteVisibili().length, m: richieste().length } }}</span>
      }
    </div>
    @if (caricamento()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (!richieste().length) {
      <div class="card state-card">
        <strong>{{ 'richieste.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'richieste.emptyHint' | translate }}</span>
      </div>
    } @else {
      <div class="elenco">
        @for (r of richiesteVisibili(); track r.id) {
          <article class="card richiesta" [class.nuova]="r.stato === 'nuova'">
            <header>
              <span class="badge" [class]="'badge ' + r.stato">
                <span class="dot"></span>{{ 'richieste.stato.' + r.stato | translate }}
              </span>
              <span class="origine">{{ r.origine }}</span>
              @if (r.riferimento) { <span class="rif">· {{ r.riferimento }}</span> }
              <span class="quando">{{ r.createdAt | date: 'd/M/yy HH:mm' }}</span>
            </header>

            <!-- ⚠️ Il testo si mostra COM'È ARRIVATO, a capo compresi: è la
                 fonte, e riformattarlo vorrebbe dire interpretarlo prima che
                 lo legga una persona. -->
            <p class="testo">{{ r.testo }}</p>

            @if (r.contatto) {
              <p class="contatto">{{ 'richieste.contatto' | translate }}: <strong>{{ r.contatto }}</strong></p>
            }
            @if (r.note) {
              <p class="nota">{{ 'richieste.nota' | translate }}: {{ r.note }}</p>
            }
            @if (r.delivery; as c) {
              <p class="collegata">
                {{ 'richieste.natacome' | translate }}
                <a [href]="'/deliveries/' + c.id" target="_blank" rel="noopener">#{{ c.code }}</a>
                · {{ 'status.delivery.' + c.status | translate }} · {{ c.date | date: 'd/M/yy' }}
              </p>
            }
            @if (r.decisaDa) {
              <p class="decisa">{{ 'richieste.decisaDa' | translate: { chi: r.decisaDa } }} · {{ r.decisaIl | date: 'd/M/yy HH:mm' }}</p>
            }

            @if (r.stato === 'nuova' || r.stato === 'in_lavorazione') {
              <div class="azioni-riga">
                <!-- Il tasto che fa il lavoro vero: porta al form della consegna
                     col testo già dentro, così l'AI lo può leggere. -->
                <button type="button" class="btn btn-primary mini" (click)="creaConsegna(r)">
                  {{ 'richieste.creaConsegna' | translate }}
                </button>
                @if (r.stato === 'nuova') {
                  <button type="button" class="act" (click)="prendiInCarico(r)">{{ 'richieste.prendiInCarico' | translate }}</button>
                }
                <button type="button" class="act pericolo" (click)="rifiuta(r)">{{ 'richieste.rifiuta' | translate }}</button>
              </div>
            }
          </article>
        }
      </div>
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    [conMotivo]="c.conMotivo ?? false" [motivoLabel]="c.motivoLabel ?? ''"
                    (confermato)="eseguiConferma($event)" (annullato)="confermaPendente.set(null)" />
    }
  `,
  styles: [
    `
      .modulo { padding: 18px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
      .fld { display: flex; flex-direction: column; gap: 4px; }
      .fld > span { font-size: 12px; color: var(--text-secondary); }
      .azioni { display: flex; justify-content: flex-end; }
      .filtri { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 10px; margin-bottom: 14px; }
      .quick-tab { appearance: none; font: inherit; font-size: 13px; font-weight: 550; padding: 6px 14px; border-radius: 980px; border: 1px solid transparent; background: none; color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
      .quick-tab.active { background: var(--surface); border-color: var(--hairline); color: var(--text); box-shadow: var(--shadow-card); }
      .pallino { background: var(--red); color: #fff; border-radius: 980px; font-size: 11px; font-weight: 650; padding: 1px 7px; }
      .elenco { display: flex; flex-direction: column; gap: 12px; }
      .richiesta { padding: 16px 18px; }
      /* Le nuove si vedono a colpo d'occhio: sono quelle che nessuno ha ancora
         letto, ed è l'unica cosa che conta aprendo la pagina. */
      .richiesta.nuova { border-left: 3px solid var(--gold-strong, #b8963e); }
      .richiesta header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
      .origine { font-size: 12.5px; font-weight: 600; }
      .rif { font-size: 12.5px; color: var(--text-secondary); }
      .quando { margin-left: auto; font-size: 12px; color: var(--text-tertiary); }
      /* pre-wrap: il testo resta com'è stato scritto, a capo compresi. */
      .testo { margin: 0 0 10px; white-space: pre-wrap; font-size: 14.5px; line-height: 1.5; }
      .contatto, .nota, .collegata, .decisa { margin: 4px 0 0; font-size: 12.5px; color: var(--text-secondary); }
      .nota { color: var(--orange); }
      .collegata a { color: var(--ink, #1d1d1f); font-weight: 600; }
      .azioni-riga { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .btn.mini { padding: 5px 14px; font-size: 13px; }
      .act { appearance: none; font: inherit; font-size: 12px; font-weight: 550; padding: 5px 12px; border-radius: 980px; border: 1px solid var(--hairline-strong); background: var(--surface); color: var(--text); cursor: pointer; }
      .act:hover { background: var(--fill); }
      .act.pericolo { color: var(--red); border-color: rgba(215,0,21,.28); }
      .act.pericolo:hover { background: rgba(215,0,21,.07); }
      .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .badge .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .badge.nuova { background: color-mix(in srgb, var(--gold-strong) 16%, transparent); color: var(--gold-strong); }
      .badge.in_lavorazione { background: color-mix(in srgb, var(--blue) 12%, transparent); color: var(--blue); }
      .badge.accettata { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green); }
      .badge.rifiutata { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
      .state-card { display: flex; flex-direction: column; gap: 6px; padding: 28px; }
      .muted { color: var(--text-secondary); }
      .ok-card { padding: 12px 16px; margin-bottom: 12px; color: var(--success, #248a3d); }
      .error-card { background: rgba(215,0,21,.06); border: 1px solid rgba(215,0,21,.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .cerca-riga { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .cerca-riga .field { max-width: 340px; }
      .conto-righe { font-size: 12.5px; color: var(--text-secondary); }
    `,
  ],
})
export class RichiesteComponent {

  /**
   * La conferma narrativa in attesa (Libro §7): al posto dei confirm() del
   * browser. L'azione parte solo al click sul verbo.
   */
  readonly confermaPendente = signal<{
    titolo: string; messaggio: string; verbo: string; tono: 'danger' | 'primary';
    conMotivo?: boolean; motivoLabel?: string; azione: (motivo: string) => void;
  } | null>(null);

  eseguiConferma(motivo: string): void {
    const c = this.confermaPendente();
    this.confermaPendente.set(null);
    c?.azione(motivo);
  }
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly api = environment.apiUrl;

  readonly FILTRI = ['nuova', 'in_lavorazione', 'accettata', 'rifiutata', 'tutte'] as const;

  readonly richieste = signal<Richiesta[]>([]);

  /** §8-bis: la ricerca dentro il testo, l'origine e il riferimento. */
  cerca = '';
  richiesteVisibili(): Richiesta[] {
    const q = this.cerca.trim().toLowerCase();
    if (!q) return this.richieste();
    return this.richieste().filter((r) =>
      r.testo.toLowerCase().includes(q) ||
      r.origine.toLowerCase().includes(q) ||
      (r.riferimento ?? '').toLowerCase().includes(q) ||
      (r.contatto ?? '').toLowerCase().includes(q));
  }

  readonly daLeggere = signal(0);
  readonly caricamento = signal(true);
  readonly errore = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly filtro = signal<string>('nuova');
  readonly formAperto = signal(false);
  readonly salvando = signal(false);

  m = { testo: '', riferimento: '', contatto: '' };

  constructor() {
    this.carica();
  }

  cambiaFiltro(s: string): void {
    this.filtro.set(s);
    this.carica();
  }

  private carica(): void {
    this.caricamento.set(true);
    this.http
      .get<{ richieste: Richiesta[]; daLeggere: number }>(`${this.api}/richieste`, {
        params: { stato: this.filtro() },
      })
      .subscribe({
        next: (d) => {
          this.richieste.set(d?.richieste ?? []);
          this.daLeggere.set(d?.daLeggere ?? 0);
          this.caricamento.set(false);
        },
        error: (e) => {
          this.caricamento.set(false);
          this.errore.set(this.messaggio(e));
        },
      });
  }

  apri(): void {
    this.errore.set(null);
    this.banner.set(null);
    this.m = { testo: '', riferimento: '', contatto: '' };
    this.formAperto.set(true);
  }

  registra(): void {
    this.salvando.set(true);
    this.errore.set(null);
    const corpo: Record<string, unknown> = { testo: this.m.testo.trim() };
    if (this.m.riferimento.trim()) corpo['riferimento'] = this.m.riferimento.trim();
    if (this.m.contatto.trim()) corpo['contatto'] = this.m.contatto.trim();
    this.http.post(`${this.api}/richieste`, corpo).subscribe({
      next: () => {
        this.salvando.set(false);
        this.formAperto.set(false);
        this.banner.set(this.translate.instant('richieste.registrata'));
        this.filtro.set('nuova');
        this.carica();
      },
      error: (e) => { this.salvando.set(false); this.errore.set(this.messaggio(e)); },
    });
  }

  /**
   * Porta al form della consegna col TESTO già dentro.
   *
   * ⚠️ Non si crea niente da qui: si apre il modulo. Il testo entra nel
   * pannello «Compila con l'AI», che lo legge e PROPONE i campi — che restano
   * tutti correggibili prima di salvare. Far nascere una consegna da un testo
   * che nessuno ha riletto vorrebbe dire mandare un valet su un indirizzo che
   * nessuno ha controllato.
   */
  creaConsegna(r: Richiesta): void {
    this.router.navigate(['/deliveries/new'], { queryParams: { richiesta: r.id } });
  }

  prendiInCarico(r: Richiesta): void {
    this.decidi(r, { stato: 'in_lavorazione' });
  }

  rifiuta(r: Richiesta): void {
    // ⚠️ Il motivo è obbligatorio, e lo chiede anche il server: chi ha mandato
    // la richiesta legge l'esito, e un «no» muto si trasforma in una seconda
    // richiesta identica. La finestra ha il campo del motivo (il vecchio
    // prompt() del browser era fuori canone: Libro §7).
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.rifiutaRichiesta'),
      messaggio: this.translate.instant('richieste.motivoRifiuto'),
      verbo: this.translate.instant('richieste.rifiuta'),
      tono: 'danger',
      conMotivo: true,
      motivoLabel: this.translate.instant('conferme.motivo'),
      azione: (motivo) => this.decidi(r, { stato: 'rifiutata', note: motivo }),
    });
  }

  private decidi(r: Richiesta, corpo: Record<string, unknown>): void {
    this.errore.set(null);
    this.banner.set(null);
    this.http.patch(`${this.api}/richieste/${r.id}`, corpo).subscribe({
      next: () => this.carica(),
      error: (e) => this.errore.set(this.messaggio(e)),
    });
  }

  private messaggio(e: unknown): string {
    const m = (e as { error?: { message?: string | string[] } })?.error?.message;
    if (Array.isArray(m)) return m.join(' · ');
    return m ?? this.translate.instant('common.loadError');
  }
}
