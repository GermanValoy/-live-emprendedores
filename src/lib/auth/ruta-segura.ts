const DESTINO_POR_DEFECTO = "/cuenta";
const ORIGEN_PROPIO = "http://tuferia.interno";

/** Devuelve el destino solo si es una ruta interna; evita redirigir a otros sitios. */
export function rutaSegura(next: string | null): string {
  if (!next || !next.startsWith("/")) return DESTINO_POR_DEFECTO;
  // Se resuelve la dirección completa (como lo hará el navegador) y se exige que siga en el sitio.
  // Esto también cubre trucos como "//otro.com", "/\otro.com" o tabulaciones escondidas.
  const url = new URL(next, ORIGEN_PROPIO);
  if (url.origin !== ORIGEN_PROPIO) return DESTINO_POR_DEFECTO;
  return `${url.pathname}${url.search}${url.hash}`;
}
