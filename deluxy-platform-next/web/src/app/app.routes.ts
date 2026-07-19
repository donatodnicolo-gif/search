import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    // Monitoraggio pubblico (bottone MONITORARE): nessun login, fuori dallo shell.
    path: 'tracking/:token',
    loadComponent: () =>
      import('./pages/tracking.component').then((m) => m.TrackingComponent),
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
        // Modifica consegna. Il partner è ammesso, ma l'API applica la regola
        // (solo consegne "da gestire" e con servizio diverso da VENDITA).
        path: 'deliveries/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/delivery-form.component').then(
            (m) => m.DeliveryFormComponent,
          ),
      },
      {
        // Dettaglio consegna (sola lettura). Il contenuto è filtrato per ruolo.
        path: 'deliveries/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER', 'VALET'] },
        loadComponent: () =>
          import('./pages/delivery-detail.component').then(
            (m) => m.DeliveryDetailComponent,
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
        // Modifica partner (il partner stesso può modificarsi: vedi API)
        path: 'partners/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/partner-form.component').then(
            (m) => m.PartnerFormComponent,
          ),
      },
      {
        // Dettaglio partner: si apre cliccando la riga in lista
        path: 'partners/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/partner-detail.component').then(
            (m) => m.PartnerDetailComponent,
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
      // ---- Valet: modifica + dettaglio ----
      {
        path: 'valets/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/valet-form.component').then((m) => m.ValetFormComponent),
      },
      {
        path: 'valets/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/valet-detail.component').then((m) => m.ValetDetailComponent),
      },
      // ---- Prodotti: modifica + dettaglio ----
      {
        path: 'products/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/product-form.component').then((m) => m.ProductFormComponent),
      },
      {
        path: 'products/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/product-detail.component').then((m) => m.ProductDetailComponent),
      },
      // ---- Categorie: modifica + dettaglio ----
      {
        path: 'categories/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/category-form.component').then((m) => m.CategoryFormComponent),
      },
      {
        path: 'categories/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/category-detail.component').then((m) => m.CategoryDetailComponent),
      },
      // ---- Servizi: modifica + dettaglio ----
      {
        path: 'services/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/service-form.component').then((m) => m.ServiceFormComponent),
      },
      {
        path: 'services/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/service-detail.component').then((m) => m.ServiceDetailComponent),
      },
      // ---- Operatori: modifica + dettaglio ----
      {
        path: 'operators/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/operator-form.component').then((m) => m.OperatorFormComponent),
      },
      {
        path: 'operators/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/operator-detail.component').then((m) => m.OperatorDetailComponent),
      },
      // ---- Clienti ----
      {
        path: 'customers',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/customers-list.component').then(
            (m) => m.CustomersListComponent,
          ),
      },
      {
        path: 'customers/new',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/customer-form.component').then(
            (m) => m.CustomerFormComponent,
          ),
      },
      {
        path: 'customers/:id/edit',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/customer-form.component').then(
            (m) => m.CustomerFormComponent,
          ),
      },
      {
        // Dettaglio cliente: si apre cliccando la riga in lista
        path: 'customers/:id',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/customer-detail.component').then(
            (m) => m.CustomerDetailComponent,
          ),
      },
      // ---- Route stub: sezioni in migrazione ----
      ...[
        { path: 'activities', title: 'Attivita', roles: ['ADMIN', 'OPERATION', 'VALET'] },
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
