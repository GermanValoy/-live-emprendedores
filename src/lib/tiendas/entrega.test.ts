import { describe, expect, it } from "vitest";
import type { EntregasEntrada, OpcionEntrega } from "./tipos";
import { resumenEntregas, validarEntregas } from "./entrega";

const base: EntregasEntrada = {
  pickup: { enabled: false, address: "", hours: "" },
  shipping: { enabled: false, mode: "fixed", cost: "", note: "" },
  meetup: { enabled: false, note: "" },
};

describe("validarEntregas", () => {
  it("exige al menos una forma de entrega", () => {
    expect(validarEntregas(base)).toEqual({ ok: false, error: "Elegí al menos una forma de entrega." });
  });

  it("exige la dirección si hay retiro en domicilio", () => {
    const r = validarEntregas({ ...base, pickup: { enabled: true, address: "", hours: "" } });
    expect(r).toEqual({ ok: false, error: "Escribí la dirección para el retiro." });
  });

  it("exige el costo si el envío es con monto fijo", () => {
    const r = validarEntregas({ ...base, shipping: { enabled: true, mode: "fixed", cost: "abc", note: "" } });
    expect(r).toEqual({ ok: false, error: "Escribí el costo del envío." });
  });

  it("arma las opciones y separa los datos privados del retiro", () => {
    const r = validarEntregas({
      pickup: { enabled: true, address: "  Av. Aconquija 1234  ", hours: "Lun a vie 17 a 20 h" },
      shipping: { enabled: true, mode: "fixed", cost: "2.500", note: "Solo Gran San Miguel" },
      meetup: { enabled: false, note: "" },
    });
    expect(r).toEqual({
      ok: true,
      pickupAddress: "Av. Aconquija 1234",
      pickupHours: "Lun a vie 17 a 20 h",
      opciones: [
        { kind: "pickup", enabled: true, shipping_mode: null, shipping_cost_cents: null, note: null },
        { kind: "shipping", enabled: true, shipping_mode: "fixed", shipping_cost_cents: 250000, note: "Solo Gran San Miguel" },
        { kind: "meetup", enabled: false, shipping_mode: null, shipping_cost_cents: null, note: null },
      ],
    });
  });

  it("el envío gratis o a coordinar no lleva costo", () => {
    const r = validarEntregas({ ...base, shipping: { enabled: true, mode: "free", cost: "999", note: "" } });
    expect(r.ok && r.opciones[1]).toEqual({
      kind: "shipping", enabled: true, shipping_mode: "free", shipping_cost_cents: null, note: null,
    });
  });
});

describe("resumenEntregas", () => {
  const op = (o: Partial<OpcionEntrega> & Pick<OpcionEntrega, "kind">): OpcionEntrega => ({
    enabled: true, shipping_mode: null, shipping_cost_cents: null, note: null, ...o,
  });

  it("describe cada forma habilitada en orden", () => {
    expect(
      resumenEntregas(
        [op({ kind: "meetup" }), op({ kind: "shipping", shipping_mode: "fixed", shipping_cost_cents: 250000 }), op({ kind: "pickup" })],
        "Yerba Buena",
      ),
    ).toEqual(["Retiro en Yerba Buena", "Envío $2.500", "Punto de encuentro"]);
  });

  it("describe el envío gratis y a coordinar, y omite las deshabilitadas", () => {
    expect(resumenEntregas([op({ kind: "shipping", shipping_mode: "free" })], "X")).toEqual(["Envío gratis"]);
    expect(resumenEntregas([op({ kind: "shipping", shipping_mode: "arrange" })], "X")).toEqual(["Envío a coordinar"]);
    expect(resumenEntregas([op({ kind: "pickup", enabled: false })], "X")).toEqual([]);
  });
});
