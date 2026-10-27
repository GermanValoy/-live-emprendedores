import type { ConfigVivo, Vivo } from "./tipos";

export type EstadoSala = "esperando" | "en-vivo" | "vuelve-pronto" | "reconectando-feriante" | "terminado";

/** Qué muestra la sala en este momento. `ahora` son milisegundos de Date.now(). El orden de las reglas importa. */
export function estadoSala(vivo: Vivo | null, ahora: number, config: ConfigVivo): EstadoSala {
  if (!vivo) return "esperando";
  if (vivo.ended_at) return "terminado";
  if (vivo.away_since) return "vuelve-pronto";
  const ultimaSenal = Date.parse(vivo.last_signal_at);
  if (ahora - ultimaSenal > 2 * config.senal_cada_segundos * 1000) return "reconectando-feriante";
  return "en-vivo";
}

/** Tiempo transcurrido del vivo: hasta el cierre si ya terminó, o hasta `ahora` si sigue abierto. */
export function duracionVivoMs(vivo: Vivo, ahora: number): number {
  const fin = vivo.ended_at ? Date.parse(vivo.ended_at) : ahora;
  return fin - Date.parse(vivo.started_at);
}
