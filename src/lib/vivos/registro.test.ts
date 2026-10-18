import { describe, expect, it } from "vitest";
import { agregarEvento, esperaReconexion, type EventoRegistro, resumir, textoResumen } from "./registro";

function armar(eventos: EventoRegistro[]): EventoRegistro[] {
  return eventos.reduce<EventoRegistro[]>((lista, e) => agregarEvento(lista, e), []);
}

const muestra = (en: number, atrasoMs: number | null): EventoRegistro =>
  ({ tipo: "muestra", en, atrasoMs, ancho: 1280, alto: 720, fps: 30 });

const DOS_CORTES: EventoRegistro[] = [
  { tipo: "inicio", en: 0 },
  { tipo: "corte", en: 60_000, motivo: "conexion" },
  { tipo: "vuelta", en: 63_000, como: "sola" },
  { tipo: "corte", en: 120_000, motivo: "pista" },
  { tipo: "vuelta", en: 128_000, como: "manual" },
  { tipo: "fin", en: 900_000 },
];

describe("agregarEvento", () => {
  it("no duplica cortes", () => {
    const eventos = armar([
      { tipo: "inicio", en: 0 },
      { tipo: "vuelta", en: 500, como: "sola" },
      { tipo: "corte", en: 1_000, motivo: "conexion" },
      { tipo: "corte", en: 1_100, motivo: "pista" },
      { tipo: "vuelta", en: 2_000, como: "sola" },
      { tipo: "vuelta", en: 2_500, como: "sola" },
    ]);
    expect(eventos).toHaveLength(3);
    expect(resumir(eventos, 3_000).cortes).toEqual([{ inicio: 1_000, duracionMs: 1_000, como: "sola" }]);
  });
});

describe("resumir", () => {
  it("resume duración y cortes", () => {
    const r = resumir(armar(DOS_CORTES), 1_000_000);
    expect(r.duracionMs).toBe(900_000);
    expect(r.cortes).toEqual([
      { inicio: 60_000, duracionMs: 3_000, como: "sola" },
      { inicio: 120_000, duracionMs: 8_000, como: "manual" },
    ]);
  });

  it("corte en curso", () => {
    const r = resumir(armar([{ tipo: "inicio", en: 0 }, { tipo: "corte", en: 10_000, motivo: "sin-cuadros" }]), 15_000);
    expect(r.duracionMs).toBe(15_000);
    expect(r.cortes).toEqual([{ inicio: 10_000, duracionMs: 5_000, como: "sigue" }]);
  });

  it("atraso", () => {
    const con = resumir(armar([{ tipo: "inicio", en: 0 }, muestra(10_000, 300), muestra(20_000, 500), muestra(30_000, null)]), 40_000);
    expect(con.atrasoPromedioMs).toBe(400);
    expect(con.atrasoMaxMs).toBe(500);
    const sin = resumir(armar([{ tipo: "inicio", en: 0 }]), 40_000);
    expect(sin.atrasoPromedioMs).toBeNull();
    expect(sin.atrasoMaxMs).toBeNull();
  });
});

describe("textoResumen", () => {
  it("texto", () => {
    const r = resumir(armar([...DOS_CORTES.slice(0, -1), muestra(200_000, 400), DOS_CORTES.at(-1)!]), 1_000_000);
    expect(textoResumen(r, "mirar", "iPhone")).toBe(
      "Mirar · iPhone · 15 min · 2 cortes (3 s y 8 s) · 1 volvió sola, 1 hubo que tocar · atraso estimado 0,4 s",
    );
  });

  it("sin cortes ni atraso", () => {
    const r = resumir(armar([{ tipo: "inicio", en: 0 }, { tipo: "fin", en: 300_000 }]), 300_000);
    expect(textoResumen(r, "transmitir", "Android")).toBe("Transmitir · Android · 5 min · 0 cortes · atraso estimado sin datos");
  });

  it("un corte que sigue", () => {
    const r = resumir(armar([{ tipo: "inicio", en: 0 }, { tipo: "corte", en: 60_000, motivo: "pista" }]), 64_000);
    expect(textoResumen(r, "transmitir", "iPhone")).toBe(
      "Transmitir · iPhone · 1 min · 1 corte (4 s) · 1 sigue cortado · atraso estimado sin datos",
    );
  });
});

describe("esperaReconexion", () => {
  it("esperas", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(esperaReconexion)).toEqual([1000, 2000, 4000, 8000, 10000, 10000, 10000]);
  });
});
