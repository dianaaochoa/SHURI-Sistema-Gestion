import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { ConfiguracionService } from '../../configuracion.service';

const TIPOS_LOGO = ['image/png', 'image/svg+xml'];
const MAX_LOGO = 512 * 1024;

/** AD9.1 · Negocio y marca: logo, datos del negocio y ticket de venta con vista previa. */
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
  protected readonly errorLogo = signal('');

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

  protected texto(campo: 'nombre' | 'razonSocial' | 'direccion' | 'telefono', valor: string): void {
    this.s.campo('negocio', campo, valor);
  }

  protected elegirLogo(input: HTMLInputElement): void {
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) return;
    if (!TIPOS_LOGO.includes(archivo.type)) return this.errorLogo.set('El logo debe ser PNG o SVG.');
    if (archivo.size > MAX_LOGO) return this.errorLogo.set('El logo pesa más de 512 KB; usa una versión más ligera.');
    const lector = new FileReader();
    lector.onload = () => {
      this.errorLogo.set('');
      this.s.campo('negocio', 'logo', String(lector.result));
    };
    lector.readAsDataURL(archivo);
  }

  protected quitarLogo(): void {
    this.s.campo('negocio', 'logo', null);
  }
}
