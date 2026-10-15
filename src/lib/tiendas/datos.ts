import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosPrivados, OpcionEntrega, Producto, PuestoResumen, Tienda } from "./tipos";

export const CAMPOS_TIENDA =
  "id, owner_id, handle, name, category, zone, description, live_schedule_note, avatar_path, cover_path, onboarding_step, handle_changed_at";

const CAMPOS_PRODUCTO = "id, store_id, name, description, price_cents, quantity, visible, product_photos(id, path, position)";

type FilaProducto = Omit<Producto, "fotos"> & { product_photos: Producto["fotos"] };

const aProducto = ({ product_photos, ...resto }: FilaProducto): Producto => ({
  ...resto,
  fotos: [...(product_photos ?? [])].sort((a, b) => a.position - b.position),
});

export async function obtenerMiTienda(supabase: SupabaseClient, userId: string): Promise<Tienda | null> {
  const { data } = await supabase.from("stores").select(CAMPOS_TIENDA).eq("owner_id", userId).maybeSingle();
  return (data as Tienda | null) ?? null;
}

export async function obtenerTiendaPorHandle(supabase: SupabaseClient, handle: string): Promise<Tienda | null> {
  const { data } = await supabase.from("stores").select(CAMPOS_TIENDA).eq("handle", handle.toLowerCase()).maybeSingle();
  return (data as Tienda | null) ?? null;
}

export async function obtenerEntregas(supabase: SupabaseClient, storeId: string): Promise<OpcionEntrega[]> {
  const { data } = await supabase
    .from("store_delivery_options")
    .select("kind, enabled, shipping_mode, shipping_cost_cents, note")
    .eq("store_id", storeId);
  return (data as OpcionEntrega[] | null) ?? [];
}

export async function obtenerDatosPrivados(supabase: SupabaseClient, storeId: string): Promise<DatosPrivados | null> {
  const { data } = await supabase
    .from("store_private_info")
    .select("payment_alias, payment_holder, pickup_address, pickup_hours")
    .eq("store_id", storeId)
    .maybeSingle();
  return (data as DatosPrivados | null) ?? null;
}

export async function listarProductos(supabase: SupabaseClient, storeId: string): Promise<Producto[]> {
  const { data } = await supabase.from("products").select(CAMPOS_PRODUCTO).eq("store_id", storeId).order("created_at", { ascending: false });
  return ((data as FilaProducto[] | null) ?? []).map(aProducto);
}

export async function obtenerProducto(supabase: SupabaseClient, storeId: string, productId: string): Promise<Producto | null> {
  const { data } = await supabase.from("products").select(CAMPOS_PRODUCTO).eq("store_id", storeId).eq("id", productId).maybeSingle();
  return data ? aProducto(data as FilaProducto) : null;
}

export async function contarSeguidores(supabase: SupabaseClient, storeId: string): Promise<number> {
  const { data } = await supabase.rpc("contar_seguidores", { p_store: storeId });
  return typeof data === "number" ? data : 0;
}

const CAMPOS_PUESTO =
  "id, handle, name, category, zone, avatar_path, created_at, products(id, price_cents, visible, created_at, product_photos(path, position))";

type FilaPuesto = Omit<PuestoResumen, "productos"> & {
  products: { id: string; price_cents: number; visible: boolean; product_photos: { path: string; position: number }[] }[];
};

const aPuesto = ({ products, ...tienda }: FilaPuesto): PuestoResumen => ({
  id: tienda.id,
  handle: tienda.handle,
  name: tienda.name,
  category: tienda.category,
  zone: tienda.zone,
  avatar_path: tienda.avatar_path,
  productos: (products ?? [])
    .filter((p) => p.visible)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      price_cents: p.price_cents,
      foto: [...(p.product_photos ?? [])].sort((a, b) => a.position - b.position)[0]?.path ?? null,
    })),
});

/** Puestos completos (paso 5) para el Inicio: primero los que tienen productos. */
export async function listarPuestos(supabase: SupabaseClient): Promise<PuestoResumen[]> {
  const { data } = await supabase
    .from("stores")
    .select(CAMPOS_PUESTO)
    .eq("onboarding_step", 5)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "products", ascending: false })
    .limit(50);
  const puestos = ((data as FilaPuesto[] | null) ?? []).map(aPuesto);
  return puestos.sort((a, b) => Number(b.productos.length > 0) - Number(a.productos.length > 0));
}

export async function listarSeguidos(supabase: SupabaseClient, userId: string): Promise<PuestoResumen[]> {
  const { data } = await supabase
    .from("follows")
    .select(`stores(${CAMPOS_PUESTO})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return ((data as unknown as { stores: FilaPuesto | null }[] | null) ?? [])
    .flatMap((f) => (f.stores ? [aPuesto(f.stores)] : []));
}

export async function idsSeguidos(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("follows").select("store_id").eq("user_id", userId);
  return new Set(((data as { store_id: string }[] | null) ?? []).map((f) => f.store_id));
}
