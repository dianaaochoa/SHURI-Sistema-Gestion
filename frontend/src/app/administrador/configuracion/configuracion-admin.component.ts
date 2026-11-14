import { Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../acceso/auth.service';
import { CajaService } from '../../cajera/caja.service';
import { BitacoraService } from '../bitacora.service';
import { ConfiguracionService } from '../configuracion.service';
import { CajasTabComponent } from './cajas-tab/cajas-tab.component';
import { CorreoTabComponent } from './correo-tab/correo-tab.component';
import { DocumentosTabComponent } from './documentos-tab/documentos-tab.component';
import { FacturacionTabComponent } from './facturacion-tab/facturacion-tab.component';
import { MensajesTabComponent } from './mensajes-tab/mensajes-tab.component';
import { NegocioTabComponent } from './negocio-tab/negocio-tab.component';
import { TallerTabComponent } from './taller-tab/taller-tab.component';

type Pestana = 'negocio' | 'cajas' | 'documentos' | 'taller' | 'facturacion' | 'mensajes' | 'correo';

const PESTANAS: { id: Pestana; texto: string; secciones: string[] }[] = [
  { id: 'negocio', texto: 'Negocio y marca', secciones: ['negocio', 'ticket'] },
  { id: 'cajas', texto: 'Cajas y pagos', secciones: ['cajas', 'pagos', 'transferencia'] },
  { id: 'documentos', texto: 'Documentos', secciones: ['clausulas', 'privacidad'] },
  { id: 'taller', texto: 'Taller', secciones: ['taller'] },
  { id: 'facturacion', texto: 'Facturación', secciones: ['fiscal'] },
  { id: 'mensajes', texto: 'Mensajes', secciones: ['mensajes'] },
  { id: 'correo', texto: 'Correo', secciones: ['correo'] },
];

/** AD9 · Configuración: siete pestañas que se guardan juntas. */
@Component({
  selector: 'app-configuracion-admin',
  standalone: true,
  imports: [NegocioTabComponent, CajasTabComponent, DocumentosTabComponent, TallerTabComponent, FacturacionTabComponent, MensajesTabComponent, CorreoTabComponent],
  templateUrl: './configuracion-admin.component.html',
  styleUrls: ['./configuracion-admin.component.css'],
})
export class ConfiguracionAdminComponent {
  protected readonly servicio = inject(ConfiguracionService);
  private readonly auth = inject(AuthService);
  private readonly caja = inject(CajaService);
  private readonly bitacora = inject(BitacoraService);

  protected readonly pestanas = PESTANAS;
  protected readonly pestana = signal<Pestana>('negocio');
  protected readonly aviso = signal('');
  protected readonly error = signal('');

  /** Pestañas con cambios sin guardar (punto junto al nombre). */
  protected readonly conCambios = computed(() => {
    const pendientes = this.servicio.pendientes();
    return new Set(PESTANAS.filter((p) => p.secciones.some((s) => pendientes.includes(s))).map((p) => p.id));
  });

  protected guardar(): void {
    const nombres = PESTANAS.filter((p) => this.conCambios().has(p.id)).map((p) => p.texto);
    if (!nombres.length) return;
    const errores = this.servicio.errores();
    if (errores.length) {
      this.pestana.set(errores[0].pestana as Pestana);
      this.error.set(`No se guardó: ${errores.map((e) => e.texto).join('; ')}.`);
      return;
    }
    this.error.set('');
    const delTaller = this.servicio.guardar(this.auth.sesion()?.nombre ?? '');
    // La caja toma el fondo y las cajas nuevas al abrir el siguiente turno.
    const cajas = this.servicio.guardada().cajas;
    this.caja.fondoAsignado = cajas[0]?.fondo ?? this.caja.fondoAsignado;
    for (const c of cajas) if (!this.caja.cajas.includes(c.nombre)) this.caja.cajas.push(c.nombre);
    this.bitacora.registrar('configuracion', `${nombres.join(', ')}${delTaller.length ? ` · ${delTaller.join('; ')}` : ''}`, 'Configuración', '/administrador/configuracion');
    this.aviso.set(`Cambios guardados en ${nombres.join(', ')}. Aplican en los tickets, documentos y pantallas desde ahora.`);
  }

  protected descartar(): void {
    this.servicio.descartar();
    this.aviso.set('');
    this.error.set('');
  }

  protected elegir(p: Pestana): void {
    this.pestana.set(p);
    this.aviso.set('');
  }
}
