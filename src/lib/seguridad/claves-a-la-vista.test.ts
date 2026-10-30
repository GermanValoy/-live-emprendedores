import { describe, expect, it } from "vitest";
import { clavesALaVista } from "./claves-a-la-vista";

describe("clavesALaVista", () => {
  it("encuentra una clave conocida y dice cuál, sin repetir su valor", () => {
    const texto = 'const x = "abc123secreto";';
    expect(clavesALaVista(texto, { MI_CLAVE: "abc123secreto", OTRA: "zzz" })).toEqual(["MI_CLAVE"]);
  });

  it("ignora las claves que no están cargadas", () => {
    expect(clavesALaVista("cualquier cosa", { MI_CLAVE: undefined, VACIA: "" })).toEqual([]);
  });

  it("reconoce cualquier clave secreta de Supabase por su forma", () => {
    expect(clavesALaVista('{"key":"sb_secret_AbC123-xyz_987654321"}', {})).toEqual(["una clave secreta de Supabase (sb_secret_…)"]);
  });

  it("reconoce una dirección de base de datos con contraseña", () => {
    expect(clavesALaVista("postgresql://postgres.abc:MiClave123@aws-0.pooler.supabase.com:6543/postgres", {})).toEqual([
      "una dirección de base de datos con contraseña",
    ]);
  });

  it("no confunde la clave publicable ni textos comunes", () => {
    const texto = 'createClient("https://x.supabase.co", "sb_publishable_AbC123") // postgres://localhost/db';
    expect(clavesALaVista(texto, {})).toEqual([]);
  });
});
