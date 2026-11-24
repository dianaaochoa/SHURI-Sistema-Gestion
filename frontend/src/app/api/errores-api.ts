import { HttpErrorResponse } from '@angular/common/http';

/**
 * Respuesta de error de la API (docs/api/endpoints.md §1):
 * { message, code?, errors?: { campo: [mensajes] } }
 */
export interface ErrorApi {
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

/** Mensaje para mostrar al usuario, ya en español desde la API. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No hay conexión con el servidor. Revisa tu internet.';
    }
    const cuerpo = error.error as Partial<ErrorApi> | null;
    if (cuerpo?.message) {
      return cuerpo.message;
    }
  }
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/**
 * Errores de validación (422) por campo, con el primer mensaje de cada uno,
 * para mostrarlos debajo de su input: { email: 'El campo correo es obligatorio.' }
 */
export function erroresDeCampos(error: unknown): Record<string, string> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return {};
  }
  const errores = (error.error as Partial<ErrorApi> | null)?.errors ?? {};
  return Object.fromEntries(Object.entries(errores).map(([campo, mensajes]) => [campo, mensajes[0] ?? '']));
}

/** Código del error (FORBIDDEN, ACCOUNT_LOCKED, INSUFFICIENT_STOCK…), si la API lo mandó. */
export function codigoDeError(error: unknown): string | null {
  return error instanceof HttpErrorResponse ? ((error.error as Partial<ErrorApi> | null)?.code ?? null) : null;
}
