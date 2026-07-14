import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { Role } from '../core/models';

interface NavItem {
  label: string;
  path: string;
  roles: Role[];
  supportOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Consegne', path: '/deliveries', roles: ['ADMIN', 'OPERATION', 'PARTNER', 'VALET'] },
  { label: 'Attivita', path: '/activities', roles: ['ADMIN', 'OPERATION', 'VALET'] },
  { label: 'Partner', path: '/partners', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
  { label: 'Valet', path: '/valets', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
  { label: 'Clienti', path: '/customers', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
  { label: 'Prodotti', path: '/products', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
  { label: 'Vendite', path: '/sales', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
  { label: 'Modelli SMS', path: '/sms-templates', roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
  { label: 'Disponibilita', path: '/availability', roles: ['VALET'] },
  { label: 'Stipendi', path: '/salaries', roles: ['ADMIN', 'OPERATION', 'VALET'] },
  { label: 'Pagamenti', path: '/payments', roles: ['ADMIN', 'OPERATION', 'VALET'] },
  { label: 'Regole carnet', path: '/delivery-rules', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
  { label: 'Province e citta', path: '/provinces', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
  { label: 'Utenti', path: '/users', roles: ['ADMIN'] },
  { label: 'Finanza', path: '/finance', roles: ['ADMIN'], supportOnly: true },
];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-d">D</span>
          <span>Deluxy</span>
        </div>
        <nav>
          @for (item of navItems(); track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              class="nav-link"
              >{{ item.label }}</a
            >
          }
        </nav>
        <div class="user-box">
          <div class="user-name">
            {{ auth.user()?.firstName }} {{ auth.user()?.lastName }}
          </div>
          <div class="user-role">{{ roleLabel() }}</div>
          <button class="logout" (click)="auth.logout()">Esci</button>
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
        width: 230px;
        background: var(--deluxy-dark);
        color: #e8e8e4;
        display: flex;
        flex-direction: column;
        padding: 16px 0;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 20px;
        font-weight: 600;
        letter-spacing: 1px;
        padding: 8px 20px 20px;
      }
      .brand-d {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--deluxy-gold);
        color: var(--deluxy-dark);
        font-family: Georgia, serif;
        font-weight: bold;
      }
      nav {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .nav-link {
        padding: 10px 20px;
        font-size: 14px;
        color: #c9c9c4;
        border-left: 3px solid transparent;
        transition: background 0.15s;
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }
      .nav-link.active {
        background: rgba(212, 175, 55, 0.12);
        border-left-color: var(--deluxy-gold);
        color: var(--deluxy-gold);
      }
      .user-box {
        padding: 16px 20px 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 13px;
      }
      .user-name {
        font-weight: 600;
      }
      .user-role {
        color: #9a9a94;
        margin: 2px 0 10px;
        font-size: 12px;
      }
      .logout {
        background: transparent;
        color: var(--deluxy-gold);
        border: 1px solid var(--deluxy-gold);
        border-radius: 6px;
        padding: 6px 14px;
        cursor: pointer;
        font-size: 13px;
      }
      .logout:hover {
        background: var(--deluxy-gold);
        color: var(--deluxy-dark);
      }
      .content {
        flex: 1;
        padding: 28px 32px;
        max-width: 100%;
        overflow-x: auto;
      }
      @media (max-width: 800px) {
        .shell {
          flex-direction: column;
        }
        .sidebar {
          width: 100%;
          height: auto;
          position: static;
        }
      }
    `,
  ],
})
export class ShellComponent {
  readonly auth = inject(AuthService);

  readonly navItems = computed(() => {
    const user = this.auth.user();
    if (!user) return [];
    return NAV_ITEMS.filter(
      (item) =>
        item.roles.includes(user.role) &&
        (!item.supportOnly || user.isSupport),
    );
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
}
