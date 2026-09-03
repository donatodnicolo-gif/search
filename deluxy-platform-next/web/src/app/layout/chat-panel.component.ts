import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { NovitaService } from '../core/novita.service';

type Messaggio = { id: string; dalUfficio: boolean; autore?: string | null; testo: string; createdAt: string };
type Filo = { id: string; controparte: string; tipo: string; lastMessageAt: string; ultimo: string; nonLetti: number };

/**
 * CHAT LATERALE (03/09/2026, regola utente): come nel Customer Service — un
 * bottone fluttuante col badge apre il pannello a destra. Valet e partner
 * parlano con l'ufficio; admin/operation vedono i fili e rispondono.
 * «Tempo reale» = polling: 7″ a pannello aperto, 30″ per il badge (NovitaService).
 */
@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslatePipe],
  template: `
    <button type="button" class="chat-fab" (click)="apri()" [title]="'chat.titolo' | translate">
      💬
      @if (nonLetti() > 0) { <span class="fab-badge">{{ nonLetti() }}</span> }
    </button>

    @if (aperto()) {
      <div class="chat-velo" (click)="chiudi()"></div>
      <aside class="chat-drawer">
        <header class="chat-head">
          @if (eUfficio() && filoAperto()) {
            <button type="button" class="indietro" (click)="tornaAiFili()">‹</button>
          }
          <strong>{{ intestazione() }}</strong>
          <button type="button" class="chiudi" (click)="chiudi()">✕</button>
        </header>

        <!-- UFFICIO: l'elenco dei fili -->
        @if (eUfficio() && !filoAperto()) {
          <div class="fili">
            @if (!fili().length) { <p class="vuoto">{{ 'chat.nessunFilo' | translate }}</p> }
            @for (f of fili(); track f.id) {
              <button type="button" class="filo-riga" (click)="apriFilo(f)">
                <span class="chi">{{ f.controparte }} <span class="tipo">{{ f.tipo }}</span></span>
                <span class="anteprima">{{ f.ultimo || '…' }}</span>
                @if (f.nonLetti) { <span class="pallino">{{ f.nonLetti }}</span> }
              </button>
            }
          </div>
        } @else {
          <!-- LA CONVERSAZIONE -->
          <div class="messaggi" #scrollBox>
            @if (!messaggi().length) { <p class="vuoto">{{ 'chat.vuota' | translate }}</p> }
            @for (m of messaggi(); track m.id) {
              <div class="msg" [class.mio]="eMio(m)">
                @if (m.autore && !eMio(m)) { <span class="autore">{{ m.autore }}</span> }
                <span class="testo">{{ m.testo }}</span>
                <span class="quando">{{ m.createdAt | date: 'dd/MM HH:mm' }}</span>
              </div>
            }
          </div>
          <form class="composer" (ngSubmit)="invia()">
            <input class="field" name="bozza" [(ngModel)]="bozza" [placeholder]="'chat.scrivi' | translate"
                   autocomplete="off" maxlength="2000" />
            <button type="submit" class="btn btn-primary" [disabled]="inviando() || !bozza.trim()">
              {{ 'chat.invia' | translate }}
            </button>
          </form>
        }
      </aside>
    }
  `,
  styles: [
    `
      .chat-fab { position: fixed; right: 22px; bottom: 22px; z-index: 900; width: 52px; height: 52px;
        border-radius: 50%; border: none; background: var(--ink, #1d1d1f); color: #fff; font-size: 22px;
        cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.22); }
      .fab-badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px;
        border-radius: 999px; background: #ffcc00; color: #1d1d1f; font-size: 11.5px; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center; }
      .chat-velo { position: fixed; inset: 0; z-index: 940; background: rgba(0,0,0,0.18); }
      .chat-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 950; width: min(400px, 96vw);
        background: var(--surface, #fff); border-left: 1px solid var(--hairline); display: flex;
        flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,0.12); }
      .chat-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--hairline); }
      .chat-head strong { flex: 1; font-size: 15px; }
      .chiudi, .indietro { border: none; background: none; font-size: 16px; cursor: pointer; color: var(--text-secondary); }
      .indietro { font-size: 22px; line-height: 1; }
      .fili { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
      .filo-riga { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; text-align: left; border: none;
        background: none; padding: 10px 12px; border-radius: 10px; cursor: pointer; font: inherit; }
      .filo-riga:hover { background: var(--fill, #f5f5f7); }
      .filo-riga .chi { font-weight: 600; font-size: 13.5px; }
      .filo-riga .tipo { font-weight: 400; font-size: 11px; color: var(--text-tertiary); text-transform: uppercase; margin-left: 4px; }
      .filo-riga .anteprima { grid-column: 1; font-size: 12.5px; color: var(--text-secondary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
      .pallino { grid-row: 1 / span 2; align-self: center; min-width: 20px; height: 20px; padding: 0 5px;
        border-radius: 999px; background: #ffcc00; color: #1d1d1f; font-size: 11.5px; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center; }
      .messaggi { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
      .msg { max-width: 82%; align-self: flex-start; background: var(--fill, #f5f5f7); border-radius: 14px 14px 14px 4px;
        padding: 8px 12px; display: flex; flex-direction: column; gap: 2px; }
      .msg.mio { align-self: flex-end; background: var(--ink, #1d1d1f); color: #fff; border-radius: 14px 14px 4px 14px; }
      .msg .autore { font-size: 11px; font-weight: 600; color: var(--text-tertiary); }
      .msg .testo { font-size: 13.5px; white-space: pre-wrap; word-break: break-word; }
      .msg .quando { font-size: 10.5px; opacity: 0.6; align-self: flex-end; }
      .vuoto { color: var(--text-tertiary); text-align: center; margin-top: 30px; font-size: 13px; }
      .composer { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--hairline); }
      .composer .field { flex: 1; min-width: 0; }
    `,
  ],
})
export class ChatPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly novita = inject(NovitaService);

  readonly aperto = signal(false);
  readonly fili = signal<Filo[]>([]);
  readonly filoAperto = signal<{ id: string; controparte: string } | null>(null);
  readonly messaggi = signal<Messaggio[]>([]);
  readonly inviando = signal(false);
  bozza = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.novita.avvia();
    // Chiudendo il pannello si spegne il polling fitto.
    effect(() => {
      if (this.aperto()) {
        this.ricarica();
        this.timer = setInterval(() => this.ricarica(), 7_000);
      } else if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    });
  }

  eUfficio(): boolean {
    const r = this.auth.user()?.role;
    return r === 'ADMIN' || r === 'OPERATION';
  }
  nonLetti(): number { return this.novita.conteggi()['chat'] ?? 0; }
  eMio(m: Messaggio): boolean { return this.eUfficio() ? m.dalUfficio : !m.dalUfficio; }
  intestazione(): string {
    if (!this.eUfficio()) return 'Deluxy';
    return this.filoAperto()?.controparte ?? 'Chat';
  }

  apri(): void { this.aperto.set(true); }
  chiudi(): void { this.aperto.set(false); }
  tornaAiFili(): void { this.filoAperto.set(null); this.messaggi.set([]); this.ricarica(); }
  apriFilo(f: Filo): void { this.filoAperto.set({ id: f.id, controparte: f.controparte }); this.ricarica(); }

  private ricarica(): void {
    if (this.eUfficio()) {
      const filo = this.filoAperto();
      if (filo) {
        this.http.get<{ messaggi: Messaggio[] }>(`${environment.apiUrl}/chat/fili/${filo.id}`).subscribe({
          next: (d) => { this.messaggi.set(d.messaggi ?? []); this.scrollGiu(); this.novita.aggiorna(); },
          error: () => undefined,
        });
      } else {
        this.http.get<Filo[]>(`${environment.apiUrl}/chat/fili`).subscribe({
          next: (d) => this.fili.set(d ?? []),
          error: () => undefined,
        });
      }
      return;
    }
    this.http.get<{ threadId: string; messaggi: Messaggio[] }>(`${environment.apiUrl}/chat/mia`).subscribe({
      next: (d) => { this.messaggi.set(d.messaggi ?? []); this.scrollGiu(); this.novita.aggiorna(); },
      error: () => undefined,
    });
  }

  invia(): void {
    const testo = this.bozza.trim();
    if (!testo) return;
    this.inviando.set(true);
    const corpo: Record<string, string> = { testo };
    const filo = this.filoAperto();
    if (this.eUfficio() && filo) corpo['threadId'] = filo.id;
    this.http.post(`${environment.apiUrl}/chat/messaggi`, corpo).subscribe({
      next: () => { this.inviando.set(false); this.bozza = ''; this.ricarica(); },
      error: () => this.inviando.set(false),
    });
  }

  private scrollGiu(): void {
    setTimeout(() => {
      const box = document.querySelector('.messaggi');
      if (box) box.scrollTop = box.scrollHeight;
    }, 50);
  }
}
