import { describe, expect, it } from "vitest";
import { desfaseReloj, duracionVivoMs, estadoSala } from "./sala";
import type { ConfigVivo, Vivo } from "./tipos";

const CONFIG: ConfigVivo = { sin_conexion_segundos: 300, fuera_segundos: 900, senal_cada_segundos: 20 };
const AHORA = Date.parse("2026-10-27T21:00:00Z");

function vivoBase(parcial: Partial<Vivo> = {}): Vivo {
  return {
    id: "vivo-1",
    store_id: "tienda-1",
    whep_url: "https://example.test/whep",
    device_id: "dispositivo-1",
    started_at: new Date(AHORA - 600_000).toISOString(),
    ended_at: null,
    end_reason: null,
    last_signal_at: new Date(AHORA - 5_000).toISOString(),
    away_since: null,
    muted: false,
    viewers: 0,
    peak_viewers: 0,
    ...parcial,
  };
}

describe("estadoSala", () => {
  it("sin vivo espera", () => {
    expect(estadoSala(null, AHORA, CONFIG)).toBe("esperando");
  });

  it("cerrado termina", () => {
    const vivo = vivoBase({
      ended_at: new Date(AHORA - 1_000).toISOString(),
      end_reason: "duena",
      away_since: new Date(AHORA - 2_000).toISOString(),
    });
    expect(estadoSala(vivo, AHORA, CONFIG)).toBe("terminado");
  });

  it("fuera de la pantalla", () => {
    const vivo = vivoBase({ away_since: new Date(AHORA - 10_000).toISOString() });
    expect(estadoSala(vivo, AHORA, CONFIG)).toBe("vuelve-pronto");
  });

  it("señal vieja", () => {
    const vieja = vivoBase({ last_signal_at: new Date(AHORA - 41_000).toISOString() });
    expect(estadoSala(vieja, AHORA, CONFIG)).toBe("reconectando-feriante");

    const reciente = vivoBase({ last_signal_at: new Date(AHORA - 39_000).toISOString() });
    expect(estadoSala(reciente, AHORA, CONFIG)).toBe("en-vivo");
  });
});

describe("duracionVivoMs", () => {
  it("vivo abierto: cuenta hasta ahora", () => {
    const vivo = vivoBase({ started_at: new Date(AHORA - 600_000).toISOString() });
    expect(duracionVivoMs(vivo, AHORA)).toBe(600_000);
  });

  it("vivo cerrado: cuenta hasta el cierre", () => {
    const vivo = vivoBase({
      started_at: new Date(AHORA - 600_000).toISOString(),
      ended_at: new Date(AHORA - 120_000).toISOString(),
      end_reason: "duena",
    });
    expect(duracionVivoMs(vivo, AHORA)).toBe(480_000);
  });
});

describe("desfaseReloj", () => {
  const vivo = vivoBase({ last_signal_at: new Date(AHORA).toISOString() });

  it("con el reloj del celular adelantado no muestra 'se está reconectando' de más", () => {
    const llegada = AHORA + 60_000; // el celular va 1 minuto adelantado
    const desfase = desfaseReloj(vivo.last_signal_at, llegada);
    expect(desfase).toBe(60_000);
    expect(estadoSala(vivo, llegada + 10_000 - desfase, CONFIG)).toBe("en-vivo");
  });

  it("con el reloj atrasado igual detecta cuando se corta la señal", () => {
    const llegada = AHORA - 60_000; // el celular va 1 minuto atrasado
    const desfase = desfaseReloj(vivo.last_signal_at, llegada);
    expect(estadoSala(vivo, llegada + 45_000 - desfase, CONFIG)).toBe("reconectando-feriante");
  });
});
