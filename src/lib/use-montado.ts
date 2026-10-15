import { useSyncExternalStore } from "react";

const nada = () => () => {};

/**
 * Indica si la pantalla ya está "activa" en el navegador (hidratada).
 * Antes de eso, elegir un archivo no dispara nada, así que esos controles se deshabilitan.
 */
export function useMontado(): boolean {
  return useSyncExternalStore(nada, () => true, () => false);
}
