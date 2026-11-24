/**
 * Configuración del entorno. La URL de la API vive solo aquí:
 * los servicios la importan en lugar de escribirla cada uno.
 */
export const environment = {
  production: false,
  /** Backend de Laravel (`php artisan serve`). */
  apiUrl: 'http://localhost:8000/api/v1',
};
