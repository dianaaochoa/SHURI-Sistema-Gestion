/**
 * Catálogo fijo de preguntas de seguridad, igual al del backend (`App\Support\SecurityQuestions`,
 * `GET /security-questions`): se guarda la clave y se muestra el texto.
 * El personal ya lo pide a la API (`AuthService.preguntasSecretas`); el portal del cliente, mientras no esté
 * conectado, usa esta copia.
 */
export const PREGUNTAS_SEGURIDAD = [
  { clave: 'first_pet', texto: '¿Cómo se llamaba tu primera mascota?' },
  { clave: 'birth_city', texto: '¿En qué ciudad naciste?' },
  { clave: 'first_school', texto: '¿Cómo se llamaba tu escuela primaria?' },
  { clave: 'childhood_friend', texto: '¿Cómo se llama tu mejor amigo(a) de la infancia?' },
  { clave: 'favorite_teacher', texto: '¿Cuál es el apellido de tu maestro(a) favorito(a)?' },
  { clave: 'first_job', texto: '¿En qué empresa fue tu primer trabajo?' },
] as const;

export type ClavePregunta = (typeof PREGUNTAS_SEGURIDAD)[number]['clave'];

export const textoPregunta = (clave: string) => PREGUNTAS_SEGURIDAD.find((p) => p.clave === clave)?.texto ?? clave;

export interface PreguntaSeguridad {
  clave: ClavePregunta;
  /** Guardada sin acentos, en minúsculas y sin espacios de más (así “Firulais ” = “firulais”), como `SecurityQuestions::normalize`. */
  respuesta: string;
}

/** “ Firuláis ” → “firulais” */
export const normalizarRespuesta = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

/** “ma•••••••@gmail.com” */
export function enmascararCorreo(correo: string): string {
  const [nombre, dominio] = correo.split('@');
  return `${nombre.slice(0, 2)}${'•'.repeat(Math.max(nombre.length - 2, 3))}@${dominio}`;
}
