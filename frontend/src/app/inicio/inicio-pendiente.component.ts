import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../acceso/auth.service';

/**
 * Destino temporal después de iniciar sesión.
 * Se reemplaza por el inicio de cada rol (AD1.1, C1.1, J1.1, T1.1) cuando existan esas pantallas.
 */
@Component({
  selector: 'app-inicio-pendiente',
  standalone: true,
  template: `
    <main class="inicio">
      <section class="tarjeta">
        <div class="tarjeta__encabezado">
          <h1 class="tarjeta__titulo">Hola, {{ auth.sesion()?.nombre }}</h1>
          <p class="tarjeta__descripcion">
            Iniciaste sesión como <strong>{{ auth.sesion()?.rol }}</strong>. La pantalla de inicio de este rol todavía
            no está construida.
          </p>
        </div>
        <button type="button" class="boton boton--primario boton--bloque" (click)="cerrarSesion()">Cerrar sesión</button>
      </section>
    </main>
  `,
  styles: `
    .inicio {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px 16px;
    }
  `,
})
export class InicioPendienteComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  cerrarSesion(): void {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/iniciar-sesion');
  }
}
