import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService, CuentaUsuario, Rol, Turno } from '../../../acceso/auth.service';
import { CajaService } from '../../../cajera/caja.service';
import { NIVELES_DESCUENTO, PermisosService, ROLES } from '../../permisos.service';
import { generarTemporal, sugerirUsuario } from '../temporal';

const USUARIO = /^[a-z0-9.]{3,20}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HORARIOS = ['9:00–18:00', '10:00–19:00', '8:00–17:00'];

/** AD7.2 · Nuevo usuario (con contraseña temporal) y Editar usuario. */
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
    .pie-izq { margin-right: auto; }
    @media (max-width: 520px) { .roles { grid-template-columns: 1fr; } }`,
  ],
})
export class UsuarioFormComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly permisos = inject(PermisosService);
  protected readonly cajas = inject(CajaService).cajas;

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
  protected readonly caja = signal('Caja 01');
  protected readonly turno = signal<Turno>('Matutino');
  protected readonly horario = signal(HORARIOS[0]);
  protected readonly descuento = signal(this.permisos.descuentoCajera());
  protected readonly clave = signal(generarTemporal());
  protected readonly intentado = signal(false);

  protected readonly esNuevo = computed(() => !this.cuenta());
  /** No puede quitarse a sí mismo el rol de administrador ni desactivarse. */
  protected readonly esYo = computed(() => this.cuenta()?.usuario === this.auth.sesion()?.usuario);

  ngOnInit(): void {
    const c = this.cuenta();
    if (!c) return;
    this.nombre.set(c.nombre);
    this.usuario.set(c.usuario);
    this.telefono.set(c.telefono);
    this.correo.set(c.correo);
    this.rol.set(c.rol);
    if (c.caja) this.caja.set(c.caja);
    if (c.turno) this.turno.set(c.turno);
    if (c.horario) this.horario.set(c.horario);
    if (c.descuentoMaximo !== undefined) this.descuento.set(c.descuentoMaximo);
  }

  protected escribirNombre(valor: string): void {
    this.nombre.set(valor);
    if (this.esNuevo() && !this.usuarioTocado()) this.usuario.set(sugerirUsuario(valor));
  }

  protected escribirUsuario(valor: string): void {
    this.usuarioTocado.set(true);
    this.usuario.set(valor.trim().toLowerCase());
  }

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (this.nombre().trim().split(/\s+/).filter(Boolean).length < 2) e['nombre'] = 'Escribe nombre y apellido.';
    if (this.esNuevo()) {
      if (!USUARIO.test(this.usuario())) e['usuario'] = 'De 3 a 20 letras minúsculas, números o punto.';
      else if (this.auth.existe(this.usuario())) e['usuario'] = 'Ese usuario ya existe.';
    }
    if (this.correo().trim() && !CORREO.test(this.correo().trim())) e['correo'] = 'El correo no es válido.';
    return e;
  });

  protected guardar(): void {
    this.intentado.set(true);
    if (Object.keys(this.errores()).length) return;
    const rol = this.rol();
    const etiqueta = ROLES.find((r) => r.rol === rol)!.texto;
    const anterior = this.cuenta();
    const datos = {
      nombre: this.nombre().trim().replace(/\s+/g, ' '),
      rol,
      // Si no cambia el rol se conserva cómo se muestra ("Cajero", "Administradora").
      puesto: anterior && anterior.rol === rol ? anterior.puesto : etiqueta,
      telefono: this.telefono().trim(),
      correo: this.correo().trim(),
      caja: rol === 'cajera' ? this.caja() : undefined,
      turno: rol === 'cajera' ? this.turno() : undefined,
      horario: rol === 'tecnico' || rol === 'jefe-tecnicos' ? this.horario() : undefined,
      descuentoMaximo: rol === 'cajera' ? this.descuento() : undefined,
    };
    if (anterior) {
      this.auth.editarUsuario(anterior.usuario, datos);
      this.guardado.emit(`Cambios de ${datos.nombre} guardados. Aplican la próxima vez que entre.`);
    } else {
      this.auth.crearUsuario({ ...datos, usuario: this.usuario() }, this.clave());
      this.guardado.emit(`${datos.nombre} (${this.usuario()}) creado con la contraseña temporal ${this.clave()}. Entrégasela en persona: al entrar creará la suya.`);
    }
  }

  protected alternarActivo(): void {
    const c = this.cuenta();
    if (!c || this.esYo()) return;
    this.auth.editarUsuario(c.usuario, { activo: !c.activo });
    this.guardado.emit(c.activo ? `${c.nombre} quedó inactivo: ya no puede entrar al sistema.` : `${c.nombre} se reactivó.`);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
