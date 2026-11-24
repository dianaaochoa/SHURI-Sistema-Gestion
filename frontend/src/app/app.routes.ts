import { Type, inject } from '@angular/core';
import { CanActivateFn, Route, Router, Routes } from '@angular/router';
import { AccesoLayoutComponent } from './acceso/acceso-layout/acceso-layout.component';
import { AuthService, Rol } from './acceso/auth.service';
import { CrearContrasenaComponent } from './acceso/crear-contrasena/crear-contrasena.component';
import { IniciarSesionComponent } from './acceso/iniciar-sesion/iniciar-sesion.component';
import { OlvideContrasenaComponent } from './acceso/olvide-contrasena/olvide-contrasena.component';
import { NAVEGACION, rutaInicio } from './sistema/navegacion';
import { ClavePermiso, PermisosService } from './administrador/permisos.service';
import { PaginaPendienteComponent } from './sistema/pagina-pendiente/pagina-pendiente.component';
import { SistemaLayoutComponent } from './sistema/sistema-layout/sistema-layout.component';
import { PortalSesion } from './portal/portal-sesion';

/** A.5 solo tiene sentido si se entró con contraseña temporal. */
const conContrasenaTemporal: CanActivateFn = () =>
  inject(AuthService).sesion()?.requiereCambioContrasena ? true : inject(Router).parseUrl('/iniciar-sesion');

/** Un solo login para el personal: cada rol entra a su propio inicio (nota de Figma A.1/A.5). */
const aSuInicio: CanActivateFn = () => {
  const sesion = inject(AuthService).sesion();
  const router = inject(Router);
  if (!sesion) return router.parseUrl('/iniciar-sesion');
  if (sesion.requiereCambioContrasena) return router.parseUrl('/crear-contrasena');
  return router.parseUrl(sesion.requierePregunta ? '/pregunta-seguridad' : rutaInicio(sesion.rol));
};

/** Elegir pregunta: solo si la sesión aún no la tiene. */
const sinPregunta: CanActivateFn = () => (inject(AuthService).sesion()?.requierePregunta ? true : inject(Router).parseUrl('/inicio'));

/** Portal del cliente (P1): sesión aparte de la del personal. */
const clienteDentro: CanActivateFn = () => {
  const s = inject(PortalSesion).sesion();
  const router = inject(Router);
  if (!s) return router.parseUrl('/portal');
  return s.temporal ? router.parseUrl('/portal/crear-contrasena') : true;
};
const clienteConTemporal: CanActivateFn = () => (inject(PortalSesion).sesion()?.temporal ? true : inject(Router).parseUrl('/portal'));
const clienteFuera: CanActivateFn = () => {
  const s = inject(PortalSesion).sesion();
  return s ? inject(Router).parseUrl(s.temporal ? '/portal/crear-contrasena' : '/portal/mis-equipos') : true;
};

/** Solo entra el rol dueño de la sección; los demás vuelven a su inicio. */
/** AD7.3 · Sin el permiso, la pantalla regresa al inicio del rol. */
const conPermiso =
  (clave: ClavePermiso, inicio: string): CanActivateFn =>
  () =>
    inject(PermisosService).puede(clave) || inject(Router).parseUrl(inicio);

