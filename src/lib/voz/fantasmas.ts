/** Frases que Whisper inventa cuando oye ruido o silencio: se descartan. */
const FANTASMAS = new Set([
  "gracias",
  "muchas gracias",
  "gracias por ver",
  "gracias por ver el video",
  "suscribete",
  "subtitulos realizados por la comunidad de amara.org",
]);

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[¡!¿?,;:"“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "")
    .trim();
}

export function esFantasma(texto: string): boolean {
  const limpio = normalizar(texto);
  return limpio === "" || FANTASMAS.has(limpio);
}
