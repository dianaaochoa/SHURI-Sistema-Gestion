import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { ConfiguracionService } from '../../configuracion.service';

/** AD9.1 · Negocio: datos del negocio y ticket de venta con vista previa. El nombre y el logo son fijos de SHURI. */
@Component({
  selector: 'app-negocio-tab',
  standalone: true,
  templateUrl: './negocio-tab.component.html',
  styleUrls: ['../configuracion.css', './negocio-tab.component.css'],
})
export class NegocioTabComponent {
  protected readonly s = inject(ConfiguracionService);
  private readonly cajera = inject(AuthService).usuarios().find((u) => u.rol === 'cajera')?.nombre ?? 'Ana Martínez';

  protected readonly c = this.s.borrador;

  /** Ticket de ejemplo (Figma AD9.1): mica $100 y cargador $250. */
  protected readonly vista = computed(() => {
    const c = this.c();
    const [marca, ...lema] = c.negocio.nombre.split(' · ');
    const total = 350;
    return {
      marca: marca.trim() || 'Tu negocio',
      lema: lema.join(' · '),
      direccion: c.negocio.direccion.split(',').slice(0, 2).join(','),
      rfc: c.fiscal.rfc,
      iva: formatearDinero(total - total / 1.16),
      total: formatearDinero(total),
      cajera: this.cajera,
    };
  });

  protected texto(campo: 'razonSocial' | 'direccion' | 'telefono', valor: string): void {
    this.s.campo('negocio', campo, valor);
  }
}