const soloRol =
  (rol: Rol): CanActivateFn =>
  () => {
    const sesion = inject(AuthService).sesion();
    if (sesion?.rol === rol && !sesion.requiereCambioContrasena && !sesion.requierePregunta) return true;
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
  // Administrador
  'administrador/inicio': () => import('./administrador/inicio-admin/inicio-admin.component').then((m) => m.InicioAdminComponent),
  'administrador/ventas-y-utilidad': () => import('./administrador/ventas-utilidad/ventas-utilidad.component').then((m) => m.VentasUtilidadComponent),
  'administrador/taller': () => import('./administrador/taller-reporte/taller-reporte.component').then((m) => m.TallerReporteComponent),
  'administrador/cortes-de-caja': () => import('./administrador/cortes/cortes-admin.component').then((m) => m.CortesAdminComponent),
  'administrador/catalogo-y-precios': () => import('./administrador/catalogo/catalogo-admin.component').then((m) => m.CatalogoAdminComponent),
  'administrador/proveedores': () => import('./administrador/proveedores/proveedores-admin.component').then((m) => m.ProveedoresAdminComponent),
  'administrador/facturacion': () => import('./administrador/facturacion/facturacion-admin.component').then((m) => m.FacturacionAdminComponent),
  'administrador/usuarios-y-permisos': () => import('./administrador/usuarios/usuarios-admin.component').then((m) => m.UsuariosAdminComponent),
  'administrador/bitacora': () => import('./administrador/bitacora/bitacora-admin.component').then((m) => m.BitacoraAdminComponent),
  'administrador/configuracion': () => import('./administrador/configuracion/configuracion-admin.component').then((m) => m.ConfiguracionAdminComponent),
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
const NOTIFICACIONES = () => import('./sistema/notificaciones/notificaciones.component').then((m) => m.NotificacionesComponent);
const DE_TODOS: Record<string, () => Promise<Type<unknown>>> = { perfil: PERFIL, 'cambiar-contrasena': PERFIL, notificaciones: NOTIFICACIONES };

/** Rutas de un rol a partir de su menú: /cajera/punto-de-venta, /jefe/mensajes, … */
function rutasDeRol(rol: Rol): Route {
  const { prefijo, grupos } = NAVEGACION[rol];
  const pantallas: { etiqueta: string; ruta: string; figma: string; permiso?: ClavePermiso }[] = [
    ...grupos.flatMap((grupo) => grupo.destinos),
    { etiqueta: 'Mi perfil', ruta: 'perfil', figma: 'C1.6' },
    { etiqueta: 'Cambiar contraseña', ruta: 'cambiar-contrasena', figma: 'C1.6 / A.6' },
    { etiqueta: 'Notificaciones', ruta: 'notificaciones', figma: 'C1.4 · ver todas' },
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
        canActivate: p.permiso ? [conPermiso(p.permiso, `/${prefijo}/inicio`)] : [],
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
      {
        path: 'pregunta-seguridad',
        canActivate: [sinPregunta],
        loadComponent: () => import('./acceso/elegir-pregunta/elegir-pregunta.component').then((m) => m.ElegirPreguntaComponent),
        title: 'Pregunta de seguridad · SHURI',
      },
    ],
  },
  { path: 'inicio', canActivate: [aSuInicio], children: [] },
  rutasDeRol('administrador'),
  rutasDeRol('cajera'),
  rutasDeRol('jefe-tecnicos'),
  rutasDeRol('tecnico'),
  {
    path: 'portal',
    children: [
      { path: '', pathMatch: 'full', canActivate: [clienteFuera], loadComponent: () => import('./portal/acceso/acceso-portal.component').then((m) => m.AccesoPortalComponent), title: 'Rastrea tu equipo · SHURI' },
      { path: 'olvide-contrasena', loadComponent: () => import('./portal/olvide/olvide-portal.component').then((m) => m.OlvidePortalComponent), title: '¿Olvidaste tu contraseña? · SHURI' },
      { path: 'crear-contrasena', canActivate: [clienteConTemporal], loadComponent: () => import('./portal/crear/crear-portal.component').then((m) => m.CrearPortalComponent), title: 'Crea tu contraseña · SHURI' },
      { path: 'pregunta-seguridad', canActivate: [clienteDentro], loadComponent: () => import('./portal/pregunta/pregunta-portal.component').then((m) => m.PreguntaPortalComponent), title: 'Pregunta de seguridad · SHURI' },
      { path: 'mis-equipos', canActivate: [clienteDentro], loadComponent: () => import('./portal/mis-equipos/mis-equipos.component').then((m) => m.MisEquiposComponent), title: 'Mis equipos · SHURI' },
      { path: 'equipo/:folio', canActivate: [clienteDentro], loadComponent: () => import('./portal/seguimiento/seguimiento.component').then((m) => m.SeguimientoComponent), title: 'Seguimiento · SHURI' },
      { path: 'chat/:folio', canActivate: [clienteDentro], loadComponent: () => import('./portal/chat/chat-portal.component').then((m) => m.ChatPortalComponent), title: 'Chat con el taller · SHURI' },
      // P4.2 · también se entra sin sesión (shuri.mx/factura, impreso en el ticket).
      { path: 'factura', loadComponent: () => import('./portal/factura/factura-portal.component').then((m) => m.FacturaPortalComponent), title: 'Solicita tu factura · SHURI' },
      { path: '**', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: 'iniciar-sesion' },
];
