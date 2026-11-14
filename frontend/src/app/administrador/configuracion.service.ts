import { Injectable, computed, inject, signal } from '@angular/core';
import { NEGOCIO } from '../cajera/documentos/documentos.service';
import { AJUSTES_TICKET, AVISO_PRIVACIDAD, CLAUSULAS_RECEPCION, Clausula } from '../compartido/ajustes-documentos';
import { ReglasTaller } from '../compartido/reglas-taller';
import { ConfiguracionTallerService, NivelManoObra } from '../jefe/configuracion/configuracion.service';

export { llenarClausula } from '../compartido/ajustes-documentos';
export type { Clausula } from '../compartido/ajustes-documentos';

export interface CajaConfig {
  nombre: string;
  ubicacion: string;
  fondo: number;
  turnos: string;
  terminal: string;
}

export interface MensajeAuto {
  id: string;
  nombre: string;
  cuando: string;
  portal: boolean;
  correo: boolean;
  activo: boolean;
  texto: string;
}

export interface Configuracion {
  /** logo: imagen elegida en AD9.1 (data URL); null = logo de SHURI. */
  negocio: { nombre: string; razonSocial: string; direccion: string; telefono: string; rfc: string; logo: string | null };
  ticket: { encabezado: string; pie: string; logo: boolean; desgloseIva: boolean; quienCobro: boolean };
  cajas: CajaConfig[];
  pagos: { tarjeta: boolean; comisionTarjeta: number; transferencia: boolean; mixto: boolean };
  transferencia: { banco: string; clabe: string; titular: string };
  clausulas: Clausula[];
  privacidad: string;
  fiscal: { rfc: string; razonSocial: string; regimen: string; cp: string; serie: string; global: 'mensual' | 'bimestral'; autofactura: boolean; vigenciaCsd: string; cer: string; key: string };
  mensajes: MensajeAuto[];
  correo: { remitente: string; correoRemitente: string; responderA: string; servidor: string; puerto: number; seguridad: 'TLS' | 'SSL' | 'Ninguna'; usuario: string };
}

export const REGIMENES = [
  { clave: '601', texto: '601 · General de Ley Personas Morales' },
  { clave: '612', texto: '612 · Personas Físicas con Actividades Empresariales' },
  { clave: '626', texto: '626 · Régimen Simplificado de Confianza' },
];

export const BANCOS = ['BBVA', 'Banorte', 'Santander', 'Banamex', 'HSBC', 'Scotiabank', 'BanCoppel', 'Azteca'];

/** Variables que puede llevar el texto de un mensaje automático (Figma AD9.6). */
export const VARIABLES_MENSAJE = ['{cliente}', '{equipo}', '{folio}', '{negocio}', '{restante}', '{enlace}'];

