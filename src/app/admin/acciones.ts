"use server";

import { randomBytes } from "node:crypto";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
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
