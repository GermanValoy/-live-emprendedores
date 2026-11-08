import type { TipoEntrega } from "@/lib/tiendas/tipos";

export type EstadoCodigo = "activo" | "cerrado" | "anulado";
export type EstadoPedido = "por_pagar" | "pago_informado" | "en_revision" | "pagado" | "vencido" | "anulado";
export type MotivoAnulacion = "ofrecida_a_otra" | "codigo_anulado" | "reclamo_anulado";
export type EstadoReclamo = "ganadora" | "espera" | "anulada" | "caducada";

/** Una fila de `live_codes`. */
export type Codigo = {
  id: string;
  live_session_id: string;
  store_id: string;
  word: string;
  label: string;
  price_cents: number;
  quantity: number;
  sold: number;
  photo_path: string | null;
  product_id: string | null;
  by_voice: boolean;
  status: EstadoCodigo;
  last_winner_name: string | null;
  last_winner_at: string | null;
  created_at: string;
  closed_at: string | null;
};

/** Una fila de `orders`. */
export type Pedido = {
  id: string;
  claim_id: string;
  code_id: string;
  store_id: string;
  live_session_id: string;
  buyer_id: string;
  buyer_name: string;
  price_cents: number;
  delivery_kind: TipoEntrega | null;
  shipping_cents: number | null;
  total_cents: number;
  payment_alias: string;
  payment_holder: string;
  buyer_whatsapp: string | null;
  status: EstadoPedido;
  cancel_reason: MotivoAnulacion | null;
  deadline: string;
  created_at: string;
  reported_at: string | null;
  confirmed_at: string | null;
  updated_at: string;
};

/** Una fila de `claims`. */
export type Reclamo = {
  id: string;
  code_id: string;
  user_id: string;
  buyer_name: string;
  message_id: string | null;
  message_body: string;
  claimed_at: string;
  status: EstadoReclamo;
};

/** La fila única de `code_config`. */
export type ConfigCodigo = {
  plazo_minutos: number;
  cartel_ganadora_segundos: number;
  lista_espera_max: number;
  aceptar_casi: boolean;
  voz_umbral_minimo: number;
  voz_previo_ms: number;
  voz_silencio_fin_ms: number;
  voz_maximo_ms: number;
  voz_solape_ms: number;
  voz_minimo_voz_ms: number;
  voz_segundos_por_dia: number;
};

/** Columnas de `live_codes` para `.select(...)`. */
export const CAMPOS_CODIGO =
  "id, live_session_id, store_id, word, label, price_cents, quantity, sold, photo_path, product_id, by_voice, status, last_winner_name, last_winner_at, created_at, closed_at";

/** Columnas de `orders` para `.select(...)`. */
export const CAMPOS_PEDIDO =
  "id, claim_id, code_id, store_id, live_session_id, buyer_id, buyer_name, price_cents, delivery_kind, shipping_cents, total_cents, payment_alias, payment_holder, buyer_whatsapp, status, cancel_reason, deadline, created_at, reported_at, confirmed_at, updated_at";

/** Lo que le pasó a una compradora cuando escribió (o casi escribió) el código en el chat. */
export type ResultadoReclamo =
  | { estado: "ganaste"; pedido: string }
  | { estado: "lista"; lugar: number; ganadora: string }
  | { estado: "agotado" | "repetido" | "propio" }
  | { estado: "pista"; tipo: "nombra" | "casi"; codigo: string };
