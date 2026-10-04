import { bootstrapApplication } from '@angular/platform-browser';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';

// Formato español en los pipes (number, currency, date): 1.234,56
registerLocaleData(localeEs, 'es-ES');

bootstrapApplication(App, {
  providers: [
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-ES' }
  ]
});
