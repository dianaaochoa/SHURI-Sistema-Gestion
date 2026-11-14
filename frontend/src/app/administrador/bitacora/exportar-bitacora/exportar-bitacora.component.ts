import { Component, HostListener, computed, inject, output, signal } from '@angular/core';
import { ACCIONES, BitacoraService } from '../../bitacora.service';
import { descargar, pdfDeLineas } from '../../pdf-simple';
import { exportarCsv } from '../../reportes';

type Formato = 'xls' | 'csv' | 'pdf';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** AD8.2 · Exportar la bitácora para el contador o como respaldo. */
@Component({
  selector: 'app-exportar-bitacora',
  standalone: true,
  templateUrl: './exportar-bitacora.component.html',
  styleUrls: ['../../../tecnico/banco/modal-banco.css'],
  styles: [
    `.formatos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .casilla { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-marino); cursor: pointer; }
    .casilla input { width: 16px; height: 16px; margin: 0; accent-color: var(--color-primario); }
    @media (max-width: 520px) { .formatos { grid-template-columns: 1fr; } }`,
  ],
})
export class ExportarBitacoraComponent {
  private readonly servicio = inject(BitacoraService);

  readonly cerrar = output<void>();

  protected readonly hoy = iso(new Date());
  protected readonly desde = signal(iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  protected readonly hasta = signal(this.hoy);
  protected readonly formato = signal<Formato>('xls');
  protected readonly detalle = signal(true);
  protected readonly formatos: { id: Formato; texto: string }[] = [
    { id: 'xls', texto: 'Excel (.xls)' },
    { id: 'csv', texto: 'CSV' },
    { id: 'pdf', texto: 'PDF' },
  ];

  protected readonly error = computed(() => (!this.desde() || !this.hasta() ? 'Elige las dos fechas.' : this.desde() > this.hasta() ? '“Desde” no puede ser después de “Hasta”.' : ''));

  private readonly enRango = computed(() => {
    if (this.error()) return [];
    const [a, m, d] = this.desde().split('-').map(Number);
    const [a2, m2, d2] = this.hasta().split('-').map(Number);
    const desde = new Date(a, m - 1, d).getTime();
    const hasta = new Date(a2, m2 - 1, d2 + 1).getTime();
    return this.servicio
      .registros()
      .filter((r) => {
        const t = new Date(r.fecha).getTime();
        return t >= desde && t < hasta;
      })
      .reverse();
  });
  protected readonly cuantos = computed(() => this.enRango().length);

  protected descargar(): void {
    if (this.error() || !this.cuantos()) return;
    const conDetalle = this.detalle();
    const encabezado = ['Fecha', 'Hora', 'Usuario', 'Acción', ...(conDetalle ? ['Detalle'] : []), 'Módulo'];
    const filas = this.enRango().map((r) => {
      const f = new Date(r.fecha);
      return [f.toLocaleDateString('es-MX'), f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }), r.nombre, r.etiqueta ?? ACCIONES[r.tipo].texto, ...(conDetalle ? [r.detalle] : []), r.modulo];
    });
    const nombre = `bitacora-${this.desde()}-a-${this.hasta()}`;
    const titulo = `Bitácora SHURI · ${this.desde()} a ${this.hasta()} · ${filas.length} acciones`;
    if (this.formato() === 'csv') exportarCsv(nombre, [[titulo], [], encabezado, ...filas]);
    else if (this.formato() === 'pdf') descargar(`${nombre}.pdf`, pdfDeLineas([titulo, '', ...filas.map((f) => f.join(' · '))], 9));
    else {
      // Hoja de cálculo XML (SpreadsheetML) que Excel abre directo.
      const celdas = (f: string[]) => `<Row>${f.map((c) => `<Cell><Data ss:Type="String">${xml(c)}</Data></Cell>`).join('')}</Row>`;
      const libro = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Bitácora"><Table>${celdas([titulo])}${celdas(encabezado)}${filas.map(celdas).join('')}</Table></Worksheet>
</Workbook>`;
      descargar(`${nombre}.xls`, new Blob([libro], { type: 'application/vnd.ms-excel' }));
    }
    this.cerrar.emit();
  }

  @HostListener('document:keydown.escape')
  protected alEscape(): void {
    this.cerrar.emit();
  }
}
