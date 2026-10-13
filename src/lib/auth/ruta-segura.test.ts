import { describe, expect, it } from "vitest";
import { rutaSegura } from "./ruta-segura";

describe("rutaSegura", () => {
  it("acepta rutas internas", () => {
    expect(rutaSegura("/cuenta")).toBe("/cuenta");
    expect(rutaSegura("/diseno?x=1")).toBe("/diseno?x=1");
  });

  it("usa /cuenta si no hay destino", () => {
    expect(rutaSegura(null)).toBe("/cuenta");
    expect(rutaSegura("")).toBe("/cuenta");
  });

  it("rechaza destinos fuera de Tu Feria Live", () => {
    expect(rutaSegura("https://sitio-malo.com")).toBe("/cuenta");
    expect(rutaSegura("//sitio-malo.com")).toBe("/cuenta");
    expect(rutaSegura("/\\sitio-malo.com")).toBe("/cuenta");
    expect(rutaSegura("cuenta")).toBe("/cuenta");
  });

  it("rechaza destinos que esconden otro sitio con tabulaciones o saltos de línea", () => {
    expect(rutaSegura("/\t/sitio-malo.com")).toBe("/cuenta");
    expect(rutaSegura("/\n/sitio-malo.com")).toBe("/cuenta");
    expect(rutaSegura("/\r\n/sitio-malo.com")).toBe("/cuenta");
  });
});
