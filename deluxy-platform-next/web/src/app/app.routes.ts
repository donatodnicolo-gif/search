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
      {
        path: 'deliveries/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/delivery-form.component').then(
            (m) => m.DeliveryFormComponent,
          ),
      },
      {
        path: 'partners',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/partners-list.component').then(
            (m) => m.PartnersListComponent,
          ),
      },
      {
        path: 'partners/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/partner-form.component').then(
            (m) => m.PartnerFormComponent,
          ),
      },
      {
        path: 'valets',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/valets-list.component').then(
            (m) => m.ValetsListComponent,
          ),
      },
      {
        path: 'valets/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/valet-form.component').then(
            (m) => m.ValetFormComponent,
          ),
      },
      {
        path: 'operators',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/operators-list.component').then(
            (m) => m.OperatorsListComponent,
          ),
      },
      {
        path: 'operators/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/operator-form.component').then(
            (m) => m.OperatorFormComponent,
          ),
      },
      {
        path: 'products',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/products-list.component').then((m) => m.ProductsListComponent),
      },
      {
        path: 'products/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/product-form.component').then((m) => m.ProductFormComponent),
      },
      {
        path: 'categories',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/categories-list.component').then((m) => m.CategoriesListComponent),
      },
      {
        path: 'categories/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/category-form.component').then((m) => m.CategoryFormComponent),
      },
      {
        path: 'services',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/services-list.component').then((m) => m.ServicesListComponent),
      },
      {
        path: 'services/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/service-form.component').then((m) => m.ServiceFormComponent),
      },
      {
        path: 'calcoli',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/calcoli.component').then((m) => m.CalcoliComponent),
      },
      // ---- Route stub: sezioni in migrazione ----
      ...[
        { path: 'activities', title: 'Attivita', roles: ['ADMIN', 'OPERATION', 'VALET'] },
        { path: 'customers', title: 'Clienti', roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
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
