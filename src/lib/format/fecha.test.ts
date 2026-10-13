import { describe, expect, it } from "vitest";
import { formatFechaTucuman } from "./fecha";

describe("formatFechaTucuman", () => {
  it("convierte UTC a la hora de Tucumán (UTC-3)", () => {
    expect(formatFechaTucuman("2026-10-13T18:30:00Z")).toBe("13/10/2026 15:30");
  });

  it("de madrugada en UTC todavía es el día anterior en Tucumán", () => {
    expect(formatFechaTucuman("2026-10-13T02:59:00Z")).toBe("12/10/2026 23:59");
  });

  it("muestra la medianoche como 00, no como 24", () => {
    expect(formatFechaTucuman("2026-10-13T03:00:00Z")).toBe("13/10/2026 00:00");
  });

  it("acepta objetos Date", () => {
    expect(formatFechaTucuman(new Date(Date.UTC(2026, 0, 1, 12, 5)))).toBe("01/01/2026 09:05");
  });

  it("rechaza fechas inválidas", () => {
    expect(() => formatFechaTucuman("no es una fecha")).toThrow(RangeError);
  });
});
