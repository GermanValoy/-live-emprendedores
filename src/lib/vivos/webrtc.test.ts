import { describe, expect, it } from "vitest";
import { negociarSdp } from "./webrtc";

const URL_WHIP = "https://x.cloudflarestream.com/abc/webRTC/publish";

function fetchQueResponde(estado: number, cuerpo: string, headers: Record<string, string> = {}) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(cuerpo, { status: estado, headers });
  }) as typeof fetch;
  return { f, llamadas };
}

describe("negociarSdp", () => {
  it("manda la oferta", async () => {
    const { f, llamadas } = fetchQueResponde(201, "v=0 respuesta");
    const r = await negociarSdp(URL_WHIP, "v=0 oferta", f);
    expect(r.respuestaSdp).toBe("v=0 respuesta");
    expect(llamadas[0]!.url).toBe(URL_WHIP);
    expect(llamadas[0]!.init?.method).toBe("POST");
    expect(new Headers(llamadas[0]!.init?.headers).get("Content-Type")).toBe("application/sdp");
    expect(llamadas[0]!.init?.body).toBe("v=0 oferta");
  });

  it("resuelve Location relativo", async () => {
    const con = await negociarSdp(URL_WHIP, "o", fetchQueResponde(201, "r", { Location: "/abc/resource/1" }).f);
    expect(con.recurso).toBe("https://x.cloudflarestream.com/abc/resource/1");
    const sin = await negociarSdp(URL_WHIP, "o", fetchQueResponde(201, "r").f);
    expect(sin.recurso).toBeNull();
  });

  it("error claro", async () => {
    await expect(negociarSdp(URL_WHIP, "o", fetchQueResponde(409, "").f)).rejects.toThrow("La transmisión respondió 409");
  });
});
