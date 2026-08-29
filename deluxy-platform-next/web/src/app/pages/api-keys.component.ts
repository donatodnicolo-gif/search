import { ConfermaComponent } from '../shared/conferma.component';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/** Una chiave come la manda l'API: mai il valore, solo com'è fatta. */
interface Chiave {
  id: string;
  nome: string;
  scrittura: boolean;
  attiva: boolean;
  note?: string | null;
  scadeIl?: string | null;
  creataDa?: string | null;
  ultimoUso?: string | null;
  creataIl: string;
  /** Calcolata dal server: `attiva` con la scadenza passata è spenta di fatto. */
  scaduta: boolean;
  /** Da quanti giorni non la chiama nessuno. `null` = mai usata. */
  giorniDaUltimoUso: number | null;
}

/**
 * CONFIGURAZIONE → CHIAVI DELLE APP (27/08/2026, chiesto dall'utente).
 *
 * Le chiavi con cui le altre app di Deluxy chiamano questa in lettura o in
 * lettura+scrittura. Prima si creavano solo da riga di comando, cioè le creava
 * chi aveva il repo aperto.
 *
 * ⚠️ La chiave in chiaro si vede UNA VOLTA SOLA, subito dopo averla generata.
 * Non esiste una rotta che la rilegga — non per dimenticanza: una chiave
 * rileggibile finisce nei log, nelle cache e nelle schermate. Chi la perde ne
 * rigenera un'altra, sono dieci secondi.
 */
