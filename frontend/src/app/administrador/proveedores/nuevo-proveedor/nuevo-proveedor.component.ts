import { Component, HostListener, computed, inject, output, signal } from '@angular/core';
import { CONDICIONES, Condicion, ProveedoresService } from '../../proveedores.service';

const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** AD5.3 · Alta de proveedor. */
@Component({
  selector: 'app-nuevo-proveedor',
  standalone: true,
  templateUrl: './nuevo-proveedor.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: ['.modal { max-width: 600px; }'],
})
export class NuevoProveedorComponent {
  private readonly servicio = inject(ProveedoresService);

  readonly cerrar = output<void>();
  readonly guardado = output<string>();

  protected readonly condiciones = Object.entries(CONDICIONES) as [Condicion, { texto: string }][];
  protected readonly nombre = signal('');
  protected readonly rfc = signal('');
  protected readonly contacto = signal('');
  protected readonly telefono = signal('');
  protected readonly correo = signal('');
  protected readonly condicion = signal<Condicion>('contado');
  protected readonly limite = signal<number | null>(null);
  protected readonly surte = signal('');
  protected readonly intentado = signal(false);

  protected readonly errores = computed(() => {
    const e: Record<string, string> = {};
    const nombre = this.nombre().trim();
    if (!nombre) e['nombre'] = 'Escribe el nombre comercial.';
    else if (this.servicio.proveedores().some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())) e['nombre'] = 'Ya hay un proveedor con ese nombre.';
    if (this.rfc().trim() && !RFC.test(this.rfc().trim().toUpperCase())) e['rfc'] = 'El RFC debe tener 12 o 13 caracteres (ej. DMO190311AB2).';
    if (!this.telefono().trim()) e['telefono'] = 'Escribe un teléfono o correo para hacer pedidos.';
    if (this.correo().trim() && !CORREO.test(this.correo().trim())) e['correo'] = 'El correo no es válido.';
    if (this.condicion() !== 'contado' && !((this.limite() ?? 0) > 0)) e['limite'] = 'Con crédito, escribe el límite.';
    return e;
  });
  protected readonly hayErrores = computed(() => Object.keys(this.errores()).length > 0);

  protected guardar(): void {
    this.intentado.set(true);
    if (this.hayErrores()) return;
    const nombre = this.nombre().trim();
    this.servicio.registrar({
      nombre,
      rfc: this.rfc().trim().toUpperCase(),
      contacto: this.contacto().trim(),
      telefono: this.telefono().trim(),
      correo: this.correo().trim(),
      condicion: this.condicion(),
      limite: this.condicion() === 'contado' ? 0 : this.limite() ?? 0,
      surte: this.surte().trim(),
    });
    this.guardado.emit(nombre);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
