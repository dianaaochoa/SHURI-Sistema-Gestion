import { AfterViewInit, Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatearFechaCorta } from '../../../compartido/formato';
import { CLIENTES, Cliente, textoDireccion } from '../../punto-de-venta/clientes.datos';
import { NuevoClienteComponent } from '../nuevo-cliente/nuevo-cliente.component';
import { NuevaOrden } from '../ordenes.service';

const TIPOS = ['Teléfono celular', 'Tablet', 'Laptop', 'Smartwatch', 'Consola', 'Audífonos'];
const MARCAS = ['Samsung', 'Apple', 'Motorola', 'Xiaomi', 'Huawei', 'Oppo', 'Honor', 'Realme', 'Lenovo', 'HP', 'Nintendo', 'Sony'];
const MODELOS: Record<string, string[]> = {
  Samsung: ['Galaxy S22 Ultra', 'Galaxy S21', 'Galaxy A12', 'Galaxy A32', 'Galaxy A54', 'Galaxy Tab A8'],
  Apple: ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone XR', 'iPad 9'],
  Motorola: ['Moto G84', 'Moto G54', 'Moto E13', 'Edge 40'],
  Xiaomi: ['Redmi 10', 'Redmi Note 12', 'Redmi Note 13', 'Poco X5'],
  Huawei: ['P30', 'P30 Lite', 'Y9'],
};
const METODOS_ANTICIPO = ['Efectivo', 'Tarjeta', 'Transferencia'];
const SIN_AMBIGUOS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

type Campo = 'cliente' | 'tipo' | 'marca' | 'modelo' | 'falla' | 'condicion' | 'anticipo';

const sinAcentos = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Contraseña temporal del portal: "K7M-4Q2" (sin 0/O ni 1/I para que no se confundan al dictarla). */
export function generarContrasena(): string {
  const parte = () => Array.from({ length: 3 }, () => SIN_AMBIGUOS[Math.floor(Math.random() * SIN_AMBIGUOS.length)]).join('');
  return `${parte()}-${parte()}`;
}

export interface OrdenCapturada {
  datos: NuevaOrden;
  cliente: Cliente;
  contrasena: string;
}

/** C5.1 · C5.2 · Recepción de taller (modal "Nueva orden"). */
@Component({
  selector: 'app-nueva-orden',
  standalone: true,
  imports: [FormsModule, NuevoClienteComponent],
  templateUrl: './nueva-orden.component.html',
  styleUrl: './nueva-orden.component.css',
})
export class NuevaOrdenComponent implements AfterViewInit {
  readonly folio = input.required<string>();
  readonly cajera = input('');
  readonly cerrar = output<void>();
  readonly registrar = output<OrdenCapturada>();

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tipos = TIPOS;
  protected readonly marcas = MARCAS;
  protected readonly metodos = METODOS_ANTICIPO;
  protected readonly direccion = textoDireccion;
  protected readonly hoy = formatearFechaCorta(new Date());

  // A · Cliente
  protected readonly busqueda = signal('');
  protected readonly buscado = signal('');
  protected readonly coincidencias = signal<Cliente[]>([]);
  protected readonly cliente = signal<Cliente | null>(null);
  protected readonly modalCliente = signal<'nuevo' | 'editar' | null>(null);
  protected readonly sinResultados = computed(() => this.buscado() !== '' && !this.cliente() && this.coincidencias().length === 0);

  // B · Equipo
  protected tipo = '';
  protected marca = '';
  protected modelo = '';
  protected color = '';
  protected imei = '';
  protected pin = '';
  protected accesorios = '';
  protected falla = '';
  protected condicion = '';
  protected modelosDe(marca: string): string[] {
    return MODELOS[marca] ?? [];
  }

  // C · Anticipo y portal
  protected anticipo: number | null = 300;
  protected metodo = METODOS_ANTICIPO[0];
  protected readonly contrasena = signal(generarContrasena());
  protected readonly generarContrasena = generarContrasena;

  private readonly intentado = signal(false);

  ngAfterViewInit(): void {
    setTimeout(() => this.elemento.nativeElement.querySelector<HTMLInputElement>('#buscar-cliente')?.focus());
  }

  /** Enter en la búsqueda: teléfono (4 dígitos o más), nombre o correo. */
  protected buscar(): void {
    const texto = this.busqueda().trim();
    if (!texto) return;
    const normal = sinAcentos(texto);
    const digitos = texto.replace(/[^0-9]/g, '');
    const lista = CLIENTES.filter(
      (c) =>
        (digitos.length >= 4 && (c.telefono ?? '').replace(/[^0-9]/g, '').includes(digitos)) ||
        (!digitos.length && sinAcentos(c.nombre).includes(normal)) ||
        (c.correo ?? '').toLowerCase().includes(normal),
    );
    this.buscado.set(texto);
    if (lista.length === 1) {
      this.elegirCliente(lista[0]);
    } else {
      this.cliente.set(null);
      this.coincidencias.set(lista);
      // Figma C5.2: sin resultados se abre el registro de cliente nuevo.
      if (!lista.length) this.modalCliente.set('nuevo');
    }
  }

  protected elegirCliente(cliente: Cliente): void {
    this.cliente.set(cliente);
    this.coincidencias.set([]);
    this.busqueda.set(cliente.telefono ?? cliente.nombre);
  }

  protected clienteGuardado(cliente: Cliente): void {
    const existente = CLIENTES.findIndex((c) => c.id === cliente.id);
    // Simulado: el cliente queda en la lista de prueba para encontrarlo después (C8 Clientes lo guardará en la API).
    if (existente >= 0) CLIENTES[existente] = cliente;
    else CLIENTES.push(cliente);
    this.modalCliente.set(null);
    this.elegirCliente(cliente);
  }

  private errores(): Record<Campo, boolean> {
    return {
      cliente: !this.cliente(),
      tipo: !this.tipo.trim(),
      marca: !this.marca.trim(),
      modelo: !this.modelo.trim(),
      falla: this.falla.trim().length < 5,
      condicion: this.condicion.trim().length < 5,
      anticipo: this.anticipo === null || this.anticipo < 0,
    };
  }

  protected error(campo: Campo): boolean {
    return this.intentado() && this.errores()[campo];
  }

  protected leerNumero(texto: string): number | null {
    const limpio = texto.replace(/[^0-9.]/g, '');
    return limpio ? Number(limpio) : null;
  }

  protected guardar(): void {
    this.intentado.set(true);
    if (Object.values(this.errores()).some(Boolean)) {
      setTimeout(() => this.elemento.nativeElement.querySelector<HTMLElement>('.campo__control--error input, .campo__control--error textarea, .nueva__area--error')?.focus());
      return;
    }
    const c = this.cliente()!;
    this.registrar.emit({
      cliente: c,
      contrasena: this.contrasena(),
      datos: {
        cliente: { nombre: c.nombre, telefono: c.telefono ?? '', correo: c.correo },
        tipo: this.tipo.trim(),
        marca: this.marca.trim(),
        modelo: this.modelo.trim(),
        color: this.color.trim(),
        imei: this.imei.trim(),
        accesorios: this.accesorios.trim(),
        falla: this.falla.trim(),
        condicion: this.condicion.trim(),
        anticipo: this.anticipo ?? 0,
        metodoAnticipo: this.metodo,
      },
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected alPresionarTecla(evento: KeyboardEvent): void {
    // Con el modal de cliente encima, las teclas son suyas.
    if (this.modalCliente()) return;
    if (evento.key === 'Escape') this.cerrar.emit();
  }
}
