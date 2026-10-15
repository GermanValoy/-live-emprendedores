import { randomBytes } from "node:crypto";
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

export async function borrarFotosDeTienda(storeId: string): Promise<void> {
  const bucket = clienteAdmin().storage.from("tienda-fotos");
  for (const carpeta of ["perfil", "portada", "productos"]) {
    const { data } = await bucket.list(`${storeId}/${carpeta}`, { limit: 1000 });
    const rutas = (data ?? []).map((f) => `${storeId}/${carpeta}/${f.name}`);
    if (rutas.length) await bucket.remove(rutas);
  }
}
