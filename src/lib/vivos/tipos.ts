/** Por qué se cerró un vivo. Coincide con `end_reason` de la tabla `live_sessions`. */
export type MotivoCierre = "duena" | "sin_senal" | "plataforma";

/** Una fila de `live_sessions`, con solo las columnas que usa la app. */
export type Vivo = {
  id: string;
  store_id: string;
  whep_url: string;
  device_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: MotivoCierre | null;
  last_signal_at: string;
  away_since: string | null;
  muted: boolean;
  viewers: number;
  peak_viewers: number;
};

/** Tiempos de espera, leídos de la fila única de `live_config` (nunca constantes en el código). */
export type ConfigVivo = { sin_conexion_segundos: number; fuera_segundos: number; senal_cada_segundos: number };

/** Columnas a pedir a la base para armar un `Vivo`. */
export const CAMPOS_VIVO =
  "id, store_id, whep_url, device_id, started_at, ended_at, end_reason, last_signal_at, away_since, muted, viewers, peak_viewers";
