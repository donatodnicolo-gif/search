import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';

/**
 * ⭐ 11/09/2026 (regola utente: «in partner metti una sezione Capogruppo dove si possono
 * visualizzare e modificare») — I CAPOGRUPPI: la società che fattura per uno o più punti
 * vendita. Qui si vedono con le loro sedi, si correggono i dati fiscali e se ne crea uno nuovo.
 *
 * ⚠️ Cambiando la P.IVA (o CF, SDI, PEC, email) di un capogruppo, il server la riscrive su
 * tutte le sedi che fatturano sotto di lui («paga da sé» spento): è la regola dell'11/09.
 */
interface Sede { id: string; insegna: string; pagaDaSe: boolean; active: boolean }
interface Capogruppo {
  id: string; nome: string; pIva?: string | null; codiceFiscale?: string | null; codiceSdi?: string | null;
  pec?: string | null; email?: string | null; note?: string | null; registroId?: string | null;
  partners?: Sede[];
}
type Bozza = { nome: string; pIva: string; codiceFiscale: string; codiceSdi: string; pec: string; email: string; note: string };
const VUOTA = (): Bozza => ({ nome: '', pIva: '', codiceFiscale: '', codiceSdi: '', pec: '', email: '', note: '' });

@Component({
  selector: 'app-capogruppi-list',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, NgTemplateOutlet],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ 'capogruppi.title' | translate }}</h1>
        <p class="page-caption">{{ 'capogruppi.caption' | translate }}</p>
      </div>
      <div class="head-actions">
        <input class="field" name="q" [attr.placeholder]="'common.search' | translate" [(ngModel)]="cerca" />
        <a routerLink="/partners" class="btn btn-secondary">{{ 'capogruppi.aiPartner' | translate }}</a>
        <button type="button" class="btn btn-primary" (click)="nuovoAperto.set(!nuovoAperto())">+ {{ 'capogruppi.nuovo' | translate }}</button>
      </div>
    </div>

    @if (banner(); as b) { <div class="card state-card ok">{{ b }}</div> }
    @if (errore(); as e) { <div class="error-card">{{ e }}</div> }

    @if (nuovoAperto()) {
      <section class="card blocco">
        <h2>{{ 'capogruppi.nuovo' | translate }}</h2>
        <ng-container *ngTemplateOutlet="campi; context: { $implicit: nuovo, prefisso: 'n' }"></ng-container>
        <div class="azioni">
          <button type="button" class="btn btn-primary" [disabled]="salvando() || !nuovo.nome.trim()" (click)="crea()">{{ (salvando() ? 'common.saving' : 'common.save') | translate }}</button>
          <button type="button" class="btn btn-secondary" (click)="nuovoAperto.set(false); nuovo = vuota()">{{ 'common.cancel' | translate }}</button>
        </div>
      </section>
    }

    @if (loading()) { <div class="card state-card">{{ 'common.loading' | translate }}</div> }
    @else if (!visibili().length) {
      <div class="card state-card"><strong>{{ 'capogruppi.vuoto' | translate }}</strong><span class="muted">{{ 'capogruppi.vuotoHint' | translate }}</span></div>
    } @else {
      <p class="conto-record">{{ (visibili().length === lista().length ? 'comune.record' : 'comune.recordFiltrati') | translate: { n: visibili().length, m: lista().length } }}</p>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ 'capogruppi.col.nome' | translate }}</th>
              <th>{{ 'capogruppi.col.pIva' | translate }}</th>
              <th>{{ 'capogruppi.col.sdi' | translate }}</th>
              <th>{{ 'capogruppi.col.pec' | translate }}</th>
              <th>{{ 'capogruppi.col.sedi' | translate }}</th>
              <th>{{ 'capogruppi.col.registro' | translate }}</th>
              <th>{{ 'deliveries.col.actions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (c of visibili(); track c.id) {
              <tr>
                <td class="strong">{{ c.nome }}</td>
                <td class="mono">{{ c.pIva || '—' }}</td>
                <td class="mono">{{ c.codiceSdi || '—' }}</td>
                <td class="muted">{{ c.pec || '—' }}</td>
                <td>
                  @for (s of (c.partners || []); track s.id) {
                    <a class="pill pill-neutral sede" [class.spenta]="!s.active" [routerLink]="['/partners', s.id]" [title]="(s.pagaDaSe ? 'capogruppi.pagaDaSe' : 'capogruppi.fatturaLui') | translate">{{ s.insegna }}{{ s.pagaDaSe ? '' : ' ↑' }}</a>
                  } @empty { <span class="muted">—</span> }
                </td>
                <td>@if (c.registroId) { <span class="pill pill-ok">{{ 'capogruppi.collegato' | translate }}</span> } @else { <span class="muted">—</span> }</td>
                <td class="actions-cell">
                  <button type="button" class="act" (click)="apri(c)">{{ (inModifica() === c.id ? 'common.cancel' : 'common.edit') | translate }}</button>
                </td>
              </tr>
              @if (inModifica() === c.id) {
                <tr class="riga-modifica">
                  <td colspan="7">
                    <ng-container *ngTemplateOutlet="campi; context: { $implicit: bozza, prefisso: 'm' }"></ng-container>
                    <p class="hint">{{ 'capogruppi.avvisoSedi' | translate }}</p>
                    <div class="azioni">
                      <button type="button" class="btn btn-primary" [disabled]="salvando() || !bozza.nome.trim()" (click)="salva(c)">{{ (salvando() ? 'common.saving' : 'common.save') | translate }}</button>
                      <button type="button" class="btn btn-secondary" (click)="inModifica.set(null)">{{ 'common.cancel' | translate }}</button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }

    <ng-template #campi let-b let-prefisso="prefisso">
      <div class="grid-3">
        <label class="fld"><span class="req">{{ 'capogruppi.campo.nome' | translate }}</span><input class="field" [name]="prefisso + 'nome'" [(ngModel)]="b.nome" /></label>
        <label class="fld"><span>{{ 'capogruppi.campo.pIva' | translate }}</span><input class="field" [name]="prefisso + 'pIva'" [(ngModel)]="b.pIva" placeholder="IT01234567890" /></label>
        <label class="fld"><span>{{ 'capogruppi.campo.codiceFiscale' | translate }}</span><input class="field" [name]="prefisso + 'cf'" [(ngModel)]="b.codiceFiscale" /></label>
        <label class="fld"><span>{{ 'capogruppi.campo.codiceSdi' | translate }}</span><input class="field" [name]="prefisso + 'sdi'" [(ngModel)]="b.codiceSdi" /></label>
        <label class="fld"><span>{{ 'capogruppi.campo.pec' | translate }}</span><input class="field" type="email" [name]="prefisso + 'pec'" [(ngModel)]="b.pec" /></label>
        <label class="fld"><span>{{ 'capogruppi.campo.email' | translate }}</span><input class="field" type="email" [name]="prefisso + 'email'" [(ngModel)]="b.email" /></label>
        <label class="fld span-3"><span>{{ 'capogruppi.campo.note' | translate }}</span><textarea class="field" rows="2" [name]="prefisso + 'note'" [(ngModel)]="b.note"></textarea></label>
      </div>
    </ng-template>
  `,
  styles: [`
    /* Stili di pagina: le altre liste li dichiarano in locale (non sono globali), qui uguali. */
    .page-header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 32px; font-weight: 600; letter-spacing: -0.025em; }
    .page-caption { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; max-width: 70ch; }
    .head-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .head-actions .btn { text-decoration: none; }
    .head-actions .field { min-width: 200px; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hairline); white-space: nowrap; vertical-align: top; }
    th { font-weight: 500; color: var(--text-tertiary); font-size: 12px; }
    tbody tr { transition: background 0.14s var(--ease); }
    tbody tr:hover { background: rgba(120,120,128,0.05); }
    tr:last-child td { border-bottom: none; }
    td.muted { white-space: normal; max-width: 260px; }
    .strong { font-weight: 550; }
    .muted { color: var(--text-tertiary); }
    .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 980px; padding: 3px 10px; font-size: 12px; font-weight: 550; margin-right: 4px; }
    .pill-ok { background: rgba(36,138,61,.12); color: #1a7f37; }
    .pill-neutral { background: var(--fill); color: var(--text-secondary); }
    .actions-cell { white-space: nowrap; }
    .act { display: inline-flex; align-items: center; border: 1px solid var(--hairline-strong); background: var(--surface); border-radius: 980px; padding: 4px 11px; font-size: 12px; font-weight: 550; color: var(--text); text-decoration: none; cursor: pointer; font-family: inherit; }
    .act:hover { background: var(--fill); }
    .state-card { padding: 32px; display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary); }
    .state-card.ok { color: var(--green, #1a7f37); padding: 14px 18px; margin-bottom: 12px; }
    .error-card { background: rgba(215,0,21,0.06); border: 1px solid rgba(215,0,21,0.15); border-radius: var(--radius-l); color: var(--red); padding: 16px 18px; margin-bottom: 12px; }
    td .sede { white-space: nowrap; }
    td:nth-child(5) { white-space: normal; max-width: 360px; }
    .field { width: 100%; }
    .blocco { padding: 16px 18px; margin-bottom: 14px; }
    .blocco h2 { margin: 0 0 10px; font-size: 15px; font-weight: 600; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; }
    .grid-3 .span-3 { grid-column: 1 / -1; }
    .fld { display: flex; flex-direction: column; gap: 4px; }
    .fld > span { font-size: 13px; font-weight: 550; color: var(--text-secondary); }
    .fld > span.req::after { content: ' *'; color: var(--red); }
    .azioni { display: flex; gap: 8px; margin-top: 12px; }
    .hint { margin: 10px 0 0; font-size: 12.5px; color: var(--text-tertiary); }
    .table-wrap { overflow-x: auto; }
    .riga-modifica > td { background: var(--bg-secondary, #f6f6f7); padding: 12px 14px 14px; }
    .sede { margin: 0 4px 4px 0; text-decoration: none; }
    .sede.spenta { opacity: .55; }
    .mono { font-variant-numeric: tabular-nums; }
    @media (max-width: 800px) { .grid-3 { grid-template-columns: 1fr; } }
  `],
})
export class CapogruppiListComponent {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  readonly lista = signal<Capogruppo[]>([]);
  readonly loading = signal(true);
  readonly errore = signal<string | null>(null);
  readonly banner = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly inModifica = signal<string | null>(null);
  readonly nuovoAperto = signal(false);
  cerca = '';
  nuovo: Bozza = VUOTA();
  bozza: Bozza = VUOTA();
  vuota = VUOTA;

  constructor() { this.carica(); }

  visibili(): Capogruppo[] {
    const q = this.cerca.trim().toLowerCase();
    if (!q) return this.lista();
    return this.lista().filter((c) => [c.nome, c.pIva, c.codiceSdi, c.pec, ...(c.partners ?? []).map((s) => s.insegna)]
      .some((x) => (x ?? '').toLowerCase().includes(q)));
  }

  private carica(): void {
    this.loading.set(true);
    this.http.get<Capogruppo[]>(`${environment.apiUrl}/capogruppi`).subscribe({
      next: (d) => { this.lista.set(d ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.errore.set(e?.error?.message ?? this.translate.instant('common.loadError')); },
    });
  }

  apri(c: Capogruppo): void {
    if (this.inModifica() === c.id) { this.inModifica.set(null); return; }
    this.bozza = { nome: c.nome ?? '', pIva: c.pIva ?? '', codiceFiscale: c.codiceFiscale ?? '', codiceSdi: c.codiceSdi ?? '', pec: c.pec ?? '', email: c.email ?? '', note: c.note ?? '' };
    this.inModifica.set(c.id);
  }

  private corpo(b: Bozza) {
    return { nome: b.nome.trim(), pIva: b.pIva.trim() || null, codiceFiscale: b.codiceFiscale.trim() || null, codiceSdi: b.codiceSdi.trim() || null, pec: b.pec.trim() || null, email: b.email.trim() || null, note: b.note.trim() || null };
  }

  crea(): void {
    this.salvando.set(true); this.errore.set(null); this.banner.set(null);
    this.http.post<Capogruppo>(`${environment.apiUrl}/capogruppi`, this.corpo(this.nuovo)).subscribe({
      next: () => { this.salvando.set(false); this.nuovoAperto.set(false); this.nuovo = VUOTA(); this.banner.set(this.translate.instant('capogruppi.creato')); this.carica(); },
      error: (e) => { this.salvando.set(false); this.errore.set(e?.error?.message ?? 'Errore'); },
    });
  }

  salva(c: Capogruppo): void {
    this.salvando.set(true); this.errore.set(null); this.banner.set(null);
    this.http.patch<Capogruppo>(`${environment.apiUrl}/capogruppi/${c.id}`, this.corpo(this.bozza)).subscribe({
      next: () => { this.salvando.set(false); this.inModifica.set(null); this.banner.set(this.translate.instant('capogruppi.salvato')); this.carica(); },
      error: (e) => { this.salvando.set(false); this.errore.set(e?.error?.message ?? 'Errore'); },
    });
  }
}
