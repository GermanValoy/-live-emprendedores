import { estadoSala } from "./sala";
import type { ConfigVivo, Vivo } from "./tipos";

/** Cómo se muestra un vivo abierto en "En vivo ahora". */
export type EstadoPortada = "en-vivo" | "vuelve-pronto";

/**
 * Misma regla que la sala: si la feriante salió de la pantalla o hace rato que no llega su señal
 * (se le cortó la conexión), el vivo sigue abierto pero no se muestra como "EN VIVO".
 * `horaBase` es la hora de la base en milisegundos (el reloj del celular corregido).
 */
export function estadoEnPortada(vivo: Vivo, horaBase: number, config: ConfigVivo): EstadoPortada {
  const estado = estadoSala(vivo, horaBase, config);
  return estado === "vuelve-pronto" || estado === "reconectando-feriante" ? "vuelve-pronto" : "en-vivo";
}

/** Primero los que transmiten (el que más gente tiene primero); al final los que vuelven en un momento. */
export function ordenarPortada<T extends { viewers: number; estado: EstadoPortada }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(a.estado === "vuelve-pronto") - Number(b.estado === "vuelve-pronto") || b.viewers - a.viewers,
  );
}

/**
 * Los puestos que están transmitiendo ahora, para la lista de puestos (se calcula en el servidor, con su hora).
 * `ahora` se puede pasar en las pruebas.
 */
export function puestosTransmitiendo(
  vivos: { vivo: Vivo; puesto: { id: string } }[],
  config: ConfigVivo,
  ahora: number = Date.now(),
): Set<string> {
  return new Set(vivos.filter((v) => estadoEnPortada(v.vivo, ahora, config) === "en-vivo").map((v) => v.puesto.id));
}