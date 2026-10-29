/** Espera antes del reintento número `intento` (desde 0): 1, 2, 4, 8 y después 10 segundos. */
export function esperaReconexion(intento: number): number {
  return Math.min(1000 * 2 ** intento, 10_000);
}
