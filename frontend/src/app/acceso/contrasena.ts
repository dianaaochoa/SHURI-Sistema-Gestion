/** Reglas de contraseña del personal (A.5 Crear contraseña y C1.6 Mi perfil). */
export const REQUISITOS = [
  { texto: 'Al menos 8 caracteres', cumple: (v: string) => v.length >= 8 },
  { texto: 'Una letra mayúscula', cumple: (v: string) => /[A-ZÁÉÍÓÚÑ]/.test(v) },
  { texto: 'Un número', cumple: (v: string) => /\d/.test(v) },
  { texto: 'Un símbolo (!@#$)', cumple: (v: string) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(v) },
];
