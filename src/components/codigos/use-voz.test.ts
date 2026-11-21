import { describe, expect, it } from "vitest";
import { armarBorrador } from "./use-voz";

const foto = new Blob(["x"], { type: "image/jpeg" });
const ROJO_ACTIVO = { palabra: "rojo", precioCentavos: 800000 };

describe("armarBorrador", () => {
  it("con precio y código arma el cartel en centavos", () => {
    expect(armarBorrador("se la llevan por ocho mil con el código rojo", foto, new Set(), null)).toEqual({
      foto,
      precio: 800000,
      palabra: "ROJO",
      cantidad: 1,
      productoId: null,
      porVoz: true,
    });
  });

  it("si no entendió el precio, el cartel sale igual con el precio vacío", () => {
    expect(armarBorrador("código luna", null, new Set(), null)).toMatchObject({ palabra: "LUNA", precio: null, foto: null });
  });

  it("sin código no arma nada", () => {
    expect(armarBorrador("hola chicas", foto, new Set(), null)).toBeNull();
  });

  it("no repite códigos: si la palabra ya se usó en el vivo, no arma nada", () => {
    expect(armarBorrador("¡acuérdense, código ROJO!", foto, new Set(["rojo"]), ROJO_ACTIVO)).toBeNull();
    expect(armarBorrador("por ocho mil, código Rojo.", foto, new Set(["rojo"]), ROJO_ACTIVO)).toBeNull();
  });

  it("si la palabra ya se usó y no es la del código activo, avisa cuál repitió", () => {
    expect(armarBorrador("código rojo ocho mil", foto, new Set(["rojo"]), { palabra: "verde", precioCentavos: 800000 })).toEqual({ repetida: "ROJO" });
    expect(armarBorrador("código rojo ocho mil", foto, new Set(["rojo"]), null)).toEqual({ repetida: "ROJO" });
  });

  it("si nombra el código activo con otro precio, es otra prenda: avisa que la palabra ya se usó", () => {
    expect(armarBorrador("doce mil, código rojo", foto, new Set(["rojo"]), ROJO_ACTIVO)).toEqual({ repetida: "ROJO" });
    expect(armarBorrador("código rojo, doce mil", foto, new Set(["rojo"]), ROJO_ACTIVO)).toEqual({ repetida: "ROJO" });
  });

  it("si nombra el código activo con el mismo precio, es un recordatorio: no avisa", () => {
    expect(armarBorrador("ocho mil, código rojo", foto, new Set(["rojo"]), ROJO_ACTIVO)).toBeNull();
  });
});
