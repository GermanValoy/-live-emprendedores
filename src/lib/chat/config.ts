import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfigChat } from "./tipos";

/** Cuánto se guardan en memoria las palabras bloqueadas antes de volver a leerlas. */
const MEMORIA_MS = 5 * 60_000;

let guardadas: { palabras: ReadonlySet<string>; hasta: number } | null = null;

/** Los valores del chat (la fila única de `chat_config`). Solo el servidor la puede leer. */
export async function obtenerConfigChat(): Promise<ConfigChat> {
  const { data, error } = await createAdminClient()
    .from("chat_config")
    .select("largo_maximo, mensajes_al_entrar")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as ConfigChat;
}

/** Las palabras que el moderador oculta (ya normalizadas), guardadas 5 minutos en memoria. */
export async function palabrasBloqueadas(): Promise<ReadonlySet<string>> {
  const ahora = Date.now();
  if (guardadas && guardadas.hasta > ahora) return guardadas.palabras;
  const { data, error } = await createAdminClient().from("chat_blocked_words").select("word");
  if (error) throw error;
  const palabras = new Set(((data as { word: string }[] | null) ?? []).map((f) => f.word));
  guardadas = { palabras, hasta: ahora + MEMORIA_MS };
  return palabras;
}