@Component({
  selector: 'app-api-keys',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe, ConfermaComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'apiKeys.title' | translate }}</h1>
        <p class="page-caption">{{ 'apiKeys.caption' | translate }}</p>
      </div>
      <button class="btn btn-primary" (click)="formAperto() ? annulla() : apri()">
        {{ (formAperto() ? 'common.cancel' : 'apiKeys.new') | translate }}
      </button>
    </div>

    @if (errore()) { <div class="error-card">{{ errore() }}</div> }

    <!-- ⚠️ IL MOMENTO IN CUI LA CHIAVE ESISTE. Resta a schermo finché non la si
         chiude apposta: un pannello che sparisce da solo farebbe perdere una
         chiave che non si può rileggere. -->
    @if (appenaCreata(); as k) {
      <section class="card chiave-nuova">
        <h2>{{ 'apiKeys.created.title' | translate: { nome: k.nome } }}</h2>
        <p class="avviso">{{ k.avviso }}</p>
        <div class="valore">
          <code>{{ k.chiave }}</code>
          <button type="button" class="btn btn-secondary" (click)="copia(k.chiave)">
            {{ (copiata() ? 'apiKeys.copied' : 'apiKeys.copy') | translate }}
          </button>
        </div>
        <p class="come">{{ 'apiKeys.created.how' | translate }}</p>
        <pre class="esempio">curl -H "x-api-key: {{ k.chiave }}" \\
  {{ base }}/app/consegne?limit=5</pre>
        <div class="azioni">
          <button type="button" class="btn btn-primary" (click)="appenaCreata.set(null)">
            {{ 'apiKeys.created.done' | translate }}
          </button>
        </div>
      </section>
    }

    @if (formAperto()) {
      <section class="card modulo">
        <div class="grid">
          <label class="fld">
            <span class="req">{{ 'apiKeys.f.nome' | translate }}</span>
            <input class="field" [(ngModel)]="m.nome" [placeholder]="'apiKeys.f.nomePh' | translate" />
            <span class="hint">{{ 'apiKeys.f.nomeHint' | translate }}</span>
          </label>
          <label class="fld">
            <span>{{ 'apiKeys.f.permessi' | translate }}</span>
            <select class="field" [(ngModel)]="m.scrittura">
              <option [ngValue]="false">{{ 'apiKeys.perm.lettura' | translate }}</option>
              <option [ngValue]="true">{{ 'apiKeys.perm.scrittura' | translate }}</option>
            </select>
            <span class="hint">{{ (m.scrittura ? 'apiKeys.perm.scritturaHint' : 'apiKeys.perm.letturaHint') | translate }}</span>
          </label>
          <label class="fld">
            <span>{{ 'apiKeys.f.scadenza' | translate }}</span>
            <input class="field" type="date" [(ngModel)]="m.scadeIl" [min]="domani" />
            <span class="hint">{{ 'apiKeys.f.scadenzaHint' | translate }}</span>
          </label>
          <label class="fld wide">
            <span>{{ 'apiKeys.f.note' | translate }}</span>
            <input class="field" [(ngModel)]="m.note" [placeholder]="'apiKeys.f.notePh' | translate" />
          </label>
        </div>
        <div class="azioni">
          <button class="btn btn-primary" [disabled]="salvando() || !m.nome.trim()" (click)="genera()">
            {{ (salvando() ? 'common.saving' : 'apiKeys.generate') | translate }}
          </button>
        </div>
      </section>
    }

    @if (caricamento()) {
      <div class="card state-card">{{ 'common.loading' | translate }}</div>
    } @else if (!chiavi().length) {
      <div class="card state-card">
        <strong>{{ 'apiKeys.emptyTitle' | translate }}</strong>
        <span class="muted">{{ 'apiKeys.emptyHint' | translate }}</span>
      </div>
    } @else {

    <!-- §8-bis del Libro: ogni elenco ha una ricerca. Filtro client: la
         lista è già tutta qui. -->
    <div class="cerca-riga">
      <input class="field" type="search" [(ngModel)]="cerca" name="cerca"
             [attr.placeholder]="'comune.cercaPh' | translate" [attr.aria-label]="'comune.cercaPh' | translate" />
      @if (cerca.trim()) {
        <span class="conto-righe">{{ 'comune.contoRighe' | translate: { n: chiaviVisibili().length, m: chiavi().length } }}</span>
      }
    </div>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'apiKeys.c.app' | translate }}</th>
              <th>{{ 'apiKeys.c.permessi' | translate }}</th>
              <th>{{ 'apiKeys.c.stato' | translate }}</th>
              <th>{{ 'apiKeys.c.ultimoUso' | translate }}</th>
              <th>{{ 'apiKeys.c.scadenza' | translate }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (k of chiaviVisibili(); track k.id) {
              <tr [class.spenta]="!k.attiva || k.scaduta">
                <td>
                  <strong>{{ k.nome }}</strong>
                  @if (k.note) { <br><span class="muted mini">{{ k.note }}</span> }
                  @if (k.creataDa) { <br><span class="muted mini">{{ 'apiKeys.creataDa' | translate: { chi: k.creataDa } }}</span> }
                </td>
                <td>
                  <span class="tag" [class.tag-scrittura]="k.scrittura">
                    {{ (k.scrittura ? 'apiKeys.perm.lettura2' : 'apiKeys.perm.soloLettura') | translate }}
                  </span>
                </td>
                <td>
                  @if (k.scaduta) {
                    <span class="badge badge-off"><span class="dot"></span>{{ 'apiKeys.stato.scaduta' | translate }}</span>
                  } @else if (k.attiva) {
                    <span class="badge badge-on"><span class="dot"></span>{{ 'apiKeys.stato.attiva' | translate }}</span>
                  } @else {
                    <span class="badge badge-off"><span class="dot"></span>{{ 'apiKeys.stato.spenta' | translate }}</span>
                  }
                </td>
                <td>
                  @if (k.ultimoUso) {
                    {{ k.ultimoUso | date: 'd/M/yy HH:mm' }}
                    <!-- ⚠️ Quanti giorni, non solo quando: una chiave viva che
                         nessuno chiama da mesi è una porta aperta senza motivo,
                         e la data da sola non lo fa notare. -->
                    @if (k.giorniDaUltimoUso !== null && k.giorniDaUltimoUso > 30) {
                      <br><span class="mini avviso-uso">{{ 'apiKeys.ferma' | translate: { n: k.giorniDaUltimoUso } }}</span>
                    }
                  } @else {
                    <span class="muted">{{ 'apiKeys.maiUsata' | translate }}</span>
                  }
                </td>
                <td>
                  {{ k.scadeIl ? (k.scadeIl | date: 'd/M/yy') : ('apiKeys.nonScade' | translate) }}
                </td>
                <td class="nowrap">
                  <button class="link-btn" (click)="rigenera(k)">{{ 'apiKeys.rigenera' | translate }}</button>
                  <button class="link-btn" (click)="accendi(k)">
                    {{ (k.attiva ? 'apiKeys.spegni' : 'apiKeys.accendi') | translate }}
                  </button>
                  <button class="link-btn danger" (click)="elimina(k)">{{ 'common.delete' | translate }}</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="nota">{{ 'apiKeys.nota' | translate }}</p>
    }
    @if (confermaPendente(); as c) {
      <app-conferma [titolo]="c.titolo" [messaggio]="c.messaggio" [verbo]="c.verbo" [tono]="c.tono"
                    [conMotivo]="c.conMotivo ?? false" [motivoLabel]="c.motivoLabel ?? ''"
                    (confermato)="eseguiConferma($event)" (annullato)="confermaPendente.set(null)" />
    }
  `,
  styles: [
    `
      .table-wrap { overflow-x: auto; }
      td { vertical-align: top; }
      .mini { font-size: 11.5px; }
      .muted { color: var(--text-secondary); }
      .nowrap { white-space: nowrap; }
      tr.spenta td { opacity: .55; }
      .modulo { padding: 18px; margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
      .fld { display: flex; flex-direction: column; gap: 4px; }
      .fld.wide { grid-column: 1 / -1; }
      .fld > span { font-size: 12px; color: var(--text-secondary); }
      .hint { font-size: 11.5px; color: var(--text-tertiary); }
      .azioni { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
      .tag { display: inline-flex; border-radius: 980px; padding: 3px 11px; font-size: 12px; font-weight: 550; background: var(--fill); color: var(--text-secondary); }
      .tag-scrittura { background: color-mix(in srgb, var(--gold-strong) 16%, transparent); color: var(--gold-strong); }
      .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 12px; font-size: 12.5px; font-weight: 550; }
      .badge .dot { width: 7px; height: 7px; border-radius: 50%; }
      .badge-on { background: color-mix(in srgb, var(--green) 12%, transparent); color: var(--green); }
      .badge-on .dot { background: var(--green); }
      .badge-off { background: var(--fill); color: var(--text-tertiary); }
      .badge-off .dot { background: var(--text-tertiary); }
      .avviso-uso { color: var(--orange); }
      .link-btn { appearance: none; display: inline-flex; align-items: center; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 4px 11px; margin-right: 6px; font-size: 12px; font-weight: 550; font-family: inherit; color: var(--text); cursor: pointer; transition: background .15s var(--ease); }
      .link-btn:hover { background: var(--fill); }
      .link-btn.danger { color: var(--red); border-color: rgba(215,0,21,.28); }
      .link-btn.danger:hover { background: rgba(215,0,21,.07); }
      /* Il pannello della chiave appena nata: si deve vedere che è un momento
         diverso dagli altri, perché quel valore non torna. */
      .chiave-nuova { padding: 20px 22px; margin-bottom: 16px; border: 1px solid var(--gold-strong); }
      .chiave-nuova h2 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
      .avviso { margin: 0 0 14px; color: var(--gold-strong); font-weight: 550; font-size: 13.5px; }
      .valore { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .valore code { flex: 1 1 320px; background: var(--surface-sunken, #f2f2f4); border: 1px solid var(--hairline); border-radius: var(--radius-m); padding: 10px 14px; font-size: 13px; word-break: break-all; }
      .come { margin: 16px 0 6px; font-size: 13px; color: var(--text-secondary); }
      .esempio { margin: 0; background: var(--ink, #1d1d1f); color: #fff; border-radius: var(--radius-m); padding: 12px 14px; font-size: 12.5px; overflow-x: auto; }
      .nota { margin-top: 16px; font-size: 12.5px; color: var(--text-tertiary); max-width: 760px; }
      .state-card { display: flex; flex-direction: column; gap: 6px; padding: 28px; }
      .error-card { background: rgba(215,0,21,.06); border: 1px solid rgba(215,0,21,.15); color: var(--red); padding: 14px 18px; border-radius: var(--radius-l); margin-bottom: 12px; }
      .cerca-riga { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
      .cerca-riga .field { max-width: 340px; }
      .conto-righe { font-size: 12.5px; color: var(--text-secondary); }
    `,
  ],
})
export class ApiKeysComponent {

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
  private readonly translate = inject(TranslateService);
  readonly base = environment.apiUrl;

  readonly chiavi = signal<Chiave[]>([]);

  /** §8-bis: la ricerca, per nome dell'app o per chi ha creato la chiave. */
  cerca = '';
  chiaviVisibili(): Chiave[] {
    const q = this.cerca.trim().toLowerCase();
    if (!q) return this.chiavi();
    return this.chiavi().filter((k) =>
      k.nome.toLowerCase().includes(q) ||
      (k.note ?? '').toLowerCase().includes(q) ||
      (k.creataDa ?? '').toLowerCase().includes(q));
  }

  readonly caricamento = signal(true);
  readonly errore = signal<string | null>(null);
  readonly formAperto = signal(false);
  readonly salvando = signal(false);
  readonly copiata = signal(false);
  readonly appenaCreata = signal<{ nome: string; chiave: string; avviso: string } | null>(null);

  /** La scadenza si può mettere da domani in poi: oggi sarebbe già scaduta. */
  readonly domani = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  m = { nome: '', scrittura: false, note: '', scadeIl: '' };

  constructor() {
    this.carica();
  }

  private carica(): void {
    this.caricamento.set(true);
    this.http.get<Chiave[]>(`${this.base}/chiavi-app`).subscribe({
      next: (d) => { this.chiavi.set(d ?? []); this.caricamento.set(false); },
      error: (e) => {
        this.caricamento.set(false);
        this.errore.set(e?.error?.message ?? this.translate.instant('common.loadError'));
      },
    });
  }

  apri(): void {
    this.errore.set(null);
    this.m = { nome: '', scrittura: false, note: '', scadeIl: '' };
    this.formAperto.set(true);
  }

  annulla(): void {
    this.formAperto.set(false);
  }

  genera(): void {
    this.errore.set(null);
    this.salvando.set(true);
    const corpo: Record<string, unknown> = {
      nome: this.m.nome.trim().toLowerCase(),
      scrittura: this.m.scrittura,
    };
    if (this.m.note.trim()) corpo['note'] = this.m.note.trim();
    if (this.m.scadeIl) corpo['scadeIl'] = this.m.scadeIl;
    this.http.post<{ nome: string; chiave: string; avviso: string }>(`${this.base}/chiavi-app`, corpo).subscribe({
      next: (r) => {
        this.salvando.set(false);
        this.formAperto.set(false);
        this.copiata.set(false);
        this.appenaCreata.set(r);
        this.carica();
      },
      error: (e) => {
        this.salvando.set(false);
        // Il messaggio del server è già scritto per chi legge (nome già preso,
        // scadenza passata, forma del nome): si mostra quello, non un generico.
        this.errore.set(this.messaggio(e));
      },
    });
  }

  rigenera(k: Chiave): void {
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.rigeneraChiave', { nome: k.nome }),
      messaggio: this.translate.instant('apiKeys.confirmRigenera', { nome: k.nome }),
      verbo: this.translate.instant('conferme.rigenera'),
      tono: 'danger',
      azione: () => this.rigeneraDavvero(k),
    });
  }

  private rigeneraDavvero(k: Chiave): void {
    this.errore.set(null);
    this.http.post<{ nome: string; chiave: string; avviso: string }>(`${this.base}/chiavi-app/${k.id}/rigenera`, {}).subscribe({
      next: (r) => { this.copiata.set(false); this.appenaCreata.set(r); this.carica(); },
      error: (e) => this.errore.set(this.messaggio(e)),
    });
  }

  accendi(k: Chiave): void {
    this.http.patch(`${this.base}/chiavi-app/${k.id}`, { attiva: !k.attiva }).subscribe({
      next: () => this.carica(),
      error: (e) => this.errore.set(this.messaggio(e)),
    });
  }

  elimina(k: Chiave): void {
    this.confermaPendente.set({
      titolo: this.translate.instant('conferme.eliminaChiave', { nome: k.nome }),
      messaggio: this.translate.instant('apiKeys.confirmElimina', { nome: k.nome }),
      verbo: this.translate.instant('conferme.elimina'),
      tono: 'danger',
      azione: () => this.eliminaDavvero(k),
    });
  }

  private eliminaDavvero(k: Chiave): void {
    this.http.delete(`${this.base}/chiavi-app/${k.id}`).subscribe({
      next: () => this.carica(),
      error: (e) => this.errore.set(this.messaggio(e)),
    });
  }

  copia(valore: string): void {
    navigator.clipboard?.writeText(valore).then(
      () => this.copiata.set(true),
      // ⚠️ Senza permesso per gli appunti non si finge riuscito: il valore è
      // comunque a schermo e si seleziona a mano, ma dirlo è meglio che un
      // «copiata» falso su una chiave che non torna.
      () => this.errore.set(this.translate.instant('apiKeys.copyFailed')),
    );
  }

  private messaggio(e: unknown): string {
    const m = (e as { error?: { message?: string | string[] } })?.error?.message;
    if (Array.isArray(m)) return m.join(' · ');
    return m ?? this.translate.instant('common.saveError');
  }
}
