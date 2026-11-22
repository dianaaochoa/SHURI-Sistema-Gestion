import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Rol } from '../../../acceso/auth.service';
import { NIVELES_DESCUENTO, ROLES, textoDescuento } from '../../permisos.service';
import { PermisoApi, RolPermisos, UsuariosService } from '../../usuarios.service';

/** Nombre de cada módulo de la API para los encabezados de la matriz. */
const MODULOS: Record<string, string> = {
  cash: 'Caja y punto de venta',
  workshop: 'Taller',
  inventory: 'Inventario y refacciones',
  catalog: 'Catálogo y precios',
  purchasing: 'Compras a proveedores',
  customers: 'Clientes',
  reports: 'Reportes',
  invoicing: 'Facturación',
  admin: 'Administración',
};

/**
 * AD7.3 · Permisos por rol con los permisos reales de la API.
 * Los cambios se guardan juntos con "Guardar cambios" (PUT /roles/{id}).
 */
@Component({
  selector: 'app-permisos-rol',
  standalone: true,
  templateUrl: './permisos-rol.component.html',
  styleUrls: ['../../reportes.css', './permisos-rol.component.css'],
})
export class PermisosRolComponent implements OnInit {
  private readonly usuarios = inject(UsuariosService);

  readonly volver = output<void>();
  readonly guardado = output<string>();

  protected readonly roles = ROLES;
  /** Encabezados cortos para el celular. */
  protected readonly cortos: Record<Rol, string> = { cajera: 'Caja', tecnico: 'Técnico', 'jefe-tecnicos': 'Jefe', administrador: 'Admin' };
  protected readonly niveles = NIVELES_DESCUENTO;
  protected readonly textoDescuento = textoDescuento;

  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly original = signal<RolPermisos[]>([]);
  private readonly catalogo = signal<PermisoApi[]>([]);
  /** Permisos marcados de cada rol (borrador). */
  protected readonly borrador = signal<Record<Rol, string[]>>({ cajera: [], tecnico: [], 'jefe-tecnicos': [], administrador: [] });
  protected readonly descuento = signal(10);

  /** Filas agrupadas por módulo. */
  protected readonly grupos = computed(() => {
    const porModulo = new Map<string, PermisoApi[]>();
    for (const p of this.catalogo()) porModulo.set(p.module, [...(porModulo.get(p.module) ?? []), p]);
    return [...porModulo.entries()].map(([modulo, permisos]) => ({ modulo, nombre: MODULOS[modulo] ?? modulo, permisos }));
  });

  ngOnInit(): void {
    this.usuarios.roles().subscribe({
      next: ({ roles, permisos }) => {
        this.original.set(roles);
        this.catalogo.set(permisos);
        this.borrador.set(this.desde(roles));
        this.descuento.set(roles.find((r) => r.rol === 'cajera')?.limiteDescuento ?? 10);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar los permisos. Revisa tu conexión e inténtalo de nuevo.');
        this.cargando.set(false);
      },
    });
  }

  private desde(roles: RolPermisos[]): Record<Rol, string[]> {
    const m = { cajera: [], tecnico: [], 'jefe-tecnicos': [], administrador: [] } as Record<Rol, string[]>;
    for (const r of roles) m[r.rol] = [...r.codigos];
    return m;
  }

  /** Roles cuyo borrador difiere de lo guardado. */
  private readonly rolesCambiados = computed(() =>
    this.original().filter((r) => {
      const ahora = this.borrador()[r.rol];
      const cambiaDescuento = r.rol === 'cajera' && ahora.includes('pos.discount') && this.descuento() !== (r.limiteDescuento ?? null);
      return cambiaDescuento || ahora.length !== r.codigos.length || ahora.some((c) => !r.codigos.includes(c));
    }),
  );

  protected readonly cambios = computed(() =>
    this.original().reduce((n, r) => {
      const ahora = this.borrador()[r.rol];
      const diferencia = ahora.filter((c) => !r.codigos.includes(c)).length + r.codigos.filter((c) => !ahora.includes(c)).length;
      const descuento = r.rol === 'cajera' && ahora.includes('pos.discount') && this.descuento() !== r.limiteDescuento ? 1 : 0;
      return n + diferencia + descuento;
    }, 0),
  );

  protected marcado(codigo: string, rol: Rol): boolean {
    return this.borrador()[rol].includes(codigo);
  }

  /** El administrador no puede quitarse la administración de usuarios. */
  protected fijo(codigo: string, rol: Rol): boolean {
    return codigo === 'users.manage' && rol === 'administrador';
  }

  protected marcar(codigo: string, rol: Rol, valor: boolean): void {
    this.borrador.update((m) => ({
      ...m,
      [rol]: valor ? [...new Set([...m[rol], codigo])] : m[rol].filter((c) => c !== codigo),
    }));
  }

  protected guardar(): void {
    const cambiados = this.rolesCambiados();
    if (!cambiados.length || this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);

    forkJoin(
      cambiados.map((r) => this.usuarios.guardarRol(r, this.borrador()[r.rol], r.rol === 'cajera' && this.borrador()[r.rol].includes('pos.discount') ? this.descuento() : null)),
    ).subscribe((resultados) => {
      this.guardando.set(false);
      const fallo = resultados.find((r) => !r.ok);
      if (fallo) {
        this.error.set(fallo.mensaje);
        return;
      }
      const n = this.cambios();
      this.guardado.emit(`Permisos guardados (${n} ${n === 1 ? 'cambio' : 'cambios'}). Aplican desde la siguiente acción de cada usuario.`);
    });
  }
}
