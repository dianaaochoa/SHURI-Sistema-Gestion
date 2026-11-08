import { Component, HostListener, computed, inject, output, signal } from '@angular/core';
import { formatearDinero } from '../../../compartido/formato';
import { descargarCsv, leerCsv } from '../csv';
import { CATEGORIAS_INVENTARIO, PROVEEDORES, ProductoInventario } from '../inventario.datos';
import { InventarioService } from '../inventario.service';

const COLUMNAS = ['SKU', 'Nombre', 'Categoría', 'Costo', 'Precio', 'Stock'];

/** Filas de la vista previa de Figma C7.2: se usan cuando suben un .xlsx (lo leerá la API). */
const FILAS_XLSX: string[][] = [
  ['ACC-047', 'Protector de cámara iPhone 15 Pro', 'Accesorios', '45', '139', '20'],
  ['ACC-001', 'Mica cristal templado', 'Accesorios', '28', '100', '124'],
  ['REF-A15-LCD', 'Pantalla Samsung A15', 'Refacciones', '520', '980', '4'],
  ['ACC-048', 'Cable Lightning 2 m', 'Accesorios', '40', '', '15'],
  ['REF-IP11-BAT', 'Batería iPhone 11', 'Refacciones', '210', '480', '—'],
  ['CON-012', 'Alcohol isopropílico 1 L', 'Consumibles', '85', '0', '6'],
];

type Resultado = { texto: string; tono: 'exito' | 'info' | 'peligro' | 'neutro'; tipo: 'nuevo' | 'actualiza' | 'error' | 'omite' };

interface FilaImportada {
  numero: number;
  celdas: string[];
  costo: number;
  precio: number | null;
  stock: number | null;
  resultado: Resultado;
}

/** C7.2 · Importar productos desde Excel (modal): plantilla → archivo → revisar e importar. */
@Component({
  selector: 'app-importar-excel',
  standalone: true,
  templateUrl: './importar-excel.component.html',
  styleUrl: './importar-excel.component.css',
})
export class ImportarExcelComponent {
  private readonly inventario = inject(InventarioService);
  readonly cerrar = output<void>();
  readonly importado = output<string>();

  protected readonly dinero = formatearDinero;
  protected readonly plantillaDescargada = signal(false);
  protected readonly archivo = signal<{ nombre: string; kb: number; hoja: string | null; filas: string[][] } | null>(null);
  protected readonly errorArchivo = signal<string | null>(null);
  protected readonly actualizar = signal(true);
  protected readonly sumarStock = signal(false);

  protected readonly paso = computed(() => (this.archivo() ? 3 : this.plantillaDescargada() ? 2 : 1));

  protected readonly filas = computed<FilaImportada[]>(() => (this.archivo()?.filas ?? []).map((c, i) => this.revisar(c, i + 2)));
  protected readonly conteo = computed(() => {
    const f = this.filas();
    const de = (tipo: Resultado['tipo']) => f.filter((x) => x.resultado.tipo === tipo).length;
    return { nuevos: de('nuevo'), actualiza: de('actualiza'), errores: de('error'), omite: de('omite') };
  });
  protected readonly aImportar = computed(() => this.conteo().nuevos + this.conteo().actualiza);

  private revisar(celdas: string[], numero: number): FilaImportada {
    const [sku = '', nombre = '', categoria = '', costoTexto = '', precioTexto = '', stockTexto = ''] = celdas.map((c) => c.trim());
    const costo = numero_(costoTexto);
    const precio = precioTexto === '' ? null : numero_(precioTexto);
    const stock = /^\d+$/.test(stockTexto) ? Number(stockTexto) : null;
    const fila = (resultado: Resultado): FilaImportada => ({ numero, celdas: [sku.toUpperCase(), nombre, categoria], costo: costo ?? 0, precio, stock, resultado });
    const error = (texto: string) => fila({ texto, tono: 'peligro', tipo: 'error' });

    if (!sku) return error('Falta SKU');
    if (!nombre) return error('Falta nombre');
    if (!CATEGORIAS_INVENTARIO.includes(categoria)) return error('Categoría no válida');
    if (costo === null) return error('Costo no numérico');
    if (precio === null) return error('Falta precio');
    if (stock === null) return error('Stock no numérico');

    const existente = this.inventario.buscar(sku.toUpperCase());
    if (!existente) return fila({ texto: precio === 0 ? 'Nuevo · uso interno' : 'Nuevo', tono: 'exito', tipo: 'nuevo' });
    if (!this.actualizar()) return fila({ texto: 'Ya existe · se omite', tono: 'neutro', tipo: 'omite' });
    const cambios = [
      precio !== existente.precio && 'precio',
      costo !== existente.costo && 'costo',
      (this.sumarStock() ? stock > 0 : stock !== existente.stock) && 'stock',
      nombre !== existente.nombre && 'nombre',
    ].filter(Boolean) as string[];
    if (!cambios.length) return fila({ texto: 'Sin cambios', tono: 'neutro', tipo: 'omite' });
    const texto = cambios.length > 2 ? `Actualiza ${cambios[0]} y ${cambios.length - 1} más` : `Actualiza ${cambios.join(' y ')}`;
    return fila({ texto, tono: 'info', tipo: 'actualiza' });
  }

