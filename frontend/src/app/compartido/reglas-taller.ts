/**
 * Reglas del taller que se cambian en Configuración (J9) y que leen el tablero, el cotizador y la política de bodega.
 * Es un objeto simple (no una señal) para que funciones como `atrasada()` lo lean sin inyectar nada;
 * las pantallas toman el valor nuevo al volver a abrirse. Con la API vendrán del servidor.
 */
export type DespuesResguardo = 'resguardo' | 'cobrar' | 'avisar';

export const REGLAS_TALLER = {
  /** Horas para diagnosticar y cotizar desde que se recibe (J2, J3). */
  slaDiagnosticoH: 24,
  /** Vigencia por defecto del presupuesto (J3.2). */
  vigenciaDias: 7,
  garantiaDias: 30,
  garantiaDesde: 'entrega' as 'entrega' | 'reparacion',
  /** Días en bodega sin cobro y almacenaje por día después (J8). */
  diasSinCobro: 30,
  almacenajeDia: 20,
  diasResguardo: 90,
  despuesResguardo: 'resguardo' as DespuesResguardo,
  /** Cobro de revisión de un equipo sin reparación (J3.3): el nivel "Revisión / diagnóstico" del tabulador. */
  revision: 300,
};

export type ReglasTaller = typeof REGLAS_TALLER;

export const DESPUES_RESGUARDO: Record<DespuesResguardo, string> = {
  resguardo: 'El equipo pasa a resguardo',
  cobrar: 'Se sigue cobrando almacenaje',
  avisar: 'Solo se avisa al cliente',
};
