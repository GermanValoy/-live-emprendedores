"use server";

import { z } from "zod";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import type { Resultado } from "@/lib/tiendas/tipos";
import { ErrorCloudflare } from "@/lib/vivos/cloudflare";
import { credencialesCloudflare } from "@/lib/vivos/config";
import { CAMPOS_VIVO, type Vivo } from "@/lib/vivos/tipos";
import { obtenerTransmisionDelPuesto } from "@/lib/vivos/transmision-puesto";

type ResultadoVivo = { ok: true; vivo: Vivo } | { ok: false; error: string };

const ERROR_GENERICO = "No se pudo completar. Revisá tu conexión y probá de nuevo.";
const ERROR_TRANSMISION = "No pudimos preparar la transmisión. Probá de nuevo en un rato.";
const ERROR_INCOMPLETO = "Terminá de armar tu puesto para salir en vivo.";

const uuid = z.string().uuid();

function mensajeDeError(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? "";
  if (m.includes("puesto_incompleto")) return ERROR_INCOMPLETO;
  if (m.includes("sin_transmision")) return ERROR_TRANSMISION;
  return ERROR_GENERICO;
}

async function leerVivo(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<Vivo | null> {
  const { data, error } = await supabase.from("live_sessions").select(CAMPOS_VIVO).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Vivo | null) ?? null;
}

async function leerVivoOError(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<ResultadoVivo> {
  try {
    const vivo = await leerVivo(supabase, id);
    return vivo ? { ok: true, vivo } : { ok: false, error: ERROR_GENERICO };
  } catch (e) {
    console.error("leer vivo", e);
    return { ok: false, error: ERROR_GENERICO };
  }
}

export async function salirEnVivo(dispositivo: string): Promise<ResultadoVivo> {
  if (!uuid.safeParse(dispositivo).success) return { ok: false, error: ERROR_GENERICO };
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) return { ok: false, error: ERROR_GENERICO };
  if (tienda.onboarding_step < 5) return { ok: false, error: ERROR_INCOMPLETO };

  try {
    // Garantiza que la transmisión del puesto exista y esté guardada: la base lee de ahí la URL para mirar.
    await obtenerTransmisionDelPuesto(tienda.id, { db: createAdminClient(), cred: credencialesCloudflare });
  } catch (e) {
    // Solo el mensaje: ErrorCloudflare nunca incluye la llave ni las URLs.
    console.error("salirEnVivo: transmisión", e instanceof ErrorCloudflare ? e.message : e);
    return { ok: false, error: ERROR_TRANSMISION };
  }

  const { data, error } = await supabase.rpc("abrir_vivo", { p_store: tienda.id, p_device: dispositivo });
  if (error || typeof data !== "string") return { ok: false, error: mensajeDeError(error) };
  return leerVivoOError(supabase, data);
}

export async function terminarVivo(vivoId: string): Promise<ResultadoVivo> {
  if (!uuid.safeParse(vivoId).success) return { ok: false, error: ERROR_GENERICO };
  const supabase = await createClient();
  const { error } = await supabase.rpc("terminar_vivo", { p_vivo: vivoId });
  if (error) return { ok: false, error: mensajeDeError(error) };
  return leerVivoOError(supabase, vivoId);
}

// Moderación del chat: la base verifica que la sesión sea la dueña de la tienda.

const ERROR_MODERAR = "No se pudo completar. Revisá tu conexión y probá de nuevo.";

function errorDeModerar(e: { message?: string }): string {
  const m = e.message ?? "";
  if (m.includes("no_a_vos_misma")) return "No podés silenciarte a vos misma.";
  if (m.includes("sin_permiso")) return "No tenés permiso para hacer eso en esta sala.";
  return ERROR_MODERAR;
}

export async function borrarMensaje(mensajeId: string): Promise<Resultado> {
  if (!uuid.safeParse(mensajeId).success) return { ok: false, error: ERROR_MODERAR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_mensaje", { p_mensaje: mensajeId });
  if (error) {
    console.error("borrarMensaje", error.message);
    return { ok: false, error: errorDeModerar(error) };
  }
  return { ok: true };
}

export async function silenciarEnSala(storeId: string, userId: string, tipo: "temporal" | "sala"): Promise<Resultado> {
  if (!uuid.safeParse(storeId).success || !uuid.safeParse(userId).success || (tipo !== "temporal" && tipo !== "sala")) {
    return { ok: false, error: ERROR_MODERAR };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("silenciar_en_sala", { p_store: storeId, p_user: userId, p_tipo: tipo });
  if (error) {
    console.error("silenciarEnSala", error.message);
    return { ok: false, error: errorDeModerar(error) };
  }
  return { ok: true };
}

export async function quitarSilencio(storeId: string, userId: string): Promise<Resultado> {
  if (!uuid.safeParse(storeId).success || !uuid.safeParse(userId).success) return { ok: false, error: ERROR_MODERAR };
  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_silencio", { p_store: storeId, p_user: userId });
  if (error) {
    console.error("quitarSilencio", error.message);
    return { ok: false, error: errorDeModerar(error) };
  }
  return { ok: true };
}
