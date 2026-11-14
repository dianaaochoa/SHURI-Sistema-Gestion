import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { Orden } from '../../cajera/ordenes/ordenes.service';
import { REGLAS_TALLER } from '../../compartido/reglas-taller';
import { PortalService } from '../portal.service';

const DIA = 86_400_000;
const MAX_FOTOS = 3;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dia = (d: Date) => `${d.getDate()} ${d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')}`;

/** P3.1 · Solicitar garantía (hoja que sube desde abajo en el celular). */
@Component({
  selector: 'app-solicitar-garantia',
  standalone: true,
  templateUrl: './solicitar-garantia.component.html',
  styleUrls: ['./solicitar-garantia.component.css'],
})
export class SolicitarGarantiaComponent {
  private readonly portal = inject(PortalService);

  readonly orden = input.required<Orden>();
  readonly cerrar = output<void>();
  readonly enviada = output<void>();

  protected readonly falla = signal('');
  protected readonly desde = signal(iso(new Date()));
  protected readonly fotos = signal<string[]>([]);
  protected readonly intentado = signal(false);
  protected readonly hoy = iso(new Date());

  protected readonly garantia = computed(() => {
    const entrega = new Date(this.orden().entrega?.fecha ?? Date.now());
    const vence = new Date(entrega.getTime() + REGLAS_TALLER.garantiaDias * DIA);
    const quedan = Math.max(0, Math.ceil((vence.getTime() - Date.now()) / DIA));
    return { texto: `Garantía activa · Te quedan ${quedan} ${quedan === 1 ? 'día' : 'días'} (vence ${dia(vence)})`, minimo: iso(entrega) };
  });

  protected elegirFotos(input: HTMLInputElement): void {
    const archivos = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
    input.value = '';
    // Solo se guarda cuántas y sus nombres: la API recibirá las fotos.
    this.fotos.update((l) => [...l, ...archivos.map((f) => f.name)].slice(0, MAX_FOTOS));
  }

  protected quitarFoto(i: number): void {
    this.fotos.update((l) => l.filter((_, j) => j !== i));
  }

  protected enviar(): void {
    this.intentado.set(true);
    if (!this.falla().trim()) return;
    const [a, m, d] = this.desde().split('-').map(Number);
    const desde = this.desde() ? dia(new Date(a, m - 1, d)) : '';
    if (this.portal.solicitarGarantia(this.orden().folio, this.falla(), desde, this.fotos().length)) this.enviada.emit();
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
