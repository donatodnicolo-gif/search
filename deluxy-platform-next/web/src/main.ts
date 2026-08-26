import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { avviaTabelleASchede } from './app/core/tabelle-a-schede';

bootstrapApplication(AppComponent, appConfig)
  .then(() => avviaTabelleASchede())
  .catch((err) => console.error(err));
