import { AfterViewInit, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, SesionActiva } from '../../acceso/auth.service';
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
  /** Desde el aviso "Configura tu pregunta secreta" se baja a esa sección. */
  private readonly aPregunta = inject(ActivatedRoute).snapshot.fragment === 'pregunta-secreta';

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
    if (this.aPregunta) {
      setTimeout(() => {
        this.elemento.nativeElement.querySelector('#pregunta-secreta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.elemento.nativeElement.querySelector<HTMLSelectElement>('#perfil-pregunta')?.focus({ preventScroll: true });
      });
    }
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

  // ---------- Mis sesiones (multisesión: dispositivos con sesión abierta) ----------
  protected readonly sesiones = signal<SesionActiva[]>([]);
  protected readonly cargandoSesiones = signal(true);
  protected readonly cerrandoSesion = signal<number | 'todas' | null>(null);
  protected readonly avisoSesiones = signal<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  protected readonly otrasSesiones = computed(() => this.sesiones().filter((s) => !s.actual).length);

  constructor() {
    this.cargarSesiones();
  }

  private cargarSesiones(): void {
    this.cargandoSesiones.set(true);
    this.auth.sesionesActivas().subscribe({
      next: (lista) => {
        this.sesiones.set(lista);
        this.cargandoSesiones.set(false);
      },
      error: () => {
        this.cargandoSesiones.set(false);
        this.avisoSesiones.set({ tipo: 'error', texto: 'No se pudieron cargar tus sesiones.' });
      },
    });
  }

  /** "Chrome · Windows" o el nombre que se le dio al dispositivo. */
  protected nombreDispositivo(s: SesionActiva): string {
    return s.dispositivo || [s.navegador, s.sistema].filter(Boolean).join(' · ') || 'Dispositivo desconocido';
  }

  /** "Hoy 09:02", "12 nov 18:40" */
  protected cuando(iso: string | null): string {
    if (!iso) return '—';
    const f = new Date(iso);
    const dia = f.toDateString() === new Date().toDateString() ? 'Hoy' : formatearFechaCorta(f);
    return `${dia} ${formatearHora(f)}`;
  }

  protected cerrarSesionDe(s: SesionActiva): void {
    if (this.cerrandoSesion()) return;
    this.cerrandoSesion.set(s.id);
    this.auth.cerrarSesionRemota(s.id).subscribe((r) => {
      this.cerrandoSesion.set(null);
      this.avisoSesiones.set({ tipo: r.ok ? 'exito' : 'error', texto: r.ok ? `Se cerró la sesión en ${this.nombreDispositivo(s)}.` : r.mensaje });
      if (r.ok) this.sesiones.update((lista) => lista.filter((x) => x.id !== s.id));
    });
  }

  protected cerrarOtras(): void {
    if (this.cerrandoSesion() || !this.otrasSesiones()) return;
    this.cerrandoSesion.set('todas');
    this.auth.cerrarOtrasSesiones().subscribe((r) => {
      this.cerrandoSesion.set(null);
      this.avisoSesiones.set({ tipo: r.ok ? 'exito' : 'error', texto: r.mensaje });
      if (r.ok) this.sesiones.update((lista) => lista.filter((x) => x.actual));
    });
  }

  // ---------- Pregunta secreta (para recuperar la contraseña en línea, A.3) ----------
  protected readonly preguntas = toSignal(this.auth.preguntasSecretas(), { initialValue: [] });
  protected readonly pregunta = signal('');
  protected readonly respuesta = signal('');
  protected readonly contrasenaPregunta = signal('');
  private readonly intentadoPregunta = signal(false);
  protected readonly guardandoPregunta = signal(false);
  private readonly errorApiPregunta = signal<string | null>(null);
  protected readonly preguntaLista = signal(false);

  private readonly erroresPregunta = computed(() => {
    const e: Record<string, string> = {};
    if (!this.pregunta()) e['pregunta'] = 'Elige una pregunta.';
    const largo = this.respuesta().trim().length;
    if (!largo) e['respuesta'] = 'Escribe tu respuesta.';
    else if (largo < 3 || largo > 100) e['respuesta'] = 'La respuesta debe tener entre 3 y 100 caracteres.';
    if (!this.contrasenaPregunta()) e['contrasena'] = 'Escribe tu contraseña actual.';
    return e;
  });

  protected errorDePregunta(campo: 'pregunta' | 'respuesta' | 'contrasena'): string | null {
    if (campo === 'contrasena' && this.errorApiPregunta()) return this.errorApiPregunta();
    return this.intentadoPregunta() ? (this.erroresPregunta()[campo] ?? null) : null;
  }

  protected escribirPregunta(campo: 'pregunta' | 'respuesta' | 'contrasenaPregunta', valor: string): void {
    this[campo].set(valor);
    this.preguntaLista.set(false);
    if (campo === 'contrasenaPregunta') this.errorApiPregunta.set(null);
  }

  protected guardarPregunta(): void {
    this.intentadoPregunta.set(true);
    if (Object.keys(this.erroresPregunta()).length || this.guardandoPregunta()) return;
    this.guardandoPregunta.set(true);
    this.auth.guardarPregunta(this.contrasenaPregunta(), { pregunta: this.pregunta(), respuesta: this.respuesta() }).subscribe((r) => {
      this.guardandoPregunta.set(false);
      if (!r.ok) {
        this.errorApiPregunta.set(r.mensaje ?? 'No se pudo guardar la pregunta.');
        return;
      }
      this.respuesta.set('');
      this.contrasenaPregunta.set('');
      this.intentadoPregunta.set(false);
      this.preguntaLista.set(true);
    });
  }
}