  // ---------- Pasos ----------
  protected descargarPlantilla(): void {
    descargarCsv('plantilla_productos.csv', [COLUMNAS, ['ACC-047', 'Protector de cámara iPhone 15 Pro', 'Accesorios', '45.00', '139.00', '20']]);
    this.plantillaDescargada.set(true);
  }

  protected subir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    const kb = Math.max(1, Math.round(archivo.size / 1024));
    if (/\.xlsx?$/i.test(archivo.name)) {
      this.errorArchivo.set(null);
      this.archivo.set({ nombre: archivo.name, kb, hoja: 'Productos', filas: FILAS_XLSX });
      return;
    }
    if (!/\.csv$/i.test(archivo.name)) {
      this.errorArchivo.set('Sube la plantilla en Excel (.xlsx) o CSV.');
      return;
    }
    archivo.text().then((texto) => {
      const [encabezado, ...filas] = leerCsv(texto);
      if (!encabezado || encabezado[0]?.trim().toUpperCase() !== 'SKU') {
        this.errorArchivo.set('El archivo no tiene las columnas de la plantilla (SKU, Nombre, Categoría, Costo, Precio, Stock).');
        return;
      }
      if (!filas.length) {
        this.errorArchivo.set('El archivo no tiene productos.');
        return;
      }
      this.errorArchivo.set(null);
      this.archivo.set({ nombre: archivo.name, kb, hoja: null, filas });
    });
  }

  protected descargarErrores(): void {
    const errores = this.filas().filter((f) => f.resultado.tipo === 'error');
    descargarCsv('filas_con_error.csv', [['Fila', ...COLUMNAS, 'Error'], ...errores.map((f) => [f.numero, ...this.archivo()!.filas[f.numero - 2], f.resultado.texto])]);
  }

  protected importar(): void {
    const productos: ProductoInventario[] = this.filas()
      .filter((f) => f.resultado.tipo === 'nuevo' || f.resultado.tipo === 'actualiza')
      .map((f) => ({
        sku: f.celdas[0],
        nombre: f.celdas[1],
        categoria: f.celdas[2],
        costo: f.costo,
        precio: f.precio!,
        stock: f.stock!,
        proveedor: PROVEEDORES[0],
        unidad: 'Pieza',
        codigoBarras: '',
        minimo: 0,
        ubicacion: '',
        apartados: [],
        foto: null,
        usoInterno: f.precio === 0 || undefined,
      }));
    // Se cuentan antes: al importar, las filas ya existen y se verían "sin cambios".
    const { nuevos, actualiza } = this.conteo();
    const nombre = this.archivo()!.nombre;
    this.inventario.importar(productos, this.sumarStock());
    const partes = [];
    if (nuevos) partes.push(`${nuevos} ${nuevos === 1 ? 'producto nuevo' : 'productos nuevos'}`);
    if (actualiza) partes.push(`${actualiza} ${actualiza === 1 ? 'actualizado' : 'actualizados'}`);
    this.importado.emit(`Importación de ${nombre}: ${partes.join(' y ')}`);
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}

function numero_(texto: string): number | null {
  const limpio = texto.replace(/[$,\s]/g, '');
  return limpio !== '' && !Number.isNaN(Number(limpio)) ? Number(limpio) : null;
}
