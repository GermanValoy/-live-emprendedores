const ERROR_GENERICO = "No se pudo completar. Revisá tu conexión y probá de nuevo.";

/** Traduce el error de `dar_prenda` (el mensaje de la base es el código solo, por eso se compara exacto). */
export function textoDeErrorDarPrenda(mensaje: string | undefined, textos: { nombre: string; etiqueta: string }): string {
  switch ((mensaje ?? "").trim()) {
    case "agotado": return `Ya no quedan unidades de ${textos.etiqueta}.`;
    case "repetido": return `${textos.nombre} ya tiene el ${textos.etiqueta}.`;
    case "no_disponible": return "Ese código ya no se puede dar.";
    case "cerrado": return "Este vivo ya terminó.";
    default: return ERROR_GENERICO;
  }
}
