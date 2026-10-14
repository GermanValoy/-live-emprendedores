import { formatARS } from "@/lib/format/plata";
import type { EntregasEntrada, OpcionEntrega, TipoEntrega } from "./tipos";
import { parsearPrecio } from "./validacion";

const ORDEN: TipoEntrega[] = ["pickup", "shipping", "meetup"];

type ResultadoEntregas =
  | { ok: true; opciones: OpcionEntrega[]; pickupAddress: string | null; pickupHours: string | null }
  | { ok: false; error: string };

const nota = (texto: string): string | null => {
  const limpio = texto.trim();
  return limpio ? limpio : null;
};

export function validarEntregas(entrada: EntregasEntrada): ResultadoEntregas {
  const { pickup, shipping, meetup } = entrada;
  if (!pickup.enabled && !shipping.enabled && !meetup.enabled) {
    return { ok: false, error: "Elegí al menos una forma de entrega." };
  }
  const direccion = pickup.address.trim();
  if (pickup.enabled && (direccion.length < 5 || direccion.length > 120)) {
    return { ok: false, error: "Escribí la dirección para el retiro." };
  }
  if ([pickup.hours, shipping.note, meetup.note].some((t) => t.trim().length > 80)) {
    return { ok: false, error: "Las aclaraciones pueden tener hasta 80 caracteres." };
  }
  let costo: number | null = null;
  if (shipping.enabled && shipping.mode === "fixed") {
    costo = parsearPrecio(shipping.cost);
    if (costo === null) return { ok: false, error: "Escribí el costo del envío." };
  }
  return {
    ok: true,
    pickupAddress: pickup.enabled ? direccion : null,
    pickupHours: pickup.enabled ? nota(pickup.hours) : null,
    opciones: [
      { kind: "pickup", enabled: pickup.enabled, shipping_mode: null, shipping_cost_cents: null, note: null },
      {
        kind: "shipping",
        enabled: shipping.enabled,
        shipping_mode: shipping.enabled ? shipping.mode : null,
        shipping_cost_cents: costo,
        note: shipping.enabled ? nota(shipping.note) : null,
      },
      { kind: "meetup", enabled: meetup.enabled, shipping_mode: null, shipping_cost_cents: null, note: meetup.enabled ? nota(meetup.note) : null },
    ],
  };
}

/** Texto público de cada forma de entrega habilitada: "Retiro en Yerba Buena", "Envío $2.500"… */
export function resumenEntregas(opciones: OpcionEntrega[], zona: string): string[] {
  return [...opciones]
    .filter((o) => o.enabled)
    .sort((a, b) => ORDEN.indexOf(a.kind) - ORDEN.indexOf(b.kind))
    .map((o) => {
      if (o.kind === "pickup") return `Retiro en ${zona}`;
      if (o.kind === "meetup") return "Punto de encuentro";
      if (o.shipping_mode === "free") return "Envío gratis";
      if (o.shipping_mode === "fixed" && o.shipping_cost_cents) return `Envío ${formatARS(o.shipping_cost_cents)}`;
      return "Envío a coordinar";
    });
}
