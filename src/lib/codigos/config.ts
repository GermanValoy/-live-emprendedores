import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfigCodigo } from "./tipos";

/** Los valores del código en vivo (la fila única de `code_config`). Solo el servidor la puede leer. */
export async function obtenerConfigCodigo(): Promise<ConfigCodigo> {
  const { data, error } = await createAdminClient()
    .from("code_config")
    .select(
      "plazo_minutos, cartel_ganadora_segundos, lista_espera_max, aceptar_casi, voz_umbral_minimo, voz_previo_ms, voz_silencio_fin_ms, voz_maximo_ms, voz_solape_ms, voz_minimo_voz_ms, voz_segundos_por_dia",
    )
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as ConfigCodigo;
}
