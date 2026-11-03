import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AccesoLayoutComponent } from './acceso/acceso-layout/acceso-layout.component';
import { AuthService } from './acceso/auth.service';
import { CrearContrasenaComponent } from './acceso/crear-contrasena/crear-contrasena.component';
import { IniciarSesionComponent } from './acceso/iniciar-sesion/iniciar-sesion.component';
import { OlvideContrasenaComponent } from './acceso/olvide-contrasena/olvide-contrasena.component';
import { InicioPendienteComponent } from './inicio/inicio-pendiente.component';

/** Solo entra quien tiene sesión y ya creó su contraseña definitiva. */
const conSesion: CanActivateFn = () => {
  const sesion = inject(AuthService).sesion();
  if (!sesion) return inject(Router).parseUrl('/iniciar-sesion');
  return sesion.requiereCambioContrasena ? inject(Router).parseUrl('/crear-contrasena') : true;
};

/** A.5 solo tiene sentido si se entró con contraseña temporal. */
const conContrasenaTemporal: CanActivateFn = () =>
  inject(AuthService).sesion()?.requiereCambioContrasena ? true : inject(Router).parseUrl('/iniciar-sesion');

export const routes: Routes = [
  {
    path: '',
    component: AccesoLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'iniciar-sesion' },
      { path: 'iniciar-sesion', component: IniciarSesionComponent, title: 'Iniciar sesión · SHURI' },
      { path: 'olvide-contrasena', component: OlvideContrasenaComponent, title: '¿Olvidaste tu contraseña? · SHURI' },
      {
        path: 'crear-contrasena',
        component: CrearContrasenaComponent,
        canActivate: [conContrasenaTemporal],
        title: 'Crea tu contraseña · SHURI',
      },
    ],
  },
  { path: 'inicio', component: InicioPendienteComponent, canActivate: [conSesion], title: 'Inicio · SHURI' },
  { path: '**', redirectTo: 'iniciar-sesion' },
];
