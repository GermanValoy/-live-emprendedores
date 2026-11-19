import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerConfigCodigo } from "@/lib/codigos/config";
import { esFantasma } from "./fantasmas";

const MAXIMO_BYTES = 1_000_000;
const BYTES_POR_SEGUNDO = 32_000; // 16 kHz · 16 bits · mono

type Deps = {
  userId: string | null;
  admin: SupabaseClient;
  transcribir(audio: ArrayBuffer): Promise<string>;
};

const error = (status: number, mensaje: string) => Response.json({ error: mensaje }, { status });

/** El día en Tucumán (no en UTC), para contar los segundos de voz de cada puesto. */
function diaTucuman(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Tucuman" });
}

/** Una frase de la feriante: la pasa a texto con Whisper si el vivo es suyo y no se pasó del límite del día. */
export async function atenderVoz(request: Request, deps: Deps): Promise<Response> {
  const { userId, admin } = deps;
  if (!userId) return error(401, "Tenés que iniciar sesión.");

  // Dueña de un vivo abierto.
  const vivoId = new URL(request.url).searchParams.get("vivo") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(vivoId)) return error(403, "No es tu vivo.");
  const vivo = await admin.from("live_sessions").select("store_id").eq("id", vivoId).is("ended_at", null).maybeSingle();
  if (vivo.error) throw vivo.error;
  if (!vivo.data) return error(403, "No es tu vivo.");
  const storeId = vivo.data.store_id as string;
  const tienda = await admin.from("stores").select("owner_id").eq("id", storeId).maybeSingle();
  if (tienda.error) throw tienda.error;
  if (tienda.data?.owner_id !== userId) return error(403, "No es tu vivo.");

  const tipo = request.headers.get("content-type") ?? "";
  if (!tipo.toLowerCase().startsWith("audio/wav")) return error(400, "El audio tiene que ser un WAV.");
  const audio = await request.arrayBuffer();
  if (audio.byteLength < 1 || audio.byteLength > MAXIMO_BYTES) return error(400, "El audio tiene un tamaño inválido.");

  const config = await obtenerConfigCodigo();
  const dia = diaTucuman();
  const uso = await admin.from("voice_usage").select("seconds").eq("store_id", storeId).eq("day", dia).maybeSingle();
  if (uso.error) throw uso.error;
  if ((uso.data?.seconds ?? 0) >= config.voz_segundos_por_dia) return error(429, "limite");

  const texto = await deps.transcribir(audio);

  // Suma atómica: dos frases que llegan juntas no se pisan.
  const suma = await admin.rpc("sumar_voz", {
    p_tienda: storeId,
    p_dia: dia,
    p_segundos: audio.byteLength / BYTES_POR_SEGUNDO,
  });
  if (suma.error) throw suma.error;

  return Response.json({ texto: esFantasma(texto) ? "" : texto });
}
