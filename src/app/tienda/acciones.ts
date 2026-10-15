"use server";

import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tiendas/tipos";

export async function alternarSeguir(storeId: string, seguir: boolean): Promise<Resultado> {
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) return { ok: false, error: "Entrá con Google para seguir puestos." };
  const { error } = seguir
    ? await supabase.from("follows").upsert({ user_id: userId, store_id: storeId }, { onConflict: "user_id,store_id", ignoreDuplicates: true })
    : await supabase.from("follows").delete().eq("user_id", userId).eq("store_id", storeId);
  return error ? { ok: false, error: "No se pudo guardar. Revisá tu conexión y probá de nuevo." } : { ok: true };
}
