import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { authInterceptor } from './api/auth.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // Cliente HTTP de la API con el token de la sesión en cada petición
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
