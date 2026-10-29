/**
 * Cuánta gente mira: cada persona en la sala (con sesión o sin ella) se anuncia en el canal de
 * "presencia" de Supabase Realtime `presencia:<vivoId>`. Cloudflare no informa ese número por WebRTC.
 *
 * Un mismo cliente de Supabase no puede abrir dos canales con el mismo nombre (devuelve el mismo
 * y no deja agregar oyentes de presencia después de suscribirse), así que anunciarse y contar
 * comparten un solo canal por vivo, que se cierra cuando nadie lo usa.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type Canal = {
  canal: RealtimeChannel;
  usos: number;
  anuncian: number;
  suscripto: boolean;
  oyentes: Set<(n: number) => void>;
  cierre: ReturnType<typeof setTimeout> | null;
};

const abiertos = new WeakMap<SupabaseClient, Map<string, Canal>>();

const contar = (c: Canal) => Object.keys(c.canal.presenceState()).length;

function usarCanal(supabase: SupabaseClient, vivoId: string): Canal {
  let delCliente = abiertos.get(supabase);
  if (!delCliente) abiertos.set(supabase, (delCliente = new Map()));
  const existente = delCliente.get(vivoId);
  if (existente) {
    // Se reusa (por ejemplo, React desmonta y vuelve a montar enseguida).
    if (existente.cierre) clearTimeout(existente.cierre);
    existente.cierre = null;
    existente.usos++;
    return existente;
  }

  const canal = supabase.channel(`presencia:${vivoId}`, { config: { presence: { key: crypto.randomUUID() } } });
  const c: Canal = { canal, usos: 1, anuncian: 0, suscripto: false, oyentes: new Set(), cierre: null };
  canal.on("presence", { event: "sync" }, () => {
    const n = contar(c);
    for (const oyente of c.oyentes) oyente(n);
  });
  canal.subscribe((estado) => {
    c.suscripto = estado === "SUBSCRIBED";
    // Al volver a suscribirse (por ejemplo, tras un corte de internet) hay que anunciarse de nuevo.
    if (c.suscripto && c.anuncian > 0) void canal.track({});
  });
  delCliente.set(vivoId, c);
  return c;
}

function soltarCanal(supabase: SupabaseClient, vivoId: string, c: Canal) {
  if (--c.usos > 0) return;
  c.cierre = setTimeout(() => {
    abiertos.get(supabase)?.delete(vivoId);
    void supabase.removeChannel(c.canal);
  }, 0);
}

/** La compradora se anuncia en la sala. Devuelve cómo dejar de anunciarse. */
export function anunciarPresencia(supabase: SupabaseClient, vivoId: string): () => void {
  const c = usarCanal(supabase, vivoId);
  c.anuncian++;
  if (c.suscripto && c.anuncian === 1) void c.canal.track({});
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    if (--c.anuncian === 0 && c.suscripto) void c.canal.untrack();
    soltarCanal(supabase, vivoId, c);
  };
}

/** Avisa cuánta gente mira cada vez que cambia. Devuelve cómo dejar de escuchar. */
export function contarMirando(supabase: SupabaseClient, vivoId: string, al: (n: number) => void): () => void {
  const c = usarCanal(supabase, vivoId);
  c.oyentes.add(al);
  if (c.suscripto) al(contar(c));
  let suelto = false;
  return () => {
    if (suelto) return;
    suelto = true;
    c.oyentes.delete(al);
    soltarCanal(supabase, vivoId, c);
  };
}
