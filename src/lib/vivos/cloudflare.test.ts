import { describe, expect, it } from "vitest";
import { ErrorCloudflare, obtenerOCrearTransmision } from "./cloudflare";

const CRED = { accountId: "ACC", token: "TOK" };
const BASE = "https://api.cloudflare.com/client/v4/accounts/ACC/stream/live_inputs";
const DETALLE = { uid: "u1", webRTC: { url: "https://w/whip" }, webRTCPlayback: { url: "https://w/whep" } };

type Llamada = { url: string; init: RequestInit | undefined };

/** fetch falso: responde según método y URL, y anota cada llamada. */
function fetchFalso(respuestas: Record<string, { estado?: number; cuerpo: unknown }>) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas[`${init?.method ?? "GET"} ${url}`];
    if (!r) throw new Error(`Llamada inesperada: ${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify(r.cuerpo), { status: r.estado ?? 200 });
  }) as typeof fetch;
  return { f, llamadas };
}

const ok = (result: unknown) => ({ cuerpo: { success: true, errors: [], result } });

describe("obtenerOCrearTransmision", () => {
  it("reutiliza la existente", async () => {
    const { f, llamadas } = fetchFalso({
      [`GET ${BASE}`]: ok([{ uid: "u1", meta: { name: "prueba-vivo" } }]),
      [`GET ${BASE}/u1`]: ok(DETALLE),
    });
    await expect(obtenerOCrearTransmision("prueba-vivo", CRED, f)).resolves.toEqual({
      uid: "u1", urlTransmitir: "https://w/whip", urlMirar: "https://w/whep",
    });
    expect(llamadas.some((l) => l.init?.method === "POST")).toBe(false);
  });

  it("crea si no existe", async () => {
    const { f, llamadas } = fetchFalso({
      [`GET ${BASE}`]: ok([]),
      [`POST ${BASE}`]: ok(DETALLE),
    });
    await expect(obtenerOCrearTransmision("prueba-vivo", CRED, f)).resolves.toEqual({
      uid: "u1", urlTransmitir: "https://w/whip", urlMirar: "https://w/whep",
    });
    const post = llamadas.find((l) => l.init?.method === "POST");
    expect(JSON.parse(String(post?.init?.body))).toEqual({ meta: { name: "prueba-vivo" }, recording: { mode: "off" } });
  });

  it("ignora otras transmisiones", async () => {
    const { f, llamadas } = fetchFalso({
      [`GET ${BASE}`]: ok([{ uid: "x", meta: { name: "prueba-vivo-2" } }, { uid: "y", meta: { name: "otra" } }]),
      [`POST ${BASE}`]: ok(DETALLE),
    });
    await obtenerOCrearTransmision("prueba-vivo", CRED, f);
    expect(llamadas.filter((l) => l.init?.method === "POST")).toHaveLength(1);
  });

  it("manda la llave como Bearer", async () => {
    const { f, llamadas } = fetchFalso({
      [`GET ${BASE}`]: ok([{ uid: "u1", meta: { name: "prueba-vivo" } }]),
      [`GET ${BASE}/u1`]: ok(DETALLE),
    });
    await obtenerOCrearTransmision("prueba-vivo", CRED, f);
    for (const l of llamadas) {
      expect(new Headers(l.init?.headers).get("Authorization")).toBe("Bearer TOK");
    }
  });

  it("errores sin filtrar la llave", async () => {
    const { f } = fetchFalso({
      [`GET ${BASE}`]: { estado: 403, cuerpo: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } },
    });
    const error = await obtenerOCrearTransmision("prueba-vivo", CRED, f).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorCloudflare);
    expect((error as Error).message).toContain("Authentication error");
    expect((error as Error).message).not.toContain("TOK");
  });

  it("error de red con mensaje en español", async () => {
    const f = (async () => { throw new TypeError("fetch failed TOK"); }) as typeof fetch;
    const error = await obtenerOCrearTransmision("prueba-vivo", CRED, f).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorCloudflare);
    expect((error as Error).message).toBe("No se pudo conectar con Cloudflare");
  });
});
