import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerConfigCodigo } from "./config";
import { leerReclamo } from "./reclamo";
import type { ResultadoReclamo } from "./tipos";

type Datos = {
  userId: string;
  vivoId: string;
  nombre: string;
  texto: string;
  mensajeId: string | null;
  /** "rafaga": se pasó del límite del chat, pero no está silenciada (el reclamo igual cuenta). "silenciada_rafaga": silenciada y pasada del límite (no reclama). */
  estadoChat: "ok" | "repetido" | "silenciada" | "rafaga" | "silenciada_rafaga";
};

/**
 * Después de publicar (o frenar) un mensaje: si dice el código activo del vivo, lo reclama.
 * Devuelve null si no hay nada que avisarle a la compradora.
 */
export async function procesarReclamo(admin: SupabaseClient, datos: Datos): Promise<ResultadoReclamo | null> {
  // Una silenciada que ya se pasó del límite no reclama (protege el límite de intentos de las silenciadas).
  // Quien no está silenciada sí: los límites del chat no le roban un reclamo a nadie (el mensaje no se publica, pero el código cuenta).
  if (datos.estadoChat === "silenciada_rafaga") return null;

  const { data: codigo, error } = await admin
    .from("live_codes")
    .select("id, word, label")
    .eq("live_session_id", datos.vivoId)
    .eq("status", "activo")
    .maybeSingle();
  if (error) throw error;
  if (!codigo) return null;

  const palabra = codigo.word as string;
  const etiqueta = codigo.label as string;
  const lectura = leerReclamo(datos.texto, palabra);
  if (lectura === "nada") return null;

  if (lectura === "casi") console.info("Código casi acertado", { codigo: palabra, texto: datos.texto });

  let reclama = lectura === "reclamo";
  if (lectura === "casi") reclama = (await obtenerConfigCodigo()).aceptar_casi;

  if (!reclama) {
    // Las silenciadas no escriben en el chat: no hay nada que sugerirles.
    if (datos.estadoChat === "silenciada") return null;
    return { estado: "pista", tipo: lectura === "nombra" ? "nombra" : "casi", codigo: etiqueta };
  }

  const { data, error: errorRpc } = await admin.rpc("reclamar_codigo", {
    p_user: datos.userId,
    p_codigo: codigo.id,
    p_nombre: datos.nombre,
    p_mensaje: datos.estadoChat === "silenciada" || datos.estadoChat === "rafaga" ? null : datos.mensajeId,
    p_texto: datos.texto,
  });
  if (errorRpc) throw errorRpc;
  const r = data as { estado: string; pedido?: string; lugar?: number; ganadora?: string };
  switch (r.estado) {
    case "ganaste":
      return r.pedido ? { estado: "ganaste", pedido: r.pedido } : null;
    case "lista":
      return { estado: "lista", lugar: r.lugar ?? 1, ganadora: r.ganadora ?? "" };
    case "agotado":
    case "repetido":
    case "propio":
      return { estado: r.estado };
    default:
      return null; // sin_codigo: se cerró justo ahora
  }
}
