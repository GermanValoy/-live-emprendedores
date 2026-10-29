import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("./env", () => ({ supabaseEnv: () => ({ url: "https://ejemplo.invalid", publishableKey: "clave-falsa" }) }));

import { updateSession } from "./proxy";

const pedido = (ruta: string, method = "GET", cookie?: string) =>
  new NextRequest(`http://localhost:3000${ruta}`, { method, headers: cookie ? { cookie } : undefined });

describe("updateSession sin sesión", () => {
  it("responde 401 en JSON a la señal del vivo si no hay ninguna cookie de sesión", async () => {
    const r = await updateSession(pedido("/mi-puesto/vivo/senal", "POST", "otra=cosa"));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "sin_sesion" });
  });

  it("con cookies de sesión que no sirven, deja que la señal llegue a la ruta (ella decide)", async () => {
    const r = await updateSession(pedido("/mi-puesto/vivo/senal", "POST", "sb-ejemplo-auth-token=basura"));
    expect(r.status).toBe(200);
    expect(r.headers.get("x-middleware-next")).toBe("1");
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
