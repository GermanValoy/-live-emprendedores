"use server";

import { createClient } from "@/lib/supabase/server";
import { datosTiendaSchema, errorDeHandle, normalizarHandle, primerError } from "@/lib/tiendas/validacion";

const MENSAJES: Record<string, string> = {
  invitacion_vencida: "Esta invitación venció. Pedile una nueva a Tu Feria Live.",
  invitacion_usada: "Esta invitación ya se usó.",
  invitacion_invalida: "Esta invitación no es válida.",
  ya_tiene_tienda: "Ya tenés tu puesto.",
  handle_invalido: "Usá solo minúsculas, números y puntos (de 3 a 30).",
  sin_sesion: "Entrá con Google para abrir tu puesto.",
};

export async function abrirPuesto(
  token: string,
  datos: { name: string; handle: string; category: string; zone: string },
): Promise<{ ok: true; storeId: string } | { ok: false; error: string }> {
  const handle = normalizarHandle(datos.handle);
  const errorHandle = errorDeHandle(handle);
  if (errorHandle) return { ok: false, error: errorHandle };
  const r = datosTiendaSchema.safeParse(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("canjear_invitacion", {
    p_token: token, p_handle: handle, p_name: r.data.name, p_category: r.data.category, p_zone: r.data.zone,
  });
  if (error) {
    if (error.message === "handle_tomado") return { ok: false, error: `@${handle} ya está en uso. Probá con otro.` };
    return { ok: false, error: MENSAJES[error.message] ?? "No se pudo guardar. Revisá tu conexión y probá de nuevo." };
  }
  return { ok: true, storeId: data as string };
}