const DEMO: Configuracion = {
  negocio: { nombre: 'SHURI · Reparaciones y Ventas', razonSocial: 'SHURI Reparaciones y Ventas S.A. de C.V.', direccion: 'Av. Juárez 128, Col. Centro, C.P. 06000, Ciudad de México', telefono: '55 1234 0000', rfc: 'SRV250101AB1', logo: null },
  ticket: { ...AJUSTES_TICKET },
  cajas: [{ nombre: 'Caja 01', ubicacion: 'Mostrador principal', fondo: 1000, turnos: 'Matutino · Vespertino', terminal: 'Terminal BBVA ••4821' }],
  pagos: { tarjeta: true, comisionTarjeta: 3.5, transferencia: true, mixto: true },
  transferencia: { banco: 'BBVA', clabe: '012180001234564821', titular: 'SHURI Reparaciones y Ventas S.A. de C.V.' },
  clausulas: CLAUSULAS_RECEPCION.map((c) => ({ ...c })),
  privacidad: AVISO_PRIVACIDAD.texto,
  fiscal: { rfc: 'SRV250101AB1', razonSocial: 'SHURI', regimen: '601', cp: '06000', serie: 'A', global: 'mensual', autofactura: true, vigenciaCsd: '2029-01-14', cer: '00001000000512345678.cer', key: 'CSD_SRV250101AB1.key' },
  mensajes: [
    { id: 'temporal', nombre: 'Contraseña temporal', cuando: 'Folio de cliente nuevo o si la pide', portal: true, correo: false, activo: true, texto: 'Hola {cliente}, tu acceso al portal de {negocio} está listo. Folio {folio}. Entra en {enlace} con tu contraseña temporal.' },
    { id: 'recibido', nombre: 'Equipo recibido', cuando: 'Al registrar la orden en caja', portal: true, correo: false, activo: true, texto: 'Hola {cliente}, recibimos tu {equipo} con el folio {folio}. Te avisaremos cuando tengamos el presupuesto: {enlace}' },
    { id: 'presupuesto', nombre: 'Presupuesto listo', cuando: 'Cuando el jefe envía el presupuesto', portal: true, correo: false, activo: true, texto: 'Hola {cliente}, el presupuesto de tu {equipo} (folio {folio}) ya está listo. Revísalo y autorízalo en {enlace}' },
    { id: 'dato', nombre: 'Necesitamos un dato tuyo', cuando: 'Cuando el técnico pide información', portal: true, correo: true, activo: true, texto: 'Hola {cliente}, el técnico necesita un dato para seguir con tu {equipo} (folio {folio}). Contéstanos en {enlace}' },
    { id: 'adicional', nombre: 'Cargo adicional', cuando: 'Cuando hay re-cotización', portal: true, correo: false, activo: true, texto: 'Hola {cliente}, encontramos algo más en tu {equipo} (folio {folio}). Revisa el cargo adicional en {enlace}' },
    { id: 'listo', nombre: 'Listo para recoger', cuando: 'Al marcar la orden como lista', portal: true, correo: true, activo: true, texto: 'Hola {cliente}, tu {equipo} ya está listo en {negocio}. Folio {folio}. Total a pagar: {restante}. Sigue tu orden: {enlace}' },
    { id: 'bodega', nombre: 'Recordatorio de bodega', cuando: 'A los 25 días sin recoger', portal: true, correo: false, activo: true, texto: 'Hola {cliente}, tu {equipo} (folio {folio}) sigue esperándote en {negocio}. Pronto empieza a cobrarse almacenaje: {enlace}' },
    { id: 'garantia', nombre: 'Dictamen de garantía', cuando: 'Cuando el jefe publica el dictamen', portal: true, correo: false, activo: true, texto: 'Hola {cliente}, ya tenemos el dictamen de la garantía de tu {equipo} (folio {folio}). Consúltalo en {enlace}' },
  ],
  correo: { remitente: 'SHURI Reparaciones y Ventas', correoRemitente: 'avisos@shuri.mx', responderA: 'No se reciben respuestas (usa el chat)', servidor: 'smtp.shuri.mx', puerto: 587, seguridad: 'TLS', usuario: 'avisos@shuri.mx' },
};

/** Datos del emisor que usan las facturas (AD6); se actualizan al guardar AD9.5. */
export const EMISOR_FISCAL = { rfc: DEMO.fiscal.rfc, razonSocial: DEMO.fiscal.razonSocial, regimen: DEMO.fiscal.regimen, cp: DEMO.fiscal.cp, serie: DEMO.fiscal.serie, autofactura: DEMO.fiscal.autofactura };

const copia = <T>(v: T): T => structuredClone(v);

