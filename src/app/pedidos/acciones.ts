"use server";

import { obtenerUsuarioId } from "@/lib/auth/sesion";
import type { Pedido } from "@/lib/codigos/tipos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = ["pickup", "shipping", "meetup"] as const;
const RUTA_COMPROBANTE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/i;

export type ResultadoPedido =
  | { ok: true; pedido: Pedido }
  | { ok: false; motivo: "sin_sesion" | "vencido" | "invalido" | "error"; error: string };

export type DatosEntrega = { direccion?: string | null; horarios?: string | null; nota?: string | null };

const falla = (motivo: Exclude<ResultadoPedido, { ok: true }>["motivo"], error: string): ResultadoPedido => ({ ok: false, motivo, error });

/** Las funciones de la base responden con códigos (`estado_invalido`, `datos_invalidos`, `sin_permiso`). */
function traducir(mensaje: string | undefined): ResultadoPedido {
  if (mensaje?.includes("estado_invalido")) return falla("vencido", "Se te pasó el tiempo para pagar.");
  if (mensaje?.includes("datos_invalidos")) return falla("invalido", "Revisá los datos e intentá de nuevo.");
  if (mensaje?.includes("sin_permiso")) return falla("invalido", "Este pedido no es tuyo.");
  return falla("error", "No pudimos hacerlo. Revisá tu conexión y probá de nuevo.");
}

/** Elige cómo recibir la prenda (antes de pagar): la base calcula el envío y el total. */
export async function elegirEntrega(pedidoId: string, tipo: string): Promise<ResultadoPedido> {
  if (typeof pedidoId !== "string" || !UUID.test(pedidoId) || !(TIPOS as readonly string[]).includes(tipo)) {
    return falla("invalido", "Elegí una forma de entrega.");
  }
  const supabase = await createClient();
  if (!(await obtenerUsuarioId(supabase))) return falla("sin_sesion", "Entrá para pagar.");
  const { data, error } = await supabase.rpc("elegir_entrega", { p_pedido: pedidoId, p_tipo: tipo });
  if (error) return traducir(error.message);
  return { ok: true, pedido: data as Pedido };
}

/** "Ya pagué": el comprobante ya está subido a su carpeta; la base revisa plazo, ruta y WhatsApp. */
export async function informarPago(pedidoId: string, comprobante: string, whatsapp: string): Promise<ResultadoPedido> {
  if (typeof pedidoId !== "string" || !UUID.test(pedidoId) || typeof comprobante !== "string" || typeof whatsapp !== "string") {
    return falla("invalido", "Revisá los datos e intentá de nuevo.");
  }
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) return falla("sin_sesion", "Entrá para pagar.");
  // El comprobante tiene que estar en su carpeta, para este pedido.
  if (!RUTA_COMPROBANTE.test(comprobante) || !comprobante.startsWith(`${userId}/${pedidoId}/`)) {
    return falla("invalido", "Subí el comprobante de nuevo.");
  }
  const digitos = whatsapp.replace(/\D/g, "");
  if (whatsapp.length > 30 || digitos.length < 8 || digitos.length > 15) return falla("invalido", "Revisá tu número de WhatsApp.");
  const { data, error } = await supabase.rpc("informar_pago", { p_pedido: pedidoId, p_comprobante: comprobante, p_whatsapp: whatsapp });
  if (error) return traducir(error.message);
  return { ok: true, pedido: data as Pedido };
}

/** Los datos de la entrega elegida. Hasta que el pedido está pagado, la base devuelve vacío. */
export async function datosEntrega(pedidoId: string): Promise<{ ok: true; datos: DatosEntrega } | { ok: false }> {
  if (typeof pedidoId !== "string" || !UUID.test(pedidoId)) return { ok: false };
  const supabase = await createClient();
  if (!(await obtenerUsuarioId(supabase))) return { ok: false };
  const { data, error } = await supabase.rpc("datos_entrega", { p_pedido: pedidoId });
  if (error) return { ok: false };
  return { ok: true, datos: (data ?? {}) as DatosEntrega };
}
