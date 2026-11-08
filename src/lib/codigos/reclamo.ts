/** Palabras que se pueden sumar al código sin dejar de ser un reclamo ("lo quiero rojo"). */
const PALABRAS_QUIERO = new Set(["yo", "quiero", "lo", "la", "mio", "mia", "me", "llevo", "para", "mi"]);

const MAXIMO_PALABRAS = 4;

export type Lectura = "reclamo" | "nombra" | "casi" | "nada";

/** Minúsculas, sin tildes ni signos ni emojis, con espacios simples. */
function limpiar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * La forma en que se guarda y se compara un código: limpio, y con las tandas de
 * 3 o más letras iguales reducidas a una ("rojooo" → "rojo"; "ll" y "rr" quedan).
 * Los números no se tocan ("1000" sigue siendo "1000").
 */
export function normalizarCodigo(texto: string): string {
  return limpiar(texto).replace(/([a-z])\1{2,}/g, "$1");
}

/** Reduce todas las tandas de letras iguales a una sola (para comparar errores de tipeo). */
function reducir(texto: string): string {
  return texto.replace(/([a-z])\1+/g, "$1");
}

/** ¿La distancia de edición entre `a` y `b` es 0 o 1? */
function aDistanciaUno(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [corta, larga] = a.length < b.length ? [a, b] : [b, a];
  return corta.slice(i) === larga.slice(i + 1);
}

/**
 * Qué dijo la compradora respecto de un código. `palabra` ya viene normalizada.
 * - reclamo: escribió el código (con a lo sumo palabras como "quiero" o "lo") y no preguntó.
 * - nombra: dijo el código dentro de otra frase o pregunta.
 * - casi: no lo escribió, pero parece un error de tipeo (solo palabras de 4 letras o más).
 */
export function leerReclamo(texto: string, palabra: string): Lectura {
  const normal = normalizarCodigo(texto);
  const rodeado = ` ${normal} `;

  if (rodeado.includes(` ${palabra} `)) {
    // Repetir el código ("rojo rojo!!") sigue siendo reclamarlo: se sacan todas las veces que aparece.
    let sinCodigo = rodeado;
    while (sinCodigo.includes(` ${palabra} `)) sinCodigo = sinCodigo.replace(` ${palabra} `, " ");
    const resto = sinCodigo.trim().split(" ").filter(Boolean);
    const esReclamo =
      !/[?¿]/.test(texto) &&
      normal.split(" ").length <= MAXIMO_PALABRAS &&
      resto.every((p) => PALABRAS_QUIERO.has(p));
    return esReclamo ? "reclamo" : "nombra";
  }

  if (palabra.length >= 4) {
    const buscada = reducir(palabra);
    if (normal.split(" ").some((p) => p && aDistanciaUno(reducir(p), buscada))) return "casi";
  }
  return "nada";
}
