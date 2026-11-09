import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Orden, diasDesde } from '../../../cajera/ordenes/ordenes.service';
import { formatearDinero, formatearHora } from '../../../compartido/formato';
import { REGLAS_TALLER } from '../../../compartido/reglas-taller';
import { etapaGarantia, venceGarantia } from '../../garantias/garantia';
import { diaMes } from '../../por-cotizar/existencia';
import { accionOrden, estadoOrden } from '../estado-orden';

/** J11.1 · Panel derecho del chat: la orden del cliente y lo que el jefe puede hacer con ella. */
@Component({
  selector: 'app-resumen-orden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <aside class="resumen" aria-label="Orden del cliente">
      <h2>Orden {{ orden().folio }}</h2>
      <span class="estado estado--{{ estado().tono }}">{{ estado().texto }}</span>
      <dl>
        @for (d of datos(); track d.texto) {
          <div><dt>{{ d.texto }}</dt><dd>{{ d.valor }}</dd></div>
        }
      </dl>
      @if (montos().length) {
        <hr />
        @for (m of montos(); track m.texto) {
          <p class="monto" [class.monto--fuerte]="m.fuerte"><span>{{ m.texto }}</span><strong>{{ m.valor }}</strong></p>
        }
      }
      <div class="espacio"></div>
      <a class="boton boton--contorno boton--40 accion" [routerLink]="accion().ruta" [queryParams]="accion().consulta">
        <span class="icono" style="--icono: url(assets/menu/shield.svg)"></span>{{ accion().texto }}
      </a>
      <p class="aviso aviso--info"><img src="assets/pdv/info.svg" width="16" height="16" alt="" />{{ accion().aviso }}</p>
    </aside>
  `,
  styles: `
    :host { display: flex; }
    .resumen { display: flex; flex: 1; flex-direction: column; gap: 12px; padding: 20px; overflow-y: auto; }
    h2 { font-size: 17px; font-weight: 700; color: var(--color-marino); }
    .estado { align-self: flex-start; }
    dl { display: flex; flex-direction: column; gap: 12px; margin: 4px 0 0; }
    dt { font-size: 11px; color: var(--color-texto-tenue); }
    dd { margin: 2px 0 0; font-size: 13px; color: var(--color-marino); }
    hr { width: 100%; margin: 0; border: 0; border-top: 1px solid var(--color-borde); }
    .monto { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--color-texto-tenue); }
    .monto strong { font-weight: 600; color: var(--color-marino); }
    .monto--fuerte span { font-weight: 600; color: var(--color-marino); }
    .espacio { flex: 1; }
    .accion { justify-content: center; }
    .accion .icono { width: 16px; height: 16px; }
    .aviso img { margin-top: 1px; }
  `,
})
export class ResumenOrdenComponent {
  readonly orden = input.required<Orden>();

  protected readonly estado = computed(() => estadoOrden(this.orden()));
  protected readonly accion = computed(() => accionOrden(this.orden()));

  protected readonly datos = computed(() => {
    const o = this.orden();
    const g = o.garantia;
    const datos = [
      { texto: 'Cliente', valor: `${o.cliente.nombre} · ${o.cliente.telefono}` },
      { texto: 'Equipo', valor: o.ficha ? `${o.ficha.marca} ${o.ficha.modelo}` : o.equipo },
      { texto: 'Reporte del cliente', valor: g?.falla ?? o.ficha?.falla ?? o.trabajo },
      { texto: 'Técnico', valor: `${o.tecnico.nombre}${etapaGarantia(o) === 'por-dictaminar' || o.diagnostico ? ' · reporte listo' : ''}` },
      { texto: 'Recibido', valor: `${diaMes(g?.recibida ?? o.recibido)} · ${formatearHora(new Date(g?.recibida ?? o.recibido))}${g ? ' (garantía)' : ''}` },
    ];
    const vence = venceGarantia(o);
    if (g && vence) {
      const quedan = Math.max(0, REGLAS_TALLER.garantiaDias - diasDesde(o.entrega!.fecha));
      datos.push({ texto: 'Garantía vence', valor: `${diaMes(vence)} · quedan ${quedan} días` });
    }
    return datos;
  });

  protected readonly montos = computed(() => {
    const o = this.orden();
    if (o.garantia && o.entrega) {
      return [
        { texto: 'Reparación original', valor: formatearDinero(o.entrega.pagado), fuerte: false },
        { texto: 'Entregada', valor: diaMes(o.entrega.fecha), fuerte: false },
        { texto: 'Cobertura', valor: `${REGLAS_TALLER.garantiaDias} días`, fuerte: true },
      ];
    }
    if (o.presupuesto) {
      return [
        { texto: o.presupuesto.aprobado ? 'Presupuesto aprobado' : 'Presupuesto enviado', valor: formatearDinero(o.presupuesto.total), fuerte: false },
        { texto: 'Anticipo', valor: formatearDinero(o.anticipo), fuerte: false },
      ];
    }
    return [];
  });
}
