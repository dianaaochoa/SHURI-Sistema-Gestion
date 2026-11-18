/**
 * Tokens de la API (Laravel Sanctum). El personal y el portal del cliente tienen
 * cada uno el suyo: la API rechaza el token de un cliente en las rutas del personal y al revés.
 */
export type AmbitoToken = 'personal' | 'portal';

const CLAVES: Record<AmbitoToken, string> = {
  personal: 'shuri.token',
  portal: 'shuri.portal.token',
};

/** Token guardado, o null si no hay sesión. */
export function leerToken(ambito: AmbitoToken): string | null {
  const clave = CLAVES[ambito];
  return localStorage.getItem(clave) ?? sessionStorage.getItem(clave);
}

/**
 * Guarda el token. Con "Recordarme" (solo el personal) sobrevive a cerrar el navegador;
 * sin él, se borra al cerrar la pestaña.
 */
export function guardarToken(ambito: AmbitoToken, token: string, recordar = false): void {
  const clave = CLAVES[ambito];
  borrarToken(ambito);
  (recordar ? localStorage : sessionStorage).setItem(clave, token);
}

export function borrarToken(ambito: AmbitoToken): void {
  localStorage.removeItem(CLAVES[ambito]);
  sessionStorage.removeItem(CLAVES[ambito]);
}
