"use server";

import { randomBytes } from "node:crypto";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Resultado } from "@/lib/tiendas/tipos";

const SIN_PERMISO = "No tenés permiso para hacer esto.";

async function adminActual() {
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) return null;
  const { data } = await supabase.rpc("es_admin");
  return data === true ? { supabase, userId } : null;
}

export async function crearInvitacion(nota: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const texto = nota.trim();
  if (texto.length > 80) return { ok: false, error: "La nota puede tener hasta 80 caracteres." };
  const token = randomBytes(24).toString("base64url");
  const { error } = await sesion.supabase.from("invitations").insert({
    token,
    created_by: sesion.userId,
    note: texto || null,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  if (error) return { ok: false, error: "No se pudo crear la invitación. Probá de nuevo." };
  return { ok: true, token };
}

export async function anularInvitacion(id: string): Promise<Resultado> {
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const { error } = await sesion.supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null);
  return error ? { ok: false, error: "No se pudo anular. Probá de nuevo." } : { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cortarVivo(vivoId: string): Promise<Resultado> {
  if (typeof vivoId !== "string" || !UUID.test(vivoId)) return { ok: false, error: "No se pudo cortar el vivo. Probá de nuevo." };
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const { error } = await sesion.supabase.rpc("cortar_vivo", { p_vivo: vivoId });
  if (error) {
    console.error("No se pudo cortar el vivo desde administración:", error.message);
    return { ok: false, error: "No se pudo cortar el vivo. Probá de nuevo." };
  }
  return { ok: true };
}

const ERROR_REVISION = "No se pudo completar. Revisá tu conexión y probá de nuevo.";

export async function silenciarEnPlataforma(userId: string): Promise<Resultado> {
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: ERROR_REVISION };
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const { error } = await sesion.supabase.rpc("silenciar_en_plataforma", { p_user: userId });
  if (error) {
    console.error("silenciarEnPlataforma", error.message);
    return { ok: false, error: ERROR_REVISION };
  }
  return { ok: true };
}

export async function quitarSilencioPlataforma(userId: string): Promise<Resultado> {
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: ERROR_REVISION };
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };
  const { error } = await sesion.supabase.rpc("quitar_silencio_plataforma", { p_user: userId });
  if (error) {
    console.error("quitarSilencioPlataforma", error.message);
    return { ok: false, error: ERROR_REVISION };
  }
  return { ok: true };
}

type MensajeRevision = { body: string; hidden_reason: string | null; deleted: boolean; created_at: string; tienda: string };

/** Últimos 20 mensajes de una cuenta, con los ocultos y el texto original de los borrados. */
export async function ultimosMensajes(
  userId: string,
): Promise<{ ok: true; mensajes: MensajeRevision[] } | { ok: false; error: string }> {
  if (typeof userId !== "string" || !UUID.test(userId)) return { ok: false, error: ERROR_REVISION };
  const sesion = await adminActual();
  if (!sesion) return { ok: false, error: SIN_PERMISO };

  // La política "Chat para administración" deja leer todos los mensajes, incluidos los ocultos.
  const { data, error } = await sesion.supabase
    .from("chat_messages")
    .select("id, body, hidden_reason, deleted_at, created_at, stores(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("ultimosMensajes", error.message);
    return { ok: false, error: ERROR_REVISION };
  }
  type Fila = {
    id: string; body: string; hidden_reason: string | null; deleted_at: string | null; created_at: string;
    stores: { name: string } | { name: string }[] | null;
  };
  const filas = (data ?? []) as unknown as Fila[];

  // El texto de un mensaje borrado vive en moderation_actions, que solo lee el servidor (ya verificamos que es admin).
  const borrados = filas.filter((f) => f.deleted_at).map((f) => f.id);
  const original = new Map<string, string>();
  if (borrados.length > 0) {
    const { data: acciones, error: e2 } = await createAdminClient()
      .from("moderation_actions")
      .select("message_id, message_body")
      .eq("action", "borrar")
      .in("message_id", borrados);
    if (e2) {
      console.error("ultimosMensajes: acciones", e2.message);
      return { ok: false, error: ERROR_REVISION };
    }
    for (const a of (acciones ?? []) as { message_id: string; message_body: string | null }[]) {
      if (a.message_body) original.set(a.message_id, a.message_body);
    }
  }

  return {
    ok: true,
    mensajes: filas.map((f) => ({
      body: f.deleted_at ? (original.get(f.id) ?? "") : f.body,
      hidden_reason: f.hidden_reason,
      deleted: f.deleted_at !== null,
      created_at: f.created_at,
      tienda: (Array.isArray(f.stores) ? f.stores[0]?.name : f.stores?.name) ?? "",
    })),
  };
}
