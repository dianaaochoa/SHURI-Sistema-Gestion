import { Component, computed, inject, signal } from '@angular/core';
import { CORREOS, correoHtml } from '../../../compartido/correos';
import { Correo, CorreosService, TIPOS_CORREO, TipoCorreo } from '../../../compartido/correos.service';
import { ConfiguracionService } from '../../configuracion.service';
import { descargar } from '../../pdf-simple';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIA = 86_400_000;
const en = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

/** Las cinco plantillas de Figma P6 con sus datos de ejemplo. */
const EJEMPLOS: Record<TipoCorreo, () => Omit<Correo, 'id' | 'fecha'>> = {
  acceso: () => CORREOS.acceso({ para: 'maria.hdz@gmail.com', nombre: 'María Hernández', folio: '#1024', equipo: 'Samsung Galaxy S22 Ultra', temporal: 'K7M-4Q2' }),
  cotizacion: () =>
    CORREOS.cotizacion({ para: 'maria.hdz@gmail.com', nombre: 'María Hernández', folio: '#1024', descripcion: 'Encontramos el puerto USB-C oxidado y el flex de carga dañado.', total: 1508, anticipo: 300 }),
  listo: () => CORREOS.listo({ para: 'maria.hdz@gmail.com', nombre: 'María Hernández', folio: '#1024', equipo: 'Samsung Galaxy S22 Ultra', restante: 1208, limite: en(30) }),
  bodega: () => CORREOS.bodega({ para: 'rgil@gmail.com', nombre: 'Ricardo Gil', folio: '#0961', equipo: 'Galaxy A12', listoDesde: en(-25), limite: en(5), almacenaje: 20, dias: 5 }),
  respuesta: () =>
    CORREOS.respuesta({ para: 'maria.hdz@gmail.com', nombre: 'María Hernández', folio: '#1024', jefe: 'Jorge López', texto: 'No, solo tu folio cuando pases por él. Si aplica la garantía, la reparación no tiene costo.' }),
};

/** AD9.7 · Cuenta de envío de correos (contraseñas temporales y avisos de la orden). */
@Component({
  selector: 'app-correo-tab',
  standalone: true,
  templateUrl: './correo-tab.component.html',
  styleUrls: ['../configuracion.css', './correo-tab.component.css'],
})
export class CorreoTabComponent {
  protected readonly s = inject(ConfiguracionService);
  protected readonly c = this.s.borrador;
  protected readonly probando = signal(false);
  protected readonly correos = inject(CorreosService);
  protected readonly tipos = Object.entries(TIPOS_CORREO) as [TipoCorreo, string][];
  /** Plantilla ("acceso"…) o correo enviado ("e3"). */
  protected readonly elegido = signal<string>('acceso');

  protected readonly correo = computed(() => {
    const id = this.elegido();
    if (id.startsWith('e')) {
      const c = this.correos.enviados().find((x) => `e${x.id}` === id);
      return { etiqueta: c ? `Enviado · ${TIPOS_CORREO[c.tipo]}` : 'Enviado', c: c ?? null };
    }
    const tipo = id as TipoCorreo;
    return { etiqueta: TIPOS_CORREO[tipo], c: { ...EJEMPLOS[tipo](), id: 0, fecha: new Date().toISOString() } as Correo };
  });

  /** HTML listo para el servicio de correo (lo usará la API). */
  protected descargarHtml(c: Correo): void {
    const n = this.c().negocio;
    const html = correoHtml(c, { remitente: this.c().correo.remitente, direccion: `${n.nombre.split(' · ')[0]} · ${n.direccion.split(',').slice(0, 2).join(',')}`, sitio: 'shuri.mx' });
    descargar(`correo-${c.tipo}-${c.folio.replace('#', '') || 'sin-folio'}.html`, new Blob([html], { type: 'text/html' }));
  }

  protected readonly errores = computed(() => {
    const k = this.c().correo;
    return {
      remitente: k.remitente.trim() ? '' : 'Escribe el nombre del remitente.',
      correo: CORREO.test(k.correoRemitente) ? '' : 'El correo no es válido.',
      servidor: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(k.servidor) ? '' : 'Escribe el servidor (ej. smtp.tudominio.mx).',
      puerto: k.puerto >= 1 && k.puerto <= 65535 ? '' : 'Puerto de 1 a 65535.',
      usuario: k.usuario.trim() ? '' : 'Escribe el usuario de la cuenta.',
    };
  });
  protected readonly valido = computed(() => Object.values(this.errores()).every((e) => !e));

  protected readonly vista = computed(() => {
    const k = this.c().correo;
    const n = this.c().negocio;
    return { de: `${k.remitente} <${k.correoRemitente}>`, marca: n.nombre.split(' · ')[0].trim(), lema: n.nombre.split(' · ').slice(1).join(' · '), pie: `${n.nombre.split(' · ')[0].trim()} · ${n.direccion.split(',').slice(0, 2).join(',')}` };
  });

  protected texto(campo: 'remitente' | 'correoRemitente' | 'responderA' | 'servidor' | 'usuario', valor: string): void {
    this.s.campo('correo', campo, campo === 'remitente' || campo === 'responderA' ? valor : valor.trim());
  }

  /** Simulado: la prueba real la hará la API con el servidor SMTP. */
  protected probar(): void {
    if (!this.valido()) return;
    this.probando.set(true);
    setTimeout(() => {
      this.probando.set(false);
      const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      this.s.pruebaCorreo.set(`Correo de prueba enviado hoy ${hora} a ${this.c().correo.correoRemitente} (simulado: la API hará el envío real).`);
    }, 600);
  }
}
