"use server";

import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { BUCKET_FOTOS, rutaEsDeTienda, rutaVariante } from "@/lib/fotos/rutas";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import type { Resultado, Tienda } from "@/lib/tiendas/tipos";
import { parsearPrecio, primerError, productoSchema } from "@/lib/tiendas/validacion";

const NO_GUARDO = "No se pudo guardar. Revisá tu conexión y probá de nuevo.";

export type DatosProductoEntrada = { name: string; description: string; price: string; quantity: string; visible: boolean };

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

async function duenaActual() {
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const tienda = userId ? await obtenerMiTienda(supabase, userId) : null;
  return tienda ? { supabase, tienda } : null;
}

async function avanzarPaso(supabase: ClienteServidor, tienda: Tienda, avanzarA?: number) {
  if (avanzarA && tienda.onboarding_step < avanzarA) {
    await supabase.from("stores").update({ onboarding_step: avanzarA }).eq("id", tienda.id);
  }
}

async function borrarArchivos(supabase: ClienteServidor, paths: string[]) {
  if (!paths.length) return;
  await supabase.storage.from(BUCKET_FOTOS).remove(paths.flatMap((p) => [rutaVariante(p, "chica"), rutaVariante(p, "grande")]));
}

function validarProducto(datos: DatosProductoEntrada) {
  const precio = parsearPrecio(datos.price);
  const cantidad = /^\d{1,3}$/.test(datos.quantity.trim()) ? Number(datos.quantity) : -1;
  return productoSchema.safeParse({
    name: datos.name,
    description: datos.description,
    price_cents: precio ?? 0,
    quantity: cantidad,
    visible: datos.visible,
  });
}

export async function crearProducto(datos: DatosProductoEntrada, fotos: string[], avanzarA?: number): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const r = validarProducto(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (fotos.length > 4) return { ok: false, error: "Podés subir hasta 4 fotos por producto." };
  if (!fotos.every((p) => rutaEsDeTienda(p, tienda.id, "productos"))) return { ok: false, error: NO_GUARDO };

  const { data: producto, error } = await supabase
    .from("products")
    .insert({ store_id: tienda.id, ...r.data, description: r.data.description || null })
    .select("id")
    .single();
  if (error || !producto) return { ok: false, error: NO_GUARDO };
  if (fotos.length) {
    const { error: errorFotos } = await supabase
      .from("product_photos")
      .insert(fotos.map((path, position) => ({ product_id: producto.id, path, position })));
    if (errorFotos) return { ok: false, error: NO_GUARDO };
  }
  await avanzarPaso(supabase, tienda, avanzarA);
  return { ok: true };
}

export async function actualizarProducto(id: string, datos: DatosProductoEntrada, fotos: string[]): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const r = validarProducto(datos);
  if (!r.success) return { ok: false, error: primerError(r.error) };
  if (fotos.length > 4) return { ok: false, error: "Podés subir hasta 4 fotos por producto." };
  if (!fotos.every((p) => rutaEsDeTienda(p, tienda.id, "productos"))) return { ok: false, error: NO_GUARDO };

  const { data: anteriores } = await supabase.from("product_photos").select("path").eq("product_id", id);
  const { error } = await supabase
    .from("products")
    .update({ ...r.data, description: r.data.description || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_id", tienda.id);
  if (error) return { ok: false, error: NO_GUARDO };
  await supabase.from("product_photos").delete().eq("product_id", id);
  if (fotos.length) {
    const { error: errorFotos } = await supabase
      .from("product_photos")
      .insert(fotos.map((path, position) => ({ product_id: id, path, position })));
    if (errorFotos) return { ok: false, error: NO_GUARDO };
  }
  const quitadas = ((anteriores as { path: string }[] | null) ?? []).map((f) => f.path).filter((p) => !fotos.includes(p));
  await borrarArchivos(supabase, quitadas);
  return { ok: true };
}

export async function cambiarVisibilidad(id: string, visible: boolean): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { error } = await sesion.supabase.from("products").update({ visible }).eq("id", id).eq("store_id", sesion.tienda.id);
  return error ? { ok: false, error: NO_GUARDO } : { ok: true };
}

export async function borrarProducto(id: string): Promise<Resultado> {
  const sesion = await duenaActual();
  if (!sesion) return { ok: false, error: NO_GUARDO };
  const { supabase, tienda } = sesion;
  const { data: fotos } = await supabase.from("product_photos").select("path").eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id).eq("store_id", tienda.id);
  if (error) return { ok: false, error: NO_GUARDO };
  await borrarArchivos(supabase, ((fotos as { path: string }[] | null) ?? []).map((f) => f.path));
  return { ok: true };
}
