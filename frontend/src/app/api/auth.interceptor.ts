import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { CLAVE_SESION } from '../acceso/auth.service';
import { CLAVE as CLAVE_SESION_PORTAL } from '../portal/portal-sesion';
import { AmbitoToken, borrarToken, leerToken } from './token-api';

/** Las rutas del portal del cliente empiezan con /portal en la API. */
function ambitoDe(url: string): AmbitoToken {
  return url.startsWith(`${environment.apiUrl}/portal/`) ? 'portal' : 'personal';
}

/**
 * Interceptor de la API (README §8.2: servicios HTTP + interceptor con token Bearer).
 *  - Agrega el token de la sesión y pide siempre JSON.
 *  - 401: el token venció o se cerró la sesión desde otro dispositivo → se borra todo y se vuelve al acceso.
 *  - 403 PASSWORD_CHANGE_REQUIRED: tiene contraseña temporal → pantalla "Crea tu contraseña".
 * Solo toca las peticiones a nuestra API, nunca a otros sitios.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const ambito = ambitoDe(req.url);
  const token = leerToken(ambito);
  const router = inject(Router);

  const peticion = req.clone({
    setHeaders: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  return next(peticion).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        // Solo si había sesión: un 401 sin token es un error normal de la pantalla de acceso
        if (error.status === 401 && token) {
          borrarToken(ambito);
          if (ambito === 'portal') {
            sessionStorage.removeItem(CLAVE_SESION_PORTAL);
          } else {
            localStorage.removeItem(CLAVE_SESION);
            sessionStorage.removeItem(CLAVE_SESION);
          }
          // Recarga completa para que ningún servicio conserve datos de la sesión vencida
          window.location.assign(ambito === 'portal' ? '/portal' : '/iniciar-sesion');
        }

        if (error.status === 403 && error.error?.code === 'PASSWORD_CHANGE_REQUIRED') {
          router.navigateByUrl(ambito === 'portal' ? '/portal/crear-contrasena' : '/crear-contrasena');
        }
      }

      return throwError(() => error);
    }),
  );
};
