import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { avviaTabelleASchede } from './app/core/tabelle-a-schede';

// Dati del locale italiano per il DatePipe (nomi di giorni/mesi nel tracking
// pubblico rivolto al cliente). NON cambiamo LOCALE_ID globale: la localizzazione
// si chiede caso per caso passando ':it' alla pipe, così il resto dell'app non muta.
registerLocaleData(localeIt);

bootstrapApplication(AppComponent, appConfig)
  .then(() => avviaTabelleASchede())
  .catch((err) => console.error(err));
