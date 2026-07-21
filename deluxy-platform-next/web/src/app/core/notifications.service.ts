import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
}

/** Ogni quanto si aggiorna il contatore in header. */
const POLL_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/notifications`;

  readonly unread = signal(0);
  readonly items = signal<Notification[]>([]);
  readonly loading = signal(false);

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  /** Avvia il polling del contatore. Idempotente: chiamarlo due volte non
   *  raddoppia i timer (succederebbe al re-render della shell). */
  startPolling(): void {
    if (this.pollHandle !== null) return;
    this.refreshCount();
    this.pollHandle = setInterval(() => this.refreshCount(), POLL_MS);
  }

  stopPolling(): void {
    if (this.pollHandle === null) return;
    clearInterval(this.pollHandle);
    this.pollHandle = null;
  }

  refreshCount(): void {
    this.http.get<{ count: number }>(`${this.base}/count`).subscribe({
      next: (res) => this.unread.set(res.count),
      // Il contatore non deve mai disturbare: se l'API non risponde
      // (token scaduto, rete assente) si tiene l'ultimo valore noto.
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    this.http.get<NotificationPage>(`${this.base}?pageSize=20`).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.unread.set(res.unread);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markRead(id: string): void {
    // Aggiornamento ottimistico: il pallino sparisce subito, senza attendere
    // il round-trip.
    this.items.update((list) =>
      list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    this.unread.update((n) => Math.max(0, n - 1));
    this.http.post(`${this.base}/${id}/read`, {}).subscribe({
      error: () => this.load(),
    });
  }

  markAllRead(): void {
    const now = new Date().toISOString();
    this.items.update((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    this.unread.set(0);
    this.http.post(`${this.base}/read-all`, {}).subscribe({
      error: () => this.load(),
    });
  }

  // ---------------- Web Push (browser) ----------------

  /**
   * Registra il browser al Web Push: chiede il permesso, si iscrive col
   * service worker e invia l'iscrizione all'API. Silenzioso e best-effort —
   * senza permesso o senza VAPID sul server, l'app resta con le sole
   * notifiche in-app. Da chiamare su gesto utente (es. bottone in Profilo).
   */
  async enablePush(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    const keyRes = await this.http
      .get<{ publicKey: string | null }>(`${this.base}/vapid-public-key`)
      .toPromise()
      .catch(() => null);
    if (!keyRes?.publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await navigator.serviceWorker.register('/sw-push.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
    });

    const json = sub.toJSON();
    await this.http
      .post(`${this.base}/subscribe`, {
        endpoint: sub.endpoint,
        p256dh: json.keys?.['p256dh'],
        auth: json.keys?.['auth'],
        userAgent: navigator.userAgent,
      })
      .toPromise();
    return true;
  }
}

/** La chiave VAPID viaggia in base64url: il PushManager la vuole come byte. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
