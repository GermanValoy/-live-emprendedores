import { describe, expect, it } from "vitest";
import { medidasEscaladas, nuevaRutaFoto, rutaEsDeTienda, rutaVariante, urlFoto } from "./rutas";

const TIENDA = "3f1c2a9e-1111-4222-8333-444455556666";

describe("medidasEscaladas", () => {
  it("achica respetando la proporción por el lado mayor", () => {
    expect(medidasEscaladas(4000, 3000, 1200)).toEqual({ ancho: 1200, alto: 900 });
    expect(medidasEscaladas(3000, 4000, 400)).toEqual({ ancho: 300, alto: 400 });
  });

  it("nunca agranda una foto chica", () => {
    expect(medidasEscaladas(300, 200, 1200)).toEqual({ ancho: 300, alto: 200 });
  });
});

describe("rutas", () => {
  it("arma la ruta de cada tamaño", () => {
    expect(rutaVariante(`${TIENDA}/productos/abc.webp`, "chica")).toBe(`${TIENDA}/productos/abc-400.webp`);
    expect(rutaVariante(`${TIENDA}/perfil/abc.jpg`, "grande")).toBe(`${TIENDA}/perfil/abc-1200.jpg`);
  });

  it("crea rutas nuevas dentro de la carpeta de la tienda", () => {
    const ruta = nuevaRutaFoto(TIENDA, "productos", "webp");
    expect(rutaEsDeTienda(ruta, TIENDA, "productos")).toBe(true);
  });

  it("rechaza rutas de otra tienda, otra carpeta o con trucos", () => {
    const ruta = nuevaRutaFoto(TIENDA, "productos", "webp");
    expect(rutaEsDeTienda(ruta, "otra-tienda", "productos")).toBe(false);
    expect(rutaEsDeTienda(ruta, TIENDA, "perfil")).toBe(false);
    expect(rutaEsDeTienda(`${TIENDA}/productos/../../x.webp`, TIENDA, "productos")).toBe(false);
  });

  it("arma la dirección pública", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co";
    expect(urlFoto(`${TIENDA}/perfil/abc.webp`, "chica")).toBe(
      `https://ejemplo.supabase.co/storage/v1/object/public/tienda-fotos/${TIENDA}/perfil/abc-400.webp`,
    );
  });
});
