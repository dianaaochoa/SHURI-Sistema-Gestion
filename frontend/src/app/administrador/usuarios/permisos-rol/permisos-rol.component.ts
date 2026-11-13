import { Component, computed, inject, output, signal } from '@angular/core';
import { Rol } from '../../../acceso/auth.service';
import { ClavePermiso, MatrizPermisos, NIVELES_DESCUENTO, PERMISOS, PermisosService, ROLES, textoDescuento } from '../../permisos.service';

/** AD7.3 · Permisos por rol. Los cambios se guardan juntos con "Guardar cambios". */
@Component({
  selector: 'app-permisos-rol',
  standalone: true,
  templateUrl: './permisos-rol.component.html',
  styleUrls: ['../../reportes.css', './permisos-rol.component.css'],
})
export class PermisosRolComponent {
  private readonly servicio = inject(PermisosService);

  readonly volver = output<void>();
  readonly guardado = output<string>();

  protected readonly permisos = PERMISOS;
  protected readonly roles = ROLES;
  /** Encabezados cortos para el celular. */
  protected readonly cortos: Record<Rol, string> = { cajera: 'Caja', tecnico: 'Técnico', 'jefe-tecnicos': 'Jefe', administrador: 'Admin' };
  protected readonly niveles = NIVELES_DESCUENTO;
  protected readonly textoDescuento = textoDescuento;

  protected readonly borrador = signal<MatrizPermisos>(structuredClone(this.servicio.matriz()));
  protected readonly descuento = signal(this.servicio.descuentoCajera());

  protected readonly cambios = computed(() => {
    const antes = this.servicio.matriz();
    const ahora = this.borrador();
    let n = PERMISOS.reduce((s, p) => s + ROLES.filter((r) => antes[p.clave][r.rol] !== ahora[p.clave][r.rol]).length, 0);
    if (this.descuento() !== this.servicio.descuentoCajera()) n++;
    return n;
  });

  /** El administrador no puede quitarse la administración de usuarios. */
  protected fijo(clave: ClavePermiso, rol: Rol): boolean {
    return clave === 'usuarios' && rol === 'administrador';
  }

  protected marcar(clave: ClavePermiso, rol: Rol, valor: boolean): void {
    this.borrador.update((m) => ({ ...m, [clave]: { ...m[clave], [rol]: valor } }));
  }

  protected guardar(): void {
    const n = this.cambios();
    this.servicio.guardar(this.borrador(), this.descuento());
    this.guardado.emit(`Permisos guardados (${n} ${n === 1 ? 'cambio' : 'cambios'}). Aplican la próxima vez que entren.`);
  }
}
