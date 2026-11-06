import { describe, expect, it } from "vitest";
import { DetectorVoz } from "./detector";

const TASA = 16_000;
const BLOQUE_MS = 100;
const config = { umbralMinimo: 0.012, previoMs: 600, silencioFinMs: 800, maximoMs: 12_000, solapeMs: 2_000, minimoVozMs: 500 };

function armar() {
  const frases: { muestras: Float32Array; inicioMs: number }[] = [];
  const d = new DetectorVoz(config, TASA, (muestras, inicioMs) => frases.push({ muestras, inicioMs }));
  let t = 0;
  const bloque = (valor: number) => {
    const b = new Float32Array((TASA * BLOQUE_MS) / 1000).fill(valor);
    const r = d.procesar(b, t);
    t += BLOQUE_MS;
    return r;
  };
  const durante = (ms: number, valor: number) => {
    for (let i = 0; i < ms / BLOQUE_MS; i++) bloque(valor);
  };
  return { frases, bloque, durante };
}
const ms = (m: Float32Array) => (m.length / TASA) * 1000;

describe("DetectorVoz", () => {
  it("el silencio no entrega nada", () => {
    const { frases, durante } = armar();
    durante(5_000, 0.001);
    expect(frases).toHaveLength(0);
  });

  it("300 ms de voz y pausa no llegan al mínimo de voz", () => {
    const { frases, durante } = armar();
    durante(1_000, 0.001);
    durante(300, 0.2);
    durante(1_500, 0.001);
    expect(frases).toHaveLength(0);
  });

  it("1,5 s de voz y 900 ms de silencio dan una frase con el audio previo", () => {
    const { frases, durante, bloque } = armar();
    durante(1_000, 0.001);
    expect(bloque(0.001)).toBe("esperando");
    expect(bloque(0.2)).toBe("escuchando");
    durante(1_400, 0.2);
    durante(900, 0.001);
    expect(frases).toHaveLength(1);
    // 600 ms de previo + 1,5 s de voz + el silencio hasta cortar
    expect(ms(frases[0]!.muestras)).toBeGreaterThanOrEqual(600 + 1_500);
    expect(ms(frases[0]!.muestras)).toBeLessThanOrEqual(600 + 1_500 + 900);
    expect(frases[0]!.muestras[0]).toBeCloseTo(0.001);
  });

  it("13 s de voz seguida cortan a los 12 s y la siguiente arranca con 2 s de solape", () => {
    const { frases, bloque } = armar();
    let n = 0; // cada bloque lleva un valor distinto para reconocer el solape
    const habla = (total: number) => {
      for (let i = 0; i < total / BLOQUE_MS; i++) bloque(0.1 + n++ * 0.001);
    };
    habla(13_000);
    expect(frases).toHaveLength(1);
    expect(ms(frases[0]!.muestras)).toBe(12_000);
    habla(9_000); // 1 s ya acumulado + 2 s de solape: faltan 9 s para otros 12 s
    expect(frases).toHaveLength(2);
    expect(ms(frases[1]!.muestras)).toBe(12_000);
    const primera = frases[0]!.muestras;
    const ultimos = primera.slice(primera.length - 2 * TASA);
    expect(Array.from(frases[1]!.muestras.slice(0, 2 * TASA))).toEqual(Array.from(ultimos));
  });

  it("una palabra corta después del corte de 12 s no se pierde", () => {
    const { frases, durante } = armar();
    durante(12_000, 0.2);
    expect(frases).toHaveLength(1);
    durante(300, 0.2);
    durante(900, 0.001);
    expect(frases).toHaveLength(2);
  });

  it("si después del corte solo queda el solape, no se vuelve a mandar", () => {
    const { frases, durante } = armar();
    durante(12_000, 0.2);
    durante(900, 0.001);
    expect(frases).toHaveLength(1);
  });
});
