"use server";

import { palabrasBloqueadas } from "@/lib/chat/config";
import { largoVisible, limpiarTexto, moderar, normalizar } from "@/lib/chat/moderar";
import { nombreCorto } from "@/lib/chat/nombre";
import type { MensajeChat, SilencioChat } from "@/lib/chat/tipos";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoEnvio =
  | { ok: true; mensaje: MensajeChat }
  | { ok: false; motivo: "sin_sesion" | "cerrado" | "rafaga" | "silenciada" | "invalido" | "error"; silencio?: SilencioChat };

/** Publica un mensaje en el chat del vivo: valida, modera y lo guarda con la función de la base. */
export async function enviarMensaje(vivoId: string, texto: string): Promise<ResultadoEnvio> {
  if (typeof vivoId !== "string" || !UUID.test(vivoId) || typeof texto !== "string") return { ok: false, motivo: "invalido" };
  const limpio = limpiarTexto(texto);
  if (limpio.length === 0 || largoVisible(limpio) > 400) return { ok: false, motivo: "invalido" };

  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) return { ok: false, motivo: "sin_sesion" };

  try {
    const admin = createAdminClient();
    const [perfil, vivo, suya, palabras] = await Promise.all([
      supabase.from("users").select("display_name").eq("id", userId).maybeSingle(),
      admin.from("live_sessions").select("store_id").eq("id", vivoId).maybeSingle(),
      admin.from("stores").select("id").eq("owner_id", userId).maybeSingle(),
      palabrasBloqueadas(),
    ]);
    if (perfil.error) throw perfil.error;
    if (vivo.error) throw vivo.error;
    if (suya.error) throw suya.error;
    if (!vivo.data) return { ok: false, motivo: "cerrado" };
    const esFeriante = suya.data?.id === vivo.data.store_id;

    const { data, error } = await admin.rpc("publicar_mensaje", {
      p_user: userId,
      p_vivo: vivoId,
      p_nombre: nombreCorto(perfil.data?.display_name ?? ""),
      p_texto: limpio,
      p_normalizado: normalizar(limpio),
      p_motivo: moderar(limpio, palabras, esFeriante),
    });
    if (error) {
      if (error.message.includes("texto_invalido")) return { ok: false, motivo: "invalido" };
      throw error;
    }
    const r = data as { estado: string; tipo?: SilencioChat; mensaje?: MensajeChat };
    if (r.estado === "ok" && r.mensaje) return { ok: true, mensaje: r.mensaje };
    if (r.estado === "cerrado") return { ok: false, motivo: "cerrado" };
    if (r.estado === "rafaga") return { ok: false, motivo: "rafaga" };
    if (r.estado === "silenciada") return { ok: false, motivo: "silenciada", silencio: r.tipo ?? "temporal" };
    return { ok: false, motivo: "error" };
  } catch (e) {
    console.error("Chat: no se pudo publicar el mensaje", e instanceof Error ? e.message : e);
    return { ok: false, motivo: "error" };
  }
}
