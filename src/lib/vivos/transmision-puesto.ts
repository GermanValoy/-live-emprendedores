import type { SupabaseClient } from "@supabase/supabase-js";
import { type CredencialesCloudflare, obtenerOCrearTransmision, type UrlsTransmision } from "./cloudflare";

/**
 * Devuelve la transmisión propia del puesto; la crea en Cloudflare y la guarda la primera vez.
 * `db` debe ser el cliente de servidor con llave secreta (`store_streams` no es legible por nadie más).
 */
export async function obtenerTransmisionDelPuesto(
  storeId: string,
  deps: { db: SupabaseClient; cred: CredencialesCloudflare; f?: typeof fetch },
): Promise<UrlsTransmision> {
  const { db, cred, f } = deps;
  const { data, error } = await db
    .from("store_streams")
    .select("cloudflare_uid, whip_url, whep_url")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (data) return { uid: data.cloudflare_uid, urlTransmitir: data.whip_url, urlMirar: data.whep_url };

  const urls = await obtenerOCrearTransmision(`puesto-${storeId}`, cred, f);
  const guardado = await db.from("store_streams").upsert(
    { store_id: storeId, cloudflare_uid: urls.uid, whip_url: urls.urlTransmitir, whep_url: urls.urlMirar },
    { onConflict: "store_id" },
  );
  if (guardado.error) throw guardado.error;
  return urls;
}
