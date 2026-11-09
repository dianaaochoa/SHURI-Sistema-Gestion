import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Marco común de las pantallas de acceso (A.1–A.5): panel de marca + columna del formulario. */
@Component({
  selector: 'app-acceso-layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './acceso-layout.component.html',
  styleUrl: './acceso-layout.component.css',
})
export class AccesoLayoutComponent {}
