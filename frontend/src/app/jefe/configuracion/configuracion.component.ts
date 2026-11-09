import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../acceso/auth.service';
import { formatearDinero } from '../../compartido/formato';
import { DESPUES_RESGUARDO, DespuesResguardo, ReglasTaller } from '../../compartido/reglas-taller';
import { MensajesService } from '../mensajes/mensajes.service';
import { ConfiguracionTallerService, NivelManoObra } from './configuracion.service';

/** J9 · Configuración del taller: tabulador de mano de obra, tiempos, garantía y bodega. */
@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.css',
})
export class ConfiguracionComponent {
  private readonly servicio = inject(ConfiguracionTallerService);
  private readonly jefe = inject(AuthService).sesion()?.nombre ?? '';
  /** Respuestas rápidas del chat (J11.2): se guardan al escribir. */
  protected readonly mensajes = inject(MensajesService);

  protected readonly dinero = formatearDinero;
  protected readonly opcionesSla = [12, 24, 48, 72];
  protected readonly opcionesVigencia = [3, 7, 15, 30];
  protected readonly opcionesGarantia = [30, 60, 90];
  protected readonly opcionesSinCobro = [15, 30, 45, 60];
  protected readonly opcionesDespues = Object.entries(DESPUES_RESGUARDO) as [DespuesResguardo, string][];

  /** Borrador: se edita aquí y se aplica con "Guardar cambios". */
  protected readonly niveles = signal<NivelManoObra[]>(this.servicio.niveles().map((n) => ({ ...n })));
  protected readonly reglas = signal<ReglasTaller>({ ...this.servicio.reglas() });
  protected readonly editando = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly cambios = this.servicio.cambios;

  protected readonly pendientes = computed(
    () => JSON.stringify(this.niveles()) !== JSON.stringify(this.servicio.niveles()) || JSON.stringify(this.reglas()) !== JSON.stringify(this.servicio.reglas()),
  );
  protected readonly invalido = computed(() => this.niveles().some((n) => !n.nivel.trim() || n.precio <= 0) || this.reglas().almacenajeDia < 0);

  protected regla<K extends keyof ReglasTaller>(clave: K, valor: ReglasTaller[K]): void {
    this.reglas.update((r) => ({ ...r, [clave]: valor }));
    this.aviso.set(null);
  }

  protected cambiarNivel(id: string, campo: 'nivel' | 'tiempo' | 'ejemplos' | 'precio', valor: string): void {
    this.niveles.update((lista) => lista.map((n) => (n.id !== id ? n : { ...n, [campo]: campo === 'precio' ? Math.max(0, Number(valor) || 0) : valor })));
    this.aviso.set(null);
  }

  protected agregarNivel(): void {
    const id = `nivel-${Date.now()}`;
    this.niveles.update((lista) => [...lista, { id, nivel: '', tiempo: '', ejemplos: '', precio: 0 }]);
    this.editando.set(id);
  }

  /** Los niveles base los usa el cotizador; solo se pueden quitar los que agregó el jefe. */
  protected quitable(n: NivelManoObra): boolean {
    return n.id.startsWith('nivel-');
  }

  protected quitarNivel(id: string): void {
    this.niveles.update((lista) => lista.filter((n) => n.id !== id));
    this.editando.set(null);
  }

  protected descartar(): void {
    this.niveles.set(this.servicio.niveles().map((n) => ({ ...n })));
    this.reglas.set({ ...this.servicio.reglas() });
    this.editando.set(null);
    this.aviso.set(null);
  }

  protected guardar(): void {
    if (!this.pendientes() || this.invalido()) return;
    const cambios = this.servicio.guardar(this.niveles(), this.reglas(), this.jefe);
    this.editando.set(null);
    this.niveles.set(this.servicio.niveles().map((n) => ({ ...n })));
    this.reglas.set({ ...this.servicio.reglas() });
    this.aviso.set(`${cambios.length} ${cambios.length === 1 ? 'cambio guardado' : 'cambios guardados'}: el cotizador, el tablero y la política de bodega ya usan los valores nuevos.`);
  }

  protected hora(iso: string): string {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', '');
  }
}
