import { DestroyRef, Signal, inject, signal } from '@angular/core';

/** Figma T7: la tablet del técnico va de 769 a 1180 px de ancho (debajo es celular, arriba escritorio). */
export const TABLET = '(min-width: 769px) and (max-width: 1180px)';

/** Señal que dice si la pantalla está en tamaño tablet; se actualiza al girar o cambiar el tamaño. */
export function enTablet(): Signal<boolean> {
  const consulta = matchMedia(TABLET);
  const tablet = signal(consulta.matches);
  const cambio = (e: MediaQueryListEvent) => tablet.set(e.matches);
  consulta.addEventListener('change', cambio);
  inject(DestroyRef).onDestroy(() => consulta.removeEventListener('change', cambio));
  return tablet.asReadonly();
}
