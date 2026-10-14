export type TipoEntrega = "pickup" | "shipping" | "meetup";
export type ModoEnvio = "free" | "fixed" | "arrange";

export type OpcionEntrega = {
  kind: TipoEntrega;
  enabled: boolean;
  shipping_mode: ModoEnvio | null;
  shipping_cost_cents: number | null;
  note: string | null;
};

/** Lo que manda el formulario de entregas (textos crudos, se validan en el servidor). */
export type EntregasEntrada = {
  pickup: { enabled: boolean; address: string; hours: string };
  shipping: { enabled: boolean; mode: ModoEnvio; cost: string; note: string };
  meetup: { enabled: boolean; note: string };
};

export type Tienda = {
  id: string;
  owner_id: string;
  handle: string;
  name: string;
  category: string;
  zone: string;
  description: string | null;
  live_schedule_note: string | null;
  avatar_path: string | null;
  cover_path: string | null;
  onboarding_step: number;
  handle_changed_at: string | null;
};

export type DatosPrivados = {
  payment_alias: string | null;
  payment_holder: string | null;
  pickup_address: string | null;
  pickup_hours: string | null;
};

export type FotoProducto = { id: string; path: string; position: number };

export type Producto = {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  quantity: number;
  visible: boolean;
  fotos: FotoProducto[];
};

export type PuestoResumen = Pick<Tienda, "id" | "handle" | "name" | "category" | "zone" | "avatar_path"> & {
  productos: { id: string; price_cents: number; foto: string | null }[];
};

export type Resultado = { ok: true } | { ok: false; error: string };
