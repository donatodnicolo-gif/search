import { DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationsService, Notification } from './notifications.service';

/**
 * Campanello notifiche con contatore + tendina, da collocare nell'header.
 * Replica il "contatore notifiche push" in alto a destra dell'app reale
 * (§3 di COME-FUNZIONA-APP-DELUXY.md), qui in stile Deluxy Design System.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  template: `
    <div class="bell-wrap">
      <button
        class="bell"
        (click)="toggle()"
        [class.has-unread]="notifications.unread() > 0"
        [attr.aria-label]="'notifications.title' | translate"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        @if (notifications.unread() > 0) {
          <span class="badge">{{ notifications.unread() > 99 ? '99+' : notifications.unread() }}</span>
        }
      </button>

      @if (open()) {
        <div class="panel">
          <header class="panel-head">
            <span>{{ 'notifications.title' | translate }}</span>
            @if (notifications.unread() > 0) {
              <button class="link" (click)="notifications.markAllRead()">
                {{ 'notifications.markAllRead' | translate }}
              </button>
            }
          </header>

          <div class="panel-body">
            @if (notifications.loading()) {
              <p class="empty">…</p>
            } @else if (notifications.items().length === 0) {
              <p class="empty">{{ 'notifications.empty' | translate }}</p>
            } @else {
              @for (n of notifications.items(); track n.id) {
                <button class="item" [class.unread]="!n.readAt" (click)="onClick(n)">
                  @if (!n.readAt) { <span class="dot"></span> }
                  <span class="item-text">
                    <span class="item-title">{{ n.title }}</span>
                    <span class="item-body">{{ n.body }}</span>
                    <span class="item-time">{{ n.createdAt | date: 'd MMM, HH:mm' }}</span>
                  </span>
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .bell-wrap { position: relative; }
      .bell {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border: none;
        border-radius: 50%;
        background: var(--fill);
        color: var(--text-secondary);
        cursor: pointer;
        transition: background 0.15s var(--ease), color 0.15s var(--ease);
      }
      .bell:hover { background: var(--fill-hover); color: var(--text); }
      .bell.has-unread { color: var(--text); }
      .bell svg { width: 20px; height: 20px; }
      .badge {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: var(--red);
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        line-height: 18px;
        text-align: center;
      }
      .panel {
        position: absolute;
        bottom: calc(100% + 10px);
        right: 0;
        width: 340px;
        max-width: 88vw;
        background: var(--surface);
        border: 1px solid var(--hairline);
        border-radius: var(--radius-l);
        box-shadow: var(--shadow-float);
        overflow: hidden;
        z-index: 50;
      }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--hairline);
        font-weight: 600;
        font-size: 14px;
      }
      .link {
        border: none;
        background: none;
        color: var(--blue);
        font-size: 13px;
        cursor: pointer;
      }
      .panel-body { max-height: 60vh; overflow-y: auto; }
      .empty { padding: 28px 16px; text-align: center; color: var(--text-tertiary); font-size: 14px; }
      .item {
        display: flex;
        gap: 10px;
        width: 100%;
        padding: 12px 16px;
        border: none;
        border-bottom: 1px solid var(--hairline);
        background: none;
        text-align: left;
        cursor: pointer;
        transition: background 0.12s var(--ease);
      }
      .item:hover { background: var(--fill); }
      .item.unread { background: var(--gold-soft); }
      .item.unread:hover { background: var(--fill-hover); }
      .dot {
        flex: 0 0 auto;
        width: 8px;
        height: 8px;
        margin-top: 5px;
        border-radius: 50%;
        background: var(--gold);
      }
      .item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .item-title { font-size: 13px; font-weight: 600; color: var(--text); }
      .item-body { font-size: 13px; color: var(--text-secondary); }
      .item-time { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
    `,
  ],
})
export class NotificationBellComponent {
  readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef);

  readonly open = signal(false);

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.notifications.load();
  }

  onClick(n: Notification): void {
    if (!n.readAt) this.notifications.markRead(n.id);
    if (n.entityType === 'delivery' && n.entityId) {
      this.open.set(false);
      this.router.navigate(['/deliveries', n.entityId]);
    }
  }

  /** Chiude la tendina cliccando fuori. */
  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target)) {
      this.open.set(false);
    }
  }
}
