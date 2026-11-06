/** El total que paga la compradora: la prenda más el envío, si lo hay (centavos). */
export function totalPedido(precio: number, envio: number | null): number {
  return precio + (envio ?? 0);
}

/** Cuánto falta para el plazo de pago: milisegundos (nunca negativos) y "mm:ss". */
export function restante(deadline: string, ahora: number): { ms: number; texto: string } {
  const ms = Math.max(0, new Date(deadline).getTime() - ahora);
  const total = Math.floor(ms / 1000);
  const minutos = Math.floor(total / 60);
  const segundos = String(total % 60).padStart(2, "0");
  return { ms, texto: `${minutos}:${segundos}` };
}
