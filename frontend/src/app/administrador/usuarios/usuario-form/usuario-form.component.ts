import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService, CuentaUsuario, Rol, SesionActiva, Turno } from '../../../acceso/auth.service';
import { formatearFechaCorta, formatearHora } from '../../../compartido/formato';
import { NIVELES_DESCUENTO, PermisosService, ROLES } from '../../permisos.service';
import { DatosUsuario, ResultadoUsuario, UsuariosService } from '../../usuarios.service';
import { sugerirUsuario } from '../temporal';

const USUARIO = /^[a-z0-9._-]{3,40}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORARIOS = ['9:00–18:00', '10:00–19:00', '8:00–17:00'];

/**
 * AD7.2 · Nuevo usuario y Editar usuario, conectados a la API.
 * El alta genera en el servidor una contraseña temporal que llega al correo del empleado.
 * Al editar: desbloquear, dar de baja y control de dispositivos (sus sesiones abiertas).
 */
@Component({
  selector: 'app-usuario-form',
  standalone: true,
  templateUrl: './usuario-form.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: [
    `.modal { max-width: 600px; }
    .solo-lectura { background: var(--color-fondo); }
    .solo-lectura input { font-family: monospace; letter-spacing: 1px; color: var(--color-texto-secundario); }
    .roles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .pie-izq { display: flex; gap: 8px; margin-right: auto; }
    .sesiones { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .sesion { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid var(--color-borde); border-radius: 8px; font-size: 12px; color: var(--color-texto-tenue); }
    .sesion strong { display: block; font-size: 13px; color: var(--color-marino); }
    .sesiones__titulo { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .enlace-accion { padding: 0; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--color-primario); cursor: pointer; }
    .enlace-accion:disabled { opacity: 0.5; cursor: default; }
    .campo__ayuda { font-size: 12px; color: var(--color-texto-tenue); }
    @media (max-width: 520px) { .roles { grid-template-columns: 1fr; } }`,
  ],
})
export class UsuarioFormComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly permisos = inject(PermisosService);
  private readonly usuarios = inject(UsuariosService);
  protected readonly cajas = this.usuarios.cajas;

  /** null = nuevo usuario. */
  readonly cuenta = input<CuentaUsuario | null>(null);
  readonly cerrar = output<void>();
  readonly guardado = output<string>();
  /** Editar › "Asignar contraseña temporal". */
  readonly temporal = output<string>();

  protected readonly roles = ROLES;
  protected readonly niveles = NIVELES_DESCUENTO;
  protected readonly horarios = HORARIOS;
  protected readonly turnos: Turno[] = ['Matutino', 'Vespertino'];

  protected readonly nombre = signal('');
  protected readonly usuario = signal('');
  private readonly usuarioTocado = signal(false);
  protected readonly telefono = signal('');
  protected readonly correo = signal('');
  protected readonly rol = signal<Rol>('cajera');
  protected readonly cajaId = signal<number | null>(null);
  protected readonly turno = signal<Turno>('Matutino');
  protected readonly horario = signal(HORARIOS[0]);
  protected readonly descuento = signal(this.permisos.descuentoCajera());
  protected readonly intentado = signal(false);
  protected readonly guardando = signal(false);
  /** Errores de la API por campo (422) y el mensaje general. */
  private readonly erroresApi = signal<Record<string, string>>({});
  protected readonly errorGeneral = signal<string | null>(null);

  protected readonly esNuevo = computed(() => !this.cuenta());
  /** No puede quitarse a sí mismo el rol de administrador ni desactivarse. */
  protected readonly esYo = computed(() => this.cuenta()?.usuario === this.auth.sesion()?.usuario);

  ngOnInit(): void {
    const c = this.cuenta();
    if (!c) {
      this.cajaId.set(this.cajas()[0]?.id ?? null);
      return;
    }
    this.nombre.set(c.nombre);
    this.usuario.set(c.usuario);
    this.telefono.set(c.telefono);
    this.correo.set(c.correo);
    this.rol.set(c.rol);
    this.cajaId.set(c.cajaId ?? this.cajas()[0]?.id ?? null);
    if (c.turno) this.turno.set(c.turno);
    if (c.horario) this.horario.set(c.horario);
    if (c.descuentoMaximo !== undefined) this.descuento.set(c.descuentoMaximo);
    if (c.id) this.cargarSesiones(c.id);
  }

  protected escribirNombre(valor: string): void {
    this.nombre.set(valor);
    if (this.esNuevo() && !this.usuarioTocado()) this.usuario.set(sugerirUsuario(valor));
  }

  protected escribirUsuario(valor: string): void {
    this.usuarioTocado.set(true);
    this.usuario.set(valor.trim().toLowerCase());
  }

  /** Errores del formulario y, encima, los que respondió la API. */
  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (this.nombre().trim().split(/\s+/).filter(Boolean).length < 2) e['nombre'] = 'Escribe nombre y apellido.';
    if (this.esNuevo()) {
      if (!USUARIO.test(this.usuario())) e['usuario'] = 'De 3 a 40 minúsculas, números, punto, guion o guion bajo.';
      else if (this.usuarios.existe(this.usuario())) e['usuario'] = 'Ese usuario ya existe.';
    }
    // El correo es obligatorio: ahí llega la contraseña temporal y el código de acceso (MFA)
    if (!CORREO.test(this.correo().trim())) e['correo'] = 'Escribe un correo válido: ahí le llegará su contraseña temporal.';
    const tel = this.telefono().replace(/\D/g, '');
    if (tel && tel.length !== 10) e['telefono'] = 'El teléfono debe tener 10 dígitos.';
    const api = this.erroresApi();
    return {
      ...e,
      ...(api['name'] ? { nombre: api['name'] } : {}),
      ...(api['username'] ? { usuario: api['username'] } : {}),
      ...(api['email'] ? { correo: api['email'] } : {}),
      ...(api['phone'] ? { telefono: api['phone'] } : {}),
      ...(api['role_id'] ? { rol: api['role_id'] } : {}),
      ...(api['max_discount_pct'] ? { descuento: api['max_discount_pct'] } : {}),
    };
  });

  protected guardar(): void {
    this.intentado.set(true);
    this.erroresApi.set({});
    this.errorGeneral.set(null);
    if (Object.keys(this.errores()).length || this.guardando()) return;

    const rol = this.rol();
    const anterior = this.cuenta();
    const datos: DatosUsuario = {
      nombre: this.nombre().trim().replace(/\s+/g, ' '),
      usuario: this.usuario(),
      correo: this.correo().trim(),
      telefono: this.telefono().trim(),
      rol,
      cambiaRol: !anterior || anterior.rol !== rol,
      cajaId: rol === 'cajera' ? this.cajaId() : null,
      turno: rol === 'cajera' ? this.turno() : undefined,
      horario: rol === 'tecnico' || rol === 'jefe-tecnicos' ? this.horario() : undefined,
      descuentoMaximo: rol === 'cajera' ? this.descuento() : undefined,
    };

    this.guardando.set(true);
    const peticion = anterior?.id ? this.usuarios.editar(anterior.id, datos) : this.usuarios.crear(datos);
    peticion.subscribe((r) => this.alResponder(r, datos));
  }

  private alResponder(r: ResultadoUsuario, datos: DatosUsuario): void {
    this.guardando.set(false);
    if (!r.ok) {
      this.erroresApi.set(r.errores ?? {});
      if (!r.errores || !Object.keys(r.errores).length) this.errorGeneral.set(r.mensaje);
      return;
    }
    if (this.esNuevo()) {
      const correo = r.correoEnviado ? `Le enviamos a ${datos.correo} su contraseña temporal` : 'No se pudo enviar el correo';
      this.guardado.emit(`${datos.nombre} (${datos.usuario}) creado. ${correo}: ${r.temporal}. Al entrar creará la suya.`);
    } else {
      this.guardado.emit(`Cambios de ${datos.nombre} guardados.`);
    }
  }

  protected alternarActivo(): void {
    const c = this.cuenta();
    if (!c?.id || this.esYo() || this.guardando()) return;
    this.guardando.set(true);
    this.usuarios.cambiarActivo(c.id, !c.activo).subscribe((r) => {
      this.guardando.set(false);
      if (!r.ok) {
        this.errorGeneral.set(r.mensaje);
        return;
      }
      this.guardado.emit(c.activo ? `${c.nombre} quedó inactivo: ya no puede entrar y se cerraron sus sesiones.` : `${c.nombre} se reactivó.`);
    });
  }

  protected desbloquear(): void {
    const c = this.cuenta();
    if (!c?.id || this.guardando()) return;
    this.guardando.set(true);
    this.usuarios.desbloquear(c.id).subscribe((r) => {
      this.guardando.set(false);
      if (!r.ok) {
        this.errorGeneral.set(r.mensaje);
        return;
      }
      this.guardado.emit(`${c.nombre} ya puede volver a entrar con su contraseña.`);
    });
  }

  // ---------- Control de dispositivos: sesiones abiertas del empleado ----------
  protected readonly sesiones = signal<SesionActiva[] | null>(null);
  protected readonly cerrandoSesion = signal<number | 'todas' | null>(null);

  private cargarSesiones(id: number): void {
    this.usuarios.sesionesDe(id).subscribe({
      next: (lista) => this.sesiones.set(lista),
      error: () => this.sesiones.set([]),
    });
  }

  protected nombreDispositivo(s: SesionActiva): string {
    return s.dispositivo || [s.navegador, s.sistema].filter(Boolean).join(' · ') || 'Dispositivo desconocido';
  }

  protected cuando(iso: string | null): string {
    if (!iso) return '—';
    const f = new Date(iso);
    return `${f.toDateString() === new Date().toDateString() ? 'Hoy' : formatearFechaCorta(f)} ${formatearHora(f)}`;
  }

  protected cerrarSesion(s: SesionActiva): void {
    const id = this.cuenta()?.id;
    if (!id || this.cerrandoSesion()) return;
    this.cerrandoSesion.set(s.id);
    this.usuarios.cerrarSesion(id, s.id).subscribe((r) => {
      this.cerrandoSesion.set(null);
      if (r.ok) this.sesiones.update((l) => (l ?? []).filter((x) => x.id !== s.id));
      else this.errorGeneral.set(r.mensaje);
    });
  }

  protected cerrarTodas(): void {
    const id = this.cuenta()?.id;
    if (!id || this.cerrandoSesion()) return;
    this.cerrandoSesion.set('todas');
    this.usuarios.cerrarTodas(id).subscribe((r) => {
      this.cerrandoSesion.set(null);
      if (r.ok) this.sesiones.set([]);
      else this.errorGeneral.set(r.mensaje);
    });
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
