import type { SupabaseClient } from "@supabase/supabase-js";

/** Id de la persona con sesión, o null (también si la cookie está vencida o rota). */
export async function obtenerUsuarioId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    return data?.claims?.sub ?? null;
  } catch {
    return null;
  }
}
