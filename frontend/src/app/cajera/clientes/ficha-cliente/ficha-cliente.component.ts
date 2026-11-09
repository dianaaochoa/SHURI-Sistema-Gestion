import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { ClientesService, ResumenCliente, visita } from '../clientes.service';

const mesAnio = (iso: string) => {
  const f = new Date(iso);
  return `${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')} ${f.getFullYear()}`;
};

/** C8.1 · Ficha del cliente: contacto, acceso al portal, equipos y compras recientes. */
@Component({
  selector: 'app-ficha-cliente',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ficha-cliente.component.html',
  styleUrl: './ficha-cliente.component.css',
})
export class FichaClienteComponent {
  private readonly servicio = inject(ClientesService);
  readonly resumen = input.required<ResumenCliente>();
  readonly historial = output<void>();
  readonly editar = output<void>();
  readonly nuevaOrden = output<void>();
  readonly generarTemporal = output<void>();
  readonly aviso = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly visita = visita;

  protected readonly cliente = computed(() => this.resumen().cliente);
  protected readonly iniciales = computed(() =>
    this.cliente()
      .nombre.split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase(),
  );
  protected readonly desde = computed(() => {
    const c = this.cliente();
    const fecha = c.desde ?? this.movimientos().at(-1)?.fecha;
    const visitas = this.resumen().visitas;
    return [fecha ? `Cliente desde ${mesAnio(fecha)}` : 'Cliente nuevo', visitas ? `${visitas} ${visitas === 1 ? 'visita' : 'visitas'}` : 'sin visitas todavía'].join(' · ');
  });

  private readonly movimientos = computed(() => this.servicio.historial(this.cliente()));
  protected readonly equipos = computed(() => this.movimientos().filter((m) => m.tipo === 'Equipo').slice(0, 3));
  protected readonly compras = computed(() => this.movimientos().filter((m) => m.tipo === 'Compra').slice(0, 3));

  /** "Personalizada · la cambió el 4 oct" / "Temporal · enviada hoy 11:20". */
  protected readonly contrasena = computed(() => {
    const p = this.cliente().portal;
    if (!p) return 'Todavía no tiene';
    const cuando = visita(p.fecha);
    if (p.tipo === 'personalizada') return `Personalizada · la cambió ${cuando === 'Hoy' || cuando === 'Ayer' ? cuando.toLowerCase() : 'el ' + cuando}`;
    return `Temporal · enviada ${cuando === 'Hoy' ? 'hoy ' + formatearHora(new Date(p.fecha)) : cuando === 'Ayer' ? 'ayer' : 'el ' + cuando}`;
  });

  protected enviarCorreo(): void {
    const c = this.cliente();
    const temporal = c.portal?.tipo === 'temporal' ? ` y su contraseña temporal ${c.portal.temporal}` : '';
    this.aviso.emit(`Se envió a ${c.correo} el enlace a su portal${temporal}.`);
  }
}
