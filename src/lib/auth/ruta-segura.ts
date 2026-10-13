const DESTINO_POR_DEFECTO = "/cuenta";

/** Devuelve el destino solo si es una ruta interna; evita redirigir a otros sitios. */
export function rutaSegura(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DESTINO_POR_DEFECTO;
  }
  return next;
}
