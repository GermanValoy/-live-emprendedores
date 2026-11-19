import type { Codigo } from "./tipos";

/** Los códigos que ya pasaron (cerrados) y todavía tienen unidades sin vender, del más nuevo al más viejo. */
export function prendasLibres(codigos: Codigo[]): Codigo[] {
  return codigos
    .filter((c) => c.status === "cerrado" && c.sold < c.quantity)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}
