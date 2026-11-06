import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteAdmin, type UsuarioPrueba } from "./usuario-prueba";

export function handleAleatorio(prefijo = "prueba"): string {
  return `${prefijo}.${randomBytes(4).toString("hex")}`;
}

export async function hacerAdmin(userId: string): Promise<void> {
  const { error } = await clienteAdmin().from("platform_admins").insert({ user_id: userId });
  if (error) throw error;
}

export async function crearInvitacionPrueba(adminId: string, opciones: { venceEnDias?: number } = {}): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const vence = new Date(Date.now() + (opciones.venceEnDias ?? 7) * 86_400_000).toISOString();
  const { error } = await clienteAdmin()
    .from("invitations")
    .insert({ token, created_by: adminId, expires_at: vence, note: "Prueba" });
  if (error) throw error;
  return token;
}

/** Crea una tienda directamente (sin invitación) para preparar pruebas. */
export async function crearTiendaPrueba(
  usuario: UsuarioPrueba,
  datos: { handle?: string; completa?: boolean; conProducto?: boolean } = {},
): Promise<{ id: string; handle: string }> {
  const admin = clienteAdmin();
  const handle = datos.handle ?? handleAleatorio();
  const completa = datos.completa ?? true;
  const { data, error } = await admin
    .from("stores")
    .insert({
      owner_id: usuario.id, handle, name: "Puesto de Prueba", category: "Ropa usada", zone: "Yerba Buena",
      onboarding_step: completa ? 5 : 2,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  const privados = await admin.from("store_private_info").insert({
    store_id: id,
    payment_alias: completa ? "prueba.alias" : null,
    payment_holder: completa ? "Titular Prueba" : null,
    pickup_address: completa ? "Calle Falsa 123" : null,
  });
  if (privados.error) throw privados.error;
  if (completa) {
    const entrega = await admin.from("store_delivery_options").insert({ store_id: id, kind: "pickup", enabled: true });
    if (entrega.error) throw entrega.error;
  }
  if (datos.conProducto) {
    const producto = await admin.from("products").insert({ store_id: id, name: "Vestido de prueba", price_cents: 800000, quantity: 1 });
    if (producto.error) throw producto.error;
  }
  return { id, handle };
}

/** Simula la transmisión de Cloudflare de un puesto (las pruebas nunca llaman a Cloudflare). */
export async function crearTransmisionPrueba(storeId: string): Promise<void> {
  const { error } = await clienteAdmin().from("store_streams").insert({
    store_id: storeId,
    cloudflare_uid: `prueba-${storeId}`,
    whip_url: "https://cloudflare.invalid/whip",
    whep_url: "https://cloudflare.invalid/whep",
  });
  if (error) throw error;
}

export async function borrarVivosDeTienda(storeId: string): Promise<void> {
  const { error } = await clienteAdmin().from("live_sessions").delete().eq("store_id", storeId);
  if (error) throw error;
}

export async function borrarChatDeTienda(storeId: string): Promise<void> {
  const admin = clienteAdmin();
  for (const tabla of ["moderation_actions", "chat_silences", "chat_messages"]) {
    const { error } = await admin.from(tabla).delete().eq("store_id", storeId);
    if (error) throw error;
  }
}

/** Publica un mensaje como lo haría el servidor (con la clave de servicio). */
export async function publicarPrueba(
  userId: string,
  vivoId: string,
  texto: string,
  motivo: string | null = null,
): Promise<Record<string, unknown>> {
  const { data, error } = await clienteAdmin().rpc("publicar_mensaje", {
    p_user: userId,
    p_vivo: vivoId,
    p_nombre: "Prueba P.",
    p_texto: texto,
    p_normalizado: texto.toLowerCase().trim(),
    p_motivo: motivo,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function borrarFotosDeTienda(storeId: string): Promise<void> {
  const bucket = clienteAdmin().storage.from("tienda-fotos");
  for (const carpeta of ["perfil", "portada", "productos"]) {
    const { data } = await bucket.list(`${storeId}/${carpeta}`, { limit: 1000 });
    const rutas = (data ?? []).map((f) => `${storeId}/${carpeta}/${f.name}`);
    if (rutas.length) await bucket.remove(rutas);
  }
}

/** Borra pedidos, informes de pago (y sus comprobantes), reclamos y códigos de un puesto. */
export async function borrarCodigosDeTienda(storeId: string): Promise<void> {
  const admin = clienteAdmin();
  const { data: pedidos, error: errorPedidos } = await admin.from("orders").select("id, buyer_id").eq("store_id", storeId);
  if (errorPedidos) throw errorPedidos;
  const ids = (pedidos ?? []).map((p) => p.id as string);
  if (ids.length) {
    // Los comprobantes están en <compradora>/<pedido>/: se borran también los subidos sin informar.
    const comprobantes = admin.storage.from("comprobantes");
    for (const p of pedidos ?? []) {
      const carpeta = `${p.buyer_id as string}/${p.id as string}`;
      const { data: archivos, error: errorLista } = await comprobantes.list(carpeta, { limit: 1000 });
      if (errorLista) throw errorLista;
      const rutas = (archivos ?? []).map((f) => `${carpeta}/${f.name}`);
      if (rutas.length) {
        const { error: errorBorrar } = await comprobantes.remove(rutas);
        if (errorBorrar) throw errorBorrar;
      }
    }
    const borrarInformes = await admin.from("payment_reports").delete().in("order_id", ids);
    if (borrarInformes.error) throw borrarInformes.error;
  }
  const borrarPedidos = await admin.from("orders").delete().eq("store_id", storeId);
  if (borrarPedidos.error) throw borrarPedidos.error;
  const { data: codigos, error: errorCodigos } = await admin.from("live_codes").select("id").eq("store_id", storeId);
  if (errorCodigos) throw errorCodigos;
  const codigoIds = (codigos ?? []).map((c) => c.id as string);
  if (codigoIds.length) {
    const borrarReclamos = await admin.from("claims").delete().in("code_id", codigoIds);
    if (borrarReclamos.error) throw borrarReclamos.error;
  }
  const borrarCodigos = await admin.from("live_codes").delete().eq("store_id", storeId);
  if (borrarCodigos.error) throw borrarCodigos.error;
}

/** Lanza un código como la feriante (con su propia sesión). La etiqueta es la palabra en mayúsculas. */
export async function lanzarPrueba(
  cliente: SupabaseClient,
  vivoId: string,
  palabra: string,
  opciones: { precio?: number; cantidad?: number } = {},
): Promise<{ id: string }> {
  const { data, error } = await cliente.rpc("lanzar_codigo", {
    p_vivo: vivoId,
    p_palabra: palabra,
    p_etiqueta: palabra.toUpperCase(),
    p_precio: opciones.precio ?? 800000,
    p_cantidad: opciones.cantidad ?? 1,
    p_foto: null,
    p_producto: null,
    p_por_voz: false,
  });
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

/** Reclama un código como lo haría el servidor (con la clave de servicio), sin mensaje del chat. */
export async function reclamarPrueba(
  userId: string,
  codigoId: string,
  nombre = "Prueba P.",
): Promise<Record<string, unknown>> {
  const { data, error } = await clienteAdmin().rpc("reclamar_codigo", {
    p_user: userId,
    p_codigo: codigoId,
    p_nombre: nombre,
    p_mensaje: null,
    p_texto: "ROJO",
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}
