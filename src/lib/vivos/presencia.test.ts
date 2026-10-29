import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anunciarPresencia, contarMirando } from "./presencia";

function supabaseFalso() {
  let alSync: () => void = () => undefined;
  let alSuscribir: (estado: string) => void = () => undefined;
  let estado: Record<string, unknown[]> = {};
  const canal = {
    on: vi.fn((_tipo: string, _filtro: unknown, cb: () => void) => { alSync = cb; return canal; }),
    subscribe: vi.fn((cb: (estado: string) => void) => { alSuscribir = cb; return canal; }),
    track: vi.fn(async () => "ok"),
    untrack: vi.fn(async () => "ok"),
    presenceState: () => estado,
  };
  const supabase = {
    channel: vi.fn(() => canal),
    removeChannel: vi.fn(async () => "ok"),
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    crudo: supabase,
    canal,
    suscribir: () => alSuscribir("SUBSCRIBED"),
    sincronizar: (claves: string[]) => {
      estado = Object.fromEntries(claves.map((k) => [k, [{}]]));
      alSync();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("presencia", () => {
  it("la compradora se anuncia al suscribirse y se va al salir", async () => {
    const { supabase, crudo, canal, suscribir } = supabaseFalso();
    const salir = anunciarPresencia(supabase, "v1");
    expect(crudo.channel).toHaveBeenCalledWith("presencia:v1", { config: { presence: { key: expect.any(String) } } });
    expect(canal.track).not.toHaveBeenCalled();
    suscribir();
    expect(canal.track).toHaveBeenCalledWith({});
    salir();
    expect(canal.untrack).toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(crudo.removeChannel).toHaveBeenCalledWith(canal);
  });

  it("cuenta las personas en cada sincronización", () => {
    const { supabase, suscribir, sincronizar } = supabaseFalso();
    const al = vi.fn();
    const dejar = contarMirando(supabase, "v2", al);
    suscribir();
    sincronizar(["a", "b", "c"]);
    expect(al).toHaveBeenLastCalledWith(3);
    sincronizar(["a"]);
    expect(al).toHaveBeenLastCalledWith(1);
    dejar();
  });

  it("anunciarse y contar en el mismo vivo comparten un solo canal", async () => {
    const { supabase, crudo, canal, suscribir, sincronizar } = supabaseFalso();
    const salir = anunciarPresencia(supabase, "v3");
    suscribir();
    sincronizar(["yo"]);
    const al = vi.fn();
    const dejar = contarMirando(supabase, "v3", al);
    expect(crudo.channel).toHaveBeenCalledTimes(1);
    expect(canal.on).toHaveBeenCalledTimes(1);
    expect(al).toHaveBeenCalledWith(1);
    salir();
    await vi.runAllTimersAsync();
    expect(crudo.removeChannel).not.toHaveBeenCalled();
    dejar();
    await vi.runAllTimersAsync();
    expect(crudo.removeChannel).toHaveBeenCalledTimes(1);
  });
});
