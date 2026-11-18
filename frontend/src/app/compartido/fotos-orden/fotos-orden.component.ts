import { Component, HostListener, computed, input, output, signal } from '@angular/core';

/** Foto del equipo guardada en la orden (recepción en caja). */
export interface FotoOrden {
  id: string;
  /** Imagen ya reducida (data URL JPEG); con la API será la dirección del archivo. */
  url: string;
  nombre: string;
  /** ISO */
  fecha: string;
  por: string;
}

const MAX_LADO = 1280;
const TIPOS = /^image\/(jpeg|png|webp|heic|heif)$/i;
const MAX_BYTES = 15 * 1024 * 1024;

/** Reduce la foto a 1280 px de lado mayor (JPEG 80 %) para no guardar archivos de varios MB. */
/** Fotos que todavía no se guardan (en un modal): se muestran con su posición como id. */
export function fotosSinGuardar(fotos: { url: string; nombre: string }[], por: string): FotoOrden[] {
  const fecha = new Date().toISOString();
  return fotos.map((f, i) => ({ ...f, id: String(i), fecha, por }));
}

export function reducirImagen(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(url);
      resolve(lienzo.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

/**
 * Fotos del equipo: miniaturas, vista grande y, si es editable, tomar/subir y quitar.
 * La usan Nueva orden (C5.1), el detalle de la orden (C4), el banco del técnico, el jefe (J2.3) y el portal (P2.1).
 */
@Component({
  selector: 'app-fotos-orden',
  standalone: true,
  template: `
    <div class="lista">
      @for (f of fotos(); track f.id; let i = $index) {
        <span class="foto" [style.width.px]="tamano()" [style.height.px]="tamano()">
          <button type="button" class="foto__ver" [attr.aria-label]="'Ver foto ' + (i + 1) + ' de ' + fotos().length" (click)="abierta.set(i)"><img [src]="f.url" alt="" /></button>
          @if (editable()) {
            <button type="button" class="foto__quitar" [attr.aria-label]="'Quitar foto ' + (i + 1)" (click)="quitada.emit(f.id)">×</button>
          }
        </span>
      }
      @if (editable() && fotos().length < maximo()) {
        <label class="agregar" [style.width.px]="tamano()" [style.height.px]="tamano()" [class.agregar--cargando]="cargando()">
          <span class="icono" style="--icono: url(assets/tecnico/camara.svg)"></span>
          <span>{{ cargando() ? 'Cargando…' : fotos().length ? 'Otra foto' : 'Tomar o subir foto' }}</span>
          <input type="file" accept="image/*" capture="environment" multiple class="oculto" [disabled]="cargando()" (change)="elegir($any($event.target))" />
        </label>
      }
      @if (!editable() && !fotos().length) {
        <p class="vacio">{{ vacio() }}</p>
      }
    </div>
    @if (editable()) {
      <p class="nota" [class.nota--error]="!!error()">{{ error() || fotos().length + ' de ' + maximo() + ' · se guardan con la orden' }}</p>
    }
    @if (abierta() !== null && fotos()[abierta()!]; as f) {
      <div class="visor" (click)="abierta.set(null)" role="dialog" aria-modal="true" aria-label="Foto del equipo">
        <img [src]="f.url" [alt]="'Foto ' + (abierta()! + 1) + ' del equipo'" (click)="$event.stopPropagation()" />
        <p class="visor__pie">{{ abierta()! + 1 }} de {{ fotos().length }} · {{ f.por }} · {{ fecha(f.fecha) }}</p>
        @if (fotos().length > 1) {
          <button type="button" class="visor__nav visor__nav--ant" aria-label="Foto anterior" (click)="$event.stopPropagation(); mover(-1)">‹</button>
          <button type="button" class="visor__nav visor__nav--sig" aria-label="Foto siguiente" (click)="$event.stopPropagation(); mover(1)">›</button>
        }
        <button type="button" class="visor__cerrar" aria-label="Cerrar" (click)="abierta.set(null)">×</button>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .lista { display: flex; flex-wrap: wrap; gap: 8px; }
    .foto { position: relative; overflow: hidden; border-radius: 8px; background: var(--color-fondo-tenue); }
    .foto__ver { width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
    .foto__ver img { width: 100%; height: 100%; object-fit: cover; }
    .foto__quitar { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border: 0; border-radius: 999px; background: rgba(23, 55, 78, 0.75); font-size: 15px; line-height: 1; color: #fff; cursor: pointer; }
    .agregar { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px; border: 1px dashed var(--color-borde-control); border-radius: 8px; font-size: 10px; font-weight: 600; text-align: center; color: var(--color-primario); cursor: pointer; }
    .agregar:focus-within { outline: 2px solid var(--color-primario); }
    .agregar--cargando { opacity: 0.6; cursor: wait; }
    .agregar .icono { width: 18px; height: 18px; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .vacio, .nota { font-size: 12px; color: var(--color-texto-tenue); }
    .nota { margin-top: 6px; }
    .nota--error { color: var(--color-peligro); }
    .visor { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; background: rgba(10, 25, 36, 0.88); }
    .visor img { max-width: 100%; max-height: 80vh; border-radius: 8px; }
    .visor__pie { font-size: 12px; color: #fff; }
    .visor__nav, .visor__cerrar { position: absolute; width: 40px; height: 40px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.15); font-size: 24px; color: #fff; cursor: pointer; }
    .visor__nav { top: 50%; transform: translateY(-50%); }
    .visor__nav--ant { left: 12px; }
    .visor__nav--sig { right: 12px; }
    .visor__cerrar { top: 12px; right: 12px; }
  `,
})
export class FotosOrdenComponent {
  readonly fotos = input<FotoOrden[]>([]);
  readonly tamano = input(72);
  readonly editable = input(false);
  readonly maximo = input(6);
  readonly vacio = input('Sin fotos.');
  /** Imágenes nuevas ya reducidas. */
  readonly agregadas = output<{ url: string; nombre: string }[]>();
  readonly quitada = output<string>();

  protected readonly abierta = signal<number | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly lugares = computed(() => this.maximo() - this.fotos().length);

  protected async elegir(input: HTMLInputElement): Promise<void> {
    const archivos = Array.from(input.files ?? []);
    input.value = '';
    const validos = archivos.filter((f) => TIPOS.test(f.type) && f.size <= MAX_BYTES).slice(0, this.lugares());
    if (!archivos.length) return;
    this.error.set(validos.length < archivos.length ? `Solo se agregan fotos (JPG, PNG o HEIC de hasta 15 MB), máximo ${this.maximo()}.` : '');
    if (!validos.length) return;
    this.cargando.set(true);
    try {
      const listas = await Promise.all(validos.map(async (f) => ({ url: await reducirImagen(f), nombre: f.name })));
      this.agregadas.emit(listas);
    } catch {
      this.error.set('No se pudo leer una de las fotos. Intenta con otra.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected mover(paso: number): void {
    const n = this.fotos().length;
    this.abierta.update((i) => ((i ?? 0) + paso + n) % n);
  }

  protected fecha(iso: string): string {
    const f = new Date(iso);
    return `${f.getDate()} ${f.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')} · ${f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }

  @HostListener('document:keydown', ['$event'])
  protected teclas(e: KeyboardEvent): void {
    if (this.abierta() === null) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.abierta.set(null);
    } else if (e.key === 'ArrowRight') this.mover(1);
    else if (e.key === 'ArrowLeft') this.mover(-1);
  }
}
