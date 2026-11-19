import { describe, expect, it } from "vitest";
import { leerReclamo, normalizarCodigo } from "./reclamo";

const SIEMPRE_RECLAMO = [
  "ROJO",
  "rojo!!",
  "Rojo 🙋‍♀️",
  "rojooo",
  "quiero ROJO",
  "lo quiero rojo",
  "yo rojo",
  "ROJO mío",
  "me lo llevo rojo",
  "rojo para mi",
  "rojo rojo!!",
  "ROJO ROJO ROJO",
];

describe("leerReclamo", () => {
  it.each(SIEMPRE_RECLAMO)("%s es un reclamo", (texto) => {
    expect(leerReclamo(texto, "rojo")).toBe("reclamo");
  });

  it.each([
    "¿el rojo qué talle es?",
    "me encanta el rojo, ¿viene en 40?",
    "rojo?",
    "hay rojo en M",
    "el rojo me queda chico seguro jaja",
  ])("%s nombra el código pero no reclama", (texto) => {
    expect(leerReclamo(texto, "rojo")).toBe("nombra");
  });

  it.each(["lo quiero", "hola chicas", "rojito"])("%s no es nada", (texto) => {
    expect(leerReclamo(texto, "rojo")).toBe("nada");
  });

  it("detecta errores de tipeo", () => {
    expect(leerReclamo("rjo", "rojo")).toBe("casi");
    expect(leerReclamo("amarlllo", "amarillo")).toBe("casi");
    expect(leerReclamo("amarilo", "amarillo")).toBe("casi");
    expect(leerReclamo("amarillo", "amarillo")).toBe("reclamo");
    expect(leerReclamo("blanco", "amarillo")).toBe("nada");
  });

  it("no confunde números con errores de tipeo ni los reduce", () => {
    expect(leerReclamo("10", "1000")).not.toBe("reclamo");
    expect(leerReclamo("1000", "1000")).toBe("reclamo");
  });

  it("no corrige palabras de menos de 4 letras", () => {
    expect(leerReclamo("sal", "sol")).toBe("nada");
  });
});

describe("normalizarCodigo", () => {
  it("saca signos, tildes y mayúsculas", () => {
    expect(normalizarCodigo("¡MARIPOSA!")).toBe("mariposa");
  });
  it("no reduce tandas de dígitos", () => {
    expect(normalizarCodigo("1000")).toBe("1000");
    expect(normalizarCodigo("1000000")).toBe("1000000");
  });
  it("reduce tandas de 3 o más letras iguales y deja ll y rr", () => {
    expect(normalizarCodigo("rojooo")).toBe("rojo");
    expect(normalizarCodigo("amarillo")).toBe("amarillo");
    expect(normalizarCodigo("perro")).toBe("perro");
  });
});
