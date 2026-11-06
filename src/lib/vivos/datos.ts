import type { SupabaseClient } from "@supabase/supabase-js";
import { CAMPOS_VIVO, type ConfigVivo, type Vivo } from "./tipos";

export async function obtenerConfigVivo(supabase: SupabaseClient): Promise<ConfigVivo> {
  const { data, error } = await supabase
    .from("live_config")
    .select("sin_conexion_segundos, fuera_segundos, senal_cada_segundos")
    .single();
  if (error) throw error;
  return data as ConfigVivo;
}

export async function vivoAbiertoDe(supabase: SupabaseClient, storeId: string): Promise<Vivo | null> {
  const { data, error } = await supabase
    .from("live_sessions")
    .select(CAMPOS_VIVO)
    .eq("store_id", storeId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as Vivo | null) ?? null;
}

export type VivoEnPortada = {
  vivo: Vivo;
  puesto: { id: string; handle: string; name: string; zone: string; avatar_path: string | null; cover_path: string | null };
  /** El código que está vendiendo ahora (el más nuevo que sigue activo), si hay. */
  codigo: { label: string; price_cents: number } | null;
};

type FilaPortada = Vivo & { stores: VivoEnPortada["puesto"] | VivoEnPortada["puesto"][] | null };

/** Vivos abiertos, el que más gente tiene primero. */
export async function listarVivosAbiertos(supabase: SupabaseClient): Promise<VivoEnPortada[]> {
  const { data, error } = await supabase
    .from("live_sessions")
    .select(`${CAMPOS_VIVO}, stores(id, handle, name, zone, avatar_path, cover_path)`)
    .is("ended_at", null)
    .order("viewers", { ascending: false });
  if (error) throw error;
  const filas = (data as FilaPortada[] | null) ?? [];
  const ids = filas.map((f) => f.id);
  const codigos = new Map<string, { label: string; price_cents: number }>();
  if (ids.length) {
    const { data: activos, error: errorCodigos } = await supabase
      .from("live_codes")
      .select("live_session_id, label, price_cents")
      .in("live_session_id", ids)
      .eq("status", "activo")
      .order("created_at");
    if (errorCodigos) throw errorCodigos;
    // Ordenados del más viejo al más nuevo: el último de cada vivo es el que vale.
    for (const c of (activos as { live_session_id: string; label: string; price_cents: number }[] | null) ?? []) {
      codigos.set(c.live_session_id, { label: c.label, price_cents: c.price_cents });
    }
  }
  return filas.flatMap(({ stores, ...vivo }) => {
    const puesto = Array.isArray(stores) ? stores[0] : stores;
    return puesto ? [{ vivo: vivo as Vivo, puesto, codigo: codigos.get((vivo as Vivo).id) ?? null }] : [];
  });
}

export async function idsPuestosEnVivo(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("live_sessions").select("store_id").is("ended_at", null);
  if (error) throw error;
  return new Set(((data as { store_id: string }[] | null) ?? []).map((f) => f.store_id));
}
