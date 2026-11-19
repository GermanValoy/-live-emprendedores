import { describe, expect, it } from "vitest";
import { armarBorrador } from "./use-voz";

const foto = new Blob(["x"], { type: "image/jpeg" });

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
    expect(armarBorrador("¡acuérdense, código ROJO!", foto, new Set(["rojo"]), "rojo")).toBeNull();
    expect(armarBorrador("por ocho mil, código Rojo.", foto, new Set(["rojo"]), "rojo")).toBeNull();
  });

  it("si la palabra ya se usó y no es la del código activo, avisa cuál repitió", () => {
    expect(armarBorrador("código rojo ocho mil", foto, new Set(["rojo"]), "verde")).toEqual({ repetida: "ROJO" });
    expect(armarBorrador("código rojo ocho mil", foto, new Set(["rojo"]), null)).toEqual({ repetida: "ROJO" });
  });
});
