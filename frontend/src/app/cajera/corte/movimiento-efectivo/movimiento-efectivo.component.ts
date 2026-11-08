import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { AuthService } from '../../../acceso/auth.service';
import { formatearDinero } from '../../../compartido/formato';
import { CajaService } from '../../caja.service';
import { CorteService } from '../corte.service';
import { DocumentosService } from '../../documentos/documentos.service';

type Tipo = 'retiro' | 'ingreso';

const MOTIVOS: Record<Tipo, string[]> = {
  retiro: ['Envío a gerencia', 'Depósito bancario', 'Gasto menor (papelería, limpieza)', 'Otro'],
  ingreso: ['Cambio de billetes', 'Reposición de fondo', 'Corrección', 'Otro'],
};

/** C10.3 · Movimiento de efectivo (modal): retiro a gerencia o ingreso a la caja. */
@Component({
  selector: 'app-movimiento-efectivo',
  standalone: true,
  template: `
    <div class="modal-fondo" (click)="cerrar.emit()">
      <section class="modal movimiento" role="dialog" aria-modal="true" aria-labelledby="titulo-movimiento" (click)="$event.stopPropagation()">
        <header class="modal__encabezado">
          <div>
            <h2 class="modal__titulo" id="titulo-movimiento">Movimiento de efectivo</h2>
            <p class="modal__subtitulo">Turno {{ turno() }} · Efectivo esperado en caja: {{ dinero(antes()) }}</p>
          </div>
          <button type="button" class="modal__cerrar" aria-label="Cerrar" (click)="cerrar.emit()">
            <img src="assets/inventario/x.svg" width="20" height="20" alt="" />
          </button>
        </header>

        <div class="selector" role="radiogroup" aria-label="Tipo de movimiento">
          <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="tipo() === 'retiro'" [attr.aria-checked]="tipo() === 'retiro'" (click)="cambiarTipo('retiro')">
            <span class="flecha">↑</span>Retiro
          </button>
          <button type="button" role="radio" class="selector__opcion" [class.selector__opcion--elegida]="tipo() === 'ingreso'" [attr.aria-checked]="tipo() === 'ingreso'" (click)="cambiarTipo('ingreso')">
            <span class="flecha">↓</span>Ingreso
          </button>
        </div>

        <div class="campos">
          <div class="campo">
            <label class="campo__etiqueta" for="mov-monto">Monto *</label>
            <div class="campo__control campo__control--40" [class.campo__control--error]="error('monto')">
              <span class="moneda">$</span>
              <input id="mov-monto" class="campo__input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" [value]="monto() ?? ''" (input)="monto.set($any($event.target).value === '' ? null : +$any($event.target).value)" />
            </div>
            @if (error('monto'); as e) { <p class="campo__error">{{ e }}</p> }
          </div>
          <div class="campo">
            <label class="campo__etiqueta" for="mov-motivo">Motivo *</label>
            <div class="campo__control campo__control--40">
              <select id="mov-motivo" class="campo__input campo__select" (change)="motivo.set($any($event.target).value)">
                @for (m of motivos(); track m) { <option [value]="m" [selected]="m === motivo()">{{ m }}</option> }
              </select>
              <img src="assets/cajera/chev-d.svg" width="16" height="16" alt="" />
            </div>
          </div>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="mov-comentario">Comentario{{ motivo() === 'Otro' ? ' *' : '' }}</label>
          <div class="campo__control campo__control--40" [class.campo__control--error]="error('comentario')">
            <input id="mov-comentario" class="campo__input" autocomplete="off" maxlength="120" [placeholder]="tipo() === 'retiro' ? 'Ej. Retiro para depósito bancario del mediodía' : 'Ej. Cambio de un billete de $500 en morralla'" [value]="comentario()" (input)="comentario.set($any($event.target).value)" />
          </div>
          @if (error('comentario'); as e) { <p class="campo__error">{{ e }}</p> }
        </div>

        <div class="cuadro">
          <p><span>Efectivo en caja antes</span><strong>{{ dinero(antes()) }}</strong></p>
          <p><span>{{ tipo() === 'retiro' ? 'Retiro' : 'Ingreso' }}</span><strong [class.menos]="tipo() === 'retiro'">{{ tipo() === 'retiro' ? '− ' : '+ ' }}{{ dinero(monto() ?? 0) }}</strong></p>
          <p class="cuadro__total"><span>Efectivo en caja después</span><strong>{{ dinero(despues()) }}</strong></p>
        </div>

        <p class="nota">Motivos de ingreso: cambio de billetes, reposición de fondo o corrección. Se imprime un comprobante para firmar.</p>

        <div class="modal__acciones">
          <button type="button" class="boton boton--contorno boton--44" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" class="boton boton--primario boton--44" (click)="registrar()">
            <span class="icono" style="--icono: url(assets/pdv/printer.svg)"></span>Registrar e imprimir
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .movimiento { max-width: 560px; }
    .flecha { font-size: 18px; line-height: 1; }
    .campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .campo__control { gap: 6px; }
    .moneda { font-size: 14px; color: var(--color-texto-tenue); }
    .cuadro { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; border-radius: 8px; background: var(--color-fondo); }
    .cuadro p { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--color-texto-tenue); }
    .cuadro strong { font-weight: 600; color: var(--color-marino); }
    .cuadro .menos { color: var(--color-peligro); }
    .cuadro__total { align-items: center; font-weight: 600; color: var(--color-marino) !important; }
    .cuadro__total strong { font-size: 20px; font-weight: 700; }
    .nota { font-size: 11px; color: var(--color-texto-tenue); }
    .boton .icono { width: 16px; height: 16px; }
    @media (max-width: 480px) { .campos { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class MovimientoEfectivoComponent implements OnInit {
  private readonly caja = inject(CajaService);
  private readonly cajera = inject(AuthService).sesion()?.nombre ?? '';
  private readonly documentos = inject(DocumentosService);
  readonly tipoInicial = input<Tipo>('retiro');
  readonly cerrar = output<void>();
  readonly registrado = output<string>();

  protected readonly antes = inject(CorteService).efectivoEnCaja;
  protected readonly tipo = signal<Tipo>('retiro');
  protected readonly monto = signal<number | null>(null);
  protected readonly motivo = signal(MOTIVOS.retiro[0]);
  protected readonly comentario = signal('');
  protected readonly intentado = signal(false);

  protected readonly motivos = computed(() => MOTIVOS[this.tipo()]);
  protected readonly turno = computed(() => {
    const t = this.caja.turno();
    return t ? `${t.turno.toLowerCase()} · ${t.caja}` : '';
  });
  protected readonly despues = computed(() => this.antes() + (this.tipo() === 'retiro' ? -1 : 1) * (this.monto() ?? 0));

  private readonly errores = computed(() => {
    const e: Record<string, string> = {};
    const m = this.monto();
    if (!m || m <= 0) e['monto'] = 'Escribe el monto';
    else if (this.tipo() === 'retiro' && m > this.antes()) e['monto'] = `En caja solo hay ${formatearDinero(this.antes())}`;
    if (this.motivo() === 'Otro' && !this.comentario().trim()) e['comentario'] = 'Explica el motivo';
    return e;
  });

  protected error(campo: string): string | null {
    return this.intentado() ? (this.errores()[campo] ?? null) : null;
  }

  ngOnInit(): void {
    this.cambiarTipo(this.tipoInicial());
  }

  protected dinero(importe: number): string {
    return formatearDinero(importe);
  }

  protected cambiarTipo(tipo: Tipo): void {
    this.tipo.set(tipo);
    this.motivo.set(MOTIVOS[tipo][0]);
  }

  protected registrar(): void {
    this.intentado.set(true);
    if (Object.keys(this.errores()).length) return;
    const monto = Math.round(this.monto()! * 100) / 100;
    // Se lee antes de registrar: después, "antes" ya incluye este movimiento.
    const despues = this.despues();
    const antes = this.antes();
    const movimiento = this.caja.registrarMovimiento({ tipo: this.tipo(), monto, motivo: this.motivo(), comentario: this.comentario().trim() });
    const turno = this.caja.turno();
    const impreso = this.documentos.imprimir({ tipo: 'movimiento', movimiento, antes, despues, cajera: this.cajera, caja: turno?.caja ?? 'Caja 01' });
    const texto = `${this.tipo() === 'retiro' ? 'Retiro' : 'Ingreso'} de ${formatearDinero(monto)} (${this.motivo().toLowerCase()}) registrado · quedan ${formatearDinero(despues)} en caja`;
    this.registrado.emit(impreso ? `${texto} · comprobante impreso` : `${texto} · no se pudo imprimir el comprobante`);
  }

  @HostListener('document:keydown.escape')
  protected alPresionarEsc(): void {
    this.cerrar.emit();
  }
}