/**
 * AD9 · Configuración del negocio. Todas las pestañas editan un borrador que se guarda junto con "Guardar cambios".
 * Simulado en memoria: al conectar la API se guardará en el servidor.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly taller = inject(ConfiguracionTallerService);
  /** Borrador del tabulador y las reglas del taller (los mismos de J9). */
  readonly niveles = signal<NivelManoObra[]>(copia(this.taller.niveles()));
  readonly reglas = signal<ReglasTaller>({ ...this.taller.reglas() });
  readonly guardada = signal<Configuracion>(copia(DEMO));
  readonly borrador = signal<Configuracion>(copia(DEMO));
  /** "Conexión verificada · último correo…" (AD9.7). */
  readonly pruebaCorreo = signal<string>('');

  /** Secciones con cambios sin guardar. */
  readonly pendientes = computed(() => {
    const a = this.guardada();
    const b = this.borrador();
    const secciones: string[] = (Object.keys(b) as (keyof Configuracion)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (JSON.stringify(this.niveles()) !== JSON.stringify(this.taller.niveles()) || JSON.stringify(this.reglas()) !== JSON.stringify(this.taller.reglas())) secciones.push('taller');
    return secciones;
  });

  /** Lo que impide guardar, con la pestaña donde se corrige. */
  readonly errores = computed(() => {
    const c = this.borrador();
    const e: { pestana: string; texto: string }[] = [];
    if (!c.negocio.nombre.trim()) e.push({ pestana: 'negocio', texto: 'falta el nombre comercial' });
    if (!/^\d{18}$/.test(c.transferencia.clabe)) e.push({ pestana: 'cajas', texto: 'la CLABE debe tener 18 dígitos' });
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(c.fiscal.rfc)) e.push({ pestana: 'facturacion', texto: 'el RFC del emisor no es válido' });
    if (!c.fiscal.razonSocial.trim() || !/^\d{5}$/.test(c.fiscal.cp) || !/^[A-Z]{1,4}$/.test(c.fiscal.serie)) e.push({ pestana: 'facturacion', texto: 'revisa razón social, C.P. y serie' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.correo.correoRemitente) || !c.correo.servidor.trim() || !c.correo.usuario.trim() || !c.correo.remitente.trim()) e.push({ pestana: 'correo', texto: 'faltan datos de la cuenta de envío' });
    if (c.clausulas.some((k) => !k.titulo.trim() || !k.texto.trim())) e.push({ pestana: 'documentos', texto: 'hay una cláusula sin título o sin texto' });
    if (this.niveles().some((n) => !n.nivel.trim())) e.push({ pestana: 'taller', texto: 'hay un nivel del tabulador sin nombre' });
    return e;
  });

  cambiar<K extends keyof Configuracion>(seccion: K, valor: Configuracion[K]): void {
    this.borrador.update((c) => ({ ...c, [seccion]: valor }));
  }

  /** Cambia un campo de una sección de objeto (negocio, ticket, pagos…). */
  campo<K extends 'negocio' | 'ticket' | 'pagos' | 'transferencia' | 'fiscal' | 'correo', C extends keyof Configuracion[K]>(seccion: K, campo: C, valor: Configuracion[K][C]): void {
    this.borrador.update((c) => ({ ...c, [seccion]: { ...c[seccion], [campo]: valor } }));
  }

  descartar(): void {
    this.borrador.set(copia(this.guardada()));
    this.niveles.set(copia(this.taller.niveles()));
    this.reglas.set({ ...this.taller.reglas() });
  }

  /** Guarda todo; regresa lo que cambió del taller (para la bitácora de J9 y AD8). */
  guardar(por: string): string[] {
    const delTaller = this.pendientes().includes('taller') ? this.taller.guardar(this.niveles(), this.reglas(), por) : [];
    this.niveles.set(copia(this.taller.niveles()));
    this.reglas.set({ ...this.taller.reglas() });
    const c = copia(this.borrador());
    this.guardada.set(c);
    this.borrador.set(copia(c));
    Object.assign(EMISOR_FISCAL, { rfc: c.fiscal.rfc, razonSocial: c.fiscal.razonSocial, regimen: c.fiscal.regimen, cp: c.fiscal.cp, serie: c.fiscal.serie, autofactura: c.fiscal.autofactura });
    // Lo que leen los documentos impresos (C11).
    Object.assign(AJUSTES_TICKET, c.ticket);
    AVISO_PRIVACIDAD.texto = c.privacidad;
    CLAUSULAS_RECEPCION.splice(0, CLAUSULAS_RECEPCION.length, ...c.clausulas.map((k) => ({ ...k })));
    const [marca, ...lema] = c.negocio.nombre.split(' · ');
    Object.assign(NEGOCIO, {
      nombre: marca.trim(),
      lema: (lema.join(' · ') || NEGOCIO.lema).toUpperCase(),
      direccion: `${marca.trim()} · ${c.negocio.direccion.replace(/,? ?C\.P\. \d{5}/, '')}`,
      direccionLarga: `${marca.trim()} · ${c.negocio.direccion}`,
      rfc: c.fiscal.rfc,
      telefono: c.negocio.telefono,
      direccionCorta: `${marca.trim()} · ${c.negocio.direccion.split(',').slice(0, 2).join(',')}`,
    });
    return delTaller;
  }
}
