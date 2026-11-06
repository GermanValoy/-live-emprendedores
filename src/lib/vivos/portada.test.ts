import { describe, expect, it } from "vitest";
import { estadoEnPortada, ordenarPortada, puestosTransmitiendo } from "./portada";
import type { ConfigVivo, Vivo } from "./tipos";

const CONFIG: ConfigVivo = { sin_conexion_segundos: 300, fuera_segundos: 900, senal_cada_segundos: 20 };
const AHORA = Date.parse("2026-11-05T20:00:00Z");

const vivo = (cambios: Partial<Vivo> = {}): Vivo => ({
  id: "v1",
  store_id: "s1",
  whep_url: "https://x/whep",
  device_id: "d1",
  started_at: new Date(AHORA - 600_000).toISOString(),
  ended_at: null,
  end_reason: null,
  last_signal_at: new Date(AHORA - 5_000).toISOString(),
  away_since: null,
  muted: false,
  viewers: 0,
  peak_viewers: 0,
  ...cambios,
});

describe("estadoEnPortada", () => {
  it("con señal reciente está en vivo", () => {
    expect(estadoEnPortada(vivo(), AHORA, CONFIG)).toBe("en-vivo");
  });

  it("si la feriante salió de la pantalla, vuelve en un momento", () => {
    expect(estadoEnPortada(vivo({ away_since: new Date(AHORA - 1_000).toISOString() }), AHORA, CONFIG)).toBe("vuelve-pronto");
  });

  it("sin señal hace más de 40 s (se cortó la conexión), vuelve en un momento", () => {
    expect(estadoEnPortada(vivo({ last_signal_at: new Date(AHORA - 41_000).toISOString() }), AHORA, CONFIG)).toBe("vuelve-pronto");
    expect(estadoEnPortada(vivo({ last_signal_at: new Date(AHORA - 39_000).toISOString() }), AHORA, CONFIG)).toBe("en-vivo");
  });
});

describe("ordenarPortada", () => {
  it("primero los que transmiten (más gente primero) y al final los que vuelven en un momento", () => {
    const items = [
      { id: "a", viewers: 50, estado: "vuelve-pronto" as const },
      { id: "b", viewers: 3, estado: "en-vivo" as const },
      { id: "c", viewers: 9, estado: "en-vivo" as const },
      { id: "d", viewers: 1, estado: "vuelve-pronto" as const },
    ];
    expect(ordenarPortada(items).map((i) => i.id)).toEqual(["c", "b", "a", "d"]);
  });
});

describe("puestosTransmitiendo", () => {
  it("deja afuera a los que salieron de la pantalla o perdieron la señal", () => {
    const vivos = [
      { vivo: vivo({ id: "v1" }), puesto: { id: "transmite" } },
      { vivo: vivo({ id: "v2", away_since: new Date(AHORA).toISOString() }), puesto: { id: "salio" } },
      { vivo: vivo({ id: "v3", last_signal_at: new Date(AHORA - 60_000).toISOString() }), puesto: { id: "sin-senal" } },
    ];
    expect([...puestosTransmitiendo(vivos, CONFIG, AHORA)]).toEqual(["transmite"]);
  });
});