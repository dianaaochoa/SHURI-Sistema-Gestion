import { Component, computed, inject, signal } from '@angular/core';
import { ConfiguracionService, REGIMENES } from '../../configuracion.service';
import { FacturacionService, diaFactura, serieFolio } from '../../facturacion.service';

export const RFC_VALIDO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** AD9.5 · Datos fiscales del emisor, certificado (CSD), folios y timbres. */
@Component({
  selector: 'app-facturacion-tab',
  standalone: true,
  templateUrl: './facturacion-tab.component.html',
  styleUrls: ['../configuracion.css', './facturacion-tab.component.css'],
})
export class FacturacionTabComponent {
  protected readonly s = inject(ConfiguracionService);
  private readonly facturacion = inject(FacturacionService);
  protected readonly c = this.s.borrador;
  protected readonly regimenes = REGIMENES;
  protected readonly avisoCompra = signal(false);
  protected readonly errorArchivo = signal('');

  protected readonly errores = computed(() => {
    const f = this.c().fiscal;
    return {
      rfc: RFC_VALIDO.test(f.rfc) ? '' : 'El RFC debe tener 12 o 13 caracteres (ej. SRV250101AB1).',
      razon: f.razonSocial.trim() ? '' : 'Escribe la razón social como aparece en tu constancia.',
      cp: /^\d{5}$/.test(f.cp) ? '' : 'El código postal tiene 5 dígitos.',
      serie: /^[A-Z]{1,4}$/.test(f.serie) ? '' : 'De 1 a 4 letras.',
    };
  });

  protected readonly vigencia = computed(() => {
    const [a, m, d] = this.c().fiscal.vigenciaCsd.split('-').map(Number);
    return `Hasta ${d} ${new Date(a, m - 1, d).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')} ${a}`;
  });

  protected readonly siguiente = computed(() => String(this.facturacion.siguienteFolio()).padStart(4, '0'));

  protected readonly timbrado = computed(() => {
    const hoy = new Date();
    const facturas = this.facturacion.facturas();
    const delMes = facturas.filter((f) => {
      const d = new Date(f.fecha);
      return d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
    });
    const ultima = [...facturas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const timbres = this.facturacion.timbres();
    return {
      datos: [
        ['Proveedor de timbrado', 'Incluido en SHURI'],
        ['Timbres disponibles', `${timbres} de ${this.facturacion.paquete}`],
        [`Usados en ${hoy.toLocaleDateString('es-MX', { month: 'long' })}`, `${delMes.length}`],
        ['Último timbrado', ultima ? `${diaFactura(ultima.fecha)} ${new Date(ultima.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })} · ${serieFolio(ultima)}` : '—'],
      ],
      porcentaje: Math.round((timbres / this.facturacion.paquete) * 100),
      pocos: timbres < 50,
    };
  });

  protected texto(campo: 'rfc' | 'razonSocial' | 'cp' | 'serie', valor: string): void {
    this.s.campo('fiscal', campo, campo === 'rfc' || campo === 'serie' ? valor.trim().toUpperCase() : valor);
  }

  /** Solo se guarda el nombre: el archivo lo recibirá la API (nunca se lee en el navegador). */
  protected archivo(tipo: 'cer' | 'key', input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(`.${tipo}`)) return this.errorArchivo.set(`El archivo debe terminar en .${tipo}.`);
    this.errorArchivo.set('');
    this.s.campo('fiscal', tipo, f.name);
  }
}
