import { Directive, ElementRef, effect, inject, model } from '@angular/core';
import { formatearDinero } from './formato';

/** "$1,2a00.5" → 1200.5 · vacío → null. Solo cuenta el primer punto decimal. */
export function leerDinero(texto: string): number | null {
  const [entero, ...resto] = texto.replace(/[^0-9.]/g, '').split('.');
  const limpio = resto.length ? `${entero}.${resto.join('').slice(0, 2)}` : entero;
  return limpio && limpio !== '.' ? Number(limpio) : null;
}

/**
 * Campo de dinero (`<input [(campoDinero)]="monto">`): mientras se escribe muestra el número
 * tal cual (1000) y fuera del campo lo muestra con formato ($1,000.00), también cuando el monto
 * llega de un botón (“Exacto”, montos rápidos) o de otra parte de la pantalla.
 */
@Directive({
  selector: 'input[campoDinero]',
  standalone: true,
  host: {
    '(focus)': 'alEnfocar()',
    '(input)': 'alEscribir()',
    '(blur)': 'mostrar()',
  },
})
export class CampoDineroDirective {
  readonly campoDinero = model<number | null>(null);
  private readonly campo = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  /** Lo último que escribió la persona: si el monto cambia por fuera, se reescribe el campo. */
  private escrito: number | null | undefined;

  constructor() {
    effect(() => {
      const valor = this.campoDinero();
      if (document.activeElement !== this.campo) this.mostrar();
      else if (valor !== this.escrito) this.campo.value = valor === null ? '' : String(valor);
    });
  }

  protected alEnfocar(): void {
    const valor = this.campoDinero();
    this.escrito = valor;
    this.campo.value = valor === null ? '' : String(valor);
    this.campo.select();
  }

  protected alEscribir(): void {
    this.escrito = leerDinero(this.campo.value);
    this.campoDinero.set(this.escrito);
  }

  protected mostrar(): void {
    const valor = this.campoDinero();
    this.campo.value = valor === null ? '' : formatearDinero(valor);
  }
}
