"use server";

import { z } from "zod";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { normalizarCodigo } from "@/lib/codigos/reclamo";
import { rutaEsDeTienda } from "@/lib/fotos/rutas";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import type { Resultado } from "@/lib/tiendas/tipos";

const ERROR_GENERICO = "No se pudo completar. Revisá tu conexión y probá de nuevo.";
const uuid = z.string().uuid();

function textoDeError(e: { message?: string }, palabra?: string): string {
  const m = e.message ?? "";
  if (m.includes("palabra_repetida")) return `Ya usaste ${(palabra ?? "ese código").toUpperCase()} en este vivo.`;
  if (m.includes("sin_permiso")) return "No tenés permiso para hacer eso en este vivo.";
  if (m.includes("datos_invalidos")) return "Revisá el precio, el código y la cantidad.";
  if (m.includes("cerrado")) return "Este vivo ya terminó.";
  if (m.includes("estado_invalido")) return "Ya hay un pago informado o confirmado: no se puede anular.";
  return ERROR_GENERICO;
}

export type DatosLanzar = {
  palabra: string;
  precioCentavos: number;
  cantidad: number;
  /** Ruta ya subida a Storage (`<tienda>/codigos/<uuid>.webp|jpg`) o null. */
  foto: string | null;
  productoId: string | null;
  porVoz: boolean;
};

export async function lanzarCodigo(vivoId: string, datos: DatosLanzar): Promise<Resultado> {
  const palabra = normalizarCodigo(datos.palabra);
  if (
    !uuid.safeParse(vivoId).success || !palabra || palabra.length > 40 ||
    !Number.isSafeInteger(datos.precioCentavos) || datos.precioCentavos <= 0 ||
    !Number.isInteger(datos.cantidad) || datos.cantidad < 1 || datos.cantidad > 99 ||
    (datos.productoId !== null && !uuid.safeParse(datos.productoId).success)
  ) {
    return { ok: false, error: "Revisá el precio, el código y la cantidad." };
  }
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  if (!tienda) return { ok: false, error: ERROR_GENERICO };
  if (datos.foto !== null && !rutaEsDeTienda(datos.foto, tienda.id, "codigos")) return { ok: false, error: ERROR_GENERICO };
  const { error } = await supabase.rpc("lanzar_codigo", {
    p_vivo: vivoId,
    p_palabra: palabra,
    p_etiqueta: palabra.toUpperCase(),
    p_precio: datos.precioCentavos,
    p_cantidad: datos.cantidad,
    p_foto: datos.foto,
    p_producto: datos.productoId,
    p_por_voz: datos.porVoz,
  });
  if (error) {
    console.error("lanzarCodigo", error.message);
    return { ok: false, error: textoDeError(error, palabra) };
  }
  return { ok: true };
}

async function llamar(funcion: "cerrar_codigo" | "anular_codigo" | "anular_reclamo", parametro: "p_codigo" | "p_reclamo", id: string): Promise<Resultado> {
  if (!uuid.safeParse(id).success) return { ok: false, error: ERROR_GENERICO };
  const supabase = await createClient();
  const { error } = await supabase.rpc(funcion, { [parametro]: id });
  if (error) {
    console.error(funcion, error.message);
    return { ok: false, error: textoDeError(error) };
  }
  return { ok: true };
}

export const cerrarCodigo = async (codigoId: string) => llamar("cerrar_codigo", "p_codigo", codigoId);
export const anularCodigo = async (codigoId: string) => llamar("anular_codigo", "p_codigo", codigoId);
export const anularReclamo = async (reclamoId: string) => llamar("anular_reclamo", "p_reclamo", reclamoId);

/** Le da una prenda sin vender de un código que ya pasó a quien preguntó por ella en el chat. */
export async function darPrenda(
  codigoId: string,
  mensajeId: string,
  textos: { nombre: string; etiqueta: string },
): Promise<Resultado & { texto?: string }> {
  if (!uuid.safeParse(codigoId).success || !uuid.safeParse(mensajeId).success) return { ok: false, error: ERROR_GENERICO };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dar_prenda", { p_codigo: codigoId, p_mensaje: mensajeId });
  if (error) {
    console.error("darPrenda", error.message);
    const m = error.message ?? "";
    if (m.includes("agotado")) return { ok: false, error: `Ya no quedan unidades de ${textos.etiqueta}.` };
    if (m.includes("repetido")) return { ok: false, error: `${textos.nombre} ya tiene el ${textos.etiqueta}.` };
    if (m.includes("no_disponible")) return { ok: false, error: "Ese código ya no se puede dar." };
    if (m.includes("cerrado")) return { ok: false, error: "Este vivo ya terminó." };
    return { ok: false, error: ERROR_GENERICO };
  }
  const nombre = typeof data === "string" && data ? data : textos.nombre;
  return { ok: true, texto: `Le diste el ${textos.etiqueta} a ${nombre}.` };
}
