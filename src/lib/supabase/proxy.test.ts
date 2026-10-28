import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("./env", () => ({ supabaseEnv: () => ({ url: "https://ejemplo.invalid", publishableKey: "clave-falsa" }) }));

import { updateSession } from "./proxy";

const pedido = (ruta: string, method = "GET") => new NextRequest(`http://localhost:3000${ruta}`, { method });

describe("updateSession sin sesión", () => {
  it("responde 401 en JSON a la señal del vivo", async () => {
    const r = await updateSession(pedido("/mi-puesto/vivo/senal", "POST"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "sin_sesion" });
  });

  it("sigue redirigiendo al inicio las demás rutas de /mi-puesto", async () => {
    for (const ruta of ["/mi-puesto", "/mi-puesto/vivo", "/cuenta"]) {
      const r = await updateSession(pedido(ruta));
      expect(r.status, ruta).toBe(307);
      expect(new URL(r.headers.get("location")!).pathname).toBe("/");
    }
  });

  it("deja pasar las rutas públicas", async () => {
    const r = await updateSession(pedido("/"));
    expect(r.status).toBe(200);
  });
});
