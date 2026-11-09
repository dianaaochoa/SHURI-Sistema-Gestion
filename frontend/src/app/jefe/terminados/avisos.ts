import { Orden } from '../../cajera/ordenes/ordenes.service';

/** Avisos al cliente para recoger (los de "Listo" y los recordatorios), sin contar el de la entrega. */
export const avisosDe = (o: Orden) => o.contactos.filter((c) => /aviso|recordatorio/i.test(c.texto) && !/entrega/i.test(c.texto));
