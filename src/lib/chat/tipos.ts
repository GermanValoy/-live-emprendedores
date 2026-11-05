// Tipos compartidos del chat de la sala.

export type MotivoOculto = "link" | "promocion" | "insulto" | "repetido";

export type MensajeChat = {
  id: string;
  live_session_id: string;
  user_id: string;
  author_name: string;
  body: string;
  is_seller: boolean;
  hidden_reason: MotivoOculto | null;
  deleted_at: string | null;
  created_at: string;
};

// Columnas que se piden al leer mensajes (las mismas que MensajeChat).
export const CAMPOS_MENSAJE =
  "id, live_session_id, user_id, author_name, body, is_seller, hidden_reason, deleted_at, created_at";

export type ConfigChat = { largo_maximo: number; mensajes_al_entrar: number };

export type SilencioChat = "temporal" | "sala" | "plataforma" | null;
