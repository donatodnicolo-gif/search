import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'deliveries', pathMatch: 'full' },
      {
        path: 'deliveries',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER', 'VALET'] },
        loadComponent: () =>
          import('./pages/deliveries-list.component').then(
            (m) => m.DeliveriesListComponent,
          ),
      },
      // ---- Route stub: sezioni in migrazione ----
      ...[
        { path: 'activities', title: 'Attivita', roles: ['ADMIN', 'OPERATION', 'VALET'] },
        { path: 'partners', title: 'Partner', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        { path: 'valets', title: 'Valet', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        { path: 'customers', title: 'Clienti', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        { path: 'products', title: 'Prodotti', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        { path: 'sales', title: 'Vendite', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        { path: 'sms-templates', title: 'Modelli SMS', roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
        { path: 'availability', title: 'Disponibilita', roles: ['VALET'] },
        { path: 'salaries', title: 'Stipendi', roles: ['ADMIN', 'OPERATION', 'VALET'] },
        { path: 'payments', title: 'Pagamenti', roles: ['ADMIN', 'OPERATION', 'VALET'] },
        { path: 'delivery-rules', title: 'Regole carnet', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        { path: 'provinces', title: 'Province e citta', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        { path: 'users', title: 'Utenti', roles: ['ADMIN'] },
        { path: 'finance', title: 'Finanza', roles: ['ADMIN'] },
      ].map((stub) => ({
        path: stub.path,
        canActivate: [roleGuard],
        data: { roles: stub.roles, title: stub.title },
        loadComponent: () =>
          import('./pages/stub.component').then((m) => m.StubComponent),
      })),
    ],
  },
  { path: '**', redirectTo: '' },
];
