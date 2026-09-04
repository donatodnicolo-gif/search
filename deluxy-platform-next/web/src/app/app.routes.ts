import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    // Cambio password: obbligatorio al primo accesso con password temporanea
    // (authGuard ci rimanda finché non è cambiata), ma anche volontario.
    path: 'cambia-password',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/cambia-password.component').then((m) => m.CambiaPasswordComponent),
  },
  {
    // Monitoraggio pubblico (bottone MONITORARE): nessun login, fuori dallo shell.
    path: 'tracking/:token',
    loadComponent: () =>
      import('./pages/tracking.component').then((m) => m.TrackingComponent),
  },
  {
    // Conferma consegna pubblica (bottone DELIVERED LINK): nessun login, fuori dallo shell.
    path: 'consegnata/:token',
    loadComponent: () =>
      import('./pages/confirm-delivery.component').then((m) => m.ConfirmDeliveryComponent),
  },
  {
    // Accettazione invito: la persona sceglie la password. Pubblica, fuori dallo shell.
    path: 'invite/:token',
    loadComponent: () =>
      import('./pages/accept-invite.component').then((m) => m.AcceptInviteComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'deliveries', pathMatch: 'full' },
      {
        // LA SCHEDA PROFILO (02/09): dal proprio nome in basso a sinistra.
        // Tutti i ruoli: ognuno vede e corregge solo i PROPRI dati.
        path: 'profilo',
        loadComponent: () =>
          import('./pages/profilo.component').then((m) => m.ProfiloComponent),
      },
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
        path: 'delivery-rules',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'], title: 'Regole carnet' },
        loadComponent: () =>
          import('./pages/delivery-rules.component').then(
            (m) => m.DeliveryRulesComponent,
          ),
      },
      {
        path: 'recurring-services',
        canActivate: [roleGuard],
        // ⭐ Anche il PARTNER (27/08): si imposta i propri presìdi, senza scegliere
        // il valet ne' scrivere prezzi — vale il listino che ha gia'.
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'], title: 'Servizi ricorrenti' },
        loadComponent: () =>
          import('./pages/recurring-services.component').then(
            (m) => m.RecurringServicesComponent,
          ),
      },
      // ---- La casa del PARTNER: la vetrina dei servizi richiedibili ----
      // ⚠️ Solo PARTNER (27/08): la pagina dice «Che cosa ti serve?» e offre di
      // chiedere un preventivo a Deluxy — e' scritta per chi sta dall'altra
      // parte. Prima era aperta ad ADMIN e OPERATION, che dal menu ci
      // atterravano e vedevano una vetrina rivolta a se stessi, con sopra
      // l'avviso che il collegamento a Scout non e' configurato. L'ufficio le
      // richieste dei partner le vede in Preventivi, che e' la sua pagina.
      {
        path: 'home',
        canActivate: [roleGuard],
        data: { roles: ['PARTNER'], title: 'Servizi Deluxy' },
        loadComponent: () =>
          import('./pages/partner-home.component').then((m) => m.PartnerHomeComponent),
      },
      // ---- Preventivi: il form e le richieste ----
      {
        path: 'quotes',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER'], title: 'Preventivi' },
        loadComponent: () =>
          import('./pages/quotes.component').then((m) => m.QuotesComponent),
      },
      {
        path: 'valet-rules',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'], title: 'Regole valet' },
        loadComponent: () =>
          import('./pages/valet-rules.component').then(
            (m) => m.ValetRulesComponent,
          ),
      },
      {
        path: 'finance',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'], title: 'Finanza' },
        loadComponent: () =>
          import('./pages/finance.component').then((m) => m.FinanceComponent),
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
        path: 'calendar',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER', 'VALET'] },
        loadComponent: () =>
          import('./pages/calendar.component').then((m) => m.CalendarComponent),
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
        // ⚠️ Prima di `products/:id`: altrimenti «riconciliazioni» sarebbe un id.
        path: 'products/riconciliazioni',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'] },
        loadComponent: () =>
          import('./pages/product-reconciliations.component').then((m) => m.ProductReconciliationsComponent),
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
      // ---- Utenti e accessi (solo admin) ----
      // Le RICHIESTE testuali dalle altre app. Il Customer Service e' un
      // OPERATION (operationRole = customer_service), quindi e' gia' compreso.
      {
        path: 'richieste',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION'], title: 'Richieste' },
        loadComponent: () =>
          import('./pages/richieste.component').then((m) => m.RichiesteComponent),
      },
      {
        // Segnalazioni: l'ufficio le apre su partner/valet; partner e valet
        // vedono e aprono le proprie (reclami).
        path: 'segnalazioni',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER', 'VALET'], title: 'Segnalazioni' },
        loadComponent: () =>
          import('./pages/segnalazioni.component').then((m) => m.SegnalazioniComponent),
      },
      // Le chiavi con cui le altre app chiamano questa. Solo ADMIN: una chiave
      // app scavalca i ruoli dell'applicazione.
      {
        path: 'api-keys',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadComponent: () =>
          import('./pages/api-keys.component').then((m) => m.ApiKeysComponent),
      },
      {
        path: 'users',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadComponent: () =>
          import('./pages/users-list.component').then((m) => m.UsersListComponent),
      },
      // ---- Stipendi (Amministrazione) ----
      {
        path: 'salaries',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'VALET'] },
        loadComponent: () =>
          import('./pages/salaries-list.component').then((m) => m.SalariesListComponent),
      },
      // ---- Fatturazione (Amministrazione / partner) ----
      {
        path: 'invoices',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/invoices-list.component').then((m) => m.InvoicesListComponent),
      },
      // ---- Ricevute (Amministrazione / valet) ----
      {
        path: 'receipts',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'VALET'] },
        loadComponent: () =>
          import('./pages/receipts-list.component').then((m) => m.ReceiptsListComponent),
      },
      // ---- Pagamenti (Amministrazione) ----
      {
        path: 'payments',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'VALET'] },
        loadComponent: () =>
          import('./pages/payments-list.component').then((m) => m.PaymentsListComponent),
      },
      // ---- Impostazioni (chiavi API, solo admin) ----
      {
        path: 'settings',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadComponent: () =>
          import('./pages/settings.component').then((m) => m.SettingsComponent),
      },
      // ---- Vendite (ordini smistati ai partner) ----
      {
        path: 'sales',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/sales-list.component').then((m) => m.SalesListComponent),
      },
      // ---- Attività (ritiri e consegne della giornata) ----
      {
        path: 'availability-board',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/availability-board.component').then((m) => m.AvailabilityBoardComponent),
      },
      {
        path: 'activities',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'VALET'] },
        loadComponent: () =>
          import('./pages/activities-list.component').then((m) => m.ActivitiesListComponent),
      },
      // ---- Modelli SMS (dal database, import legacy) ----
      {
        path: 'sms-templates',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PARTNER'] },
        loadComponent: () =>
          import('./pages/sms-templates-list.component').then((m) => m.SmsTemplatesListComponent),
      },
      // ---- Province e città (dal database, import legacy) ----
      {
        path: 'provinces',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'OPERATION', 'PROJECT_MANAGER'] },
        loadComponent: () =>
          import('./pages/provinces-list.component').then((m) => m.ProvincesListComponent),
      },
      // Disponibilità del valet: imposta i giorni/fasce in cui è disponibile.
      {
        path: 'availability',
        canActivate: [roleGuard],
        data: { roles: ['VALET'], title: 'Disponibilità' },
        loadComponent: () =>
          import('./pages/valet-availability.component').then((m) => m.ValetAvailabilityComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
