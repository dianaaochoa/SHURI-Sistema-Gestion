import { Type, inject } from '@angular/core';
import { CanActivateFn, Route, Router, Routes } from '@angular/router';
import { AccesoLayoutComponent } from './acceso/acceso-layout/acceso-layout.component';
import { AuthService, Rol } from './acceso/auth.service';
import { CrearContrasenaComponent } from './acceso/crear-contrasena/crear-contrasena.component';
import { IniciarSesionComponent } from './acceso/iniciar-sesion/iniciar-sesion.component';
import { OlvideContrasenaComponent } from './acceso/olvide-contrasena/olvide-contrasena.component';
import { NAVEGACION, rutaInicio } from './sistema/navegacion';
import { PaginaPendienteComponent } from './sistema/pagina-pendiente/pagina-pendiente.component';
import { SistemaLayoutComponent } from './sistema/sistema-layout/sistema-layout.component';

/** A.5 solo tiene sentido si se entró con contraseña temporal. */
const conContrasenaTemporal: CanActivateFn = () =>
  inject(AuthService).sesion()?.requiereCambioContrasena ? true : inject(Router).parseUrl('/iniciar-sesion');

/** Un solo login para el personal: cada rol entra a su propio inicio (nota de Figma A.1/A.5). */
const aSuInicio: CanActivateFn = () => {
  const sesion = inject(AuthService).sesion();
  const router = inject(Router);
  if (!sesion) return router.parseUrl('/iniciar-sesion');
  return router.parseUrl(sesion.requiereCambioContrasena ? '/crear-contrasena' : rutaInicio(sesion.rol));
};

/** Solo entra el rol dueño de la sección; los demás vuelven a su inicio. */
const soloRol =
  (rol: Rol): CanActivateFn =>
  () => {
    const sesion = inject(AuthService).sesion();
    if (sesion?.rol === rol && !sesion.requiereCambioContrasena) return true;
    return inject(Router).parseUrl('/inicio');
  };

/**
 * Pantallas ya construidas, por "prefijo/ruta". Las demás usan PaginaPendienteComponent.
 * Se cargan bajo demanda: cada una baja en su propio archivo al entrar (así el paquete inicial no crece con cada pantalla).
 */
const PANTALLAS: Record<string, () => Promise<Type<unknown>>> = {
  'cajera/inicio': () => import('./cajera/inicio-cajera/inicio-cajera.component').then((m) => m.InicioCajeraComponent),
  'cajera/punto-de-venta': () => import('./cajera/punto-de-venta/punto-de-venta.component').then((m) => m.PuntoDeVentaComponent),
  'cajera/ventas': () => import('./cajera/ventas/ventas.component').then((m) => m.VentasComponent),
  'cajera/ordenes-de-servicio': () => import('./cajera/ordenes/ordenes.component').then((m) => m.OrdenesComponent),
  // C5 es un modal sobre la lista de órdenes: la misma pantalla lo abre al entrar por esta ruta.
  'cajera/nueva-orden': () => import('./cajera/ordenes/ordenes.component').then((m) => m.OrdenesComponent),
  'cajera/entrega-de-equipo': () => import('./cajera/entrega/entrega.component').then((m) => m.EntregaComponent),
  'cajera/inventario': () => import('./cajera/inventario/inventario.component').then((m) => m.InventarioComponent),
  'cajera/clientes': () => import('./cajera/clientes/clientes.component').then((m) => m.ClientesComponent),
  'cajera/estadisticas': () => import('./cajera/estadisticas/estadisticas.component').then((m) => m.EstadisticasComponent),
  'cajera/corte-de-caja': () => import('./cajera/corte/corte.component').then((m) => m.CorteComponent),
  // Jefe de técnicos
  'jefe/inicio': () => import('./jefe/inicio-jefe/inicio-jefe.component').then((m) => m.InicioJefeComponent),
  'jefe/tablero-de-ordenes': () => import('./jefe/tablero/tablero.component').then((m) => m.TableroComponent),
  'jefe/por-cotizar': () => import('./jefe/por-cotizar/por-cotizar.component').then((m) => m.PorCotizarComponent),
  'jefe/garantias': () => import('./jefe/garantias/garantias.component').then((m) => m.GarantiasComponent),
  'jefe/refacciones': () => import('./jefe/refacciones/refacciones.component').then((m) => m.RefaccionesComponent),
  'jefe/inventario': () => import('./jefe/inventario-taller/inventario-taller.component').then((m) => m.InventarioTallerComponent),
  'jefe/tecnicos': () => import('./jefe/tecnicos/tecnicos.component').then((m) => m.TecnicosComponent),
  'jefe/equipos-terminados': () => import('./jefe/terminados/terminados.component').then((m) => m.TerminadosComponent),
  'jefe/configuracion': () => import('./jefe/configuracion/configuracion.component').then((m) => m.ConfiguracionComponent),
  'jefe/mensajes': () => import('./jefe/mensajes/mensajes.component').then((m) => m.MensajesComponent),
  // Técnico
  'tecnico/inicio': () => import('./tecnico/inicio-tecnico/inicio-tecnico.component').then((m) => m.InicioTecnicoComponent),
  'tecnico/equipos-asignados': () => import('./tecnico/equipos-asignados/equipos-asignados.component').then((m) => m.EquiposAsignadosComponent),
  'tecnico/banco-de-trabajo': () => import('./tecnico/banco/banco.component').then((m) => m.BancoComponent),
  'tecnico/garantias': () => import('./tecnico/garantias/garantias-tecnico.component').then((m) => m.GarantiasTecnicoComponent),
  'tecnico/refacciones': () => import('./tecnico/refacciones/refacciones-tecnico.component').then((m) => m.RefaccionesTecnicoComponent),
  'tecnico/mi-historial': () => import('./tecnico/historial/historial-tecnico.component').then((m) => m.HistorialTecnicoComponent),
};

/** C1.6 Mi perfil (también A.6 Cambiar contraseña): la misma pantalla en todos los roles. */
const PERFIL = () => import('./sistema/perfil/perfil.component').then((m) => m.PerfilComponent);
const DE_TODOS: Record<string, () => Promise<Type<unknown>>> = { perfil: PERFIL, 'cambiar-contrasena': PERFIL };

/** Rutas de un rol a partir de su menú: /cajera/punto-de-venta, /jefe/mensajes, … */
function rutasDeRol(rol: Rol): Route {
  const { prefijo, grupos } = NAVEGACION[rol];
  const pantallas = [
    ...grupos.flatMap((grupo) => grupo.destinos),
    { etiqueta: 'Mi perfil', ruta: 'perfil', figma: 'C1.6' },
    { etiqueta: 'Cambiar contraseña', ruta: 'cambiar-contrasena', figma: 'C1.6 / A.6' },
  ];
  return {
    path: prefijo,
    component: SistemaLayoutComponent,
    canActivate: [soloRol(rol)],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      ...pantallas.map((p) => ({
        path: p.ruta,
        loadComponent: PANTALLAS[`${prefijo}/${p.ruta}`] ?? DE_TODOS[p.ruta] ?? (() => Promise.resolve(PaginaPendienteComponent)),
        title: `${p.etiqueta} · SHURI`,
        data: { titulo: p.etiqueta, figma: p.figma },
      })),
    ],
  };
}

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
  { path: 'inicio', canActivate: [aSuInicio], children: [] },
  rutasDeRol('administrador'),
  rutasDeRol('cajera'),
  rutasDeRol('jefe-tecnicos'),
  rutasDeRol('tecnico'),
  { path: '**', redirectTo: 'iniciar-sesion' },
];
