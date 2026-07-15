import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../core/auth.service';
import { Role } from '../core/models';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: Role[];
  supportOnly?: boolean;
}

/** Icone stroke minimali (24x24, stile SF Symbols). */
const ICONS: Record<string, string> = {
  box: '<rect x="4" y="7" width="16" height="13" rx="2.5"/><path d="M4 11h16M12 7v13M8 7l1.5-3h5L16 7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  store: '<path d="M5 9.5 6.2 4h11.6L19 9.5M5 9.5v9A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-9M5 9.5h14M10 20v-5h4v5"/>',
  bike: '<circle cx="6.5" cy="16.5" r="3.2"/><circle cx="17.5" cy="16.5" r="3.2"/><path d="M6.5 16.5 10 9h4.5l3 7.5M10 9 8.5 6H11"/>',
  people: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="16.5" cy="10" r="2.5"/><path d="M15.5 14.7c2.3.2 4.2 1.7 4.8 4.3"/>',
  tag: '<path d="M12.5 4H19a1 1 0 0 1 1 1v6.5a1.5 1.5 0 0 1-.44 1.06l-7.5 7.5a1.5 1.5 0 0 1-2.12 0l-5-5a1.5 1.5 0 0 1 0-2.12l7.5-7.5A1.5 1.5 0 0 1 12.5 4Z"/><circle cx="15.5" cy="8.5" r="1.3"/>',
  cart: '<path d="M4 5h2l2.2 10.5a1.5 1.5 0 0 0 1.47 1.2h6.9a1.5 1.5 0 0 0 1.45-1.1L20 8H7"/><circle cx="10.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/>',
  message: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.5c-.5.4-.8.2-.8-.4Z"/>',
  calendar: '<rect x="4" y="6" width="16" height="14" rx="2.5"/><path d="M4 10.5h16M8.5 4v3.5M15.5 4v3.5"/>',
  euro: '<path d="M17.5 6.5A6.8 6.8 0 0 0 12.7 4C9 4 6.4 7.6 6.4 12s2.6 8 6.3 8a6.8 6.8 0 0 0 4.8-2.5M4.5 9.8h9M4.5 13.8h8"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 9.5h17M15 14.5h2.5"/>',
  rules: '<path d="M6 4.5h12M6 9h12M6 13.5h7"/><circle cx="17" cy="16.5" r="3.4"/><path d="m15.7 16.6 1 1 1.7-2"/>',
  map: '<path d="m9 5-4.4 1.8a1 1 0 0 0-.6.9v10.1a1 1 0 0 0 1.4.9L9 17l6 2 4.4-1.8a1 1 0 0 0 .6-.9V6.2a1 1 0 0 0-1.4-.9L15 7Zm0 0v12m6-10v12"/>',
  users: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.8 3.5-5.8 7-5.8s6.2 2 7 5.8"/>',
  chart: '<path d="M4.5 19.5h15M7 16v-4.5M12 16V7M17 16v-6.5"/>',
  badge: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V2.8A.8.8 0 0 1 9.8 2h4.4a.8.8 0 0 1 .8.8V4"/><circle cx="12" cy="10.5" r="2.2"/><path d="M8.5 17c.4-1.8 1.8-2.7 3.5-2.7s3.1.9 3.5 2.7"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3l2 2.2h6a2 2 0 0 1 2 2v6.3a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z"/>',
};

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Operatività',
    items: [
      { label: 'Consegne', path: '/deliveries', icon: 'box', roles: ['ADMIN', 'OPERATION', 'PARTNER', 'VALET'] },
      { label: 'Attività', path: '/activities', icon: 'clock', roles: ['ADMIN', 'OPERATION', 'VALET'] },
      { label: 'Vendite', path: '/sales', icon: 'cart', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
    ],
  },
  {
    title: 'Utenti',
    items: [
      { label: 'Partner', path: '/partners', icon: 'store', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
      { label: 'Valet', path: '/valets', icon: 'bike', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
      { label: 'Clienti', path: '/customers', icon: 'people', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
      { label: 'Operatori', path: '/operators', icon: 'badge', roles: ['ADMIN', 'OPERATION'] },
    ],
  },
  {
    title: 'Prodotti',
    items: [
      { label: 'Prodotti', path: '/products', icon: 'tag', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
      { label: 'Categorie', path: '/categories', icon: 'folder', roles: ['ADMIN', 'OPERATION'] },
    ],
  },
  {
    title: 'Amministrazione',
    items: [
      { label: 'Stipendi', path: '/salaries', icon: 'euro', roles: ['ADMIN', 'OPERATION', 'VALET'] },
      { label: 'Pagamenti', path: '/payments', icon: 'wallet', roles: ['ADMIN', 'OPERATION', 'VALET'] },
      { label: 'Regole carnet', path: '/delivery-rules', icon: 'rules', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
      { label: 'Finanza', path: '/finance', icon: 'chart', roles: ['ADMIN'], supportOnly: true },
    ],
  },
  {
    title: 'Configurazione',
    items: [
      { label: 'Modelli SMS', path: '/sms-templates', icon: 'message', roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
      { label: 'Disponibilità', path: '/availability', icon: 'calendar', roles: ['VALET'] },
      { label: 'Province e città', path: '/provinces', icon: 'map', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
      { label: 'Utenti e ruoli', path: '/users', icon: 'users', roles: ['ADMIN'] },
    ],
  },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <!-- Topbar (solo mobile) -->
      <header class="topbar">
        <button class="hamburger" (click)="toggle()" aria-label="Apri menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span class="brand-mark sm">D</span>
        <span class="brand-name">Deluxy</span>
      </header>

      <!-- Overlay per chiudere il drawer -->
      @if (menuOpen()) {
        <div class="overlay" (click)="close()"></div>
      }

      <aside class="sidebar" [class.open]="menuOpen()">
        <div class="brand">
          <span class="brand-mark">D</span>
          <span class="brand-name">Deluxy</span>
        </div>

        <nav>
          @for (section of sections(); track section.title) {
            <div class="nav-section">{{ section.title }}</div>
            @for (item of section.items; track item.path) {
              <a [routerLink]="item.path" routerLinkActive="active" class="nav-link" (click)="close()">
                <span class="nav-icon" [innerHTML]="icon(item.icon)"></span>
                <span>{{ item.label }}</span>
              </a>
            }
          }
        </nav>

        <div class="user-box">
          <div class="avatar">{{ initials() }}</div>
          <div class="user-meta">
            <div class="user-name">
              {{ auth.user()?.firstName }} {{ auth.user()?.lastName }}
            </div>
            <div class="user-role">{{ roleLabel() }}</div>
          </div>
          <button class="logout" (click)="auth.logout()" title="Esci">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7M10.5 12H20m0 0-3-3m3 3-3 3"/>
            </svg>
          </button>
        </div>
      </aside>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        min-height: 100vh;
      }
      .sidebar {
        width: 250px;
        flex-shrink: 0;
        background: var(--surface-translucent);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        backdrop-filter: blur(24px) saturate(180%);
        border-right: 1px solid var(--hairline);
        display: flex;
        flex-direction: column;
        padding: 18px 12px 14px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 10px 18px;
      }
      .brand-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 9px;
        background: linear-gradient(145deg, #1d1f26, #3a3d47);
        color: var(--gold);
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 19px;
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 1px 3px rgba(0, 0, 0, 0.25);
      }
      .brand-name {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.02em;
      }
      nav {
        flex: 1;
      }
      .nav-section {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
        padding: 16px 10px 6px;
      }
      .nav-link {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        margin: 1px 0;
        border-radius: 9px;
        font-size: 13.5px;
        font-weight: 450;
        color: var(--text);
        transition: background 0.16s var(--ease);
      }
      .nav-link:hover {
        background: var(--fill);
      }
      .nav-link.active {
        background: var(--fill-active);
        font-weight: 600;
      }
      .nav-link.active .nav-icon {
        color: var(--gold-strong);
      }
      .nav-icon {
        display: inline-flex;
        width: 19px;
        height: 19px;
        color: var(--text-secondary);
        flex-shrink: 0;
      }
      .nav-icon :where(svg) {
        width: 100%;
        height: 100%;
      }
      .user-box {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 12px;
        padding: 10px;
        border-top: 1px solid var(--hairline);
      }
      .avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--gold-soft);
        color: var(--gold-strong);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12.5px;
        font-weight: 600;
        flex-shrink: 0;
      }
      .user-meta {
        flex: 1;
        min-width: 0;
      }
      .user-name {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .user-role {
        font-size: 11.5px;
        color: var(--text-tertiary);
      }
      .logout {
        width: 30px;
        height: 30px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--text-secondary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px;
        transition: background 0.16s var(--ease), color 0.16s var(--ease);
      }
      .logout:hover {
        background: var(--fill-hover);
        color: var(--text);
      }
      .logout svg {
        width: 100%;
        height: 100%;
      }
      .content {
        flex: 1;
        padding: 36px 44px 48px;
        max-width: 100%;
        overflow-x: auto;
      }

      /* Topbar e overlay: nascosti su desktop */
      .topbar {
        display: none;
      }
      .overlay {
        display: none;
      }

      @media (max-width: 800px) {
        .shell {
          flex-direction: column;
        }
        /* Topbar mobile fissa in alto */
        .topbar {
          display: flex;
          align-items: center;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 40;
          height: 56px;
          padding: 0 16px;
          background: var(--surface-translucent);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid var(--hairline);
        }
        .hamburger {
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          margin-left: -6px;
        }
        .hamburger:hover {
          background: var(--fill);
        }
        .hamburger svg {
          width: 100%;
          height: 100%;
        }
        .brand-mark.sm {
          width: 30px;
          height: 30px;
          font-size: 17px;
          border-radius: 8px;
        }

        /* Sidebar come drawer off-canvas */
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          height: 100dvh;
          width: 264px;
          max-width: 82vw;
          z-index: 60;
          transform: translateX(-100%);
          transition: transform 0.28s var(--ease);
          box-shadow: var(--shadow-float);
          border-right: 1px solid var(--hairline);
        }
        .sidebar.open {
          transform: translateX(0);
        }
        /* La "brand" interna al drawer è ridondante con la topbar ma resta come intestazione del menu */

        .overlay {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(0, 0, 0, 0.32);
          -webkit-backdrop-filter: blur(2px);
          backdrop-filter: blur(2px);
          animation: fade 0.2s var(--ease);
        }
        @keyframes fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .content {
          padding: 20px 16px 32px;
        }
      }
    `,
  ],
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);

  private readonly iconCache = new Map<string, SafeHtml>();

  /** Drawer mobile aperto/chiuso. */
  readonly menuOpen = signal(false);

  constructor() {
    // Chiude il drawer a ogni navigazione
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  toggle(): void {
    this.menuOpen.update((v) => !v);
  }

  close(): void {
    this.menuOpen.set(false);
  }

  readonly sections = computed(() => {
    const user = this.auth.user();
    if (!user) return [];
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.roles.includes(user.role) &&
          (!item.supportOnly || user.isSupport),
      ),
    })).filter((section) => section.items.length > 0);
  });

  readonly roleLabel = computed(() => {
    const labels: Record<string, string> = {
      ADMIN: 'Amministratore',
      OPERATION: 'Operation',
      PARTNER: 'Partner',
      VALET: 'Valet',
      PROJECT_MANAGER: 'Project Manager',
    };
    return labels[this.auth.user()?.role ?? ''] ?? '';
  });

  readonly initials = computed(() => {
    const u = this.auth.user();
    return `${u?.firstName?.[0] ?? ''}${u?.lastName?.[0] ?? ''}`.toUpperCase();
  });

  icon(name: string): SafeHtml {
    let cached = this.iconCache.get(name);
    if (!cached) {
      cached = this.sanitizer.bypassSecurityTrustHtml(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`,
      );
      this.iconCache.set(name, cached);
    }
    return cached;
  }
}
