import { describe, expect, it } from "vitest";
import { restante, totalPedido } from "./pedido";

describe("totalPedido", () => {
  it("suma el envío", () => expect(totalPedido(800000, 250000)).toBe(1050000));
  it("sin envío es el precio", () => expect(totalPedido(800000, null)).toBe(800000));
});

describe("restante", () => {
  const ahora = Date.parse("2026-11-06T15:00:00Z");
  it("formatea mm:ss", () => {
    const r = restante(new Date(ahora + 892_000).toISOString(), ahora);
    expect(r).toEqual({ ms: 892_000, texto: "14:52" });
  });
  it("nunca es negativo", () => {
    expect(restante(new Date(ahora - 5000).toISOString(), ahora)).toEqual({ ms: 0, texto: "0:00" });
  });
});
