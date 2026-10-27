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
  const { data } = await supabase
    .from("live_sessions")
    .select(CAMPOS_VIVO)
    .eq("store_id", storeId)
    .is("ended_at", null)
    .maybeSingle();
  return (data as Vivo | null) ?? null;
}

export type VivoEnPortada = {
  vivo: Vivo;
  puesto: { id: string; handle: string; name: string; zone: string; avatar_path: string | null; cover_path: string | null };
};

type FilaPortada = Vivo & { stores: VivoEnPortada["puesto"] | VivoEnPortada["puesto"][] | null };

/** Vivos abiertos, el que más gente tiene primero. */
export async function listarVivosAbiertos(supabase: SupabaseClient): Promise<VivoEnPortada[]> {
  const { data } = await supabase
    .from("live_sessions")
    .select(`${CAMPOS_VIVO}, stores(id, handle, name, zone, avatar_path, cover_path)`)
    .is("ended_at", null)
    .order("viewers", { ascending: false });
  const filas = (data as FilaPortada[] | null) ?? [];
  return filas.flatMap(({ stores, ...vivo }) => {
    const puesto = Array.isArray(stores) ? stores[0] : stores;
    return puesto ? [{ vivo: vivo as Vivo, puesto }] : [];
  });
}

export async function idsPuestosEnVivo(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase.from("live_sessions").select("store_id").is("ended_at", null);
  return new Set(((data as { store_id: string }[] | null) ?? []).map((f) => f.store_id));
}
