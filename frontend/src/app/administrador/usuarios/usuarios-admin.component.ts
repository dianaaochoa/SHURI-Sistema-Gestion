import { Component, computed, inject, signal } from '@angular/core';
import { AuthService, CuentaUsuario } from '../../acceso/auth.service';
import { CajaService } from '../../cajera/caja.service';
import { AsignarTemporalComponent } from './asignar-temporal/asignar-temporal.component';
import { PermisosRolComponent } from './permisos-rol/permisos-rol.component';
import { UsuarioFormComponent } from './usuario-form/usuario-form.component';

const TONO_ROL: Record<string, string> = { administrador: 'info', 'jefe-tecnicos': 'advertencia', cajera: 'neutro', tecnico: 'neutro' };

/** "Hoy 08:40", "Ayer 21:05", "3 oct" o "Nunca". */
function cuando(iso?: string): string {
  if (!iso) return 'Nunca';
  const f = new Date(iso);
  const hoy = new Date();
  const dias = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime()) / 86_400_000);
  const hora = f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (dias === 0) return `Hoy ${hora}`;
  if (dias === 1) return `Ayer ${hora}`;
  return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

/** AD7.1 · Usuarios y permisos (AD7.2 nuevo/editar, AD7.3 permisos por rol, AD7.4 contraseña temporal). */
@Component({
  selector: 'app-usuarios-admin',
  standalone: true,
  imports: [UsuarioFormComponent, AsignarTemporalComponent, PermisosRolComponent],
  templateUrl: './usuarios-admin.component.html',
  styleUrls: ['../reportes.css', './usuarios-admin.component.css'],
})
export class UsuariosAdminComponent {
  protected readonly auth = inject(AuthService);
  private readonly caja = inject(CajaService);

  protected readonly vista = signal<'usuarios' | 'permisos'>('usuarios');
  protected readonly pestana = signal<'activos' | 'inactivos'>('activos');
  /** null = cerrado; '' = nuevo; usuario = editar. */
  protected readonly formulario = signal<string | null>(null);
  protected readonly temporalPara = signal<string | null>(null);
  protected readonly aviso = signal('');

  /** Cajera con su turno abierto; técnicos y jefe que entraron hoy y están en su horario. */
  private enTurno(u: CuentaUsuario): boolean {
    if (!u.activo) return false;
    if (u.rol === 'cajera') {
      const t = this.caja.turno();
      return !!t && t.caja === u.caja && t.turno === u.turno;
    }
    if (!u.horario || !u.ultimoAcceso || new Date(u.ultimoAcceso).toDateString() !== new Date().toDateString()) return false;
    const [desde, hasta] = u.horario.split('–').map((h) => Number(h.split(':')[0]));
    const hora = new Date().getHours();
    return hora >= desde && hora < hasta;
  }

  private readonly bloqueados = computed(() => new Set(this.auth.bloqueados()));

  protected readonly filas = computed(() =>
    this.auth
      .usuarios()
      .filter((u) => (this.pestana() === 'activos' ? u.activo : !u.activo))
      .map((u) => {
        const bloqueado = this.bloqueados().has(u.usuario);
        const estado = !u.activo
          ? { texto: 'Inactivo', tono: 'neutro' }
          : bloqueado
            ? { texto: 'Bloqueado', tono: 'peligro' }
            : u.temporal && !u.ultimoAcceso
              ? { texto: 'Pendiente', tono: 'advertencia' }
              : this.enTurno(u)
                ? { texto: 'En turno', tono: 'exito' }
                : { texto: 'Activo', tono: 'exito' };
        const area =
          u.rol === 'administrador'
            ? 'Todo el negocio'
            : u.rol === 'cajera'
              ? `${u.caja ?? 'Caja 01'} · ${(u.turno ?? 'Matutino').toLowerCase()}`
              : u.rol === 'tecnico'
                ? `Taller · ${u.horario ?? ''}`
                : 'Taller';
        return { u, iniciales: iniciales(u.nombre), tonoRol: TONO_ROL[u.rol], area, acceso: cuando(u.ultimoAcceso), estado };
      }),
  );

  protected readonly conteo = computed(() => {
    const todos = this.auth.usuarios();
    return { activos: todos.filter((u) => u.activo).length, inactivos: todos.filter((u) => !u.activo).length };
  });

  protected readonly indicadores = computed(() => {
    const activos = this.auth.usuarios().filter((u) => u.activo);
    const turno = activos.filter((u) => this.enTurno(u)).map((u) => u.nombre.split(' ')[0]);
    const temporales = activos.filter((u) => u.temporal).length;
    const bloqueados = this.auth.bloqueados().length;
    const de = (rol: string[]) => activos.filter((u) => rol.includes(u.rol)).length;
    const nombres = turno.length > 2 ? `${turno.slice(0, -1).join(', ')} y ${turno.at(-1)}` : turno.join(' y ');
    return [
      { valor: activos.length, tono: '', titulo: 'Usuarios activos', detalle: `${de(['administrador'])} admin · ${de(['cajera'])} caja · ${de(['tecnico', 'jefe-tecnicos'])} taller` },
      { valor: turno.length, tono: 'exito', titulo: 'En turno ahora', detalle: nombres || 'Nadie en turno' },
      { valor: temporales, tono: temporales ? 'advertencia' : '', titulo: 'Contraseña temporal', detalle: 'Debe cambiarla al entrar' },
      { valor: bloqueados, tono: bloqueados ? 'peligro' : '', titulo: 'Bloqueados', detalle: 'Por intentos fallidos' },
    ];
  });

  /** Aviso amarillo: el pedido de contraseña más reciente. */
  protected readonly solicitud = computed(() => {
    const lista = this.auth.solicitudes();
    const s = lista[0];
    const u = s && this.auth.usuarios().find((x) => x.usuario === s.usuario);
    if (!s || !u) return null;
    const f = new Date(s.fecha);
    const cuandoFue = new Date().toDateString() === f.toDateString() ? `hoy ${f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}` : cuando(s.fecha).toLowerCase();
    return { u, detalle: `${u.usuario} · ${u.puesto} · ${cuandoFue} desde “¿Olvidaste tu contraseña?”${lista.length > 1 ? ` · y ${lista.length - 1} más` : ''}` };
  });

  protected readonly editando = computed(() => {
    const id = this.formulario();
    return id ? (this.auth.usuarios().find((u) => u.usuario === id) ?? null) : null;
  });
  protected readonly paraTemporal = computed(() => this.auth.usuarios().find((u) => u.usuario === this.temporalPara()) ?? null);

  protected guardado(texto: string): void {
    this.formulario.set(null);
    this.aviso.set(texto);
  }

  protected pedirTemporal(usuario: string): void {
    this.formulario.set(null);
    this.temporalPara.set(usuario);
  }

  protected asignada(texto: string): void {
    this.temporalPara.set(null);
    this.aviso.set(texto);
  }

  protected permisosGuardados(texto: string): void {
    this.vista.set('usuarios');
    this.aviso.set(texto);
  }
}
