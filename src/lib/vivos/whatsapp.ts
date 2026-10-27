/** Link público del vivo de una tienda, por ejemplo `https://tuferialive.vercel.app/@mica.tejidos/vivo`. */
export function linkSala(origen: string, handle: string): string {
  return `${origen}/@${handle}/vivo`;
}

/** Texto del aviso para WhatsApp: "antes" = pronto sale en vivo; "durante" = ya está en vivo. */
export function mensajeAviso(momento: "antes" | "durante", link: string): string {
  if (momento === "durante") return `¡Estoy en vivo en Tu Feria Live! Entrá acá 👉 ${link}`;
  return `¡Pronto salgo en vivo! Entrá acá y se abre sola cuando arranque 👉 ${link}`;
}

/** Link de WhatsApp que abre el chat para elegir a quién mandarle el texto. */
export function linkWhatsapp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
