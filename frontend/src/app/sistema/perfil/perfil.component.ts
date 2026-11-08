import { AfterViewInit, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../acceso/auth.service';
import { REQUISITOS } from '../../acceso/contrasena';
import { formatearFechaCorta, formatearHora } from '../../compartido/formato';
import { CajaService } from '../../cajera/caja.service';

/** Los primeros tres son obligatorios (aviso de Figma C1.6); el símbolo sube la seguridad a "Segura". */
const OBLIGATORIOS = 3;
const NIVELES = [
  { texto: 'Muy débil', color: 'var(--color-peligro)' },
  { texto: 'Débil', color: 'var(--color-peligro)' },
  { texto: 'Media', color: 'var(--color-advertencia)' },
  { texto: 'Buena', color: 'var(--color-primario)' },
  { texto: 'Segura', color: 'var(--color-exito)' },
];

/** C1.6 · Mi perfil y cambiar contraseña (sirve a todos los roles; también es A.6). */
@Component({
  selector: 'app-perfil',
  standalone: true,
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
})
export class PerfilComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly caja = inject(CajaService);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Desde "Cambiar contraseña" del menú de usuario se enfoca el formulario. */
  private readonly aCambiar = inject(Router).url.endsWith('/cambiar-contrasena');

  protected readonly sesion = this.auth.sesion;
  protected readonly perfil = this.auth.perfil();
  protected readonly iniciales = computed(() =>
    (this.sesion()?.nombre ?? '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase(),
  );
  /** "Cajera · Caja 01 · matutino" */
  protected readonly puesto = computed(() => {
    const turno = this.caja.turno();
    const puesto = this.sesion()?.puesto ?? '';
    return this.sesion()?.rol === 'cajera' && turno ? `${puesto} · ${turno.turno.toLowerCase()}` : puesto;
  });
  /** "Hoy 08:55 · este equipo" */
  protected readonly ultimoAcceso = computed(() => {
    const desde = this.sesion()?.desde;
    if (!desde) return 'Este equipo';
    const f = new Date(desde);
    const dia = f.toDateString() === new Date().toDateString() ? 'Hoy' : formatearFechaCorta(f);
    return `${dia} ${formatearHora(f)} · este equipo`;
  });

  // ---------- Cambiar contraseña ----------
  protected readonly actual = signal('');
  protected readonly nueva = signal('');
  protected readonly repetida = signal('');
  protected readonly intentado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorActual = signal<string | null>(null);
  protected readonly listo = signal(false);

  protected readonly requisitos = computed(() => REQUISITOS.map((r) => ({ texto: r.texto, cumple: r.cumple(this.nueva()) })));
  protected readonly puntaje = computed(() => this.requisitos().filter((r) => r.cumple).length);
  protected readonly nivel = computed(() => NIVELES[this.puntaje()]);
  protected readonly barras = [1, 2, 3, 4];

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    if (!this.actual()) e['actual'] = 'Escribe tu contraseña actual.';
    if (!this.nueva()) e['nueva'] = 'Escribe la nueva contraseña.';
    else if (this.requisitos().slice(0, OBLIGATORIOS).some((r) => !r.cumple)) e['nueva'] = 'Aún no cumple los requisitos.';
    else if (this.nueva() === this.actual()) e['nueva'] = 'Debe ser distinta de la actual.';
    if (!this.repetida()) e['repetida'] = 'Repite la nueva contraseña.';
    else if (this.repetida() !== this.nueva()) e['repetida'] = 'No coincide con la nueva contraseña.';
    return e;
  });

  protected error(campo: string): string | null {
    if (campo === 'actual' && this.errorActual()) return this.errorActual();
    return this.intentado() ? (this.errores()[campo] ?? null) : null;
  }

  ngAfterViewInit(): void {
    if (this.aCambiar) setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#perfil-actual')?.focus());
  }

  protected escribir(campo: 'actual' | 'nueva' | 'repetida', valor: string): void {
    this[campo].set(valor);
    this.listo.set(false);
    if (campo === 'actual') this.errorActual.set(null);
  }

  protected guardar(): void {
    this.intentado.set(true);
    if (Object.keys(this.errores()).length || this.guardando()) return;
    this.guardando.set(true);
    this.auth.cambiarContrasena(this.actual(), this.nueva()).subscribe((r) => {
      this.guardando.set(false);
      if (!r.ok) {
        this.errorActual.set(r.mensaje ?? 'No se pudo cambiar la contraseña.');
        return;
      }
      this.actual.set('');
      this.nueva.set('');
      this.repetida.set('');
      this.intentado.set(false);
      this.listo.set(true);
    });
  }
}
