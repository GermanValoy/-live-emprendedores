import { describe, expect, it } from "vitest";
import { linkSala, linkWhatsapp, mensajeAviso } from "./whatsapp";

describe("linkSala", () => {
  it("arma el link del vivo de la tienda", () => {
    expect(linkSala("https://tuferialive.vercel.app", "mica.tejidos")).toBe(
      "https://tuferialive.vercel.app/@mica.tejidos/vivo",
    );
  });
});

describe("mensajeAviso", () => {
  const L = "https://tuferialive.vercel.app/@mica.tejidos/vivo";

  it("avisa que está en vivo", () => {
    expect(mensajeAviso("durante", L)).toBe(`¡Estoy en vivo en Tu Feria Live! Entrá acá 👉 ${L}`);
  });

  it("avisa que sale en vivo pronto", () => {
    expect(mensajeAviso("antes", L)).toBe(
      `¡Pronto salgo en vivo! Entrá acá y se abre sola cuando arranque 👉 ${L}`,
    );
  });
});

describe("linkWhatsapp", () => {
  it("codifica el texto para compartir", () => {
    expect(linkWhatsapp("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});
