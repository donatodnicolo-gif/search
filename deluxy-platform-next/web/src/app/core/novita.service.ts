import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/**
 * LE NOVITÀ (03/09, regola utente): un polling educato (30″) su
 * /chat/novita accende i pallini gialli delle sezioni e il badge della
 * chat — il «tempo reale» del Customer Service, senza websocket.
 */
@Injectable({ providedIn: 'root' })
export class NovitaService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly conteggi = signal<Record<string, number>>({});
  private timer: ReturnType<typeof setInterval> | null = null;

  avvia(): void {
    if (this.timer) return;
    this.aggiorna();
    this.timer = setInterval(() => this.aggiorna(), 30_000);
  }

  aggiorna(): void {
    if (!this.auth.user()) return;
    this.http.get<Record<string, number>>(`${environment.apiUrl}/chat/novita`).subscribe({
      next: (c) => this.conteggi.set(c ?? {}),
      error: () => undefined, // i pallini non devono mai rompere la pagina
    });
  }
}
