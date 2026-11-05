import type { SupabaseClient } from "@supabase/supabase-js";
import { CAMPOS_MENSAJE, type MensajeChat, type SilencioChat } from "./tipos";

/** Los últimos `cantidad` mensajes sin borrar del vivo, del más viejo al más nuevo (la RLS decide qué ocultos ve cada persona). */
export async function mensajesIniciales(supabase: SupabaseClient, vivoId: string, cantidad: number): Promise<MensajeChat[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select(CAMPOS_MENSAJE)
    .eq("live_session_id", vivoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(cantidad);
  if (error) throw error;
  return ((data as MensajeChat[] | null) ?? []).reverse();
}

type FilaSilencio = { kind: "temporal" | "sala" | "plataforma"; store_id: string | null; until: string | null; lifted_at: string | null };

const FUERZA = { temporal: 1, sala: 2, plataforma: 3 } as const;

/** El silencio más fuerte que rige hoy para esta persona en esta tienda (null: puede escribir). */
export async function miSilencio(supabase: SupabaseClient, storeId: string, userId: string): Promise<SilencioChat> {
  const { data, error } = await supabase
    .from("chat_silences")
    .select("kind, store_id, until, lifted_at")
    .eq("user_id", userId)
    .is("lifted_at", null);
  if (error) throw error;
  const ahora = Date.now();
  let mejor: SilencioChat = null;
  for (const f of (data as FilaSilencio[] | null) ?? []) {
    const rige =
      f.kind === "plataforma" ||
      (f.store_id === storeId && (f.kind === "sala" || (f.until !== null && Date.parse(f.until) > ahora)));
    if (rige && (mejor === null || FUERZA[f.kind] > FUERZA[mejor])) mejor = f.kind;
  }
  return mejor;
}
