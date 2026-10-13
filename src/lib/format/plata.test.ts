import { describe, expect, it } from "vitest";
import { formatARS } from "./plata";

describe("formatARS", () => {
  it("muestra pesos enteros sin decimales", () => {
    expect(formatARS(800000)).toBe("$8.000");
  });

  it("muestra los centavos con coma cuando los hay", () => {
    expect(formatARS(850050)).toBe("$8.500,50");
    expect(formatARS(5)).toBe("$0,05");
  });

  it("muestra cero", () => {
    expect(formatARS(0)).toBe("$0");
  });

  it("separa miles con punto en montos grandes", () => {
    expect(formatARS(123456789)).toBe("$1.234.567,89");
    expect(formatARS(100000)).toBe("$1.000");
  });

  it("muestra montos negativos con el signo adelante", () => {
    expect(formatARS(-150000)).toBe("-$1.500");
  });

  it("rechaza montos que no son centavos enteros", () => {
    expect(() => formatARS(10.5)).toThrow(TypeError);
    expect(() => formatARS(Number.NaN)).toThrow(TypeError);
    expect(() => formatARS(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
