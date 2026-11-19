"use server";

import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINUTOS = [15, 60, 1440];

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

const SIN_CONEXION = "No pudimos hacerlo. Revisá tu conexión y probá de nuevo.";

/** Las funciones de la base responden con códigos; acá pasan a frases para la feriante. */
function traducir(mensaje: string | undefined): ResultadoAccion {
  if (mensaje?.includes("estado_invalido")) return { ok: false, error: "Este pedido ya cambió. Mirá cómo quedó." };
  if (mensaje?.includes("sin_permiso")) return { ok: false, error: "Este pedido no es de tu puesto." };
  if (mensaje?.includes("datos_invalidos")) return { ok: false, error: "Revisá los datos e intentá de nuevo." };
  return { ok: false, error: SIN_CONEXION };
}

async function llamar(
  funcion: "confirmar_pago" | "rechazar_pago" | "ofrecer_a_otra" | "dar_mas_tiempo",
  pedido: string,
  minutos?: number,
): Promise<ResultadoAccion> {
  if (typeof pedido !== "string" || !UUID.test(pedido)) return { ok: false, error: "Revisá los datos e intentá de nuevo." };
  const supabase = await createClient();
  if (!(await obtenerUsuarioId(supabase))) return { ok: false, error: "Entrá de nuevo para seguir." };
  const args = funcion === "dar_mas_tiempo" ? { p_pedido: pedido, p_minutos: minutos } : { p_pedido: pedido };
  const { error } = await supabase.rpc(funcion, args);
  return error ? traducir(error.message) : { ok: true };
}

/** Le llegó la plata: el pedido pasa a Pagado. */
export async function confirmarPago(pedido: string): Promise<ResultadoAccion> {
  return llamar("confirmar_pago", pedido);
}

/** "No me llegó el pago": el pedido queda en revisión. */
export async function rechazarPago(pedido: string): Promise<ResultadoAccion> {
  return llamar("rechazar_pago", pedido);
}

/** La prenda pasa a la siguiente de la lista (y a la compradora se le anota una falta). */
export async function ofrecerAOtra(pedido: string): Promise<ResultadoAccion> {
  return llamar("ofrecer_a_otra", pedido);
}

export async function darMasTiempo(pedido: string, minutos: number): Promise<ResultadoAccion> {
  if (!MINUTOS.includes(minutos)) return { ok: false, error: "Revisá los datos e intentá de nuevo." };
  return llamar("dar_mas_tiempo", pedido, minutos);
}

/** Link de 60 segundos para ver el comprobante, solo si el pedido es de la tienda de quien llama. */
export async function urlComprobante(pedido: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (typeof pedido !== "string" || !UUID.test(pedido)) return { ok: false, error: "No se pudo abrir el comprobante." };
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) return { ok: false, error: "No se pudo abrir el comprobante." };
  const { data: orden } = await supabase.from("orders").select("id").eq("id", pedido).eq("store_id", tienda.id).maybeSingle();
  if (!orden) return { ok: false, error: "No se pudo abrir el comprobante." };
  const { data: reporte } = await supabase
    .from("payment_reports")
    .select("proof_path")
    .eq("order_id", pedido)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!reporte) return { ok: false, error: "Este pedido no tiene comprobante." };
  const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(reporte.proof_path as string, 60);
  if (error || !data) return { ok: false, error: SIN_CONEXION };
  return { ok: true, url: data.signedUrl };
}
