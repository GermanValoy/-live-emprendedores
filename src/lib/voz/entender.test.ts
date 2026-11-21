import { describe, expect, it } from "vitest";
import { entender } from "./entender";

describe("entender", () => {
  it.each([
    ["ocho mil código rojo", 8000, "ROJO"],
    ["8000 código rojo", 8000, "ROJO"],
    ["$8.000 código Rojo", 8000, "ROJO"],
    ["8 mil pesos, código: azul", 8000, "AZUL"],
    ["ocho mil quinientos con el código flor", 8500, "FLOR"],
    ["doce mil código es luna", 12000, "LUNA"],
    ["veinticinco mil código estrella", 25000, "ESTRELLA"],
    ["esta remera sale 7500 y se la llevan con el código sol", 7500, "SOL"],
    ["cuatro mil doscientos cincuenta código lila", 4250, "LILA"],
    ["un vestido de 15000, código verde", 15000, "VERDE"],
    ["$8.000, código rojo", 8000, "ROJO"],
    ["8.000. Código rojo", 8000, "ROJO"],
    ["Sale 8.500, código sol.", 8500, "SOL"],
  ])("%s", (texto, precio, codigo) => {
    expect(entender(texto)).toEqual({ precio, codigo });
  });

  it.each([
    ["código rojo, ocho mil", 8000, "ROJO"],
    ["código rojo ocho mil quinientos", 8500, "ROJO"],
    ["Código verde, $12.500.", 12500, "VERDE"],
    ["código sol a 15000", 15000, "SOL"],
    ["código luna, quinientos pesos", 500, "LUNA"],
    ["código flor, $800", 800, "FLOR"],
  ])("precio después del código: %s", (texto, precio, codigo) => {
    expect(entender(texto)).toEqual({ precio, codigo });
  });

  it.each([
    ["código rojo, talle 2", "ROJO"],
    ["código azul, quedan 3", "AZUL"],
    ["código sol, en 10 minutos cierro", "SOL"],
    ["código lila, la número quinientos", "LILA"],
  ])("después del código, un número que no suena a precio no se toma: %s", (texto, codigo) => {
    expect(entender(texto)).toEqual({ precio: null, codigo });
  });

  it("si dice precio antes y después del código, gana el de antes", () => {
    expect(entender("ocho mil, código rojo, ¡doce mil!")).toEqual({ precio: 8000, codigo: "ROJO" });
  });

  it("sin código ni precio", () => {
    expect(entender("hola chicas cómo están")).toEqual({ precio: null, codigo: null });
  });
});

describe("entender: lo que no es una prenda", () => {
  it("un agradecimiento no tiene precio ni código", () => {
    expect(entender("¡Gracias!")).toEqual({ precio: null, codigo: null });
  });
});
