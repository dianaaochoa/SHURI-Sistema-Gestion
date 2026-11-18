import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { DESPUES_RESGUARDO } from '../../../compartido/reglas-taller';
import { formatearDinero } from '../../../compartido/formato';
import { ConfiguracionService, llenarClausula } from '../../configuracion.service';

/** AD9.3 · Cláusulas y condiciones de servicio y aviso de privacidad. */
@Component({
  selector: 'app-documentos-tab',
  standalone: true,
  templateUrl: './documentos-tab.component.html',
  styleUrls: ['../configuracion.css', '../../../tecnico/banco/modal-banco.css', './documentos-tab.component.css'],
})
export class DocumentosTabComponent {
  protected readonly s = inject(ConfiguracionService);
  protected readonly c = this.s.borrador;

  /** Cláusula abierta para editar (-1 = aviso de privacidad). */
  protected readonly editando = signal<number | null>(null);
  protected readonly vistaPrevia = signal(false);

  protected readonly clausulas = computed(() => this.c().clausulas.map((k, i) => ({ i, titulo: k.titulo, texto: k.texto, lleno: llenarClausula(k.texto, this.s.reglas()) })));

  protected readonly datos = computed(() => {
    const r = this.s.reglas();
    return [
      ['Costo de revisión', `${formatearDinero(r.revision)} · Jefe › Configuración`],
      ['Vigencia del presupuesto', `${r.vigenciaDias} días`],
      ['Garantía', `${r.garantiaDias} días desde ${r.garantiaDesde === 'entrega' ? 'la entrega' : 'la reparación'}`],
      ['Almacenaje', `${formatearDinero(r.almacenajeDia)}/día después de ${r.diasSinCobro} días`],
      ['Resguardo', r.despuesResguardo === 'resguardo' ? `A los ${r.diasResguardo} días` : DESPUES_RESGUARDO[r.despuesResguardo]],
    ];
  });

  protected cambiar(i: number, campo: 'titulo' | 'texto', valor: string): void {
    this.s.cambiar('clausulas', this.c().clausulas.map((k, j) => (j === i ? { ...k, [campo]: valor } : k)));
  }

  protected agregar(): void {
    this.s.cambiar('clausulas', [...this.c().clausulas, { titulo: 'Nueva cláusula', texto: '' }]);
    this.editando.set(this.c().clausulas.length - 1);
  }

  protected quitar(i: number): void {
    this.s.cambiar('clausulas', this.c().clausulas.filter((_, j) => j !== i));
    this.editando.set(null);
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.vistaPrevia.set(false);
  }
}
