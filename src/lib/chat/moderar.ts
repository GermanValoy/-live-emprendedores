import type { MotivoOculto } from "./tipos";

// Moderador automático del chat (reglas 1 a 3 del diseño, sección 6).
// Es lógica pura: la lista de insultos vive en la base y llega por parámetro.

const SUSTITUCIONES: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "@": "a",
  $: "s",
};

/** Recorta, une espacios repetidos y saca caracteres de control. */
export function limpiarTexto(texto: string): string {
  return texto
    .replace(/\s+/g, " ")
    .replace(/\p{Cc}/gu, "")
    .trim();
}

/** Cantidad de caracteres que ve la persona (un emoji cuenta uno). */
export function largoVisible(texto: string): number {
  return [...texto].length;
}

/**
 * Forma "pareja" del texto, para comparar: minúsculas, sin tildes (la ñ queda),
 * letras repetidas 3+ veces reducidas a una, dígitos/símbolos cambiados por letras
 * solo dentro de palabras que ya tengan letras, y sin signos.
 */
export function normalizar(texto: string): string {
  const base = texto
    .toLowerCase()
    .replace(/ñ/g, "\u0001")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\u0001/g, "ñ");
  const palabras = base.split(/\s+/).map((palabra) =>
    /\p{L}/u.test(palabra)
      ? palabra.replace(/[013458@$]/g, (c) => SUSTITUCIONES[c] ?? c)
      : palabra,
  );
  return palabras
    .join(" ")
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Regla 1: links ---------------------------------------------------------

const REGLAS_LINK: RegExp[] = [
  /https?:\/\//,
  /\bwww\b/,
  /\bw\s*w\s*w\s*\./,
  // TLD largos: se admite un espacio antes del punto ("ofertas .com"), nunca después.
  /[a-z0-9-]\s*\.(?:com|net|org|shop|store|tienda|link|live|info|biz|site|online)\b/,
  // TLD cortos (se confunden con una oración pegada, "dale.me lo guardas"): sin espacios y al final o con "/".
  /[a-z0-9-]{2,}\.(?:ar|co|io|me|ly|app)(?:\/|[!?.,]*$)/,
  /\bpunto\s+(?:com|net|org|ar|co|io|me|ly|shop|store|tienda|app|link|live|info|biz|site|online)\b/,
  /\bdot\s+(?:com|net|org|ar|co|io|me|ly|shop|store|tienda|app|link|live|info|biz|site|online)\b/,
];

function esLink(crudo: string): boolean {
  const t = crudo.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return REGLAS_LINK.some((r) => r.test(t));
}

// --- Regla 2: promoción -----------------------------------------------------

// Frases ya normalizadas, comparadas por palabra entera.
const FRASES_PROMO = [
  "seguime en",
  "seguime",
  "sigueme en",
  "pasate por mi",
  "visita mi",
  "mira mi perfil",
  "mi perfil",
  "mi pagina",
  "vendo",
  "hago envios",
  "hacemos envios",
  "escribime al privado",
];

/** 7 o más dígitos (con espacios, puntos o guiones entre grupos), salvo montos con $. */
function tieneTelefono(crudo: string): boolean {
  const sinMontos = crudo.replace(/\$\s*\d[\d.,]*/g, " ");
  for (const m of sinMontos.matchAll(/\d+(?:[\s.\-]\d+)*/g)) {
    const grupos = m[0].split(/[\s.\-]/);
    const digitos = grupos.join("").length;
    // Al menos un grupo de 3 dígitos: "40 42 44 46" es una lista de talles.
    if (digitos >= 7 && grupos.some((g) => g.length >= 3)) return true;
  }
  return false;
}

function esPromocion(crudo: string, norm: string): boolean {
  if (tieneTelefono(crudo)) return true;
  if (/@[\p{L}\p{N}_]{2,}/u.test(crudo)) return true;
  const conBordes = ` ${norm} `;
  return FRASES_PROMO.some((f) => conBordes.includes(` ${f} `));
}

// --- Regla 3: insultos ------------------------------------------------------

function tieneInsulto(norm: string, palabras: ReadonlySet<string>): boolean {
  // Segunda forma: la última letra de cada palabra repetida ("boludoo" -> "boludo").
  const sinFinalRepetido = norm.replace(/(\p{L})\1+(?=\s|$)/gu, "$1");
  const formas = [` ${norm} `, ` ${sinFinalRepetido} `];
  for (const palabra of palabras) {
    if (!palabra) continue;
    const buscada = ` ${palabra} `;
    if (formas.some((f) => f.includes(buscada))) return true;
  }
  return false;
}

/**
 * Revisa un mensaje. La feriante pasa links y promoción, pero no insultos.
 * Devuelve el motivo para ocultarlo, o null si se publica.
 */
export function moderar(
  texto: string,
  palabras: ReadonlySet<string>,
  esFeriante: boolean,
): Exclude<MotivoOculto, "repetido"> | null {
  const norm = normalizar(texto);
  if (!esFeriante) {
    if (esLink(texto)) return "link";
    if (esPromocion(texto, norm)) return "promocion";
  }
  if (tieneInsulto(norm, palabras)) return "insulto";
  return null;
}
