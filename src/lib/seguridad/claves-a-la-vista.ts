/** Formas de claves que nunca pueden llegar al navegador, aunque no se conozca su valor. */
const FORMAS: { nombre: string; patron: RegExp }[] = [
  { nombre: "una clave secreta de Supabase (sb_secret_…)", patron: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { nombre: "una dirección de base de datos con contraseña", patron: /postgres(?:ql)?:\/\/[^\s:/@"'`]+:[^\s@"'`]+@/ },
];

/**
 * Qué claves aparecen en un texto que ve el navegador (páginas y archivos JS).
 * Devuelve solo los nombres, nunca los valores, para que se puedan mostrar sin riesgo.
 */
export function clavesALaVista(texto: string, secretos: Record<string, string | undefined>): string[] {
  const conocidas = Object.entries(secretos)
    .filter(([, valor]) => valor && texto.includes(valor))
    .map(([nombre]) => nombre);
  const porForma = FORMAS.filter(({ patron }) => patron.test(texto)).map(({ nombre }) => nombre);
  return [...conocidas, ...porForma];
}
