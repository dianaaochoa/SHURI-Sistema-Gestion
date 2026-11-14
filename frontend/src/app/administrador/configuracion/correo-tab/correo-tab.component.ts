import { Component, computed, inject, signal } from '@angular/core';
import { ConfiguracionService } from '../../configuracion.service';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
